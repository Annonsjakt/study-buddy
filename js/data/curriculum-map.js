// Topic-tag -> Lgr22 content-area mapping, subject by subject. Only subjects
// listed here get a "Kursplan" panel on Progress (see js/lib/curriculum.js) —
// a missing subject just means that mapping hasn't been built yet, not a bug.
//
// Topic tags are the free lowercase strings already used across
// data/library/*.json and by Claude-generated sets (see js/prompts.js's
// QUESTION_SHAPE) — masteryByTopic() in js/lib/mastery.js already aggregates
// student attempts by this exact string, so this mapping works at the same
// granularity rather than inventing a second taxonomy question authors would
// have to also fill in.

export const CURRICULUM_INDEX = {
  "Matematik": {
    file: "data/curriculum/lgr22-matematik.json",
    // Checked against every topic tag actually used in
    // data/library/ak7-ma-*.json, ak8-ma-*.json and ak9-matematik-*.json
    // (2026-09-06). Notably, procent-related tags land under "Samband och
    // förändring", not "Taluppfattning" — that matches how Skolverket's own
    // åk7-9 centralt innehåll places procent (åk4-6's kursplan puts it under
    // Taluppfattning instead; a real difference between stages, not an
    // inconsistency introduced here).
    topicMap: {
      // Taluppfattning och tals användning
      "bråk": "tal",
      "decimaltal": "tal",
      "förkorta och förlänga": "tal",
      "negativa tal": "tal",
      "prioriteringsregler": "tal",
      "avrundning": "tal",
      "överslagsräkning": "tal",
      "potenser": "tal",
      "potenslagar": "tal",
      "grundpotensform": "tal",
      "prefix": "tal",
      // Algebra
      "variabler": "algebra",
      "algebraiska uttryck": "algebra",
      "ekvationer": "algebra",
      "mönster": "algebra",
      // Geometri
      "vinklar": "geometri",
      "omkrets": "geometri",
      "area": "geometri",
      "area och omkrets": "geometri",
      "enhetsomvandling": "geometri",
      "enheter": "geometri",
      "volym": "geometri",
      "skala": "geometri",
      "pythagoras sats": "geometri",
      // Sannolikhet och statistik
      "lägesmått": "sannolikhet-statistik",
      "spridning": "sannolikhet-statistik",
      "diagram": "sannolikhet-statistik",
      "källkritik": "sannolikhet-statistik",
      "sannolikhet": "sannolikhet-statistik",
      "kombinatorik": "sannolikhet-statistik",
      // Samband och förändring
      "procent": "samband-forandring",
      "procentform": "samband-forandring",
      "andelar": "samband-forandring",
      "procentuell förändring": "samband-forandring",
      "förändringsfaktor": "samband-forandring",
      "ränta": "samband-forandring",
      "linjära funktioner": "samband-forandring",
      "proportionalitet": "samband-forandring",
      "grafer": "samband-forandring",
      // Problemlösning
      "problemlösning": "problemlosning",
    },
  },
};
