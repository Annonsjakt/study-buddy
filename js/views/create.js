// Create flow: pick material -> provide it -> generate with Claude -> review/edit -> save.

import { store } from "../store.js";
import { el, clear, icon, ICONS, toast, uid } from "../lib/dom.js";
import { renderRich } from "../lib/rich.js";
import { extractPdfText, extractZipText, readImageFile, fitText } from "../material.js";
import { generateAssignment, ClaudeError } from "../claude.js";
import { questionEditor } from "../components/question-editor.js";
import { NATIONAL_TEST_LEVELS, NATIONAL_TEST_SUBJECTS, nationalSubjectName } from "../data/national-tests.js";
import { t, plural } from "../lib/i18n.js";

export function renderCreate(prefill) {
  const root = el("div");
  const prefillSubject = prefill?.get("subject");
  const state = {
    step: "source",           // source | input | generating | review
    source: null,             // paste | pdf | photo | topic | nationalprov
    material: "",
    topic: "",
    image: null,
    gradeHint: "",
    subject: prefillSubject || store.subjects[0]?.name || t("sets.generalSubject"),
    // Locked when the subject was picked via the Nationellt prov source below
    // (or via a ?subject=&lock=1 prefill) — every set for the same exam needs
    // to land under one exact subject name, so it can be found again later by
    // subjectId — see js/data/national-tests.js.
    subjectLocked: !!prefillSubject && prefill?.get("lock") === "1",
    npLevel: null,             // Nationellt prov: chosen nivå id
    npEntry: null,             // Nationellt prov: chosen subject entry
    preferFlashcards: false,
    type: "assignment",
    count: 6,
    doc: null,                // generated + editable
  };

  function steps() {
    const map = [["source", t("create.stepSource")], ["input", t("create.stepMaterial")], ["review", t("create.stepReview")]];
    const activeIdx = state.step === "generating" ? 1 : map.findIndex(([k]) => k === state.step);
    return el("div.steps", {}, map.map(([k, label], i) =>
      el("div", { class: "step" + (i <= activeIdx ? " on" : "") }, [
        el("span.step__n", {}, String(i + 1)), label,
      ])));
  }

  function paint() {
    clear(root);
    root.appendChild(el("div", { style: { display: "flex", alignItems: "center", gap: "12px", marginBottom: "8px" } }, [
      el("a.iconbtn", { href: "#/", "aria-label": "Cancel" }, [icon(ICONS.back, 18)]),
      el("h1", {}, t("create.title")),
    ]));
    root.appendChild(steps());
    root.appendChild(({ source: sourceStep, input: inputStep, generating: generatingStep, review: reviewStep }[state.step])());
  }

  /* ---- step 1: source ---- */
  function sourceStep() {
    const opt = (key, iconPath, label, desc) => el("button.source-opt", {
      type: "button",
      onclick: () => {
        // Leaving the Nationellt prov source: don't leave a stale lock behind.
        if (key !== "nationalprov" && state.subjectLocked) {
          state.subjectLocked = false;
          state.subject = store.subjects[0]?.name || t("sets.generalSubject");
          state.npLevel = null; state.npEntry = null;
        }
        state.source = key; state.step = "input"; paint();
      },
    }, [icon(iconPath, 26), label, el("div.note", { style: { fontWeight: "400", marginTop: "4px" } }, desc)]);

    return el("div.panel", {}, [
      el("p", { style: { marginBottom: "16px" } }, t("create.sourceQuestion")),
      el("div.source-grid", {}, [
        opt("paste", ICONS.pencil, t("create.sourcePaste"), t("create.sourcePasteDesc")),
        opt("pdf", ICONS.fileText, t("create.sourcePdf"), t("create.sourcePdfDesc")),
        opt("photo", ICONS.camera, t("create.sourcePhoto"), t("create.sourcePhotoDesc")),
        opt("topic", ICONS.bulb, t("create.sourceTopic"), t("create.sourceTopicDesc")),
        opt("nationalprov", ICONS.graduation, t("create.sourceNational"), t("create.sourceNationalDesc")),
      ]),
      !store.hasKey() && el("p.note.note--warn", { style: { marginTop: "16px" } }, [
        t("create.needsServerPre"), el("a", { href: "#/settings" }, t("nav.settings")),
        t("create.needsServerPost"),
      ]),
    ]);
  }

  /** A file input that reads a PDF directly, or unpacks every PDF inside a
   *  ZIP (e.g. Skolverket's national-exam downloads) and concatenates their
   *  text — shared by the "Upload PDF" source and the Nationellt prov source. */
  function appendPdfOrZipField(body) {
    const status = el("p.note", { style: { marginTop: "8px" } });
    const input = el("input", {
      type: "file",
      accept: "application/pdf,.pdf,application/zip,application/x-zip-compressed,.zip",
      onchange: async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        status.className = "note";
        status.textContent = t("create.reading"); state.material = "";
        const isZip = /\.zip$/i.test(file.name) || file.type.includes("zip");
        try {
          if (isZip) {
            const { text, pdfCount, totalPdfCount, skippedAudio } = await extractZipText(file);
            state.material = text;
            const noun = plural(totalPdfCount, "create.pdfFile", "create.pdfFiles");
            const audioNote = skippedAudio ? plural(skippedAudio, "create.audioSkippedOne", "create.audioSkippedMany") : "";
            status.textContent = t("create.zipExtracted", { pdfCount, totalPdfCount, name: file.name, noun, audioNote });
          } else {
            state.material = await extractPdfText(file);
            status.textContent = t("create.pdfExtracted", { n: state.material.length.toLocaleString(), name: file.name });
          }
        } catch (err) {
          status.className = "note note--warn";
          status.textContent = err.message || t("create.readError");
        }
      },
    });
    body.appendChild(el("label.field", {}, [el("span", {}, t("create.pdfOrZipLabel")), input]));
    body.appendChild(status);
  }

  /** Where to get the material + existing imported years + "mix all years",
   *  for one chosen Nationellt prov subject entry. */
  function nationalInfoPanel(entry) {
    const name = nationalSubjectName(entry);
    const subject = store.subjects.find((s) => s.name.toLowerCase() === name.toLowerCase());
    const sets = subject ? store.assignments.filter((a) => a.subjectId === subject.id) : [];
    const totalQuestions = sets.reduce((n, a) => n + a.questions.length, 0);

    const extra = [];
    if (sets.length) {
      const countInput = el("input", {
        type: "number", min: "3", max: String(Math.max(3, totalQuestions)),
        value: String(Math.min(15, totalQuestions)), style: { width: "80px" },
      });
      const startBtn = el("button.btn.btn--sm", { type: "button" }, t("create.startMix"));
      startBtn.addEventListener("click", () => {
        const n = Math.max(3, Math.min(+countInput.value || 15, totalQuestions));
        location.hash = `#/national/mix/${subject.id}?count=${n}`;
      });
      extra.push(
        el("p.note", { style: { fontWeight: 700, marginTop: "10px" } },
          plural(sets.length, "create.importedSetsOne", "create.importedSetsMany")),
        el("div", { style: { display: "grid", gap: "4px", marginBottom: "8px" } }, sets.map((a) =>
          el("a", { href: `#/session/${a.id}`, class: "note" },
            plural(a.questions.length, "create.setQuestionsOne", "create.setQuestionsMany", { title: a.title })))),
        el("label.field", { style: { display: "flex", alignItems: "center", gap: "10px", marginBottom: "0" } }, [
          el("span", { style: { fontWeight: 400 } }, t("create.mixAllYears")),
          countInput, startBtn,
        ]),
      );
    }

    return el("div", { style: { border: "1px solid var(--line)", borderRadius: "var(--r-md)", padding: "var(--s-4)", marginTop: "4px" } }, [
      el("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: "10px", flexWrap: "wrap" } }, [
        el("span", {}, [entry.name, el("span.badge", { style: { marginLeft: "8px" } }, entry.kind === "limited" ? t("create.exampleBadge") : t("create.externalBadge"))]),
        el("a.btn.btn--ghost.btn--sm", { href: entry.url, target: "_blank", rel: "noopener noreferrer" }, t("create.getMaterial")),
      ]),
      el("p.note", { style: { margin: "8px 0 0" } },
        entry.kind === "limited" ? t("create.limitedExplain") : t("create.externalExplain")),
      ...extra,
    ]);
  }

  /* ---- step 2: material + options ---- */
  function inputStep() {
    const body = el("div");

    if (state.source === "paste") {
      const ta = el("textarea", { placeholder: t("create.pastePlaceholder"), oninput: (e) => { state.material = e.target.value; } });
      ta.value = state.material;
      body.appendChild(el("label.field", {}, [el("span", {}, t("create.studyMaterialLabel")), ta]));
    }

    if (state.source === "topic") {
      const ti = el("input", { type: "text", placeholder: t("create.topicPlaceholder"), oninput: (e) => { state.topic = e.target.value; } });
      ti.value = state.topic;
      body.appendChild(el("label.field", {}, [el("span", {}, t("create.topicLabel")), ti]));
      const gi = el("input", { type: "text", placeholder: t("create.yearAgePlaceholder"), oninput: (e) => { state.gradeHint = e.target.value; } });
      gi.value = state.gradeHint;
      body.appendChild(el("label.field", {}, [el("span", {}, t("create.yearAgeLabel")), gi]));
    }

    if (state.source === "pdf") appendPdfOrZipField(body);

    if (state.source === "photo") {
      const status = el("p.note", { style: { marginTop: "8px" } });
      const preview = el("div", { style: { marginTop: "10px" } });
      const input = el("input", {
        type: "file",
        accept: "image/*",
        onchange: async (e) => {
          const file = e.target.files[0];
          if (!file) return;
          status.textContent = t("create.reading"); state.image = null; clear(preview);
          try {
            state.image = await readImageFile(file);
            status.textContent = t("create.loaded", { name: file.name });
            preview.appendChild(el("img", { src: state.image.preview, alt: "", style: { maxWidth: "260px", borderRadius: "12px", border: "1px solid var(--line)" } }));
          } catch (err) {
            status.className = "note note--warn";
            status.textContent = err.message || t("create.readError");
          }
        },
      });
      body.appendChild(el("label.field", {}, [el("span", {}, t("create.photoLabel")), input]));
      body.appendChild(status);
      body.appendChild(preview);
    }

    if (state.source === "nationalprov") {
      const levelSel = el("select", {
        onchange: (e) => {
          state.npLevel = e.target.value || null;
          state.npEntry = null; state.subjectLocked = false; state.material = "";
          paint();
        },
      }, [
        el("option", { value: "" }, t("create.levelPlaceholder")),
        ...NATIONAL_TEST_LEVELS.map((lvl) => el("option", { value: lvl.id }, lvl.label)),
      ]);
      levelSel.value = state.npLevel || "";
      body.appendChild(el("label.field", {}, [el("span", {}, t("create.levelLabel")), levelSel]));

      if (state.npLevel) {
        const subjectEntries = NATIONAL_TEST_SUBJECTS.filter((e) => e.level === state.npLevel);
        const subjSel = el("select", {
          onchange: (e) => {
            const entry = subjectEntries.find((s) => s.id === e.target.value) || null;
            state.npEntry = entry;
            state.material = "";
            if (entry) { state.subject = nationalSubjectName(entry); state.subjectLocked = true; }
            else state.subjectLocked = false;
            paint();
          },
        }, [
          el("option", { value: "" }, t("create.subjectPlaceholder")),
          ...subjectEntries.map((s) => el("option", { value: s.id }, s.name)),
        ]);
        subjSel.value = state.npEntry?.id || "";
        body.appendChild(el("label.field", {}, [el("span", {}, t("create.subjectLabel")), subjSel]));
      }

      if (state.npEntry) {
        body.appendChild(nationalInfoPanel(state.npEntry));

        const ta = el("textarea", { placeholder: t("create.pasteExcerptPlaceholder"), oninput: (e) => { state.material = e.target.value; } });
        ta.value = state.material;
        body.appendChild(el("label.field", { style: { marginTop: "12px" } }, [el("span", {}, t("create.pasteTextLabel")), ta]));

        appendPdfOrZipField(body);
      }
    }

    // shared options
    const subjectInput = state.subjectLocked
      ? el("input", { type: "text", value: state.subject, disabled: true })
      : el("input", { type: "text", list: "subject-list", value: state.subject, oninput: (e) => { state.subject = e.target.value; } });
    const datalist = el("datalist", { id: "subject-list" }, store.subjects.map((s) => el("option", { value: s.name })));
    const typeSel = el("select", { onchange: (e) => { state.type = e.target.value; } }, [
      el("option", { value: "assignment" }, t("create.assignmentOption")),
      el("option", { value: "test" }, t("create.testOption")),
    ]);
    typeSel.value = state.type;
    const countInput = el("input", { type: "number", min: "3", max: "15", value: state.count, oninput: (e) => { state.count = Math.max(3, Math.min(15, +e.target.value || 6)); } });
    const flashcardsCheck = el("input", { type: "checkbox", checked: state.preferFlashcards, onchange: (e) => { state.preferFlashcards = e.target.checked; } });

    const err = el("p.note.note--warn", { hidden: true });
    const genBtn = el("button.btn", { type: "button", disabled: !store.hasKey(), onclick: generate }, [icon(ICONS.spark, 18), t("create.generate")]);

    async function generate() {
      const hasInput = state.material.trim() || state.topic.trim() || state.image;
      if (!hasInput) { err.hidden = false; err.textContent = t("create.addMaterialFirst"); return; }
      state.step = "generating"; paint();
      try {
        const doc = await generateAssignment({
          material: state.material ? fitText(state.material) : "",
          topic: state.topic.trim(),
          image: state.image ? { mediaType: state.image.mediaType, data: state.image.data } : null,
          count: state.count,
          gradeHint: state.gradeHint.trim(),
          preferFlashcards: state.preferFlashcards,
        });
        doc.subject = state.subject.trim() || doc.subject || t("sets.generalSubject");
        doc.type = state.type;
        doc.questions = doc.questions.map((q) => ({ ...q, id: uid() }));
        state.doc = doc;
        state.step = "review"; paint();
      } catch (e) {
        state.step = "input"; paint();
        const m = root.querySelector(".note--warn");
        const msg = e instanceof ClaudeError ? e.message : t("create.generationFailed");
        toast(msg);
        if (m) { m.hidden = false; m.textContent = msg; }
      }
    }

    return el("div.panel", {}, [
      body,
      datalist,
      el("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" } }, [
        el("label.field", {}, [
          el("span", {}, t("create.subjectLabel")), subjectInput,
          state.subjectLocked && el("span.note", { style: { display: "block", marginTop: "4px" } }, t("create.subjectLocked")),
        ]),
        el("label.field", {}, [el("span", {}, t("create.typeLabel")), typeSel]),
      ]),
      el("div", { style: { display: "flex", alignItems: "flex-end", gap: "24px", flexWrap: "wrap" } }, [
        el("label.field", { style: { maxWidth: "160px", marginBottom: "0" } }, [el("span", {}, t("create.howManyQuestions")), countInput]),
        el("label", { style: { display: "flex", alignItems: "center", gap: "8px", marginBottom: "var(--s-4)" } }, [
          flashcardsCheck, el("span", {}, t("create.preferFlashcards")),
        ]),
      ]),
      err,
      el("div.nav-row", {}, [
        el("button.btn.btn--ghost", { type: "button", onclick: () => { state.step = "source"; paint(); } }, t("create.back")),
        genBtn,
      ]),
    ]);
  }

  /* ---- generating ---- */
  function generatingStep() {
    return el("div.panel", { style: { textAlign: "center" } }, [
      el("div.spinner"),
      el("p", {}, t("create.writingQuestions")),
      el("p.note", {}, t("create.usuallyTakes")),
    ]);
  }

  /* ---- step 3: review + edit ---- */
  function reviewStep() {
    const doc = state.doc;

    const titleInput = el("input", {
      type: "text", value: doc.title, "aria-label": "Set title",
      oninput: (e) => { doc.title = e.target.value; },
    });
    const subjectInput = state.subjectLocked
      ? el("input", { type: "text", value: doc.subject, "aria-label": "Subject", disabled: true })
      : el("input", {
          type: "text", value: doc.subject, list: "subject-list", "aria-label": "Subject",
          oninput: (e) => { doc.subject = e.target.value; },
        });

    const countNote = el("p.note");
    const editor = questionEditor(doc, {
      onChange: (n) => { countNote.textContent = plural(n, "create.questionCountOne", "create.questionCountMany"); },
    });

    function save() {
      const questions = editor.commit();
      if (!questions.length) { toast(t("create.needQuestion")); return; }
      if (!doc.title.trim()) { toast(t("create.needName")); titleInput.focus(); return; }
      const saved = store.addAssignmentDoc(doc);
      toast(t("create.saved"));
      location.hash = `#/session/${saved.id}`;
    }

    return el("div", {}, [
      el("div.panel", {}, [
        el("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" } }, [
          el("label.field", {}, [el("span", {}, t("create.setTitleLabel")), titleInput]),
          el("label.field", {}, [el("span", {}, t("create.subjectLabel")), subjectInput]),
        ]),
        countNote,
      ]),
      editor.el,
      el("div.nav-row", {}, [
        el("button.btn.btn--ghost", { type: "button", onclick: () => { state.step = "input"; paint(); } }, t("create.back")),
        el("div", { style: { display: "flex", gap: "10px" } }, [
          el("button.btn.btn--ghost", { type: "button", onclick: () => editor.addQuestion() }, t("create.addQuestion")),
          el("button.btn.btn--ok", { type: "button", onclick: save }, [icon(ICONS.check, 18), t("create.saveSet")]),
        ]),
      ]),
    ]);
  }

  paint();
  return { title: t("create.pageTitle"), node: root };
}
