// The one place a character's derived stats are worked out.
//
// Before this existed, Evasion / Hit Points / Stress were re-derived inline in five separate
// places (the sheet, the CSV export, the creation wizard's derived step, the level up screen's
// slot gating, and the level history validation), which meant five chances to disagree.
//
// Every stat comes back as { total, parts }: the total to show, and the parts it was built
// from so the "?" popover can explain it. They're produced together on purpose — a breakdown
// computed separately from the number it explains is a breakdown that will eventually lie.

import {
  BASE_STRESS_SLOTS,
  MAX_ARMOR_SCORE,
  damageThresholds,
} from "./advancement.js";

export const TRAIT_KEYS = ["agility", "strength", "finesse", "instinct", "presence", "knowledge"];
export const TRAIT_LABELS = {
  agility: "Agility", strength: "Strength", finesse: "Finesse",
  instinct: "Instinct", presence: "Presence", knowledge: "Knowledge",
};

// ---------- primitives ----------
//
// The level up screen and the history validation ask "what would this be if the player also
// took these picks?", which is a hypothetical the character object doesn't hold. They call
// these directly rather than derivedStats() below, so the arithmetic is still stated once.

export function hitPointTotal(cls, bonus) {
  return (cls?.startingHitPoints || 0) + bonus;
}

export function stressTotal(bonus) {
  return BASE_STRESS_SLOTS + bonus;
}

export function evasionTotal(cls, bonus) {
  return (cls?.startingEvasion || 0) + bonus;
}

// ---------- the full picture ----------

function stat(parts) {
  return { total: parts.reduce((sum, p) => sum + p.value, 0), parts };
}

function find(list, id) {
  return id ? (list || []).find((x) => x.id === id) || null : null;
}

/**
 * @param {object} ch a character (already through ensureLevelFields)
 * @param {object} db whatever data the calling page loaded; stats whose data is missing come
 *   back as null rather than throwing, because the level up screen only loads classes,
 *   subclasses and domain cards.
 */
export function derivedStats(ch, db) {
  const cls = find(db?.classes, ch.classId);
  const sub = find(db?.subclasses, ch.subclassId);
  const armor = find(db?.armors, ch.equipment?.armorId);
  const primaryWeapon = find(db?.weapons, ch.equipment?.primaryWeaponId);
  const secondaryWeapon = ch.equipment?.weaponMode === "one-handed"
    ? find(db?.weapons, ch.equipment?.secondaryWeaponId)
    : null;

  const className = cls ? titleCase(cls.name) : "Class";
  const traits = effectiveTraits(ch);

  return {
    traits,
    evasion: cls ? stat([
      { label: `${className} (class)`, value: cls.startingEvasion },
      ...advancementPart(ch.evasionBonus),
    ]) : null,
    hitPoints: cls ? stat([
      { label: `${className} (class)`, value: cls.startingHitPoints },
      ...advancementPart(ch.hitPointSlotsBonus),
    ]) : null,
    stress: stat([
      { label: "Base", value: BASE_STRESS_SLOTS },
      ...advancementPart(ch.stressSlotsBonus),
    ]),
    proficiency: stat([{ label: "Level achievements and advancements", value: ch.proficiency }]),
    armorScore: armorScoreStat(armor, db),
    ...thresholdStats(ch, armor),
    primaryAttack: attackStat(primaryWeapon, traits),
    secondaryAttack: attackStat(secondaryWeapon, traits),
    spellcast: spellcastStat(sub, traits),
  };
}

// A zero bonus is left out entirely: "Advancements +0" is noise in a breakdown.
function advancementPart(bonus) {
  return bonus ? [{ label: "Level up advancements", value: bonus }] : [];
}

// Base assignment plus advancement picks. Equipment and cards will layer on top of this in a
// later change; keeping the shape now means those become extra parts rather than a rewrite.
function effectiveTraits(ch) {
  const out = {};
  for (const key of TRAIT_KEYS) {
    const base = ch.traits?.[key];
    out[key] = base === null || base === undefined
      ? { total: null, parts: [] }
      : stat([{ label: "Assigned at creation, plus advancements", value: base }]);
  }
  return out;
}

function armorScoreStat(armor, db) {
  if (!db?.armors) return null;
  // Unarmored is 0 by the SRD. Unreachable today (the wizard requires armor) but the rule is
  // stated here rather than assumed, so it's already right when equipping becomes optional.
  const parts = armor
    ? [{ label: armor.name["en-US"], value: armor.baseScore }]
    : [{ label: "No armor", value: 0 }];
  const raw = parts.reduce((sum, p) => sum + p.value, 0);
  const capped = Math.min(raw, MAX_ARMOR_SCORE);
  const out = { total: capped, parts };
  if (capped < raw) out.note = `Capped at the maximum Armor Score of ${MAX_ARMOR_SCORE}.`;
  return out;
}

function thresholdStats(ch, armor) {
  if (!ch.equipment) return { majorThreshold: null, severeThreshold: null };
  if (armor) {
    // The total comes from the existing helper rather than being added up again here; the
    // parts only explain it.
    const th = damageThresholds(armor.baseMajorThreshold, armor.baseSevereThreshold, ch.level);
    return {
      majorThreshold: {
        total: th.major,
        parts: [
          { label: armor.name["en-US"], value: armor.baseMajorThreshold },
          { label: "Your level", value: ch.level },
        ],
      },
      severeThreshold: {
        total: th.severe,
        parts: [
          { label: armor.name["en-US"], value: armor.baseSevereThreshold },
          { label: "Your level", value: ch.level },
        ],
      },
    };
  }
  // SRD: unarmored, Major equals your level and Severe twice your level.
  return {
    majorThreshold: stat([{ label: "No armor — your level", value: ch.level }]),
    severeThreshold: stat([{ label: "No armor — twice your level", value: ch.level * 2 }]),
  };
}

// An attack roll uses the trait the weapon specifies (SRD). Proficiency is not part of it —
// that scales damage dice, not the roll to hit.
function attackStat(weapon, traits) {
  if (!weapon) return null;
  const key = String(weapon.trait || "").toLowerCase();
  const trait = traits[key];
  if (!trait || trait.total === null) return null;
  return {
    weaponName: weapon.name["en-US"],
    traitKey: key,
    ...stat([{ label: `${TRAIT_LABELS[key]} (${weapon.name["en-US"]})`, value: trait.total }]),
  };
}

// Deliberately NOT a number: the modifier is already on show in the trait box, so this answers
// "which trait do I roll?". A bonus that applies to Spellcast Rolls specifically is appended
// rather than folded into the trait, because a plain roll of that trait doesn't get it.
function spellcastStat(sub, traits) {
  const key = String(sub?.spellcastTrait || "").toLowerCase();
  if (!key || !TRAIT_LABELS[key]) return null; // Guardian and Warrior have no Spellcast trait
  const trait = traits[key];
  const bonusParts = []; // filled in once equipment/card effects land
  const bonus = bonusParts.reduce((sum, p) => sum + p.value, 0);
  return {
    traitKey: key,
    traitLabel: TRAIT_LABELS[key],
    bonus,
    display: bonus ? `${TRAIT_LABELS[key]} +${bonus}` : TRAIT_LABELS[key],
    parts: [
      { label: `Spellcast trait: ${TRAIT_LABELS[key]}`, value: trait?.total ?? 0 },
      ...bonusParts,
    ],
  };
}

function titleCase(str) {
  return str ? str.charAt(0) + str.slice(1).toLowerCase() : "";
}
