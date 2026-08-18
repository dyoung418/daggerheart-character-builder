import { renderCardArt, domainCardArtPath, subclassCardArtPath } from "./shared/card-render.js";
import {
  MAX_HIT_POINT_SLOTS,
  MAX_STRESS_SLOTS,
  SLOT_TIERS,
  SUBCLASS_TIER_LABELS,
  domainAccess,
  ensureLevelFields,
  extraCardLevelCap,
  isLevelAchievement,
  nextSubclassTier,
  optionCost,
  optionFor,
  remainingSlots,
  slotsPerPick,
  tierForLevel,
} from "./shared/advancement.js";
import {
  characterAtLevel,
  contextForLevel,
  experiencesAtLevel,
  unresolvedProblems,
  validateEntry,
  writeLevelEntry,
} from "./shared/history.js";
import {
  advancementOptionsFor,
  effectBonuses,
  effectExperienceBonuses,
  hitPointTotal,
  stressTotal,
} from "./shared/derived-stats.js";
import { blankAnswer, choiceFor } from "./shared/effects.js";
import { loadContent } from "./shared/content-load.js";
import { mountContentSettings } from "./shared/content-settings.js";
import { visibleRecords } from "./shared/content-sources.js";
import { renderEffectChoice } from "./shared/effect-choice.js";
import { escapeHtml } from "./shared/escape.js";
import { titleCase } from "./shared/text.js";

const CHAR_STORAGE_KEY = "dh-characters-v1";
const TRAIT_LABELS = { agility: "Agility", strength: "Strength", finesse: "Finesse", instinct: "Instinct", presence: "Presence", knowledge: "Knowledge" };
const ORDINALS = ["first", "second", "third"];

const db = {};
let content = null; // what loadContent() reported: which sources loaded, and which are switched off
let character = null;

// UI state for the current level up (not persisted until confirmed).
// One entry per slot marked on the sheet, so the same option can be taken twice in a
// level ("options with multiple slots can be chosen more than once"). Each entry records
// WHICH tier's slot it marks, because that caps the extra domain card's level.
let picks = []; // { key, slotTier, traits: [], experienceIds: [], cardId: null }
let mandatoryCardId = null;
// Cards handed over by a feature gained at this level, one slot per card granted.
let grantedCardIds = [];
// Answers to the "choose two of the following" cards taken on this screen, keyed by card id.
let pendingChoices = {};
// The name for the Experience a tier achievement hands over at this level. Held here rather
// than written straight onto the character because at levels 2/5/8 the Experience doesn't
// exist until confirm; when a past level is being edited it's seeded from the real one.
let achievementExperienceName = "";
let exchange = null; // optional { outCardId, inCardId }: the swap allowed on every level up

// With ?level=N the screen edits a level already taken instead of gaining a new one: same
// pickers, but everything is evaluated against the character as it stood at that level.
let editLevel = null;
let context = null; // replayed state the level being worked on is chosen against
let options = []; // the advancement rows on offer at that level, rebuilt on every render
let pendingSave = null; // consequences awaiting confirmation before an edit is written

const isEditing = () => editLevel !== null;
const workingLevel = () => (isEditing() ? editLevel : character.level + 1);

async function loadAllData() {
  // Ancestries are here for the Hit Point and Stress slots a Giant or a Human is born with:
  // those count towards the cap of 12, so the slot gating can't be right without them.
  // Transformations are here for exactly the same reason, and for no other: one is never an
  // option on this screen, but a transformation that grants a slot has to be counted before this
  // screen decides how many are left.
  content = await loadContent({
    files: ["classes", "subclasses", "domain-cards", "ancestries", "transformations"],
  });
  Object.assign(db, content.db);
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

function totalRemainingAcrossAllOptions() {
  return options.reduce((sum, option) => sum + remainingSlots(option, context.slotsUsed), 0);
}

// What `options` is built from: the slots every level below this one marked, plus the ones being
// marked on screen right now.
//
// Without the second half, a row that exists only because it was already marked — one whose
// source has since gone — would have no capacity of its own while this level is being edited. Its
// box would render as "marking now", removing the mark would work, and putting it back would be
// blocked. One stray click and the pick is unrecoverable.
function usedWithPicks(slotsUsed, current) {
  const used = {};
  for (const [key, perTier] of Object.entries(slotsUsed || {})) used[key] = { ...perTier };
  for (const pick of current) {
    const perTier = (used[pick.key] ||= { 2: 0, 3: 0, 4: 0 });
    perTier[pick.slotTier] = (perTier[pick.slotTier] || 0) + slotsPerPick(pick.key);
  }
  return used;
}

// The context already has this level's tier achievement applied, so marks cleared at 5 and
// 8 are simply absent from it and those traits can be raised again.
function traitMarkedBefore(key) {
  return !!context.traitMarks[key];
}

function traitsPickedThisLevel() {
  return picksFor("traits").flatMap((p) => p.traits);
}

// One ladder per subclass. `target` is "multiclass" or absent, absent meaning your own — which
// is what keeps every level recorded before a character could have two reading as it always did.
function subclassTierAfterPicks(target) {
  const own = target !== "multiclass";
  let tier = own ? context.subclassTier : (context.multiclass?.tier || "foundation");
  for (const pick of picksFor("subclass")) {
    if ((pick.target === "multiclass") === !own) tier = nextSubclassTier(tier);
  }
  return tier;
}

// Slots an ancestry, subclass or card grants count towards the maximum of 12, so a Giant runs
// out of Hit Point advancements one sooner. Asked of the character as it stood at this level,
// not as it stands now, so editing an old level doesn't count a card taken later.
function grantedSlots() {
  return effectBonuses(characterAtLevel(character, context), db);
}

function hitPointsAfterPicks() {
  return hitPointTotal(selectedClass(), context.hitPointSlotsBonus + picksFor("hitPoint").length, grantedSlots().hitPointSlots);
}

function stressAfterPicks() {
  return stressTotal(context.stressSlotsBonus + picksFor("stress").length, grantedSlots().stressSlots);
}

// The two options that take a whole level, by the name a sentence wants to use. Core keys, like
// the three tests below — a declared row is never one of these.
const WHOLE_LEVEL_NAMES = { proficiency: "Proficiency", multiclass: "Multiclass" };

// Why a given slot can't be marked right now (null when it can). The key tests below are core
// rules about core rows, so they match the key exactly.
function markBlockedReason(option, tier) {
  const key = option.key;
  // Asked of the cost rather than of the key: Proficiency and Multiclass both take the whole
  // level, and a literal here would let you mark one of each and then be turned away by the
  // budget check with a message that doesn't explain why.
  const wholeLevel = picks.find((p) => optionCost(p.key) === 2);
  if (wholeLevel) return `${WHOLE_LEVEL_NAMES[wholeLevel.key]} uses both picks for this level.`;
  if (option.cost === 2 && picks.length > 0) return `${WHOLE_LEVEL_NAMES[key]} needs both picks: clear the other one first.`;
  if (budgetSpent() + option.cost > 2) return "No choice points left this level.";
  if (slotsTakenInTier(key, tier) + option.slotsPerPick > option.slots[tier]) return "No slots left in this tier.";
  // Blocked only when BOTH ladders are done: with a second subclass there's still somewhere to
  // spend it, and which one is chosen below the grid.
  if (key === "subclass" && subclassTierAfterPicks() === "mastery"
    && (!context.multiclass || subclassTierAfterPicks("multiclass") === "mastery")) {
    return "Every subclass is already at Mastery.";
  }
  if (key === "hitPoint" && hitPointsAfterPicks() >= MAX_HIT_POINT_SLOTS) return `Hit Points are at the maximum of ${MAX_HIT_POINT_SLOTS}.`;
  if (key === "stress" && stressAfterPicks() >= MAX_STRESS_SLOTS) return `Stress is at the maximum of ${MAX_STRESS_SLOTS}.`;
  return null;
}

// A declared row's pick carries its own label. Everything else a pick stores is a CHOICE (which
// traits, which card); this is a copy of something that could in principle be looked up again —
// except that it can't, once the content declaring it has moved on. The history list and the
// grid stay readable for a character imported into a browser that has never seen the source.
function addPick(option, slotTier) {
  picks.push({
    key: option.key,
    slotTier,
    traits: [],
    experienceIds: [],
    cardId: null,
    // Which subclass an upgrade climbs. Null means your own.
    target: null,
    // The multiclass payload: which class, which of its domains, which of its subclasses. Null
    // until the picker below fills them in, and confirmBlockedReason won't let the level confirm until
    // all three are set.
    classId: null,
    domain: null,
    subclassId: null,
    optionLabel: option.source === "core" ? null : option.label,
  });
}

// The Experience granted by the tier achievement exists before advancements are chosen, so
// it can be boosted at the very level that grants it. It only becomes real on confirm.
function pendingExperienceId(newLevel) {
  return `exp_lv${newLevel}`;
}

function experiencesForPicking(newLevel) {
  // experiencesAtLevel replays the +1s taken as advancements, which is only half the story:
  // a permanent bonus from effects.js (Clank's Purposeful Design) never went through the
  // replay, so without this the picker offers an Experience at a lower number than the sheet
  // shows for it.
  const effectBonus = effectExperienceBonuses(character, db);
  const list = experiencesAtLevel(character, newLevel, context.expBonus)
    .map((exp) => ({ ...exp, modifier: exp.modifier + (effectBonus[exp.id] || 0) }));
  if (isLevelAchievement(newLevel) && !list.some((e) => e.sinceLevel === newLevel)) {
    list.push({ id: pendingExperienceId(newLevel), name: achievementExperienceName, modifier: 2, sinceLevel: newLevel, pending: true });
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
  // Asked of the character as they stood AT this level, not as they stand now: a row a subclass
  // feature declares mustn't be offered on a level edited from before that subclass tier was
  // taken. validateEntry resolves the same way, so the screen and the validator agree.
  options = advancementOptionsFor(characterAtLevel(character, context), db, {
    level: newLevel,
    used: usedWithPicks(context.slotsUsed, picks),
  });
  dropIneligibleCards();
  // An author fixing a typo in a label should see it here rather than the one recorded months ago.
  for (const pick of picks) {
    const option = optionFor(options, pick.key);
    if (option && option.source !== "core") pick.optionLabel = option.label;
  }

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
    renderAchievementExperienceName(main);
  }

  renderAdvancementGrid(main, newLevel);
  renderSubPickers(main, cls, newLevel);
  renderMandatoryCardStep(main, cls, newLevel);
  renderGrantedCardStep(main, cls, newLevel);
  renderExchangeSection(main, cls);
  renderCardChoices(main, newLevel);

  renderConfirmBar(main, newLevel);
}

// The Experience the achievement grants used to arrive unnamed and stay that way: the screen
// announced it, the picker offered it as "(the new Experience from this level)", and nothing
// ever asked what it was. Naming it belongs here, next to the sentence that says you've got
// one — not in the picker, which is about raising Experiences rather than gaining them.
//
// Left blank it's still saved unnamed, exactly as before. Requiring a name here would block
// the level up for a player who hasn't thought of one yet, which is the trap the creation
// wizard already sidestepped by only validating its own starting pair.
function renderAchievementExperienceName(main) {
  const row = document.createElement("div");
  row.className = "field-row";
  row.innerHTML = `<label>Name the new Experience <input type="text" value="${escapeHtml(achievementExperienceName)}" placeholder="e.g. Assassin of the Sapphire Syndicate" /></label>`;
  const input = row.querySelector("input");
  input.addEventListener("input", (e) => {
    achievementExperienceName = e.target.value;
    // Deliberately no re-render: it would take the caret with it on every keystroke. The
    // pickers below read this name, so they're refreshed when the field is left instead.
  });
  input.addEventListener("change", render);
  main.appendChild(row);
}

function renderAdvancementGrid(main, newLevel) {
  const h = document.createElement("h3");
  h.textContent = "Mark 2 advancement slots";
  main.appendChild(h);

  const spent = budgetSpent();
  const info = document.createElement("p");
  info.className = "hint";
  info.textContent = `Choice points used: ${spent}/2. You can mark any unmarked slot from your tier or below, ` +
    `including two in the same row. Proficiency and Multiclass each mark both of their slots and use ` +
    `the whole level; per tier you may upgrade your subclass or multiclass, never both.`;
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

  for (const option of options) {
    const row = document.createElement("div");
    row.className = "adv-row";
    row.appendChild(labelCell(option.label + (option.hint || "")));
    for (const tier of tiers) {
      row.appendChild(tierGroupCell(option, tier));
    }
    grid.appendChild(row);
  }
  main.appendChild(grid);

  const legend = document.createElement("p");
  legend.className = "hint slot-legend";
  legend.textContent = "■ spent at an earlier level · ☒ marking now · □ available · ⊘ crossed out";
  main.appendChild(legend);
}

function labelCell(text) {
  const cell = document.createElement("span");
  cell.className = "adv-label";
  cell.textContent = text;
  return cell;
}

function tierGroupCell(option, tier) {
  const key = option.key;
  const cell = document.createElement("span");
  cell.className = "adv-tier-group";
  const total = option.slots[tier];
  if (total === 0) {
    cell.textContent = "—";
    cell.classList.add("adv-tier-empty");
    return cell;
  }

  const alreadyUsed = context.slotsUsed?.[key]?.[tier] || 0;
  const markingNow = picksFor(key, tier).length * option.slotsPerPick;
  const blocked = markBlockedReason(option, tier);
  // Struck through from the end of the row, so a box is never both marked and crossed.
  const crossedFrom = total - (option.crossedOut?.[tier] || 0);

  for (let i = 0; i < total; i++) {
    const box = document.createElement("button");
    box.className = "slot-box";
    box.type = "button";
    if (i < alreadyUsed) {
      box.classList.add("filled");
      box.disabled = true;
      box.title = "Marked at an earlier level";
    } else if (i >= crossedFrom) {
      box.classList.add("crossed");
      box.disabled = true;
      box.title = option.crossedBy?.[tier] === "multiclass"
        ? "Crossed out: this character multiclassed"
        : "Crossed out: the subclass upgrade for this tier is taken";
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
      box.addEventListener("click", () => { addPick(option, tier); render(); });
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
    if (pick.key === "subclass") renderSubclassPreview(main, pick, ordinal);
    if (pick.key === "multiclass") renderMulticlassPicker(main, pick);
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
    const name = exp.name?.trim() || (exp.pending ? "(the new Experience from this level)" : "(unnamed)");
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

// A preview for a character with one subclass; a choice of which to upgrade for a character with
// two. The card is never a choice — it's whatever comes next on the ladder you name.
function renderSubclassPreview(main, pick, ordinal) {
  const targets = [{ key: null, subclassId: character.subclassId }];
  if (context.multiclass) targets.push({ key: "multiclass", subclassId: context.multiclass.subclassId });

  if (targets.length > 1) {
    subHeading(main, `Subclass upgrade${ordinal}: which subclass does this one advance?`);
    const row = document.createElement("div");
    row.className = "field-row";
    for (const target of targets) {
      const sub = db.subclasses.find((s) => s.id === target.subclassId);
      const at = subclassTierAfterPicks(target.key);
      // Un-taking this pick first, so a ladder already at Mastery reads as such rather than
      // counting the very pick that's asking.
      const done = at === "mastery" && (pick.target === "multiclass") !== (target.key === "multiclass");
      const label = document.createElement("label");
      label.innerHTML = `<input type="radio" name="subclass-target-${pick.slotTier}" ` +
        `${(pick.target || null) === target.key ? "checked" : ""} ${done ? "disabled" : ""}/> ` +
        `${escapeHtml(sub ? sub.name["en-US"] : "Subclass")}` +
        `${target.key ? " (multiclass)" : ""}${done ? " — already at Mastery" : ""}`;
      label.querySelector("input").addEventListener("change", () => { pick.target = target.key; render(); });
      row.appendChild(label);
    }
    main.appendChild(row);
    if (!pick.target && pick.target !== null) return;
  }

  const chosen = pick.target === "multiclass" ? targets[1] : targets[0];
  const currentTier = pick.target === "multiclass"
    ? (context.multiclass?.tier || "foundation")
    : context.subclassTier;
  const nextTier = nextSubclassTier(currentTier);
  const sub = db.subclasses.find((s) => s.id === chosen.subclassId);
  const label = SUBCLASS_TIER_LABELS[nextTier];
  const name = sub ? `${sub.name["en-US"]} (${label})` : label;
  // "Add", not "take": the new card joins the ones already on the sheet instead of replacing
  // them, and the features of the earlier cards keep working.
  subHeading(main, `You'll add the ${label} card to ${sub ? sub.name["en-US"] : "your subclass"}. The cards you already have still apply.`);
  const preview = document.createElement("div");
  preview.className = "tile-grid";
  const tile = document.createElement("div");
  tile.className = "card-tile";
  tile.appendChild(renderCardArt({
    id: chosen.subclassId, name, art: subclassCardArtPath(sub, nextTier),
    type: "Subclass", features: sub?.[nextTier]?.features,
  }));
  preview.appendChild(tile);
  main.appendChild(preview);
}

// The one pick that asks three questions. Each answer narrows the next, and changing an earlier
// one clears what it made impossible — picking a different class must not leave a domain and a
// subclass from the one before it on the pick.
function renderMulticlassPicker(main, pick) {
  const own = selectedClass();
  // Your own class is not an "additional class". Excluded here as well as refused by the
  // validator, because the wizard can change a character's class after the fact.
  const classes = visibleRecords(db.classes, content.disabled).filter((c) => c.id !== character.classId);

  subHeading(main, "Multiclass: choose an additional class.");
  const classRow = document.createElement("div");
  classRow.className = "tile-grid";
  for (const cls of classes) {
    const tile = document.createElement("div");
    tile.className = "card-tile mc-class-tile" + (pick.classId === cls.id ? " selected" : "");
    tile.innerHTML = `<div class="card-tile-label">${escapeHtml(titleCase(cls.name))}</div>` +
      `<div class="option-feature">${escapeHtml((cls.domains || []).map(titleCase).join(" / "))}</div>`;
    tile.addEventListener("click", () => {
      if (pick.classId !== cls.id) { pick.classId = cls.id; pick.domain = null; pick.subclassId = null; }
      render();
    });
    classRow.appendChild(tile);
  }
  main.appendChild(classRow);
  if (!pick.classId) return;

  const into = db.classes.find((c) => c.id === pick.classId);
  // "A domain you don't already have access to" — a class sharing one of yours offers the other.
  const domains = (into?.domains || []).filter((d) => !(own?.domains || []).includes(d));
  subHeading(main, domains.length
    ? `Choose one of ${titleCase(into.name)}'s domains. Cards from it are chosen at half your level, rounded up.`
    : `${titleCase(into.name)} has no domain this character doesn't already have.`);
  const domainRow = document.createElement("div");
  domainRow.className = "field-row";
  for (const domain of domains) {
    const label = document.createElement("label");
    label.innerHTML = `<input type="radio" name="mc-domain" ${pick.domain === domain ? "checked" : ""}/> ${escapeHtml(titleCase(domain))}`;
    label.querySelector("input").addEventListener("change", () => { pick.domain = domain; render(); });
    domainRow.appendChild(label);
  }
  main.appendChild(domainRow);

  // Subclasses join to classes by NAME, not by id — the one relational join in this app that
  // isn't an id, and the same one the creation wizard makes.
  const subs = visibleRecords(db.subclasses, content.disabled)
    .filter((s) => s.class === String(into?.name || "").toUpperCase());
  subHeading(main, "Take the foundation card from one of its subclasses. A later subclass upgrade can advance either subclass.");
  const grid = document.createElement("div");
  grid.className = "tile-grid";
  for (const sub of subs) {
    const tile = document.createElement("div");
    tile.className = "card-tile" + (pick.subclassId === sub.id ? " selected" : "");
    tile.appendChild(renderCardArt({
      id: sub.id, name: `${sub.name["en-US"]} (${SUBCLASS_TIER_LABELS.foundation})`,
      art: subclassCardArtPath(sub, "foundation"), type: "Subclass", features: sub.foundation?.features,
    }));
    const label = document.createElement("div");
    label.className = "card-tile-label";
    label.textContent = sub.name["en-US"];
    tile.appendChild(label);
    tile.addEventListener("click", () => { pick.subclassId = sub.id; render(); });
    grid.appendChild(tile);
  }
  main.appendChild(grid);
}

// ---------- domain cards ----------

function cardModel(c) {
  return { id: c.id, name: c.name["en-US"], art: domainCardArtPath(c), level: c.level,
           recallCost: c.recallCost, type: c.type, features: c.features };
}

// The picker, so it's the one place the source toggles reach. Every other read of db.domainCards
// on this screen is a lookup by id and stays unfiltered — a card already taken must keep
// resolving whether or not the source it came from is switched on.
function eligibleDomainCards(access, excludeIds) {
  return visibleRecords(db.domainCards, content.disabled).filter((c) => {
    const cap = access.capFor(c.domain);
    return cap !== null && c.level <= cap && !excludeIds.includes(c.id);
  });
}

// The domains this character may pick from right now, at whatever limit the caller already had.
// "Right now" includes a multiclass being taken on this very screen, which is why the guaranteed
// card of the level you multiclass at may already come from the new domain.
function accessFor(baseCap) {
  return domainAccess(selectedClass()?.domains || [], multiclassAfterPicks(), workingLevel(), baseCap);
}

// The sibling of subclassTierAfterPicks(): what the character's second class is, counting the
// pick on screen. Null until one is chosen.
function multiclassAfterPicks() {
  if (context.multiclass) return context.multiclass;
  const pick = picksFor("multiclass").find((p) => p.classId && p.domain && p.subclassId);
  return pick
    ? { classId: pick.classId, subclassId: pick.subclassId, domain: pick.domain, tier: "foundation" }
    : null;
}

// Eligibility is a function of the picks, so it's re-asked on every render: change the multiclass
// domain, or take the pick back, and a card that's no longer legal is dropped rather than quietly
// confirmed into a level that flags itself the moment it's saved.
//
// Judged against the WHOLE card list, never the picker's — that one drops cards whose source is
// switched off, and sweeping with it would delete a recorded card for no better reason than a
// checkbox in the content panel.
function dropIneligibleCards() {
  const allowed = (id, baseCap) => {
    if (!id) return true;
    const card = findDomainCard(id);
    if (!card) return true; // a card this browser can't resolve is reported, never silently dropped
    const cap = accessFor(baseCap).capFor(card.domain);
    return cap !== null && card.level <= cap;
  };
  const level = workingLevel();
  if (!allowed(mandatoryCardId, level)) mandatoryCardId = null;
  for (const pick of picksFor("domainCard")) {
    if (!allowed(pick.cardId, extraCardLevelCap(level, pick.slotTier))) pick.cardId = null;
  }
  grantedCardIds = grantedCardIds.map((id) => (allowed(id, level) ? id : null));
  const out = exchange?.outCardId ? findDomainCard(exchange.outCardId) : null;
  if (exchange?.inCardId && !allowed(exchange.inCardId, out?.level ?? level)) exchange.inCardId = null;
}

// Every card already owned, plus every card being taken elsewhere on this screen.
function claimedCardIds(except) {
  const claimed = [...context.cardIds];
  if (mandatoryCardId && except !== "mandatory") claimed.push(mandatoryCardId);
  for (const p of picksFor("domainCard")) {
    if (p.cardId && p !== except) claimed.push(p.cardId);
  }
  grantedCardIds.forEach((id, i) => {
    if (id && except !== `granted${i}`) claimed.push(id);
  });
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
  const cards = eligibleDomainCards(accessFor(cap), claimedCardIds(pick));
  renderCardGrid(main, cards, pick.cardId, (id) => { pick.cardId = id; });
}

function renderMandatoryCardStep(main, cls, newLevel) {
  const h = document.createElement("h3");
  h.textContent = "New domain card (guaranteed every level)";
  main.appendChild(h);
  const cards = eligibleDomainCards(accessFor(newLevel), claimedCardIds("mandatory"));
  renderCardGrid(main, cards, mandatoryCardId, (id) => { mandatoryCardId = id; });
}

// Some features hand you a domain card outright, on top of the guaranteed one and any you buy
// with an advancement slot — the School of Knowledge's cards say "Take an additional domain
// card of your level or lower" at every tier.
//
// How many is worked out by asking effects.js what the character grants before this level's
// picks and what they'd grant after, and taking the difference. So a feature that starts
// granting cards partway through a career is picked up by being catalogued, with no code here
// naming it. Unlike the advancement option, this isn't a slot, so only your level caps it.
// The character as this level's picks would leave them. One projection, not two sequential ones,
// so nothing can be counted twice.
function characterAfterPicks() {
  const mc = multiclassAfterPicks();
  return {
    ...characterAtLevel(character, context),
    subclassTier: subclassTierAfterPicks(),
    multiclass: mc && { ...mc, tier: subclassTierAfterPicks("multiclass") },
  };
}

// Cards a feature gained at this level hands over — the School of Knowledge's "take an additional
// domain card". Multiclassing into one grants it too: you took its foundation card, so you have
// the feature, whichever way you came by it.
function grantedCardCount() {
  const before = effectBonuses(characterAtLevel(character, context), db).extraDomainCards;
  const after = effectBonuses(characterAfterPicks(), db).extraDomainCards;
  return Math.max(0, after - before);
}

function renderGrantedCardStep(main, cls, newLevel) {
  const count = grantedCardCount();
  // Resized with explicit nulls rather than by setting .length: a hole left by the latter is
  // skipped by .some(), which would let the confirm button light up with the card unchosen.
  while (grantedCardIds.length < count) grantedCardIds.push(null);
  grantedCardIds.length = count;
  if (count === 0) return;

  const h = document.createElement("h3");
  h.textContent = count === 1 ? "Extra domain card from a feature gained this level" : "Extra domain cards from features gained this level";
  main.appendChild(h);

  for (let i = 0; i < count; i++) {
    const ordinal = count > 1 ? ` (${ORDINALS[i]})` : "";
    subHeading(main, `Granted card${ordinal}: any card of level ${newLevel} or lower from a domain you have access to.`);
    const cards = eligibleDomainCards(accessFor(newLevel), claimedCardIds(`granted${i}`));
    renderCardGrid(main, cards, grantedCardIds[i] || null, (id) => { grantedCardIds[i] = id; });
  }
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
    const cards = eligibleDomainCards(accessFor(cap), claimedCardIds("exchange"));
    renderCardGrid(details, cards, exchange.inCardId, (id) => { exchange.inCardId = id; });
  }

  main.appendChild(details);
}

// ---------- choices a card asks you to make ----------
//
// A couple of cards say "permanently gain two of the following" rather than granting something
// outright. The answer belongs to the character, not to the level up, so it's written straight
// to character.effectChoices on confirm — but it's asked here, where the card is taken, which
// is the only moment the player is thinking about it.

function cardsBeingTaken() {
  const ids = [mandatoryCardId, ...picksFor("domainCard").map((p) => p.cardId), ...grantedCardIds, exchange?.inCardId];
  return ids.filter(Boolean);
}

function renderCardChoices(main, newLevel) {
  const pending = cardsBeingTaken()
    .map((id) => ({ id, choice: choiceFor(id, db) }))
    .filter((x) => x.choice);
  if (pending.length === 0) return;

  const h = document.createElement("h3");
  h.textContent = "Choices from the cards you're taking";
  main.appendChild(h);

  for (const { id, choice } of pending) {
    // Re-opening a level that already took the card shows the answer that was given.
    pendingChoices[id] ||= blankAnswer(character.effectChoices?.[id]);
    renderEffectChoice(main, {
      key: id,
      choice,
      answer: pendingChoices[id],
      experiences: experiencesForPicking(newLevel),
      onChange: render,
    });
  }
}

// Answers collected on this screen, written to the character on confirm. Left unanswered they
// simply grant nothing and the sheet nudges about it — an unanswered choice never blocks a
// level up, the same way it never blocks saving a character. The Experience this level grants
// keeps the id the picker used (pendingExperienceId), so nothing needs remapping here.
function commitCardChoices() {
  for (const id of cardsBeingTaken()) {
    if (pendingChoices[id]) character.effectChoices[id] = pendingChoices[id];
  }
}

// ---------- confirm ----------

// Why this level can't be confirmed yet, as a sentence, or null when it can.
//
// A sentence rather than a boolean because the button it gates is the only control on the page
// that used to fail silently: greyed out, no reason given, and on a page this long the thing
// that's missing is usually scrolled off. A click on it looks like a click that didn't register.
// Every other refusal here explains itself (see markBlockedReason), and now so does this one.
function confirmBlockedReason(newLevel) {
  const spent = budgetSpent();
  const totalRemaining = totalRemainingAcrossAllOptions();
  const budgetOk = spent === 2 || (totalRemaining < 2 && spent === totalRemaining);
  if (!budgetOk) {
    const want = Math.min(2, totalRemaining);
    return `Mark ${want} advancement slot${want === 1 ? "" : "s"} above — ${spent} of ${want} chosen.`;
  }

  for (const pick of picks) {
    if (pick.key === "traits" && pick.traits.length !== 2) return "Choose two traits to raise.";
    if (pick.key === "experience" && new Set(pick.experienceIds).size !== 2) return "Choose two Experiences to raise.";
    if (pick.key === "domainCard" && !pick.cardId) return "Choose the extra domain card.";
    if (pick.key === "multiclass" && !(pick.classId && pick.domain && pick.subclassId)) {
      return "Choose a class to multiclass into, one of its domains, and one of its subclasses.";
    }
  }
  // Taking the trait option twice needs four DIFFERENT unmarked traits.
  const allTraits = traitsPickedThisLevel();
  if (new Set(allTraits).size !== allTraits.length) return "Two trait advancements have to raise four different traits.";

  if (!mandatoryCardId) return "Choose the domain card this level grants.";
  // The commonest one, and the one that used to be invisible: a feature gained this level hands
  // over a card, and it hasn't been picked. It also catches a level recorded before the app knew
  // that feature granted anything, which is a level that opens with the button already dead.
  const granted = grantedCardCount();
  if (grantedCardIds.length !== granted || grantedCardIds.some((id) => !id)) {
    return granted === 1
      ? "Choose the extra domain card a feature gained this level grants."
      : `Choose the ${granted} extra domain cards the features gained this level grant.`;
  }
  if (exchange && !exchange.inCardId) return "Finish the exchange, or clear the card you chose to give up.";
  return null;
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
      // Only written when it isn't your own subclass, so a level recorded for a single-subclass
      // character serialises byte for byte as it always did.
      if (p.key === "subclass" && p.target) entry.target = p.target;
      if (p.key === "multiclass") {
        entry.classId = p.classId;
        entry.domain = p.domain;
        entry.subclassId = p.subclassId;
      }
      // Only ever set for a declared row, so every entry written before this existed — and every
      // one written since for a core row — serialises byte for byte as it always did.
      if (p.optionLabel) entry.optionLabel = p.optionLabel;
      return entry;
    }),
    mandatoryCardId,
    grantedCardIds: grantedCardIds.filter(Boolean),
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

  const blocked = confirmBlockedReason(newLevel);
  const confirm = document.createElement("button");
  confirm.className = "btn-primary";
  confirm.textContent = isEditing() ? `Save level ${newLevel}` : `Confirm level ${newLevel}`;
  confirm.disabled = !!blocked;
  if (blocked) confirm.title = blocked;
  confirm.addEventListener("click", () => (isEditing() ? reviewLevelEdit(newLevel) : applyLevelUp(newLevel)));
  bar.appendChild(confirm);
  main.appendChild(bar);
  // Beside the button, not only in its tooltip: a tooltip needs a hover to find, and what's
  // missing is usually somewhere else on the page.
  if (blocked) {
    const why = document.createElement("p");
    why.className = "hint confirm-blocked";
    why.textContent = `⚠ ${blocked}`;
    main.appendChild(why);
  }
}

// What the edit would break, shown before anything is written — the cheapest moment to
// change your mind, since afterwards it takes another edit (or the undo) to get back.
function renderSavePreview(main, newLevel) {
  const box = document.createElement("div");
  box.className = "problem-box";
  // Only ever reached when there IS something to warn about — see reviewLevelEdit.
  const { consequences } = pendingSave;
  box.innerHTML = `<strong>Saving level ${escapeHtml(newLevel)} makes ${escapeHtml(consequences.length)} later level${consequences.length === 1 ? "" : "s"} stop adding up:</strong>` +
    consequences.map((c) => `<div>└ L${escapeHtml(c.level)} — ${escapeHtml(c.errors[0])}</div>`).join("") +
    `<div class="hint">You can fix them from the character sheet, or keep them as they are.</div>`;
  main.appendChild(box);

  const bar = document.createElement("div");
  bar.className = "wizard-actions";
  bar.appendChild(actionButton("← Back", "btn-ghost", () => { pendingSave = null; render(); }));
  bar.appendChild(actionButton("Save anyway", "btn-primary", () => commitLevelEdit(newLevel)));
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
// Saving an edit is one click when nothing else is affected, and two when something is.
//
// The second step exists to warn you that OTHER levels stop adding up — so with nothing to warn
// about it was a confirmation of nothing, and an expensive one: the box appears directly above the
// action bar, which pushed the button ~50px down while the pointer stayed where it was, and the
// button's label was the same before and after. The click registered, the next one landed on bare
// background, and the third found the button again.
function reviewLevelEdit(newLevel) {
  const trial = JSON.parse(JSON.stringify(character));
  writeEntry(trial, newLevel);
  const before = new Set(unresolvedProblems(character, db).map((p) => p.level));
  const consequences = unresolvedProblems(trial, db).filter((p) => p.level !== newLevel && !before.has(p.level));
  if (consequences.length === 0) {
    commitLevelEdit(newLevel);
    return;
  }
  // Something to read. Hold the action bar still across the re-render, so the button doesn't move
  // out from under the pointer that just clicked it.
  const barBefore = currentActionBar()?.getBoundingClientRect().top ?? null;
  pendingSave = { consequences };
  render();
  const barAfter = currentActionBar()?.getBoundingClientRect().top ?? null;
  if (barBefore !== null && barAfter !== null) window.scrollBy(0, barAfter - barBefore);
}

// The last one on the page: the confirm bar always renders after everything else.
function currentActionBar() {
  const bars = document.querySelectorAll(".wizard-actions");
  return bars[bars.length - 1] || null;
}

// Replaces the recorded choices for a level that's already been taken. The entry replaces the
// old one wholesale, so redeclaring a level withdraws any earlier "keep as is": it's being
// reconsidered.
function writeEntry(target, newLevel) {
  return writeLevelEntry(target, currentEntry(newLevel));
}

// A name isn't a recorded choice, so it never enters the level entry the replay reads. On an
// edit the Experience already exists, so the name goes straight onto it — after writeEntry,
// whose recomputeCharacter only ever rewrites modifiers.
function commitAchievementExperienceName(level) {
  if (!isLevelAchievement(level)) return;
  const exp = character.experiences?.find((e) => e.id === pendingExperienceId(level));
  if (exp) exp.name = achievementExperienceName.trim();
}

function commitLevelEdit(newLevel) {
  saveUndoSnapshot();
  writeEntry(character, newLevel);
  commitCardChoices();
  commitAchievementExperienceName(newLevel);
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
      name: achievementExperienceName.trim(),
      baseModifier: 2,
      modifier: 2,
      sinceLevel: newLevel,
    });
  }

  commitCardChoices();

  character.level = newLevel;
  writeLevelEntry(character, currentEntry(newLevel));
  character.updatedAt = new Date().toISOString();
  persistCharacter();

  picks = [];
  mandatoryCardId = null;
  grantedCardIds = [];
  exchange = null;
  pendingChoices = {};
  achievementExperienceName = "";

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
    target: p.target || null,
    classId: p.classId || null,
    domain: p.domain || null,
    subclassId: p.subclassId || null,
    optionLabel: p.optionLabel || null,
  }));
  mandatoryCardId = entry.mandatoryCardId || null;
  grantedCardIds = [...(entry.grantedCardIds || [])];
  exchange = entry.exchange ? { ...entry.exchange } : null;
  pendingChoices = {};
  achievementExperienceName = character.experiences
    ?.find((e) => e.id === pendingExperienceId(entry.level))?.name || "";
}

async function init() {
  await loadAllData();
  mountContentSettings(content);
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
