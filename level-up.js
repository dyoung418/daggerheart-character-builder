import { renderCardArt, domainCardArtPath, subclassCardArtPath } from "./shared/card-render.js";
import {
  ADVANCEMENT_LABELS,
  availableOptionKeys,
  domainCardLevelCap,
  ensureLevelFields,
  isLevelAchievement,
  nextSubclassTier,
  optionCost,
  remainingSlots,
} from "./shared/advancement.js";

const CHAR_STORAGE_KEY = "dh-characters-v1";
const TRAIT_LABELS = { agility: "Agility", strength: "Strength", finesse: "Finesse", instinct: "Instinct", presence: "Presence", knowledge: "Knowledge" };

const db = {};
let character = null;

// UI state for the current level up (not persisted until confirmed)
let picked = new Set(); // keys of the options selected for this level up
let pickedTraits = []; // up to 2 trait keys, only relevant if "traits" is among the picked options
let pickedExperienceIdx = []; // up to 2 indices in character.experiences, relevant if "experience" is picked
let mandatoryCardId = null;
let bonusCardId = null;

function titleCase(str) { return str.charAt(0) + str.slice(1).toLowerCase(); }

async function loadJson(name) {
  const res = await fetch(`data/${name}.json`);
  return res.json();
}

async function loadAllData() {
  const [classes, subclasses, domainCards] = await Promise.all([
    loadJson("classes"), loadJson("subclasses"), loadJson("domain-cards"),
  ]);
  db.classes = classes;
  db.subclasses = subclasses;
  db.domainCards = domainCards;
}

function loadAllCharacters() {
  try {
    const raw = localStorage.getItem(CHAR_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveAllCharacters(list) {
  localStorage.setItem(CHAR_STORAGE_KEY, JSON.stringify(list));
}

function persistCharacter() {
  const list = loadAllCharacters();
  const idx = list.findIndex((c) => c.id === character.id);
  if (idx >= 0) list[idx] = character; else list.push(character);
  saveAllCharacters(list);
}

function selectedClass() { return db.classes.find((c) => c.id === character.classId); }

function budgetSpent() {
  let spent = 0;
  for (const key of picked) spent += optionCost(key);
  return spent;
}

function totalRemainingAcrossAllOptions(newLevel) {
  const tempLevel = character.level;
  character.level = newLevel;
  const total = availableOptionKeys(character).reduce((sum, key) => sum + remainingSlots(character, key), 0);
  character.level = tempLevel;
  return total;
}

function render() {
  const main = document.getElementById("level-up-main");
  main.innerHTML = "";

  if (!character) {
    main.innerHTML = `<p class="hint">Character not found.</p>`;
    return;
  }
  const cls = selectedClass();
  const newLevel = character.level + 1;

  if (character.level >= 10) {
    main.innerHTML = `<p class="hint">${character.name || "This character"} is already at the maximum level (10).</p>
      <a class="btn-ghost" href="characters.html">← Back to list</a>`;
    return;
  }

  const title = document.createElement("h3");
  title.textContent = `${character.name || "(unnamed)"} — level ${character.level} → ${newLevel}`;
  title.style.marginTop = "0";
  main.appendChild(title);

  if (isLevelAchievement(newLevel)) {
    const box = document.createElement("p");
    box.className = "hint";
    box.textContent = `Automatic level achievement: a new Experience at +2 and +1 permanent Proficiency.` +
      (newLevel >= 5 ? " Marks on traits you've already increased are cleared: you can raise them again." : "");
    main.appendChild(box);
  }

  renderAdvancementPicker(main, newLevel);
  renderMandatoryCardStep(main, cls, newLevel);
  if (picked.has("domainCard")) renderBonusCardStep(main, cls, newLevel);

  renderConfirmBar(main, newLevel);
}

function renderAdvancementPicker(main, newLevel) {
  const h = document.createElement("h3");
  h.textContent = "Pick 2 advancements";
  main.appendChild(h);

  const spent = budgetSpent();
  const info = document.createElement("p");
  info.className = "hint";
  info.textContent = `Choice points used: ${spent}/2. Proficiency uses both points on its own.`;
  main.appendChild(info);

  const tempLevel = character.level;
  character.level = newLevel;
  const keys = availableOptionKeys(character);
  const list = document.createElement("div");
  list.className = "option-list";
  for (const key of keys) {
    const remaining = remainingSlots(character, key);
    const cost = optionCost(key);
    const isPicked = picked.has(key);
    const proficiencyPickedElsewhere = picked.has("proficiency") && key !== "proficiency";
    const notEnoughBudget = !isPicked && (spent + cost > 2);
    const notEnoughSlots = !isPicked && remaining < (key === "proficiency" ? 2 : 1);
    const disabled = remaining <= 0 || notEnoughBudget || notEnoughSlots || proficiencyPickedElsewhere;

    const row = document.createElement("label");
    row.className = "option-row";
    row.innerHTML = `<input type="checkbox" ${isPicked ? "checked" : ""} ${disabled && !isPicked ? "disabled" : ""}/>
      <strong>${ADVANCEMENT_LABELS[key]}</strong> <span class="hint">(slots left: ${remaining})</span>`;
    row.querySelector("input").addEventListener("change", (e) => {
      if (e.target.checked) {
        picked.add(key);
        if (key === "proficiency") { picked = new Set(["proficiency"]); }
      } else {
        picked.delete(key);
        if (key === "traits") pickedTraits = [];
        if (key === "experience") pickedExperienceIdx = [];
      }
      render();
    });
    list.appendChild(row);
  }
  character.level = tempLevel;
  main.appendChild(list);

  if (picked.has("traits")) renderTraitSubPicker(main);
  if (picked.has("experience")) renderExperienceSubPicker(main);
  if (picked.has("subclass")) renderSubclassPreview(main);
}

function renderTraitSubPicker(main) {
  const h = document.createElement("p");
  h.className = "hint";
  h.textContent = "Pick 2 traits not yet marked this tier:";
  main.appendChild(h);
  const grid = document.createElement("div");
  grid.className = "traits-grid";
  for (const key of Object.keys(TRAIT_LABELS)) {
    const marked = character.traitMarks[key];
    const isPicked = pickedTraits.includes(key);
    const row = document.createElement("label");
    row.className = "option-row";
    const disabled = marked || (!isPicked && pickedTraits.length >= 2);
    row.innerHTML = `<input type="checkbox" ${isPicked ? "checked" : ""} ${disabled ? "disabled" : ""}/> ${TRAIT_LABELS[key]}${marked ? " (already marked)" : ""}`;
    row.querySelector("input").addEventListener("change", (e) => {
      if (e.target.checked) pickedTraits.push(key);
      else pickedTraits = pickedTraits.filter((k) => k !== key);
      render();
    });
    grid.appendChild(row);
  }
  main.appendChild(grid);
}

function renderExperienceSubPicker(main) {
  const h = document.createElement("p");
  h.className = "hint";
  h.textContent = "Pick 2 Experiences to give +1 to:";
  main.appendChild(h);
  const list = document.createElement("div");
  list.className = "option-list";
  character.experiences.forEach((exp, i) => {
    const isPicked = pickedExperienceIdx.includes(i);
    const disabled = !isPicked && pickedExperienceIdx.length >= 2;
    const row = document.createElement("label");
    row.className = "option-row";
    row.innerHTML = `<input type="checkbox" ${isPicked ? "checked" : ""} ${disabled ? "disabled" : ""}/> ${exp.name || "(unnamed)"} <span class="exp-mod">+${exp.modifier}</span>`;
    row.querySelector("input").addEventListener("change", (e) => {
      if (e.target.checked) pickedExperienceIdx.push(i);
      else pickedExperienceIdx = pickedExperienceIdx.filter((idx) => idx !== i);
      render();
    });
    list.appendChild(row);
  });
  main.appendChild(list);
}

function renderSubclassPreview(main) {
  const nextTier = nextSubclassTier(character.subclassTier);
  const p = document.createElement("p");
  p.className = "hint";
  p.textContent = character.subclassTier === "mastery"
    ? "Subclass already at Mastery: there's no further tier to take."
    : `You'll take the ${nextTier} card for your subclass.`;
  main.appendChild(p);
  if (character.subclassTier !== "mastery") {
    const preview = document.createElement("div");
    preview.className = "tile-grid";
    const tile = document.createElement("div");
    tile.className = "card-tile";
    tile.appendChild(renderCardArt({ id: character.subclassId, name: nextTier, art: subclassCardArtPath(character.subclassId, nextTier) }));
    preview.appendChild(tile);
    main.appendChild(preview);
  }
}

function eligibleDomainCards(cls, maxLevel, excludeIds) {
  if (!cls) return [];
  return db.domainCards.filter((c) => c.level <= maxLevel && cls.domains.includes(c.domain) && !excludeIds.includes(c.id));
}

function renderMandatoryCardStep(main, cls, newLevel) {
  const h = document.createElement("h3");
  h.textContent = "New domain card (guaranteed every level)";
  main.appendChild(h);
  const excluded = [...character.domainCardIds, ...(bonusCardId ? [bonusCardId] : [])];
  const cards = eligibleDomainCards(cls, newLevel, excluded);
  const grid = document.createElement("div");
  grid.className = "tile-grid";
  for (const c of cards) {
    const card = { id: c.id, name: c.name["en-US"], art: domainCardArtPath(c.id) };
    const selected = mandatoryCardId === c.id;
    const tile = document.createElement("div");
    tile.className = "card-tile" + (selected ? " selected" : "");
    tile.appendChild(renderCardArt(card));
    const label = document.createElement("div");
    label.className = "card-tile-label";
    label.textContent = card.name;
    tile.appendChild(label);
    tile.addEventListener("click", () => { mandatoryCardId = c.id; render(); });
    grid.appendChild(tile);
  }
  main.appendChild(grid);
}

function renderBonusCardStep(main, cls, newLevel) {
  const cap = domainCardLevelCap(newLevel);
  const h = document.createElement("h3");
  h.textContent = `Bonus domain card (level ≤ ${cap})`;
  main.appendChild(h);
  const excluded = [...character.domainCardIds, ...(mandatoryCardId ? [mandatoryCardId] : [])];
  const cards = eligibleDomainCards(cls, cap, excluded);
  const grid = document.createElement("div");
  grid.className = "tile-grid";
  for (const c of cards) {
    const card = { id: c.id, name: c.name["en-US"], art: domainCardArtPath(c.id) };
    const selected = bonusCardId === c.id;
    const tile = document.createElement("div");
    tile.className = "card-tile" + (selected ? " selected" : "");
    tile.appendChild(renderCardArt(card));
    const label = document.createElement("div");
    label.className = "card-tile-label";
    label.textContent = card.name;
    tile.addEventListener("click", () => { bonusCardId = c.id; render(); });
    tile.appendChild(label);
    grid.appendChild(tile);
  }
  main.appendChild(grid);
}

function stepValidation(newLevel) {
  const spent = budgetSpent();
  const totalRemaining = totalRemainingAcrossAllOptions(newLevel);
  const budgetOk = spent === 2 || (totalRemaining < 2 && spent === totalRemaining);
  if (!budgetOk) return false;
  if (picked.has("traits") && pickedTraits.length !== 2) return false;
  if (picked.has("experience") && pickedExperienceIdx.length !== 2) return false;
  if (!mandatoryCardId) return false;
  if (picked.has("domainCard") && !bonusCardId) return false;
  return true;
}

function renderConfirmBar(main, newLevel) {
  const bar = document.createElement("div");
  bar.className = "wizard-actions";
  const back = document.createElement("a");
  back.className = "btn-ghost";
  back.href = "characters.html";
  back.textContent = "← Cancel";
  bar.appendChild(back);

  const confirm = document.createElement("button");
  confirm.className = "btn-primary";
  confirm.textContent = `Confirm level ${newLevel}`;
  confirm.disabled = !stepValidation(newLevel);
  confirm.addEventListener("click", () => applyLevelUp(newLevel));
  bar.appendChild(confirm);
  main.appendChild(bar);
}

function applyLevelUp(newLevel) {
  if (isLevelAchievement(newLevel)) {
    character.experiences.push({ name: "", modifier: 2 });
    character.proficiency += 1;
    if (newLevel >= 5) {
      for (const k of Object.keys(character.traitMarks)) character.traitMarks[k] = false;
    }
  }

  for (const key of picked) {
    character.advancementSlotsUsed[key] = (character.advancementSlotsUsed[key] || 0) + (key === "proficiency" ? 2 : 1);
  }
  if (picked.has("traits")) {
    for (const k of pickedTraits) {
      character.traits[k] = (character.traits[k] || 0) + 1;
      character.traitMarks[k] = true;
    }
  }
  if (picked.has("hitPoint")) character.hitPointSlotsBonus += 1;
  if (picked.has("stress")) character.stressSlotsBonus += 1;
  if (picked.has("evasion")) character.evasionBonus += 1;
  if (picked.has("experience")) {
    for (const idx of pickedExperienceIdx) character.experiences[idx].modifier += 1;
  }
  if (picked.has("subclass") && character.subclassTier !== "mastery") {
    character.subclassTier = nextSubclassTier(character.subclassTier);
  }
  if (picked.has("proficiency")) character.proficiency += 1;

  if (mandatoryCardId) character.domainCardIds.push(mandatoryCardId);
  if (bonusCardId) character.domainCardIds.push(bonusCardId);
  // if this pushes the active count above 5, the oldest extras automatically go to the
  // vault: the user can then reorganize loadout/vault from the character sheet.
  const active = character.domainCardIds.filter((id) => !character.domainVaultIds.includes(id));
  while (active.length > 5) {
    character.domainVaultIds.push(active.shift());
  }

  character.level = newLevel;
  character.updatedAt = new Date().toISOString();
  persistCharacter();

  picked = new Set();
  pickedTraits = [];
  pickedExperienceIdx = [];
  mandatoryCardId = null;
  bonusCardId = null;

  render();
}

async function init() {
  await loadAllData();
  const params = new URLSearchParams(location.search);
  const id = params.get("id");
  const found = loadAllCharacters().find((c) => c.id === id);
  character = found ? ensureLevelFields(found) : null;
  render();
}

init();
