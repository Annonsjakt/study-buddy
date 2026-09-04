// Language: English / Swedish.
//
// Mirrors lib/theme.js — read straight from localStorage so the page never
// flashes the wrong language, and a change fires an event the router listens
// for. The strings themselves live in lib/strings.js.

import { STRINGS } from "./strings.js";

const KEY = "studybuddy.lang";

// Flag emoji render as bare "GB"/"SE" text on platforms without a color-emoji
// font (stock Windows Chrome included), so these are small inline SVGs
// instead — draws the same everywhere, no font dependency.
const FLAG_GB = '<svg viewBox="0 0 20 14" width="20" height="14" xmlns="http://www.w3.org/2000/svg">' +
  '<rect width="20" height="14" fill="#00247d"/>' +
  '<path d="M0 0L20 14M20 0L0 14" stroke="#fff" stroke-width="2.4" fill="none"/>' +
  '<path d="M0 0L20 14M20 0L0 14" stroke="#cf142b" stroke-width="1.6" fill="none"/>' +
  '<path d="M10 0V14M0 7H20" stroke="#fff" stroke-width="4" fill="none"/>' +
  '<path d="M10 0V14M0 7H20" stroke="#cf142b" stroke-width="2.4" fill="none"/>' +
  '</svg>';
const FLAG_SE = '<svg viewBox="0 0 20 14" width="20" height="14" xmlns="http://www.w3.org/2000/svg">' +
  '<rect width="20" height="14" fill="#006aa7"/>' +
  '<rect x="7" width="3.5" height="14" fill="#fecc02"/>' +
  '<rect y="5.5" width="20" height="3" fill="#fecc02"/>' +
  '</svg>';

export const LANGS = [
  ["sv", "Svenska", FLAG_SE],
  ["en", "English", FLAG_GB],
];
const SUPPORTED = LANGS.map(([code]) => code);
const FALLBACK = "en";

/** Default when the user hasn't chosen. Every bundled set is Swedish
 *  curriculum content, so that's the default regardless of what the browser
 *  reports — not a browser-language guess. */
function detectLang() {
  return "sv";
}

export function getLang() {
  const stored = localStorage.getItem(KEY);
  return SUPPORTED.includes(stored) ? stored : detectLang();
}

/** True when the language came from the browser rather than an explicit choice. */
export function isAutoLang() {
  return !SUPPORTED.includes(localStorage.getItem(KEY));
}

export function applyLang(lang = getLang()) {
  document.documentElement.setAttribute("lang", lang);
}

export function setLang(lang) {
  if (!SUPPORTED.includes(lang)) return;
  localStorage.setItem(KEY, lang);
  applyLang(lang);
  window.dispatchEvent(new CustomEvent("sb:langchange", { detail: { lang } }));
}

/**
 * t("nav.home") -> "Home" (en) / "Hem" (sv)
 * t("session.questionOf", { n: 2, total: 5 }) -> "Question 2 of 5"
 * Falls back sv -> en -> the key itself, so a missing translation degrades to
 * English rather than to a blank or a crash.
 */
export function t(key, vars) {
  const lang = getLang();
  let s = STRINGS[lang]?.[key];
  if (s == null) s = STRINGS[FALLBACK]?.[key];
  if (s == null) {
    console.warn("[i18n] missing string:", key);
    return key;
  }
  if (!vars) return s;
  return s.replace(/\{(\w+)\}/g, (m, name) => (name in vars ? String(vars[name]) : m));
}

/** Picks a singular/plural key and passes {n} through. Both languages are
 *  one-vs-other, so a single rule covers them. */
export function plural(n, oneKey, otherKey, vars = {}) {
  return t(n === 1 ? oneKey : otherKey, { n, ...vars });
}

/* ---------------- AI language ---------------- */

/**
 * Appended to every Claude system prompt. Empty for English so those prompts
 * are byte-identical to before, which keeps them cache-friendly.
 */
export function aiLangInstruction() {
  if (getLang() !== "sv") return "";
  return `

IMPORTANT — LANGUAGE: Write everything you produce in Swedish (svenska). That includes question text, answer choices, model answers, explanations, hints, feedback and your chat replies. Use natural, age-appropriate Swedish for a school pupil. Keep JSON keys and any field names in English exactly as specified — only the human-readable values are in Swedish.`;
}
