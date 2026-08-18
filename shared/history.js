// Replay of recorded level up choices.
//
// Advancement effects used to be applied straight onto the character and the choices thrown
// away, which made a past level up impossible to revisit: a trait raised at level 3 is
// indistinguishable from one assigned at creation, and the marks that would have told you
// are wiped by the tier achievements at 5 and 8. So the choices are the stored truth now,
// and every level-dependent stat is derived by replaying them from the character's baseline.
//
// Everything here is a pure function over plain objects: no DOM, no storage.

import {
  MAX_HIT_POINT_SLOTS,
  MAX_STRESS_SLOTS,
  domainAccess,
  extraCardLevelCap,
  isLevelAchievement,
  nextSubclassTier,
  optionCost,
  optionFor,
  slotsPerPick,
  tierForLevel,
} from "./advancement.js";
import { advancementOptionsFor, effectBonuses, hitPointTotal, stressTotal } from "./derived-stats.js";
import { titleCase } from "./text.js";

// The character as it stood at some level, for the purpose of asking shared/effects.js what
// it was granting then. Rewinding the subclass tier and the card collection matters: a cap
// check on level 4 must not count a Vitality card the character only picked up at level 7.
//
// The multiclass is rewound for the same reason and is easier to get wrong: this spreads the
// character, so without the override a second class taken at level 9 would be in hand while
// validating level 5, and every card from its domain would read as legal three levels early.
// Ancestry and equipment are the only things left that a level up can't change.
export function characterAtLevel(ch, state) {
  return {
    ...ch,
    subclassTier: state.subclassTier,
    multiclass: state.multiclass ?? null,
    domainCardIds: state.cardIds,
    domainVaultIds: [],
  };
}

const TRAIT_KEYS = ["agility", "strength", "finesse", "instinct", "presence", "knowledge"];

// Cards owned at the baseline. At level 1 that's whatever the creation wizard currently
// holds, so editing the starting cards flows straight through the replay.
function baselineCardIds(ch) {
  if (ch.baselineLevel <= 1) return [...(ch.creationDomainCardIds || [])];
  return [...(ch.baseline.domainCardIds || [])];
}

function entriesFor(ch) {
  return [...(ch.levelUps || [])].sort((a, b) => a.level - b.level);
}

function blankState(ch) {
  const b = ch.baseline;
  return {
    traits: { ...b.traits },
    traitMarks: { ...b.traitMarks },
    proficiency: b.proficiency,
    hitPointSlotsBonus: b.hitPointSlotsBonus,
    stressSlotsBonus: b.stressSlotsBonus,
    evasionBonus: b.evasionBonus,
    subclassTier: b.subclassTier,
    // `?? null` is the whole back-compat story: captureBaseline runs once per character, so every
    // save written before this existed has a baseline with no such key and nothing will ever add
    // one. Reading it as undefined would round-trip through JSON as a missing field instead.
    multiclass: b.multiclass ?? null,
    slotsUsed: JSON.parse(JSON.stringify(b.slotsUsed)),
    cardIds: baselineCardIds(ch),
    expBonus: {}, // experience id -> how many +1s it has picked up
  };
}

// Step One on the sheet: the tier achievement, which happens BEFORE advancements are
// chosen — so a trait freed by the level 5 or 8 clear can be raised again that same level,
// and the Experience gained at 2/5/8 can be boosted by an advancement at that same level.
function applyAchievement(state, level) {
  if (!isLevelAchievement(level)) return;
  state.proficiency += 1;
  if (level >= 5) {
    for (const key of TRAIT_KEYS) state.traitMarks[key] = false;
  }
}

function applyEntry(state, entry) {
  if (!entry) return;
  const extraCardIds = [];

  for (const pick of entry.picks || []) {
    const perTier = (state.slotsUsed[pick.key] ||= { 2: 0, 3: 0, 4: 0 });
    perTier[pick.slotTier] = (perTier[pick.slotTier] || 0) + slotsPerPick(pick.key);

    switch (pick.key) {
      case "traits":
        for (const key of pick.traits || []) {
          state.traits[key] = (state.traits[key] || 0) + 1;
          state.traitMarks[key] = true;
        }
        break;
      case "hitPoint": state.hitPointSlotsBonus += 1; break;
      case "stress": state.stressSlotsBonus += 1; break;
      case "evasion": state.evasionBonus += 1; break;
      case "experience":
        for (const id of pick.experienceIds || []) state.expBonus[id] = (state.expBonus[id] || 0) + 1;
        break;
      case "subclass":
        if (state.subclassTier !== "mastery") state.subclassTier = nextSubclassTier(state.subclassTier);
        break;
      case "proficiency": state.proficiency += 1; break;
      // The earliest one wins, replay being level-ordered. A hand-edited file holding two keeps
      // the first, so the cards taken between them stay legal; the later level is refused by the
      // cross-out check rather than silently rewriting what the character had access to.
      case "multiclass":
        state.multiclass ||= {
          classId: pick.classId, subclassId: pick.subclassId, domain: pick.domain, level: entry.level,
        };
        break;
      case "domainCard":
        if (pick.cardId) extraCardIds.push(pick.cardId);
        break;
    }
  }

  if (entry.mandatoryCardId) state.cardIds.push(entry.mandatoryCardId);
  for (const id of extraCardIds) state.cardIds.push(id);
  // Cards a feature gained at this level handed over outright, rather than ones bought with an
  // advancement slot — the School of Knowledge's "take an additional domain card" at each tier.
  for (const id of entry.grantedCardIds || []) state.cardIds.push(id);

  // The optional swap allowed on every level up. Replacing in place keeps the collection's
  // order stable, so the loadout/vault split doesn't shuffle when an early level is edited.
  const swap = entry.exchange;
  if (swap?.outCardId && swap.inCardId) {
    const at = state.cardIds.indexOf(swap.outCardId);
    if (at >= 0) state.cardIds[at] = swap.inCardId;
  }
}

// The character's state as it stood at the START of `upToLevel`, i.e. with every level
// below it applied. Used both to derive current stats and to give the editor the context a
// past level was actually chosen in.
export function stateAtLevel(ch, upToLevel) {
  const state = blankState(ch);
  const byLevel = new Map(entriesFor(ch).map((e) => [e.level, e]));
  for (let level = ch.baselineLevel + 1; level < upToLevel; level++) {
    applyAchievement(state, level);
    applyEntry(state, byLevel.get(level));
  }
  return state;
}

// Experiences the character has at a given level, with the modifier they had then.
export function experiencesAtLevel(ch, level, expBonus) {
  return (ch.experiences || [])
    .filter((exp) => exp.sinceLevel <= level)
    .map((exp) => ({ ...exp, modifier: exp.baseModifier + (expBonus?.[exp.id] || 0) }));
}

// Writes the replayed values back onto the character. Everything it touches is derived:
// the stored truth is baseline + levelUps, so a bad result is always recoverable by fixing
// the replay and running this again.
export function recomputeCharacter(ch) {
  const state = stateAtLevel(ch, ch.level + 1);

  ch.traits = state.traits;
  ch.traitMarks = state.traitMarks;
  ch.proficiency = state.proficiency;
  ch.hitPointSlotsBonus = state.hitPointSlotsBonus;
  ch.stressSlotsBonus = state.stressSlotsBonus;
  ch.evasionBonus = state.evasionBonus;
  ch.subclassTier = state.subclassTier;
  ch.multiclass = state.multiclass;
  ch.advancementSlotsUsed = state.slotsUsed;
  ch.domainCardIds = state.cardIds;

  for (const exp of ch.experiences || []) {
    exp.modifier = exp.baseModifier + (state.expBonus[exp.id] || 0);
  }

  // Cards can leave the collection through an exchange, so the vault has to drop anything
  // no longer owned; then the >5 loadout spill applies as it does after a level up.
  ch.domainVaultIds = (ch.domainVaultIds || []).filter((id) => ch.domainCardIds.includes(id));
  const active = ch.domainCardIds.filter((id) => !ch.domainVaultIds.includes(id));
  while (active.length > 5) ch.domainVaultIds.push(active.shift());

  return ch;
}

// Records one level's choices — replacing that level's entry if it already has one — and
// re-derives everything from the result. The level up screen writes every entry through here
// so that what an edit does to a character is defined in the same file as the replay that
// reads it back.
//
// Note what it does NOT touch: the baseline. An exchange is applied by applyEntry above and
// nowhere else. Writing the swapped-in card into creationDomainCardIds as well used to look
// harmless — the replay produced the same collection either way — but it made the baseline
// claim the character had started with a card they only swapped in later, and validateEntry
// reads that baseline as "what you owned before this level". The result was a legal swap
// reported as illegal, with no edit that could clear it. See the repair in ensureLevelFields.
export function writeLevelEntry(ch, entry) {
  if (!Array.isArray(ch.levelUps)) ch.levelUps = [];
  const at = ch.levelUps.findIndex((e) => e.level === entry.level);
  if (at >= 0) ch.levelUps[at] = entry; else ch.levelUps.push(entry);
  return recomputeCharacter(ch);
}

// Levels whose choices are recorded, oldest first.
export function recordedLevels(ch) {
  return entriesFor(ch).map((e) => e.level);
}

export function levelUpAt(ch, level) {
  return (ch.levelUps || []).find((e) => e.level === level) || null;
}

// ---------- validation ----------

// The character as the choices for `level` were made against: everything below it applied,
// plus that level's own tier achievement, which happens first (Step One on the sheet) and
// is why a trait freed at 5 or 8 can be raised the very same level.
export function contextForLevel(ch, level) {
  const state = stateAtLevel(ch, level);
  applyAchievement(state, level);
  return state;
}

function cardsById(db) {
  const map = new Map();
  for (const c of db?.domainCards || []) map.set(c.id, c);
  return map;
}

function cardName(card) {
  return card?.name?.["en-US"] || "that card";
}

// Everything wrong with one level's choices, as sentences a player can act on. Shared by
// the level up screen and the history list so the two can't disagree about what's legal.
export function validateEntry(ch, entry, db) {
  const level = entry.level;
  const errors = [];
  const state = contextForLevel(ch, level);
  const cls = (db?.classes || []).find((c) => c.id === ch.classId);
  const byId = cardsById(db);
  const tier = tierForLevel(level);

  const picks = entry.picks || [];
  const spent = picks.reduce((sum, p) => sum + optionCost(p.key), 0);
  if (spent !== 2) errors.push(`${spent} of the 2 choice points for this level are spent.`);

  // The rows that were on offer AT THIS LEVEL, not the ones on offer now: resolved against the
  // same rewound character the level up screen resolves against, so the screen and this function
  // can't disagree about whether a row existed yet.
  const options = advancementOptionsFor(characterAtLevel(ch, state), db, { level, used: state.slotsUsed });

  // Slots: what this level marks, on top of what every other level already marked.
  const marked = {};
  for (const pick of picks) {
    (marked[pick.key] ||= {})[pick.slotTier] = (marked[pick.key]?.[pick.slotTier] || 0) + slotsPerPick(pick.key);
  }
  for (const [key, perTier] of Object.entries(marked)) {
    const option = optionFor(options, key);
    // Named from the row if it still exists, else from what the pick itself recorded. Before this,
    // any row the printed table didn't know produced the literal sentence "undefined: no tier 2
    // slot left to mark." on every load, with no edit that could clear it.
    const name = option?.label || picks.find((p) => p.key === key)?.optionLabel || key;
    if (!option) {
      errors.push(`${name}: this level marks a slot for an advancement this character doesn't have.`);
      continue;
    }
    for (const [slotTier, count] of Object.entries(perTier)) {
      const t = Number(slotTier);
      if (t > tier) {
        errors.push(`${name}: a tier ${t} slot isn't available at level ${level}.`);
        continue;
      }
      // Struck through by an option taken at an earlier level — you may upgrade your subclass or
      // multiclass in a tier, never both, and you may multiclass once. Read off the rows, so no
      // key is named here. A conflict WITHIN one level can't arise: the two together cost three of
      // the level's two points, which the budget check above has already refused.
      if (option.crossedOut?.[t] > 0) {
        errors.push(`${name}: that tier ${t} slot is crossed out.`);
        continue;
      }
      const already = state.slotsUsed?.[key]?.[t] || 0;
      if (already + count > option.slots[t]) {
        errors.push(`${name}: no tier ${t} slot left to mark.`);
      }
    }
    if ((state.slotsUsed?.[key] ? Object.values(state.slotsUsed[key]).reduce((a, b) => a + b, 0) : 0)
      + Object.values(perTier).reduce((a, b) => a + b, 0) > option.total) {
      errors.push(`${name}: more slots marked than this tier allows.`);
    }
  }

  // Traits: two distinct unmarked ones per pick, and all distinct across the level.
  const traitsThisLevel = [];
  for (const pick of picks.filter((p) => p.key === "traits")) {
    const keys = pick.traits || [];
    if (new Set(keys).size !== 2) errors.push("Trait increase: pick exactly 2 different traits.");
    for (const key of keys) {
      if (state.traitMarks[key]) errors.push(`${titleCase(key)} is already marked this tier and can't be raised again yet.`);
      if (traitsThisLevel.includes(key)) errors.push(`${titleCase(key)} is picked twice at this level.`);
      traitsThisLevel.push(key);
    }
  }

  for (const pick of picks.filter((p) => p.key === "experience")) {
    const ids = pick.experienceIds || [];
    if (new Set(ids).size !== 2) errors.push("Experience increase: pick exactly 2 different Experiences.");
    for (const id of ids) {
      const exp = (ch.experiences || []).find((e) => e.id === id);
      if (!exp) errors.push("An Experience picked at this level no longer exists.");
      else if (exp.sinceLevel > level) errors.push(`"${exp.name || "(unnamed)"}" wasn't gained until level ${exp.sinceLevel}.`);
    }
  }

  // Slots granted by ancestry, subclass or a card count towards the cap: a Giant reaches 12
  // Hit Points one advancement sooner than everyone else, so this must see them too.
  const cls_ = cls;
  const granted = effectBonuses(characterAtLevel(ch, state), db);
  const hp = hitPointTotal(cls_, state.hitPointSlotsBonus + picks.filter((p) => p.key === "hitPoint").length, granted.hitPointSlots);
  if (cls_ && hp > MAX_HIT_POINT_SLOTS) errors.push(`This would take Hit Points past the maximum of ${MAX_HIT_POINT_SLOTS}.`);
  const stress = stressTotal(state.stressSlotsBonus + picks.filter((p) => p.key === "stress").length, granted.stressSlots);
  if (stress > MAX_STRESS_SLOTS) errors.push(`This would take Stress past the maximum of ${MAX_STRESS_SLOTS}.`);

  let tierAfterPicks = state.subclassTier;
  for (const _ of picks.filter((p) => p.key === "subclass")) {
    if (state.subclassTier === "mastery") errors.push("The subclass is already at Mastery.");
    tierAfterPicks = nextSubclassTier(tierAfterPicks);
  }

  // Multiclass: the payload has to name a class this character could actually have taken. The
  // "already multiclassed" case is caught by the cross-out above, so this is about the choice
  // itself rather than about the slot.
  for (const pick of picks.filter((p) => p.key === "multiclass")) {
    const into = (db?.classes || []).find((c) => c.id === pick.classId);
    if (!pick.classId || !pick.domain || !pick.subclassId) {
      errors.push("Multiclass: choose a class, one of its domains, and a subclass.");
      continue;
    }
    // Worth its own message rather than falling through the domain test: the wizard lets you
    // change a character's class after the fact, which can turn a legal multiclass into this.
    if (pick.classId === ch.classId) {
      errors.push("Multiclass: that's the class this character already has.");
      continue;
    }
    if (!into) {
      errors.push("Multiclass: that class isn't in the catalogue any more.");
      continue;
    }
    if (!(into.domains || []).includes(pick.domain)) {
      errors.push(`Multiclass: ${titleCase(into.name)} has no ${titleCase(pick.domain)} domain.`);
    } else if ((cls_?.domains || []).includes(pick.domain)) {
      errors.push(`Multiclass: this character already has access to ${titleCase(pick.domain)}.`);
    }
    const sub = (db?.subclasses || []).find((s) => s.id === pick.subclassId);
    if (!sub) errors.push("Multiclass: that subclass isn't in the catalogue any more.");
    else if (sub.class !== String(into.name || "").toUpperCase()) {
      errors.push(`Multiclass: that subclass isn't one of ${titleCase(into.name)}'s.`);
    }
  }

  // Cards: owned so far, plus everything this level adds, so duplicates surface wherever
  // they come from.
  const owned = new Set(state.cardIds);
  // What the character's second class is once this level's picks are counted, so the card the
  // level GRANTS may already come from the new domain — the sheet's step order puts advancements
  // before the domain card.
  //
  // The WHOLE payload, not just the domain. Two things downstream read this: the domain access
  // below, which wants only `domain`, and the granted-card count further down, which asks
  // effects.js what the character has — and that needs the ids, or a foundation card whose
  // feature hands over a domain card grants nothing and the level flags itself the moment it's
  // saved. (A School of Knowledge multiclass did exactly that.)
  const mcAfterPicks = state.multiclass
    || picks
      .filter((p) => p.key === "multiclass")
      .map((p) => ({ classId: p.classId, subclassId: p.subclassId, domain: p.domain }))[0]
    || null;
  const check = (id, cap, what) => {
    if (!id) { errors.push(`${what}: no card chosen.`); return; }
    const card = byId.get(id);
    if (!card) { errors.push(`${what}: that card no longer exists.`); return; }
    if (owned.has(id)) errors.push(`${what}: ${cardName(card)} is already in the collection.`);
    // The cap and the domain are one question now: your own domains take the caller's limit, the
    // multiclass domain takes half your level. `cap` is a base rather than the answer. With no
    // class record to read, neither test can be made, exactly as before.
    if (cls_) {
      const allowed = domainAccess(cls_.domains, mcAfterPicks, level, cap).capFor(card.domain);
      if (allowed === null) errors.push(`${what}: ${cardName(card)} isn't in a domain this character has access to.`);
      // Wording pinned by the suite's staleness probe, which reads the number back out of it.
      else if (card.level > allowed) errors.push(`${what}: ${cardName(card)} is level ${card.level}, above the limit of ${allowed}.`);
    } else if (card.level > cap) {
      errors.push(`${what}: ${cardName(card)} is level ${card.level}, above the limit of ${cap}.`);
    }
    owned.add(id);
  };

  if (db) {
    check(entry.mandatoryCardId, level, "New domain card");
    for (const pick of picks.filter((p) => p.key === "domainCard")) {
      check(pick.cardId, extraCardLevelCap(level, pick.slotTier), `Extra domain card (tier ${pick.slotTier} slot)`);
    }

    // Cards granted by a feature gained at this level. How many is the difference between what
    // the character's effects grant before this level's picks and after them, so the rule lives
    // in effects.js rather than here; only your level caps these, since they aren't slots.
    const before = granted.extraDomainCards;
    const after = effectBonuses(
      { ...characterAtLevel(ch, state), subclassTier: tierAfterPicks, multiclass: mcAfterPicks },
      db,
    ).extraDomainCards;
    const expected = Math.max(0, after - before);
    const grantedCards = entry.grantedCardIds || [];
    if (grantedCards.length !== expected) {
      errors.push(`Extra domain card from a subclass upgrade: ${grantedCards.length} chosen, ${expected} granted at this level.`);
    }
    for (const id of grantedCards) check(id, level, "Extra domain card from a subclass upgrade");

    const swap = entry.exchange;
    if (swap?.outCardId || swap?.inCardId) {
      const out = byId.get(swap.outCardId);
      if (!out || !owned.has(swap.outCardId)) errors.push("Exchange: the card being given up isn't in the collection at this level.");
      else {
        owned.delete(swap.outCardId);
        check(swap.inCardId, out.level, "Exchange");
      }
    }
  }

  return errors;
}

// Every recorded level that no longer adds up, with the reasons. Levels the player has
// explicitly accepted are reported but not counted as needing attention.
export function validateLevelUps(ch, db) {
  return entriesFor(ch)
    .map((entry) => ({ level: entry.level, accepted: !!entry.acceptedAsIs, errors: validateEntry(ch, entry, db) }))
    .filter((r) => r.errors.length > 0);
}

export function unresolvedProblems(ch, db) {
  return validateLevelUps(ch, db).filter((r) => !r.accepted);
}

// ---------- description ----------

const SHORT_LABELS = {
  traits: "+1 to two traits",
  hitPoint: "+1 Hit Point slot",
  stress: "+1 Stress slot",
  experience: "+1 to two Experiences",
  domainCard: "Extra domain card",
  evasion: "+1 Evasion",
  subclass: "Subclass upgrade",
  proficiency: "+1 Proficiency",
  multiclass: "Multiclass",
};

// A one-line summary of what was chosen at a level, for the history list.
export function describeLevelUp(ch, entry, db) {
  const byId = cardsById(db);
  const parts = [];
  for (const pick of entry.picks || []) {
    if (pick.key === "traits") {
      parts.push((pick.traits || []).map((k) => `+1 ${titleCase(k)}`).join(", "));
    } else if (pick.key === "experience") {
      const names = (pick.experienceIds || []).map((id) => (ch.experiences || []).find((e) => e.id === id)?.name || "(unnamed)");
      parts.push(`+1 to ${names.join(" & ")}`);
    } else if (pick.key === "domainCard") {
      parts.push(`${SHORT_LABELS.domainCard}: ${cardName(byId.get(pick.cardId))}`);
    } else if (pick.key === "multiclass") {
      // Named the way the extra card is: the choice is the interesting part, not the option.
      const into = (db?.classes || []).find((c) => c.id === pick.classId);
      const sub = (db?.subclasses || []).find((s) => s.id === pick.subclassId);
      const detail = [sub?.name?.["en-US"], pick.domain && titleCase(pick.domain)].filter(Boolean).join(", ");
      parts.push(`${SHORT_LABELS.multiclass}: ${into ? titleCase(into.name) : pick.classId}${detail ? ` (${detail})` : ""}`);
    } else {
      // A declared row's pick carries its own label, which is why this needs neither the content
      // nor the option table to stay readable — see the note on optionLabel in level-up.js.
      parts.push(pick.optionLabel || SHORT_LABELS[pick.key] || pick.key);
    }
  }
  return parts;
}

export function describeCards(ch, entry, db) {
  const byId = cardsById(db);
  const lines = [];
  if (entry.mandatoryCardId) lines.push(`Card: ${cardName(byId.get(entry.mandatoryCardId))}`);
  for (const id of entry.grantedCardIds || []) {
    lines.push(`Card from your subclass: ${cardName(byId.get(id))}`);
  }
  if (entry.exchange?.outCardId && entry.exchange.inCardId) {
    lines.push(`Exchanged ${cardName(byId.get(entry.exchange.outCardId))} → ${cardName(byId.get(entry.exchange.inCardId))}`);
  }
  return lines;
}
