// Dyslexia-friendly reading mode: a more legible typeface plus roomier line,
// letter and word spacing, applied as data-readmode on <html>. Same
// read-from-localStorage-at-startup pattern as theme.js, so it never flashes
// the default type before the store has finished loading.

const KEY = "studybuddy.readmode";

export function getReadMode() {
  return localStorage.getItem(KEY) === "on";
}

export function applyReadMode(on = getReadMode()) {
  document.documentElement.toggleAttribute("data-readmode", on);
}

export function setReadMode(on) {
  localStorage.setItem(KEY, on ? "on" : "off");
  applyReadMode(on);
}
