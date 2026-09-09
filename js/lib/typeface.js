// Typeface + text-size, applied as data-font / data-textsize on <html>.
// Mirrors js/lib/theme.js — read from localStorage at startup (index.html
// bootstrap) so the page never flashes the wrong type.

const FONT_KEY = "studybuddy.font";
const SIZE_KEY = "studybuddy.textSize";
const DYSLEXIA_KEY = "studybuddy.dyslexia";
const PREV_FONT_KEY = "studybuddy.dyslexia.prevFont";
const PREV_SIZE_KEY = "studybuddy.dyslexia.prevSize";

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
 *  those covers on its own (see tokens.css). Whatever font/size were active
 *  before switching on are remembered and restored on the way back off, so
 *  the toggle actually turns off — rather than leaving Hyperlegible/Large
 *  stuck even after picking "off". */
export function setDyslexiaMode(on) {
  const wasOn = getDyslexiaMode();
  localStorage.setItem(DYSLEXIA_KEY, on ? "1" : "0");
  if (on && !wasOn) {
    localStorage.setItem(PREV_FONT_KEY, getFont());
    localStorage.setItem(PREV_SIZE_KEY, getTextSize());
    localStorage.setItem(FONT_KEY, "hyperlegible");
    localStorage.setItem(SIZE_KEY, "l");
  } else if (!on && wasOn) {
    const prevFont = localStorage.getItem(PREV_FONT_KEY);
    const prevSize = localStorage.getItem(PREV_SIZE_KEY);
    if (prevFont) localStorage.setItem(FONT_KEY, prevFont);
    if (prevSize) localStorage.setItem(SIZE_KEY, prevSize);
    localStorage.removeItem(PREV_FONT_KEY);
    localStorage.removeItem(PREV_SIZE_KEY);
  }
  applyTypeface();
}
