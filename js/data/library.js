// Övningsbiblioteket: färdiga, granskade set som ligger som statiska
// JSON-filer under data/library/. De behöver varken API-nyckel eller
// backend — poängen är att en ny elev ska ha något att plugga på direkt,
// utan att först skaffa fram eget material.
//
// Innehållet är svenskt läroplansmaterial i grunden. Två separata
// översättningslager läggs ovanpå när appen står på engelska:
//   - index.en.json: kort bläddringstext (ämnesnamn/beskrivningar, set-titlar
//     och sammanfattningar) — täcker alla 229 set direkt.
//   - data/library-en/<samma filnamn>.json: själva frågeinnehållet, fil för
//     fil — fylls på efter hand, med svenska som fallback tills en given fil
//     är översatt.

import { store } from "../store.js";
import { t, getLang } from "../lib/i18n.js";

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

/** Har det här biblioteks-setet redan lagts till i elevens egna bibliotek?
 *  store.addAssignmentDoc() behåller dokumentets id första gången, så det
 *  räcker att slå upp id:t. */
export function isImported(setId) {
  return !!store.getAssignment(setId);
}

/** "data/library/ak7-bio-djur.json" -> "data/library-en/ak7-bio-djur.json" */
function englishFile(file) {
  return file.replace(/^data\/library\//, "data/library-en/");
}

/** Hämtar setet och lägger till det i elevens bibliotek. Returnerar det
 *  sparade setet (eller null om det redan fanns). På engelska försöker den
 *  översatta filen först och faller tillbaka till den svenska originalfilen
 *  om den översatta versionen inte finns än. */
export async function importSet(entry) {
  if (isImported(entry.id)) return null;
  let res = await fetch(getLang() === "en" ? englishFile(entry.file) : entry.file);
  if (!res.ok) res = await fetch(entry.file);
  if (!res.ok) throw new Error(t("library.setLoadFailed", { title: entry.title }));
  const doc = await res.json();
  return store.addAssignmentDoc(doc);
}
