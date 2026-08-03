// Replay of recorded level up choices.
//
// Advancement effects used to be applied straight onto the character and the choices thrown
// away, which made a past level up impossible to revisit: a trait raised at level 3 is
// indistinguishable from one assigned at creation, and the marks that would have told you
// are wiped by the tier achievements at 5 and 8. So the choices are the stored truth now,
// and every level-dependent stat is derived by replaying them from the character's baseline.
//
// Everything here is a pure function over plain objects: no DOM, no storage.

import {
  isLevelAchievement,
  nextSubclassTier,
  slotsPerPick,
} from "./advancement.js";

const TRAIT_KEYS = ["agility", "strength", "finesse", "instinct", "presence", "knowledge"];

// Cards owned at the baseline. At level 1 that's whatever the creation wizard currently
// holds, so editing the starting cards flows straight through the replay.
function baselineCardIds(ch) {
  if (ch.baselineLevel <= 1) return [...(ch.creationDomainCardIds || [])];
  return [...(ch.baseline.domainCardIds || [])];
}

function entriesFor(ch) {
  return [...(ch.levelUps || [])].sort((a, b) => a.level - b.level);
}

function blankState(ch) {
  const b = ch.baseline;
  return {
    traits: { ...b.traits },
    traitMarks: { ...b.traitMarks },
    proficiency: b.proficiency,
    hitPointSlotsBonus: b.hitPointSlotsBonus,
    stressSlotsBonus: b.stressSlotsBonus,
    evasionBonus: b.evasionBonus,
    subclassTier: b.subclassTier,
    slotsUsed: JSON.parse(JSON.stringify(b.slotsUsed)),
    cardIds: baselineCardIds(ch),
    expBonus: {}, // experience id -> how many +1s it has picked up
  };
}

// Step One on the sheet: the tier achievement, which happens BEFORE advancements are
// chosen — so a trait freed by the level 5 or 8 clear can be raised again that same level,
// and the Experience gained at 2/5/8 can be boosted by an advancement at that same level.
function applyAchievement(state, level) {
  if (!isLevelAchievement(level)) return;
  state.proficiency += 1;
  if (level >= 5) {
    for (const key of TRAIT_KEYS) state.traitMarks[key] = false;
  }
}

function applyEntry(state, entry) {
  if (!entry) return;
  const extraCardIds = [];

  for (const pick of entry.picks || []) {
    const perTier = (state.slotsUsed[pick.key] ||= { 2: 0, 3: 0, 4: 0 });
    perTier[pick.slotTier] = (perTier[pick.slotTier] || 0) + slotsPerPick(pick.key);

    switch (pick.key) {
      case "traits":
        for (const key of pick.traits || []) {
          state.traits[key] = (state.traits[key] || 0) + 1;
          state.traitMarks[key] = true;
        }
        break;
      case "hitPoint": state.hitPointSlotsBonus += 1; break;
      case "stress": state.stressSlotsBonus += 1; break;
      case "evasion": state.evasionBonus += 1; break;
      case "experience":
        for (const id of pick.experienceIds || []) state.expBonus[id] = (state.expBonus[id] || 0) + 1;
        break;
      case "subclass":
        if (state.subclassTier !== "mastery") state.subclassTier = nextSubclassTier(state.subclassTier);
        break;
      case "proficiency": state.proficiency += 1; break;
      case "domainCard":
        if (pick.cardId) extraCardIds.push(pick.cardId);
        break;
    }
  }

  if (entry.mandatoryCardId) state.cardIds.push(entry.mandatoryCardId);
  for (const id of extraCardIds) state.cardIds.push(id);

  // The optional swap allowed on every level up. Replacing in place keeps the collection's
  // order stable, so the loadout/vault split doesn't shuffle when an early level is edited.
  const swap = entry.exchange;
  if (swap?.outCardId && swap.inCardId) {
    const at = state.cardIds.indexOf(swap.outCardId);
    if (at >= 0) state.cardIds[at] = swap.inCardId;
  }
}

// The character's state as it stood at the START of `upToLevel`, i.e. with every level
// below it applied. Used both to derive current stats and to give the editor the context a
// past level was actually chosen in.
export function stateAtLevel(ch, upToLevel) {
  const state = blankState(ch);
  const byLevel = new Map(entriesFor(ch).map((e) => [e.level, e]));
  for (let level = ch.baselineLevel + 1; level < upToLevel; level++) {
    applyAchievement(state, level);
    applyEntry(state, byLevel.get(level));
  }
  return state;
}

// Experiences the character has at a given level, with the modifier they had then.
export function experiencesAtLevel(ch, level, expBonus) {
  return (ch.experiences || [])
    .filter((exp) => exp.sinceLevel <= level)
    .map((exp) => ({ ...exp, modifier: exp.baseModifier + (expBonus?.[exp.id] || 0) }));
}

// Writes the replayed values back onto the character. Everything it touches is derived:
// the stored truth is baseline + levelUps, so a bad result is always recoverable by fixing
// the replay and running this again.
export function recomputeCharacter(ch) {
  const state = stateAtLevel(ch, ch.level + 1);

  ch.traits = state.traits;
  ch.traitMarks = state.traitMarks;
  ch.proficiency = state.proficiency;
  ch.hitPointSlotsBonus = state.hitPointSlotsBonus;
  ch.stressSlotsBonus = state.stressSlotsBonus;
  ch.evasionBonus = state.evasionBonus;
  ch.subclassTier = state.subclassTier;
  ch.advancementSlotsUsed = state.slotsUsed;
  ch.domainCardIds = state.cardIds;

  for (const exp of ch.experiences || []) {
    exp.modifier = exp.baseModifier + (state.expBonus[exp.id] || 0);
  }

  // Cards can leave the collection through an exchange, so the vault has to drop anything
  // no longer owned; then the >5 loadout spill applies as it does after a level up.
  ch.domainVaultIds = (ch.domainVaultIds || []).filter((id) => ch.domainCardIds.includes(id));
  const active = ch.domainCardIds.filter((id) => !ch.domainVaultIds.includes(id));
  while (active.length > 5) ch.domainVaultIds.push(active.shift());

  return ch;
}

// Levels whose choices are recorded, oldest first.
export function recordedLevels(ch) {
  return entriesFor(ch).map((e) => e.level);
}

export function levelUpAt(ch, level) {
  return (ch.levelUps || []).find((e) => e.level === level) || null;
}
