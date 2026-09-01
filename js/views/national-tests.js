// Nationellt prov: välj nivå + ämne, hämta det äkta provmaterialet från
// Skolverket/universiteten (StudyBuddy varken lagrar eller sprider det
// själv), skapa set av det via det vanliga Create-flödet, och blanda
// slumpmässigt mellan alla år man importerat för samma ämne.

import { store } from "../store.js";
import { el, clear, icon, ICONS } from "../lib/dom.js";
import {
  NATIONAL_TESTS_OVERVIEW_URL, NATIONAL_TEST_LEVELS, NATIONAL_TEST_SUBJECTS, nationalSubjectName,
} from "../data/national-tests.js";

export function renderNationalTests() {
  const root = el("div");
  const state = { level: null };

  function paint() {
    clear(root);
    root.appendChild(header());
    root.appendChild(state.level ? subjectList() : levelPicker());
  }

  function header() {
    const backHref = state.level ? null : "#/";
    return el("div", { style: { display: "flex", alignItems: "center", gap: "12px", marginBottom: "8px" } }, [
      state.level
        ? el("button.iconbtn", { type: "button", "aria-label": "Tillbaka", onclick: () => { state.level = null; paint(); } }, [icon(ICONS.back, 18)])
        : el("a.iconbtn", { href: backHref, "aria-label": "Tillbaka" }, [icon(ICONS.back, 18)]),
      el("h1", {}, "Nationellt prov"),
    ]);
  }

  function levelPicker() {
    return el("div.panel", {}, [
      el("p", { style: { marginBottom: "16px" } },
        "Öva inför nationella prov med riktigt gammalt provmaterial. Välj nivå för att se ämnen."),
      el("div.source-grid", {}, NATIONAL_TEST_LEVELS.map((lvl) =>
        el("button.source-opt", { type: "button", onclick: () => { state.level = lvl.id; paint(); } }, [
          el("span", {}, "🎓"), lvl.label,
        ]))),
      el("p.note", { style: { marginTop: "16px" } }, [
        "Materialet kommer direkt från Skolverket och universiteten som ansvarar för de nationella proven — StudyBuddy sparar eller sprider det inte själv. ",
        el("a", { href: NATIONAL_TESTS_OVERVIEW_URL, target: "_blank", rel: "noopener noreferrer" }, "Se hela listan hos Skolverket"),
        ".",
      ]),
    ]);
  }

  function subjectList() {
    const entries = NATIONAL_TEST_SUBJECTS.filter((e) => e.level === state.level);
    return el("div", {}, entries.map((entry) => subjectCard(entry)));
  }

  function subjectCard(entry) {
    const name = nationalSubjectName(entry);
    const subject = store.subjects.find((s) => s.name.toLowerCase() === name.toLowerCase());
    const sets = subject ? store.assignments.filter((a) => a.subjectId === subject.id) : [];
    const totalQuestions = sets.reduce((n, a) => n + a.questions.length, 0);

    const mixArea = el("div", { style: { marginTop: "10px" } });

    function paintMix() {
      clear(mixArea);
      if (!sets.length) return;
      const countInput = el("input", {
        type: "number", min: "3", max: String(Math.max(3, totalQuestions)),
        value: String(Math.min(15, totalQuestions)),
        style: { width: "80px" },
      });
      const startBtn = el("button.btn.btn--sm", { type: "button" }, "Starta");
      startBtn.addEventListener("click", () => {
        const n = Math.max(3, Math.min(+countInput.value || 15, totalQuestions));
        location.hash = `#/national/mix/${subject.id}?count=${n}`;
      });
      mixArea.appendChild(el("label.field", { style: { display: "flex", alignItems: "center", gap: "10px", marginBottom: "0" } }, [
        el("span", { style: { fontWeight: 400 } }, "Blanda alla år — antal frågor:"),
        countInput,
        startBtn,
      ]));
    }
    paintMix();

    return el("section.panel", { style: { marginBottom: "16px" } }, [
      el("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "12px", flexWrap: "wrap" } }, [
        el("div", {}, [
          el("h3", { style: { display: "inline" } }, entry.name),
          el("span.badge", { style: { marginLeft: "8px" } }, entry.kind === "zip" ? "ZIP" : "Extern sida"),
        ]),
        el("a.btn.btn--ghost.btn--sm", { href: entry.url, target: "_blank", rel: "noopener noreferrer" }, "Hämta provmaterial ↗"),
      ]),
      el("p.note", { style: { margin: "8px 0 12px" } },
        entry.kind === "zip"
          ? "Ladda ner, packa upp, och ladda sedan upp PDF:en (eller klistra in texten) nedan."
          : "Öppnar en sida med provmaterial hos ett universitet — hämta det du vill öva på, ladda sedan upp eller klistra in det här."),
      sets.length
        ? el("div", {}, [
            el("p.note", { style: { fontWeight: 700, marginBottom: "6px" } },
              sets.length === 1 ? "1 importerat set" : `${sets.length} importerade set`),
            el("div", { style: { display: "grid", gap: "6px", marginBottom: "10px" } }, sets.map((a) =>
              el("a", { href: `#/session/${a.id}`, class: "note" }, `→ ${a.title} (${a.questions.length} frågor)`))),
          ])
        : el("p.note", {}, "Inga set ännu för det här ämnet."),
      mixArea,
      el("a.btn.btn--sm", { href: `#/create?subject=${encodeURIComponent(name)}&lock=1`, style: { marginTop: "10px", display: "inline-flex" } }, [
        icon(ICONS.plus, 16), "Skapa nytt set från detta prov",
      ]),
    ]);
  }

  paint();
  return { title: "Nationellt prov", node: root };
}
