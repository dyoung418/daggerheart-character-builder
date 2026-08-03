// What a character's choices do to their stats.
//
// The SRD states these as prose ("Gain an additional Hit Point slot"), and data/ is a
// re-export of daggersearch/daggerheart-data that we want to keep refreshing from upstream.
// So the prose -> numbers mapping lives here instead of in the JSON: this file is the one
// hand-maintained thing, and a data refresh can't silently overwrite it.
//
// Every entry carries the sentence it encodes as a comment. That comment IS the audit trail —
// if you can't point at the sentence, the entry shouldn't exist.
//
// WHAT GETS AN ENTRY
// ------------------
// A bonus is catalogued when it is in effect right now given only what we store — permanent
// choices, what's in the loadout, how the character is configured — and needs no action during
// play. Concretely:
//
//   1. Permanent changes (Giant's Endurance, Vitality).
//   2. A card in the loadout whose bonus applies the whole time it's there (Untouchable).
//   3. A *-Touched card whose 4-cards-in-domain requirement is met — judged per benefit.
//   4. A card in the loadout whose only other requirement is character *configuration*
//      rather than an action ("while you are wearing armor").
//
// Excluded: anything costing Stress or Hope, anything "once per rest", anything gated on
// volatile play state (Vulnerable, Hope >= 2, all Stress marked) or on fiction ("in a natural
// environment"). We track what was chosen and what's in the loadout, not the comings and
// goings of play.
//
// Where we skip one benefit of a card we otherwise count, `excluded` names it, so the "?"
// breakdown can say why a player who met the requirement sees nothing change.
//
// SHAPE
// -----
// Keys are `<entityId>:<discriminator>` — the tier for subclasses, the feature name for
// ancestries, armor and weapons. Domain cards have a single feature block, so they're keyed by
// id alone. Armor and weapon features that mean the same thing everywhere they appear are
// keyed `armor:<feature>` / `weapon:<feature>`; the handful whose numbers differ per item
// (Barrier, Protective) are keyed by item id, which takes precedence.
//
// Values are numbers, or functions of a context object:
//   { level, proficiency, traits, armor, domainCounts, character }
// `traits` holds effective trait totals. `when` is an optional predicate on the same context.

import { SUBCLASS_TIER_ORDER } from "./advancement.js";

// Requirement shared by the *-Touched cards: "When 4 or more of the domain cards in your
// loadout are from the X domain". The card is itself an X card, so it counts toward its own 4.
const touched = (domain) => (c) => (c.domainCounts[domain] || 0) >= 4;

const ONCE_PER_REST = "needs an action or a rest, so it isn't counted here";

export const EFFECTS = {
  // ===================== Ancestries =====================
  // Keyed by feature name, not ancestry id alone: with a mixed ancestry the player picks ONE
  // feature per ancestry, and it isn't always the first one. A mixed-ancestry Giant who took
  // Reach does not get the extra Hit Point slot.

  // Giant, Endurance — "Gain an additional Hit Point slot at character creation."
  "core_ancestry_giant:Endurance": { hitPointSlots: 1 },

  // Human, High Stamina — "Gain an additional Stress slot at character creation."
  "core_ancestry_human:High Stamina": { stressSlots: 1 },

  // Simiah, Nimble — "Gain a permanent +1 bonus to your Evasion at character creation."
  // Nimble is Simiah's SECOND feature; the other four stat features are their ancestry's first.
  "core_ancestry_simiah:Nimble": { evasion: 1 },

  // Galapa, Shell — "Gain a bonus to your damage thresholds equal to your Proficiency."
  "core_ancestry_galapa:Shell": {
    majorThreshold: (c) => c.proficiency,
    severeThreshold: (c) => c.proficiency,
  },

  // Clank, Purposeful Design — "At character creation, choose one of your Experiences that best
  // aligns with this purpose and gain a permanent +1 bonus to it."
  "core_ancestry_clank:Purposeful Design": {
    choice: {
      prompt: "Purposeful Design: choose the Experience that best aligns with what you were made for.",
      kind: "experience",
      options: [{ id: "one", label: "+1 to one Experience", pick: 1, bonus: 1 }],
    },
  },

  // ===================== Subclasses =====================
  // Keyed by tier. A tier implies every tier below it, so Stalwart at Mastery collects all
  // three of these and ends up at +6 thresholds.

  // School of War — "Gain an additional Hit Point slot."
  "core_subclass_school_of_war:foundation": { feature: "Battlemage", hitPointSlots: 1 },

  // Vengeance — "Gain an additional Stress slot."
  "core_subclass_vengeance:foundation": { feature: "At Ease", stressSlots: 1 },

  // Stalwart — "Gain a permanent +1 bonus to your damage thresholds." (Iron Will, the other
  // Foundation feature, spends an Armor Slot, so it isn't here.)
  "core_subclass_stalwart:foundation": { feature: "Unwavering", majorThreshold: 1, severeThreshold: 1 },
  // Stalwart — "Gain a permanent +2 bonus to your damage thresholds."
  "core_subclass_stalwart:specialization": { feature: "Unrelenting", majorThreshold: 2, severeThreshold: 2 },
  // Stalwart — "Gain a permanent +3 bonus to your damage thresholds."
  "core_subclass_stalwart:mastery": { feature: "Undaunted", majorThreshold: 3, severeThreshold: 3 },

  // Nightwalker — "Gain a permanent +1 bonus to your Evasion."
  "core_subclass_nightwalker:mastery": { feature: "Fleeting Shadow", evasion: 1 },

  // Winged Sentinel — "Gain a permanent +4 bonus to your Severe damage threshold."
  "core_subclass_winged_sentinel:mastery": { feature: "Ascendant", severeThreshold: 4 },

  // School of Knowledge — "Take an additional domain card of your level or lower from a domain
  // you have access to." Not a stat, but it changes how many cards you get to pick.
  "core_subclass_school_of_knowledge:foundation": { feature: "Prepared", extraDomainCards: 1 },
  "core_subclass_school_of_knowledge:specialization": { feature: "Accomplished", extraDomainCards: 1 },
  "core_subclass_school_of_knowledge:mastery": { feature: "Brilliant", extraDomainCards: 1 },

  // ===================== Armor features =====================

  // "+1 to Evasion"
  "armor:Flexible": { evasion: 1 },
  // "-1 to Evasion"
  "armor:Heavy": { evasion: -1 },
  // "-2 to Evasion; -1 to Agility"
  "armor:Very Heavy": { evasion: -2, traits: { agility: -1 } },
  // "+1 to Presence"
  "armor:Gilded": { traits: { presence: 1 } },
  // "+1 to Spellcast Rolls" — a Spellcast Roll bonus, NOT a bonus to the underlying trait: a
  // plain Knowledge roll doesn't get it, so this must never reach effective traits.
  "armor:Channeling": { spellcast: 1 },
  // "-1 to all character traits and Evasion"
  "armor:Difficult": {
    evasion: -1,
    traits: { agility: -1, strength: -1, finesse: -1, instinct: -1, presence: -1, knowledge: -1 },
  },

  // ===================== Weapon features =====================
  // A weapon's `attack` bonus applies to attacks with THAT weapon only. Everything else a
  // weapon grants (Evasion, Armor Score, traits, thresholds) applies to the character.

  // "+1 to attack rolls"
  "weapon:Reliable": { attack: 1 },
  // "-1 to Evasion"
  "weapon:Heavy": { evasion: -1 },
  // "-1 to Evasion; on a successful attack, roll an additional damage die..."
  "weapon:Massive": { evasion: -1 },
  // "-1 to Finesse"
  "weapon:Cumbersome": { traits: { finesse: -1 } },
  // "-1 to Agility; on a successful attack, all adversaries within Very Close range..."
  "weapon:Destructive": { traits: { agility: -1 } },
  // "-1 to Evasion; +3 to Severe damage threshold"
  "weapon:Brave": { evasion: -1, severeThreshold: 3 },
  // "+1 to Armor Score; +1 to primary weapon damage within Melee range"
  "weapon:Double Duty": { armorScore: 1 },

  // Barrier and Protective mean a different number on each shield, so these are keyed per item
  // and override the generic feature-name entries above.
  // "+N to Armor Score; -1 to Evasion"
  "core_weapon_tower_shield:Barrier": { armorScore: 2, evasion: -1 },
  "core_weapon_improved_tower_shield:Barrier": { armorScore: 3, evasion: -1 },
  "core_weapon_advanced_tower_shield:Barrier": { armorScore: 4, evasion: -1 },
  "core_weapon_legendary_tower_shield:Barrier": { armorScore: 5, evasion: -1 },
  // "+N to Armor Score"
  "core_weapon_round_shield:Protective": { armorScore: 1 },
  "core_weapon_labrys_axe:Protective": { armorScore: 1 },
  "core_weapon_improved_round_shield:Protective": { armorScore: 2 },
  "core_weapon_advanced_round_shield:Protective": { armorScore: 3 },
  "core_weapon_legendary_round_shield:Protective": { armorScore: 4 },

  // ===================== Domain cards =====================

  // Untouchable — "Gain a bonus to your Evasion equal to half your Agility."
  // The SRD's general rule: "if you need to round to a whole number, round up unless otherwise
  // specified", so Agility +1 gives +1, not 0.
  "core_domain_card_untouchable": { evasion: (c) => Math.ceil(c.traits.agility / 2) },

  // Fortified Armor — "While you are wearing armor, gain a +2 bonus to your damage thresholds."
  // Wearing armor is a configuration, not an action, so this counts.
  "core_domain_card_fortified_armor": {
    when: (c) => !!c.armor,
    majorThreshold: 2,
    severeThreshold: 2,
  },

  // Armorer — "While you're wearing armor, gain a +1 bonus to your Armor Score."
  "core_domain_card_armorer": {
    when: (c) => !!c.armor,
    armorScore: 1,
    excluded: [`Armorer's downtime armor repair for your allies ${ONCE_PER_REST}`],
  },

  // Rise Up — "Gain a bonus to your Severe threshold equal to your Proficiency."
  "core_domain_card_rise_up": {
    severeThreshold: (c) => c.proficiency,
    excluded: [`Rise Up's "clear a Stress when you mark Hit Points" happens in play, so it isn't counted here`],
  },

  // Arcana-Touched — "+1 bonus to your Spellcast Rolls".
  "core_domain_card_arcana_touched": {
    when: touched("ARCANA"),
    spellcast: 1,
    excluded: [`Arcana-Touched's Hope/Fear Die switch ${ONCE_PER_REST}`],
  },

  // Blade-Touched — "+2 bonus to your attack rolls" and "+4 bonus to your Severe damage
  // threshold". Both are passive, so nothing is excluded.
  "core_domain_card_blade_touched": { when: touched("BLADE"), attack: 2, severeThreshold: 4 },

  // Bone-Touched — "+1 bonus to Agility".
  "core_domain_card_bone_touched": {
    when: touched("BONE"),
    traits: { agility: 1 },
    excluded: [`Bone-Touched's attack negation costs 3 Hope, so it isn't counted here`],
  },

  // Splendor-Touched — "+3 bonus to your Severe damage threshold".
  "core_domain_card_splendor_touched": {
    when: touched("SPLENDOR"),
    severeThreshold: 3,
    excluded: [`Splendor-Touched's damage substitution ${ONCE_PER_REST}`],
  },

  // Valor-Touched — "+1 bonus to your Armor Score".
  "core_domain_card_valor_touched": {
    when: touched("VALOR"),
    armorScore: 1,
    excluded: [`Valor-Touched's Armor Slot recovery happens in play, so it isn't counted here`],
  },

  // Codex-Touched — catalogued so a player who met the requirement is told why nothing moved.
  // Adding Proficiency to a Spellcast Roll costs a Stress; the card swap is once per rest.
  "core_domain_card_codex_touched": {
    when: touched("CODEX"),
    excluded: [
      `Codex-Touched's Proficiency on Spellcast Rolls costs a Stress each time, so it isn't counted here`,
      `Codex-Touched's free card swap ${ONCE_PER_REST}`,
    ],
  },

  // Sage-Touched — the Spellcast bonus depends on where the scene is set, which we don't track.
  "core_domain_card_sage_touched": {
    when: touched("SAGE"),
    excluded: [
      `Sage-Touched's +2 to Spellcast Rolls only applies in a natural environment, so it isn't counted here`,
      `Sage-Touched's doubled Agility or Instinct ${ONCE_PER_REST}`,
    ],
  },

  // Vitality — "When you choose this card, permanently gain two of the following benefits...
  // Then place this card in your vault permanently." Permanent, so it keeps applying from the
  // vault — which is exactly where the card tells you to put it.
  "core_domain_card_vitality": {
    permanent: true,
    choice: {
      prompt: "Vitality: choose two benefits. They're permanent, and stay even though the card lives in your vault.",
      kind: "benefit",
      pick: 2,
      options: [
        { id: "stress", label: "One Stress slot", stressSlots: 1 },
        { id: "hitPoint", label: "One Hit Point slot", hitPointSlots: 1 },
        { id: "thresholds", label: "+2 bonus to your damage thresholds", majorThreshold: 2, severeThreshold: 2 },
      ],
    },
  },

  // Master of the Craft — "Gain a permanent +2 bonus to two of your Experiences or a permanent
  // +3 bonus to one of your Experiences. Then place this card in your vault permanently."
  "core_domain_card_master_of_the_craft": {
    permanent: true,
    choice: {
      prompt: "Master of the Craft: choose how to spend the bonus. It's permanent, and stays even though the card lives in your vault.",
      kind: "experience",
      options: [
        { id: "two", label: "+2 to two Experiences", pick: 2, bonus: 2 },
        { id: "one", label: "+3 to one Experience", pick: 1, bonus: 3 },
      ],
    },
  },
};

function lookup(...keys) {
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(EFFECTS, key)) return { key, effect: EFFECTS[key] };
  }
  return null;
}

function featureNames(entity) {
  return (entity?.features || []).map((f) => f.name?.["en-US"]).filter(Boolean);
}

function displayName(entity, fallback) {
  return entity?.name?.["en-US"] || fallback;
}

// A tier implies every tier below it — the same ladder the subclass cards use.
function tiersUpTo(tier) {
  const idx = SUBCLASS_TIER_ORDER.indexOf(tier);
  return SUBCLASS_TIER_ORDER.slice(0, idx < 0 ? 1 : idx + 1);
}

/**
 * Every effect a character currently has, in the order they'd read down their sheet.
 *
 * Each entry is { key, label, effect, scope }. `label` is what the "?" breakdown shows, so it
 * names the thing the player chose rather than the rule id. `scope` is "primary"/"secondary"
 * for a weapon's own attack bonus and "character" for everything else.
 *
 * @param {object} ch a character (already through ensureLevelFields)
 * @param {object} db whatever data the calling page loaded; sources whose data is missing are
 *   skipped rather than throwing, because the level up screen loads only classes, subclasses
 *   and domain cards.
 */
export function collectEffects(ch, db) {
  const found = [];
  const add = (hit, label, scope = "character") => {
    if (hit) found.push({ key: hit.key, label, effect: hit.effect, scope });
  };

  for (const chosen of ch.heritage?.chosenFeatures || []) {
    const anc = (db?.ancestries || []).find((a) => a.id === chosen.ancestryId);
    add(lookup(`${chosen.ancestryId}:${chosen.featureName}`),
      `${displayName(anc, "Ancestry")} — ${chosen.featureName}`);
  }

  const sub = (db?.subclasses || []).find((s) => s.id === ch.subclassId);
  if (sub) {
    for (const tier of tiersUpTo(ch.subclassTier)) {
      const hit = lookup(`${sub.id}:${tier}`);
      // The feature name comes from the entry, not from data/: a tier can hold two features
      // and only one of them is the one being encoded (Stalwart's Foundation is Unwavering
      // AND Iron Will; only Unwavering moves a stat).
      add(hit, `${displayName(sub, "Subclass")}${hit?.effect.feature ? ` — ${hit.effect.feature}` : ""}`);
    }
  }

  const armor = (db?.armors || []).find((a) => a.id === ch.equipment?.armorId);
  for (const name of featureNames(armor)) {
    add(lookup(`${armor.id}:${name}`, `armor:${name}`), `${displayName(armor, "Armor")} (${name})`);
  }

  const weaponSlots = [["primary", ch.equipment?.primaryWeaponId]];
  if (ch.equipment?.weaponMode === "one-handed") weaponSlots.push(["secondary", ch.equipment?.secondaryWeaponId]);
  for (const [scope, weaponId] of weaponSlots) {
    const weapon = (db?.weapons || []).find((w) => w.id === weaponId);
    for (const name of featureNames(weapon)) {
      add(lookup(`${weapon.id}:${name}`, `weapon:${name}`), `${displayName(weapon, "Weapon")} (${name})`, scope);
    }
  }

  // Loadout cards apply while they're in the loadout; the two cards whose text says the bonus
  // is permanent keep applying from the vault, which is where those cards tell you to put them.
  const vaulted = ch.domainVaultIds || [];
  for (const cardId of ch.domainCardIds || []) {
    const hit = lookup(cardId);
    if (!hit) continue;
    if (vaulted.includes(cardId) && !hit.effect.permanent) continue;
    const card = (db?.domainCards || []).find((c) => c.id === cardId);
    add(hit, displayName(card, cardId));
  }

  return found;
}

// How many of each domain are in the loadout — the requirement the *-Touched cards check.
export function loadoutDomainCounts(ch, db) {
  const counts = {};
  const vaulted = ch.domainVaultIds || [];
  for (const cardId of ch.domainCardIds || []) {
    if (vaulted.includes(cardId)) continue;
    const card = (db?.domainCards || []).find((c) => c.id === cardId);
    if (card?.domain) counts[card.domain] = (counts[card.domain] || 0) + 1;
  }
  return counts;
}

export function effectValue(value, ctx) {
  return typeof value === "function" ? value(ctx) : value;
}

// The choices a character still owes an answer for: effects whose text says "choose", where
// ch.effectChoices has nothing recorded yet. Shown as a nudge, never as a block — a character
// saved before this existed must stay editable.
export function unresolvedChoices(ch, db) {
  return collectEffects(ch, db)
    .filter((e) => e.effect.choice && !ch.effectChoices?.[e.key])
    .map((e) => ({ key: e.key, label: e.label, prompt: e.effect.choice.prompt }));
}
