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
  availableOptionKeys,
  blankSlotsUsed,
  ensureLevelFields,
  extraCardLevelCap,
  isLevelAchievement,
  nextSubclassTier,
  openSlotTiers,
  remainingSlots,
  slotsInTier,
  slotsPerPick,
  subclassTiersUpTo,
  tierForLevel,
  totalSlotsForOption,
  usedSlotsForOption,
} = await import(`../shared/advancement.js${RUN}`);
const {
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
  derivedStats,
  effectBonuses,
  effectExperienceBonuses,
  evasionTotal,
  hitPointTotal,
  stressTotal,
} = await import(`../shared/derived-stats.js${RUN}`);
const {
  EFFECTS,
  blankAnswer,
  ignoresBurden,
  isAnswered,
  unresolvedChoices,
} = await import(`../shared/effects.js${RUN}`);
const {
  deriveSheet,
} = await import(`../shared/sheet-data.js${RUN}`);
const {
  UNARMED,
  UNARMORED,
  burdenWarning,
  damageText,
  featureLine,
  enumLabel,
  groupByTier,
  weaponStats,
} = await import(`../shared/gear.js${RUN}`);
const {
  CSV_COLUMNS,
  buildCsv,
  csvField,
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
eq("tier 2 offers exactly the six options printed there", availableOptionKeys(3).sort(),
  ["domainCard", "evasion", "experience", "hitPoint", "stress", "traits"]);
eq("tier 3 adds subclass and proficiency", availableOptionKeys(5).sort(),
  ["domainCard", "evasion", "experience", "hitPoint", "proficiency", "stress", "subclass", "traits"]);
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
  eq("remaining at level 6", remainingSlots(used, "traits", 6), 2);
  eq("an exhausted tier is no longer offered", openSlotTiers(used, "traits", 6), [3]);
  eq("tiers above your own are never offered", openSlotTiers(blankSlotsUsed(), "traits", 3), [2]);
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
  eq("the row is now full", remainingSlots(ch.advancementSlotsUsed, "hitPoint", 2), 0);
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
  eq("both traits are offered, neither is chosen", bare.primaryAttack.display, "Strength +2 / Finesse 0");
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
  const vitality = EFFECTS["core_domain_card_vitality"].choice;
  eq("a blank answer isn't an answer", isAnswered(vitality, blankAnswer()), false);
  eq("one of two isn't either", isAnswered(vitality, { optionIds: ["stress"] }), false);
  eq("two of two is", isAnswered(vitality, { optionIds: ["stress", "hitPoint"] }), true);

  const motc = EFFECTS["core_domain_card_master_of_the_craft"].choice;
  eq("+3 to one needs one Experience named",
    isAnswered(motc, { optionId: "one", experienceIds: ["e1"] }), true);
  eq("+2 to two needs two", isAnswered(motc, { optionId: "two", experienceIds: ["e1"] }), false);
}

group("Every id in effects.js still exists in data/srd/");
{
  // The one group that reads data/ for real. An upstream refresh that renames an id would
  // otherwise drop an effect silently: no error, just a number that quietly stops being right.
  const load = async (name) => (await fetch(`../data/srd/${name}.json${RUN}`)).json();
  const [ancestries, subclasses, armors, weapons, cards, classes] = await Promise.all(
    ["ancestries", "subclasses", "armors", "weapons", "domain-cards", "classes"].map(load));

  // ignoresBurden() matches a class feature by name rather than by an EFFECTS key, so the check
  // below can't cover it. Renamed upstream, the Warrior would silently start getting a burden
  // warning the book says they're exempt from.
  check("the Warrior still has Combat Training to ignore burden with",
    ignoresBurden({ classId: "core_class_warrior" }, { classes }));

  const known = new Set();
  const featureKeys = (list, prefix) => {
    for (const item of list) {
      for (const f of item.features || []) {
        known.add(`${item.id}:${f.name["en-US"]}`);
        known.add(`${prefix}:${f.name["en-US"]}`);
      }
    }
  };
  featureKeys(ancestries, "ancestry");
  featureKeys(armors, "armor");
  featureKeys(weapons, "weapon");
  for (const s of subclasses) for (const tier of ["foundation", "specialization", "mastery"]) {
    if (s[tier]) known.add(`${s.id}:${tier}`);
  }
  for (const c of cards) known.add(c.id);

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
  const classes = await (await fetch(`../data/srd/classes.json${RUN}`)).json();
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
  eq("and both traits the GM can call for", barehanded.weapons[0].attack, "Strength +2 / Finesse 0");
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

// One character's row as { header: value }, which is how the renderer reads it.
function exportRow(ch, opts) {
  const rows = parseCsv(buildCsv([ch], CSV_DB, opts));
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
}

group("Feature prose is exported, not just feature names");
{
  const row = exportRow(csvChar());
  eq("a community feature comes back name-first", row["Community feature text"], "Privilege: You have advantage on rolls to consort with nobles.");
  eq("and its name is exported on its own too", row["Community feature name"], "Privilege");

  // Only the feature the player picked, not both of the ancestry's.
  eq("a heritage exports the chosen feature", row["Heritage feature name"], "Purposeful Design");

  // A class's domains are derivable from its name, and exported anyway: the renderer can't
  // read classes.json.
  eq("the class's domains are spelled out", row["Domains"], "Valor, Blade");
  eq("the Hope feature is a pair like any other", row["Class Hope feature text"], "Frontline Tank: Spend 3 Hope to clear 2 Armor Slots.");

  // A list-only feature used to export an empty cell, because featureText read only paragraphs.
  const classText = row["Class feature text"].split("\n");
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
  eq("a mixed heritage names both ancestries", mixed["Heritage"], "Clank + Human");
  eq("both chosen features are exported, one per line", mixed["Heritage feature name"], "Efficient\nHigh Stamina");
  eq("and each line of text says which feature it is",
    mixed["Heritage feature text"], "Efficient: Choose a long rest move.\nHigh Stamina: Gain an additional Stress slot.");
}
{
  // Upgrading a subclass adds a card rather than replacing the one below it, so the tiers below
  // always print — and the tiers above haven't happened yet.
  const foundation = exportRow(csvChar());
  eq("a Foundation character exports their Foundation feature", foundation["Foundation feature name"], "Unwavering");
  eq("and nothing for the tier they haven't reached", foundation["Specialization feature text"], "");

  const mastered = exportRow(csvChar({ subclassTier: "mastery" }));
  eq("at Mastery the tiers below are still theirs", mastered["Foundation feature name"], "Unwavering");
  eq("a tier holding two features exports both", mastered["Specialization feature name"], "Expert Training\nBattle-Bonded");
  eq("with the texts in the same order", mastered["Specialization feature text"].split("\n").length, 2);
}

group("A weapon exports the numbers the sheet prints beside it");
{
  const armed = exportRow(csvChar({
    equipment: { primaryWeaponId: "longsword", secondaryWeaponId: null, armorId: "gambeson", potionChoice: "potion" },
  }));
  eq("the primary weapon's name", armed["Primary weapon name"], "Longsword");
  eq("its range, in the sheet's words rather than the JSON's", armed["Primary range"], "Melee");
  eq("its damage, modifier included", armed["Primary damage"], "d10+3 phy");
  eq("and its feature", armed["Primary feature"], "Reliable: +1 to attack rolls.");
  eq("an empty secondary slot exports blanks, not 'undefined'",
    [armed["Secondary weapon name"], armed["Secondary range"], armed["Secondary damage"], armed["Secondary feature"]], ["", "", "", ""]);
  eq("armor is named and its feature exported", [armed["Armor name"], armed["Armor feature"]], ["Gambeson", "Flexible: +1 to Evasion."]);
  eq("Hope is two numbers rather than the string 2/6", [armed["Hope"], armed["Hope Max"]], ["2", "6"]);
}
{
  // Bare hands are a choice with rules of their own, not an empty slot.
  const barehanded = exportRow(csvChar({
    equipment: { primaryWeaponId: UNARMED, secondaryWeaponId: null, armorId: UNARMORED, potionChoice: null },
  }));
  eq("an unarmed attack still has a weapon's columns",
    [barehanded["Primary weapon name"], barehanded["Primary range"], barehanded["Primary damage"]], ["Unarmed", "Melee", "d4 phy"]);
  eq("and no feature", barehanded["Primary feature"], "");
  eq("choosing to wear nothing says so", barehanded["Armor name"], "Unarmored");
  eq("with no armor feature to report", barehanded["Armor feature"], "");
}

group("A domain card says what it does, not just what it's called");
{
  const row = exportRow(csvChar());
  const cell = row["Domain Card 1"].split("\n");
  eq("the card names itself first", cell[0], "A Soldier's Bond");
  eq("then domain, type, level and recall cost, in that order", cell[1], "Blade · Ability · Level 2 · Recall Cost 1");
  eq("a blank line separates the details from the text", cell[2], "");
  eq("and then what the card does", cell[3], "Once per long rest, when you compliment someone, you can both gain 3 Hope.");

  // The collection's order, not the loadout/vault split: Book of Ava is vaulted and still second.
  eq("every card the character owns gets a column, in collection order",
    [1, 2, 3].map((n) => row[`Domain Card ${n}`].split("\n")[0]),
    ["A Soldier's Bond", "Book of Ava", "Arcana-Touched"]);
  eq("a character with fewer cards than columns trails blanks", row["Domain Card 4"], "");

  // The name-only columns say the same as they always did.
  eq("the loadout list still names what's in the loadout", row["Domain Cards (loadout)"], "A Soldier's Bond; Arcana-Touched");
  eq("and the vault list what's set aside", row["Domain Cards (vault)"], "Book of Ava");
}
{
  const blocks = exportRow(csvChar())["Domain Card 2"].split("\n\n");
  eq("a Grimoire's three features are three blocks after the heading", blocks.length, 4);
  eq("each named, the way every other feature cell names them", blocks[1], "Power Push: Make a Spellcast Roll against a target within Melee range.");
  eq("down to the last", blocks[3], "Ice Spike: Make a Spellcast Roll (12) to summon a large ice spike.");

  const bulleted = exportRow(csvChar())["Domain Card 3"].split("\n\n");
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
    vitality["Domain Card 1"].split("\n\n")[1].split("\n"),
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
  eq("a Recall Cost of 0 is stated rather than left out", free["Domain Card 1"].split("\n")[1], "Splendor · Spell · Level 1 · Recall Cost 0");
}
{
  // A file written by a browser whose data/ knew a card this one doesn't. Dropping it would
  // renumber every card after it, and it's still a card the player owns.
  const stranger = exportRow(csvChar({
    domainCardIds: ["fx_bond", "core_domain_card_from_the_future", "fx_free"], domainVaultIds: [],
  }));
  eq("a card this browser doesn't have is exported as its id", stranger["Domain Card 2"], "core_domain_card_from_the_future");
  eq("and the cards after it keep their columns", stranger["Domain Card 3"].split("\n")[0], "Wellspring");
}
{
  // Which cards you own doesn't depend on where they're sitting, so the permanent-only export —
  // which vaults every card — has to leave these columns alone.
  const ch = csvChar();
  eq("the card columns read the same in both exports",
    exportRow(ch)["Domain Card 2"], exportRow(ch, { loadout: false })["Domain Card 2"]);
}
{
  // Fourteen is what the rules can give you, and it's a floor rather than a width: a collection
  // this app couldn't have built still exports whole instead of being cut off.
  const hoarder = csvChar({ domainCardIds: Array.from({ length: 16 }, () => "fx_bond"), domainVaultIds: [] });
  const rows = parseCsv(buildCsv([hoarder, csvChar()], CSV_DB));
  eq("sixteen cards means sixteen card columns", rows[0].filter((h) => h.startsWith("Domain Card ")).length, 16);
  eq("the last is named for its position", rows[0][rows[0].length - 1], "Domain Card 16");
  eq("and every row is as wide as the header", [rows[1].length, rows[2].length], [rows[0].length, rows[0].length]);
  eq("including the character who has three", rows[2][rows[0].length - 1], "");
}

group("Two exports, and the column that tells them apart");
{
  const untouchable = csvChar({ domainCardIds: ["core_domain_card_untouchable"], domainVaultIds: [] });
  const withLoadout = exportRow(untouchable);
  const permanent = exportRow(untouchable, { loadout: false });

  // Agility is +1 in the fixture, and Untouchable is half of it rounded up.
  eq("with the loadout, the card's bonus is in the number", withLoadout["Evasion"], "10");
  eq("without it, the number is what's permanently true", permanent["Evasion"], "9");
  eq("and each row says which it is", [withLoadout["Includes loadout bonuses"], permanent["Includes loadout bonuses"]], ["true", "false"]);

  // Permanent only means every card is in the vault — so the card lists move rather than empty.
  eq("with the loadout, the card is in the loadout", withLoadout["Domain Cards (loadout)"], "Untouchable");
  eq("without it, the loadout is empty", permanent["Domain Cards (loadout)"], "");
  eq("and the card is reported in the vault instead", permanent["Domain Cards (vault)"], "Untouchable");
}
{
  // Vitality is permanent and tells you to vault it, so it applies either way.
  const vitality = csvChar({
    domainCardIds: ["core_domain_card_vitality"], domainVaultIds: [],
    effectChoices: { core_domain_card_vitality: { optionIds: ["stress", "hitPoint"] } },
  });
  eq("a permanent card counts in both exports",
    [exportRow(vitality)["Hit Points"], exportRow(vitality, { loadout: false })["Hit Points"]], ["8", "8"]);
}
{
  // Bare Bones is a loadout card whose effect is a base rather than a bonus. A base a card was
  // standing in for goes with the card: what's left is the SRD's plain unarmored rule.
  const bones = csvChar({
    equipment: { primaryWeaponId: null, secondaryWeaponId: null, armorId: UNARMORED, potionChoice: null },
    domainCardIds: ["core_domain_card_bare_bones"], domainVaultIds: [],
  });
  eq("with the loadout, Bare Bones stands in for armor",
    [exportRow(bones)["Armor Score"], exportRow(bones)["Major Threshold"], exportRow(bones)["Severe Threshold"]], ["5", "10", "20"]);
  const permanent = exportRow(bones, { loadout: false });
  eq("without it, an unarmored character is unarmored",
    [permanent["Armor Score"], permanent["Major Threshold"], permanent["Severe Threshold"]], ["0", "1", "2"]);
}

group("The GM's spreadsheet is handed data, never a program");
{
  // Quoting alone doesn't stop this: a spreadsheet evaluates a leading = even inside quotes.
  const hostile = exportRow(csvChar({ name: '=HYPERLINK("http://evil","click")' }));
  check("a name that looks like a formula is neutralised", hostile["Name"].startsWith("'="), `got ${hostile["Name"]}`);
  eq("a quote inside a field survives the round trip", hostile["Name"].includes('"http://evil"'), true);

  // Knowledge is -1 in the fixture. Prefixing a plain number would turn every negative trait
  // into text and break sorting for the GM.
  eq("a negative number is left alone", exportRow(csvChar())["Knowledge"], "-1");
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
  has("the GM's CSV is named as the GM's CSV", why('﻿"Name","Pronouns","Level"\r\n'), "GM's CSV");
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
// data/ holds a folder per source now — data/srd/ plus whatever else exists — and the merge that
// turns them into one `db` is a pure function over already-fetched objects, so it's tested the
// same way everything else here is: hand-written payloads, no fetching.

const srcClass = (id, name, extra = {}) => ({ id, name, domains: ["BLADE"], ...extra });
const srcCard = (id, name, extra = {}) => ({ id, name: { "en-US": name }, domain: "BLADE", level: 1, ...extra });
const source = (name, records, effects) => ({ name, label: name, records, effects });

group("The list of content folders survives a bad manifest");
{
  eq("a plain list is read as written", parseManifest('["srd","void"]'), ["srd", "void"]);
  eq("junk names nothing rather than throwing", parseManifest("{oh no"), []);
  eq("a JSON object isn't a list of folders", parseManifest('{"srd":true}'), []);
  // The name goes straight into a fetch URL, so anything that could climb out of data/ is dropped.
  eq("a name that could escape data/ is dropped", parseManifest('["srd","../../etc","a/b"]'), ["srd"]);
  eq("the tracked list comes first, and repeats don't move it",
    combineManifests(["srd"], ["void", "srd"]), ["srd", "void"]);

  const info = parseSourceInfo('{"label":"Void","files":["domain-cards","effects","nope"]}', "void");
  eq("a source says what it holds", info.files, ["domain-cards", "effects"]);
  eq("and what to call it", info.label, "Void");
  eq("a folder with no label is called after itself", parseSourceInfo('{"files":[]}', "homebrew").label, "homebrew");
  eq("an unusable source.json is skipped, not guessed at", parseSourceInfo("{", "void"), null);
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
    source("void", { "domain-cards": [srcCard("core_a", "Untouchable (revised)")] }),
  ]);
  eq("the revision wins", db.domainCards.map((c) => c.name["en-US"]), ["Untouchable (revised)", "Whirlwind"]);
  eq("in the position the original held", db.domainCards[0].id, "core_a");
  eq("and every record knows where it came from", db.domainCards.map((c) => c.contentSource), ["void", "srd"]);
  eq("the panel reports it, so an accidental duplicate is visible",
    report.collisions, [{ file: "domain-cards", id: "core_a", from: "void", over: "srd", byName: false }]);

  // A class's real key is its uppercase name, not its id: create.js joins subclasses on it. Two
  // Bards under different ids would put two identical tiles in the picker with every Bard
  // subclass appearing under both.
  const byName = mergeSources([
    source("srd", { classes: [srcClass("core_class_bard", "BARD")] }),
    source("void", { classes: [srcClass("void_class_bard", "BARD")] }),
  ]);
  eq("a class with the same name collapses even under a new id", byName.db.classes.length, 1);
  eq("the later one being the survivor", byName.db.classes[0].id, "void_class_bard");
  eq("and it's reported as the name clash it is", byName.report.collisions[0].byName, true);
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
  // effect-choice.js renders anything that isn't "benefit" as an Experience picker rather than
  // failing, so an unrecognised kind would silently ask the wrong question.
  check("a choice of an unknown kind is refused rather than rendered as the wrong picker",
    validateEffectEntry({ choice: { prompt: "?", kind: "vibes", options: [{ id: "a", label: "A" }] } }) !== null);
  check("`when` is refused, because JSON can't carry the function it needs",
    validateEffectEntry({ evasion: 1, when: true }) !== null);

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
    source("void", { "domain-cards": [srcCard("void_a", "B")] }),
  ]);
  eq("with nothing switched off, everything is offered",
    visibleRecords(db.domainCards, new Set()).map((c) => c.id), ["core_a", "void_a"]);
  eq("a switched-off source leaves the pickers",
    visibleRecords(db.domainCards, new Set(["void"])).map((c) => c.id), ["core_a"]);
  eq("the srd is a source like any other and can go too",
    visibleRecords(db.domainCards, new Set(["srd", "void"])).map((c) => c.id), []);
  // Every fixture in this file, and every db built by something that predates content sources,
  // is untagged. Dropping those would break far more than it protected.
  eq("a record with no source is always offered",
    visibleRecords([{ id: "plain" }], new Set(["void"])).map((c) => c.id), ["plain"]);
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

  const orphan = { ...whole, classId: "void_class_witch", equipment: { armorId: "hb_armor_ironhide" } };
  eq("one built on a folder you no longer have names what's missing",
    unresolvedReferences(orphan, db), [{ kind: "class", id: "void_class_witch" }, { kind: "armor", id: "hb_armor_ironhide" }]);

  // Unarmed and Unarmored are stored values with no record behind them, so they can't be missing.
  eq("the equipment sentinels aren't missing content",
    unresolvedReferences({ equipment: { primaryWeaponId: UNARMED, armorId: UNARMORED } }, db,
      { sentinels: [UNARMED, UNARMORED] }), []);

  // The roster leaves levelled cards to history.js, which already says "that card no longer
  // exists" about them. The import review runs before any of that and wants one honest count.
  const levelled = { ...whole, domainCardIds: ["core_card_a", "void_card_b"] };
  eq("cards taken at a level up are left to the level history", unresolvedReferences(levelled, db), []);
  eq("unless it's the import review asking",
    unresolvedReferences(levelled, db, { includeAllCards: true }), [{ kind: "domain card", id: "void_card_b" }]);
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
