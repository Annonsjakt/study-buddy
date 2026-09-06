// A shareable square image (PNG), canvas-drawn — celebrating a badge, a
// result, or a leaderboard rank. Zero backend, zero image libraries: draw
// straight onto an offscreen canvas, then open a small preview modal with a
// native share sheet where supported and a plain download everywhere else.
// The card's own look is fixed regardless of the viewer's light/dark theme —
// it's a poster going out to Snapchat or a class group chat, not a UI
// surface, so it gets its own deliberate palette instead of following the
// app's.

import { el, icon, ICONS } from "./dom.js";
import { t } from "./i18n.js";

const SIZE = 1080;

const GRADIENTS = {
  brand: ["#2E3A8C", "#4453B8"],
  ok: ["#1B7A50", "#2FA36B"],
  bronze: ["#8A4A15", "#B5651D"],
  silver: ["#5F6779", "#8A93A6"],
  gold: ["#8F6B15", "#C9971F"],
  platinum: ["#4453B8", "#6456C4", "#C14A75"],
};

export function tierEmoji(tier) {
  return { bronze: "🥉", silver: "🥈", gold: "🥇", platinum: "💎" }[tier] || "🏅";
}

function wrapCenteredText(ctx, text, cx, y, maxWidth, lineHeight) {
  const words = String(text).split(" ");
  const lines = [];
  let line = "";
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (line && ctx.measureText(test).width > maxWidth) { lines.push(line); line = w; }
    else line = test;
  }
  if (line) lines.push(line);
  const startY = y - ((lines.length - 1) * lineHeight) / 2;
  lines.forEach((l, i) => ctx.fillText(l, cx, startY + i * lineHeight));
}

function draw(ctx, { emoji, headline, caption, tag, tone = "brand" }) {
  const colors = GRADIENTS[tone] || GRADIENTS.brand;
  const grad = ctx.createLinearGradient(0, 0, SIZE, SIZE);
  colors.forEach((c, i) => grad.addColorStop(i / Math.max(1, colors.length - 1), c));
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, SIZE, SIZE);

  const glow = ctx.createRadialGradient(SIZE / 2, SIZE * 0.4, 0, SIZE / 2, SIZE * 0.4, SIZE * 0.7);
  glow.addColorStop(0, "rgba(255,255,255,.16)");
  glow.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, SIZE, SIZE);

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#fff";

  ctx.font = "700 42px Arial, sans-serif";
  ctx.globalAlpha = 0.85;
  ctx.fillText("StudyBuddy", SIZE / 2, 110);
  ctx.globalAlpha = 1;

  if (tag) {
    ctx.font = "700 32px Arial, sans-serif";
    ctx.globalAlpha = 0.75;
    wrapCenteredText(ctx, tag.toUpperCase(), SIZE / 2, SIZE * 0.31, SIZE - 200, 42);
    ctx.globalAlpha = 1;
  }

  if (emoji) {
    ctx.font = "170px Arial, sans-serif";
    ctx.fillText(emoji, SIZE / 2, SIZE * 0.47);
  }

  ctx.font = "800 116px Arial, sans-serif";
  wrapCenteredText(ctx, headline, SIZE / 2, SIZE * 0.65, SIZE - 140, 124);

  if (caption) {
    ctx.font = "42px Arial, sans-serif";
    ctx.globalAlpha = 0.88;
    wrapCenteredText(ctx, caption, SIZE / 2, SIZE * 0.81, SIZE - 220, 54);
    ctx.globalAlpha = 1;
  }
}

/** Builds the card and opens the share/download modal. `filename` should be
 *  a plain .png name — no path, nothing user-supplied goes into it. */
export function shareCard({ emoji, headline, caption, tag, tone, filename = "studybuddy.png" }) {
  const canvas = document.createElement("canvas");
  canvas.width = SIZE;
  canvas.height = SIZE;
  draw(canvas.getContext("2d"), { emoji, headline, caption, tag, tone });
  canvas.toBlob((blob) => { if (blob) openModal(blob, filename); }, "image/png");
}

function openModal(blob, filename) {
  const url = URL.createObjectURL(blob);
  const file = new File([blob], filename, { type: "image/png" });
  const canShareFile = !!(navigator.canShare && navigator.canShare({ files: [file] }));

  function onKeydown(e) { if (e.key === "Escape") closeAll(); }
  document.addEventListener("keydown", onKeydown);

  function closeAll() {
    document.removeEventListener("keydown", onKeydown);
    overlay.remove();
    // Deferred: closing (e.g. right after clicking the download link) must
    // not race the browser actually reading the blob URL it was just given.
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  const shareBtn = canShareFile ? el("button.btn", {
    type: "button",
    onclick: async () => { try { await navigator.share({ files: [file], title: "StudyBuddy" }); } catch {} },
  }, [icon(ICONS.share, 16), t("share.shareButton")]) : null;

  const downloadLink = el("a.btn.btn--ghost", { href: url, download: filename, onclick: closeAll }, t("share.download"));

  const overlay = el("div.modal.sharecard-backdrop", {
    role: "dialog", "aria-modal": "true", "aria-label": t("share.title"),
    onclick: (e) => { if (e.target === overlay) closeAll(); },
  }, [
    el("div.modal__card.sharecard", {}, [
      el("button.iconbtn.sharecard__close", { type: "button", "aria-label": t("session.close"), onclick: closeAll }, [icon(ICONS.close, 16)]),
      el("h3", {}, t("share.title")),
      el("img.sharecard__preview", { src: url, alt: "" }),
      el("div.sharecard__actions", {}, [shareBtn, downloadLink].filter(Boolean)),
    ]),
  ]);

  document.body.appendChild(overlay);
}
