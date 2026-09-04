// Övningsbiblioteket: välj nivå, sedan ämne, och se bara det ämnets set —
// i stället för att lista allt på en enda lång sida. Fungerar utan
// API-nyckel — allt innehåll är statiska filer.

import { store } from "../store.js";
import { el, clear, icon, ICONS, toast } from "../lib/dom.js";
import { loadLibraryIndex, isImported, importSet } from "../data/library.js";
import { t, plural } from "../lib/i18n.js";

// The library's actual course content (subject names, descriptions,
// question sets) stays Swedish — it's Swedish-curriculum material, not UI
// chrome. But these four level labels double as navigation categories, so
// they get a translation for the handful of ids we ship.
const LEVEL_KEYS = { ak7: "library.levelAk7", ak8: "library.levelAk8", ak9: "library.levelAk9", gymnasiet: "library.levelGymnasiet" };
function levelLabel(lvl) {
  const key = lvl && LEVEL_KEYS[lvl.id];
  return key ? t(key) : lvl?.label;
}

export async function renderLibrary() {
  let index;
  try {
    index = await loadLibraryIndex();
  } catch (e) {
    return {
      title: t("library.pageTitle"),
      node: el("div.empty", {}, [
        el("h2", {}, t("library.loadFailed")),
        el("p", {}, e.message || t("library.tryAgain")),
        el("a.btn.btn--ghost", { href: "#/", style: { marginTop: "16px" } }, t("library.toHome")),
      ]),
    };
  }

  const root = el("div");
  const state = { level: null, subject: null, query: "" };

  // Built once so typing never loses focus — paintBody() only ever touches
  // bodyEl, never this input or the header above it.
  const searchInput = el("input.search__input", {
    type: "search",
    placeholder: t("library.searchPlaceholder"),
    "aria-label": t("library.searchAria"),
    value: state.query,
    oninput: (e) => { state.query = e.target.value; paintBody(); },
    onkeydown: (e) => {
      if (e.key === "Escape" && state.query) { e.preventDefault(); state.query = ""; searchInput.value = ""; paintBody(); }
    },
  });
  const searchWrap = el("div.search", { style: { marginBottom: "16px" } }, [icon(ICONS.search, 16), searchInput]);
  const headerEl = el("div");
  const bodyEl = el("div");

  function paint() {
    paintHeader();
    paintBody();
  }

  function paintHeader() {
    clear(headerEl);
    const back = state.subject
      ? () => { state.subject = null; paint(); }
      : state.level
        ? () => { state.level = null; paint(); }
        : null;

    headerEl.appendChild(el("div", { style: { display: "flex", alignItems: "center", gap: "12px", marginBottom: "8px" } }, [
      back
        ? el("button.iconbtn", { type: "button", "aria-label": t("library.back"), onclick: back }, [icon(ICONS.back, 18)])
        : el("a.iconbtn", { href: "#/", "aria-label": t("library.back") }, [icon(ICONS.back, 18)]),
      el("h1", {}, t("library.pageTitle")),
    ]));
  }

  function paintBody() {
    clear(bodyEl);
    const q = state.query.trim().toLowerCase();
    if (q) bodyEl.appendChild(searchResults(q));
    else if (!state.level) bodyEl.appendChild(levelPicker());
    else if (!state.subject) bodyEl.appendChild(subjectPicker());
    else bodyEl.appendChild(setList());
  }

  /* ---- sök: träffar över hela biblioteket, oavsett var man står ---- */
  function searchResults(q) {
    const matches = index.sets.filter((s) => {
      const subject = index.subjects.find((sub) => sub.id === s.subject);
      const level = index.levels.find((l) => l.id === subject?.level);
      const haystack = [s.title, s.summary, subject?.name, levelLabel(level)].filter(Boolean).join(" ").toLowerCase();
      return haystack.includes(q);
    });

    if (!matches.length) {
      return el("div.panel", {}, [
        el("p.note", {}, t("library.noMatches", { query: state.query.trim() })),
      ]);
    }

    const bySubject = new Map();
    for (const s of matches) {
      if (!bySubject.has(s.subject)) bySubject.set(s.subject, []);
      bySubject.get(s.subject).push(s);
    }

    const sections = [...bySubject.entries()].map(([subjId, sets]) => {
      const subject = index.subjects.find((s) => s.id === subjId);
      const level = index.levels.find((l) => l.id === subject?.level);
      return el("section.panel", { style: { marginBottom: "20px" } }, [
        el("p.note", { style: { marginBottom: "8px" } }, [levelLabel(level), subject?.name].filter(Boolean).join(" · ")),
        el("div.libgrid", {}, sets.map(setCard)),
      ]);
    });

    return el("div", {}, [
      el("p.note", { style: { marginBottom: "12px" } }, plural(matches.length, "library.matchOne", "library.matchMany")),
      ...sections,
    ]);
  }

  /* ---- steg 1: välj nivå ---- */
  function levelPicker() {
    const levels = index.levels.filter((l) => index.subjects.some((s) => s.level === l.id));
    return el("div.panel", {}, [
      el("p", { style: { marginBottom: "16px" } }, t("library.levelIntro")),
      el("div.source-grid", {}, levels.map((lvl) =>
        el("button.source-opt", { type: "button", onclick: () => { state.level = lvl.id; paint(); } }, [
          icon(ICONS.graduation, 26), levelLabel(lvl),
        ]))),
    ]);
  }

  /* ---- steg 2: välj ämne ---- */
  function subjectPicker() {
    const level = index.levels.find((l) => l.id === state.level);
    const subjects = index.subjects.filter((s) => s.level === state.level);
    return el("div.panel", {}, [
      el("p", { style: { marginBottom: "16px" } }, t("library.subjectIntro", { level: levelLabel(level) })),
      el("div.source-grid", {}, subjects.map((subject) =>
        el("button.source-opt", { type: "button", onclick: () => { state.subject = subject.id; paint(); } }, [
          icon(ICONS.book, 26), subject.name,
          el("div.note", { style: { fontWeight: "400", marginTop: "4px" } }, subject.description),
        ]))),
    ]);
  }

  /* ---- steg 3: sett för valt ämne ---- */
  function setList() {
    const subject = index.subjects.find((s) => s.id === state.subject);
    const sets = index.sets.filter((s) => s.subject === subject.id);
    const missing = sets.filter((s) => !isImported(s.id));

    const addAllBtn = el("button.btn.btn--sm", {
      type: "button",
      onclick: async (e) => {
        e.currentTarget.disabled = true;
        let added = 0;
        for (const s of missing) {
          try { if (await importSet(s)) added++; } catch { /* skip whatever fails */ }
        }
        toast(added ? plural(added, "library.addedOne", "library.addedMany") : t("library.allAlready"));
        paint();
      },
    }, [icon(ICONS.plus, 16), t("library.addAll", { n: missing.length })]);

    return el("div", {}, [
      el("section.panel", { style: { marginBottom: "24px" } }, [
        el("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px", flexWrap: "wrap", marginBottom: "6px" } }, [
          el("div", {}, [
            el("h3", {}, subject.name),
            el("p.note", { style: { marginTop: "4px" } }, subject.description),
          ]),
          missing.length ? addAllBtn : el("span.note", {}, t("library.allAdded")),
        ]),
        el("div.libgrid", {}, sets.map(setCard)),
      ]),
    ]);
  }

  function setCard(entry) {
    const imported = isImported(entry.id);

    const action = imported
      ? el("a.btn.btn--ghost.btn--sm", { href: `#/session/${entry.id}` }, [icon(ICONS.play, 16), t("library.study")])
      : el("button.btn.btn--sm", {
          type: "button",
          onclick: async (e) => {
            e.currentTarget.disabled = true;
            try {
              await importSet(entry);
              toast(t("library.added", { title: entry.title }));
              paint();
            } catch (err) {
              toast(err.message || t("library.addFailed"));
              e.currentTarget.disabled = false;
            }
          },
        }, [icon(ICONS.plus, 16), t("library.add")]);

    // Same set, exam conditions: locked tutor, answer key withheld until
    // done, with a timer — only available once the set is already in the
    // library.
    const examAction = imported
      ? el("a.btn.btn--ghost.btn--sm", {
          href: `#/session/${entry.id}?exam=1`,
          title: t("library.examModeTooltip"),
        }, [icon(ICONS.clock, 16), t("library.examMode")])
      : null;

    return el("div.libcard", {}, [
      el("div", {}, [
        el("div.libcard__title", {}, entry.title),
        el("p.note", { style: { margin: "4px 0 0" } }, entry.summary),
      ]),
      el("div.libcard__foot", {}, [
        el("span.note", {}, plural(entry.count, "library.questionsOne", "library.questionsMany")),
        el("div", { style: { display: "flex", gap: "6px", flexWrap: "wrap" } }, [examAction, action].filter(Boolean)),
      ]),
    ]);
  }

  root.appendChild(headerEl);
  root.appendChild(searchWrap);
  root.appendChild(bodyEl);
  paint();
  return { title: t("library.pageTitle"), node: root };
}
