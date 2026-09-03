// Thin wrapper around vendored canvas-confetti, with reduced-motion respect.

export function celebrate() {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const fn = window.confetti;
  if (typeof fn !== "function") return;
  const colors = ["#2E3A8C", "#4453B8", "#1B7A50"];
  fn({ particleCount: 28, spread: 65, startVelocity: 28, origin: { y: 0.7 }, colors, disableForReducedMotion: true, scalar: 0.8 });
  setTimeout(() => { try { window.confetti?.reset?.(); } catch {} }, 2500);
}

export function clearConfetti() {
  try { window.confetti?.reset?.(); } catch {}
}
