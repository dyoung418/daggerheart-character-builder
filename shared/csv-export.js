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
import { titleCase } from "./text.js";
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
    // Every card the character owns, in the order they collected them. The vault is a subset of
    // the collection (history.js keeps it so), which is why one list covers both halves. The id
    // is kept beside the card because a card this browser's data doesn't have still gets a
    // column — see cardCell().
    cards: (ch.domainCardIds || []).map((id) => ({ id, card: find(db?.domainCards, id) })),
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

// ---------- domain cards ----------

// A card gets a column to itself. Every other kind of feature prose on this sheet belongs to
// something the character has one of — a class, a piece of armor — but a player holds a dozen
// cards at once, and a list column would bury the very text this exists to carry.
//
// A cell is blocks separated by blank lines. The first block is the card's name and then its
// details; every block after it is one of the card's features, written the way featuresText()
// writes a feature everywhere else in this file:
//
//     Book of Ava
//     Codex · Grimoire · Level 1 · Recall Cost 2
//
//     Power Push: Make a Spellcast Roll against a target within Melee range. …
//
//     Tava's Armor: Spend a Hope to give a target you can touch a +1 bonus …
//
// The details line is always four pieces in that order, so a consumer can read them by position
// rather than by matching our wording. A card this browser's data doesn't have is exported as
// its bare id — a one-line cell, which is also how a reader tells the two apart. Dropping it
// would renumber every card after it, and it's still a card the player owns.
//
// Column ORDER is the collection's order, and the headers are the stable part: nothing may
// depend on a card being in a particular column, only on `Domain Card 3` meaning what it did
// last time. Levelling up appends, and exchanging a card replaces it in place, so a card keeps
// its column across re-exports of the same character.

// The most cards the rules can give you: 2 at creation, 1 guaranteed at each of levels 2-10, and
// the three "extra domain card" advancement slots (one per tier, TIER_SLOT_TABLE.domainCard in
// advancement.js).
//
// A floor, not a cap. It only decides how often the header varies between exports — a character
// holding more than this gets a column each regardless, so being wrong by a column or two costs
// nothing and loses nobody's card.
const USUAL_MAX_CARDS = 2 + 9 + 3;

function cardCell({ id, card } = {}) {
  if (!card) return id || "";
  const details = [
    enumLabel(card.domain),
    enumLabel(card.type),
    // Not filtered for emptiness: a Recall Cost of 0 is a real answer and a common one, and the
    // four pieces are read by position.
    `Level ${card.level ?? ""}`.trim(),
    `Recall Cost ${card.recallCost ?? ""}`.trim(),
  ].join(" · ");
  // One call per feature rather than one for the whole card, so the blank line between features
  // is ours and the text inside each block is exactly what every other feature cell says.
  const blocks = (card.features || []).map((feature) => featuresText([feature]));
  return [`${name(card)}\n${details}`, ...blocks].filter(Boolean).join("\n\n");
}

function cardColumns(count) {
  return Array.from({ length: count }, (_, i) => ({
    header: `Domain Card ${i + 1}`,
    value: (r) => cardCell(r.cards[i]),
  }));
}

// Which bodies of content this character is actually built from. data/ can hold several — the
// SRD plus playtest or homebrew folders — and "everything here is SRD" stops being a safe
// assumption the moment it does. Derived from the records themselves, never stored on the
// character: the same character exported from a browser with different folders reports what THAT
// browser resolved, which is the honest answer to "can I run this at my table?".
function contentSourcesText(r) {
  const used = new Set();
  const note = (record) => { if (record?.contentSource) used.add(record.contentSource); };
  note(r.cls); note(r.sub); note(r.com); note(r.armor);
  note(r.primary); note(r.secondary); note(r.potion);
  for (const ancestry of r.ancestries) note(ancestry);
  for (const owned of r.cards) note(owned.card);

  // Manifest order, so srd leads and the list reads the same way for every character in the file.
  const labels = r.db?.sourceLabels || {};
  const order = Object.keys(labels);
  return [...used]
    .sort((a, b) => order.indexOf(a) - order.indexOf(b))
    .map((source) => labels[source] || source)
    .join(", ");
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

  { header: "Content", value: contentSourcesText },

  // Last, so every column above keeps the position it has always had: these are wide, and there
  // are fourteen of them.
  ...cardColumns(USUAL_MAX_CARDS),
];

/**
 * The columns for one export. CSV_COLUMNS itself in the ordinary case — the rules can't give
 * anyone more cards than it already has room for — and widened only for a character who somehow
 * has more, so that a collection this app didn't build still exports whole.
 */
export function csvColumns(characters = []) {
  const widest = characters.reduce((n, ch) => Math.max(n, (ch.domainCardIds || []).length), 0);
  if (widest <= USUAL_MAX_CARDS) return CSV_COLUMNS;
  return [...CSV_COLUMNS, ...cardColumns(widest).slice(USUAL_MAX_CARDS)];
}

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
 * @param {Array} columns the export's columns, which buildCsv resolves once for the whole file
 */
export function csvRowForCharacter(ch, db, loadout = true, columns = CSV_COLUMNS) {
  // "Permanent only" means every card is in the vault, which is already what vaulted means to
  // the rules: a vaulted card does nothing unless its entry says permanent, and the *-Touched
  // requirement counts only what's in the loadout. So the whole split is one substitution —
  // no second code path through derived-stats.js, and the card columns come out right on their
  // own. It also answers Bare Bones honestly: a base a loadout card was standing in for goes
  // with it, leaving the SRD's unarmored numbers.
  //
  // It substitutes the vault and never the collection, so the per-card columns come out
  // identical under both exports: which cards you own doesn't depend on where they're sitting.
  const subject = loadout ? ch : { ...ch, domainVaultIds: ch.domainCardIds || [] };
  const r = rowContext(subject, db, loadout);
  return columns.map((column) => csvField(column.value(r))).join(",");
}

export function buildCsv(characters, db, { loadout = true } = {}) {
  // Resolved once for the file: every row has to be as wide as the header, including the rows
  // that trail blank card columns.
  const columns = csvColumns(characters);
  const lines = [columns.map((column) => csvField(column.header)).join(",")];
  for (const ch of characters) lines.push(csvRowForCharacter(ch, db, loadout, columns));
  return lines.join("\r\n");
}
