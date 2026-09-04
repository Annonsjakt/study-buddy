// Small anchored dropdown for the topbar's bell/profile buttons — positioned
// under `anchor`, closed by an outside click, Escape, or the next open call.
// Mirrors the card ⋮ menu's positioning approach in views/menu.js, but kept
// separate (own class, own close fn) since that one lives in a single view
// while this one lives in the persistent shell and must survive route
// changes without the two systems' cleanup calls stepping on each other.

import { el } from "./dom.js";

function escClose(e) { if (e.key === "Escape") closePopover(); }

export function closePopover() {
  document.querySelectorAll(".popover").forEach((m) => m.remove());
  document.removeEventListener("keydown", escClose);
}

export function openPopover(anchor, children, { align = "left", width = 260 } = {}) {
  closePopover();
  const menu = el("div.popover", { role: "menu" }, children);
  const r = anchor.getBoundingClientRect();
  const left = align === "right" ? r.right + window.scrollX - width : r.left + window.scrollX;
  menu.style.top = `${r.bottom + window.scrollY + 6}px`;
  menu.style.left = `${Math.max(8, Math.min(left, window.innerWidth - width - 8))}px`;
  menu.style.width = `${width}px`;
  document.body.appendChild(menu);

  setTimeout(() => {
    document.addEventListener("click", closePopover, { once: true });
    document.addEventListener("keydown", escClose);
  }, 0);
  return menu;
}
