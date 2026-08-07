// The CSV the GM gets.
//
// Two jobs: summarising a party for the GM, and feeding whatever prints a character sheet — a
// mail merge, a spreadsheet, a script nobody here has seen. So it's written for a stranger.
// Headers say what a player would call the thing, values are plain text a person could check by
// eye, and nothing is shaped around one particular consumer.
//
// WHY SOME COLUMNS LOOK REDUNDANT
// -------------------------------
// Nothing downstream can read data/. A tool holding this file knows a character's class but
// can't look up which domains that class has, so Domains is a column even though it follows
// from the class — and the same goes for every piece of feature prose.
//
// The rule: reproducing a value needs the game data → it's a column. Formatting a value that's
// already here — drawing checkboxes from a number, composing a heading, deciding what to put in
// bold — is the consumer's business, not ours.
//
// This module is deliberately free of DOM: characters.js owns the button, the picker and the
// download, so everything here is reachable from tests/.

import {
  MAX_HOPE,
  STARTING_HOPE,
  SUBCLASS_TIER_LABELS,
  activeDomainCardIds,
  subclassTiersUpTo,
} from "./advancement.js";
import { TRAIT_KEYS, TRAIT_LABELS, UNARMED_PROFILE, derivedStats } from "./derived-stats.js";
import {
  UNARMED,
  UNARMORED,
  damageText,
  enumLabel,
  featureNamesText,
  featuresText,
} from "./gear.js";

const signed = (n) => (n > 0 ? `+${n}` : String(n));

function find(list, id) {
  return id ? (list || []).find((x) => x.id === id) || null : null;
}

function name(record) {
  return record?.name?.["en-US"] || "";
}

function titleCase(str) {
  return str ? str.charAt(0) + str.slice(1).toLowerCase() : "";
}

function names(records) {
  return records.map(name).filter(Boolean);
}

// ---------- the row's subject ----------

/**
 * Everything the column functions read, looked up once. Fifty-odd values off one character
 * would otherwise re-find the same class fifty-odd times.
 */
function rowContext(ch, db, loadout) {
  const unarmored = ch.equipment?.armorId === UNARMORED;
  const unarmed = ch.equipment?.primaryWeaponId === UNARMED;
  const sub = find(db?.subclasses, ch.subclassId);
  return {
    ch,
    db,
    loadout,
    stats: derivedStats(ch, db),
    cls: find(db?.classes, ch.classId),
    sub,
    com: find(db?.communities, ch.heritage?.communityId),
    ancestries: (ch.heritage?.ancestryIds || []).map((id) => find(db?.ancestries, id)).filter(Boolean),
    // The features the player picked, not every feature the ancestries have: a mixed-ancestry
    // character takes one from each, and it isn't always the first.
    heritageFeatures: (ch.heritage?.chosenFeatures || []).map((chosen) => {
      const ancestry = find(db?.ancestries, chosen.ancestryId);
      return (ancestry?.features || []).find((f) => f.name?.["en-US"] === chosen.featureName);
    }).filter(Boolean),
    // A tier the character hasn't reached exports blank. Upgrading a subclass adds a card
    // rather than replacing the one below it, so the tiers below always count.
    tierFeatures: Object.fromEntries(
      subclassTiersUpTo(ch.subclassTier).map((tier) => [tier, sub?.[tier]?.features || []]),
    ),
    unarmored,
    armor: unarmored ? null : find(db?.armors, ch.equipment?.armorId),
    // An unarmed character has a weapon profile, just not one from data/ — the SRD gives bare
    // hands a range and a damage rating like anything else.
    primary: unarmed ? UNARMED_PROFILE : find(db?.weapons, ch.equipment?.primaryWeaponId),
    secondary: find(db?.weapons, ch.equipment?.secondaryWeaponId),
    potion: find(db?.consumables, ch.equipment?.potionChoice),
  };
}

function trait(r, key) {
  const t = r.stats.traits[key];
  return t?.total ?? "";
}

function total(stat) {
  return stat ? stat.total : "";
}

function weaponColumns(slot, headerPrefix) {
  return [
    { header: `${headerPrefix} weapon name`, value: (r) => name(r[slot]) },
    { header: `${headerPrefix} range`, value: (r) => enumLabel(r[slot]?.range) },
    { header: `${headerPrefix} damage`, value: (r) => damageText(r[slot]) },
    { header: `${headerPrefix} feature`, value: (r) => featuresText(r[slot]?.features) },
  ];
}

// A name/text pair, the shape every feature on the sheet takes. The text repeats each feature's
// own name in front of it rather than relying on the name column, because a slot can hold two —
// a mixed heritage, or a tier like Beastbound's Specialization — and they would otherwise run
// together with no way to tell which paragraph belongs to which.
function featurePair(headerPrefix, features) {
  return [
    { header: `${headerPrefix} feature name`, value: (r) => featureNamesText(features(r)) },
    { header: `${headerPrefix} feature text`, value: (r) => featuresText(features(r)) },
  ];
}

// ---------- the columns ----------

export const CSV_COLUMNS = [
  { header: "Name", value: (r) => r.ch.name },
  { header: "Pronouns", value: (r) => r.ch.pronouns },
  { header: "Level", value: (r) => r.ch.level },
  { header: "Proficiency", value: (r) => r.ch.proficiency },

  { header: "Class", value: (r) => titleCase(r.cls?.name) },
  // Derivable from the class, and exported anyway: nothing downstream can read classes.json.
  { header: "Domains", value: (r) => (r.cls?.domains || []).map(enumLabel).join(", ") },
  ...featurePair("Class", (r) => r.cls?.classFeatures),
  // hopeFeature is a bare feature rather than an array, so it's wrapped to match.
  ...featurePair("Class Hope", (r) => (r.cls?.hopeFeature ? [r.cls.hopeFeature] : [])),

  { header: "Subclass", value: (r) => name(r.sub) },
  { header: "Subclass tier", value: (r) => SUBCLASS_TIER_LABELS[r.ch.subclassTier] ?? r.ch.subclassTier },
  ...featurePair("Foundation", (r) => r.tierFeatures.foundation),
  ...featurePair("Specialization", (r) => r.tierFeatures.specialization),
  ...featurePair("Mastery", (r) => r.tierFeatures.mastery),

  { header: "Heritage", value: (r) => names(r.ancestries).join(" + ") },
  ...featurePair("Heritage", (r) => r.heritageFeatures),
  { header: "Community", value: (r) => name(r.com) },
  ...featurePair("Community", (r) => r.com?.features),

  // Effective traits, matching the sheet: the GM wants the number the player rolls with, which
  // includes their armor's -1 Agility.
  ...TRAIT_KEYS.map((key) => ({ header: TRAIT_LABELS[key], value: (r) => trait(r, key) })),

  { header: "Evasion", value: (r) => total(r.stats.evasion) },
  { header: "Hit Points", value: (r) => total(r.stats.hitPoints) },
  { header: "Stress", value: (r) => r.stats.stress.total },
  // Hope is the same for everyone and nothing changes it, but it's still two numbers rather than
  // one: how much you start with, and how much you can hold. Exported as a pair instead of the
  // string "2/6" so neither has to be parsed back out.
  { header: "Hope", value: () => STARTING_HOPE },
  { header: "Hope Max", value: () => MAX_HOPE },
  { header: "Major Threshold", value: (r) => total(r.stats.majorThreshold) },
  { header: "Severe Threshold", value: (r) => total(r.stats.severeThreshold) },
  { header: "Armor Score", value: (r) => total(r.stats.armorScore) },

  // An unarmed attack offers two traits rather than one, so it carries a display string instead
  // of a total — the GM's choice per roll, which is the SRD's rule, not a number we can pick.
  {
    header: "Primary Attack",
   
    value: (r) => (r.stats.primaryAttack ? (r.stats.primaryAttack.display ?? signed(r.stats.primaryAttack.total)) : ""),
  },
  {
    header: "Secondary Attack",
   
    value: (r) => (r.stats.secondaryAttack ? signed(r.stats.secondaryAttack.total) : ""),
  },
  { header: "Spellcast Trait", value: (r) => r.stats.spellcast?.display ?? "" },

  ...weaponColumns("primary", "Primary"),
  ...weaponColumns("secondary", "Secondary"),

  // Choosing to wear nothing is a choice, not a blank — the sheet says so rather than leaving
  // the reader to wonder whether the player forgot.
  { header: "Armor name", value: (r) => (r.unarmored ? "Unarmored" : name(r.armor)) },
  { header: "Armor feature", value: (r) => featuresText(r.armor?.features) },
  { header: "Potion", value: (r) => name(r.potion) },

  {
    header: "Experiences",
   
    value: (r) => r.stats.experiences.map((e) => `${e.name || "(unnamed)"} (+${e.total})`).join("; "),
  },

  {
    header: "Domain Cards (loadout)",
   
    value: (r) => cardNames(activeDomainCardIds(r.ch), r.db),
  },
  {
    header: "Domain Cards (vault)",
   
    value: (r) => cardNames(r.ch.domainVaultIds, r.db),
  },
  // Which of the two exports this is. Without it, two printouts of the same character disagree
  // about her Evasion and nothing on either says why.
  {
    header: "Includes loadout bonuses",
   
    value: (r) => String(r.loadout),
  },

  { header: "Background", value: (r) => r.ch.background?.description },
  { header: "Appearance", value: (r) => r.ch.background?.answers },
  { header: "Connections", value: (r) => r.ch.connectionsNotes },
];

function cardNames(ids, db) {
  return (ids || []).map((id) => name(find(db?.domainCards, id))).filter(Boolean).join("; ");
}

// ---------- escaping ----------

// Standard CSV (RFC 4180): wrap every field in double quotes, doubling any
// double quotes it contains, to safely handle commas, quotes and newlines.
//
// Quoting alone does NOT stop formula injection: Excel, LibreOffice and Google
// Sheets evaluate a field as a formula when its text starts with = + - @ (or a
// leading tab/CR), even inside quotes. This export is explicitly meant to be
// handed to the GM, so a character named `=HYPERLINK("http://evil","click")` —
// or a background note starting with `=` — would run on someone else's machine.
// Prefixing with a single quote makes the spreadsheet treat it as literal text.
// Plain numbers are exempt: trait values are legitimately negative ("-1"), and a
// spreadsheet evaluating "-1" just yields the number -1. Prefixing those would
// turn every negative trait into text and break sorting/formulas for the GM.
const FORMULA_TRIGGER = /^[=+\-@\t\r]/;
const PLAIN_NUMBER = /^[+-]?\d+(\.\d+)?$/;

export function csvField(value) {
  let s = String(value ?? "");
  if (FORMULA_TRIGGER.test(s) && !PLAIN_NUMBER.test(s)) s = "'" + s;
  return '"' + s.replace(/"/g, '""') + '"';
}

// ---------- the file ----------

/**
 * @param {object} ch a character (already through ensureLevelFields)
 * @param {object} db the loaded data
 * @param {boolean} loadout whether the cards in the loadout count toward the stats
 */
export function csvRowForCharacter(ch, db, loadout = true) {
  // "Permanent only" means every card is in the vault, which is already what vaulted means to
  // the rules: a vaulted card does nothing unless its entry says permanent, and the *-Touched
  // requirement counts only what's in the loadout. So the whole split is one substitution —
  // no second code path through derived-stats.js, and the card columns come out right on their
  // own. It also answers Bare Bones honestly: a base a loadout card was standing in for goes
  // with it, leaving the SRD's unarmored numbers.
  const subject = loadout ? ch : { ...ch, domainVaultIds: ch.domainCardIds || [] };
  const r = rowContext(subject, db, loadout);
  return CSV_COLUMNS.map((column) => csvField(column.value(r))).join(",");
}

export function buildCsv(characters, db, { loadout = true } = {}) {
  const lines = [CSV_COLUMNS.map((column) => csvField(column.header)).join(",")];
  for (const ch of characters) lines.push(csvRowForCharacter(ch, db, loadout));
  return lines.join("\r\n");
}
