// A class's character guide, read off the class record and made ready to show.
//
// Page 2 of every official class sheet prints a suggestion the SRD document doesn't: traits, a
// loadout, a spell carrier, five lists of words for describing the character. The data keeps them
// under `characterGuide` on the class (docs/adding-content.md), in the shape that's easiest to
// check against the page — trait keys in the enum's upper case, gear by NAME, a Blood Hunter's
// per-subclass suggestions as `variants`. Every surface wants the same three things done to that
// before it can use it: the variant picked, the names turned into records, and the records written
// out the way the guides print them. They're done here, once, so the wizard and the sheet can't
// disagree about what the Bard is being told to carry.
//
// Deliberately free of DOM, like gear.js, so all of it is reachable from tests/.

import { visibleRecords } from "./content-sources.js";
import { TRAIT_KEYS, effectFor } from "./effects.js";
import { burdenLabel, damageText, enumLabel, featuresText, weaponTraitText } from "./gear.js";
import { titleCase } from "./text.js";

// The five lead-ins are the same on all fifteen guides, so the data stores only the lists and the
// words in front of them live here, as the app's own strings. Keyed as characterDescription is.
export const LEAD_INS = {
  clothes: "Clothes that are",
  eyes: "Eyes like",
  body: "Body that’s",
  skin: "Skin the color of",
  attitude: "Attitude like",
};

const DESCRIPTION_KEYS = Object.keys(LEAD_INS);

const en = (value) => (typeof value === "string" ? value : value?.["en-US"] ?? "");

// The guides print `Brawler’s Strike`, and effects.js spells the profile `Brawler's Strike`. Both
// are right in their own file, so names meet halfway: apostrophes folded, and case too, the way
// mergeSources() already treats two records of one name as the same record.
const fold = (name) => String(name ?? "").replace(/[‘’ʼ]/g, "'").trim().toLowerCase();

// ---------- the guide ----------

// The record's shape into the one every caller reads: lowercase trait keys (what the trait
// arithmetic is keyed on), plain strings where the data holds {"en-US": …}. A field the guide
// doesn't print is left off, not set to undefined, so `"secondary" in guide` means what it says.
function shape(raw, cls) {
  const guide = {};
  if (raw.suggestedTraits) {
    guide.traits = Object.fromEntries(TRAIT_KEYS
      .filter((key) => Number.isInteger(raw.suggestedTraits[key.toUpperCase()]))
      .map((key) => [key, raw.suggestedTraits[key.toUpperCase()]]));
  }
  if (raw.suggestedPrimaryWeapon) guide.primary = raw.suggestedPrimaryWeapon;
  // A hint and nothing more: the Brawler's guide says Instinct, the rule says "a trait of your
  // choice", and the rule wins everywhere but the one note the wizard shows beside its button.
  if (raw.suggestedPrimaryWeaponTrait) guide.primaryTrait = String(raw.suggestedPrimaryWeaponTrait).toLowerCase();
  if (raw.suggestedSecondaryWeapon) guide.secondary = raw.suggestedSecondaryWeapon;
  if (raw.suggestedArmor) guide.armor = raw.suggestedArmor;
  if (raw.spellCarrier) {
    guide.spellCarrier = { prompt: en(raw.spellCarrier.prompt), examples: en(raw.spellCarrier.examples) };
  }
  if (raw.characterDescription) {
    guide.description = Object.fromEntries(DESCRIPTION_KEYS.map((key) =>
      [key, (raw.characterDescription[key] || []).map(en).filter(Boolean)]));
  }
  // Not from the guide at all — the AND EITHER pair is the class's own `classItems` — but it's
  // printed in the same column and the sheet fills it from the same object.
  guide.classItems = (cls.classItems || []).map(en).filter(Boolean);
  return guide;
}

/**
 * @param {object} cls a class record as loaded (its name the bare uppercase string)
 * @param {string|null} subclassName the character's subclass, by its en-US name
 * @returns {null|object} the suggestion with its variant applied; see the module comment
 */
export function guideFor(cls, subclassName) {
  const raw = cls?.characterGuide;
  if (!raw || typeof raw !== "object") return null;
  const { variants, ...top } = raw;
  if (!Array.isArray(variants) || !variants.length) return shape(top, cls);

  // A variant is the top level overlaid by what that variant says, never a partial record: the
  // data promises a variant's suggestedTraits is all six, so the overlay can be a plain spread.
  const overlay = ({ label, subclasses, ...fields }) => ({ ...top, ...fields });
  const wanted = subclassName ? fold(subclassName) : null;
  const match = wanted && variants.find((v) => (v.subclasses || []).some((s) => fold(s) === wanted));
  if (match) return { label: match.label, ...shape(overlay(match), cls) };

  // No subclass yet, or one no variant names (a homebrew order): every variant, labelled, and the
  // top level without whatever any variant would have replaced — a Blood Hunter has no one set of
  // traits, and showing either as though it were THE suggestion would be half wrong.
  const varied = new Set(variants.flatMap((v) => Object.keys(v)));
  const shared = Object.fromEntries(Object.entries(top).filter(([key]) => !varied.has(key)));
  return {
    ...shape(shared, cls),
    variants: variants.map((v) => ({
      label: v.label,
      subclasses: [...(v.subclasses || [])],
      ...shape(overlay(v), cls),
    })),
  };
}

// ---------- the gear it names ----------

// The unarmed profiles this class's OWN features put in its hands, found the way collectEffects()
// finds them — `<classId>:<Feature Name>` for every class feature and the Hope feature — so no
// card name appears here. effectFor() peels the edition prefix off the id, which is what lets
// `srd_2_0_class_brawler` reach the catalogue's `class_brawler` entry.
function grantedProfiles(cls, db) {
  if (!cls?.id) return [];
  return [...(cls.classFeatures || []), cls.hopeFeature]
    .map((feature) => en(feature?.name))
    .filter(Boolean)
    .map((name) => effectFor(db, `${cls.id}:${name}`)?.unarmedProfile)
    .filter(Boolean);
}

/**
 * @param {string} name the guide's gear name, as stored
 * @param {'weapon'|'armor'} kind
 * @param {object} ctx { weapons, armors, disabled, cls }, plus `effects` and `sourceNames` (db's
 *   own) when a content source's effects.json should be consulted too. Without them the built-in
 *   catalogue answers, which is where every profile the SRD grants lives.
 * @returns {{record}|{unarmed, name}|{missing}}
 */
export function resolveGear(name, kind, ctx = {}) {
  const wanted = fold(name);
  if (!wanted) return { missing: name ?? "" };

  // Only what a picker would offer. With both SRD editions on, 14 of the 21 names the guides use
  // are printed by both; visibleRecords() already hides the one the later edition superseded, so
  // the later edition wins — and with that edition switched off, the earlier one comes back.
  const list = kind === "armor" ? ctx.armors : ctx.weapons;
  const record = visibleRecords(list, ctx.disabled).find((r) => fold(en(r?.name)) === wanted);
  if (record) return { record };

  if (kind === "weapon") {
    const db = { effects: ctx.effects, sourceNames: ctx.sourceNames };
    const profile = grantedProfiles(ctx.cls, db).find((p) => fold(en(p.name)) === wanted);
    // `name` rides along because the guide's spelling is the one the class's own feature text
    // uses (`Brawler’s Strike`); gearText() prints it rather than the catalogue's.
    if (profile) return { unarmed: profile, name };
  }
  return { missing: name };
}

// ---------- as the guides print it ----------

// `0 Agility, −1 Strength, +1 Finesse, …`: a real minus sign (U+2212), no sign on zero, in the
// order the sheet lists traits. The sheet's own boxes write a hyphen-minus, but this line is
// the guide's text, and the guide sets a minus.
export function traitsLine(traits) {
  if (!traits) return "";
  const signed = (n) => (n > 0 ? `+${n}` : n < 0 ? `−${-n}` : "0");
  return TRAIT_KEYS
    .filter((key) => Number.isInteger(traits[key]))
    .map((key) => `${signed(traits[key])} ${titleCase(key)}`)
    .join(", ");
}

// A profile naming all six traits is "a trait of your choice", and the guide line leaves the trait
// out: the note says it, in the rule's own words. A profile naming fewer prints them, the way a
// weapon prints its one.
const anyTrait = (profile) => (profile.traits || []).length >= TRAIT_KEYS.length;

/**
 * @param {object} resolved what resolveGear() returned
 * @returns {{line: string, feature: string}}
 */
export function gearText(resolved) {
  if (!resolved) return { line: "", feature: "" };
  if ("missing" in resolved) return { line: String(resolved.missing ?? ""), feature: "" };

  // gear.js's formatters, joined the guide's way. Two differ from the wizard's reading of the same
  // record, deliberately: " - " between the parts where weaponStats() uses " · " and pairs the
  // trait with the range ("Presence Melee"), and burdens capitalised on both sides of the hyphen
  // ("One-Handed") where burdenLabel() writes "One-handed". The guides print both that way, and
  // tools/classguide/check.py compares against exactly this form.
  if (resolved.unarmed) {
    const profile = resolved.unarmed;
    const traitAndRange = [anyTrait(profile) ? "" : weaponTraitText(profile), enumLabel(profile.range)]
      .filter(Boolean).join(" ");
    return {
      line: [resolved.name || en(profile.name), traitAndRange, damageText(profile)].filter(Boolean).join(" - "),
      // Never the guide's Instinct: this is the rule, and the rule says the choice is yours.
      feature: profile.note || "",
    };
  }

  const record = resolved.record;
  if (!record) return { line: "", feature: "" };
  const name = en(record.name);
  const feature = featuresText(record.features);
  if (record.damage) {
    const traitAndRange = [weaponTraitText(record), enumLabel(record.range)].filter(Boolean).join(" ");
    return {
      line: [name, traitAndRange, damageText(record), titleCase(burdenLabel(record))].filter(Boolean).join(" - "),
      feature,
    };
  }
  // Armor. armorStats() says "thresholds 5/11 · score 3", which is the wizard's lower-case prose;
  // the guide capitalises both and uses the same " - " as the weapon line.
  const parts = [name];
  if (record.baseMajorThreshold != null && record.baseSevereThreshold != null) {
    parts.push(`Thresholds ${record.baseMajorThreshold}/${record.baseSevereThreshold}`);
  }
  if (record.baseScore != null) parts.push(`Score ${record.baseScore}`);
  return { line: parts.join(" - "), feature };
}
