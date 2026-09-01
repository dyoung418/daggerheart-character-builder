// Tests for the advancement rules and the level history replay.
//
// They run in the browser, against the same ES modules the app loads, so there's nothing
// to install and no build step. Fixtures are written by hand rather than fetched from
// data/, because everything under test is a pure function over plain objects.
//
// Nothing in the app imports this file.

// Every module is loaded with a per-run token so a reload always tests the code as it is on
// disk. Without it the browser will happily re-run the whole suite against a cached copy of a
// module you just edited and report green, which is worse than not running it at all.
//
// The token is the one boot.js put on this file's own URL, so the whole run — this file
// included — is busted by a single value. Opened without one (importing tests.js directly),
// it falls back to a fresh token so the modules under test are still read from disk.
const RUN = new URL(import.meta.url).search || `?run=${Date.now()}`;

const {
  BASE_STRESS_SLOTS,
  MAX_ARMOR_SCORE,
  MAX_HIT_POINT_SLOTS,
  MAX_STRESS_SLOTS,
  SUBCLASS_TIER_LABELS,
  SUBCLASS_TIER_ORDER,
  TIER_CARD_CAP,
  advancementCredits,
  advancementOptions,
  blankSlotsUsed,
  domainAccess,
  halfLevelCap,
  ensureLevelFields,
  extraCardLevelCap,
  isLevelAchievement,
  nextSubclassTier,
  optionCost,
  optionFor,
  recordedOptionLabels,
  remainingSlots,
  slotsInTier,
  slotsPerPick,
  subclassTiersUpTo,
  tierForLevel,
  totalSlotsForOption,
  usedSlotsForOption,
} = await import(`../shared/advancement.js${RUN}`);
const {
  characterAtLevel,
  describeLevelUp,
  experiencesAtLevel,
  recomputeCharacter,
  stateAtLevel,
  unresolvedProblems,
  validateEntry,
  validateLevelUps,
  writeLevelEntry,
} = await import(`../shared/history.js${RUN}`);
const {
  TRAIT_KEYS,
  UNARMED_PROFILE,
  advancementOptionsFor,
  characterTracks,
  derivedStats,
  permanentSubject,
  spellcastTraitKeys,
  effectBonuses,
  effectExperienceBonuses,
  evasionTotal,
  hitPointTotal,
  stressTotal,
} = await import(`../shared/derived-stats.js${RUN}`);
const {
  EFFECTS,
  blankAnswer,
  collectEffects,
  ignoresBurden,
  isAnswered,
  unresolvedChoices,
} = await import(`../shared/effects.js${RUN}`);
const {
  attackText,
  deriveSheet,
} = await import(`../shared/sheet-data.js${RUN}`);
const {
  sheetFieldValues,
} = await import(`../shared/sheet-fields.js${RUN}`);
const {
  SPELLCAST_TRAIT,
  UNARMED,
  UNARMORED,
  burdenWarning,
  damageDice,
  damageText,
  featureLine,
  featuresText,
  enumLabel,
  groupByTier,
  magicWeaponWarning,
  matchesSpellcast,
  weaponStats,
  weaponTraitText,
} = await import(`../shared/gear.js${RUN}`);
const {
  CSV_COLUMNS,
  buildCsv,
  csvField,
  rowContext,
} = await import(`../shared/csv-export.js${RUN}`);
const {
  combineManifests,
  mergeSources,
  normalizeRecord,
  parseManifest,
  parseSourceInfo,
  unresolvedReferences,
  validateEffectEntry,
  validateRecord,
  visibleRecords,
} = await import(`../shared/content-sources.js${RUN}`);
const {
  bareId,
  indexRecordIds,
  remapCharacterIds,
  resolveRecordId,
} = await import(`../shared/content-ids.js${RUN}`);
const {
  TRANSFER_FORMAT,
  TRANSFER_VERSION,
  applyImport,
  buildTransferFile,
  importedName,
  mintCharacterId,
  parseTransferFile,
  planImport,
  serializeTransferFile,
  transferFilename,
} = await import(`../shared/transfer.js${RUN}`);
const { titleCase } = await import(`../shared/text.js${RUN}`);
const {
  asciiBytes,
  buildPdf,
  formatNumber,
  pageContentStream,
} = await import(`../shared/pdf.js${RUN}`);
// The three layers under the sheet's own appearance streams, imported in the order they stack:
// bytes and widths, then wrapping and operators, then objects and xref offsets. `measure` is
// renamed on the way in because the wrap tests inject a measurer of their own under that name —
// shared/pdf-text.js does the same, for the same reason.
const {
  HELVETICA_WIDTHS,
  encodeWinAnsi,
  literalBody,
  measure: helveticaMeasure,
} = await import(`../shared/winansi.js${RUN}`);
const {
  LAYOUT,
  fitLines,
  textAppearance,
  wrapLines,
} = await import(`../shared/pdf-text.js${RUN}`);
const {
  fieldBox,
  fillForm,
  fillFormWithReport,
  readForm,
  rectOf,
} = await import(`../shared/pdf-form.js${RUN}`);
const {
  CARDS_PER_PAGE,
  CARD_HEIGHT,
  CARD_WIDTH,
  GRID_X,
  GRID_Y_FROM_TOP,
  MARGIN_X,
  MARGIN_Y,
  MARK_GAP,
  MARK_LENGTH,
  PAGE_HEIGHT,
  PAGE_WIDTH,
  cropMarks,
  paginate,
  slotRect,
} = await import(`../shared/card-layout.js${RUN}`);
const {
  cardSheet,
} = await import(`../shared/card-sheet.js${RUN}`);
const {
  classCardContents,
  fallbackCardContent,
  paginateSections,
  statsCardContent,
} = await import(`../shared/card-content.js${RUN}`);
const {
  MAX_HOPE,
} = await import(`../shared/advancement.js${RUN}`);

// ---------- modules that arrived with upstream's play page ----------
const {
  CONDITIONS,
  DOWNTIME_MOVES_PER_REST,
  HOPE_MAX,
  HOPE_START,
  REST_MOVES,
  applyRestMove,
  clampState,
  defaultState,
  findRestMove,
  maxesFromSheet,
  restClearAmount,
  scarAt,
  tapBox,
  toggleCondition,
} = await import(`../shared/table-state.js${RUN}`);
const {
  LANGUAGES,
  pickLanguage,
  translator,
} = await import(`../shared/i18n.js${RUN}`);
const {
  MAX_BYTES,
  MAX_DECODED_EDGE,
  MAX_EDGE,
  decodedSize,
  fitWithin,
  isPortrait,
  sanitizePortrait,
} = await import(`../shared/portrait.js${RUN}`);
const {
  CHOOSE_KEYS,
  nextIndex,
  tabStopIndex,
} = await import(`../shared/choice-keys.js${RUN}`);
const {
  CARD_ART_EXT,
} = await import(`../shared/card-art-config.js${RUN}`);
const {
  ancestryCardArtPath,
  communityCardArtPath,
  domainCardArtPath,
  subclassCardArtPath,
} = await import(`../shared/card-render.js${RUN}`);

// ---------- tiny runner ----------

const groups = [];
let current = null;

function group(name) {
  current = { name, checks: [] };
  groups.push(current);
}
function check(label, ok, detail) {
  current.checks.push({ label, ok: !!ok, detail });
}
function eq(label, got, want) {
  const g = JSON.stringify(got);
  const w = JSON.stringify(want);
  check(label, g === w, g === w ? undefined : `got  ${g}\nwant ${w}`);
}
function has(label, errors, snippet) {
  const found = errors.some((e) => e.toLowerCase().includes(snippet.toLowerCase()));
  check(label, found, found ? undefined : `no error mentioning "${snippet}" in:\n${errors.join("\n") || "(no errors)"}`);
}

// ---------- fixtures ----------

const DB = {
  classes: [{ id: "cls", domains: ["VALOR", "BLADE"], startingHitPoints: 7, startingEvasion: 9 }],
  domainCards: [
    { id: "c1", level: 1, domain: "VALOR", name: { "en-US": "One" } },
    // Two more level 1 cards, so a starting card has something legal to be exchanged for.
    { id: "c1b", level: 1, domain: "BLADE", name: { "en-US": "One again" } },
    { id: "c1c", level: 1, domain: "BLADE", name: { "en-US": "One once more" } },
    { id: "c2", level: 2, domain: "VALOR", name: { "en-US": "Two" } },
    { id: "c3", level: 3, domain: "BLADE", name: { "en-US": "Three" } },
    { id: "c4", level: 4, domain: "VALOR", name: { "en-US": "Four" } },
    { id: "c5", level: 5, domain: "VALOR", name: { "en-US": "Five" } },
    { id: "c7", level: 7, domain: "BLADE", name: { "en-US": "Seven" } },
    { id: "off", level: 1, domain: "ARCANA", name: { "en-US": "Offdomain" } },
  ],
};

function newCharacter() {
  return ensureLevelFields({
    id: "t", classId: "cls", subclassId: "sub",
    traits: { agility: 1, strength: 2, finesse: 0, instinct: 1, presence: 0, knowledge: -1 },
    experiences: [
      { id: "e1", name: "A", modifier: 2, baseModifier: 2, sinceLevel: 1 },
      { id: "e2", name: "B", modifier: 2, baseModifier: 2, sinceLevel: 1 },
    ],
    domainCardIds: ["c1"], creationDomainCardIds: ["c1"], domainVaultIds: [],
    level: 1, proficiency: 1,
    traitMarks: { agility: false, strength: false, finesse: false, instinct: false, presence: false, knowledge: false },
    hitPointSlotsBonus: 0, stressSlotsBonus: 0, evasionBonus: 0, subclassTier: "foundation",
  });
}

const entry = (level, picks, card, exchange) => ({ level, picks, mandatoryCardId: card, exchange: exchange || null });

// Records a level up the way the level up screen does, then derives the stats.
function record(ch, level, picks, card, exchange) {
  if (isLevelAchievement(level)) {
    ch.experiences.push({ id: `exp_lv${level}`, name: "", baseModifier: 2, modifier: 2, sinceLevel: level });
  }
  ch.levelUps.push(entry(level, picks, card, exchange));
  ch.level = level;
  return recomputeCharacter(ch);
}

function buildTo(levelUps, level) {
  const ch = newCharacter();
  for (const e of levelUps) record(ch, e.level, e.picks, e.mandatoryCardId, e.exchange);
  ch.level = level;
  return recomputeCharacter(ch);
}

// ---------- staleness ----------

// The token above can't reach the import INSIDE history.js, so history.js could still be
// holding a cached advancement.js. This asks it, indirectly, what card cap it believes in
// and compares that with the copy loaded here. If they disagree, something is stale and
// every result below is untrustworthy — so say so rather than report a confident green.
group("The modules under test are the ones on disk");
{
  // boot.js is what puts the token on this file's URL. Without it the browser can serve a
  // cached tests.js, and the suite reports green against a file you've already changed.
  check(
    "this file was loaded through boot.js, so it isn't a cached copy either",
    new URL(import.meta.url).searchParams.has("run"),
    "tests.js was loaded directly, without a cache-busting token. tests/index.html should\n" +
    "point at boot.js. Hard-reload (Ctrl+Shift+R) before trusting anything below.",
  );
}
{
  const probe = newCharacter();
  probe.level = 2;
  recomputeCharacter(probe);
  const errors = validateEntry(probe, entry(2, [
    { key: "domainCard", slotTier: 2, cardId: "c4" },
    { key: "stress", slotTier: 2 },
  ], "c2"), DB);
  const reported = Number(errors.map((e) => e.match(/above the limit of (\d+)/)?.[1]).find(Boolean));
  const direct = extraCardLevelCap(2, 2);
  check(
    "history.js and advancement.js agree on the card cap",
    reported === direct,
    reported === direct ? undefined
      : `history.js is using a cap of ${reported}, this page loaded ${direct}.\n` +
        "One of them is a cached copy — hard-reload (Ctrl+Shift+R) before trusting anything below.",
  );
}

// ---------- the rules, against the printed character sheet ----------

group("Advancement slots match the printed character guide (p.2)");
eq("+1 to two unmarked traits: 3 per tier", [2, 3, 4].map((t) => slotsInTier("traits", t)), [3, 3, 3]);
eq("Hit Point slot: 2 per tier", [2, 3, 4].map((t) => slotsInTier("hitPoint", t)), [2, 2, 2]);
eq("Stress slot: 2 per tier", [2, 3, 4].map((t) => slotsInTier("stress", t)), [2, 2, 2]);
eq("Experiences: 1 per tier", [2, 3, 4].map((t) => slotsInTier("experience", t)), [1, 1, 1]);
eq("Extra domain card: 1 per tier", [2, 3, 4].map((t) => slotsInTier("domainCard", t)), [1, 1, 1]);
eq("Evasion: 1 per tier", [2, 3, 4].map((t) => slotsInTier("evasion", t)), [1, 1, 1]);
eq("Subclass upgrade: tiers 3 and 4 only", [2, 3, 4].map((t) => slotsInTier("subclass", t)), [0, 1, 1]);
eq("Proficiency: 2 joined slots, tiers 3 and 4 only", [2, 3, 4].map((t) => slotsInTier("proficiency", t)), [0, 2, 2]);
// Asked through the row builder, which is the only way the app asks: a stronger check than the
// old one against a constant, because it also proves the builder leaves the printed table alone.
eq("tier 2 offers exactly the six options printed there",
  advancementOptions(3).map((o) => o.key).sort(),
  ["domainCard", "evasion", "experience", "hitPoint", "stress", "traits"]);
eq("tier 3 adds subclass, proficiency and multiclass",
  advancementOptions(5).map((o) => o.key).sort(),
  ["domainCard", "evasion", "experience", "hitPoint", "multiclass", "proficiency", "stress", "subclass", "traits"]);
eq("and level 1 offers nothing at all", advancementOptions(1), []);
eq("proficiency costs both of a level's picks", slotsPerPick("proficiency"), 2);

group("Tiers and achievements");
eq("1 / 2-4 / 5-7 / 8-10", [1, 2, 4, 5, 7, 8, 10].map(tierForLevel), [1, 2, 2, 3, 3, 4, 4]);
eq("achievements at 2, 5 and 8 only", [2, 3, 4, 5, 6, 7, 8, 9].map(isLevelAchievement),
  [true, false, false, true, false, false, true, false]);
eq("subclass ladder stops at mastery", ["foundation", "specialization", "mastery"].map(nextSubclassTier),
  ["specialization", "mastery", "mastery"]);

group("A subclass upgrade adds a card, it doesn't replace the one below");
eq("foundation only, at the start", subclassTiersUpTo("foundation"), ["foundation"]);
eq("specialization keeps the foundation card", subclassTiersUpTo("specialization"), ["foundation", "specialization"]);
eq("mastery keeps both of the earlier cards", subclassTiersUpTo("mastery"), ["foundation", "specialization", "mastery"]);
eq("an unset tier falls back to foundation, like ensureLevelFields", subclassTiersUpTo(undefined), ["foundation"]);
eq("so does a tier name we don't recognise", subclassTiersUpTo("legendary"), ["foundation"]);
eq("the ladder and the labels agree on which tiers exist",
  SUBCLASS_TIER_ORDER.map((t) => SUBCLASS_TIER_LABELS[t]), ["Foundation", "Specialization", "Mastery"]);
// The sheet renders these in array order, so the order here is the left-to-right order of the
// cards. It comes from the constant ladder, never from the character, so it can't drift.
eq("always foundation → specialization → mastery, whatever tier you're at",
  ["mastery", "foundation", "specialization"].map((t) => subclassTiersUpTo(t).join(" → ")),
  ["foundation → specialization → mastery", "foundation", "foundation → specialization"]);

group("Extra domain card: capped by your level AND by the slot's tier");
eq("tier caps as printed on the sheet", TIER_CARD_CAP, { 2: 4, 3: 7, 4: 10 });
eq("level 2, tier-2 slot — your level binds", extraCardLevelCap(2, 2), 2);
eq("level 4, tier-2 slot — they agree", extraCardLevelCap(4, 2), 4);
eq("level 6, tier-2 slot — the slot binds, not your level", extraCardLevelCap(6, 2), 4);
eq("level 8, tier-2 slot — still 4", extraCardLevelCap(8, 2), 4);
eq("level 6, tier-3 slot — your level binds", extraCardLevelCap(6, 3), 6);
eq("level 9, tier-3 slot — the slot binds", extraCardLevelCap(9, 3), 7);
eq("level 9, tier-4 slot — your level binds", extraCardLevelCap(9, 4), 9);

group("Slots accumulate across tiers ('from your tier or below')");
eq("traits at tier 2", totalSlotsForOption("traits", 2), 3);
eq("traits at tier 3 includes tier 2's", totalSlotsForOption("traits", 3), 6);
eq("traits at tier 4 includes both", totalSlotsForOption("traits", 4), 9);
{
  const used = blankSlotsUsed();
  used.traits[2] = 3;
  used.traits[3] = 1;
  eq("used counts every tier", usedSlotsForOption(used, "traits"), 4);
  const traitsAt6 = optionFor(advancementOptions(6, { used }), "traits");
  eq("remaining at level 6", remainingSlots(traitsAt6, used), 2);
}

// The Brawler's Combo Strike is the case this exists for — "Once per tier, you can increase your
// Combo Die by one step as a level advancement option" — but nothing here may name it, so the
// fixture declares the same shape on a class of its own.
const GADGET_KEY = "cls:Escalating Gadget";
const GADGET_OPTION = { label: "Improve your gadget", slots: { 2: 1, 3: 1, 4: 1 } };
const ADV_DB = {
  classes: [{
    id: "cls", name: "TINKER", domains: ["VALOR"], startingHitPoints: 6, startingEvasion: 10,
    classFeatures: [{ name: { "en-US": "Escalating Gadget" } }],
  }],
  subclasses: [{ id: "sub", name: { "en-US": "Tinker Sub" }, class: "TINKER" }],
  domainCards: [
    { id: "c1", level: 1, domain: "VALOR", name: { "en-US": "A Card" } },
    { id: "c2", level: 1, domain: "VALOR", name: { "en-US": "Another Card" } },
    { id: "c3", level: 1, domain: "VALOR", name: { "en-US": "A Third Card" } },
  ],
  effects: { [GADGET_KEY]: { advancementOption: GADGET_OPTION } },
};
const rowsFor = (ch, db = ADV_DB) => advancementOptionsFor(ch, db);
const gadgetRow = (ch, db) => optionFor(rowsFor(ch, db), GADGET_KEY);

group("A class can add a row to the advancement table without the code knowing its name");
{
  const ch = newCharacter();
  ch.level = 5;
  const rows = rowsFor(ch);
  eq("the printed table comes first, in its printed order",
    rows.slice(0, 9).map((o) => o.key),
    ["traits", "hitPoint", "stress", "experience", "domainCard", "evasion", "subclass", "proficiency", "multiclass"]);
  eq("the declared row is appended, never inserted", rows[9].key, GADGET_KEY);
  eq("it carries the label the source wrote", rows[9].label, "Improve your gadget");
  eq("and its own per-tier slots", rows[9].slots, { 2: 1, 3: 1, 4: 1 });
  eq("it is marked as declared", rows[9].source, "declared");
  // Not declarable, because the replay resolves picks with no content in hand.
  eq("it costs one of the level's two points", rows[9].cost, 1);
  eq("and marks exactly one slot", rows[9].slotsPerPick, 1);
  eq("no row appears twice", rows.length, new Set(rows.map((o) => o.key)).size);

  const later = { ...ADV_DB, effects: { [GADGET_KEY]: { advancementOption: { ...GADGET_OPTION, slots: { 3: 1 } } } } };
  const atThree = newCharacter(); atThree.level = 3;
  check("a row that starts at tier 3 isn't offered at level 3", !gadgetRow(atThree, later));
  check("and is at level 5", !!gadgetRow(ch, later));

  // A source may add a row; it may never redefine one.
  const collide = { ...ADV_DB, effects: { traits: { advancementOption: { label: "Nope", slots: { 2: 9 } } } } };
  eq("a declared key colliding with a printed one is ignored",
    optionFor(rowsFor(ch, collide), "traits").label, "+1 to two unmarked traits");
}

group("A declared row needs no new state in the replay");
{
  const ch = newCharacter();
  record(ch, 2, [{ key: GADGET_KEY, slotTier: 2, optionLabel: "Improve your gadget" }, { key: "stress", slotTier: 2 }], "c2");
  eq("the slot is marked like any other", ch.advancementSlotsUsed[GADGET_KEY], { 2: 1, 3: 0, 4: 0 });
  eq("used counts it", usedSlotsForOption(ch.advancementSlotsUsed, GADGET_KEY), 1);
  // It moves nothing: what the die then reads is the track beside it, not arithmetic done here.
  // Proficiency is 2 because level 2 is an achievement level, not because of this pick.
  eq("it moves no stat of its own", [ch.hitPointSlotsBonus, ch.evasionBonus], [0, 0]);
  eq("the other pick still applied", ch.stressSlotsBonus, 1);
  eq("nothing is credited to it", advancementCredits(ch).hitPoint, []);
  eq("the history list prints the label, not the key",
    describeLevelUp(ch, ch.levelUps[0], ADV_DB).includes("Improve your gadget"), true);
  eq("and the label is readable back off the character",
    recordedOptionLabels(ch)[GADGET_KEY], "Improve your gadget");

  eq("a legal declared pick is not an error", validateEntry(ch, ch.levelUps[0], ADV_DB), []);
  // The regression this whole change turns on: before it, EVERY declared pick reported the
  // literal sentence "undefined: no tier 2 slot left to mark." on every load, forever.
  const twice = entry(2, [{ key: GADGET_KEY, slotTier: 2 }, { key: GADGET_KEY, slotTier: 2 }], "c2");
  const errors = validateEntry(ch, twice, ADV_DB);
  check("marking a once-per-tier row twice in one tier is an error", errors.length > 0);
  check("and no message says 'undefined'", !errors.some((e) => e.includes("undefined")));
  check("the message names the row", errors.some((e) => e.includes("Improve your gadget")));
}

group("A slot stays marked when whatever declared it has gone");
{
  const ch = newCharacter();
  record(ch, 2, [{ key: GADGET_KEY, slotTier: 2, optionLabel: "Improve your gadget" }, { key: "stress", slotTier: 2 }], "c2");
  const gone = { ...ADV_DB, effects: {} };
  const row = gadgetRow(ch, gone);
  check("the row is still drawn", !!row);
  eq("as an orphan", row.source, "orphan");
  eq("with exactly the slots that were spent", row.slots, { 2: 1, 3: 0, 4: 0 });
  eq("labelled from what the pick recorded", row.label, "Improve your gadget");
  eq("and offering nothing free", remainingSlots(row, ch.advancementSlotsUsed), 0);
  check("the level now reads as one this character can't account for",
    validateEntry(ch, ch.levelUps[0], gone).some((e) => e.includes("Improve your gadget")));

  // An author who shrinks a declaration can't un-mark a slot either.
  const shrunk = { ...ADV_DB, effects: { [GADGET_KEY]: { advancementOption: { ...GADGET_OPTION, slots: { 3: 1 } } } } };
  eq("a shrunk declaration keeps the marks it already had",
    gadgetRow(ch, shrunk).slots, { 2: 1, 3: 1, 4: 0 });
}

// A ladder climbed by taking the option above, and one climbed by levelling. Both print a string
// the source wrote; nothing here knows that d8 beats d6.
const GADGET_STEPS = ["d4", "d6", "d8", "d10"];
const TRACK_DB = {
  ...ADV_DB,
  effects: {
    [GADGET_KEY]: {
      track: { id: "gadget_die", label: "Gadget Die", steps: GADGET_STEPS },
      advancementOption: { ...GADGET_OPTION, advances: "gadget_die" },
    },
  },
};
const trackOn = (ch, db = TRACK_DB) => characterTracks(ch, db)[0];

group("A track counts how many times its option was taken");
{
  const fresh = newCharacter();
  eq("before anything is spent, it reads where it starts", trackOn(fresh).value, "d4");
  eq("and says what's next", trackOn(fresh).next, "d6");

  const ch = newCharacter();
  record(ch, 2, [{ key: GADGET_KEY, slotTier: 2 }, { key: "stress", slotTier: 2 }], "c2");
  record(ch, 3, [{ key: GADGET_KEY, slotTier: 3 }, { key: "stress", slotTier: 2 }], "c3");
  eq("one rung per mark", trackOn(ch).value, "d8");
  eq("the breakdown attributes each to its level",
    trackOn(ch).parts.map((p) => `${p.label} ${p.value}`),
    ["Where it starts d4", "Level 2 advancement d6", "Level 3 advancement d8"]);
  // The popover prints a Total row only for a stat that has one, and a die isn't a sum.
  eq("and carries no total", trackOn(ch).total, undefined);

  // No levelUps at all: the count comes off the slots, not the replay, so an imported character
  // baselined above level 1 still reads right.
  const imported = newCharacter();
  imported.level = 8;
  imported.baselineLevel = 8;
  imported.advancementSlotsUsed[GADGET_KEY] = { 2: 1, 3: 1, 4: 0 };
  eq("a character with no recorded levels still reads its rung", trackOn(imported).value, "d8");
  eq("with the unattributed marks leading, rather than inventing a level for them",
    trackOn(imported).parts.map((p) => p.label),
    ["Where it starts", "An earlier advancement", "An earlier advancement"]);

  const over = newCharacter();
  over.advancementSlotsUsed[GADGET_KEY] = { 2: 1, 3: 1, 4: 3 };
  eq("more marks than rungs stops at the last one", trackOn(over).value, "d10");
  eq("and says so", trackOn(over).capped, true);
  eq("with nothing beyond it", trackOn(over).next, null);

  // The row's label says what the box actually buys, the way the extra card row prints its caps.
  const atTwo = newCharacter();
  atTwo.level = 2;
  eq("the option's row says which rung it buys",
    optionFor(advancementOptionsFor(atTwo, TRACK_DB), GADGET_KEY).hint, " (d4 → d6)");
  eq("and follows the marks already made",
    optionFor(advancementOptionsFor(ch, TRACK_DB), GADGET_KEY).hint, " (d8 → d10)");
  // Display only. A pick records the label, and a transition is true at the moment it's shown —
  // baked into the label it would read as a claim about a step that may since have moved.
  eq("but the label itself stays the sentence the source wrote",
    optionFor(advancementOptionsFor(atTwo, TRACK_DB), GADGET_KEY).label, "Improve your gadget");
}

group("A track can climb by level, or be replaced outright");
{
  const byLevelDb = {
    ...ADV_DB,
    effects: { [GADGET_KEY]: { track: { id: "gadget_die", label: "Gadget Die", byLevel: { 1: "d6", 5: "d8" } } } },
  };
  const ch = newCharacter();
  ch.level = 4;
  eq("below the threshold it reads the lower rung", trackOn(ch, byLevelDb).value, "d6");
  has("and says what's coming", [trackOn(ch, byLevelDb).note], "level 5");
  ch.level = 5;
  eq("at the threshold it steps up", trackOn(ch, byLevelDb).value, "d8");
  eq("the breakdown shows only the rungs actually reached",
    trackOn(ch, byLevelDb).parts.map((p) => p.label), ["Where it starts", "Level 5"]);
  eq("and there's nothing further to promise", trackOn(ch, byLevelDb).note, null);

  // A subclass revising its class's die. The override wins because collectEffects reads subclass
  // tiers after class features — no precedence rule of its own.
  const overridden = {
    ...byLevelDb,
    subclasses: [{ id: "sub", name: { "en-US": "S" }, class: "TINKER", foundation: {}, specialization: {}, mastery: {} }],
    effects: {
      ...byLevelDb.effects,
      "sub:mastery": { track: { id: "gadget_die", label: "Gadget Die", value: "d12" } },
    },
  };
  eq("at foundation the class's ladder stands", trackOn(ch, overridden).value, "d8");
  const master = { ...ch, subclassTier: "mastery" };
  eq("at mastery the subclass's value replaces it", trackOn(master, overridden).value, "d12");
  eq("and only one row is shown, not two", characterTracks(master, overridden).length, 1);
}

// A second class to multiclass into. Its subclass joins by NAME, the way data/ does it.
const MC_DB = {
  ...ADV_DB,
  classes: [
    ...ADV_DB.classes,
    { id: "cls2", name: "SPARK", domains: ["ARCANA", "MIDNIGHT"], startingHitPoints: 5, startingEvasion: 10 },
    // Shares one of the first class's domains, to prove the other one is still offered.
    { id: "cls3", name: "EMBER", domains: ["VALOR", "MIDNIGHT"] },
  ],
  subclasses: [...ADV_DB.subclasses, { id: "sub2", name: { "en-US": "Spark Sub" }, class: "SPARK" }],
};
const MULTICLASS = { key: "multiclass", slotTier: 3, classId: "cls2", subclassId: "sub2", domain: "ARCANA" };
const usedWith = (over) => ({ ...blankSlotsUsed(), ...over });
const rowIn = (level, used, key) => optionFor(advancementOptions(level, { used }), key);

group("Multiclass is a printed row that takes the whole level, from tier 3");
{
  eq("two slots in tiers 3 and 4, none in tier 2", [2, 3, 4].map((t) => slotsInTier("multiclass", t)), [0, 2, 2]);
  eq("it costs both of a level's choice points", optionCost("multiclass"), 2);
  eq("and marks both of its tier's boxes", slotsPerPick("multiclass"), 2);
  check("so it isn't offered before level 5", !optionFor(advancementOptions(4), "multiclass"));
  check("and is from level 5 on", !!optionFor(advancementOptions(5), "multiclass"));
}

group("Taking one of them crosses out the other, per tier");
{
  const mcAt3 = usedWith({ multiclass: { 2: 0, 3: 2, 4: 0 } });
  eq("multiclassing crosses that tier's subclass slot", rowIn(9, mcAt3, "subclass").crossedOut, { 2: 0, 3: 1, 4: 0 });
  eq("and every multiclass slot in the other tier", rowIn(9, mcAt3, "multiclass").crossedOut, { 2: 0, 3: 0, 4: 2 });
  eq("the tier it was taken in is marked, not crossed", rowIn(9, mcAt3, "multiclass").crossedOut[3], 0);
  eq("and says which option did it", rowIn(9, mcAt3, "subclass").crossedBy[3], "multiclass");
  // The other direction, which is also why an already-spent subclass slot needs no rule of its
  // own: spending it is what crossed out that tier's multiclass.
  const subAt3 = usedWith({ subclass: { 2: 0, 3: 1, 4: 0 } });
  eq("upgrading a subclass crosses that tier's multiclass", rowIn(9, subAt3, "multiclass").crossedOut, { 2: 0, 3: 2, 4: 0 });
  check("but leaves the other tier's alone", rowIn(9, subAt3, "multiclass").crossedOut[4] === 0);
  eq("a character who took neither has nothing crossed", rowIn(9, blankSlotsUsed(), "multiclass").crossedTotal, 0);
  // Without this the level up screen believes there are points left for boxes nobody can mark.
  eq("a crossed slot isn't a slot you have left",
    remainingSlots(rowIn(9, mcAt3, "multiclass"), mcAt3), 0);
  eq("nor on the row it crossed", remainingSlots(rowIn(9, mcAt3, "subclass"), mcAt3), 1);
}

group("A multiclass is recorded on the pick and derived by the replay");
{
  const fresh = newCharacter();
  eq("a character who never took it reads null, not undefined", fresh.multiclass, null);

  const ch = newCharacter();
  ch.level = 4;
  record(ch, 5, [MULTICLASS], "c2");
  eq("the replay derives it, with the level it was taken at and its own subclass ladder",
    ch.multiclass, { classId: "cls2", subclassId: "sub2", domain: "ARCANA", level: 5, tier: "foundation" });
  eq("both of the tier's boxes are marked", ch.advancementSlotsUsed.multiclass, { 2: 0, 3: 2, 4: 0 });
  eq("it moves no stat", [ch.hitPointSlotsBonus, ch.stressSlotsBonus, ch.evasionBonus], [0, 0, 0]);
  eq("and is credited with nothing", advancementCredits(ch).evasion, []);
  eq("the history line names the class and what was chosen",
    describeLevelUp(ch, ch.levelUps[0], MC_DB), ["Multiclass: Spark (Spark Sub, Arcana)"]);

  // The rewind is the easy one to get wrong: characterAtLevel spreads the character, so without
  // an override the class taken at 5 would be in hand while validating level 3.
  eq("the character as they stood before it has no second class",
    characterAtLevel(ch, stateAtLevel(ch, 5)).multiclass, null);
  eq("and after it, does", characterAtLevel(ch, stateAtLevel(ch, 6)).multiclass.classId, "cls2");

  ch.levelUps = [];
  recomputeCharacter(ch);
  eq("removing the level takes the second class away again", ch.multiclass, null);

  // captureBaseline runs once per character, so every save written before this existed has a
  // baseline with no such key and nothing will ever add one.
  const legacy = newCharacter();
  delete legacy.baseline.multiclass;
  legacy.level = 3;
  recomputeCharacter(legacy);
  eq("a baseline saved before this field existed still replays", legacy.multiclass, null);

  const twice = newCharacter();
  twice.level = 4;
  record(twice, 5, [MULTICLASS], "c2");
  record(twice, 8, [{ ...MULTICLASS, slotTier: 4, classId: "cls3", domain: "MIDNIGHT" }], "c3");
  eq("two recorded picks keep the earlier one, so nothing it allowed becomes illegal",
    twice.multiclass.classId, "cls2");
}

group("What a multiclass pick has to say for itself");
{
  const ch = newCharacter();
  ch.level = 4;
  record(ch, 5, [MULTICLASS], "c2");
  const at = (level, picks, card) => validateEntry(ch, entry(level, picks, card), MC_DB);
  eq("a legal one is silent", validateEntry(ch, ch.levelUps[0], MC_DB), []);

  has("a second multiclass is refused, its slots being crossed out",
    at(8, [{ ...MULTICLASS, slotTier: 4 }], "c3"), "crossed out");
  has("and so is a subclass upgrade in the tier it was taken in",
    at(6, [{ key: "subclass", slotTier: 3 }, { key: "stress", slotTier: 2 }], "c3"), "crossed out");
  check("but not one in the other tier",
    !at(8, [{ key: "subclass", slotTier: 4 }, { key: "stress", slotTier: 2 }], "c3").some((e) => e.includes("crossed")));

  const plain = newCharacter();
  plain.level = 4;
  const at5 = (pick) => validateEntry(plain, entry(5, [{ ...MULTICLASS, ...pick }], "c2"), MC_DB);
  has("half a payload is refused", at5({ subclassId: null }), "choose a class");
  has("your own class isn't an additional class", at5({ classId: "cls", subclassId: "sub" }), "already has");
  has("a class that isn't in the catalogue", at5({ classId: "gone" }), "catalogue");
  has("a domain that class hasn't got", at5({ domain: "VALOR" }), "no Valor domain");
  has("a domain you already have", at5({ classId: "cls3", domain: "VALOR" }), "already has access to");
  has("a subclass belonging to another class", at5({ subclassId: "sub" }), "isn't one of Spark's");
}

group("Being at Mastery doesn't stand in the way of multiclassing");
{
  // The subclass row is blocked at Mastery, but its SLOT is unused — so there's something to
  // cross out, and multiclassing is exactly what a character with nowhere left to spend it does.
  const ch = newCharacter();
  ch.level = 4;
  ch.baseline.subclassTier = "mastery";
  ch.subclassTier = "mastery";
  recomputeCharacter(ch);
  eq("no complaint about the subclass", validateEntry(ch, entry(5, [MULTICLASS], "c2"), MC_DB), []);
}

group("The second class's domain, at half your level");
{
  eq("half of an odd level rounds up", [5, 6, 7, 9].map(halfLevelCap), [3, 3, 4, 5]);

  const access = (level, baseCap, mc = { domain: "ARCANA" }) => domainAccess(["VALOR"], mc, level, baseCap);
  eq("your own domains keep the caller's limit", access(7, 7).capFor("VALOR"), 7);
  eq("the new one is halved", access(7, 7).capFor("ARCANA"), 4);
  eq("a lower limit still binds — a tier 2 slot caps at 4 whatever your level",
    access(9, extraCardLevelCap(9, 2)).capFor("ARCANA"), 4);
  eq("a domain neither class has is no access at all", access(7, 7).capFor("MIDNIGHT"), null);
  eq("and with no second class, only your own", access(7, 7, null).domains, ["VALOR"]);
  // Multiclassing must never make a card you could already take illegal.
  eq("a domain reachable both ways keeps the better cap",
    domainAccess(["VALOR"], { domain: "VALOR" }, 7, 7).capFor("VALOR"), 7);
}

group("Cards from the second domain are judged by that cap");
{
  const ch = newCharacter();
  ch.level = 4;
  record(ch, 5, [MULTICLASS], "c2");
  const cardDb = {
    ...MC_DB,
    domainCards: [
      ...MC_DB.domainCards,
      { id: "a3", level: 3, domain: "ARCANA", name: { "en-US": "Arcana Three" } },
      { id: "a5", level: 5, domain: "ARCANA", name: { "en-US": "Arcana Five" } },
      { id: "m1", level: 1, domain: "MIDNIGHT", name: { "en-US": "Midnight One" } },
    ],
  };
  const at6 = (card) => validateEntry(ch, entry(6, [{ key: "evasion", slotTier: 2 }, { key: "stress", slotTier: 2 }], card), cardDb);
  eq("a level 3 card from the new domain is fine at level 6", at6("a3"), []);
  has("a level 5 one is not, half of 6 being 3", at6("a5"), "above the limit of 3");
  has("and a domain neither class has is still refused", at6("m1"), "isn't in a domain");
  // The sheet takes the advancements before the card, so the level you multiclass at already has it.
  eq("the card granted by the very level that multiclassed may come from the new domain",
    validateEntry(ch, entry(5, [MULTICLASS], "a3"), cardDb), []);

  // The domain is stored as a plain string precisely so this keeps working.
  const noClass = { ...cardDb, classes: cardDb.classes.filter((c) => c.id !== "cls2") };
  eq("and stays legal when the second class record has gone missing", at6("a3"), []);
  eq("even with the class removed from the catalogue", validateEntry(ch, entry(6, [{ key: "evasion", slotTier: 2 }, { key: "stress", slotTier: 2 }], "a3"), noClass), []);
}

group("A second class brings its features, and its foundation card");
{
  const featureDb = {
    ...MC_DB,
    classes: MC_DB.classes.map((c) => (c.id !== "cls2" ? c : {
      ...c,
      classFeatures: [{ name: { "en-US": "Gizmo" } }],
      hopeFeature: { name: { "en-US": "Hopeful" } },
    })),
    subclasses: MC_DB.subclasses.map((s) => (s.id !== "sub2" ? s : {
      ...s, foundation: { features: [{ name: { "en-US": "Groundwork" } }] },
      specialization: { features: [{ name: { "en-US": "Later" } }] },
    })),
    effects: {
      ...MC_DB.effects,
      "cls2:Gizmo": { evasion: 1 },
      "cls2:Hopeful": { evasion: 100 },
      "sub2:foundation": { stressSlots: 1 },
      "sub2:specialization": { stressSlots: 100 },
    },
  };
  const ch = newCharacter();
  ch.level = 4;
  record(ch, 5, [MULTICLASS], "c2");
  const keys = collectEffects(ch, featureDb).map((e) => e.key);
  check("its class feature applies", keys.includes("cls2:Gizmo"));
  check("its Hope feature does not — the module doesn't hand one over", !keys.includes("cls2:Hopeful"));
  check("the foundation card you took applies", keys.includes("sub2:foundation"));
  // Its ladder starts at the foundation card you took; a later upgrade that names it climbs.
  check("and only the tier it has reached", !keys.includes("sub2:specialization"));
  eq("so the numbers reach the sheet", effectBonuses(ch, featureDb).evasion, 1);

  const before = newCharacter();
  eq("a character without a second class collects none of it", effectBonuses(before, featureDb).evasion, 0);

  // Combat Training is a class feature, so multiclassing into the class that has it brings it.
  const trained = {
    ...featureDb,
    classes: featureDb.classes.map((c) => (c.id !== "cls2" ? c : { ...c, classFeatures: [{ name: { "en-US": "Combat Training" } }] })),
  };
  check("burden exemption comes from either class", ignoresBurden(ch, trained));
  check("but not from a class you didn't take", !ignoresBurden(newCharacter(), trained));
}

group("Two Spellcast traits are alternatives, not a sum");
{
  const castDb = {
    ...MC_DB,
    subclasses: [
      { id: "sub", name: { "en-US": "First" }, class: "TINKER", spellcastTrait: "KNOWLEDGE" },
      { id: "sub2", name: { "en-US": "Spark Sub" }, class: "SPARK", spellcastTrait: "INSTINCT" },
      { id: "sub_mute", name: { "en-US": "Mute" }, class: "TINKER" },
    ],
  };
  const ch = newCharacter();
  ch.level = 4;
  record(ch, 5, [MULTICLASS], "c2");

  eq("both are offered, in the order they were gained", spellcastTraitKeys(ch, castDb), ["knowledge", "instinct"]);
  eq("one class, one trait", spellcastTraitKeys(newCharacter(), castDb), ["knowledge"]);

  const one = derivedStats(newCharacter(), castDb).spellcast;
  eq("a single trait prints exactly as it always did", one.display, "Knowledge");
  const two = derivedStats(ch, castDb).spellcast;
  eq("two print as alternatives", two.display, "Knowledge / Instinct");
  eq("with a part each", two.parts.map((p) => p.label),
    ["Spellcast trait: Knowledge", "Spellcast trait: Instinct"]);
  eq("and no total, the popover having nothing to sum", two.total, undefined);
  has("the note says the choice is per roll", [two.note], "each roll");

  // A Guardian or Warrior who multiclasses into a caster gains their first, with nothing to choose.
  const mute = { ...ch, subclassId: "sub_mute" };
  eq("a class with no Spellcast trait borrows the one it multiclassed into",
    derivedStats(mute, castDb).spellcast.display, "Instinct");
}

group("A foundation card that grants a card grants it at the level you multiclass");
{
  // School of Knowledge's shape: the foundation card hands over an extra domain card, and you
  // took that card by multiclassing, so the level grants one.
  const grantDb = {
    ...MC_DB,
    subclasses: MC_DB.subclasses.map((s) => (s.id !== "sub2" ? s : { ...s, foundation: { features: [] } })),
    effects: { ...MC_DB.effects, "sub2:foundation": { extraDomainCards: 1 } },
  };
  const ch = newCharacter();
  ch.level = 4;
  const level5 = { ...entry(5, [MULTICLASS], "c2"), grantedCardIds: ["c3"] };
  eq("the level that takes it is legal with one granted card recorded",
    validateEntry(ch, level5, grantDb), []);
  has("and reports it missing when none was recorded",
    validateEntry(ch, entry(5, [MULTICLASS], "c2"), grantDb), "0 chosen, 1 granted");

  // Only at that level: from the next one on, the character already had the feature.
  record(ch, 5, [MULTICLASS], "c2", null);
  ch.levelUps[0].grantedCardIds = ["c3"];
  recomputeCharacter(ch);
  eq("the level after grants nothing further",
    validateEntry(ch, entry(6, [{ key: "evasion", slotTier: 2 }, { key: "stress", slotTier: 2 }], "c1"), grantDb)
      .filter((e) => e.includes("granted")), []);
}

group("A subclass upgrade can climb either subclass");
{
  const ladderDb = {
    ...MC_DB,
    subclasses: MC_DB.subclasses.map((x) => {
      if (x.id === "sub") return { ...x, foundation: {}, specialization: {}, mastery: {} };
      if (x.id === "sub2") return { ...x, foundation: {}, specialization: {}, mastery: {} };
      return x;
    }),
    effects: {
      ...MC_DB.effects,
      "sub:specialization": { evasion: 1 },
      "sub2:specialization": { stressSlots: 1 },
    },
  };
  const built = () => {
    const ch = newCharacter();
    ch.level = 4;
    record(ch, 5, [MULTICLASS], "c2");
    return ch;
  };

  eq("a multiclass starts its subclass at foundation", built().multiclass.tier, "foundation");

  const own = built();
  record(own, 8, [{ key: "subclass", slotTier: 4 }, { key: "stress", slotTier: 2 }], "c3");
  eq("an upgrade with no target climbs your own, as it always did", own.subclassTier, "specialization");
  eq("and leaves the second one alone", own.multiclass.tier, "foundation");
  eq("so its specialization is what applies", effectBonuses(own, ladderDb).evasion, 1);

  const second = built();
  record(second, 8, [{ key: "subclass", slotTier: 4, target: "multiclass" }, { key: "stress", slotTier: 2 }], "c3");
  eq("an upgrade that names the multiclass climbs that one", second.multiclass.tier, "specialization");
  eq("and leaves your own at foundation", second.subclassTier, "foundation");
  eq("so ITS specialization is what applies", effectBonuses(second, ladderDb).stressSlots, 1);
  eq("with no evasion from the other ladder", effectBonuses(second, ladderDb).evasion, 0);
  eq("the level is legal", validateEntry(second, second.levelUps[1], ladderDb), []);

  // Mastery needs two upgrades, and multiclassing spends one of the two slots.
  const maxed = built();
  maxed.baseline.multiclass = null;
  maxed.multiclass = { ...maxed.multiclass, tier: "mastery" };
  has("a second subclass that's already at Mastery is refused",
    validateEntry({ ...maxed, baseline: { ...maxed.baseline, multiclass: { ...maxed.multiclass } } },
      entry(8, [{ key: "subclass", slotTier: 4, target: "multiclass" }, { key: "stress", slotTier: 2 }], "c3"),
      ladderDb),
    "second subclass is already at Mastery");
  has("and so is naming a multiclass the character hasn't got",
    validateEntry(newCharacter(), entry(8, [{ key: "subclass", slotTier: 4, target: "multiclass" }, { key: "stress", slotTier: 2 }], "c2"), ladderDb),
    "no second subclass");

  // The baseline must not move when a ladder does.
  const baselineCheck = built();
  record(baselineCheck, 8, [{ key: "subclass", slotTier: 4, target: "multiclass" }, { key: "stress", slotTier: 2 }], "c3");
  recomputeCharacter(baselineCheck);
  eq("replaying twice doesn't climb twice", baselineCheck.multiclass.tier, "specialization");
}

group("A second class shows up wherever the first one does");
{
  const showDb = {
    ...MC_DB,
    classes: MC_DB.classes.map((c) => (c.id !== "cls2" ? c : {
      ...c, classFeatures: [{ name: { "en-US": "Gizmo" }, description: [{ paragraph: { "en-US": "It whirrs." } }] }],
      hopeFeature: { name: { "en-US": "Hopeful" } },
    })),
    subclasses: MC_DB.subclasses.map((s) => (s.id !== "sub2" ? s : {
      ...s, foundation: { features: [{ name: { "en-US": "Groundwork" }, description: [{ paragraph: { "en-US": "It holds." } }] }] },
    })),
  };
  const ch = newCharacter();
  // deriveSheet reads the heritage, which the advancement fixtures don't carry.
  ch.heritage = { ancestryMode: "pure", ancestryIds: [], chosenFeatures: [], communityId: null };
  ch.equipment = { primaryWeaponId: null, secondaryWeaponId: null, armorId: null, potionChoice: null };
  ch.background = { description: "", answers: "" };
  ch.level = 4;
  record(ch, 5, [MULTICLASS], "c2");

  const sheet = deriveSheet(ch, showDb);
  eq("the printed sheet names the class, the subclass and the domain",
    sheet.multiclass, { className: "Spark", subclassName: "Spark Sub", domain: "Arcana" });
  eq("and prints its features, labelled with where each came from",
    sheet.multiclassFeatures.map((f) => `${f.source}: ${f.name}`),
    ["Spark: Gizmo", "Spark Sub (Foundation): Groundwork"]);
  check("but not its Hope feature", !sheet.multiclassFeatures.some((f) => f.name === "Hopeful"));
  const plain = { ...newCharacter(), heritage: ch.heritage, equipment: ch.equipment, background: ch.background };
  eq("a character without one prints nothing", deriveSheet(plain, showDb).multiclass, null);

  // The column functions directly: csvRowForCharacter returns the joined line, and splitting a
  // CSV row on commas is exactly the thing quoting exists to defeat.
  const cell = (who, header) => CSV_COLUMNS.find((c) => c.header === header)
    .value(rowContext(who, showDb, true));
  const at = (h) => cell(ch, h);
  eq("the export carries the class", at("multiclass"), "Spark");
  eq("the domain", at("multiclass-domain"), "Arcana");
  eq("and the subclass", at("multiclass-subclass"), "Spark Sub");
  // The second subclass climbs its own ladder, so it exports its own rung rather than borrowing
  // the first one's: this character is at Foundation in both, and the two can differ.
  eq("and the rung that subclass is on", at("multiclass-subclass-tier"), "Foundation");
  // A pair per group rather than one combined cell, so a consumer with a slot for each can
  // fill them without guessing where the class's features end and the subclass's begin.
  eq("the class's own features get their own pair", at("multiclass-feature-names"), "Gizmo");
  has("with their text", [at("multiclass-feature-texts")], "It whirrs.");
  eq("and the subclass's foundation another",
    at("multiclass-subclass-foundation-feature-names"), "Groundwork");
  has("with its text", [at("multiclass-subclass-foundation-feature-texts")], "Groundwork:");
  eq("a tier this character hasn't reached is empty",
    at("multiclass-subclass-specialization-feature-names"), "");
  check("and the Hope feature is in none of them",
    !["multiclass-feature-texts", "multiclass-subclass-foundation-feature-texts"]
      .some((h) => at(h).includes("Hopeful")));
  eq("a character without one leaves them empty", cell(plain, "multiclass"), "");
  // Empty rather than "Foundation": a character with no second subclass is not standing on the
  // bottom rung of one.
  eq("and says nothing about a rung that isn't there", cell(plain, "multiclass-subclass-tier"), "");
  eq("and their feature columns too", cell(plain, "multiclass-subclass-foundation-feature-names"), "");

  // Both ids are reported, so a renamed folder says what went missing rather than quietly
  // dropping the features. The domain isn't an id and needs no check.
  eq("a multiclass this browser can't resolve is reported",
    unresolvedReferences(ch, { classes: [MC_DB.classes[0]], subclasses: [], domainCards: MC_DB.domainCards }),
    [{ kind: "subclass", id: "sub" }, { kind: "class", id: "cls2" }, { kind: "subclass", id: "sub2" }]);
}

group("Hit Point and Stress cap at 12");
eq("hit point cap", MAX_HIT_POINT_SLOTS, 12);
eq("stress cap", MAX_STRESS_SLOTS, 12);
check("a guardian would pass 12 without the cap", 7 + 6 > MAX_HIT_POINT_SLOTS);
check("stress lands exactly on 12, so it can't breach", 6 + 6 === MAX_STRESS_SLOTS);

// ---------- migration ----------

// The creation wizard hands over a character with none of these fields and traits still
// unassigned, which is a different starting point from anything loaded out of storage.
group("A character straight out of the creation wizard");
{
  const fresh = ensureLevelFields({
    id: "new", classId: null, subclassId: null,
    traits: { agility: null, strength: null, finesse: null, instinct: null, presence: null, knowledge: null },
    experiences: [
      { id: "exp_start1", name: "", modifier: 2, baseModifier: 2, sinceLevel: 1 },
      { id: "exp_start2", name: "", modifier: 2, baseModifier: 2, sinceLevel: 1 },
    ],
    domainCardIds: [], creationDomainCardIds: [], domainVaultIds: [],
    level: 1, proficiency: 1,
    traitMarks: { agility: false, strength: false, finesse: false, instinct: false, presence: false, knowledge: false },
    hitPointSlotsBonus: 0, stressSlotsBonus: 0, evasionBonus: 0, subclassTier: "foundation",
    advancementSlotsUsed: blankSlotsUsed(),
  });
  eq("it baselines at level 1", fresh.baselineLevel, 1);
  check("it has somewhere to record levels", Array.isArray(fresh.levelUps));
  check("it has a baseline to replay from", !!fresh.baseline);
  eq("unassigned traits survive normalisation", fresh.baseline.traits.agility, null);

  // The traits step writes to the baseline and re-derives; that must not throw on nulls.
  fresh.baseline.traits.agility = 2;
  recomputeCharacter(fresh);
  eq("assigning a starting trait shows up on the character", fresh.traits.agility, 2);
  eq("the ones still unassigned stay null", fresh.traits.strength, null);

  // Then the cards, which the wizard sets the same way.
  fresh.creationDomainCardIds = ["c1", "c2"];
  recomputeCharacter(fresh);
  eq("starting cards become the collection", fresh.domainCardIds, ["c1", "c2"]);

  record(fresh, 2, [{ key: "evasion", slotTier: 2 }, { key: "stress", slotTier: 2 }], "c3");
  eq("and it levels up from there", fresh.level, 2);
  eq("the level 2 achievement grants proficiency", fresh.proficiency, 2);
  eq("the new Experience is tagged with the level that granted it",
    fresh.experiences.map((e) => e.sinceLevel), [1, 1, 2]);
  eq("the collection keeps the starting cards", fresh.domainCardIds, ["c1", "c2", "c3"]);
}

group("A character saved before any of this still opens");
{
  const legacy = {
    level: 6, proficiency: 3,
    traits: { agility: 2, strength: 3, finesse: 0, instinct: 1, presence: 0, knowledge: -1 },
    experiences: [{ name: "A", modifier: 3 }, { name: "B", modifier: 2 }],
    domainCardIds: ["a", "b", "c", "d", "e", "f"], domainVaultIds: ["a"],
    traitMarks: { agility: true, strength: false, finesse: false, instinct: false, presence: false, knowledge: false },
    hitPointSlotsBonus: 3, stressSlotsBonus: 1, evasionBonus: 1, subclassTier: "specialization",
    advancementSlotsUsed: { traits: 4, hitPoint: 3, stress: 1, experience: 1, domainCard: 0, evasion: 1, subclass: 1, proficiency: 0 },
  };
  const before = JSON.parse(JSON.stringify(legacy));
  ensureLevelFields(legacy);

  eq("flat slot totals split lowest tier first", legacy.advancementSlotsUsed.traits, { 2: 3, 3: 1, 4: 0 });
  eq("an option with no tier-2 slot lands in tier 3", legacy.advancementSlotsUsed.subclass, { 2: 0, 3: 1, 4: 0 });
  eq("the totals survive the split", usedSlotsForOption(legacy.advancementSlotsUsed, "traits"), 4);
  eq("it baselines at the level it had reached", legacy.baselineLevel, 6);
  eq("starting cards are taken from the front of the collection", legacy.creationDomainCardIds, ["a", "b"]);
  eq("experiences gain ids", legacy.experiences.every((e) => !!e.id), true);
  eq("stats are left exactly as they were", [legacy.level, legacy.proficiency, legacy.traits.agility],
    [before.level, before.proficiency, before.traits.agility]);

  const snapshot = JSON.parse(JSON.stringify(legacy));
  recomputeCharacter(legacy);
  eq("replaying it changes nothing", {
    traits: legacy.traits, proficiency: legacy.proficiency, hp: legacy.hitPointSlotsBonus,
    stress: legacy.stressSlotsBonus, evasion: legacy.evasionBonus, tier: legacy.subclassTier,
    cards: legacy.domainCardIds, vault: legacy.domainVaultIds,
  }, {
    traits: snapshot.traits, proficiency: snapshot.proficiency, hp: snapshot.hitPointSlotsBonus,
    stress: snapshot.stressSlotsBonus, evasion: snapshot.evasionBonus, tier: snapshot.subclassTier,
    cards: snapshot.domainCardIds, vault: snapshot.domainVaultIds,
  });

  const again = JSON.parse(JSON.stringify(legacy.advancementSlotsUsed));
  ensureLevelFields(legacy);
  eq("opening it twice is harmless", legacy.advancementSlotsUsed, again);

  record(legacy, 7, [{ key: "evasion", slotTier: 3 }, { key: "hitPoint", slotTier: 3 }], null);
  eq("it levels up normally from there, recorded", legacy.levelUps.map((e) => e.level), [7]);
  eq("the new level builds on its old stats", legacy.evasionBonus, snapshot.evasionBonus + 1);
  eq("its earlier slot usage is untouched", legacy.advancementSlotsUsed.traits, { 2: 3, 3: 1, 4: 0 });
}

// ---------- the replay ----------

// A faithful copy of the pre-history applyLevelUp, kept as a reference: the replay has to
// land on exactly the same numbers it did.
function legacyApply(ch, level, picks, card, exchange) {
  if (isLevelAchievement(level)) {
    ch.experiences.push({ name: "", modifier: 2 });
    ch.proficiency += 1;
    if (level >= 5) for (const k of Object.keys(ch.traitMarks)) ch.traitMarks[k] = false;
  }
  const extra = [];
  for (const pick of picks) {
    ch.advancementSlotsUsed[pick.key][pick.slotTier] += slotsPerPick(pick.key);
    if (pick.key === "traits") for (const k of pick.traits) { ch.traits[k] += 1; ch.traitMarks[k] = true; }
    if (pick.key === "hitPoint") ch.hitPointSlotsBonus += 1;
    if (pick.key === "stress") ch.stressSlotsBonus += 1;
    if (pick.key === "evasion") ch.evasionBonus += 1;
    if (pick.key === "experience") for (const i of pick.experienceIdx) ch.experiences[i].modifier += 1;
    if (pick.key === "subclass" && ch.subclassTier !== "mastery") ch.subclassTier = nextSubclassTier(ch.subclassTier);
    if (pick.key === "proficiency") ch.proficiency += 1;
    if (pick.key === "domainCard" && pick.cardId) extra.push(pick.cardId);
  }
  if (card) ch.domainCardIds.push(card);
  for (const id of extra) ch.domainCardIds.push(id);
  if (exchange) {
    const at = ch.domainCardIds.indexOf(exchange.outCardId);
    if (at >= 0) ch.domainCardIds[at] = exchange.inCardId;
    ch.domainVaultIds = ch.domainVaultIds.filter((id) => id !== exchange.outCardId);
  }
  const active = ch.domainCardIds.filter((id) => !ch.domainVaultIds.includes(id));
  while (active.length > 5) ch.domainVaultIds.push(active.shift());
  ch.level = level;
  return ch;
}

// Experience picks carry both forms: indices for the old code, ids for the new one. By
// level 7 the array is [A, B, lv2, lv5], so index 2 is the level 2 Experience — which is
// exactly why the recorded form uses ids.
const SCRIPT = [
  { level: 2, picks: [{ key: "traits", slotTier: 2, traits: ["agility", "finesse"] }, { key: "hitPoint", slotTier: 2 }], card: "c2" },
  { level: 3, picks: [{ key: "hitPoint", slotTier: 2 }, { key: "stress", slotTier: 2 }], card: "c3" },
  { level: 4, picks: [{ key: "evasion", slotTier: 2 }, { key: "domainCard", slotTier: 2, cardId: "c4" }], card: "c1x" },
  { level: 5, picks: [{ key: "traits", slotTier: 3, traits: ["agility", "strength"] }, { key: "subclass", slotTier: 3 }], card: "c5" },
  { level: 6, picks: [{ key: "proficiency", slotTier: 3 }], card: "c6x" },
  { level: 7, picks: [{ key: "experience", slotTier: 3, experienceIdx: [0, 2], experienceIds: ["e1", "exp_lv2"] }, { key: "stress", slotTier: 3 }], card: "c7" },
];

group("Replay reproduces the old incremental behaviour (level 1 → 7)");
{
  const legacy = newCharacter();
  const modern = newCharacter();
  for (const step of SCRIPT) {
    legacyApply(legacy, step.level, step.picks, step.card, step.exchange);
    record(modern, step.level, step.picks, step.card, step.exchange);
  }
  eq("traits", modern.traits, legacy.traits);
  eq("trait marks", modern.traitMarks, legacy.traitMarks);
  eq("proficiency", modern.proficiency, legacy.proficiency);
  eq("hit point slots", modern.hitPointSlotsBonus, legacy.hitPointSlotsBonus);
  eq("stress slots", modern.stressSlotsBonus, legacy.stressSlotsBonus);
  eq("evasion", modern.evasionBonus, legacy.evasionBonus);
  eq("subclass tier", modern.subclassTier, legacy.subclassTier);
  eq("slots used", modern.advancementSlotsUsed, legacy.advancementSlotsUsed);
  eq("domain cards, in order", modern.domainCardIds, legacy.domainCardIds);
  eq("vault", modern.domainVaultIds, legacy.domainVaultIds);
  eq("experience modifiers", modern.experiences.map((e) => e.modifier), legacy.experiences.map((e) => e.modifier));
  eq("level", modern.level, legacy.level);
}

group("An exchange replays in place");
{
  const legacy = newCharacter();
  const modern = newCharacter();
  const picks = [{ key: "hitPoint", slotTier: 2 }, { key: "stress", slotTier: 2 }];
  const swap = { outCardId: "c1", inCardId: "off" };
  legacyApply(legacy, 2, picks, "c2", swap);
  record(modern, 2, picks, "c2", swap);
  eq("the collection keeps its order", modern.domainCardIds, legacy.domainCardIds);
  check("the card given up is gone", !modern.domainCardIds.includes("c1"));
  check("the card taken is there", modern.domainCardIds.includes("off"));
}

// The exchange is the least-exercised part of a level up — it's optional, it's the only choice
// that REMOVES something, and the card it takes away can be one the character started with,
// which is the one card the replay doesn't own. These go through writeLevelEntry, the same
// function the level up screen writes every entry with, rather than reaching into levelUps.

group("Exchanging a card the character STARTED with");
{
  const twoPicks = [{ key: "evasion", slotTier: 2 }, { key: "stress", slotTier: 2 }];
  const ch = newCharacter();
  ch.level = 2;
  writeLevelEntry(ch, entry(2, twoPicks, "c2", { outCardId: "c1", inCardId: "c1b" }));

  eq("the collection has the swap applied", ch.domainCardIds, ["c1b", "c2"]);
  eq("the starting cards still say what was started with", ch.creationDomainCardIds, ["c1"]);
  // The bug this pins down: the swap used to be written into the starting cards as well, and
  // the validation reads those as "what you owned before this level" — so a legal swap was
  // reported as "the card being given up isn't in the collection at this level" on every load,
  // and no edit could clear it, because re-saving the level wrote the same list back.
  eq("and the level is not flagged", validateLevelUps(ch, DB), []);

  writeLevelEntry(ch, entry(2, twoPicks, "c2", { outCardId: "c1", inCardId: "c1c" }));
  eq("editing the level to swap for something else re-runs from the original card", ch.domainCardIds, ["c1c", "c2"]);
  eq("still nothing flagged", validateLevelUps(ch, DB), []);

  writeLevelEntry(ch, entry(2, twoPicks, "c2", null));
  eq("dropping the swap altogether gives the starting card back", ch.domainCardIds, ["c1", "c2"]);
  eq("and the starting cards never moved", ch.creationDomainCardIds, ["c1"]);
}

group("Exchanging a card gained on an earlier level");
{
  const ch = buildTo([
    entry(2, [{ key: "evasion", slotTier: 2 }, { key: "stress", slotTier: 2 }], "c2"),
    entry(3, [{ key: "hitPoint", slotTier: 2 }, { key: "stress", slotTier: 2 }], "c3", { outCardId: "c2", inCardId: "c1b" }),
  ], 3);
  eq("the card taken at level 2 is the one that leaves", ch.domainCardIds, ["c1", "c1b", "c3"]);
  eq("nothing is flagged", validateLevelUps(ch, DB), []);

  // Giving up a card the character no longer has by then IS an error, and has to stay one.
  const errors = validateEntry(ch, entry(3, [{ key: "hitPoint", slotTier: 2 }, { key: "stress", slotTier: 2 }], "c3", { outCardId: "c7", inCardId: "c1b" }), DB);
  has("a card that was never owned still can't be given up", errors, "isn't in the collection");
}

group("An exchange leaves the vault holding only cards still owned");
{
  const ch = buildTo([entry(2, [{ key: "evasion", slotTier: 2 }, { key: "stress", slotTier: 2 }], "c2")], 2);
  ch.domainVaultIds = ["c1"];
  recomputeCharacter(ch);
  eq("the vaulted card is there to begin with", ch.domainVaultIds, ["c1"]);

  writeLevelEntry(ch, entry(2, [{ key: "evasion", slotTier: 2 }, { key: "stress", slotTier: 2 }], "c2", { outCardId: "c1", inCardId: "c1b" }));
  eq("swapping it away empties the vault rather than leaving a card nobody owns", ch.domainVaultIds, []);
  eq("and the card taken is in the collection", ch.domainCardIds, ["c1b", "c2"]);
}

group("Repairing a character saved while exchanges were baked into the baseline");
{
  const twoPicks = [{ key: "evasion", slotTier: 2 }, { key: "stress", slotTier: 2 }];
  const stale = newCharacter();
  stale.level = 3;
  stale.levelUps.push(entry(2, twoPicks, "c2", { outCardId: "c1", inCardId: "c1b" }));
  stale.levelUps.push(entry(3, [{ key: "hitPoint", slotTier: 2 }, { key: "stress", slotTier: 2 }], "c3", { outCardId: "c1b", inCardId: "c1c" }));
  // What the old code left on disk: the same card swapped twice, written into the starting
  // cards both times, so the baseline ended up naming a card taken two levels later.
  stale.creationDomainCardIds = ["c1c"];
  delete stale.creationCardsUnbaked;

  ensureLevelFields(stale);
  recomputeCharacter(stale);
  eq("the chain unwinds to the card actually started with", stale.creationDomainCardIds, ["c1"]);
  eq("the collection is what it always was", stale.domainCardIds, ["c1c", "c2", "c3"]);
  eq("and the flags clear with no edit from the player", validateLevelUps(stale, DB), []);

  // Repairing a character whose baseline is already honest must not un-swap it a second time.
  delete stale.creationCardsUnbaked;
  ensureLevelFields(stale);
  eq("running the repair again changes nothing", stale.creationDomainCardIds, ["c1"]);
}

group("Writing a level entry replaces that level rather than adding another");
{
  const ch = buildTo([entry(2, [{ key: "evasion", slotTier: 2 }, { key: "stress", slotTier: 2 }], "c2")], 2);
  ch.levelUps[0].acceptedAsIs = true;

  writeLevelEntry(ch, entry(2, [{ key: "hitPoint", slotTier: 2 }, { key: "stress", slotTier: 2 }], "c2"));
  eq("the level appears once", ch.levelUps.map((e) => e.level), [2]);
  eq("the new choices are the ones that count", [ch.evasionBonus, ch.hitPointSlotsBonus], [0, 1]);
  check("and redeclaring a level withdraws 'keep as is'", !ch.levelUps[0].acceptedAsIs);
}

group("The same option marked twice in one level applies twice");
{
  const ch = newCharacter();
  record(ch, 2, [{ key: "hitPoint", slotTier: 2 }, { key: "hitPoint", slotTier: 2 }], "c2");
  eq("+2 Hit Point slots", ch.hitPointSlotsBonus, 2);
  eq("both tier-2 slots are marked", ch.advancementSlotsUsed.hitPoint, { 2: 2, 3: 0, 4: 0 });
  const row = optionFor(advancementOptions(2, { used: ch.advancementSlotsUsed }), "hitPoint");
  eq("the row is now full", remainingSlots(row, ch.advancementSlotsUsed), 0);
}

group("Editing a past level re-derives everything");
{
  const ch = newCharacter();
  for (const step of SCRIPT) record(ch, step.level, step.picks, step.card, step.exchange);
  const before = { traits: { ...ch.traits }, hp: ch.hitPointSlotsBonus, evasion: ch.evasionBonus };

  const lv3 = ch.levelUps.find((e) => e.level === 3);
  const original = lv3.picks;
  lv3.picks = [{ key: "stress", slotTier: 2 }, { key: "evasion", slotTier: 2 }];
  recomputeCharacter(ch);
  eq("the hit point slot it used to take is gone", ch.hitPointSlotsBonus, before.hp - 1);
  eq("evasion picked up the change", ch.evasionBonus, before.evasion + 1);
  eq("an unrelated stat is untouched", ch.traits, before.traits);
  eq("slot usage follows the edit", ch.advancementSlotsUsed.hitPoint, { 2: 1, 3: 0, 4: 0 });

  lv3.picks = original;
  recomputeCharacter(ch);
  eq("putting it back restores the original numbers exactly",
    { traits: ch.traits, hp: ch.hitPointSlotsBonus, evasion: ch.evasionBonus }, before);
}

group("The character as it stood at a past level");
{
  const ch = newCharacter();
  for (const step of SCRIPT) record(ch, step.level, step.picks, step.card, step.exchange);

  const at4 = stateAtLevel(ch, 4);
  eq("proficiency at the start of level 4", at4.proficiency, 2); // 1 + the level 2 achievement
  check("a trait raised at level 2 is still marked at level 4", at4.traitMarks.agility === true);
  eq("cards owned by then", at4.cardIds, ["c1", "c2", "c3"]);

  const at6 = stateAtLevel(ch, 6);
  check("the level 5 achievement cleared the marks", at6.traitMarks.finesse === false);
  check("but a trait raised AT level 5 is marked again", at6.traitMarks.strength === true);

  const exps4 = experiencesAtLevel(ch, 4, at4.expBonus);
  eq("only the Experiences that existed by level 4", exps4.length, 3);
  check("the level 5 Experience exists by level 7",
    experiencesAtLevel(ch, 7, stateAtLevel(ch, 8).expBonus).some((e) => e.sinceLevel === 5));
}

group("Removing the most recent level");
{
  const ch = newCharacter();
  for (const step of SCRIPT.slice(0, 3)) record(ch, step.level, step.picks, step.card, step.exchange);
  const at4 = { traits: { ...ch.traits }, ev: ch.evasionBonus, cards: [...ch.domainCardIds], level: ch.level };

  record(ch, 5, [{ key: "evasion", slotTier: 3 }, { key: "stress", slotTier: 3 }], "c5");
  ch.levelUps.pop();
  ch.level = 4;
  ch.experiences = ch.experiences.filter((e) => e.sinceLevel <= 4);
  recomputeCharacter(ch);
  eq("every stat goes back to where it was", { traits: ch.traits, ev: ch.evasionBonus, cards: ch.domainCardIds, level: ch.level }, at4);
}

// ---------- validation ----------

group("A chain that adds up is silent");
{
  const ch = buildTo([
    entry(2, [{ key: "traits", slotTier: 2, traits: ["agility", "finesse"] }, { key: "hitPoint", slotTier: 2 }], "c2"),
    entry(3, [{ key: "evasion", slotTier: 2 }, { key: "stress", slotTier: 2 }], "c3"),
  ], 3);
  eq("no problems", validateLevelUps(ch, DB), []);
}

group("Editing an early level can invalidate a later one");
{
  const ch = buildTo([
    entry(2, [{ key: "traits", slotTier: 2, traits: ["agility", "finesse"] }, { key: "hitPoint", slotTier: 2 }], "c2"),
    entry(3, [{ key: "traits", slotTier: 2, traits: ["strength", "presence"] }, { key: "evasion", slotTier: 2 }], "c3"),
  ], 3);
  check("legal to start with", validateLevelUps(ch, DB).length === 0);

  ch.levelUps[0].picks[0].traits = ["agility", "strength"]; // now level 3 also raises strength
  recomputeCharacter(ch);
  const problems = validateLevelUps(ch, DB);
  eq("exactly the later level is flagged", problems.map((p) => p.level), [3]);
  has("the reason names the trait", problems[0].errors, "Strength is already marked");

  ch.levelUps[1].acceptedAsIs = true;
  eq("'keep as is' leaves it reported", validateLevelUps(ch, DB).length, 1);
  eq("but it no longer needs attention", unresolvedProblems(ch, DB).length, 0);
}

group("Each way a level can stop adding up");
{
  const ch = buildTo([entry(2, [{ key: "evasion", slotTier: 2 }, { key: "stress", slotTier: 2 }], "c2")], 2);
  const at2 = (picks, card, exchange) => validateEntry(ch, entry(2, picks, card, exchange), DB);
  const two = [{ key: "evasion", slotTier: 2 }, { key: "stress", slotTier: 2 }];

  has("too few choice points spent", at2([{ key: "evasion", slotTier: 2 }], "c2"), "1 of the 2 choice points");
  has("too many spent", at2([...two, { key: "hitPoint", slotTier: 2 }], "c2"), "3 of the 2 choice points");
  has("a slot from a tier you haven't reached", at2([{ key: "evasion", slotTier: 3 }, { key: "stress", slotTier: 2 }], "c2"), "tier 3 slot isn't available");
  has("more slots than the row has", at2([{ key: "evasion", slotTier: 2 }, { key: "evasion", slotTier: 2 }], "c2"), "no tier 2 slot left");
  has("the same trait twice", at2([{ key: "traits", slotTier: 2, traits: ["agility", "agility"] }, { key: "stress", slotTier: 2 }], "c2"), "exactly 2 different traits");
  has("an Experience that isn't there", at2([{ key: "experience", slotTier: 2, experienceIds: ["e1", "nope"] }, { key: "stress", slotTier: 2 }], "c2"), "no longer exists");
  has("a card above your level", at2(two, "c5"), "above the limit of 2");
  has("a card outside your domains", at2(two, "off"), "isn't in a domain");
  has("a card already owned", at2(two, "c1"), "already in the collection");
  has("no card chosen", at2(two, null), "no card chosen");
  has("giving up a card you don't have", at2(two, "c2", { outCardId: "c7", inCardId: "c1" }), "isn't in the collection");
  has("taking a higher card than you gave", at2(two, "c2", { outCardId: "c1", inCardId: "c3" }), "above the limit of 1");
}

group("The extra card's cap, as a validation");
{
  const ch = buildTo([
    entry(2, [{ key: "evasion", slotTier: 2 }, { key: "stress", slotTier: 2 }], "c2"),
    entry(3, [{ key: "hitPoint", slotTier: 2 }, { key: "hitPoint", slotTier: 2 }], "c3"),
    entry(4, [{ key: "stress", slotTier: 2 }, { key: "traits", slotTier: 2, traits: ["agility", "finesse"] }], "c4"),
    entry(5, [{ key: "traits", slotTier: 3, traits: ["strength", "presence"] }, { key: "evasion", slotTier: 3 }], "c7"),
  ], 5);
  const lv6 = (slotTier) => validateEntry(ch, entry(6, [{ key: "domainCard", slotTier, cardId: "c5" }, { key: "stress", slotTier: 3 }], "c1"), DB);
  has("a level 5 card in a tier-2 slot is refused at level 6", lv6(2), "above the limit of 4");
  check("the same card in a tier-3 slot is fine", !lv6(3).some((e) => e.includes("above the limit")));
}

group("The Hit Point cap, as a validation");
{
  const ch = buildTo([
    entry(2, [{ key: "hitPoint", slotTier: 2 }, { key: "hitPoint", slotTier: 2 }], "c2"),
    entry(3, [{ key: "hitPoint", slotTier: 3 }, { key: "hitPoint", slotTier: 3 }], "c3"),
  ], 5);
  has("7 + 4 + 2 more would pass 12",
    validateEntry(ch, entry(6, [{ key: "hitPoint", slotTier: 4 }, { key: "hitPoint", slotTier: 4 }], "c5"), DB),
    "past the maximum of 12");
}

// ---------- derived stats ----------

// The db a page hands to derivedStats: only what these checks need, in the shape data/ uses.
const STAT_DB = {
  classes: [{ id: "cls", name: "GUARDIAN", domains: ["VALOR", "BLADE"], startingHitPoints: 7, startingEvasion: 9 }],
  subclasses: [
    { id: "sub", spellcastTrait: "KNOWLEDGE" },
    { id: "nocast" }, // Guardian and Warrior subclasses have no Spellcast trait
  ],
  armors: [
    { id: "gambeson", name: { "en-US": "Gambeson" }, baseScore: 3, baseMajorThreshold: 5, baseSevereThreshold: 11 },
    { id: "absurd", name: { "en-US": "Absurd Plate" }, baseScore: 40, baseMajorThreshold: 5, baseSevereThreshold: 11 },
  ],
  weapons: [
    { id: "staff", name: { "en-US": "Greatstaff" }, trait: "KNOWLEDGE", burden: "TWO_HANDED" },
    { id: "dagger", name: { "en-US": "Dagger" }, trait: "FINESSE", burden: "ONE_HANDED" },
  ],
};

function statChar(over = {}) {
  const ch = newCharacter();
  ch.equipment = { weaponMode: "two-handed", primaryWeaponId: null, secondaryWeaponId: null, armorId: null, potionChoice: null };
  return Object.assign(ch, over);
}

group("Derived stats are worked out in one place");
{
  const ch = statChar({ equipment: { weaponMode: "two-handed", primaryWeaponId: "staff", armorId: "gambeson" } });
  const s = derivedStats(ch, STAT_DB);
  eq("Evasion is the class value", s.evasion.total, 9);
  eq("Hit Points are the class value", s.hitPoints.total, 7);
  eq("Stress starts at 6 for every class", s.stress.total, 6);
  eq("a stat with no modifiers has one part", s.evasion.parts.length, 1);
  eq("the parts add up to the total", s.hitPoints.parts.reduce((n, p) => n + p.value, 0), s.hitPoints.total);
}
{
  const ch = statChar({ hitPointSlotsBonus: 3, stressSlotsBonus: 2, evasionBonus: 1 });
  const s = derivedStats(ch, STAT_DB);
  eq("advancements are added on top", [s.evasion.total, s.hitPoints.total, s.stress.total], [10, 10, 8]);
  eq("and are named separately in the breakdown", s.hitPoints.parts.length, 2);
  eq("a zero bonus isn't listed at all", derivedStats(statChar(), STAT_DB).evasion.parts.length, 1);
}

group("A breakdown names the level that granted each point");
{
  // "Level up advancements +3" is true and useless: it can't be checked against anything the
  // player remembers doing. The levels come from the recorded entries, so a breakdown can name
  // them — and a character built above level 1 keeps the generic part for the levels that were
  // never recorded, rather than having one invented for it.
  const ch = statChar();
  record(ch, 2, [{ key: "evasion", slotTier: 2 }, { key: "experience", slotTier: 2, experienceIds: ["e1", "e2"] }], "c2");
  record(ch, 3, [{ key: "traits", slotTier: 2, traits: ["agility", "strength"] }, { key: "hitPoint", slotTier: 2 }], "c3");
  const s = derivedStats(ch, STAT_DB);
  const labels = (stat) => stat.parts.map((p) => p.label);

  eq("Evasion", labels(s.evasion), ["Guardian (class)", "Level 2 advancement"]);
  eq("Hit Points", labels(s.hitPoints), ["Guardian (class)", "Level 3 advancement"]);
  eq("a trait separates what was assigned from what was earned", labels(s.traits.agility), ["Assigned at creation", "Level 3 advancement"]);
  eq("a trait nothing has touched still explains itself", labels(s.traits.finesse), ["Assigned at creation"]);
  // Proficiency comes from the tier achievement at 2, 5 and 8 as well as from the advancement
  // option, and the breakdown has to tell the two apart.
  eq("Proficiency", labels(s.proficiency), ["Base", "Level 2 achievement"]);
  eq("the parts still add up to the total", s.proficiency.parts.reduce((n, p) => n + p.value, 0), s.proficiency.total);

  const raised = s.experiences.find((e) => e.id === "e1");
  eq("an Experience raised by an advancement says which level did it", labels(raised), ["Base", "Level 2 advancement"]);
  // It used to report the modifier itself as a part, which left exactly one part — and the
  // sheet only offers the "?" from two up, so nothing explained why the Experience wasn't +2.
  check("so it has the two parts the sheet needs to offer its '?'", raised.parts.length > 1);
  eq("an Experience nothing has raised keeps a single part", labels(s.experiences.find((e) => e.id === "exp_lv2")), ["Base"]);
}

group("Advancement credits reconcile with the replay");
{
  // The credits are attributed by a second walk over the recorded entries, so the risk is that
  // it drifts from the replay that produces the numbers. Nothing here checks a label: it checks
  // that every credit sums to exactly the bonus the replay arrived at.
  const ch = newCharacter();
  for (const step of SCRIPT) record(ch, step.level, step.picks, step.card, step.exchange);
  const credits = advancementCredits(ch);
  const sum = (list) => (list || []).reduce((n, c) => n + c.value, 0);

  eq("hit point slots", sum(credits.hitPoint), ch.hitPointSlotsBonus - ch.baseline.hitPointSlotsBonus);
  eq("stress slots", sum(credits.stress), ch.stressSlotsBonus - ch.baseline.stressSlotsBonus);
  eq("evasion", sum(credits.evasion), ch.evasionBonus - ch.baseline.evasionBonus);
  eq("proficiency, tier achievements included", sum(credits.proficiency), ch.proficiency - ch.baseline.proficiency);
  eq("every trait", TRAIT_KEYS.map((k) => sum(credits.traits[k])),
    TRAIT_KEYS.map((k) => ch.traits[k] - ch.baseline.traits[k]));
  eq("every Experience", ch.experiences.map((e) => sum(credits.experiences[e.id])),
    ch.experiences.map((e) => e.modifier - e.baseModifier));
}

group("Armor Score, thresholds, and the unarmored rule");
{
  const armored = derivedStats(statChar({ level: 3, equipment: { armorId: "gambeson" } }), STAT_DB);
  eq("Armor Score comes from the armor", armored.armorScore.total, 3);
  eq("thresholds are the armor's base plus your level", [armored.majorThreshold.total, armored.severeThreshold.total], [8, 14]);

  // SRD: unarmored is Armor Score 0, Major = level, Severe = twice level. Unreachable in the
  // wizard today (armor is required), so this is the only thing holding the rule honest.
  const bare = derivedStats(statChar({ level: 3, equipment: { armorId: null } }), STAT_DB);
  eq("unarmored Armor Score is 0", bare.armorScore.total, 0);
  eq("unarmored thresholds are level and twice level", [bare.majorThreshold.total, bare.severeThreshold.total], [3, 6]);

  const capped = derivedStats(statChar({ equipment: { armorId: "absurd" } }), STAT_DB);
  eq("Armor Score can't exceed 12", capped.armorScore.total, MAX_ARMOR_SCORE);
  check("and says so when it clamps", !!capped.armorScore.note);
}

group("Attack uses the weapon's trait, and a secondary counts because it's equipped");
{
  // This used to assert that a "two-handed" weaponMode meant no secondary attack. That stopped
  // being true the moment a Warrior — who ignores burden — could carry a shield behind a
  // greatsword: their secondary attack came back null and the shield's Barrier went missing
  // from their Armor Score. What's equipped is now the only question asked.
  const both = derivedStats(statChar({
    equipment: { primaryWeaponId: "staff", secondaryWeaponId: "dagger" },
  }), STAT_DB);
  // knowledge is -1 in the fixture, finesse is 0
  eq("primary attack is the weapon's trait, not Proficiency", both.primaryAttack.total, -1);
  eq("the off-hand weapon uses its own trait, whatever the primary's burden",
    both.secondaryAttack.total, 0);

  check("with no secondary equipped there is no secondary attack",
    derivedStats(statChar({ equipment: { primaryWeaponId: "staff" } }), STAT_DB).secondaryAttack === null);

  // Characters saved before this change still carry the field. It has to mean nothing.
  check("a leftover weaponMode from an older save changes nothing",
    derivedStats(statChar({
      equipment: { weaponMode: "two-handed", primaryWeaponId: "staff", secondaryWeaponId: "dagger" },
    }), STAT_DB).secondaryAttack !== null);

  eq("Spellcast shows the trait, not a number", derivedStats(statChar(), STAT_DB).spellcast.display, "Knowledge");
  check("subclasses without one get no Spellcast box",
    derivedStats(statChar({ subclassId: "nocast" }), STAT_DB).spellcast === null);
}

group("A page that didn't load every data file still gets what it asked for");
{
  // The level up screen loads classes, subclasses and domain cards only.
  const partial = derivedStats(statChar({ equipment: { armorId: "gambeson" } }), { classes: STAT_DB.classes });
  eq("class-based stats still work", partial.hitPoints.total, 7);
  check("equipment-based ones come back null rather than throwing", partial.armorScore === null);
  check("and so do the attacks", partial.primaryAttack === null);
}

// classes.json holds a class name as a bare uppercase string because subclasses[].class joins to
// it. Printing one used to be a one-liner copied into seven files, in three slightly different
// versions, and every one of them assumed the name was a single word — true of all nine SRD
// classes, and not something a content source has to keep true. A two-word name came out as
// "Two words" in the wizard, on the sheet's breakdown, and in the CSV's Class column, which is a
// file that leaves the app.
group("A class name prints as a name, however many words it has");
eq("the SRD's single-word names are unchanged", ["BARD", "WIZARD"].map(titleCase), ["Bard", "Wizard"]);
eq("a two-word name capitalises both", titleCase("TWO WORDS"), "Two Words");
eq("so does a hyphenated one", titleCase("HYPHEN-JOINED"), "Hyphen-Joined");
// The old history.js copy uppercased the first letter and left the rest alone, because it was fed
// trait keys rather than SCREAMING_SNAKE. Both callers now share one function, so both have to work.
eq("a lowercase trait key still reads as a word", ["agility", "knowledge"].map(titleCase), ["Agility", "Knowledge"]);
eq("an apostrophe is not a word break", titleCase("SOLDIER'S BOND"), "Soldier's Bond");
eq("nothing in, nothing out", [titleCase(null), titleCase(undefined), titleCase("")], ["", "", ""]);
// Pinning the limitation rather than pretending it isn't there: this caser takes KEYS, and a
// subclass or card name is not one — those arrive as localized text and print as written.
eq("prose somebody already wrote is not its job", titleCase("Words of the Sentence"), "Words Of The Sentence");

group("A weapon reads as prose, not as the JSON it came from");
{
  const longsword = {
    id: "core_weapon_longsword", name: { "en-US": "Longsword" }, type: "PRIMARY_PHYSICAL",
    tier: 1, trait: "AGILITY", range: "MELEE",
    damage: { dice: "D10", modifier: 3, type: "PHYSICAL" }, burden: "TWO_HANDED",
  };
  eq("the SCREAMING_SNAKE values are read out in English", enumLabel("VERY_CLOSE"), "Very Close");
  // The picker used to print "D10 phy" for this: the +3 was simply dropped, on 20 of the 32
  // weapons a starting character can pick between.
  eq("the damage modifier is part of the damage", damageText(longsword), "d10+3 phy");
  eq("a weapon with no modifier just names the die",
    damageText({ damage: { dice: "D8", type: "MAGICAL" } }), "d8 mag");
  // One weapon in the book (the Ghostblade) deals either kind; it used to be labelled "mag".
  eq("and the both-kinds weapon says both",
    damageText({ damage: { dice: "D10", modifier: 7, type: "PHYSICAL_OR_MAGICAL" } }), "d10+7 phy/mag");
  eq("the whole line", weaponStats(longsword), "Agility · Melee · d10+3 phy · Two-handed");

  // Fixtures here carry only the fields the check under test needs, and an unarmed profile has
  // no burden at all. A formatter that dereferenced damage.dice would make every other check in
  // this file depend on data it doesn't use.
  eq("fields a record doesn't carry are left out, not printed as undefined",
    weaponStats({ trait: "FINESSE", burden: "ONE_HANDED" }), "Finesse · One-handed");
  eq("and no weapon at all is not a crash", weaponStats(null), "");

  // Consumables carry a feature with no name, and the sheet puts potions through the same
  // renderer as weapons — without this it read "Minor Health Potion : Clear 1d4 HP."
  eq("a nameless feature is just its text",
    featureLine({ features: [{ description: [{ paragraph: { "en-US": "Clear 1d4 HP." } }] }] }),
    `<span class="option-feature">Clear 1d4 HP.</span>`);
  eq("a named one still reads name-then-text",
    featureLine({ features: [{ name: { "en-US": "Reliable" }, description: [{ paragraph: { "en-US": "+1 to attack rolls" } }] }] }),
    `<span class="option-feature"><em>Reliable</em>: +1 to attack rolls</span>`);
}

group("Burden is advice, and the Warrior doesn't even get the advice");
{
  const greatsword = { name: { "en-US": "Greatsword" }, burden: "TWO_HANDED" };
  const broadsword = { name: { "en-US": "Broadsword" }, burden: "ONE_HANDED" };
  const shield = { name: { "en-US": "Tower Shield" }, burden: "ONE_HANDED" };

  check("a secondary behind a two-handed primary is flagged", !!burdenWarning(greatsword, shield, false));
  check("a one-handed primary never is", burdenWarning(broadsword, shield, false) === null);
  check("nor is a two-handed primary carried on its own", burdenWarning(greatsword, null, false) === null);
  // "You ignore burden when equipping weapons." — Combat Training, in full.
  check("and a Warrior isn't warned at all", burdenWarning(greatsword, shield, true) === null);

  const WARRIOR = {
    id: "core_class_warrior", name: "WARRIOR",
    classFeatures: [{ name: { "en-US": "Combat Training" } }, { name: { "en-US": "Attack of Opportunity" } }],
  };
  const GUARDIAN = { id: "cls", name: "GUARDIAN", classFeatures: [{ name: { "en-US": "Unstoppable" } }] };
  check("Combat Training is what says so",
    ignoresBurden({ classId: "core_class_warrior" }, { classes: [WARRIOR, GUARDIAN] }));
  check("and no other class does", !ignoresBurden({ classId: "cls" }, { classes: [WARRIOR, GUARDIAN] }));
  check("a page that didn't load classes doesn't throw", !ignoresBurden({ classId: "cls" }, {}));
}

group("A magic weapon in a non-caster's hands is advice too");
{
  const staff = { name: { "en-US": "Hallowed Axe" }, type: "PRIMARY_MAGIC", damage: { dice: "D10", type: "MAGICAL" } };
  const sword = { name: { "en-US": "Broadsword" }, type: "PRIMARY_PHYSICAL", damage: { dice: "D8", type: "PHYSICAL" } };
  const shield = { name: { "en-US": "Tower Shield" }, type: "SECONDARY", damage: { dice: "D4", type: "PHYSICAL" } };
  // Hope and Fear has fourteen of these: magic damage on a weapon typed SECONDARY. A check
  // written against `type` instead of `damage.type` passes every one of them through.
  const wand = { name: { "en-US": "Hand Runes" }, type: "SECONDARY", damage: { dice: "D4", type: "MAGICAL" } };
  const ghostblade = { name: { "en-US": "Ghostblade" }, type: "PRIMARY_MAGIC", damage: { dice: "D10", type: "PHYSICAL_OR_MAGICAL" } };

  check("a Guardian carrying a magic weapon is flagged", !!magicWeaponWarning(staff, null, null));
  check("and the warning names it", magicWeaponWarning(staff, null, null).startsWith("Hallowed Axe is a magic weapon"));
  check("a caster is never flagged", magicWeaponWarning(staff, wand, "KNOWLEDGE") === null);
  check("nor is a non-caster carrying steel", magicWeaponWarning(sword, shield, null) === null);
  check("a magic SECONDARY counts, whatever its type says", !!magicWeaponWarning(sword, wand, null));
  check("both hands full of magic reads as one sentence",
    magicWeaponWarning(staff, wand, null).startsWith("Hallowed Axe and Hand Runes are magic weapons"));
  // Otherworldly: "On a successful attack, you can deal physical or magic damage." You can
  // simply never choose the second half.
  check("the both-kinds weapon is left alone", magicWeaponWarning(ghostblade, null, null) === null);
  check("and empty hands are not a crash", magicWeaponWarning(null, null, null) === null);
}

group("A picker opens the tiers worth reading");
{
  const gear = [
    { id: "t1a", tier: 1 }, { id: "t1b", tier: 1 },
    { id: "t2a", tier: 2 }, { id: "t3a", tier: 3 }, { id: "t4a", tier: 4 },
  ];
  const tiersOf = (groups) => groups.map((g) => g.tier);
  const openOf = (groups) => groups.filter((g) => g.open).map((g) => g.tier);

  eq("every tier in the book, lowest first", tiersOf(groupByTier(gear, { tier: 3 })), [1, 2, 3, 4]);
  eq("the character's own tier is open", openOf(groupByTier(gear, { tier: 3 })), [3]);
  // A shield handed out at level 1 is still yours at level 8, and a picker that hides what
  // you're carrying is a picker that lies.
  eq("so is whichever tier holds what they're carrying",
    openOf(groupByTier(gear, { tier: 4, equippedId: "t1b" })), [1, 4]);
  eq("and that's one group, not two, when they coincide",
    openOf(groupByTier(gear, { tier: 2, equippedId: "t2a" })), [2]);
  eq("carrying nothing opens only your tier",
    openOf(groupByTier(gear, { tier: 1, equippedId: null })), [1]);
}

group("The level up screen and the sheet share the same arithmetic");
eq("hit points", hitPointTotal(STAT_DB.classes[0], 2), 9);
eq("stress no longer hardcodes 6 in four places", stressTotal(0), BASE_STRESS_SLOTS);
eq("evasion", evasionTotal(STAT_DB.classes[0], 1), 10);
eq("slots granted by an ancestry count towards the maximum too", hitPointTotal(STAT_DB.classes[0], 2, 1), 10);

// ---------- effects: choices that change a stat ----------
//
// These use the real ids from data/, because an entry in effects.js keyed to an id that
// doesn't exist grants nothing at all, silently — the exact failure the last group guards.

// The pieces of data/ these checks name, in the shape the real files use.
const FX_DB = {
  classes: STAT_DB.classes,
  subclasses: [
    { id: "core_subclass_school_of_war", spellcastTrait: "KNOWLEDGE", foundation: { features: [{ name: { "en-US": "Battlemage" } }] } },
    { id: "core_subclass_stalwart", foundation: { features: [{ name: { "en-US": "Unwavering" } }] }, specialization: { features: [{ name: { "en-US": "Unrelenting" } }] }, mastery: { features: [{ name: { "en-US": "Undaunted" } }] } },
    { id: "sub", spellcastTrait: "KNOWLEDGE" },
  ],
  ancestries: [
    { id: "core_ancestry_clank", name: { "en-US": "Clank" }, features: [{ name: { "en-US": "Purposeful Design" } }] },
    { id: "core_ancestry_giant", name: { "en-US": "Giant" }, features: [{ name: { "en-US": "Endurance" } }, { name: { "en-US": "Reach" } }] },
    { id: "core_ancestry_simiah", name: { "en-US": "Simiah" }, features: [{ name: { "en-US": "Natural Climber" } }, { name: { "en-US": "Nimble" } }] },
  ],
  armors: [
    ...STAT_DB.armors,
    { id: "core_armor_full_plate_armor", name: { "en-US": "Full Plate Armor" }, baseScore: 4, baseMajorThreshold: 8, baseSevereThreshold: 17, features: [{ name: { "en-US": "Very Heavy" } }] },
    { id: "core_armor_channeling_armor", name: { "en-US": "Channeling Armor" }, baseScore: 5, baseMajorThreshold: 13, baseSevereThreshold: 36, features: [{ name: { "en-US": "Channeling" } }] },
  ],
  weapons: [
    ...STAT_DB.weapons,
    { id: "core_weapon_broadsword", name: { "en-US": "Broadsword" }, trait: "AGILITY", burden: "ONE_HANDED", features: [{ name: { "en-US": "Reliable" } }] },
    { id: "core_weapon_tower_shield", name: { "en-US": "Tower Shield" }, trait: "AGILITY", burden: "ONE_HANDED", features: [{ name: { "en-US": "Barrier" } }] },
  ],
  domainCards: [
    { id: "core_domain_card_untouchable", name: { "en-US": "Untouchable" }, domain: "BONE", level: 1 },
    { id: "core_domain_card_bare_bones", name: { "en-US": "Bare Bones" }, domain: "VALOR", level: 1 },
    { id: "core_domain_card_vitality", name: { "en-US": "Vitality" }, domain: "BLADE", level: 5 },
    { id: "core_domain_card_codex_touched", name: { "en-US": "Codex-Touched" }, domain: "CODEX", level: 7 },
    ...["a", "b", "c"].map((s) => ({ id: `codex_${s}`, name: { "en-US": `Codex ${s}` }, domain: "CODEX", level: 1 })),
  ],
};

const heritage = (ancestryId, featureName) => ({
  heritage: { ancestryMode: "pure", ancestryIds: [ancestryId], chosenFeatures: [{ ancestryId, featureName }], communityId: null },
});

group("An ancestry feature that grants a stat actually grants it");
{
  const giant = derivedStats(statChar(heritage("core_ancestry_giant", "Endurance")), FX_DB);
  eq("a Giant's Endurance is one more Hit Point slot", giant.hitPoints.total, 8);
  eq("and the breakdown says where it came from", giant.hitPoints.parts[1].label, "Giant — Endurance");

  // With a mixed ancestry the player takes ONE feature per ancestry, so a Giant who took Reach
  // instead of Endurance gets nothing. Keying on the ancestry id alone would get this wrong.
  const reach = derivedStats(statChar(heritage("core_ancestry_giant", "Reach")), FX_DB);
  eq("a Giant who took Reach instead gets no extra slot", reach.hitPoints.total, 7);

  // Nimble is Simiah's SECOND feature, unlike every other stat feature in the book.
  const simiah = derivedStats(statChar(heritage("core_ancestry_simiah", "Nimble")), FX_DB);
  eq("Simiah's Nimble is +1 Evasion", simiah.evasion.total, 10);
}

group("A permanent Experience bonus reaches the level up picker, not just the sheet");
{
  // Purposeful Design is the one effect that raises a named Experience rather than a stat, so
  // it's the one the replay can't know about: expBonus only counts the +1s taken as
  // advancements. The picker used to build its numbers from the replay alone, which offered a
  // Clank an Experience at +2 while the sheet showed it at +3.
  const clank = (answer) => statChar({
    ...heritage("core_ancestry_clank", "Purposeful Design"),
    ...(answer ? { effectChoices: { "core_ancestry_clank:Purposeful Design": answer } } : {}),
  });

  eq("unanswered, it grants nothing", effectExperienceBonuses(clank(null), FX_DB), {});

  const answered = clank({ optionId: "one", experienceIds: ["e1"] });
  eq("answered, the chosen Experience carries +1", effectExperienceBonuses(answered, FX_DB), { e1: 1 });
  eq("and the one it didn't choose carries nothing",
    effectExperienceBonuses(clank({ optionId: "one", experienceIds: ["e2"] }), FX_DB).e1 || 0, 0);

  // The arithmetic the picker does, against the number the sheet shows for the same Experience.
  const bonuses = effectExperienceBonuses(answered, FX_DB);
  const asPicker = (id) => experiencesAtLevel(answered, answered.level, stateAtLevel(answered, answered.level + 1).expBonus)
    .map((exp) => ({ ...exp, modifier: exp.modifier + (bonuses[exp.id] || 0) }))
    .find((e) => e.id === id).modifier;
  const asSheet = (id) => derivedStats(answered, FX_DB).experiences.find((e) => e.id === id).total;
  eq("the picker and the sheet agree on the boosted Experience", asPicker("e1"), asSheet("e1"));
  eq("and on the one that wasn't boosted", asPicker("e2"), asSheet("e2"));
}

group("An Experience breakdown names every source, and no subtotal");
{
  // The reported case: a Clank whose Purposeful Design bonus and a level 2 advancement both
  // landed on the same Experience saw +4 explained as "Experience +3, Permanent bonus +1" —
  // where the +3 was the very thing being asked about, and the feature that granted the other
  // +1 went unnamed.
  const clank = statChar({
    ...heritage("core_ancestry_clank", "Purposeful Design"),
    effectChoices: { "core_ancestry_clank:Purposeful Design": { optionId: "one", experienceIds: ["e1"] } },
  });
  record(clank, 2, [{ key: "experience", slotTier: 2, experienceIds: ["e1", "e2"] }, { key: "evasion", slotTier: 2 }], "c2");

  const e1 = derivedStats(clank, FX_DB).experiences.find((e) => e.id === "e1");
  eq("the total is unchanged", e1.total, 4);
  eq("and every part of it is a real source",
    e1.parts.map((p) => `${p.label} ${p.value}`),
    ["Base 2", "Level 2 advancement 1", "Clank — Purposeful Design 1"]);
}

group("A subclass tier implies the tiers below it, and their bonuses stack");
{
  const war = derivedStats(statChar({ subclassId: "core_subclass_school_of_war" }), FX_DB);
  eq("School of War's Battlemage is one more Hit Point slot", war.hitPoints.total, 8);

  const at = (tier) => derivedStats(statChar({
    subclassId: "core_subclass_stalwart", subclassTier: tier, level: 1,
    equipment: { armorId: "gambeson" },
  }), FX_DB).majorThreshold.total;
  // Gambeson's Major is 5, plus level 1 = 6 before any subclass bonus.
  eq("Stalwart at Foundation is +1", at("foundation"), 7);
  eq("at Specialization it's +1 and +2", at("specialization"), 9);
  eq("at Mastery it's +1, +2 and +3", at("mastery"), 12);
}

group("Equipment changes traits, Evasion, Armor Score and attacks");
{
  const plate = derivedStats(statChar({ equipment: { weaponMode: "two-handed", primaryWeaponId: "staff", armorId: "core_armor_full_plate_armor" } }), FX_DB);
  eq("Full Plate is -2 Evasion", plate.evasion.total, 7);
  eq("and -1 Agility", plate.traits.agility.total, 0);

  // The -1 Agility has to reach the attack roll, since attack uses the effective trait.
  const sword = derivedStats(statChar({ equipment: { weaponMode: "one-handed", primaryWeaponId: "core_weapon_broadsword", secondaryWeaponId: "core_weapon_tower_shield", armorId: "core_armor_full_plate_armor" } }), FX_DB);
  eq("an Agility weapon's attack uses the reduced Agility, plus Reliable's +1", sword.primaryAttack.total, 1);
  eq("Reliable applies to its own weapon only", sword.secondaryAttack.total, 0);
  eq("Tower Shield's Barrier is +2 Armor Score", sword.armorScore.total, 6);
  eq("Barrier's -1 Evasion lands too", sword.evasion.total, 6);

  // The same shield behind a two-handed primary — a Warrior's Combat Training says they can.
  // This is the case the old weaponMode gate got wrong: the shield was equipped and did nothing.
  const shielded = derivedStats(statChar({
    equipment: { primaryWeaponId: "staff", secondaryWeaponId: "core_weapon_tower_shield" },
  }), FX_DB);
  // No armor, so Armor Score is Barrier's +2 alone; Evasion is the class's 9 less Barrier's 1.
  eq("a shield's Barrier applies behind a two-handed primary too", shielded.armorScore.total, 2);
  eq("and so does its -1 Evasion", shielded.evasion.total, 8);

  // "+1 to Spellcast Rolls" is not "+1 to Knowledge": a plain Knowledge roll doesn't get it.
  const chan = derivedStats(statChar({ equipment: { armorId: "core_armor_channeling_armor" } }), FX_DB);
  eq("Channeling armor shows on the Spellcast box", chan.spellcast.display, "Knowledge +1");
  eq("but never on the trait itself", chan.traits.knowledge.total, -1);
}

// What a SOURCE can declare, as opposed to what the hand-written catalogue can hold. Every
// record here is invented, the same way PROFILE_DB's is: the shapes are the point, and no
// non-SRD content belongs in this repo. `effects` is the overlay a source's effects.json lands
// on, so these entries take the JSON path rather than the EFFECTS one.
const SRC_DB = {
  ...FX_DB,
  // Guardian and Warrior subclasses have no Spellcast trait, which is what makes them the
  // interesting case for a bonus that scales with one.
  subclasses: [...FX_DB.subclasses, { id: "nocast" }],
  armors: [
    ...FX_DB.armors,
    {
      id: "src_armor", name: { "en-US": "Sourced Mail" },
      baseScore: 2, baseMajorThreshold: 5, baseSevereThreshold: 11,
      features: [{ name: { "en-US": "Awkward" } }],
    },
    {
      id: "src_robes", name: { "en-US": "Sourced Robes" },
      baseScore: 2, baseMajorThreshold: 5, baseSevereThreshold: 11,
      features: [{ name: { "en-US": "Ensorcelled" } }],
    },
    {
      id: "src_finery", name: { "en-US": "Sourced Finery" },
      baseScore: 2, baseMajorThreshold: 5, baseSevereThreshold: 11,
      // Gilded is the SRD's own +1 Presence, picked up by feature name — so this armour raises
      // the very trait its other feature scales with.
      features: [{ name: { "en-US": "Gilded" } }, { name: { "en-US": "Resplendent" } }],
    },
  ],
  weapons: [
    ...FX_DB.weapons,
    {
      id: "src_offhand", name: { "en-US": "Sourced Hammer" },
      trait: "STRENGTH", burden: "ONE_HANDED",
      features: [{ name: { "en-US": "Steadfast" } }],
    },
  ],
  domainCards: [
    ...FX_DB.domainCards,
    { id: "src_card", name: { "en-US": "Sourced Card" }, domain: "VALOR", level: 1 },
    { id: "src_tier_card", name: { "en-US": "Sourced Tier Card" }, domain: "VALOR", level: 1 },
  ],
  effects: {
    "armor:Awkward": { traits: { finesse: -1 } },
    "src_offhand:Steadfast": { attack: 1, scope: "primary" },
    "src_robes:Ensorcelled": {
      majorThreshold: { equalTo: "spellcast" },
      severeThreshold: { equalTo: "spellcast" },
    },
    "src_finery:Resplendent": { armorScore: { equalTo: "presence" } },
    src_card: { severeThreshold: { equalTo: "proficiency" }, evasion: { equalTo: "level" } },
    src_tier_card: { majorThreshold: { equalTo: "tier" } },
  },
};

group("A source can declare a trait penalty in JSON");
{
  const ch = derivedStats(statChar({
    equipment: { primaryWeaponId: "dagger", armorId: "src_armor" },
  }), SRC_DB);
  eq("the trait tile drops", ch.traits.finesse.total, -1);
  eq("with the armour named in its breakdown",
    ch.traits.finesse.parts.map((p) => p.label), ["Assigned at creation", "Sourced Mail (Awkward)"]);
  // A Finesse weapon rolls the effective trait, so a penalty that stopped at the tile would
  // leave the attack a point too high — the same path armor:Very Heavy's -1 Agility takes.
  eq("and the attack roll drops with it", ch.primaryAttack.total, -1);
}

group("A source can declare a value the character's own stats decide");
{
  // Armor Score equal to your Presence, on armour that also raises Presence. Trait modifiers are
  // settled before anything else reads them, so this must see the raised value: were it reading
  // base traits the Gilded +1 would go missing and the number would be 2.
  const finery = derivedStats(statChar({ equipment: { armorId: "src_finery" } }), SRC_DB);
  eq("the trait it scales with is the effective one", finery.traits.presence.total, 1);
  eq("so Armor Score is the armour's 2 plus that 1", finery.armorScore.total, 3);
  eq("and the breakdown names the feature, not the trait",
    finery.armorScore.parts.map((p) => p.label), ["Sourced Finery", "Sourced Finery (Resplendent)"]);

  // "Equal to your Spellcast trait" means the trait itself, and this character's is Knowledge at
  // -1 — so the bonus is negative. A form that could only ever add would be the wrong shape.
  const robes = derivedStats(statChar({ equipment: { armorId: "src_robes" } }), SRC_DB);
  eq("a Spellcast trait of -1 lowers both thresholds",
    [robes.majorThreshold.total, robes.severeThreshold.total], [5, 11]);

  const nocast = derivedStats(statChar({ subclassId: "nocast", equipment: { armorId: "src_robes" } }), SRC_DB);
  eq("a subclass with no Spellcast trait scales to nothing",
    [nocast.majorThreshold.total, nocast.severeThreshold.total], [6, 12]);
  check("and contributes no breakdown row, rather than a +0 one",
    !nocast.majorThreshold.parts.some((p) => p.label.includes("Ensorcelled")));

  // The two words in the vocabulary that aren't traits.
  const card = derivedStats(statChar({ proficiency: 2, domainCardIds: ["src_card"] }), SRC_DB);
  eq("Proficiency scales a threshold", card.severeThreshold.total, 2 + 2);
  eq("and level scales Evasion", card.evasion.total, 9 + 1);

  // Tier is not level, and at level 1 the two happen to agree — so the case that tells them
  // apart is the only one worth asserting. Level 5 is tier 3.
  const t5 = derivedStats(statChar({ level: 5, domainCardIds: ["src_tier_card"] }), SRC_DB);
  eq("tier scales as tier, not as level", t5.majorThreshold.total, 5 + 3);
  eq("and the breakdown names the card rather than the arithmetic",
    t5.majorThreshold.parts.map((p) => p.label), ["No armor — your level", "Sourced Tier Card"]);
}

group("A weapon can boost the OTHER hand's attacks");
{
  // "+1 to attack rolls made with your primary weapon", on a secondary weapon. Without a declared
  // scope this is the exact inversion of Reliable: the bonus would land on the off-hand's own
  // attacks, which is wrong in the player's favour and looks right on the sheet.
  const ch = derivedStats(statChar({
    equipment: { primaryWeaponId: "dagger", secondaryWeaponId: "src_offhand" },
  }), SRC_DB);
  eq("the off-hand's bonus lands on the primary attack", ch.primaryAttack.total, 0 + 1);
  eq("named as what granted it, so the breakdown explains an off-hand number in the main hand",
    ch.primaryAttack.parts.map((p) => p.label), ["Finesse (Dagger)", "Sourced Hammer (Steadfast)"]);
  eq("and not on the attacks of the weapon carrying it", ch.secondaryAttack.total, 2);

  // The app's primary slot is the primary slot whether or not it holds a weapon.
  const fists = derivedStats(statChar({
    equipment: { primaryWeaponId: UNARMED, secondaryWeaponId: "src_offhand" },
  }), SRC_DB);
  eq("bare hands are in the primary slot too", fists.primaryAttack.display, "(+3) Strength / (+1) Finesse");
}

group("Choosing to wear nothing");
{
  // The SRD's plain unarmored rule, reachable at last: Armor Score 0, Major threshold equal to
  // your level and Severe twice your level.
  const bare = derivedStats(statChar({ level: 3, equipment: { armorId: UNARMORED } }), FX_DB);
  eq("no armor means an Armor Score of 0", bare.armorScore.total, 0);
  eq("Major threshold is your level", bare.majorThreshold.total, 3);
  eq("and Severe is twice it", bare.severeThreshold.total, 6);

  // Not the same state as never having chosen — but the arithmetic can't tell them apart, and
  // shouldn't: a character mid-creation has no armor either.
  const unset = derivedStats(statChar({ level: 3, equipment: {} }), FX_DB);
  eq("having chosen nothing yet works out the same", unset.armorScore.total, bare.armorScore.total);

  // The sentinel is a marker, not an id: nothing must go looking for armor by that name.
  check("it matches no armor in the data", !FX_DB.armors.some((a) => a.id === UNARMORED));

  // A shield is still a shield with no body armor under it.
  const shielded = derivedStats(statChar({
    equipment: { armorId: UNARMORED, secondaryWeaponId: "core_weapon_tower_shield" },
  }), FX_DB);
  eq("a shield's Armor Score still applies", shielded.armorScore.total, 2);
}

group("Fighting with nothing in your hands");
{
  // "Unarmed attack rolls use either Strength or Finesse (GM's choice)." The sheet reports both
  // rather than quietly picking the better one — that choice belongs to the table.
  // strength is +2 in the fixture, finesse 0.
  const bare = derivedStats(statChar({ equipment: { primaryWeaponId: UNARMED } }), FX_DB);
  // signed() writes zero as "0", the same as every other stat box on the sheet.
  eq("both traits are offered, neither is chosen", bare.primaryAttack.display, "(+2) Strength / (0) Finesse");
  eq("and the breakdown shows each of them",
    bare.primaryAttack.parts.map((p) => p.label), ["Strength (unarmed)", "Finesse (unarmed)"]);
  check("with a note saying whose choice it is", /GM/.test(bare.primaryAttack.note));

  // "Successful unarmed attacks inflict [Proficiency]d4 damage" — d4 is the rating, in the same
  // sense d10+3 is a Longsword's.
  eq("bare hands hit for d4", weaponStats(UNARMED_PROFILE), "Strength or Finesse · Melee · d4 phy");

  // The sentinel is a marker, not an id.
  check("it matches no weapon in the data", !FX_DB.weapons.some((w) => w.id === UNARMED));
  eq("and carries no weapon features into the effects", 
    derivedStats(statChar({ equipment: { primaryWeaponId: UNARMED } }), FX_DB).evasion.total, 9);

  // Same rule as a weapon: no attack line until the traits are assigned.
  const noTraits = statChar({ equipment: { primaryWeaponId: UNARMED } });
  noTraits.traits = { agility: null, strength: null, finesse: null, instinct: null, presence: null, knowledge: null };
  check("unassigned traits mean no attack yet, just as with a weapon",
    derivedStats(noTraits, FX_DB).primaryAttack === null);

  // A secondary is still a secondary when the other hand is empty.
  const withShield = derivedStats(statChar({
    equipment: { primaryWeaponId: UNARMED, secondaryWeaponId: "core_weapon_tower_shield" },
  }), FX_DB);
  eq("an off-hand weapon still applies", withShield.armorScore.total, 2);
  check("and still gets its own attack", withShield.secondaryAttack !== null);
}

// A class feature can hand you a better pair of fists than the SRD's. Nothing the SRD ships does,
// so every fixture here is invented — the point is that the app can carry one at all.
const PROFILE_DB = {
  ...FX_DB,
  classes: [{ ...FX_DB.classes[0], classFeatures: [{ name: { "en-US": "Bare Fists" } }] }],
  effects: {
    "cls:Bare Fists": {
      unarmedProfile: {
        name: { "en-US": "Practised Strike" },
        // "A trait of your choice" is all six, which is more than the SRD's profile names.
        traits: ["AGILITY", "STRENGTH", "FINESSE", "INSTINCT", "PRESENCE", "KNOWLEDGE"],
        range: "MELEE",
        // Two kinds of die, both scaling with Proficiency.
        damage: { dice: ["D8", "D6"], type: "PHYSICAL" },
      },
      evasion: 1,
    },
  },
};

group("A class can put its own weapon in your empty hands");
{
  const bare = derivedStats(statChar({ equipment: { primaryWeaponId: UNARMED } }), PROFILE_DB);
  eq("the declared profile stands in for the SRD's", bare.primaryAttack.weaponName, "Practised Strike");
  eq("and it can name more than two traits",
    bare.primaryAttack.display, "(+1) Agility / (+2) Strength / (0) Finesse / (+1) Instinct / (0) Presence / (-1) Knowledge");
  // The +1 Evasion rides on the same entry, and needs no `when` to be conditional: the entry is
  // only consulted while the profile is in use.
  eq("what the same feature grants alongside it counts too", bare.evasion.total, 10);
  check("with the breakdown naming the class feature",
    bare.evasion.parts.some((p) => p.label === "Guardian — Bare Fists"));

  // "While you have no other Active Weapons" — an off-hand weapon is an active weapon.
  const withOffhand = derivedStats(statChar({
    equipment: { primaryWeaponId: UNARMED, secondaryWeaponId: "dagger" },
  }), PROFILE_DB);
  eq("carrying anything in the other hand falls back to the SRD's d4",
    withOffhand.primaryAttack.weaponName, "Unarmed");
  eq("and the bonus that came with it goes too", withOffhand.evasion.total, 9);

  const armed = derivedStats(statChar({ equipment: { primaryWeaponId: "staff" } }), PROFILE_DB);
  eq("a character holding a weapon has no unarmed profile at all", armed.unarmedProfile, null);
  eq("and gets none of what the feature grants", armed.evasion.total, 9);

  // A class with no such feature is exactly as it was.
  eq("the SRD's own profile is untouched",
    derivedStats(statChar({ equipment: { primaryWeaponId: UNARMED } }), FX_DB).primaryAttack.weaponName, "Unarmed");
}

group("Proficiency multiplies every die, not just the first");
{
  eq("one kind of die reads as it always has", damageDice({ dice: "D10" }), "d10");
  eq("and at Proficiency 2 it's two of them", damageDice({ dice: "D10" }, 2), "2d10");
  // The whole reason `dice` accepts a list: "2d8+d6" would be wrong, and silently so.
  eq("two kinds are joined the way the books write them", damageDice({ dice: ["D8", "D6"] }), "d8+d6");
  eq("and Proficiency applies to both", damageDice({ dice: ["D8", "D6"] }, 2), "2d8+2d6");
  eq("a damage rating prints its dice, modifier and type",
    damageText({ damage: { dice: ["D8", "D6"], modifier: 1, type: "PHYSICAL" } }), "d8+d6+1 phy");
  eq("nothing in, nothing out", [damageDice({}), damageDice({ dice: [] })], ["", ""]);

  // The SRD's two still print in full; a profile naming every trait says so in a word rather
  // than listing 62 characters of them on a roster row.
  eq("two traits are named", weaponStats(UNARMED_PROFILE), "Strength or Finesse · Melee · d4 phy");
  eq("all six are 'any trait'", weaponStats({
    traits: ["AGILITY", "STRENGTH", "FINESSE", "INSTINCT", "PRESENCE", "KNOWLEDGE"],
    range: "MELEE", damage: { dice: ["D8", "D6"], type: "PHYSICAL" },
  }), "Any trait · Melee · d8+d6 phy");
  eq("and a weapon from data/ still names its own one trait",
    weaponStats({ trait: "AGILITY", range: "MELEE", damage: { dice: "D8", type: "PHYSICAL" } }),
    "Agility · Melee · d8 phy");
}

group("A weapon profile a source declares is checked before it's believed");
{
  const ok = {
    name: { "en-US": "A" }, traits: ["STRENGTH"], range: "MELEE", damage: { dice: "D8", type: "PHYSICAL" },
  };
  eq("a complete profile is accepted", validateEffectEntry({ unarmedProfile: ok }), null);
  eq("so is one rolling several dice",
    validateEffectEntry({ unarmedProfile: { ...ok, damage: { dice: ["D8", "D6"] } } }), null);
  eq("and one granting a bonus alongside itself",
    validateEffectEntry({ unarmedProfile: ok, evasion: 1 }), null);
  // Each of these would print a weapon row with a hole in it rather than throwing.
  check("a profile with no name is refused",
    validateEffectEntry({ unarmedProfile: { ...ok, name: undefined } }) !== null);
  check("one naming no trait is refused, because there'd be nothing to roll",
    validateEffectEntry({ unarmedProfile: { ...ok, traits: [] } }) !== null);
  check("one naming a trait this game doesn't have is refused",
    validateEffectEntry({ unarmedProfile: { ...ok, traits: ["CHARISMA"] } }) !== null);
  check("and one with no dice is refused",
    validateEffectEntry({ unarmedProfile: { ...ok, damage: { dice: [] } } }) !== null);
}

group("Bare Bones stands in for the armor you didn't wear");
{
  // strength is +2 in the fixture. Tier 1 base thresholds are 9/19, and your level goes on top
  // of those exactly as it would on top of a breastplate's.
  const bones = (over) => derivedStats(statChar({
    equipment: { armorId: UNARMORED }, domainCardIds: ["core_domain_card_bare_bones"], ...over,
  }), FX_DB);

  const lv1 = bones({ level: 1 });
  eq("base Armor Score is 3 + your Strength", lv1.armorScore.total, 5);
  eq("Major is the card's 9 plus your level", lv1.majorThreshold.total, 10);
  eq("Severe is the card's 19 plus your level", lv1.severeThreshold.total, 20);
  eq("and the breakdown names the card, where armor would have named itself",
    lv1.armorScore.parts[0].label, "Bare Bones");

  // Tier 3 is levels 5-7, so the base moves to 13/31.
  const lv6 = bones({ level: 6 });
  eq("the thresholds follow your tier", [lv6.majorThreshold.total, lv6.severeThreshold.total], [19, 37]);

  // A shield is still a shield: additive effects stack on the override as they would on armor.
  const shielded = bones({ equipment: { armorId: UNARMORED, secondaryWeaponId: "core_weapon_tower_shield" } });
  eq("Barrier adds to Bare Bones' base", shielded.armorScore.total, 7);

  // "When you choose NOT to equip armor" — wearing any means the card does nothing.
  const armored = bones({ equipment: { armorId: "gambeson" } });
  eq("wearing armor, the card is silent", armored.armorScore.total, 3);

  // It's a loadout card, so it stops applying the moment it's vaulted.
  const vaulted = bones({ domainVaultIds: ["core_domain_card_bare_bones"] });
  eq("vaulting it gives the plain unarmored rule back", vaulted.armorScore.total, 0);
  eq("thresholds too", vaulted.majorThreshold.total, 1);
}

group("Loadout cards apply, vaulted ones don't");
{
  const withCard = (over) => statChar({ domainCardIds: ["core_domain_card_untouchable"], ...over });
  // Agility is +1 in the fixture; half of 1 rounds UP to 1, per the SRD's rounding rule.
  eq("Untouchable is half your Agility, rounded up", derivedStats(withCard(), FX_DB).evasion.total, 10);
  eq("vaulting it takes the bonus away",
    derivedStats(withCard({ domainVaultIds: ["core_domain_card_untouchable"] }), FX_DB).evasion.total, 9);

  // Codex-Touched needs 4 Codex cards in the loadout, and even then both its benefits cost
  // something. It's catalogued so the sheet can say so rather than looking broken.
  const codex = (ids) => derivedStats(statChar({ domainCardIds: ids }), FX_DB);
  eq("under 4 Codex cards, nothing is even mentioned", codex(["core_domain_card_codex_touched", "codex_a"]).exclusions.length, 0);
  eq("at 4, the sheet explains why nothing changed",
    codex(["core_domain_card_codex_touched", "codex_a", "codex_b", "codex_c"]).exclusions.length, 2);
}

group("A card that says 'choose' grants nothing until it's answered");
{
  const owned = { domainCardIds: ["core_domain_card_vitality"], domainVaultIds: ["core_domain_card_vitality"] };
  const unanswered = derivedStats(statChar(owned), FX_DB);
  eq("Vitality with no answer recorded adds nothing", [unanswered.hitPoints.total, unanswered.stress.total], [7, 6]);
  eq("and the sheet is told to ask", unresolvedChoices(statChar(owned), FX_DB).length, 1);

  const answered = statChar({ ...owned, effectChoices: { core_domain_card_vitality: { optionIds: ["stress", "hitPoint"] } } });
  const s = derivedStats(answered, FX_DB);
  // The card tells you to vault it, so a permanent choice has to survive being vaulted.
  eq("answered, it grants both chosen benefits even from the vault", [s.hitPoints.total, s.stress.total], [8, 7]);
  eq("and nothing is left to ask", unresolvedChoices(answered, FX_DB).length, 0);
}

group("The 12-point caps are hard: effects reach them sooner, never past");
{
  const ch = statChar({
    subclassId: "core_subclass_school_of_war",
    ...heritage("core_ancestry_giant", "Endurance"),
    hitPointSlotsBonus: 6,
  });
  const s = derivedStats(ch, FX_DB);
  eq("7 + 6 advancements + 2 granted would be 15, but stops at 12", s.hitPoints.total, MAX_HIT_POINT_SLOTS);
  check("and the breakdown says it clamped", !!s.hitPoints.note);
  eq("effectBonuses reports the grant so the slot gating can see it", effectBonuses(ch, FX_DB).hitPointSlots, 2);
}

group("A subclass upgrade that grants a domain card actually hands one over");
{
  // The School of Knowledge takes an extra card at every tier. The level up screen works out
  // how many by asking what the character's effects grant before this level's picks and after
  // them, so nothing outside effects.js names the subclass.
  const KNOW_DB = {
    classes: [{ id: "cls", name: "WIZARD", domains: ["VALOR", "BLADE"], startingHitPoints: 5, startingEvasion: 11 }],
    subclasses: [
      { id: "core_subclass_school_of_knowledge", foundation: {}, specialization: {}, mastery: {} },
      { id: "sub" },
    ],
    domainCards: ["k1", "k2", "k3", "k4"].map((id, i) => ({ id, name: { "en-US": id }, domain: "BLADE", level: i + 1 })),
  };
  const know = (over) => {
    const ch = newCharacter();
    ch.subclassId = "core_subclass_school_of_knowledge";
    ch.baseline.subclassTier = "foundation";
    return Object.assign(ch, over);
  };

  // Level 5 with a subclass upgrade: Foundation -> Specialization, and Accomplished grants one.
  const upgrade = entry(5, [{ key: "subclass", slotTier: 3 }, { key: "evasion", slotTier: 3 }], "k1");
  has("taking the upgrade without the granted card is flagged",
    validateEntry(know({ level: 5 }), upgrade, KNOW_DB), "1 granted at this level");

  const withCard = { ...upgrade, grantedCardIds: ["k2"] };
  eq("with the card chosen it adds up", validateEntry(know({ level: 5 }), withCard, KNOW_DB), []);

  has("a second granted card is one too many",
    validateEntry(know({ level: 5 }), { ...upgrade, grantedCardIds: ["k2", "k3"] }, KNOW_DB),
    "2 chosen, 1 granted");

  // Not an advancement slot, so only your level caps it — no tier cap.
  has("and it still has to be a card you could take",
    validateEntry(know({ level: 5 }), { ...upgrade, grantedCardIds: ["k1"] }, KNOW_DB),
    "already in the collection");

  // A level with no subclass upgrade grants nothing, even for this subclass.
  const noUpgrade = entry(4, [{ key: "evasion", slotTier: 2 }, { key: "stress", slotTier: 2 }], "k1");
  eq("a level without the upgrade grants no card", validateEntry(know({ level: 4 }), noUpgrade, KNOW_DB), []);
  has("so recording one there is wrong",
    validateEntry(know({ level: 4 }), { ...noUpgrade, grantedCardIds: ["k2"] }, KNOW_DB),
    "1 chosen, 0 granted");

  // The replay has to put it in the collection alongside the guaranteed card.
  const ch = know({ level: 4 });
  ch.level = 5;
  ch.levelUps.push(withCard);
  recomputeCharacter(ch);
  eq("and the replay adds it to the collection", ch.domainCardIds.includes("k2"), true);
  eq("alongside the guaranteed one", ch.domainCardIds.includes("k1"), true);
}

group("Answers are only complete when they pick everything asked for");
{
  const vitality = EFFECTS["domain_card_vitality"].choice;
  eq("a blank answer isn't an answer", isAnswered(vitality, blankAnswer()), false);
  eq("one of two isn't either", isAnswered(vitality, { optionIds: ["stress"] }), false);
  eq("two of two is", isAnswered(vitality, { optionIds: ["stress", "hitPoint"] }), true);

  const motc = EFFECTS["domain_card_master_of_the_craft"].choice;
  eq("+3 to one needs one Experience named",
    isAnswered(motc, { optionId: "one", experienceIds: ["e1"] }), true);
  eq("+2 to two needs two", isAnswered(motc, { optionId: "two", experienceIds: ["e1"] }), false);
}

group("Every id in effects.js still exists in data/srd_2_0/");
{
  // The one group that reads data/ for real. An upstream refresh that renames an id would
  // otherwise drop an effect silently: no error, just a number that quietly stops being right.
  const load = async (name) => (await fetch(`../data/srd_2_0/${name}.json${RUN}`)).json();
  const [ancestries, subclasses, armors, weapons, cards, classes, transformations] = await Promise.all(
    ["ancestries", "subclasses", "armors", "weapons", "domain-cards", "classes", "transformations"].map(load));

  // ignoresBurden() matches a class feature by name rather than by an EFFECTS key, so the check
  // below can't cover it. Renamed upstream, the Warrior would silently start getting a burden
  // warning the book says they're exempt from.
  check("the Warrior still has Combat Training to ignore burden with",
    ignoresBurden({ classId: "srd_2_0_class_warrior" }, { classes }));

  const known = new Set();
  // A record's id names the edition that published it; effects.js is keyed without that prefix
  // so one entry serves every edition. Both forms go in, so this group keeps catching a RENAME
  // (which is what it exists for) without failing on the prefix itself.
  const SOURCE = "srd_2_0";
  const bare = (id) => (id.startsWith(`${SOURCE}_`) ? id.slice(SOURCE.length + 1) : id);
  const addKey = (k) => known.add(k);
  const featureKeys = (list, prefix) => {
    for (const item of list) {
      for (const f of item.features || []) {
        addKey(`${item.id}:${f.name["en-US"]}`);
        addKey(`${bare(item.id)}:${f.name["en-US"]}`);
        addKey(`${prefix}:${f.name["en-US"]}`);
      }
    }
  };
  featureKeys(ancestries, "ancestry");
  featureKeys(armors, "armor");
  featureKeys(weapons, "weapon");
  // SRD 2.0 ships six of these; before it did, no transformation could have an entry to check.
  featureKeys(transformations, "transformation");
  for (const s of subclasses) for (const tier of ["foundation", "specialization", "mastery"]) {
    if (s[tier]) { addKey(`${s.id}:${tier}`); addKey(`${bare(s.id)}:${tier}`); }
  }
  // Class features, keyed the way collectEffects keys them. Only reachable since a class started
  // declaring something (the dice), and it's the same guarantee: rename "Rally" upstream and the
  // Bard's die would quietly stop printing rather than fail.
  for (const c of classes) {
    for (const f of [...(c.classFeatures || []), c.hopeFeature].filter(Boolean)) {
      if (f.name?.["en-US"]) { addKey(`${c.id}:${f.name["en-US"]}`); addKey(`${bare(c.id)}:${f.name["en-US"]}`); }
    }
  }
  for (const c of cards) { addKey(c.id); addKey(bare(c.id)); }

  const missing = Object.keys(EFFECTS).filter((k) => !known.has(k));
  check(`all ${Object.keys(EFFECTS).length} effect keys resolve`, missing.length === 0,
    missing.length ? `not found in data/:\n${missing.join("\n")}` : undefined);
}

// ---------- sheet-data.js ----------
//
// sheet-data.js delegates every number it used to compute by hand to derivedStats(), so most
// of what would need testing here is already covered by the "derived stats" groups above — a
// bug in that arithmetic would show up there, not here. What's left to check is genuinely
// sheet-specific: the damage-die string (not a derivedStats() concern at all), the heritage
// feature filter (a correctness fix the old branch made and this rewrite must not lose), the
// list-block flattening, and that a draft with no class chosen yet still produces a sheet
// instead of throwing.

// A small fixture db with just enough of each entity's shape for deriveSheet() to walk: named
// fields, feature arrays with both `paragraph` and `list` description blocks, weapons with and
// without a damage modifier.
const SHEET_DB = {
  classes: [{
    id: "cls", name: "GUARDIAN", domains: ["VALOR", "BLADE"], startingHitPoints: 7, startingEvasion: 9,
    hopeFeature: { name: { "en-US": "Unstoppable" }, description: [{ paragraph: { "en-US": "Reduce incoming damage by one threshold." } }] },
    classFeatures: [{ name: { "en-US": "Frontline Tank" }, description: [{ paragraph: { "en-US": "You mark 1 fewer Stress." } }] }],
  }],
  subclasses: [{
    id: "sub", name: { "en-US": "Stalwart" }, spellcastTrait: "KNOWLEDGE",
    foundation: { features: [{ name: { "en-US": "Unwavering" }, description: [{ paragraph: { "en-US": "+1 to your damage thresholds." } }] }] },
    specialization: { features: [{ name: { "en-US": "Unrelenting" }, description: [{ paragraph: { "en-US": "+2 to your damage thresholds." } }] }] },
    mastery: { features: [{ name: { "en-US": "Undaunted" }, description: [{ paragraph: { "en-US": "+3 to your damage thresholds." } }] }] },
  }],
  ancestries: [
    {
      id: "anc_a", name: { "en-US": "Giant" },
      features: [
        { name: { "en-US": "Endurance" }, description: [{ paragraph: { "en-US": "Gain an additional Hit Point slot." } }] },
        { name: { "en-US": "Reach" }, description: [{ paragraph: { "en-US": "Extend your reach by one range band." } }] },
      ],
    },
    {
      id: "anc_b", name: { "en-US": "Simiah" },
      features: [
        { name: { "en-US": "Natural Climber" }, description: [{ paragraph: { "en-US": "You always succeed on Agility Rolls to climb." } }] },
        { name: { "en-US": "Nimble" }, description: [{ paragraph: { "en-US": "+1 to Evasion." } }] },
      ],
    },
  ],
  communities: [{ id: "com", name: { "en-US": "Wanderborne" }, features: [{ name: { "en-US": "Nomadic Pack" }, description: [{ paragraph: { "en-US": "Extra inventory slot." } }] }] }],
  domainCards: [{ id: "card1", name: { "en-US": "Rise Up" }, domain: "VALOR", level: 1, type: "ABILITY", recallCost: 0, features: [] }],
  armors: [{ id: "gambeson", name: { "en-US": "Gambeson" }, baseScore: 3, baseMajorThreshold: 5, baseSevereThreshold: 11, features: [] }],
  weapons: [
    { id: "modified", name: { "en-US": "Heavy Warhammer" }, trait: "STRENGTH", range: "MELEE", burden: "TWO_HANDED", damage: { dice: "D10", modifier: 3, type: "PHYSICAL" }, features: [] },
    { id: "plain", name: { "en-US": "Shortsword" }, trait: "AGILITY", range: "MELEE", burden: "ONE_HANDED", damage: { dice: "D6", type: "PHYSICAL" }, features: [] },
    // A feature whose only description block is a `list`, the way Guardian's Unstoppable is in
    // the real data — no `paragraph` at all, so `text` must come back empty and `items` must
    // carry the bullets, or the render layer prints a heading over nothing.
    { id: "listed", name: { "en-US": "Listed Blade" }, trait: "AGILITY", range: "MELEE", burden: "ONE_HANDED", damage: { dice: "D6", type: "PHYSICAL" }, features: [{ name: { "en-US": "Options" }, description: [{ list: [{ "en-US": "Choose fire." }, { "en-US": "Choose frost." }] }] }] },
  ],
  consumables: [],
};

function sheetChar(over = {}) {
  const ch = newCharacter();
  ch.classId = "cls";
  ch.subclassId = "sub";
  ch.heritage = { ancestryMode: "pure", ancestryIds: ["anc_a"], chosenFeatures: [{ ancestryId: "anc_a", featureName: "Endurance" }, { ancestryId: "anc_a", featureName: "Reach" }], communityId: "com" };
  // No weaponMode, the same shape create.js now saves. Tests that need the legacy field say so.
  ch.equipment = { primaryWeaponId: null, secondaryWeaponId: null, armorId: "gambeson", potionChoice: null };
  ch.background = { description: "", answers: "" };
  ch.connectionsNotes = "";
  return Object.assign(ch, over);
}

group("Sheet damage strings: Proficiency copies of the die, plus an optional modifier");
{
  const withMod = deriveSheet(sheetChar({ proficiency: 2, equipment: { weaponMode: "two-handed", primaryWeaponId: "modified", armorId: "gambeson" } }), SHEET_DB);
  eq("a D10 with +3 at Proficiency 2 prints 2d10+3", withMod.weapons[0].damage, "2d10+3");

  const noMod = deriveSheet(sheetChar({ proficiency: 1, equipment: { weaponMode: "two-handed", primaryWeaponId: "plain", armorId: "gambeson" } }), SHEET_DB);
  eq("a weapon with no modifier never prints a trailing +0", noMod.weapons[0].damage, "1d6");
}

group("Sheet weapons: a secondary prints because it's equipped, not because of a mode string");
{
  // This used to assert that a "two-handed" weaponMode printed only the primary. The sheet was
  // the last reader of that field, and it outlived the truth: nothing writes weaponMode any
  // more, so the gate was never satisfied and every off-hand weapon quietly went missing from
  // the printed page — including the shield a Warrior is allowed to carry behind a two-handed
  // primary, whose Barrier was already counted in the Armor Score printed alongside it.
  const both = deriveSheet(sheetChar({ equipment: { primaryWeaponId: "plain", secondaryWeaponId: "modified", armorId: "gambeson" } }), SHEET_DB);
  eq("both weapons print", both.weapons.length, 2);
  eq("and the off-hand is the one that was equipped", both.weapons[1].name, "Heavy Warhammer");

  // A two-handed primary with a secondary still equipped is the Warrior case, not a stale slot.
  const twoHandedPrimary = deriveSheet(sheetChar({ equipment: { primaryWeaponId: "modified", secondaryWeaponId: "plain", armorId: "gambeson" } }), SHEET_DB);
  eq("a two-handed primary doesn't hide what's in the other hand", twoHandedPrimary.weapons.length, 2);

  // Characters saved before the change still carry the field. It has to mean nothing.
  const legacy = deriveSheet(sheetChar({ equipment: { weaponMode: "two-handed", primaryWeaponId: "plain", secondaryWeaponId: "modified", armorId: "gambeson" } }), SHEET_DB);
  eq("a leftover weaponMode from an older save changes nothing", legacy.weapons.length, 2);

  const alone = deriveSheet(sheetChar({ equipment: { primaryWeaponId: "plain", armorId: "gambeson" } }), SHEET_DB);
  eq("with nothing in the off hand, only the primary prints", alone.weapons.length, 1);
}

group("Sheet heritage: mixed ancestry prints only the chosen feature, pure prints them all");
{
  // Mirrors create.js's ancestry-mode "pure" branch, where chosenFeatures is seeded with every
  // feature of the ancestry — so filtering by it is a no-op there.
  const pure = deriveSheet(sheetChar(), SHEET_DB); // sheetChar()'s default heritage is pure, both Giant features chosen
  eq("pure ancestry: filtering by chosenFeatures is a no-op", pure.ancestryFeatures.map((f) => f.name).sort(), ["Endurance", "Reach"]);

  // Mixed ancestry: create.js records exactly one feature per ancestry. A Giant whose ONE pick
  // was Reach must not also print Endurance just because it belongs to the same ancestry.
  const mixed = deriveSheet(sheetChar({
    heritage: {
      ancestryMode: "mixed",
      ancestryIds: ["anc_a", "anc_b"],
      chosenFeatures: [{ ancestryId: "anc_a", featureName: "Reach" }, { ancestryId: "anc_b", featureName: "Nimble" }],
      communityId: "com",
    },
  }), SHEET_DB);
  eq("mixed ancestry: only the picked feature per ancestry prints", mixed.ancestryFeatures.map((f) => f.name).sort(), ["Nimble", "Reach"]);
  check("the unpicked sibling features are gone", !mixed.ancestryFeatures.some((f) => f.name === "Endurance" || f.name === "Natural Climber"));
}

group("Sheet features: list-block description without a paragraph still prints");
{
  const s = deriveSheet(sheetChar({ equipment: { weaponMode: "two-handed", primaryWeaponId: "listed", armorId: "gambeson" } }), SHEET_DB);
  const f = s.weapons[0].features[0];
  eq("a single list block survives, tagged and in order", f.description,
    [{ type: "list", items: ["Choose fire.", "Choose frost."] }]);
}

group("Sheet features: paragraph -> list -> paragraph keeps its blocks in source order");
{
  // Shaped exactly like the real Champion's Edge (10 of the 189 domain cards share this
  // paragraph -> list -> paragraph shape): a lead-in, the Hope options it introduces, then a
  // paragraph restricting them. Before this fix, features() joined every paragraph into one
  // string and every list into another, which welded the restriction onto the lead-in and
  // printed it BEFORE the options it restricts — this is the fixture that would have caught it.
  const EDGE_DB = {
    ...SHEET_DB,
    domainCards: [...SHEET_DB.domainCards, {
      id: "card_edge", name: { "en-US": "Champion's Edge" }, domain: "BLADE", level: 5,
      type: "ABILITY", recallCost: 1,
      features: [{
        description: [
          { paragraph: { "en-US": "Choose one of the following options for each Hope spent:" } },
          {
            list: [
              { "en-US": "Clear a Hit Point." },
              { "en-US": "Clear an Armor Slot." },
              { "en-US": "The target marks an additional Hit Point." },
            ],
          },
          { paragraph: { "en-US": "You can't choose the same option more than once." } },
        ],
      }],
    }],
  };
  const s = deriveSheet(sheetChar({ domainCardIds: ["card_edge"], creationDomainCardIds: ["card_edge"] }), EDGE_DB);
  const blocks = s.loadout[0].features[0].description;
  eq("all three blocks survive, in source order", blocks.map((b) => b.type), ["paragraph", "list", "paragraph"]);
  eq("the lead-in prints first", blocks[0].text, "Choose one of the following options for each Hope spent:");
  eq("the three Hope options are untouched", blocks[1].items.length, 3);
  eq("the restriction prints LAST, after its options — the bug this fixes",
    blocks[2].text, "You can't choose the same option more than once.");
}

group("Sheet features: multiple paragraphs stay separate blocks, not a run-on string");
{
  // Shaped like Beastbound's Companion: two paragraphs, no list. 65 of 354 features have more
  // than one paragraph; the old `text: (description).map(...).join(" ")` printed them as one
  // block with no break, which is what this equality check on the block array rules out.
  const db = {
    ...SHEET_DB,
    classes: [{
      ...SHEET_DB.classes[0],
      classFeatures: [{
        name: { "en-US": "Companion" },
        description: [
          { paragraph: { "en-US": "You have an animal companion of your choice." } },
          { paragraph: { "en-US": "Take the Ranger Companion sheet." } },
        ],
      }],
    }],
  };
  const s = deriveSheet(sheetChar(), db);
  eq("two paragraph blocks, not one joined string", s.classFeatures[0].description, [
    { type: "paragraph", text: "You have an animal companion of your choice." },
    { type: "paragraph", text: "Take the Ranger Companion sheet." },
  ]);
}

group("Sheet spellcast: trait name, a bonus applied, and no box for non-casters");
{
  const plain = deriveSheet(sheetChar(), SHEET_DB); // "sub"'s spellcastTrait is KNOWLEDGE
  eq("shows the trait name, not a bare number", plain.spellcast.display, "Knowledge");
  check("traitLabel doesn't ride along onto the sheet (finding 6: display already names the trait)",
    !("traitLabel" in plain.spellcast));

  // The armor's feature is named "Channeling", the same generic `armor:Channeling` key
  // effects.js resolves for any armor with that feature — the trick the "Sheet stats agree
  // with derivedStats()" group above already uses for Very Heavy.
  const BONUS_DB = {
    ...SHEET_DB,
    armors: [...SHEET_DB.armors, {
      id: "chan", name: { "en-US": "Channeling Armor" }, baseScore: 5,
      baseMajorThreshold: 13, baseSevereThreshold: 36,
      features: [{ name: { "en-US": "Channeling" }, description: [{ paragraph: { "en-US": "+1 to Spellcast Rolls." } }] }],
    }],
  };
  const boosted = deriveSheet(sheetChar({
    equipment: { weaponMode: "two-handed", primaryWeaponId: null, secondaryWeaponId: null, armorId: "chan", potionChoice: null },
  }), BONUS_DB);
  eq("a bonus shows on the Spellcast box, not folded into the trait", boosted.spellcast.display, "Knowledge +1");

  const NOCAST_DB = { ...SHEET_DB, subclasses: [...SHEET_DB.subclasses, { id: "nocast", name: { "en-US": "Stonewall" } }] };
  const guardian = deriveSheet(sheetChar({ subclassId: "nocast" }), NOCAST_DB);
  check("Guardian/Warrior subclasses with no Spellcast trait get no box at all", guardian.spellcast === null);
}

group("Sheet hitPointsNote and stressNote: the same clamp caption armorScoreNote already gets");
{
  const capped = deriveSheet(sheetChar({ hitPointSlotsBonus: 20, stressSlotsBonus: 20 }), SHEET_DB);
  eq("Hit Points clamp at the rules maximum", capped.hitPoints, MAX_HIT_POINT_SLOTS);
  check("and the sheet is told why", !!capped.hitPointsNote);
  eq("Stress clamps too", capped.stress, MAX_STRESS_SLOTS);
  check("with its own note", !!capped.stressNote);

  const uncapped = deriveSheet(sheetChar(), SHEET_DB);
  check("no note printed when nothing clamped", !uncapped.hitPointsNote && !uncapped.stressNote);
}

group("Sheet loadout: a vaulted card is filtered out, an active one isn't");
{
  const DB2 = {
    ...SHEET_DB,
    domainCards: [...SHEET_DB.domainCards,
      { id: "card2", name: { "en-US": "Two" }, domain: "VALOR", level: 1, type: "ABILITY", recallCost: 0, features: [] }],
  };
  const s = deriveSheet(sheetChar({
    domainCardIds: ["card1", "card2"], creationDomainCardIds: ["card1", "card2"], domainVaultIds: ["card2"],
  }), DB2);
  eq("only the active card prints in the loadout", s.loadout.map((c) => c.id), ["card1"]);
}

group("Sheet experiences: a resolved permanent-bonus choice reaches the printed total");
{
  // Clank's Purposeful Design, the fix sheet-data.js's own comment claims: "a couple of
  // features ... add a permanent bonus on top of the level-up value, and the old file's
  // `character.experiences[i].modifier` never saw that bonus." Real id, because effects.js is
  // keyed by real ids (`core_ancestry_clank:Purposeful Design`) and an entry keyed to an id
  // that doesn't exist grants nothing at all, silently.
  const CLANK_DB = {
    ...SHEET_DB,
    ancestries: [...SHEET_DB.ancestries, {
      id: "core_ancestry_clank", name: { "en-US": "Clank" },
      features: [{ name: { "en-US": "Purposeful Design" }, description: [{ paragraph: { "en-US": "..." } }] }],
    }],
  };
  const s = deriveSheet(sheetChar({
    heritage: {
      ancestryMode: "pure", ancestryIds: ["core_ancestry_clank"],
      chosenFeatures: [{ ancestryId: "core_ancestry_clank", featureName: "Purposeful Design" }],
      communityId: null,
    },
    effectChoices: { "core_ancestry_clank:Purposeful Design": { optionId: "one", experienceIds: ["e1"] } },
  }), CLANK_DB);
  eq("the chosen Experience shows the base value plus the permanent bonus",
    s.experiences.find((e) => e.name === "A").display, "+3"); // base 2 + Purposeful Design's +1
  eq("the Experience not chosen is untouched", s.experiences.find((e) => e.name === "B").display, "+2");
}

group("Sheet subclassFeatures: every tier earned prints, not just the current one");
{
  // Upgrading a subclass card ADDS a tier, it doesn't replace the one below it — the same
  // rule subclassTiersUpTo() encodes for characters.js's detail view (see "A subclass upgrade
  // adds a card, it doesn't replace the one below" above). A Mastery character still has their
  // Foundation and Specialization features; printing only sub[subclassTier] silently dropped
  // them.
  const mastery = deriveSheet(sheetChar({ subclassTier: "mastery" }), SHEET_DB);
  eq("Foundation, Specialization and Mastery all print, in that order",
    mastery.subclassFeatures.map((f) => f.name), ["Unwavering", "Unrelenting", "Undaunted"]);
  eq("each feature is labelled with ITS OWN tier, not the character's current one",
    mastery.subclassFeatures.map((f) => f.source), ["Foundation", "Specialization", "Mastery"]);

  const foundation = deriveSheet(sheetChar(), SHEET_DB); // sheetChar()'s default tier is foundation
  eq("a Foundation character only gets the Foundation feature",
    foundation.subclassFeatures.map((f) => f.name), ["Unwavering"]);
}

group("Sheet: a draft with no class chosen is still printable");
{
  const draft = deriveSheet(sheetChar({ classId: null, subclassId: null }), SHEET_DB);
  eq("class name falls back to a dash", draft.className, "—");
  eq("subclass name falls back to a dash", draft.subclassName, "—");
  check("Evasion has nothing to show", draft.evasion === null);
  check("Hit Points has nothing to show", draft.hitPoints === null);
  check("there's no Hope feature to print", draft.hopeFeature === null);
  eq("no class features either", draft.classFeatures, []);
  check("Spellcast has nothing to show without a subclass", draft.spellcast === null);
  // Thresholds and Armor Score don't depend on class at all — they're still there.
  check("Armor Score doesn't need a class", draft.armorScore === 3);
}

group("Sheet stats agree with derivedStats() rather than re-deriving anything");
{
  // "Very Heavy" is keyed generically in effects.js as `armor:Very Heavy` — it resolves off the
  // FEATURE NAME, not the armor's id, so a fixture armor picks up the real, unmodified
  // effects.js entry (-2 Evasion, -1 Agility) the same way a real "Full Plate Armor" would.
  // That makes this a genuine check that the sheet reads EFFECTIVE traits/Evasion (through
  // derivedStats()), not `character.traits` / `startingEvasion + evasionBonus` directly.
  const EFFECT_DB = {
    ...SHEET_DB,
    weapons: [...SHEET_DB.weapons, { id: "sword", name: { "en-US": "Broadsword" }, trait: "AGILITY", range: "MELEE", burden: "ONE_HANDED", damage: { dice: "D8", type: "PHYSICAL" }, features: [] }],
    armors: [
      ...SHEET_DB.armors,
      { id: "heavy", name: { "en-US": "Full Plate" }, baseScore: 4, baseMajorThreshold: 8, baseSevereThreshold: 17, features: [{ name: { "en-US": "Very Heavy" }, description: [{ paragraph: { "en-US": "-2 to Evasion; -1 to Agility" } }] }] },
      { id: "absurd", name: { "en-US": "Absurd Plate" }, baseScore: 40, baseMajorThreshold: 5, baseSevereThreshold: 11, features: [] },
    ],
  };
  const heavy = deriveSheet(sheetChar({
    level: 3, traits: { agility: 1, strength: 2, finesse: 0, instinct: 1, presence: 0, knowledge: -1 },
    equipment: { weaponMode: "one-handed", primaryWeaponId: "sword", armorId: "heavy" },
  }), EFFECT_DB);
  eq("Evasion picks up Very Heavy's -2, not just the class baseline", heavy.evasion, 7); // 9 - 2
  eq("the trait row shows the reduced Agility", heavy.traits.find((t) => t.key === "agility").display, "0"); // 1 - 1
  eq("the weapon's own attack roll uses the same reduced Agility", heavy.weapons[0].attack, "0");
  eq("thresholds are armor base plus level, same as derivedStats()", heavy.thresholds, { major: 11, severe: 20 }); // 8+3, 17+3

  // Armor Score can't exceed 12 (SRD) — printing armor.baseScore directly, as the old file did,
  // would show 40. The note is the one thing worth carrying onto a printed page even without a
  // popover to put it in, since nothing else at the table would tell a player their number capped.
  const capped = deriveSheet(sheetChar({ equipment: { weaponMode: "two-handed", armorId: "absurd" } }), EFFECT_DB);
  eq("Armor Score is capped at 12, not printed as the raw baseScore of 40", capped.armorScore, 12);
  check("and the cap is explained in a note the printed page can show", !!capped.armorScoreNote);
}

group("Every class carries what the detail card shows");
{
  // The card is page code this suite can't render, but it reads eight fields straight out of
  // classes.json — most of which nothing else in the app has ever touched. Renamed or dropped
  // upstream, they'd surface as a blank section rather than as an error.
  const classes = await (await fetch(`../data/srd_2_0/classes.json${RUN}`)).json();
  const text = (loc) => typeof loc?.["en-US"] === "string" && loc["en-US"] !== "";
  const body = (desc) => Array.isArray(desc) && desc.length > 0 &&
    desc.every((d) => text(d.paragraph) || (Array.isArray(d.list) && d.list.every(text)));
  const feature = (f) => !!f && text(f.name) && body(f.description);

  const incomplete = classes.filter((c) => !(
    typeof c.name === "string" && c.name !== "" &&
    Array.isArray(c.domains) && c.domains.length > 0 &&
    Number.isFinite(c.startingEvasion) && Number.isFinite(c.startingHitPoints) &&
    body(c.description) &&
    Array.isArray(c.classItems) && c.classItems.length > 0 && c.classItems.every(text) &&
    feature(c.hopeFeature) &&
    Array.isArray(c.classFeatures) && c.classFeatures.length > 0 && c.classFeatures.every(feature)
  )).map((c) => c.name);

  check(`all ${classes.length} classes carry every field the card reads`, incomplete.length === 0,
    incomplete.length ? `incomplete: ${incomplete.join(", ")}` : undefined);
}

group("Sheet: a class-granted pair of fists prints as the weapon it is");
{
  // The printed sheet is where a wrong die actually costs someone a session, so the profile has
  // to survive all the way onto paper — name, dice and Proficiency together.
  const db = {
    ...SHEET_DB,
    effects: {
      "cls:Frontline Tank": {
        unarmedProfile: {
          name: { "en-US": "Practised Strike" },
          traits: ["STRENGTH", "AGILITY"],
          range: "MELEE",
          damage: { dice: ["D8", "D6"], type: "PHYSICAL" },
        },
      },
    },
  };
  const sheet = deriveSheet(sheetChar({
    proficiency: 2, equipment: { primaryWeaponId: UNARMED, armorId: "gambeson" },
  }), db);
  eq("it prints under the profile's own name, not \"Unarmed\"", sheet.weapons[0].name, "Practised Strike");
  eq("with Proficiency copies of every die", sheet.weapons[0].damage, "2d8+2d6");
  eq("at the range the profile gives it", sheet.weapons[0].range, "Melee");
  // Two traits and no single total, the same way the SRD's profile prints.
  eq("naming every trait it can be rolled with", sheet.weapons[0].attack, "(+2) Strength / (+1) Agility");
  eq("and no bracketed trait after a string that already names them", sheet.weapons[0].traitLabel, "");

  const plain = deriveSheet(sheetChar({
    proficiency: 2, equipment: { primaryWeaponId: UNARMED, armorId: "gambeson" },
  }), SHEET_DB);
  eq("a class that declares none still prints the SRD's d4", plain.weapons[0].damage, "2d4");
}

group("Sheet: fighting unarmed and going unarmored print as the choices they are");
{
  // Both sentinels are stored values with no record behind them in data/, so a sheet that looks
  // them up the ordinary way finds nothing: an empty weapon block and a bare dash, exactly what
  // a character who never finished the wizard would print. The whole point of choosing them is
  // that they ARE choices, and the table needs the rules that come with them.
  const barehanded = deriveSheet(sheetChar({ equipment: { primaryWeaponId: UNARMED, secondaryWeaponId: null, armorId: UNARMORED } }), SHEET_DB);

  eq("an unarmed character still gets a weapon row", barehanded.weapons.length, 1);
  eq("named for what it is", barehanded.weapons[0].name, "Unarmed");
  // SRD: successful unarmed attacks inflict [Proficiency]d4 — the same Proficiency-multiplies-
  // the-dice rule as any weapon. Proficiency is 1 in the fixture.
  eq("with the SRD's [Proficiency]d4 damage", barehanded.weapons[0].damage, "1d4");
  eq("at melee range", barehanded.weapons[0].range, "Melee");
  // Strength 2, Finesse 0 in the fixture. The GM calls which one per roll, so both print — and
  // a zero prints bare, the same as everywhere else a modifier is signed.
  eq("and both traits the GM can call for", barehanded.weapons[0].attack, "(+2) Strength / (0) Finesse");
  // That string names its own traits, so sheet.js must not print a bracketed trait after it.
  eq("with no single trait to name in brackets", barehanded.weapons[0].traitLabel, "");

  eq("choosing to wear nothing says so", barehanded.armorName, "Unarmored");
  eq("and scores 0, per the unarmored rule", barehanded.armorScore, 0);

  // The dash is what an unfinished character gets — the two have to stay distinguishable.
  const undecided = deriveSheet(sheetChar({ equipment: { primaryWeaponId: null, secondaryWeaponId: null, armorId: null } }), SHEET_DB);
  eq("a slot nobody has filled in yet still prints a dash", undecided.armorName, "—");
  eq("and an empty pair of hands prints no weapon row", undecided.weapons.length, 0);
}

// ---------- the CSV export ----------

// The export feeds a mail-merge document in another project, so a column that quietly stops
// being filled is a blank line on somebody's printed character sheet rather than a crash here.

// Rebuilt from the CSV rather than read off the objects, so the escaping is under test too:
// every field is quoted, and feature cells deliberately contain newlines.
function parseCsv(text) {
  const rows = [];
  let row = [], field = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\r" && text[i + 1] === "\n") { row.push(field); field = ""; rows.push(row); row = []; i++; }
    else field += c;
  }
  row.push(field);
  rows.push(row);
  return rows;
}

// One character's row as { header: value }, which is how the renderer reads it. `db` is the
// shared fixture unless a check needs content it hasn't got — a second Spellcast trait, a dice
// track, a second content folder.
function exportRow(ch, opts, db = CSV_DB) {
  const rows = parseCsv(buildCsv([ch], db, opts));
  return Object.fromEntries(rows[1].map((value, i) => [rows[0][i], value]));
}

const para = (text) => ({ paragraph: { "en-US": text } });
const feat = (name, ...description) => ({ name: { "en-US": name }, description });

const CSV_DB = {
  ...FX_DB,
  classes: [{
    id: "cls", name: "GUARDIAN", domains: ["VALOR", "BLADE"], startingHitPoints: 7, startingEvasion: 9,
    hopeFeature: feat("Frontline Tank", para("Spend 3 Hope to clear 2 Armor Slots.")),
    classFeatures: [
      feat("Unstoppable", para("Once per long rest, you can become Unstoppable.")),
      // Shaped like Guardian's second class feature in data/: a name that is a whole sentence
      // ending in a colon, and content that is nothing but bullets.
      {
        name: { "en-US": "While Unstoppable, you gain the following benefits:" },
        description: [{ list: [{ "en-US": "You reduce the severity of physical damage." }, { "en-US": "You can't be Restrained." }] }],
      },
    ],
  }],
  subclasses: [{
    id: "sub", name: { "en-US": "Stalwart" }, spellcastTrait: "KNOWLEDGE",
    foundation: { features: [feat("Unwavering", para("Gain a permanent +1 bonus to your damage thresholds."))] },
    // Two features in one tier, like Beastbound's Specialization.
    specialization: { features: [feat("Expert Training", para("Choose an additional level-up option.")), feat("Battle-Bonded", para("Gain a +2 bonus to your Evasion."))] },
    mastery: { features: [feat("Undaunted", para("Gain a permanent +3 bonus."))] },
  }],
  ancestries: [
    { id: "clank", name: { "en-US": "Clank" }, features: [feat("Purposeful Design", para("Decide who made you.")), feat("Efficient", para("Choose a long rest move."))] },
    { id: "human", name: { "en-US": "Human" }, features: [feat("High Stamina", para("Gain an additional Stress slot."))] },
  ],
  communities: [{ id: "com", name: { "en-US": "Highborne" }, features: [feat("Privilege", para("You have advantage on rolls to consort with nobles."))] }],
  weapons: [
    { id: "longsword", name: { "en-US": "Longsword" }, trait: "AGILITY", range: "MELEE", burden: "TWO_HANDED", damage: { dice: "D10", modifier: 3, type: "PHYSICAL" }, features: [feat("Reliable", para("+1 to attack rolls."))] },
    { id: "dagger", name: { "en-US": "Dagger" }, trait: "FINESSE", range: "MELEE", burden: "ONE_HANDED", damage: { dice: "D8", modifier: 1, type: "PHYSICAL" } },
  ],
  armors: [{ id: "gambeson", name: { "en-US": "Gambeson" }, baseScore: 3, baseMajorThreshold: 5, baseSevereThreshold: 11, features: [feat("Flexible", para("+1 to Evasion."))] }],
  consumables: [{ id: "potion", name: { "en-US": "Minor Health Potion" } }],
  // Added to FX_DB's cards rather than replacing them: the two-exports tests below name
  // Untouchable, Vitality and Bare Bones, which carry the effects that make those tests work.
  domainCards: [
    ...FX_DB.domainCards,
    // The shape 176 of the 189 real cards have: one feature, unnamed, a paragraph.
    {
      id: "fx_bond", name: { "en-US": "A Soldier's Bond" }, domain: "BLADE", type: "ABILITY", level: 2, recallCost: 1,
      features: [{ description: [para("Once per long rest, when you compliment someone, you can both gain 3 Hope.")] }],
    },
    // A Grimoire: three named features in one card, the case that breaks any one-line-per-card idea.
    {
      id: "fx_ava", name: { "en-US": "Book of Ava" }, domain: "CODEX", type: "GRIMOIRE", level: 1, recallCost: 2,
      features: [
        feat("Power Push", para("Make a Spellcast Roll against a target within Melee range.")),
        feat("Tava's Armor", para("Spend a Hope to give a target a +1 bonus to their Armor Score.")),
        feat("Ice Spike", para("Make a Spellcast Roll (12) to summon a large ice spike.")),
      ],
    },
    // A paragraph introducing bullets, like every *-Touched card.
    {
      id: "fx_touched", name: { "en-US": "Arcana-Touched" }, domain: "ARCANA", type: "ABILITY", level: 7, recallCost: 2,
      features: [{
        description: [
          para("When 4 or more of the domain cards in your loadout are from the Arcana domain, gain the following benefits:"),
          { list: [{ "en-US": "+1 bonus to your Spellcast Rolls" }, { "en-US": "Once per rest, you can switch the results of your Hope and Fear Dice." }] },
        ],
      }],
    },
    // Recall Cost 0, which a falsy check would drop.
    {
      id: "fx_free", name: { "en-US": "Wellspring" }, domain: "SPLENDOR", type: "SPELL", level: 1, recallCost: 0,
      features: [{ description: [para("Your presence steadies those around you.")] }],
    },
    // Vitality's shape: a lead-in, the benefits it introduces, then a closing instruction.
    // Ten of the 189 cards are paragraph -> list -> paragraph, and joining paragraphs with a
    // space made that last one read as part of the final bullet.
    {
      id: "fx_vitality", name: { "en-US": "Vitality" }, domain: "BLADE", type: "ABILITY", level: 5, recallCost: 0,
      features: [{
        description: [
          para("When you choose this card, permanently gain two of the following benefits:"),
          { list: [{ "en-US": "One Stress slot" }, { "en-US": "One Hit Point slot" }] },
          para("Then place this card in your vault permanently."),
        ],
      }],
    },
  ],
};

const csvChar = (over = {}) => statChar({
  heritage: { ancestryMode: "pure", ancestryIds: ["clank"], chosenFeatures: [{ ancestryId: "clank", featureName: "Purposeful Design" }], communityId: "com" },
  // One of each shape, with the Grimoire vaulted — so the card columns can be shown to ignore
  // the split that the two name-list columns exist to record.
  domainCardIds: ["fx_bond", "fx_ava", "fx_touched"], domainVaultIds: ["fx_ava"],
  ...over,
});

group("Every column is filled, and named once");
{
  const rows = parseCsv(buildCsv([csvChar()], CSV_DB));
  eq("the header names every column", rows[0].length, CSV_COLUMNS.length);
  eq("and a row has exactly as many fields as there are headers", rows[1].length, rows[0].length);

  const headers = CSV_COLUMNS.map((c) => c.header);
  eq("no header is used twice", headers.filter((h, i) => headers.indexOf(h) !== i), []);

  // A consumer looks columns up by header, so two of a name means one of them is unreachable.
  eq("every column has a header and something to put in it",
    CSV_COLUMNS.filter((c) => !c.header || typeof c.value !== "function"), []);

  // The spelling is part of the contract now, not just tidiness: the renderer derives its merge
  // tag from the header, so one stray capital or space is a tag nothing in the template matches.
  // The generated columns — the feature pairs, the weapon slots, the card numbers — are the ones
  // that drifted before, which is why this asks the resolved list rather than the source.
  eq("and every header is a lowercase, hyphenated slug",
    headers.filter((h) => !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(h)), []);
}

group("Feature prose is exported, not just feature names");
{
  const row = exportRow(csvChar());
  eq("a community feature comes back name-first", row["community-feature-texts"], "Privilege: You have advantage on rolls to consort with nobles.");
  eq("and its name is exported on its own too", row["community-feature-names"], "Privilege");

  // Only the feature the player picked, not both of the ancestry's.
  eq("a heritage exports the chosen feature", row["ancestry-feature-names"], "Purposeful Design");

  // A class's domains are derivable from its name, and exported anyway: the renderer can't
  // read classes.json.
  eq("the class's domains are spelled out", row["class-domains"], "Valor\nBlade");
  eq("the Hope feature is a pair like any other", row["class-hope-feature-text"], "Frontline Tank: Spend 3 Hope to clear 2 Armor Slots.");

  // A list-only feature used to export an empty cell, because featureText read only paragraphs.
  const classText = row["class-feature-texts"].split("\n");
  eq("several class features are one per line, each named", classText[0], "Unstoppable: Once per long rest, you can become Unstoppable.");
  eq("a name that is already a sentence doesn't gain a second colon", classText[1], "While Unstoppable, you gain the following benefits:");
  eq("and its bullets are exported as bullets", classText.slice(2), ["• You reduce the severity of physical damage.", "• You can't be Restrained."]);
}
{
  const mixed = exportRow(csvChar({
    heritage: {
      ancestryMode: "mixed", ancestryIds: ["clank", "human"], communityId: "com",
      chosenFeatures: [{ ancestryId: "clank", featureName: "Efficient" }, { ancestryId: "human", featureName: "High Stamina" }],
    },
  }));
  // Singular header, singular value: a mixed heritage is one ancestry line on the sheet, so this
  // is the one list-shaped cell that is joined inline rather than one per line.
  eq("a mixed heritage names both ancestries", mixed["ancestry"], "Clank + Human");
  eq("both chosen features are exported, one per line", mixed["ancestry-feature-names"], "Efficient\nHigh Stamina");
  eq("and each line of text says which feature it is",
    mixed["ancestry-feature-texts"], "Efficient: Choose a long rest move.\nHigh Stamina: Gain an additional Stress slot.");
}
{
  // Upgrading a subclass adds a card rather than replacing the one below it, so the tiers below
  // always print — and the tiers above haven't happened yet.
  const foundation = exportRow(csvChar());
  eq("a Foundation character exports their Foundation feature", foundation["subclass-foundation-feature-names"], "Unwavering");
  eq("and nothing for the tier they haven't reached", foundation["subclass-specialization-feature-texts"], "");
  eq("with the rung they're on named in the sheet's words", foundation["subclass-tier"], "Foundation");

  const mastered = exportRow(csvChar({ subclassTier: "mastery" }));
  eq("at Mastery the tiers below are still theirs", mastered["subclass-foundation-feature-names"], "Unwavering");
  eq("a tier holding two features exports both", mastered["subclass-specialization-feature-names"], "Expert Training\nBattle-Bonded");
  eq("with the texts in the same order", mastered["subclass-specialization-feature-texts"].split("\n").length, 2);
}

group("A weapon exports the numbers the sheet prints beside it");
{
  const armed = exportRow(csvChar({
    equipment: { primaryWeaponId: "longsword", secondaryWeaponId: null, armorId: "gambeson", potionChoice: "potion" },
  }));
  eq("the primary weapon's name", armed["primary-weapon-name"], "Longsword");
  eq("its range, in the sheet's words rather than the JSON's", armed["primary-range"], "Melee");
  eq("its damage, modifier included", armed["primary-damage"], "d10+3 phy");
  eq("and its feature", armed["primary-feature"], "Reliable: +1 to attack rolls.");
  // A column each rather than a slice of a " · " string, because the form the renderer fills has
  // a box for each. A weapon out of data/ names exactly one trait.
  eq("the trait it rolls, named", armed["primary-trait"], "Agility");
  eq("and how many hands it takes", armed["primary-burden"], "Two-handed");
  eq("an empty secondary slot exports blanks, not 'undefined'",
    [armed["secondary-weapon-name"], armed["secondary-range"], armed["secondary-damage"], armed["secondary-feature"]], ["", "", "", ""]);
  eq("including the two columns a weapon would have filled",
    [armed["secondary-trait"], armed["secondary-burden"]], ["", ""]);
  eq("armor is named and its feature exported", [armed["armor-name"], armed["armor-feature"]], ["Gambeson", "Flexible: +1 to Evasion."]);
  // The armor as printed, beside the totals: a sheet with a box for each can't get back to the
  // base from the total, and Gambeson's own numbers are not the ones the character ends up with.
  eq("the armor's own numbers, beside the ones it adds up to",
    [armed["armor-base-score"], armed["armor-base-damage-threshold-major"], armed["armor-base-damage-threshold-severe"]],
    ["3", "5", "11"]);
  eq("Hope is two numbers rather than the string 2/6", [armed["hope-slots"], armed["hope-current"]], ["6", "2"]);
  // The one inventory item the app tracks, in a column shaped like the list it will become.
  eq("the potion is the inventory", armed["inventory-items"], "Minor Health Potion");
}
{
  // Bare hands are a choice with rules of their own, not an empty slot.
  const barehanded = exportRow(csvChar({
    equipment: { primaryWeaponId: UNARMED, secondaryWeaponId: null, armorId: UNARMORED, potionChoice: null },
  }));
  eq("an unarmed attack still has a weapon's columns",
    [barehanded["primary-weapon-name"], barehanded["primary-range"], barehanded["primary-damage"]], ["Unarmed", "Melee", "d4 phy"]);
  eq("and no feature", barehanded["primary-feature"], "");
  // The SRD hands bare hands to the GM's choice of trait rather than naming one, so this column
  // holds a list where a weapon holds a word — the same string the sheet prints.
  eq("with a choice of traits rather than one", barehanded["primary-trait"], "Strength or Finesse");
  eq("and no burden at all: nothing is in your hands", barehanded["primary-burden"], "");
  eq("choosing to wear nothing says so", barehanded["armor-name"], "Unarmored");
  eq("with no armor feature to report", barehanded["armor-feature"], "");
  // EMPTY, never 0: 0 is a real armor score, and a sheet reading a blank as 0 would be right by
  // accident here and wrong the first time a piece of armor scored 0.
  eq("and no base numbers, because there is no armor to have them",
    [barehanded["armor-base-score"], barehanded["armor-base-damage-threshold-major"], barehanded["armor-base-damage-threshold-severe"]],
    ["", "", ""]);
  eq("an empty potion slot is an empty inventory", barehanded["inventory-items"], "");
}
{
  // Columns the app has no model behind, declared anyway: a form-filler needs to know the field
  // exists and that we have nothing to say about it. A missing column and an empty one are
  // different answers.
  const row = exportRow(csvChar());
  eq("nothing is marked, because the builder tracks no play",
    [row["hp-marked-current"], row["stress-marked-current"], row["armor-marked-current"]], ["0", "0", "0"]);
  eq("scars are a blank the sheet still has a box for", row["scars"], "");
  // One string with commas in it, not a list: the header is singular, so nothing should read
  // those commas as separators.
  eq("and money is three named piles at zero", row["gold"], "handfuls: 0, bags: 0, chests: 0");

  // Derivable from the level and the class, and exported anyway — nothing downstream has the
  // tier table, and a sheet printing a base beside a total can't work back to the base.
  eq("the tier the level falls in", row["tier"], "1");
  eq("and the numbers the class is printed with",
    [row["class-starting-evasion"], row["class-starting-hp-slots"]], ["9", "7"]);
}

group("A domain card says what it does, not just what it's called");
{
  const row = exportRow(csvChar());
  const cell = row["domain-card-1"].split("\n");
  eq("the card names itself first", cell[0], "A Soldier's Bond");
  eq("then domain, type, level and recall cost, in that order", cell[1], "Blade · Ability · Level 2 · Recall Cost 1");
  eq("a blank line separates the details from the text", cell[2], "");
  eq("and then what the card does", cell[3], "Once per long rest, when you compliment someone, you can both gain 3 Hope.");

  // The collection's order, not the loadout/vault split: Book of Ava is vaulted and still second.
  eq("every card the character owns gets a column, in collection order",
    [1, 2, 3].map((n) => row[`domain-card-${n}`].split("\n")[0]),
    ["A Soldier's Bond", "Book of Ava", "Arcana-Touched"]);
  eq("a character with fewer cards than columns trails blanks", row["domain-card-4"], "");

  // The name-only columns still say which cards are where — one name per line, as a plural
  // header promises, so a card whose name has a semicolon in it can't split a list in two.
  eq("the loadout list still names what's in the loadout", row["domain-cards-loadout"], "A Soldier's Bond\nArcana-Touched");
  eq("and the vault list what's set aside", row["domain-cards-vault"], "Book of Ava");
}
{
  const blocks = exportRow(csvChar())["domain-card-2"].split("\n\n");
  eq("a Grimoire's three features are three blocks after the heading", blocks.length, 4);
  eq("each named, the way every other feature cell names them", blocks[1], "Power Push: Make a Spellcast Roll against a target within Melee range.");
  eq("down to the last", blocks[3], "Ice Spike: Make a Spellcast Roll (12) to summon a large ice spike.");

  const bulleted = exportRow(csvChar())["domain-card-3"].split("\n\n");
  eq("a card whose text introduces bullets keeps them in its own block", bulleted.length, 2);
  eq("one bullet per line", bulleted[1].split("\n").slice(1),
    ["• +1 bonus to your Spellcast Rolls", "• Once per rest, you can switch the results of your Hope and Fear Dice."]);

  // featureText joined paragraphs with a space, so this closing instruction reached the CSV as
  // "• One Hit Point slot Then place this card in your vault permanently." — one sentence
  // reading as part of the bullet above it. It is one paragraph per line now, the same
  // principle sheet-data.js's features() already applies to this exact data. Class and
  // subclass feature cells are the same function and gained the same fix: Beastbound's
  // Companion and Wizard's Strange Patterns were the two that showed it there.
  const vitality = exportRow(csvChar({ domainCardIds: ["fx_vitality"], domainVaultIds: [] }));
  eq("a paragraph after a bullet list starts its own line",
    vitality["domain-card-1"].split("\n\n")[1].split("\n"),
    [
      "When you choose this card, permanently gain two of the following benefits:",
      "• One Stress slot",
      "• One Hit Point slot",
      "Then place this card in your vault permanently.",
    ]);
}
{
  // 0 is a real Recall Cost and a common one; a falsy check would have dropped the whole piece.
  const free = exportRow(csvChar({ domainCardIds: ["fx_free"], domainVaultIds: [] }));
  eq("a Recall Cost of 0 is stated rather than left out", free["domain-card-1"].split("\n")[1], "Splendor · Spell · Level 1 · Recall Cost 0");
}
{
  // A file written by a browser whose data/ knew a card this one doesn't. Dropping it would
  // renumber every card after it, and it's still a card the player owns.
  const stranger = exportRow(csvChar({
    domainCardIds: ["fx_bond", "core_domain_card_from_the_future", "fx_free"], domainVaultIds: [],
  }));
  eq("a card this browser doesn't have is exported as its id", stranger["domain-card-2"], "core_domain_card_from_the_future");
  eq("and the cards after it keep their columns", stranger["domain-card-3"].split("\n")[0], "Wellspring");
}
{
  // Which cards you own doesn't depend on where they're sitting, so the permanent-only export —
  // which vaults every card — has to leave these columns alone.
  const ch = csvChar();
  eq("the card columns read the same in both exports",
    exportRow(ch)["domain-card-2"], exportRow(ch, { loadout: false })["domain-card-2"]);
}
{
  // Fourteen is what the rules can give you, and it's a floor rather than a width: a collection
  // this app couldn't have built still exports whole instead of being cut off.
  const hoarder = csvChar({ domainCardIds: Array.from({ length: 16 }, () => "fx_bond"), domainVaultIds: [] });
  const rows = parseCsv(buildCsv([hoarder, csvChar()], CSV_DB));
  eq("sixteen cards means sixteen card columns", rows[0].filter((h) => h.startsWith("domain-card-")).length, 16);
  eq("the last is named for its position", rows[0][rows[0].length - 1], "domain-card-16");
  eq("and every row is as wide as the header", [rows[1].length, rows[2].length], [rows[0].length, rows[0].length]);
  eq("including the character who has three", rows[2][rows[0].length - 1], "");
}

group("Two exports, and the column that tells them apart");
{
  const untouchable = csvChar({ domainCardIds: ["core_domain_card_untouchable"], domainVaultIds: [] });
  const withLoadout = exportRow(untouchable);
  const permanent = exportRow(untouchable, { loadout: false });

  // Agility is +1 in the fixture, and Untouchable is half of it rounded up.
  eq("with the loadout, the card's bonus is in the number", withLoadout["evasion"], "10");
  eq("without it, the number is what's permanently true", permanent["evasion"], "9");
  eq("and each row says which it is", [withLoadout["includes-loadout-bonuses"], permanent["includes-loadout-bonuses"]], ["true", "false"]);

  // Permanent only means every card is in the vault — so the card lists move rather than empty.
  eq("with the loadout, the card is in the loadout", withLoadout["domain-cards-loadout"], "Untouchable");
  eq("without it, the loadout is empty", permanent["domain-cards-loadout"], "");
  eq("and the card is reported in the vault instead", permanent["domain-cards-vault"], "Untouchable");
}
{
  // Vitality is permanent and tells you to vault it, so it applies either way.
  const vitality = csvChar({
    domainCardIds: ["core_domain_card_vitality"], domainVaultIds: [],
    effectChoices: { core_domain_card_vitality: { optionIds: ["stress", "hitPoint"] } },
  });
  eq("a permanent card counts in both exports",
    [exportRow(vitality)["hp-slots"], exportRow(vitality, { loadout: false })["hp-slots"]], ["8", "8"]);
}
{
  // Bare Bones is a loadout card whose effect is a base rather than a bonus. A base a card was
  // standing in for goes with the card: what's left is the SRD's plain unarmored rule.
  const bones = csvChar({
    equipment: { primaryWeaponId: null, secondaryWeaponId: null, armorId: UNARMORED, potionChoice: null },
    domainCardIds: ["core_domain_card_bare_bones"], domainVaultIds: [],
  });
  eq("with the loadout, Bare Bones stands in for armor",
    [exportRow(bones)["armor-score"], exportRow(bones)["damage-threshold-major"], exportRow(bones)["damage-threshold-severe"]], ["5", "10", "20"]);
  const permanent = exportRow(bones, { loadout: false });
  eq("without it, an unarmored character is unarmored",
    [permanent["armor-score"], permanent["damage-threshold-major"], permanent["damage-threshold-severe"]], ["0", "1", "2"]);
}

group("A plural header means one value per line");
{
  // The convention the whole file rests on. These cells were joined with ", ", "; " and " / " —
  // three spellings of one idea, and each of them a character that can legitimately appear
  // inside a value. A consumer splits on "\n" and never has to know which cell used which.
  const row = exportRow(csvChar({ domainVaultIds: ["fx_ava", "fx_touched"] }));
  eq("the class's domains", row["class-domains"].split("\n"), ["Valor", "Blade"]);
  eq("the Experiences, each with the total it's at", row["experiences"].split("\n"), ["A (+2)", "B (+2)"]);
  eq("the cards in the loadout", row["domain-cards-loadout"].split("\n"), ["A Soldier's Bond"]);
  eq("and the ones set aside", row["domain-cards-vault"].split("\n"), ["Book of Ava", "Arcana-Touched"]);
}
{
  // The last three need content the shared fixture hasn't got: a second Spellcast trait, a pair
  // of dice tracks, and records out of two different folders.
  const castDb = {
    ...CSV_DB,
    subclasses: [...CSV_DB.subclasses, { id: "sub2", name: { "en-US": "Elemental Origin" }, spellcastTrait: "INSTINCT" }],
  };
  const twoCast = csvChar({ multiclass: { classId: "cls2", subclassId: "sub2", domain: "ARCANA", tier: "foundation" } });
  // The app prints these as "Knowledge / Instinct"; that slash is a display choice and stays in
  // the app. Splitting it back apart here would make it a format two projects had to agree on.
  eq("two Spellcast traits are alternatives, one per line",
    exportRow(twoCast, {}, castDb)["spellcast-traits"].split("\n"), ["Knowledge", "Instinct"]);

  const trackDb = {
    ...CSV_DB,
    effects: {
      "cls:Unstoppable": { track: { id: "rally_die", label: "Rally Die", byLevel: { 1: "d6", 5: "d8" } } },
      "sub:foundation": { track: { id: "guard_die", label: "Guard Die", value: "d10" } },
    },
  };
  eq("a track each, named and at the rung the character is on",
    exportRow(csvChar(), {}, trackDb)["class-tracks"].split("\n"), ["Rally Die: d6", "Guard Die: d10"]);

  const sourcedDb = {
    ...CSV_DB,
    classes: CSV_DB.classes.map((c) => ({ ...c, contentSource: "srd" })),
    armors: CSV_DB.armors.map((a) => ({ ...a, contentSource: "my-homebrew" })),
    sourceLabels: { srd: "Daggerheart SRD", "my-homebrew": "My Homebrew" },
  };
  const twoSources = csvChar({
    equipment: { primaryWeaponId: null, secondaryWeaponId: null, armorId: "gambeson", potionChoice: null },
  });
  eq("and every folder the character is built from, in manifest order",
    exportRow(twoSources, {}, sourcedDb)["sources"].split("\n"), ["Daggerheart SRD", "My Homebrew"]);
}

group("The level up grid exports three lists a sheet can draw boxes from");
{
  // Multiclassing is the pick that strikes rows out, and it takes the whole of level 5.
  const struck = csvChar();
  struck.level = 4;
  record(struck, 5, [MULTICLASS], "fx_free");
  const row = exportRow(struck);

  const lines = (header) => row[header].split("\n");
  const tier2 = ["levelup-tier2-options", "levelup-tier2-available-counts", "levelup-tier2-crossed-out"];
  eq("the three lists are index-aligned, so line N of each is the same advancement",
    tier2.map((header) => lines(header).length), [6, 6, 6]);
  eq("in the order the level up screen draws them, each as key: label", lines("levelup-tier2-options").slice(0, 3),
    ["traits: +1 to two unmarked traits", "hitPoint: +1 permanent Hit Point slot",
      "stress: +1 permanent Stress slot"]);
  // Leading with the key is what keeps the cell off csvField()'s formula guard. Every core label
  // begins with "+", the guard fires on the cell rather than the line, and a spreadsheet
  // evaluates a leading + even inside quotes — so this used to open with an apostrophe that only
  // a spreadsheet knew to hide, on the first line of the cell and no other.
  check("and no cell opens with the formula guard's apostrophe",
    [2, 3, 4].every((t) => !(row[`levelup-tier${t}-options`] || "").startsWith("'")));
  eq("with the boxes still markable on each, as a number the sheet can draw",
    lines("levelup-tier2-available-counts"), ["3", "2", "2", "1", "1", "1"]);
  eq("and nothing struck out at this tier", lines("levelup-tier2-crossed-out"), ["", "", "", "", "", ""]);

  // A struck row and a spent row both count 0, and the sheet draws them differently — which is
  // why the third list exists. Multiclassing crosses out the subclass upgrade in its own tier.
  const tier3 = lines("levelup-tier3-options");
  const at = (header) => lines(header)[tier3.indexOf("subclass: Upgrade subclass card (Foundation → Specialization → Mastery)")];
  eq("the row the strike hit has no boxes left", at("levelup-tier3-available-counts"), "0");
  eq("and says which pick struck it, where a spent row says nothing",
    at("levelup-tier3-crossed-out"), "multiclass");
  eq("while the pick that did it has spent its own boxes, unstruck",
    [lines("levelup-tier3-available-counts")[tier3.indexOf("multiclass: Multiclass — a second class, one of its domains, and a foundation card")],
      lines("levelup-tier3-crossed-out")[tier3.indexOf("multiclass: Multiclass — a second class, one of its domains, and a foundation card")]],
    ["0", ""]);

  // A tier 4 row exists in the table at every level, so filtering on the slot counts alone would
  // export the whole tier to a level 5 character who can't touch any of it.
  eq("a tier this character can't have reached is three empty cells",
    [row["levelup-tier4-options"], row["levelup-tier4-available-counts"], row["levelup-tier4-crossed-out"]], ["", "", ""]);

  // The traits already raised this tier, which no free box makes eligible again.
  const marked = csvChar({ traitMarks: { agility: true, strength: false, finesse: false, instinct: false, presence: true, knowledge: false } });
  eq("the traits already marked are listed by name", exportRow(marked)["levelup-marked-traits"], "Agility\nPresence");
  eq("and an unmarked character's cell is empty", exportRow(csvChar())["levelup-marked-traits"], "");
}

group("The GM's spreadsheet is handed data, never a program");
{
  // Quoting alone doesn't stop this: a spreadsheet evaluates a leading = even inside quotes.
  const hostile = exportRow(csvChar({ name: '=HYPERLINK("http://evil","click")' }));
  check("a name that looks like a formula is neutralised", hostile["name"].startsWith("'="), `got ${hostile["name"]}`);
  eq("a quote inside a field survives the round trip", hostile["name"].includes('"http://evil"'), true);

  // Knowledge is -1 in the fixture. Prefixing a plain number would turn every negative trait
  // into text and break sorting for the GM.
  eq("a negative number is left alone", exportRow(csvChar())["knowledge"], "-1");
  eq("a comma in a field doesn't split it", csvField("a,b"), '"a,b"');
}

// ---------- backup & transfer ----------

// A file written by one browser and read by another. What matters is that the RECORDED CHOICES
// survive, not just the numbers: a character that arrives with the right stats but no levelUps
// looks perfect on the sheet and can't be edited or undone, which is the whole point of the file.

const roundTrip = (list, now) => parseTransferFile(serializeTransferFile(list, now));

// newCharacter() predates the fields the wizard makes, and normalizeImported fills them in on
// the way through — so a fixture without them would differ from its own import for reasons that
// have nothing to do with the file. A character that has actually been through the wizard, as
// every real save has, is the like-for-like comparison.
function wizardCharacter() {
  const ch = newCharacter();
  ch.name = "Kaz";
  ch.heritage = { ancestryMode: "pure", ancestryIds: [], chosenFeatures: [], communityId: null };
  ch.equipment = { primaryWeaponId: null, secondaryWeaponId: null, armorId: null, potionChoice: null };
  ch.background = { description: "", answers: "" };
  return ch;
}

// A character taken to level 4 the way the level up screen would.
function levelledCharacter() {
  const ch = wizardCharacter();
  record(ch, 2, [{ key: "traits", slotTier: 2, traits: ["agility", "finesse"] }, { key: "stress", slotTier: 2 }], "c2");
  record(ch, 3, [{ key: "hitPoint", slotTier: 2 }, { key: "evasion", slotTier: 2 }], "c3");
  record(ch, 4, [{ key: "experience", slotTier: 2, experienceIds: ["e1", "e2"] }, { key: "stress", slotTier: 2 }], "c4");
  return ch;
}

// Everything a level up can move, in one comparable lump.
const statShape = (c) => ({
  level: c.level, traits: c.traits, traitMarks: c.traitMarks, proficiency: c.proficiency,
  hp: c.hitPointSlotsBonus, stress: c.stressSlotsBonus, evasion: c.evasionBonus,
  tier: c.subclassTier, slots: c.advancementSlotsUsed,
  cards: c.domainCardIds, vault: c.domainVaultIds,
  experiences: c.experiences.map((e) => `${e.id}:${e.modifier}:${e.sinceLevel}`),
});

const envelope = (characters, over = {}) =>
  JSON.stringify({ format: TRANSFER_FORMAT, version: TRANSFER_VERSION, characters, ...over });

group("A roster saved to a file comes back as the same roster");
{
  const ch = levelledCharacter();
  const out = roundTrip([ch]);
  const back = out.characters[0];

  eq("the file is readable", out.ok, true);
  eq("every recorded level survives", back.levelUps, ch.levelUps);
  eq("so does the baseline the replay starts from", back.baseline, ch.baseline);
  eq("and the level it was captured at", back.baselineLevel, ch.baselineLevel);
  eq("the starting cards are kept apart from the rest", back.creationDomainCardIds, ch.creationDomainCardIds);
  eq("experiences come back whole", back.experiences, ch.experiences);

  // A shared reference would let the receiving side mutate the roster it was read from.
  check("the imported character is a copy, not the same object", back !== ch);
  back.levelUps[0].level = 99;
  eq("editing the import doesn't reach back into the original", ch.levelUps[0].level, 2);
}

group("A character imported into a fresh browser can still undo its level 4");
{
  // The headline. Do to the imported copy exactly what characters.js:removeLevel does, and it
  // has to land on the same character as one that was only ever taken to level 3.
  const back = roundTrip([levelledCharacter()]).characters[0];
  back.levelUps = back.levelUps.filter((e) => e.level !== 4);
  back.experiences = back.experiences.filter((e) => e.sinceLevel < 4);
  back.level = 3;
  recomputeCharacter(back);

  const neverLevelled = wizardCharacter();
  record(neverLevelled, 2, [{ key: "traits", slotTier: 2, traits: ["agility", "finesse"] }, { key: "stress", slotTier: 2 }], "c2");
  record(neverLevelled, 3, [{ key: "hitPoint", slotTier: 2 }, { key: "evasion", slotTier: 2 }], "c3");

  eq("removing the imported level 4 lands exactly where level 3 would", statShape(back), statShape(neverLevelled));
  eq("and the level 4 entry is the only one gone", back.levelUps.map((e) => e.level), [2, 3]);
}

group("An imported character's stats are the ones it was exported with");
{
  const ch = levelledCharacter();
  const back = roundTrip([ch]).characters[0];

  // No recompute on the way in, so these are the numbers the file carried.
  eq("every level-dependent stat matches", statShape(back), statShape(ch));
  eq("and so does everything the sheet derives from them",
    derivedStats(back, DB), derivedStats(ch, DB));

  const snapshot = JSON.parse(JSON.stringify(statShape(back)));
  recomputeCharacter(back);
  eq("replaying the import changes nothing, so importing without one loses nothing",
    statShape(back), snapshot);
}

group("Importing doesn't restamp when a character was last changed");
{
  // The collision screen shows both dates so you can tell which copy is newer. Bumping on
  // import would stamp every incoming character with today and make that comparison useless.
  const ch = levelledCharacter();
  ch.updatedAt = "2026-07-20T09:00:00.000Z";
  const back = roundTrip([ch]).characters[0];
  eq("the round trip leaves it alone", back.updatedAt, "2026-07-20T09:00:00.000Z");

  const mine = { ...JSON.parse(JSON.stringify(ch)), updatedAt: "2026-08-01T09:00:00.000Z" };
  const plan = planImport([back], [mine]);
  for (const resolution of ["keep-both", "overwrite", "skip"]) {
    const result = applyImport([mine], plan, { [ch.id]: resolution });
    const stamps = result.characters.map((c) => c.updatedAt).sort();
    check(`${resolution} restamps nothing`,
      stamps.every((s) => s === "2026-07-20T09:00:00.000Z" || s === "2026-08-01T09:00:00.000Z"),
      JSON.stringify(stamps));
  }
}

group("A file that isn't from this app is refused with a reason");
{
  const why = (text) => {
    const r = parseTransferFile(text);
    return r.ok ? ["(the file was accepted)"] : [r.error];
  };

  // The likeliest mistake of all: two files in one downloads folder, both named
  // daggerheart-characters-<date>. The CSV has to be recognised, not just rejected.
  has("the GM's CSV is named as the GM's CSV", why('﻿"name","pronouns","level"\r\n'), "GM's CSV");
  // The headers became slugs, and this recognises the new spelling only: a CSV written before
  // that is no more readable than any other stray file, and claiming to know it would promise a
  // friendliness the app can't follow through on.
  has("a CSV from before the headers were slugs is just an unreadable file",
    why('﻿"Name","Pronouns","Level"\r\n'), "couldn't be read as JSON");
  has("something that isn't JSON says so", why("not json at all"), "couldn't be read as JSON");
  has("JSON from somewhere else is turned away", why("{}"), "not one from this app");
  has("and so is a file wearing another format", why(envelope([], { format: "something-else" })), "not one from this app");
  has("a file from a newer app names both versions",
    why(envelope([{ id: "x", traits: {} }], { version: 99 })), "file version 99");
  has("an empty roster is refused", why(envelope([])), "no characters in it");
  has("so is one where nothing is a character", why(envelope([null, 7, "x", {}])), "looked like a character");

  // A missing or odd version is read as this one: every file written so far carries a number,
  // and guessing beats refusing a file that would have loaded fine.
  eq("a file with no version still loads",
    parseTransferFile(envelope([{ id: "x", traits: {} }], { version: undefined })).ok, true);
}

group("Entries in the file that aren't characters are dropped, the rest still import");
{
  // Losing four good characters because a fifth entry is malformed is the wrong trade for a
  // file people may well open in an editor.
  const out = parseTransferFile(envelope([null, 7, "x", {}, newCharacter()]));
  eq("the file still loads", out.ok, true);
  eq("the character comes through", out.characters.length, 1);
  eq("and the junk is counted, so the summary can mention it", out.dropped, 4);
}

group("A character with no heritage still imports as a draft");
{
  // characters.js:isComplete reaches into heritage, traits, equipment and experiences with no
  // guards, for every row of the list. A file missing any of them would throw inside renderList
  // and blank the whole roster. newCharacter() has neither heritage nor equipment, like any
  // save from before the wizard grew them.
  const back = parseTransferFile(envelope([newCharacter()])).characters[0];

  eq("heritage is there to be read", typeof back.heritage.communityId, "object");
  eq("so is the ancestry list", Array.isArray(back.heritage.ancestryIds), true);
  eq("equipment is there to be read", typeof back.equipment.armorId, "object");
  eq("every experience has a name to trim", back.experiences.every((e) => typeof e.name === "string"), true);
  eq("the card lists are arrays", [Array.isArray(back.domainCardIds), Array.isArray(back.domainVaultIds)], [true, true]);

  // The same guard, against the shapes a hand-edited file can produce.
  const wrecked = parseTransferFile(envelope([
    { id: "w", name: "W", traits: {}, experiences: [null, { name: 7 }], heritage: 5, equipment: "no", level: "banana" },
  ])).characters[0];
  eq("a null experience is dropped rather than walked into", wrecked.experiences.length, 1);
  eq("a non-string name becomes one", wrecked.experiences[0].name, "");
  eq("a nonsense level falls back to 1", wrecked.level, 1);
  eq("a nonsense heritage is replaced", Array.isArray(wrecked.heritage.ancestryIds), true);
  eq("and so is a nonsense equipment", wrecked.equipment.armorId, null);
}

group("Importing onto a browser that already has the same character asks first");
{
  const mine = { ...newCharacter(), id: "char_same", name: "Kaz" };
  const theirs = { ...newCharacter(), id: "char_same", name: "Kaz" };
  const stranger = { ...newCharacter(), id: "char_other", name: "Vex" };
  // Same name, different id. Two characters, and the app has always allowed that.
  const namesake = { ...newCharacter(), id: "char_third", name: "Kaz" };

  const plan = planImport([theirs, stranger, namesake], [mine]);
  eq("the shared id is the only clash", plan.clashes.map((c) => c.id), ["char_same"]);
  eq("the clash carries both sides so the screen can compare them",
    [plan.clashes[0].incoming.id, plan.clashes[0].existing.id], ["char_same", "char_same"]);
  eq("everything else is new here", plan.fresh.map((c) => c.id), ["char_other", "char_third"]);
  eq("a shared name is not a clash", plan.clashes.some((c) => c.incoming.name === "Kaz" && c.id === "char_third"), false);
}

group("Keeping both copies leaves two characters that can be told apart");
{
  const mine = { ...newCharacter(), id: "char_same", name: "Kaz", level: 4 };
  const theirs = { ...newCharacter(), id: "char_same", name: "Kaz", level: 5 };
  const before = JSON.parse(JSON.stringify(mine));

  const plan = planImport([theirs], [mine]);
  const out = applyImport([mine], plan, { char_same: "keep-both" });

  eq("the roster gains one", out.characters.length, 2);
  eq("counted as an add, not a replace", [out.added, out.replaced, out.skipped], [1, 0, 0]);
  check("the incoming copy gets an id of its own", out.characters[1].id !== "char_same");
  check("in the shape create.js mints", out.characters[1].id.startsWith("char_"));
  eq("and a name that says where it came from", out.characters[1].name, "Kaz (imported)");
  eq("which the summary can report", out.renamed, ["Kaz (imported)"]);
  eq("nothing was overwritten", out.overwrittenIds, []);
  eq("the character already here is untouched", out.characters[0], before);

  // Importing the same file twice must not produce "Kaz (imported) (imported)".
  const again = applyImport(out.characters, planImport([out.characters[1]], out.characters), {});
  eq("a second round doesn't stack the suffix", again.renamed, ["Kaz (imported)"]);
}

group("Replacing overwrites the character where it already sat");
{
  const first = { ...newCharacter(), id: "char_a", name: "First" };
  const mine = { ...levelledCharacter(), id: "char_same", name: "Kaz" };
  const last = { ...newCharacter(), id: "char_z", name: "Last" };
  const theirs = { ...newCharacter(), id: "char_same", name: "Kaz elsewhere" };

  const roster = [first, mine, last];
  const out = applyImport(roster, planImport([theirs], roster), { char_same: "overwrite" });

  eq("the roster is the same length", out.characters.length, 3);
  eq("counted as a replace", [out.added, out.replaced, out.skipped], [0, 1, 0]);
  eq("the roster doesn't reshuffle", out.characters.map((c) => c.id), ["char_a", "char_same", "char_z"]);
  eq("the incoming copy is what's there now", out.characters[1].name, "Kaz elsewhere");
  eq("with the incoming level history", out.characters[1].levelUps, theirs.levelUps);
  // characters.js needs this to clear a level-edit undo that now describes a character that's gone.
  eq("and the overwritten id is reported back", out.overwrittenIds, ["char_same"]);
  eq("the original object wasn't mutated", mine.name, "Kaz");
}

group("Skipping leaves this browser's copy alone");
{
  const mine = { ...levelledCharacter(), id: "char_same", name: "Kaz" };
  const theirs = { ...newCharacter(), id: "char_same", name: "Kaz elsewhere" };
  const before = JSON.parse(JSON.stringify([mine]));

  const out = applyImport([mine], planImport([theirs], [mine]), { char_same: "skip" });
  eq("counted as a skip", [out.added, out.replaced, out.skipped], [0, 0, 1]);
  eq("the roster is exactly as it was", out.characters, before);
  eq("nothing was overwritten", out.overwrittenIds, []);
}

group("A clash with no answer keeps both, because that's the choice that destroys nothing");
{
  const mine = { ...levelledCharacter(), id: "char_same", name: "Kaz" };
  const theirs = { ...newCharacter(), id: "char_same", name: "Kaz" };
  const out = applyImport([mine], planImport([theirs], [mine]), {});
  eq("the default is keep-both", [out.added, out.replaced, out.skipped], [1, 0, 0]);
  eq("so the character already here survives an unanswered screen", out.characters[0].levelUps, mine.levelUps);

  const nonsense = applyImport([mine], planImport([theirs], [mine]), { char_same: "shrug" });
  eq("and so does an answer nobody recognises", nonsense.added, 1);
}

group("A new id is never one already in use");
{
  const first = "char_" + (0.11111111).toString(36).slice(2, 10);
  let calls = 0;
  const minted = mintCharacterId(new Set([first]), () => (calls++ === 0 ? 0.11111111 : 0.22222222));
  eq("a collision is retried rather than returned", calls, 2);
  check("and the retry is a different id", minted !== first, minted);

  // A rand that never yields anything new must still terminate.
  const cornered = mintCharacterId([first], () => 0.11111111);
  check("a hopeless generator still returns something usable",
    cornered.startsWith("char_") && cornered !== first, cornered);

  // Two entries in one file carrying the same id: both land, with ids of their own.
  const twins = [{ ...newCharacter(), id: "char_dup" }, { ...newCharacter(), id: "char_dup" }];
  const out = applyImport([], planImport(twins, []), {});
  eq("both twins arrive", out.characters.length, 2);
  check("with different ids", out.characters[0].id !== out.characters[1].id,
    out.characters.map((c) => c.id).join(" "));

  // An entry with no id at all goes through the same minting path.
  const nameless = applyImport([], planImport([{ ...newCharacter(), id: "" }], []), {});
  check("an entry with no id is given one", nameless.characters[0].id.startsWith("char_"));

  eq("the imported suffix is idempotent",
    [importedName("Kaz"), importedName("Kaz (imported)"), importedName(""), importedName("   ")],
    ["Kaz (imported)", "Kaz (imported)", "(imported)", "(imported)"]);
}

group("A character saved before levels existed survives the round trip");
{
  // The same shape as the migration group above, with the id every real save carries. If the
  // export ever starts stripping derived fields, this is what fails: for a character like this
  // the derived fields ARE the truth, and there are no levelUps to rebuild them from.
  const legacy = ensureLevelFields({
    id: "char_old", name: "Old",
    level: 6, proficiency: 3,
    traits: { agility: 2, strength: 3, finesse: 0, instinct: 1, presence: 0, knowledge: -1 },
    experiences: [{ name: "A", modifier: 3 }, { name: "B", modifier: 2 }],
    domainCardIds: ["a", "b", "c", "d", "e", "f"], domainVaultIds: ["a"],
    traitMarks: { agility: true, strength: false, finesse: false, instinct: false, presence: false, knowledge: false },
    hitPointSlotsBonus: 3, stressSlotsBonus: 1, evasionBonus: 1, subclassTier: "specialization",
    advancementSlotsUsed: { traits: 4, hitPoint: 3, stress: 1, experience: 1, domainCard: 0, evasion: 1, subclass: 1, proficiency: 0 },
  });
  const back = roundTrip([legacy]).characters[0];

  eq("its collection arrives whole", back.domainCardIds, ["a", "b", "c", "d", "e", "f"]);
  eq("so does the vault", back.domainVaultIds, ["a"]);
  eq("and the starting cards it was credited with", back.creationDomainCardIds, legacy.creationDomainCardIds);
  eq("the baseline is intact", back.baseline, legacy.baseline);
  eq("at the level it was captured", back.baselineLevel, 6);
  eq("its stats are the ones it had", statShape(back), statShape(legacy));

  const snapshot = JSON.parse(JSON.stringify(statShape(back)));
  recomputeCharacter(back);
  eq("and replaying it still changes nothing", statShape(back), snapshot);
}

group("The saved file names itself after the day it was written");
{
  // An explicit UTC instant: a local-time stamp would make this flake depending on the machine.
  const when = new Date("2026-08-08T12:00:00Z");
  eq("the filename carries the date", transferFilename(when), "daggerheart-characters-2026-08-08.json");

  const file = buildTransferFile([newCharacter()], when);
  eq("the envelope says what it is", file.format, TRANSFER_FORMAT);
  eq("and which version wrote it", file.version, TRANSFER_VERSION);
  eq("and when", file.exportedAt, "2026-08-08T12:00:00.000Z");
  eq("the file reports back when it was written", roundTrip([newCharacter()], when).exportedAt, "2026-08-08T12:00:00.000Z");

  // Written for a person to open, so it isn't one long line.
  check("it's indented", serializeTransferFile([newCharacter()], when).includes('\n  "format"'));
}

// ---------- several bodies of content in data/ ----------
//
// data/ holds a folder per source now — data/srd_1_0/ and data/srd_2_0/ plus whatever else exists —
// and the merge that
// turns them into one `db` is a pure function over already-fetched objects, so it's tested the
// same way everything else here is: hand-written payloads, no fetching.

const srcClass = (id, name, extra = {}) => ({ id, name, domains: ["BLADE"], ...extra });
const srcCard = (id, name, extra = {}) => ({ id, name: { "en-US": name }, domain: "BLADE", level: 1, ...extra });
const source = (name, records, effects) => ({ name, label: name, records, effects });

group("The list of content folders survives a bad manifest");
{
  eq("a plain list is read as written", parseManifest('["srd","homebrew"]'), ["srd", "homebrew"]);
  eq("junk names nothing rather than throwing", parseManifest("{oh no"), []);
  eq("a JSON object isn't a list of folders", parseManifest('{"srd":true}'), []);
  // The name goes straight into a fetch URL, so anything that could climb out of data/ is dropped.
  eq("a name that could escape data/ is dropped", parseManifest('["srd","../../etc","a/b"]'), ["srd"]);
  eq("the tracked list comes first, and repeats don't move it",
    combineManifests(["srd"], ["homebrew", "srd"]), ["srd", "homebrew"]);

  const info = parseSourceInfo('{"label":"My Homebrew","files":["domain-cards","effects","nope"]}', "my-homebrew");
  eq("a source says what it holds", info.files, ["domain-cards", "effects"]);
  eq("and what to call it", info.label, "My Homebrew");
  eq("a folder with no label is called after itself", parseSourceInfo('{"files":[]}', "homebrew").label, "homebrew");
  eq("an unusable source.json is skipped, not guessed at", parseSourceInfo("{", "my-homebrew"), null);
}

group("A class written in the shape of its neighbours still works");
{
  // classes.json is the one file whose name is a bare uppercase string, because that name is a
  // relational key: subclasses[].class holds "BARD" and create.js joins on it. Writing a class the
  // way every other file is written is therefore the most natural homebrew mistake there is.
  eq("a localized class name becomes the key it has to be",
    normalizeRecord("classes", { id: "c", name: { "en-US": "Witch" } }).name, "WITCH");
  eq("a bare one is left as the key it already is",
    normalizeRecord("classes", { id: "c", name: "WITCH" }).name, "WITCH");
  eq("and a card written bare gets the localized shape its readers expect",
    normalizeRecord("domain-cards", { id: "x", name: "Ironhide" }).name, { "en-US": "Ironhide" });
  eq("normalizing never touches the record it was given",
    (() => { const r = { id: "c", name: "WITCH" }; normalizeRecord("classes", r); return r.name; })(), "WITCH");
}

group("A record that would kill a screen never reaches db");
{
  eq("a class with no domains is refused", validateRecord("classes", { id: "c", name: "WITCH" }), "missing: domains");
  eq("a card with no domain is refused", validateRecord("domain-cards", { id: "x", name: { "en-US": "A" } }), "missing: domain");
  eq("a record with no id is refused", validateRecord("domain-cards", { name: { "en-US": "A" } }), "missing: id");
  eq("a subclass that names no class is refused, because nothing could ever show it",
    validateRecord("subclasses", { id: "s", name: { "en-US": "A" } }), "missing: class (the class name, uppercase)");
  // Hope and Fear adds a domain. Rejecting one nobody has heard of would block the case this
  // whole feature exists to be ready for.
  eq("a domain nobody has heard of is not an error",
    validateRecord("domain-cards", srcCard("x", "A", { domain: "DREAD" })), null);

  const { db, report } = mergeSources([source("homebrew", { classes: [srcClass("hb_a", "WITCH"), { id: "hb_b", name: "SEER" }] })]);
  eq("the usable record still lands", db.classes.map((c) => c.id), ["hb_a"]);
  eq("and the panel can say which one didn't, and why",
    report.sources[0].skipped, [{ file: "classes", id: "hb_b", reason: "missing: domains" }]);
}

group("A later source revises what an earlier one said");
{
  const { db, report } = mergeSources([
    source("srd", { "domain-cards": [srcCard("core_a", "Untouchable"), srcCard("core_b", "Whirlwind")] }),
    source("homebrew", { "domain-cards": [srcCard("core_a", "Untouchable (revised)")] }),
  ]);
  const visible = (dis) => visibleRecords(db.domainCards, dis).map((c) => c.name["en-US"]);
  eq("the revision wins", visible(new Set()), ["Untouchable (revised)", "Whirlwind"]);
  eq("in the position the original held", db.domainCards[0].id, "core_a");
  eq("and every visible record knows where it came from",
    visibleRecords(db.domainCards, new Set()).map((c) => c.contentSource), ["homebrew", "srd"]);
  eq("the panel reports it, so an accidental duplicate is visible",
    report.collisions, [{ file: "domain-cards", id: "core_a", from: "homebrew", over: "srd", byName: false }]);

  // The record that lost is KEPT, not dropped — switching the source that beat it off has to give
  // it back. Dropping it is what made one SRD edition's folder empty the pickers when the other
  // was switched off, with every shared record gone and nothing to fall back to.
  eq("the superseded record is still in the db, marked with what took it",
    db.domainCards.filter((c) => c.supersededBy).map((c) => [c.id, c.contentSource, c.supersededBy]),
    [["core_a", "srd", "core_a"]]);
  eq("switch the reviser off and the original is offered again",
    visible(new Set(["homebrew"])), ["Whirlwind", "Untouchable"]);
  eq("switch both off and nothing is offered", visible(new Set(["homebrew", "srd"])), []);

  // A class's real key is its uppercase name, not its id: create.js joins subclasses on it. Two
  // Bards under different ids would put two identical tiles in the picker with every Bard
  // subclass appearing under both.
  const byName = mergeSources([
    source("srd", { classes: [srcClass("core_class_bard", "BARD")] }),
    source("homebrew", { classes: [srcClass("homebrew_class_bard", "BARD")] }),
  ]);
  eq("a class with the same name collapses even under a new id",
    visibleRecords(byName.db.classes, new Set()).length, 1);
  eq("the later one being the survivor", byName.db.classes[0].id, "homebrew_class_bard");
  eq("and the shadowed one comes back if the homebrew is switched off",
    visibleRecords(byName.db.classes, new Set(["homebrew"])).map((c) => c.id), ["core_class_bard"]);
  eq("and it's reported as the name clash it is", byName.report.collisions[0].byName, true);
}

group("A character's ids follow the editions that are loaded");
{
  // Two editions of one document print the same card under different ids. A character stores bare
  // ids with no record of which edition it was built against, so changing what's loaded has to
  // move them or the character loses its class and its gear.
  const both = mergeSources([
    source("srd_1_0", { classes: [srcClass("srd_1_0_class_bard", "BARD")],
      weapons: [srcCard("srd_1_0_weapon_broadsword", "Broadsword"), srcCard("srd_1_0_weapon_gone", "Retired Blade")] }),
    source("srd_2_0", { classes: [srcClass("srd_2_0_class_bard", "BARD")],
      weapons: [srcCard("srd_2_0_weapon_broadsword", "Broadsword")] }),
  ]).db;
  both.sourceNames = ["srd_1_0", "srd_2_0"];

  eq("a bare form names the record, whichever edition printed it",
    bareId("srd_2_0_weapon_broadsword", both.sourceNames), "weapon_broadsword");

  // THE REGRESSION THIS GUARDS. Both editions claim `weapon_broadsword`, so treating every shared
  // bare form as ambiguous refused to move ANY id — which is every id in every character saved
  // before the folders were split. A superseded record is not a rival claimant: the merge already
  // picked the winner, and this follows that decision rather than inventing a second one.
  const idx = indexRecordIds(both);
  eq("a shared bare form resolves to the edition that won the merge",
    idx.byBare.get("weapon_broadsword"), "srd_2_0_weapon_broadsword");
  eq("nothing is left ambiguous just because two editions print it",
    [...idx.byBare.values()].filter((v) => v === null).length, 0);

  const old = { classId: "core_class_bard", equipment: { primaryWeaponId: "core_weapon_broadsword" } };
  const moved = remapCharacterIds(old, both);
  eq("an id saved under a spelling no source uses any more is re-pointed",
    [moved.classId, moved.equipment.primaryWeaponId], ["srd_2_0_class_bard", "srd_2_0_weapon_broadsword"]);

  // The other half: an id that still resolves is a deliberate choice and is never touched. Picking
  // the SRD 1.0 weapon that SRD 2.0 dropped is the whole reason to have both editions on.
  eq("an id that still resolves is left exactly as it is",
    remapCharacterIds({ equipment: { primaryWeaponId: "srd_1_0_weapon_gone" } }, both)
      .equipment.primaryWeaponId, "srd_1_0_weapon_gone");
  const none = { classId: "srd_2_0_class_bard" };
  check("and a character needing no changes comes back as the same object",
    remapCharacterIds(none, both) === none);

  // Two UNRELATED sources claiming one bare form is still a genuine ambiguity, and still refused.
  const rival = mergeSources([
    source("alpha", { weapons: [srcCard("alpha_weapon_x", "Alpha Blade")] }),
    source("beta", { weapons: [srcCard("beta_weapon_x", "Beta Blade")] }),
  ]).db;
  rival.sourceNames = ["alpha", "beta"];
  eq("two unrelated sources claiming one bare form is left alone rather than guessed at",
    remapCharacterIds({ equipment: { armorId: "old_weapon_x" } }, rival).equipment.armorId, "old_weapon_x");

  // A player's answers are stored keyed BY id, so the keys have to move with the values.
  eq("an id used as a field name moves too",
    Object.keys(remapCharacterIds({ effectChoices: { "core_class_bard": { optionId: "a" } } }, both).effectChoices),
    ["srd_2_0_class_bard"]);

  eq("and a bare form can be looked up directly, for the records the app names itself",
    resolveRecordId("weapon_broadsword", both), "srd_2_0_weapon_broadsword");
}

group("What the panel says about records one source took over from another");
{
  const { takeoverSummary } = await import(`../shared/content-settings.js${RUN}`);
  const src = (name, label, counts) => ({ name, label, counts, skipped: [] });
  const hit = (from, over, id, file = "domain-cards") => ({ file, id, from, over, byName: false });

  // A pair that collides a little is worth reading record by record: that is a homebrew folder
  // quietly sitting on top of something, which is the whole reason this list exists.
  const small = {
    sources: [src("srd_2_0", "SRD 2.0", { domainCards: 210 }), src("mine", "My homebrew", { domainCards: 3 })],
    collisions: [hit("mine", "srd_2_0", "a"), hit("mine", "srd_2_0", "b")],
  };
  eq("a small takeover is listed record by record", takeoverSummary(small, new Set()).lines.length, 2);
  check("and it lights the nav badge", takeoverSummary(small, new Set()).unexpected === 2);

  // A pair that collides wholesale is one fact repeated. Two editions of the SRD do this to each
  // other for every record they share, which buried the homebrew line above it.
  const big = {
    sources: [src("srd_1_0", "SRD 1.0", { domainCards: 189 }), src("srd_2_0", "SRD 2.0", { domainCards: 210 })],
    collisions: Array.from({ length: 189 }, (_, i) => hit("srd_2_0", "srd_1_0", `c${i}`)),
  };
  eq("a wholesale takeover collapses to one line", takeoverSummary(big, new Set()).lines,
    ["SRD 2.0 supersedes every record SRD 1.0 has (189)"]);
  check("and it does NOT light the nav badge, because it is what anyone would expect",
    takeoverSummary(big, new Set()).unexpected === 0);

  // The one that was actually wrong: with the later source switched off it never happened, so
  // saying it did sends a player looking for a change that isn't in front of them.
  eq("nothing is claimed when the source that would take over is switched off",
    takeoverSummary(big, new Set(["srd_2_0"])).lines, []);
  eq("nor when the source being taken over from is switched off",
    takeoverSummary(big, new Set(["srd_1_0"])).lines, []);

  // Partial, because SRD 2.0 dropped nine weapons SRD 1.0 has — so the count says something.
  const partial = {
    sources: [src("srd_1_0", "SRD 1.0", { weapons: 20 }), src("srd_2_0", "SRD 2.0", { weapons: 15 })],
    collisions: Array.from({ length: 15 }, (_, i) => hit("srd_2_0", "srd_1_0", `w${i}`, "weapons")),
  };
  eq("a partial takeover says how many, so the survivors are implied",
    takeoverSummary(partial, new Set()).lines, ["SRD 2.0 supersedes 15 of SRD 1.0's records"]);
}

group("What a source may say its content does");
{
  eq("flat numbers are the ordinary case", validateEffectEntry({ evasion: 1 }), null);
  eq("so is a permanent bonus, which is what keeps a vaulted card applying",
    validateEffectEntry({ armorScore: 1, permanent: true }), null);
  eq("and a whole choice, which needs no page code at all", validateEffectEntry({
    choice: { prompt: "Pick two", kind: "benefit", pick: 2, options: [{ id: "a", label: "A", stressSlots: 1 }] },
  }), null);
  check("a stat that isn't a number is refused",
    validateEffectEntry({ evasion: "lots" }) !== null);
  check("a stat this app doesn't compute is refused",
    validateEffectEntry({ luck: 1 }) !== null);
  eq("a trait penalty is an ordinary entry, the same shape armor:Very Heavy has",
    validateEffectEntry({ traits: { finesse: -1 } }), null);
  // data/ writes traits uppercase everywhere else (a weapon's "trait": "STRENGTH"), so this is
  // the mistake an author actually makes — and effectiveTraits indexes with lowercase, so an
  // accepted uppercase key would validate and then silently do nothing.
  has("a trait named in the case the rest of data/ uses is refused, and told why",
    [validateEffectEntry({ traits: { FINESSE: -1 } }) || ""], "lowercase");
  check("a trait this app hasn't got is refused",
    validateEffectEntry({ traits: { luck: 1 } }) !== null);
  check("and a penalty that isn't a number",
    validateEffectEntry({ traits: { finesse: "a lot" } }) !== null);
  eq("a value the character's own stats decide is accepted",
    validateEffectEntry({ armorScore: { equalTo: "presence" } }), null);
  eq("including the trait a subclass casts with, which the armour can't name itself",
    validateEffectEntry({ majorThreshold: { equalTo: "spellcast" }, severeThreshold: { equalTo: "spellcast" } }), null);
  eq("and the three that aren't traits", validateEffectEntry({
    severeThreshold: { equalTo: "proficiency" }, evasion: { equalTo: "level" }, majorThreshold: { equalTo: "tier" },
  }), null);
  check("a word nothing can scale with is refused",
    validateEffectEntry({ evasion: { equalTo: "luck" } }) !== null);
  // Refused rather than ignored, so nobody ships an entry believing the +2 was counted.
  check("and `equalTo` with anything alongside it, because it's the whole value",
    validateEffectEntry({ armorScore: { equalTo: "presence", plus: 2 } }) !== null);
  eq("a benefit option can scale too, since it's checked by the same code", validateEffectEntry({
    choice: { prompt: "Pick one", kind: "benefit", pick: 1, options: [{ id: "a", label: "A", armorScore: { equalTo: "strength" } }] },
  }), null);
  eq("an entry can say which weapon its attack bonus lands on",
    validateEffectEntry({ attack: 1, scope: "primary" }), null);
  check("but not a slot this app hasn't got",
    validateEffectEntry({ attack: 1, scope: "offhand" }) !== null);
  // effect-choice.js renders anything that isn't "benefit" as an Experience picker rather than
  // failing, so an unrecognised kind would silently ask the wrong question.
  check("a choice of an unknown kind is refused rather than rendered as the wrong picker",
    validateEffectEntry({ choice: { prompt: "?", kind: "vibes", options: [{ id: "a", label: "A" }] } }) !== null);
  check("`when` is refused, because JSON can't carry the function it needs",
    validateEffectEntry({ evasion: 1, when: true }) !== null);

  eq("a class may add a row to the level up table",
    validateEffectEntry({ advancementOption: { label: "Improve your gadget", slots: { 2: 1, 3: 1, 4: 1 } } }), null);
  eq("once ever is the same shape as once per tier, with fewer tiers in it",
    validateEffectEntry({ advancementOption: { label: "Once", slots: { 3: 1 } } }), null);
  check("a row with no label is refused, because the grid would print nothing",
    validateEffectEntry({ advancementOption: { slots: { 2: 1 } } }) !== null);
  check("and one with no slots, because there'd be no box to mark",
    validateEffectEntry({ advancementOption: { label: "L", slots: {} } }) !== null);
  // Tier 1 is level 1: no level ups yet. Named rather than dropped — an author who writes it has
  // misread the table, and silently ignoring it hides a row they meant to add.
  has("a tier that has no advancement slots is refused, and named",
    [validateEffectEntry({ advancementOption: { label: "L", slots: { 5: 1 } } }) || ""], "tier 5");
  has("including tier 1", [validateEffectEntry({ advancementOption: { label: "L", slots: { 1: 1 } } }) || ""], "tier 1");
  check("half a slot is refused",
    validateEffectEntry({ advancementOption: { label: "L", slots: { 2: 0.5 } } }) !== null);
  check("and a key the format hasn't got",
    validateEffectEntry({ advancementOption: { label: "L", slots: { 2: 1 }, cost: 2 } }) !== null);

  eq("a die a class rolls can say what its rungs are",
    validateEffectEntry({ track: { id: "d", label: "A Die", steps: ["d4", "d6"] } }), null);
  eq("or which level each rung arrives at",
    validateEffectEntry({ track: { id: "d", label: "A Die", byLevel: { 1: "d6", 5: "d8" } } }), null);
  eq("or simply what it is now, which is how a subclass revises its class's die",
    validateEffectEntry({ track: { id: "d", label: "A Die", value: "d10" } }), null);
  // Two forms answer the same question, and the resolver would silently use whichever it checked
  // first — so an entry carrying both is refused rather than half-read.
  has("two forms at once are refused, and both named",
    [validateEffectEntry({ track: { id: "d", label: "A Die", steps: ["d4", "d6"], value: "d10" } }) || ""], "steps and value");
  check("and none at all", validateEffectEntry({ track: { id: "d", label: "A Die" } }) !== null);
  check("a ladder of one rung isn't a ladder",
    validateEffectEntry({ track: { id: "d", label: "A Die", steps: ["d4"] } }) !== null);
  check("a rung that isn't text is refused",
    validateEffectEntry({ track: { id: "d", label: "A Die", steps: ["d4", 6] } }) !== null);
  check("so is a byLevel key that isn't a level",
    validateEffectEntry({ track: { id: "d", label: "A Die", byLevel: { tier2: "d6" } } }) !== null);
  check("and a track with no id, which nothing could then advance",
    validateEffectEntry({ track: { label: "A Die", value: "d6" } }) !== null);

  // Kept, not dropped — the option still marks its slot — but the mismatch is named, because a
  // typo here means a row that quietly climbs nothing.
  const dangling = mergeSources([
    source("homebrew", {}, { hb_feature: { advancementOption: { label: "L", slots: { 2: 1 }, advances: "nope" } } }),
  ]);
  has("an option advancing a track nothing declares is reported",
    dangling.report.effectIssues.map((i) => i.reason), "nope");
  check("while the entry itself is kept", !!dangling.effects.hb_feature);

  const { effects, report } = mergeSources([
    source("homebrew", { }, { hb_card: { evasion: 1 }, hb_bad: { when: true } }),
  ]);
  eq("the usable entry is kept", effects, { hb_card: { evasion: 1 } });
  eq("and the panel can say what it refused", report.effectIssues.length, 1);
}

group("Switching a source off changes the pickers and nothing else");
{
  const { db } = mergeSources([
    source("srd", { "domain-cards": [srcCard("core_a", "A")] }),
    source("homebrew", { "domain-cards": [srcCard("homebrew_a", "B")] }),
  ]);
  eq("with nothing switched off, everything is offered",
    visibleRecords(db.domainCards, new Set()).map((c) => c.id), ["core_a", "homebrew_a"]);
  eq("a switched-off source leaves the pickers",
    visibleRecords(db.domainCards, new Set(["homebrew"])).map((c) => c.id), ["core_a"]);
  eq("the srd is a source like any other and can go too",
    visibleRecords(db.domainCards, new Set(["srd", "homebrew"])).map((c) => c.id), []);
  // Every fixture in this file, and every db built by something that predates content sources,
  // is untagged. Dropping those would break far more than it protected.
  eq("a record with no source is always offered",
    visibleRecords([{ id: "plain" }], new Set(["homebrew"])).map((c) => c.id), ["plain"]);
}

group("A character says so when it refers to content this browser hasn't got");
{
  const db = {
    classes: [{ id: "core_class_bard" }],
    subclasses: [{ id: "core_subclass_troubadour" }],
    ancestries: [{ id: "core_ancestry_human" }],
    communities: [{ id: "core_community_loreborne" }],
    weapons: [{ id: "core_weapon_shortsword" }],
    armors: [{ id: "core_armor_leather" }],
    domainCards: [{ id: "core_card_a" }],
  };
  const whole = {
    classId: "core_class_bard", subclassId: "core_subclass_troubadour",
    heritage: { communityId: "core_community_loreborne", chosenFeatures: [{ ancestryId: "core_ancestry_human" }] },
    equipment: { primaryWeaponId: "core_weapon_shortsword", armorId: "core_armor_leather" },
    creationDomainCardIds: ["core_card_a"],
  };
  eq("a character whose content is all here says nothing", unresolvedReferences(whole, db), []);

  const orphan = { ...whole, classId: "myhomebrew_class_witch", equipment: { armorId: "hb_armor_ironhide" } };
  eq("one built on a folder you no longer have names what's missing",
    unresolvedReferences(orphan, db), [{ kind: "class", id: "myhomebrew_class_witch" }, { kind: "armor", id: "hb_armor_ironhide" }]);

  // Unarmed and Unarmored are stored values with no record behind them, so they can't be missing.
  eq("the equipment sentinels aren't missing content",
    unresolvedReferences({ equipment: { primaryWeaponId: UNARMED, armorId: UNARMORED } }, db,
      { sentinels: [UNARMED, UNARMORED] }), []);

  // The roster leaves levelled cards to history.js, which already says "that card no longer
  // exists" about them. The import review runs before any of that and wants one honest count.
  const levelled = { ...whole, domainCardIds: ["core_card_a", "myhomebrew_card_b"] };
  eq("cards taken at a level up are left to the level history", unresolvedReferences(levelled, db), []);
  eq("unless it's the import review asking",
    unresolvedReferences(levelled, db, { includeAllCards: true }), [{ kind: "domain card", id: "myhomebrew_card_b" }]);
}

// ---------- transformations ----------
//
// Once the one record kind with no SRD record behind it. SRD 2.0 has six and data/srd_2_0/ ships
// them; this fixture stays synthetic so the shape is tested rather than the content, so
// every one of these fixtures is invented. A transformation is an optional, permanent change to
// what a character IS — a benefit and a drawback together, at most one per character, sitting
// with the heritage rather than in the loadout.
//
// The "only one" rule has nothing to test: the character stores a single id, so there is no shape
// for two to be written in. What IS worth pinning down is everything downstream of that id.

const TF_GIFT = {
  id: "myhomebrew_transformation_a",
  name: { "en-US": "Tide-Marked" },
  features: [
    feat("The Gift", para("You breathe water as easily as air.")),
    feat("The Price", para("A day on dry land leaves you parched.")),
  ],
};
const TF_PLAIN = {
  id: "myhomebrew_transformation_b",
  name: { "en-US": "Emberborn" },
  features: [feat("Kindled", para("You are never cold."))],
};

const TF_MERGED = mergeSources([
  source("srd", { classes: [srcClass("core_class_bard", "BARD")] }),
  source("my-homebrew", { transformations: [TF_GIFT, TF_PLAIN, { name: { "en-US": "Nameless" } }] }),
]);

const TF_DB = {
  classes: [{ id: "cls", name: "GUARDIAN", domains: ["VALOR"], startingHitPoints: 7, startingEvasion: 9 }],
  // The merged copies, so they carry the contentSource stamp the CSV's Content column reads.
  transformations: TF_MERGED.db.transformations,
  sourceLabels: { srd: "Daggerheart SRD", "my-homebrew": "My Homebrew" },
  effects: {
    [`${TF_GIFT.id}:The Gift`]: { evasion: 1 },
    [`${TF_GIFT.id}:The Price`]: { excluded: ["The Price costs a Stress in play, so it isn't counted here"] },
  },
};

const tfChar = (over = {}) => Object.assign(newCharacter(), {
  classId: "cls",
  heritage: { ancestryMode: "pure", ancestryIds: [], chosenFeatures: [], communityId: null },
  equipment: { primaryWeaponId: null, secondaryWeaponId: null, armorId: null, potionChoice: null },
  background: { description: "", answers: "" },
  connectionsNotes: "",
}, over);

const tfRow = (ch) => {
  const rows = parseCsv(buildCsv([ch], TF_DB));
  return Object.fromEntries(rows[1].map((value, i) => [rows[0][i], value]));
};

group("A source can add a kind of record the SRD hasn't got");
{
  eq("its transformations land in db", TF_MERGED.db.transformations.map((t) => t.id), [TF_GIFT.id, TF_PLAIN.id]);
  eq("stamped with where they came from",
    TF_MERGED.db.transformations.map((t) => t.contentSource), ["my-homebrew", "my-homebrew"]);
  eq("and counted, so the Content panel can say what the folder holds",
    TF_MERGED.report.sources[1].counts.transformations, 2);
  eq("one the panel can't show is skipped and named",
    TF_MERGED.report.sources[1].skipped, [{ file: "transformations", id: "(no id)", reason: "missing: id" }]);

  // Nothing beyond id and name is required: a transformation is prose plus, sometimes, a number.
  eq("a transformation with no features is odd but usable",
    validateRecord("transformations", { id: "x", name: { "en-US": "A" } }), null);
  eq("one with no name is not, because nothing could label it",
    validateRecord("transformations", { id: "x" }), "missing: name");

  eq("switching the source off empties the picker",
    visibleRecords(TF_MERGED.db.transformations, new Set(["my-homebrew"])), []);

  eq("a character says so when its transformation isn't in this browser",
    unresolvedReferences({ transformationId: TF_GIFT.id }, { transformations: [] }),
    [{ kind: "transformation", id: TF_GIFT.id }]);
  eq("and having none at all is not something missing",
    unresolvedReferences({}, { transformations: [] }), []);
}

group("A transformation grants what it declares, and says what it doesn't");
{
  const marked = tfChar({ transformationId: TF_GIFT.id });
  const stats = derivedStats(marked, TF_DB);
  eq("the feature's bonus reaches the stat", stats.evasion.total, 10);
  // Keyed per feature, not per card, so the breakdown can name which half of the bargain did it.
  check("and the breakdown names the transformation and the feature",
    stats.evasion.parts.some((p) => p.label === "Tide-Marked — The Gift"));
  eq("a drawback that can't be counted explains itself instead",
    stats.exclusions, ["The Price costs a Stress in play, so it isn't counted here"]);

  eq("a character with no transformation is left exactly as it was",
    derivedStats(tfChar(), TF_DB).evasion.total, 9);
  // The field is new; every character saved before today is missing it entirely.
  const legacy = tfChar();
  delete legacy.transformationId;
  eq("and so is one saved before the field existed", derivedStats(legacy, TF_DB).evasion.total, 9);
}

group("A transformation prints on the sheet and exports to the GM");
{
  const sheet = deriveSheet(tfChar({ transformationId: TF_GIFT.id }), TF_DB);
  eq("the printable sheet names it", sheet.transformationName, "Tide-Marked");
  // Both, always: unlike a mixed ancestry there is nothing to choose between, and a drawback
  // the player never reads is a drawback that never happens at the table.
  eq("and prints both halves of the bargain",
    sheet.transformationFeatures.map((f) => f.name), ["The Gift", "The Price"]);
  eq("each labelled with the transformation it came from",
    [...new Set(sheet.transformationFeatures.map((f) => f.source))], ["Tide-Marked"]);

  const none = deriveSheet(tfChar(), TF_DB);
  eq("a character without one prints nothing, not a dash",
    [none.transformationName, none.transformationFeatures], [null, []]);

  const row = tfRow(tfChar({ transformationId: TF_GIFT.id }));
  eq("the CSV names it", row["transformation"], "Tide-Marked");
  eq("with both feature names", row["transformation-feature-names"], "The Gift\nThe Price");
  check("and the drawback's text, not just the benefit's",
    row["transformation-feature-texts"].includes("A day on dry land leaves you parched."));
  // A character whose only non-SRD content is a transformation still has to report the source.
  eq("and the source it came from", row["sources"], "My Homebrew");
  eq("a character without one leaves the columns empty", tfRow(tfChar())["transformation"], "");
}

{
  group("A PDF number is not a JavaScript number");
  eq("no exponential notation: 1e-7 rounds away rather than printing \"1e-7\"", formatNumber(1e-7), "0");
  check("nothing formatNumber emits ever contains an 'e'",
    ![1e-7, 1e-21, 0.00004, 12345678.9, 1e20].some((n) => formatNumber(n).includes("e")));
  eq("float noise is rounded off: 13.68 - 4.32 is 9.36, not 9.360000000000001", formatNumber(13.68 - 4.32), "9.36");
  eq("negative zero prints as zero", formatNumber(-0), "0");
  eq("and so does a negative value that rounds to zero", formatNumber(-0.00001), "0");
  // The trailing-zero trim must only eat digits after the decimal point. A blanket /0+$/ turns
  // this into "1", which would put a card 999 points off the page.
  eq("a round number keeps its zeros", formatNumber(1000), "1000");
  eq("a whole number loses its decimal point entirely", formatNumber(180), "180");
  eq("four decimal places survive", formatNumber(0.24), "0.24");
  eq("a fifth decimal place is rounded away", formatNumber(778.32456), "778.3246");
  const throws = (fn) => {
    try { fn(); return false; } catch { return true; }
  };
  check("a non-finite number is refused rather than written as \"NaN\"",
    [NaN, Infinity, -Infinity].every((n) => throws(() => formatNumber(n))));

  group("asciiBytes refuses to guess an encoding");
  eq("plain ASCII is one byte per character", Array.from(asciiBytes("/Im0 Do")), [47, 73, 109, 48, 32, 68, 111]);
  eq("the last legal code point is 0x7F", Array.from(asciiBytes("\x7f")), [127]);
  check("\"é\" throws — UTF-8 would write two bytes for one character and shift every later xref offset",
    throws(() => asciiBytes("Café")));
  check("so does the first non-ASCII code point, U+0080", throws(() => asciiBytes("")));
  check("and so does an emoji, which would cost four bytes", throws(() => asciiBytes("cards \u{1f0a1}")));

  group("A page's operators");
  const oneCard = {
    draws: [{ image: 0, x: 36, y: 522, width: 180, height: 252 }],
    lines: [{ x1: 36, y1: 778.32, x2: 36, y2: 785.52 }],
    lineWidth: 0.24,
    lineGray: 0,
  };
  eq("an image is placed by the matrix alone, saved and restored around",
    pageContentStream(oneCard),
    "q 180 0 0 252 36 522 cm /Im0 Do Q\nq 0 G 0.24 w\n36 778.32 m 36 785.52 l\nS Q\n");
  const twoCards = pageContentStream({
    draws: [
      { image: 0, x: 36, y: 522, width: 180, height: 252 },
      { image: 1, x: 216, y: 522, width: 180, height: 252 },
    ],
    lines: [],
  });
  // Each image needs its OWN q…Q: cm multiplies into the CTM, so a shared save/restore would
  // place the second card in the first card's coordinate system.
  eq("two images are two independent q…Q pairs, so no CTM leaks into the next card",
    twoCards.split("\n").filter(Boolean).map((line) => `${line.slice(0, 1)}…${line.slice(-1)}`),
    ["q…Q", "q…Q"]);
  const marks = pageContentStream({
    draws: [],
    lines: [{ x1: 1, y1: 2, x2: 3, y2: 4 }, { x1: 5, y1: 6, x2: 7, y2: 8 }],
    lineWidth: 0.24,
  });
  eq("every segment is a subpath of ONE path, stroked once",
    [marks.split(" m ").length - 1, marks.split(" l").length - 1, marks.split("S Q").length - 1],
    [2, 2, 1]);
  eq("a page with no lines emits no path and no stroke",
    pageContentStream({ draws: [{ image: 0, x: 0, y: 0, width: 1, height: 1 }], lines: [] }),
    "q 1 0 0 1 0 0 cm /Im0 Do Q\n");
  eq("an empty page is an empty stream, not whitespace", pageContentStream({ draws: [], lines: [] }), "");

  group("The bytes of a document");
  // Deliberately hostile fixture: bytes in 0x80-0xFF (which UTF-8 would double), a newline, and
  // the literal ASCII "endstream". A writer that finds a stream's end by searching for that word
  // truncates this image; a writer that runs any string through TextEncoder corrupts it.
  const trap = (tail) => Uint8Array.from([
    0xff, 0xd8, 0xff, 0xe0, // JPEG SOI + APP0, every byte above 0x7F
    0x0a,
    ...Array.from("endstream", (c) => c.charCodeAt(0)),
    0x0a, 0x80, 0xfe, 0x00, 0x41, tail,
    0xff, 0xd9, // EOI
  ]);
  const artA = trap(0x9c);
  const artB = trap(0x5c);
  const page = (draws) => ({ draws, lines: [{ x1: 36, y1: 778.32, x2: 36, y2: 785.52 }], lineWidth: 0.24, lineGray: 0 });
  const doc = {
    width: 612,
    height: 792,
    images: [
      { bytes: artA, width: 660, height: 924 },
      { bytes: artB, width: 660, height: 924 },
    ],
    pages: [
      page([{ image: 0, x: 36, y: 522, width: 180, height: 252 }, { image: 1, x: 216, y: 522, width: 180, height: 252 }]),
      // Page 2 reuses image 0: art the character owns twice must be embedded once.
      page([{ image: 0, x: 36, y: 270, width: 180, height: 252 }]),
    ],
  };
  const out = buildPdf(doc);
  // Byte n of the file is character n of this string, so every index below is a byte offset.
  const text = Array.from(out, (b) => String.fromCharCode(b)).join("");

  check("the file is a Uint8Array", out instanceof Uint8Array);
  check("it starts with the version header", text.startsWith("%PDF-1.4\n"));
  eq("followed by a binary comment of four bytes above 0x7F, so nothing treats the file as text",
    [out[9], ...Array.from(out.slice(10, 14), (b) => b >= 0x80), out[14]],
    [0x25, true, true, true, true, 0x0a]);

  // ---- the cross-reference table ----
  const startxrefAt = text.lastIndexOf("startxref");
  const xrefAt = Number(/^\s*(\d+)/.exec(text.slice(startxrefAt + "startxref".length))[1]);
  check("the last startxref points at the xref table", text.startsWith("xref\n", xrefAt));
  const countLineEnd = text.indexOf("\n", xrefAt + "xref\n".length);
  const [firstObj, size] = text.slice(xrefAt + "xref\n".length, countLineEnd).split(" ").map(Number);
  eq("the subsection starts at object 0", firstObj, 0);
  // 1 Catalog + 1 Pages + M images + 2 objects per page, and /Size is one past the highest.
  eq("/Size is 3 + M + 2P", size, 3 + doc.images.length + 2 * doc.pages.length);
  check("the trailer agrees with the table", text.includes(`trailer\n<< /Size ${size} /Root 1 0 R >>`));
  const entriesAt = countLineEnd + 1;
  const trailerAt = text.indexOf("trailer", entriesAt);
  // A reader is entitled to seek straight to entry k at entriesAt + 20k; a 19-byte entry (LF
  // alone, the tempting simplification) makes the whole table unreadable to anything that does.
  eq("the xref section is exactly 20 bytes per object", trailerAt - entriesAt, 20 * size);
  const entry = (i) => text.slice(entriesAt + 20 * i, entriesAt + 20 * (i + 1));
  eq("object 0 is the head of the free list", entry(0), "0000000000 65535 f\r\n");
  check("every other entry is %010d SP %05d SP n CR LF",
    Array.from({ length: size - 1 }, (_, k) => entry(k + 1)).every((e) => /^\d{10} 00000 n\r\n$/.test(e)));
  // The test that catches an off-by-one anywhere in the writer: an offset one byte wide lands
  // mid-object, and the file then opens blank rather than failing.
  const misplaced = [];
  for (let i = 1; i < size; i++) {
    const offset = Number(entry(i).slice(0, 10));
    if (!text.startsWith(`${i} 0 obj\n`, offset)) misplaced.push(`${i}@${offset}`);
  }
  eq("every xref offset lands exactly on its own \"N 0 obj\"", misplaced, []);

  // ---- streams, bounded by arithmetic ----
  const objectAt = (i) => Number(entry(i).slice(0, 10));
  // Objects are written in numeric order, so the next one's offset bounds this one. Reading the
  // region this way rather than searching for "endobj" is the same discipline the writer itself
  // follows: binary payloads can contain any keyword you care to look for.
  const objectEnd = (i) => (i + 1 < size ? objectAt(i + 1) : xrefAt);
  const streamOf = (i) => {
    const start = objectAt(i);
    const region = text.slice(start, objectEnd(i));
    const dictEnd = region.indexOf(">>\nstream\n");
    if (dictEnd < 0) return null;
    return {
      dict: region.slice(0, dictEnd),
      length: Number(/\/Length (\d+)/.exec(region.slice(0, dictEnd))[1]),
      from: start + dictEnd + ">>\nstream\n".length,
    };
  };
  const streamObjects = Array.from({ length: size - 1 }, (_, k) => k + 1).filter((i) => streamOf(i));
  // 3 and 4 are the images; 6 and 8 are the two content streams. Nothing else is a stream.
  eq("the two images and the two content streams are the only streams", streamObjects, [3, 4, 6, 8]);
  const wrong = streamObjects.filter((i) => {
    const s = streamOf(i);
    return !text.startsWith("\nendstream\n", s.from + s.length);
  });
  // /Length counts the bytes between the \n that ends "stream" and the \n before "endstream", so
  // stepping exactly /Length bytes from the payload's start must land on that newline.
  eq("every stream's /Length is exact — endstream sits precisely where the arithmetic says", wrong, []);

  // ---- the image bytes themselves ----
  const bytesOf = (i) => {
    const s = streamOf(i);
    return Array.from(out.slice(s.from, s.from + s.length));
  };
  eq("image 0 round-trips byte for byte", bytesOf(3), Array.from(artA));
  eq("image 1 round-trips byte for byte", bytesOf(4), Array.from(artB));
  check("the fixture really does contain bytes UTF-8 would have doubled", Array.from(artA).some((b) => b > 0x7f));
  // The trap stated as an assertion: the first "endstream" inside the payload is NOT the end of
  // the stream, so an implementation that searched for it would have truncated the image above.
  const img0 = streamOf(3);
  const searched = text.indexOf("endstream", img0.from);
  check("searching for \"endstream\" would have found the JPEG's own copy first",
    searched > -1 && searched < img0.from + img0.length);

  // ---- the object graph ----
  check("object 1 is the Catalog",
    text.startsWith("1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n", objectAt(1)));
  const pagesNode = text.slice(objectAt(2), objectEnd(2));
  check("object 2 is the Pages node, counting both pages",
    pagesNode.includes("/Type /Pages") && pagesNode.includes("/Count 2"));
  // Image i is object 3+i and page i is object 3+M+2i, so with two images the pages are 5 and 7.
  check("its /Kids are the page objects in order", pagesNode.includes("/Kids [ 5 0 R 7 0 R ]"));
  check("/MediaBox is on the Pages node, so every page inherits the same paper",
    pagesNode.includes("/MediaBox [ 0 0 612 792 ]"));
  const pageOne = text.slice(objectAt(5), objectEnd(5));
  check("a Page carries no /MediaBox of its own", !pageOne.includes("/MediaBox"));
  check("a Page names its content stream, which is the next object", pageOne.includes("/Contents 6 0 R"));
  check("and lists the images it draws as /Im<index>", pageOne.includes("/Im0 3 0 R /Im1 4 0 R"));
  const pageTwo = text.slice(objectAt(7), objectEnd(7));
  // Page 2 draws only the first image; art owned twice is one XObject referenced twice, not a
  // second copy of 150KB of JPEG.
  check("a page lists only the images it actually draws",
    pageTwo.includes("/XObject << /Im0 3 0 R >>") && !pageTwo.includes("/Im1"));
  eq("the content stream in the file is the one pageContentStream describes",
    text.slice(streamOf(6).from, streamOf(6).from + streamOf(6).length),
    pageContentStream(doc.pages[0]));

  check("the file ends with %%EOF", text.trimEnd().endsWith("%%EOF"));
  check("no /Info and no /ID, so the same character exports byte-identically every time",
    !text.includes("/Info") && !text.includes("/ID"));
  eq("and it does: two builds of the same document are the same bytes",
    Array.from(buildPdf(doc)), Array.from(out));

  group("What buildPdf refuses");
  check("a document with no pages, rather than an invalid PDF for the viewer to complain about",
    throws(() => buildPdf({ width: 612, height: 792, images: [], pages: [] })));
  check("a draw naming an image the document doesn't have",
    throws(() => buildPdf({
      width: 612, height: 792, images: [{ bytes: artA, width: 660, height: 924 }],
      pages: [{ draws: [{ image: 1, x: 0, y: 0, width: 180, height: 252 }], lines: [] }],
    })));
  check("a string where image bytes should be — we can't know what encoding was meant",
    throws(() => buildPdf({
      width: 612, height: 792, images: [{ bytes: "ÿØ", width: 1, height: 1 }],
      pages: [{ draws: [], lines: [] }],
    })));
}

{
  group("card layout: slots on the page");

  // The four corners of the measurement. If the y-flip is ever duplicated or reversed these are
  // the first things to move.
  eq("the top-left slot is the measured 180x252 at (36, 522)", slotRect(0), { x: 36, y: 522, width: 180, height: 252 });
  eq("the bottom-right slot is at (396, 18)", slotRect(8), { x: 396, y: 18, width: 180, height: 252 });
  eq("slot 8 sits in the last column", slotRect(8).x, 396);
  eq("the middle slot is at (216, 270)", slotRect(4), { x: 216, y: 270, width: 180, height: 252 });

  // A mirrored page reads as plausible slot-by-slot, so the check has to be about direction:
  // row 0 must be the *high* y, and its top edge must be one top margin below the page top.
  check("the first row is the top of the page, not the bottom", slotRect(0).y > slotRect(6).y);
  eq("row 0's top edge is one top margin down from the page top", slotRect(0).y + CARD_HEIGHT, PAGE_HEIGHT - MARGIN_Y);
  eq("row 2's bottom edge is the bottom margin", slotRect(6).y, MARGIN_Y);

  // Edge to edge, no gutter: neighbours share a cut line in both axes.
  eq("columns abut with no gutter", slotRect(1).x, slotRect(0).x + CARD_WIDTH);
  eq("rows abut with no gutter", slotRect(0).y - slotRect(3).y, CARD_HEIGHT);
  eq("the block is centred left to right", PAGE_WIDTH - (slotRect(2).x + CARD_WIDTH), MARGIN_X);

  // Nine distinct rectangles: a wrong modulus would deal the same slot twice.
  const rects = [0, 1, 2, 3, 4, 5, 6, 7, 8].map((s) => JSON.stringify(slotRect(s)));
  eq("all nine slots are distinct", new Set(rects).size, 9);

  let ranged = false;
  try {
    slotRect(CARDS_PER_PAGE);
  } catch (e) {
    ranged = e instanceof RangeError;
  }
  check("a slot off the end of the page throws rather than returning NaN coordinates", ranged);
}

{
  group("card layout: crop marks");

  const marks = cropMarks();
  eq("four grid lines per axis means sixteen marks", marks.length, 16);

  // One mark from each margin, spelled out, so the numbers can be checked against the reference
  // sheet without running the arithmetic.
  const at = (x1, y1, x2, y2) => marks.some((m) => m.x1 === x1 && m.y1 === y1 && m.x2 === x2 && m.y2 === y2);
  check("the top margin ticks run 778.32 -> 785.52 at x = 36", at(36, 778.32, 36, 785.52));
  check("the bottom margin ticks run 13.68 -> 6.48 at x = 576", at(576, 13.68, 576, 6.48));
  check("the left margin ticks run 31.68 -> 24.48 at y = 774", at(31.68, 774, 24.48, 774));
  check("the right margin ticks run 580.32 -> 587.52 at y = 18", at(580.32, 18, 587.52, 18));

  // Interior grid lines get marks too — there is no gutter to draw them in, so the outer margin
  // is the only place a cutter can be told where the middle seams are.
  const vertical = marks.filter((m) => m.x1 === m.x2);
  const horizontal = marks.filter((m) => m.y1 === m.y2);
  eq("every mark is axis-aligned: eight vertical", vertical.length, 8);
  eq("...and eight horizontal", horizontal.length, 8);
  eq("the vertical marks stand on all four column lines", [...new Set(vertical.map((m) => m.x1))].sort((a, b) => a - b), GRID_X);
  eq(
    "the horizontal marks stand on all four row lines",
    [...new Set(horizontal.map((m) => m.y1))].sort((a, b) => a - b),
    GRID_Y_FROM_TOP.map((fromTop) => PAGE_HEIGHT - fromTop).sort((a, b) => a - b),
  );

  const lengths = marks.map((m) => Math.round((Math.abs(m.x2 - m.x1) + Math.abs(m.y2 - m.y1)) * 100) / 100);
  eq("every mark is exactly one MARK_LENGTH long", [...new Set(lengths)], [MARK_LENGTH]);

  // The gap is what keeps the ink off the card face; without it a mark would print inside the
  // art and survive the cut.
  const block = { left: 36, right: 576, bottom: 18, top: 774 };
  const gaps = marks.map((m) => {
    if (m.x1 === m.x2) return m.y1 > block.top ? m.y1 - block.top : block.bottom - m.y1;
    return m.x1 < block.left ? block.left - m.x1 : m.x1 - block.right;
  });
  eq("every mark's inner end stands off the card block by MARK_GAP", [...new Set(gaps.map((g) => Math.round(g * 100) / 100))], [MARK_GAP]);

  // THE PROPERTY. Someone will edit a constant one day; this is the check that notices, whether
  // they moved a margin, a card size, the mark length or the gap.
  const endpoints = marks.flatMap((m) => [[m.x1, m.y1], [m.x2, m.y2]]);
  const insideBlock = endpoints.filter(([x, y]) => x >= block.left && x <= block.right && y >= block.bottom && y <= block.top);
  eq("no crop mark touches the card block — nothing prints on a card", insideBlock, []);
  const offPage = endpoints.filter(([x, y]) => x < 0 || x > PAGE_WIDTH || y < 0 || y > PAGE_HEIGHT);
  eq("no crop mark runs off the paper", offPage, []);
}

{
  group("card layout: pagination");

  eq("nine cards fill exactly one page", paginate(9).length, 1);
  eq("a tenth card starts a second page", paginate(10).length, 2);
  eq("nineteen cards need three pages", paginate(19).length, 3);
  eq("a character with no cards gets no pages at all", paginate(0), []);

  const two = paginate(10);
  eq("the first page is full", two[0].slots.length, 9);
  eq("the short last page carries only the card it has", two[1].slots.length, 1);
  eq("cards are dealt in order, page 1 taking 0-8", two[0].slots.map((s) => s.card), [0, 1, 2, 3, 4, 5, 6, 7, 8]);
  eq("the tenth card is card index 9", two[1].slots[0].card, 9);

  // The leftover card goes top-left, not into slot 9 of an imaginary page — the deck is read in
  // slot order, so a short page has to start at the beginning of the grid.
  eq("a short page starts at the top-left slot", two[1].slots[0].rect, slotRect(0));
  eq("every page reuses the same nine rectangles", paginate(19)[2].slots[0].rect, paginate(19)[0].slots[0].rect);

  const rects = two[0].slots.map((s) => JSON.stringify(s.rect));
  eq("no two cards on a page share a rectangle", new Set(rects).size, 9);
  eq("a full page's slots are the nine slot rects in order", rects, [0, 1, 2, 3, 4, 5, 6, 7, 8].map((s) => JSON.stringify(slotRect(s))));
}

{
  group("The card export prints one deck, in the order you'd stack it");

  // Fixtures are the smallest records the deck reads: an id, a name, and whatever the face
  // prints. Nothing here is fetched from data/ — the rules under test are about records.
  const cardFeature = (text) => [{ description: [{ paragraph: { "en-US": text } }] }];
  const namedFeature = (featureName, text) => ({
    name: { "en-US": featureName },
    description: [{ paragraph: { "en-US": text } }],
  });
  const domainCard = (id, cardName, domain, level, recallCost) => ({
    id, name: { "en-US": cardName }, domain, type: "ABILITY", level, recallCost,
    features: cardFeature(`${cardName} does something.`),
  });

  const TROUBADOUR = {
    id: "core_subclass_troubadour", name: { "en-US": "Troubadour" }, class: "BARD",
    foundation: { features: [namedFeature("Gifted Performer", "Play to inspire.")] },
    specialization: { features: [namedFeature("Maestro", "Your rallies hit harder.")] },
    mastery: { features: [namedFeature("Virtuoso", "You are the best there is.")] },
  };
  const CALL_OF_THE_BRAVE = {
    id: "core_subclass_call_of_the_brave", name: { "en-US": "Call of the Brave" }, class: "WARRIOR",
    foundation: { features: [namedFeature("Courage", "Take a Hope.")] },
    specialization: { features: [namedFeature("Battle Ritual", "Clear 2 Stress.")] },
  };
  const HIGHBORNE = {
    id: "core_community_highborne", name: { "en-US": "Highborne" },
    features: [namedFeature("Privilege", "You have advantage on rolls to haggle.")],
  };
  const ELF = { id: "core_ancestry_elf", name: { "en-US": "Elf" }, features: [namedFeature("Quick Reactions", "Mark a Stress.")] };
  const HUMAN = { id: "core_ancestry_human", name: { "en-US": "Human" }, features: [namedFeature("High Stamina", "Gain an extra Stress slot.")] };
  const TIDE_MARKED = {
    id: "myhomebrew_transformation_a", name: { "en-US": "Tide-Marked" },
    features: [namedFeature("The Gift", "You breathe water as easily as air.")],
  };

  const WHIRLWIND = domainCard("core_card_whirlwind", "Whirlwind", "BLADE", 1, 0);
  const NOT_GOOD_ENOUGH = domainCard("core_card_not_good_enough", "Not Good Enough", "BLADE", 1, 1);
  const A_SOLDIERS_BOND = domainCard("core_card_a_soldiers_bond", "A Soldier's Bond", "BLADE", 2, 1);
  const DEFT_DECEIVER = domainCard("core_card_deft_deceiver", "Deft Deceiver", "GRACE", 1, 1);

  const db = {
    classes: [{ id: "core_class_bard" }, { id: "core_class_warrior" }],
    subclasses: [TROUBADOUR, CALL_OF_THE_BRAVE],
    communities: [HIGHBORNE],
    ancestries: [ELF, HUMAN],
    transformations: [TIDE_MARKED],
    weapons: [{ id: "core_weapon_shortsword" }],
    armors: [{ id: "core_armor_leather" }],
    domainCards: [WHIRLWIND, NOT_GOOD_ENOUGH, A_SOLDIERS_BOND, DEFT_DECEIVER],
  };

  const character = (over = {}) => ({
    classId: "core_class_bard",
    subclassId: "core_subclass_troubadour",
    subclassTier: "foundation",
    heritage: {
      communityId: "core_community_highborne",
      ancestryIds: ["core_ancestry_elf"],
      chosenFeatures: [{ ancestryId: "core_ancestry_elf", featureName: "Quick Reactions" }],
    },
    transformationId: null,
    equipment: { primaryWeaponId: "core_weapon_shortsword", armorId: "core_armor_leather" },
    creationDomainCardIds: ["core_card_whirlwind", "core_card_deft_deceiver"],
    domainCardIds: ["core_card_deft_deceiver", "core_card_whirlwind"],
    ...over,
  });

  // The two generated cards are handed in, not built here — that inversion is the whole reason
  // this module has no dependency on card-content.js — so a test can prove the deck order with
  // fakes this thin.
  const GENERATED = [{ kind: "stats", key: "stats" }, { kind: "class", key: "class-1" }];
  const keys = (result) => result.cards.map((c) => c.key);

  const level1 = cardSheet(character(), db, { generated: GENERATED });
  eq("a level 1 character's deck is stats, class, subclass, community, ancestry, then cards",
    keys(level1),
    ["stats", "class-1", "core_subclass_troubadour-foundation", "core_community_highborne",
      "core_ancestry_elf", "core_card_whirlwind", "core_card_deft_deceiver"]);
  eq("the generated cards lead, so page 1 top-left is always the stats card",
    level1.cards[0].kind, "stats");
  eq("nothing is missing when every id resolves", level1.missing, []);
  eq("a level 1 character with no generated cards is all record-backed",
    cardSheet(character(), db).cards.length, 5);

  // An upgrade adds a card rather than replacing the one below it, so the earlier tiers still
  // print — and they print bottom-up, the order they were earned in.
  const mastery = cardSheet(character({ subclassTier: "mastery" }), db, { generated: [] });
  eq("mastery prints all three subclass tiers, in the order they were earned",
    mastery.cards.slice(0, 3).map((c) => c.key),
    ["core_subclass_troubadour-foundation", "core_subclass_troubadour-specialization",
      "core_subclass_troubadour-mastery"]);
  eq("each tier card is titled with its own tier",
    mastery.cards.slice(0, 3).map((c) => c.title),
    ["Troubadour (Foundation)", "Troubadour (Specialization)", "Troubadour (Mastery)"]);
  eq("a tier card carries only its own tier's features, not a summary of the subclass",
    mastery.cards[2].fallback.sections.map((s) => s.name), ["Virtuoso"]);

  // A subclass upgrade at level-up can name EITHER subclass, so the two ladders are independent.
  // If they ever share a variable this is the test that catches it.
  const multi = cardSheet(character({
    subclassTier: "mastery",
    multiclass: { classId: "core_class_warrior", subclassId: "core_subclass_call_of_the_brave", tier: "foundation", domain: "BLADE" },
  }), db, { generated: [] });
  eq("a mastery character multiclassed at foundation gets three cards plus one",
    multi.cards.filter((c) => c.kind === "subclass").map((c) => c.key),
    ["core_subclass_troubadour-foundation", "core_subclass_troubadour-specialization",
      "core_subclass_troubadour-mastery", "core_subclass_call_of_the_brave-foundation"]);
  eq("the multiclass's cards say which class they came from",
    multi.cards.filter((c) => c.kind === "subclass").map((c) => c.origin),
    ["class", "class", "class", "multiclass"]);
  const mcSpec = cardSheet(character({
    subclassTier: "foundation",
    multiclass: { classId: "core_class_warrior", subclassId: "core_subclass_call_of_the_brave", tier: "specialization" },
  }), db, { generated: [] });
  eq("and the multiclass can be the further along of the two",
    mcSpec.cards.filter((c) => c.kind === "subclass").map((c) => c.key),
    ["core_subclass_troubadour-foundation", "core_subclass_call_of_the_brave-foundation",
      "core_subclass_call_of_the_brave-specialization"]);

  // There is no composite art for a mixed heritage, so both faces print in full and the player
  // reads their two chosen features off them.
  const mixed = cardSheet(character({
    heritage: {
      communityId: "core_community_highborne",
      ancestryMode: "mixed",
      ancestryIds: ["core_ancestry_elf", "core_ancestry_human"],
      chosenFeatures: [
        { ancestryId: "core_ancestry_elf", featureName: "Quick Reactions" },
        { ancestryId: "core_ancestry_human", featureName: "High Stamina" },
      ],
    },
  }), db, { generated: [] });
  eq("a mixed heritage prints two whole ancestry cards, in the order they're stored",
    mixed.cards.filter((c) => c.kind === "ancestry").map((c) => c.key),
    ["core_ancestry_elf", "core_ancestry_human"]);

  // Usually null — the SRD ships no transformations at all — but when there is one it sits with
  // the heritage cards, which is where the rules put it.
  const transformed = cardSheet(character({ transformationId: "myhomebrew_transformation_a" }), db, { generated: [] });
  eq("a transformation prints after the heritage and before the domain cards",
    transformed.cards.map((c) => c.kind),
    ["subclass", "community", "ancestry", "transformation", "domain", "domain"]);
  check("a character without one has no transformation card",
    cardSheet(character(), db).cards.every((c) => c.kind !== "transformation"));

  // Domain, then level, then name. The two Blade level 1s are the pair that proves the name
  // tiebreak is doing work rather than the storage order leaking through.
  // The homebrew card is here so the name tiebreak is doing work rather than agreeing with the
  // id by accident: an SRD id is its own name in snake_case, so those two sort alike and a
  // comparator missing the name step would still pass. This one's id sorts last and its name
  // sorts first.
  const BLADED_WIND = { ...domainCard("hb_card_002", "Bladed Wind", "BLADE", 1, 1), contentSource: "homebrew" };
  const sortDb = { ...db, domainCards: [...db.domainCards, BLADED_WIND] };
  const sortedIds = ["core_card_deft_deceiver", "core_card_a_soldiers_bond", "hb_card_002", "core_card_whirlwind", "core_card_not_good_enough"];
  const sorted = cardSheet(character({ domainCardIds: sortedIds, creationDomainCardIds: [] }), sortDb, { generated: [] });
  eq("domain cards come out by domain, then level, then name",
    sorted.cards.filter((c) => c.kind === "domain").map((c) => c.title),
    ["Bladed Wind", "Not Good Enough", "Whirlwind", "A Soldier's Bond", "Deft Deceiver"]);
  eq("and stacking them the other way round gives the same deck",
    cardSheet(character({ domainCardIds: [...sortedIds].reverse(), creationDomainCardIds: [] }), sortDb, { generated: [] })
      .cards.filter((c) => c.kind === "domain").map((c) => c.title),
    ["Bladed Wind", "Not Good Enough", "Whirlwind", "A Soldier's Bond", "Deft Deceiver"]);
  // Vaulting a card doesn't stop you owning it, and you print once.
  check("a vaulted card is still in the deck",
    cardSheet(character({ domainVaultIds: ["core_card_whirlwind"] }), db)
      .cards.some((c) => c.key === "core_card_whirlwind"));

  // A cost of 0 is a real and common answer — every Level 1 card in the SRD has one — so the
  // subtitle has to test for null rather than for truthiness.
  const whirlwind = level1.cards.find((c) => c.key === "core_card_whirlwind");
  eq("a recall cost of 0 prints as 0, not as no cost at all",
    whirlwind.fallback.subtitle, "Level 1 Ability · Recall 0");
  eq("the fallback names the domain the printed card shows as a glyph",
    whirlwind.fallback.footer, "Blade");
  eq("a card with no recall cost at all says nothing about one",
    cardSheet(character({ domainCardIds: ["core_card_x"], creationDomainCardIds: [] }),
      { ...db, domainCards: [{ id: "core_card_x", name: { "en-US": "X" }, domain: "BONE", type: "SPELL", level: 3 }] })
      .cards.find((c) => c.kind === "domain").fallback.subtitle, "Level 3 Spell");

  // The fallback IS the card for anyone without the art — .gitignore excludes data/*/card-art —
  // so it carries the record's own features, bullets included.
  eq("a fallback keeps a feature's name and its paragraphs",
    level1.cards.find((c) => c.key === "core_community_highborne").fallback,
    {
      title: "Highborne",
      subtitle: "Community",
      sections: [{ name: "Privilege", blocks: [{ type: "paragraph", text: "You have advantage on rolls to haggle." }] }],
      footer: "",
    });
  eq("a bulleted description stays a list rather than running into the paragraph",
    cardSheet(character({ heritage: { ancestryIds: ["a_1"], chosenFeatures: [] } }), {
      ...db,
      ancestries: [{
        id: "a_1", name: { "en-US": "Channeler" },
        features: [{
          name: { "en-US": "Channel" },
          description: [
            { paragraph: { "en-US": "Choose an element:" } },
            { list: [{ "en-US": "Earth" }, { "en-US": "Water" }] },
          ],
        }],
      }],
    }).cards.find((c) => c.kind === "ancestry").fallback.sections[0].blocks,
    [{ type: "paragraph", text: "Choose an element:" },
      { type: "list", items: ["Earth", "Water"] }]);

  // A blank card in a printed deck is indistinguishable from a printer fault, so an id with no
  // record behind it is dropped — and the modal has to be able to say what went.
  const orphaned = cardSheet(character({
    subclassId: "myhomebrew_subclass_gone",
    domainCardIds: ["core_card_whirlwind", "myhomebrew_card_gone"],
    creationDomainCardIds: [],
  }), db, { generated: [] });
  eq("an id with no record behind it is never drawn as a blank card",
    keys(orphaned), ["core_community_highborne", "core_ancestry_elf", "core_card_whirlwind"]);
  eq("but the export says what it dropped",
    orphaned.missing,
    [{ kind: "subclass", id: "myhomebrew_subclass_gone" }, { kind: "domain card", id: "myhomebrew_card_gone" }]);
  // The default only checks the two cards taken at creation; this deck prints the vault too.
  eq("a vaulted card that no longer exists is reported like any other",
    cardSheet(character({ domainCardIds: ["myhomebrew_card_vaulted"], creationDomainCardIds: [] }), db).missing,
    [{ kind: "domain card", id: "myhomebrew_card_vaulted" }]);
  // The generated stats card was built from the weapon, so a missing one isn't noise here.
  eq("a missing weapon is reported too, because the stats card was built from it",
    cardSheet(character({ equipment: { primaryWeaponId: "myhomebrew_weapon_gone" } }), db).missing,
    [{ kind: "weapon", id: "myhomebrew_weapon_gone" }]);

  // Art lives with the content it belongs to, so the path builders take the RECORD: a bare id
  // would emit the SRD's folder for homebrew content and 404 on every card of it.
  const hbSub = { ...TROUBADOUR, id: "hb_subclass_hex", name: { "en-US": "Hexweaver" }, contentSource: "homebrew" };
  const hbCard = { ...WHIRLWIND, id: "hb_card_hex", name: { "en-US": "Hex" }, contentSource: "homebrew" };
  const hbAnc = { ...ELF, id: "hb_ancestry_tide", name: { "en-US": "Tideborn" }, contentSource: "homebrew" };
  const homebrew = cardSheet(character({
    subclassId: "hb_subclass_hex",
    heritage: { communityId: "core_community_highborne", ancestryIds: ["hb_ancestry_tide"], chosenFeatures: [] },
    domainCardIds: ["hb_card_hex"], creationDomainCardIds: [],
  }), {
    ...db,
    subclasses: [...db.subclasses, hbSub],
    ancestries: [...db.ancestries, hbAnc],
    domainCards: [...db.domainCards, hbCard],
  });
  eq("homebrew art is looked for in the folder its own source shipped",
    homebrew.cards.map((c) => c.art),
    ["data/homebrew/card-art/subclass/hb_subclass_hex-foundation.png",
      "data/srd_2_0/card-art/community/core_community_highborne.png",
      "data/homebrew/card-art/ancestry/hb_ancestry_tide.png",
      "data/homebrew/card-art/domain/hb_card_hex.png"]);

  // A draft is offered this export too, matching the Print sheet link beside it, so half a
  // character has to come out as half a deck rather than as a throw.
  eq("a bare draft prints whatever it has, and nothing else", cardSheet({}, db).cards, []);
  eq("a draft with only a community prints one card",
    keys(cardSheet({ heritage: { communityId: "core_community_highborne" } }, db)), ["core_community_highborne"]);
}

{
  // ---------- card-content.js ----------
  //
  // The generated cards. Everything here is data a renderer walks, so all of it is assertable —
  // which is the reason the decisions (which bonuses count, which trait is starred, where the
  // text breaks) live in the pure module and not in card-pdf.js's canvas walk.

  // SHEET_DB plus the three things these cards turn on: a second class to multiclass into, the
  // two SRD domain cards that sit on either side of the permanent/loadout line, and a class
  // track. Real ids on the cards, because they're what effects.js's catalogue is keyed by —
  // a fixture card called "vitality" would collect nothing and the group below would pass by
  // testing nothing at all.
  const CARD_DB = {
    ...SHEET_DB,
    classes: [...SHEET_DB.classes, {
      id: "cls2", name: "SORCERER", domains: ["ARCANA", "MIDNIGHT"], startingHitPoints: 6, startingEvasion: 10,
      hopeFeature: { name: { "en-US": "Volatile Magic" }, description: [{ paragraph: { "en-US": "Reroll a damage die." } }] },
      classFeatures: [{ name: { "en-US": "Arcane Sense" }, description: [{ paragraph: { "en-US": "Sense magic nearby." } }] }],
    }],
    subclasses: [...SHEET_DB.subclasses,
      { id: "sub2", name: { "en-US": "Elemental Origin" }, spellcastTrait: "INSTINCT" },
      { id: "nocast", name: { "en-US": "Stonewall" } }],
    domainCards: [...SHEET_DB.domainCards,
      // "permanently gain two of the following benefits... then place this card in your vault
      // permanently" — so it counts from the vault, and must survive the card being vaulted.
      { id: "core_domain_card_vitality", name: { "en-US": "Vitality" }, domain: "VALOR", level: 2, type: "ABILITY", recallCost: 0, features: [] },
      // "gain a bonus to your Evasion equal to half your Agility" — a loadout card, and the one
      // that must NOT count.
      { id: "core_domain_card_untouchable", name: { "en-US": "Untouchable" }, domain: "MIDNIGHT", level: 1, type: "ABILITY", recallCost: 1, features: [] }],
    effects: { "cls:Frontline Tank": { track: { id: "unstoppable_die", label: "Unstoppable Die", steps: ["d4", "d6", "d8"] } } },
  };

  // deriveSheet() reads nothing else off a multiclass, so the four fields are the whole of it.
  const MULTICLASSED = { classId: "cls2", subclassId: "sub2", tier: "foundation", domain: "ARCANA" };

  const band = (card, label) => card.bands.find((b) => b.label === label);
  const byType = (card, type) => card.bands.find((b) => b.type === type);
  // Slots and the class track dropped their headings to save vertical space, so they are found by
  // what they are rather than by a label they no longer carry.
  const boxesOn = (card, label) => byType(card, "slots").cells.find((c) => c.label === label).boxes;
  const gearLines = (card) => card.bands.filter((b) => b.type === "detail")
    .map((b) => `${b.cells[0].label} ${b.cells[0].value}`);
  const traitLabels = (card) => band(card, "Traits").cells.map((c) => c.label);

  group("The stats card counts permanent bonuses only");
  {
    const held = ["core_domain_card_vitality", "core_domain_card_untouchable"];
    const holder = sheetChar({
      domainCardIds: held, creationDomainCardIds: held, domainVaultIds: [],
      // Vitality grants nothing until its choice is answered, so answer it: a Stress slot and a
      // Hit Point slot.
      effectChoices: { core_domain_card_vitality: { optionIds: ["stress", "hitPoint"] } },
    });
    const owns = deriveSheet(sheetChar(), CARD_DB); // the same character owning neither card
    const inPlay = deriveSheet(holder, CARD_DB);
    const printed = statsCardContent(holder, CARD_DB);

    // The pair that pins the rule. Both cards are in the loadout; one prints, one doesn't.
    eq("Vitality's permanent Hit Point slot is on the card", boxesOn(printed, "Hit Points"), owns.hitPoints + 1);
    eq("and its permanent Stress slot", boxesOn(printed, "Stress"), owns.stress + 1);
    eq("Untouchable, which works only from the loadout, is not in the printed Evasion",
      band(printed, "Defense").cells[0].value, String(owns.evasion));
    eq("even though it IS in play, which is the difference the footer warns about",
      inPlay.evasion, owns.evasion + 1);
    check("and the footer says so",
      String(printed.footer).includes("permanent bonuses only"));

    // The substitution is on a copy. A stats card that vaulted the character's cards for real
    // would empty the loadout of every screen that redrew after it.
    eq("the character handed in is not modified", holder.domainVaultIds, []);
    eq("nor is its collection", holder.domainCardIds, held);
  }

  group("The asterisk follows the Spellcast trait, however many there are");
  {
    const one = statsCardContent(sheetChar(), CARD_DB); // "sub" casts with Knowledge
    eq("one subclass, one starred trait", traitLabels(one),
      ["Agility", "Strength", "Finesse", "Instinct", "Presence", "Knowledge*"]);
    check("with a legend in the footer saying what the mark means",
      String(one.footer).startsWith("* spellcasting trait"));
    check("and not as a band, which put a footnote in the middle of the card",
      !one.bands.some((b) => /spellcast/i.test(b.label || "")));
    check("and no Spellcast row restating a value the grid already prints",
      !one.bands.some((b) => b.label === "Spellcast"));
    // One line carries both footnotes — the legend and the caveat about which bonuses count.
    check("on the same single line as the permanent-bonuses caveat",
      String(one.footer).includes("permanent bonuses only"));

    // Two foundation cards naming different traits is a choice per roll, not a sum, so both are
    // marked and the player picks one at the table.
    const two = statsCardContent(sheetChar({ multiclass: MULTICLASSED }), CARD_DB);
    eq("a second casting subclass stars its trait too", traitLabels(two),
      ["Agility", "Strength", "Finesse", "Instinct*", "Presence", "Knowledge*"]);

    const none = statsCardContent(sheetChar({ subclassId: "nocast" }), CARD_DB);
    eq("a Guardian's grid carries no mark", traitLabels(none),
      ["Agility", "Strength", "Finesse", "Instinct", "Presence", "Knowledge"]);
    check("and no legend for a mark that isn't there", !String(none.footer).includes("*"));
    check("but the card still carries the caveat, which is true either way",
      String(none.footer).includes("permanent bonuses only"));
  }

  group("Slot rows print empty boxes, at the counts the rules give");
  {
    const card = statsCardContent(sheetChar(), CARD_DB);
    const cells = byType(card, "slots").cells;
    eq("the four tracks, in the order a sheet prints them", cells.map((c) => c.label),
      ["Armor", "Hit Points", "Stress", "Hope"]);
    eq("Armor Score boxes come from the armor", boxesOn(card, "Armor"), 3);
    eq("Hit Point boxes from the class", boxesOn(card, "Hit Points"), 7);
    eq("Stress boxes from the base every character shares", boxesOn(card, "Stress"), 6);
    eq("Hope from the rules maximum rather than deriveSheet's own hardcoded pair",
      boxesOn(card, "Hope"), MAX_HOPE);
    // Including Hope. Printed-in starting Hope is true until the first roll and wrong after it.
    check("every box is empty", cells.every((c) => c.marked === 0));

    // 4 of 15 classes have a track; the other 11 must not print an empty label.
    eq("a class with a track prints it", byType(card, "lines").cells[0].value, "d4");
    const trackless = statsCardContent(sheetChar(), { ...CARD_DB, effects: {} });
    check("a class without one prints no track row at all",
      !trackless.bands.some((b) => b.type === "lines" && (b.cells || []).some((c) => /die/i.test(c.label))));
  }

  group("Each weapon is one line, and only its feature may shrink");
  {
    const unarmed = statsCardContent(sheetChar({ equipment: { primaryWeaponId: UNARMED, armorId: "gambeson" } }), CARD_DB);
    const line = gearLines(unarmed)[0];
    // An unarmed profile names both traits itself, because the SRD hands the choice to the roll.
    // Prefixing it with a trait label would name three.
    check("an unarmed attack prints the profile's own two-trait string",
      line.includes("Strength") && line.includes("Finesse"));
    check("never the object it came from", !line.includes("[object"));

    const listed = statsCardContent(sheetChar({ equipment: { primaryWeaponId: "listed", armorId: "gambeson" } }), CARD_DB);
    const shrinkable = listed.bands.filter((b) => b.shrink);
    eq("the feature is the only thing marked shrinkable", shrinkable.map((b) => b.cells[0].label), ["Options"]);
    check("the weapon's own line is not, so its numbers never shrink",
      !listed.bands.some((b) => b.type === "detail" && b.shrink));
    eq("a list keeps its markers where there's no room to be a list",
      shrinkable[0].cells[0].value, "• Choose fire. • Choose frost.");

    const plain = statsCardContent(sheetChar({ equipment: { primaryWeaponId: "plain", armorId: "gambeson" } }), CARD_DB);
    eq("a weapon with no feature prints no shrinkable band", plain.bands.filter((b) => b.shrink).length, 0);
    // "Primary weapon - Shortsword: +1 Agility | 1d6 Physical" — the four values a weapon has, on
    // the one row that used to be three.
    const first = gearLines(plain)[0];
    check("the line leads with which hand, not which sword", first.startsWith("Primary weapon -"));
    check("and carries name, trait, attack and damage", /Shortsword: \+1 Agility \| .*Physical/.test(first));
  }

  group("Damage thresholds print as one scale, not two rows");
  {
    const card = statsCardContent(sheetChar(), CARD_DB);
    const sheet = deriveSheet(sheetChar(), CARD_DB);
    const scale = band(card, "Defense").scale;
    // Word, boundary, word, boundary, word. The numbers sit BETWEEN the bands they divide, which
    // is the thing two rows headed "Major threshold" and "Severe threshold" got wrong.
    eq("the three bands damage can land in, in order", scale.map((c) => c.label),
      ["Minor", "Major", "Severe"]);
    eq("the first boundary is the Major threshold", scale[0].value, String(sheet.thresholds.major));
    eq("the second is the Severe threshold", scale[1].value, String(sheet.thresholds.severe));
    eq("and the last word closes the scale with no number after it", scale[2].value, "");
    check("the old rows are gone",
      !card.bands.some((b) => (b.cells || []).some((c) => /threshold/i.test(c.label))));
    // Evasion shares the row with the scale rather than owning one: it is a number you roll
    // against, not a band on a track, and the card cannot spare a row for each.
    eq("Evasion is the row's only cell", band(card, "Defense").cells.map((c) => c.label), ["Evasion"]);

    // A draft with no equipment has no thresholds to print. It still prints the scale, with
    // dashes, because a band that vanishes reads as a printing fault rather than as "not known".
    const draft = statsCardContent(sheetChar({ equipment: {} }), CARD_DB);
    eq("a character with no equipment still gets the scale",
      band(draft, "Defense").scale.map((c) => c.label), ["Minor", "Major", "Severe"]);
  }

  group("Both hands and the armor print, each with its own feature under it");
  {
    const two = statsCardContent(sheetChar({
      equipment: { primaryWeaponId: "plain", secondaryWeaponId: "listed", armorId: "gambeson" },
    }), CARD_DB);
    const leads = two.bands.filter((b) => b.type === "detail").map((b) => b.cells[0].label);
    eq("three lines, each saying what it is", leads,
      ["Primary weapon -", "Secondary weapon -", "Armor -"]);
    check("no section heading above them — every line already announces itself",
      !two.bands.some((b) => /weapons and armor/i.test(b.label || "")));

    // The armor prints its OWN base numbers, not the character's current ones: those are already
    // the scale beside Evasion and the Armor boxes, and printing both invites adding them up.
    check("the armor line carries base thresholds then base score", /: 5\/11 \| 3/.test(gearLines(two)[2]));

    // A feature belongs to the thing it follows. With three lines on the card, a pooled list
    // would leave the reader matching a feature name back to the hand holding it.
    const idx = two.bands.map((b, i) => [b, i]);
    const secondary = idx.find(([b]) => b.type === "detail" && b.cells[0].label === "Secondary weapon -")[1];
    const armorAt = idx.find(([b]) => b.type === "detail" && b.cells[0].label === "Armor -")[1];
    eq("the secondary's feature sits immediately under it", two.bands[secondary + 1].type, "feature");
    eq("named for that weapon, not the other one", two.bands[secondary + 1].cells[0].label, "Options");
    // This fixture's armor has no feature, so nothing follows its line — the next band is the
    // Experiences heading, not an empty feature block.
    check("a featureless armor gets no feature band at all",
      (two.bands[armorAt + 1] || {}).type !== "feature");

    // And when the armor DOES have one, it is indented under the armor exactly like a weapon's.
    const withFeature = statsCardContent(
      sheetChar({ equipment: { primaryWeaponId: "plain", armorId: "flexible" } }),
      { ...CARD_DB, armors: [...CARD_DB.armors, {
        id: "flexible", name: { "en-US": "Flexible Mail" }, baseScore: 4,
        baseMajorThreshold: 6, baseSevereThreshold: 12,
        features: [{ name: { "en-US": "Flexible" }, description: [{ paragraph: { "en-US": "+1 to Evasion." } }] }],
      }] });
    const at = withFeature.bands.findIndex((b) => b.type === "detail" && b.cells[0].label === "Armor -");
    eq("the armor's own feature follows it", withFeature.bands[at + 1].cells[0].label, "Flexible");
    check("and the line above carries that armor's bases",
      /: 6\/12 \| 4/.test(gearLines(withFeature).pop()));

    const one = statsCardContent(sheetChar({ equipment: { primaryWeaponId: "plain", armorId: "gambeson" } }), CARD_DB);
    eq("a character with one weapon gets one weapon line and the armor",
      one.bands.filter((b) => b.type === "detail").map((b) => b.cells[0].label),
      ["Primary weapon -", "Armor -"]);
  }

  group("The title row carries the name and the level, and nothing the deck repeats");
  {
    const card = statsCardContent(sheetChar(), CARD_DB);
    const sheet = deriveSheet(sheetChar(), CARD_DB);
    eq("the name is the title", card.title, sheet.name);
    eq("the level rides on the same row", card.titleRight, `Level ${sheet.level}`);
    // Class and subclass both have cards of their own further into the same deck, so a subtitle
    // naming them restated the deck and cost the body a row it needed.
    eq("and there is no subtitle at all", card.subtitle, "");
  }

  group("A weapon feature is set as part of its weapon, not as its own subject");
  {
    const card = statsCardContent(sheetChar({ equipment: { primaryWeaponId: "listed", armorId: "gambeson" } }), CARD_DB);
    const feature = card.bands.find((b) => b.type === "feature");
    // "note" is body-sized, which drew the feature LARGER than the Attack and Damage rows it
    // describes. The type is what tells the renderer to match the weapon and indent under it.
    check("it is a feature band, never a note", !!feature);
    check("no note band survives on the stats card", !card.bands.some((b) => b.type === "note"));
    eq("it still carries the feature's own name as its heading", feature.cells[0].label, "Options");
    check("and it is still the band a renderer may shrink", feature.shrink === true);
  }

  group("Class cards: one per class, and a multiclass grants no Hope feature");
  {
    const cards = classCardContents(sheetChar({ multiclass: MULTICLASSED }), CARD_DB);
    eq("one card per class", cards.length, 2);
    eq("the first is the class you started as", cards[0].title, "Guardian");
    eq("its Hope feature leads, then its class features", cards[0].sections.map((s) => s.name),
      ["Unstoppable", "Frontline Tank"]);
    eq("and the Hope feature says which it is", cards[0].sections[0].tag, "Hope Feature");
    eq("the second class gets a card of its own", cards[1].title, "Sorcerer");
    eq("holding only its class features", cards[1].sections.map((s) => s.name), ["Arcane Sense"]);
    check("its Hope feature is nowhere on it — multiclassing doesn't hand one over",
      !JSON.stringify(cards[1]).includes("Volatile Magic"));
    // deriveSheet().multiclassFeatures would have brought the subclass tiers along, and each of
    // those already has its own art card in the deck.
    check("nor are its subclass tier features, which are cards in their own right",
      !JSON.stringify(cards[1]).includes("Elemental Origin"));

    eq("a single-class character gets one card", classCardContents(sheetChar(), CARD_DB).length, 1);
    eq("a feature keeps its blocks rather than being joined into one CSV-shaped line",
      cards[0].sections[1].blocks, [{ type: "paragraph", text: "You mark 1 fewer Stress." }]);
  }

  group("Cards split when the text won't fit, and only then");
  {
    // A measurer of exactly ten characters to the line, so every break below can be read off
    // the fixture by counting.
    const measure = (text) => text.length * 10;
    const opts = { width: 100, height: 40, lineHeight: 10, bodySize: 10, headingSize: 10, measure };
    const content = (sections, title = "Druid") => ({ title, subtitle: "Class Features", sections, footer: "" });

    const short = paginateSections(content([{ name: "Beastform", blocks: [{ type: "paragraph", text: "aaaa bbbb" }] }]), opts);
    eq("one card is one card", short.length, 1);
    eq("and carries no (n/m) suffix sending a reader after a card that doesn't exist",
      short[0].title, "Druid");

    // Heading + four wrapped lines against a four-line card.
    const spilled = paginateSections(
      content([{ name: "Beastform", tag: "Hope Feature", blocks: [{ type: "paragraph", text: "aaaa bbbb cccc dddd eeee ffff gggg" }] }]),
      opts,
    );
    eq("a section longer than the card continues on a second one", spilled.map((c) => c.title),
      ["Druid (1/2)", "Druid (2/2)"]);
    eq("the first card fills to the line that fits", spilled[0].sections[0].blocks[0].text,
      "aaaa bbbb cccc dddd eeee ffff");
    eq("the rest carries over", spilled[1].sections[0].blocks[0].text, "gggg");
    eq("and picks its name back up, so the second card isn't anonymous prose",
      spilled[1].sections[0].name, "Beastform (cont.)");
    eq("the subtitle repeats — each card is cut out and read on its own", spilled[1].subtitle, "Class Features");

    // Widow control: "Bee" would fit on the first card, its first line of prose wouldn't.
    const widowed = paginateSections(content([
      { name: "Aye", blocks: [{ type: "paragraph", text: "aaaa bbbb cccc dddd" }] },
      { name: "Bee", blocks: [{ type: "paragraph", text: "xxxx" }] },
    ], "Two"), opts);
    eq("a heading never prints as the last thing on a card", widowed.map((c) => c.sections.map((s) => s.name)),
      [["Aye"], ["Bee"]]);

    // One line to a card, and a word twice that long: it has to be cut, and nothing may be lost.
    const cut = paginateSections(
      { title: "Word", subtitle: "", sections: [{ name: "", blocks: [{ type: "paragraph", text: "supercalifragilistic" }] }] },
      { ...opts, height: 10 },
    );
    eq("a word wider than the line hard-breaks rather than vanishing",
      cut.map((c) => c.sections[0].blocks[0].text), ["supercalif", "ragilistic"]);
    eq("and the halves rejoin with nothing inserted between them",
      cut.map((c) => c.sections[0].blocks[0].text).join(""), "supercalifragilistic");

    // Blocks survive the round trip in source order, bullets still bullets.
    const mixed = paginateSections(content([{ name: "Edge", blocks: [
      { type: "paragraph", text: "Choose one:" },
      { type: "list", items: ["Clear a Hit Point.", "Clear an Armor Slot."] },
      { type: "paragraph", text: "Not twice." },
    ] }]), { ...opts, width: 200, height: 1000 });
    eq("blocks come back out in source order, a list still a list", mixed[0].sections[0].blocks, [
      { type: "paragraph", text: "Choose one:" },
      { type: "list", items: ["Clear a Hit Point.", "Clear an Armor Slot."] },
      { type: "paragraph", text: "Not twice." },
    ]);

    // The stats card is bounded by construction, so it goes through untouched.
    const stats = paginateSections(statsCardContent(sheetChar(), CARD_DB), { ...opts, width: 200, height: 1000 });
    eq("a card with no sections is one card", stats.length, 1);
    eq("with its bands intact", stats[0].bands.length, statsCardContent(sheetChar(), CARD_DB).bands.length);
  }

  group("Missing art falls back to the card's own text");
  {
    const fallback = fallbackCardContent({
      kind: "domain", key: "core_domain_card_untouchable", title: "Untouchable",
      record: { ...CARD_DB.domainCards[2], features: [{ name: { "en-US": "Untouchable" }, description: [{ paragraph: { "en-US": "Gain a bonus to your Evasion." } }] }] },
    });
    eq("the frame's own line reads back off the record", fallback.subtitle, "Midnight 1 · Ability · Recall 1");
    eq("and the rules text is the card", fallback.sections[0].blocks[0].text, "Gain a bonus to your Evasion.");

    // A subclass card's features hang off the tier, not off the record.
    const tier = fallbackCardContent({
      kind: "subclass", key: "sub", title: "Stalwart (Foundation)", tier: "foundation", record: SHEET_DB.subclasses[0],
    });
    eq("a subclass card prints the tier it is, not every tier the subclass has",
      tier.sections.map((s) => s.name), ["Unwavering"]);
  }
}

// ---------- a weapon whose trait is Spellcast ----------
//
// Every weapon in data/ until now named one of the six traits. The combat wheelchairs' arcane
// frames don't: the SRD prints their trait as "Spellcast", meaning whichever trait the character
// sitting in the chair casts with, which isn't knowable until a character picks the weapon up.
// So the record carries a sentinel and derived-stats.js resolves it at read time — and four
// readers that each treat a weapon differently have to agree about what came back: the attack
// arithmetic, the picker's badge, the printed sheet and the GM's CSV.
//
// Last in the file because the CSV fixture is the last of the four to be declared, and these
// check one weapon through all of them rather than the same weapon four times over.

const CHAIR = {
  id: "core_weapon_arcane_frame_wheelchair", name: { "en-US": "Arcane-Frame Wheelchair" },
  type: "PRIMARY_MAGIC", tier: 1, trait: SPELLCAST_TRAIT, range: "FAR",
  damage: { dice: "D6", type: "MAGICAL" }, burden: "ONE_HANDED",
  // Reliable is on the real record, and it earns its place here: a bonus that applies to attacks
  // with THIS weapon has to survive being routed through a trait nobody wrote on the record —
  // and has to land on both alternatives when there are two, since it applies whichever one
  // gets rolled.
  features: [feat("Reliable", para("+1 to attack rolls"))],
};

// Instinct is +1 in the fixture and Knowledge -1, so a character casting with both prints one
// alternative that carries a sign and one that comes out at zero — and with Reliable inside
// them, no two numbers in these checks are the same number by accident.
const CASTER = { id: "sub_instinct", name: { "en-US": "Sparkwright" }, spellcastTrait: "INSTINCT" };
// A multiclass in the shape the replay derives, written out rather than recorded as a level up:
// what a second Spellcast trait DOES is the subject here, and that a recorded pick is where the
// second one comes from is already pinned by "Two Spellcast traits are alternatives, not a sum".
// "sub" is the Knowledge-casting subclass in all three fixture dbs below.
const SECOND_CASTER = { classId: "cls", subclassId: "sub", domain: "ARCANA", level: 5, tier: "foundation" };

group("A weapon that rolls whichever trait you cast with");
{
  const CHAIR_DB = { ...FX_DB, subclasses: [...FX_DB.subclasses, CASTER], weapons: [...FX_DB.weapons, CHAIR] };
  const inChair = (over = {}) => statChar({
    subclassId: CASTER.id,
    equipment: { primaryWeaponId: CHAIR.id, secondaryWeaponId: null, armorId: null, potionChoice: null },
    ...over,
  });

  // Stalwart is a Guardian's subclass, and a Guardian casts with nothing at all. There is no
  // trait to resolve the sentinel to, so there is no number — and inventing one (Knowledge,
  // say, or 0) would be a sheet quietly answering a question the rules leave to the table.
  const guardian = derivedStats(inChair({ subclassId: "core_subclass_stalwart" }), CHAIR_DB);
  check("a subclass with no Spellcast trait gets no attack line at all", guardian.primaryAttack === null);
  // Warned, never prevented: whether they can wield it is the GM's call, and the warning that
  // already covered a Guardian holding a staff is what explains the dash here too.
  check("and the magic-weapon warning is what says why",
    magicWeaponWarning(CHAIR, null, null).startsWith("Arcane-Frame Wheelchair is a magic weapon"));

  // Instinct +1, Reliable +1.
  const one = derivedStats(inChair(), CHAIR_DB).primaryAttack;
  eq("one Spellcast trait resolves to a single total", one.total, 2);
  eq("with the weapon's own bonus inside it, and the trait it resolved to named as resolved",
    one.parts.map((p) => p.label),
    ["Spellcast trait: Instinct (Arcane-Frame Wheelchair)", "Arcane-Frame Wheelchair (Reliable)"]);
  // Without the "Spellcast trait:" prefix the popover reads "Instinct (Arcane-Frame Wheelchair)"
  // on a weapon whose card says Spellcast, and nothing on screen connects the two.
  eq("which a weapon naming its own trait doesn't need",
    derivedStats(statChar({ equipment: { primaryWeaponId: "dagger" } }), CHAIR_DB).primaryAttack.parts[0].label,
    "Finesse (Dagger)");

  const two = derivedStats(inChair({ multiclass: SECOND_CASTER }), CHAIR_DB).primaryAttack;
  eq("two of them are alternatives rather than a sum, each carrying that same bonus",
    two.display, "(+2) Instinct / (0) Knowledge");
  // The absence IS the signal — the sheet, the card and the CSV all branch on it, and a boolean
  // beside it would be a second thing to keep true.
  eq("and there is no total, which is the only way a reader is told so", two.total, undefined);
  eq("a part per trait, and one for the bonus that applies whichever you roll",
    two.parts.map((p) => p.label), [
      "Spellcast trait: Instinct (Arcane-Frame Wheelchair)",
      "Spellcast trait: Knowledge (Arcane-Frame Wheelchair)",
      "Arcane-Frame Wheelchair (Reliable)",
    ]);
  has("with a note saying the choice is made per attack", [two.note], "each time you attack");

  // Nothing about the sentinel is tied to the main hand.
  const offhand = derivedStats(statChar({
    subclassId: CASTER.id, equipment: { primaryWeaponId: "dagger", secondaryWeaponId: CHAIR.id },
  }), CHAIR_DB);
  eq("and the off hand resolves it the same way", offhand.secondaryAttack.total, 2);
}
{
  // The picker's ★ badge. A weapon whose trait IS Spellcast suits every caster by definition, so
  // withholding the badge would rank the one weapon that always fits below weapons that only
  // sometimes do.
  check("it's flagged for a caster", matchesSpellcast(CHAIR, "INSTINCT"));
  check("for either trait of a multiclassed one", matchesSpellcast(CHAIR, ["INSTINCT", "KNOWLEDGE"]));
  check("and for nobody who has no Spellcast trait to roll", !matchesSpellcast(CHAIR, null));
  check("an empty list being the same answer as none", !matchesSpellcast(CHAIR, []));

  // A weapon that names a trait is judged exactly as it was.
  const staff = { name: { "en-US": "Greatstaff" }, trait: "KNOWLEDGE" };
  check("an ordinary weapon still matches its own trait", matchesSpellcast(staff, "KNOWLEDGE"));
  check("and only its own", !matchesSpellcast(staff, "INSTINCT"));

  // The sentinel is spelled like every other SCREAMING_SNAKE value in data/, which is why the
  // formatter needed no case for it: the word it comes out as is the word the SRD prints.
  eq("the card prints the trait as the book prints it", weaponTraitText(CHAIR), "Spellcast");
  eq("and the whole line reads as prose", weaponStats(CHAIR), "Spellcast · Far · d6 mag · One-handed");
}
{
  const CHAIR_SHEET_DB = {
    ...SHEET_DB, subclasses: [...SHEET_DB.subclasses, CASTER], weapons: [...SHEET_DB.weapons, CHAIR],
  };
  const chairSheet = (over = {}) => deriveSheet(sheetChar({
    subclassId: CASTER.id,
    equipment: { primaryWeaponId: CHAIR.id, secondaryWeaponId: null, armorId: "gambeson", potionChoice: null },
    ...over,
  }), CHAIR_SHEET_DB).weapons[0];

  const one = chairSheet();
  eq("the printed sheet labels the weapon with what its card says", one.traitLabel, "Spellcast");
  eq("beside the number that resolving it produced", one.attack, "+2");

  const two = chairSheet({ multiclass: SECOND_CASTER });
  // "(Instinct or Knowledge)" would be truer about this character and wrong on the page: the
  // bracketed label says what the weapon is, and the attack beside it already names both.
  eq("a second Spellcast trait changes nothing about the label", two.traitLabel, "Spellcast");
  eq("only the attack, which prints the alternatives because there is no total to sign",
    two.attack, "(+2) Instinct / (0) Knowledge");

  // The other no-total shape, unchanged. A bare-handed profile names its traits inside the
  // attack string, so a bracketed trait after it would print them twice — which is why the
  // sheet keys the label off `traits` and not off the missing total.
  const bare = deriveSheet(sheetChar({
    equipment: { primaryWeaponId: UNARMED, secondaryWeaponId: null, armorId: UNARMORED, potionChoice: null },
  }), CHAIR_SHEET_DB).weapons[0];
  eq("and an unarmed profile still has no trait to put in brackets", bare.traitLabel, "");
  eq("its attack reading the same shape from the same helper", bare.attack, "(+2) Strength / (0) Finesse");
}
{
  const CHAIR_CSV_DB = {
    ...CSV_DB, subclasses: [...CSV_DB.subclasses, CASTER], weapons: [...CSV_DB.weapons, CHAIR],
  };
  const chairRow = (over = {}) => exportRow(csvChar({
    subclassId: CASTER.id,
    equipment: { primaryWeaponId: CHAIR.id, secondaryWeaponId: null, armorId: "gambeson", potionChoice: null },
    ...over,
  }), undefined, CHAIR_CSV_DB);

  const one = chairRow();
  eq("the GM's trait column holds the word off the card", one["primary-trait"], "Spellcast");
  eq("and the bonus column a number, when there is one number to give", one["primary-attack-bonus"], "+2");

  const two = chairRow({ multiclass: SECOND_CASTER });
  eq("which the second Spellcast trait doesn't change", two["primary-trait"], "Spellcast");
  eq("though the bonus column becomes the string the sheet prints",
    two["primary-attack-bonus"], "(+2) Instinct / (0) Knowledge");
  // csvField() prefixes an apostrophe to anything a spreadsheet would run, and a cell opening
  // with "+" is a formula to a spreadsheet. The brackets are load-bearing for exactly this: the
  // unbracketed form tripped the guard and put a stray quote on the GM's printed sheet.
  check("with no apostrophe, because a bracket is not the start of a formula",
    !two["primary-attack-bonus"].startsWith("'"), `got ${two["primary-attack-bonus"]}`);
  eq("which is what it would have collected without them",
    csvField("+2 Instinct / 0 Knowledge"), `"'+2 Instinct / 0 Knowledge"`);
  // A lone "+2" is a plain number, which the guard exempts so the column stays sortable.
  check("and a single total stays a number the GM can sort on", !one["primary-attack-bonus"].startsWith("'"));
}

// The three readers that a Spellcast weapon caught out, each fixed after the fact and each
// pinned here so it stays fixed. All three are cases where a SECOND shape of "an attack with no
// single total" met code written when the bare-handed profile was the only one.

group("What the Spellcast sentinel broke elsewhere, and no longer does");
{
  // The badge compared a weapon's SCREAMING_SNAKE trait against the lowercase keys
  // spellcastTraitKeys() returns — so it was false for every weapon in the book, and the arcane
  // chair, whose branch never reaches the comparison, would have been the ONLY weapon a caster
  // ever saw marked. The checks above pass uppercase because that reads better; production
  // passes lowercase, so that is what has to be asserted.
  const staff = { name: { "en-US": "Greatstaff" }, trait: "KNOWLEDGE" };
  check("an ordinary weapon matches the lowercase keys create.js actually passes",
    matchesSpellcast(staff, ["knowledge"]));
  check("and still doesn't match a trait that isn't its own", !matchesSpellcast(staff, ["instinct"]));
  check("the chair matches those same keys", matchesSpellcast(CHAIR, ["knowledge"]));
  check("and either spelling is the same answer", matchesSpellcast(staff, ["KNOWLEDGE"]));

  const CHAIR_SHEET_DB2 = {
    ...SHEET_DB, subclasses: [...SHEET_DB.subclasses, CASTER], weapons: [...SHEET_DB.weapons, CHAIR],
  };
  const inChair = (over = {}) => sheetChar({
    subclassId: CASTER.id,
    equipment: { primaryWeaponId: CHAIR.id, secondaryWeaponId: null, armorId: "gambeson", potionChoice: null },
    ...over,
  });

  // The printed card writes "+1 Agility" with no brackets, which is right until the attack is a
  // string that names traits of its own: "(0) Knowledge Spellcast" reads as one alternative
  // rolled with a trait of that name. `attackNamesTraits` is how the card knows to bracket, and
  // it comes off the missing total rather than off the weapon, because the bare-handed profile
  // has the same shape for an entirely different reason.
  const one = deriveSheet(inChair(), CHAIR_SHEET_DB2).weapons[0];
  const two = deriveSheet(inChair({ multiclass: SECOND_CASTER }), CHAIR_SHEET_DB2).weapons[0];
  check("one Spellcast trait is a plain total, so the card needs no bracket", !one.attackNamesTraits);
  check("two make an attack string that names them, so it does", two.attackNamesTraits);
  const bare = deriveSheet(sheetChar({
    equipment: { primaryWeaponId: UNARMED, secondaryWeaponId: null, armorId: UNARMORED, potionChoice: null },
  }), CHAIR_SHEET_DB2).weapons[0];
  check("as does a bare-handed profile, which has no label to bracket anyway",
    bare.attackNamesTraits && bare.traitLabel === "");

  // The CSV's secondary column signed a total that a Spellcast weapon in the off hand doesn't
  // have, and printed the word "undefined" into a file a GM keeps. The primary column beside it
  // had the fallback; this one didn't.
  const CHAIR_CSV_DB2 = {
    ...CSV_DB, subclasses: [...CSV_DB.subclasses, CASTER], weapons: [...CSV_DB.weapons,
      { ...CHAIR, id: "chair_secondary", type: "SECONDARY" }],
  };
  const offhand = exportRow(csvChar({
    subclassId: CASTER.id,
    equipment: { primaryWeaponId: null, secondaryWeaponId: "chair_secondary", armorId: "gambeson", potionChoice: null },
    multiclass: SECOND_CASTER,
  }), undefined, CHAIR_CSV_DB2);
  check("the off-hand bonus column never says \"undefined\"",
    !String(offhand["secondary-attack-bonus"]).includes("undefined"),
    `got ${offhand["secondary-attack-bonus"]}`);
  eq("it says what the primary column would have said",
    offhand["secondary-attack-bonus"], "(+2) Instinct / (0) Knowledge");
}

// ---------- the official sheet: its fields, and the bytes that fill them ----------
//
// Two modules, two halves of one job. sheet-fields.js decides WHAT goes in each box and is a
// pure function over a character; pdf-form.js puts strings into an AcroForm and decides nothing.
// The template they meet in — data/sheet/sheet-template.pdf — is copyrighted art that lives in a
// private repo, so nothing here opens it. The fixture below is hand-built instead, which is a
// gain rather than a compromise: a template we compose can carry the traps a real one only has
// by luck, and every one it carries is a wrong implementation failing loudly.

const formFailure = (fn) => {
  try { fn(); return ""; } catch (e) { return String(e.message); }
};

// A PDF built the way readForm expects to find one: objects in file order, one classic xref
// table whose offsets are COUNTED from the bytes rather than guessed at, and one classic
// trailer. One character per byte throughout — the latin1 representation pdf-form.js works in —
// so `text.length` below is a byte offset and nothing has to be corrected for encoding.
//
// `info` and `id` are the trailer's two copied-through entries, spelled the way this fixture's
// own trailer spells them by default: an indirect reference and a pair of hex strings. They are
// parameters because a file identifier may legally be written as literal strings full of bytes no
// ASCII writer would accept, and null for either drops the key entirely — the template that names
// neither is the one that proves neither is invented.
//
// `widgets` appends extra widget dictionaries and lists them in BOTH /Fields and /Annots, so a
// group that needs a trap the four standard fields haven't got can add one without renumbering
// anything: they land after object 12, above every number the assertions below pin. It defaults to
// empty, and the default fixture is byte-identical to the one that existed before it was added —
// which is what lets TRAP_WIDGETS carry the /Q, /Ff, /DA and /Rect shapes the appearance work
// needs without a single existing check moving.
function buildFormPdf({
  fields = "5 0 R 6 0 R 7 0 R 8 0 R", acroForm = "/AcroForm 3 0 R", extra = [], tail = "%%EOF\n",
  info = "12 0 R", id = "[<0102030405060708090A0B0C0D0E0F10><100F0E0D0C0B0A090807060504030201>]",
  widgets = [],
} = {}) {
  // Object numbers are positions in `objects` below, and `widgets` goes last, so the first of them
  // is one past the twelve standard objects and whatever `extra` added. Computed here because
  // /Fields and /Annots are written before the array is built.
  const widgetRefs = widgets.map((_, i) => ` ${13 + extra.length + i} 0 R`).join("");
  // The appearance stream every widget below points its /AP at — and the fixture's first trap.
  // Its content spells "7 0 obj" on a line of its own, which is object 7's header: a scanner
  // that runs one global regex over the file finds it, and because a later definition wins in an
  // incrementally-updated PDF it would overwrite the real object 7 — the `agi-marked` checkbox —
  // with fifteen bytes of drawing operators.
  const ops = "0 0 12 12 re f\n7 0 obj\n";
  const objects = [
    `<</Type/Catalog/Pages 2 0 R${acroForm}>>`,
    "<</Type/Pages/Kids[4 0 R]/Count 1>>",
    `<</Fields[${fields}${widgetRefs}]/DA(/Helvetica 0 Tf 0 g)/DR<</Font<</Helvetica 11 0 R>>>>>>`,
    `<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]/Annots[5 0 R 6 0 R 7 0 R 8 0 R${widgetRefs}]>>`,
    // The second trap: a /TU whose literal string nests parentheses. Scanning for the next ")"
    // ends this dictionary in the middle of "as written", and the walk that follows then reports
    // a perfectly good template as malformed. /V is here too, so the rewrite has to REMOVE it —
    // a dictionary with two /V entries is undefined behaviour and the one a reader picks is the
    // one you didn't write.
    "<</Type/Annot/Subtype/Widget/FT/Tx/T(name)/TU(Your name (1/2) as written)/V(Old Name)"
      + "/P 4 0 R/Rect[36 700 300 720]/DA(/Helvetica 0 Tf 0 g)/MK<</BG[1 1 1]>>/AP<</N 10 0 R>>>>",
    // A /T written as UTF-16BE hex, which Master PDF Editor does for some names. Decoded
    // byte-wise it keys the field map on mojibake and the caller's correct "pronouns" throws as
    // unknown. The \xee in its tooltip is a template byte above 0x7F that fillForm has to copy
    // through untouched — re-encoding it as UTF-8 would write two bytes where there was one.
    "<</Type/Annot/Subtype/Widget/FT/Tx/T<FEFF00700072006F006E006F0075006E0073>"
      + "/TU(Pronoms, s'il vous pla\xeet)/P 4 0 R/Rect[36 670 300 690]/DA(/Helvetica 0 Tf 0 g)/AP<</N 10 0 R>>>>",
    "<</Type/Annot/Subtype/Widget/FT/Btn/T(agi-marked)/P 4 0 R/Rect[36 640 50 654]"
      + "/AP<</N<</Yes 10 0 R/Off 10 0 R>>>>/AS/Off/V/Off>>",
    // The on-state named /On, and listed AFTER /Off so that taking the first substate ticks
    // nothing. Writing /AS/Yes to this box selects an appearance it hasn't got and reports no
    // error — the box just stays empty.
    "<</Type/Annot/Subtype/Widget/FT/Btn/T(str-marked)/P 4 0 R/Rect[36 620 50 634]"
      + "/AP<</N<</Off 10 0 R/On 10 0 R>>>>/AS/Off>>",
    // The stale widget the module's header is about: a second `name`, left behind by an earlier
    // editing session, in neither /Fields nor /Annots. No viewer will ever show it; a scan for
    // "every object with a /T" finds it and calls this template broken.
    "<</Type/Annot/Subtype/Widget/FT/Tx/T(name)/V(Superseded)/P 4 0 R/Rect[36 600 300 620]/DA(/Helvetica 0 Tf 0 g)>>",
    `<</Type/XObject/Subtype/Form/BBox[0 0 12 12]/Resources<<>>/Length ${ops.length}>>\nstream\n${ops}endstream`,
    // The fixture's font carries the trap the real template has: a /Differences array that moves
    // WinAnsi 149 off `bullet` and 151 off `emdash`. A viewer that honours it draws the wrong
    // glyph for text this app really writes — Guardian's bulleted benefits, and the em dash
    // armor-name IS for a character with no armor. Nothing here should ever rewrite this object;
    // the module adds a font of its own instead.
    "<</Type/Font/Subtype/Type1/BaseFont/Helvetica/Encoding<</BaseEncoding/WinAnsiEncoding"
      + "/Differences[149/Lslash 150/OE 151/Scaron]>>>>",
    "<</Producer(Master PDF Editor)/CreationDate(D:20260101000000Z)>>",
    ...extra,
    ...widgets,
  ];

  let text = "%PDF-1.7\n%\xe2\xe3\xcf\xd3\n";
  const offsets = [];
  objects.forEach((body, i) => {
    offsets[i + 1] = text.length;
    text += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xrefAt = text.length;
  const size = objects.length + 1;
  text += `xref\n0 ${size}\n0000000000 65535 f\r\n`;
  for (let i = 1; i < size; i++) text += `${String(offsets[i]).padStart(10, "0")} 00000 n\r\n`;
  text += `trailer\n<</Size ${size}/Root 1 0 R${info ? `/Info ${info}` : ""}${id ? `/ID${id}` : ""}`
    + `>>\nstartxref\n${xrefAt}\n${tail}`;
  return { text, bytes: Uint8Array.from(text, (c) => c.charCodeAt(0)), xrefAt, size };
}

const FORM = buildFormPdf();

group("Reading a form template: the live widgets, and the litter left beside them");
{
  const form = readForm(FORM.bytes);
  eq("every field the AcroForm lists is found, in the order it lists them",
    [...form.fields.keys()], ["name", "pronouns", "agi-marked", "str-marked"]);
  eq("a text field and a checkbox are told apart by their /FT",
    [...form.fields.values()].map((f) => f.type), ["Tx", "Tx", "Btn", "Btn"]);
  eq("a /T written as UTF-16BE hex is decoded, not read one byte per character",
    form.fields.get("pronouns").obj, 6);

  // The stale-widget trap, stated as an assertion. Object 9 is a second `name`; the live one is
  // the one /Fields names, and nothing the orphan says reaches the caller.
  eq("the live `name` is the widget /Fields names, not the orphan an earlier edit left behind",
    form.fields.get("name").obj, 5);
  check("so the value the orphan is still carrying is nowhere in what came back",
    ![...form.fields.values()].some((f) => f.dict.includes("Superseded")));

  // And the stream trap. The check above it is the positive control: an assertion that a byte
  // sequence was NOT mistaken for an object header is worth nothing unless the sequence is
  // really there to be mistaken.
  check("the fixture really does spell an object header inside a stream",
    FORM.text.slice(FORM.text.indexOf("10 0 obj")).includes("\n7 0 obj\n"));
  check("and object 7 is still the checkbox, not the drawing operators that spell its header",
    form.fields.get("agi-marked").dict.includes("/T(agi-marked)"));

  eq("the AcroForm is reached through the Catalog rather than searched for", form.acroForm.obj, 3);
  eq("and the trailer's own numbers come back for the update to chain onto",
    [form.root, form.size, form.prevStartxref], [1, FORM.size, FORM.xrefAt]);
}

group("What readForm refuses, beside the near-identical file it doesn't");
{
  // The positive control first, and it is the point of the group: every refusal below is one
  // object or one key away from this file, so "it throws" only means something next to "and
  // this, which is almost the same, does not".
  eq("the fixture parses, with all four of its fields", readForm(FORM.bytes).fields.size, 4);

  const objStm = formFailure(() => readForm(buildFormPdf({
    extra: ["<</Type/ObjStm/N 1/First 4/Length 9>>\nstream\n1 0 <<>>\nendstream"],
  }).bytes));
  has("a compressed object stream is refused by name", [objStm], "/ObjStm");
  has("and the message says which switch in which program to turn off", [objStm], "Master PDF Editor");

  const xrefStream = formFailure(() => readForm(buildFormPdf({
    extra: ["<</Type/XRef/Size 13/W[1 2 1]/Length 4>>\nstream\n\x01\x00\x0a\x00\nendstream"],
  }).bytes));
  has("so is a cross-reference stream, which a classic xref section cannot be appended to",
    [xrefStream], "/Type /XRef");

  // The same object 9 as above, this time LISTED. Unlisted it is litter to ignore; listed it is
  // a question nothing can answer, so it is an error rather than last-one-wins.
  const duplicate = formFailure(() => readForm(buildFormPdf({ fields: "5 0 R 6 0 R 7 0 R 8 0 R 9 0 R" }).bytes));
  has("two LIVE fields with one name is an error", [duplicate], 'both called "name"');
  has("and the message names both objects, so the template can be fixed", [duplicate], "objects 5 and 9");

  const noTrailer = formFailure(() => readForm(
    Uint8Array.from(FORM.text.slice(0, FORM.text.indexOf("trailer")), (c) => c.charCodeAt(0)),
  ));
  has("a file with no classic trailer has nothing to append an update to", [noTrailer], "trailer");

  const noAcroForm = formFailure(() => readForm(buildFormPdf({ acroForm: "" }).bytes));
  has("a Catalog with no /AcroForm is a PDF with no form to fill", [noAcroForm], "no /AcroForm");

  // A real encrypted file names /Encrypt in its trailer; the fixture puts those bytes in an
  // object instead, because the check is deliberately over-broad and that breadth IS the
  // behaviour — refusing a file we might mangle is cheaper than shipping one full of mojibake.
  has("a plaintext value written into an encrypted file would be ciphertext's problem, so /Encrypt is refused",
    [formFailure(() => readForm(buildFormPdf({ extra: ["<</Encrypt 14 0 R>>"] }).bytes))], "/Encrypt");
  eq("while a file carrying the same security handler's other keys is left alone",
    formFailure(() => readForm(buildFormPdf({ extra: ["<</Filter/Standard/V 2/R 3>>"] }).bytes)), "");

  has("and something that isn't a PDF at all says so first",
    [formFailure(() => readForm(Uint8Array.from("not a pdf", (c) => c.charCodeAt(0))))], "isn't a PDF");
}

// Byte n of the file is character n of this string, so every index below is a byte offset — the
// same representation "The bytes of a document" asserts in, and the same discipline: nothing
// here diffs against a golden file. Every offset is re-derived FROM the output and checked
// against what is actually at it, because the failure being guarded against is an entry one byte
// out, which leaves a file that opens blank rather than one that fails.
const formText = (out) => Array.from(out, (b) => String.fromCharCode(b)).join("");

// The LAST xref section of a file, walked as bytes: the subsection headers say how many entries
// follow, and each entry is assumed to be 20 bytes. If it isn't, `endAt` desynchronises and
// lands somewhere that is not "trailer" — which is exactly what the check below asserts it does
// not do.
function lastXrefSection(text) {
  const startxrefAt = text.lastIndexOf("startxref");
  const at = Number(/^[\0\t\n\f\r ]*(\d+)/.exec(text.slice(startxrefAt + "startxref".length))[1]);
  const entries = [];
  let i = at + "xref\r\n".length;
  for (;;) {
    if (text.startsWith("trailer", i)) break;
    const eol = text.indexOf("\r\n", i);
    if (eol < 0) break;
    const [first, count] = text.slice(i, eol).split(" ").map(Number);
    if (!Number.isInteger(first) || !Number.isInteger(count) || count < 1) break;
    i = eol + 2;
    for (let k = 0; k < count; k++) {
      entries.push({ obj: first + k, raw: text.slice(i, i + 20) });
      i += 20;
    }
  }
  return { at, entries, endAt: i, trailer: text.slice(i, text.indexOf("%%EOF", i)) };
}

// The body of object N as the file's LAST definition of it — which in an incrementally-updated
// file is the one that counts.
const formObject = (text, num) => {
  const at = text.lastIndexOf(`\n${num} 0 obj`);
  return text.slice(at, text.indexOf("endobj", at));
};

group("Filling a form appends to the template and never rewrites it");
{
  const values = { name: "Fáelán", "agi-marked": true };
  const filled = fillForm(FORM.bytes, values);
  const text = formText(filled);

  check("the template's own bytes come first, every one of them unchanged",
    filled.length > FORM.bytes.length && FORM.bytes.every((b, i) => filled[i] === b));

  const xref = lastXrefSection(text);
  check("the update's xref sits after the template's, rather than on top of it", xref.at > FORM.xrefAt);
  // 3 and 5 are the two fields, 7 is the AcroForm; 13 is the WinAnsi font this module adds so the
  // viewer has one whose encoding it can trust. Numeric order, never the caller's.
  eq("only the objects whose value changed are rewritten, plus the font, in numeric order",
    xref.entries.map((e) => e.obj), [3, 5, 7, 13]);
  check("every entry is %010d SP %05d SP n CR LF",
    xref.entries.every((e) => /^\d{10} 00000 n\r\n$/.test(e.raw)));
  // A reader is entitled to seek straight to entry k at (section start + 20k). The walk above
  // steps 20 bytes per entry, so landing exactly on "trailer" is the arithmetic proving it.
  check("and the section ends exactly where the trailer begins, which is only true if each was 20 bytes",
    text.startsWith("trailer", xref.endAt));
  // The check that catches an off-by-one anywhere in the writer.
  const misplaced = xref.entries.filter((e) => !text.startsWith(`${e.obj} 0 obj\r\n`, Number(e.raw.slice(0, 10))));
  eq("every offset lands exactly on its own \"N 0 obj\"", misplaced.map((e) => e.obj), []);

  check("the trailer chains back to the template's table with /Prev, so nothing we didn't rewrite disappears",
    xref.trailer.includes(`/Prev ${FORM.xrefAt}`));
  // /Size is one past the highest object number, and the added font IS a higher object number, so
  // an unchanged /Size here would put the font above the ceiling and a reader would ignore it —
  // leaving every field pointing at a font that, as far as the file is concerned, isn't there.
  check("/Size grew to cover the font the update added",
    xref.trailer.includes(`/Size ${FORM.size + 1}`));
  check("and the Catalog is still the one the template named", xref.trailer.includes("/Root 1 0 R"));
  check("with /Info and /ID copied rather than invented — a fresh /ID is the usual reason two identical exports diff",
    xref.trailer.includes("/Info 12 0 R") && xref.trailer.includes("/ID[<0102030405060708090A0B0C0D0E0F10>"));

  const nameObject = formObject(text, 5);
  // Matched rather than searched for, so an implementation that wrote a literal (Fáelán) string
  // reports what it wrote instead of throwing on a null match somewhere in this file.
  eq("an accented value goes out as UTF-16BE hex, the form the template already uses",
    (/\/V(<[0-9A-F]+>)/.exec(nameObject) || [])[1], "<FEFF004600E10065006C00E1006E>");
  // Every dictionary this fill copies is pure ASCII in the fixture, so any byte above 0x7F in
  // the appended region would have to be one fillForm composed — which is what a value run
  // through TextEncoder looks like: "á" as 0xC3 0xA1.
  check("and nothing in the appended update is a byte UTF-8 would have written for it",
    filled.slice(FORM.bytes.length).every((b) => b <= 0x7f));

  eq("the value the template shipped with is replaced, not joined by a second /V",
    (nameObject.match(/\/V[<(]/g) || []).length, 1);
  check("so nothing in the file still says \"Old Name\" at the offset a reader will look at",
    !nameObject.includes("Old Name"));

  const button = formObject(text, 7);
  check("a ticked box gets BOTH /V and /AS — /V alone reads as ticked to a script and blank to a human",
    button.includes("/V/Yes") && button.includes("/AS/Yes"));
  eq("and exactly one /AS, because the template already had one to drop",
    (button.match(/\/AS/g) || []).length, 1);

  check("two runs of the same fill are the same bytes",
    (() => { const b = fillForm(FORM.bytes, values); return b.length === filled.length && b.every((v, i) => v === filled[i]); })());
  check("and so is the same fill written in the other order, because the objects are sorted rather than followed",
    (() => {
      const b = fillForm(FORM.bytes, { "agi-marked": true, name: "Fáelán" });
      return b.length === filled.length && b.every((v, i) => v === filled[i]);
    })());
}

group("What one value at a time does to the file");
{
  // /AS names one of the appearance states this widget actually has. Object 8's are /Off and
  // /On, in that order, so both "assume /Yes" and "take the first substate" tick nothing at all
  // — and neither reports an error.
  const on = formObject(formText(fillForm(FORM.bytes, { "str-marked": true })), 8);
  check("the on-state is read from /AP/N rather than assumed to be /Yes",
    on.includes("/V/On") && on.includes("/AS/On"));
  check("and the state this widget hasn't got is nowhere in it", !on.includes("/Yes"));

  // What a sheet actually says about an unmarked trait, and it is not the same as saying nothing.
  const off = formObject(formText(fillForm(FORM.bytes, { "agi-marked": false })), 7);
  check("false writes /Off explicitly", off.includes("/V/Off") && off.includes("/AS/Off"));

  // "" means "leave the box as the template drew it" — a character with no secondary weapon gets
  // a blank line rather than a field asserting emptiness.
  const blank = lastXrefSection(formText(fillForm(FORM.bytes, { name: "", pronouns: null, "agi-marked": undefined })));
  eq("an empty, null or undefined value rewrites nothing but the AcroForm",
    blank.entries.map((e) => e.obj), [3]);
  // /NeedAppearances is the request that the READER lay the values out, and it is set either way
  // round — false exactly when there is a drawing of ours to look at. Both halves are asserted
  // here because the flag and the /AP have to move together: true beside our own /AP makes a
  // reader regenerate over the top of it, and false beside no /AP at all draws NOTHING in Firefox
  // (`_getAppearance` returns null at pdf.worker.mjs:54101), which is a blank field with no error.
  check("with appearances off the AcroForm still asks the reader to draw the values",
    formObject(formText(fillForm(FORM.bytes, { name: "x" })), 3).includes("/NeedAppearances true"));
  check("and with them on it stops asking, because we drew them",
    formObject(formText(fillForm(FORM.bytes, { name: "x" }, { appearances: true })), 3)
      .includes("/NeedAppearances false"));
  // A fill of nothing but ticks draws nothing, so the request stands — the flag follows the
  // DRAWING, not the option.
  check("while a fill of nothing but ticks keeps asking even with appearances on, since nothing was drawn",
    formObject(formText(fillForm(FORM.bytes, { "agi-marked": true }, { appearances: true })), 3)
      .includes("/NeedAppearances true"));

  // The verbatim-copy path, which is not a second asciiBytes(): 0xEE came out of the template a
  // moment ago and goes back unchanged. A re-encode would put 0xC3 0xAE there instead.
  const accented = fillForm(FORM.bytes, { pronouns: "she/her" });
  const copied = accented.slice(FORM.bytes.length);
  check("a template byte above 0x7F inside a field we rewrite is copied through, not re-encoded",
    formObject(formText(accented), 6).includes("pla\xeet") && copied.includes(0xee) && !copied.includes(0xc3));

  const unknown = formFailure(() => fillForm(FORM.bytes, { "hp-slots": "6" }));
  has("a field name the template hasn't got stops the export rather than dropping a line quietly",
    [unknown], '"hp-slots"');
  has("and the message lists what it does have, so the typo can be found", [unknown], "pronouns");

  // Handing fillForm a readForm() result as its second argument is the mistake the signature
  // invites, and "the template has no field called fields" sends the reader to the wrong file.
  has("a readForm() result passed where the values go is named for what it is",
    [formFailure(() => fillForm(FORM.bytes, readForm(FORM.bytes)))], "second argument");
}

group("The appearance a filled text field shipped with is replaced; a ticked box keeps its own");
{
  // The half of this module that no rendering check would ever catch, which is why it is pinned
  // here rather than left to a look at the export. A template's text widget ships with an /AP
  // drawing an EMPTY box — 12 FlateDecode bytes inflating to `q\nQ\n`, identical in all 71 of them
  // — and a viewer that trusts a present /AP over /NeedAppearances draws that emptiness: the file
  // is correct and the page is blank. Measured, not reasoned about — pixels differing from the
  // empty template at -dPrinted=true -r100: keeping the stale /AP left ghostscript at 39, which is
  // a blank sheet, where dropping it prints 4119 and drawing our own prints 4089. Poppler drew the
  // values either way, so the screen said it worked, and so would a screenshot of it.
  //
  // THE RULE IS "EXACTLY ONE /AP", NOT "NO /AP", and it always was: `["V", "AP", "DA"]` stays in
  // the drop list in both modes and the ADDITIONS differ. Leaving "AP" out when we add one of our
  // own would leave the widget carrying two /AP keys, and ghostscript takes the FIRST — the
  // template's `q\nQ\n` — so every filled field would print blank, with no fallback and nothing on
  // the page to say so. This group fills with appearances ON, which makes the four checkbox
  // assertions below a second fact: they are unedited, and they still pass, because not one line
  // of the /Btn branch changed when the /Tx branch learned to draw.
  const filled = fillForm(FORM.bytes,
    { name: "Fáelán", "agi-marked": true, "str-marked": true }, { appearances: true });
  const text = formText(filled);

  // The positive control, and the group is worth nothing without it: the widget HAS an /AP to
  // replace, so what is asserted below is a fact about what fillForm wrote and not about a key
  // that was never in this fixture.
  check("the template's text widget really does carry an /AP to lose",
    readForm(FORM.bytes).fields.get("name").dict.includes("/AP<</N 10 0 R>>"));
  const rewritten = formObject(text, 5);
  eq("and the rewritten field carries exactly one — not two, not an emptied one, not a nulled one",
    (rewritten.match(/\/AP/g) || []).length, 1);
  const drawing = Number((/\/AP<<\/N (\d+) 0 R>>/.exec(rewritten) || [])[1]);
  check("which points at a FRESH object rather than back at the template's shared one",
    Number.isInteger(drawing) && drawing !== 10);
  check("and that object is really in the file, as a form XObject with a stream in it",
    formObject(text, drawing).includes("/Subtype/Form") && formObject(text, drawing).includes("stream"));
  check("while the value it was rewritten for is in it, so the field wasn't simply left alone",
    rewritten.includes("/V<FEFF"));
  // With appearances off the same field carries none at all, which is the other half of the same
  // rule and the mode everything falls back to.
  eq("and with appearances off it carries none, which is what /NeedAppearances is then for",
    (formObject(formText(fillForm(FORM.bytes, { name: "Fáelán" })), 5).match(/\/AP/g) || []).length, 0);

  // The other half, one edit away from the first: "strip /AP from every widget" passes everything
  // above and unticks every box. A checkbox's /AP is its two REAL appearances, and /AS is the key
  // that picks between them — delete it and /NeedAppearances has nothing to draw a tick from.
  const button = formObject(text, 7);
  check("a ticked box keeps the /AP its two states live in",
    button.includes("/AP<</N<</Yes 10 0 R/Off 10 0 R>>>>"));
  check("and /AS names the one of them that means ticked", button.includes("/AS/Yes"));

  // The same again where the on-state isn't /Yes, because "keeps its /AP" and "points /AS at a
  // state that exists" are one fact: the states are inside the /AP.
  const other = formObject(text, 8);
  check("a box whose states are /Off and /On keeps both of them",
    other.includes("/AP<</N<</Off 10 0 R/On 10 0 R>>>>"));
  check("and is ticked by the name it actually has, not by the usual one",
    other.includes("/AS/On") && !other.includes("/Yes"));
}

// The template's /Helvetica carries a /Differences array remapping WinAnsi 145-160 — 149 becomes
// /Lslash where WinAnsi says bullet, 151 becomes /Scaron where it says emdash. Chrome honours that
// and draws a quote for a bullet; poppler resolves by Unicode and draws the bullet. Across data/
// that is 21 bullets, 7 curly apostrophes, 4 em dashes and 2 en dashes — plus armor-name, which IS
// the em dash for a character with nothing equipped.
//
// So this module ADDS a font rather than correcting theirs. Correcting theirs would be a patch
// shaped like one editor's bug; adding one depends on nothing any editor wrote.
group("A font whose encoding we control, added rather than substituted");
{
  const filled = fillForm(FORM.bytes, { name: "x" });
  const text = formText(filled);
  const added = /(\d+) 0 obj\r\n(<<\/Type\/Font[^>]*>>)/.exec(text.slice(FORM.bytes.length));

  check("the update carries a font object of its own", !!added);
  eq("a base-14 Helvetica declaring WinAnsiEncoding, and no /Differences to argue with",
    added[2], "<</Type/Font/Subtype/Type1/BaseFont/Helvetica/Encoding/WinAnsiEncoding>>");

  const acro = readForm(filled).acroForm.dict;
  check("it is reachable from the AcroForm's /DR, which is where a viewer looks it up",
    acro.includes(`/DhHelv ${added[1]} 0 R`));
  // The point of adding rather than correcting: their fonts are still exactly as authored.
  // The whole point of adding rather than correcting: their font entry is untouched, and the
  // broken /Differences it points at is still exactly as the editor wrote it. We simply stopped
  // naming it.
  check("the template's own font entry is still in /DR, unchanged",
    acro.includes("/Helvetica 11 0 R"));
  check("and the object it points at still carries the /Differences we refused to rewrite",
    readForm(filled).fields.size > 0
      && formText(filled).includes("/Differences[149/Lslash 150/OE 151/Scaron]"));

  const field = readForm(filled).fields.get("name").dict;
  check("the filled field's /DA names our font", /\/DA\(\/DhHelv /.test(field));
  check("and keeps the 0 Tf the template chose, which is what asks the viewer to fit the box",
    /\/DA\(\/DhHelv 0 Tf/.test(field));

  // A sheet of nothing but ticked boxes needs no font: checkboxes draw from their own prebuilt
  // appearance states in ZapfDingbats, which this module never touches.
  const ticksOnly = formText(fillForm(FORM.bytes, { "agi-marked": true }));
  check("a fill that writes no text adds no font",
    !/<<\/Type\/Font/.test(ticksOnly.slice(FORM.bytes.length)));
  // The positive control for that: the same fixture WITH text does add one, so the absence above
  // is the rule firing rather than the search string being wrong.
  check("while the same template with one string in it does",
    /<<\/Type\/Font/.test(text.slice(FORM.bytes.length)));
}

group("A field nobody filled keeps every byte the template gave it");
{
  // "" means "leave the box as the template drew it" — and the template drew it with the /AP the
  // group above deletes. Both rules are true at once, and a fix stated as "this module removes
  // /AP" rather than "this module removes the /AP of a field it writes a value into" would blank
  // the very fields we deliberately leave alone.
  const one = fillForm(FORM.bytes, { name: "x" });
  const text = formText(one);
  eq("only the field we filled, the AcroForm and the added font are rewritten at all",
    lastXrefSection(text).entries.map((e) => e.obj), [3, 5, 13]);
  check("so the untouched field's last definition in the file is still the template's own",
    text.lastIndexOf("\n6 0 obj") < FORM.bytes.length);
  check("and it still carries the appearance stream the template drew it with",
    readForm(one).fields.get("pronouns").dict.includes("/AP<</N 10 0 R>>"));
  // The positive control for the search string above: /AP is a key this same fill really does
  // remove, one field over.
  check("which means something, because the field beside it lost exactly that key",
    !readForm(one).fields.get("name").dict.includes("/AP"));
}

group("The update reads back, which is the only proof it is really in the file");
{
  // Everything above asserts what fillForm wrote. This asserts that a reader — the other side —
  // finds it: the appended object has to be at an offset the xref names, on a line of its own,
  // and later than the template's own copy.
  const once = readForm(fillForm(FORM.bytes, { name: "Second" }));
  check("readForm finds the appended value rather than the template's original",
    once.fields.get("name").dict.includes("<FEFF005300650063006F006E0064>"));
  check("and nothing else about the template moved", once.fields.size === 4 && once.root === 1);

  const twice = readForm(fillForm(fillForm(FORM.bytes, { name: "First" }), { name: "Second" }));
  check("filling a filled form supersedes the first value rather than resurrecting it",
    twice.fields.get("name").dict.includes("<FEFF005300650063006F006E0064>"));
  eq("and the AcroForm still carries exactly one /NeedAppearances, because the old one is dropped first",
    (twice.acroForm.dict.match(/\/NeedAppearances/g) || []).length, 1);

  // Master PDF Editor ends its files with a newline. A template that doesn't would otherwise get
  // "1 0 obj" glued onto "%%EOF" — an offset that is still arithmetically right, pointing at a
  // header no line-anchored scanner will ever see.
  const flush = buildFormPdf({ tail: "%%EOF" });
  check("the fixture really does end flush against %%EOF", flush.text.endsWith("%%EOF"));
  check("and an update to it still starts a line, so the appended object is findable",
    readForm(fillForm(flush.bytes, { name: "Second" })).fields.get("name").dict.includes("<FEFF005300650063006F006E0064>"));
}

// Sixteen bytes that are not text, in the other spelling a /ID is allowed: literal strings rather
// than hex. Six of them are above 0x7F, which is the whole point of the fixture — a file
// identifier is 16 random bytes, so a real one written this way almost certainly has some. No
// parenthesis, backslash or newline among them, because those would be a test of the fixture's
// escaping rather than of what fillForm does with the bytes.
const WILD_ID_BYTES = [0x8b, 0x01, 0x51, 0xf4, 0x2c, 0xd9, 0x77, 0xa0, 0x10, 0xbe, 0x3f, 0x1c, 0xe7, 0x55, 0x82, 0x7e];
const WILD_ID = `[(${String.fromCharCode(...WILD_ID_BYTES)})(${String.fromCharCode(...[...WILD_ID_BYTES].reverse())})]`;

group("A file identifier is quoted back out of the template, never composed");
{
  const wild = buildFormPdf({ id: WILD_ID });
  // The positive control: the same assertions against a hex /ID would pass through any writer at
  // all, since hex is ASCII and every path can carry it.
  check("the fixture's identifier really is literal strings holding bytes no ASCII writer would pass",
    WILD_ID.includes("(") && WILD_ID_BYTES.some((b) => b > 0x7f));

  // The failure mode here is not a wrong file, it is no file: composing the trailer with
  // asciiBytes() throws on the first byte above 0x7F, blaming pdf.js for an encoding it was right
  // to refuse, and the export stops on a template that is perfectly legal.
  let filled = null;
  eq("filling it raises no encoding error at all",
    formFailure(() => { filled = fillForm(wild.bytes, { name: "Fáelán" }); }), "");

  // Every check below reads those bytes, and they are EMPTY rather than absent when the fill
  // threw — so each one fails on its own terms instead of a second copy of the same exception
  // taking the whole run down before anything is reported.
  const out = filled || new Uint8Array();
  const text = formText(out);
  const copiedAt = text.lastIndexOf(WILD_ID);
  check("the identifier is in the update's trailer, byte for byte and in the appended half of the file",
    copiedAt > wild.bytes.length);
  eq("and once there, not twice, because the trailer states it once", (text.split(WILD_ID).length - 1), 2);

  // The other failure mode, and the one that leaves a file rather than an exception: a value run
  // through TextEncoder writes two bytes wherever the template had one, which is still a /ID and
  // still opens — it is just no longer the same document identifier, so the same character
  // exported twice diffs.
  const appendedTrailer = text.slice(text.lastIndexOf("trailer"));
  eq("and the trailer holding it has exactly as many bytes above 0x7F as the identifier does, so nothing was re-encoded on the way",
    [...appendedTrailer].filter((c) => c.charCodeAt(0) > 0x7f).length,
    WILD_ID_BYTES.filter((b) => b > 0x7f).length * 2);
  eq("and /Info beside it, likewise copied rather than invented",
    (text.slice(wild.bytes.length).match(/\/Info 12 0 R/g) || []).length, 1);

  // A reader has to be able to walk the result, which the byte counting above doesn't prove:
  // an identifier one byte short would still satisfy every count and leave the trailer unparseable.
  check("the filled file still reads back as a form",
    !!filled && readForm(filled).fields.get("name").dict.includes("/V<FEFF"));

  // Neither key is required, and a template that names neither must not acquire one: /ID is
  // supposed to be stable for the life of a document, so inventing one is a claim about identity
  // this module has no business making.
  const plain = buildFormPdf({ info: null, id: null });
  const trailer = formText(fillForm(plain.bytes, { name: "x" })).split("trailer").pop();
  check("a template that names neither gets neither invented for it",
    !trailer.includes("/ID") && !trailer.includes("/Info"));
  check("and is still a file, with the /Prev that makes the update an update",
    trailer.includes(`/Prev ${plain.xrefAt}`));
}

// ---------- drawing the sheet's text ourselves ----------
//
// shared/winansi.js and shared/pdf-text.js are the two pure modules under the appearance streams
// shared/pdf-form.js now writes. They exist because the alternative — /NeedAppearances true, which
// formally asks the READER to lay the values out — was answered four ways by four readers, and one
// of them answered it by dropping 341 of the 1430 characters in `class-features` on printed paper,
// silently. Firefox's shipped pdf.worker.mjs:54240 sizes a block so that `chunks × fontSize ≤
// height` and then renders it at `height / numberOfLines ≈ 1.35 × fontSize`, so the block overflows
// the field and the /AP's own /BBox clips the tail.
//
// Widths, encoding, wrapping, fitting and operators are strings in and strings out — no PDF, no
// DOM, no renderer — which is the whole reason a layout that four readers disagreed about is
// checkable in a runner with none of them in it. The two groups that DO open a file are the ones
// where those strings become objects, a /Length and an xref section, and they fill the fixture
// below rather than the real template: data/sheet is a symlink into a private repo, so it is absent
// in CI and in any clone.

// Four more widgets for that fixture, carrying the four shapes the real template has that the four
// standard fields haven't. Every one of them decides something about the drawing, and every one is
// a place a wrong implementation fails quietly rather than loudly:
//
//   /Q 2          three of the template's fields are right-aligned, and /Q decides the x of every
//                 line — the difference between a number in its box and one off the edge.
//   /Ff 4096      bit 13, multiline, set on 16 of the template's 71 text fields. It is the ONLY
//                 branch the reader bug lives in; the single-line branch is closed-form.
//   1 1 1 rg      `name-pg2` is white on a banner measured at RGB(61,61,63), and carries the same
//                 string as `name` — so the template gives a free two-colour check on one value.
//   reversed /Rect  §12.5.2 lets a rectangle store its corners in either order, and this template
//                 really does: `hope1` is [41.25 487.5 52.75 477], top-left to bottom-right.
//                 Subtracting in file order gives a NEGATIVE extent, and a form XObject whose
//                 /BBox has one draws NOTHING in either PDFium or MuPDF — no error, no warning, an
//                 empty field. The real one is a checkbox, so nothing draws into it and the trap
//                 is unarmed there; here it is a text field, so it goes off.
//
// They all point their /AP at object 10, like everything else in this fixture, because that is the
// other trap: object 10 is the appearance for both text widgets AND for both states of both
// checkboxes, so an implementation that "updates the /AP the widget already points at" would draw
// one field's text into five places, two of them ticks.
const TRAP_WIDGETS = [
  "<</Type/Annot/Subtype/Widget/FT/Tx/T(proficiency)/P 4 0 R/Rect[500 700 540 720]/Q 2"
    + "/DA(/Helvetica 0 Tf 0 g)/AP<</N 10 0 R>>>>",
  "<</Type/Annot/Subtype/Widget/FT/Tx/T(class-features)/P 4 0 R/Rect[36 400 300 590]/Ff 4096"
    + "/DA(/Helvetica 0 Tf 0 g)/AP<</N 10 0 R>>>>",
  "<</Type/Annot/Subtype/Widget/FT/Tx/T(name-pg2)/P 4 0 R/Rect[36 300 300 320]"
    + "/DA(/Helvetica 0 Tf 1 1 1 rg)/AP<</N 10 0 R>>>>",
  "<</Type/Annot/Subtype/Widget/FT/Tx/T(armor-score)/P 4 0 R/Rect[41.25 487.5 72.75 467.5]"
    + "/DA(/Helvetica 0 Tf 0 g)/AP<</N 10 0 R>>>>",
];
const TRAPS = buildFormPdf({ widgets: TRAP_WIDGETS });

group("The fixture's four appearance traps are really in it");
{
  // The positive control for the whole of the byte-plumbing group below, stated once here: each of
  // those four shapes has to be READ off the widget before it can be honoured, so an assertion
  // that one was honoured means nothing unless the widget really says it.
  const form = readForm(TRAPS.bytes);
  eq("eight live fields now, the original four and the four traps",
    [...form.fields.keys()],
    ["name", "pronouns", "agi-marked", "str-marked", "proficiency", "class-features", "name-pg2", "armor-score"]);
  eq("and they are numbered above everything the assertions above pin",
    ["proficiency", "class-features", "name-pg2", "armor-score"].map((n) => form.fields.get(n).obj),
    [13, 14, 15, 16]);
  eq("one is right-aligned, one is multiline, one is white, and one has its corners the wrong way round",
    ["proficiency", "class-features", "name-pg2", "armor-score"].map((n) => {
      const box = fieldBox(form.fields.get(n).dict, n);
      return [box.quad, box.multiline, box.colour, box.height];
    }),
    [[2, false, "0 g", 20], [0, true, "0 g", 190], [0, false, "1 1 1 rg", 20], [0, false, "0 g", 20]]);
  check("the reversed one really is stored top-left to bottom-right, so normalising it is doing something",
    /\/Rect\[41\.25 487\.5 72\.75 467\.5\]/.test(form.fields.get("armor-score").dict));
  check("and every one of them points its /AP at the object the checkboxes also use",
    ["name", "proficiency", "class-features", "name-pg2", "armor-score"]
      .every((n) => form.fields.get(n).dict.includes("/AP<</N 10 0 R>>"))
      && form.fields.get("agi-marked").dict.includes("/AP<</N<</Yes 10 0 R/Off 10 0 R>>>>"));
  // And the default fixture is untouched by the widening, which is what lets every check above
  // this point stay exactly as it was written.
  eq("while the default fixture still has its original four, and its original object numbers",
    [[...readForm(FORM.bytes).fields.keys()].length, readForm(FORM.bytes).fields.get("name").obj], [4, 5]);
}

group("Helvetica's widths: 224 codes, one sum, and the code that is not a control");
{
  eq("the table covers the whole byte range, so no code can index off the end",
    HELVETICA_WIDTHS.length, 256);
  eq("codes 0-31 are zero, because nothing may draw a control character",
    HELVETICA_WIDTHS.slice(0, 32).filter((w) => w !== 0).length, 0);
  eq("and 32 to 255 is 224 codes, counted rather than assumed", HELVETICA_WIDTHS.slice(32).length, 224);

  // NO HOLES. A missing entry reads as `undefined`, `thousandths += undefined` is NaN, and every
  // comparison the fitter makes against NaN is false — so a hole does not throw, it silently sends
  // one field to the 6pt floor and looks like a layout bug rather than a table bug.
  const holes = [];
  for (let code = 32; code <= 255; code++) {
    if (!Number.isInteger(HELVETICA_WIDTHS[code]) || HELVETICA_WIDTHS[code] <= 0) holes.push(code);
  }
  eq("every one of them has a positive integer width — no holes", holes, []);

  // The three whole-table checks tools/sheet/helvetica-table.py prints on stderr, so a
  // re-derivation of the table is checkable here without anyone reading 256 numbers.
  let sum = 0;
  for (let code = 32; code <= 255; code++) sum += HELVETICA_WIDTHS[code];
  eq("they sum to 120823, which is the whole table in one number", sum, 120823);
  eq("across 28 distinct values", new Set(HELVETICA_WIDTHS.slice(32)).size, 28);
  eq("and \"Hello\" at 11pt measures 25.058pt, which is what PyMuPDF measures for real Helvetica",
    helveticaMeasure(encodeWinAnsi("Hello").codes, 11), 25.058);

  // Ten spot values: a space, a hyphen, a digit, two capitals of very different widths, the
  // narrowest and one of the widest lowercase letters, and three of the high codes.
  eq("ten spot values, read off the table by hand",
    [32, 45, 48, 65, 87, 105, 109, 0x80, 0x85, 0xa0].map((c) => HELVETICA_WIDTHS[c]),
    [278, 333, 556, 667, 944, 222, 833, 556, 1000, 278]);

  // THE TRAP. WinAnsi is neither Latin-1 nor cp1252: it fills DEL and cp1252's five holes (0x81
  // 0x8D 0x8F 0x90 0x9D) with /bullet. A table that zeroed "the control range" would mis-measure
  // every line holding one, and the error runs the dangerous way — a line measured narrower than
  // it draws fits a box it then overflows, which is this feature's own defect with our name on it.
  eq("code 127 is /bullet at 350, not a control at 0", HELVETICA_WIDTHS[127], 350);
  // The positive control: its neighbours are their own ordinary glyphs, so 350 above is a fill
  // rather than a table that says 350 everywhere.
  eq("while 126 and 128 are their own widths, so that is a fill and not a flat table",
    [HELVETICA_WIDTHS[126], HELVETICA_WIDTHS[128]], [584, 556]);
  eq("and the other five holes carry it too", [0x81, 0x8d, 0x8f, 0x90, 0x9d].map((c) => HELVETICA_WIDTHS[c]),
    [350, 350, 350, 350, 350]);
}

group("Encoding: what WinAnsi draws, what it can't, and what never reaches the file raw");
{
  // Codes come back as a latin1 string — one character per byte — so every assertion below reads
  // them out as numbers rather than trusting a terminal to show the difference between byte 0x97
  // and the character U+0097, which is the confusion the module exists to keep straight.
  const bytes = (codes) => [...codes].map((c) => c.charCodeAt(0));

  // SUBSTITUTED, NOT UNMAPPABLE, and the distinction is what keeps the feature switched on: nine
  // of the 69 SRD 2.0 armors carry U+2212 (Scale Mail, Banded and their improved forms), and
  // `unmappable` is the note that sends the WHOLE DOCUMENT back to reader layout.
  const minus = encodeWinAnsi("\u2212 and \u2011");
  eq("U+2212 MINUS SIGN and U+2011 NON-BREAKING HYPHEN are both drawn as an ASCII hyphen",
    bytes(minus.codes), bytes("- and -"));
  eq("and both are reported, by code point, in first-appearance order, with what they became",
    minus.notes.substituted.map((n) => [n.codePoint, n.replacement, n.count]),
    [[0x2212, "-", 1], [0x2011, "-", 1]]);
  eq("neither counts as unmappable or removed, which are the two notes a caller acts on",
    [minus.notes.unmappable.length, minus.notes.removed.length], [0, 0]);
  eq("and three of the same character is one note with a count, not three notes",
    encodeWinAnsi("\u2212\u2212\u2212").notes.substituted,
    [{ char: "\u2212", codePoint: 0x2212, count: 3, replacement: "-" }]);

  // Walked as CODE POINTS, not code units: an emoji is one thing to report rather than two
  // surrogate halves that mean nothing to whoever reads the message.
  const emoji = encodeWinAnsi("a\u{1f600}b");
  eq("an emoji is unmappable, as ONE note rather than two surrogate halves",
    emoji.notes.unmappable, [{ char: "\u{1f600}", codePoint: 0x1f600, count: 1 }]);
  eq("and nothing of it is left in the bytes", bytes(emoji.codes), bytes("ab"));

  // U+00AD SOFT HYPHEN, with its witness in the shipped data: data/srd_2_0/classes.json's Patron's
  // Pact reads "supernatural entity<AD>—such as", and WinAnsi's BYTE 0xAD is a real /hyphen — so
  // passing the code point straight through prints "entity-—such".
  const soft = encodeWinAnsi("entity\u00ad\u2014such");
  eq("U+00AD is removed rather than drawn as the hyphen its own byte would be",
    bytes(soft.codes), [...bytes("entity"), 0x97, ...bytes("such")]);
  eq("and it is reported as removed, which is a note the user is deliberately NOT shown",
    [soft.notes.removed.map((n) => n.codePoint), soft.notes.unmappable.length], [[0xad], 0]);
  // The positive control: byte 0xAD really is a drawable hyphen, so "removed" is a decision taken
  // about a glyph that exists rather than a character the table had no room for.
  eq("the positive control: WinAnsi 0xAD is a real /hyphen, 333/1000 em wide", HELVETICA_WIDTHS[0xad], 333);

  // U+00A0 runs the other way. It IS a glyph, so it encodes; the wrapper must then not break at it,
  // which the wrapping group below is about.
  eq("U+00A0 NO-BREAK SPACE encodes to byte 0xA0 rather than being removed",
    bytes(encodeWinAnsi("a\u00a0b").codes), [97, 0xa0, 98]);
  eq("and it is a space-width glyph, which is why it costs a line its width",
    HELVETICA_WIDTHS[0xa0], 278);

  eq("a bullet is byte 0x95, and reaches the file as the octal escape \\225",
    [bytes(encodeWinAnsi("•").codes), literalBody(encodeWinAnsi("•").codes)], [[0x95], "\\225"]);
  eq("and featuresText's own bullet, U+00B7 MIDDLE DOT, is byte 0xB7 and \\267",
    [bytes(encodeWinAnsi("·").codes), literalBody(encodeWinAnsi("·").codes)], [[0xb7], "\\267"]);
  eq("the string syntax itself is escaped, so no value can end the literal early",
    literalBody(encodeWinAnsi("a(b)c\\d").codes), "a\\(b\\)c\\\\d");
  eq("every `j` goes out as \\152 and every `/` as \\057, unconditionally",
    [literalBody(encodeWinAnsi("endobj").codes), literalBody(encodeWinAnsi("/ObjStm").codes)],
    ["endob\\152", "\\057Ob\\152Stm"]);

  // Those last two rules, end to end, because they are not tidiness: readForm REFUSES any file
  // containing /ObjStm before it parses a byte of it, and its object scanner finds an object's end
  // with indexOf("endobj"). `class-features`, `appearance` and `connections` are unbounded
  // textareas, so both tokens are one paste away — and the error the user would otherwise get
  // names the TEMPLATE as unreadable, which is wrong and unfixable from where they are standing.
  const risky = fillForm(TRAPS.bytes,
    { name: "endobj", "class-features": "/ObjStm /Encrypt /Type/XRef" }, { appearances: true });
  const riskyText = formText(risky);
  check("the drawing really does carry both tokens — this is what is being escaped",
    riskyText.includes("(endob\\152)") && riskyText.includes("\\057Ob\\152Stm"));
  const appended = riskyText.slice(TRAPS.bytes.length);
  check("and no raw /ObjStm survives in the bytes we appended", !appended.includes("/ObjStm"));
  eq("nor a raw endobj beyond the one that ends each object we wrote",
    (appended.match(/endobj/g) || []).length, lastXrefSection(riskyText).entries.length);
  eq("so the filled file still reads back as a form rather than being refused by name",
    formFailure(() => readForm(risky)), "");
  eq("with every field still on it", readForm(risky).fields.size, readForm(TRAPS.bytes).fields.size);

  // A positive control per rule, and the group is worth nothing without them: undo one escape and
  // the same bytes really are refused, undo the other and an object walk really does stop inside
  // a stream. Both are made from the file that just passed, so nothing else differs.
  const unslashed = Uint8Array.from(riskyText.replace(/\\057Ob\\152Stm/g, "/ObjStm"), (c) => c.charCodeAt(0));
  has("with the `/` escape undone, that same file is refused by name",
    [formFailure(() => readForm(unslashed))], "/ObjStm");
  const apObj = Number((/\/AP<<\/N (\d+) 0 R>>/.exec(formObject(riskyText, 5)) || [])[1]);
  check("and the drawn field's appearance object runs all the way to its own endobj",
    formObject(riskyText, apObj).includes("endstream"));
  check("where with the `j` escape undone the same walk stops inside the stream",
    !formObject(riskyText.replace(/endob\\152/g, "endobj"), apObj).includes("endstream"));
}

group("Wrapping: newlines are structure, and a no-break space is not a break");
{
  // A measurer of exactly ten points to the character, so every break below can be read off the
  // fixture by counting — tests.js:4870's idiom, one layer down. Size is ignored on purpose here:
  // these assertions are about where the breaks land, and the fitting group below is the one that
  // varies the size.
  const measure = (text) => text.length * 10;

  eq("a word wider than the line hard-breaks rather than being pushed to a fresh line forever",
    wrapLines("supercalifragilistic", 100, 10, measure), ["supercalif", "ragilistic"]);
  eq("and the halves rejoin with nothing inserted between them",
    wrapLines("supercalifragilistic", 100, 10, measure).join(""), "supercalifragilistic");
  eq("greedy: as many words as fit, then the next line",
    wrapLines("aaaa bb cccccc dd", 100, 10, measure), ["aaaa bb", "cccccc dd"]);

  // NEWLINES ARE STRUCTURE AND THEY COME FIRST. gear.js:183 joins a weapon's features with "\n",
  // gear.js:149 prefixes each list item with "\n• ", and sheet-fields.js:455 joins two classes'
  // features with "\n\n" — a blank line the reader has to SEE, or the multiclass's features read
  // as more of the first class's.
  eq("a blank line between two paragraphs survives as a blank line",
    wrapLines("aaaa\n\nbbbb", 100, 10, measure), ["aaaa", "", "bbbb"]);
  eq("and wrapping never runs across a newline, however much room the line had",
    wrapLines("aa\nbb", 100, 10, measure), ["aa", "bb"]);
  eq("trailing blank lines are dropped — invisible height is still height, and can cost a point",
    wrapLines("aaaa\n\n\n", 100, 10, measure), ["aaaa"]);
  eq("while a leading one is kept, because it is a line the sheet shows",
    wrapLines("\naaaa", 100, 10, measure), ["", "aaaa"]);
  eq("a run of spaces collapses to one, as it does in card-content.js's wrap",
    wrapLines("aa    bb", 100, 10, measure), ["aa bb"]);

  // U+00A0. card-content.js's wrap() splits on /\s+/, and in a latin1 codes string JavaScript's \s
  // ALSO matches 0xA0 — which is a real /space GLYPH, 278/1000 em wide. Breaking there is the one
  // thing that character exists to forbid, which is why the only break opportunity here is 0x20.
  const nbsp = encodeWinAnsi("aaaaa\u00a0bbbbb").codes;
  eq("a no-break space is not a break opportunity, so the pair hard-breaks instead",
    wrapLines(nbsp, 100, 10, measure).map((line) => [...line].map((c) => c.charCodeAt(0))),
    [[97, 97, 97, 97, 97, 0xa0, 98, 98, 98, 98], [98]]);
  // The positive control: the identical string with an ordinary space in it breaks at the space,
  // so the assertion above is about 0xA0 and not about a wrapper that never breaks.
  eq("the positive control: with an ASCII space there, it breaks at the space",
    wrapLines("aaaaa bbbbb", 100, 10, measure), ["aaaaa", "bbbbb"]);

  // A single-line field has one line, so its newlines become spaces. Every reader does this, and
  // /V keeps the newline either way.
  eq("a newline in a SINGLE-line field collapses to a space rather than losing a word",
    fitLines("aaaa\nbbbb", { width: 102, height: 20, measure }).lines, ["aaaa bbbb"]);
}

group("Fitting: the assertion that stands in for a reader we cannot run");
{
  // Linear in size, one point of advance per character per point of size — every glyph exactly one
  // em wide — so each number below is arithmetic rather than a table lookup. The sweep further
  // down uses the real Helvetica measurer instead, because that is where the invariant has to hold.
  const measure = (codes, size) => codes.length * size;

  // THE PREDICATE, written out from LAYOUT here rather than called out of the module, so that the
  // fitter and this test have to be changed in two places before they can agree wrongly. It is
  // deliberately the BASELINE form and not the tidier block form `lines × LEADING + DESCENT ≤
  // h − 2`: the first baseline sits FIRST_BASELINE (0.905em) below the top inset, not a whole
  // LEADING (1.116em) below it, and only the GAPS between lines cost a leading. The two agree on a
  // tall box; on the sheet's three 16pt-tall multiline boxes the block form is two points
  // conservative, sizing `class-subclass` at 10pt where the approved render draws it at 12. See
  // shared/pdf-text.js's lastBaseline().
  const lastBaseline = (count, size, height) =>
    height - LAYOUT.INSET - LAYOUT.FIRST_BASELINE * size - (count - 1) * LAYOUT.LEADING * size;

  // The assertion itself, and it is read off the OPERATORS rather than off the fit. That is the
  // whole point: the failure being guarded against is the FITTER and the EMITTER disagreeing about
  // the same distance — Firefox sizes with one constant and draws with another — and a predicate
  // that asked the fitter what it had decided could not see that at all. So this parses the Tm
  // lines back out of the finished stream and asks where the text actually is.
  const placements = (ops) => ({
    size: Number(/\/\S+ ([\d.]+) Tf/.exec(ops)[1]),
    at: [...ops.matchAll(/^1 0 0 1 (-?[\d.]+) (-?[\d.]+) Tm /gm)]
      .map((m) => ({ x: Number(m[1]), y: Number(m[2]) })),
  });
  const drawingFits = (value, box) => {
    const laid = textAppearance(value, box);
    const { size, at } = placements(laid.ops);
    const measureOf = box.measure || helveticaMeasure;
    // A blank line emits no operators and still costs a leading step, so the drawn lines are the
    // non-empty ones, in order.
    const shown = laid.lines.filter((line) => line !== "");
    if (shown.length !== at.length) return false;
    return shown.every((line, i) => {
      const width = measureOf(line, size);
      // A descender's room under the last baseline, and every line inside the drawable width and
      // placed so it ends inside it — which is one assertion about the fit and one about /Q.
      if (at[i].y - LAYOUT.DESCENT * size < 0) return false;
      if (width > box.width - 2 * LAYOUT.INSET) return false;
      if (at[i].x < 0 || at[i].x + width > box.width - LAYOUT.INSET + 1e-9) return false;
      // The TOP is checked on the single-line branch only, and deliberately: what 1.156 buys there
      // is that the FONT's whole bbox fits (Adobe Helvetica's is [-166 -225 1000 931]), so no glyph
      // of any value can reach the edge. Multiline's first baseline is Chrome's h − 1 − 0.905s,
      // which puts the bbox top a hair ABOVE the clip on purpose — 0.31pt at 12pt, and only for a
      // glyph that reaches the full bbox top. shared/pdf-text.js's header says so and the reference
      // render was approved with it.
      return box.multiline || at[i].y + 0.931 * size <= box.height;
    });
  };

  // Every box SHAPE on the sheet — a stat circle, the name banner, a 16pt multiline row, the
  // prose block, the inventory list and a narrow column — crossed with values that push the fit in
  // different directions. The values are literals rather than catalogue text on purpose: data/ is
  // user-installable (sources.local.json can say ["void"], which is 24 classes rather than 15), so
  // a pinned size would go red on an SRD update with a message blaming the fitter for a change in
  // the words. This asserts the INVARIANT, which is the thing a reader would have told us.
  const boxes = [
    { what: "a stat circle", width: 30, height: 30 },
    { what: "the name banner", width: 264, height: 20 },
    { what: "a 16pt multiline row", width: 160, height: 16, multiline: true },
    { what: "the class-features block", width: 276, height: 196, multiline: true },
    { what: "the inventory list", width: 296.5, height: 91.2, multiline: true },
    { what: "a narrow column", width: 40, height: 120, multiline: true },
  ];
  const values = [
    "4", "13", "+2", "—",
    "Fáelán of the Wildering Reach",
    "Unstoppable\n\nFrontline Tank",
    "· Clear a Hit Point.\n· Clear an Armor Slot.",
    // Escaped, never literal: a minus sign, a non-breaking hyphen and a no-break space all look
    // like something else in an editor, and a fixture whose point is a character you cannot see is
    // one bad paste from a test that stopped testing anything.
    "Beastform’s ranges — nature’s own \u2212 1 \u2011 to \u2011 1\u00a0\u00a0 spacing • and a bullet",
    "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    ("You mark 1 fewer Stress. When you succeed on a roll with Hope, you may spend it. ").repeat(6),
  ];
  const broken = [];
  const drewNothing = [];
  for (const box of boxes) {
    for (const value of values) {
      const where = `${box.what}: ${JSON.stringify(value.slice(0, 24))}`;
      if (!drawingFits(value, box)) broken.push(where);
      // The sizes are deliberately not pinned, but "it drew something" is not a size, and without
      // it an empty `broken` would also be what a fitter that returned no lines at all produced.
      if (!placements(textAppearance(value, box).ops).at.length) drewNothing.push(where);
    }
  }
  eq("every line the emitter places is inside its box, under a baseline the fitter left room beneath",
    broken, []);
  // The control on the loop itself: an empty `broken` proves nothing unless the sweep ran and every
  // field in it came back with text on it. An off-by-one in a sweep reads exactly like a clean bill
  // of health.
  eq("and the sweep really did lay out 60 fields, none of them blank",
    [boxes.length * values.length, drewNothing], [60, []]);

  // FIREFOX'S BUG, ENCODED AS A TEST. pdf.worker.mjs:54240 accepts a size when `chunks × fontSize ≤
  // height` and then renders the block at `height / numberOfLines ≈ 1.35 × fontSize`, so what it
  // draws is about 35% taller than what it measured, runs out of the bottom of the field, and is
  // clipped by the /AP's own /BBox. No error, no ellipsis, no scrollbar: 341 characters simply not
  // on the paper.
  //
  // The value carries its own newlines so that the LINE COUNT is the same at every size and the
  // two rules are being compared on the vertical question alone — a value that wrapped would let
  // the width term decide it, and the case would prove nothing about the leading.
  const firefoxAccepts = (lines, size, height) => lines * size <= height; // their rule, verbatim
  const ffBox = { width: 102, height: 50, multiline: true, measure };
  const ff = fitLines("a\nb\nc\nd", ffBox);
  eq("four lines at any size, which is what makes this a test of the leading and nothing else",
    ff.lines.length, 4);
  check("Firefox's own rule accepts 12pt here — 4 × 12 ≤ 50 — so this is the bug and not a strawman",
    firefoxAccepts(4, 12, ffBox.height));
  check("and the block it would then draw does NOT fit: the last baseline lands below the box floor",
    lastBaseline(4, 12, ffBox.height) < 0);
  eq("ours refuses 12 and takes the largest size whose laid-out block fits, which is 10.75",
    ff.size, 10.75);
  check("and what it then draws is inside the box", drawingFits("a\nb\nc\nd", ffBox));
  // The boundary, which is what says the fitter is not simply timid: one point more overflows, by
  // six hundredths of a point.
  check("while 11 would not, so 10.75 is the largest that fits and not the first that looked safe",
    lastBaseline(4, 11, ffBox.height) < LAYOUT.DESCENT * 11 && firefoxAccepts(4, 11, ffBox.height));
  // And the quarter-point ladder is what buys that: whole points would have stopped at 10, three
  // quarters of a point smaller, for a box that had the room. 49 − 4.253 × size ≥ 0.207 × size
  // solves to 10.987, and 10.75 is the largest step at or under it.
  eq("the step below the true limit is taken, not the whole point below it",
    Math.floor(10.987 / LAYOUT.SIZE_STEP) * LAYOUT.SIZE_STEP, 10.75);

  // A multiline box on this sheet is sized for a LIST, not for its contents: `inventory-items` is
  // 294.5 × 91.2pt and often holds one short line. Uncapped, this fitter puts a potion name in it
  // at 36pt, which looks like a mistake rather than a character sheet.
  const potion = fitLines("Minor Health Potion", { width: 296.5, height: 91.2, multiline: true });
  eq("a list-sized box holding one short line stops at the 12pt cap, and LAYOUT agrees it is 12",
    [potion.size, LAYOUT.MAX_MULTILINE_SIZE], [12, 12]);
  eq("on one line, so it is the cap that stopped it and not the box", potion.lines.length, 1);
  // The positive control, and the reason the cap is on one branch only: single-line boxes are the
  // stat circles and the name banner, where filling the box IS the design.
  eq("while a single-line box goes well past 12, because filling it is the point",
    fitLines("13", { width: 30, height: 30 }).size, 25);

  // THE 6pt FLOOR. Below it the text stops being readable on paper, so the fitter keeps as many
  // lines as the box holds, ends the last one with a visible ellipsis and REPORTS it. Never clips
  // silently — reproducing the defect with our own arithmetic would be the same page with a
  // different author.
  const overflowing = fitLines("aaaaaaaaaa ".repeat(20), { width: 102, height: 20, multiline: true, measure });
  eq("a value that will not fit even at 6pt is cut at the floor, and LAYOUT agrees the floor is 6",
    [overflowing.size, LAYOUT.MIN_SIZE], [6, 6]);
  check("and reported, which is what lets the caller name the field", overflowing.truncated);
  const lastLine = overflowing.lines[overflowing.lines.length - 1];
  eq("with a visible ellipsis on the last line it did draw — WinAnsi 0x85, /ellipsis",
    lastLine.charCodeAt(lastLine.length - 1), 0x85);
  check("and that line, ellipsis included, still fits the width it was cut to",
    measure(lastLine, LAYOUT.MIN_SIZE) <= 100);
  // The positive control: the same box with a value that fits reports nothing and carries no
  // ellipsis, so `truncated` is a finding rather than a constant.
  const fitting = fitLines("aaaa", { width: 102, height: 20, multiline: true, measure });
  check("while a value that fits is neither cut nor reported",
    !fitting.truncated && !fitting.lines.join("").includes("\u0085"));

  // A reversed /Rect reaches shared/pdf-text.js normalised, and this is the assertion that says so
  // out loud: a box with no room in it is refused by name rather than laid out into nothing.
  has("a box with no room to draw in is refused rather than quietly producing an empty field",
    [formFailure(() => fitLines("x", { width: 1, height: 20 }))], "box.width");
}

group("Operators: the exact stream, one line at a time");
{
  // Same one-em measurer, so every x below is arithmetic that can be checked by hand: a line of
  // three characters at 17pt is 51 points wide, and nothing else enters into it. Each stream is
  // asserted as ONE exact literal, the way tests.js:4056 does for pdf.js's page operators — a
  // stream is a program, and an assertion on a substring of it is an assertion about a fragment of
  // a program.
  const measure = (codes, size) => codes.length * size;
  const box = { width: 102, height: 20, colour: "0 g", fontName: "DhHelv", measure };

  // Left, /Q 0. The clip is `1 1 (w−2) (h−2) re W n`, the baseline is h/2 − 0.355 × size, and the
  // x is the inset: 1. Size is closed-form — min(h / 1.156, (w − 2) / textWidth) floored — which
  // here is min(17.30, 33.33) = 17.30, floored to the quarter point: 17.25.
  eq("a left-aligned single line, whole",
    textAppearance("abc", box).ops,
    "/Tx BMC\nq\n1 1 100 18 re W n\nBT\n0 g\n/DhHelv 17.25 Tf\n1 0 0 1 1 3.8763 Tm (abc) Tj\nET\nQ\nEMC");

  // Centred, /Q 1. x = (w − textWidth) / 2 = (102 − 51.75) / 2 = 25.125, and it is a per-LINE
  // number: that is why every line is placed with an absolute Tm rather than a Td or a TL/T*.
  eq("a centred one, with the x arithmetic done by hand: (102 − 3 × 17.25) / 2",
    textAppearance("abc", { ...box, quad: 1 }).ops,
    "/Tx BMC\nq\n1 1 100 18 re W n\nBT\n0 g\n/DhHelv 17.25 Tf\n1 0 0 1 25.125 3.8763 Tm (abc) Tj\nET\nQ\nEMC");

  // Right, /Q 2. x = w − 1 − textWidth = 102 − 1 − 51.75 = 49.25.
  eq("and a right-aligned one, at w − 1 − textWidth",
    textAppearance("abc", { ...box, quad: 2 }).ops,
    "/Tx BMC\nq\n1 1 100 18 re W n\nBT\n0 g\n/DhHelv 17.25 Tf\n1 0 0 1 49.25 3.8763 Tm (abc) Tj\nET\nQ\nEMC");
  eq("a /Q the spec does not define is treated as left rather than as a decision",
    textAppearance("abc", { ...box, quad: 7 }).ops, textAppearance("abc", box).ops);

  // THE COLOUR COMES FROM THE FIELD'S OWN /DA. 68 of the template's 71 text fields end `0 g`, two
  // end `0 0 0 rg`, and one ends `1 1 1 rg` — `name-pg2`, white on a banner measured at RGB(61,
  // 61, 63). It carries the same string as `name`, so the template gives a free two-colour check
  // on one value, and it is the reason the colour is read rather than assumed.
  const white = textAppearance("abc", { ...box, colour: "1 1 1 rg" }).ops;
  eq("a field whose /DA says white draws white",
    white,
    "/Tx BMC\nq\n1 1 100 18 re W n\nBT\n1 1 1 rg\n/DhHelv 17.25 Tf\n1 0 0 1 1 3.8763 Tm (abc) Tj\nET\nQ\nEMC");
  eq("and the same value in a black field differs in exactly one line — the colour",
    white.split("\n").filter((line, i) => line !== textAppearance("abc", box).ops.split("\n")[i]),
    ["1 1 1 rg"]);
  eq("a /DA fragment that is not a colour operator is refused, and black is drawn instead",
    textAppearance("abc", { ...box, colour: "/Helvetica 9 Tf" }).ops, textAppearance("abc", box).ops);

  // Multiline: an absolute Tm per line, a blank line emitting NO operators and still costing a
  // full leading step — which is how "\n\n" survives as a blank line the reader can see. First
  // baseline 60 − 1 − 0.905 × 12 = 48.14, then 1.116 × 12 = 13.392 per step.
  eq("a multiline stream, blank line included, whole",
    textAppearance("abc\n\ndef", { ...box, height: 60, multiline: true }).ops,
    "/Tx BMC\nq\n1 1 100 58 re W n\nBT\n0 g\n/DhHelv 12 Tf\n"
    + "1 0 0 1 1 48.14 Tm (abc) Tj\n1 0 0 1 1 21.356 Tm (def) Tj\nET\nQ\nEMC");
  // The positive control for the step: without the blank line the second baseline is one leading
  // higher, so the gap above really is the blank line costing its height.
  eq("and without the blank line the second line sits one leading higher, which is what it cost",
    textAppearance("abc\ndef", { ...box, height: 60, multiline: true }).ops.split("\n")[7],
    "1 0 0 1 1 34.748 Tm (def) Tj");

  // An empty value never reaches here from a fill — pdf-form.js skips those, so the field keeps
  // the template's own drawing — but the module still has to answer, and a clip with nothing in it
  // is the only answer that cannot draw a stray mark.
  eq("an empty value emits the clip and the font and no text at all",
    textAppearance("", box).ops, "/Tx BMC\nq\n1 1 100 18 re W n\nBT\n0 g\n/DhHelv 17.25 Tf\nET\nQ\nEMC");
  // A font name that cannot be spelled as /name would not match the key in the /AP's own
  // /Resources, and a stream naming a font the resources have not got draws a page of nothing.
  has("a font name that cannot be written as a PDF name is refused rather than repaired",
    [formFailure(() => textAppearance("abc", { ...box, fontName: "Dh Helv" }))], "without escaping");
}

group("Byte plumbing: one stream per drawn field, and the /Length that has to be right");
{
  const values = {
    name: "Fáelán", "name-pg2": "Fáelán", proficiency: "2",
    "class-features": "Unstoppable\n\nFrontline Tank", "armor-score": "4", "agi-marked": true,
  };
  const report = fillFormWithReport(TRAPS.bytes, values, { appearances: true });
  const text = formText(report.bytes);
  eq("a sheet of ordinary values falls back to nothing and truncates nothing",
    [report.fellBack, report.truncated], [null, []]);

  // The five text fields are widgets 5, 13, 14, 15 and 16; the tick is 7 and the AcroForm 3. The
  // font is 17, which is the first number the fixture's own /Size leaves free, and the streams
  // are 18 to 22,
  // ALLOCATED IN WIDGET ORDER so that the same character out of a differently-ordered value map is
  // the same file. Object 10 is the /AP the template points every one of those widgets at, and its
  // ABSENCE here is the assertion: nothing is ever written into an /AP the template already had.
  // In this fixture object 10 backs both text widgets AND both states of both checkboxes, so
  // "update the /AP the widget points at" would draw one field's text into five places, two of
  // them ticks.
  const xref = lastXrefSection(text);
  eq("exactly the objects that changed, plus the font and one stream per drawn field, in numeric order",
    xref.entries.map((e) => e.obj), [3, 5, 7, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22]);
  check("object 10, the appearance every widget in the template points at, is not among them",
    !xref.entries.some((e) => e.obj === 10));
  // The positive control for that: object 10 really is what every one of them points at, so its
  // absence is a fact about what the writer did and not about an object nothing referenced.
  check("the positive control: every filled widget really did point its /AP at object 10",
    ["name", "proficiency", "class-features", "name-pg2", "armor-score"]
      .every((n) => readForm(TRAPS.bytes).fields.get(n).dict.includes("/AP<</N 10 0 R>>")));
  // The offsets have to survive a RUN, which this update is the first thing here ever to write:
  // objects 13 to 22 are consecutive by construction — the four trap widgets, the font and the five
  // streams — so the subsection loop finally goes round its `while`, having never once done so on a
  // template whose own objects are three apart at the closest.
  const headers = [...text.slice(xref.at, xref.endAt).matchAll(/^(\d+ \d+)\r\n/gm)].map((m) => m[1]);
  eq("written as four subsections, the last of them one header and ten entries",
    headers, ["3 1", "5 1", "7 1", "13 10"]);
  const misplaced = xref.entries.filter((e) => !text.startsWith(`${e.obj} 0 obj\r\n`, Number(e.raw.slice(0, 10))));
  eq("and every offset still lands exactly on its own \"N 0 obj\"", misplaced.map((e) => e.obj), []);
  check("the section still ends exactly where the trailer begins", text.startsWith("trailer", xref.endAt));

  // /LENGTH COUNTS WHAT LIES BETWEEN THE NEWLINE THAT ENDS `stream` AND THE ONE THAT BEGINS
  // `endstream`, NEITHER INCLUDED (pdf.js:260-271 is the precedent). Sliced by the /Length the
  // dictionary states rather than by searching for "endstream", so a /Length one byte out lands
  // the slice off the end of the operators and this says so.
  const streamOf = (obj) => {
    const body = Number.isInteger(obj) ? formObject(text, obj) : "";
    const at = body.indexOf("\r\nstream\n");
    // An object with no stream in it comes back with its parts EMPTY rather than as null, so a
    // wrong /AP pointer fails each check below on its own terms — the discipline the /ID group
    // states at :5681, and the reason a run stays reportable when something goes wrong early.
    if (at < 0) return { dict: "", length: NaN, ops: "", tail: "" };
    const dict = body.slice(body.indexOf("<<"), at);
    const from = at + "\r\nstream\n".length;
    const length = Number((/\/Length (\d+)/.exec(dict) || [])[1]);
    return { dict, length, ops: body.slice(from, from + length), tail: body.slice(from + length) };
  };
  const drawn = [18, 19, 20, 21, 22].map(streamOf);
  eq("every appearance object states a /Length that ends exactly on its own \\nendstream",
    drawn.map((s) => s.tail), drawn.map(() => "\nendstream\r\n"));
  eq("and each is the form XObject §12.5.5 needs to map the drawing onto the widget",
    drawn.filter((s) => s.dict.includes("/Type/XObject/Subtype/Form/FormType 1")
      && s.dict.includes("/Matrix[1 0 0 1 0 0]")
      && s.dict.includes("/Resources<</Font<</DhHelv 17 0 R>>>>")).length, 5);

  // The tie between the two modules: the bytes in the file are the bytes shared/pdf-text.js
  // composed for the box shared/pdf-form.js read off the widget. Nothing here re-derives a layout.
  const form = readForm(TRAPS.bytes);
  const streamFor = (field) => {
    const widget = form.fields.get(field);
    const ap = Number((/\/AP<<\/N (\d+) 0 R>>/.exec(formObject(text, widget.obj)) || [])[1]);
    return { drawn: streamOf(ap), want: textAppearance(values[field], { ...fieldBox(widget.dict, field), fontName: "DhHelv" }) };
  };
  const mismatched = ["name", "proficiency", "class-features", "name-pg2", "armor-score"]
    .filter((field) => streamFor(field).drawn.ops !== streamFor(field).want.ops);
  eq("every field's stream in the file is the one pdf-text.js composed for the box pdf-form.js read",
    mismatched, []);

  // The four traps the fixture carries, each read back out of the finished file.
  const prof = streamFor("proficiency").drawn.ops;
  const profBox = { ...fieldBox(form.fields.get("proficiency").dict, "proficiency"), fontName: "DhHelv" };
  check("the /Q 2 field is drawn right-aligned, where the same box at /Q 0 would put it at the inset",
    prof === textAppearance("2", profBox).ops
      && prof !== textAppearance("2", { ...profBox, quad: 0 }).ops);

  // The blank line between the two paragraphs emits NO operators and still costs a full leading
  // step, which is how "\n\n" survives as a blank line the reader can see. Read as the GAP between
  // the two baselines: two steps, not one.
  const features = streamFor("class-features").drawn.ops;
  const featureSize = Number(/\/DhHelv ([\d.]+) Tf/.exec(features)[1]);
  const featureYs = [...features.matchAll(/^1 0 0 1 [\d.]+ ([\d.]+) Tm /gm)].map((m) => Number(m[1]));
  eq("the /Ff 4096 field draws two lines, the blank one between them drawing nothing",
    featureYs.length, 2);
  check("and the blank line still cost its leading step — the gap is two of them, not one",
    Math.abs((featureYs[0] - featureYs[1]) - 2 * LAYOUT.LEADING * featureSize) < 5e-5);
  check("the white /DA reaches the stream as its own colour operator, and the black one does not",
    streamFor("name-pg2").drawn.ops.includes("\n1 1 1 rg\n")
      && streamFor("name").drawn.ops.includes("\n0 g\n"));
  // The reversed /Rect. §12.5.2 allows either corner order and this template really does it
  // (`hope1` is [41.25 487.5 52.75 477]); subtracting in file order gives a NEGATIVE extent, and a
  // form XObject whose /BBox has one draws NOTHING in either PDFium or MuPDF — no error, no
  // warning, an empty field on the page.
  eq("the reversed /Rect is normalised on both axes before it becomes a /BBox",
    rectOf(form.fields.get("armor-score").dict), { x: 41.25, y: 467.5, width: 31.5, height: 20 });
  check("so the /BBox in the file has positive extents rather than the negative one file order gives",
    streamFor("armor-score").drawn.dict.includes("/BBox[0 0 31.5 20]"));

  // Every byte of an appearance stream is COMPOSED, not quoted back, so all of it goes out through
  // asciiBytes() — shared/winansi.js octal-escapes anything above 0x7E on the way in. A high byte
  // here would be a value run through TextEncoder, which writes two bytes where the template had
  // one and shifts every offset after it.
  check("nothing in the appended region is a byte above 0x7F",
    report.bytes.slice(TRAPS.bytes.length).every((b) => b <= 0x7f));
  // The positive control: the values really do contain a character UTF-8 would have used two bytes
  // for, so the check above is the encoding working rather than a fixture with nothing to encode.
  check("the positive control: the values really do carry non-ASCII text",
    [...values.name].some((c) => c.charCodeAt(0) > 0x7f));

  const same = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);
  check("two runs of the same fill are the same bytes",
    same(fillForm(TRAPS.bytes, values, { appearances: true }), report.bytes));
  // Allocation ORDER is the rule this one is about: numbered by widget object, never by the
  // caller's keys, or the same character out of two differently-ordered maps would be two files.
  // Five text fields, so reversing the map really does reorder the allocation.
  check("and so is the same fill written with its keys in the other order",
    same(fillForm(TRAPS.bytes, Object.fromEntries(Object.entries(values).reverse()), { appearances: true }),
      report.bytes));

  // THE FALLBACK IS THE WHOLE DOCUMENT'S. With /NeedAppearances false a field carrying /V and no
  // /AP is laid out by PDFium, MuPDF and ghostscript — but Firefox draws NOTHING for it
  // (`_getAppearance` returns null at pdf.worker.mjs:54101), so a per-field fallback would be one
  // field silently blank in one reader, which is this feature's own defect with our name on it.
  const withEmoji = fillFormWithReport(TRAPS.bytes, { ...values, "class-features": "Beastform \u{1f43a}" },
    { appearances: true });
  const fellBack = withEmoji.fellBack || { reason: null, fields: [] };
  eq("one undrawable character sends the WHOLE document back to reader layout, and says which field",
    [fellBack.reason, fellBack.fields.map((f) => [f.field, f.characters.map((c) => c.codePoint)])],
    ["unmappable", [["class-features", [0x1f43a]]]]);
  check("and the bytes it emits are exactly the bytes appearances-off would have written",
    same(withEmoji.bytes, fillForm(TRAPS.bytes, { ...values, "class-features": "Beastform \u{1f43a}" })));
  check("which is a file with no /AP on the field and the reader asked to draw it",
    formObject(formText(withEmoji.bytes), 3).includes("/NeedAppearances true")
      && !formObject(formText(withEmoji.bytes), 14).includes("/AP"));
}

// ---------- the sheet's fields ----------

// The template's 56 text fields and the 46 checkboxes the sheet answers, spelled the way
// data/sheet/sheet-template.pdf spells them. Written out here rather than read off the module
// under test: this list IS the contract between sheet-fields.js and a PDF nothing in this repo
// can open, and a list derived from the thing it is checking would agree with any rename.
//
// The 42 it does NOT answer are the in-play boxes — 12 armor slots, 12 HP, 12 Stress, 6 Hope.
// Those are resources spent at the table; the app models their maxima and never their state.
const SHEET_TEXT_FIELDS = [
  "name", "pronouns", "heritage", "class-subclass", "multiclass-subclass", "level",
  "agility", "strength", "finesse", "instinct", "presence", "knowledge",
  "agi-spellcast-indicator", "str-spellcast-indicator", "fin-spellcast-indicator",
  "ins-spellcast-indicator", "pre-spellcast-indicator", "kno-spellcast-indicator",
  "evasion", "armor-score", "hp-slots", "stress-slots", "proficiency",
  "damage-threshold-major", "damage-threshold-severe",
  "primary-weapon-name", "primary-trait-range", "primary-damage-and-type", "primary-burden", "primary-feature",
  "secondary-weapon-name", "secondary-trait-range", "secondary-damage-and-type", "secondary-burden", "secondary-feature",
  "armor-name", "armor-base-thresholds", "armor-base-score", "armor-feature",
  "class-hope-feature", "class-features", "inventory-items",
  "experience-name1", "experience-name2", "experience-name3", "experience-name4", "experience-name5",
  "experience-value1", "experience-value2", "experience-value3", "experience-value4", "experience-value5",
  // Page two. `name-pg2` rather than a second `name`: two live fields sharing a /T is a template
  // readForm refuses, because nothing can know which one a value was meant for.
  "name-pg2", "background", "appearance", "connections",
];
// The six trait marks, then the level-up grid: nine rows across three tiers, spelled the way the
// template spells them. A single-box row carries no index — "lu-experience-2", not "-2-1".
const LEVEL_UP_MARKS = [
  ...[2, 3, 4].flatMap((t) => [1, 2, 3].map((i) => `lu-trait-${t}-${i}`)),
  ...[2, 3, 4].flatMap((t) => [1, 2].map((i) => `lu-hp-${t}-${i}`)),
  ...[2, 3, 4].flatMap((t) => [1, 2].map((i) => `lu-stress-${t}-${i}`)),
  ...[2, 3, 4].map((t) => `lu-experience-${t}`),
  ...[2, 3, 4].map((t) => `lu-domain-${t}`),
  ...[2, 3, 4].map((t) => `lu-evasion-${t}`),
  ...[3, 4].map((t) => `lu-subclass-${t}`),
  ...[3, 4].flatMap((t) => [1, 2].map((i) => `lu-proficiency-${t}-${i}`)),
  ...[3, 4].flatMap((t) => [1, 2].map((i) => `lu-multiclass-${t}-${i}`)),
];
const SHEET_MARK_FIELDS = [
  "agi-marked", "str-marked", "fin-marked", "ins-marked", "pre-marked", "kno-marked",
  ...LEVEL_UP_MARKS,
];
const SPELLCAST_INDICATORS = SHEET_TEXT_FIELDS.filter((f) => f.endsWith("-spellcast-indicator"));

// csvChar()'s character plus the two fields deriveSheet reads straight off the record
// (sheet-data.js:334-336). The sheet prints a background and a set of connections and the CSV
// exporter asks for neither, so csvChar() has no reason to carry them and sheetChar() — the
// other fixture that goes through deriveSheet — sets exactly these two for the same reason.
const formChar = (over = {}) => csvChar({
  background: { description: "", answers: "" }, connectionsNotes: "", ...over,
});

// The Guardian of CSV_DB, fully equipped: a weapon with a feature, armor with a feature, and a
// potion. Everything below is this character with one thing changed.
const EQUIPPED = { primaryWeaponId: "longsword", secondaryWeaponId: null, armorId: "gambeson", potionChoice: "potion" };

group("The sheet answers every box it has, including the ones it has nothing to say about");
{
  const f = sheetFieldValues(formChar({ equipment: EQUIPPED }), CSV_DB);

  eq("all 52 text fields come back, and every one of them as a string",
    SHEET_TEXT_FIELDS.filter((k) => typeof f[k] !== "string"), []);
  eq("the six trait marks come back as booleans", SHEET_MARK_FIELDS.filter((k) => typeof f[k] !== "boolean"), []);
  // The other half of the same contract, and the one a typo shows up in: a key the template
  // hasn't got is a value fillForm will throw on, and a renamed field fails silently the other
  // way — the box just prints empty.
  eq("and nothing else at all, so a misspelled key can't ride along unnoticed",
    Object.keys(f).filter((k) => !SHEET_TEXT_FIELDS.includes(k) && !SHEET_MARK_FIELDS.includes(k)), []);
  // The 42 in-play boxes — Hit Point, Stress, Armor and Hope slots — are deliberately unanswered:
  // a ticked HP box means that slot is SPENT, which the app models nowhere on purpose.
  eq("the play-state checkboxes are left for the player's pencil",
    ["hp1", "st1", "as1", "hope1"].filter((k) => k in f), []);
}

group("A single-class character reads off the page as prose");
{
  const f = sheetFieldValues(formChar({ equipment: EQUIPPED }), CSV_DB);

  eq("the heritage line is the community and then the ancestry, in the order it is said out loud",
    f.heritage, "Highborne Clank");
  eq("the class line is the subclass and then the class", f["class-subclass"], "Stalwart Guardian");
  eq("and the second-class box is empty rather than dashed, because nothing is missing from it",
    f["multiclass-subclass"], "");
  eq("a character nobody has named says so, rather than printing an empty line", f.name, "(unnamed)");

  eq("the numbers along the top of the sheet",
    [f.level, f.proficiency, f.evasion, f["armor-score"], f["hp-slots"], f["stress-slots"],
      f["damage-threshold-major"], f["damage-threshold-severe"]],
    ["1", "1", "10", "3", "7", "6", "6", "12"]);
  // Effective traits, not the assignment: Gambeson moves none of these, but Full Plate's -1
  // Agility is the bug printing the raw assignment would reintroduce.
  eq("and the six traits, signed, as they are rolled at the table",
    ["agility", "strength", "finesse", "instinct", "presence", "knowledge"].map((k) => f[k]),
    ["+1", "+2", "0", "+1", "0", "-1"]);
  eq("exactly one Spellcast marker, beside the trait this subclass casts with",
    SPELLCAST_INDICATORS.map((k) => f[k]), ["", "", "", "", "", "*"]);

  eq("the weapon's line leads with the bonus and names the trait after it",
    f["primary-trait-range"], "(+2) Agility | Melee");
  eq("its damage is Proficiency copies of the die, modifier and type included",
    f["primary-damage-and-type"], "1d10+3 Physical");
  eq("with the name, the burden and the feature in boxes of their own",
    [f["primary-weapon-name"], f["primary-burden"], f["primary-feature"]],
    ["Longsword", "Two handed", "Reliable: +1 to attack rolls."]);

  eq("the armor's own printed numbers sit beside the totals they add up to",
    [f["armor-name"], f["armor-base-score"], f["armor-base-thresholds"], f["armor-feature"]],
    ["Gambeson", "3", "5 / 11", "Flexible: +1 to Evasion."]);
  // The Hope feature has no card anywhere — card-sheet.js generates none for it — so this box is
  // the only paper its text exists on, and a name alone would leave it unusable.
  eq("the class's Hope feature is printed in full, name and text", f["class-hope-feature"],
    "Frontline Tank: Spend 3 Hope to clear 2 Armor Slots.");
  eq("and the potion is the whole of the inventory the app models", f["inventory-items"], "Minor Health Potion");
  eq("a character with no potion gets an empty list box, not a dash saying \"recorded: nothing\"",
    sheetFieldValues(formChar(), CSV_DB)["inventory-items"], "");
}

group("A mixed ancestry is one heritage with a plus in it");
{
  const mixed = sheetFieldValues(formChar({
    heritage: {
      ancestryMode: "mixed", ancestryIds: ["clank", "human"], communityId: "com",
      chosenFeatures: [{ ancestryId: "clank", featureName: "Efficient" }, { ancestryId: "human", featureName: "High Stamina" }],
    },
  }), CSV_DB);
  eq("both ancestries share one line, joined the way the sheet and the CSV both join them",
    mixed.heritage, "Highborne Clank + Human");
}

// A second class whose Spellcast trait differs from the first's, so the sheet has two of
// everything the SRD makes a per-roll choice of. CHAIR is the weapon whose trait is the
// Spellcast sentinel and CASTER the Instinct-casting subclass, both declared above.
const MULTICLASS_DB = {
  ...CSV_DB,
  classes: [...CSV_DB.classes, {
    id: "cls2", name: "SORCERER", domains: ["ARCANA", "MIDNIGHT"], startingHitPoints: 6, startingEvasion: 10,
    hopeFeature: feat("Volatile Magic", para("Reroll any number of your damage dice.")),
    classFeatures: [feat("Arcane Sense", para("You can sense magic within Close range."))],
  }],
  subclasses: [...CSV_DB.subclasses, CASTER],
  weapons: [...CSV_DB.weapons, CHAIR],
};
const MULTICLASSED = formChar({
  multiclass: { classId: "cls2", subclassId: CASTER.id, domain: "ARCANA", level: 5, tier: "foundation" },
  equipment: { primaryWeaponId: CHAIR.id, secondaryWeaponId: null, armorId: "gambeson", potionChoice: null },
});

group("A multiclassed caster has two of everything the rules let them choose between");
{
  const f = sheetFieldValues(MULTICLASSED, MULTICLASS_DB);

  eq("the second class box carries its subclass, its class and the domain it opened",
    f["multiclass-subclass"], "Sparkwright Sorcerer, Arcana");
  eq("while the first class box is untouched by it", f["class-subclass"], "Stalwart Guardian");

  // "if your foundation cards specify different Spellcast traits, you can choose which one to
  // apply when making a Spellcast roll" — a choice per roll, so marking one would be the sheet
  // making it for them.
  eq("two of the six Spellcast markers are starred, and the other four are empty",
    SPELLCAST_INDICATORS.map((k) => f[k]), ["", "", "", "*", "", "*"]);

  // Alternatives print IN FULL. Collapsing them to the higher number would be this sheet making
  // the GM's per-roll call; the bracket after them is what stops "Spellcast" reading as a third
  // alternative rolled with a trait called "Instinct Spellcast".
  eq("the attack keeps both alternatives, with the weapon's own label bracketed after them",
    f["primary-trait-range"], "(0) Knowledge / (+2) Instinct (Spellcast) | Far");
  // The single-trait shape beside it, so the bracketing above is visibly a branch and not the
  // only thing this line can produce. The label stays the word off the card either way — which
  // trait it resolved to is already inside the bonus, and "(0) Knowledge" would be the sheet
  // printing a trait the weapon does not name.
  eq("where a caster with one trait gets a plain signed total and the label unbracketed after it",
    sheetFieldValues(formChar({
      equipment: { primaryWeaponId: CHAIR.id, secondaryWeaponId: null, armorId: "gambeson", potionChoice: null },
    }), MULTICLASS_DB)["primary-trait-range"], "(0) Spellcast | Far");
}

// gear.js marks list items with U+2022, which is right for the CSV and for the app's own pages.
// In a PDF form field Chrome draws that character as a double quote, so a Guardian's bulleted
// benefits print as `" You reduce the severity of...`. Measured, one character per line, against a
// diagnostic sheet: the em dash, en dash and curly apostrophe all render correctly and only the
// bullet fails — so this is one substitution, not a transliteration pass.
group("The one character a form field can't carry is swapped, and only that one");
{
  // The fixture class carries a feature whose content is nothing but bullets, shaped like
  // Guardian's second class feature in data/ — which is where the bullet enters the sheet.
  const f = sheetFieldValues(formChar(), CSV_DB);

  check("no field the sheet writes still carries U+2022",
    !Object.values(f).some((v) => typeof v === "string" && v.includes("\u2022")));
  check("the bulleted feature carries U+00B7 instead, which renders in both viewers we checked",
    f["class-features"].includes("\u00b7"));
  // The positive control: gear.js really does put a bullet in this feature, so the absence above
  // is the substitution firing rather than the fixture having no list in it.
  check("and the source text this was derived from really did have a bullet in it",
    featuresText(CSV_DB.classes[0].classFeatures).includes("\u2022"));

  // The characters that were NOT substituted, because measurement said they did not need to be.
  // A blanket "strip anything above U+00FF" would have taken these with it.
  const dashes = sheetFieldValues(formChar({ equipment: { primaryWeaponId: null, secondaryWeaponId: null, armorId: null, potionChoice: null } }), CSV_DB);
  eq("an unequipped character's armor-name keeps its em dash, which Chrome draws correctly",
    dashes["armor-name"], "\u2014");
}

group("The class-features box holds classes, and only classes");
{
  const f = sheetFieldValues(MULTICLASSED, MULTICLASS_DB);
  const box = f["class-features"];

  check("the first class's features are in it, name and text",
    box.includes("Unstoppable: Once per long rest, you can become Unstoppable."));
  // A middle dot, not gear.js's U+2022 bullet: Chrome draws that one as a double quote in a form
  // field. See "The one character a form field can't carry" below for the measurement.
  check("bullets included, for a feature whose whole content is a list",
    box.includes("\u00b7 You can't be Restrained."));
  check("and the second class's features under the second class's NAME, because nothing else in the box says where they came from",
    box.includes("Sorcerer\nArcane Sense: You can sense magic within Close range."));

  // Everything below is a negative assertion, and each one is paired with the positive control
  // that makes it mean something: the string has to be findable in the sheet's own data before
  // "it is not in this box" is a fact about the box rather than about the search.
  const sheet = deriveSheet(MULTICLASSED, MULTICLASS_DB);
  const somewhere = (list, text) => JSON.stringify(list).includes(text);

  const subclassText = "Gain a permanent +1 bonus to your damage thresholds.";
  check("the subclass's Foundation text IS in the sheet's data, so it was findable",
    somewhere(sheet.subclassFeatures, subclassText));
  check("and it is NOT in this box, because it is printed on the subclass card",
    !box.includes(subclassText));

  const ancestryText = "Decide who made you.";
  check("the ancestry feature IS in the sheet's data", somewhere(sheet.ancestryFeatures, ancestryText));
  check("and NOT in this box, for the same reason", !box.includes(ancestryText));

  const communityText = "You have advantage on rolls to consort with nobles.";
  check("the community feature IS in the sheet's data", somewhere(sheet.communityFeatures, communityText));
  check("and NOT in this box either", !box.includes(communityText));

  // A single-class character's box is the first half alone, with no separator left dangling.
  const alone = sheetFieldValues(formChar({ equipment: EQUIPPED }), CSV_DB)["class-features"];
  check("a character with one class gets no second class's name in the box", !alone.includes("Sorcerer"));
  check("and no trailing blank line where the second half would have gone", alone === alone.trim());
}

group("Bare hands, bare skin, and an empty off hand");
{
  const bare = sheetFieldValues(formChar({
    equipment: { primaryWeaponId: UNARMED, secondaryWeaponId: null, armorId: UNARMORED, potionChoice: null },
  }), CSV_DB);

  // The primary slot counts when it holds the sentinel, even though the db lookup finds nothing:
  // the profile is a rule the SRD provides rather than a record in data/.
  eq("bare hands fill the weapon slot rather than leaving it empty", bare["primary-weapon-name"], "Unarmed");
  eq("the attack names its own two traits, and there is no label to bracket after them",
    bare["primary-trait-range"], "(+2) Strength / (0) Finesse | Melee");
  eq("with no burden at all, because nothing is in your hands", bare["primary-burden"], "");
  eq("and no feature, because a bare-handed profile has none", bare["primary-feature"], "");

  // The one field on this sheet where a dash is the answer rather than a placeholder: choosing
  // to wear nothing is a choice, and not the same as not having chosen yet.
  eq("choosing to wear nothing says so", bare["armor-name"], "Unarmored");
  eq("where a slot nobody has filled prints the dash deriveSheet handed over",
    sheetFieldValues(formChar(), CSV_DB)["armor-name"], "—");
  eq("and an unarmored character has no base numbers, because there is no armor to have them",
    [bare["armor-base-score"], bare["armor-base-thresholds"], bare["armor-feature"]], ["", "", ""]);

  const empty = ["secondary-weapon-name", "secondary-trait-range", "secondary-damage-and-type",
    "secondary-burden", "secondary-feature"];
  eq("nothing in the off hand leaves all five of its boxes empty", empty.map((k) => bare[k]), ["", "", "", "", ""]);
  // The positive control: those five boxes do fill, so the blanks above are about this character
  // rather than about five fields nothing ever writes.
  eq("and a dagger in it fills every one of them",
    empty.map((k) => sheetFieldValues(formChar({
      equipment: { ...EQUIPPED, secondaryWeaponId: "dagger" },
    }), CSV_DB)[k]),
    ["Dagger", "(0) Finesse | Melee", "1d8+1 Physical", "One handed", ""]);
}

group("A record the catalogue is missing numbers for prints nothing, and never the word NaN");
{
  // Armors validate under NAME_ONLY (content-sources.js:156,162), so an armor with an id and a
  // name is an armor that LOADS. That is exactly the shape a hand-transcribed source has while it
  // is being typed in — data/void/ is one — and the sheet is the last place a half-finished
  // record should announce itself, because by then it is ink on a page a player takes to a table.
  const HEDGE = { id: "hedge", name: { "en-US": "Hedge Plate" }, baseScore: 3 };
  const WITH_NUMBERS = { ...CSV_DB, armors: [...CSV_DB.armors, { ...HEDGE, baseMajorThreshold: 5, baseSevereThreshold: 11 }] };
  const WITHOUT = { ...CSV_DB, armors: [...CSV_DB.armors, HEDGE] };
  const wearing = formChar({ equipment: { ...EQUIPPED, armorId: "hedge" } });

  // The positive control comes first, because everything after it asserts that a box is EMPTY:
  // the same character in the same armor, with the two numbers filled in on the record.
  const complete = sheetFieldValues(wearing, WITH_NUMBERS);
  eq("with the record complete, both threshold boxes carry numbers",
    [complete["damage-threshold-major"], complete["damage-threshold-severe"]], ["6", "12"]);

  // And the total really is NaN, which is what makes the guard load-bearing rather than
  // defensive: derived-stats.js:590-594 adds the character's level to a base that isn't there.
  const derived = deriveSheet(wearing, WITHOUT);
  check("without them the arithmetic genuinely produces NaN — not null, not zero",
    Number.isNaN(derived.thresholds.major) && Number.isNaN(derived.thresholds.severe));

  const f = sheetFieldValues(wearing, WITHOUT);
  eq("so both boxes come out empty", [f["damage-threshold-major"], f["damage-threshold-severe"]], ["", ""]);
  check("and no box on the sheet says NaN, which is the word a viewer would otherwise print on the line",
    !JSON.stringify(f).includes("NaN"));

  // The armor's own boxes further down the module already guarded this catalogue bug on their
  // own, and the pair below is what says the two guards agree: the record was found and readable,
  // and only the numbers it hasn't got are blank.
  eq("the armor's own thresholds box is blank for the same reason", f["armor-base-thresholds"], "");
  eq("while the number it does carry is printed, so the record was reachable all along",
    [f["armor-name"], f["armor-base-score"]], ["Hedge Plate", "3"]);
}

group("The trait-and-range line never ends in a separator with nothing after it");
{
  // Weapons load under NAME_ONLY too, and prettyEnum() answers "" for a range that isn't there.
  // Interpolated, that prints "(+1) Agility | " — a line that reads as a range the printer lost.
  const NOTCHED = {
    id: "notched", name: { "en-US": "Notched Blade" }, trait: "AGILITY", burden: "ONE_HANDED",
    damage: { dice: "D6", type: "PHYSICAL" },
  };
  const db = { ...CSV_DB, weapons: [...CSV_DB.weapons, NOTCHED, { ...NOTCHED, id: "notched-far", range: "FAR" }] };
  const line = (id) => sheetFieldValues(formChar({
    equipment: { ...EQUIPPED, primaryWeaponId: id },
  }), db)["primary-trait-range"];

  eq("a weapon with no range is its trait and nothing else", line("notched"), "(+1) Agility");
  // Said twice on purpose: an implementation that appended the separator and then trimmed the
  // line would still print "(+1) Agility |", which is wrong in the same way and passes an
  // assertion about trailing whitespace.
  check("with no separator anywhere in it", !line("notched").includes("|"));
  eq("and nothing hanging off the end of it", line("notched"), line("notched").trim());
  // The positive control: the same record with a range prints the separator, so the checks above
  // are about the missing half rather than about a field that never joins anything.
  eq("while the same weapon with a range still gets one", line("notched-far"), "(+1) Agility | Far");
}

group("Experiences fill from the top and leave the rest of the slots blank");
{
  const f = sheetFieldValues(formChar({ equipment: EQUIPPED }), CSV_DB);
  eq("each Experience fills a name and the total it is at",
    [f["experience-name1"], f["experience-value1"], f["experience-name2"], f["experience-value2"]],
    ["A", "+2", "B", "+2"]);
  // Five slots is exactly the ceiling the rules allow — two at creation plus one at each of the
  // level 2, 5 and 8 achievements — so there is no overflow case and no sixth to lose.
  eq("and the three this character hasn't earned are empty pairs",
    [3, 4, 5].flatMap((n) => [f[`experience-name${n}`], f[`experience-value${n}`]]), ["", "", "", "", "", ""]);
}

group("The printed sheet outlives the loadout it was printed with");
{
  // Untouchable is half your Agility rounded up, and only while it is in the loadout.
  const untouchable = formChar({ domainCardIds: ["core_domain_card_untouchable"], domainVaultIds: [] });

  eq("so the loadout is off by default and the number is what is permanently true",
    sheetFieldValues(untouchable, CSV_DB).evasion, "9");
  eq("an options object with nothing in it says the same", sheetFieldValues(untouchable, CSV_DB, {}).evasion, "9");
  eq("and asking for the loadout changes the number on the page",
    sheetFieldValues(untouchable, CSV_DB, { loadout: true }).evasion, "10");

  // Vaulting every card isn't a trick: vaulted is already what the rules mean by "not in play",
  // so a card whose own text tells you to vault it keeps applying either way.
  const vitality = formChar({
    domainCardIds: ["core_domain_card_vitality"], domainVaultIds: [],
    effectChoices: { core_domain_card_vitality: { optionIds: ["stress", "hitPoint"] } },
  });
  eq("while a permanent card counts in both, because permanent is what it says",
    [sheetFieldValues(vitality, CSV_DB)["hp-slots"], sheetFieldValues(vitality, CSV_DB, { loadout: true })["hp-slots"]],
    ["8", "8"]);
}

group("The trait marks are durable state, so the sheet answers them");
{
  const TRAIT_MARKS = SHEET_MARK_FIELDS.filter((k) => k.endsWith("-marked"));
  const marked = formChar({
    traitMarks: { agility: true, strength: false, finesse: false, instinct: false, presence: true, knowledge: false },
  });
  // A marked trait is one already raised in this tier and therefore ineligible for another +1
  // while the tier lasts — state history.js keeps and clears at the level 5 and 8 boundaries,
  // not something spent at the table.
  eq("a raised trait is ticked, and every other box is explicitly false",
    TRAIT_MARKS.map((k) => sheetFieldValues(marked, CSV_DB)[k]), [true, false, false, false, true, false]);
  eq("and a character who has raised nothing ticks nothing",
    TRAIT_MARKS.map((k) => sheetFieldValues(formChar(), CSV_DB)[k]), [false, false, false, false, false, false]);
}

// The other 40 answerable boxes. Same justification as the trait marks and the opposite of the 42
// on page one: a marked advancement is a choice already made and kept, where a ticked HP box is a
// resource spent this session.
group("The level up grid fills from the left, one row per rule");
{
  const used = (over) => formChar({ level: 10, advancementSlotsUsed: {
    traits: { 2: 2, 3: 0, 4: 0 }, hitPoint: { 2: 0, 3: 1, 4: 0 }, stress: { 2: 0, 3: 0, 4: 0 },
    experience: { 2: 1, 3: 0, 4: 0 }, domainCard: { 2: 0, 3: 0, 4: 0 }, evasion: { 2: 0, 3: 0, 4: 0 },
    subclass: { 3: 1, 4: 0 }, proficiency: { 3: 0, 4: 2 }, multiclass: { 3: 0, 4: 0 }, ...over,
  } });
  const f = sheetFieldValues(used(), CSV_DB);

  // Two of tier 2's three trait boxes. Which two carries no information — the rules make a row's
  // boxes interchangeable — so filling from the left is presentation, not a claim.
  eq("two marks on a three-box row tick the first two and leave the third",
    [f["lu-trait-2-1"], f["lu-trait-2-2"], f["lu-trait-2-3"]], [true, true, false]);
  eq("a row untouched in that tier ticks nothing", [f["lu-stress-2-1"], f["lu-stress-2-2"]], [false, false]);
  eq("tiers are independent: the Hit Point slot taken at tier 3 does not mark tier 2's",
    [f["lu-hp-2-1"], f["lu-hp-3-1"], f["lu-hp-3-2"]], [false, true, false]);
  // A one-box row has no index in the template, matching how it reads on the page.
  eq("a single-box row is named without an index", [f["lu-experience-2"], f["lu-experience-3"]], [true, false]);
  eq("and Proficiency costs both its boxes at once, which is why it costs the whole level",
    [f["lu-proficiency-4-1"], f["lu-proficiency-4-2"]], [true, true]);

  // Rows the rules do not offer at tier 2 have no box there to answer.
  check("subclass, proficiency and multiclass have no tier 2 boxes at all",
    !("lu-subclass-2" in f) && !("lu-proficiency-2-1" in f) && !("lu-multiclass-2-1" in f));
  // The positive control: they DO exist at tier 3, so the absence above is the slot table talking
  // rather than the name being misspelled.
  check("but they do at tier 3", "lu-subclass-3" in f && "lu-proficiency-3-1" in f && "lu-multiclass-3-1" in f);

  eq("a character who has levelled nothing ticks none of the forty",
    SHEET_MARK_FIELDS.filter((k) => k.startsWith("lu-"))
      .map((k) => sheetFieldValues(formChar(), CSV_DB)[k]).filter(Boolean), []);
}

// A tick on this grid means "not available", which on the printed sheet is two different marks:
// filled in for spent, scored through for struck. A checkbox cannot draw a diagonal line, so both
// print the same and the sheet keeps WHETHER a box is available while losing WHY.
group("A struck option ticks the same as a spent one, because a box cannot be scored through");
{
  const BLANK = {
    traits: { 2: 0, 3: 0, 4: 0 }, hitPoint: { 2: 0, 3: 0, 4: 0 }, stress: { 2: 0, 3: 0, 4: 0 },
    experience: { 2: 0, 3: 0, 4: 0 }, domainCard: { 2: 0, 3: 0, 4: 0 }, evasion: { 2: 0, 3: 0, 4: 0 },
    subclass: { 3: 0, 4: 0 }, proficiency: { 3: 0, 4: 0 }, multiclass: { 3: 0, 4: 0 },
  };
  const at10 = (used) => sheetFieldValues(formChar({ level: 10, advancementSlotsUsed: { ...BLANK, ...used } }), CSV_DB);

  // The positive control this whole group rests on: with nothing taken, nothing is struck either,
  // so every tick below is the rule firing rather than the row being ticked all along.
  const none = at10({});
  eq("with nothing taken, none of these rows is ticked",
    [none["lu-subclass-3"], none["lu-multiclass-3-1"], none["lu-subclass-4"], none["lu-multiclass-4-1"]],
    [false, false, false, false]);

  // "Take an upgraded subclass card. Then cross out the multiclass option for this tier."
  const upgraded = at10({ subclass: { 3: 1, 4: 0 } });
  eq("upgrading a subclass ticks that tier's multiclass, which the rules strike",
    [upgraded["lu-subclass-3"], upgraded["lu-multiclass-3-1"], upgraded["lu-multiclass-3-2"]],
    [true, true, true]);
  eq("and leaves the next tier alone, because it strikes THIS tier's option only",
    [upgraded["lu-subclass-4"], upgraded["lu-multiclass-4-1"]], [false, false]);

  // "Multiclass … then cross out an unused 'Take an upgraded subclass card' and the other
  // multiclass option on this sheet" — which is what makes multiclassing once per career.
  const multi = at10({ multiclass: { 3: 2, 4: 0 } });
  eq("multiclassing ticks its own boxes and the unused subclass upgrade beside them",
    [multi["lu-multiclass-3-1"], multi["lu-multiclass-3-2"], multi["lu-subclass-3"]], [true, true, true]);
  eq("and reaches forward to the other tier's multiclass, which is the once-per-career rule",
    [multi["lu-multiclass-4-1"], multi["lu-multiclass-4-2"]], [true, true]);

  // The cap. A row struck after it was partly spent would otherwise tick past the boxes that
  // exist, and fillForm throws on a field name the template hasn't got.
  const both = at10({ subclass: { 3: 1, 4: 1 }, multiclass: { 3: 0, 4: 0 } });
  check("no row ever ticks a box beyond the ones the template draws",
    !SHEET_MARK_FIELDS.some((k) => k.startsWith("lu-") && both[k] === undefined)
      && !("lu-multiclass-3-3" in both));
}

group("The two halves meet: every name the sheet writes is a field the template has");
{
  // The contract sheet-fields.js's header states, checked against a template rather than against
  // itself. The fixture stands in for the real one — its widgets are named for two of the 52 —
  // so what this proves is the SHAPE of the meeting: the value map's keys are what fillForm
  // looks up, and a key that isn't a field stops the export instead of printing a blank line.
  const values = sheetFieldValues(formChar({ equipment: EQUIPPED }), CSV_DB);
  const template = readForm(FORM.bytes);

  const present = Object.fromEntries(
    Object.entries(values).filter(([k]) => template.fields.has(k)),
  );
  eq("the fixture really does carry field names the sheet writes", Object.keys(present).sort(),
    ["agi-marked", "name", "pronouns", "str-marked"]);

  const out = fillForm(FORM.bytes, present);
  const text = formText(out);
  check("and filling with them lands every offset on its own object",
    lastXrefSection(text).entries.every((e) => text.startsWith(`${e.obj} 0 obj\r\n`, Number(e.raw.slice(0, 10)))));
  // "(unnamed)" has parentheses in it, which is the character a literal PDF string would have to
  // escape and this module never writes one of.
  check("with a value full of parentheses written as hex rather than as a literal string",
    formObject(text, 5).includes("/V<FEFF"));

  const stray = formFailure(() => fillForm(FORM.bytes, { ...present, "damage-threshold-major": "6" }));
  has("while a name this template hasn't got is refused rather than silently dropped",
    [stray], "damage-threshold-major");
}

// ---------- one rule, three printed pages ----------
//
// permanentSubject() and attackText() are each one rule that three exports used to state
// separately — the CSV, the printed stats card and the official sheet's form fields — in wordings
// that were never identical. Nothing in git would have shown that drifting: two files that agree
// today and disagree after one of them is edited is a change git has no reason to see as a
// conflict. So these check the exports against EACH OTHER, which is the property the extractions
// exist to protect, rather than each of them against a number of its own.

group("The CSV, the printed card and the official sheet agree about one character");
{
  // Untouchable grants Evasion only while it's in the loadout; Vitality's two slots are permanent,
  // and its own text tells you to vault the card. A character holding both is one whose numbers
  // depend on which rule is being applied, which is what makes agreement here worth asserting.
  const held = ["core_domain_card_untouchable", "core_domain_card_vitality"];
  const ch = formChar({
    domainCardIds: held, creationDomainCardIds: held, domainVaultIds: [],
    effectChoices: { core_domain_card_vitality: { optionIds: ["stress", "hitPoint"] } },
    equipment: EQUIPPED,
  });

  const csv = exportRow(ch, { loadout: false });
  const card = statsCardContent(ch, CSV_DB);
  const sheet = sheetFieldValues(ch, CSV_DB);
  const defense = card.bands.find((b) => b.type === "defense");
  const boxes = (label) => String(card.bands.find((b) => b.type === "slots")
    .cells.find((c) => c.label === label).boxes);

  eq("Evasion: the gambeson's Flexible counts on all three, and Untouchable on none of them",
    [csv.evasion, defense.cells[0].value, sheet.evasion], ["10", "10", "10"]);
  eq("Hit Points: the permanent slot Vitality grants counts on all three",
    [csv["hp-slots"], boxes("Hit Points"), sheet["hp-slots"]], ["8", "8", "8"]);
  eq("Stress: the other half of the same answered choice",
    [csv["stress-slots"], boxes("Stress"), sheet["stress-slots"]], ["7", "7", "7"]);
  eq("Armor Score, which the armor alone moves",
    [csv["armor-score"], boxes("Armor"), sheet["armor-score"]], ["3", "3", "3"]);
  eq("and both damage thresholds, which the card prints as a scale",
    [csv["damage-threshold-major"], defense.scale[0].value, sheet["damage-threshold-major"],
      csv["damage-threshold-severe"], defense.scale[1].value, sheet["damage-threshold-severe"]],
    ["6", "6", "6", "12", "12", "12"]);

  // The positive control for all of it: they agree because the substitution happened. Both exports
  // that offer the choice move when the loadout is counted — and the card offers no choice at all,
  // which is exactly why the rule is stated once rather than three times.
  eq("in play the same character's Evasion is a point higher, in both exports that can say so",
    [exportRow(ch).evasion, sheetFieldValues(ch, CSV_DB, { loadout: true }).evasion], ["11", "11"]);
  eq("while the permanent slots don't move, which is what permanent means",
    [exportRow(ch)["hp-slots"], sheetFieldValues(ch, CSV_DB, { loadout: true })["hp-slots"]], ["8", "8"]);

  // The substitution is on a copy in all three. One that vaulted the character's cards for real
  // would empty the loadout of every screen redrawn after the export.
  eq("and nothing printed moved a card out of the character's own loadout",
    [ch.domainVaultIds, ch.domainCardIds], [[], held]);
}

group("What permanentSubject substitutes, and what it deliberately leaves alone");
{
  const ch = csvChar({ domainCardIds: ["fx_bond", "fx_ava"], domainVaultIds: ["fx_ava"], creationDomainCardIds: ["fx_bond"] });
  const subject = permanentSubject(ch);

  eq("every card owned goes to the vault, which is already what the rules mean by not in play",
    subject.domainVaultIds, ["fx_bond", "fx_ava"]);
  eq("the collection is not substituted, because where a card sits doesn't change whether you own it",
    subject.domainCardIds, ["fx_bond", "fx_ava"]);
  // The candidate second clause the function's own comment names. Substituting it too would change
  // which cards a character is deemed to have started with, which no printed page asks about.
  eq("and the other card list passes through as it was", subject.creationDomainCardIds, ["fx_bond"]);
  check("the character handed in is a different object, and is not modified",
    subject !== ch && ch.domainVaultIds.length === 1);
  // Every export runs on drafts too, and a character mid-creation may own nothing at all.
  eq("a character who owns nothing vaults nothing", permanentSubject({ id: "x" }).domainVaultIds, []);
}

// A TRIPWIRE, not an assertion about which answer is right.
//
// sheet-fields.js asks spellcastTraitKeys() about the vaulted SUBJECT; card-content.js asks it
// about the CHARACTER. Both files argue their case in a comment, and both are currently correct,
// because the question is moot: spellcastTraitKeys() reads subclassId and multiclass.subclassId
// and nothing else, so vaulting a card cannot move the answer.
//
// Nothing else in this suite notices that. Flip either call site today and 1226 checks still pass,
// which is precisely why this group exists: it fails on the day the two spellings stop agreeing —
// the day a card declares a Spellcast trait — and on that day the sheet and the card each have a
// deliberate decision to make rather than a silent divergence to discover.
group("Vaulting a card cannot change which trait you cast with — while that stays true");
{
  const casters = [
    ["a single-class caster", formChar({ domainCardIds: ["core_domain_card_untouchable"] }), CSV_DB],
    ["a multiclassed caster naming two traits", MULTICLASSED, MULTICLASS_DB],
  ];
  for (const [what, ch, db] of casters) {
    eq(`${what}: the character and the vaulted subject name the same traits`,
      spellcastTraitKeys(ch, db), spellcastTraitKeys(permanentSubject(ch), db));
  }
  // The positive control, without which the equalities above could both be [] compared to [] and
  // this whole group would pass on a function that returned nothing at all.
  check("and at least one of them names a trait, so the comparison isn't two empty lists",
    spellcastTraitKeys(MULTICLASSED, MULTICLASS_DB).length === 2);
}

group("One weapon in one hand reads the same way on the card and on the sheet");
{
  const ch = formChar({ equipment: EQUIPPED });
  const line = (card) => card.bands.filter((b) => b.type === "detail")[0].cells[0].value;

  // The one thing the two pages genuinely differ about, and it's a parameter rather than something
  // either of them quietly erases: the sheet brackets a lone bonus so both kinds of weapon line up
  // down a column of boxes, where the card's sits inside a sentence and stays bare.
  eq("the card writes the attack into a sentence", line(statsCardContent(ch, CSV_DB)),
    "Longsword: +2 Agility | 1d10+3 Physical");
  eq("and the sheet writes the same attack into a box, bracketed",
    sheetFieldValues(ch, CSV_DB)["primary-trait-range"], "(+2) Agility | Melee");

  // The case the shared function exists for: two Spellcast traits, printed IN FULL, with the
  // weapon's own label bracketed after them so it can't read as a third alternative rolled with a
  // trait called "Instinct Spellcast". Neither page composes that; both ask for it.
  const casterLine = line(statsCardContent(MULTICLASSED, MULTICLASS_DB));
  eq("an alternatives line, on the card", casterLine,
    "Arcane-Frame Wheelchair: (0) Knowledge / (+2) Instinct (Spellcast) | 1d6 Magical");
  // Asserted as a relation rather than as a second literal: this is the property the extraction
  // protects, and it fails the moment either page re-spells the rule with a separator of its own.
  eq("and the sheet's box is that same attack with the weapon's range after it",
    sheetFieldValues(MULTICLASSED, MULTICLASS_DB)["primary-trait-range"],
    `${casterLine.split(": ")[1].split(" | ")[0]} | Far`);
}

group("The attack line, one clause of the rule at a time");
{
  // The entry weaponEntry() hands over, hand-built so each clause can be put in front of the
  // function on its own — including the shapes no fixture db above produces.
  const entry = (over) => ({ attack: "+3", traitLabel: "Agility", attackNamesTraits: false, ...over });

  eq("bonus first, trait second: the number is a total with the trait already inside it",
    attackText(entry()), "+3 Agility");
  eq("and the sheet's spelling of the same line brackets that bonus",
    attackText(entry(), { bracketBonus: true }), "(+3) Agility");
  // A weapon record that loaded without a `trait` has no label, and neither has a bare-handed
  // profile: an absent piece must not leave behind the space that separated it.
  eq("no trait label leaves no trailing space", attackText(entry({ traitLabel: "" })), "+3");
  // "(—)" reads like a number that got lost; "—" reads like one nobody can compute yet.
  eq("a bonus that doesn't exist stays a bare dash, brackets asked for or not",
    [attackText(entry({ attack: "—", traitLabel: "" })),
      attackText(entry({ attack: "—", traitLabel: "" }), { bracketBonus: true })], ["—", "—"]);

  const alternatives = entry({ attack: "(+2) Strength / (0) Finesse", attackNamesTraits: true, traitLabel: "" });
  eq("an attack that names its own traits is left to name them", attackText(alternatives),
    "(+2) Strength / (0) Finesse");
  eq("and is not bracketed a second time by the sheet",
    attackText(alternatives, { bracketBonus: true }), "(+2) Strength / (0) Finesse");
  eq("a label on top of those is separated by a bracket, not welded onto the last trait named",
    attackText({ ...alternatives, traitLabel: "Spellcast" }), "(+2) Strength / (0) Finesse (Spellcast)");
}


// ===========================================================================================
// Groups that came in with upstream's 2026-08-27 merge. Two of its groups are deliberately
// absent: the JSON transfer pair tested upstream's shared/transfer.js, and this fork keeps its
// own — the transfer groups above cover it. "Every id in effects.js still exists in data/" is
// also upstream's; the per-edition version of it above is the same check on this fork's layout.
// ===========================================================================================

group("Table state: boxes marked at the table (HP, Stress, Hope, Armor)");
{
  eq("a new character starts with nothing marked but the two starting Hope, no conditions, no notes",
    defaultState(), { hp: 0, stress: 0, hope: HOPE_START, armor: 0, scars: 0, conditions: [], notes: "" });
  eq("Hope starts at 2 and caps at 6, per the SRD", [HOPE_START, HOPE_MAX], [2, 6]);

  // Tapping is "fill up to here / clear from here on": one tap reaches any value.
  eq("tapping an empty box marks every box up to and including it", tapBox(0, 2), 3);
  eq("tapping the box right after the marked ones marks one more", tapBox(2, 2), 3);
  eq("tapping the last marked box clears just that one", tapBox(3, 2), 2);
  eq("tapping an earlier marked box clears it and everything after", tapBox(5, 1), 1);
  eq("tapping the first box when it's the only one marked clears everything", tapBox(1, 0), 0);

  const maxes = { hp: 6, stress: 6, hope: HOPE_MAX, armor: 3 };
  eq("values within the maxima pass through untouched",
    clampState({ hp: 2, stress: 1, hope: 4, armor: 3 }, maxes), { hp: 2, stress: 1, hope: 4, armor: 3, scars: 0, conditions: [], notes: "" });
  eq("a value above its maximum (e.g. armor swapped for a lighter one) is pulled down to it",
    clampState({ hp: 9, stress: 0, hope: 7, armor: 5 }, maxes), { hp: 6, stress: 0, hope: 6, armor: 3, scars: 0, conditions: [], notes: "" });

  // Conditions and notes ride along in the same state object: a clamp must keep them, or the
  // first tap on an HP box would silently drop every condition marked.
  eq("conditions and notes survive a clamp",
    clampState({ hp: 1, stress: 0, hope: 2, armor: 0, conditions: ["hidden", "restrained"], notes: "owes Rya 2 gold" }, maxes),
    { hp: 1, stress: 0, hope: 2, armor: 0, scars: 0, conditions: ["hidden", "restrained"], notes: "owes Rya 2 gold" });
  eq("unknown condition ids and non-string entries are dropped, duplicates collapsed",
    clampState({ conditions: ["vulnerable", "stunned", 3, "vulnerable"] }, maxes).conditions, ["vulnerable"]);
  eq("non-string notes fall back to empty", clampState({ notes: 42 }, maxes).notes, "");

  eq("the SRD's three conditions, each with the one line a player needs at the table",
    CONDITIONS.map((c) => c.id), ["vulnerable", "hidden", "restrained"]);
  check("every condition has a label and an effect", CONDITIONS.every((c) => c.label && c.effect));
  eq("toggling a condition on adds it in catalogue order", toggleCondition(["restrained"], "vulnerable"), ["vulnerable", "restrained"]);
  eq("toggling it again removes it", toggleCondition(["vulnerable", "restrained"], "vulnerable"), ["restrained"]);
  eq("toggling an unknown id changes nothing", toggleCondition(["hidden"], "stunned"), ["hidden"]);
  eq("negative and non-numeric values fall back to the defaults",
    clampState({ hp: -1, stress: "x", hope: undefined, armor: null }, maxes), defaultState());
  eq("an unknown maximum (draft with no class yet) means nothing can be marked",
    clampState({ hp: 3, stress: 2, hope: 2, armor: 1 }, { hp: null, stress: 6, hope: 6, armor: null }),
    { hp: 0, stress: 2, hope: 2, armor: 0, scars: 0, conditions: [], notes: "" });
  eq("a missing state altogether clamps to the defaults", clampState(undefined, maxes), defaultState());
  check("clampState returns a new object rather than mutating its input", (() => {
    const input = { hp: 9, stress: 0, hope: 2, armor: 0 };
    clampState(input, maxes);
    return input.hp === 9;
  })());

  eq("the maxima come from the derived sheet: HP, Stress, Hope slots and Armor Score (= armor slots)",
    maxesFromSheet({ hitPoints: 7, stress: 6, hopeSlots: 6, armorScore: 3 }),
    { hp: 7, stress: 6, hope: 6, armor: 3 });
  eq("unknown sheet values stay null so the UI can show a dash",
    maxesFromSheet({ hitPoints: null, stress: 6, hopeSlots: 6, armorScore: null }),
    { hp: null, stress: 6, hope: 6, armor: null });

  eq("ensureLevelFields backfills the table state on characters saved before it existed",
    ensureLevelFields(newCharacter()).state, defaultState());
  const kept = newCharacter();
  kept.state = { hp: 3, stress: 1, hope: 5, armor: 2 };
  // A character saved between the play page and scars existing has a state with no `scars`
  // field at all — not zero, absent. ensureLevelFields backfills it without touching anything
  // else already there.
  eq("and backfills scars onto an existing state that predates it, leaving the rest untouched",
    ensureLevelFields(kept).state, { hp: 3, stress: 1, hope: 5, armor: 2, scars: 0 });

  // An imported file can say `"state": "x"` (or a number, or an array): not just missing, but
  // the wrong shape entirely. Writing a field onto a primitive throws in strict mode, which
  // would take the whole page down rather than just this one character's state.
  for (const bad of ["rotto", 42, [], null]) {
    const broken = newCharacter();
    broken.state = bad;
    check(`a primitive or array state (${JSON.stringify(bad)}) resets to defaultState() instead of throwing`, (() => {
      try {
        return JSON.stringify(ensureLevelFields(broken).state) === JSON.stringify(defaultState());
      } catch {
        return false;
      }
    })());
  }

  // A scar crosses out a Hope slot for good (SRD, Avoid Death). They're always the slots at
  // the right-hand end, so scarring is tapBox seen from that end.
  eq("no scars to start with", defaultState().scars, 0);
  eq("long-pressing the last slot crosses out just that one", scarAt(0, 5, 6), 1);
  eq("long-pressing an earlier one crosses out it and everything after", scarAt(0, 3, 6), 3);
  eq("long-pressing the leftmost crosses out the lot", scarAt(0, 0, 6), 6);
  eq("long-pressing the only crossed slot frees it", scarAt(1, 5, 6), 0);
  eq("long-pressing a crossed slot frees it and the crossed ones before it", scarAt(3, 4, 6), 1);
  eq("long-pressing the leftmost crossed slot frees just that one, the ones after it stay", scarAt(3, 3, 6), 2);
  eq("long-pressing the rightmost (last) crossed slot frees them all", scarAt(3, 5, 6), 0);

  eq("scars ride along in the state", clampState({ scars: 2 }, maxes).scars, 2);
  eq("more scars than there are slots is impossible", clampState({ scars: 9 }, maxes).scars, HOPE_MAX);
  eq("a negative or non-numeric scar count falls back to none",
    [clampState({ scars: -1 }, maxes).scars, clampState({ scars: "x" }, maxes).scars], [0, 0]);
  eq("a scar gained with Hope full pushes the Hope down with it",
    clampState({ hope: 6, scars: 2 }, maxes).hope, 4);
  eq("Hope below the reduced maximum is left where it is", clampState({ hope: 1, scars: 2 }, maxes).hope, 1);
  eq("with no Hope slots at all (a draft with no class) nothing can be scarred",
    clampState({ scars: 3 }, { hp: 6, stress: 6, hope: null, armor: 3 }).scars, 0);
  eq("a character saved before scars existed opens with none",
    ensureLevelFields(newCharacter()).state.scars, 0);
}

group("Downtime: the two moves a rest gives you (SRD p. 105)");
{
  const maxes = { hp: 6, stress: 6, hope: HOPE_MAX, armor: 3 };
  const beaten = { hp: 5, stress: 4, hope: 1, armor: 3, scars: 0, conditions: [], notes: "" };
  const move = (kind, id) => findRestMove(kind, id);

  eq("a rest is two moves, and the same move twice is allowed", DOWNTIME_MOVES_PER_REST, 2);
  eq("the short rest's menu", REST_MOVES.short.map((m) => m.id),
    ["tendToWounds", "clearStress", "repairArmor", "prepare"]);
  eq("the long rest's, which adds Work on a Project", REST_MOVES.long.map((m) => m.id),
    ["tendToAllWounds", "clearAllStress", "repairAllArmor", "prepare", "workOnProject"]);
  eq("an id that isn't on the menu comes back null, not undefined", findRestMove("short", "nope"), null);
  eq("and neither is a rest that doesn't exist", findRestMove("epic", "prepare"), null);

  // "clear a number of Hit Points equal to 1d4 + your tier"
  eq("the short rest's amount is the die plus the tier", restClearAmount(3, 2), 5);
  eq("a tier 1 character adds 1", restClearAmount(4, 1), 5);
  eq("a missing or nonsense roll clears nothing rather than throwing",
    [restClearAmount(0, 2), restClearAmount("x", 2), restClearAmount(undefined, undefined)], [2, 2, 0]);

  // HP, Stress and Armor count what's been spent or taken, so a rest counts them DOWN.
  eq("Tend to Wounds clears the rolled amount of HP",
    applyRestMove(beaten, maxes, move("short", "tendToWounds"), { amount: 3 }).hp, 2);
  eq("Clear Stress does the same to Stress",
    applyRestMove(beaten, maxes, move("short", "clearStress"), { amount: 2 }).stress, 2);
  eq("Repair Armor does the same to Armor Slots",
    applyRestMove(beaten, maxes, move("short", "repairArmor"), { amount: 1 }).armor, 2);
  eq("clearing more than was marked stops at nothing marked, it doesn't go negative",
    applyRestMove(beaten, maxes, move("short", "tendToWounds"), { amount: 99 }).hp, 0);
  eq("and a move with no amount passed clears nothing",
    applyRestMove(beaten, maxes, move("short", "tendToWounds")).hp, 5);

  eq("Tend to All Wounds clears the lot, no die involved",
    applyRestMove(beaten, maxes, move("long", "tendToAllWounds")).hp, 0);
  eq("so does Clear All Stress", applyRestMove(beaten, maxes, move("long", "clearAllStress")).stress, 0);
  eq("so does Repair All Armor", applyRestMove(beaten, maxes, move("long", "repairAllArmor")).armor, 0);

  // Hope is the one row that counts what you HOLD, so Prepare counts up.
  eq("Prepare gains a Hope", applyRestMove(beaten, maxes, move("short", "prepare")).hope, 2);
  eq("and two when you prepare with the party",
    applyRestMove(beaten, maxes, move("long", "prepare"), { together: true }).hope, 3);
  eq("Hope can't be prepared past the six slots",
    applyRestMove({ ...beaten, hope: 6 }, maxes, move("short", "prepare"), { together: true }).hope, 6);
  eq("nor past the slots a scar has taken away",
    applyRestMove({ ...beaten, hope: 4, scars: 2 }, maxes, move("short", "prepare"), { together: true }).hope, 4);

  eq("Work on a Project ticks a countdown the GM keeps, so the sheet is unchanged",
    applyRestMove(beaten, maxes, move("long", "workOnProject")), beaten);
  eq("an unknown move leaves the state alone rather than throwing",
    applyRestMove(beaten, maxes, null, { amount: 3 }), beaten);

  // A rest goes through the same clamp as a tap: an armor swap since the last session must not
  // survive as an impossible count just because a rest touched a different row.
  eq("a rest clamps the rest of the state too, like every other change",
    applyRestMove({ hp: 9, stress: 0, hope: 2, armor: 5 }, maxes, move("long", "clearAllStress")),
    { hp: 6, stress: 0, hope: 2, armor: 3, scars: 0, conditions: [], notes: "" });
  check("applyRestMove returns a new object rather than mutating its input", (() => {
    const input = { hp: 5, stress: 0, hope: 2, armor: 0, scars: 0, conditions: [], notes: "" };
    applyRestMove(input, maxes, move("long", "tendToAllWounds"));
    return input.hp === 5;
  })());

  // Conditions and notes are not what a rest is for: nothing in the SRD's downtime moves ends
  // one, so a rest that quietly cleared them would be the app inventing a rule.
  eq("a rest leaves conditions and notes exactly where they are",
    applyRestMove({ ...beaten, conditions: ["hidden"], notes: "owes Rya 2 gold" }, maxes,
      move("long", "tendToAllWounds")),
    { hp: 0, stress: 4, hope: 1, armor: 3, scars: 0, conditions: ["hidden"], notes: "owes Rya 2 gold" });
}

// ---------- card-render.js ----------

group("Play page labels: English by default, Italian when the page says lang=\"it\"");
{
  eq("the languages on offer", LANGUAGES, ["en", "it"]);
  eq("a plain tag picks its dictionary", [pickLanguage("it"), pickLanguage("en")], ["it", "en"]);
  eq("a regional tag picks the base language", pickLanguage("it-IT"), "it");
  eq("anything unknown, empty or missing falls back to English", [pickLanguage("de"), pickLanguage(""), pickLanguage(undefined)], ["en", "en", "en"]);

  const en = translator("en");
  const it = translator("it");
  eq("a key resolves in each language", [en("tab.status"), it("tab.status")], ["Status", "Stato"]);
  eq("placeholders are filled", it("hope.of", { n: 2, max: 6 }), "Speranza: 2 su 6");
  eq("an unknown key comes back as the key itself, never blank", it("nope.missing"), "nope.missing");
  check("every English key has an Italian one — no half-translated page",
    (() => { const missing = en.keys().filter((k) => it(k) === k && en(k) !== k); return missing.length === 0; })());
  check("the three conditions are translated, label and effect",
    ["vulnerable", "hidden", "restrained"].every((id) => it(`condition.${id}.label`) !== en(`condition.${id}.label`) && it(`condition.${id}.effect`) !== `condition.${id}.effect`));

  eq("an unscarred slot's label names it as a box, not a bare number",
    it("hope.slot", { n: 3, max: 6 }), "Casella di Speranza 3 di 6");
  eq("the crossed-out slot says so, counting the same way as the unscarred one",
    it("hope.scarred", { n: 6, max: 6 }), "Casella di Speranza 6 di 6, cicatrizzata");
  eq("the confirmation names the slot it's about to cross out for good",
    it("hope.scar.confirmOne", { n: 6 }), "Barrare per sempre la Speranza 6?");
  eq("or the whole range, when the gesture crosses out more than one",
    it("hope.scar.confirmMany", { from: 4, to: 6 }), "Barrare per sempre la Speranza da 4 a 6?");
  eq("the end of the road is spelled out, not implied",
    it("hope.journeyEnds"), "Il viaggio di questo personaggio finisce qui.");
}

group("Portrait: a picture small enough to live in localStorage");
{
  eq("the limits, in one place", [MAX_EDGE, MAX_BYTES], [512, 120_000]);

  eq("a wide picture is shrunk by its width", fitWithin(1600, 900, 512), { width: 512, height: 288 });
  eq("a tall one by its height", fitWithin(900, 1600, 512), { width: 288, height: 512 });
  eq("a square one hits the box on both sides", fitWithin(2000, 2000, 512), { width: 512, height: 512 });
  eq("one already inside the box is left alone — never enlarged", fitWithin(120, 90, 512), { width: 120, height: 90 });
  eq("a degenerate size doesn't divide by zero", fitWithin(0, 0, 512), { width: 0, height: 0 });

  const webp = "data:image/webp;base64,AAAA";
  eq("a small WebP data URL is a portrait", isPortrait(webp), true);
  eq("JPEG and PNG too", [isPortrait("data:image/jpeg;base64,AA"), isPortrait("data:image/png;base64,AA")], [true, true]);
  eq("a remote URL is not", isPortrait("https://example.com/face.png"), false);
  eq("nor is a script URL", isPortrait("javascript:alert(1)"), false);
  eq("nor is an HTML data URL dressed up as an image", isPortrait("data:text/html;base64,PHNjcmlwdD4="), false);
  eq("nor an SVG, which can carry script", isPortrait("data:image/svg+xml;base64,AA"), false);
  eq("nor an empty string, a number or an object", [isPortrait(""), isPortrait(42), isPortrait({})], [false, false, false]);
  eq("anything past the byte cap is refused", isPortrait("data:image/webp;base64," + "A".repeat(MAX_BYTES)), false);

  eq("sanitizePortrait passes a good one through", sanitizePortrait(webp), webp);
  eq("and turns anything else into null", [sanitizePortrait("javascript:alert(1)"), sanitizePortrait(undefined)], [null, null]);

  // Everything that gets read back — localStorage and imported files alike — goes through
  // ensureLevelFields, so that's where a portrait is checked before an <img> ever sees it.
  const clean = newCharacter();
  clean.portrait = webp;
  eq("a good portrait survives ensureLevelFields", ensureLevelFields(clean).portrait, webp);

  const nasty = newCharacter();
  nasty.name = "Aster";
  nasty.portrait = "javascript:alert(1)";
  const fixed = ensureLevelFields(nasty);
  eq("a portrait that isn't a picture is dropped", "portrait" in fixed, false);
  eq("and the rest of the character is untouched", fixed.name, "Aster");

  eq("a character with no portrait at all stays without one", "portrait" in ensureLevelFields(newCharacter()), false);

  const shipped = newCharacter();
  shipped.id = "p1";
  shipped.portrait = webp;
  // Upstream's version of this used its own transfer API; this fork's transfer file is the one
  // that has to carry a portrait, so the same check runs through parseTransferFile.
  eq("a portrait makes the round trip through a transfer file",
    parseTransferFile(serializeTransferFile([shipped])).characters[0].portrait, webp);
}

group("Portrait: a decompression bomb is caught by its header, before it ever decodes");
{
  // Bytes built by hand, one format at a time — no files on disk, no real image encoder.
  // decodedSize only needs enough of the header to read the declared width and height; the
  // rest of each format (pixel data, CRCs, Huffman tables) is never touched.
  const u8 = (arr) => Uint8Array.from(arr);
  const ascii = (s) => Array.from(s, (c) => c.charCodeAt(0));
  const toDataUrl = (mime, bytes) => {
    let binary = "";
    for (const b of bytes) binary += String.fromCharCode(b);
    return `data:${mime};base64,${btoa(binary)}`;
  };
  const u32be = (bytes, offset, value) => {
    bytes[offset] = (value >>> 24) & 0xff;
    bytes[offset + 1] = (value >>> 16) & 0xff;
    bytes[offset + 2] = (value >>> 8) & 0xff;
    bytes[offset + 3] = value & 0xff;
  };
  const u24le = (bytes, offset, value) => {
    bytes[offset] = value & 0xff;
    bytes[offset + 1] = (value >> 8) & 0xff;
    bytes[offset + 2] = (value >> 16) & 0xff;
  };

  // PNG: signature, then the IHDR chunk with width at byte 16 and height at byte 20
  // (big-endian, 4 bytes each). Nothing past byte 24 is read.
  function pngHeader(width, height) {
    const bytes = new Uint8Array(24);
    bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
    bytes.set([0, 0, 0, 13], 8); // IHDR data length, unread by decodedSize
    bytes.set(ascii("IHDR"), 12);
    u32be(bytes, 16, width);
    u32be(bytes, 20, height);
    return bytes;
  }

  // JPEG: SOI, then an SOF0 marker directly (real files have DQT/APP0 segments first, but the
  // scanner has to walk past those to find it — this fixture just puts SOF0 first). The segment
  // length that follows the marker is never used by decodedSize when the marker IS a SOF, so it
  //'s left as zeroes.
  function jpegHeader(width, height) {
    return u8([
      0xff, 0xd8,
      0xff, 0xc0, 0x00, 0x00,
      0x08, // precision
      (height >> 8) & 0xff, height & 0xff,
      (width >> 8) & 0xff, width & 0xff,
    ]);
  }

  // WebP VP8X (the "extended" chunk): RIFF/WEBP/VP8X headers, a flags byte, 3 reserved bytes,
  // then the canvas width and height as 24-bit little-endian values, each one less than the
  // real size.
  function webpVp8xHeader(width, height) {
    const bytes = new Uint8Array(30);
    bytes.set(ascii("RIFF"), 0);
    bytes.set(ascii("WEBP"), 8);
    bytes.set(ascii("VP8X"), 12);
    bytes[20] = 0; // flags
    u24le(bytes, 24, width - 1);
    u24le(bytes, 27, height - 1);
    return bytes;
  }

  eq("the cap", MAX_DECODED_EDGE, 2048);

  const pngSmall = toDataUrl("image/png", pngHeader(100, 100));
  const pngHuge = toDataUrl("image/png", pngHeader(24000, 24000));
  eq("PNG: a 100x100 header reads back its size", decodedSize(pngSmall), { width: 100, height: 100 });
  eq("PNG: a 24000x24000 header reads back its size too", decodedSize(pngHuge), { width: 24000, height: 24000 });
  eq("PNG: the small one is accepted", sanitizePortrait(pngSmall), pngSmall);
  eq("PNG: the huge one is refused before it ever decodes", sanitizePortrait(pngHuge), null);

  const jpegSmall = toDataUrl("image/jpeg", jpegHeader(100, 100));
  const jpegHuge = toDataUrl("image/jpeg", jpegHeader(24000, 24000));
  eq("JPEG: an SOF0 header reads back its size", decodedSize(jpegSmall), { width: 100, height: 100 });
  eq("JPEG: a huge SOF0 header reads back its size too", decodedSize(jpegHuge), { width: 24000, height: 24000 });
  eq("JPEG: the small one is accepted", sanitizePortrait(jpegSmall), jpegSmall);
  eq("JPEG: the huge one is refused", sanitizePortrait(jpegHuge), null);

  // A real photo's EXIF (plus a thumbnail) routinely pushes the SOF marker tens of kilobytes
  // in — an APP1 segment, walked past the same way any other segment is. A short scan budget
  // would give up on exactly these files and let the huge one through unread.
  function jpegHeaderWithApp1(width, height, app1Size) {
    const app1 = new Uint8Array(2 + app1Size); // marker (2) + length field, which counts itself
    app1[0] = 0xff; app1[1] = 0xe1;
    app1[2] = (app1Size >> 8) & 0xff;
    app1[3] = app1Size & 0xff;
    // app1[4..] stands in for the EXIF/thumbnail payload — content is never read, only skipped.
    const sof0 = jpegHeader(width, height).slice(2); // drop jpegHeader's own leading SOI
    const bytes = new Uint8Array(2 + app1.length + sof0.length);
    bytes[0] = 0xff; bytes[1] = 0xd8; // SOI
    bytes.set(app1, 2);
    bytes.set(sof0, 2 + app1.length);
    return bytes;
  }
  const jpegHugeWithExif = toDataUrl("image/jpeg", jpegHeaderWithApp1(24000, 24000, 8000));
  const jpegSmallWithExif = toDataUrl("image/jpeg", jpegHeaderWithApp1(100, 100, 8000));
  eq("JPEG: an 8KB APP1 segment ahead of SOF0 is walked past, size read correctly (huge)",
    decodedSize(jpegHugeWithExif), { width: 24000, height: 24000 });
  eq("JPEG: same APP1 size, a real photo's proportions", decodedSize(jpegSmallWithExif), { width: 100, height: 100 });
  eq("JPEG: the huge one is refused even behind 8KB of EXIF", sanitizePortrait(jpegHugeWithExif), null);
  eq("JPEG: the small one still passes with the same EXIF", sanitizePortrait(jpegSmallWithExif), jpegSmallWithExif);

  const webpSmall = toDataUrl("image/webp", webpVp8xHeader(100, 100));
  const webpHuge = toDataUrl("image/webp", webpVp8xHeader(24000, 24000));
  eq("WebP VP8X: a small canvas reads back its size", decodedSize(webpSmall), { width: 100, height: 100 });
  eq("WebP VP8X: a huge canvas reads back its size too", decodedSize(webpHuge), { width: 24000, height: 24000 });
  eq("WebP: the small one is accepted", sanitizePortrait(webpSmall), webpSmall);
  eq("WebP: the huge one is refused", sanitizePortrait(webpHuge), null);

  // A header that doesn't parse (too short, wrong signature) can't say it's oversized, so it's
  // let through rather than dropping an honest file the decoder would have handled anyway.
  eq("an unreadable header comes back null, not a false size", decodedSize("data:image/webp;base64,AAAA"), null);
  eq("and sanitizePortrait accepts it rather than guessing", sanitizePortrait("data:image/webp;base64,AAAA"), "data:image/webp;base64,AAAA");
  eq("a non-string is null, not a throw", decodedSize(42), null);
}

group("Every choice in the wizard can be reached from the keyboard");
{
  // A grid of 13 classes, four to a row. Right walks along the row; Down lands under your
  // finger, not on the next option.
  eq("Right moves to the next option", nextIndex("ArrowRight", 0, 13, 4), 1);
  eq("Down moves a whole row", nextIndex("ArrowDown", 0, 13, 4), 4);
  eq("Up moves back a row", nextIndex("ArrowUp", 5, 13, 4), 1);
  eq("Left moves back one", nextIndex("ArrowLeft", 5, 13, 4), 4);

  // Wrapping: you can never be stuck at an end wondering which way turns back.
  eq("Right at the last option wraps to the first", nextIndex("ArrowRight", 12, 13, 4), 0);
  eq("Left at the first option wraps to the last", nextIndex("ArrowLeft", 0, 13, 4), 12);
  eq("Down past the end wraps round", nextIndex("ArrowDown", 11, 13, 4), 2);
  eq("Up before the start wraps round", nextIndex("ArrowUp", 1, 13, 4), 10);

  eq("Home goes to the first", nextIndex("Home", 7, 13, 4), 0);
  eq("End goes to the last", nextIndex("End", 2, 13, 4), 12);

  // -1 means "not ours": the caller must leave the event alone. Swallowing unknown keys is
  // how a widget eats Tab and traps the person inside it.
  eq("Tab is not ours", nextIndex("Tab", 3, 13, 4), -1);
  eq("a letter is not ours", nextIndex("a", 3, 13, 4), -1);
  eq("an empty grid has nowhere to go", nextIndex("ArrowRight", 0, 0, 4), -1);

  // A single column is the honest fallback when the caller cannot measure the grid: Down
  // behaves like Right rather than jumping somewhere the eye is not.
  eq("without a column count Down is just Right", nextIndex("ArrowDown", 0, 13, 1), 1);
  eq("a nonsense column count still moves by one", nextIndex("ArrowDown", 0, 13, 0), 1);

  // The group holds ONE tab stop, so Tab crosses it instead of visiting all 13.
  eq("Tab lands on the chosen option", tabStopIndex(6, 13), 6);
  eq("with nothing chosen Tab lands on the first", tabStopIndex(-1, 13), 0);
  eq("a stale index falls back to the first", tabStopIndex(99, 13), 0);

  check("Space and Enter both choose", CHOOSE_KEYS.includes(" ") && CHOOSE_KEYS.includes("Enter"));
}

group("Card art paths use the configured extension, under the source the record came from");
{
  // Upstream's versions of these take an id and a flat data/card-art/. This fork's take the
  // RECORD, because the id alone can't say which source folder to look in — so the checks are
  // upstream's, rewritten for that signature. The extension is still one shared constant.
  eq("CARD_ART_EXT", CARD_ART_EXT, "png");
  eq("domainCardArtPath", domainCardArtPath({ id: "core_x" }), `data/srd_2_0/card-art/domain/core_x.${CARD_ART_EXT}`);
  eq("subclassCardArtPath", subclassCardArtPath({ id: "core_y" }, "foundation"),
    `data/srd_2_0/card-art/subclass/core_y-foundation.${CARD_ART_EXT}`);
  eq("ancestryCardArtPath", ancestryCardArtPath({ id: "core_z" }), `data/srd_2_0/card-art/ancestry/core_z.${CARD_ART_EXT}`);
  eq("communityCardArtPath", communityCardArtPath({ id: "core_w" }), `data/srd_2_0/card-art/community/core_w.${CARD_ART_EXT}`);
  eq("a record from another source resolves under that source's folder",
    domainCardArtPath({ id: "hf_x", contentSource: "hopeandfear" }),
    `data/hopeandfear/card-art/domain/hf_x.${CARD_ART_EXT}`);
}

group("Hope & Fear is in data/srd_2_0/, in the edition the SRD published");
{
  // This group used to assert the same content under `the_void_*` ids, because upstream imported
  // daggersearch's `the_void` release and NOTICE.md called it "the Hope & Fear expansion's SRD
  // portion". It isn't: The Void is Darrington Press's PLAYTEST imprint, and every one of those
  // 45 records was revised before it reached the book — the Brawler's Hope feature is Square Up
  // in SRD 2.0 and Staggering Strike in the playtest, which is a different move, not a rename.
  // So the records here are transcribed from SRD 2.0 and the playtest edition is kept out.
  const load = async (name) => (await fetch(`../data/srd_2_0/${name}.json${RUN}`)).json();
  const [classes, subclasses, ancestries, communities, cards, transformations] = await Promise.all(
    ["classes", "subclasses", "ancestries", "communities", "domain-cards", "transformations"].map(load));

  const added = classes.filter((c) => ["ASSASSIN", "BRAWLER", "WARLOCK", "WITCH"].includes(c.name));
  eq("the four classes", added.map((c) => c.name).sort(), ["ASSASSIN", "BRAWLER", "WARLOCK", "WITCH"]);
  check("each of them has two subclasses keyed by class name, the way the wizard looks them up",
    added.every((c) => subclasses.filter((s) => s.class === c.name).length === 2));
  check("the 21 Dread domain cards, levels 1 to 10", cards.filter((c) => c.domain === "DREAD").length === 21);
  check("the six transformations", transformations.length === 6);
  check("the Brawler's Hope feature is the published one, not the playtest's",
    added.find((c) => c.name === "BRAWLER")?.hopeFeature?.name?.["en-US"] === "Square Up");

  const ids = [...classes, ...subclasses, ...ancestries, ...communities, ...cards, ...transformations].map((r) => r.id);
  check("every id names the document it came from", ids.every((id) => id.startsWith("srd_2_0_")));
  check("no playtest record survives the import", !ids.some((id) => id.includes("the_void")));
  check("ids are unique", new Set(ids).size === ids.length);
  check("the whole of SRD 2.0 is here: 24 ancestries, 15 communities, 13 classes, 210 cards",
    ancestries.length === 24 && communities.length === 15 && classes.length === 13 && cards.length === 210);
}

// ---------- report ----------

const results = document.getElementById("results");
let passed = 0;
let failed = 0;

for (const g of groups) {
  const section = document.createElement("div");
  section.className = "group";
  const h = document.createElement("h2");
  h.textContent = g.name;
  section.appendChild(h);

  for (const c of g.checks) {
    if (c.ok) passed++; else failed++;
    const row = document.createElement("div");
    row.className = "check " + (c.ok ? "pass" : "fail");
    const mark = document.createElement("span");
    mark.className = "mark";
    mark.textContent = c.ok ? "✓" : "✗";
    const label = document.createElement("span");
    label.textContent = c.label;
    row.append(mark, label);
    if (!c.ok && c.detail) {
      const detail = document.createElement("div");
      detail.className = "detail";
      detail.textContent = c.detail;
      row.appendChild(detail);
    }
    section.appendChild(row);
  }
  results.appendChild(section);
}

const summary = document.getElementById("summary");
summary.className = "summary " + (failed ? "bad" : "ok");
summary.textContent = failed
  ? `${failed} failed, ${passed} passed`
  : `All ${passed} checks passed`;
