// One stat tile: dim label, big value, and a ? that explains where the value came from.
// Shared by the character sheet and the creation wizard's derived step so the two can't
// drift apart in either arithmetic or appearance.

import { escapeHtml } from "./escape.js";
import { openPopover } from "./popover.js";

/**
 * @param {string} label
 * @param {number|string} value what to show; pass "—" when it isn't known yet
 * @param {object} [breakdown] { total, parts, note } — omit for a plain tile with no ?
 */
export function statLine(label, value, breakdown) {
  const div = document.createElement("div");
  div.className = "stat-line";
  div.innerHTML = `<span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong>`;

  if (breakdown && (breakdown.parts || []).length > 0) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "stat-why";
    btn.textContent = "?";
    btn.title = `Where does ${label} come from?`;
    btn.setAttribute("aria-label", `Explain ${label}`);
    btn.addEventListener("click", () => openPopover(label, breakdown));
    div.querySelector("span").appendChild(btn);
  }
  return div;
}
