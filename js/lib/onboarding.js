// First-run welcome: a short, self-playing demo of the two things that
// matter most (photo-solve, mastery/streak tracking) instead of a text
// tutorial nobody reads. Shown once, over the real dashboard, and skippable
// at every moment — it's a trailer for the app, not a gate in front of it.

import { store } from "../store.js";
import { el, clear, icon, ICONS } from "./dom.js";
import { t } from "./i18n.js";

const SEEN_KEY = "studybuddy.onboarded";

const SCENE_KEYS = ["capture", "solving", "answer", "progress", "cta"];
const SCENE_DURATION = { capture: 2200, solving: 1500, answer: 3000, progress: 3200 };
const CAPTION_KEY = {
  capture: "ob.sceneCapture", solving: "ob.sceneSolving",
  answer: "ob.sceneAnswer", progress: "ob.sceneProgress",
};

/** Only for a genuine first run — not just a missing flag (e.g. cleared
 *  storage) on a browser that already has real study history. */
export function maybeShowOnboarding() {
  try {
    if (localStorage.getItem(SEEN_KEY) === "1") return;
  } catch { return; }
  if (store.assignments.length || store.attempts.length) return;
  showOnboarding();
}

function showOnboarding() {
  const stage = el("div.onboard__stage");
  const caption = el("p.onboard__caption");
  const dots = el("div.onboard__dots", {}, SCENE_KEYS.slice(0, -1).map(() => el("span")));

  const card = el("div.modal__card.onboard", {}, [
    el("button.iconbtn.onboard__skip", { type: "button", "aria-label": t("ob.skip"), title: t("ob.skip"), onclick: () => finish(null) }, icon(ICONS.close, 16)),
    stage,
    caption,
    dots,
  ]);

  const overlay = el("div.modal.onboard-backdrop", {
    role: "dialog", "aria-modal": "true", "aria-label": t("ob.ctaTitle"),
    onclick: (e) => { if (e.target === overlay) finish(null); },
  }, [card]);

  let idx = 0, timer = null, sceneStartedAt = 0, remaining = 0;

  function onKeydown(e) { if (e.key === "Escape") finish(null); }
  document.addEventListener("keydown", onKeydown);

  function finish(navTo) {
    clearTimeout(timer);
    document.removeEventListener("keydown", onKeydown);
    try { localStorage.setItem(SEEN_KEY, "1"); } catch {}
    overlay.remove();
    if (navTo) location.hash = navTo;
  }

  function scheduleNext() {
    sceneStartedAt = Date.now();
    clearTimeout(timer);
    timer = setTimeout(() => { idx++; paintScene(); }, remaining);
  }

  function paintScene() {
    const key = SCENE_KEYS[idx];
    clear(stage);
    stage.appendChild(SCENE_RENDER[key](finish));
    caption.textContent = CAPTION_KEY[key] ? t(CAPTION_KEY[key]) : "";
    card.classList.toggle("onboard--cta", key === "cta");
    dots.hidden = key === "cta";
    [...dots.children].forEach((d, i) => d.classList.toggle("on", i === idx));

    if (SCENE_DURATION[key]) {
      remaining = SCENE_DURATION[key];
      scheduleNext();
    }
  }

  // Hovering pauses the auto-advance — a timed sequence that can't be
  // paused is an accessibility dead end, not just bad manners.
  card.addEventListener("pointerenter", () => {
    if (!SCENE_DURATION[SCENE_KEYS[idx]]) return;
    clearTimeout(timer);
    remaining -= Date.now() - sceneStartedAt;
  });
  card.addEventListener("pointerleave", () => {
    if (!SCENE_DURATION[SCENE_KEYS[idx]] || remaining <= 0) return;
    scheduleNext();
  });

  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add("show"));
  paintScene();
  card.querySelector(".onboard__skip")?.focus();
}

function renderCapture() {
  return el("div.solve-dropzone.has-image.onboard__demo", {}, [
    el("div.onboard__mockphoto", {}, "2x + 5 = 17"),
  ]);
}

function renderSolving() {
  return el("div.onboard__solving", {}, [el("div.spinner")]);
}

function renderAnswer() {
  return el("div.solve-answer", {}, [
    el("span.solve-answer__label", {}, t("solve.answerLabel")),
    el("div.solve-answer__value", {}, "x = 6"),
    el("p.note", { style: { marginTop: "8px" } }, t("ob.demoStep")),
  ]);
}

function renderProgress() {
  const ring = demoRing(82);
  const streakValue = el("div.dash__value", {}, "0");
  requestAnimationFrame(() => animateNumber(streakValue, 0, 7, 1500));

  return el("div.onboard__progress", {}, [
    el("div.onboard__progress-item", {}, [ring, el("div.dash__label", {}, t("dash.overallMastery"))]),
    el("div.onboard__progress-item", {}, [
      el("div.dash__stat-top", {}, [el("span.dash__icon.dash__icon--brand", {}, icon(ICONS.flame, 20)), streakValue]),
      el("div.dash__label", {}, t("dash.daysStreak")),
    ]),
  ]);
}

function renderCta(finish) {
  return el("div.onboard__cta", {}, [
    el("h2", {}, t("ob.ctaTitle")),
    el("p.note", {}, t("ob.ctaBody")),
    el("div.onboard__cta-actions", {}, [
      el("button.btn", { type: "button", onclick: () => finish("#/solve") }, [icon(ICONS.camera, 18), t("ob.ctaPrimary")]),
      el("button.btn.btn--ghost", { type: "button", onclick: () => finish(null) }, t("ob.ctaSecondary")),
    ]),
  ]);
}

const SCENE_RENDER = { capture: renderCapture, solving: renderSolving, answer: renderAnswer, progress: renderProgress, cta: renderCta };

/** Same small SVG ring as the dashboard's mastery meter (menu.js's ring()) —
 *  duplicated rather than imported so this demo never depends on a real
 *  view module, but built to match it exactly so it reads as a preview of
 *  the real thing, not a mockup of it. */
function demoRing(pct) {
  const wrap = el("span.ring.ring--lg", { style: { "--v": 0 } });
  wrap.innerHTML =
    `<svg viewBox="0 0 36 36" aria-hidden="true">` +
    `<circle class="ring__bg" cx="18" cy="18" r="15.9"/>` +
    `<circle class="ring__fg" cx="18" cy="18" r="15.9" pathLength="100" transform="rotate(-90 18 18)"/>` +
    `<text class="ring__label" x="18" y="18" text-anchor="middle" dominant-baseline="central">0</text>` +
    `</svg>`;
  const label = wrap.querySelector(".ring__label");
  requestAnimationFrame(() => {
    wrap.style.setProperty("--v", String(pct));
    animateNumber(label, 0, pct, 1500);
  });
  return wrap;
}

function animateNumber(node, from, to, duration) {
  const start = performance.now();
  function tick(now) {
    const p = Math.min(1, (now - start) / duration);
    const eased = 1 - Math.pow(1 - p, 3);
    node.textContent = String(Math.round(from + (to - from) * eased));
    if (p < 1) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}
