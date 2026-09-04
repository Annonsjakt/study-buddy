// Router + persistent app shell.

import { store } from "./store.js";
import { el, mount, icon, ICONS, toast } from "./lib/dom.js";
import { announce, focusHeading } from "./lib/a11y.js";
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

const NAV_ITEMS = [
  { href: "#/", match: "/", icon: ICONS.home, label: "Hem" },
  { href: "#/bibliotek", match: "/bibliotek", icon: ICONS.book, label: "Bibliotek" },
  { href: "#/create", match: "/create", icon: ICONS.plus, label: "Skapa" },
  { href: "#/progress", match: "/progress", icon: ICONS.chart, label: "Framsteg" },
];

function shell(contentNode) {
  const streak = store.streak;
  const path = "/" + (location.hash.replace(/^#\/?/, "").split("?")[0]);
  const isActive = (match) => match === "/" ? (path === "/") : path.startsWith(match);

  const navItems = [...NAV_ITEMS];
  if (store.authed) navItems.push({ href: "#/parent", match: "/parent", icon: ICONS.users, label: "Förälder/lärare" });
  navItems.push({ href: "#/settings", match: "/settings", icon: ICONS.gear, label: "Inställningar" });

  const sidebar = el("nav.sidebar", { "aria-label": "Huvudmeny" }, [
    el("a.sidebar__brand", { href: "#/" }, [
      el("img", { src: "assets/favicon.svg", alt: "" }),
      "StudyBuddy",
    ]),
    el("div.sidebar__nav", {}, navItems.map((item) =>
      el("a", {
        class: "sidebar__link" + (isActive(item.match) ? " is-active" : ""),
        href: item.href,
        "aria-current": isActive(item.match) ? "page" : null,
      }, [icon(item.icon, 18), item.label]))),
    el("div.sidebar__streak" + (streak > 0 ? ".is-active" : ""), {
      "aria-label": `${streak} day study streak`,
    }, [
      el("span.sidebar__streak-icon", {}, icon(ICONS.flame, 15)),
      streak > 0 ? `${streak}-dagars streak` : "Ingen streak än",
    ]),
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
            title: `${streak}-day study streak`,
          }, [icon(ICONS.flame, 14), el("span.tabular", {}, String(streak))]),
          el("div.topbar__nav-icons", {}, [
            el("a.iconbtn", { href: "#/bibliotek", "aria-label": "Övningsbibliotek", title: "Övningsbibliotek" }, [icon(ICONS.book, 18)]),
            el("a.iconbtn", { href: "#/progress", "aria-label": "Progress", title: "Progress" }, [icon(ICONS.chart, 18)]),
            store.authed && el("a.iconbtn", { href: "#/parent", "aria-label": "Parent / teacher", title: "Parent / teacher" }, [icon(ICONS.users, 18)]),
            el("a.iconbtn", { href: "#/settings", "aria-label": "Settings", title: "Settings" }, [icon(ICONS.gear, 18)]),
          ].filter(Boolean)),
        ]),
      ]),
      el("main.content", { id: "main" }, [contentNode]),
    ]),
  ]);
}

async function render() {
  if (typeof currentCleanup === "function") { try { currentCleanup(); } catch {} }
  currentCleanup = null;

  const viewFn = parseHash();
  mount(app, shell(el("div", {
    style: { padding: "40px", textAlign: "center", color: "var(--ink-faint)" },
  }, "Loading…")));

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
      el("h2", {}, "Something went wrong"),
      el("p", {}, String(e?.message || e)),
      el("a.btn.btn--ghost", { href: "#/", style: { marginTop: "16px" } }, "Back to menu"),
    ])));
    announce("Something went wrong.");
  }
}

window.addEventListener("hashchange", render);

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
    toast("Synced from another device — some local changes here were replaced.");
  });
});
