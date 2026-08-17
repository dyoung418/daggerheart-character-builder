// Advancement rules (Core Rulebook p.109-111). The printed table below is the same for every
// class — but it is no longer the whole table: a class or subclass feature may declare a row of
// its own ("Once per tier, you can increase your Combo Die by one step as a level advancement
// option"), so what a particular character is offered is built per character by
// advancementOptions() rather than read off a constant.
//
// Nothing here knows where a declared row comes from. shared/effects.js reads the declarations
// (it's the file allowed to know content) and hands them in, which is also why the dependency
// runs that way: effects.js imports tierForLevel from here, so here can't import effects.js.
//
// Multiclassing is one of the printed rows below rather than something a source declares, for
// the reason stated there: it costs both of a level's points, and optionCost/slotsPerPick answer
// by key alone because the replay resolves a recorded pick with no content in hand.

// NEW slots that unlock starting at each tier (cumulative, not replaced: at tier 3
// you have tier 2's slots plus the new tier 3 ones, and so on).
export const TIER_SLOT_TABLE = {
  traits: { 2: 3, 3: 3, 4: 3 },
  hitPoint: { 2: 2, 3: 2, 4: 2 },
  stress: { 2: 2, 3: 2, 4: 2 },
  experience: { 2: 1, 3: 1, 4: 1 },
  domainCard: { 2: 1, 3: 1, 4: 1 },
  evasion: { 2: 1, 3: 1, 4: 1 },
  subclass: { 3: 1, 4: 1 },
  proficiency: { 3: 2, 4: 2 }, // requires marking both slots together: costs the entire level up's 2 "points"
  // Drawn on the sheet exactly like Proficiency — two boxes inside a black box — and it costs the
  // whole level for the same reason. Available from level 5, which is why it starts at tier 3.
  multiclass: { 3: 2, 4: 2 },
};

// Options that cross each other out, and where. The sheet says it twice, once from each side:
// "Take an upgraded subclass card. Then cross out the multiclass option for this tier", and
// "Multiclass … then cross out an unused 'Take an upgraded subclass card' and the other multiclass
// option on this sheet."
//
// So: per tier you may upgrade your subclass OR multiclass, never both; and multiclassing anywhere
// crosses out every other multiclass slot, which is what makes it once per career. A tier whose
// subclass slot is already spent needs no rule of its own — spending it is what crossed out that
// tier's multiclass in the first place.
//
// Consequence worth knowing, and the designers': having multiclassed you can still upgrade a
// subclass in the OTHER tier, taking whatever card is next — so Specialization is reachable and
// Mastery never is.
//
// This lives here, beside optionCost, on the same footing: a cross-out is a rule about printed
// rows, decided from the marked-slot counts alone. No content, no db.
export const CROSS_OUTS = {
  multiclass: [{ key: "subclass", scope: "tier" }, { key: "multiclass", scope: "otherTiers" }],
  subclass: [{ key: "multiclass", scope: "tier" }],
};

// Tiers that have advancement slots at all (tier 1 is level 1: no level ups yet).
export const SLOT_TIERS = [2, 3, 4];

// Not exported: a label is a property of a row, and advancementOptions() below is the only way
// to ask for one. Two ways to get a label is how a declared row's row printed "undefined".
const ADVANCEMENT_LABELS = {
  traits: "+1 to two unmarked traits",
  hitPoint: "+1 permanent Hit Point slot",
  stress: "+1 permanent Stress slot",
  experience: "+1 to two existing Experiences",
  domainCard: "Extra domain card (in addition to the one guaranteed every level)",
  evasion: "+1 permanent Evasion",
  subclass: "Upgrade subclass card (Foundation → Specialization → Mastery)",
  proficiency: "+1 Proficiency — uses both picks for this level",
  multiclass: "Multiclass — a second class, one of its domains, and a foundation card",
};

// The options that take the whole level: two of its two choice points, and both of that tier's
// slots for the row. Answered by key alone, because the replay reads a recorded pick with no
// content in hand — which is also why a source can't declare an option that costs two.
const TWO_POINT_OPTIONS = new Set(["proficiency", "multiclass"]);

// Cost in "choice points": every level up grants 2 points; a normal option costs 1.
export function optionCost(key) {
  return TWO_POINT_OPTIONS.has(key) ? 2 : 1;
}

export function tierForLevel(level) {
  if (level <= 1) return 1;
  if (level <= 4) return 2;
  if (level <= 7) return 3;
  return 4;
}

// Highest domain card level the "extra domain card" option allows, per the tier of the
// slot being marked. The character sheet spells this out on the option itself: the tier 2
// slot reads "...of your level or lower ... (up to level 4)", tier 3 "(up to level 7)",
// tier 4 has no parenthetical. So two limits apply at once — your current level, and the
// cap of the slot you mark — which differ whenever a lower tier's slot is left unused and
// spent later. The guaranteed card gained every level has no tier cap, only your level.
export const TIER_CARD_CAP = { 2: 4, 3: 7, 4: 10 };

export function extraCardLevelCap(level, slotTier) {
  return Math.min(level, TIER_CARD_CAP[slotTier] ?? level);
}

// "Whenever you have the option to acquire a new domain card, you can choose from cards at or
// below half your current level (rounded up) from the domain you chose when you selected the
// multiclass advancement." Rounded up because the SRD rounds up unless it says otherwise.
export function halfLevelCap(level) {
  return Math.ceil((level || 0) / 2);
}

/**
 * Which domains this character may take cards from, and the highest card level allowed in each.
 * The single statement of it, read by the picker on the level up screen and by the validation
 * that judges what it recorded — so the two cannot disagree about a card.
 *
 * `baseCap` is whatever limit the caller already had: your level for the card every level grants,
 * extraCardLevelCap for an advancement slot, the given-up card's level for an exchange. Your own
 * class's domains take it as-is; the multiclass domain takes the lower of it and half your level.
 *
 * A domain reachable both ways keeps the BETTER cap. Multiclassing into a class that shares one of
 * your domains must never make a card you could already take illegal.
 *
 * Nothing here needs `db`: the multiclass stores its domain as a plain string, so a character
 * imported into a browser without that class keeps every card they legally took.
 *
 * @returns {{ domains: string[], capFor: (domain: string) => number|null }} null = no access
 */
export function domainAccess(classDomains, multiclass, level, baseCap) {
  const caps = {};
  for (const domain of classDomains || []) caps[domain] = baseCap;
  const extra = multiclass?.domain;
  if (extra) {
    const capped = Math.min(baseCap, halfLevelCap(level));
    caps[extra] = caps[extra] == null ? capped : Math.max(caps[extra], capped);
  }
  return { domains: Object.keys(caps), capFor: (domain) => caps[domain] ?? null };
}

// Hit Point and Stress slots are both capped at 12. In practice only Hit Points can reach
// it (Stress starts at 6, and the 6 slots available across all tiers land exactly on 12).
export const MAX_HIT_POINT_SLOTS = 12;
export const MAX_STRESS_SLOTS = 12;

// Every character starts with 6 Stress slots regardless of class, unlike Hit Points and
// Evasion which come from classes.json.
export const BASE_STRESS_SLOTS = 6;

// Hope is the same for everyone and nothing in the catalogue moves it, which is why it has no
// EFFECT_STAT_KEYS entry and no breakdown — but it's still printed on three screens and exported,
// so the two numbers are stated here rather than as "2 / 6" in each of them.
export const STARTING_HOPE = 2;
export const MAX_HOPE = 6;

// "A PC's Armor Score can't exceed 12." (SRD, Armor)
export const MAX_ARMOR_SCORE = 12;

export function slotsInTier(key, tier) {
  return TIER_SLOT_TABLE[key]?.[tier] || 0;
}

// Proficiency and Multiclass mark both of their tier's slots at once.
export function slotsPerPick(key) {
  return TWO_POINT_OPTIONS.has(key) ? 2 : 1;
}

export function totalSlotsForOption(key, tier) {
  let total = 0;
  for (let t = 2; t <= tier; t++) total += slotsInTier(key, t);
  return total;
}

// Slot usage is tracked per option AND per tier, because which slot you mark can matter:
// see extraCardLevelCap. Shape: { traits: { 2: 3, 3: 1, 4: 0 }, ... }
export function blankSlotsUsed() {
  const state = {};
  for (const key of Object.keys(TIER_SLOT_TABLE)) {
    state[key] = { 2: 0, 3: 0, 4: 0 };
  }
  return state;
}

export function usedSlotsForOption(slotsUsed, key) {
  const perTier = slotsUsed?.[key];
  if (!perTier) return 0;
  return SLOT_TIERS.reduce((sum, tier) => sum + (perTier[tier] || 0), 0);
}

// Slots still free on a row: what it has, less what's been marked, less what's been struck through.
// The crossed part matters beyond the grid — it's what stops the level up screen believing a
// character has points left to spend on boxes nobody can ever mark.
export function remainingSlots(option, slotsUsed) {
  return option.total - usedSlotsForOption(slotsUsed, option.key) - (option.crossedTotal ?? 0);
}

/**
 * Which rows are struck through in which tiers, given the slots marked so far — `key -> tier ->
 * the key that struck it out`.
 *
 * Derived, never stored. Remove the level that multiclassed and the mark goes with it, so the
 * cross-out goes too; and because the level up screen builds its rows from the marks made plus
 * the ones on screen, striking through happens the moment a box is clicked and unwinds the moment
 * it's clicked again.
 */
export function crossedOutTiers(used) {
  const crossed = {};
  const strike = (key, tier, by) => ((crossed[key] ||= {})[tier] = by);
  for (const [key, rules] of Object.entries(CROSS_OUTS)) {
    for (const tier of SLOT_TIERS) {
      if (!(used?.[key]?.[tier] > 0)) continue;
      for (const rule of rules) {
        if (rule.scope === "tier") strike(rule.key, tier, key);
        else for (const other of SLOT_TIERS) if (other !== tier) strike(rule.key, other, key);
      }
    }
  }
  return crossed;
}

// The one option row that says what it gets you rather than just what it is: the extra card's
// level cap depends on which tier's slot you mark, and a player choosing between two boxes is
// choosing between two caps.
function coreLabel(key, tiers) {
  if (key !== "domainCard") return ADVANCEMENT_LABELS[key];
  return `Extra domain card (${tiers.map((tier) => `≤${extraCardLevelCap(10, tier)}`).join(" / ")})`;
}

/**
 * Every advancement row this character is offered at this level, in the order the grid draws
 * them: the printed table first, then whatever a source declared, then a row for any option
 * they have already marked that neither table knows about.
 *
 * That last group is the point of building this per character. A declaration lives in content,
 * and content moves — a folder is renamed, a character is imported into a browser without the
 * source, a feature is renamed upstream. A slot that was spent is spent, and docs/adding-content.md
 * §9 promises switching a source off doesn't unbuild characters, so a row nobody can explain any
 * more is still drawn, still full, and still labelled with what the pick recorded.
 *
 * @param {number} level
 * @param {object} [opts]
 * @param {Array<{key,label,slots,advances}>} [opts.declared] rows a source declared, from effects.js
 * @param {object} [opts.used] slotsUsed-shaped: { key: { 2, 3, 4 } }
 * @param {object} [opts.labels] key -> the label a pick recorded, for rows nothing declares now
 */
export function advancementOptions(level, { declared = [], used = null, labels = null } = {}) {
  const tiers = SLOT_TIERS.filter((tier) => tier <= tierForLevel(level));
  const rows = new Map();
  const struck = crossedOutTiers(used);

  const push = (key, label, declaredSlots, source, extra = {}) => {
    // First writer wins, and the printed table is written first: a source can add a row, never
    // redefine one. (A card whose id is literally "traits" is cheap to rule out here.)
    if (rows.has(key)) return;
    const slots = {};
    const crossedOut = {};
    const crossedBy = {};
    for (const tier of SLOT_TIERS) {
      // A marked slot is drawn whatever the table now says. Same instinct as splitFlatSlotTotals:
      // keep an over-count rather than quietly hand back a slot somebody already spent.
      slots[tier] = Math.max(declaredSlots?.[tier] || 0, used?.[key]?.[tier] || 0);
      // A cross-out takes whatever is left of the row in that tier — never a box already marked,
      // which is what keeps used + crossed within the row and remainingSlots off negative numbers.
      const by = struck[key]?.[tier] || null;
      crossedOut[tier] = by ? Math.max(0, slots[tier] - (used?.[key]?.[tier] || 0)) : 0;
      crossedBy[tier] = crossedOut[tier] > 0 ? by : null;
    }
    const total = tiers.reduce((sum, tier) => sum + slots[tier], 0);
    if (total <= 0) return; // nothing at this level: tier 1, or a row that starts higher up
    rows.set(key, {
      key,
      label,
      slots,
      total,
      crossedOut,
      crossedBy,
      crossedTotal: tiers.reduce((sum, tier) => sum + crossedOut[tier], 0),
      // Both answered by key, never declared — see the note at the top of this file.
      cost: optionCost(key),
      slotsPerPick: slotsPerPick(key),
      source,
      ...extra,
    });
  };

  for (const key of Object.keys(TIER_SLOT_TABLE)) push(key, coreLabel(key, tiers), TIER_SLOT_TABLE[key], "core");
  // `hint` is display-only and deliberately NOT part of the label: the label is what a pick
  // records, and a transition is true at the moment it's shown, not forever.
  for (const row of declared) {
    push(row.key, row.label, row.slots, "declared", { advances: row.advances || null, hint: row.hint || "" });
  }
  for (const key of Object.keys(used || {})) push(key, labels?.[key] || key, null, "orphan");

  return [...rows.values()];
}

export function optionFor(options, key) {
  return (options || []).find((option) => option.key === key) || null;
}

// What each pick called the option it marked. Written by the level up screen for declared rows
// only, and read back when nothing declares that row any more — the label is the one thing here
// that can't be looked up again.
export function recordedOptionLabels(ch) {
  const labels = {};
  for (const entry of ch?.levelUps || []) {
    for (const pick of entry.picks || []) {
      if (pick.optionLabel) labels[pick.key] = pick.optionLabel;
    }
  }
  return labels;
}

export function isLevelAchievement(level) {
  return level === 2 || level === 5 || level === 8;
}

// Current damage thresholds: armor base + level (per the "always add your current level" rule).
export function damageThresholds(baseMajor, baseSevere, level) {
  return { major: baseMajor + level, severe: baseSevere + level };
}

// Characters saved before slots were tracked per tier hold a single total per option.
// Split it across the tiers lowest-first: it's deterministic, and it's what playing well
// does anyway, since spending the cheap slots first keeps the higher domain card caps free.
//
// The key list is the union rather than the printed table's, because a declared option's key
// isn't in that table and dropping it here would silently un-mark a slot the player spent.
function splitFlatSlotTotals(flat) {
  const state = blankSlotsUsed();
  for (const key of new Set([...Object.keys(TIER_SLOT_TABLE), ...Object.keys(flat || {})])) {
    state[key] ||= { 2: 0, 3: 0, 4: 0 };
    let left = flat?.[key] || 0;
    for (const tier of SLOT_TIERS) {
      const take = Math.min(left, slotsInTier(key, tier));
      state[key][tier] = take;
      left -= take;
    }
    // More marked than the rules allow: keep the count rather than silently drop it, so the
    // character sheet shows the discrepancy instead of quietly handing back free slots.
    if (left > 0) state[key][4] += left;
  }
  return state;
}

function hasPerTierSlots(value) {
  return !!value && typeof value.traits === "object" && value.traits !== null;
}

let experienceSeq = 0;
function newExperienceId() {
  return `exp_${Date.now().toString(36)}${(experienceSeq++).toString(36)}`;
}

// Every character carries a BASELINE — its stats at some level — and the level up choices
// made since, replayed on top. A character built here baselines at level 1 on its creation
// stats; one that already existed baselines at whatever level it had reached, on the stats
// it already had. Same mechanism either way, so nothing needs a "before/after" special case
// and no stat is ever recomputed from choices that were never recorded.
function captureBaseline(ch) {
  return {
    traits: { ...ch.traits },
    traitMarks: { ...ch.traitMarks },
    proficiency: ch.proficiency,
    hitPointSlotsBonus: ch.hitPointSlotsBonus,
    stressSlotsBonus: ch.stressSlotsBonus,
    evasionBonus: ch.evasionBonus,
    subclassTier: ch.subclassTier,
    // A character baselined above level 1 may already have a second class, and there are no
    // recorded levels to replay it out of. Null on every character saved before this existed,
    // which is exactly what it should read as.
    multiclass: ch.multiclass ?? null,
    slotsUsed: JSON.parse(JSON.stringify(ch.advancementSlotsUsed)),
    domainCardIds: [...(ch.domainCardIds || [])],
  };
}

// A one-off repair, for characters saved while the level up screen wrote an exchange into the
// starting cards as well as into the level entry. The collection came out right either way —
// the replay applies the swap to whichever list it finds it in — but the baseline was left
// claiming the character had started with a card they swapped in later, and validateEntry
// reads the baseline as "what you owned before this level". So a legal swap of a STARTING card
// reported "the card being given up isn't in the collection at this level" on every load, and
// no edit could clear it: re-saving the level wrote the same baked list back.
//
// Newest level first, so a card swapped more than once unwinds in the reverse of the order it
// was applied. Only a swap that looks baked is touched — the taken card sitting in the starting
// list where the given-up card is absent — which makes this a no-op on repaired characters and
// on every exchange written since.
function unbakeExchanges(ch) {
  if (ch.creationCardsUnbaked) return;
  for (const entry of [...ch.levelUps].sort((a, b) => b.level - a.level)) {
    const swap = entry.exchange;
    if (!swap?.outCardId || !swap.inCardId) continue;
    const at = ch.creationDomainCardIds.indexOf(swap.inCardId);
    if (at >= 0 && !ch.creationDomainCardIds.includes(swap.outCardId)) {
      ch.creationDomainCardIds[at] = swap.outCardId;
    }
  }
  ch.creationCardsUnbaked = true;
}

// Which level granted each point of a level-dependent stat, so a "?" breakdown can say
// "Level 3 advancement +1" rather than lumping an entire career into "Level up advancements".
//
// This walks the recorded entries the same way the replay in shared/history.js does, but it
// only attributes: it derives no stat of its own, so the two can't disagree about a number.
// (The suite pins that down — every credit here has to sum to the bonus the replay produced.)
// It lives here rather than beside the replay because the breakdowns are built in
// derived-stats.js, which the replay imports: the attribution has to sit below both.
//
// Only recorded levels can be credited. A character baselined above level 1 carries bonuses
// from levels nobody wrote down, and those stay unattributed on purpose — the breakdown
// reports the remainder as one generic part rather than inventing a level for it.
export function advancementCredits(ch) {
  const credits = { hitPoint: [], stress: [], evasion: [], proficiency: [], traits: {}, experiences: {} };
  const bump = (list, level, source) => {
    const at = list.find((c) => c.level === level && c.source === source);
    if (at) at.value += 1; else list.push({ level, source, value: 1 });
  };
  const into = (map, key) => (map[key] ||= []);

  const byLevel = new Map((ch.levelUps || []).map((e) => [e.level, e]));
  for (let level = (ch.baselineLevel ?? 1) + 1; level <= ch.level; level++) {
    // Step One on the sheet, before any advancement is chosen: the tier achievement.
    if (isLevelAchievement(level)) bump(credits.proficiency, level, "achievement");
    for (const pick of byLevel.get(level)?.picks || []) {
      switch (pick.key) {
        case "traits":
          for (const key of pick.traits || []) bump(into(credits.traits, key), level, "advancement");
          break;
        case "experience":
          for (const id of pick.experienceIds || []) bump(into(credits.experiences, id), level, "advancement");
          break;
        case "hitPoint": bump(credits.hitPoint, level, "advancement"); break;
        case "stress": bump(credits.stress, level, "advancement"); break;
        case "evasion": bump(credits.evasion, level, "advancement"); break;
        case "proficiency": bump(credits.proficiency, level, "advancement"); break;
      }
    }
  }
  return credits;
}

// Characters saved before levels were introduced don't have these fields: this adds
// them without touching the rest, so they stay valid as "level 1" the moment they're opened.
export function ensureLevelFields(ch) {
  if (ch.level === undefined) ch.level = 1;
  if (ch.proficiency === undefined) ch.proficiency = 1;
  if (!ch.traitMarks) ch.traitMarks = { agility: false, strength: false, finesse: false, instinct: false, presence: false, knowledge: false };
  if (ch.hitPointSlotsBonus === undefined) ch.hitPointSlotsBonus = 0;
  if (ch.stressSlotsBonus === undefined) ch.stressSlotsBonus = 0;
  if (ch.evasionBonus === undefined) ch.evasionBonus = 0;
  if (!ch.subclassTier) ch.subclassTier = "foundation";
  // Derived by the replay from the level that took it; null until then, and null forever for the
  // characters this app has built so far.
  if (ch.multiclass === undefined) ch.multiclass = null;
  if (!hasPerTierSlots(ch.advancementSlotsUsed)) ch.advancementSlotsUsed = splitFlatSlotTotals(ch.advancementSlotsUsed);
  if (!ch.domainVaultIds) ch.domainVaultIds = [];
  // Answers to the few features that say "choose": Clank's Purposeful Design, Vitality, Master
  // of the Craft. Keyed by the shared/effects.js key that asked. Missing answers are shown as a
  // nudge on the sheet, never enforced — characters saved before this existed must stay editable.
  if (!ch.effectChoices) ch.effectChoices = {};
  // The cards picked during character creation, kept apart from the ones gained on level up so
  // the creation wizard can edit them without touching the rest of the collection.
  //
  // The 2 is a guess, made once, for characters saved before this field existed: it's the usual
  // number, but a School of Knowledge wizard starts with 3. This function has no data files to
  // consult, so it can't do better — re-picking the starting cards in the wizard corrects it,
  // and everything written since records the real list.
  if (!ch.creationDomainCardIds) ch.creationDomainCardIds = (ch.domainCardIds || []).slice(0, 2);

  if (!Array.isArray(ch.levelUps)) ch.levelUps = [];
  if (ch.baselineLevel === undefined) ch.baselineLevel = ch.level;
  if (!ch.baseline) ch.baseline = captureBaseline(ch);
  unbakeExchanges(ch);

  // Experiences need stable ids: the level 2/5/8 achievements append new ones, which shifts
  // every index after them. sinceLevel records when each became available, so a level up
  // can't be edited to raise an Experience the character didn't have yet.
  for (const exp of ch.experiences || []) {
    if (!exp.id) exp.id = newExperienceId();
    if (exp.baseModifier === undefined) exp.baseModifier = exp.modifier ?? 2;
    if (exp.sinceLevel === undefined) exp.sinceLevel = ch.baselineLevel;
  }
  return ch;
}

// Domain cards currently "in loadout" (max 5, same as the card browser): every
// domainCardIds entry that hasn't been set aside in the vault.
export function activeDomainCardIds(character) {
  return character.domainCardIds.filter((id) => !character.domainVaultIds.includes(id));
}

export const SUBCLASS_TIER_ORDER = ["foundation", "specialization", "mastery"];

export function nextSubclassTier(current) {
  const idx = SUBCLASS_TIER_ORDER.indexOf(current);
  return SUBCLASS_TIER_ORDER[Math.min(idx + 1, SUBCLASS_TIER_ORDER.length - 1)];
}

export const SUBCLASS_TIER_LABELS = {
  foundation: "Foundation",
  specialization: "Specialization",
  mastery: "Mastery",
};

// A subclass tier implies every tier below it: upgrading *adds* a card rather than replacing
// the previous one, so a character at Specialization still has their Foundation features.
// An unrecognised tier falls back to foundation, like ensureLevelFields does.
export function subclassTiersUpTo(tier) {
  const idx = SUBCLASS_TIER_ORDER.indexOf(tier);
  return SUBCLASS_TIER_ORDER.slice(0, idx < 0 ? 1 : idx + 1);
}
