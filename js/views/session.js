// Run a set of questions: question on the left, tutor chat on the right.
//
// A session is {title, type, an ordered list of question ids, a cursor,
// answers}. That shape covers a normal assignment, a test, a cross-set review
// and a targeted practice run identically — and it's what gets saved so you
// can resume.

import { store, REVIEW_ID, PRACTICE_ID, NATIONAL_MIX_PREFIX, nationalMixId } from "../store.js";
import { el, clear, icon, ICONS, uid, toast } from "../lib/dom.js";
import { announce } from "../lib/a11y.js";
import { renderQuestion } from "../components/questions.js";
import { TutorChat } from "../components/tutor-chat.js";
import { review } from "../lib/srs.js";
import { t, plural } from "../lib/i18n.js";
import { preloadQuestionTranslations } from "../lib/library-content.js";

export async function renderSession(assignmentId, qs) {
  // Warms the cache store.getAssignment() reads from — needed even for a
  // set that was imported back when the app was in Swedish, since its
  // content was copied into the student's own store as-is at import time.
  await preloadQuestionTranslations([assignmentId]);
  const assignment = store.getAssignment(assignmentId);
  if (!assignment) return notFound(t("session.setGone"));
  if (!assignment.questions.length) return notFound(t("session.setEmpty"));

  // ?exam=1 runs ANY set — assignment or library import — under test
  // conditions (locked tutor, no immediate feedback, on-screen clock)
  // without touching how the set itself is stored or tagged.
  const examMode = qs?.get("exam") === "1";
  const rawMin = examMode ? Number(qs?.get("min")) : 0;
  const timeLimitMin = rawMin > 0 ? Math.max(1, Math.min(240, rawMin)) : null;
  const examQuery = examMode ? `?exam=1${timeLimitMin ? `&min=${timeLimitMin}` : ""}` : "";

  // Repeat runs are shuffled so a retry tests the material, not the order.
  const isRetry = store.attempts.some((a) => a.assignmentId === assignment.id);

  return runSession({
    // Exam-mode and normal runs of the same set are kept as separate
    // sessions — otherwise resuming one would silently resume the other,
    // with the wrong tutor-lock/timer state attached.
    key: examMode ? `${assignment.id}::exam` : assignment.id,
    assignmentId: assignment.id,
    title: assignment.title,
    type: assignment.type,
    examMode,
    timeLimitMin,
    retryHash: `#/session/${assignment.id}${examQuery}`,
    questionIds: assignment.questions.map((q) => q.id),
    shuffle: isRetry || examMode,
  });
}

export async function renderReview() {
  // A review mixes questions from any number of sets, so warm the cache for
  // everything the student has, not just one assignment id.
  await preloadQuestionTranslations(store.assignments.map((a) => a.id));
  const due = store.dueQuestions();
  if (!due.length) {
    return {
      title: t("session.reviewTitle"),
      node: el("div.empty", {}, [
        icon(ICONS.check, 26),
        el("h2", {}, t("session.nothingDue")),
        el("p", {}, t("session.nothingDueBody")),
        el("a.btn.btn--ghost", { href: "#/", style: { marginTop: "16px" } }, t("common.backToMenu")),
      ]),
    };
  }

  return runSession({
    key: REVIEW_ID,
    assignmentId: REVIEW_ID,
    title: t("session.reviewSessionTitle"),
    type: "assignment",
    retryHash: "#/review",
    questionIds: due.map((d) => d.question.id),
  });
}

/** Practise just the questions missed in a given attempt. */
export async function renderPractice(attemptId) {
  const attempt = store.attempts.find((a) => a.id === attemptId);
  if (!attempt) return notFound(t("session.resultGone"));

  // A missed-question practice run can span sets, same as review above.
  await preloadQuestionTranslations(store.assignments.map((a) => a.id));

  const ids = (attempt.items || [])
    .filter((i) => !i.correct)
    .map((i) => i.questionId)
    .filter((id) => store.findQuestion(id));

  if (!ids.length) {
    return {
      title: t("session.practiceTitle"),
      node: el("div.empty", {}, [
        icon(ICONS.check, 26),
        el("h2", {}, t("session.nothingToPractice")),
        el("p", {}, t("session.nothingToPracticeBody")),
        el("a.btn.btn--ghost", { href: "#/", style: { marginTop: "16px" } }, t("common.backToMenu")),
      ]),
    };
  }

  return runSession({
    key: PRACTICE_ID,
    assignmentId: PRACTICE_ID,
    title: t("session.practiceTitle"),
    type: "assignment",
    retryHash: `#/practice/${attemptId}`,
    questionIds: ids,
    // Practice is where the tutoring happens after a test, so never lock it.
    forceTutor: true,
  });
}

/** Mix questions from every set imported under one subject (e.g. every year
 *  of a national exam a student has added) into one randomized session. */
export async function renderNationalMix(subjectId, qs) {
  const subject = store.subjects.find((s) => s.id === subjectId);
  const sets = store.assignments.filter((a) => a.subjectId === subjectId);
  const pool = sets.flatMap((a) => a.questions.map((q) => q.id));

  if (!pool.length) return notFound(t("session.noImportedSets"));

  const count = Math.max(1, Math.min(Number(qs?.get("count")) || 15, pool.length));
  const ids = shuffled(pool).slice(0, count);

  return runSession({
    key: nationalMixId(subjectId),
    assignmentId: nationalMixId(subjectId),
    title: t("session.mixedTitle", { subject: subject?.name || t("session.nationalTest") }),
    type: "assignment",
    retryHash: `#/national/mix/${subjectId}?count=${count}`,
    questionIds: ids,
    shuffle: true,
  });
}

/* ------------------------------------------------------------------ */

function runSession(config) {
  const saved = store.getSession(config.key);
  const resumable = saved && (saved.cursor > 0 || Object.keys(saved.items || {}).length > 0);

  const state = resumable
    ? { ...saved, order: saved.order.filter((id) => store.findQuestion(id)) }
    : freshState(config);

  if (!state.order.length) return notFound(t("session.questionsGone"));
  state.cursor = Math.min(state.cursor, state.order.length - 1);
  state.skipped = state.skipped || [];
  state.choiceOrder = state.choiceOrder || {};

  // In a test — or any set launched in exam mode — the tutor is locked: one
  // attempt per question, no hints, no reveal. All the teaching happens
  // afterwards, on the results screen.
  const testMode = (config.type === "test" || config.examMode) && !config.forceTutor;

  const tutor = new TutorChat({ locked: testMode });

  // ----- exam clock: counts down to state.deadlineAt if a limit was set,
  // otherwise counts up from the start — either way it keeps running across
  // a resume, since deadlineAt/startedAt live in the persisted session. -----
  const timerText = el("span");
  const timerEl = el("div.examtimer", { hidden: !testMode }, [icon(ICONS.clock, 14), timerText]);
  let timerHandle = null;
  let autoSubmitted = false;

  function formatClock(ms) {
    const total = Math.max(0, Math.round(ms / 1000));
    const m = Math.floor(total / 60);
    const s = total % 60;
    return `${m}:${String(s).padStart(2, "0")}`;
  }

  function tickTimer() {
    if (state.deadlineAt) {
      const remaining = state.deadlineAt - Date.now();
      timerEl.classList.toggle("examtimer--warn", remaining <= 60000);
      timerText.textContent = formatClock(remaining);
      if (remaining <= 0 && !autoSubmitted) {
        autoSubmitted = true;
        stopTimer();
        toast(t("session.timeUp"));
        finish({ timedOut: true });
      }
    } else {
      timerText.textContent = formatClock(Date.now() - state.startedAt);
    }
  }

  function startTimer() {
    if (!testMode || timerHandle) return;
    tickTimer();
    timerHandle = setInterval(tickTimer, 1000);
  }

  function stopTimer() {
    if (timerHandle) { clearInterval(timerHandle); timerHandle = null; }
  }

  const fill = el("div.progressbar__fill");
  const label = el("div.progress-label");
  const stage = el("div");
  const nextBtn = el("button.btn", { type: "button", disabled: true, onclick: next }, t("session.next"));
  const skipBtn = el("button.btn.btn--ghost", { type: "button", onclick: skip }, t("session.skip"));
  const exitBtn = el("button.btn.btn--ghost", { type: "button", onclick: exit }, t("session.exit"));

  let currentRenderer = null;

  function answeredCount() { return Object.keys(state.items).length; }
  function currentId() { return state.order[state.cursor]; }
  function unansweredCount() { return state.order.filter((id) => !state.items[id]).length; }

  function firstUnansweredIndex() {
    const i = state.order.findIndex((id) => !state.items[id]);
    return i === -1 ? state.order.length - 1 : i;
  }

  function persist() {
    store.saveSession(config.key, {
      key: config.key,
      assignmentId: config.assignmentId,
      title: config.title,
      type: config.type,
      examMode: config.examMode,
      timeLimitMin: config.timeLimitMin,
      retryHash: config.retryHash,
      isReview: config.assignmentId === REVIEW_ID,
      order: state.order,
      cursor: state.cursor,
      items: state.items,
      skipped: state.skipped,
      choiceOrder: state.choiceOrder,
      startedAt: state.startedAt,
      deadlineAt: state.deadlineAt,
    });
  }

  function paintProgress() {
    const done = answeredCount();
    fill.style.width = `${(done / state.order.length) * 100}%`;
    const skippedLeft = state.skipped.filter((id) => !state.items[id]).length;
    label.textContent =
      t("session.progressLabel", { n: state.cursor + 1, total: state.order.length, done }) +
      (skippedLeft ? t("session.progressSkipped", { n: skippedLeft }) : "");
  }

  /** Apply this session's shuffled choice order without touching stored data. */
  function viewQuestion(q) {
    const perm = state.choiceOrder[q.id];
    if (q.kind !== "mc" || !perm || !Array.isArray(q.choices)) return q;
    return { ...q, choices: perm.map((i) => q.choices[i]), answer: perm.indexOf(q.answer) };
  }

  function loadQuestion() {
    clear(stage);
    const found = store.findQuestion(currentId());
    if (!found) { dropMissing(); return; }
    const { assignment, question } = found;

    const answered = !!state.items[question.id];
    nextBtn.disabled = !answered;
    nextBtn.textContent = unansweredCount() === 0 || (answered && state.cursor === state.order.length - 1)
      ? t("session.finish") : t("session.next");

    // Skipping is only offered while there's somewhere else to go.
    const alreadySkipped = state.skipped.includes(question.id);
    skipBtn.hidden = answered || alreadySkipped || unansweredCount() <= 1;

    if (testMode) tutor.showLocked(config.title);
    else tutor.setQuestion(assignment, question);

    const r = renderQuestion({
      question: viewQuestion(question),
      tutor: testMode ? null : tutor,
      live: store.hasKey(),
      testMode,
      onDone: (result) => {
        state.items[question.id] = {
          questionId: question.id,
          topic: question.topic,
          correct: !!result.correct,
          selfRating: result.selfRating || null,
          srsGrade: result.srsGrade,
          hintsUsed: result.hintsUsed || 0,
          appealed: !!result.appealed,
        };
        skipBtn.hidden = true;
        nextBtn.disabled = false;
        nextBtn.textContent = unansweredCount() === 0 ? t("session.finish") : t("session.next");
        paintProgress();
        persist();
        // An appeal re-fires onDone for the same question; only log it once.
        if (!result.revised) tutor.recordOutcome(question, result);
        if (!testMode) announce(result.correct ? "Correct." : "Not correct. The tutor can help.");
        else announce("Answer recorded.");
      },
    });

    stage.appendChild(r.el);
    currentRenderer = r;
    paintProgress();
  }

  function dropMissing() {
    state.order = state.order.filter((id) => store.findQuestion(id));
    if (!state.order.length) { location.hash = "#/"; return; }
    state.cursor = Math.min(state.cursor, state.order.length - 1);
    loadQuestion();
  }

  function skip() {
    const id = currentId();
    if (state.items[id] || state.skipped.includes(id) || unansweredCount() <= 1) return;
    state.skipped.push(id);
    state.order.splice(state.cursor, 1);
    state.order.push(id);           // comes back at the end, not quietly dropped
    if (state.cursor >= state.order.length) state.cursor = state.order.length - 1;
    persist();
    loadQuestion();
    announce(t("session.skippedAnnounce"));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function next() {
    if (!state.items[currentId()]) return;
    if (unansweredCount() === 0) { finish(); return; }
    // Advance to the next question that still needs answering.
    const remaining = firstUnansweredIndex();
    state.cursor = remaining;
    persist();
    loadQuestion();
    announce(t("session.questionAnnounce", { n: state.cursor + 1, total: state.order.length }));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function exit() {
    persist();
    if (confirm(t("session.exitConfirm"))) {
      location.hash = "#/";
    }
  }

  function finish(opts = {}) {
    stopTimer();
    const answered = Object.values(state.items);
    const correct = answered.filter((i) => i.correct).length;
    const attempt = {
      id: uid(),
      assignmentId: config.assignmentId,
      isReview: config.assignmentId === REVIEW_ID,
      title: config.title,
      retryHash: config.retryHash,
      wasTest: testMode,
      examMode: !!config.examMode,
      timeLimitMin: config.timeLimitMin || null,
      timedOut: !!opts.timedOut,
      startedAt: state.startedAt,
      finishedAt: Date.now(),
      scorePct: answered.length ? Math.round((correct / answered.length) * 100) : 0,
      items: answered,
    };
    store.recordAttempt(attempt);

    for (const it of answered) {
      const rec = review(store.state.srs[it.questionId], it.srsGrade || (it.correct ? "good" : "again"));
      store.setSrs(it.questionId, rec);
    }

    store.clearSession(config.key);
    location.hash = `#/results/${attempt.id}`;
  }

  function startOver() {
    store.clearSession(config.key);
    Object.assign(state, freshState(config));
    loadQuestion();
  }

  // ----- initial paint -----
  if (resumable) {
    const done = answeredCount();
    const remaining = state.order.length - done;
    stage.appendChild(el("div.panel.resume", {}, [
      el("h3", {}, t("session.resumeTitle")),
      el("p.note", { style: { margin: "6px 0 16px" } },
        plural(state.order.length, "session.resumeBodyOne", "session.resumeBodyMany", { done, total: state.order.length }) +
        (remaining ? t("session.resumeMore", { n: remaining }) : t("session.resumeReady"))),
      el("div", { style: { display: "flex", gap: "10px", flexWrap: "wrap" } }, [
        el("button.btn", {
          type: "button",
          onclick: () => { state.cursor = firstUnansweredIndex(); persist(); loadQuestion(); },
        }, [icon(ICONS.arrow, 18), t("session.continue")]),
        el("button.btn.btn--ghost", { type: "button", onclick: startOver }, t("session.startOver")),
      ]),
    ]));
    skipBtn.hidden = true;
    paintProgress();
  } else {
    loadQuestion();
  }
  startTimer();

  /* ----- keyboard shortcuts ----- */
  function onKeyDown(e) {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const t = e.target;
    const typing = t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable);

    if (e.key === "?" || (e.key === "/" && e.shiftKey)) {
      if (typing) return;
      e.preventDefault(); toggleShortcuts(); return;
    }
    if (e.key === "Escape") { closeShortcuts(); return; }
    if (typing) return;

    if (e.key === "ArrowRight" || (e.key === "Enter" && !nextBtn.disabled && !currentRenderer)) {
      if (!nextBtn.disabled) { e.preventDefault(); next(); }
      return;
    }
    if (e.key.toLowerCase() === "s" && !skipBtn.hidden) { e.preventDefault(); skip(); return; }

    if (currentRenderer?.handleKey?.(e)) { e.preventDefault(); return; }

    // Enter advances once the question is done and the renderer didn't want it.
    if (e.key === "Enter" && !nextBtn.disabled) { e.preventDefault(); next(); }
  }

  let shortcutsEl = null;
  function toggleShortcuts() { shortcutsEl ? closeShortcuts() : openShortcuts(); }
  function closeShortcuts() { shortcutsEl?.remove(); shortcutsEl = null; }
  function openShortcuts() {
    shortcutsEl = el("div.modal", { role: "dialog", "aria-modal": "true", "aria-label": "Keyboard shortcuts",
      onclick: (e) => { if (e.target === shortcutsEl) closeShortcuts(); } }, [
      el("div.modal__card", {}, [
        el("h3", { style: { marginBottom: "12px" } }, t("session.shortcutsTitle")),
        el("table.preset-table", {}, [el("tbody", {}, [
          keyRow("A – D  or  1 – 4", t("session.shortcutPickMc")),
          keyRow("Enter", t("session.shortcutCheck")),
          keyRow("→", t("session.shortcutNext")),
          keyRow("S", t("session.shortcutSkip")),
          keyRow("Space", t("session.shortcutFlip")),
          keyRow("?", t("session.shortcutShow")),
          keyRow("Esc", t("session.close")),
        ])]),
        el("button.btn.btn--ghost.btn--sm", { type: "button", style: { marginTop: "16px" }, onclick: closeShortcuts }, t("session.close")),
      ]),
    ]);
    document.body.appendChild(shortcutsEl);
    shortcutsEl.querySelector("button").focus();
  }
  function keyRow(keys, what) {
    return el("tr", {}, [el("th", {}, el("kbd", {}, keys)), el("td", {}, what)]);
  }

  document.addEventListener("keydown", onKeyDown);

  /* ----- mobile: tutor as a slide-up sheet ----- */
  const hintFab = el("button.hintfab", {
    type: "button",
    onclick: () => {
      tutor.el.classList.toggle("is-open");
      const open = tutor.el.classList.contains("is-open");
      hintFab.textContent = open ? t("session.hideTutor") : t("session.needHint");
      if (open) tutor.el.querySelector(".tutor__log")?.scrollTo(0, 0);
    },
  }, t("session.needHint"));
  if (testMode) hintFab.hidden = true;

  const node = el("div", {}, [
    el("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: "16px", marginBottom: "8px", flexWrap: "wrap" } }, [
      el("h2", {}, config.title),
      el("div", { style: { display: "flex", gap: "8px", alignItems: "center", flex: "none" } }, [
        timerEl,
        el("span.badge", {}, badgeLabel(config)),
      ]),
    ]),
    testMode ? el("p.note.note--warn", { style: { marginBottom: "10px" } },
      t("session.testModeWarn")) : null,
    el("div.progressbar", {}, [fill]),
    label,
    el("div.session", {}, [
      el("div", {}, [
        stage,
        el("div.nav-row", {}, [
          exitBtn,
          el("div", { style: { display: "flex", gap: "10px" } }, [skipBtn, nextBtn]),
        ]),
      ]),
      tutor.el,
    ]),
    hintFab,
    el("p.note.kbdhint", {}, [
      t("session.kbdHintPre"), el("kbd", {}, "?"), t("session.kbdHintPost"),
    ]),
  ].filter(Boolean));

  return {
    title: config.title,
    node,
    cleanup: () => {
      document.removeEventListener("keydown", onKeyDown);
      closeShortcuts();
      stopTimer();
      tutor.destroy();
    },
  };
}

function freshState(config) {
  const order = config.shuffle ? shuffled(config.questionIds) : [...config.questionIds];
  const choiceOrder = {};
  if (config.shuffle) {
    for (const id of order) {
      const q = store.findQuestion(id)?.question;
      if (q?.kind === "mc" && Array.isArray(q.choices)) {
        choiceOrder[id] = shuffled(q.choices.map((_, i) => i));
      }
    }
  }
  const startedAt = Date.now();
  const deadlineAt = config.examMode && config.timeLimitMin ? startedAt + config.timeLimitMin * 60000 : null;
  return { ...config, order, cursor: 0, items: {}, skipped: [], choiceOrder, startedAt, deadlineAt };
}

function shuffled(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function badgeLabel(config) {
  if (config.assignmentId === REVIEW_ID) return t("session.badgeReview");
  if (config.assignmentId === PRACTICE_ID) return t("session.badgePractice");
  if (config.assignmentId?.startsWith?.(NATIONAL_MIX_PREFIX)) return t("session.nationalTest");
  if (config.examMode) return t("session.badgeExamMode");
  return config.type === "test" ? t("session.badgeTest") : t("session.badgeAssignment");
}

function notFound(message) {
  return {
    title: t("session.notFoundTitle"),
    node: el("div.empty", {}, [
      el("h2", {}, t("session.nothingToStudy")),
      el("p", {}, message),
      el("a.btn.btn--ghost", { href: "#/", style: { marginTop: "16px" } }, t("common.backToMenu")),
    ]),
  };
}
