// The official Daggerheart character sheet, as one flat { field name: value } map.
//
// This is the RULES half of filling that PDF in: which of the template's boxes gets what, and
// why. The other half — finding the widgets, writing the values back, ticking a checkbox by
// setting its /AS and /V — belongs to whatever writes the bytes, and it decides nothing. It's
// the same split card-content.js and card-pdf.js already use, for the same reason: what goes IN
// a box is rules, and rules are the part tests/ can read.
//
// Pure — no DOM, no fetch. deriveSheet() does the arithmetic; this only addresses the boxes.
//
// THE FIELD NAMES ARE THE CONTRACT
// --------------------------------
// Every key below is a field name in data/sheet/sheet-template.pdf, spelled the way the template
// spells it. They're the same kind of promise csv-export.js's headers are, only stricter: the
// template is hand-authored in a PDF editor, so nothing but a string match holds the two halves
// together, and a renamed field fails silently — the writer finds no widget and the box prints
// empty. That's why the six Spellcast markers and the six trait marks are written out one per
// trait below instead of sliced off the trait key. "agility" starting with "agi" is a
// coincidence of the current six, not a naming rule the template ever agreed to.
//
// EVERY FIELD IT ANSWERS, EVERY TIME
// ----------------------------------
// A field this map answers, it answers whether the character has anything to say or not, and ""
// is that answer for the ones that don't. A field simply omitted would look, to the writer,
// exactly like one this file forgot — and the difference matters, because "" means "leave the box
// as the template drew it".
//
// WHAT IT DELIBERATELY LEAVES BLANK, and the two different reasons
// ---------------------------------------------------------------
// The template has considerably more fields than this map has keys, and the gap is not an
// oversight in either direction. Two kinds of blank, and they are blank for opposite reasons:
//
// IN-PLAY STATE the app models nowhere on purpose — the Hit Point, Stress, Armor and Hope slots.
// A ticked HP box means that slot is SPENT. The app knows the maxima and never the state, so this
// file has nothing TRUE to say about them; those boxes come out of the printer the way a player
// wants them, empty and ready to pencil in. Contrast the trait marks and the level up grid, which
// ARE answered: a marked advancement is a choice already made and kept, not a resource spent.
//
// NOTHING TO SAY YET — boxes the template offers a player that the app has no model behind.
// `gold-*`, the two `inventory1-`/`inventory2-` weapon blocks, `suggested-traits`,
// `suggested-primary-weapon`, `suggested-armor` and `inventory-initial-options`. The app tracks
// no money at all (csv-export.js emits a literal "handfuls: 0, bags: 0, chests: 0" for the same
// reason), no inventory beyond the one potion, and the book's suggested loadouts aren't in
// data/ at all. These exist for the player to write in by hand.
//
// The second group is the one to check before assuming a bug. `inventory1-*` has exactly the
// shape of `primary-*` — name, trait-range, damage-and-type, feature, burden — so the day the app
// grows a weapon inventory, filling them is this file gaining a loop and nothing else. Until then
// they are left alone deliberately, and NOTHING has to be taught to ignore them: fillForm writes
// the names it is handed and touches nothing else, so a template can grow fields freely without
// this module or the writer knowing.

import { advancementOptionsFor, permanentSubject, spellcastTraitKeys } from "./derived-stats.js";
import { TIER_SLOT_TABLE } from "./advancement.js";
import { UNARMED, featuresText as sourceFeaturesText } from "./gear.js";
import { attackText, deriveSheet } from "./sheet-data.js";

// What deriveSheet() prints for a value it hasn't got. Repeated rather than imported for the
// reason card-content.js repeats it: sheet-data.js doesn't export it, and this is the same
// character used for the same purpose.
const DASH = "—";

function find(list, id) {
  return id ? (list || []).find((x) => x.id === id) || null : null;
}

// THE BULLET, AND WHY IT IS NOT THE ONE gear.js WRITES
// -----------------------------------------------------
// featuresText() marks a feature's list items with U+2022 BULLET, which is right everywhere else
// this app writes text. In a PDF form field Chrome draws it as a double quote, so the app's own
// bulleted class features come out as `" You know precisely...`.
//
// EVERYTHING BELOW IS MEASURED. The mechanism is NOT established, and three theories died before
// this table existed — so the table is what the code is written against, not a rule inferred from
// it. Each character was put in this very box, one per line, and read off in Chrome:
//
//     U+2022 bullet            -> "        BROKEN   (low byte 0x22)
//     U+2023 triangular bullet -> #        BROKEN   (low byte 0x23)
//     U+2219 bullet operator   -> nothing  BROKEN   (low byte 0x19, a control)
//     U+25AA small square      -> nothing  BROKEN   (low byte 0xAA is printable; it still vanished)
//     U+25CF black circle      -> nothing  BROKEN   (low byte 0xCF is printable; it still vanished)
//     U+2013 en dash           -> –        fine
//     U+2014 em dash           -> —        fine
//     U+2019 apostrophe        -> ’        fine
//     U+00B7 middle dot        -> ·        fine
//     U+00BB guillemet         -> »        fine
//
// Two things that table rules out. It is NOT "characters above U+00FF": the en dash, em dash and
// curly apostrophe are all above it and all correct, so a transliteration pass would mangle three
// characters to fix one. And it is NOT the template font's /Differences array, which remaps 151 to
// /Scaron — the em dash above would then print as Š, and it doesn't, so Chrome ignores that array
// (the /DhHelv font pdf-form.js adds is insurance for viewers that don't, not the fix for this).
//
// The first three rows look like a low-byte truncation and the next two contradict it, so the
// pattern is left stated rather than named. What matters is that U+00B7 renders in Chrome and in
// poppler and still reads as a list marker. It is small next to the text — a centred dot rather
// than a filled circle — and that was accepted deliberately over the alternatives above.
//
// Substituted HERE rather than in gear.js because gear.js also feeds the CSV, whose mail-merge doc
// renders its bullets correctly. This is a fact about one sink, so it is fixed at that sink.
const PDF_BULLET = "\u00b7";

function featuresText(features) {
  return sourceFeaturesText(features).replaceAll("\u2022", PDF_BULLET);
}

// THE CURLY QUOTES, AND THE OTHER SUBSTITUTION THAT RUNS THE OPPOSITE WAY
// -----------------------------------------------------------------------
// U+2018/U+2019 \u2192 ASCII ', U+201C/U+201D \u2192 ASCII ", applied ONCE over the finished map by
// asciiQuotes() below. Not because anything struggles to draw them \u2014 WinAnsi has all four, at
// bytes 0x91-0x94 (shared/winansi.js:178-181), and they render correctly in every reader tested.
// They are flattened to deny a downstream corruptor something to corrupt.
//
// MEASURED, on one character across three files. The raw export carries 4 \u00d7 U+2019; Firefox's
// save preserves all four; CHROME'S SAVE REWRITES EVERY ONE AS A SEMICOLON \u2014 `Beastform;s`, and
// those semicolons are on printed, scanned paper. The mechanism is unexplained (the same save
// also regenerates all 71 appearance streams and draws em dashes through a CJK fallback font;
// shared/pdf-form.js's header has the rest of that inventory). One Ctrl-S is all it takes, so
// waiting for an explanation would mean shipping the corruption.
//
// THE TRAP: THIS RUNS OPPOSITE TO THE MINUS-SIGN SUBSTITUTION, AND BOTH ARE RIGHT
//
//   U+2212/U+2011 \u2192 "-"   WinAnsi has NO minus glyph, so the DRAWING substitutes and /V keeps the
//                         true character (shared/winansi.js:70-79). Data right, render
//                         approximate. Nothing here touches it.
//   U+2018-U+201D \u2192 '"    WinAnsi draws these perfectly, so the drawing needs no help and /V
//                         ITSELF changes. Data flattened on purpose, render identical either way.
//
// One feature, two substitutions, opposite invariants: one protects the value and approximates
// the picture, the other approximates the value to protect it from a later editor. "Fixing" either
// to match the other reintroduces the bug it was written for \u2014 a `\u2212` reported as undrawable would
// switch the whole appearance path off for the nine of 69 SRD 2.0 armors that carry one, and a
// U+2019 left in /V is a semicolon on the next person's printout.
//
// WHY HERE AND NOT IN featuresText(), which is the other one-sink substitution above. The bullet
// is only ever GENERATED by featuresText, so featuresText is the whole of its reach. Apostrophes
// arrive from everywhere \u2014 catalogue prose, a pasted character name, an experience someone typed \u2014
// so the only place that sees all of them is the finished map. And the map is safe to sweep
// wholesale for the reason PDF_BULLET's own comment gives at :99: sheetFieldValues() has exactly
// one non-test caller, sheet-pdf.js:104, so this is PDF-only by construction. The CSV keeps the
// true characters for its mail-merge consumer, which is the same argument, one sink over.
const PDF_QUOTES = /[\u2018\u2019\u201c\u201d]/g;
const ASCII_QUOTES = { "\u2018": "'", "\u2019": "'", "\u201c": '"', "\u201d": '"' };

// In place, so the caller's key order survives: assigning to a key an object already has does not
// move it, and shared/pdf-form.js reports the first unknown field name it is handed, in this
// order. Checkboxes are booleans and pass through untouched.
function asciiQuotes(fields) {
  for (const [name, value] of Object.entries(fields)) {
    if (typeof value === "string") fields[name] = value.replace(PDF_QUOTES, (ch) => ASCII_QUOTES[ch]);
  }
  return fields;
}

// The template's level-up checkbox prefix for each advancement row, in the order the printed
// sheet lists them. The prefixes are the template's own vocabulary and the keys are
// TIER_SLOT_TABLE's (advancement.js:17-29); this map is the seam between them, and the only place
// the two spellings meet.
const LEVEL_UP_ROWS = {
  trait: "traits",
  hp: "hitPoint",
  stress: "stress",
  experience: "experience",
  domain: "domainCard",
  evasion: "evasion",
  subclass: "subclass",
  proficiency: "proficiency",
  multiclass: "multiclass",
};

// A form field holds text. A null total prints nothing rather than the word "null", and a number
// becomes its digits.
//
// NaN is guarded for the same reason and it is not hypothetical: armors load under NAME_ONLY
// (content-sources.js:156,162), so a hand-transcribed record missing baseMajorThreshold is a
// record that loads, and derived-stats.js:590-594 then adds undefined to a number. Without this,
// damage-threshold-major and -severe print the word "NaN" onto the sheet — while
// armor-base-thresholds, twenty lines below, already guards the very same catalogue bug.
function text(value) {
  if (value === null || value === undefined) return "";
  if (typeof value === "number" && !Number.isFinite(value)) return "";
  return String(value);
}

// deriveSheet writes a dash where the printed sheet wants something visible sitting on a ruled
// line. A form field is not a ruled line — an empty one already reads as unanswered — so the
// dash is dropped wherever it's only standing in for a blank. Never from armor-name, where the
// dash IS the answer.
function undashed(value) {
  return value === DASH ? "" : text(value);
}

// Joins the pieces of a prose line, dropping the empty ones and deriveSheet's dashes with them:
// "Beastbound Ranger" for a character who has both, "Ranger" for one who hasn't picked a
// subclass yet, and never "— Ranger".
function phrase(parts, separator = " ") {
  return parts.filter((part) => part && part !== DASH).join(separator);
}

// The two per-trait fields, spelled out. See the header: the template's three-letter prefixes
// are its own vocabulary, not a transformation of ours.
const SPELLCAST_INDICATOR_FIELDS = {
  agility: "agi-spellcast-indicator",
  strength: "str-spellcast-indicator",
  finesse: "fin-spellcast-indicator",
  instinct: "ins-spellcast-indicator",
  presence: "pre-spellcast-indicator",
  knowledge: "kno-spellcast-indicator",
};

const TRAIT_MARK_FIELDS = {
  agility: "agi-marked",
  strength: "str-marked",
  finesse: "fin-marked",
  instinct: "ins-marked",
  presence: "pre-marked",
  knowledge: "kno-marked",
};

/**
 * Every field of the official sheet, for one character.
 *
 * @param {object} character a character (already through ensureLevelFields, like every other
 *   caller of derivedStats() — see sheet-data.js's header)
 * @param {object} db the loaded data
 * @param {boolean} [options.loadout] whether the cards in the loadout count toward the stats
 * @returns {Object<string, string|boolean>} text fields as strings, checkboxes as booleans. Every
 *   string has had its curly quotes flattened to ASCII on the way out — PDF_QUOTES above says why
 *   that is done to the value itself while the minus sign is only substituted in the drawing.
 *
 * `loadout` is false by default, and that's the sheet's answer rather than a convenience: a
 * printed sheet outlives the loadout it was printed with. A player swaps a card between sessions
 * and the paper doesn't change, so a number that moves with the loadout is a number the sheet is
 * wrong about by next week.
 *
 * What's left moves when the character LEVELS OR CHANGES GEAR — not levels alone. Only the vault
 * is substituted, so everything fed by `subject.equipment` sits in the permanent half: buy Full
 * Plate at downtime, with no level up in sight, and armor-score, both armor-base-* boxes, both
 * damage-threshold-* boxes, agility and evasion all move (its Very Heavy feature is -2 Evasion
 * and -1 Agility, effects.js:210) — and so do armor-name, armor-feature and, because Agility
 * fell, primary-trait-range's bonus. Nine boxes from one purchase, no level up involved.
 *
 * The switch is one call to permanentSubject(), which derived-stats.js states once for the three
 * exports that make it — this sheet, the printed stats card and the CSV. Its definition carries
 * the reasoning, including the consequence worth knowing before reading these numbers: it unwinds
 * Bare Bones, so an unarmored character's printed Evasion, thresholds and Armor Score can be
 * genuinely lower than what's in play.
 */
export function sheetFieldValues(character, db, { loadout = false } = {}) {
  const subject = loadout ? character : permanentSubject(character);
  const s = deriveSheet(subject, db);
  const fields = {};

  fields.name = text(s.name);
  fields.pronouns = text(s.pronouns);
  fields.level = text(s.level);
  fields.proficiency = text(s.proficiency);

  // Community first, then the ancestries, then the transformation — prose, in the order a player
  // says it out loud: "Wildborne Human", "Wildborne Human + Elf", "Wildborne Human + Elf,
  // Vampire".
  //
  // " + " between ancestries is the separator sheet.js:65 and the CSV's `ancestry` column both
  // already use, because a mixed ancestry is ONE heritage and not two of them.
  //
  // The transformation follows a comma instead of joining that chain. It belongs on this line —
  // "add the card to your loadout as if it were part of your character's ancestry", the rule
  // quoted at sheet.js:62-64 — but reading it as a third ancestry would be wrong, and " + " says
  // exactly that. Absent for almost every character, since no SRD content provides one:
  // `transformationName` is null rather than a dash for precisely that reason, so nothing here
  // has to decide whether a missing transformation is a gap.
  fields.heritage = phrase([
    phrase([s.communityName, s.ancestryNames.join(" + ")]),
    s.transformationName,
  ], ", ");

  // Subclass then class, the way the class is named at the table: a Beastbound Ranger, not a
  // Ranger who is Beastbound. Primary class only — the second one has its own box below.
  fields["class-subclass"] = phrase([s.subclassName, s.className]);

  // The second class, and its DOMAIN. The domain is in here deliberately: sheet.js:67-68 calls
  // it "the thing a player has to look up when picking a card", and a multiclass is the one case
  // where a player's domains aren't the two printed under their class heading.
  fields["multiclass-subclass"] = s.multiclass
    ? phrase([phrase([s.multiclass.subclassName, s.multiclass.className]), s.multiclass.domain], ", ")
    : "";

  // Effective traits — deriveSheet already signed them, and already resolved a trait a piece of
  // armor moves. `key` is the field name for all six; see the header for why the two per-trait
  // maps above aren't.
  //
  // Asked of the SUBJECT, the same thing deriveSheet() was handed four lines up — and deliberately
  // NOT what the stats card does (card-content.js:110), which asks the character.
  //
  // The two spellings agree today: spellcastTraitKeys() reads subclassId and
  // multiclass.subclassId and nothing else, so vaulting cannot move the answer. The question is
  // which way to be wrong on the day a card declares a Spellcast trait, and for this file the
  // answer follows from what the export promises. "Permanent only" tells the player the sheet
  // reads as if every card were in their vault, and every number on it — the Spellcast box, the
  // weapon's attack alternatives — is computed from the subject for exactly that reason
  // (derived-stats.js:467). A star sourced from the character would then mark a trait this
  // sheet's own numbers say isn't one: one page contradicting itself, which is worse than either
  // consistent answer.
  //
  // The card asks the character because it has no toggle to honour — its stated premise is every
  // card owned, none of them in play — so the divergence is real rather than an oversight.
  // tests.js pins that the two spellings still agree; the day that check fails, both files have a
  // decision to make and this comment is where the sheet's half of it is written down.
  const spellcastKeys = spellcastTraitKeys(subject, db);
  for (const trait of s.traits) {
    fields[trait.key] = text(trait.display);
    // A marker beside the trait, so a player can see which one their Spellcast Rolls use without
    // going back to their subclass card. TWO of them for a multiclass caster whose foundations
    // name different traits: the SRD makes that a choice per roll rather than a thing to store
    // (derived-stats.js:162-166), and a sheet that marked one would be picking for them.
    fields[SPELLCAST_INDICATOR_FIELDS[trait.key]] = spellcastKeys.includes(trait.key) ? "*" : "";
  }

  fields.evasion = text(s.evasion);
  fields["armor-score"] = text(s.armorScore);
  // The counts, not the boxes. The template draws twelve checkboxes for each of these — what a
  // player marks off in play — and a small field beside them for how many they have at all. This
  // fills the number and leaves all twenty-four boxes alone; see the header.
  fields["hp-slots"] = text(s.hitPoints);
  fields["stress-slots"] = text(s.stress);
  fields["damage-threshold-major"] = text(s.thresholds?.major);
  fields["damage-threshold-severe"] = text(s.thresholds?.severe);

  // Which weapon slots deriveSheet produced an entry for, in its order. It builds
  // [primary, secondary] and filters the empties out (sheet-data.js:233-236), so index 0 is not
  // unconditionally the primary: a character whose primary weapon id names content this browser
  // can't resolve comes back with one entry, and it's their off-hand. Rebuilding the same filter
  // here is what keeps that weapon out of the primary-* boxes — a sheet naming the wrong hand is
  // worse than a sheet leaving five boxes empty, and deriveSheet flags the missing content
  // separately either way.
  //
  // The primary slot counts when it holds the UNARMED sentinel too, even though the lookup finds
  // nothing: deriveSheet fills that entry from derivedStats()'s unarmed profile, which is a
  // weapon the rules provide rather than a record in db. Hence a slot that counts with a null
  // record beside it — and no features to print, because a bare-handed profile has none.
  const primaryRecord = find(db?.weapons, subject.equipment?.primaryWeaponId);
  const secondaryRecord = find(db?.weapons, subject.equipment?.secondaryWeaponId);
  const slots = [];
  if (primaryRecord || subject.equipment?.primaryWeaponId === UNARMED) {
    slots.push({ prefix: "primary", record: primaryRecord });
  }
  if (secondaryRecord) slots.push({ prefix: "secondary", record: secondaryRecord });

  for (const prefix of ["primary", "secondary"]) {
    fields[`${prefix}-weapon-name`] = "";
    fields[`${prefix}-trait-range`] = "";
    fields[`${prefix}-damage-and-type`] = "";
    fields[`${prefix}-burden`] = "";
    fields[`${prefix}-feature`] = "";
  }

  slots.forEach((slot, i) => {
    const weapon = s.weapons[i];
    if (!weapon) return;
    fields[`${slot.prefix}-weapon-name`] = text(weapon.name);

    // "(+3) Agility | Close", and every part of how that line is put together — when the trait
    // label is welded on, when a bracket has to separate it, that alternatives print IN FULL —
    // is sheet-data.js's attackText(). The printed stats card calls it too, which is the point:
    // the same weapon on the same character has to read the same way in both hands. This file
    // once stated the rule itself, in wording that was never identical to the card's — so a
    // change made on one of them would have drifted from the other with nothing to notice it.
    //
    // `bracketBonus` is this sheet's half of it. The bracket is derived-stats.js's own notation
    // for one alternative among several, and taking it for a lone bonus as well makes both kinds
    // of weapon read the same way down the column — it also keeps the value off a spreadsheet's
    // formula guard, the way that file's comment describes (derived-stats.js:633-643), should
    // these fields ever be read anywhere but a PDF.
    const head = attackText(weapon, { bracketBonus: true });
    // join rather than interpolate: prettyEnum() returns "" for a weapon with no range, and
    // weapons load under NAME_ONLY too, so a record without one would otherwise print the
    // separator with nothing after it — "(+1) Agility | ".
    fields[`${slot.prefix}-trait-range`] = [head, weapon.range].filter(Boolean).join(" | ");

    fields[`${slot.prefix}-damage-and-type`] = [weapon.damage, weapon.damageType].filter(Boolean).join(" ");
    // Empty for a bare-handed profile, which has no burden at all — the same blank the CSV's
    // `primary-burden` column reports (csv-export.js:156).
    fields[`${slot.prefix}-burden`] = text(weapon.burden);

    // The feature text comes off the db record rather than off `weapon.features`, and this is the
    // one place in the file that reaches past deriveSheet for something it appears to carry
    // already. deriveSheet FLATTENS features into { name: string, description: [{type, …}] } for
    // a renderer to walk; featuresText() reads the source shape, name["en-US"] and all, and hands
    // back "" for anything else — so the flattened list would silently print nothing. gear.js's
    // is the formatter this box wants: it's the one the CSV's identically-named `primary-feature`
    // column uses (csv-export.js:154), and it already knows the two traps in this data — a
    // feature whose name ends in its own colon (Guardian's), and a list-only feature whose text
    // starts with its own newline. A second formatter taking the flattened shape would be a third
    // spelling of "a feature, as one string", which is the drift sheet-data.js:68-72 already
    // spent a keyword to avoid.
    fields[`${slot.prefix}-feature`] = featuresText(slot.record?.features);
  });

  // "Unarmored" for the sentinel and "—" for an unfilled slot, and that distinction is
  // load-bearing (sheet-data.js:152-155): choosing to wear nothing is a choice, and the one field
  // on this sheet where a dash is the answer rather than a placeholder. So it isn't undashed().
  fields["armor-name"] = text(s.armorName);

  // The armor's OWN printed numbers, beside the character's totals above. deriveSheet doesn't
  // carry them — nothing reading it has wanted them until now — so they come off the record the
  // way card-content.js:223-231 takes them, never re-derived: these don't move with level, and
  // the boxes that do are `armor-score` and the two thresholds.
  //
  // No UNARMORED check is needed: there is no such record in data/, so the sentinel resolves to
  // null on its own. Empty and never 0 when there's no armor, for csv-export.js:437-440's reason
  // — 0 is a real base score, and a reader treating a blank as 0 would be right by accident for
  // an unarmored character and wrong the first time some armor scores 0. A record missing a base
  // is a catalogue bug, guarded the way gear.js's armorStats() guards it: an empty box reports
  // that better than "null / null" does.
  const armor = find(db?.armors, subject.equipment?.armorId);
  const hasBaseThresholds = armor && armor.baseMajorThreshold != null && armor.baseSevereThreshold != null;
  fields["armor-base-thresholds"] = hasBaseThresholds
    ? `${armor.baseMajorThreshold} / ${armor.baseSevereThreshold}`
    : "";
  fields["armor-base-score"] = armor ? text(armor.baseScore) : "";
  fields["armor-feature"] = featuresText(armor?.features);

  const cls = find(db?.classes, subject.classId);
  const mcClass = s.multiclass ? find(db?.classes, subject.multiclass.classId) : null;

  // Name AND full text. A class's Hope feature is the one class-derived thing with no card
  // anywhere: card-sheet.js generates cards for community, ancestry, transformation, domain and
  // subclass, and stops. So this box is the only paper the feature's text exists on, and a name
  // alone would leave a player holding a feature they can't use.
  fields["class-hope-feature"] = featuresText(cls?.hopeFeature ? [cls.hopeFeature] : []);

  // The primary class's class features, then — for a multiclassed character — the second class's
  // under its own name.
  //
  // Both lists come off the class records rather than out of deriveSheet, for two reasons. The
  // first is the formatter, exactly as for the weapon features above: deriveSheet's are
  // flattened and featuresText() reads the source shape. The second is that deriveSheet's
  // `multiclassFeatures` isn't the list this box wants at all — it's the second class's class
  // features AND its subclass's tier features concatenated (sheet-data.js:275-282), each tagged
  // with a `source` label. Splitting it back apart would mean matching on that label, which is
  // display text and free to be reworded; asking the db for mcClass.classFeatures asks for
  // exactly the half that belongs here, the same way the armor bases above are asked for by name.
  //
  // The second class's name goes in front of its features because this is one box holding two
  // classes' worth of prose and nothing else in it says where the second half came from. It's
  // deriveSheet's spelling of the name, so this box and the multiclass-subclass box above agree.
  //
  // NOT here: subclass, ancestry, community, transformation and domain features. Every one of
  // those is printed on a card of its own, so repeating the text would be the same rules in two
  // places — and the class features alone already fill this box.
  const mcFeatures = mcClass ? featuresText(mcClass.classFeatures) : "";
  fields["class-features"] = [
    featuresText(cls?.classFeatures),
    mcFeatures ? `${s.multiclass.className}\n${mcFeatures}` : "",
  ].filter(Boolean).join("\n\n");

  // The potion, and nothing else — the same contents as the identically-named CSV column
  // (csv-export.js:450-453), because the potion is the whole of the app's inventory model. The
  // starting kit ("a torch, 50 feet of rope, basic supplies…") is a creation-time grant nothing
  // ever records against the character, so writing it here would be this file inventing a fact
  // rather than reporting one; a player who wants it writes it in the box themselves. The dash
  // goes for the same reason it goes from every other placeholder: an empty list box already says
  // "nothing recorded", where a dash says "recorded: nothing".
  fields["inventory-items"] = undashed(s.potionName);

  // Five slots, which is exactly the ceiling the rules allow: two at creation, plus one at each
  // of the level 2, 5 and 8 achievements (level-up.js:1108-1115). So there's no overflow case to
  // decide here and no sixth Experience to lose — an unused slot is simply "".
  for (let i = 0; i < 5; i += 1) {
    const experience = s.experiences[i];
    fields[`experience-name${i + 1}`] = experience ? text(experience.name) : "";
    fields[`experience-value${i + 1}`] = experience ? text(experience.display) : "";
  }

  // The only checkboxes this file answers, and the only ones it ever should. A marked trait is
  // one already raised in this tier and therefore ineligible for another +1 while the tier lasts
  // — durable state history.js keeps and clears at the level 5 and 8 boundaries
  // (history.js:85-87), not something spent at the table. The CSV exports the same six as
  // `levelup-marked-traits` (csv-export.js:479-482); this is that list, one box at a time.
  for (const trait of s.traits) {
    fields[TRAIT_MARK_FIELDS[trait.key]] = !!subject.traitMarks?.[trait.key];
  }

  // ---- page two ----

  // The sheet's second page repeats the character's name in its own header, under its own field
  // name because two live fields sharing a /T is a template readForm refuses outright — it cannot
  // know which one a value was meant for.
  fields["name-pg2"] = text(s.name);
  fields.background = text(s.background);
  fields.appearance = text(s.appearance);
  fields.connections = text(s.connections);

  // ---- the level up grid ----
  //
  // Forty boxes, three tiers, nine rows. Unlike the play boxes on page one, these are exactly the
  // kind of state this sheet SHOULD carry: a marked advancement is a permanent record of a choice
  // already made, not a resource spent at the table.
  //
  // advancementSlotsUsed[key][tier] is a COUNT, not a list — the rules make the boxes on a row
  // interchangeable, so which of a row's three boxes is marked carries no information. Filling
  // from the left is therefore a presentation choice and not a claim about what happened.
  //
  // A TICK MEANS "NOT AVAILABLE", WHICH IS TWO DIFFERENT FACTS
  //
  // The printed sheet draws them differently: a spent option is filled in, a struck one is scored
  // through — and csv-export.js:193-195 keeps them in separate columns for exactly that reason,
  // because "0 boxes left" is true of both and they are not the same thing. A checkbox has two
  // states and neither of them is a diagonal line, so on this sheet they collapse: struck boxes
  // are ticked alongside spent ones, and a tick reads as "you cannot take this".
  //
  // That is a deliberate loss and it only ever hits two rows. Upgrading a subclass strikes that
  // tier's multiclass; multiclassing strikes every other multiclass slot and an unused subclass
  // upgrade (advancement.js:31-39). Nothing else is ever struck, and both are once-only choices
  // a player remembers making — so what the sheet loses is why a box is unavailable, never
  // whether it is.
  const advancement = advancementOptionsFor(subject, db);
  for (const [prefix, key] of Object.entries(LEVEL_UP_ROWS)) {
    const option = advancement.find((o) => o.key === key);
    for (const tier of [2, 3, 4]) {
      const boxes = TIER_SLOT_TABLE[key]?.[tier] ?? 0;
      const spent = subject.advancementSlotsUsed?.[key]?.[tier] ?? 0;
      const struck = option?.crossedOut?.[tier] ?? 0;
      // Capped, because a row can be struck after it was partly spent and the two counts would
      // otherwise sum past the boxes that exist — ticking a `-4` that isn't in the template and
      // making fillForm throw on a field name nothing has.
      const ticked = Math.min(boxes, spent + struck);
      for (let i = 1; i <= boxes; i += 1) {
        // Single-box rows are numbered without a suffix in the template, matching how they read
        // on the page: "Experiences: 1 per tier" is one box, not box one of one.
        fields[boxes === 1 ? `lu-${prefix}-${tier}` : `lu-${prefix}-${tier}-${i}`] = i <= ticked;
      }
    }
  }

  // Last, over everything, once. See PDF_QUOTES above for what it does and which of this
  // feature's two substitutions it is — the one that changes the VALUE, not the drawing.
  return asciiQuotes(fields);
}
