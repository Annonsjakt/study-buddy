// Sign in / create an account. Optional — StudyBuddy works fully signed out;
// this only turns on syncing the same library across devices.

import { store } from "../store.js";
import { el, toast, icon, ICONS } from "../lib/dom.js";
import { t } from "../lib/i18n.js";

export function renderLogin() {
  let mode = "login"; // | "signup"

  const emailInput = el("input", { type: "email", autocomplete: "email", placeholder: "you@example.com" });
  const passInput = el("input", { type: "password", placeholder: "••••••••" });
  const errorNote = el("p.note.note--warn", { style: { display: "none" } });
  const submitBtn = el("button.btn", { type: "submit" }, t("login.signIn"));
  const toggleBtn = el("button.btn.btn--ghost.btn--sm", { type: "button" }, "");

  function paintMode() {
    submitBtn.textContent = mode === "login" ? t("login.signIn") : t("login.createAccount");
    toggleBtn.textContent = mode === "login" ? t("login.needAccount") : t("login.haveAccount");
    passInput.autocomplete = mode === "login" ? "current-password" : "new-password";
    passInput.placeholder = mode === "login" ? "••••••••" : t("login.atLeast8");
  }

  toggleBtn.addEventListener("click", () => {
    mode = mode === "login" ? "signup" : "login";
    errorNote.style.display = "none";
    paintMode();
  });

  async function submit(e) {
    e.preventDefault();
    const email = emailInput.value.trim();
    const password = passInput.value;
    if (!email || !password) return;

    submitBtn.disabled = true;
    errorNote.style.display = "none";
    try {
      if (mode === "login") await store.login(email, password);
      else await store.signup(email, password);
      toast(mode === "login" ? t("login.signedIn") : t("login.accountCreated"));
      location.hash = "#/settings";
    } catch (err) {
      errorNote.textContent = err.message || t("login.somethingWrong");
      errorNote.style.display = "";
    } finally {
      submitBtn.disabled = false;
    }
  }
  paintMode();

  const form = el("form", { onsubmit: submit }, [
    el("label.field", {}, [el("span", {}, t("login.email")), emailInput]),
    el("label.field", {}, [el("span", {}, t("login.password")), passInput]),
    errorNote,
    el("div", { style: { display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "center" } }, [submitBtn, toggleBtn]),
  ]);

  const node = el("div.settings", {}, [
    el("h1", {}, t("login.pageHeading")),
    el("section.panel", {}, [
      el("p.note", { style: { margin: "0 0 16px" } }, t("login.intro")),
      form,
    ]),
    !store.proxyUp && el("p.note", {}, t("login.backendDown")),
    el("a.btn.btn--ghost", { href: "#/settings" }, [icon(ICONS.back, 16), t("login.backToSettings")]),
  ]);

  return { title: t("login.pageTitle"), node };
}
