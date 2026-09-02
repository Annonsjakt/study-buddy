// Övningsbiblioteket: bläddra bland färdiga set per årskurs och ämne och
// lägg till dem i sitt eget bibliotek. Fungerar utan API-nyckel — allt
// innehåll är statiska filer.

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

  function paint() {
    clear(root);
    root.appendChild(el("div", { style: { display: "flex", alignItems: "center", gap: "12px", marginBottom: "8px" } }, [
      el("a.iconbtn", { href: "#/", "aria-label": "Tillbaka" }, [icon(ICONS.back, 18)]),
      el("h1", {}, "Övningsbibliotek"),
    ]));
    root.appendChild(el("p.home__hi", { style: { marginBottom: "24px" } },
      "Färdiga övningar du kan börja plugga på direkt — ingen egen uppladdning behövs. Lägg till ett set så hamnar det i ditt bibliotek."));

    for (const level of index.levels) {
      const subjects = index.subjects.filter((s) => s.level === level.id);
      if (!subjects.length) continue;
      root.appendChild(el("h2", { style: { margin: "8px 0 12px" } }, level.label));
      for (const subject of subjects) root.appendChild(subjectSection(subject));
    }
  }

  function subjectSection(subject) {
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

    return el("section.panel", { style: { marginBottom: "24px" } }, [
      el("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px", flexWrap: "wrap", marginBottom: "6px" } }, [
        el("div", {}, [
          el("h3", {}, subject.name),
          el("p.note", { style: { marginTop: "4px" } }, subject.description),
        ]),
        missing.length ? addAllBtn : el("span.note", {}, "Alla set tillagda ✓"),
      ]),
      el("div.libgrid", {}, sets.map(setCard)),
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
