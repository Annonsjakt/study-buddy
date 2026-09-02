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
  const state = { level: null, subject: null };

  function paint() {
    clear(root);
    root.appendChild(header());
    if (!state.level) root.appendChild(levelPicker());
    else if (!state.subject) root.appendChild(subjectPicker());
    else root.appendChild(setList());
  }

  function header() {
    const back = state.subject
      ? () => { state.subject = null; paint(); }
      : state.level
        ? () => { state.level = null; paint(); }
        : null;

    return el("div", { style: { display: "flex", alignItems: "center", gap: "12px", marginBottom: "8px" } }, [
      back
        ? el("button.iconbtn", { type: "button", "aria-label": "Tillbaka", onclick: back }, [icon(ICONS.back, 18)])
        : el("a.iconbtn", { href: "#/", "aria-label": "Tillbaka" }, [icon(ICONS.back, 18)]),
      el("h1", {}, "Övningsbibliotek"),
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

    return el("div.libcard", {}, [
      el("div", {}, [
        el("div.libcard__title", {}, entry.title),
        el("p.note", { style: { margin: "4px 0 0" } }, entry.summary),
      ]),
      el("div.libcard__foot", {}, [
        el("span.note", {}, `${entry.count} frågor`),
        action,
      ]),
    ]);
  }

  paint();
  return { title: "Övningsbibliotek", node: root };
}
