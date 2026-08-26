// The character at the table, on a phone: HP, Stress, Hope and Armor boxes you tap to mark
// and clear, plus the numbers a player needs when a hit lands (Evasion, thresholds).
//
// The only page that writes to a saved character during play — and only its `state`, the
// marked-box counts. All arithmetic lives in shared/derived-stats.js (through
// shared/sheet-data.js) and the tap/clamp rules in shared/table-state.js; this file builds
// DOM and saves.

import { ensureLevelFields } from "./shared/advancement.js";
import { deriveSheet } from "./shared/sheet-data.js";
import { clampState, maxesFromSheet, tapBox } from "./shared/table-state.js";

const CHAR_STORAGE_KEY = "dh-characters-v1";

const ROWS = [
  { key: "hp", label: "HP" },
  { key: "stress", label: "Stress" },
  { key: "hope", label: "Hope" },
  { key: "armor", label: "Armor" },
];

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
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

function renderIdentity(s) {
  const box = el("header", "play-identity");
  box.appendChild(el("h1", "play-name", s.name));
  box.appendChild(el("p", "play-subtitle", `${s.className} · ${s.subclassName} · Lv ${s.level}`));
  return box;
}

function numberTile(label, value, className) {
  const tile = el("div", `play-number ${className || ""}`);
  tile.appendChild(el("span", "play-number-value", value === null || value === undefined ? "—" : String(value)));
  tile.appendChild(el("span", "play-number-label", label));
  return tile;
}

// Evasion and the two thresholds: the numbers read the moment a hit comes in.
function renderNumbers(s) {
  const box = el("section", "play-numbers");
  box.appendChild(numberTile("Evasion", s.evasion));
  box.appendChild(numberTile("Major", s.thresholds ? s.thresholds.major : null, "play-number-major"));
  box.appendChild(numberTile("Severe", s.thresholds ? s.thresholds.severe : null, "play-number-severe"));
  return box;
}

// One row of tappable boxes. `max` null → a dash, like the printed sheet's tickRow().
function renderRow(row, marked, max, onTap) {
  const box = el("div", `play-row play-row-${row.key}`);
  box.appendChild(el("span", "play-row-label", row.label));
  if (max === null || max === undefined) {
    box.appendChild(el("span", "play-row-unknown", "—"));
    return box;
  }
  const boxes = el("div", "play-boxes");
  boxes.setAttribute("role", "group");
  boxes.setAttribute("aria-label", `${row.label}: ${marked} of ${max} marked`);
  for (let i = 0; i < max; i++) {
    const b = el("button", "play-box" + (i < marked ? " marked" : ""));
    b.type = "button";
    b.setAttribute("aria-pressed", String(i < marked));
    b.setAttribute("aria-label", `${row.label} ${i + 1} of ${max}`);
    b.addEventListener("click", () => onTap(row.key, i));
    boxes.appendChild(b);
  }
  box.appendChild(boxes);
  box.appendChild(el("span", "play-row-count", `${marked}/${max}`));
  return box;
}

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
  // Clamped on every open: a lighter armor or a lost bonus since the last session must not
  // leave more boxes marked than the row has.
  let state = clampState(character.state, maxes);
  if (JSON.stringify(state) !== JSON.stringify(character.state)) saveState(id, state);

  const rows = el("section", "play-rows");
  function drawRows() {
    rows.replaceChildren();
    for (const row of ROWS) rows.appendChild(renderRow(row, state[row.key], maxes[row.key], onTap));
  }
  function onTap(key, index) {
    state = clampState({ ...state, [key]: tapBox(state[key], index) }, maxes);
    saveState(id, state);
    drawRows();
  }

  root.appendChild(renderIdentity(sheet));
  root.appendChild(renderNumbers(sheet));
  drawRows();
  root.appendChild(rows);
}

init();
