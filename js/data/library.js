// Övningsbiblioteket: färdiga, granskade set som ligger som statiska
// JSON-filer under data/library/. De behöver varken API-nyckel eller
// backend — poängen är att en ny elev ska ha något att plugga på direkt,
// utan att först skaffa fram eget material.

import { store } from "../store.js";

const INDEX_URL = "data/library/index.json";

let cachedIndex = null;

export async function loadLibraryIndex() {
  if (cachedIndex) return cachedIndex;
  const res = await fetch(INDEX_URL);
  if (!res.ok) throw new Error("Kunde inte ladda övningsbiblioteket.");
  cachedIndex = await res.json();
  return cachedIndex;
}

/** Har det här biblioteks-setet redan lagts till i elevens egna bibliotek?
 *  store.addAssignmentDoc() behåller dokumentets id första gången, så det
 *  räcker att slå upp id:t. */
export function isImported(setId) {
  return !!store.getAssignment(setId);
}

/** Hämtar setet och lägger till det i elevens bibliotek. Returnerar det
 *  sparade setet (eller null om det redan fanns). */
export async function importSet(entry) {
  if (isImported(entry.id)) return null;
  const res = await fetch(entry.file);
  if (!res.ok) throw new Error(`Kunde inte ladda ”${entry.title}”.`);
  const doc = await res.json();
  return store.addAssignmentDoc(doc);
}
