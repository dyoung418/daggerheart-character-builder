// The "Content" button in the top bar, and the panel behind it.
//
// This is the app's only settings UI, and it needs no new markup: every interactive page already
// shares <nav class="top-nav">, and openModal() is the existing centred modal. sheet.html has no
// top bar and gets no button, which is correct — the printable sheet looks records up unfiltered,
// so there is nothing there for a toggle to change.
//
// The panel is also where the loader reports itself: a source it skipped, a record it dropped, an
// id one source took over from another, an effects entry it refused. Those are all silent
// otherwise, and silence is the failure mode this whole feature has to avoid.

import { escapeHtml } from "./escape.js";
import { openModal } from "./popover.js";
import { writeDisabledSources } from "./content-load.js";

const COUNT_LABELS = {
  classes: ["class", "classes"],
  subclasses: ["subclass", "subclasses"],
  ancestries: ["ancestry", "ancestries"],
  communities: ["community", "communities"],
  transformations: ["transformation", "transformations"],
  domainCards: ["card", "cards"],
  weapons: ["weapon", "weapons"],
  armors: ["armor", "armors"],
  consumables: ["consumable", "consumables"],
};

function countsText(counts) {
  const parts = Object.entries(counts)
    .filter(([, n]) => n > 0)
    .map(([key, n]) => `${n} ${COUNT_LABELS[key]?.[n === 1 ? 0 : 1] || key}`);
  return parts.length ? parts.join(", ") : "nothing loaded";
}

function warnList(title, lines) {
  if (lines.length === 0) return "";
  return `<div class="content-warn"><strong>${escapeHtml(title)}</strong>` +
    lines.map((line) => `<div>└ ${escapeHtml(line)}</div>`).join("") + `</div>`;
}

function panelBody(report, disabled, onToggle) {
  const body = document.createElement("div");
  body.className = "content-panel";

  for (const source of report.sources) {
    const row = document.createElement("label");
    row.className = "content-source";

    const box = document.createElement("input");
    box.type = "checkbox";
    box.checked = !disabled.has(source.name);
    box.addEventListener("change", () => onToggle(source.name, box.checked));
    row.appendChild(box);

    const text = document.createElement("span");
    text.innerHTML = `<strong>${escapeHtml(source.label)}</strong> <span class="hint">${escapeHtml(countsText(source.counts))}</span>`;
    row.appendChild(text);
    body.appendChild(row);

    if (source.skipped.length > 0) {
      const skipped = document.createElement("div");
      skipped.innerHTML = warnList(
        `${source.skipped.length} record${source.skipped.length === 1 ? "" : "s"} skipped`,
        source.skipped.map((s) => `${s.file}.json "${s.id}" — ${s.reason}`),
      );
      body.appendChild(skipped);
    }
  }

  const extras = document.createElement("div");
  extras.innerHTML =
    warnList("Records taken over by a later source", report.collisions.map((c) =>
      `${c.from} replaces ${c.over}'s "${c.id}" in ${c.file}.json${c.byName ? " (same name, different id)" : ""}`)) +
    warnList("Effects that couldn't be used", report.effectIssues.map((e) =>
      `${e.source}: "${e.key}" — ${e.reason}`)) +
    warnList("Content that couldn't be read", report.warnings || []);
  if (extras.innerHTML) body.appendChild(extras);

  const hint = document.createElement("p");
  hint.className = "hint";
  hint.textContent = "Switching a source off only changes what you can pick. Characters already " +
    "built with it keep their content and their stats.";
  body.appendChild(hint);

  return body;
}

/**
 * @param {{report, disabled}} content what loadContent() returned.
 */
export function mountContentSettings({ report, disabled }) {
  const nav = document.querySelector(".top-nav");
  if (!nav) return;

  const button = document.createElement("button");
  button.type = "button";
  button.className = "top-nav-button";
  const problems = report.collisions.length + report.effectIssues.length +
    (report.warnings || []).length + report.sources.reduce((n, s) => n + s.skipped.length, 0);
  button.textContent = problems > 0 ? `Content ⚠` : "Content";

  // Every page builds its pickers from module state during init(), and the create wizard holds a
  // half-finished character in memory — so re-deriving all of that live would mean a re-render
  // path per page plus a new class of bug where a step's own selection is filtered out from under
  // it. A reload is one line and loses nothing: both wizards persist on every edit.
  const onToggle = (name, enabled) => {
    const next = new Set(disabled);
    if (enabled) next.delete(name);
    else next.add(name);
    writeDisabledSources(next);
    location.reload();
  };

  button.addEventListener("click", () => openModal("Content", panelBody(report, disabled, onToggle)));
  nav.appendChild(button);
}
