// Generic advancement rules (Core Rulebook p.109-111): the same options and slots
// apply to every class, so a single table is enough instead of per-class data.
// Multiclassing is NOT implemented (deliberate scope cut: rare in practice, adds
// disproportionate data/UI complexity for a personal-scale tool).

// NEW slots that unlock starting at each tier (cumulative, not replaced: at tier 3
// you have tier 2's slots plus the new tier 3 ones, and so on).
export const TIER_SLOT_TABLE = {
  traits: { 2: 3, 3: 3, 4: 3 },
  hitPoint: { 2: 2, 3: 2, 4: 2 },
  stress: { 2: 2, 3: 2, 4: 2 },
  experience: { 2: 1, 3: 1, 4: 1 },
  domainCard: { 2: 1, 3: 1, 4: 1 },
  evasion: { 2: 1, 3: 1, 4: 1 },
  subclass: { 3: 1, 4: 1 },
  proficiency: { 3: 2, 4: 2 }, // requires marking both slots together: costs the entire level up's 2 "points"
};

// Tiers that have advancement slots at all (tier 1 is level 1: no level ups yet).
export const SLOT_TIERS = [2, 3, 4];

export const ADVANCEMENT_LABELS = {
  traits: "+1 to two unmarked traits",
  hitPoint: "+1 permanent Hit Point slot",
  stress: "+1 permanent Stress slot",
  experience: "+1 to two existing Experiences",
  domainCard: "Extra domain card (in addition to the one guaranteed every level)",
  evasion: "+1 permanent Evasion",
  subclass: "Upgrade subclass card (Foundation → Specialization → Mastery)",
  proficiency: "+1 Proficiency — uses both picks for this level",
};

// Cost in "choice points": every level up grants 2 points; a normal option costs 1,
// Proficiency (and Multiclass, not implemented) costs 2 together.
export function optionCost(key) {
  return key === "proficiency" ? 2 : 1;
}

export function tierForLevel(level) {
  if (level <= 1) return 1;
  if (level <= 4) return 2;
  if (level <= 7) return 3;
  return 4;
}

// Highest domain card level the "extra domain card" option allows, per the tier of the
// slot being marked. The character sheet spells this out on the option itself: the tier 2
// slot reads "...of your level or lower ... (up to level 4)", tier 3 "(up to level 7)",
// tier 4 has no parenthetical. So two limits apply at once — your current level, and the
// cap of the slot you mark — which differ whenever a lower tier's slot is left unused and
// spent later. The guaranteed card gained every level has no tier cap, only your level.
export const TIER_CARD_CAP = { 2: 4, 3: 7, 4: 10 };

export function extraCardLevelCap(level, slotTier) {
  return Math.min(level, TIER_CARD_CAP[slotTier] ?? level);
}

// Hit Point and Stress slots are both capped at 12. In practice only Hit Points can reach
// it (Stress starts at 6, and the 6 slots available across all tiers land exactly on 12).
export const MAX_HIT_POINT_SLOTS = 12;
export const MAX_STRESS_SLOTS = 12;

export function slotsInTier(key, tier) {
  return TIER_SLOT_TABLE[key]?.[tier] || 0;
}

// Proficiency is the one option that marks both of its tier's slots at once.
export function slotsPerPick(key) {
  return key === "proficiency" ? 2 : 1;
}

export function totalSlotsForOption(key, tier) {
  let total = 0;
  for (let t = 2; t <= tier; t++) total += slotsInTier(key, t);
  return total;
}

// Slot usage is tracked per option AND per tier, because which slot you mark can matter:
// see extraCardLevelCap. Shape: { traits: { 2: 3, 3: 1, 4: 0 }, ... }
export function blankSlotsUsed() {
  const state = {};
  for (const key of Object.keys(TIER_SLOT_TABLE)) {
    state[key] = { 2: 0, 3: 0, 4: 0 };
  }
  return state;
}

export function usedSlotsForOption(slotsUsed, key) {
  const perTier = slotsUsed?.[key];
  if (!perTier) return 0;
  return SLOT_TIERS.reduce((sum, tier) => sum + (perTier[tier] || 0), 0);
}

export function remainingSlots(slotsUsed, key, level) {
  return totalSlotsForOption(key, tierForLevel(level)) - usedSlotsForOption(slotsUsed, key);
}

// Tiers whose slot for this option is still unmarked and reachable at this level: the
// choices offered when marking a box ("your tier or below").
export function openSlotTiers(slotsUsed, key, level) {
  const maxTier = tierForLevel(level);
  const open = [];
  for (const tier of SLOT_TIERS) {
    if (tier > maxTier) break;
    if ((slotsUsed?.[key]?.[tier] || 0) < slotsInTier(key, tier)) open.push(tier);
  }
  return open;
}

// Options unlocked at this level's tier.
export function availableOptionKeys(level) {
  const tier = tierForLevel(level);
  if (tier === 1) return [];
  return Object.keys(TIER_SLOT_TABLE).filter((key) => totalSlotsForOption(key, tier) > 0);
}

export function isLevelAchievement(level) {
  return level === 2 || level === 5 || level === 8;
}

// Current damage thresholds: armor base + level (per the "always add your current level" rule).
export function damageThresholds(baseMajor, baseSevere, level) {
  return { major: baseMajor + level, severe: baseSevere + level };
}

// Characters saved before slots were tracked per tier hold a single total per option.
// Split it across the tiers lowest-first: it's deterministic, and it's what playing well
// does anyway, since spending the cheap slots first keeps the higher domain card caps free.
function splitFlatSlotTotals(flat) {
  const state = blankSlotsUsed();
  for (const key of Object.keys(TIER_SLOT_TABLE)) {
    let left = flat?.[key] || 0;
    for (const tier of SLOT_TIERS) {
      const take = Math.min(left, slotsInTier(key, tier));
      state[key][tier] = take;
      left -= take;
    }
    // More marked than the rules allow: keep the count rather than silently drop it, so the
    // character sheet shows the discrepancy instead of quietly handing back free slots.
    if (left > 0) state[key][4] += left;
  }
  return state;
}

function hasPerTierSlots(value) {
  return !!value && typeof value.traits === "object" && value.traits !== null;
}

let experienceSeq = 0;
function newExperienceId() {
  return `exp_${Date.now().toString(36)}${(experienceSeq++).toString(36)}`;
}

// Every character carries a BASELINE — its stats at some level — and the level up choices
// made since, replayed on top. A character built here baselines at level 1 on its creation
// stats; one that already existed baselines at whatever level it had reached, on the stats
// it already had. Same mechanism either way, so nothing needs a "before/after" special case
// and no stat is ever recomputed from choices that were never recorded.
function captureBaseline(ch) {
  return {
    traits: { ...ch.traits },
    traitMarks: { ...ch.traitMarks },
    proficiency: ch.proficiency,
    hitPointSlotsBonus: ch.hitPointSlotsBonus,
    stressSlotsBonus: ch.stressSlotsBonus,
    evasionBonus: ch.evasionBonus,
    subclassTier: ch.subclassTier,
    slotsUsed: JSON.parse(JSON.stringify(ch.advancementSlotsUsed)),
    domainCardIds: [...(ch.domainCardIds || [])],
  };
}

// Characters saved before levels were introduced don't have these fields: this adds
// them without touching the rest, so they stay valid as "level 1" the moment they're opened.
export function ensureLevelFields(ch) {
  if (ch.level === undefined) ch.level = 1;
  if (ch.proficiency === undefined) ch.proficiency = 1;
  if (!ch.traitMarks) ch.traitMarks = { agility: false, strength: false, finesse: false, instinct: false, presence: false, knowledge: false };
  if (ch.hitPointSlotsBonus === undefined) ch.hitPointSlotsBonus = 0;
  if (ch.stressSlotsBonus === undefined) ch.stressSlotsBonus = 0;
  if (ch.evasionBonus === undefined) ch.evasionBonus = 0;
  if (!ch.subclassTier) ch.subclassTier = "foundation";
  if (!hasPerTierSlots(ch.advancementSlotsUsed)) ch.advancementSlotsUsed = splitFlatSlotTotals(ch.advancementSlotsUsed);
  if (!ch.domainVaultIds) ch.domainVaultIds = [];
  // The 2 cards picked during character creation, kept apart from the ones gained on level
  // up so the creation wizard can edit them without touching the rest of the collection.
  if (!ch.creationDomainCardIds) ch.creationDomainCardIds = (ch.domainCardIds || []).slice(0, 2);

  if (!Array.isArray(ch.levelUps)) ch.levelUps = [];
  if (ch.baselineLevel === undefined) ch.baselineLevel = ch.level;
  if (!ch.baseline) ch.baseline = captureBaseline(ch);

  // Experiences need stable ids: the level 2/5/8 achievements append new ones, which shifts
  // every index after them. sinceLevel records when each became available, so a level up
  // can't be edited to raise an Experience the character didn't have yet.
  for (const exp of ch.experiences || []) {
    if (!exp.id) exp.id = newExperienceId();
    if (exp.baseModifier === undefined) exp.baseModifier = exp.modifier ?? 2;
    if (exp.sinceLevel === undefined) exp.sinceLevel = ch.baselineLevel;
  }
  return ch;
}

// Domain cards currently "in loadout" (max 5, same as the card browser): every
// domainCardIds entry that hasn't been set aside in the vault.
export function activeDomainCardIds(character) {
  return character.domainCardIds.filter((id) => !character.domainVaultIds.includes(id));
}

export const SUBCLASS_TIER_ORDER = ["foundation", "specialization", "mastery"];

export function nextSubclassTier(current) {
  const idx = SUBCLASS_TIER_ORDER.indexOf(current);
  return SUBCLASS_TIER_ORDER[Math.min(idx + 1, SUBCLASS_TIER_ORDER.length - 1)];
}
