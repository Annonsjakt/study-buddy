// Typeface + text-size, applied as data-font / data-textsize on <html>.
// Mirrors js/lib/theme.js — read from localStorage at startup (index.html
// bootstrap) so the page never flashes the wrong type.

const FONT_KEY = "studybuddy.font";
const SIZE_KEY = "studybuddy.textSize";
const DYSLEXIA_KEY = "studybuddy.dyslexia";

export const FONTS = [
  ["system", "Default"],
  ["hyperlegible", "Hyperlegible (easier to read)"],
];
export const TEXT_SIZES = [
  ["s", "Small"],
  ["m", "Medium"],
  ["l", "Large"],
];

export function getFont() {
  const f = localStorage.getItem(FONT_KEY);
  return f === "hyperlegible" ? f : "system";
}
export function getTextSize() {
  const s = localStorage.getItem(SIZE_KEY);
  return ["s", "m", "l"].includes(s) ? s : "m";
}
export function getDyslexiaMode() {
  return localStorage.getItem(DYSLEXIA_KEY) === "1";
}

export function applyTypeface(font = getFont(), size = getTextSize()) {
  const root = document.documentElement;
  root.setAttribute("data-font", font);
  root.setAttribute("data-textsize", size);
  root.setAttribute("data-dyslexia", getDyslexiaMode() ? "1" : "0");
}

export function setFont(font) {
  localStorage.setItem(FONT_KEY, font);
  applyTypeface();
}
export function setTextSize(size) {
  localStorage.setItem(SIZE_KEY, size);
  applyTypeface();
}

/** One switch that reaches for the two settings with the clearest effect
 *  (Hyperlegible + Large) and adds the extra line/letter spacing neither of
 *  those covers on its own (see tokens.css). Turning it off only drops the
 *  spacing — font and size stay put, exactly like every other control here,
 *  so a student who prefers Hyperlegible isn't forced back to Default. */
export function setDyslexiaMode(on) {
  localStorage.setItem(DYSLEXIA_KEY, on ? "1" : "0");
  if (on) {
    localStorage.setItem(FONT_KEY, "hyperlegible");
    localStorage.setItem(SIZE_KEY, "l");
  }
  applyTypeface();
}
