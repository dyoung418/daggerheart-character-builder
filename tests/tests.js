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
} = await import(`../shared/history.js${RUN}`);
const {
  derivedStats,
  effectBonuses,
  evasionTotal,
  hitPointTotal,
  stressTotal,
} = await import(`../shared/derived-stats.js${RUN}`);
const {
  EFFECTS,
  blankAnswer,
  isAnswered,
  unresolvedChoices,
} = await import(`../shared/effects.js${RUN}`);
const {
  deriveSheet,
} = await import(`../shared/sheet-data.js${RUN}`);
const {
  CONDITIONS,
  HOPE_MAX,
  HOPE_START,
  clampState,
  defaultState,
  maxesFromSheet,
  tapBox,
  toggleCondition,
} = await import(`../shared/table-state.js${RUN}`);
const {
  LANGUAGES,
  pickLanguage,
  translator,
} = await import(`../shared/i18n.js${RUN}`);
const {
  EXPORT_FORMAT,
  exportFileName,
  importConflicts,
  mergeImported,
  parseImport,
  serializeCharacters,
} = await import(`../shared/transfer.js${RUN}`);
const {
  MAX_BYTES,
  MAX_EDGE,
  fitWithin,
  isPortrait,
  sanitizePortrait,
} = await import(`../shared/portrait.js${RUN}`);

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

group("Attack uses the weapon's trait, Spellcast names the subclass's");
{
  const twoHanded = derivedStats(statChar({
    equipment: { weaponMode: "two-handed", primaryWeaponId: "staff", secondaryWeaponId: "dagger" },
  }), STAT_DB);
  // knowledge is -1 in the fixture, finesse is 0
  eq("primary attack is the weapon's trait, not Proficiency", twoHanded.primaryAttack.total, -1);
  check("a two-handed build has no secondary attack", twoHanded.secondaryAttack === null);

  const oneHanded = derivedStats(statChar({
    equipment: { weaponMode: "one-handed", primaryWeaponId: "staff", secondaryWeaponId: "dagger" },
  }), STAT_DB);
  eq("the off-hand weapon uses its own trait", oneHanded.secondaryAttack.total, 0);

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

  // "+1 to Spellcast Rolls" is not "+1 to Knowledge": a plain Knowledge roll doesn't get it.
  const chan = derivedStats(statChar({ equipment: { armorId: "core_armor_channeling_armor" } }), FX_DB);
  eq("Channeling armor shows on the Spellcast box", chan.spellcast.display, "Knowledge +1");
  eq("but never on the trait itself", chan.traits.knowledge.total, -1);
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

group("Every id in effects.js still exists in data/");
{
  // The one group that reads data/ for real. An upstream refresh that renames an id would
  // otherwise drop an effect silently: no error, just a number that quietly stops being right.
  const load = async (name) => (await fetch(`../data/${name}.json${RUN}`)).json();
  const [ancestries, subclasses, armors, weapons, cards] = await Promise.all(
    ["ancestries", "subclasses", "armors", "weapons", "domain-cards"].map(load));

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
  ch.equipment = { weaponMode: "two-handed", primaryWeaponId: null, secondaryWeaponId: null, armorId: "gambeson", potionChoice: null };
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

group("Sheet weapons: the off-hand only counts in a one-handed build");
{
  const oneHanded = deriveSheet(sheetChar({ equipment: { weaponMode: "one-handed", primaryWeaponId: "plain", secondaryWeaponId: "modified", armorId: "gambeson" } }), SHEET_DB);
  eq("both weapons print", oneHanded.weapons.length, 2);

  // secondaryWeaponId is still set here — an artifact of switching burden after equipping a
  // two-handed weapon — but weaponMode says two-handed, so it must not appear, same as
  // derivedStats() never looks it up in that case.
  const twoHanded = deriveSheet(sheetChar({ equipment: { weaponMode: "two-handed", primaryWeaponId: "plain", secondaryWeaponId: "modified", armorId: "gambeson" } }), SHEET_DB);
  eq("a two-handed build prints only the primary", twoHanded.weapons.length, 1);
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

group("Table state: boxes marked at the table (HP, Stress, Hope, Armor)");
{
  eq("a new character starts with nothing marked but the two starting Hope, no conditions, no notes",
    defaultState(), { hp: 0, stress: 0, hope: HOPE_START, armor: 0, conditions: [], notes: "" });
  eq("Hope starts at 2 and caps at 6, per the SRD", [HOPE_START, HOPE_MAX], [2, 6]);

  // Tapping is "fill up to here / clear from here on": one tap reaches any value.
  eq("tapping an empty box marks every box up to and including it", tapBox(0, 2), 3);
  eq("tapping the box right after the marked ones marks one more", tapBox(2, 2), 3);
  eq("tapping the last marked box clears just that one", tapBox(3, 2), 2);
  eq("tapping an earlier marked box clears it and everything after", tapBox(5, 1), 1);
  eq("tapping the first box when it's the only one marked clears everything", tapBox(1, 0), 0);

  const maxes = { hp: 6, stress: 6, hope: HOPE_MAX, armor: 3 };
  eq("values within the maxima pass through untouched",
    clampState({ hp: 2, stress: 1, hope: 4, armor: 3 }, maxes), { hp: 2, stress: 1, hope: 4, armor: 3, conditions: [], notes: "" });
  eq("a value above its maximum (e.g. armor swapped for a lighter one) is pulled down to it",
    clampState({ hp: 9, stress: 0, hope: 7, armor: 5 }, maxes), { hp: 6, stress: 0, hope: 6, armor: 3, conditions: [], notes: "" });

  // Conditions and notes ride along in the same state object: a clamp must keep them, or the
  // first tap on an HP box would silently drop every condition marked.
  eq("conditions and notes survive a clamp",
    clampState({ hp: 1, stress: 0, hope: 2, armor: 0, conditions: ["hidden", "restrained"], notes: "owes Rya 2 gold" }, maxes),
    { hp: 1, stress: 0, hope: 2, armor: 0, conditions: ["hidden", "restrained"], notes: "owes Rya 2 gold" });
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
    { hp: 0, stress: 2, hope: 2, armor: 0, conditions: [], notes: "" });
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
  eq("and leaves an existing state alone", ensureLevelFields(kept).state, { hp: 3, stress: 1, hope: 5, armor: 2 });
}

group("JSON transfer: one file format for one character or the whole list");
{
  const a = newCharacter(); a.id = "a"; a.name = "Aster";
  const b = newCharacter(); b.id = "b"; b.name = "Brann Ferro";
  const when = new Date("2026-08-26T10:00:00Z");

  const text = serializeCharacters([a, b], when);
  const parsed = JSON.parse(text);
  eq("the envelope names the format, a version and the export time",
    [parsed.format, parsed.version, parsed.exportedAt], [EXPORT_FORMAT, 1, "2026-08-26T10:00:00.000Z"]);
  eq("and carries the characters as saved", parsed.characters.map((c) => c.id), ["a", "b"]);
  check("the text is pretty-printed so a file is readable and diffable", text.includes("\n  "));

  eq("parsing what serialize wrote gives the characters back", parseImport(text).characters.map((c) => c.name), ["Aster", "Brann Ferro"]);
  eq("and no errors", parseImport(text).errors, []);

  const old = JSON.stringify({ format: EXPORT_FORMAT, version: 1, characters: [{ id: "x", name: "Old", classId: "cls" }] });
  check("an older character is backfilled on import (ensureLevelFields), not rejected",
    parseImport(old).characters[0].levelUps !== undefined && parseImport(old).characters[0].state !== undefined);

  has("not JSON at all is an error", parseImport("nope {").errors, "not valid JSON");
  has("JSON that isn't one of these files is an error", parseImport(JSON.stringify({ hello: 1 })).errors, "not a Daggerheart character file");
  has("a bare character object (no envelope) is refused too", parseImport(JSON.stringify(a)).errors, "not a Daggerheart character file");
  has("an entry without an id is an error", parseImport(JSON.stringify({ format: EXPORT_FORMAT, version: 1, characters: [{ name: "No id" }] })).errors, "missing an id");
  has("an entry that isn't an object is an error", parseImport(JSON.stringify({ format: EXPORT_FORMAT, version: 1, characters: [42] })).errors, "not a character");
  eq("an empty list is fine (nothing to import, no error)", parseImport(JSON.stringify({ format: EXPORT_FORMAT, version: 1, characters: [] })), { characters: [], errors: [] });
  has("a newer version than this app knows is refused, naming the version", parseImport(JSON.stringify({ format: EXPORT_FORMAT, version: 99, characters: [] })).errors, "version 99");
}

group("JSON transfer: merging an import into the saved list, by id");
{
  const a = newCharacter(); a.id = "a"; a.name = "Aster"; a.level = 1;
  const b = newCharacter(); b.id = "b"; b.name = "Brann";
  const a2 = newCharacter(); a2.id = "a"; a2.name = "Aster"; a2.level = 3;
  const c = newCharacter(); c.id = "c"; c.name = "Cato";
  const existing = [a, b];
  const incoming = [a2, c];

  eq("conflicts are the incoming characters whose id is already saved", importConflicts(existing, incoming).map((x) => x.id), ["a"]);
  eq("no conflicts when every id is new", importConflicts(existing, [c]), []);

  const replaced = mergeImported(existing, incoming, "replace");
  eq("replace: the saved copy is overwritten in place, new ones appended",
    replaced.map((x) => `${x.id}:${x.name}:${x.level}`), ["a:Aster:3", "b:Brann:1", "c:Cato:1"]);

  let n = 0;
  const copied = mergeImported(existing, incoming, "copy", () => `new${++n}`);
  eq("copy: the saved copy stays, the incoming one gets a fresh id and a marker in its name",
    copied.map((x) => `${x.id}:${x.name}:${x.level}`), ["a:Aster:1", "b:Brann:1", "new1:Aster (imported):3", "c:Cato:1"]);

  check("merging never mutates the saved list", existing.length === 2 && existing[0].level === 1);
  eq("importing the same file twice with replace is idempotent",
    mergeImported(replaced, incoming, "replace").map((x) => x.id), ["a", "b", "c"]);

  const stamp = "2026-08-26";
  eq("one character is named after itself", exportFileName([b], stamp), "brann.json");
  eq("odd characters in the name become dashes", exportFileName([{ name: "Ser Aëlwyn / the Bold!" }], stamp), "ser-aelwyn-the-bold.json");
  eq("a nameless character still gets a file name", exportFileName([{ name: "" }], stamp), "character.json");
  eq("the whole list is named by date, like the CSV", exportFileName([a, b], stamp), `daggerheart-characters-${stamp}.json`);
}

group("Hope & Fear (the_void release of daggerheart-data) is in data/");
{
  const load = async (name) => (await fetch(`../data/${name}.json${RUN}`)).json();
  const [classes, subclasses, ancestries, communities, cards] = await Promise.all(
    ["classes", "subclasses", "ancestries", "communities", "domain-cards"].map(load));
  const voidClasses = classes.filter((c) => c.id.startsWith("the_void_class_"));
  eq("the four classes", voidClasses.map((c) => c.name).sort(), ["ASSASSIN", "BRAWLER", "WARLOCK", "WITCH"]);
  check("each of them has two subclasses keyed by class name, the way the wizard looks them up",
    voidClasses.every((c) => subclasses.filter((s) => s.class === c.name).length === 2));
  check("the 21 Dread domain cards, levels 1 to 10", cards.filter((c) => c.domain === "DREAD").length === 21);
  check("the six ancestries and six communities",
    ancestries.filter((a) => a.id.startsWith("the_void_")).length === 6 && communities.filter((a) => a.id.startsWith("the_void_")).length === 6);
  check("no id collides with the core set", new Set(classes.map((c) => c.id)).size === classes.length && new Set(cards.map((c) => c.id)).size === cards.length);
  check("the core set is still complete (9 classes, 189 cards)", classes.filter((c) => c.id.startsWith("core_")).length === 9 && cards.filter((c) => c.id.startsWith("core_")).length === 189);
}

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
  eq("a portrait makes the round trip through an export file",
    parseImport(serializeCharacters([shipped])).characters[0].portrait, webp);
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
