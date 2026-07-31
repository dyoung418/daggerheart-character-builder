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

// Level cap for the extra domain card from the "domainCard" option: each tier fixes
// it to that tier's max level (even if the slot is spent later). Simplification: we
// compute the cap from the current tier at the moment of the choice, not from the
// tier the slot originally came from — irrelevant in practice except for the rare
// case of a slot left unused across several tiers.
export function domainCardLevelCap(level) {
  const tier = tierForLevel(level);
  if (tier === 2) return 4;
  if (tier === 3) return 7;
  return level;
}

export function totalSlotsForOption(key, tier) {
  const table = TIER_SLOT_TABLE[key];
  let total = 0;
  for (let t = 2; t <= tier; t++) total += table[t] || 0;
  return total;
}

export function remainingSlots(character, key) {
  const tier = tierForLevel(character.level);
  const total = totalSlotsForOption(key, tier);
  const used = character.advancementSlotsUsed?.[key] || 0;
  return total - used;
}

// Options unlocked at the character's tier (character.level already set to the new level).
export function availableOptionKeys(character) {
  const tier = tierForLevel(character.level);
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

export function blankAdvancementState() {
  return {
    traits: 0, hitPoint: 0, stress: 0, experience: 0, domainCard: 0, evasion: 0, subclass: 0, proficiency: 0,
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
  if (!ch.advancementSlotsUsed) ch.advancementSlotsUsed = blankAdvancementState();
  if (!ch.domainVaultIds) ch.domainVaultIds = [];
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
