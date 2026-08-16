import {
  renderCardArt,
  domainCardArtPath,
  subclassCardArtPath,
  communityCardArtPath,
  ancestryCardArtPath,
  transformationCardArtPath,
} from "./shared/card-render.js";
import {
  ADVANCEMENT_LABELS,
  MAX_HOPE,
  SLOT_TIERS,
  STARTING_HOPE,
  SUBCLASS_TIER_LABELS,
  activeDomainCardIds,
  availableOptionKeys,
  ensureLevelFields,
  extraCardLevelCap,
  slotsInTier,
  slotsPerPick,
  subclassTiersUpTo,
  tierForLevel,
} from "./shared/advancement.js";
import {
  describeCards,
  describeLevelUp,
  recomputeCharacter,
  unresolvedProblems,
  validateLevelUps,
} from "./shared/history.js";
import { UNARMED_PROFILE, derivedStats } from "./shared/derived-stats.js";
import { statLine } from "./shared/stat-line.js";
import { titleCase } from "./shared/text.js";
import { ignoresBurden, unresolvedChoices } from "./shared/effects.js";
import { UNARMED, UNARMORED, armorStats, burdenWarning, featureLine, weaponStats } from "./shared/gear.js";
import { buildCsv } from "./shared/csv-export.js";
import { loadContent } from "./shared/content-load.js";
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
import { escapeHtml } from "./shared/escape.js";

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
}

function saveCharacters() {
  localStorage.setItem(CHAR_STORAGE_KEY, JSON.stringify(characters));
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
        <a class="btn-small" href="sheet.html?id=${ch.id}">Print sheet</a>
        <button class="btn-small" data-action="edit">Edit</button>
        <button class="btn-small btn-danger" data-action="delete">Delete</button>
      `;

    row.innerHTML = `
      <div class="character-row-main">
        <strong>${escapeHtml(ch.name || "(unnamed)")}</strong>
        <span>Lv ${escapeHtml(ch.level)} · ${cls ? escapeHtml(titleCase(cls.name)) : "—"}${sub ? " · " + escapeHtml(sub.name["en-US"]) : ""}</span>
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

  for (const key of availableOptionKeys(ch.level)) {
    const row = document.createElement("div");
    row.className = "adv-row";
    const label = key === "domainCard"
      ? `Extra domain card (${tiers.map((t) => `≤${extraCardLevelCap(10, t)}`).join(" / ")})`
      : ADVANCEMENT_LABELS[key];
    row.appendChild(labelSpan(label));

    for (const tier of tiers) {
      const cell = document.createElement("span");
      cell.className = "adv-tier-group";
      const total = slotsInTier(key, tier);
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
      for (let i = 0; i < total; i++) {
        const box = document.createElement("span");
        box.className = "slot-box";
        if (i < unattributed) {
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
  closeBtn.addEventListener("click", () => { openId = null; renderAll(); });
  container.appendChild(closeBtn);

  const cls = findClass(ch.classId);
  const sub = findSubclass(ch.subclassId);

  const header = document.createElement("div");
  header.className = "detail-header";
  header.innerHTML = `<h2>${escapeHtml(ch.name || "(unnamed)")}</h2><p>${escapeHtml(ch.pronouns || "")} · Level ${escapeHtml(ch.level)}</p>`;
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

  const printSheetLink = document.createElement("a");
  printSheetLink.className = "btn-ghost detail-print-link" + (ch.level < 10 ? " detail-print-link--spaced" : "");
  printSheetLink.href = `sheet.html?id=${ch.id}`;
  printSheetLink.textContent = "Print sheet";
  container.appendChild(printSheetLink);

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
  const com = findCommunity(ch.heritage.communityId);
  if (com) cardsRow.appendChild(cardBlock({ id: com.id, name: com.name["en-US"], art: communityCardArtPath(com), type: "Community", features: com.features }, `Community: ${com.name["en-US"]}`));
  for (const ancId of ch.heritage.ancestryIds) {
    const anc = findAncestry(ancId);
    if (anc) cardsRow.appendChild(cardBlock({ id: anc.id, name: anc.name["en-US"], art: ancestryCardArtPath(anc), type: "Ancestry", features: anc.features }, `Ancestry: ${anc.name["en-US"]}`));
  }
  // With the heritage cards, which is where the rules put it: a transformation card joins the
  // loadout "as if it were part of your character's heritage".
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
    <p><strong>Heritage:</strong> ${ch.heritage.ancestryMode === "mixed" ? "Mixed ancestry" : "Pure ancestry"} — features: ${escapeHtml(ch.heritage.chosenFeatures.map((f) => f.featureName).join(", ")) || "—"}</p>
  `;
  container.appendChild(summary);

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
  if (stats.primaryAttack) {
    // Unarmed reports two traits rather than one number, the way Spellcast does.
    statsBox2.appendChild(statLine("Primary attack",
      stats.primaryAttack.display ?? signed(stats.primaryAttack.total), stats.primaryAttack));
  }
  if (stats.secondaryAttack) {
    statsBox2.appendChild(statLine("Secondary attack", signed(stats.secondaryAttack.total), stats.secondaryAttack));
  }
  if (stats.spellcast) {
    statsBox2.appendChild(statLine("Spellcast", stats.spellcast.display, stats.spellcast));
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
      wrap.appendChild(renderCardArt({ id: dc.id, name: dc.name["en-US"], art: domainCardArtPath(dc), level: dc.level, type: dc.type, features: dc.features }));
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
  const unarmedPrimary = eq.primaryWeaponId === UNARMED;
  const primary = unarmedPrimary ? UNARMED_PROFILE : findWeapon(eq.primaryWeaponId);
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

  const warning = burdenWarning(primary, secondary, ignoresBurden(ch, db));
  if (warning) {
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

function renderAll() {
  renderList();
  renderDetail();
  document.getElementById("characters-list").style.display = openId ? "none" : "block";
}

// ---------- CSV export for the GM ----------
//
// The columns and the escaping live in shared/csv-export.js, which is DOM-free and tested.
// What's left here is the parts that need a page: asking which export you want, and saving it.

// Two sheets are possible and they disagree about the numbers, so the export asks rather than
// picking. "With loadout bonuses" leads because it matches what every other screen shows.
function openExportPicker() {
  const body = document.createElement("div");
  const hint = document.createElement("p");
  hint.className = "hint";
  hint.textContent = "Your loadout changes at every rest, so the bonuses it grants go stale on " +
    "a printed sheet. Permanent only leaves them out, as if every card were in your vault.";
  body.appendChild(hint);

  const row = document.createElement("div");
  row.className = "export-choices";
  for (const [label, loadout, cls] of [
    ["With loadout bonuses", true, "btn-primary"],
    ["Permanent only", false, "btn-ghost"],
  ]) {
    const btn = document.createElement("button");
    btn.className = cls;
    btn.textContent = label;
    btn.addEventListener("click", () => {
      closePopover();
      downloadCsv(loadout);
    });
    row.appendChild(btn);
  }
  body.appendChild(row);

  openModal("Export CSV for the GM", body);
}

// The only thing in the app that writes a file. Both exports go through it.
function downloadFile(filename, text, mime) {
  const blob = new Blob([text], { type: mime });
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
  const stamp = new Date().toISOString().slice(0, 10);
  downloadFile(
    // Suffixed, so exporting both ways doesn't leave two files fighting over one name.
    `daggerheart-characters-${stamp}${loadout ? "" : "-permanent"}.csv`,
    "\ufeff" + buildCsv(characters, db, { loadout }), // BOM so Excel recognizes accented characters
    "text/csv;charset=utf-8;",
  );
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

function downloadTransferFile() {
  downloadFile(transferFilename(), serializeTransferFile(characters), "application/json");
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

async function init() {
  await loadAllData();
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
  document.getElementById("export-csv-btn").addEventListener("click", openExportPicker);
  document.getElementById("transfer-btn").addEventListener("click", () => openTransferModal());
}

init();
