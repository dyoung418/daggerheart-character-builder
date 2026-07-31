import {
  renderCardArt,
  domainCardArtPath,
  subclassCardArtPath,
  communityCardArtPath,
  ancestryCardArtPath,
} from "./shared/card-render.js";
import { blankAdvancementState, ensureLevelFields } from "./shared/advancement.js";

const CHAR_STORAGE_KEY = "dh-characters-v1";
const TRAIT_KEYS = ["agility", "strength", "finesse", "instinct", "presence", "knowledge"];
const TRAIT_LABELS = { agility: "Agility", strength: "Strength", finesse: "Finesse", instinct: "Instinct", presence: "Presence", knowledge: "Knowledge" };
const TRAIT_ARRAY = [2, 1, 1, 0, 0, -1];
const MINOR_HEALTH_POTION_ID = "core_consumable_minor_health_potion";
const MINOR_STAMINA_POTION_ID = "core_consumable_minor_stamina_potion";

const STEPS = [
  { key: "class", label: "Class" },
  { key: "heritage", label: "Ancestry & Community" },
  { key: "traits", label: "Traits" },
  { key: "derived", label: "Derived info" },
  { key: "equipment", label: "Equipment" },
  { key: "background", label: "Background" },
  { key: "experiences", label: "Experience" },
  { key: "domainCards", label: "Domain Cards" },
  { key: "connections", label: "Connections" },
];

const db = {}; // populated by loadAllData(): classes, subclasses, ancestries, communities, domainCards, weapons, armors, consumables
let character = null;
let currentStep = 0;

function titleCase(str) {
  return str.charAt(0) + str.slice(1).toLowerCase();
}

function featureText(feature) {
  return (feature.description || []).map((d) => d.paragraph?.["en-US"] || "").join(" ");
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

function persistCurrentCharacter() {
  const list = loadAllCharacters();
  const idx = list.findIndex((c) => c.id === character.id);
  if (idx >= 0) list[idx] = character;
  else list.push(character);
  saveAllCharacters(list);
}

function blankCharacter(id) {
  return {
    id,
    name: "",
    pronouns: "",
    classId: null,
    subclassId: null,
    heritage: { ancestryMode: "pure", ancestryIds: [], chosenFeatures: [], communityId: null },
    traits: { agility: null, strength: null, finesse: null, instinct: null, presence: null, knowledge: null },
    equipment: { weaponMode: "two-handed", primaryWeaponId: null, secondaryWeaponId: null, armorId: null, potionChoice: null },
    background: { description: "", answers: "" },
    experiences: [{ name: "", modifier: 2 }, { name: "", modifier: 2 }],
    domainCardIds: [],
    connectionsNotes: "",
    level: 1,
    proficiency: 1,
    traitMarks: { agility: false, strength: false, finesse: false, instinct: false, presence: false, knowledge: false },
    hitPointSlotsBonus: 0,
    stressSlotsBonus: 0,
    evasionBonus: 0,
    subclassTier: "foundation",
    advancementSlotsUsed: blankAdvancementState(),
    domainVaultIds: [],
    updatedAt: null,
  };
}

function initCharacter() {
  const params = new URLSearchParams(location.search);
  const id = params.get("id");
  if (id) {
    const found = loadAllCharacters().find((c) => c.id === id);
    if (found) {
      character = ensureLevelFields(found);
      return;
    }
  }
  const newId = "char_" + Math.random().toString(36).slice(2, 10);
  character = blankCharacter(newId);
  const list = loadAllCharacters();
  list.push(character);
  saveAllCharacters(list);
  history.replaceState(null, "", `create.html?id=${newId}`);
}

function selectedClass() {
  return db.classes.find((c) => c.id === character.classId) || null;
}
function selectedSubclass() {
  return db.subclasses.find((s) => s.id === character.subclassId) || null;
}

// ---------- per-step validation ----------

function isStepValid(stepKey) {
  switch (stepKey) {
    case "class":
      return !!character.classId && !!character.subclassId;
    case "heritage": {
      const h = character.heritage;
      if (!h.communityId) return false;
      if (h.ancestryMode === "pure") return h.ancestryIds.length === 1;
      return h.ancestryIds.length === 2 && h.chosenFeatures.length === 2 &&
        h.chosenFeatures[0].ancestryId !== h.chosenFeatures[1].ancestryId;
    }
    case "traits":
      return TRAIT_KEYS.every((k) => character.traits[k] !== null);
    case "derived":
      return true;
    case "equipment": {
      const e = character.equipment;
      if (!e.armorId || !e.potionChoice) return false;
      if (e.weaponMode === "two-handed") return !!e.primaryWeaponId;
      return !!e.primaryWeaponId && !!e.secondaryWeaponId;
    }
    case "background":
      return true;
    case "experiences":
      return character.experiences.every((exp) => exp.name.trim().length > 0);
    case "domainCards":
      return character.domainCardIds.length === 2;
    case "connections":
      return true;
    default:
      return true;
  }
}

// ---------- render step nav ----------

function renderStepNav() {
  const nav = document.getElementById("step-nav");
  nav.innerHTML = "";
  STEPS.forEach((step, i) => {
    const li = document.createElement("li");
    li.className = "step-nav-item" + (i === currentStep ? " active" : "") + (isStepValid(step.key) ? " done" : "");
    li.innerHTML = `<span class="step-num">${i + 1}</span> ${step.label}`;
    li.addEventListener("click", () => goToStep(i));
    nav.appendChild(li);
  });
}

function goToStep(i) {
  currentStep = i;
  renderAll();
}

function renderNavButtons() {
  const prevBtn = document.getElementById("prev-btn");
  const nextBtn = document.getElementById("next-btn");
  const finishBtn = document.getElementById("finish-btn");
  prevBtn.disabled = currentStep === 0;
  const isLast = currentStep === STEPS.length - 1;
  nextBtn.style.display = isLast ? "none" : "inline-block";
  finishBtn.style.display = isLast ? "inline-block" : "none";
  nextBtn.disabled = !isStepValid(STEPS[currentStep].key);
  finishBtn.disabled = !STEPS.every((s) => isStepValid(s.key));
}

// ---------- render current step panel ----------

function renderStepPanel() {
  const panel = document.getElementById("step-panel");
  panel.innerHTML = "";
  const step = STEPS[currentStep];
  const renderers = {
    class: renderClassStep,
    heritage: renderHeritageStep,
    traits: renderTraitsStep,
    derived: renderDerivedStep,
    equipment: renderEquipmentStep,
    background: renderBackgroundStep,
    experiences: renderExperiencesStep,
    domainCards: renderDomainCardsStep,
    connections: renderConnectionsStep,
  };
  renderers[step.key](panel);
}

function cardTile(card, selected, onClick) {
  const tile = document.createElement("div");
  tile.className = "card-tile" + (selected ? " selected" : "");
  tile.appendChild(renderCardArt(card));
  const label = document.createElement("div");
  label.className = "card-tile-label";
  label.textContent = card.name;
  tile.appendChild(label);
  tile.addEventListener("click", onClick);
  return tile;
}

function onChange() {
  character.updatedAt = new Date().toISOString();
  persistCurrentCharacter();
  renderAll();
}

// For text inputs: persists and only refreshes nav/buttons, WITHOUT rebuilding the panel
// (rebuilding it on every keystroke would move focus and drop the next character).
function onTextChange() {
  character.updatedAt = new Date().toISOString();
  persistCurrentCharacter();
  renderStepNav();
  renderNavButtons();
}

// --- Step 1: Class ---
function renderClassStep(panel) {
  const nameRow = document.createElement("div");
  nameRow.className = "field-row";
  nameRow.innerHTML = `
    <label>Character name <input id="pc-name" type="text" value="${character.name}" placeholder="Name" /></label>
    <label>Pronouns <input id="pc-pronouns" type="text" value="${character.pronouns}" placeholder="e.g. she/her" /></label>
  `;
  panel.appendChild(nameRow);
  nameRow.querySelector("#pc-name").addEventListener("input", (e) => { character.name = e.target.value; persistCurrentCharacter(); });
  nameRow.querySelector("#pc-pronouns").addEventListener("input", (e) => { character.pronouns = e.target.value; persistCurrentCharacter(); });

  const h3a = document.createElement("h3");
  h3a.textContent = "Class";
  panel.appendChild(h3a);

  const classGrid = document.createElement("div");
  classGrid.className = "tile-grid";
  for (const cls of db.classes) {
    const tile = document.createElement("div");
    tile.className = "class-tile" + (character.classId === cls.id ? " selected" : "");
    tile.innerHTML = `<strong>${titleCase(cls.name)}</strong><span>${cls.domains.map(titleCase).join(" · ")}</span>`;
    tile.addEventListener("click", () => {
      character.classId = cls.id;
      character.subclassId = null;
      onChange();
    });
    classGrid.appendChild(tile);
  }
  panel.appendChild(classGrid);

  const cls = selectedClass();
  if (cls) {
    const h3b = document.createElement("h3");
    h3b.textContent = "Subclass";
    panel.appendChild(h3b);

    const subGrid = document.createElement("div");
    subGrid.className = "tile-grid";
    const subsForClass = db.subclasses.filter((s) => s.class === classNameKey(cls));
    for (const sub of subsForClass) {
      const card = {
        id: sub.id, name: sub.name["en-US"], art: subclassCardArtPath(sub.id, "foundation"),
        type: "Subclass", features: sub.foundation?.features,
      };
      const tile = cardTile(card, character.subclassId === sub.id, () => {
        character.subclassId = sub.id;
        onChange();
      });
      subGrid.appendChild(tile);
    }
    panel.appendChild(subGrid);
  }
}

function classNameKey(cls) {
  // subclasses.json's "class" field is the class name in uppercase (e.g. "WIZARD")
  return cls.name.toUpperCase();
}

// --- Step 2: Heritage ---
function renderHeritageStep(panel) {
  const h = character.heritage;

  const modeRow = document.createElement("div");
  modeRow.className = "field-row";
  modeRow.innerHTML = `
    <label><input type="radio" name="ancestry-mode" value="pure" ${h.ancestryMode === "pure" ? "checked" : ""}/> Pure ancestry</label>
    <label><input type="radio" name="ancestry-mode" value="mixed" ${h.ancestryMode === "mixed" ? "checked" : ""}/> Mixed ancestry</label>
  `;
  panel.appendChild(modeRow);
  modeRow.querySelectorAll('input[name="ancestry-mode"]').forEach((r) => {
    r.addEventListener("change", (e) => {
      h.ancestryMode = e.target.value;
      h.ancestryIds = [];
      h.chosenFeatures = [];
      onChange();
    });
  });

  const h3 = document.createElement("h3");
  h3.textContent = "Ancestry";
  panel.appendChild(h3);

  const ancGrid = document.createElement("div");
  ancGrid.className = "tile-grid";
  for (const anc of db.ancestries) {
    const card = { id: anc.id, name: anc.name["en-US"], art: ancestryCardArtPath(anc.id), type: "Ancestry", features: anc.features };
    const selected = h.ancestryIds.includes(anc.id);
    const tile = cardTile(card, selected, () => {
      if (h.ancestryMode === "pure") {
        h.ancestryIds = [anc.id];
        h.chosenFeatures = anc.features.map((f) => ({ ancestryId: anc.id, featureName: f.name["en-US"] }));
      } else {
        if (selected) {
          h.ancestryIds = h.ancestryIds.filter((id) => id !== anc.id);
          h.chosenFeatures = h.chosenFeatures.filter((f) => f.ancestryId !== anc.id);
        } else if (h.ancestryIds.length < 2) {
          h.ancestryIds.push(anc.id);
        }
      }
      onChange();
    });
    if (h.ancestryMode === "mixed" && h.ancestryIds.length >= 2 && !selected) {
      tile.classList.add("disabled");
    }
    ancGrid.appendChild(tile);
  }
  panel.appendChild(ancGrid);

  if (h.ancestryMode === "mixed" && h.ancestryIds.length > 0) {
    const featH = document.createElement("h3");
    featH.textContent = "Pick 1 feature from each ancestry";
    panel.appendChild(featH);
    for (const ancId of h.ancestryIds) {
      const anc = db.ancestries.find((a) => a.id === ancId);
      const group = document.createElement("div");
      group.className = "feature-choice-group";
      const title = document.createElement("strong");
      title.textContent = anc.name["en-US"];
      group.appendChild(title);
      for (const feat of anc.features) {
        const chosen = h.chosenFeatures.some((f) => f.ancestryId === ancId && f.featureName === feat.name["en-US"]);
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "feature-pick" + (chosen ? " selected" : "");
        btn.innerHTML = `<strong>${feat.name["en-US"]}</strong><span>${featureText(feat)}</span>`;
        btn.addEventListener("click", () => {
          h.chosenFeatures = h.chosenFeatures.filter((f) => f.ancestryId !== ancId);
          h.chosenFeatures.push({ ancestryId: ancId, featureName: feat.name["en-US"] });
          onChange();
        });
        group.appendChild(btn);
      }
      panel.appendChild(group);
    }
  } else if (h.ancestryMode === "pure" && h.ancestryIds.length > 0) {
    const anc = db.ancestries.find((a) => a.id === h.ancestryIds[0]);
    const info = document.createElement("p");
    info.className = "hint";
    info.textContent = `Features: ${anc.features.map((f) => f.name["en-US"]).join(", ")}`;
    panel.appendChild(info);
  }

  const h3c = document.createElement("h3");
  h3c.textContent = "Community";
  panel.appendChild(h3c);
  const comGrid = document.createElement("div");
  comGrid.className = "tile-grid";
  for (const com of db.communities) {
    const card = { id: com.id, name: com.name["en-US"], art: communityCardArtPath(com.id), type: "Community", features: com.features };
    const tile = cardTile(card, h.communityId === com.id, () => {
      h.communityId = com.id;
      onChange();
    });
    comGrid.appendChild(tile);
  }
  panel.appendChild(comGrid);
}

// --- Step 3: Traits ---
function renderTraitsStep(panel) {
  const info = document.createElement("p");
  info.className = "hint";
  info.textContent = "Distribute these 6 values across the 6 traits, one each: +2, +1, +1, 0, 0, -1.";
  panel.appendChild(info);

  const usedCount = {};
  for (const v of TRAIT_ARRAY) usedCount[v] = (usedCount[v] || 0) + 1;
  for (const k of TRAIT_KEYS) {
    const v = character.traits[k];
    if (v !== null) usedCount[v] -= 1;
  }

  const grid = document.createElement("div");
  grid.className = "traits-grid";
  for (const k of TRAIT_KEYS) {
    const row = document.createElement("div");
    row.className = "trait-row";
    const current = character.traits[k];
    const options = TRAIT_ARRAY.filter((v, i, arr) => arr.indexOf(v) === i); // distinct values: 2,1,0,-1
    let optionsHtml = `<option value="">—</option>`;
    for (const v of options) {
      const available = usedCount[v] + (current === v ? 1 : 0);
      if (available > 0) {
        optionsHtml += `<option value="${v}" ${current === v ? "selected" : ""}>${v > 0 ? "+" + v : v}</option>`;
      }
    }
    row.innerHTML = `<label>${TRAIT_LABELS[k]}</label><select data-trait="${k}">${optionsHtml}</select>`;
    grid.appendChild(row);
  }
  panel.appendChild(grid);

  grid.querySelectorAll("select").forEach((sel) => {
    sel.addEventListener("change", (e) => {
      const key = e.target.dataset.trait;
      const val = e.target.value === "" ? null : Number(e.target.value);
      character.traits[key] = val;
      onChange();
    });
  });
}

// --- Step 4: Derived info ---
function renderDerivedStep(panel) {
  const cls = selectedClass();
  const box = document.createElement("div");
  box.className = "derived-box";
  box.innerHTML = `
    <div><span>Evasion</span><strong>${cls ? cls.startingEvasion : "—"}</strong></div>
    <div><span>Hit Points</span><strong>${cls ? cls.startingHitPoints : "—"}</strong></div>
    <div><span>Stress</span><strong>6</strong></div>
    <div><span>Hope</span><strong>2 / 6</strong></div>
  `;
  panel.appendChild(box);
  if (!cls) {
    const warn = document.createElement("p");
    warn.className = "hint";
    warn.textContent = "Go back to Step 1 to pick a class: Evasion and Hit Points come from there.";
    panel.appendChild(warn);
  }
}

// --- Step 5: Equipment ---
function renderEquipmentStep(panel) {
  const e = character.equipment;

  const modeRow = document.createElement("div");
  modeRow.className = "field-row";
  modeRow.innerHTML = `
    <label><input type="radio" name="weapon-mode" value="two-handed" ${e.weaponMode === "two-handed" ? "checked" : ""}/> Two-handed primary</label>
    <label><input type="radio" name="weapon-mode" value="one-handed" ${e.weaponMode === "one-handed" ? "checked" : ""}/> One-handed primary + secondary</label>
  `;
  panel.appendChild(modeRow);
  modeRow.querySelectorAll('input[name="weapon-mode"]').forEach((r) => {
    r.addEventListener("change", (ev) => {
      e.weaponMode = ev.target.value;
      e.primaryWeaponId = null;
      e.secondaryWeaponId = null;
      onChange();
    });
  });

  const primaryBurden = e.weaponMode === "two-handed" ? "TWO_HANDED" : "ONE_HANDED";
  const primaries = db.weapons.filter((w) => w.tier === 1 && w.burden === primaryBurden && (w.type === "PRIMARY_PHYSICAL" || w.type === "PRIMARY_MAGIC"));

  const h3a = document.createElement("h3");
  h3a.textContent = "Primary weapon (Tier 1)";
  panel.appendChild(h3a);
  panel.appendChild(weaponSelect(primaries, e.primaryWeaponId, (id) => { e.primaryWeaponId = id; onChange(); }));

  if (e.weaponMode === "one-handed") {
    const secondaries = db.weapons.filter((w) => w.tier === 1 && w.type === "SECONDARY");
    const h3b = document.createElement("h3");
    h3b.textContent = "Secondary weapon (Tier 1)";
    panel.appendChild(h3b);
    panel.appendChild(weaponSelect(secondaries, e.secondaryWeaponId, (id) => { e.secondaryWeaponId = id; onChange(); }));
  }

  const h3c = document.createElement("h3");
  h3c.textContent = "Armor (Tier 1)";
  panel.appendChild(h3c);
  const armors = db.armors.filter((a) => a.tier === 1);
  const armorList = document.createElement("div");
  armorList.className = "option-list";
  for (const a of armors) {
    const row = document.createElement("label");
    row.className = "option-row";
    row.innerHTML = `<input type="radio" name="armor" value="${a.id}" ${e.armorId === a.id ? "checked" : ""}/> <strong>${a.name["en-US"]}</strong> — thresholds ${a.baseMajorThreshold}/${a.baseSevereThreshold}, score ${a.baseScore}`;
    row.querySelector("input").addEventListener("change", () => { e.armorId = a.id; onChange(); });
    armorList.appendChild(row);
  }
  panel.appendChild(armorList);

  const h3d = document.createElement("h3");
  h3d.textContent = "Starting potion";
  panel.appendChild(h3d);
  const potionRow = document.createElement("div");
  potionRow.className = "field-row";
  potionRow.innerHTML = `
    <label><input type="radio" name="potion" value="${MINOR_HEALTH_POTION_ID}" ${e.potionChoice === MINOR_HEALTH_POTION_ID ? "checked" : ""}/> Minor Health Potion</label>
    <label><input type="radio" name="potion" value="${MINOR_STAMINA_POTION_ID}" ${e.potionChoice === MINOR_STAMINA_POTION_ID ? "checked" : ""}/> Minor Stamina Potion</label>
  `;
  potionRow.querySelectorAll('input[name="potion"]').forEach((r) => {
    r.addEventListener("change", (ev) => { e.potionChoice = ev.target.value; onChange(); });
  });
  panel.appendChild(potionRow);

  const fixed = document.createElement("p");
  fixed.className = "hint";
  fixed.textContent = "Fixed items (always included): a torch, 50 feet of rope, basic supplies, a handful of gold.";
  panel.appendChild(fixed);
}

function weaponSelect(weapons, selectedId, onSelect) {
  const list = document.createElement("div");
  list.className = "option-list";
  for (const w of weapons) {
    const dmg = `${w.damage.dice} ${w.damage.type === "PHYSICAL" ? "phy" : "mag"}`;
    const row = document.createElement("label");
    row.className = "option-row";
    row.innerHTML = `<input type="radio" name="weapon-${w.type}-${w.burden}" value="${w.id}" ${selectedId === w.id ? "checked" : ""}/> <strong>${w.name["en-US"]}</strong> — ${w.trait} · ${w.range} · ${dmg}`;
    row.querySelector("input").addEventListener("change", () => onSelect(w.id));
    list.appendChild(row);
  }
  return list;
}

// --- Step 6: Background ---
function renderBackgroundStep(panel) {
  const b = character.background;
  panel.innerHTML = `
    <label class="block-label">Description / answers to background questions
      <textarea id="bg-desc" rows="6">${b.description}</textarea>
    </label>
    <label class="block-label">Appearance (clothes, eyes, body, skin, attitude — free text)
      <textarea id="bg-answers" rows="4">${b.answers}</textarea>
    </label>
  `;
  panel.querySelector("#bg-desc").addEventListener("input", (e) => { b.description = e.target.value; persistCurrentCharacter(); });
  panel.querySelector("#bg-answers").addEventListener("input", (e) => { b.answers = e.target.value; persistCurrentCharacter(); });
}

// --- Step 7: Experience ---
function renderExperiencesStep(panel) {
  const info = document.createElement("p");
  info.className = "hint";
  info.textContent = "Exactly 2 Experiences, each with a fixed +2 modifier (a descriptive skill, not a specific mechanical ability — e.g. 'Swashbuckler' yes, 'One-Hit Kill' no).";
  panel.appendChild(info);

  character.experiences.forEach((exp, i) => {
    const row = document.createElement("div");
    row.className = "field-row";
    row.innerHTML = `<label>Experience ${i + 1} <input type="text" value="${exp.name}" placeholder="e.g. Assassin of the Sapphire Syndicate" /></label> <span class="exp-mod">+2</span>`;
    row.querySelector("input").addEventListener("input", (e) => {
      character.experiences[i].name = e.target.value;
      onTextChange();
    });
    panel.appendChild(row);
  });
}

// --- Step 8: Domain Cards ---
function renderDomainCardsStep(panel) {
  const cls = selectedClass();
  if (!cls) {
    panel.innerHTML = `<p class="hint">Go back to Step 1 to pick a class: the available domain cards depend on it.</p>`;
    return;
  }
  const info = document.createElement("p");
  info.className = "hint";
  info.textContent = `Pick exactly 2 level 1 cards from ${titleCase(cls.name)}'s domains (${cls.domains.map(titleCase).join(" / ")}), in any combination.`;
  panel.appendChild(info);

  const available = db.domainCards.filter((c) => c.level === 1 && cls.domains.includes(c.domain));
  const grid = document.createElement("div");
  grid.className = "tile-grid";
  for (const c of available) {
    const card = { id: c.id, name: c.name["en-US"], art: domainCardArtPath(c.id), level: c.level, type: c.type, features: c.features };
    const selected = character.domainCardIds.includes(c.id);
    const tile = cardTile(card, selected, () => {
      if (selected) {
        character.domainCardIds = character.domainCardIds.filter((id) => id !== c.id);
      } else if (character.domainCardIds.length < 2) {
        character.domainCardIds.push(c.id);
      }
      onChange();
    });
    if (!selected && character.domainCardIds.length >= 2) tile.classList.add("disabled");
    grid.appendChild(tile);
  }
  panel.appendChild(grid);
}

// --- Step 9: Connections ---
function renderConnectionsStep(panel) {
  panel.innerHTML = `
    <p class="hint">Connections involve the rest of the party: jot down here whatever you decide together at the table.</p>
    <textarea id="conn-notes" rows="8">${character.connectionsNotes}</textarea>
  `;
  panel.querySelector("#conn-notes").addEventListener("input", (e) => {
    character.connectionsNotes = e.target.value;
    persistCurrentCharacter();
  });
}

// ---------- bootstrap ----------

function renderAll() {
  renderStepNav();
  renderStepPanel();
  renderNavButtons();
}

async function init() {
  await loadAllData();
  initCharacter();
  document.getElementById("prev-btn").addEventListener("click", () => goToStep(Math.max(0, currentStep - 1)));
  document.getElementById("next-btn").addEventListener("click", () => goToStep(Math.min(STEPS.length - 1, currentStep + 1)));
  document.getElementById("finish-btn").addEventListener("click", () => {
    persistCurrentCharacter();
    location.href = "characters.html";
  });
  renderAll();
}

init();
