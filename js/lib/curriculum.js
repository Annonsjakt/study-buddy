// Lgr22 curriculum coverage: how a student's existing per-topic mastery maps
// onto Skolverket's actual centralt innehåll and kunskapskrav, for whichever
// subjects js/data/curriculum-map.js has a mapping for. A subject with no
// mapping simply has no curriculum data yet — callers should treat that as
// "nothing to show", not an error.

import { CURRICULUM_INDEX } from "../data/curriculum-map.js";

const cache = new Map(); // subjectName -> parsed curriculum doc | null

export function hasCurriculum(subjectName) {
  return !!CURRICULUM_INDEX[subjectName];
}

export async function loadCurriculum(subjectName) {
  const entry = CURRICULUM_INDEX[subjectName];
  if (!entry) return null;
  if (cache.has(subjectName)) return cache.get(subjectName);
  let doc = null;
  try {
    const res = await fetch(entry.file);
    if (res.ok) doc = await res.json();
  } catch {
    // Offline or a bad path — the caller just won't show this subject's panel.
  }
  cache.set(subjectName, doc);
  return doc;
}

export function getCachedCurriculum(subjectName) {
  return cache.get(subjectName) || null;
}

/** Per-content-area mastery for one subject, built from the topic mastery
 *  Progress already computes (masteryByTopic() in js/lib/mastery.js) rather
 *  than re-deriving anything from attempts directly. An area with no
 *  practiced topics yet comes back with mastery: null — "not started", not
 *  a fabricated 0%. */
export function curriculumCoverage(subjectName, topicMastery) {
  const doc = getCachedCurriculum(subjectName);
  const entry = CURRICULUM_INDEX[subjectName];
  if (!doc || !entry) return null;

  const scoresByArea = new Map(doc.contentAreas.map((a) => [a.id, []]));
  for (const [topic, mastery] of Object.entries(topicMastery)) {
    const areaId = entry.topicMap[topic];
    if (areaId && scoresByArea.has(areaId)) scoresByArea.get(areaId).push(mastery);
  }

  return doc.contentAreas.map((area) => {
    const scores = scoresByArea.get(area.id) || [];
    const mastery = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null;
    return { id: area.id, name: area.name, mastery, topicsPracticed: scores.length };
  });
}
