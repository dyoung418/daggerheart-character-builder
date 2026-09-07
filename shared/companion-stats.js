// The Beastbound Ranger's companion, flattened for every surface — pure, no DOM, no fetch.
//
// WHY THIS ISN'T IN derived-stats.js
// ---------------------------------
// derivedStats() is the CHARACTER's stat engine, and its opening rule (shared/effects.js:11-26)
// is that a bonus is catalogued only when it's in effect given only what we store and needs no
// action in play. The companion is a separate entity — it has no line in derivedStats() and
// should not. Four of its eight level-up options move a number, but they move the COMPANION's
// numbers, and those are computed here:
//
//   Aware        +2 to the companion's Evasion, per pick
//   Resilient    +1 Stress slot, per pick
//   Intelligent  +1 to one Companion Experience the player names, per pick — folded into the
//                Experience's `modifier` by the level-up replay (shared/history.js), the same way
//                the character's own Experience advancements are; this file just reads `modifier`
//   Light in the Dark   one extra Hope slot the CHARACTER can mark — a separate tappable slot,
//                       NOT part of the character's six (a scar can't cross it out), so it's a
//                       `lightSlots` count here, never a hope bonus in the stat engine
//
// Creature Comfort, Armored, Bonded and Vicious are printed reference only. Vicious steps the
// damage die or range — a choice the player records on the companion's own attack fields, the
// same way the app never computes a Combo Die's d6→d8.
//
// Option identity is matched by NAME, the SRD's own vocabulary — the choice knownStances() and
// hasBeastform() also make, because an id carries a source-and-edition prefix and a name doesn't.

import {
  COMPANION_BASE_EVASION, COMPANION_BASE_STRESS, COMPANION_EXPERIENCE_BASE,
} from "./companion.js";
import { declaredLevelChoices, resolveLevelChoice } from "./effects.js";
import { enumLabel } from "./gear.js";

// The four options whose effect this module computes, by SRD name.
export const COMPANION_OPTION_AWARE = "Aware";
export const COMPANION_OPTION_RESILIENT = "Resilient";
export const COMPANION_OPTION_INTELLIGENT = "Intelligent";
export const COMPANION_OPTION_LIGHT = "Light in the Dark";

const DAMAGE_TYPE_LABEL = { PHYSICAL: "phys", MAGICAL: "mag" };

function optionText(record) {
  return (record?.description || [])
    .map((b) => b?.paragraph?.["en-US"]
      || (b?.list ? b.list.map((x) => x?.["en-US"]).filter(Boolean).join("; ") : ""))
    .filter(Boolean)
    .join("\n\n");
}

/**
 * Does this character have a companion to show? True only when there IS a companion object AND
 * the features declare the `companionOptions` levelChoice — a Beastbound who was swapped to
 * Wayfinder keeps stale `character.companion` but the answer is "no companion", the same way
 * knownStances() is empty for an ex-Martial-Artist.
 */
export function hasCompanion(ch, db) {
  const companion = ch?.companion;
  if (!companion || typeof companion !== "object" || Array.isArray(companion)) return false;
  return declaredLevelChoices(ch, db).some((lc) => lc.id === "companionOptions");
}

/**
 * The companion, flattened for every surface.
 *
 * @returns {{
 *   present: boolean,
 *   name: string, evasion: number|null,
 *   attackName: string, damageDieLabel: string, rangeLabel: string, damageTypeLabel: string,
 *   attackLine: string,
 *   stressSlots: number|null, lightSlots: number,
 *   experiences: Array<{id: string, name: string, modifier: number}>,
 *   options: Array<{id: string, name: string, text: string, count: number, maxPicks: number}>,
 *   orphanCount: number,
 * }}
 *
 * `present: false` — every field empty/null — when hasCompanion() is false. Surfaces test that
 * one flag, exactly like knownStances([]).
 */
export function companionStats(ch, db) {
  if (!hasCompanion(ch, db)) {
    return {
      present: false, name: "", evasion: null,
      attackName: "", damageDieLabel: "", rangeLabel: "", damageTypeLabel: "", attackLine: "",
      stressSlots: null, lightSlots: 0, experiences: [], options: [], orphanCount: 0,
    };
  }

  const companion = ch.companion;
  const picked = resolveLevelChoice(ch, db, "companionOptions", "companionOptions");
  const byName = new Map(); // option name -> { record, count }
  let orphanCount = 0;
  for (const { record } of picked) {
    if (!record) { orphanCount += 1; continue; }
    const name = record.name?.["en-US"] || "";
    const prior = byName.get(name);
    if (prior) prior.count += 1;
    else byName.set(name, { record, count: 1 });
  }
  const count = (name) => byName.get(name)?.count || 0;

  const dieLabel = String(companion.attack?.damageDie || "D6").toLowerCase();
  const rangeLabel = enumLabel(companion.attack?.range || "MELEE");
  const typeLabel = DAMAGE_TYPE_LABEL[companion.attack?.damageType] || "phys";
  const attackName = companion.attack?.name || "";

  const experiences = (companion.experiences || []).map((exp) => ({
    id: exp.id,
    name: exp.name || "",
    modifier: Number.isInteger(exp.modifier) ? exp.modifier
      : (Number.isInteger(exp.baseModifier) ? exp.baseModifier : COMPANION_EXPERIENCE_BASE),
  }));

  const options = [...byName.values()]
    .map(({ record, count: c }) => ({
      id: record.id,
      name: record.name?.["en-US"] || record.id,
      text: optionText(record),
      count: c,
      maxPicks: Number.isInteger(record.maxPicks) && record.maxPicks >= 1 ? record.maxPicks : 1,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const evasionBase = Number.isInteger(companion.evasion) ? companion.evasion : COMPANION_BASE_EVASION;

  return {
    present: true,
    name: companion.name || "",
    evasion: evasionBase + 2 * count(COMPANION_OPTION_AWARE),
    attackName,
    damageDieLabel: dieLabel,
    rangeLabel,
    damageTypeLabel: typeLabel,
    attackLine: [attackName, rangeLabel, dieLabel, typeLabel].filter(Boolean).join(" · "),
    stressSlots: COMPANION_BASE_STRESS + count(COMPANION_OPTION_RESILIENT),
    lightSlots: count(COMPANION_OPTION_LIGHT),
    experiences,
    options,
    orphanCount,
  };
}
