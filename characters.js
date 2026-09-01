import {
  renderCardArt,
  domainCardArtPath,
  subclassCardArtPath,
  communityCardArtPath,
  ancestryCardArtPath,
  transformationCardArtPath,
} from "./shared/card-render.js";
import {
  MAX_HOPE,
  SLOT_TIERS,
  STARTING_HOPE,
  SUBCLASS_TIER_LABELS,
  activeDomainCardIds,
  ensureLevelFields,
  slotsPerPick,
  subclassTiersUpTo,
  tierForLevel,
} from "./shared/advancement.js";
import { encodePortrait } from "./shared/portrait.js";
import {
  describeCards,
  describeLevelUp,
  recomputeCharacter,
  unresolvedProblems,
  validateLevelUps,
} from "./shared/history.js";
import { advancementOptionsFor, derivedStats, spellcastTraitKeys } from "./shared/derived-stats.js";
import { statLine } from "./shared/stat-line.js";
import { titleCase } from "./shared/text.js";
import { ignoresBurden, unresolvedChoices } from "./shared/effects.js";
import {
  UNARMED,
  UNARMORED,
  armorStats,
  burdenWarning,
  featureLine,
  magicWeaponWarning,
  weaponStats,
} from "./shared/gear.js";
import { buildCsv } from "./shared/csv-export.js";
import { loadContent } from "./shared/content-load.js";
import { remapCharacterListIds } from "./shared/content-ids.js";
import { mountContentSettings } from "./shared/content-settings.js";
import { unresolvedReferences } from "./shared/content-sources.js";
import {
  DEFAULT_RESOLUTION,
  applyImport,
  parseTransferFile,
  planImport,
  serializeTransferFile,
  transferFilename,
} from "./shared/transfer.js";
import { closePopover, openModal } from "./shared/popover.js";
import { classFeatureSections } from "./shared/class-detail.js";
import { escapeHtml } from "./shared/escape.js";
// The two imports here that aren't from shared/, and deliberately so: card-pdf.js fetches art and
// draws it on a canvas, sheet-pdf.js fetches the official sheet template — both of which shared/
// modules are forbidden to do. Every rule either of them applies — which cards, where they land on
// the page, what the generated cards say, what each field of the official sheet reads — lives in
// the pure modules underneath them, where tests/ can reach it.
import { buildCardPdf } from "./card-pdf.js";
import { buildSheetPdf, sheetTemplate } from "./sheet-pdf.js";

const signed = (n) => (n > 0 ? `+${n}` : String(n));

const CHAR_STORAGE_KEY = "dh-characters-v1";
const UNDO_STORAGE_KEY = "dh-level-edit-undo-v1";
const TRAIT_LABELS = { agility: "Agility", strength: "Strength", finesse: "Finesse", instinct: "Instinct", presence: "Presence", knowledge: "Knowledge" };
const CIRCLED = ["", "①", "②", "③", "④", "⑤", "⑥", "⑦", "⑧", "⑨", "⑩"];

const db = {};
let content = null; // what loadContent() reported: which sources loaded, and which are switched off
let characters = [];
let openId = null; // id of the character open in detail view, null = list view
let pendingDeleteId = null; // id awaiting delete confirmation (inline confirm, never window.confirm)
let pendingRemoveLevel = null; // level awaiting remove confirmation, same inline pattern
let historyOpen = false; // keeps the level history accordion open across re-renders
let importPlan = null; // parsed file awaiting collision resolution
let importResolutions = null; // incoming character id -> keep-both | overwrite | skip
let importDropped = 0; // entries in the file that weren't characters
let importUndo = null; // { characters, undoSlot } captured before the last commit
let sheetTemplateInstalled = false; // whether data/sheet/ holds the official sheet — see init()

async function loadAllData() {
  content = await loadContent();
  Object.assign(db, content.db);
}

// Ids a character stores that this browser can't resolve. Sentinels are stored values with no
// record behind them, so they aren't missing content.
const missingContent = (ch) => unresolvedReferences(ch, db, { sentinels: [UNARMED, UNARMORED] });

function loadCharacters() {
  try {
    const raw = localStorage.getItem(CHAR_STORAGE_KEY);
    characters = raw ? JSON.parse(raw).map(ensureLevelFields) : [];
  } catch {
    characters = [];
  }
  // A record's id names the edition that published it, so switching which SRD is loaded moves
  // every id a character stores. Re-point them at what's loaded now; the roster is written back
  // on the next save, so this runs once rather than on every open.
  characters = remapCharacterListIds(characters, db);
}

function saveCharacters() {
  localStorage.setItem(CHAR_STORAGE_KEY, JSON.stringify(characters));
}

// Re-read, patch one character's portrait, write back — the same care play.js takes with the
// marked boxes, for the same reason: the play page may have written since this list was loaded,
// and the portrait is a new reason to come back here mid-session. Returns false when nothing was
// written, so the caller can put its own copy back instead of showing a portrait that isn't saved.
function savePortrait(id, portrait) {
  let list;
  try {
    const raw = localStorage.getItem(CHAR_STORAGE_KEY);
    list = raw ? JSON.parse(raw) : [];
  } catch {
    return false;
  }
  const target = list.find((c) => c.id === id);
  if (!target) return false;
  if (portrait) target.portrait = portrait; else delete target.portrait;
  localStorage.setItem(CHAR_STORAGE_KEY, JSON.stringify(list));
  // What's on disk is now ahead of what this page loaded; the next saveCharacters() would write
  // the stale copy back over it.
  loadCharacters();
  return true;
}

function findClass(id) { return db.classes.find((c) => c.id === id); }
function findSubclass(id) { return db.subclasses.find((s) => s.id === id); }
function findAncestry(id) { return db.ancestries.find((a) => a.id === id); }
function findCommunity(id) { return db.communities.find((c) => c.id === id); }
function findTransformation(id) { return db.transformations.find((t) => t.id === id); }
function findDomainCard(id) { return db.domainCards.find((c) => c.id === id); }
function findWeapon(id) { return db.weapons.find((w) => w.id === id); }
function findArmor(id) { return db.armors.find((a) => a.id === id); }
function findConsumable(id) { return db.consumables.find((c) => c.id === id); }

// "Bard" on its own, or "Bard / Guardian" once a second class is in play. The multiclass shows
// up wherever the class does, because it's half of what the character is.
function classLine(ch) {
  const names = [ch.classId, ch.multiclass?.classId]
    .map((id) => findClass(id))
    .filter(Boolean)
    .map((c) => titleCase(c.name));
  return names.length ? names.join(" / ") : "—";
}

function isComplete(ch) {
  const cls = findClass(ch.classId);
  const hasHeritage = ch.heritage.communityId && ch.heritage.ancestryIds.length > 0;
  const hasTraits = Object.values(ch.traits).every((v) => v !== null);
  const hasEquip = ch.equipment.armorId && ch.equipment.potionChoice && ch.equipment.primaryWeaponId;
  const hasExp = ch.experiences.every((e) => e.name.trim());
  const hasCards = ch.domainCardIds.length >= 2;
  return !!(cls && ch.subclassId && hasHeritage && hasTraits && hasEquip && hasExp && hasCards);
}

function renderList() {
  const container = document.getElementById("characters-list");
  container.innerHTML = "";

  if (characters.length === 0) {
    container.innerHTML = `<p class="hint">No characters saved yet. <a href="create.html">Create one</a>.</p>`;
    return;
  }

  for (const ch of characters) {
    const cls = findClass(ch.classId);
    const sub = findSubclass(ch.subclassId);
    const complete = isComplete(ch);

    const row = document.createElement("div");
    row.className = "character-row" + (complete ? "" : " draft");

    const actionsHtml = pendingDeleteId === ch.id
      ? `
        <span class="confirm-text">Delete permanently?</span>
        <button class="btn-small btn-danger" data-action="confirm-delete">Yes, delete</button>
        <button class="btn-small" data-action="cancel-delete">Cancel</button>
      `
      : `
        <button class="btn-small" data-action="view">Sheet</button>
        <a class="btn-small" href="play.html?id=${encodeURIComponent(ch.id)}">Play</a>
        <a class="btn-small" href="sheet.html?id=${encodeURIComponent(ch.id)}">Print sheet</a>
        <button class="btn-small" data-action="edit">Edit</button>
        <button class="btn-small" data-action="export">Export</button>
        <button class="btn-small btn-danger" data-action="delete">Delete</button>
      `;

    row.innerHTML = `
      <div class="character-row-main">
        <strong>${escapeHtml(ch.name || "(unnamed)")}</strong>
        <span>Lv ${escapeHtml(ch.level)} · ${escapeHtml(classLine(ch))}${sub ? " · " + escapeHtml(sub.name["en-US"]) : ""}</span>
        ${complete ? "" : '<span class="badge-draft">draft</span>'}
      </div>
      <div class="character-row-actions">${actionsHtml}</div>
    `;
    if (pendingDeleteId === ch.id) {
      row.querySelector('[data-action="confirm-delete"]').addEventListener("click", () => {
        characters = characters.filter((c) => c.id !== ch.id);
        saveCharacters();
        pendingDeleteId = null;
        renderAll();
      });
      row.querySelector('[data-action="cancel-delete"]').addEventListener("click", () => {
        pendingDeleteId = null;
        renderAll();
      });
    } else {
      row.querySelector('[data-action="view"]').addEventListener("click", () => { openId = ch.id; renderAll(); });
      row.querySelector('[data-action="edit"]').addEventListener("click", () => { location.href = `create.html?id=${ch.id}`; });
      row.querySelector('[data-action="export"]').addEventListener("click", () => downloadTransferFile([ch]));
      row.querySelector('[data-action="delete"]').addEventListener("click", () => {
        pendingDeleteId = ch.id;
        renderAll();
      });
    }
    container.appendChild(row);
  }
}

function cardBlock(card, caption) {
  const wrap = document.createElement("div");
  wrap.className = "card-tile";
  wrap.appendChild(renderCardArt(card));
  const label = document.createElement("div");
  label.className = "card-tile-label";
  label.textContent = caption || card.name;
  wrap.appendChild(label);
  return wrap;
}

// ---------- level history ----------

// The advancement grid as a read-only summary, with the level that marked each slot
// written into it — the same layout as the level up screen and the printed sheet, so the
// whole slot economy (and what's still free) reads at a glance.
function renderHistoryGrid(ch) {
  const markedAt = {}; // key -> tier -> [levels]
  for (const entry of ch.levelUps || []) {
    for (const pick of entry.picks || []) {
      const perTier = (markedAt[pick.key] ||= {});
      const list = (perTier[pick.slotTier] ||= []);
      for (let i = 0; i < slotsPerPick(pick.key); i++) list.push(entry.level);
    }
  }

  const maxTier = tierForLevel(ch.level);
  const tiers = SLOT_TIERS.filter((t) => t <= maxTier);
  const grid = document.createElement("div");
  grid.className = "advancement-grid history-grid";

  const head = document.createElement("div");
  head.className = "adv-row adv-head";
  head.appendChild(labelSpan(""));
  for (const tier of tiers) {
    const cell = document.createElement("span");
    cell.className = "adv-tier-group";
    cell.textContent = `Tier ${tier}`;
    head.appendChild(cell);
  }
  grid.appendChild(head);

  // The character as they stand, not as they stood: this grid is their sheet, and the row
  // builder's own merge of declared-and-marked slots is what keeps a spent box on it even when
  // nothing declares that row any more.
  for (const option of advancementOptionsFor(ch, db)) {
    const key = option.key;
    const row = document.createElement("div");
    row.className = "adv-row";
    row.appendChild(labelSpan(option.label));

    for (const tier of tiers) {
      const cell = document.createElement("span");
      cell.className = "adv-tier-group";
      const total = option.slots[tier];
      if (total === 0) {
        cell.textContent = "—";
        cell.classList.add("adv-tier-empty");
        row.appendChild(cell);
        continue;
      }
      // Slots marked before recording started have no level to show, so they read as a
      // plain filled box rather than pretending to a level they can't know.
      const levels = markedAt[key]?.[tier] || [];
      const unattributed = Math.max(0, (ch.baseline?.slotsUsed?.[key]?.[tier] || 0));
      // Struck through from the end of the row: a slot the rules took away, because you
      // multiclassed or upgraded your subclass in this tier.
      const crossedFrom = total - (option.crossedOut?.[tier] || 0);
      for (let i = 0; i < total; i++) {
        const box = document.createElement("span");
        box.className = "slot-box";
        if (i >= crossedFrom) {
          box.classList.add("crossed");
          box.title = option.crossedBy?.[tier] === "multiclass"
            ? "Crossed out: this character multiclassed"
            : "Crossed out: the subclass upgrade for this tier is taken";
        } else if (i < unattributed) {
          box.classList.add("filled");
          box.title = "Marked before level history was recorded";
        } else if (i - unattributed < levels.length) {
          const lv = levels[i - unattributed];
          box.classList.add("filled", "numbered");
          box.textContent = CIRCLED[lv] || lv;
          box.title = `Marked at level ${lv}`;
        } else {
          box.classList.add("open");
        }
        cell.appendChild(box);
      }
      row.appendChild(cell);
    }
    grid.appendChild(row);
  }
  return grid;
}

function labelSpan(text) {
  const span = document.createElement("span");
  span.className = "adv-label";
  span.textContent = text;
  return span;
}

function levelHistoryRow(ch, entry, problem, isLast) {
  const row = document.createElement("div");
  row.className = "level-row" + (problem && !problem.accepted ? " flagged" : "");

  const main = document.createElement("div");
  main.className = "level-row-main";
  const parts = describeLevelUp(ch, entry, db);
  const cards = describeCards(ch, entry, db);
  const flag = problem && !problem.accepted ? "⚠ " : "";
  const accepted = entry.acceptedAsIs ? ` <span class="level-accepted">✓ kept as is</span>` : "";
  main.innerHTML = `<strong>L${escapeHtml(entry.level)}</strong> ${escapeHtml(flag)}${escapeHtml(parts.join(" · ") || "(nothing recorded)")}${accepted}` +
    cards.map((c) => `<div class="level-row-sub">${escapeHtml(c)}</div>`).join("");
  if (problem) {
    for (const err of problem.errors) {
      main.innerHTML += `<div class="level-row-error">└ ${escapeHtml(err)}</div>`;
    }
  }
  row.appendChild(main);

  const actions = document.createElement("div");
  actions.className = "level-row-actions";

  if (pendingRemoveLevel === entry.level) {
    const text = document.createElement("span");
    text.className = "confirm-text";
    text.textContent = `Remove level ${entry.level}? Stats go back to level ${entry.level - 1}.`;
    actions.appendChild(text);
    actions.appendChild(button("Yes, remove", "btn-danger btn-small", () => removeLevel(ch, entry.level)));
    actions.appendChild(button("Cancel", "btn-ghost btn-small", () => { pendingRemoveLevel = null; renderAll(); }));
  } else {
    const edit = document.createElement("a");
    edit.className = "btn-small";
    edit.href = `level-up.html?id=${ch.id}&level=${entry.level}`;
    edit.textContent = problem && !problem.accepted ? "Fix" : "Edit";
    actions.appendChild(edit);

    if (problem && !problem.accepted) {
      actions.appendChild(button("Keep as is", "btn-ghost btn-small", () => {
        entry.acceptedAsIs = true;
        saveCharacters();
        renderAll();
      }));
    }
    if (isLast) {
      actions.appendChild(button("Remove", "btn-ghost btn-small", () => { pendingRemoveLevel = entry.level; renderAll(); }));
    }
  }
  row.appendChild(actions);
  return row;
}

function button(label, className, onClick) {
  const b = document.createElement("button");
  b.className = className;
  b.textContent = label;
  b.addEventListener("click", onClick);
  return b;
}

function renderLevelHistory(container, ch) {
  const entries = [...(ch.levelUps || [])].sort((a, b) => a.level - b.level);
  const problems = validateLevelUps(ch, db);
  const problemFor = (level) => problems.find((p) => p.level === level);
  const unresolved = problems.filter((p) => !p.accepted).length;

  const details = document.createElement("details");
  details.className = "level-history";
  details.open = historyOpen;
  details.addEventListener("toggle", () => { historyOpen = details.open; });

  const summary = document.createElement("summary");
  const count = entries.length;
  summary.textContent = `Level history (${count} recorded level${count === 1 ? "" : "s"})` +
    (unresolved ? ` · ⚠ ${unresolved} need${unresolved === 1 ? "s" : ""} attention` : "");
  details.appendChild(summary);

  if (ch.level > 1) details.appendChild(renderHistoryGrid(ch));

  const list = document.createElement("div");
  list.className = "level-list";

  // Levels reached before choices were recorded can't be broken down, so they're one row
  // that says so rather than rows guessing at what was picked.
  if (ch.baselineLevel > 1) {
    const row = document.createElement("div");
    row.className = "level-row";
    row.innerHTML = `<div class="level-row-main"><strong>L1–${escapeHtml(ch.baselineLevel)}</strong> <span class="hint">reached before level history was recorded, so these choices can't be changed</span></div>`;
    list.appendChild(row);
  } else {
    const row = document.createElement("div");
    row.className = "level-row";
    row.innerHTML = `<div class="level-row-main"><strong>L1</strong> Character creation</div>`;
    const actions = document.createElement("div");
    actions.className = "level-row-actions";
    const edit = document.createElement("a");
    edit.className = "btn-small";
    edit.href = `create.html?id=${ch.id}`;
    edit.textContent = "Edit";
    actions.appendChild(edit);
    row.appendChild(actions);
    list.appendChild(row);
  }

  entries.forEach((entry, i) => {
    list.appendChild(levelHistoryRow(ch, entry, problemFor(entry.level), i === entries.length - 1));
  });

  if (entries.length === 0 && ch.baselineLevel > 1) {
    const hint = document.createElement("p");
    hint.className = "hint";
    hint.textContent = "Levels gained from now on will be recorded here and can be changed afterwards.";
    list.appendChild(hint);
  }

  details.appendChild(list);

  if (loadUndo(ch.id)) {
    const undoRow = document.createElement("div");
    undoRow.className = "level-undo";
    undoRow.appendChild(button("Undo last level edit", "btn-ghost btn-small", () => undoLastEdit(ch)));
    details.appendChild(undoRow);
  }

  container.appendChild(details);
}

function removeLevel(ch, level) {
  saveUndo(ch);
  ch.levelUps = (ch.levelUps || []).filter((e) => e.level !== level);
  ch.experiences = (ch.experiences || []).filter((e) => e.sinceLevel < level);
  ch.level = level - 1;
  recomputeCharacter(ch);
  ch.updatedAt = new Date().toISOString();
  pendingRemoveLevel = null;
  saveCharacters();
  renderAll();
}

// A single undo slot, so a cascade of fixes can be walked back one step. It holds only the
// recorded truth: the derived stats come back from replaying it.
function saveUndo(ch) {
  const snapshot = {
    id: ch.id,
    at: new Date().toISOString(),
    levelUps: JSON.parse(JSON.stringify(ch.levelUps || [])),
    experiences: JSON.parse(JSON.stringify(ch.experiences || [])),
    level: ch.level,
    baseline: JSON.parse(JSON.stringify(ch.baseline)),
    baselineLevel: ch.baselineLevel,
    creationDomainCardIds: [...(ch.creationDomainCardIds || [])],
    domainVaultIds: [...(ch.domainVaultIds || [])],
  };
  try {
    localStorage.setItem(UNDO_STORAGE_KEY, JSON.stringify(snapshot));
  } catch {
    // storage full or unavailable: undo is a convenience, never block the edit for it
  }
}

function loadUndo(charId) {
  try {
    const raw = localStorage.getItem(UNDO_STORAGE_KEY);
    if (!raw) return null;
    const snap = JSON.parse(raw);
    return snap && snap.id === charId ? snap : null;
  } catch {
    return null;
  }
}

function undoLastEdit(ch) {
  const snap = loadUndo(ch.id);
  if (!snap) return;
  ch.levelUps = snap.levelUps;
  ch.experiences = snap.experiences;
  ch.level = snap.level;
  ch.baseline = snap.baseline;
  ch.baselineLevel = snap.baselineLevel;
  ch.creationDomainCardIds = snap.creationDomainCardIds;
  ch.domainVaultIds = snap.domainVaultIds;
  recomputeCharacter(ch);
  ch.updatedAt = new Date().toISOString();
  localStorage.removeItem(UNDO_STORAGE_KEY);
  saveCharacters();
  renderAll();
}

function renderDetail() {
  const ch = characters.find((c) => c.id === openId);
  const container = document.getElementById("character-detail");
  if (!ch) {
    container.innerHTML = "";
    container.style.display = "none";
    return;
  }
  container.style.display = "block";
  container.innerHTML = "";

  const closeBtn = document.createElement("button");
  closeBtn.className = "btn-ghost";
  closeBtn.textContent = "← Back to list";
  closeBtn.addEventListener("click", showList);
  container.appendChild(closeBtn);

  const cls = findClass(ch.classId);
  const sub = findSubclass(ch.subclassId);

  const header = document.createElement("div");
  header.className = "detail-header";
  const mcSub = findSubclass(ch.multiclass?.subclassId);
  const mcLine = ch.multiclass
    ? ` · Multiclass: ${classLine(ch).split(" / ")[1] || "?"}${mcSub ? ` (${mcSub.name["en-US"]})` : ""}, ${titleCase(ch.multiclass.domain)}`
    : "";
  header.innerHTML = `<h2>${escapeHtml(ch.name || "(unnamed)")}</h2>` +
    `<p>${escapeHtml(ch.pronouns || "")} · Level ${escapeHtml(ch.level)}${escapeHtml(mcLine)}</p>`;
  if (ch.portrait) {
    const face = document.createElement("img");
    face.className = "detail-portrait";
    face.src = ch.portrait;
    face.alt = "";
    header.prepend(face);
  }
  container.appendChild(header);

  // Levelling up on top of choices that no longer add up just compounds the problem, so
  // it waits until they're either fixed or explicitly kept.
  const blocking = unresolvedProblems(ch, db);
  if (blocking.length > 0) {
    const banner = document.createElement("p");
    banner.className = "warn-banner";
    const levels = blocking.map((p) => `level ${p.level}`).join(", ");
    banner.textContent = `⚠ Choices at ${levels} no longer add up. Open Level history below to fix them, or keep them as they are.`;
    container.appendChild(banner);
  }

  // The app is deliberately quiet about data it can't find — derivedStats() returns null rather
  // than throwing — so without this a character built on a source folder that has since been
  // renamed prints a sheet headed "Class" with quietly wrong numbers and nothing to explain it.
  const missing = missingContent(ch);
  if (missing.length > 0) {
    const banner = document.createElement("p");
    banner.className = "warn-banner";
    const kinds = [...new Set(missing.map((m) => m.kind))].join(", ");
    banner.textContent = `⚠ ${plural(missing.length, "reference")} not in your content (${kinds}). ` +
      "A source folder this character was built with may be switched off, renamed or missing.";
    container.appendChild(banner);
  }

  if (ch.level < 10) {
    const levelUpBtn = document.createElement("a");
    levelUpBtn.className = "btn-primary";
    levelUpBtn.href = `level-up.html?id=${ch.id}`;
    levelUpBtn.textContent = "Level Up";
    levelUpBtn.style.display = "inline-block";
    levelUpBtn.style.marginBottom = "0.75rem";
    if (blocking.length > 0) {
      levelUpBtn.classList.add("disabled-link");
      levelUpBtn.removeAttribute("href");
      levelUpBtn.title = "Resolve the flagged levels before gaining a new one.";
    }
    container.appendChild(levelUpBtn);
  }

  const playLink = document.createElement("a");
  playLink.className = "btn-ghost detail-print-link" + (ch.level < 10 ? " detail-print-link--spaced" : "");
  playLink.href = `play.html?id=${ch.id}`;
  playLink.textContent = "Play";
  container.appendChild(playLink);

  const printSheetLink = document.createElement("a");
  printSheetLink.className = "btn-ghost detail-print-link";
  printSheetLink.href = `sheet.html?id=${ch.id}`;
  printSheetLink.textContent = "Print sheet";
  container.appendChild(printSheetLink);

  // Beside Print sheet, because it's another way to get this character onto paper and the sheet
  // is deliberately art-free. Detail view only: the roster row already carries four
  // buttons and a fifth wraps on a narrow screen, and the toolbar above the roster is for
  // exports that cover every character, which this one can't be — it's one character's deck.
  // Borrowing .detail-print-link because .btn-ghost is width: 100% and would otherwise drop
  // this onto a line of its own; --spaced for the gap from the link it follows.
  container.appendChild(button(
    "Export cards (PDF)",
    "btn-ghost detail-print-link detail-print-link--spaced",
    () => openCardPdfModal(ch),
  ));

  // Third way onto paper, and the only one that isn't always here: filling the official sheet
  // needs the official sheet, which is a copyrighted PDF that a public fork can't ship, so
  // data/sheet/ is a symlink most people won't have. Absent rather than present-and-explaining —
  // an export that can only ever tell you why it can't run isn't an export, and "what would I
  // have to own to use this" is a README question, the way the card art already is (README:80).
  //
  // The flag is resolved in init() rather than read from a promise here, which is what keeps this
  // render synchronous; that's the whole reason it's a module-level boolean and not a call.
  if (sheetTemplateInstalled) {
    container.appendChild(button(
      "Fill official sheet (PDF)",
      "btn-ghost detail-print-link detail-print-link--spaced",
      () => openSheetPdfPicker(ch),
    ));
  }

  const portraitBtn = document.createElement("button");
  portraitBtn.type = "button";
  portraitBtn.className = "btn-ghost detail-print-link";
  portraitBtn.textContent = ch.portrait ? "Replace portrait" : "Add portrait";
  portraitBtn.addEventListener("click", () => pickPortrait(ch.id));
  container.appendChild(portraitBtn);

  if (ch.portrait) {
    const dropBtn = document.createElement("button");
    dropBtn.type = "button";
    dropBtn.className = "btn-ghost detail-print-link";
    dropBtn.textContent = "Remove portrait";
    dropBtn.addEventListener("click", () => {
      const before = ch.portrait;
      delete ch.portrait;
      let saved = false;
      try {
        saved = savePortrait(ch.id, null);
      } catch {
        saved = false;
      }
      if (!saved) {
        ch.portrait = before;
        portraitProblem("The portrait couldn't be removed — the character may have been removed in another tab.");
        return;
      }
      renderAll();
    });
    container.appendChild(dropBtn);
  }

  const cardsRow = document.createElement("div");
  cardsRow.className = "tile-grid";
  // Every subclass card the character has, not just the newest: a Specialization or Mastery
  // upgrade adds a card to the subclass, it doesn't replace the one below it, and the features
  // on the earlier cards are still in play.
  if (sub) {
    for (const tier of subclassTiersUpTo(ch.subclassTier)) {
      cardsRow.appendChild(cardBlock({ id: sub.id, name: `${sub.name["en-US"]} (${SUBCLASS_TIER_LABELS[tier]})`, art: subclassCardArtPath(sub, tier), type: "Subclass", features: sub[tier]?.features }));
    }
  }
  // The multiclass's subclass cards, next to the ones they sit beside on paper. Its own ladder:
  // a subclass upgrade can name either subclass, so this one can reach Specialization too.
  if (mcSub) {
    for (const tier of subclassTiersUpTo(ch.multiclass.tier || "foundation")) {
      cardsRow.appendChild(cardBlock({
        id: mcSub.id, name: `${mcSub.name["en-US"]} (${SUBCLASS_TIER_LABELS[tier]})`,
        art: subclassCardArtPath(mcSub, tier), type: "Subclass", features: mcSub[tier]?.features,
      }, `Multiclass: ${mcSub.name["en-US"]} (${SUBCLASS_TIER_LABELS[tier]})`));
    }
  }

  const com = findCommunity(ch.heritage.communityId);
  if (com) cardsRow.appendChild(cardBlock({ id: com.id, name: com.name["en-US"], art: communityCardArtPath(com), type: "Community", features: com.features }, `Community: ${com.name["en-US"]}`));
  for (const ancId of ch.heritage.ancestryIds) {
    const anc = findAncestry(ancId);
    if (anc) cardsRow.appendChild(cardBlock({ id: anc.id, name: anc.name["en-US"], art: ancestryCardArtPath(anc), type: "Ancestry", features: anc.features }, `Ancestry: ${anc.name["en-US"]}`));
  }
  // With the ancestry cards, which is where the rules put it: a transformation card joins the
  // loadout "as if it were part of your character's ancestry".
  const transformation = findTransformation(ch.transformationId);
  if (transformation) {
    cardsRow.appendChild(cardBlock({
      id: transformation.id, name: transformation.name["en-US"],
      art: transformationCardArtPath(transformation),
      type: "Transformation", features: transformation.features,
    }, `Transformation: ${transformation.name["en-US"]}`));
  }
  container.appendChild(cardsRow);

  // A transformation is usually handed out mid-campaign rather than chosen at creation, so the
  // wizard step for it needs a way in from here — the same deep link the equipment block gets.
  // Only when there's something to pick or something to clear: with no transformations loaded
  // the wizard has no such step to link to.
  if (db.transformations.length > 0 || ch.transformationId) {
    const changeTransformation = button(
      transformation ? "Change transformation" : "Add a transformation",
      "btn-small",
      () => { location.href = `create.html?id=${ch.id}&step=transformation`; },
    );
    container.appendChild(changeTransformation);
  }

  const summary = document.createElement("div");
  summary.className = "detail-summary";
  summary.innerHTML = `
    <p><strong>Class:</strong> ${cls ? escapeHtml(titleCase(cls.name)) : "—"} ${sub ? "— " + escapeHtml(sub.name["en-US"]) : ""}</p>
    <p><strong>Ancestry:</strong> ${ch.heritage.ancestryMode === "mixed" ? "Mixed ancestry" : "Pure ancestry"} — features: ${escapeHtml(ch.heritage.chosenFeatures.map((f) => f.featureName).join(", ")) || "—"}</p>
  `;
  container.appendChild(summary);

  // What the class actually does, in full, right under the line naming it.
  //
  // Every other source of features on this screen has a card above: the subclass, the community,
  // the ancestry, the transformation, each printing its own text either in its art or in the CSS
  // fallback. The class has no card, so until this its features were the one part of a character
  // with nowhere to appear — a Brawler could read their Evasion here without ever meeting the
  // feature that set it.
  //
  // Inline rather than behind the wizard's ⓘ popover: this is the screen you read at the table,
  // and something you have to know to open is how these went unnoticed in the first place. The
  // popover is untouched and still the right thing where it is, comparing classes you haven't
  // chosen yet.
  const classFeatures = classFeatureSections(cls);
  if (classFeatures.length > 0) {
    const box = document.createElement("div");
    box.className = "class-detail detail-class-features";
    for (const section of classFeatures) box.appendChild(section);
    container.appendChild(box);
  }

  // The second class's, in a box of their own rather than folded into the first's: the heading
  // above says which class they came from, and a multiclass grants no Hope feature.
  const mcClass = findClass(ch.multiclass?.classId);
  if (mcClass) {
    const box = document.createElement("div");
    box.className = "class-detail detail-class-features";
    const heading = document.createElement("h4");
    heading.textContent = `From multiclassing into ${titleCase(mcClass.name)}`;
    box.appendChild(heading);
    for (const section of classFeatureSections({ classFeatures: mcClass.classFeatures })) box.appendChild(section);
    container.appendChild(box);
  }

  const stats = derivedStats(ch, db);

  const statsBox = document.createElement("div");
  statsBox.className = "derived-box";
  for (const [key, label] of Object.entries(TRAIT_LABELS)) {
    const t = stats.traits[key];
    statsBox.appendChild(statLine(label, t.total === null ? "—" : signed(t.total), t));
  }
  container.appendChild(statsBox);

  const statsBox2 = document.createElement("div");
  statsBox2.className = "derived-box";
  statsBox2.appendChild(statLine("Proficiency", stats.proficiency.total, stats.proficiency));
  statsBox2.appendChild(statLine("Evasion", stats.evasion ? stats.evasion.total : "—", stats.evasion));
  statsBox2.appendChild(statLine("Hit Points", stats.hitPoints ? stats.hitPoints.total : "—", stats.hitPoints));
  statsBox2.appendChild(statLine("Stress", stats.stress.total, stats.stress));
  statsBox2.appendChild(statLine("Hope", `${STARTING_HOPE} / ${MAX_HOPE}`));
  if (stats.armorScore) {
    statsBox2.appendChild(statLine("Armor Score", stats.armorScore.total, stats.armorScore));
  }
  if (stats.majorThreshold && stats.severeThreshold) {
    statsBox2.appendChild(statLine(
      "Damage thresholds",
      `${stats.majorThreshold.total} / ${stats.severeThreshold.total}`,
      {
        total: `${stats.majorThreshold.total} / ${stats.severeThreshold.total}`,
        parts: [
          ...stats.majorThreshold.parts.map((p) => ({ label: `Major — ${p.label}`, value: p.value })),
          ...stats.severeThreshold.parts.map((p) => ({ label: `Severe — ${p.label}`, value: p.value })),
        ],
      },
    ));
  }
  // A weapon whose attack has no number still gets its row, printing "—" the way Evasion and Hit
  // Points do above and the way the printed sheet always has. There are two ways to arrive there
  // and both deserve to be visible rather than to make a row disappear: a character whose traits
  // aren't assigned yet, and a Warrior, Guardian or Brawler in an Arcane-Frame Wheelchair, whose
  // trait is a Spellcast trait they don't have. The magic-weapon warning below says why for the
  // second; a row that vanishes says nothing for either.
  //
  // Keyed on the SLOT, not on the stat: an empty slot prints nothing, because a secondary weapon
  // is optional and "Secondary attack —" on every character who chose not to carry one is noise,
  // not information. `unarmedProfile` is a filled primary slot — fighting bare-handed is a
  // choice the rules have an answer for.
  //
  // display ?? signed(total), because an attack with alternatives instead of a total carries a
  // string, and signed(undefined) would print the word "undefined".
  const attackValue = (attack) => (attack ? attack.display ?? signed(attack.total) : "—");
  if (ch.equipment?.primaryWeaponId) {
    statsBox2.appendChild(statLine("Primary attack", attackValue(stats.primaryAttack), stats.primaryAttack));
  }
  if (ch.equipment?.secondaryWeaponId) {
    statsBox2.appendChild(statLine("Secondary attack", attackValue(stats.secondaryAttack), stats.secondaryAttack));
  }
  if (stats.spellcast) {
    statsBox2.appendChild(statLine("Spellcast", stats.spellcast.display, stats.spellcast));
  }
  // A die a class rolls — a Rally Die, an Unstoppable Die. A string rather than a number, which
  // statLine and the popover both take unchanged: signed() leaves anything non-numeric alone, and
  // the Total row is skipped for a value that isn't a sum, exactly as it is for Spellcast.
  for (const track of stats.tracks || []) {
    statsBox2.appendChild(statLine(track.label, track.value, track));
  }
  container.appendChild(statsBox2);

  renderStatNotes(container, ch, stats);

  renderLevelHistory(container, ch);

  if (ch.domainCardIds.length > 0) {
    const dcHeader = document.createElement("h3");
    const activeIds = activeDomainCardIds(ch);
    dcHeader.textContent = `Domain Cards — Loadout (${activeIds.length}/5) · Vault (${ch.domainVaultIds.length})`;
    container.appendChild(dcHeader);
    const dcGrid = document.createElement("div");
    dcGrid.className = "tile-grid";
    for (const cardId of ch.domainCardIds) {
      const dc = findDomainCard(cardId);
      if (!dc) continue;
      const inVault = ch.domainVaultIds.includes(cardId);
      const wrap = document.createElement("div");
      wrap.className = "card-tile";
      wrap.appendChild(renderCardArt({ id: dc.id, name: dc.name["en-US"], art: domainCardArtPath(dc),
        level: dc.level, recallCost: dc.recallCost, type: dc.type, features: dc.features }));
      const label = document.createElement("div");
      label.className = "card-tile-label";
      label.textContent = dc.name["en-US"];
      wrap.appendChild(label);
      const toggleBtn = document.createElement("button");
      toggleBtn.className = "btn-small";
      toggleBtn.textContent = inVault ? "→ Loadout" : "→ Vault";
      toggleBtn.disabled = inVault && activeIds.length >= 5;
      // renderAll() rather than swapping this one tile: what's in the loadout is an input to
      // the stats above (a *-Touched card's bonus switches on at four cards from its domain,
      // Untouchable's Evasion goes away the moment it's vaulted), so the whole sheet has to
      // be re-derived, not just this button's label.
      toggleBtn.addEventListener("click", () => {
        if (inVault) ch.domainVaultIds = ch.domainVaultIds.filter((id) => id !== cardId);
        else ch.domainVaultIds.push(cardId);
        saveCharacters();
        renderAll();
      });
      wrap.appendChild(toggleBtn);
      dcGrid.appendChild(wrap);
    }
    container.appendChild(dcGrid);
  }

  const eq = ch.equipment;
  // stats.unarmedProfile is the profile a bare-handed character is actually swinging — the SRD's,
  // or one a class feature put in its place — and null when they're carrying something.
  const primary = stats.unarmedProfile || findWeapon(eq.primaryWeaponId);
  const secondary = findWeapon(eq.secondaryWeaponId);
  // A character who chose to wear nothing says so, rather than showing the same dash as one
  // who hasn't picked yet.
  const unarmored = eq.armorId === UNARMORED;
  const armor = unarmored ? { name: { "en-US": "Unarmored" } } : findArmor(eq.armorId);
  const potion = findConsumable(eq.potionChoice);
  const eqBox = document.createElement("div");
  eqBox.className = "detail-summary";
  // A slot the sheet doesn't draw is a slot the player forgets they can fill, so an empty
  // secondary says so rather than vanishing. The stats under each name are the ones that used
  // to be visible only while picking the thing.
  const gearLine = (label, item, stats) => `
    <p><strong>${label}:</strong> ${item ? escapeHtml(item.name["en-US"]) : "—"}
    ${item && stats ? `<span class="gear-stats">${escapeHtml(stats)}</span>` : ""}
    ${item ? featureLine(item) : ""}</p>`;
  eqBox.innerHTML =
    gearLine("Primary weapon", primary, weaponStats(primary)) +
    gearLine("Secondary weapon", secondary, weaponStats(secondary)) +
    gearLine("Armor", armor, armorStats(armor)) +
    gearLine("Potion", potion, "");

  for (const warning of [
    burdenWarning(primary, secondary, ignoresBurden(ch, db)),
    // The magic-weapon rule is about what you EQUIPPED, so a bare-handed character is judged on
    // nothing rather than on the profile a class feature handed them: a class that grants you
    // magic fists is the same class that says you may use them.
    magicWeaponWarning(stats.unarmedProfile ? null : primary, secondary, spellcastTraitKeys(ch, db)),
  ]) {
    if (!warning) continue;
    const p = document.createElement("p");
    p.className = "hint";
    p.textContent = `⚠ ${warning}`;
    eqBox.appendChild(p);
  }

  // Equipment is the one part of a character the sheet sends you back to the wizard for, so
  // send you to the right step rather than to the start of it.
  const changeBtn = button("Change equipment", "btn-small", () => {
    location.href = `create.html?id=${ch.id}&step=equipment`;
  });
  eqBox.appendChild(changeBtn);
  container.appendChild(eqBox);

  const expBox = document.createElement("div");
  expBox.className = "detail-summary";
  const expHeading = document.createElement("p");
  expHeading.innerHTML = "<strong>Experience:</strong>";
  expBox.appendChild(expHeading);
  const expList = document.createElement("div");
  expList.className = "derived-box";
  for (const exp of stats.experiences) {
    expList.appendChild(statLine(exp.name || "(unnamed)", `+${exp.total}`, exp.parts.length > 1 ? exp : null));
  }
  expBox.appendChild(expList);
  container.appendChild(expBox);

  if (ch.background.description || ch.background.answers) {
    const bgBox = document.createElement("div");
    bgBox.className = "detail-summary";
    bgBox.innerHTML = `
      ${ch.background.description ? `<p><strong>Background:</strong> ${escapeHtml(ch.background.description)}</p>` : ""}
      ${ch.background.answers ? `<p><strong>Appearance:</strong> ${escapeHtml(ch.background.answers)}</p>` : ""}
    `;
    container.appendChild(bgBox);
  }

  if (ch.connectionsNotes) {
    const connBox = document.createElement("div");
    connBox.className = "detail-summary";
    connBox.innerHTML = `<p><strong>Connections:</strong> ${escapeHtml(ch.connectionsNotes)}</p>`;
    container.appendChild(connBox);
  }

  const editBtn = document.createElement("button");
  editBtn.className = "btn-primary";
  editBtn.textContent = "Edit";
  editBtn.addEventListener("click", () => { location.href = `create.html?id=${ch.id}`; });
  container.appendChild(editBtn);
}

// Two things the numbers above can't say for themselves.
//
// The first is the choices a feature asked for and never got an answer to — a character built
// before this app read those features has none of them recorded. It's a nudge, never a block.
//
// The second is the opposite: bonuses the character genuinely has but that aren't in the
// totals, because they need an action in play. Without this, someone with four Codex cards
// meets Codex-Touched's requirement, sees nothing change, and reasonably concludes it's broken.
function renderStatNotes(container, ch, stats) {
  const pending = unresolvedChoices(ch, db);
  if (pending.length > 0) {
    const box = document.createElement("div");
    box.className = "problem-box";
    box.innerHTML = `<strong>Still to choose:</strong>` +
      pending.map((p) => `<div>└ ${escapeHtml(p.prompt)}</div>`).join("") +
      `<div class="hint">Until you pick, these grant nothing. Level up screen for cards; Edit → Experience for ancestry features.</div>`;
    container.appendChild(box);
  }

  if (stats.exclusions.length > 0) {
    const note = document.createElement("details");
    note.className = "exchange-section";
    const summary = document.createElement("summary");
    summary.textContent = `${stats.exclusions.length} bonus${stats.exclusions.length === 1 ? "" : "es"} you have but that aren't counted above`;
    note.appendChild(summary);
    const hint = document.createElement("p");
    hint.className = "hint";
    hint.textContent = "These stats only count what's true from your choices and your loadout. " +
      "Anything you have to spend, act or rest for is left out, because it isn't on at the moment you look:";
    note.appendChild(hint);
    const list = document.createElement("ul");
    for (const reason of stats.exclusions) {
      const li = document.createElement("li");
      li.textContent = reason;
      list.appendChild(li);
    }
    note.appendChild(list);
    container.appendChild(note);
  }
}

// The heading names what you're looking at, which on this page is either the roster or one
// character. That's what frees the words "My Characters" to mean only the nav link — before
// this they sat in the heading on the left here and in the nav on the right everywhere else,
// working in one place and not the other.
function renderTitle() {
  const ch = characters.find((c) => c.id === openId);
  const label = ch ? (ch.name || "(unnamed)") : "My Characters";
  document.querySelector(".topbar h1 span").textContent = label;
  document.title = `Daggerheart — ${label}`;
}

// Back to the roster. Not a navigation: the detail view is this page with `openId` set, so this
// clears it and re-renders rather than reloading and re-reading every content source.
//
// The query string has to go with it. Level up sends you back to `characters.html?id=…&history=1`
// and nothing has cleared it since, so leaving it in place means a refresh silently reopens the
// character you just closed.
function showList() {
  openId = null;
  const url = new URL(location.href);
  for (const key of ["id", "open", "history"]) url.searchParams.delete(key);
  history.replaceState(null, "", url.pathname + url.search);
  renderAll();
}

function renderAll() {
  renderTitle();
  renderList();
  renderDetail();
  document.getElementById("characters-list").style.display = openId ? "none" : "block";
}

// ---------- CSV export for the GM ----------
//
// The columns and the escaping live in shared/csv-export.js, which is DOM-free and tested.
// What's left here is the parts that need a page: asking which export you want, and saving it.

// One sentence, two pickers: the CSV export and the official-sheet export ask the same question
// for the same reason, and two copies of it would drift apart the first time either is reworded.
const LOADOUT_HINT = "Your loadout changes at every rest, so the bonuses it grants go stale on " +
  "a printed sheet. Permanent only leaves them out, as if every card were in your vault.";

// One row too, and for a sharper reason than the hint. The labels, their order and which one is
// primary were character-for-character identical in the two pickers: reword the question in one
// copy and you get two wordings, which reads as sloppy, but reorder the buttons in one copy and
// the app asks the same question with the primary button meaning the opposite thing in two modals
// one click apart. `onPick` is handed the choice; what happens to the modal afterwards is the
// caller's business, and the two callers differ on it.
//
// Two sheets are possible and they disagree about the numbers, so the export asks rather than
// picking. "Permanent only" leads because a printed sheet outlives the loadout that produced it:
// the loadout is re-chosen at every rest, so the bonuses it adds are wrong by the next session.
// Permanent isn't frozen either — Full Plate bought at downtime moves Armor Score, the thresholds,
// Agility and Evasion with no level-up in sight ("armor:Very Heavy" in effects.js) — it's the half
// that doesn't turn over at every rest, which is all the ordering claims. This used to lead with
// "With loadout bonuses" on the grounds that it matches what every other screen shows, which was
// true and beside the point: a screen re-renders when the loadout changes, and paper doesn't.
function loadoutChoiceRow(onPick) {
  const row = document.createElement("div");
  row.className = "export-choices";
  for (const [label, loadout, cls] of [
    ["Permanent only", false, "btn-primary"],
    ["With loadout bonuses", true, "btn-ghost"],
  ]) {
    row.appendChild(button(label, cls, () => onPick(loadout)));
  }
  return row;
}

function openExportPicker() {
  const body = document.createElement("div");
  const hint = document.createElement("p");
  hint.className = "hint";
  hint.textContent = LOADOUT_HINT;
  body.appendChild(hint);

  // Closed on the way through: writing a CSV is a string and a Blob, so there is no failure left
  // to report and nothing this body would be needed for.
  body.appendChild(loadoutChoiceRow((loadout) => {
    closePopover();
    downloadCsv(loadout);
  }));

  openModal("Export CSV for the GM", body);
}

// The only thing in the app that writes a file. All four exports go through it: the CSV and the
// transfer file hand it a string, the card PDF and the official sheet hand it a Uint8Array. Blob
// takes either without being told which, so nothing here has to branch — hence `data`, not `text`.
function downloadFile(filename, data, mime) {
  const blob = new Blob([data], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function downloadCsv(loadout) {
  const stamp = dateStamp();
  downloadFile(
    // Suffixed, so exporting both ways doesn't leave two files fighting over one name.
    `daggerheart-characters-${stamp}${loadout ? "" : "-permanent"}.csv`,
    "\ufeff" + buildCsv(characters, db, { loadout }), // BOM so Excel recognizes accented characters
    "text/csv;charset=utf-8;",
  );
}

// ---------- card PDF export ----------
//
// Everything with a rule in it — which cards a character owns, where they land on the page,
// what the generated stats and class cards say — is in card-pdf.js and the pure modules it
// calls. What's left here is the parts that need a page: the button, the progress the render
// reports back, and saving the bytes.

// No format picker, unlike the CSV: there is nothing to ask. Every card the character owns
// goes in, vault included, so once you've printed and cut them you own the physical objects
// and swapping a loadout never means a reprint. One button, one action.
function openCardPdfModal(ch) {
  const body = document.createElement("div");

  const hint = document.createElement("p");
  hint.className = "hint";
  hint.textContent = "Every card this character owns — loadout and vault alike — plus a stats " +
    "card and the class features, nine to a US Letter page with crop marks.";
  body.appendChild(hint);

  const wrap = document.createElement("div");
  wrap.className = "export-progress";
  // Created with neither max nor value, so it renders indeterminate until the first card
  // reports in — which is the honest state. How many cards there are is the card sheet's
  // answer, arriving with that first callback; a bar starting at 0 of a guessed maximum would
  // be a lie that then visibly jumps when the real total lands.
  const bar = document.createElement("progress");
  const line = document.createElement("p");
  line.className = "hint";
  line.textContent = "Reading your cards…";
  wrap.appendChild(bar);
  wrap.appendChild(line);
  body.appendChild(wrap);

  openModal("Export cards (PDF)", body);
  runCardPdf(ch, body, bar, line);
}

// Split out so the modal above is just markup: this is the half that can fail. Each card is an
// image decode plus a JPEG encode, both of which yield, so the bar repaints on its own without
// anything here having to hand control back to the browser.
async function runCardPdf(ch, body, bar, line) {
  let result;
  try {
    result = await buildCardPdf(ch, db, {
      onProgress: (done, total, title) => {
        bar.max = total;
        bar.value = done;
        line.textContent = title
          ? `Rendering card ${done} of ${total} — ${title}`
          : `Rendering card ${done} of ${total}`;
      },
    });
  } catch (err) {
    showExportProblem(body, "The cards couldn't be rendered, so nothing was saved. " +
      (err && err.message ? err.message : String(err)));
    return;
  }

  // A character with nothing chosen yet would export a page of blank slots, so say so instead
  // of saving one. Read off the result rather than counted again up here: which cards exist is
  // the card sheet's answer to give, and a second opinion is a second thing to get wrong.
  if (!result.cardCount) {
    showExportProblem(body, "There are no cards to print yet. Pick a class, an ancestry and at " +
      "least one domain card, then export again.");
    return;
  }

  downloadFile(cardPdfFilename(ch), result.bytes, "application/pdf");
  showCardPdfAdvice(body, result);
}

// Every ending rewrites the body of the modal that's already open rather than opening a new
// one. If the render outlasted the modal — Escape, or the close button — this body is detached
// and writing to it does nothing, which is the right outcome: reopening would shove a panel
// back over whatever the user went off and did instead.
//
// Named for exports rather than for cards because both PDF exports fail into it, and the answer
// is the same either way: a problem box and a Close button. A second copy under a second name
// would be two places to fix the day the wording or the class name changes.
function showExportProblem(body, message) {
  body.innerHTML = "";
  const box = document.createElement("div");
  box.className = "problem-box";
  box.textContent = message;
  body.appendChild(box);
  appendExportClose(body);
}

// The modal stays open on success. A self-closing one would fire the download and take the
// print settings away with it in the same instant, and those settings are the difference
// between cards that fit a card sleeve and cards that don't.
function showCardPdfAdvice(body, result) {
  body.innerHTML = "";

  const advice = document.createElement("p");
  advice.appendChild(document.createTextNode(
    `${plural(result.cardCount, "card")} over ${plural(result.pageCount, "page")}. Print at `,
  ));
  // The one instruction that ruins the export if it's missed: "fit to page" is most printers'
  // default and it scales everything down a few percent, which is invisible until you measure
  // a cut card against a sleeve. Emphasised rather than merely stated.
  const scale = document.createElement("strong");
  scale.textContent = "100%";
  advice.appendChild(scale);
  advice.appendChild(document.createTextNode(
    ", not “fit to page”, and cut along the crop marks — each card comes out 2.5 × 3.5 in. " +
    "There is no bleed, so cut on the marks: misregistration shows a sliver of the neighbouring card.",
  ));
  body.appendChild(advice);

  // Named, not silent. A deck that's quietly two cards short reads as a bug in the export;
  // knowing the count and the cause points at the content settings, which is where the fix is.
  const missing = result.missing || [];
  if (missing.length > 0) {
    const note = document.createElement("p");
    note.className = "hint";
    note.textContent = `${plural(missing.length, "card")} couldn't be included — a content ` +
      "source this character was built with is switched off, renamed or missing.";
    body.appendChild(note);
  }

  // A different failure with a different fix: the card is in the deck, it just printed as its
  // rules text instead of its picture. Worth saying, because a mixed deck otherwise looks like
  // the renderer gave up halfway.
  const fellBack = result.fellBack || [];
  if (fellBack.length > 0) {
    const note = document.createElement("p");
    note.className = "hint";
    note.textContent = `${plural(fellBack.length, "card")} printed as text because ` +
      `${fellBack.length === 1 ? "its" : "their"} art wasn't found.`;
    body.appendChild(note);
  }

  appendExportClose(body);
}

function appendExportClose(body) {
  const row = document.createElement("div");
  row.className = "export-choices";
  row.appendChild(button("Close", "btn-primary", closePopover));
  body.appendChild(row);
}

// The download attribute would carry a character's name in full, but the filesystem it lands on
// may not, so it's reduced to [a-z0-9-]. Accents are folded rather than dropped: without the NFD
// pass Élodie saves as "lodie", which looks like the export mangled it. Shared by both PDF
// exports, so one character can't slug two ways in one download folder.
function characterSlug(ch) {
  return (ch.name || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "character";
}

// One stamp for every export that names a file — the CSV, the cards, the sheet — so today's run
// can't overwrite the one you did before you levelled up. Shared rather than repeated because the
// day this goes local (toISOString is UTC, so a 7pm PDT export stamps tomorrow) the three have to
// move together, or one run writes two dates across the folder.
const dateStamp = () => new Date().toISOString().slice(0, 10);

// daggerheart-cards-<name>-<stamp>.pdf, to sit beside daggerheart-characters-<stamp>.csv.
function cardPdfFilename(ch) {
  return `daggerheart-cards-${characterSlug(ch)}-${dateStamp()}.pdf`;
}

// ---------- official sheet PDF export ----------
//
// The filled copy of the official Daggerheart character sheet. Everything with a rule in it — what
// each of the sheet's named fields says, and every byte of the PDF — is in sheet-pdf.js and the
// two pure modules it composes. What's left here is the parts that need a page: asking which of
// the two sheets you want, saving the bytes, and saying so when it fails.
//
// The way in is in the detail view, and only when the template is installed; see renderDetail().
// There is deliberately no roster-wide version: the official sheet is a page per character, so a
// party of five is five files, and the export that covers everyone at once is the CSV.

// The same question the CSV export asks, and it matters more here: a filled official sheet is
// printed, then written on for a whole campaign, which is the longest any set of numbers this app
// produces stays in use. "Permanent only" leads for that reason — see loadoutChoiceRow(), which
// is where both pickers get their buttons, and the reason they can't disagree about the order.
function openSheetPdfPicker(ch) {
  const body = document.createElement("div");

  const hint = document.createElement("p");
  hint.className = "hint";
  hint.textContent = LOADOUT_HINT;
  body.appendChild(hint);

  // THE CHECKBOX, AND WHY IT SAYS NOTHING ABOUT PDFs
  //
  // Ticked, the app draws every filled box itself and the reader prints what we drew. Unticked,
  // the file asks the reader to lay the text out — which is what this export did before, and
  // which four readers answered four ways: Firefox silently dropped 341 of the 1430 characters in
  // the class features box, Chrome shrank the same box to 6pt in 19 lines using 127 of its 196
  // points. shared/pdf-form.js's header has that measurement in full.
  //
  // None of which is a sentence to put in front of someone printing a character sheet. The label
  // names the one thing a player can act on — the format is cleaner, and it is less convenient if
  // you go on to edit the PDF by hand, because the drawing we wrote is ours rather than something
  // an editor regenerates as it likes. "/NeedAppearances", "appearance stream" and "form XObject"
  // are the vocabulary of the bug, not of the choice.
  //
  // Created before the buttons and appended after them: the buttons ARE the action, so the option
  // has to exist by the time a handler closes over it, and it reads `box.checked` at click time —
  // by which point runSheetPdf() is about to empty this body out from under it.
  const option = document.createElement("label");
  option.className = "export-option";
  const box = document.createElement("input");
  box.type = "checkbox";
  box.checked = true;
  option.appendChild(box);
  const optionText = document.createElement("span");
  optionText.textContent = "Clean format (not as ideal if you edit the PDF manually)";
  option.appendChild(optionText);

  // The modal is NOT closed on the way through, unlike the CSV picker's: this export reads a file
  // off disk and rewrites it, so it can fail, and showExportProblem() needs a body that is still
  // on the page to write into. What replaces these buttons is runSheetPdf()'s business.
  body.appendChild(loadoutChoiceRow((loadout) => runSheetPdf(ch, body, loadout, box.checked)));
  body.appendChild(option);

  openModal("Fill official sheet (PDF)", body);
}

// Split out so the picker above is just markup: this is the half that can fail.
async function runSheetPdf(ch, body, loadout, appearances) {
  // The choice is replaced by a line saying what's happening rather than left sitting there. The
  // work is a fetch plus a rewrite of a 469,823-byte file (`stat` on data/sheet/sheet-template.pdf,
  // 2026-09-01, after the page-2 normalisation; the other reading on record is 453,448 bytes,
  // before it. This comment used to say "~185KB", which matches neither) and is usually a blink,
  // but on a cold cache two buttons that still look unclicked invite a second click, and a second
  // click would export twice.
  body.innerHTML = "";
  const line = document.createElement("p");
  line.className = "hint";
  line.textContent = "Filling the sheet…";
  body.appendChild(line);

  // A RECORD, NOT BARE BYTES. buildSheetPdf() returns {bytes, fellBack, truncated} — the shape
  // buildCardPdf() already returns for the same reason, that an export can succeed and still lose
  // something worth saying. Destructuring is deliberate rather than `result.bytes` everywhere: the
  // one bug this seam has already produced was `bytes = await buildSheetPdf(…)` left over from
  // when it returned a Uint8Array, which put the whole record into `new Blob([record])`. That is
  // not a type error in JavaScript — the object stringifies, and the user gets a 15-byte file
  // called .pdf containing "[object Object]", with a clean console and a modal that closes on
  // success as if nothing were wrong. Caught in the browser (run-app), invisible to tests/.
  let bytes, fellBack, truncated;
  try {
    ({ bytes, fellBack, truncated } = await buildSheetPdf(ch, db, { loadout, appearances }));
  } catch (err) {
    showExportProblem(body, "The sheet couldn't be filled, so nothing was saved. " +
      (err && err.message ? err.message : String(err)));
    return;
  }

  downloadFile(sheetPdfFilename(ch), bytes, "application/pdf");

  // CLOSED WHEN THERE IS NOTHING TO SAY, OPEN WHEN THERE IS.
  //
  // The card export's modal always stays open, because it has print settings to hand you and
  // cards that don't fit a sleeve are the failure that advice exists to prevent. A filled sheet
  // prints like any other page, so on an ordinary export a panel saying "done" would cost a click
  // and give nothing back — which is why this one closed unconditionally before there was
  // anything it could report.
  //
  // Now there is. Both of these change WHAT THE SHEET SAYS rather than how it looks, which is the
  // line shared/pdf-form.js's FillReport draws and the reason the minus-sign and quote
  // substitutions are not in the record at all: a panel that cried wolf on the many sheets
  // carrying Scale Mail would train people to dismiss the one that carries a real loss.
  //
  // The download happens either way, above, and before this branch. A sheet that fell back is
  // still a filled sheet and a truncated field is still 99% of a field, so withholding the file
  // would be a worse answer than saving it and saying what happened.
  if (fellBack || truncated.length > 0) showSheetPdfLosses(body, fellBack, truncated);
  else closePopover();
}

// The panel for the two losses that survive a successful fill. Same shape as showCardPdfAdvice():
// the body of the modal that is already open is rewritten, so if the export outlasted the modal
// this writes into a detached node and does nothing, which is the right outcome.
//
// Fields are named by their PDF field name — "class-features", not "Class Features". It is what
// the box is called inside the file, so it is the string that finds it in a PDF editor, and this
// panel is only ever read by someone who has just been told their PDF is imperfect. Inventing a
// display name here would also be a second list to keep in step with the template.
function showSheetPdfLosses(body, fellBack, truncated) {
  body.innerHTML = "";

  const saved = document.createElement("p");
  saved.textContent = "The sheet was saved.";
  body.appendChild(saved);

  if (fellBack) {
    // Document-level, never per-field: with /NeedAppearances false a field carrying a value and no
    // drawing of its own renders as nothing at all in Firefox, so there is no per-field fallback
    // to reach for — one undrawable character switches the whole sheet back. Saying so is the
    // point of this note, because the fix is in the character, not in the app.
    //
    // Two counts, and they are counts of different things: the verb agrees with the BOXES, the
    // noun with the CHARACTERS. One box holding 漢字 read "1 box … contains a character (漢 ×2,
    // 字 ×1, 😀 ×1)" when both agreed with the boxes, which is the sentence saying one and showing
    // four.
    const chars = unmappableChars(fellBack.fields);
    const note = document.createElement("p");
    note.className = "hint";
    note.textContent = `${plural(fellBack.fields.length, "box")} on this sheet ` +
      `${fellBack.fields.length === 1 ? "contains" : "contain"} ` +
      `${chars.length === 1 ? "a character" : "characters"} the PDF's font can't draw ` +
      `(${chars.map((n) => `${n.char} ×${n.count}`).join(", ")}), so the whole sheet is laid ` +
      "out by your PDF reader instead of by this app. It will still print, but a long box can come " +
      "out shrunk, or in Firefox cut short. Replacing those characters and exporting again " +
      "restores it.";
    body.appendChild(note);
  }

  if (truncated.length > 0) {
    // Only reachable from the three free-text boxes — appearance holds 1,273 characters at the 6pt
    // floor — so this note is rare and its subject is always something the user typed.
    const note = document.createElement("p");
    note.className = "hint";
    note.textContent = `${plural(truncated.length, "box")} held more text than fits even at the ` +
      `smallest size, so ${truncated.length === 1 ? "it was" : "they were"} cut short with an ` +
      `ellipsis: ${truncated.join(", ")}. Shortening the text is the only fix — the sheet has the ` +
      "room it has.";
    body.appendChild(note);
  }

  appendExportClose(body);
}

// The distinct undrawable characters across every field that carried one, in first-appearance
// order, each with its total — the raw material for "漢 ×3, 😀 ×1".
//
// Deduplicated a SECOND time here, on top of shared/winansi.js's own per-field deduplication,
// because a phrase pasted into two boxes reports the same character in both and "漢 ×3, 漢 ×2"
// reads as a bug in the message rather than as two fields.
//
// Order comes from the fields, which arrive in widget order, and from the notes inside them, which
// arrive in first-appearance order — never from the accumulator's own key order. That is what
// makes the same character produce the same sentence on every export, and it is the same rule the
// modules below it are held to.
function unmappableChars(fields) {
  const totals = new Map();
  const order = [];
  for (const { characters } of fields) {
    for (const note of characters) {
      if (!totals.has(note.codePoint)) order.push(note);
      totals.set(note.codePoint, (totals.get(note.codePoint) || 0) + note.count);
    }
  }
  return order.map((note) => ({ char: note.char, count: totals.get(note.codePoint) }));
}

// daggerheart-sheet-<name>-<stamp>.pdf, beside daggerheart-cards-<name>-<stamp>.pdf. No
// "-permanent" suffix, unlike the CSV: that export writes every character into one file, so both
// variants plausibly sit in the same folder on the same day. This one is aimed at a printer, one
// character at a time, and which of the two sheets you want is chosen once per print run.
function sheetPdfFilename(ch) {
  return `daggerheart-sheet-${characterSlug(ch)}-${dateStamp()}.pdf`;
}

// ---------- backup & transfer ----------
//
// The CSV above is for the GM. This file is for the player: the characters exactly as
// localStorage holds them, so another browser can pick them up and still edit or undo a level.
// shared/transfer.js owns the format, what counts as a valid file, and the merge \u2014 all of it
// testable. What's left here is the parts that need a page: asking, reading a file, saving.
//
// Names in a file someone shared with you are not yours. Every path below writes them with
// textContent, the CSP blocks inline script, and csv-export.js already defangs a leading "=",
// so a name shaped like a spreadsheet formula stays inert all the way to the GM's export.

const plural = (n, noun) => `${n} ${noun}${n === 1 ? "" : "s"}`;

function savedOn(iso) {
  const when = iso ? new Date(iso) : null;
  if (!when || Number.isNaN(when.getTime())) return "date unknown";
  return when.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

// Enough to tell two copies of one character apart. The file is db-free; this screen isn't,
// and an id this browser doesn't know renders the same dash the roster already shows.
function transferSummary(ch) {
  const cls = findClass(ch.classId);
  return `Lv ${ch.level} \u00b7 ${cls ? titleCase(cls.name) : "\u2014"} \u00b7 saved ${savedOn(ch.updatedAt)}`;
}

function openTransferModal(opts = {}) {
  const body = document.createElement("div");

  const hint = document.createElement("p");
  hint.className = "hint";
  hint.textContent = "The CSV is for your GM: it spells everything out in words, and it can't be " +
    "loaded back. This file is for you \u2014 it holds your characters exactly as this browser has them, " +
    "level-up choices and all, so another browser can pick them up and still undo or edit any level.";
  body.appendChild(hint);

  // Hidden, and clicked by the button beside it: a bare file input next to two styled buttons
  // reads as a bug, and the error screens need to reopen the picker without one anyway.
  const fileInput = document.createElement("input");
  fileInput.type = "file";
  fileInput.accept = "application/json,.json";
  fileInput.hidden = true;
  fileInput.addEventListener("change", () => readTransferFile(fileInput));
  body.appendChild(fileInput);

  const row = document.createElement("div");
  row.className = "export-choices";
  const save = button("Save to file", "btn-primary", () => { closePopover(); downloadTransferFile(); });
  save.disabled = characters.length === 0;
  row.appendChild(save);
  // Never disabled: a browser with nothing in it is exactly where loading a file matters most.
  row.appendChild(button("Load from file\u2026", "btn-ghost", () => fileInput.click()));
  body.appendChild(row);

  const note = document.createElement("p");
  note.className = "hint";
  note.textContent = characters.length === 0
    ? "No characters here yet to save. Loading a file is how you'd bring some in."
    : "Nothing leaves your browser either way: the file is written and read on this machine.";
  body.appendChild(note);

  openModal("Backup & transfer", body);
  if (opts.pick) fileInput.click();
}

// `list` defaults to everyone, which is what the Backup & transfer modal wants; the roster row's
// own Export button passes the one character it belongs to. Same format either way — a transfer
// file has always been a list, so a file holding one character needs no separate shape and reads
// back through exactly the same import.
function downloadTransferFile(list = characters) {
  downloadFile(transferFilename(), serializeTransferFile(list), "application/json");
}

async function readTransferFile(input) {
  const file = input.files && input.files[0];
  // Cleared before anything else can fail, so picking the same file again still fires change.
  input.value = "";
  if (!file) return;

  let text;
  try {
    text = await file.text();
  } catch {
    showTransferError("That file couldn't be read.");
    return;
  }

  const parsed = parseTransferFile(text);
  if (!parsed.ok) {
    showTransferError(parsed.error);
    return;
  }
  startImport(parsed);
}

function startImport(parsed) {
  importDropped = parsed.dropped;
  importPlan = planImport(parsed.characters, characters);
  importResolutions = {};
  // Nothing to ask about: get on with it.
  if (importPlan.clashes.length === 0) {
    commitImport();
    return;
  }
  for (const clash of importPlan.clashes) importResolutions[clash.id] = DEFAULT_RESOLUTION;
  renderImportReview();
}

// A file can carry content this browser has never had: hand someone a character built with a
// folder you don't have and their ids arrive intact but resolve to nothing. Imports fine, shows as gaps.
//
// This goes on BOTH import screens on purpose. The review screen only renders when there are id
// clashes to resolve — startImport() commits a clean file straight away — and a clean file from a
// browser with different content is exactly the case worth saying something about.
function importContentWarning() {
  const count = (importPlan?.incoming || []).reduce(
    (n, ch) => n + unresolvedReferences(ch, db, { sentinels: [UNARMED, UNARMORED], includeAllCards: true }).length, 0);
  if (count === 0) return null;
  const warn = document.createElement("p");
  warn.className = "warn-banner";
  const one = count === 1;
  warn.textContent = `⚠ ${plural(count, "reference")} in that file ${one ? "isn't" : "aren't"} in your content ` +
    `(a source folder you don't have?). ${one ? "It keeps its id" : "They keep their ids"}, ` +
    `so adding the folder later fills ${one ? "it" : "them"} in.`;
  return warn;
}

function clashRow(clash) {
  const row = document.createElement("div");
  row.className = "import-clash";

  const main = document.createElement("div");
  main.className = "import-clash-main";
  const name = document.createElement("strong");
  name.textContent = clash.incoming.name || "(unnamed)";
  main.appendChild(name);
  for (const [label, ch] of [["In the file", clash.incoming], ["Here already", clash.existing]]) {
    const line = document.createElement("span");
    line.className = "hint";
    line.textContent = `${label}: ${transferSummary(ch)}`;
    main.appendChild(line);
  }
  row.appendChild(main);

  const actions = document.createElement("div");
  actions.className = "import-clash-actions";
  for (const [label, value] of [["Keep both", "keep-both"], ["Replace mine", "overwrite"], ["Skip", "skip"]]) {
    const chosen = importResolutions[clash.id] === value;
    const btn = button(label, "btn-small" + (chosen ? " is-chosen" : ""), () => {
      importResolutions[clash.id] = value;
      renderImportReview();
    });
    btn.setAttribute("aria-pressed", chosen ? "true" : "false");
    actions.appendChild(btn);
  }
  row.appendChild(actions);
  return row;
}

// openModal swaps the title and body of the overlay that's already open, so re-rendering after
// each choice doesn't flicker or stack a second dialog.
function renderImportReview() {
  const body = document.createElement("div");
  const fresh = importPlan.fresh.length;
  const clashes = importPlan.clashes.length;

  const intro = document.createElement("p");
  intro.textContent = `${plural(importPlan.incoming.length, "character")} in this file. ` +
    (fresh ? `${fresh} ${fresh === 1 ? "is" : "are"} new. ` : "") +
    `${clashes} already ${clashes === 1 ? "exists" : "exist"} in this browser \u2014 ` +
    "choose what to do with each.";
  body.appendChild(intro);

  const warn = importContentWarning();
  if (warn) body.appendChild(warn);

  for (const clash of importPlan.clashes) body.appendChild(clashRow(clash));

  const help = document.createElement("p");
  help.className = "hint";
  help.textContent = "Keep both gives the incoming copy a new name and a new id, so you end up " +
    "with two. Replace mine overwrites this browser's copy \u2014 its level history goes with it. " +
    "Skip leaves this browser's copy alone and drops the one from the file.";
  body.appendChild(help);

  const landing = fresh + importPlan.clashes.filter((c) => importResolutions[c.id] !== "skip").length;
  const row = document.createElement("div");
  row.className = "export-choices";
  const go = button(landing ? `Import ${plural(landing, "character")}` : "Nothing to import",
    "btn-primary", commitImport);
  go.disabled = landing === 0;
  row.appendChild(go);
  row.appendChild(button("Cancel", "btn-ghost", () => { closePopover(); clearImportState(); }));
  body.appendChild(row);

  openModal("Import characters", body);
}

function commitImport() {
  const result = applyImport(characters, importPlan, importResolutions || {});
  const before = { characters, undoSlot: localStorage.getItem(UNDO_STORAGE_KEY) };

  // Written before it's adopted: a full quota must not leave the page holding characters that
  // were never saved. saveCharacters() is unguarded, but this is the one action that can
  // multiply the roster in a single click.
  try {
    localStorage.setItem(CHAR_STORAGE_KEY, JSON.stringify(result.characters));
  } catch {
    showTransferError("There wasn't room in this browser's storage for those characters. " +
      "Delete a character you no longer need and try again.");
    return;
  }

  // Ids used to be unique to one browser, so a level-edit undo could only ever describe the
  // character it was taken from. A file brings foreign ids in: overwrite one and the snapshot
  // is left pointing at a character that no longer exists, ready to write a stranger's level
  // history over the imported one.
  for (const id of result.overwrittenIds) {
    if (loadUndo(id)) { localStorage.removeItem(UNDO_STORAGE_KEY); break; }
  }

  characters = result.characters;
  // Only worth offering where something was destroyed. In memory and short-lived on purpose:
  // it costs no storage on the one action that already needed a quota guard, and it covers the
  // moment that matters \u2014 realising straight away that you chose wrong.
  importUndo = result.replaced > 0 ? before : null;
  renderAll();
  renderImportSummary(result);
}

function undoImport() {
  if (!importUndo) return;
  characters = importUndo.characters;
  saveCharacters();
  // Put the level-edit undo back exactly as it was, including having been absent.
  if (importUndo.undoSlot === null) localStorage.removeItem(UNDO_STORAGE_KEY);
  else localStorage.setItem(UNDO_STORAGE_KEY, importUndo.undoSlot);
  closePopover();
  clearImportState();
  renderAll();
}

function renderImportSummary(result) {
  const body = document.createElement("div");

  const counts = [];
  if (result.added) counts.push(`${result.added} added`);
  if (result.replaced) counts.push(`${result.replaced} replaced`);
  if (result.skipped) counts.push(`${result.skipped} skipped`);
  const line = document.createElement("p");
  line.textContent = counts.length ? `${counts.join(", ")}.` : "Nothing was imported.";
  body.appendChild(line);

  const warn = importContentWarning();
  if (warn) body.appendChild(warn);

  if (result.renamed.length) {
    const renamed = document.createElement("p");
    renamed.className = "hint";
    renamed.textContent = `Renamed to avoid a clash: ${result.renamed.map((n) => `"${n}"`).join(", ")}. ` +
      "You can rename them in the wizard.";
    body.appendChild(renamed);
  }

  if (importDropped) {
    const dropped = document.createElement("p");
    dropped.className = "hint";
    dropped.textContent = importDropped === 1
      ? "One entry in that file wasn't a character and was ignored."
      : `${importDropped} entries in that file weren't characters and were ignored.`;
    body.appendChild(dropped);
  }

  const row = document.createElement("div");
  row.className = "export-choices";
  row.appendChild(button("Done", "btn-primary", () => { closePopover(); clearImportState(); }));
  if (importUndo) row.appendChild(button("Undo this import", "btn-ghost", undoImport));
  body.appendChild(row);

  if (importUndo) {
    const note = document.createElement("p");
    note.className = "hint";
    note.textContent = "Undo puts every character back the way it was, but only while this is open.";
    body.appendChild(note);
  }

  openModal("Import complete", body);
}

function showTransferError(message) {
  const body = document.createElement("div");
  const box = document.createElement("div");
  box.className = "problem-box";
  box.textContent = message;
  body.appendChild(box);

  const row = document.createElement("div");
  row.className = "export-choices";
  // One code path, one input lifetime: the modal is rebuilt and its fresh input is clicked.
  row.appendChild(button("Try another file", "btn-primary", () => openTransferModal({ pick: true })));
  row.appendChild(button("Cancel", "btn-ghost", () => { closePopover(); clearImportState(); }));
  body.appendChild(row);

  openModal("Backup & transfer", body);
}

function clearImportState() {
  importPlan = null;
  importResolutions = null;
  importDropped = 0;
  importUndo = null;
}

// Portrait support came from upstream with the play page. The JSON import/export it arrived
// beside did not: shared/transfer.js here is the fork's own, with per-character conflict
// resolution, so upstream's exportJson/importFromFile/applyImport were dropped rather than
// kept alongside a second file format. showImportBanner survives because portraitProblem uses it.
function showImportBanner(text, { error = false, actions = [] } = {}) {
  const banner = document.getElementById("import-banner");
  banner.replaceChildren();
  banner.className = "import-banner" + (error ? " error" : "");
  banner.hidden = false;
  const p = document.createElement("p");
  p.textContent = text;
  banner.appendChild(p);
  if (actions.length) {
    const row = document.createElement("div");
    row.className = "import-actions";
    for (const { label, onClick, danger } of actions) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "btn-small" + (danger ? " btn-danger" : "");
      b.textContent = label;
      b.addEventListener("click", onClick);
      row.appendChild(b);
    }
    banner.appendChild(row);
  }
}

function hideImportBanner() {
  const banner = document.getElementById("import-banner");
  banner.hidden = true;
  banner.replaceChildren();
}

// Which character the hidden file input is about to serve. The input is one, shared, and
// lives in the page rather than in the detail, so re-rendering the detail can't lose it
// mid-dialog.
let portraitTarget = null;

function pickPortrait(id) {
  portraitTarget = id;
  document.getElementById("portrait-file").click();
}

// Whether the banner currently showing is one of ours. An import conflict waiting for an answer
// is not, and a portrait going well must not throw that question away.
let portraitBannerUp = false;

function portraitProblem(text) {
  portraitBannerUp = true;
  showImportBanner(text, { error: true, actions: [{ label: "OK", onClick: () => { portraitBannerUp = false; hideImportBanner(); } }] });
}

function clearPortraitProblem() {
  if (!portraitBannerUp) return;
  portraitBannerUp = false;
  hideImportBanner();
}

async function usePortraitFile(file) {
  const ch = characters.find((c) => c.id === portraitTarget);
  if (!file || !ch) return;
  let url;
  try {
    url = await encodePortrait(file);
  } catch (err) {
    portraitProblem(err?.message === "too-big"
      ? "That picture is too detailed to store — crop it, or pick one with less going on."
      : "That picture couldn't be used. Pick a JPEG, PNG or WebP — a photo from the camera is fine.");
    return;
  }
  // localStorage is a few megabytes for every character together, so a save can fail. Put the
  // old value back rather than leaving the list and what's on disk saying different things.
  const before = ch.portrait;
  ch.portrait = url;
  let saved = false;
  try {
    saved = savePortrait(ch.id, url);
  } catch {
    saved = false;
  }
  if (!saved) {
    if (before) ch.portrait = before; else delete ch.portrait;
    portraitProblem("The portrait couldn't be saved — this browser may be out of storage, or the character may have been removed in another tab.");
    return;
  }
  clearPortraitProblem();
  renderAll();
}

async function init() {
  // The template probe rides along with the content load rather than happening where it's used.
  // renderDetail() is synchronous and has to KNOW whether to offer the official-sheet export, not
  // wait to find out: awaiting it there would make the whole detail view async, and appending the
  // button when the fetch lands would have it pop in a moment after everything else, which reads
  // as a bug in the view rather than as a feature that's only sometimes there. Parallel, so it
  // costs next to nothing — the content load is a manifest plus a file per source, this is one
  // request — and the bytes are memoised in sheet-pdf.js, so the export itself reuses these rather
  // than fetching the template a second time.
  const [, template] = await Promise.all([loadAllData(), sheetTemplate()]);
  sheetTemplateInstalled = template !== null;
  mountContentSettings(content);
  loadCharacters();
  // Returning from a level edit reopens the character with the history showing, so any
  // level the edit knocked out of shape is in front of you rather than a click away.
  const params = new URLSearchParams(location.search);
  const open = params.get("id") || params.get("open");
  if (open && characters.some((c) => c.id === open)) {
    openId = open;
    historyOpen = params.get("history") === "1";
  }
  renderAll();
  // A real link, intercepted: it navigates for anyone without JS and lands on the roster either
  // way, but here it's a re-render rather than a reload of the page we're already on.
  document.getElementById("nav-my-characters").addEventListener("click", (e) => {
    e.preventDefault();
    showList();
  });
  document.getElementById("export-csv-btn").addEventListener("click", openExportPicker);
  document.getElementById("transfer-btn").addEventListener("click", () => openTransferModal());
  const portraitInput = document.getElementById("portrait-file");
  portraitInput.addEventListener("change", async () => {
    const file = portraitInput.files[0];
    portraitInput.value = ""; // so picking the same file again fires change
    await usePortraitFile(file);
  });
}

init();
