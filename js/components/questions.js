// Question renderers, one per kind. Each returns { el, result } and calls
// opts.onDone(result) when the student has finished the question.
//   result = { correct, hintsUsed, selfRating?, srsGrade }
//
// opts: { question, tutor, live, onDone }

import { el, clear, icon, ICONS } from "../lib/dom.js";
import { renderRich } from "../lib/rich.js";
import { gradeAnswer } from "../claude.js";
import { fromCorrect } from "../lib/srs.js";
import { speak, speechSupported, htmlToText } from "../lib/speech.js";
import { t } from "../lib/i18n.js";

export function renderQuestion(opts) {
  switch (opts.question.kind) {
    case "mc": return mc(opts);
    case "flashcard": return flashcard(opts);
    case "worked": return worked(opts);
    default: return text(opts);
  }
}

function shell(question, body, { showPrompt = true } = {}) {
  return el("div.question", {}, [
    showPrompt && el("div.question__promptrow", {}, [
      el("div.question__prompt", { html: renderRich(question.prompt) }),
      listenBtn(question.prompt, t("q.listenQuestion")),
    ].filter(Boolean)),
    body,
  ].filter(Boolean));
}

/** Small speaker button that reads a question's rich-text field aloud via
 *  the browser's own text-to-speech — absent entirely where unsupported. */
function listenBtn(richText, label) {
  if (!speechSupported || !richText) return null;
  return el("button.iconbtn.iconbtn--sm.question__listen", {
    type: "button", "aria-label": label, title: label,
    onclick: () => speak(htmlToText(renderRich(richText))),
  }, icon(ICONS.volume, 15));
}

/* ---------------- multiple choice ---------------- */
function mc({ question, tutor, testMode, onDone }) {
  const result = { correct: false, hintsUsed: 0 };
  let picked = -1, attempts = 0, done = false;

  const btns = question.choices.map((c, i) =>
    el("button.choice", {
      type: "button",
      onclick: () => { if (done) return; picked = i; sync(); },
    }, [
      el("span.choice__key", {}, String.fromCharCode(65 + i)),
      el("span", { html: renderRich(c) }),
    ]));

  const checkBtn = el("button.btn.btn--sm", { type: "button", disabled: true, onclick: check }, t("q.checkAnswer"));
  const feedback = el("div", {});
  const list = el("div.choices", {}, btns);

  function sync() {
    btns.forEach((b, i) => b.setAttribute("aria-pressed", String(i === picked)));
    checkBtn.disabled = picked < 0;
  }

  const triedWrong = new Set();

  function check() {
    if (picked < 0 || done) return;
    attempts++;
    const correct = picked === question.answer;
    btns.forEach((b) => (b.disabled = true));

    // In a test the answer is recorded as-is: no marking, no second try,
    // no reveal. Everything is explained on the results screen instead.
    if (testMode) {
      done = true;
      result.correct = correct;
      result.hintsUsed = 0;
      btns[picked].setAttribute("aria-pressed", "true");
      feedback.className = "feedback";
      feedback.textContent = t("q.answerRecorded");
      checkBtn.remove();
      onDone(finalize(result));
      return;
    }

    btns[picked].classList.add(correct ? "is-correct" : "is-wrong");
    if (correct) {
      btns[question.answer].classList.add("is-correct");
      done = true;
      result.correct = true;
      result.hintsUsed = attempts - 1;
      feedback.className = "feedback ok";
      feedback.innerHTML = renderRich(question.explanation || t("q.correctBang"));
      checkBtn.remove();
      tutor?.celebrate(t("q.celebrateChoice"));
      onDone(finalize(result));
    } else {
      result.hintsUsed = attempts;
      feedback.className = "feedback retry";
      feedback.textContent = attempts >= 2 ? t("q.retryHint") : t("q.tryAgain");
      tutor?.note(t("q.wrongChoiceNote", { choice: question.choices[picked] }));
      triedWrong.add(picked);
      btns.forEach((b, i) => {
        b.setAttribute("aria-pressed", "false");
        b.disabled = triedWrong.has(i);          // eliminate options already ruled out
      });
      picked = -1; checkBtn.disabled = true;
      if (attempts >= 2 && !document.getElementById("mc-reveal")) {
        const reveal = el("button.btn.btn--ghost.btn--sm", { id: "mc-reveal", type: "button", onclick: revealAnswer }, t("q.revealAnswer"));
        feedback.appendChild(el("div", { style: { marginTop: "10px" } }, [reveal]));
      }
    }
  }

  function revealAnswer() {
    done = true;
    result.correct = false;
    btns.forEach((b) => (b.disabled = true));
    btns[question.answer].classList.add("is-correct");
    feedback.className = "feedback retry";
    feedback.innerHTML = renderRich(question.explanation || t("q.answerIs", { letter: String.fromCharCode(65 + question.answer) }));
    onDone(finalize(result));
  }

  // A–D / 1–4 pick a choice; Enter checks it.
  function handleKey(e) {
    if (done) return false;
    const letter = e.key.length === 1 ? e.key.toUpperCase().charCodeAt(0) - 65 : -1;
    const digit = /^[1-9]$/.test(e.key) ? Number(e.key) - 1 : -1;
    const idx = letter >= 0 && letter < btns.length ? letter : digit;
    if (idx >= 0 && idx < btns.length && !btns[idx].disabled) {
      picked = idx; sync(); btns[idx].focus();
      return true;
    }
    if (e.key === "Enter" && picked >= 0) { check(); return true; }
    return false;
  }

  return {
    result, handleKey,
    el: shell(question, el("div", {}, [list, el("div", { style: { marginTop: "16px" } }, [checkBtn]), feedback])),
  };
}

/* ---------------- short text ---------------- */
function text({ question, tutor, live, testMode, onDone }) {
  const result = { correct: false, hintsUsed: 0 };
  const ta = el("textarea.answerbox", { placeholder: t("q.yourAnswerPlaceholder"), "aria-label": "Your answer" });
  const checkBtn = el("button.btn.btn--sm", { type: "button", onclick: check },
    testMode ? t("q.submitAnswer") : t("q.checkAnswer"));
  const feedback = el("div", {});
  const selfRate = el("div", {});

  async function check() {
    const ans = ta.value.trim();
    if (!ans) return;
    checkBtn.disabled = true; ta.disabled = true;
    result.hintsUsed++;

    let verdict = null;
    if (live) {
      checkBtn.textContent = testMode ? t("q.submitting") : t("q.checking");
      try { verdict = await gradeAnswer({ question, studentAnswer: ans }); }
      catch { verdict = null; }
    }
    if (!verdict) verdict = heuristic(ans, question.answer);

    // Test mode: grade silently, show nothing, move on.
    if (testMode) {
      result.correct = verdict.correct;
      feedback.className = "feedback";
      feedback.textContent = t("q.answerRecorded");
      checkBtn.remove();
      onDone(finalize(result));
      return;
    }

    feedback.className = `feedback ${verdict.correct ? "ok" : "retry"}`;
    feedback.innerHTML =
      `<p>${escapeHtml(verdict.feedback)}</p>` +
      (verdict.missedPoints?.length ? `<ul>${verdict.missedPoints.map((m) => `<li>${escapeHtml(m)}</li>`).join("")}</ul>` : "") +
      `<p style="margin-top:10px"><strong>${t("q.modelAnswerLabel")}</strong> ${renderRich(question.answer)}</p>`;

    if (verdict.correct) tutor?.celebrate(t("q.celebrateText"));
    else tutor?.note(t("q.wroteNote", { answer: ans }));

    // The grade stands on its own — the student no longer marks their own
    // work. They can appeal it, which is recorded rather than silently taken.
    result.correct = verdict.correct;
    checkBtn.remove();
    onDone(finalize(result));

    clear(selfRate);
    if (!verdict.correct) {
      const appeal = el("button.linkbtn", {
        type: "button",
        onclick: () => {
          result.correct = true;
          result.appealed = true;
          result.revised = true;
          // The grade changed, so its review schedule has to be recomputed —
          // otherwise an appealed answer is still scheduled as a lapse.
          result.srsGrade = null;
          onDone(finalize(result));
          clear(selfRate);
          selfRate.appendChild(el("p.note", {}, t("q.markedCorrect")));
        },
      }, t("q.iThinkRight"));
      selfRate.appendChild(el("p.note", { style: { marginTop: "12px" } }, [
        t("q.disagree"), appeal, ".",
      ]));
    }
  }

  return { result, el: shell(question, el("div", {}, [ta, el("div", { style: { marginTop: "12px" } }, [checkBtn]), feedback, selfRate])) };
}

/* ---------------- flashcard ---------------- */
function flashcard({ question, tutor, onDone }) {
  const result = { correct: false, hintsUsed: 0 };
  const card = el("div.flashcard", { role: "button", tabindex: "0", "aria-label": "Flip card" }, [
    el("div.flashcard__inner", {}, [
      el("div.flashcard__face", { html: renderRich(question.prompt) }),
      el("div.flashcard__face.flashcard__face--back", { html: renderRich(question.answer) }),
    ]),
  ]);
  const rate = el("div.selfrate", { hidden: true }, [
    [t("q.rateAgain"), "again"], [t("q.rateHard"), "hard"], [t("q.rateGood"), "good"], [t("q.rateEasy"), "easy"],
  ].map(([label, grade]) =>
    el("button.btn.btn--ghost.btn--sm", { type: "button", onclick: () => pick(grade) }, label)));

  let flipped = false;
  function flip() {
    flipped = !flipped;
    card.classList.toggle("is-flipped", flipped);
    if (flipped) rate.hidden = false;
  }
  card.addEventListener("click", flip);
  card.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); flip(); } });

  function pick(grade) {
    result.srsGrade = grade;
    result.correct = grade !== "again";
    result.selfRating = grade;
    rate.querySelectorAll("button").forEach((b) => (b.disabled = true));
    if (grade === "again") tutor?.note(t("q.forgotNote"));
    else tutor?.celebrate(t("q.rememberedCelebrate"));
    onDone(result);
  }

  // Space flips; 1–4 rate it once it's flipped.
  function handleKey(e) {
    if (e.key === " ") { flip(); return true; }
    if (flipped && /^[1-4]$/.test(e.key)) {
      const btn = rate.children[Number(e.key) - 1];
      if (btn && !btn.disabled) { btn.click(); return true; }
    }
    return false;
  }

  return {
    result, handleKey,
    el: shell(question, el("div", {}, [
      card,
      el("div.flashcard__hint", {}, [
        el("p.note", {}, t("q.tapToFlip")),
        speechSupported ? el("button.iconbtn.iconbtn--sm.question__listen", {
          type: "button", "aria-label": t("q.listen"), title: t("q.listen"),
          onclick: () => speak(htmlToText(renderRich(flipped ? question.answer : question.prompt))),
        }, icon(ICONS.volume, 15)) : null,
      ].filter(Boolean)),
      rate,
    ]), { showPrompt: false }),
  };
}

/* ---------------- worked problem ---------------- */
function worked({ question, tutor, live, testMode, onDone }) {
  const result = { correct: false, hintsUsed: 0 };
  const steps = question.steps || [];
  const ta = el("textarea.answerbox", {
    placeholder: testMode ? t("q.workHerePlain") : t("q.workHereTutor"),
    "aria-label": "Your working",
  });
  const revealed = el("ol", { style: { margin: "12px 0 0 18px" } });
  const revealBtn = steps.length && !testMode
    ? el("button.btn.btn--ghost.btn--sm", { type: "button", onclick: revealStep }, t("q.showStep"))
    : null;
  const doneBtn = el("button.btn.btn--sm", { type: "button", onclick: finish },
    testMode ? t("q.submitAnswer") : t("q.doneShowAnswer"));
  const feedback = el("div", {});
  const selfRate = el("div", {});
  let shown = 0;

  function revealStep() {
    if (shown >= steps.length) return;
    revealed.appendChild(el("li", { html: renderRich(steps[shown]) }));
    shown++; result.hintsUsed = shown;
    tutor?.note(t("q.revealStepNote", { n: shown }), "thinking");
    if (shown >= steps.length) revealBtn.disabled = true;
  }

  async function finish() {
    if (testMode) {
      // Nothing is revealed during a test, so the answer has to be graded
      // for real rather than assumed correct because something was typed.
      const written = ta.value.trim();
      doneBtn.disabled = true;
      let verdict = null;
      if (written && live) {
        doneBtn.textContent = t("q.submitting");
        try { verdict = await gradeAnswer({ question, studentAnswer: written }); }
        catch { verdict = null; }
      }
      if (!verdict) verdict = written ? heuristic(written, question.answer) : { correct: false };
      result.correct = verdict.correct;
      feedback.className = "feedback";
      feedback.textContent = written ? t("q.answerRecorded") : t("q.leftBlank");
      doneBtn.remove();
      onDone(finalize(result));
      return;
    }
    feedback.className = "feedback ok";
    feedback.innerHTML = `<strong>${t("q.fullSolutionLabel")}</strong> ${renderRich(question.answer)}`;
    doneBtn.remove();
    selfRate.appendChild(el("p.note", { style: { marginTop: "12px" } }, t("q.reasoningCheck")));
    selfRate.appendChild(el("div.selfrate", {}, [
      el("button.btn.btn--ok.btn--sm", { type: "button", onclick: () => end(true) }, t("q.hadIt")),
      el("button.btn.btn--ghost.btn--sm", { type: "button", onclick: () => end(false) }, t("q.notQuite")),
    ]));
  }
  function end(correct) {
    result.correct = correct;
    selfRate.querySelectorAll("button").forEach((b) => (b.disabled = true));
    onDone(finalize(result));
  }

  return {
    result,
    el: shell(question, el("div", {}, [
      ta,
      el("div", { style: { marginTop: "12px", display: "flex", gap: "8px", flexWrap: "wrap" } }, [revealBtn, doneBtn].filter(Boolean)),
      revealed, feedback, selfRate,
    ])),
  };
}

/* ---------------- helpers ---------------- */
function finalize(result) {
  if (!result.srsGrade) result.srsGrade = fromCorrect(result.correct, result.hintsUsed);
  return result;
}

function heuristic(ans, model) {
  const norm = (s) => s.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((w) => w.length > 3);
  const a = new Set(norm(ans)), m = norm(model);
  if (!m.length) return { correct: ans.length > 8, feedback: t("q.heuristicNoModel") };
  const hit = m.filter((w) => a.has(w)).length / m.length;
  return {
    correct: hit >= 0.34,
    feedback: hit >= 0.34 ? t("q.heuristicGood") : t("q.heuristicMissing"),
    missedPoints: [],
  };
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
