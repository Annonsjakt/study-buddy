// Per-topic mastery, derived from attempt history.
// Recency-weighted average correctness in [0,1]; newer attempts count more.

export function masteryByTopic(attempts, { half = 5 } = {}) {
  // gather per-topic list of {correct, age} where age = attempts-ago
  const byTopic = new Map();
  const ordered = [...attempts].sort((a, b) => (a.finishedAt || 0) - (b.finishedAt || 0));
  ordered.forEach((att, idx) => {
    const age = ordered.length - 1 - idx;
    for (const it of att.items || []) {
      if (!it.topic) continue;
      if (!byTopic.has(it.topic)) byTopic.set(it.topic, []);
      byTopic.get(it.topic).push({ correct: it.correct ? 1 : 0, age });
    }
  });

  const out = {};
  for (const [topic, list] of byTopic) {
    let num = 0, den = 0;
    for (const { correct, age } of list) {
      const w = Math.pow(0.5, age / half);
      num += correct * w;
      den += w;
    }
    out[topic] = den ? num / den : 0;
  }
  return out;
}

// Mastery for a subject = mean of its topics' mastery (topics inferred from its assignments).
export function masteryForSubject(subjectId, assignments, topicMastery) {
  const topics = new Set();
  for (const a of assignments) {
    if (a.subjectId !== subjectId) continue;
    for (const q of a.questions || []) if (q.topic) topics.add(q.topic);
  }
  if (!topics.size) return null;
  let sum = 0, n = 0;
  for (const t of topics) { if (t in topicMastery) { sum += topicMastery[t]; n++; } }
  return n ? sum / n : null;
}

// Mastery for a single assignment given the current topic mastery map.
export function masteryForAssignment(assignment, topicMastery) {
  const topics = new Set((assignment.questions || []).map((q) => q.topic).filter(Boolean));
  if (!topics.size) return null;
  let sum = 0, n = 0;
  for (const t of topics) { if (t in topicMastery) { sum += topicMastery[t]; n++; } }
  return n ? sum / n : null;
}

// "Where you started" vs "where you are now": the correctness of the very
// first question you ever answered on each topic, versus your current
// recency-weighted mastery there — the same "0.65 -> 1.4" story competitors'
// testimonials are built on, computed honestly from attempt history that's
// already stored (no separate tracking needed). Needs a couple of different
// topics to say anything meaningful; returns null otherwise. A student who
// just started necessarily gets startPct === nowPct for every topic they've
// only touched once — that's correct, not a bug: there's nothing to report
// yet, not a fabricated head start.
export function masteryProgress(attempts) {
  const ordered = [...attempts].sort((a, b) => (a.finishedAt || 0) - (b.finishedAt || 0));
  const firstByTopic = new Map();
  for (const att of ordered) {
    for (const it of att.items || []) {
      if (!it.topic || firstByTopic.has(it.topic)) continue;
      firstByTopic.set(it.topic, it.correct ? 1 : 0);
    }
  }
  if (firstByTopic.size < 2) return null;

  const now = masteryByTopic(attempts);
  let startSum = 0, nowSum = 0;
  for (const [topic, firstCorrect] of firstByTopic) {
    startSum += firstCorrect;
    nowSum += now[topic] ?? firstCorrect;
  }
  const n = firstByTopic.size;
  return { startPct: startSum / n, nowPct: nowSum / n, topics: n };
}

// Every question whose topic is below `threshold` mastery, across every set
// (or a subset the caller already filtered, e.g. to one subject) — weakest
// topic first. Feeds the "practise weak spots" session (js/views/session.js).
export function weakSpotQuestions(assignments, attempts, { threshold = 0.6, limit = 20 } = {}) {
  const tm = masteryByTopic(attempts);
  const seen = new Set();
  const out = [];

  for (const a of assignments) {
    for (const q of a.questions || []) {
      const m = tm[q.topic];
      // Untouched topics have unknown mastery, not weak mastery — skip them.
      if (m == null || m >= threshold) continue;
      if (seen.has(q.id)) continue;
      seen.add(q.id);
      out.push({ assignment: a, question: q, mastery: m });
    }
  }

  out.sort((x, y) => x.mastery - y.mastery);
  return out.slice(0, limit);
}

// Snapshot before, apply one attempt, return {topic: {before, after}}.
// Only the topics this attempt actually covered — a Rome test shouldn't
// report on your photosynthesis topics just because they exist.
export function deltaFromAttempt(attempts, newAttempt) {
  const before = masteryByTopic(attempts);
  const after = masteryByTopic([...attempts, newAttempt]);
  const topics = new Set((newAttempt.items || []).map((i) => i.topic).filter(Boolean));
  const out = {};
  for (const t of topics) out[t] = { before: before[t] ?? 0, after: after[t] ?? 0 };
  return out;
}
