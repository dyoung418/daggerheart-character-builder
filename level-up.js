import { renderCardArt, domainCardArtPath, subclassCardArtPath } from "./shared/card-render.js";
import {
  ADVANCEMENT_LABELS,
  MAX_HIT_POINT_SLOTS,
  MAX_STRESS_SLOTS,
  SLOT_TIERS,
  availableOptionKeys,
  ensureLevelFields,
  extraCardLevelCap,
  isLevelAchievement,
  nextSubclassTier,
  optionCost,
  remainingSlots,
  slotsInTier,
  slotsPerPick,
  tierForLevel,
} from "./shared/advancement.js";
import {
  contextForLevel,
  experiencesAtLevel,
  recomputeCharacter,
  unresolvedProblems,
  validateEntry,
} from "./shared/history.js";
import { escapeHtml } from "./shared/escape.js";

const CHAR_STORAGE_KEY = "dh-characters-v1";
const TRAIT_LABELS = { agility: "Agility", strength: "Strength", finesse: "Finesse", instinct: "Instinct", presence: "Presence", knowledge: "Knowledge" };
const BASE_STRESS_SLOTS = 6;
const ORDINALS = ["first", "second", "third"];

const db = {};
let character = null;

// UI state for the current level up (not persisted until confirmed).
// One entry per slot marked on the sheet, so the same option can be taken twice in a
// level ("options with multiple slots can be chosen more than once"). Each entry records
// WHICH tier's slot it marks, because that caps the extra domain card's level.
let picks = []; // { key, slotTier, traits: [], experienceIds: [], cardId: null }
let mandatoryCardId = null;
let exchange = null; // optional { outCardId, inCardId }: the swap allowed on every level up

// With ?level=N the screen edits a level already taken instead of gaining a new one: same
// pickers, but everything is evaluated against the character as it stood at that level.
let editLevel = null;
let context = null; // replayed state the level being worked on is chosen against
let pendingSave = null; // consequences awaiting confirmation before an edit is written

const isEditing = () => editLevel !== null;
const workingLevel = () => (isEditing() ? editLevel : character.level + 1);

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
function findDomainCard(id) { return db.domainCards.find((c) => c.id === id); }

// ---------- pick bookkeeping ----------

function picksFor(key, slotTier) {
  return picks.filter((p) => p.key === key && (slotTier === undefined || p.slotTier === slotTier));
}

function budgetSpent() {
  return picks.reduce((sum, p) => sum + optionCost(p.key), 0);
}

function slotsTakenInTier(key, tier) {
  const already = context.slotsUsed?.[key]?.[tier] || 0;
  return already + picksFor(key, tier).length * slotsPerPick(key);
}

function totalRemainingAcrossAllOptions(newLevel) {
  return availableOptionKeys(newLevel)
    .reduce((sum, key) => sum + remainingSlots(context.slotsUsed, key, newLevel), 0);
}

// The context already has this level's tier achievement applied, so marks cleared at 5 and
// 8 are simply absent from it and those traits can be raised again.
function traitMarkedBefore(key) {
  return !!context.traitMarks[key];
}

function traitsPickedThisLevel() {
  return picksFor("traits").flatMap((p) => p.traits);
}

function subclassTierAfterPicks() {
  let tier = context.subclassTier;
  for (let i = 0; i < picksFor("subclass").length; i++) tier = nextSubclassTier(tier);
  return tier;
}

function hitPointsAfterPicks() {
  const cls = selectedClass();
  return (cls ? cls.startingHitPoints : 0) + context.hitPointSlotsBonus + picksFor("hitPoint").length;
}

function stressAfterPicks() {
  return BASE_STRESS_SLOTS + context.stressSlotsBonus + picksFor("stress").length;
}

// Why a given slot can't be marked right now (null when it can).
function markBlockedReason(key, tier, newLevel) {
  if (picksFor("proficiency").length > 0) return "Proficiency uses both picks for this level.";
  if (key === "proficiency" && picks.length > 0) return "Proficiency needs both picks: clear the other one first.";
  if (budgetSpent() + optionCost(key) > 2) return "No choice points left this level.";
  if (slotsTakenInTier(key, tier) + slotsPerPick(key) > slotsInTier(key, tier)) return "No slots left in this tier.";
  if (key === "subclass" && subclassTierAfterPicks() === "mastery") return "Subclass is already at Mastery.";
  if (key === "hitPoint" && hitPointsAfterPicks() >= MAX_HIT_POINT_SLOTS) return `Hit Points are at the maximum of ${MAX_HIT_POINT_SLOTS}.`;
  if (key === "stress" && stressAfterPicks() >= MAX_STRESS_SLOTS) return `Stress is at the maximum of ${MAX_STRESS_SLOTS}.`;
  return null;
}

function addPick(key, slotTier) {
  picks.push({ key, slotTier, traits: [], experienceIds: [], cardId: null });
}

// The Experience granted by the tier achievement exists before advancements are chosen, so
// it can be boosted at the very level that grants it. It only becomes real on confirm.
function pendingExperienceId(newLevel) {
  return `exp_lv${newLevel}`;
}

function experiencesForPicking(newLevel) {
  const list = experiencesAtLevel(character, newLevel, context.expBonus);
  if (isLevelAchievement(newLevel) && !list.some((e) => e.sinceLevel === newLevel)) {
    list.push({ id: pendingExperienceId(newLevel), name: "", modifier: 2, sinceLevel: newLevel, pending: true });
  }
  return list;
}

function removeLastPick(key, slotTier) {
  for (let i = picks.length - 1; i >= 0; i--) {
    if (picks[i].key === key && picks[i].slotTier === slotTier) {
      picks.splice(i, 1);
      return;
    }
  }
}

// ---------- render ----------

function render() {
  const main = document.getElementById("level-up-main");
  main.innerHTML = "";

  if (!character) {
    main.innerHTML = `<p class="hint">Character not found.</p>`;
    return;
  }
  const cls = selectedClass();
  const newLevel = workingLevel();
  context = contextForLevel(character, newLevel);

  if (!isEditing() && character.level >= 10) {
    main.innerHTML = `<p class="hint">${escapeHtml(character.name || "This character")} is already at the maximum level (10).</p>
      <a class="btn-ghost" href="characters.html">← Back to list</a>`;
    return;
  }

  const title = document.createElement("h3");
  title.textContent = isEditing()
    ? `${character.name || "(unnamed)"} — editing level ${newLevel}`
    : `${character.name || "(unnamed)"} — level ${character.level} → ${newLevel}`;
  title.style.marginTop = "0";
  main.appendChild(title);

  if (isEditing()) {
    const note = document.createElement("p");
    note.className = "hint";
    note.textContent = "You're changing choices already made. Everything below is shown as it stood at this level. " +
      "Later levels can be affected — you'll be told which before anything is saved.";
    main.appendChild(note);

    const problems = validateEntry(character, currentEntry(newLevel), db);
    if (problems.length > 0) renderProblemBox(main, "This level currently doesn't add up:", problems);
  }

  if (isLevelAchievement(newLevel)) {
    const box = document.createElement("p");
    box.className = "hint";
    box.textContent = `Automatic level achievement: a new Experience at +2 and +1 permanent Proficiency.` +
      (newLevel >= 5 ? " Marks on traits you've already increased are cleared: you can raise them again." : "");
    main.appendChild(box);
  }

  renderAdvancementGrid(main, newLevel);
  renderSubPickers(main, cls, newLevel);
  renderMandatoryCardStep(main, cls, newLevel);
  renderExchangeSection(main, cls);

  renderConfirmBar(main, newLevel);
}

function renderAdvancementGrid(main, newLevel) {
  const h = document.createElement("h3");
  h.textContent = "Mark 2 advancement slots";
  main.appendChild(h);

  const spent = budgetSpent();
  const info = document.createElement("p");
  info.className = "hint";
  info.textContent = `Choice points used: ${spent}/2. You can mark any unmarked slot from your tier or below, ` +
    `including two in the same row. Proficiency marks both of its slots and uses the whole level.`;
  main.appendChild(info);

  const maxTier = tierForLevel(newLevel);
  const tiers = SLOT_TIERS.filter((t) => t <= maxTier);

  const grid = document.createElement("div");
  grid.className = "advancement-grid";

  const head = document.createElement("div");
  head.className = "adv-row adv-head";
  head.appendChild(labelCell(""));
  for (const tier of tiers) {
    const cell = document.createElement("span");
    cell.className = "adv-tier-group";
    cell.textContent = `Tier ${tier}`;
    head.appendChild(cell);
  }
  grid.appendChild(head);

  for (const key of availableOptionKeys(newLevel)) {
    const row = document.createElement("div");
    row.className = "adv-row";
    row.appendChild(labelCell(rowLabel(key, tiers)));
    for (const tier of tiers) {
      row.appendChild(tierGroupCell(key, tier, newLevel));
    }
    grid.appendChild(row);
  }
  main.appendChild(grid);

  const legend = document.createElement("p");
  legend.className = "hint slot-legend";
  legend.textContent = "■ spent at an earlier level · ☒ marking now · □ available";
  main.appendChild(legend);
}

function labelCell(text) {
  const cell = document.createElement("span");
  cell.className = "adv-label";
  cell.textContent = text;
  return cell;
}

// The extra domain card's cap differs per tier, so it goes in the row label the way the
// character sheet prints it on the option itself.
function rowLabel(key, tiers) {
  if (key !== "domainCard") return ADVANCEMENT_LABELS[key];
  const caps = tiers.map((tier) => `≤${extraCardLevelCap(10, tier)}`).join(" / ");
  return `Extra domain card (${caps})`;
}

function tierGroupCell(key, tier, newLevel) {
  const cell = document.createElement("span");
  cell.className = "adv-tier-group";
  const total = slotsInTier(key, tier);
  if (total === 0) {
    cell.textContent = "—";
    cell.classList.add("adv-tier-empty");
    return cell;
  }

  const alreadyUsed = context.slotsUsed?.[key]?.[tier] || 0;
  const markingNow = picksFor(key, tier).length * slotsPerPick(key);
  const blocked = markBlockedReason(key, tier, newLevel);

  for (let i = 0; i < total; i++) {
    const box = document.createElement("button");
    box.className = "slot-box";
    box.type = "button";
    if (i < alreadyUsed) {
      box.classList.add("filled");
      box.disabled = true;
      box.title = "Marked at an earlier level";
    } else if (i < alreadyUsed + markingNow) {
      box.classList.add("marking");
      box.title = "Marking now — click to undo";
      box.addEventListener("click", () => { removeLastPick(key, tier); render(); });
    } else if (blocked) {
      box.classList.add("blocked");
      box.disabled = true;
      box.title = blocked;
    } else {
      box.classList.add("open");
      box.title = `Mark this tier ${tier} slot`;
      box.addEventListener("click", () => { addPick(key, tier); render(); });
    }
    cell.appendChild(box);
  }
  return cell;
}

// ---------- per-pick sub-choices ----------

function renderSubPickers(main, cls, newLevel) {
  const counters = {};
  picks.forEach((pick, index) => {
    counters[pick.key] = (counters[pick.key] || 0) + 1;
    const total = picksFor(pick.key).length;
    const ordinal = total > 1 ? ` (${ORDINALS[counters[pick.key] - 1]})` : "";
    if (pick.key === "traits") renderTraitSubPicker(main, pick, index, ordinal, newLevel);
    if (pick.key === "experience") renderExperienceSubPicker(main, pick, ordinal, newLevel);
    if (pick.key === "domainCard") renderExtraCardPicker(main, pick, index, ordinal, cls, newLevel);
    if (pick.key === "subclass") renderSubclassPreview(main);
  });
}

function subHeading(main, text) {
  const h = document.createElement("p");
  h.className = "hint sub-pick-heading";
  h.textContent = text;
  main.appendChild(h);
}

function renderTraitSubPicker(main, pick, index, ordinal, newLevel) {
  subHeading(main, `Traits${ordinal}: pick 2 unmarked traits to raise by +1.`);
  const grid = document.createElement("div");
  grid.className = "traits-grid";
  for (const key of Object.keys(TRAIT_LABELS)) {
    const markedBefore = traitMarkedBefore(key);
    const takenByAnotherPick = picks.some((p) => p !== pick && p.traits.includes(key));
    const isPicked = pick.traits.includes(key);
    const disabled = markedBefore || takenByAnotherPick || (!isPicked && pick.traits.length >= 2);
    const note = markedBefore ? " (already marked)" : takenByAnotherPick ? " (taken above)" : "";

    const row = document.createElement("label");
    row.className = "option-row";
    row.innerHTML = `<input type="checkbox" ${isPicked ? "checked" : ""} ${disabled ? "disabled" : ""}/> ${escapeHtml(TRAIT_LABELS[key])}${note}`;
    row.querySelector("input").addEventListener("change", (e) => {
      if (e.target.checked) pick.traits.push(key);
      else pick.traits = pick.traits.filter((k) => k !== key);
      render();
    });
    grid.appendChild(row);
  }
  main.appendChild(grid);
}

function renderExperienceSubPicker(main, pick, ordinal, newLevel) {
  subHeading(main, `Experiences${ordinal}: pick 2 to give +1 to.`);
  const list = document.createElement("div");
  list.className = "option-list";
  for (const exp of experiencesForPicking(newLevel)) {
    const isPicked = pick.experienceIds.includes(exp.id);
    const disabled = !isPicked && pick.experienceIds.length >= 2;
    const name = exp.pending ? "(the new Experience from this level)" : (exp.name || "(unnamed)");
    const row = document.createElement("label");
    row.className = "option-row";
    row.innerHTML = `<input type="checkbox" ${isPicked ? "checked" : ""} ${disabled ? "disabled" : ""}/> ${escapeHtml(name)} <span class="exp-mod">+${escapeHtml(exp.modifier)}</span>`;
    row.querySelector("input").addEventListener("change", (e) => {
      if (e.target.checked) pick.experienceIds.push(exp.id);
      else pick.experienceIds = pick.experienceIds.filter((id) => id !== exp.id);
      render();
    });
    list.appendChild(row);
  }
  main.appendChild(list);
}

function renderSubclassPreview(main) {
  const nextTier = nextSubclassTier(context.subclassTier);
  subHeading(main, `You'll take the ${nextTier} card for your subclass.`);
  const sub = db.subclasses.find((s) => s.id === character.subclassId);
  const preview = document.createElement("div");
  preview.className = "tile-grid";
  const tile = document.createElement("div");
  tile.className = "card-tile";
  tile.appendChild(renderCardArt({
    id: character.subclassId, name: nextTier, art: subclassCardArtPath(character.subclassId, nextTier),
    type: "Subclass", features: sub?.[nextTier]?.features,
  }));
  preview.appendChild(tile);
  main.appendChild(preview);
}

// ---------- domain cards ----------

function cardModel(c) {
  return { id: c.id, name: c.name["en-US"], art: domainCardArtPath(c.id), level: c.level, type: c.type, features: c.features };
}

function eligibleDomainCards(cls, maxLevel, excludeIds) {
  if (!cls) return [];
  return db.domainCards.filter((c) => c.level <= maxLevel && cls.domains.includes(c.domain) && !excludeIds.includes(c.id));
}

// Every card already owned, plus every card being taken elsewhere on this screen.
function claimedCardIds(except) {
  const claimed = [...context.cardIds];
  if (mandatoryCardId && except !== "mandatory") claimed.push(mandatoryCardId);
  for (const p of picksFor("domainCard")) {
    if (p.cardId && p !== except) claimed.push(p.cardId);
  }
  if (exchange?.inCardId && except !== "exchange") claimed.push(exchange.inCardId);
  return claimed;
}

function renderCardGrid(main, cards, selectedId, onSelect) {
  const grid = document.createElement("div");
  grid.className = "tile-grid";
  for (const c of cards) {
    const card = cardModel(c);
    const tile = document.createElement("div");
    tile.className = "card-tile" + (selectedId === c.id ? " selected" : "");
    tile.appendChild(renderCardArt(card));
    const label = document.createElement("div");
    label.className = "card-tile-label";
    label.textContent = card.name;
    tile.appendChild(label);
    tile.addEventListener("click", () => { onSelect(c.id); render(); });
    grid.appendChild(tile);
  }
  main.appendChild(grid);
}

function renderExtraCardPicker(main, pick, index, ordinal, cls, newLevel) {
  const cap = extraCardLevelCap(newLevel, pick.slotTier);
  subHeading(main, `Extra domain card${ordinal}: level ≤ ${cap} (tier ${pick.slotTier} slot, capped at ${extraCardLevelCap(10, pick.slotTier)}; your level is ${newLevel}).`);
  const cards = eligibleDomainCards(cls, cap, claimedCardIds(pick));
  renderCardGrid(main, cards, pick.cardId, (id) => { pick.cardId = id; });
}

function renderMandatoryCardStep(main, cls, newLevel) {
  const h = document.createElement("h3");
  h.textContent = "New domain card (guaranteed every level)";
  main.appendChild(h);
  const cards = eligibleDomainCards(cls, newLevel, claimedCardIds("mandatory"));
  renderCardGrid(main, cards, mandatoryCardId, (id) => { mandatoryCardId = id; });
}

// Optional swap allowed on every level up: "you can also exchange one domain card you've
// previously acquired for a different domain card of the same level or lower".
function renderExchangeSection(main, cls) {
  if (context.cardIds.length === 0) return;

  const details = document.createElement("details");
  details.className = "exchange-section";
  details.open = !!exchange;
  const summary = document.createElement("summary");
  summary.textContent = "Exchange a card you already have (optional)";
  details.appendChild(summary);

  const hint = document.createElement("p");
  hint.className = "hint";
  hint.textContent = "On a level up you may swap one card you've already acquired for a different one of the same level or lower.";
  details.appendChild(hint);

  const row = document.createElement("div");
  row.className = "field-row";
  const options = context.cardIds.map((id) => {
    const c = findDomainCard(id);
    if (!c) return "";
    const label = `${c.name["en-US"]} (level ${c.level})`;
    return `<option value="${escapeHtml(id)}" ${exchange?.outCardId === id ? "selected" : ""}>${escapeHtml(label)}</option>`;
  }).join("");
  row.innerHTML = `<label>Give up <select><option value="">— none —</option>${options}</select></label>`;
  row.querySelector("select").addEventListener("change", (e) => {
    exchange = e.target.value ? { outCardId: e.target.value, inCardId: null } : null;
    render();
  });
  details.appendChild(row);

  if (exchange?.outCardId) {
    const out = findDomainCard(exchange.outCardId);
    const cap = out ? out.level : 1;
    const pickHint = document.createElement("p");
    pickHint.className = "hint";
    pickHint.textContent = `Take instead (level ≤ ${cap}):`;
    details.appendChild(pickHint);
    const cards = eligibleDomainCards(cls, cap, claimedCardIds("exchange"));
    renderCardGrid(details, cards, exchange.inCardId, (id) => { exchange.inCardId = id; });
  }

  main.appendChild(details);
}

// ---------- confirm ----------

function stepValidation(newLevel) {
  const spent = budgetSpent();
  const totalRemaining = totalRemainingAcrossAllOptions(newLevel);
  const budgetOk = spent === 2 || (totalRemaining < 2 && spent === totalRemaining);
  if (!budgetOk) return false;

  for (const pick of picks) {
    if (pick.key === "traits" && pick.traits.length !== 2) return false;
    if (pick.key === "experience" && new Set(pick.experienceIds).size !== 2) return false;
    if (pick.key === "domainCard" && !pick.cardId) return false;
  }
  // Taking the trait option twice needs four DIFFERENT unmarked traits.
  const allTraits = traitsPickedThisLevel();
  if (new Set(allTraits).size !== allTraits.length) return false;

  if (!mandatoryCardId) return false;
  if (exchange && !exchange.inCardId) return false;
  return true;
}

function renderProblemBox(main, heading, problems) {
  const box = document.createElement("div");
  box.className = "problem-box";
  box.innerHTML = `<strong>${escapeHtml(heading)}</strong>` +
    problems.map((p) => `<div>└ ${escapeHtml(p)}</div>`).join("");
  main.appendChild(box);
}

// The picks on screen, in the shape they're stored in.
function currentEntry(level) {
  return {
    level,
    picks: picks.map((p) => {
      const entry = { key: p.key, slotTier: p.slotTier };
      if (p.key === "traits") entry.traits = [...p.traits];
      if (p.key === "experience") entry.experienceIds = [...p.experienceIds];
      if (p.key === "domainCard") entry.cardId = p.cardId;
      return entry;
    }),
    mandatoryCardId,
    exchange: exchange?.outCardId && exchange.inCardId ? { ...exchange } : null,
  };
}

function renderConfirmBar(main, newLevel) {
  if (pendingSave) {
    renderSavePreview(main, newLevel);
    return;
  }

  const bar = document.createElement("div");
  bar.className = "wizard-actions";
  const back = document.createElement("a");
  back.className = "btn-ghost";
  back.href = isEditing() ? `characters.html?open=${character.id}&history=1` : "characters.html";
  back.textContent = "← Cancel";
  bar.appendChild(back);

  const confirm = document.createElement("button");
  confirm.className = "btn-primary";
  confirm.textContent = isEditing() ? `Save level ${newLevel}` : `Confirm level ${newLevel}`;
  confirm.disabled = !stepValidation(newLevel);
  confirm.addEventListener("click", () => (isEditing() ? reviewLevelEdit(newLevel) : applyLevelUp(newLevel)));
  bar.appendChild(confirm);
  main.appendChild(bar);
}

// What the edit would break, shown before anything is written — the cheapest moment to
// change your mind, since afterwards it takes another edit (or the undo) to get back.
function renderSavePreview(main, newLevel) {
  const box = document.createElement("div");
  box.className = "problem-box";
  const { consequences } = pendingSave;
  if (consequences.length === 0) {
    box.innerHTML = `<strong>Save level ${escapeHtml(newLevel)}? No other level is affected.</strong>`;
  } else {
    box.innerHTML = `<strong>Saving level ${escapeHtml(newLevel)} makes ${escapeHtml(consequences.length)} later level${consequences.length === 1 ? "" : "s"} stop adding up:</strong>` +
      consequences.map((c) => `<div>└ L${escapeHtml(c.level)} — ${escapeHtml(c.errors[0])}</div>`).join("") +
      `<div class="hint">You can fix them from the character sheet, or keep them as they are.</div>`;
  }
  main.appendChild(box);

  const bar = document.createElement("div");
  bar.className = "wizard-actions";
  bar.appendChild(actionButton("← Back", "btn-ghost", () => { pendingSave = null; render(); }));
  bar.appendChild(actionButton(consequences.length ? "Save anyway" : `Save level ${newLevel}`, "btn-primary", () => commitLevelEdit(newLevel)));
  main.appendChild(bar);
}

function actionButton(label, className, onClick) {
  const b = document.createElement("button");
  b.className = className;
  b.textContent = label;
  b.addEventListener("click", onClick);
  return b;
}

// Try the edit on a copy first, so the consequences can be reported without touching the
// stored character.
function reviewLevelEdit(newLevel) {
  const trial = JSON.parse(JSON.stringify(character));
  writeEntry(trial, newLevel);
  const before = new Set(unresolvedProblems(character, db).map((p) => p.level));
  const consequences = unresolvedProblems(trial, db).filter((p) => p.level !== newLevel && !before.has(p.level));
  pendingSave = { consequences };
  render();
}

// Replaces the recorded choices for a level that's already been taken.
function writeEntry(target, newLevel) {
  const entry = currentEntry(newLevel);
  const at = target.levelUps.findIndex((e) => e.level === newLevel);
  const previous = at >= 0 ? target.levelUps[at] : null;

  // The creation card list is an input to the replay rather than a product of it, so an
  // exchange that swapped a starting card has to be undone before the new one is applied.
  const oldExchange = previous?.exchange;
  if (oldExchange?.outCardId && oldExchange.inCardId) {
    target.creationDomainCardIds = target.creationDomainCardIds.map((id) => (id === oldExchange.inCardId ? oldExchange.outCardId : id));
  }
  if (entry.exchange) {
    target.creationDomainCardIds = target.creationDomainCardIds.map((id) => (id === entry.exchange.outCardId ? entry.exchange.inCardId : id));
  }

  // Redeclaring a level withdraws any earlier "keep as is": it's being reconsidered.
  if (at >= 0) target.levelUps[at] = entry; else target.levelUps.push(entry);
  recomputeCharacter(target);
  return target;
}

function commitLevelEdit(newLevel) {
  saveUndoSnapshot();
  writeEntry(character, newLevel);
  character.updatedAt = new Date().toISOString();
  persistCharacter();
  location.href = `characters.html?open=${character.id}&history=1`;
}

// One undo slot, matching the character sheet's. Only the recorded truth is kept: the
// derived stats come back from replaying it.
function saveUndoSnapshot() {
  try {
    localStorage.setItem("dh-level-edit-undo-v1", JSON.stringify({
      id: character.id,
      at: new Date().toISOString(),
      levelUps: JSON.parse(JSON.stringify(character.levelUps || [])),
      experiences: JSON.parse(JSON.stringify(character.experiences || [])),
      level: character.level,
      baseline: JSON.parse(JSON.stringify(character.baseline)),
      baselineLevel: character.baselineLevel,
      creationDomainCardIds: [...(character.creationDomainCardIds || [])],
      domainVaultIds: [...(character.domainVaultIds || [])],
    }));
  } catch {
    // storage full or unavailable: undo is a convenience, never block the edit for it
  }
}

// Records the choices, then derives every stat from them. Nothing is incremented in place:
// the entry is the truth, and recomputeCharacter turns it into the numbers on the sheet.
function applyLevelUp(newLevel) {
  // The Experience the tier achievement grants has to exist before the picks that boost it
  // can name it, so it's created here with the id the picker was already using.
  if (isLevelAchievement(newLevel)) {
    character.experiences.push({
      id: pendingExperienceId(newLevel),
      name: "",
      baseModifier: 2,
      modifier: 2,
      sinceLevel: newLevel,
    });
  }

  character.levelUps.push({
    level: newLevel,
    picks: picks.map((p) => {
      const entry = { key: p.key, slotTier: p.slotTier };
      if (p.key === "traits") entry.traits = [...p.traits];
      if (p.key === "experience") entry.experienceIds = [...p.experienceIds];
      if (p.key === "domainCard") entry.cardId = p.cardId;
      return entry;
    }),
    mandatoryCardId,
    exchange: exchange?.outCardId && exchange.inCardId ? { ...exchange } : null,
  });

  // An exchange can swap out one of the creation cards, and that list is an input to the
  // replay rather than a product of it, so it has to be updated directly.
  if (exchange?.outCardId && exchange.inCardId) {
    character.creationDomainCardIds = character.creationDomainCardIds.map((id) => (id === exchange.outCardId ? exchange.inCardId : id));
  }

  character.level = newLevel;
  recomputeCharacter(character);
  character.updatedAt = new Date().toISOString();
  persistCharacter();

  picks = [];
  mandatoryCardId = null;
  exchange = null;

  render();
}

// Puts a recorded level's choices back on screen so they can be changed.
function loadPicksFrom(entry) {
  picks = (entry.picks || []).map((p) => ({
    key: p.key,
    slotTier: p.slotTier,
    traits: [...(p.traits || [])],
    experienceIds: [...(p.experienceIds || [])],
    cardId: p.cardId || null,
  }));
  mandatoryCardId = entry.mandatoryCardId || null;
  exchange = entry.exchange ? { ...entry.exchange } : null;
}

async function init() {
  await loadAllData();
  const params = new URLSearchParams(location.search);
  const id = params.get("id");
  const found = loadAllCharacters().find((c) => c.id === id);
  character = found ? ensureLevelFields(found) : null;

  const requested = Number(params.get("level"));
  if (character && requested) {
    const entry = (character.levelUps || []).find((e) => e.level === requested);
    if (entry) {
      editLevel = requested;
      loadPicksFrom(entry);
    }
  }
  render();
}

init();
