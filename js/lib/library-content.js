// English overlay for the practice-library content. Split out from
// js/data/library.js (which needs store.js) so store.js can import the cache
// reader below without a circular dependency — store.js is what applies the
// overlay to already-imported sets, via getCachedQuestionTranslation().

import { t, getLang } from "./i18n.js";

const INDEX_URL = "data/library/index.json";
const TRANSLATIONS_URL = "data/library/index.en.json";

let cachedIndex = null;
let cachedTranslations = null;

export async function loadLibraryIndex() {
  if (cachedIndex) return cachedIndex;
  const res = await fetch(INDEX_URL);
  if (!res.ok) throw new Error(t("library.indexLoadFailed"));
  cachedIndex = await res.json();
  return cachedIndex;
}

/** { subjects: {[id]: {name, description}}, sets: {[id]: {title, summary}} } —
 *  missing ids just mean that piece hasn't been translated yet, so callers
 *  fall back to the Swedish original. Never throws: a 404 or bad fetch just
 *  means "nothing translated yet", not a broken library. */
export async function loadLibraryTranslations() {
  if (cachedTranslations) return cachedTranslations;
  try {
    const res = await fetch(TRANSLATIONS_URL);
    cachedTranslations = res.ok ? await res.json() : { subjects: {}, sets: {} };
  } catch {
    cachedTranslations = { subjects: {}, sets: {} };
  }
  return cachedTranslations;
}

/** "data/library/ak7-bio-djur.json" -> "data/library-en/ak7-bio-djur.json" */
export function englishFile(file) {
  return file.replace(/^data\/library\//, "data/library-en/");
}

// Keyed by the *set's* id (the same id addAssignmentDoc() preserves on
// import), not by filename — so an already-imported assignment can be
// looked up straight from its own id, with no need to remember which
// library file it came from.
const questionDocCache = new Map(); // assignmentId -> translated doc | null

async function loadQuestionTranslation(assignmentId) {
  if (questionDocCache.has(assignmentId)) return questionDocCache.get(assignmentId);
  let doc = null;
  try {
    const index = await loadLibraryIndex();
    const entry = index.sets.find((s) => s.id === assignmentId);
    if (entry) {
      const res = await fetch(englishFile(entry.file));
      if (res.ok) doc = await res.json();
    }
  } catch {
    // No translation available yet (or this id isn't a library set) — the
    // caller falls back to whatever content is already stored.
  }
  questionDocCache.set(assignmentId, doc);
  return doc;
}

/** Synchronous read of whatever preloadQuestionTranslations() already warmed
 *  up. Returns null if nothing's cached yet (or this id has no translation),
 *  so callers can fall back to the assignment's own stored content. */
export function getCachedQuestionTranslation(assignmentId) {
  return questionDocCache.get(assignmentId) || null;
}

/** Warms the cache for a set of assignment ids so synchronous lookups
 *  (store.getAssignment / store.findQuestion / store.assignments) can return
 *  already-translated content right away, even for sets that were imported
 *  back when the app was in Swedish mode. No-op outside English mode. */
export async function preloadQuestionTranslations(assignmentIds) {
  if (getLang() !== "en") return;
  await Promise.all([...new Set(assignmentIds)].map(loadQuestionTranslation));
}
