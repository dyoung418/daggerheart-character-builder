// The CSV the GM gets — and the interchange format everything downstream reads.
//
// Two jobs: summarising a party for the GM, and feeding whatever prints a character sheet — a
// mail merge, a form-filler, a script nobody here has seen. So it's written for a machine first
// and a reader second. Every header is a stable slug: lowercase, hyphenated, one per field, and
// a PLURAL header means the cell holds a newline-separated list. The values are plain text a
// person can still check by eye, but they aren't phrased for one — `hp-slots` and
// `levelup-tier2-available-counts` name a key, not a thing a player would say out loud.
// Turning these back into a player's vocabulary — "Hit Points", a row of checkboxes, a heading —
// is the consumer's business.
//
// The header strings are the contract, and the only part of the layout that is: a consumer may
// depend on `armor-score` meaning what it meant last time, but never on which column it sits in,
// and never on the file being a fixed number of columns wide (see cardColumns()).
//
// WHY SOME COLUMNS LOOK REDUNDANT
// -------------------------------
// Nothing downstream can read data/. A tool holding this file knows a character's class but
// can't look up which domains that class has, so class-domains is a column even though it
// follows from the class — and the same goes for every piece of feature prose.
//
// The rule: reproducing a value needs the game data → it's a column. Formatting a value that's
// already here — drawing checkboxes from a number, composing a heading, deciding what to put in
// bold — is the consumer's business, not ours.
//
// This module is deliberately free of DOM: characters.js owns the button, the picker and the
// download, so everything here is reachable from tests/.

import {
  MAX_HOPE,
  SLOT_TIERS,
  STARTING_HOPE,
  SUBCLASS_TIER_LABELS,
  activeDomainCardIds,
  subclassTiersUpTo,
  tierForLevel,
} from "./advancement.js";
import {
  TRAIT_KEYS,
  TRAIT_LABELS,
  advancementOptionsFor,
  derivedStats,
  permanentSubject,
} from "./derived-stats.js";
import { titleCase } from "./text.js";
import {
  UNARMED,
  UNARMORED,
  burdenLabel,
  damageText,
  enumLabel,
  featureNamesText,
  featuresText,
  weaponTraitText,
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
 *
 * Exported for the tests, which exercise one column at a time: building this by hand there
 * meant a second copy of these lookups, and it went stale the moment a column needed a new one.
 */
export function rowContext(ch, db, loadout) {
  const unarmored = ch.equipment?.armorId === UNARMORED;
  const sub = find(db?.subclasses, ch.subclassId);
  const stats = derivedStats(ch, db);
  // Null for the overwhelming majority; the columns read empty for them.
  const multiclass = ch.multiclass
    ? { cls: find(db?.classes, ch.multiclass.classId), sub: find(db?.subclasses, ch.multiclass.subclassId) }
    : null;
  return {
    ch,
    db,
    loadout,
    stats,
    cls: find(db?.classes, ch.classId),
    sub,
    multiclass,
    com: find(db?.communities, ch.heritage?.communityId),
    transformation: find(db?.transformations, ch.transformationId),
    ancestries: (ch.heritage?.ancestryIds || []).map((id) => find(db?.ancestries, id)).filter(Boolean),
    // The features the player picked, not every feature the ancestries have: a mixed-ancestry
    // character takes one from each, and it isn't always the first.
    ancestryFeatures: (ch.heritage?.chosenFeatures || []).map((chosen) => {
      const ancestry = find(db?.ancestries, chosen.ancestryId);
      return (ancestry?.features || []).find((f) => f.name?.["en-US"] === chosen.featureName);
    }).filter(Boolean),
    // A tier the character hasn't reached exports blank. Upgrading a subclass adds a card
    // rather than replacing the one below it, so the tiers below always count.
    tierFeatures: Object.fromEntries(
      subclassTiersUpTo(ch.subclassTier).map((tier) => [tier, sub?.[tier]?.features || []]),
    ),
    // The same, for the second subclass, which climbs its own ladder: a character can be at
    // Mastery in one and Foundation in the other. Empty for everyone who hasn't multiclassed.
    multiclassTierFeatures: Object.fromEntries(
      (multiclass ? subclassTiersUpTo(ch.multiclass.tier || "foundation") : []).map(
        (tier) => [tier, multiclass.sub?.[tier]?.features || []],
      ),
    ),
    unarmored,
    armor: unarmored ? null : find(db?.armors, ch.equipment?.armorId),
    // An unarmed character has a weapon profile, just not one from data/ — the SRD gives bare
    // hands a range and a damage rating like anything else, and a class feature may put a better
    // one in its place. derivedStats() decided which; this doesn't get to decide again.
    primary: stats.unarmedProfile || find(db?.weapons, ch.equipment?.primaryWeaponId),
    secondary: find(db?.weapons, ch.equipment?.secondaryWeaponId),
    potion: find(db?.consumables, ch.equipment?.potionChoice),
    // Every card the character owns, in the order they collected them. The vault is a subset of
    // the collection (history.js keeps it so), which is why one list covers both halves. The id
    // is kept beside the card because a card this browser's data doesn't have still gets a
    // column — see cardCell().
    cards: (ch.domainCardIds || []).map((id) => ({ id, card: find(db?.domainCards, id) })),
    // The advancement grid, resolved once: nine columns read it, and answering it means walking
    // the whole level history and every source that declares a row.
    advancementOptions: advancementOptionsFor(ch, db),
  };
}

function trait(r, key) {
  const t = r.stats.traits[key];
  return t?.total ?? "";
}

function total(stat) {
  return stat ? stat.total : "";
}

// The weapon's whole line, in the order the printed sheet reads it. `trait` and `burden` are
// columns rather than parts of a stats string because a form-filler has a box for each, and
// re-splitting weaponStats()' " · " would make that separator a format two projects agree on.
function weaponColumns(slot) {
  return [
    { header: `${slot}-weapon-name`, value: (r) => name(r[slot]) },
    { header: `${slot}-trait`, value: (r) => weaponTraitText(r[slot]) },
    { header: `${slot}-range`, value: (r) => enumLabel(r[slot]?.range) },
    { header: `${slot}-damage`, value: (r) => damageText(r[slot]) },
    { header: `${slot}-feature`, value: (r) => featuresText(r[slot]?.features) },
    // Empty for an unarmed profile, which has no burden at all.
    { header: `${slot}-burden`, value: (r) => burdenLabel(r[slot]) },
  ];
}

// A name/text pair, the shape every feature on the sheet takes. The text repeats each feature's
// own name in front of it rather than relying on the name column, because a slot can hold two —
// a mixed ancestry, or a tier like Beastbound's Specialization — and they would otherwise run
// together with no way to tell which paragraph belongs to which.
//
// Plural, because a slot holding several is the normal case and a plural header is this file's
// promise of a newline list. `single` is for the one pair that can never hold two: a class's
// Hope feature is one feature, wrapped in an array only to reuse this.
function featurePair(headerPrefix, features, { single = false } = {}) {
  const s = single ? "" : "s";
  return [
    { header: `${headerPrefix}-feature-name${s}`, value: (r) => featureNamesText(features(r)) },
    { header: `${headerPrefix}-feature-text${s}`, value: (r) => featuresText(features(r)) },
  ];
}

// ---------- the level up grid ----------

// The advancement rows in play for one tier, in the order the level up screen draws them, so
// that the three columns below line up row for row: line N of each is the same advancement.
//
// A tier the character can't have reached yet exports empty. The slots[] filter alone won't do
// that — advancementOptions() fills slots for every tier in SLOT_TIERS whatever the level, and
// only the row's `total` is summed over the tiers actually in play — so the level is checked
// here, once, rather than trusted to fall out of the numbers.
function advancementRows(r, tier) {
  if (tier > tierForLevel(r.ch.level)) return [];
  return r.advancementOptions.filter((option) => option.slots[tier] > 0);
}

// Three parallel lists per tier. Not one column of "label: 2" pairs, because the sheet this
// feeds draws a row of boxes per advancement and needs the count as a number.
//
// `crossed-out` is a column of its own because a struck row and a fully-spent row both have 0
// boxes left, and the official sheet draws them differently: struck through, versus filled in.
// It holds the key of whatever struck it — only `subclass` and `multiclass` ever do — and is
// empty otherwise. The blanks are load-bearing: they keep the three lists aligned.
//
// An option reads "key: label", the shape class-tracks already uses. Both halves earn their
// place. The key names a row of the printed sheet, so a consumer can match one without parsing
// prose, and it is the same vocabulary `crossed-out` answers in. The label is the only readable
// form a class-DECLARED row has — nothing downstream can look one up, and recordedOptionLabels()
// exists because even this app can't once nothing declares that row any more.
//
// It also keeps the cell off csvField()'s formula guard. Every core label begins with "+", which
// a spreadsheet reads as a formula, so the guard prefixed the whole cell with an apostrophe —
// correctly, since a field holding newlines is still one cell, but leaving one stray "'" on the
// first line for every consumer that isn't a spreadsheet. Leading with the key ends that.
function levelupColumns(tier) {
  return [
    {
      header: `levelup-tier${tier}-options`,
      value: (r) => advancementRows(r, tier)
        .map((option) => `${option.key}: ${option.label}`)
        .join("\n"),
    },
    {
      // Boxes still markable on that row in that tier. remainingSlots() sums across every tier
      // and answers a different question — the level up screen's "have you points left at all?"
      header: `levelup-tier${tier}-available-counts`,
      value: (r) => advancementRows(r, tier)
        .map((option) => option.slots[tier]
          - (r.ch.advancementSlotsUsed?.[option.key]?.[tier] ?? 0)
          - option.crossedOut[tier])
        .join("\n"),
    },
    {
      header: `levelup-tier${tier}-crossed-out`,
      value: (r) => advancementRows(r, tier).map((option) => option.crossedBy[tier] ?? "").join("\n"),
    },
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
// depend on a card being in a particular column, only on `domain-card-3` meaning what it did
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
    header: `domain-card-${i + 1}`,
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
  note(r.cls); note(r.sub); note(r.com); note(r.transformation); note(r.armor);
  note(r.primary); note(r.secondary); note(r.potion);
  for (const ancestry of r.ancestries) note(ancestry);
  for (const owned of r.cards) note(owned.card);

  // Manifest order, so srd leads and the list reads the same way for every character in the file.
  const labels = r.db?.sourceLabels || {};
  const order = Object.keys(labels);
  return [...used]
    .sort((a, b) => order.indexOf(a) - order.indexOf(b))
    .map((source) => labels[source] || source)
    .join("\n");
}

// ---------- the columns ----------

export const CSV_COLUMNS = [
  { header: "name", value: (r) => r.ch.name },
  { header: "pronouns", value: (r) => r.ch.pronouns },
  { header: "level", value: (r) => r.ch.level },
  // Derivable from the level, and exported anyway: the tier is what the printed sheet groups its
  // advancement rows by, and nothing downstream has the table that maps one to the other.
  { header: "tier", value: (r) => tierForLevel(r.ch.level) },
  { header: "proficiency", value: (r) => r.ch.proficiency },

  { header: "class", value: (r) => titleCase(r.cls?.name) },
  // The numbers the class is printed with, beside the totals they're the start of: `evasion` and
  // `hp-slots` below have every advancement and effect already folded in, and a sheet showing the
  // base in one box and the total in another can't get back to the base from the total.
  { header: "class-starting-evasion", value: (r) => r.cls?.startingEvasion },
  { header: "class-starting-hp-slots", value: (r) => r.cls?.startingHitPoints },
  // Derivable from the class, and exported anyway: nothing downstream can read classes.json.
  { header: "class-domains", value: (r) => (r.cls?.domains || []).map(enumLabel).join("\n") },
  ...featurePair("class", (r) => r.cls?.classFeatures),
  // hopeFeature is a bare feature rather than an array, so it's wrapped to match.
  ...featurePair("class-hope", (r) => (r.cls?.hopeFeature ? [r.cls.hopeFeature] : []), { single: true }),

  { header: "subclass", value: (r) => name(r.sub) },
  { header: "subclass-tier", value: (r) => SUBCLASS_TIER_LABELS[r.ch.subclassTier] ?? r.ch.subclassTier },
  ...featurePair("subclass-foundation", (r) => r.tierFeatures.foundation),
  ...featurePair("subclass-specialization", (r) => r.tierFeatures.specialization),
  ...featurePair("subclass-mastery", (r) => r.tierFeatures.mastery),

  // Singular, and joined rather than listed: a mixed ancestry is one line on the sheet,
  // not two ancestries.
  { header: "ancestry", value: (r) => names(r.ancestries).join(" + ") },
  ...featurePair("ancestry", (r) => r.ancestryFeatures),
  { header: "community", value: (r) => name(r.com) },
  ...featurePair("community", (r) => r.com?.features),
  // Beside the ancestry, where the rules place it, and blank for the great majority of
  // characters — no SRD content provides one. Both features export: the drawback is half of what
  // a transformation is, and a GM reading this row needs it as much as the player does.
  { header: "transformation", value: (r) => name(r.transformation) },
  ...featurePair("transformation", (r) => r.transformation?.features),

  // Effective traits, matching the sheet: the GM wants the number the player rolls with, which
  // includes their armor's -1 Agility. The key is already the slug, and it's the catalogue's own
  // order, so nothing here restates either.
  ...TRAIT_KEYS.map((key) => ({ header: key, value: (r) => trait(r, key) })),

  { header: "evasion", value: (r) => total(r.stats.evasion) },
  // Every track the sheet draws boxes for comes as a pair: how many boxes, and how many are
  // marked. The builder tracks no in-play damage, so the marked half is a literal 0 — a number,
  // because 0 marked is the true answer and a blank would read as "unknown".
  { header: "hp-slots", value: (r) => total(r.stats.hitPoints) },
  { header: "hp-marked-current", value: () => 0 },
  { header: "stress-slots", value: (r) => r.stats.stress.total },
  { header: "stress-marked-current", value: () => 0 },
  // Hope is the same for everyone and nothing changes it, but it's still two numbers rather than
  // one: how much you can hold, and how much you start with. Exported as a pair instead of the
  // string "2/6" so neither has to be parsed back out.
  { header: "hope-slots", value: () => MAX_HOPE },
  { header: "hope-current", value: () => STARTING_HOPE },
  { header: "damage-threshold-major", value: (r) => total(r.stats.majorThreshold) },
  { header: "damage-threshold-severe", value: (r) => total(r.stats.severeThreshold) },
  { header: "armor-score", value: (r) => total(r.stats.armorScore) },
  { header: "armor-marked-current", value: () => 0 },

  // An unarmed attack offers two traits rather than one, so it carries a display string instead
  // of a total — the GM's choice per roll, which is the SRD's rule, not a number we can pick.
  // Which is why the header says what the cell usually is and not always what it is.
  {
    header: "primary-attack-bonus",
    value: (r) => (r.stats.primaryAttack ? (r.stats.primaryAttack.display ?? signed(r.stats.primaryAttack.total)) : ""),
  },
  {
    header: "secondary-attack-bonus",
    value: (r) => (r.stats.secondaryAttack
      ? (r.stats.secondaryAttack.display ?? signed(r.stats.secondaryAttack.total))
      : ""),
  },
  // A multiclassed character can cast with either of two traits, so this is a list. The names
  // come from derivedStats() already labelled and already carrying any Spellcast-only bonus;
  // taking `displays` rather than splitting `display` keeps the app's " / " a display choice.
  { header: "spellcast-traits", value: (r) => (r.stats.spellcast?.displays ?? []).join("\n") },

  // A second class is half of what a character is, so it gets columns beside the first's rather
  // than being folded into them. Empty for everyone who hasn't multiclassed.
  { header: "multiclass", value: (r) => (r.multiclass?.cls ? titleCase(r.multiclass.cls.name) : "") },
  { header: "multiclass-domain", value: (r) => enumLabel(r.ch.multiclass?.domain || "") },
  // A name/text pair per group, the shape the primary class's features already take, because a
  // consumer laying out a sheet has a separate slot for each: the second class's own features,
  // its subclass's foundation, its subclass's specialization. One combined cell ran them
  // together with nothing to tell a reader — or a script — where one group ended.
  //
  // No Mastery pair: Multiclass marks both slots of its tier (advancement.js), so the second
  // subclass can be upgraded at most once and never reaches mastery.
  ...featurePair("multiclass", (r) => r.multiclass?.cls?.classFeatures || []),
  { header: "multiclass-subclass", value: (r) => (r.multiclass ? name(r.multiclass.sub) : "") },
  // The second subclass climbs its own ladder, so it has its own rung. `foundation` when the
  // multiclass records none, which is what rowContext reads it as.
  {
    header: "multiclass-subclass-tier",
    value: (r) => {
      if (!r.multiclass) return "";
      const tier = r.ch.multiclass?.tier || "foundation";
      return SUBCLASS_TIER_LABELS[tier] ?? tier;
    },
  },
  ...featurePair("multiclass-subclass-foundation", (r) => r.multiclassTierFeatures.foundation || []),
  ...featurePair("multiclass-subclass-specialization", (r) => r.multiclassTierFeatures.specialization || []),

  // The dice a class rolls, "Rally Die: d8". One column rather than a name and a value, because a
  // character can hold more than one and the header is shared by the whole party — the same
  // reason experiences is one column. Nothing downstream can derive these: the ladder is in the
  // game data, and the rung is in the character's advancement history.
  {
    header: "class-tracks",
    value: (r) => (r.stats.tracks || []).map((t) => `${t.label}: ${t.value}`).join("\n"),
  },

  ...weaponColumns("primary"),
  ...weaponColumns("secondary"),

  // Choosing to wear nothing is a choice, not a blank — the sheet says so rather than leaving
  // the reader to wonder whether the player forgot.
  { header: "armor-name", value: (r) => (r.unarmored ? "Unarmored" : name(r.armor)) },
  // The armor as printed, beside the totals above. EMPTY and never 0 when there's no armor:
  // 0 is a real armor score, and a sheet that reads a blank as 0 would be right by accident for
  // an unarmored character and wrong the first time a piece of armor scored 0. rowContext()
  // already nulls `armor` when unarmored, so one optional chain covers both cases.
  { header: "armor-base-damage-threshold-major", value: (r) => r.armor?.baseMajorThreshold },
  { header: "armor-base-damage-threshold-severe", value: (r) => r.armor?.baseSevereThreshold },
  { header: "armor-base-score", value: (r) => r.armor?.baseScore },
  { header: "armor-feature", value: (r) => featuresText(r.armor?.features) },

  {
    header: "experiences",
    value: (r) => r.stats.experiences.map((e) => `${e.name || "(unnamed)"} (+${e.total})`).join("\n"),
  },
  // The potion is the whole of the app's inventory model, so the cell is one line or none — but
  // the sheet's inventory is a list, and the header promises the shape the column will keep when
  // the app grows one.
  { header: "inventory-items", value: (r) => name(r.potion) },
  // Always empty: the app has no scars model at all. A declared empty column rather than a
  // missing one, because a form-filler reading this file needs to know the field exists and that
  // we have nothing to say about it.
  { header: "scars", value: () => "" },

  { header: "domain-cards-loadout", value: (r) => cardNames(activeDomainCardIds(r.ch), r.db) },
  { header: "domain-cards-vault", value: (r) => cardNames(r.ch.domainVaultIds, r.db) },
  // Which of the two exports this is. Without it, two printouts of the same character disagree
  // about her Evasion and nothing on either says why.
  { header: "includes-loadout-bonuses", value: (r) => String(r.loadout) },

  { header: "background", value: (r) => r.ch.background?.description },
  { header: "appearance", value: (r) => r.ch.background?.answers },
  { header: "connections", value: (r) => r.ch.connectionsNotes },

  // A fixed literal: the app tracks no money, and the sheet has three boxes for it. The ", "
  // inside the value is part of one string rather than a list separator — a singular header, so
  // nothing should read it as a newline list that happens to have commas in it.
  { header: "gold", value: () => "handfuls: 0, bags: 0, chests: 0" },

  // ---- the level up sheet ----
  //
  // The traits already given a +1 in this tier, and so ineligible for "+1 to two unmarked traits"
  // even where a box is free. Cleared at levels 5 and 8 (history.js) before that level's picks
  // are made, so a trait freed at 5 can be raised again at 5.
  {
    header: "levelup-marked-traits",
    value: (r) => TRAIT_KEYS.filter((key) => r.ch.traitMarks?.[key]).map((key) => TRAIT_LABELS[key]).join("\n"),
  },
  ...SLOT_TIERS.flatMap(levelupColumns),

  { header: "sources", value: contentSourcesText },

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
  return (ids || []).map((id) => name(find(db?.domainCards, id))).filter(Boolean).join("\n");
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
  // "Permanent only" means every card is in the vault — one substitution, no second code path
  // through derived-stats.js, and the per-card columns come out right on their own. Why that
  // works and what it costs is stated once, at permanentSubject()'s definition; the printable
  // sheet and the printed stats card make the same call, and this file used to spell the rule
  // out a second time.
  const subject = loadout ? ch : permanentSubject(ch);
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
