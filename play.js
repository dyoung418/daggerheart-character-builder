// The character at the table, on a phone. Header: name, level, heritage line, Hope you tap,
// the class's domains, the six traits on shields. Then tabs — Status (HP, Stress, Evasion,
// Armor, Proficiency, thresholds, experiences), Weapons, Cards (loadout text), Features.
//
// The only page that writes to a saved character during play — and only its `state`, the
// marked-box counts. All arithmetic lives in shared/derived-stats.js (through
// shared/sheet-data.js) and the tap/clamp rules in shared/table-state.js; this file builds
// DOM and saves. The look follows the Foundryborne Daggerheart system (see play.css).

import { ensureLevelFields } from "./shared/advancement.js";
import { deriveSheet } from "./shared/sheet-data.js";
import { CONDITIONS, clampState, maxesFromSheet, tapBox, toggleCondition } from "./shared/table-state.js";

const CHAR_STORAGE_KEY = "dh-characters-v1";
const SVG = "http://www.w3.org/2000/svg";

const TABS = [
  { id: "status", label: "Status" },
  { id: "weapons", label: "Weapons" },
  { id: "cards", label: "Cards" },
  { id: "features", label: "Features" },
];

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function svg(viewBox, paths, className) {
  const node = document.createElementNS(SVG, "svg");
  node.setAttribute("viewBox", viewBox);
  node.setAttribute("aria-hidden", "true");
  if (className) node.setAttribute("class", className);
  for (const [d, cls] of paths) {
    const p = document.createElementNS(SVG, "path");
    p.setAttribute("d", d);
    if (cls) p.setAttribute("class", cls);
    node.appendChild(p);
  }
  return node;
}

// The trait shield from Foundryborne's character header: a border shape with the face inset.
function traitShield() {
  return svg("0 0 52 46", [
    ["M 0,0 H 52 L 51.0714,18.254 48.781,24.0952 47.5745,39.9596 26,46 4.42553,39.9596 3.219,24.0952 0.928571,18.254 Z", "shield-border"],
    ["M 3.312,5.357 8.58596,0 H 43.414 l 5.274,5.357 -1.8797,28.846 c -0.2431,2.605 -2.1461,4.7522 -4.7031,5.3064 l -14.8343,3.2151 c -0.8375,0.1816 -1.7043,0.1816 -2.5418,0 L 9.89482,39.5094 C 7.33785,38.9552 5.43478,36.808 5.19169,34.203 Z", "shield-face"],
  ]);
}
// Foundryborne's experience-shield.svg: a banner with notched sides.
function experienceShield() {
  const node = svg("0 0 35 25", [[
    "M32.0195 21.126C32.6293 22.7597 31.4216 24.5 29.6777 24.5L3.32226 24.5C1.57838 24.5 0.370692 22.7597 0.980468 21.126L3.74316 13.7246C4.0379 12.9351 4.0379 12.0649 3.74316 11.2754L0.980469 3.87402C0.370692 2.24027 1.57838 0.499999 3.32227 0.499999L29.6777 0.5C31.4216 0.5 32.6293 2.24027 32.0195 3.87402L29.2568 11.2754C28.9621 12.0649 28.9621 12.9351 29.2568 13.7246L32.0195 21.126Z",
  ]]);
  node.setAttribute("fill", "#18162e55");
  node.setAttribute("stroke", "#f3c267");
  return node;
}
function armorShield() {
  return svg("0 0 24 26", [["M12 1 L22 4.5 V12 C22 18 17.5 22.5 12 25 C6.5 22.5 2 18 2 12 V4.5 Z"]]);
}

async function loadJson(name) {
  const res = await fetch(`data/${name}.json`);
  return res.json();
}

// Same files every other page loads (see sheet.js).
async function loadAllData() {
  const [classes, subclasses, ancestries, communities, domainCards, weapons, armors, consumables] =
    await Promise.all([
      loadJson("classes"), loadJson("subclasses"), loadJson("ancestries"), loadJson("communities"),
      loadJson("domain-cards"), loadJson("weapons"), loadJson("armors"), loadJson("consumables"),
    ]);
  return { classes, subclasses, ancestries, communities, domainCards, weapons, armors, consumables };
}

function loadCharacters() {
  try {
    const raw = localStorage.getItem(CHAR_STORAGE_KEY);
    return raw ? JSON.parse(raw).map(ensureLevelFields) : [];
  } catch {
    return [];
  }
}

// Re-read, patch one character's state, write back: never the copy loaded at page open, so a
// change made meanwhile on another page of the same browser (an edit, a level up) survives.
function saveState(id, state) {
  const characters = loadCharacters();
  const ch = characters.find((c) => c.id === id);
  if (!ch) return;
  ch.state = state;
  localStorage.setItem(CHAR_STORAGE_KEY, JSON.stringify(characters));
}

function line() { return el("span", "dh-line"); }

function sectionTitle(text) {
  const box = el("div", "dh-title");
  box.appendChild(el("span", "dh-side-line invert"));
  box.appendChild(el("h3", null, text));
  box.appendChild(el("span", "dh-side-line"));
  return box;
}

// ---------- header ----------

function renderHeader(s, character, domains, hope) {
  const head = el("header", "play-header");
  head.appendChild(line());

  const nameRow = el("div", "play-name-row");
  nameRow.appendChild(el("h1", "play-name", s.name));
  const level = el("span", "play-level", "Level");
  level.appendChild(el("strong", null, String(s.level)));
  nameRow.appendChild(level);
  head.appendChild(nameRow);

  const details = el("p", "play-details");
  const parts = [s.className, s.subclassName, s.communityName, s.ancestryNames.join(" + ") || "—"];
  parts.forEach((text, i) => {
    if (i > 0) details.appendChild(el("span", "dot", "•"));
    details.appendChild(el("span", null, text));
  });
  head.appendChild(details);

  const pills = el("div", "play-pills");
  pills.appendChild(hope);
  if (domains.length) {
    const box = el("div", "dh-pill dh-domains");
    for (const d of domains) {
      const dom = el("span", "play-domain", d.toLowerCase());
      dom.dataset.domain = d.toLowerCase();
      box.appendChild(dom);
    }
    pills.appendChild(box);
  }
  head.appendChild(pills);

  head.appendChild(renderTraits(s, character));
  return head;
}

function renderHope(marked, max, onTap) {
  const box = el("div", "dh-pill dh-hope");
  box.setAttribute("role", "group");
  box.setAttribute("aria-label", `Hope: ${marked} of ${max}`);
  box.appendChild(el("span", "hope-label", "Hope"));
  for (let i = 0; i < max; i++) {
    const b = el("button", "hope-slot" + (i < marked ? " filled" : ""));
    b.type = "button";
    b.setAttribute("aria-pressed", String(i < marked));
    b.setAttribute("aria-label", `Hope ${i + 1} of ${max}`);
    b.addEventListener("click", () => onTap("hope", i));
    box.appendChild(b);
  }
  return box;
}

function renderTraits(s, character) {
  const box = el("section", "play-traits");
  const spellcastTrait = s.spellcast ? s.spellcast.display.split(" ")[0].toLowerCase() : null;
  for (const trait of s.traits) {
    const item = el("div", "play-trait");
    const name = el("div", "trait-name", trait.label);
    const mark = el("span", "tier-mark" + (character.traitMarks?.[trait.key] ? " marked" : ""));
    mark.title = "Marked this tier";
    name.prepend(mark);
    item.appendChild(name);
    const shield = el("div", "trait-shield");
    shield.appendChild(traitShield());
    shield.appendChild(el("span", "trait-value", trait.display));
    if (spellcastTrait === trait.key) {
      const sc = el("span", "spellcast-mark", "✦");
      sc.title = "Spellcast trait";
      shield.appendChild(sc);
    }
    item.appendChild(shield);
    box.appendChild(item);
  }
  return box;
}

// ---------- tabs ----------

function renderTabs(active, onSelect) {
  const box = el("section", "play-tabs");
  box.appendChild(line());
  const nav = el("nav");
  nav.setAttribute("role", "tablist");
  for (const tab of TABS) {
    const b = el("button", null, tab.label);
    b.type = "button";
    b.setAttribute("role", "tab");
    b.setAttribute("aria-selected", String(tab.id === active));
    b.setAttribute("aria-controls", `panel-${tab.id}`);
    b.addEventListener("click", () => onSelect(tab.id));
    nav.appendChild(b);
  }
  box.appendChild(nav);
  box.appendChild(line());
  return box;
}

// ---------- status panel ----------

// A pip bar with its label underneath, Foundryborne's .slot-value. `max` null → a dash.
function pipBar(key, label, marked, max, onTap, note) {
  const box = el("div", `dh-slot-value dh-${key}`);
  const bar = el("div", `dh-slot-bar ${key}`);
  bar.setAttribute("role", "group");
  bar.setAttribute("aria-label", `${label}: ${marked} of ${max ?? "?"} marked`);
  if (max === null || max === undefined) {
    bar.appendChild(el("span", "play-empty", "—"));
  } else {
    for (let i = 0; i < max; i++) {
      const b = el("button", "dh-slot" + (i < marked ? " filled" : ""));
      b.type = "button";
      b.setAttribute("aria-pressed", String(i < marked));
      b.setAttribute("aria-label", `${label} ${i + 1} of ${max}`);
      if (key === "armor") b.appendChild(armorShield());
      b.addEventListener("click", () => onTap(key, i));
      bar.appendChild(b);
    }
  }
  box.appendChild(bar);
  const lab = el("div", "dh-slot-label");
  lab.appendChild(el("span", "label", label));
  lab.appendChild(el("span", "value", max === null || max === undefined ? "—" : `${marked} / ${max}`));
  box.appendChild(lab);
  if (note) box.appendChild(el("p", "dh-slot-note", note));
  return box;
}

function statusNumber(label, value) {
  const box = el("div", "dh-status-number");
  box.appendChild(el("div", "status-value", value === null || value === undefined ? "—" : String(value)));
  box.appendChild(el("div", "status-label", label));
  return box;
}

// The three SRD conditions as chips; the active ones spell out their effect underneath.
function renderConditions(active, onToggle) {
  const box = el("section", "play-conditions");
  const chips = el("div", "play-chips");
  chips.setAttribute("role", "group");
  chips.setAttribute("aria-label", "Conditions");
  for (const c of CONDITIONS) {
    const on = active.includes(c.id);
    const b = el("button", "dh-chip" + (on ? " active" : ""), c.label);
    b.type = "button";
    b.setAttribute("aria-pressed", String(on));
    b.addEventListener("click", () => onToggle(c.id));
    chips.appendChild(b);
  }
  box.appendChild(chips);
  for (const c of CONDITIONS.filter((c) => active.includes(c.id))) {
    const line = el("p", "play-condition-effect");
    line.appendChild(el("strong", null, `${c.label} — `));
    line.appendChild(document.createTextNode(c.effect));
    box.appendChild(line);
  }
  return box;
}

// Session notes: saved as you type (debounced), never cleared by the app.
function renderNotes(notes, onChange) {
  const box = el("section", "play-notes");
  box.appendChild(sectionTitle("Notes"));
  const ta = el("textarea", "play-notes-field");
  ta.value = notes;
  ta.rows = 4;
  ta.placeholder = "Session notes: temporary effects, debts, countdowns, who owes whom…";
  ta.setAttribute("aria-label", "Session notes");
  let timer = null;
  ta.addEventListener("input", () => {
    clearTimeout(timer);
    timer = setTimeout(() => onChange(ta.value), 300);
  });
  ta.addEventListener("blur", () => { clearTimeout(timer); onChange(ta.value); });
  box.appendChild(ta);
  return box;
}

function renderStatus(s, state, maxes, onTap) {
  const panel = el("div");

  const res = el("div", "play-resources");
  res.appendChild(pipBar("hp", "HP", state.hp, maxes.hp, onTap, s.hitPointsNote));
  res.appendChild(pipBar("stress", "Stress", state.stress, maxes.stress, onTap, s.stressNote));
  panel.appendChild(res);

  const row = el("div", "play-status-row");
  row.appendChild(statusNumber("Evasion", s.evasion));
  row.appendChild(pipBar("armor", "Armor", state.armor, maxes.armor, onTap, s.armorScoreNote));
  row.appendChild(statusNumber("Prof.", s.proficiency));
  panel.appendChild(row);

  const th = el("div", "dh-pill dh-thresholds");
  th.appendChild(el("span", "th-label", "Minor"));
  th.appendChild(el("span", "th-value", s.thresholds ? String(s.thresholds.major) : "—"));
  th.appendChild(el("span", "th-label", "Major"));
  th.appendChild(el("span", "th-value", s.thresholds ? String(s.thresholds.severe) : "—"));
  th.appendChild(el("span", "th-label", "Severe"));
  panel.appendChild(th);

  panel.appendChild(renderConditions(state.conditions, (id) => onTap("condition", id)));

  if (s.spellcast) {
    const sc = el("p", "dh-slot-note", `Spellcast: ${s.spellcast.display}${s.spellcast.note ? " — " + s.spellcast.note : ""}`);
    panel.appendChild(sc);
  }

  if (s.unresolvedChoicePrompts.length) {
    const warn = el("div", "play-warning");
    warn.appendChild(el("strong", null, "Unresolved choices — these grant nothing until answered:"));
    const list = el("ul");
    for (const p of s.unresolvedChoicePrompts) list.appendChild(el("li", null, p));
    warn.appendChild(list);
    panel.appendChild(warn);
  }

  panel.appendChild(sectionTitle("Experience"));
  const exps = el("div", "play-experiences");
  for (const exp of s.experiences) {
    const row = el("div", "experience-row");
    const val = el("span", "experience-value");
    val.appendChild(experienceShield());
    val.appendChild(el("span", null, exp.display));
    row.appendChild(val);
    row.appendChild(el("span", "experience-name", exp.name));
    exps.appendChild(row);
  }
  if (!s.experiences.length) exps.appendChild(el("p", "play-empty", "No experiences yet."));
  panel.appendChild(exps);

  panel.appendChild(renderNotes(state.notes, (text) => onTap("notes", text)));
  return panel;
}

// ---------- weapons / cards / features ----------

function featureText(features, withNames) {
  const box = el("div", "item-text");
  for (const f of features) {
    if (withNames && f.name) box.appendChild(el("h4", null, f.name));
    for (const block of f.description || []) {
      if (block.type === "paragraph") {
        if (block.text) box.appendChild(el("p", null, block.text));
      } else if (block.type === "list") {
        const list = el("ul");
        for (const item of block.items) list.appendChild(el("li", null, item));
        box.appendChild(list);
      }
    }
  }
  return box;
}

function itemCard({ name, labels = [], roll, rollNote, features = [], withNames = false, className = "" }) {
  const box = el("article", `dh-item ${className}`);
  box.appendChild(el("span", "item-name", name));
  if (roll !== undefined) {
    const r = el("span", "item-roll", roll);
    if (rollNote) r.appendChild(el("small", null, rollNote));
    box.appendChild(r);
  }
  const labs = el("span", "item-labels");
  for (const l of labels.filter(Boolean)) labs.appendChild(el("span", null, l));
  box.appendChild(labs);
  if (features.length) box.appendChild(featureText(features, withNames));
  return box;
}

function renderWeapons(s) {
  const panel = el("div");
  panel.appendChild(sectionTitle("Weapons"));
  for (const w of s.weapons) {
    panel.appendChild(itemCard({
      name: w.name,
      labels: [w.range, w.burden, w.traitLabel],
      roll: w.attack,
      rollNote: `${w.damage} ${w.damageType}`.trim(),
      features: w.features,
      withNames: true,
    }));
  }
  if (!s.weapons.length) panel.appendChild(el("p", "play-empty", "No weapon equipped."));
  panel.appendChild(sectionTitle("Armor"));
  panel.appendChild(itemCard({
    name: s.armorName,
    labels: [s.thresholds ? `Thresholds ${s.thresholds.major} / ${s.thresholds.severe}` : ""],
    roll: s.armorScore === null ? "—" : String(s.armorScore),
    rollNote: "Armor Score",
    features: s.armorFeatures,
    withNames: true,
  }));
  panel.appendChild(el("p", "dh-slot-note", `Potion: ${s.potionName}`));
  return panel;
}

function renderCards(s) {
  const panel = el("div");
  panel.appendChild(sectionTitle(`Loadout ${s.loadout.length}/5`));
  for (const card of s.loadout) {
    panel.appendChild(itemCard({
      name: card.name,
      labels: [`Lv ${card.level}`, card.domain, card.type, `Recall ${card.recallCost}`],
      features: card.features,
      withNames: card.features.length > 1,
      className: `domain-${card.domainClass}`,
    }));
  }
  if (!s.loadout.length) panel.appendChild(el("p", "play-empty", "No cards in loadout."));
  return panel;
}

function renderFeatures(s) {
  const panel = el("div");
  const group = (title, features, source) => {
    if (!features.length) return;
    panel.appendChild(sectionTitle(title));
    for (const f of features) {
      panel.appendChild(itemCard({ name: f.name, labels: [source ? source(f) : ""], features: [f] }));
    }
  };
  group(`${s.className} — Hope feature`, s.hopeFeature ? [s.hopeFeature] : []);
  group(s.className, s.classFeatures);
  group(s.subclassName, s.subclassFeatures, (f) => f.source);
  group("Ancestry", s.ancestryFeatures, (f) => f.source);
  group("Community", s.communityFeatures, (f) => f.source);
  if (!panel.childNodes.length) panel.appendChild(el("p", "play-empty", "No features yet."));
  return panel;
}

// ---------- page ----------

function renderNotFound(root) {
  root.appendChild(el("p", "hint", "Character not found."));
  const link = el("a", null, "Back to My Characters");
  link.href = "characters.html";
  root.appendChild(link);
}

async function init() {
  const root = document.getElementById("play-root");
  const db = await loadAllData();

  const id = new URLSearchParams(location.search).get("id");
  const character = loadCharacters().find((c) => c.id === id);
  if (!character) {
    renderNotFound(root);
    return;
  }
  document.getElementById("print-link").href = `sheet.html?id=${id}`;
  document.title = `${character.name || "Character"} — At the Table`;

  const sheet = deriveSheet(character, db);
  const maxes = maxesFromSheet(sheet);
  const cls = db.classes.find((c) => c.id === character.classId);
  const domains = cls?.domains || [];

  // Clamped on every open: a lighter armor or a lost bonus since the last session must not
  // leave more boxes marked than the row has.
  let state = clampState(character.state, maxes);
  if (JSON.stringify(state) !== JSON.stringify(character.state)) saveState(id, state);

  const panels = {};
  let hopeBox;
  // One entry point for every change at the table: a tapped box (key + index), a toggled
  // condition (key "condition" + id) or the notes (key "notes" + text). Notes don't redraw
  // the panel — the textarea being typed in would lose focus.
  function onTap(key, value) {
    if (key === "notes") {
      state = clampState({ ...state, notes: value }, maxes);
      saveState(id, state);
      return;
    }
    const next = key === "condition"
      ? { ...state, conditions: toggleCondition(state.conditions, value) }
      : { ...state, [key]: tapBox(state[key], value) };
    state = clampState(next, maxes);
    saveState(id, state);
    if (key === "hope") {
      const fresh = renderHope(state.hope, maxes.hope ?? 0, onTap);
      hopeBox.replaceWith(fresh);
      hopeBox = fresh;
    } else {
      const fresh = renderStatus(sheet, state, maxes, onTap);
      panels.status.replaceChildren(...fresh.childNodes);
    }
  }

  hopeBox = renderHope(state.hope, maxes.hope ?? 0, onTap);
  root.appendChild(renderHeader(sheet, character, domains, hopeBox));

  // The active tab lives in the URL hash so a reload (or a back-navigation) lands on it.
  let active = TABS.some((t) => t.id === location.hash.slice(1)) ? location.hash.slice(1) : "status";
  let tabs = renderTabs(active, select);
  root.appendChild(tabs);

  const content = {
    status: () => renderStatus(sheet, state, maxes, onTap),
    weapons: () => renderWeapons(sheet),
    cards: () => renderCards(sheet),
    features: () => renderFeatures(sheet),
  };
  for (const tab of TABS) {
    const panel = el("section", "play-panel");
    panel.id = `panel-${tab.id}`;
    panel.setAttribute("role", "tabpanel");
    panel.hidden = tab.id !== active;
    panel.replaceChildren(...content[tab.id]().childNodes);
    panels[tab.id] = panel;
    root.appendChild(panel);
  }

  function select(id) {
    active = id;
    history.replaceState(null, "", `#${id}`);
    for (const tab of TABS) panels[tab.id].hidden = tab.id !== id;
    const fresh = renderTabs(id, select);
    tabs.replaceWith(fresh);
    tabs = fresh;
  }
}

init();
