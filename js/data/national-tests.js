// Curated pointers to Skolverket's "Gamla nationella prov" and the university
// archives it links to. StudyBuddy never hosts, scrapes, or redistributes the
// exam content itself — this list only gets the student to the official
// source; they bring the material back through the normal Create flow.
// Source: https://www.skolverket.se/prov-och-bedomning/nationella-prov/bestall-nationella-prov/gamla-nationella-prov
// Skolverket: "Här finns länkar till gamla nationella prov som är fria från
// sekretess och får användas."

export const NATIONAL_TESTS_OVERVIEW_URL =
  "https://www.skolverket.se/prov-och-bedomning/nationella-prov/bestall-nationella-prov/gamla-nationella-prov";

export const NATIONAL_TEST_LEVELS = [
  { id: "grundskolan-ak9", label: "Grundskolan, åk 9" },
  { id: "gymnasiet-komvux", label: "Gymnasiet / komvux" },
];

// kind: "zip"  -> direct download, contains PDFs (sometimes MP3s for hörförståelse)
//       "page" -> a university archive/listing page, not a direct file
export const NATIONAL_TEST_SUBJECTS = [
  { level: "grundskolan-ak9", id: "biologi", name: "Biologi", kind: "zip", url: "https://www.skolverket.se/download/18.3c2b09f618aadf1e7793fe/1695908818542/Biologi_ak9_2016-2017.zip" },
  { level: "grundskolan-ak9", id: "engelska", name: "Engelska", kind: "zip", url: "https://www.skolverket.se/download/18.3c2b09f618aadf1e779400/1695908818980/Engelska_ak9_2016-2017.zip" },
  { level: "grundskolan-ak9", id: "fysik", name: "Fysik", kind: "zip", url: "https://www.skolverket.se/download/18.3c2b09f618aadf1e779401/1695908819395/Fysik_ak9_2016-2017.zip" },
  { level: "grundskolan-ak9", id: "geografi", name: "Geografi", kind: "page", url: "https://www.uu.se/nationella-prov/geografi/aldre-prov-och-bedomningsstod" },
  { level: "grundskolan-ak9", id: "historia", name: "Historia", kind: "zip", url: "https://www.skolverket.se/download/18.3c2b09f618aadf1e779402/1695908819572/Historia_ak9_2016-2017.zip" },
  { level: "grundskolan-ak9", id: "kemi", name: "Kemi", kind: "zip", url: "https://www.skolverket.se/download/18.3c2b09f618aadf1e779403/1695908819826/Kemi_ak9_2016-2017.zip" },
  { level: "grundskolan-ak9", id: "matematik", name: "Matematik", kind: "zip", url: "https://www.skolverket.se/download/18.3c2b09f618aadf1e779405/1695908820267/Matematik_ak9_2016-2017.zip" },
  { level: "grundskolan-ak9", id: "religion", name: "Religionskunskap", kind: "zip", url: "https://www.skolverket.se/download/18.3c2b09f618aadf1e779407/1695908821758/Religion_ak9_2016-2017.zip" },
  { level: "grundskolan-ak9", id: "samhalle", name: "Samhällskunskap", kind: "zip", url: "https://www.skolverket.se/download/18.3c2b09f618aadf1e779408/1695908821958/Samh%C3%A4llskunskap_ak9_2016-2017.zip" },
  { level: "grundskolan-ak9", id: "svenska", name: "Svenska/Svenska som andraspråk", kind: "zip", url: "https://www.skolverket.se/download/18.3c2b09f618aadf1e77940a/1695908822723/Svsva_ak9_2016-2017.zip" },

  { level: "gymnasiet-komvux", id: "engelska", name: "Engelska (nivå 1 & 2)", kind: "page", url: "https://www.gu.se/nationella-prov-frammande-sprak/prov-och-bedomningsstod-i-engelska/exempel-pa-uppgiftstyper" },
  { level: "gymnasiet-komvux", id: "matematik-1a", name: "Matematik 1a", kind: "zip", url: "https://www.skolverket.se/download/18.3c2b09f618aadf1e77941e/1695909887860/Matematik_1a.zip" },
  { level: "gymnasiet-komvux", id: "matematik-1b", name: "Matematik 1b", kind: "zip", url: "https://www.skolverket.se/download/18.3c2b09f618aadf1e77941f/1695909888163/Matematik_1b.zip" },
  { level: "gymnasiet-komvux", id: "matematik-k1", name: "Matematik kurs 1 / nivå 1", kind: "page", url: "https://www.su.se/enheter/prim-gruppen/nationella-prov/niva-1-kurs-1" },
  { level: "gymnasiet-komvux", id: "matematik-2-4", name: "Matematik 2–4 (samlingssida)", kind: "page", url: "https://www.umu.se/institutionen-for-tillampad-utbildningsvetenskap/np/np-2-4/tidigare-givna-prov/" },
  { level: "gymnasiet-komvux", id: "matematik-3b", name: "Matematik 3b", kind: "zip", url: "https://www.skolverket.se/download/18.5272a12318ded0586df1d/1709113276850/3b_matematik.zip" },
  { level: "gymnasiet-komvux", id: "matematik-3c", name: "Matematik 3c", kind: "zip", url: "https://www.skolverket.se/download/18.5272a12318ded0586df1e/1709113277033/3c_matematik.zip" },
  { level: "gymnasiet-komvux", id: "matematik-k4", name: "Matematik kurs 4", kind: "zip", url: "https://www.skolverket.se/download/18.5272a12318ded0586df1f/1709113277240/4_matematik.zip" },
  { level: "gymnasiet-komvux", id: "svenska-niva1", name: "Svenska/Sva nivå 1", kind: "page", url: "https://www.uu.se/nationella-prov/svenska-och-svenska-som-andrasprak/gymnasiet/gy1/exempel-pa-provmaterial-i-niva-1" },
  { level: "gymnasiet-komvux", id: "svenska-k3", name: "Svenska/Sva kurs 3", kind: "page", url: "https://www.uu.se/nationella-prov/svenska-och-svenska-som-andrasprak/gymnasiet/gy3/exempel-pa-provmaterial-i-kurs-3" },
];

/** The canonical subject name every year's import for one entry shares — this
 *  IS the grouping key (via store.js's ensureSubject() case-insensitive
 *  reuse-by-name), so it must come out byte-identical every time. */
export function nationalSubjectName(entry) {
  const suffix = entry.level === "grundskolan-ak9" ? ", åk 9" : ", gymnasiet/komvux";
  return `Nationellt prov – ${entry.name}${suffix}`;
}
