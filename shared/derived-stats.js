// The one place a character's derived stats are worked out.
//
// Before this existed, Evasion / Hit Points / Stress were re-derived inline in five separate
// places (the sheet, the CSV export, the creation wizard's derived step, the level up screen's
// slot gating, and the level history validation), which meant five chances to disagree.
//
// Every stat comes back as { total, parts }: the total to show, and the parts it was built
// from so the "?" popover can explain it. They're produced together on purpose — a breakdown
// computed separately from the number it explains is a breakdown that will eventually lie.
//
// The parts beyond the class baseline and the level up advancements come from shared/effects.js,
// which maps the SRD's prose ("Gain an additional Hit Point slot") onto numbers.

import {
  BASE_STRESS_SLOTS,
  MAX_ARMOR_SCORE,
  MAX_HIT_POINT_SLOTS,
  MAX_STRESS_SLOTS,
  advancementCredits,
  advancementOptions,
  damageThresholds,
  recordedOptionLabels,
  usedSlotsForOption,
} from "./advancement.js";
import {
  EFFECT_STAT_KEYS,
  TRAIT_KEYS,
  collectEffects,
  declaredAdvancementOptions,
  declaredTracks,
  effectValue,
  loadoutDomainCounts,
} from "./effects.js";
import { SPELLCAST_TRAIT, UNARMED, UNARMORED } from "./gear.js";
import { titleCase } from "./text.js";

// Re-exported rather than restated: an effect's `traits` map is keyed by these, so the catalogue
// has to own the list. Every existing importer reads it from here and is unaffected.
export { TRAIT_KEYS };
export const TRAIT_LABELS = {
  agility: "Agility", strength: "Strength", finesse: "Finesse",
  instinct: "Instinct", presence: "Presence", knowledge: "Knowledge",
};

// ---------- primitives ----------
//
// The level up screen and the history validation ask "what would this be if the player also
// took these picks?", which is a hypothetical the character object doesn't hold. They call
// these directly rather than derivedStats() below, so the arithmetic is still stated once.
// `extra` is the character's effect bonuses, from effectBonuses() — a Giant starts one Hit
// Point slot closer to the cap, so their advancement gating has to know about it.

export function hitPointTotal(cls, bonus, extra = 0) {
  return (cls?.startingHitPoints || 0) + bonus + extra;
}

export function stressTotal(bonus, extra = 0) {
  return BASE_STRESS_SLOTS + bonus + extra;
}

export function evasionTotal(cls, bonus, extra = 0) {
  return (cls?.startingEvasion || 0) + bonus + extra;
}

// ---------- the subject a printed page asks about ----------

/**
 * The character as a printed page counts them: every card they own, none of them in play.
 *
 * The one substitution behind every "permanent bonuses only" export — the official sheet's form
 * fields, the printed stats card, and the CSV's `includes-loadout-bonuses: false` row. It lives
 * here because it was written out in all three, rule and reasoning both, and a substitution that
 * grows a second clause in two files out of three prints a sheet no other export agrees with. The
 * candidate second clause is `creationDomainCardIds`, the character's other card list
 * (advancement.js:465 seeds it; history.js:34-42 already builds a hypothetical character by
 * substituting two card lists at once).
 *
 * Vaulting everything is not a trick: vaulted is already what the rules mean by "not in play". A
 * vaulted card contributes only if its effects entry says `permanent`, so Vitality and Master of
 * the Craft keep applying — precisely where their own text tells you to put the card — while
 * Untouchable stops, with no second code path through the rest of this file. The *-Touched
 * requirement counts loadout cards, so it falls to zero on its own with nothing here knowing
 * those cards exist.
 *
 * The vault is substituted and never the collection: which cards you own doesn't depend on where
 * they're sitting, so the per-card CSV columns and the printed card list come out identical under
 * both exports.
 *
 * The consequence worth knowing before reading the numbers: this also unwinds Bare Bones, so an
 * unarmored character reads the SRD's unarmored rule, and their printed Evasion, thresholds and
 * Armor Score can be genuinely lower than what's in play. Saying so on the page is the caller's
 * job — the card prints a footer note, the CSV a column of its own.
 */
export function permanentSubject(character) {
  return { ...character, domainVaultIds: character.domainCardIds || [] };
}

// ---------- effect plumbing ----------

const signed = (n) => (n > 0 ? `+${n}` : String(n));

function stat(parts) {
  return { total: parts.reduce((sum, p) => sum + p.value, 0), parts };
}

function capped(s, max, what) {
  if (s.total <= max) return s;
  return { ...s, total: max, note: `Capped at the maximum ${what} of ${max}.` };
}

function find(list, id) {
  return id ? (list || []).find((x) => x.id === id) || null : null;
}

// Deliberately unarmored resolves to no armor, the same as not having picked any — the
// difference between the two matters to the wizard, not to the arithmetic. Asked explicitly
// rather than left to find() missing, so the sentinel can't be mistaken for a typo'd id.
// SRD: "Unarmed attack rolls use either Strength or Finesse (GM's choice)", and "successful
// unarmed attacks inflict [Proficiency]d4 damage" — the same Proficiency-multiplies-the-dice
// rule as any weapon, so d4 is the rating in the same sense d10+3 is a Longsword's.
//
// Two traits rather than one, so this deliberately isn't shaped like a weapon record. It's a
// core rule, which is why it lives here and not in data/ or in the effects catalogue.
export const UNARMED_PROFILE = {
  name: { "en-US": "Unarmed" },
  traits: ["STRENGTH", "FINESSE"],
  range: "MELEE",
  damage: { dice: "D4", type: "PHYSICAL" },
  note: "Unarmed attack rolls use Strength or Finesse, whichever the GM calls for.",
};

// Fighting bare-handed, in the sense a replacement profile cares about: nothing in either hand.
//
// The app's `unarmed` means only that the PRIMARY slot holds the sentinel — a character can be
// unarmed and still carry a shield, whose Armor Score already counts. A class feature that hands
// you a better bare-handed profile is conditioned on carrying no weapon at all, so it needs the
// stricter question, and the two must not be confused: everything else in this file keeps using
// the loose one.
function barehanded(ch) {
  return ch.equipment?.primaryWeaponId === UNARMED && !ch.equipment?.secondaryWeaponId;
}

// The profile a bare-handed character fights with: the SRD's d4 by default, or whatever an
// effect declares in its place.
//
// A declared profile stands in only while both hands are empty. Pick up a shield and you fall
// back to the SRD's — which is the honest reading of a feature that applies "while you have no
// other Active Weapons", and means the default profile behaves exactly as it always has.
// The first declaration wins; two would be a catalogue bug.
function unarmedProfileFrom(contributions) {
  for (const entry of contributions) {
    if (entry.effect.unarmedProfile) return entry.effect.unarmedProfile;
  }
  return UNARMED_PROFILE;
}

function equippedArmor(ch, db) {
  if (ch.equipment?.armorId === UNARMORED) return null;
  return find(db?.armors, ch.equipment?.armorId);
}

// Which traits this character can cast with: their own subclass's, then the one a multiclass
// foundation card brought. Two only when both name one and they differ — "if your foundation
// cards specify different Spellcast traits, you can choose which one to apply when making a
// Spellcast roll", which is a choice per roll rather than a thing to store.
export function spellcastTraitKeys(ch, db) {
  const ids = [ch?.subclassId, ch?.multiclass?.subclassId].filter(Boolean);
  const keys = [];
  for (const id of ids) {
    const sub = (db?.subclasses || []).find((s) => s.id === id);
    const key = String(sub?.spellcastTrait || "").toLowerCase();
    if (key && TRAIT_LABELS[key] && !keys.includes(key)) keys.push(key);
  }
  return keys;
}

function baseTraitTotals(ch) {
  const out = {};
  for (const key of TRAIT_KEYS) out[key] = ch.traits?.[key] ?? 0;
  return out;
}

// A choice ("permanently gain two of the following benefits") only becomes a number once the
// player has answered it, so it's turned into ordinary contributions here. Anything unanswered
// simply contributes nothing — see unresolvedChoices() for the nudge that goes on the sheet.
function resolveChoice(entry, ch) {
  const { choice } = entry.effect;
  const answer = ch.effectChoices?.[entry.key];
  if (!answer) return [];
  const chosen = choice.options.filter((o) => (answer.optionIds || [answer.optionId]).includes(o.id));
  return chosen.map((o) => ({ ...entry, label: `${entry.label} — ${o.label}`, effect: o }));
}

/**
 * Everything shared/effects.js currently grants this character, flattened and evaluated.
 * Returns { contributions, exclusions, experienceBonus }.
 */
function gather(ch, db) {
  const domainCounts = loadoutDomainCounts(ch, db);
  const armor = equippedArmor(ch, db);
  const sub = find(db?.subclasses, ch.subclassId);
  const ctx = {
    character: ch,
    level: ch.level,
    proficiency: ch.proficiency,
    armor,
    domainCounts,
    traits: baseTraitTotals(ch),
    // Which trait "equal to your Spellcast trait" means. Only the subclass knows, and the thing
    // granting such a bonus — a piece of armour — can't name it, so it's resolved here once.
    // Null for the Guardian and the Warrior, whose subclasses have no Spellcast trait at all.
    //
    // A multiclassed character may have two and picks between them per roll; a number printed on
    // a sheet can't. It takes the higher, because that's the one the player would roll with, and
    // the breakdown row names which. (SRD, Additional Rules: resolve ambiguity in the PCs' favour.)
    spellcastTrait: spellcastKeyFor(ch, db, baseTraitTotals(ch)),
  };

  // `when` and the trait modifiers are settled first, against base traits. Nothing in the
  // catalogue gates on a trait, and no trait modifier is a function of another trait, so this
  // can't be circular — but it does mean everything else gets to read effective traits below.
  //
  // An entry that replaces the unarmed profile is gated on being bare-handed, and so is
  // everything else that entry grants: a feature that reads "while this weapon is active, you
  // gain +1 Evasion" must not keep paying out once you pick up a sword. That gate is the entry's
  // own shape rather than a `when`, which is what lets a source declare it in JSON at all.
  const empty = barehanded(ch);
  const active = collectEffects(ch, db)
    .filter((e) => !e.effect.unarmedProfile || empty)
    .filter((e) => !e.effect.when || e.effect.when(ctx));

  const contributions = [];
  const exclusions = [];
  for (const entry of active) {
    for (const reason of entry.effect.excluded || []) exclusions.push(reason);
    if (entry.effect.choice) contributions.push(...resolveChoice(entry, ch));
    else contributions.push(entry);
  }

  // Two shapes of the same thing: the totals, for callers doing arithmetic, and the parts they
  // were built from, so the breakdown can name the feature that granted each one rather than
  // reporting the sum as an anonymous "permanent bonus".
  const experienceBonus = {};
  const experienceParts = {};
  for (const entry of active) {
    const answer = ch.effectChoices?.[entry.key];
    if (!entry.effect.choice || entry.effect.choice.kind !== "experience" || !answer) continue;
    const option = entry.effect.choice.options.find((o) => o.id === answer.optionId);
    if (!option) continue;
    for (const expId of (answer.experienceIds || []).slice(0, option.pick)) {
      experienceBonus[expId] = (experienceBonus[expId] || 0) + option.bonus;
      (experienceParts[expId] ||= []).push({ label: entry.label, value: option.bonus });
    }
  }

  return { contributions, exclusions, experienceBonus, experienceParts, ctx };
}

// Contributions to one stat, as breakdown parts. Weapon features that boost attack rolls are
// scoped to the weapon that has them; every other contribution applies to the character.
function partsFor(contributions, key, ctx, scope) {
  const parts = [];
  for (const entry of contributions) {
    if (scope && entry.scope !== "character" && entry.scope !== scope) continue;
    const raw = entry.effect[key];
    if (raw === undefined) continue;
    const value = effectValue(raw, ctx);
    if (value) parts.push({ label: entry.label, value });
  }
  return parts;
}

// The base a stat starts from when something overrides it — Bare Bones standing in for the
// armor you chose not to wear. Returns undefined when nothing does, so the caller keeps its own
// default. Two entries claiming the same base would be a catalogue bug; the first wins, and the
// label names the source so the "?" breakdown can say where the number came from.
function baseOverride(contributions, key, ctx) {
  for (const entry of contributions) {
    const raw = entry.effect.base?.[key];
    if (raw === undefined) continue;
    return { label: entry.label, value: effectValue(raw, ctx) };
  }
  return undefined;
}

/**
 * The stat bonuses a character has from effects, for callers doing their own arithmetic —
 * the level up screen's slot gating, the history validation, the extra domain card count.
 * Every key in EFFECT_STAT_KEYS is present, so a new one in effects.js turns up here with
 * no change needed at either end.
 *
 * A value that scales with a trait is evaluated against BASE traits here, where derivedStats()
 * below evaluates it against effective ones — this function never reassigns ctx.traits, because
 * it doesn't compute the traits in the first place. That predates the `equalTo` form (it already
 * applied to Untouchable's half-Agility) and no caller is affected: the three that exist read
 * hitPointSlots, stressSlots and extraDomainCards, none of which scales with anything. Worth
 * knowing before cataloguing a trait-scaled bonus that a level up screen has to gate on.
 */
export function effectBonuses(ch, db) {
  const { contributions, ctx } = gather(ch, db);
  const totals = {};
  for (const key of EFFECT_STAT_KEYS) {
    totals[key] = partsFor(contributions, key, ctx).reduce((sum, p) => sum + p.value, 0);
  }
  return totals;
}

/**
 * The permanent per-Experience bonuses a character has from effects (Clank's Purposeful
 * Design, Vitality's kin), keyed by Experience id. These sit outside effectBonuses because
 * they don't land on a stat: they land on one named Experience the player chose.
 *
 * The level up screen's Experience picker needs them for the same reason the sheet does —
 * it shows each Experience's current modifier, and an Experience carrying one of these is
 * higher than the replay alone believes.
 */
export function effectExperienceBonuses(ch, db) {
  return gather(ch, db).experienceBonus;
}

/**
 * The advancement rows this character is offered — the printed table, plus whatever their class
 * or subclass declared, plus a row for anything they've already marked that nothing declares any
 * more. The level up screen, the history grid and the history validation all build it from here
 * so they can't disagree about which rows exist.
 *
 * It lives in this file for one reason: shared/advancement.js is not allowed to import
 * shared/effects.js (effects.js imports tierForLevel from it), and this file already imports
 * both — as does every caller, so nothing gains an import edge.
 *
 * Pass `level` and `used` from a rewound state to ask what was on offer at an earlier level; the
 * defaults ask about the character as they stand.
 */
export function advancementOptionsFor(ch, db, { level = ch?.level, used = ch?.advancementSlotsUsed } = {}) {
  const declared = declaredAdvancementOptions(ch, db);
  const tracks = characterTracks(ch, db, { level, used });
  return advancementOptions(level, {
    // A row that climbs a ladder says which rung it buys you — "Improve your gadget (d6 → d8)" —
    // the same instinct as the extra card row printing its level caps. A separate field, not part
    // of the label, because the label is what a pick records and this is true only right now.
    declared: declared.map((option) => ({ ...option, hint: nextStepSuffix(option, tracks) })),
    used,
    labels: recordedOptionLabels(ch),
  });
}

function nextStepSuffix(option, tracks) {
  const track = tracks.find((t) => t.id === option.advances);
  if (track?.form !== "steps" || track.next == null || track.next === track.value) return "";
  return ` (${track.value} → ${track.next})`;
}

/**
 * Every track this character has, resolved to the rung they're on. Empty for most characters.
 *
 * `used` and `level` are the two things a rung can depend on, and both are passed in so the level
 * up screen can ask what the value was — or is about to become — at the level being edited.
 */
export function characterTracks(ch, db, { level = ch?.level, used = ch?.advancementSlotsUsed } = {}) {
  const tracks = declaredTracks(ch, db);
  if (tracks.length === 0) return [];
  const options = declaredAdvancementOptions(ch, db);
  return tracks.map((track) => resolveTrack(track, ch, { level, used, options }));
}

// The three forms a ladder can take, and where each gets its rung from. Exactly one is present:
// content-sources.js refuses an entry carrying two, or none.
function resolveTrack(track, ch, { level, used, options }) {
  const base = { id: track.id, label: track.label, note: track.note || null, capped: false };

  // Fixed while the declaring feature is on the sheet. This is how a subclass says "your die is
  // a d10 now" — the condition is that the feature is there at all, which collectEffects has
  // already answered by handing this over.
  if (track.value != null) {
    return { ...base, form: "value", value: track.value, next: null, parts: [{ label: track.from, value: track.value }] };
  }

  if (track.byLevel) {
    const rungs = Object.keys(track.byLevel).map(Number).filter((n) => Number.isFinite(n)).sort((a, b) => a - b);
    const reached = rungs.filter((at) => at <= (level ?? 1));
    const at = reached.length ? reached[reached.length - 1] : rungs[0];
    const ahead = rungs.find((n) => n > (level ?? 1));
    return {
      ...base,
      form: "byLevel",
      value: track.byLevel[at],
      next: ahead != null ? track.byLevel[ahead] : null,
      // Only the rungs actually reached: a breakdown is what the value IS made of, and the note
      // below is where what's coming belongs.
      parts: reached.map((n) => ({ label: n <= 1 ? "Where it starts" : `Level ${n}`, value: track.byLevel[n] })),
      note: track.note || (ahead != null ? `Increases to ${track.byLevel[ahead]} at level ${ahead}.` : null),
    };
  }

  // Climbed by taking an advancement option. Counted off the slots marked rather than replayed,
  // which is what lets a character imported at level 8 with no recorded levels read correctly.
  const steps = track.steps || [];
  const keys = options.filter((option) => option.advances === track.id).map((option) => option.key);
  const taken = keys.reduce((sum, key) => sum + usedSlotsForOption(used, key), 0);
  const index = Math.min(taken, steps.length - 1);
  const levels = [];
  for (const entry of ch?.levelUps || []) {
    for (const pick of entry.picks || []) if (keys.includes(pick.key)) levels.push(entry.level);
  }
  levels.sort((a, b) => a - b);
  const parts = [{ label: "Where it starts", value: steps[0] }];
  // Unattributed marks lead, the way advancementParts does it: a character baselined above level 1
  // carries steps from levels nobody wrote down, and inventing a level for them would be a lie.
  const unattributed = Math.max(0, taken - levels.length);
  for (let i = 0; i < unattributed && i + 1 < steps.length; i++) {
    parts.push({ label: "An earlier advancement", value: steps[Math.min(i + 1, steps.length - 1)] });
  }
  levels.forEach((at, i) => {
    const rung = Math.min(unattributed + i + 1, steps.length - 1);
    parts.push({ label: `Level ${at} advancement`, value: steps[rung] });
  });
  return {
    ...base,
    form: "steps",
    value: steps[index],
    next: index + 1 < steps.length ? steps[index + 1] : null,
    parts,
    // Taken more times than the source wrote rungs for. Nothing is invented; the last rung stands.
    capped: taken > index,
  };
}

// ---------- the full picture ----------

/**
 * @param {object} ch a character (already through ensureLevelFields)
 * @param {object} db whatever data the calling page loaded; stats whose data is missing come
 *   back as null rather than throwing, because the level up screen only loads classes,
 *   subclasses and domain cards.
 */
export function derivedStats(ch, db) {
  const cls = find(db?.classes, ch.classId);
  const sub = find(db?.subclasses, ch.subclassId);
  const armor = equippedArmor(ch, db);
  const unarmed = ch.equipment?.primaryWeaponId === UNARMED;
  const primaryWeapon = unarmed ? null : find(db?.weapons, ch.equipment?.primaryWeaponId);
  // Whether a secondary counts is whether one is equipped. This used to be gated on a stored
  // "weaponMode" string, which stopped being the truth the moment a Warrior — who ignores
  // burden — could carry a shield behind a two-handed primary: their secondary attack came
  // back null and their Tower Shield's +2 Armor Score quietly went missing.
  const secondaryWeapon = find(db?.weapons, ch.equipment?.secondaryWeaponId);

  const { contributions, exclusions, experienceParts, ctx } = gather(ch, db);
  // Resolved once here rather than in each of the three files that print a bare-handed
  // character's weapon row, so the sheet, the roster and the CSV can't disagree about which
  // profile is in play.
  const barehandedProfile = unarmed ? unarmedProfileFrom(contributions) : null;
  const className = cls ? titleCase(cls.name) : "Class";
  const credits = advancementCredits(ch);

  const traits = effectiveTraits(ch, contributions, ctx, credits.traits);
  ctx.traits = {};
  for (const key of TRAIT_KEYS) ctx.traits[key] = traits[key].total ?? 0;

  // Worked out once and handed to both the Spellcast box and the two attacks, because a weapon
  // whose trait is the SPELLCAST sentinel has to answer the same question the box does.
  //
  // Deliberately not ctx.spellcastTrait: that's spellcastKeyFor()'s answer, the HIGHER of two
  // when a multiclass brought a second. That's right for a bonus that scales off a trait — one
  // number, so pick the best — and wrong here, where the two are a per-roll choice the player
  // owns and the sheet's job is to offer both.
  const spellcastKeys = spellcastTraitKeys(ch, db);

  return {
    traits,
    exclusions,
    experiences: experienceStats(ch, experienceParts, credits.experiences),
    // Evasion has no cap in the rules, unlike Hit Points, Stress and Armor Score.
    evasion: cls ? stat([
      { label: `${className} (class)`, value: cls.startingEvasion },
      ...advancementParts(ch.evasionBonus, credits.evasion),
      ...partsFor(contributions, "evasion", ctx),
    ]) : null,
    hitPoints: cls ? capped(stat([
      { label: `${className} (class)`, value: cls.startingHitPoints },
      ...advancementParts(ch.hitPointSlotsBonus, credits.hitPoint),
      ...partsFor(contributions, "hitPointSlots", ctx),
    ]), MAX_HIT_POINT_SLOTS, "Hit Point slots") : null,
    stress: capped(stat([
      { label: "Base", value: BASE_STRESS_SLOTS },
      ...advancementParts(ch.stressSlotsBonus, credits.stress),
      ...partsFor(contributions, "stressSlots", ctx),
    ]), MAX_STRESS_SLOTS, "Stress slots"),
    proficiency: stat(advancementParts(ch.proficiency, credits.proficiency, "Base")),
    armorScore: armorScoreStat(armor, db, contributions, ctx),
    ...thresholdStats(ch, armor, contributions, ctx),
    // What a bare-handed character is actually swinging, for the pages that print a weapon row.
    // null when they're carrying something, which is also how a caller tells the two apart.
    unarmedProfile: barehandedProfile,
    primaryAttack: unarmed
      ? unarmedAttackStat(barehandedProfile, traits, contributions, ctx)
      : attackStat(primaryWeapon, traits, contributions, ctx, "primary", spellcastKeys),
    secondaryAttack: attackStat(secondaryWeapon, traits, contributions, ctx, "secondary", spellcastKeys),
    spellcast: spellcastStat(spellcastKeys, traits, contributions, ctx),
    // A second pass over the effects, and an empty array for almost every character — worth it
    // because a die a class rolls is a value the sheet had no way to state at all before.
    tracks: characterTracks(ch, db),
  };
}

/**
 * One part per level that raised this stat — "Level 3 advancement +1" — instead of a career's
 * worth of picks under a single "Level up advancements". Levels come from advancementCredits(),
 * which reads the same recorded entries the replay does.
 *
 * `rest` is whatever the recorded levels don't account for, and it always leads: for most stats
 * that's the bonus a character baselined above level 1 arrived with, and for Proficiency and
 * traits it's the starting value. Reporting it rather than dropping it is what keeps the parts
 * adding up to the number on the tile even if the two ever disagree. A zero contributes nothing
 * — "Advancements +0" is noise in a breakdown.
 */
function advancementParts(bonus, credits, restLabel = "Level up advancements") {
  const attributed = (credits || []).filter((c) => c.value);
  const rest = bonus - attributed.reduce((sum, c) => sum + c.value, 0);
  const parts = rest ? [{ label: restLabel, value: rest }] : [];
  for (const c of attributed) parts.push({ label: `Level ${c.level} ${c.source}`, value: c.value });
  return parts;
}

// Base assignment plus advancement picks, plus whatever equipment and cards modify. Armor and
// weapons are the usual source (Full Plate's -1 Agility, a Halberd's -1 Finesse).
function effectiveTraits(ch, contributions, ctx, traitCredits) {
  const out = {};
  for (const key of TRAIT_KEYS) {
    const base = ch.traits?.[key];
    if (base === null || base === undefined) {
      out[key] = { total: null, parts: [] };
      continue;
    }
    const parts = advancementParts(base, traitCredits?.[key], "Assigned at creation");
    // A trait can legitimately be 0, and advancementParts drops a part worth nothing — but a
    // tile with no parts at all loses its "?", so the creation part stays either way.
    if (!parts.length) parts.push({ label: "Assigned at creation", value: base });
    for (const entry of contributions) {
      const traitMods = effectValue(entry.effect.traits, ctx);
      const value = traitMods?.[key];
      if (value) parts.push({ label: entry.label, value });
    }
    out[key] = stat(parts);
  }
  return out;
}

// Experiences get their modifier from the level up replay; a couple of features add a permanent
// bonus on top of that, so the sheet shows the sum and the breakdown says where it came from.
//
// One part per source, never a subtotal. `exp.modifier` is already the base plus every
// advancement that raised it, so reporting it as a part of its own labelled "Experience"
// explained +4 as "Experience +3, Permanent bonus +1" — where the +3 was the very thing being
// asked about. It also left an Experience raised only by an advancement with a single part,
// which is one too few for statLine to offer the "?" at all, so nothing on the sheet explained
// why it wasn't +2.
function experienceStats(ch, experienceParts, credits) {
  return (ch.experiences || []).map((exp) => {
    const base = exp.baseModifier ?? 2;
    const total = exp.modifier ?? base;
    const parts = [
      { label: "Base", value: base },
      ...advancementParts(total - base, credits?.[exp.id]),
      ...(experienceParts[exp.id] || []),
    ];
    return { id: exp.id, name: exp.name, ...stat(parts) };
  });
}

function armorScoreStat(armor, db, contributions, ctx) {
  if (!db?.armors) return null;
  // Armor sets the base; without it something may stand in for one (Bare Bones), and failing
  // that the SRD's plain answer is 0.
  const override = armor ? undefined : baseOverride(contributions, "armorScore", ctx);
  const parts = armor
    ? [{ label: armor.name["en-US"], value: armor.baseScore }]
    : [override || { label: "No armor", value: 0 }];
  parts.push(...partsFor(contributions, "armorScore", ctx));
  return capped(stat(parts), MAX_ARMOR_SCORE, "Armor Score");
}

function thresholdStats(ch, armor, contributions, ctx) {
  if (!ch.equipment) return { majorThreshold: null, severeThreshold: null };
  const majorParts = partsFor(contributions, "majorThreshold", ctx);
  const severeParts = partsFor(contributions, "severeThreshold", ctx);
  if (armor) {
    // "always add your current level" — the same rule damageThresholds() states, spelled out
    // as parts here so the breakdown can show the level separately from the armor.
    const th = damageThresholds(armor.baseMajorThreshold, armor.baseSevereThreshold, ch.level);
    return {
      majorThreshold: stat([
        { label: armor.name["en-US"], value: armor.baseMajorThreshold },
        { label: "Your level", value: th.major - armor.baseMajorThreshold },
        ...majorParts,
      ]),
      severeThreshold: stat([
        { label: armor.name["en-US"], value: armor.baseSevereThreshold },
        { label: "Your level", value: th.severe - armor.baseSevereThreshold },
        ...severeParts,
      ]),
    };
  }
  // Something may stand in for the armor you aren't wearing (Bare Bones), and its numbers are
  // bases in the same sense armor's are: your level is added on top either way.
  const majorBase = baseOverride(contributions, "majorThreshold", ctx);
  const severeBase = baseOverride(contributions, "severeThreshold", ctx);
  if (majorBase && severeBase) {
    return {
      majorThreshold: stat([majorBase, { label: "Your level", value: ch.level }, ...majorParts]),
      severeThreshold: stat([severeBase, { label: "Your level", value: ch.level }, ...severeParts]),
    };
  }
  // SRD: unarmored, Major equals your level and Severe twice your level.
  return {
    majorThreshold: stat([{ label: "No armor — your level", value: ch.level }, ...majorParts]),
    severeThreshold: stat([{ label: "No armor — twice your level", value: ch.level * 2 }, ...severeParts]),
  };
}

// The one spelling of an attack that has alternatives instead of a total: "(+3) Knowledge /
// (+2) Instinct". Two callers now — a bare-handed profile naming several traits, and a weapon
// whose trait is the SPELLCAST sentinel in the hands of a multiclass whose two foundations
// disagree — and a format written out twice is a format the two will eventually spell
// differently.
//
// Bonus first, trait second — "(+4) Agility", not "Agility +4". The number is a TOTAL that
// already has the trait inside it, and the trait-first order reads as an instruction to add the
// two: take your Agility, add 4. Leading with the bonus says what it is instead — a +4 attack
// you roll with Agility — which is the order the printed card puts a weapon's single trait in
// too.
//
// The brackets are what separate one alternative from the next, and they earn their place a
// second time in the CSV: a cell opening with "+" is a formula to a spreadsheet, so the bare
// form tripped csvField()'s guard and exported with a leading apostrophe. "(" does not. A
// weapon's single bonus stays unbracketed for the mirror-image reason — a cell holding only
// "(+4)" is accounting notation for -4.
//
// Not the shape spellcastStat uses, deliberately: there the number IS a bonus to add to the
// trait, so "Knowledge +1" reads exactly as it should.
function alternativesDisplay(options) {
  return options.map((o) => `(${signed(o.total)}) ${o.label}`).join(" / ");
}

// An attack roll uses the trait the weapon specifies (SRD). Proficiency is not part of it —
// that scales damage dice, not the roll to hit.
//
// `spellcastKeys` is every trait this character can cast with, and it's consulted only for a
// weapon whose `trait` is the SPELLCAST sentinel — the arcane-frame wheelchairs, which name no
// trait of their own because the trait is whichever one their wielder casts with. The full list
// rather than ctx.spellcastTrait, for the reason derivedStats() gives where it resolves them.
function attackStat(weapon, traits, contributions, ctx, scope, spellcastKeys = []) {
  if (!weapon) return null;
  const spellcast = weapon.trait === SPELLCAST_TRAIT;
  const keys = spellcast ? spellcastKeys : [String(weapon.trait || "").toLowerCase()];
  // No keys means either a trait not yet assigned on a draft, or — for a SPELLCAST weapon — a
  // Warrior or Guardian, who has no Spellcast trait to roll. Either way there's no number to
  // show, so the attack prints "—" and magicWeaponWarning() is what says why. Warned, never
  // prevented: it's the GM's call whether they can wield it at all.
  if (!keys.length || keys.some((key) => !traits[key] || traits[key].total === null)) return null;
  const name = weapon.name["en-US"];
  const bonusParts = partsFor(contributions, "attack", ctx, scope);
  // A named trait needs no explaining — it's printed on the weapon. A resolved one does: without
  // this the popover shows "Knowledge (Arcane-Frame Wheelchair)" on a weapon whose card says
  // "Spellcast", and a player has no way to tell where the Knowledge came from.
  const partLabel = (key) =>
    `${spellcast ? "Spellcast trait: " : ""}${TRAIT_LABELS[key]} (${name})`;
  if (keys.length === 1) {
    return {
      weaponName: name,
      traitKey: keys[0],
      ...stat([
        { label: partLabel(keys[0]), value: traits[keys[0]].total },
        ...bonusParts,
      ]),
    };
  }
  // Two Spellcast traits: the SRD makes that a choice per Spellcast roll rather than a thing to
  // store, so this reports both instead of quietly picking the higher — the same shape a
  // bare-handed profile takes, and for the same reason.
  const bonus = bonusParts.reduce((sum, p) => sum + p.value, 0);
  const options = keys.map((key) => ({
    key, label: TRAIT_LABELS[key], total: traits[key].total + bonus,
  }));
  return {
    weaponName: name,
    display: alternativesDisplay(options),
    // No total, and that absence IS the state a caller branches on — these are alternatives, not
    // parts of a sum. The weapon's own attack bonus (Reliable's +1, effects.js:227) is inside
    // each alternative's total, exactly as it is for the unarmed profile: it applies whichever
    // trait you end up rolling.
    parts: [
      ...options.map((o) => ({ label: partLabel(o.key), value: traits[o.key].total })),
      ...bonusParts,
    ],
    note: `${name} rolls your Spellcast trait, and your two foundations name different ones — ` +
      `choose which to use each time you attack.`,
  };
}

// A bare-handed profile names more than one trait, and which one applies isn't the sheet's to
// decide — the SRD's is the GM's call per roll, and a profile a class hands you may be the
// player's. So this reports every trait the profile names rather than quietly picking the best,
// the same shape the Spellcast box uses for a stat that isn't a single number.
//
// However many there are: the SRD's names two, and a profile reading "a trait of your choice"
// names all six.
function unarmedAttackStat(profile, traits, contributions, ctx) {
  const bonusParts = partsFor(contributions, "attack", ctx, "primary");
  const bonus = bonusParts.reduce((sum, p) => sum + p.value, 0);
  const name = profile.name?.["en-US"] || "Unarmed";
  const keys = (profile.traits || []).map((t) => String(t).toLowerCase()).filter((k) => TRAIT_LABELS[k]);
  // Same rule as a weapon's attack: until the traits are assigned there's no number to show.
  if (!keys.length || keys.some((key) => !traits[key] || traits[key].total === null)) return null;
  const options = keys.map((key) => ({
    key, label: TRAIT_LABELS[key], total: traits[key].total + bonus,
  }));
  return {
    weaponName: name,
    // Still here, and now meaning only what it says: this is a bare-handed profile. It stopped
    // being how a caller spots the no-total shape the moment a weapon could take that shape too.
    unarmed: true,
    display: alternativesDisplay(options),
    // No total: these aren't parts of a sum, they're alternatives, and the popover skips the
    // Total row for a stat that doesn't have one.
    parts: [
      ...options.map((o) => ({ label: `${o.label} (${name.toLowerCase()})`, value: traits[o.key].total })),
      ...bonusParts,
    ],
    // The profile says what its own choice means, because only it knows. Falling back to naming
    // the traits beats saying nothing when a source leaves it out.
    note: profile.note || `${name} attack rolls use ${options.map((o) => o.label).join(", ")}.`,
  };
}

// The one a scaled bonus resolves against: the higher, when a multiclass brought a second.
function spellcastKeyFor(ch, db, traitTotals) {
  const keys = spellcastTraitKeys(ch, db);
  if (keys.length === 0) return null;
  return keys.reduce((best, key) => ((traitTotals[key] ?? 0) > (traitTotals[best] ?? 0) ? key : best));
}

// Deliberately NOT a number: the modifier is already on show in the trait box, so this answers
// "which trait do I roll?". A bonus that applies to Spellcast Rolls specifically is appended
// rather than folded into the trait, because a plain roll of that trait doesn't get it.
//
// Two traits are alternatives rather than a sum, so it takes the shape an unarmed attack already
// has: both named, a part each, no total for the popover to print.
function spellcastStat(keys, traits, contributions, ctx) {
  if (!keys.length) return null; // Guardian and Warrior have no Spellcast trait
  const bonusParts = partsFor(contributions, "spellcast", ctx);
  const bonus = bonusParts.reduce((sum, p) => sum + p.value, 0);
  const named = (key) => (bonus ? `${TRAIT_LABELS[key]} ${signed(bonus)}` : TRAIT_LABELS[key]);
  const displays = keys.map(named);
  const bonusNote = "This bonus applies to Spellcast Rolls only — a plain roll of that trait doesn't get it.";
  return {
    traitKey: keys[0],
    traitLabel: keys.length === 1 ? TRAIT_LABELS[keys[0]] : undefined,
    bonus,
    // One entry per trait, and `display` is those entries joined. The CSV export wants the same
    // names under a different separator; splitting the joined string back apart would turn " / "
    // into a format two files have to agree on rather than a choice this one makes.
    displays,
    display: displays.join(" / "),
    parts: [
      ...keys.map((key) => ({ label: `Spellcast trait: ${TRAIT_LABELS[key]}`, value: traits[key]?.total ?? 0 })),
      ...bonusParts,
    ],
    note: keys.length > 1
      ? `Your foundation cards name different Spellcast traits: choose which to use on each roll.${bonus ? ` ${bonusNote}` : ""}`
      : (bonus ? bonusNote : undefined),
  };
}

