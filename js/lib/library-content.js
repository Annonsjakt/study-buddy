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

// A student's own subject list (store.subjects) is built by matching plain
// name strings (ensureSubject()) against whatever a set's "subject" field
// said at import time — kept untranslated deliberately (see js/store.js and
// js/data/library.js) so that matching, and a new set landing in the same
// bucket as an existing one, keeps working regardless of display language.
// This is a *display-only* translation for the handful of curriculum
// subject names the library ships, applied at render time in the views that
// show a subject's name as text — never to the stored name itself, and
// never to a value that's about to be compared against it or saved back.
const SUBJECT_NAME_EN = {
  "Matematik": "Mathematics",
  "Matematik 1": "Mathematics 1",
  "Matematik 2": "Mathematics 2",
  "Matematik 3": "Mathematics 3",
  "Svenska": "Swedish",
  "Svenska 1": "Swedish 1",
  "Svenska 2": "Swedish 2",
  "Svenska 3": "Swedish 3",
  "Engelska": "English",
  "Engelska 5": "English 5",
  "Engelska 6": "English 6",
  "Engelska 7": "English 7",
  "Biologi": "Biology",
  "Fysik": "Physics",
  "Kemi": "Chemistry",
  "Naturkunskap 1b": "Natural Science 1b",
  "Historia": "History",
  "Historia 1a1": "History 1a1",
  "Geografi": "Geography",
  "Religionskunskap": "Religious Studies",
  "Religionskunskap 1": "Religious Studies 1",
  "Samhällskunskap": "Civics",
  "Samhällskunskap 1a1": "Civics 1a1",
};

/** Translates a subject's display name for the current language, falling
 *  back to the name as-is for anything outside the library's fixed set
 *  (e.g. a subject the student typed themselves). */
export function subjectDisplayName(name) {
  if (getLang() !== "en" || !name) return name;
  return SUBJECT_NAME_EN[name] || name;
}
