// Results screen: animated score ring, per-topic mastery change, review list, confetti.

import { store } from "../store.js";
import { el, icon, ICONS } from "../lib/dom.js";
import { renderRich } from "../lib/rich.js";
import { markdown } from "../lib/markdown.js";
import { deltaFromAttempt } from "../lib/mastery.js";
import { celebrate, clearConfetti } from "../lib/confetti-helper.js";
import { playFanfare } from "../lib/sound.js";
import { estimatedGrade, gradeRank } from "../lib/grade.js";
import { tutorStream, ClaudeError } from "../claude.js";
import { explainSystem } from "../prompts.js";
import { shareCard } from "../lib/share-card.js";
import { t, plural } from "../lib/i18n.js";

export function renderResults(attemptId) {
  const attempt = store.attempts.find((a) => a.id === attemptId);
  if (!attempt) {
    return el("div.empty", {}, [el("h2", {}, t("results.noResults")), el("a.btn.btn--ghost", { href: "#/" }, t("common.backToMenu"))]);
  }
  const assignment = store.getAssignment(attempt.assignmentId);
  const isReview = !!attempt.isReview;
  const heading = attempt.title || assignment?.title || t("results.genericSession");
  const score = attempt.scorePct;
  const great = score >= 80;

  const before = store.attempts.filter((a) => a.finishedAt < attempt.finishedAt);
  const deltas = deltaFromAttempt(before, attempt);

  // Look questions up across the whole library — a review session mixes sets.
  // Kept as {assignment, question} pairs, not just the question, because a
  // mixed review's wrong answers can each belong to a different assignment —
  // the explainer needs the right one per question, not just the top-level
  // assignment this attempt itself was run against.
  const wrong = (attempt.items || []).filter((i) => !i.correct);
  const wrongQ = wrong.map((i) => store.findQuestion(i.questionId)).filter(Boolean);
  const explainerAborts = [];

  const R = 74, C = 2 * Math.PI * R;
  const ringWrap = el("div.scorering");
  ringWrap.innerHTML = `
    <svg viewBox="0 0 180 180">
      <circle class="bg" cx="90" cy="90" r="${R}"></circle>
      <circle class="fg" cx="90" cy="90" r="${R}" stroke-dasharray="${C}" stroke-dashoffset="${C}"
        stroke="${great ? "var(--ok)" : "var(--retry)"}"></circle>
      <text x="90" y="86" text-anchor="middle" font-size="34">${score}%</text>
      <text x="90" y="110" text-anchor="middle" font-size="13" fill="var(--ink-faint)">${countLabel(attempt)}</text>
    </svg>`;
  requestAnimationFrame(() => {
    const fg = ringWrap.querySelector(".fg");
    if (fg) fg.style.strokeDashoffset = String(C * (1 - score / 100));
  });

  if (great) setTimeout(() => { celebrate(); playFanfare(); }, 250);

  const deltaEntries = Object.entries(deltas).sort((a, b) => (b[1].after - b[1].before) - (a[1].after - a[1].before));

  const node = el("div.results", {}, [
    el("h1", {}, great ? t("results.great") : t("results.niceEffort")),
    el("p.note", {}, heading + (attempt.examMode ? t("results.examModeSuffix") : attempt.wasTest ? t("results.testSuffix") : "")),
    ringWrap,
    gradeReveal(attempt),
    el("p.note", { style: { marginTop: "-8px" } }, [
      icon(ICONS.clock, 14),
      " ",
      elapsedLabel(attempt) + (attempt.timeLimitMin ? t("results.limitSuffix", { n: attempt.timeLimitMin }) : ""),
    ]),
    attempt.timedOut ? el("p.note.note--warn", {}, t("results.timedOut")) : null,

    deltaEntries.length ? el("div", {}, [
      el("h3", { style: { marginBottom: "8px" } }, t("results.topicMastery")),
      el("div.delta-list", {}, deltaEntries.map(([topic, d]) => {
        const change = Math.round((d.after - d.before) * 100);
        return el("div.delta", {}, [
          el("span", { style: { textTransform: "capitalize", minWidth: "110px" } }, topic),
          el("span.delta__bar", {}, [el("i", { style: { width: "0%" }, dataset: { w: Math.round(d.after * 100) } })]),
          el("span", { class: "delta__n " + (change > 0 ? "up" : change < 0 ? "down" : ""), }, change > 0 ? `+${change}` : `${change}`),
        ]);
      })),
    ]) : null,

    wrongQ.length ? el("div", { style: { marginTop: "8px", textAlign: "left" } }, [
      el("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", flexWrap: "wrap", marginBottom: "8px" } }, [
        el("h3", {}, t("results.worthAnotherLook")),
        el("a.btn.btn--sm", { href: `#/practice/${attempt.id}` }, [icon(ICONS.spark, 16),
          plural(wrongQ.length, "results.practiseOne", "results.practiseMany")]),
      ]),
      attempt.wasTest ? el("p.note", { style: { marginBottom: "8px" } }, t("results.tutorSatOut")) : null,
      el("div.wronglist", {}, wrongQ.map(({ assignment: qAssignment, question }) =>
        wrongCard(qAssignment, question, explainerAborts))),
    ].filter(Boolean)) : null,

    el("div", { style: { display: "flex", gap: "12px", justifyContent: "center", marginTop: "24px", flexWrap: "wrap" } }, [
      el("button.btn.btn--ghost", { type: "button", onclick: () => shareCard(shareConfig(attempt, heading, score, great)) },
        [icon(ICONS.share, 16), t("share.shareButton")]),
      retryHash(attempt, assignment) && el("a.btn.btn--ghost", { href: retryHash(attempt, assignment) },
        isReview ? t("results.reviewAgain") : t("results.tryAgain")),
      el("a.btn.btn--ghost", { href: "#/progress" }, t("results.seeProgress")),
      el("a.btn.btn--ghost", { href: "#/" }, t("common.backToMenu")),
    ].filter(Boolean)),
  ]);

  requestAnimationFrame(() => {
    node.querySelectorAll(".delta__bar i").forEach((i) => { i.style.width = `${i.dataset.w}%`; });
  });

  return {
    title: t("results.pageTitle"), node,
    cleanup: () => { clearConfetti(); for (const c of explainerAborts) { try { c.abort(); } catch {} } },
  };
}

/** One wrong answer, expandable into: the correct answer, any explanation/
 *  steps already stored on the question (free — no API call), and an
 *  "ask why" mini-chat for a specific follow-up. Unlike the live in-session
 *  tutor, this explains directly rather than holding the answer back — the
 *  session is already over. */
function wrongCard(assignment, question, aborts) {
  const messages = [];   // Anthropic-format follow-up history, this card only
  let open = false, busy = false;

  const toggleBtn = el("button.linkbtn.wrongcard__toggle", { type: "button" }, t("results.askWhy"));
  const logEl = el("div.explainer__log");
  const input = el("input.explainer__input", { type: "text", placeholder: t("results.explainPlaceholder"), "aria-label": t("results.askWhy") });
  const sendBtn = el("button.iconbtn", { type: "submit", "aria-label": t("results.send") }, [icon(ICONS.arrow, 16)]);
  const form = el("form.explainer__form", { onsubmit: (e) => { e.preventDefault(); submit(); } }, [input, sendBtn]);
  const panel = el("div.explainer", { hidden: true });

  function correctAnswerText() {
    if (question.kind === "mc" && Array.isArray(question.choices)) return question.choices[question.answer];
    return question.answer;
  }

  function appendMsg(who, text) {
    const node = el(`div.msg.${who}`);
    node.innerHTML = who === "me" ? escapeHtml(text) : markdown(text);
    logEl.appendChild(node);
    logEl.scrollTop = logEl.scrollHeight;
    return node;
  }

  async function submit() {
    const text = input.value.trim();
    if (!text || busy || !assignment) return;
    input.value = "";
    appendMsg("me", text);
    messages.push({ role: "user", content: text });
    busy = true; sendBtn.disabled = true;
    const bubble = appendMsg("ai", "");
    bubble.innerHTML = `<span class="typing"><span></span><span></span><span></span></span>`;

    const controller = new AbortController();
    aborts.push(controller);
    let acc = "";
    try {
      const system = explainSystem({ assignment, question });
      for await (const chunk of tutorStream({ system, messages, signal: controller.signal })) {
        acc += chunk;
        bubble.innerHTML = markdown(acc);
        logEl.scrollTop = logEl.scrollHeight;
      }
      messages.push({ role: "assistant", content: acc || "…" });
    } catch (e) {
      bubble.innerHTML = markdown(`_${e instanceof ClaudeError ? e.message : t("tutor.snag")}_`);
      messages.pop();
    }
    busy = false; sendBtn.disabled = false;
  }

  toggleBtn.addEventListener("click", () => {
    open = !open;
    panel.hidden = !open;
    toggleBtn.textContent = open ? t("results.hideWhy") : t("results.askWhy");
    if (open && !panel.dataset.filled) {
      panel.dataset.filled = "1";
      const baseline = [
        el("p.explainer__answer", {}, [el("strong", {}, t("results.correctAnswerLabel")), " ", el("span", { html: renderRich(correctAnswerText()) })]),
      ];
      if (question.kind === "mc" && question.explanation) {
        baseline.push(el("p", { html: renderRich(question.explanation) }));
      } else if (question.kind === "worked" && question.steps?.length) {
        baseline.push(el("ol.solve-steps", {}, question.steps.map((s) => el("li", { html: renderRich(s) }))));
      }
      panel.append(...baseline, logEl, assignment && store.hasKey() ? form : el("p.note", {}, t("results.explainNeedsLive")));
    }
  });

  return el("div.wrongcard", {}, [
    el("div.wrongcard__prompt", { html: renderRich(question.prompt) }),
    toggleBtn,
    panel,
  ]);
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

/** For a real exam-conditions run (a "Prov"-type set, or any exam-mode
 *  session — never a review, which isn't "taking an exam" on one set), a
 *  prominent estimated-grade reveal: the letter this specific result maps
 *  to, plus how it stacks up against your own best result on this same
 *  set so far. Nothing to reveal for an ordinary practice run — the
 *  per-topic deltas below already cover that case well. */
function gradeReveal(attempt) {
  if (!attempt.wasTest || attempt.isReview) return null;

  const grade = estimatedGrade(attempt.scorePct / 100);
  const rank = gradeRank(grade.letter);

  const priorBestPct = store.attempts
    .filter((a) => a.id !== attempt.id && a.assignmentId === attempt.assignmentId && a.wasTest && a.finishedAt < attempt.finishedAt)
    .reduce((best, a) => Math.max(best, a.scorePct), -1);

  let compare, compareClass = "";
  if (priorBestPct < 0) {
    compare = t("results.gradeFirstTime");
  } else {
    const priorGrade = estimatedGrade(priorBestPct / 100);
    const priorRank = gradeRank(priorGrade.letter);
    if (rank > priorRank) { compare = t("results.gradeUpFrom", { letter: priorGrade.letter }); compareClass = "up"; }
    else if (rank === priorRank) compare = t("results.gradeMatchesBest");
    else { compare = t("results.gradeBestSoFar", { letter: priorGrade.letter }); compareClass = "down"; }
  }

  return el("div.gradereveal", { class: `gradereveal--${grade.tier}` }, [
    el("span.gradereveal__eyebrow", {}, t("results.gradeEyebrow")),
    el("div.gradereveal__letter", {}, grade.letter),
    el("p.gradereveal__compare", { class: compareClass || null }, compare),
    el("p.gradereveal__caption", {}, t("progress.gradeTooltip", { letter: grade.letter })),
  ]);
}

/** A test's own grade reveal (if any) makes a better share than a bare
 *  percentage — same reasoning gradeReveal() already uses to decide when
 *  it applies. Grade tiers (low/mid/high) don't share names with the
 *  achievement tiers share-card knows gradients for, so they're mapped
 *  onto the closest-feeling one rather than adding a whole new palette. */
function shareConfig(attempt, heading, score, great) {
  if (attempt.wasTest && !attempt.isReview) {
    const grade = estimatedGrade(score / 100);
    const tone = { low: "bronze", mid: "brand", high: "gold" }[grade.tier] || "brand";
    return { tone, emoji: "🎓", tag: t("share.gradeTag"), headline: grade.letter, caption: heading, filename: "studybuddy-grade.png" };
  }
  return {
    tone: great ? "ok" : "brand", emoji: great ? "🎉" : "📚",
    tag: t("share.scoreTag"), headline: `${score}%`, caption: heading, filename: "studybuddy-score.png",
  };
}

function countLabel(attempt) {
  const n = (attempt.items || []).length;
  const c = (attempt.items || []).filter((i) => i.correct).length;
  return t("results.correctCount", { c, n });
}

/** Attempts made before retryHash existed fall back to their assignment. */
function retryHash(attempt, assignment) {
  if (attempt.retryHash) return attempt.retryHash;
  if (attempt.isReview) return "#/review";
  return assignment ? `#/session/${assignment.id}` : null;
}

function elapsedLabel(attempt) {
  const ms = (attempt.finishedAt || 0) - (attempt.startedAt || 0);
  if (!(ms > 0)) return "";
  const mins = Math.floor(ms / 60000);
  const secs = Math.round((ms % 60000) / 1000);
  if (mins >= 60) {
    const h = Math.floor(mins / 60);
    return t("results.tookHours", { h, m: mins % 60 });
  }
  if (!mins) return t("results.tookSecs", { n: secs });
  return t(secs >= 30 ? "results.tookMin30" : "results.tookMin", { n: mins });
}
