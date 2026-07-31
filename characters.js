import {
  renderCardArt,
  domainCardArtPath,
  subclassCardArtPath,
  communityCardArtPath,
  ancestryCardArtPath,
} from "./shared/card-render.js";
import { activeDomainCardIds, damageThresholds, ensureLevelFields } from "./shared/advancement.js";
import { escapeHtml } from "./shared/escape.js";

const CHAR_STORAGE_KEY = "dh-characters-v1";
const TRAIT_LABELS = { agility: "Agility", strength: "Strength", finesse: "Finesse", instinct: "Instinct", presence: "Presence", knowledge: "Knowledge" };

const db = {};
let characters = [];
let openId = null; // id of the character open in detail view, null = list view
let pendingDeleteId = null; // id awaiting delete confirmation (inline confirm, never window.confirm)

function titleCase(str) {
  return str.charAt(0) + str.slice(1).toLowerCase();
}

async function loadJson(name) {
  const res = await fetch(`data/${name}.json`);
  return res.json();
}

async function loadAllData() {
  const [classes, subclasses, ancestries, communities, domainCards, weapons, armors, consumables] = await Promise.all([
    loadJson("classes"), loadJson("subclasses"), loadJson("ancestries"), loadJson("communities"),
    loadJson("domain-cards"), loadJson("weapons"), loadJson("armors"), loadJson("consumables"),
  ]);
  db.classes = classes;
  db.subclasses = subclasses;
  db.ancestries = ancestries;
  db.communities = communities;
  db.domainCards = domainCards;
  db.weapons = weapons;
  db.armors = armors;
  db.consumables = consumables;
}

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

function statLine(label, value) {
  const div = document.createElement("div");
  div.className = "stat-line";
  div.innerHTML = `<span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong>`;
  return div;
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

  if (ch.level < 10) {
    const levelUpBtn = document.createElement("a");
    levelUpBtn.className = "btn-primary";
    levelUpBtn.href = `level-up.html?id=${ch.id}`;
    levelUpBtn.textContent = "Level Up";
    levelUpBtn.style.display = "inline-block";
    levelUpBtn.style.marginBottom = "0.75rem";
    container.appendChild(levelUpBtn);
  }

  const cardsRow = document.createElement("div");
  cardsRow.className = "tile-grid";
  const subTier = ch.subclassTier === "foundation" ? "Foundation" : ch.subclassTier === "specialization" ? "Specialization" : "Mastery";
  if (sub) {
    const tierFeatures = sub[ch.subclassTier]?.features;
    cardsRow.appendChild(cardBlock({ id: sub.id, name: `${sub.name["en-US"]} (${subTier})`, art: subclassCardArtPath(sub.id, ch.subclassTier), type: "Subclass", features: tierFeatures }));
  }
  const com = findCommunity(ch.heritage.communityId);
  if (com) cardsRow.appendChild(cardBlock({ id: com.id, name: com.name["en-US"], art: communityCardArtPath(com.id), type: "Community", features: com.features }, `Community: ${com.name["en-US"]}`));
  for (const ancId of ch.heritage.ancestryIds) {
    const anc = findAncestry(ancId);
    if (anc) cardsRow.appendChild(cardBlock({ id: anc.id, name: anc.name["en-US"], art: ancestryCardArtPath(anc.id), type: "Ancestry", features: anc.features }, `Ancestry: ${anc.name["en-US"]}`));
  }
  container.appendChild(cardsRow);

  const summary = document.createElement("div");
  summary.className = "detail-summary";
  summary.innerHTML = `
    <p><strong>Class:</strong> ${cls ? escapeHtml(titleCase(cls.name)) : "—"} ${sub ? "— " + escapeHtml(sub.name["en-US"]) : ""}</p>
    <p><strong>Heritage:</strong> ${ch.heritage.ancestryMode === "mixed" ? "Mixed ancestry" : "Pure ancestry"} — features: ${escapeHtml(ch.heritage.chosenFeatures.map((f) => f.featureName).join(", ")) || "—"}</p>
  `;
  container.appendChild(summary);

  const statsBox = document.createElement("div");
  statsBox.className = "derived-box";
  for (const [key, label] of Object.entries(TRAIT_LABELS)) {
    const v = ch.traits[key];
    statsBox.appendChild(statLine(label, v === null ? "—" : (v > 0 ? "+" + v : v)));
  }
  container.appendChild(statsBox);

  const armorForThresholds = findArmor(ch.equipment.armorId);
  const statsBox2 = document.createElement("div");
  statsBox2.className = "derived-box";
  statsBox2.appendChild(statLine("Level", ch.level));
  statsBox2.appendChild(statLine("Proficiency", ch.proficiency));
  statsBox2.appendChild(statLine("Evasion", cls ? cls.startingEvasion + ch.evasionBonus : "—"));
  statsBox2.appendChild(statLine("Hit Points", cls ? cls.startingHitPoints + ch.hitPointSlotsBonus : "—"));
  statsBox2.appendChild(statLine("Stress", 6 + ch.stressSlotsBonus));
  statsBox2.appendChild(statLine("Hope", "2 / 6"));
  if (armorForThresholds) {
    const th = damageThresholds(armorForThresholds.baseMajorThreshold, armorForThresholds.baseSevereThreshold, ch.level);
    statsBox2.appendChild(statLine("Damage thresholds", `${th.major} / ${th.severe}`));
  }
  container.appendChild(statsBox2);

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
      wrap.appendChild(renderCardArt({ id: dc.id, name: dc.name["en-US"], art: domainCardArtPath(dc.id), level: dc.level, type: dc.type, features: dc.features }));
      const label = document.createElement("div");
      label.className = "card-tile-label";
      label.textContent = dc.name["en-US"];
      wrap.appendChild(label);
      const toggleBtn = document.createElement("button");
      toggleBtn.className = "btn-small";
      toggleBtn.textContent = inVault ? "→ Loadout" : "→ Vault";
      toggleBtn.disabled = inVault && activeIds.length >= 5;
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
  const primary = findWeapon(eq.primaryWeaponId);
  const secondary = findWeapon(eq.secondaryWeaponId);
  const armor = findArmor(eq.armorId);
  const potion = findConsumable(eq.potionChoice);
  const eqBox = document.createElement("div");
  eqBox.className = "detail-summary";
  eqBox.innerHTML = `
    <p><strong>Primary weapon:</strong> ${primary ? escapeHtml(primary.name["en-US"]) : "—"}</p>
    ${secondary ? `<p><strong>Secondary weapon:</strong> ${escapeHtml(secondary.name["en-US"])}</p>` : ""}
    <p><strong>Armor:</strong> ${armor ? escapeHtml(armor.name["en-US"]) : "—"}</p>
    <p><strong>Potion:</strong> ${potion ? escapeHtml(potion.name["en-US"]) : "—"}</p>
  `;
  container.appendChild(eqBox);

  const expBox = document.createElement("div");
  expBox.className = "detail-summary";
  expBox.innerHTML = `<p><strong>Experience:</strong> ${ch.experiences.map((e) => `${escapeHtml(e.name || "(unnamed)")} (+${escapeHtml(e.modifier)})`).join(", ")}</p>`;
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

function renderAll() {
  renderList();
  renderDetail();
  document.getElementById("characters-list").style.display = openId ? "none" : "block";
}

// ---------- CSV export for the GM ----------

const CSV_COLUMNS = [
  "Name", "Pronouns", "Level", "Proficiency",
  "Class", "Subclass", "Subclass tier",
  "Ancestry", "Community",
  "Agility", "Strength", "Finesse", "Instinct", "Presence", "Knowledge",
  "Evasion", "Hit Points", "Stress", "Hope",
  "Major Threshold", "Severe Threshold",
  "Primary weapon", "Secondary weapon", "Armor", "Potion",
  "Experience", "Domain Cards (loadout)", "Domain Cards (vault)",
  "Background", "Appearance", "Connections",
];

// Standard CSV (RFC 4180): wrap every field in double quotes, doubling any
// double quotes it contains, to safely handle commas, quotes and newlines.
//
// Quoting alone does NOT stop formula injection: Excel, LibreOffice and Google
// Sheets evaluate a field as a formula when its text starts with = + - @ (or a
// leading tab/CR), even inside quotes. This export is explicitly meant to be
// handed to the GM, so a character named `=HYPERLINK("http://evil","click")` —
// or a background note starting with `=` — would run on someone else's machine.
// Prefixing with a single quote makes the spreadsheet treat it as literal text.
// Plain numbers are exempt: trait values are legitimately negative ("-1"), and a
// spreadsheet evaluating "-1" just yields the number -1. Prefixing those would
// turn every negative trait into text and break sorting/formulas for the GM.
const FORMULA_TRIGGER = /^[=+\-@\t\r]/;
const PLAIN_NUMBER = /^[+-]?\d+(\.\d+)?$/;

function csvField(value) {
  let s = String(value ?? "");
  if (FORMULA_TRIGGER.test(s) && !PLAIN_NUMBER.test(s)) s = "'" + s;
  return '"' + s.replace(/"/g, '""') + '"';
}

function csvRowForCharacter(ch) {
  const cls = findClass(ch.classId);
  const sub = findSubclass(ch.subclassId);
  const com = findCommunity(ch.heritage.communityId);
  const ancestries = ch.heritage.ancestryIds.map((id) => findAncestry(id)?.name["en-US"]).filter(Boolean).join(" + ");
  const armor = findArmor(ch.equipment.armorId);
  const th = armor ? damageThresholds(armor.baseMajorThreshold, armor.baseSevereThreshold, ch.level) : null;
  const activeIds = activeDomainCardIds(ch);
  const loadoutNames = activeIds.map((id) => findDomainCard(id)?.name["en-US"]).filter(Boolean).join("; ");
  const vaultNames = ch.domainVaultIds.map((id) => findDomainCard(id)?.name["en-US"]).filter(Boolean).join("; ");
  const expText = ch.experiences.map((e) => `${e.name || "(unnamed)"} (+${e.modifier})`).join("; ");

  const row = [
    ch.name, ch.pronouns, ch.level, ch.proficiency,
    cls ? titleCase(cls.name) : "", sub ? sub.name["en-US"] : "", ch.subclassTier,
    ancestries, com ? com.name["en-US"] : "",
    ch.traits.agility, ch.traits.strength, ch.traits.finesse, ch.traits.instinct, ch.traits.presence, ch.traits.knowledge,
    cls ? cls.startingEvasion + ch.evasionBonus : "", cls ? cls.startingHitPoints + ch.hitPointSlotsBonus : "", 6 + ch.stressSlotsBonus, "2/6",
    th ? th.major : "", th ? th.severe : "",
    findWeapon(ch.equipment.primaryWeaponId)?.name["en-US"] || "",
    findWeapon(ch.equipment.secondaryWeaponId)?.name["en-US"] || "",
    armor ? armor.name["en-US"] : "",
    findConsumable(ch.equipment.potionChoice)?.name["en-US"] || "",
    expText, loadoutNames, vaultNames,
    ch.background.description, ch.background.answers, ch.connectionsNotes,
  ];
  return row.map(csvField).join(",");
}

function buildCsv() {
  const lines = [CSV_COLUMNS.map(csvField).join(",")];
  for (const ch of characters) lines.push(csvRowForCharacter(ch));
  return lines.join("\r\n");
}

function exportCsv() {
  const csv = "﻿" + buildCsv(); // BOM so Excel recognizes accented characters
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const stamp = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = `daggerheart-characters-${stamp}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

async function init() {
  await loadAllData();
  loadCharacters();
  renderAll();
  document.getElementById("export-csv-btn").addEventListener("click", exportCsv);
}

init();
