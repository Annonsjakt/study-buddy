// Övningsbiblioteket: välj nivå, sedan ämne, och se bara det ämnets set —
// i stället för att lista allt på en enda lång sida. Fungerar utan
// API-nyckel — allt innehåll är statiska filer.

import { store } from "../store.js";
import { el, clear, icon, ICONS, toast } from "../lib/dom.js";
import { loadLibraryIndex, isImported, importSet } from "../data/library.js";

export async function renderLibrary() {
  let index;
  try {
    index = await loadLibraryIndex();
  } catch (e) {
    return {
      title: "Övningsbibliotek",
      node: el("div.empty", {}, [
        el("h2", {}, "Kunde inte ladda biblioteket"),
        el("p", {}, e.message || "Försök igen om en stund."),
        el("a.btn.btn--ghost", { href: "#/", style: { marginTop: "16px" } }, "Till startsidan"),
      ]),
    };
  }

  const root = el("div");
  const state = { level: null, subject: null, query: "" };

  // Built once so typing never loses focus — paintBody() only ever touches
  // bodyEl, never this input or the header above it.
  const searchInput = el("input.search__input", {
    type: "search",
    placeholder: "Sök i biblioteket — ämne, kurs eller set…",
    "aria-label": "Sök i övningsbiblioteket",
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
        ? el("button.iconbtn", { type: "button", "aria-label": "Tillbaka", onclick: back }, [icon(ICONS.back, 18)])
        : el("a.iconbtn", { href: "#/", "aria-label": "Tillbaka" }, [icon(ICONS.back, 18)]),
      el("h1", {}, "Övningsbibliotek"),
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
      const haystack = [s.title, s.summary, subject?.name, level?.label].filter(Boolean).join(" ").toLowerCase();
      return haystack.includes(q);
    });

    if (!matches.length) {
      return el("div.panel", {}, [
        el("p.note", {}, `Inga träffar för "${state.query.trim()}". Prova ett ämne, en kurs eller en årskurs.`),
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
        el("p.note", { style: { marginBottom: "8px" } }, [level?.label, subject?.name].filter(Boolean).join(" · ")),
        el("div.libgrid", {}, sets.map(setCard)),
      ]);
    });

    return el("div", {}, [
      el("p.note", { style: { marginBottom: "12px" } }, `${matches.length} träff${matches.length === 1 ? "" : "ar"}`),
      ...sections,
    ]);
  }

  /* ---- steg 1: välj nivå ---- */
  function levelPicker() {
    const levels = index.levels.filter((l) => index.subjects.some((s) => s.level === l.id));
    return el("div.panel", {}, [
      el("p", { style: { marginBottom: "16px" } },
        "Färdiga övningar du kan börja plugga på direkt — ingen egen uppladdning behövs. Välj nivå för att se ämnen."),
      el("div.source-grid", {}, levels.map((lvl) =>
        el("button.source-opt", { type: "button", onclick: () => { state.level = lvl.id; paint(); } }, [
          el("span", {}, "🎓"), lvl.label,
        ]))),
    ]);
  }

  /* ---- steg 2: välj ämne ---- */
  function subjectPicker() {
    const level = index.levels.find((l) => l.id === state.level);
    const subjects = index.subjects.filter((s) => s.level === state.level);
    return el("div.panel", {}, [
      el("p", { style: { marginBottom: "16px" } }, `${level?.label} — vilket ämne vill du plugga?`),
      el("div.source-grid", {}, subjects.map((subject) =>
        el("button.source-opt", { type: "button", onclick: () => { state.subject = subject.id; paint(); } }, [
          el("span", {}, "📘"), subject.name,
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
          try { if (await importSet(s)) added++; } catch { /* hoppa över det som strular */ }
        }
        toast(added ? `La till ${added} set` : "Allt fanns redan i ditt bibliotek");
        paint();
      },
    }, [icon(ICONS.plus, 16), `Lägg till alla (${missing.length})`]);

    return el("div", {}, [
      el("section.panel", { style: { marginBottom: "24px" } }, [
        el("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px", flexWrap: "wrap", marginBottom: "6px" } }, [
          el("div", {}, [
            el("h3", {}, subject.name),
            el("p.note", { style: { marginTop: "4px" } }, subject.description),
          ]),
          missing.length ? addAllBtn : el("span.note", {}, "Alla set tillagda ✓"),
        ]),
        el("div.libgrid", {}, sets.map(setCard)),
      ]),
    ]);
  }

  function setCard(entry) {
    const imported = isImported(entry.id);

    const action = imported
      ? el("a.btn.btn--ghost.btn--sm", { href: `#/session/${entry.id}` }, [icon(ICONS.play, 16), "Plugga"])
      : el("button.btn.btn--sm", {
          type: "button",
          onclick: async (e) => {
            e.currentTarget.disabled = true;
            try {
              await importSet(entry);
              toast(`”${entry.title}” tillagt`);
              paint();
            } catch (err) {
              toast(err.message || "Kunde inte lägga till setet");
              e.currentTarget.disabled = false;
            }
          },
        }, [icon(ICONS.plus, 16), "Lägg till"]);

    // Same set, exam conditions: locked tutor, no facit förrän efteråt, med
    // tidtagning — bara tillgängligt när setet redan finns i biblioteket.
    const examAction = imported
      ? el("a.btn.btn--ghost.btn--sm", {
          href: `#/session/${entry.id}?exam=1`,
          title: "Provläge: tidtagning, inga ledtrådar och facit visas först när du är klar.",
        }, [icon(ICONS.clock, 16), "Provläge"])
      : null;

    return el("div.libcard", {}, [
      el("div", {}, [
        el("div.libcard__title", {}, entry.title),
        el("p.note", { style: { margin: "4px 0 0" } }, entry.summary),
      ]),
      el("div.libcard__foot", {}, [
        el("span.note", {}, `${entry.count} frågor`),
        el("div", { style: { display: "flex", gap: "6px", flexWrap: "wrap" } }, [examAction, action].filter(Boolean)),
      ]),
    ]);
  }

  root.appendChild(headerEl);
  root.appendChild(searchWrap);
  root.appendChild(bodyEl);
  paint();
  return { title: "Övningsbibliotek", node: root };
}
