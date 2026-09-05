// Home dashboard: overall level + streak/due at a glance, a resume tile, a
// subject grid, then the Assignments | Tests tabs, filters and card grid.

import { store } from "../store.js";
import { el, append, clear, icon, ICONS, toast } from "../lib/dom.js";
import { masteryByTopic, masteryForAssignment, masteryForSubject } from "../lib/mastery.js";
import { t, plural, getLang } from "../lib/i18n.js";
import { preloadQuestionTranslations, subjectDisplayName } from "../lib/library-content.js";

// Module-level so the choices survive a re-render (e.g. after deleting a set).
let tab = "assignment";
let subjectFilter = "all";
let sortBy = "recent";
let query = "";

export async function renderMenu() {
  // So a set imported back when the app was in Swedish shows its translated
  // title here too, not just once a session has warmed the cache.
  await preloadQuestionTranslations(store.assignments.map((a) => a.id));
  const topicMastery = masteryByTopic(store.attempts);

  const grid = el("div.grid");
  const chipsRow = el("div.chips");
  const subjGrid = el("div.subjgrid");
  const countLabel = el("p.note");

  const searchInput = el("input.search__input", {
    type: "search", placeholder: t("sets.searchPlaceholder"), value: query,
    "aria-label": t("sets.searchPlaceholder"),
    oninput: (e) => { query = e.target.value; paint(); },
  });
  const searchWrap = el("div.search", {}, [icon(ICONS.search, 16), searchInput]);

  const SORTS = [
    ["recent", t("sets.sortNewest")],
    ["name", t("sets.sortAZ")],
    ["weakest", t("sets.sortWeakest")],
  ];
  const sortSel = el("select.sortsel", {
    "aria-label": "Sort sets",
    onchange: (e) => { sortBy = e.target.value; paint(); },
  }, SORTS.map(([v, l]) => el("option", { value: v }, l)));
  sortSel.value = sortBy;

  const toolsRow = el("div.tools", {}, [searchWrap, sortSel]);

  /* ---------------- painting ---------------- */

  function matchesQuery(a, q) {
    const subject = subjectDisplayName(store.subjects.find((s) => s.id === a.subjectId)?.name || "");
    return (a.title + " " + subject + " " + (a.topics || []).join(" ")).toLowerCase().includes(q);
  }

  function visibleSets() {
    const q = query.trim().toLowerCase();
    let items = store.assignments.filter((a) => a.type === tab);
    if (subjectFilter !== "all") items = items.filter((a) => a.subjectId === subjectFilter);
    if (q) items = items.filter((a) => matchesQuery(a, q));
    if (sortBy === "name") items = [...items].sort((x, y) => x.title.localeCompare(y.title));
    else if (sortBy === "weakest") {
      // Lowest known mastery first. A set you've never studied has *unknown*
      // mastery, not zero, so it sorts after the ones you're measurably weak at.
      items = [...items].sort((x, y) =>
        (masteryForAssignment(x, topicMastery) ?? Infinity) - (masteryForAssignment(y, topicMastery) ?? Infinity));
    } else items = [...items].sort((x, y) => (y.createdAt || 0) - (x.createdAt || 0));
    return items;
  }

  function paint() {
    paintSubjectGrid();

    // subject chips, limited to subjects present in this tab
    clear(chipsRow);
    const inTab = store.assignments.filter((a) => a.type === tab);
    chipsRow.appendChild(chip(t("sets.chipAll"), "all", null));
    for (const s of store.subjects) {
      if (!inTab.some((a) => a.subjectId === s.id)) continue;
      chipsRow.appendChild(chip(subjectDisplayName(s.name), s.id, store.subjectColor(s.id)));
    }
    if (subjectFilter !== "all" && !inTab.some((a) => a.subjectId === subjectFilter)) {
      subjectFilter = "all";
    }
    chipsRow.hidden = chipsRow.children.length <= 1;

    // Search + sort only earn their space once there's enough to sift through —
    // but never hide them while a query is active, or the filter becomes
    // invisible state the student can't see or clear.
    toolsRow.hidden = inTab.length < 5 && !query.trim();

    const items = visibleSets();
    clear(grid);
    grid.appendChild(newCard());
    for (const a of items) grid.appendChild(card(a, topicMastery));

    // A search that misses in this tab but hits in the other is a dead end
    // unless we say so — the set the student wants is one click away.
    clear(countLabel);
    const q = query.trim().toLowerCase();
    if (q && !items.length) {
      const otherTab = tab === "assignment" ? "test" : "assignment";
      const otherHits = store.assignments.filter((a) => a.type === otherTab && matchesQuery(a, q)).length;
      const tabNoun = tab === "assignment" ? t("sets.assignmentsNoun") : t("sets.testsNoun");
      countLabel.appendChild(document.createTextNode(t("sets.noMatch", { tab: tabNoun, query: query.trim() })));
      if (otherHits) {
        const otherNoun = otherTab === "assignment" ? t("sets.assignmentsNoun") : t("sets.testsNoun");
        const target = otherTab === "assignment" ? t("sets.tabAssignments") : t("sets.tabTests");
        countLabel.appendChild(el("button.linkbtn", {
          type: "button",
          onclick: () => {
            tab = otherTab;
            tabsEl.querySelectorAll(".tab").forEach((b, i) =>
              b.setAttribute("aria-selected", String((i === 0 ? "assignment" : "test") === tab)));
            paint();
          },
        }, t("sets.matchSwitch", { n: otherHits, tab: otherNoun, target })));
      }
    }
    countLabel.hidden = !q || !!items.length;

    if (!items.length && !q) grid.appendChild(emptyState());
  }

  /** One coloured card per subject you actually have sets in: how strong you
   *  are in it, and how much of it there is. Doubles as the subject filter. */
  function paintSubjectGrid() {
    clear(subjGrid);
    const rows = store.subjects
      .map((s) => {
        const sets = store.assignments.filter((a) => a.subjectId === s.id);
        if (!sets.length) return null;
        return {
          subject: s,
          sets: sets.length,
          questions: sets.reduce((n, a) => n + a.questions.length, 0),
          mastery: masteryForSubject(s.id, store.assignments, topicMastery),
          color: store.subjectColor(s.id),
        };
      })
      .filter(Boolean)
      .sort((a, b) => (a.mastery ?? Infinity) - (b.mastery ?? Infinity));

    for (const r of rows) subjGrid.appendChild(subjectCard(r));
    subjGrid.hidden = !rows.length;
  }

  function subjectCard({ subject, sets, questions, mastery, color }) {
    const pct = mastery == null ? null : Math.round(mastery * 100);
    const selected = subjectFilter === subject.id;

    return el("button.subjcard", {
      type: "button",
      "aria-pressed": String(selected),
      style: { "--subject": color.solid, "--subject-ink": color.ink, "--subject-tint": color.tint },
      "aria-label": `${subjectDisplayName(subject.name)}: ${sets} set${sets === 1 ? "" : "s"}, ${questions} questions${pct == null ? ", not studied yet" : `, ${pct}% mastery`}`,
      onclick: () => {
        // Toggle off if it's already the active filter; otherwise select it —
        // and follow the subject into the tab where its sets actually live.
        subjectFilter = selected ? "all" : subject.id;
        if (!selected) {
          const inThisTab = store.assignments.some((a) => a.subjectId === subject.id && a.type === tab);
          if (!inThisTab) {
            tab = tab === "assignment" ? "test" : "assignment";
            tabsEl.querySelectorAll(".tab").forEach((b, i) =>
              b.setAttribute("aria-selected", String((i === 0 ? "assignment" : "test") === tab)));
          }
        }
        paint();
      },
    }, [
      el("div.subjcard__top", {}, [
        el("span.subjcard__name", {}, subjectDisplayName(subject.name)),
        el("span.subjcard__pct", {}, pct == null ? "–" : `${pct}%`),
      ]),
      el("div.subjcard__bar", {}, [
        el("div.subjcard__fill", { style: { width: `${pct ?? 0}%` } }),
      ]),
      el("div.subjcard__meta", {}, `${plural(sets, "sets.setCount", "sets.setsCount")} · ${plural(questions, "sets.questionCount", "sets.questionsCount")}`),
    ]);
  }

  function chip(label, value, color) {
    return el("button.chip", {
      type: "button",
      "aria-pressed": String(subjectFilter === value),
      onclick: () => { subjectFilter = value; paint(); },
      style: color ? { "--subject": color.solid, "--subject-ink": color.ink } : {},
    }, [color && el("span.chip__dot"), label].filter(Boolean));
  }

  function card(a, tm) {
    const color = store.subjectColor(a.subjectId);
    const subject = store.subjects.find((s) => s.id === a.subjectId);
    const m = masteryForAssignment(a, tm);
    const attempts = store.attempts.filter((x) => x.assignmentId === a.id).length;
    const open = store.getSession(a.id);
    const openCount = open ? Object.keys(open.items || {}).length : 0;

    const menuBtn = el("button.acard__menu", {
      type: "button", "aria-label": `Options for ${a.title}`, "aria-haspopup": "menu",
      onclick: (e) => { e.stopPropagation(); openCardMenu(e.currentTarget, a); },
    }, [icon(ICONS.dots, 18)]);

    return el("div.acard", {
      role: "button", tabindex: "0",
      style: { "--subject": color.solid, "--subject-ink": color.ink, "--subject-tint": color.tint },
      "aria-label": `${a.title}, ${subjectDisplayName(subject?.name) || "General"}, ${a.questions.length} questions${open ? ", in progress" : ""}`,
      onclick: () => { location.hash = `#/session/${a.id}`; },
      onkeydown: (e) => {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); location.hash = `#/session/${a.id}`; }
      },
    }, [
      menuBtn,
      el("div", { style: { display: "flex", gap: "6px", flexWrap: "wrap", paddingRight: "28px" } }, [
        el("span.acard__tag", {}, subjectDisplayName(subject?.name) || t("sets.generalSubject")),
        open && el("span.acard__tag.acard__tag--open", {}, t("sets.inProgress")),
      ].filter(Boolean)),
      el("div.acard__title", {}, a.title),
      el("div.acard__meta", {}, [
        el("span", {}, open
          ? t("sets.answeredProgress", { answered: openCount, total: a.questions.length })
          : plural(a.questions.length, "sets.questionCount", "sets.questionsCount") + (attempts ? t("sets.doneTimes", { n: attempts }) : "")),
        m == null ? el("span", { style: { color: "var(--subject)" }, "aria-hidden": "true" }, icon(ICONS.arrow, 18))
          : ring(m, color.solid),
      ]),
    ]);
  }

  function newCard() {
    return el("button.acard.acard--new", {
      type: "button",
      onclick: () => { location.hash = "#/create"; },
    }, [icon(ICONS.plus, 22), tab === "assignment" ? t("sets.newAssignment") : t("sets.newTest")]);
  }

  function emptyState() {
    const isFirstRun = !store.assignments.length;
    return el("div.empty", { style: { gridColumn: "1 / -1" } }, [
      icon(ICONS.spark, 26),
      el("h3", { style: { marginBottom: "6px" } },
        isFirstRun ? t("empty.libraryTitle") : tab === "assignment" ? t("empty.noAssignments") : t("empty.noTests")),
      el("p", {}, isFirstRun
        ? t("empty.libraryBody")
        : tab === "assignment" ? t("empty.assignmentBody") : t("empty.testBody")),
      el("div", { style: { display: "flex", gap: "10px", justifyContent: "center", marginTop: "16px", flexWrap: "wrap" } }, [
        isFirstRun && el("a.btn", { href: "#/bibliotek" }, [icon(ICONS.book, 18), t("empty.openLibrary")]),
        el("a", { class: isFirstRun ? "btn btn--ghost" : "btn", href: "#/create" }, [icon(ICONS.plus, 18), t("menu.newSet")]),
        isFirstRun && store.demoStatus.loaded === 0 && el("button.btn.btn--ghost", {
          type: "button",
          onclick: async (e) => {
            e.currentTarget.disabled = true;
            try { await store.loadDemoContent(); toast(t("empty.demoAdded")); }
            catch { toast(t("empty.demoFailed")); e.currentTarget.disabled = false; }
          },
        }, [icon(ICONS.play, 16), t("empty.tryDemo")]),
      ].filter(Boolean)),
    ]);
  }

  /* ---------------- card ⋮ menu ---------------- */

  function openCardMenu(anchor, a) {
    closeCardMenu();
    const menu = el("div.cardmenu", { role: "menu" }, [
      item(ICONS.clock, t("cardmenu.examMode"), () => { location.hash = `#/session/${a.id}?exam=1`; }),
      item(ICONS.pencil, t("cardmenu.rename"), () => rename(a)),
      item(ICONS.chart, t("cardmenu.editQuestions"), () => { location.hash = `#/edit/${a.id}`; }),
      item(ICONS.copy, t("cardmenu.duplicate"), () => {
        const copy = store.duplicateAssignment(a.id);
        if (copy) toast(t("cardmenu.copiedAs", { title: copy.title }));
      }),
      item(ICONS.trash, t("cardmenu.delete"), () => remove(a), true),
    ]);

    function item(path, label, fn, danger) {
      return el("button.cardmenu__item", {
        type: "button", role: "menuitem",
        class: danger ? "cardmenu__item--danger" : "",
        onclick: (e) => { e.stopPropagation(); closeCardMenu(); fn(); },
      }, [icon(path, 15), label]);
    }

    const r = anchor.getBoundingClientRect();
    menu.style.top = `${r.bottom + window.scrollY + 4}px`;
    menu.style.left = `${Math.min(r.left + window.scrollX, window.innerWidth - 190)}px`;
    document.body.appendChild(menu);
    menu.querySelector("button")?.focus();

    setTimeout(() => {
      document.addEventListener("click", closeCardMenu, { once: true });
      document.addEventListener("keydown", escClose);
    }, 0);
  }

  function escClose(e) { if (e.key === "Escape") closeCardMenu(); }

  function closeCardMenu() {
    document.querySelectorAll(".cardmenu").forEach((m) => m.remove());
    document.removeEventListener("keydown", escClose);
  }

  function rename(a) {
    const next = prompt(t("cardmenu.renamePrompt"), a.title);
    if (next == null) return;
    const clean = next.trim();
    if (!clean) { toast(t("cardmenu.renameNeedsName")); return; }
    if (clean === a.title) return;
    store.updateAssignment(a.id, { title: clean });
    toast(t("cardmenu.renamed"));
  }

  function remove(a) {
    const attempts = store.attempts.filter((x) => x.assignmentId === a.id).length;
    const extra = attempts ? t(attempts === 1 ? "cardmenu.deleteExtra" : "cardmenu.deleteExtraMany", { n: attempts }) : "";
    if (!confirm(t("cardmenu.deleteConfirm", { title: a.title, extra }))) return;
    store.deleteAssignment(a.id);
    toast(t("cardmenu.deleted"));
  }

  /* ---------------- header + today strip ---------------- */

  const tabsEl = el("div.tabs", { role: "tablist" }, [
    tabBtn(t("sets.tabAssignments"), "assignment"),
    tabBtn(t("sets.tabTests"), "test"),
  ]);
  function tabBtn(label, value) {
    return el("button.tab", {
      role: "tab", "aria-selected": String(tab === value),
      onclick: () => {
        tab = value;
        tabsEl.querySelectorAll(".tab").forEach((b, i) =>
          b.setAttribute("aria-selected", String((i === 0 ? "assignment" : "test") === value)));
        paint();
      },
    }, label);
  }

  paint();

  const node = el("div.home", {}, [
    el("div.home__main", {}, [
      el("div.home__head", {}, [
        el("div", {}, [
          el("h1", {}, greeting()),
          el("p.home__hi", {}, store.hasKey() ? t("menu.hintLive") : t("menu.hintDemo")),
        ]),
        el("a.btn", { href: "#/create" }, [icon(ICONS.plus, 18), t("menu.newSet")]),
      ]),
      dashRow(topicMastery),
      todayStrip(),
      subjGrid,
      el("section.panel.setspanel", {}, [
        el("h3", { style: { marginBottom: "var(--s-4)" } }, t("sets.heading")),
        el("div.setsrow", {}, [tabsEl, toolsRow]),
        chipsRow,
        countLabel,
        grid,
      ]),
    ]),
    el("aside.home__aside", {}, [examCard(), tipCard()]),
  ]);

  return { title: t("menu.pageTitle"), node, cleanup: closeCardMenu };
}

/** The top of the dashboard: how strong you are overall, your streak, and
 *  what's waiting to be reviewed — the three numbers worth seeing first. */
function dashRow(topicMastery) {
  const vals = Object.values(topicMastery);
  const overall = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
  const due = store.dueQuestions().length;
  const streak = store.streak;
  const sessions = store.attempts.length;

  const hero = el("div.dash__card.dash__card--hero", {}, [
    overall == null
      ? el("span.dash__icon.dash__icon--brand", { style: { width: "72px", height: "72px" } }, icon(ICONS.spark, 28))
      : ring(overall, "var(--brand)", "ring--lg"),
    el("div", {}, [
      el("div.dash__label", {}, overall == null ? t("dash.noResults") : t("dash.overallMastery")),
      el("div.dash__value", {}, overall == null ? t("dash.startStudying") : `${Math.round(overall * 100)}%`),
      el("p.note.dash__hero-note", {}, overall == null
        ? t("dash.heroHintEmpty")
        : t("dash.heroHint", {
            topics: plural(vals.length, "dash.topic", "dash.topics"),
            sessions: plural(sessions, "dash.session", "dash.sessions"),
          })),
    ]),
  ]);

  // Value-then-caption here, unlike the hero's label-then-value above — these
  // labels are full sentences ("Due now — tap to review"), not a short
  // eyebrow, so they read as a caption under the number rather than a
  // heading above it (and stay short-and-uppercase-free, since an all-caps
  // sentence reads as shouting).
  const streakCard = el("a.dash__card", { href: "#/progress" }, [
    el("span.dash__icon", {}, icon(ICONS.flame, 20)),
    el("div", {}, [
      el("div.dash__value", {}, String(streak)),
      el("div.dash__label", {}, streak > 0 ? t(streak === 1 ? "dash.dayStreak" : "dash.daysStreak") : t("dash.streakEmpty")),
    ]),
  ]);

  const dueCard = el("a.dash__card", { href: due ? "#/review" : "#/progress" }, [
    el("span", { class: "dash__icon" + (due ? " dash__icon--brand" : "") }, icon(ICONS.spark, 20)),
    el("div", {}, [
      el("div.dash__value", {}, String(due)),
      el("div.dash__label", {}, due ? t("dash.dueNow") : t("dash.dueForReview")),
    ]),
  ]);

  return el("div.dash", {}, [hero, streakCard, dueCard]);
}

/** The session you walked away from — the one thing worth a full-width nudge. */
function todayStrip() {
  const openKey = Object.keys(store.state.sessions)[0];
  const open = openKey ? store.state.sessions[openKey] : null;
  const tiles = [];

  if (open) {
    const answered = Object.keys(open.items || {}).length;
    tiles.push(el("a.tile.tile--accent", { href: open.retryHash || (open.isReview ? "#/review" : `#/session/${open.assignmentId}`) }, [
      el("span.tile__icon", {}, icon(ICONS.play, 18)),
      el("span", {}, [
        el("strong", {}, t("today.continue")),
        el("span.tile__sub", {}, t("today.progress", { title: open.title, n: answered, total: open.order.length })),
      ]),
    ]));
  }

  const strip = el("div.today", {}, tiles);
  strip.hidden = !tiles.length;
  return strip;
}

function ring(v, color, extraClass) {
  const pct = Math.round(v * 100);
  const wrap = el("span.ring", {
    class: extraClass || "",
    style: { "--v": pct, "--subject": color },
    title: `${pct}% mastery — how well you've been answering these topics`,
  });
  wrap.innerHTML =
    `<svg viewBox="0 0 36 36" aria-hidden="true">` +
    `<circle class="ring__bg" cx="18" cy="18" r="15.9"/>` +
    `<circle class="ring__fg" cx="18" cy="18" r="15.9" pathLength="100" transform="rotate(-90 18 18)"/>` +
    `<text class="ring__label" x="18" y="18" text-anchor="middle" dominant-baseline="central">${pct}</text>` +
    `</svg>`;
  return wrap;
}

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? t("greeting.morning") : h < 18 ? t("greeting.afternoon") : t("greeting.evening");
}

/** Right-rail card: a countdown to whatever exam the student is aiming at
 *  (a real nationellt prov date, or anything else they type in). Self-paints
 *  so opening/closing the edit form never triggers a full menu re-render. */
function examCard() {
  const wrap = el("div.panel.examcard");
  let editing = !store.settings.examDate;

  function paint() {
    clear(wrap);
    const { examDate, examLabel } = store.settings;

    if (editing) {
      const dateInput = el("input", { type: "date", value: examDate || "" });
      const labelInput = el("input", {
        type: "text", maxlength: "60", value: examLabel || "",
        placeholder: t("examcard.aboutPlaceholder"),
      });
      append(wrap, [
        el("h3", {}, t("examcard.title")),
        el("div.field", {}, [el("span", {}, t("examcard.date")), dateInput]),
        el("div.field", {}, [el("span", {}, t("examcard.about")), labelInput]),
        el("div", { style: { display: "flex", gap: "6px" } }, [
          el("button.btn.btn--sm", {
            type: "button",
            onclick: () => {
              if (!dateInput.value) { toast(t("examcard.pickDateFirst")); return; }
              store.setSettings({ examDate: dateInput.value, examLabel: labelInput.value.trim() });
              editing = false;
              paint();
            },
          }, t("examcard.save")),
          examDate ? el("button.btn.btn--ghost.btn--sm", {
            type: "button", onclick: () => { editing = false; paint(); },
          }, t("examcard.cancel")) : null,
        ].filter(Boolean)),
      ]);
      return;
    }

    const days = daysUntil(examDate);
    const caption = [formatExamDate(examDate), examLabel || null].filter(Boolean).join(" · ");
    append(wrap, [
      el("div.examcard__top", {}, [
        el("h3", {}, t("examcard.title")),
        el("button.linkbtn", { type: "button", onclick: () => { editing = true; paint(); } }, t("examcard.change")),
      ]),
      el("div.examcard__row", {}, [
        el("span.examcard__icon", {}, icon(ICONS.graduation, 16)),
        el("div", {}, [
          el("div.examcard__value", {}, countdownLabel(days)),
          el("p.note.examcard__caption", {}, caption),
        ]),
      ]),
    ]);
  }

  paint();
  return wrap;
}

function daysUntil(dateStr) {
  const target = new Date(dateStr + "T00:00:00");
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((target - today) / 86400000);
}

function countdownLabel(days) {
  if (days < 0) return t("examcard.past");
  if (days === 0) return t("examcard.today");
  if (days === 1) return t("examcard.tomorrow");
  return t("examcard.daysLeft", { n: days });
}

function formatExamDate(dateStr) {
  const d = new Date(dateStr + "T00:00:00");
  const locale = getLang() === "sv" ? "sv-SE" : "en-GB";
  return d.toLocaleDateString(locale, { day: "numeric", month: "long", year: "numeric" });
}

const TIP_COUNT = 7;

/** Deterministic per calendar day, so it doesn't change on every reload. */
function tipCard() {
  const dayIndex = Math.floor(Date.now() / 86400000);
  const tip = t(`tips.${dayIndex % TIP_COUNT}`);
  return el("div.panel", {}, [
    el("h3", { style: { marginBottom: "8px" } }, t("tips.heading")),
    el("p.note", {}, tip),
  ]);
}
