// Settings: tutor server status, model, tutor verbosity, data export/wipe, roadmap.

import { store } from "../store.js";
import { el, clear, toast, icon, ICONS } from "../lib/dom.js";
import { localDayKey } from "../lib/activity.js";
import { PRESETS, DEFAULT_PRESET } from "../claude.js";
import { THEMES, getTheme, setTheme } from "../lib/theme.js";
import { getReadMode, setReadMode } from "../lib/readmode.js";
import { LANGS, getLang, setLang, t, plural } from "../lib/i18n.js";

export function renderSettings() {
  const s = store.settings;

  const presetHint = el("p.note", { style: { marginTop: "6px" } });
  const presetSel = el("select", { "aria-describedby": "preset-hint" },
    Object.entries(PRESETS).map(([k, p]) => opt(k, p.label)));
  presetSel.value = PRESETS[s.preset] ? s.preset : DEFAULT_PRESET;

  const presetDetail = el("div.preset-detail");
  function paintPreset() {
    const p = PRESETS[presetSel.value];
    presetHint.textContent = p.hint;
    clear(presetDetail);
    presetDetail.appendChild(el("table.preset-table", {}, [
      el("tbody", {}, [
        presetRow(t("settings.writingSet"), p.generate, t("settings.oncePerSet")),
        presetRow(t("settings.tutoringYou"), p.tutor, t("settings.everyMessage")),
        presetRow(t("settings.markingAnswers"), p.grade, t("settings.everyWrittenAnswer")),
      ]),
    ]));
  }
  function presetRow(job, model, when) {
    return el("tr", {}, [
      el("th", {}, job),
      el("td", {}, prettyModel(model)),
      el("td.note", {}, when),
    ]);
  }
  presetSel.addEventListener("change", () => {
    store.setSettings({ preset: presetSel.value });
    paintPreset();
    toast(t("settings.presetUpdated"));
  });
  paintPreset();

  const verbSel = el("select", {}, [
    opt("concise", t("settings.concise")),
    opt("normal", t("settings.normalDefault")),
    opt("detailed", t("settings.detailed")),
  ]);
  verbSel.value = s.tutorVerbosity || "normal";
  verbSel.addEventListener("change", () => { store.setSettings({ tutorVerbosity: verbSel.value }); toast(t("settings.tutorStyleUpdated")); });

  const themeSel = el("select", { "aria-label": "Theme" },
    THEMES().map(([v, l]) => opt(v, l)));
  themeSel.value = getTheme();
  themeSel.addEventListener("change", () => { setTheme(themeSel.value); toast(t("settings.themeUpdated")); });

  const langSel = el("select", { "aria-label": t("settings.language") },
    LANGS.map(([v, label]) => opt(v, label)));
  langSel.value = getLang();
  // setLang fires sb:langchange, which re-renders the whole app — so the toast
  // has to be queued after that render, not before it.
  langSel.addEventListener("change", () => {
    const chosen = langSel.value;
    setLang(chosen);
    setTimeout(() => toast(t("settings.langUpdated")), 0);
  });

  const readModeCheck = el("input", { type: "checkbox", id: "readmode-toggle" });
  readModeCheck.checked = getReadMode();
  readModeCheck.addEventListener("change", () => {
    setReadMode(readModeCheck.checked);
    toast(readModeCheck.checked ? t("settings.dyslexiaOn") : t("settings.dyslexiaOff"));
  });

  const node = el("div.settings", {}, [
    el("h1", {}, t("settings.pageHeading")),

    el("section.panel", {}, [
      el("h3", {}, t("settings.appearance")),
      el("label.field", { style: { marginTop: "12px" } }, [
        el("span", {}, t("settings.theme")), themeSel,
      ]),
      el("label.field", { style: { marginBottom: "0" } }, [
        el("span", {}, t("settings.language")), langSel,
      ]),
    ]),

    el("section.panel", {}, [
      el("h3", {}, t("settings.accessibility")),
      el("label", { style: { display: "flex", alignItems: "flex-start", gap: "10px", marginTop: "12px" } }, [
        readModeCheck,
        el("span", {}, [
          el("strong", {}, t("settings.dyslexiaMode")),
          el("p.note", { style: { margin: "2px 0 0" } }, t("settings.dyslexiaExplain")),
        ]),
      ]),
    ]),

    el("section.panel", {}, [
      el("h3", {}, t("settings.tutorServer")),
      el("p.note", { style: { margin: "6px 0 12px" } }, t("settings.tutorServerExplain")),
      el("p.note", { style: { display: "flex", alignItems: "center", gap: "8px" } }, [
        el("span", {
          style: {
            display: "inline-block", width: "8px", height: "8px", borderRadius: "50%",
            background: store.hasKey() ? "var(--c-leaf)" : "var(--retry-ink)",
          },
        }),
        !store.proxyUp ? t("settings.notReachable")
          : !store.proxyKeyConfigured ? t("settings.connectedNoKey")
          : t("settings.connectedLive"),
      ]),
    ]),

    accountSection(),

    el("section.panel", {}, [
      el("h3", {}, t("settings.modelTutor")),
      el("p.note", { style: { margin: "6px 0 12px" } }, t("settings.modelTutorExplain")),
      el("label.field", { style: { marginBottom: "6px" } }, [el("span", {}, t("settings.qualityCost")), presetSel]),
      el("div", { id: "preset-hint" }, [presetHint]),
      presetDetail,
      el("label.field", { style: { marginTop: "16px" } }, [el("span", {}, t("settings.tutorReplyLength")), verbSel]),
    ]),

    demoSection(),

    el("section.panel", {}, [
      el("h3", {}, t("settings.yourData")),
      el("p.note", { style: { margin: "6px 0 12px" } }, store.authed
        ? t("settings.dataLocalSync")
        : t("settings.dataLocalOnly")),
      el("div", { style: { display: "flex", gap: "10px", flexWrap: "wrap" } }, [
        el("button.btn.btn--ghost.btn--sm", { type: "button", onclick: exportData }, t("settings.exportJson")),
        el("button.btn.btn--ghost.btn--sm", { type: "button", style: { color: "var(--retry-ink)" }, onclick: wipe }, t("settings.wipeAll")),
      ]),
    ]),

    el("section.panel", {}, [
      el("h3", { style: { marginBottom: "10px" } }, t("settings.roadmap")),
      el("ul.roadmap", {}, [
        el("li", {}, t("settings.roadmapVoice")),
        el("li", {}, t("settings.roadmapShare")),
      ]),
    ]),

    el("a.btn.btn--ghost", { href: "#/" }, [icon(ICONS.back, 16), t("common.backToMenu")]),
  ]);

  function demoSection() {
    const status = el("p.note", { style: { margin: "6px 0 12px" } });
    const actions = el("div", { style: { display: "flex", gap: "10px", flexWrap: "wrap" } });

    function paint() {
      const { loaded, total } = store.demoStatus;
      status.textContent = loaded === 0
        ? t("settings.demoIntro")
        : loaded < total
          ? t("settings.demoPartial", { loaded, total })
          : t("settings.demoBothIn");

      clear(actions);
      if (loaded < total) {
        actions.appendChild(el("button.btn.btn--sm", {
          type: "button",
          onclick: async (e) => {
            e.currentTarget.disabled = true;
            try {
              const n = await store.loadDemoContent();
              toast(n ? plural(n, "settings.demoAddedOne", "settings.demoAddedMany") : t("settings.demoAlreadyIn"));
            } catch {
              toast(t("settings.demoLoadFailed"));
            }
            paint();
          },
        }, [icon(ICONS.play, 16), loaded ? t("settings.addMissingOne") : t("settings.loadDemoSets")]));
      }
      if (loaded > 0) {
        actions.appendChild(el("button.btn.btn--ghost.btn--sm", {
          type: "button", style: { color: "var(--retry-ink)" },
          onclick: () => {
            if (!confirm(t("settings.removeDemoConfirm"))) return;
            store.removeDemoContent();
            toast(t("settings.demoRemoved"));
            paint();
          },
        }, t("settings.removeDemoSets")));
      }
    }
    paint();

    return el("section.panel", {}, [
      el("h3", {}, t("settings.demoContent")),
      status,
      actions,
    ]);
  }

  function accountSection() {
    const status = el("p.note", { style: { margin: "6px 0 12px" } });
    const actions = el("div", { style: { display: "flex", gap: "10px", flexWrap: "wrap" } });

    function paint() {
      status.textContent = store.authed
        ? t("settings.signedInAs", { email: store.authEmail })
        : t("settings.notSignedIn");

      clear(actions);
      if (store.authed) {
        actions.appendChild(el("button.btn.btn--ghost.btn--sm", {
          type: "button",
          onclick: async (e) => {
            e.currentTarget.disabled = true;
            await store.logout();
            toast(t("account.signOutDone"));
            paint();
          },
        }, t("account.signOut")));
      } else {
        actions.appendChild(el("a.btn.btn--sm", { href: "#/login" }, t("account.signIn")));
      }
      if (store.authed) {
        actions.appendChild(el("a.btn.btn--ghost.btn--sm", { href: "#/parent" }, t("settings.parentLinking")));
      }
    }
    paint();

    return el("section.panel", {}, [
      el("h3", {}, t("settings.account")),
      status,
      actions,
    ]);
  }

  function exportData() {
    const blob = new Blob([store.exportJSON()], { type: "application/json" });
    const a = el("a", { href: URL.createObjectURL(blob), download: `studybuddy-backup-${localDayKey()}.json` });
    document.body.appendChild(a); a.click(); a.remove();
    toast(t("settings.backupDownloaded"));
  }

  function wipe() {
    if (!confirm(t("settings.deleteConfirm"))) return;
    store.wipe();
    toast(t("settings.dataWiped"));
    location.hash = "#/";
  }

  return { title: t("settings.pageHeading"), node };
}

function opt(value, label) { return el("option", { value }, label); }

function prettyModel(id) {
  return ({
    "claude-opus-5": "Claude Opus 5",
    "claude-sonnet-5": "Claude Sonnet 5",
    "claude-haiku-4-5": "Claude Haiku 4.5",
  })[id] || id;
}
