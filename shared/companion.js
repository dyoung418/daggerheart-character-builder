// The Beastbound Ranger's animal companion: the state shape, and the functions that keep it
// well-formed. Pure and dependency-free — no imports — so advancement.js and transfer.js can
// normalise a companion without pulling in the stat engine. The DERIVED view (what the options
// add up to) is shared/companion-stats.js, which builds on this.
//
// A companion is name + Evasion + two Experiences + an attack, all player-authored (SRD 2.0
// p21). It lives at character.companion, null for everyone but a Beastbound Ranger — its shape is
// subclass-specific, the same reason a transformation doesn't live in `heritage`. The level-up
// options chosen for it ride the `companionOptions` levelChoice (character.levelChoiceIds); its
// marked Stress and its Light in the Dark slot ride character.state, like the character's own HP.

// The damage-die and range ladders the Vicious level-up option climbs, one step per pick. The
// companion always STARTS at D6 / MELEE (SRD 2.0 p21, and the official sidecar: "Their damage
// starts at d6 and their range starts at Melee") — the player has no choice at creation. Vicious
// is the only thing that moves either.
export const COMPANION_DAMAGE_DICE = ["D6", "D8", "D10", "D12"];
export const COMPANION_RANGES = ["MELEE", "VERY_CLOSE", "CLOSE", "FAR", "VERY_FAR"];
export const COMPANION_DAMAGE_TYPES = ["PHYSICAL", "MAGICAL"];

export const COMPANION_BASE_EVASION = 10; // SRD 2.0 p21: "Fill in their Evasion, which starts at 10."
// Three solid slots on the official companion sheet, then three dashed ones — base 3, and Resilient
// (maxPicks 3) grows it to the 6 the sidecar form draws.
export const COMPANION_BASE_STRESS = 3;
export const COMPANION_EXPERIENCE_BASE = 2; // "Start with +2 in both Experiences."

// Climb `ladder` `steps` rungs up from `base`, clamped to the top. `stepUp(COMPANION_DAMAGE_DICE,
// "D6", 2)` -> "D10". A base the ladder doesn't contain is treated as rung 0.
export function stepUp(ladder, base, steps) {
  const start = ladder.indexOf(base);
  const from = start < 0 ? 0 : start;
  const n = Number.isInteger(steps) && steps > 0 ? steps : 0;
  return ladder[Math.min(from + n, ladder.length - 1)];
}

let seq = 0;
export function newCompanionExperienceId() {
  return `comp_exp_${Date.now().toString(36)}${(seq++).toString(36)}`;
}

export function blankCompanionExperience(sinceLevel = 1) {
  return {
    id: newCompanionExperienceId(),
    name: "",
    baseModifier: COMPANION_EXPERIENCE_BASE,
    modifier: COMPANION_EXPERIENCE_BASE,
    sinceLevel,
  };
}

/** A fresh companion, the two starting Experiences included. Used by the creation wizard. */
export function blankCompanion() {
  return {
    name: "",
    evasion: COMPANION_BASE_EVASION,
    experiences: [blankCompanionExperience(1), blankCompanionExperience(1)],
    attack: { name: "", range: "MELEE", damageDie: "D6", damageType: "PHYSICAL" },
  };
}

function normalizeAttack(raw) {
  const attack = { name: "", range: "MELEE", damageDie: "D6", damageType: "PHYSICAL" };
  const a = raw && typeof raw === "object" ? raw : {};
  if (typeof a.name === "string") attack.name = a.name;
  if (COMPANION_RANGES.includes(a.range)) attack.range = a.range;
  if (COMPANION_DAMAGE_DICE.includes(a.damageDie)) attack.damageDie = a.damageDie;
  if (COMPANION_DAMAGE_TYPES.includes(a.damageType)) attack.damageType = a.damageType;
  return attack;
}

function normalizeExperience(raw) {
  const baseModifier = Number.isInteger(raw.baseModifier) ? raw.baseModifier
    : (Number.isInteger(raw.modifier) ? raw.modifier : COMPANION_EXPERIENCE_BASE);
  return {
    id: typeof raw.id === "string" && raw.id ? raw.id : newCompanionExperienceId(),
    name: typeof raw.name === "string" ? raw.name : "",
    baseModifier,
    modifier: Number.isInteger(raw.modifier) ? raw.modifier : baseModifier,
    sinceLevel: Number.isInteger(raw.sinceLevel) && raw.sinceLevel >= 1 ? raw.sinceLevel : 1,
  };
}

/**
 * Coerce a companion from an imported or hand-edited file into the shape the app expects, or
 * null it out. Mirrors shared/transfer.js's job for the rest of a character: defend every field,
 * never throw. Fewer than two Experiences is topped up — every companion has two — and every
 * Experience gets a stable id. Always returns a new object (or null).
 */
export function normalizeCompanion(companion) {
  if (!companion || typeof companion !== "object" || Array.isArray(companion)) return null;
  const experiences = (Array.isArray(companion.experiences) ? companion.experiences : [])
    .filter((e) => e && typeof e === "object")
    .map(normalizeExperience);
  while (experiences.length < 2) experiences.push(blankCompanionExperience(1));
  return {
    name: typeof companion.name === "string" ? companion.name : "",
    evasion: Number.isInteger(companion.evasion) && companion.evasion >= 0
      ? companion.evasion : COMPANION_BASE_EVASION,
    experiences,
    attack: normalizeAttack(companion.attack),
  };
}

/**
 * Backfill the ids and back-compat fields an existing companion assumes — the companion
 * equivalent of the experience backfill in ensureLevelFields(). Mutates in place and returns the
 * companion, or null when there isn't one. Cheaper than normalizeCompanion() and id-stable: an
 * Experience that already has an id keeps it.
 */
export function ensureCompanionFields(companion) {
  if (!companion || typeof companion !== "object" || Array.isArray(companion)) return null;
  if (!Array.isArray(companion.experiences)) companion.experiences = [];
  for (const exp of companion.experiences) {
    if (!exp.id) exp.id = newCompanionExperienceId();
    if (exp.baseModifier === undefined) exp.baseModifier = exp.modifier ?? COMPANION_EXPERIENCE_BASE;
    if (exp.modifier === undefined) exp.modifier = exp.baseModifier;
    if (exp.sinceLevel === undefined) exp.sinceLevel = 1;
  }
  while (companion.experiences.length < 2) companion.experiences.push(blankCompanionExperience(1));
  companion.attack = normalizeAttack(companion.attack);
  if (!Number.isInteger(companion.evasion) || companion.evasion < 0) {
    companion.evasion = COMPANION_BASE_EVASION;
  }
  if (typeof companion.name !== "string") companion.name = "";
  return companion;
}
