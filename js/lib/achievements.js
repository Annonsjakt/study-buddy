// Achievement/badge definitions and progress metrics — pure, no store import
// (same reasoning as mastery.js/grade.js: keep it framework-free so store.js
// can import it without a cycle).

import { masteryByTopic, masteryForSubject } from "./mastery.js";
import { estimatedGrade, gradeRank } from "./grade.js";

const TIER_NAMES = ["bronze", "silver", "gold", "platinum"];

// Each track is a metric with four thresholds. Unlocking is permanent once
// recorded by the store (see Store.checkAchievements) even if the metric
// itself could later dip — e.g. "subjects mastered" is a live measurement,
// not a running total, so without that permanence a bad week could take a
// badge away, which isn't how an achievement is supposed to work.
const TRACKS = [
  { id: "streak", icon: "flame", nameKey: "ach.track.streak", descKey: "ach.desc.streak", tiers: [3, 7, 30, 100] },
  { id: "questions", icon: "book", nameKey: "ach.track.questions", descKey: "ach.desc.questions", tiers: [25, 100, 500, 2000] },
  { id: "sessions", icon: "check", nameKey: "ach.track.sessions", descKey: "ach.desc.sessions", tiers: [5, 20, 75, 250] },
  { id: "mastery", icon: "chart", nameKey: "ach.track.mastery", descKey: "ach.desc.mastery", tiers: [1, 2, 4, 6] },
  { id: "perfect", icon: "graduation", nameKey: "ach.track.perfect", descKey: "ach.desc.perfect", tiers: [1, 5, 15, 50] },
];

export const ACHIEVEMENTS = TRACKS.flatMap((track) =>
  track.tiers.map((target, i) => ({
    id: `${track.id}-${TIER_NAMES[i]}`,
    track: track.id,
    tier: TIER_NAMES[i],
    icon: track.icon,
    nameKey: track.nameKey,
    descKey: track.descKey,
    target,
  })));

/** Current value of every track from raw store state — used both to detect
 *  newly-crossed thresholds (Store.checkAchievements) and to draw progress
 *  bars for badges that aren't unlocked yet. */
export function achievementMetrics({ attempts, streak, subjects, assignments }) {
  const questions = attempts.reduce((n, a) => n + (a.items?.length || 0), 0);
  const perfect = attempts.filter((a) => a.wasTest && a.scorePct === 100).length;
  const tm = masteryByTopic(attempts);
  const cOrBetter = gradeRank("C");
  const mastery = subjects.filter((s) => {
    const m = masteryForSubject(s.id, assignments, tm);
    return m != null && gradeRank(estimatedGrade(m).letter) >= cOrBetter;
  }).length;
  return { streak, questions, sessions: attempts.length, mastery, perfect };
}
