// Router + persistent app shell.

import { store } from "./store.js";
import { el, clear, mount, icon, ICONS, toast } from "./lib/dom.js";
import { announce, focusHeading } from "./lib/a11y.js";
import { getTheme, setTheme } from "./lib/theme.js";
import { openPopover, closePopover } from "./lib/popover.js";
import { t, plural, LANGS, getLang, setLang, applyLang } from "./lib/i18n.js";
import { renderMenu } from "./views/menu.js";
import { renderCreate } from "./views/create.js";
import { renderEdit } from "./views/edit.js";
import { renderSession, renderReview, renderPractice, renderNationalMix } from "./views/session.js";
import { renderResults } from "./views/results.js";
import { renderProgress } from "./views/progress.js";
import { renderSettings } from "./views/settings.js";
import { renderLogin } from "./views/login.js";
import { renderParentHub, renderParentStudent } from "./views/parent-dashboard.js";
import { renderLibrary } from "./views/library.js";

const app = document.getElementById("app");

const routes = [
  { rx: /^\/?$/, view: () => renderMenu() },
  { rx: /^\/create$/, view: (m, qs) => renderCreate(qs) },
  { rx: /^\/edit\/(.+)$/, view: (m) => renderEdit(m[1]) },
  { rx: /^\/review$/, view: () => renderReview() },
  { rx: /^\/practice\/(.+)$/, view: (m) => renderPractice(m[1]) },
  { rx: /^\/session\/(.+)$/, view: (m, qs) => renderSession(m[1], qs) },
  { rx: /^\/results\/(.+)$/, view: (m) => renderResults(m[1]) },
  { rx: /^\/progress$/, view: () => renderProgress() },
  { rx: /^\/settings$/, view: () => renderSettings() },
  { rx: /^\/login$/, view: () => renderLogin() },
  { rx: /^\/parent$/, view: () => renderParentHub() },
  { rx: /^\/parent\/(.+)$/, view: (m) => renderParentStudent(m[1]) },
  { rx: /^\/national\/mix\/(.+)$/, view: (m, qs) => renderNationalMix(m[1], qs) },
  { rx: /^\/bibliotek$/, view: () => renderLibrary() },
];

let currentCleanup = null;
let firstPaintDone = false;

function parseHash() {
  const full = location.hash.replace(/^#/, "");
  const [path, qs] = full.split("?");
  const params = new URLSearchParams(qs || "");
  for (const r of routes) {
    const m = path.match(r.rx);
    if (m) return () => r.view(m, params);
  }
  return () => renderMenu();
}

function navItems() {
  const items = [
    { href: "#/", match: "/", icon: ICONS.home, label: t("nav.home") },
    { href: "#/bibliotek", match: "/bibliotek", icon: ICONS.book, label: t("nav.library") },
    { href: "#/create", match: "/create", icon: ICONS.plus, label: t("nav.create") },
    { href: "#/progress", match: "/progress", icon: ICONS.chart, label: t("nav.progress") },
  ];
  if (store.authed) items.push({ href: "#/parent", match: "/parent", icon: ICONS.users, label: t("nav.parent") });
  items.push({ href: "#/settings", match: "/settings", icon: ICONS.gear, label: t("nav.settings") });
  return items;
}

function shell(contentNode) {
  const streak = store.streak;
  const path = "/" + (location.hash.replace(/^#\/?/, "").split("?")[0]);
  const isActive = (match) => match === "/" ? (path === "/") : path.startsWith(match);

  const sidebar = el("nav.sidebar", { "aria-label": t("nav.mainMenu") }, [
    el("a.sidebar__brand", { href: "#/" }, [
      el("img", { src: "assets/favicon.svg", alt: "" }),
      "StudyBuddy",
    ]),
    el("div.sidebar__nav", {}, navItems().map((item) =>
      el("a", {
        class: "sidebar__link" + (isActive(item.match) ? " is-active" : ""),
        href: item.href,
        "aria-current": isActive(item.match) ? "page" : null,
      }, [icon(item.icon, 18), item.label]))),
    el("div.sidebar__streak", {
      "aria-label": `${streak} day study streak`,
    }, [
      el("span.sidebar__streak-icon", {}, icon(ICONS.flame, 18)),
      streak > 0 ? t("streak.days", { n: streak }) : t("streak.none"),
    ]),
    themePicker(),
    langPicker(),
  ]);

  return el("div.shell", {}, [
    sidebar,
    el("div.shell__main", {}, [
      el("header.topbar", {}, [
        el("div.topbar__inner", {}, [
          el("a.brand", { href: "#/" }, [
            el("img", { src: "assets/favicon.svg", alt: "" }),
            "StudyBuddy",
          ]),
          el("span.topbar__spacer"),
          el("span.streakbadge", {
            "aria-label": `${streak} day study streak`,
            title: t("streak.days", { n: streak }),
          }, [icon(ICONS.flame, 14), el("span.tabular", {}, String(streak))]),
          el("div.topbar__nav-icons", {}, [
            el("a.iconbtn", { href: "#/bibliotek", "aria-label": t("nav.library"), title: t("nav.library") }, [icon(ICONS.book, 18)]),
            el("a.iconbtn", { href: "#/progress", "aria-label": t("nav.progress"), title: t("nav.progress") }, [icon(ICONS.chart, 18)]),
            store.authed && el("a.iconbtn", { href: "#/parent", "aria-label": t("nav.parent"), title: t("nav.parent") }, [icon(ICONS.users, 18)]),
            el("a.iconbtn", { href: "#/settings", "aria-label": t("nav.settings"), title: t("nav.settings") }, [icon(ICONS.gear, 18)]),
          ].filter(Boolean)),
          topbarActions(),
        ]),
      ]),
      el("main.content", { id: "main" }, [contentNode]),
    ]),
  ]);
}

/** Segmented light/system/dark switcher for the sidebar. Self-painting so a
 *  click doesn't have to re-render the whole shell just to update itself. */
function themePicker() {
  const wrap = el("div.sidebar__theme", { role: "group", "aria-label": t("theme.group") });

  function paint() {
    clear(wrap);
    const current = getTheme();
    const options = [
      ["light", ICONS.sun, t("theme.light")],
      ["system", ICONS.monitor, t("theme.system")],
      ["dark", ICONS.moon, t("theme.dark")],
    ];
    for (const [value, path, label] of options) {
      wrap.appendChild(el("button.sidebar__theme-btn", {
        type: "button",
        "aria-pressed": String(value === current),
        "aria-label": label, title: label,
        onclick: () => { setTheme(value); paint(); },
      }, icon(path, 15)));
    }
  }

  paint();
  return wrap;
}

/** Segmented Swedish/English switcher, right under the theme picker. Firing
 *  setLang() triggers a full app re-render (see the sb:langchange listener
 *  below), so this one doesn't need its own repaint like themePicker does. */
function langPicker() {
  const current = getLang();
  return el("div.sidebar__theme", { role: "group", "aria-label": "Language" },
    LANGS.map(([code, label, flag]) =>
      el("button.sidebar__theme-btn", {
        type: "button",
        "aria-pressed": String(code === current),
        "aria-label": label, title: label,
        html: flag,
        onclick: () => setLang(code),
      })));
}

/** Notification bell + account button, top-right in every topbar (mobile's
 *  full row, and desktop's slim floating pair once the sidebar takes over
 *  brand/nav/streak). Notifications are real signals already in the store —
 *  no fake badge count. */
function topbarActions() {
  const due = store.dueQuestions().length;
  const examDate = store.settings.examDate;
  let examDays = null;
  if (examDate) {
    const target = new Date(examDate + "T00:00:00");
    const today = new Date(); today.setHours(0, 0, 0, 0);
    examDays = Math.round((target - today) / 86400000);
  }
  const examSoon = examDays != null && examDays >= 0 && examDays <= 7;
  const hasNotif = due > 0 || examSoon;

  const bellBtn = el("button.iconbtn.topbar__bell", {
    type: "button", "aria-label": t("topbar.notifications"), "aria-haspopup": "menu", title: t("topbar.notifications"),
    onclick: (e) => {
      e.stopPropagation();
      const items = [];
      if (due > 0) items.push(popoverLink("#/review", ICONS.spark, plural(due, "notif.dueReviewOne", "notif.dueReviewMany")));
      if (examSoon) items.push(popoverLink("#/", ICONS.graduation,
        examDays === 0 ? t("notif.examToday") : examDays === 1 ? t("notif.examTomorrow") : t("notif.examInDays", { n: examDays })));
      if (!items.length) items.push(el("p.note", { style: { padding: "var(--s-2) var(--s-3)" } }, t("notif.none")));
      openPopover(e.currentTarget, items, { align: "right" });
    },
  }, [icon(ICONS.bell, 18), hasNotif ? el("span.topbar__dot") : null].filter(Boolean));

  const profileBtn = el("button.iconbtn.topbar__profile", {
    type: "button", "aria-label": t("topbar.account"), "aria-haspopup": "menu", title: t("topbar.account"),
    onclick: (e) => {
      e.stopPropagation();
      const items = store.authed ? [
        el("p.note", { style: { padding: "var(--s-2) var(--s-3)" } }, t("account.signedInAs", { email: store.authEmail })),
        popoverLink("#/settings", ICONS.gear, t("account.settings")),
        el("button.cardmenu__item.cardmenu__item--danger", {
          type: "button",
          onclick: async () => { closePopover(); await store.logout(); toast(t("account.signOutDone")); },
        }, [icon(ICONS.logout, 15), t("account.signOut")]),
      ] : [
        popoverLink("#/login", ICONS.user, t("account.signIn")),
        popoverLink("#/settings", ICONS.gear, t("account.settings")),
      ];
      openPopover(e.currentTarget, items, { align: "right" });
    },
  }, [icon(ICONS.user, 18)]);

  return el("div.topbar__actions", {}, [bellBtn, profileBtn]);
}

function popoverLink(href, path, label) {
  return el("a.cardmenu__item", { href, onclick: closePopover }, [icon(path, 15), label]);
}

async function render() {
  closePopover();
  if (typeof currentCleanup === "function") { try { currentCleanup(); } catch {} }
  currentCleanup = null;

  const viewFn = parseHash();
  mount(app, shell(el("div", {
    style: { padding: "40px", textAlign: "center", color: "var(--ink-faint)" },
  }, t("common.loading"))));

  try {
    const result = await viewFn();
    const node = result?.node || result;
    currentCleanup = result?.cleanup || null;
    mount(app, shell(node));

    const title = result?.title || "StudyBuddy";
    document.title = result?.title ? `${result.title} · StudyBuddy` : "StudyBuddy";
    window.scrollTo(0, 0);

    // Deliberate focus + a single short announcement, rather than a live
    // region that re-reads the entire page on every navigation.
    if (firstPaintDone) {
      focusHeading(app.querySelector(".content"));
      announce(title);
    }
    firstPaintDone = true;
  } catch (e) {
    console.error(e);
    mount(app, shell(el("div.empty", {}, [
      el("h2", {}, t("common.error")),
      el("p", {}, String(e?.message || e)),
      el("a.btn.btn--ghost", { href: "#/", style: { marginTop: "16px" } }, t("common.backToMenu")),
    ])));
    announce(t("common.error"));
  }
}

window.addEventListener("hashchange", render);
// A language switch re-renders exactly like a navigation.
window.addEventListener("sb:langchange", () => { applyLang(); render(); });

// Offline support + home-screen install. Only over http(s) — a service worker
// can't register from file://, and failing to register is not fatal.
if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch((e) => {
      console.warn("Service worker not registered:", e.message);
    });
  });
}

store.init().then(() => {
  render();
  // After first paint, keep menu/progress fresh when the store changes.
  store.addEventListener("change", () => {
    const h = location.hash.replace(/^#/, "");
    if (h === "" || h === "/" || h === "/progress") render();
  });
  store.addEventListener("syncConflict", () => {
    toast(t("store.syncConflict"));
  });
});
