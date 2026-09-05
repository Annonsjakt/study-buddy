// Övningsbiblioteket: färdiga, granskade set som ligger som statiska
// JSON-filer under data/library/. De behöver varken API-nyckel eller
// backend — poängen är att en ny elev ska ha något att plugga på direkt,
// utan att först skaffa fram eget material.
//
// Innehållet är svenskt läroplansmaterial i grunden. Två separata
// översättningslager läggs ovanpå när appen står på engelska:
//   - index.en.json: kort bläddringstext (ämnesnamn/beskrivningar, set-titlar
//     och sammanfattningar) — täcker alla 229 set direkt.
//   - data/library-en/<samma filnamn>.json: själva frågeinnehållet. Ett
//     redan importerat set har redan kopierat in sitt (svenska) innehåll i
//     elevens egen store, så det räcker inte att bara byta vilken fil
//     importSet() hämtar härnäst — store.js läser samma översatta dokument
//     (via lib/library-content.js:s cache) och lägger den engelska texten
//     ovanpå redan-importerade set också, utan att röra det sparade svenska
//     originalet.

import { store } from "../store.js";
import { t, getLang } from "../lib/i18n.js";
import { loadLibraryIndex, loadLibraryTranslations, englishFile } from "../lib/library-content.js";

export { loadLibraryIndex, loadLibraryTranslations };

/** Har det här biblioteks-setet redan lagts till i elevens egna bibliotek?
 *  store.addAssignmentDoc() behåller dokumentets id första gången, så det
 *  räcker att slå upp id:t. */
export function isImported(setId) {
  return !!store.getAssignment(setId);
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
