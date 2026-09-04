// Read text aloud with the browser's built-in Web Speech API — no external
// service, key, or network call needed.

import { getLang } from "./i18n.js";

export const speechSupported = typeof window !== "undefined" && "speechSynthesis" in window;

export function speak(text) {
  if (!speechSupported || !text) return;
  window.speechSynthesis.cancel(); // a new request always interrupts the last one
  const utter = new SpeechSynthesisUtterance(text);
  utter.lang = getLang() === "sv" ? "sv-SE" : "en-GB";
  utter.rate = 0.95;
  window.speechSynthesis.speak(utter);
}

export function stopSpeaking() {
  if (speechSupported) window.speechSynthesis.cancel();
}

/** Rendered question prompts/answers are HTML (markdown + KaTeX) — strip that
 *  down to plain text so it reads naturally instead of narrating markup. */
export function htmlToText(html) {
  const div = document.createElement("div");
  div.innerHTML = html;
  return (div.textContent || "").replace(/\s+/g, " ").trim();
}
