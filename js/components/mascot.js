// The tutor's avatar — a simple rounded character (two eyes, a mouth) rather
// than an abstract glyph, so the mood it's in reads as an actual expression.
// The small corner dot stays alongside it as a "typing…" style indicator —
// good for signalling motion (the thinking pulse) that a static mouth can't.
// mascot(mood, size) -> HTMLElement ;  setMood(el, mood)

const DOT = {
  thinking:  { color: "var(--ink-faint)", pulse: true },
  cheer:     { color: "var(--ok)", pulse: false },
  encourage: { color: "var(--brand)", pulse: false },
};

// Same eye positions throughout — only the mouth changes shape per mood.
const MOUTH = {
  idle:      "M13 25c3.5 3.5 10.5 3.5 14 0",
  encourage: "M13 25c3.5 3.5 10.5 3.5 14 0",
  thinking:  "M14 26h12",
  cheer:     "M11 24c4 6 14 6 18 0",
};

export function mascot(mood = "idle", size = 40) {
  const wrap = document.createElement("span");
  wrap.className = "mascot";
  wrap.style.width = wrap.style.height = `${size}px`;
  wrap.innerHTML = `
    <svg width="${size}" height="${size}" viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="StudyBuddy">
      <rect x="1" y="1" width="38" height="38" rx="14" fill="var(--brand)"/>
      <circle cx="13" cy="17" r="2.4" fill="#fff"/>
      <circle cx="27" cy="17" r="2.4" fill="#fff"/>
      <path class="mascot__mouth" d="${MOUTH.idle}" stroke="#fff" stroke-width="2.2" stroke-linecap="round" fill="none"/>
    </svg>
    <i class="mascot__dot"></i>`;
  setMood(wrap, mood);
  return wrap;
}

export function setMood(el, mood) {
  const mouth = el.querySelector(".mascot__mouth");
  if (mouth) mouth.setAttribute("d", MOUTH[mood] || MOUTH.idle);

  const dot = el.querySelector(".mascot__dot");
  if (!dot) return;
  const cfg = DOT[mood];
  dot.hidden = !cfg;
  if (!cfg) return;
  dot.style.background = cfg.color;
  dot.classList.toggle("mascot__dot--pulse", !!cfg.pulse);
}
