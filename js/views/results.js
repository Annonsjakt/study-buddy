// Results screen: animated score ring, per-topic mastery change, review list, confetti.

import { store } from "../store.js";
import { el, icon, ICONS } from "../lib/dom.js";
import { renderRich } from "../lib/rich.js";
import { deltaFromAttempt } from "../lib/mastery.js";
import { celebrate, clearConfetti } from "../lib/confetti-helper.js";
import { estimatedGrade, gradeRank } from "../lib/grade.js";
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
  const wrong = (attempt.items || []).filter((i) => !i.correct);
  const wrongQ = wrong.map((i) => store.findQuestion(i.questionId)?.question).filter(Boolean);

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

  if (great) setTimeout(celebrate, 250);

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
      el("div.delta-list", {}, wrongQ.map((q) => el("div.delta", {}, [
        el("span", { html: renderRich(q.prompt.length > 90 ? q.prompt.slice(0, 90) + "…" : q.prompt) }),
      ]))),
    ].filter(Boolean)) : null,

    el("div", { style: { display: "flex", gap: "12px", justifyContent: "center", marginTop: "24px", flexWrap: "wrap" } }, [
      retryHash(attempt, assignment) && el("a.btn.btn--ghost", { href: retryHash(attempt, assignment) },
        isReview ? t("results.reviewAgain") : t("results.tryAgain")),
      el("a.btn.btn--ghost", { href: "#/progress" }, t("results.seeProgress")),
      el("a.btn.btn--ghost", { href: "#/" }, t("common.backToMenu")),
    ].filter(Boolean)),
  ]);

  requestAnimationFrame(() => {
    node.querySelectorAll(".delta__bar i").forEach((i) => { i.style.width = `${i.dataset.w}%`; });
  });

  return { title: t("results.pageTitle"), node, cleanup: clearConfetti };
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
