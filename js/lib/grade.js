// A rough E–A grade estimate from a mastery score (0–1) — a familiar frame
// of reference for Swedish students, not a substitute for a teacher's actual
// assessment against the kursplan's kunskapskrav (which weighs far more than
// quiz performance). Always label it as an estimate wherever it's shown.

const SCALE = [
  [0.40, "F", "low"],
  [0.55, "E", "low"],
  [0.70, "D", "mid"],
  [0.85, "C", "mid"],
  [0.95, "B", "high"],
];

export function estimatedGrade(mastery) {
  for (const [max, letter, tier] of SCALE) {
    if (mastery < max) return { letter, tier };
  }
  return { letter: "A", tier: "high" };
}
