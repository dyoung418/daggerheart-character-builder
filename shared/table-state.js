// The boxes a player marks at the table — HP, Stress, Hope, Armor — as pure functions over
// plain objects. play.js turns these into tappable rows and nothing else, the same
// logic/DOM split sheet-data.js and sheet.js keep.
//
// State is a count of MARKED boxes per resource (what's been spent or taken), stored on the
// character as `character.state` and saved with everything else in dh-characters-v1. The
// maxima are not stored: they come from the derived sheet every time (see maxesFromSheet),
// so a level up or an armor swap changes the row and clampState() pulls the count back
// inside the new limit instead of leaving an impossible value around.

// The SRD's two fixed Hope numbers: every character has 6 slots and starts with 2 filled.
// Nothing in the SRD moves either, which is why sheet-data.js doesn't derive them.
export const HOPE_MAX = 6;
export const HOPE_START = 2;

export const RESOURCE_KEYS = ["hp", "stress", "hope", "armor"];

// The SRD's three conditions, with the one line a player needs when one is on them.
export const CONDITIONS = [
  { id: "vulnerable", label: "Vulnerable", effect: "Rolls against you have advantage." },
  { id: "hidden", label: "Hidden", effect: "Rolls against you have disadvantage, until you're seen, act or move into view." },
  { id: "restrained", label: "Restrained", effect: "You can't move, but you can still act." },
];

export function defaultState() {
  return { hp: 0, stress: 0, hope: HOPE_START, armor: 0, scars: 0, conditions: [], notes: "" };
}

// Returns the new list, in catalogue order; an unknown id is ignored.
export function toggleCondition(conditions, id) {
  if (!CONDITIONS.some((c) => c.id === id)) return conditions.slice();
  const set = new Set(conditions);
  if (set.has(id)) set.delete(id); else set.add(id);
  return CONDITIONS.map((c) => c.id).filter((c) => set.has(c));
}

// Tapping box `index` (0-based) on a row with `marked` boxes filled: a box past the marked
// ones fills everything up to and including it; a marked box clears itself and every box
// after it. One tap reaches any value, and tapping the last marked box undoes one.
export function tapBox(marked, index) {
  return index >= marked ? index + 1 : index;
}

// A scar crosses out a Hope slot for good: "permanently cross out a Hope slot", after Avoid
// Death (SRD). The crossed ones are always the slots at the right-hand end, so the count is
// all that's stored, and a long press on slot `index` is tapBox seen from that end: crossing
// one crosses everything after it, freeing one frees the crossed slots before it.
export function scarAt(scars, index, max) {
  return tapBox(scars, max - 1 - index);
}

// `maxes` is { hp, stress, hope, armor } from maxesFromSheet(); a null maximum (a draft with
// no class or armor yet) means nothing can be marked there. Conditions and notes ride along
// (known ids only, in catalogue order; notes as a string). Always returns a new object.
export function clampState(state, maxes) {
  const defaults = defaultState();
  const out = {};
  for (const key of RESOURCE_KEYS) {
    const raw = state?.[key];
    const value = Number.isInteger(raw) && raw >= 0 ? raw : defaults[key];
    const max = maxes?.[key] ?? 0;
    out[key] = Math.min(value, max);
  }
  // Scars come before conditions so the returned object keeps the same key order as
  // defaultState(). A scarred slot is gone: it shrinks the Hope row under the marks already
  // on it, which is why hope is clamped a second time here.
  const hopeMax = maxes?.hope ?? 0;
  const rawScars = state?.scars;
  out.scars = Math.min(Number.isInteger(rawScars) && rawScars >= 0 ? rawScars : 0, hopeMax);
  out.hope = Math.min(out.hope, hopeMax - out.scars);
  const wanted = new Set(Array.isArray(state?.conditions) ? state.conditions : []);
  out.conditions = CONDITIONS.map((c) => c.id).filter((id) => wanted.has(id));
  out.notes = typeof state?.notes === "string" ? state.notes : "";
  return out;
}

// Armor Slots equal the Armor Score (SRD), so the sheet's armorScore doubles as the row
// length. Unknown values stay null rather than 0: the row shows a dash, not zero boxes.
export function maxesFromSheet(sheet) {
  return {
    hp: sheet.hitPoints ?? null,
    stress: sheet.stress ?? null,
    hope: sheet.hopeSlots ?? null,
    armor: sheet.armorScore ?? null,
  };
}

// ---------- downtime (SRD p. 105) ----------

// A party rests before moving on, and each character makes TWO downtime moves — the same move
// twice is allowed. The four moves that matter to a tracker are exactly the four rows this page
// draws: Hit Points, Stress, Armor Slots and Hope. Work on a Project changes nothing here (it
// ticks a countdown the GM keeps), but it's listed so the long rest offers the whole menu rather
// than a silently shortened one.
//
// `clear: "roll"` is the short rest's "clear a number of X equal to 1d4 + your tier": the die is
// the player's, so the amount comes in from the caller — this module stays pure and play.js is
// the one that rolls, the same split that keeps the DOM out of here.
export const DOWNTIME_MOVES_PER_REST = 2;

export const REST_MOVES = {
  short: [
    { id: "tendToWounds", resource: "hp", clear: "roll" },
    { id: "clearStress", resource: "stress", clear: "roll" },
    { id: "repairArmor", resource: "armor", clear: "roll" },
    { id: "prepare", resource: "hope", gain: 1, gainTogether: 2 },
  ],
  long: [
    { id: "tendToAllWounds", resource: "hp", clear: "all" },
    { id: "clearAllStress", resource: "stress", clear: "all" },
    { id: "repairAllArmor", resource: "armor", clear: "all" },
    { id: "prepare", resource: "hope", gain: 1, gainTogether: 2 },
    { id: "workOnProject", resource: null },
  ],
};

export const REST_KINDS = ["short", "long"];

export function findRestMove(kind, id) {
  return (REST_MOVES[kind] || []).find((m) => m.id === id) || null;
}

// 1d4 + tier. Kept here rather than inlined in play.js so the rule is stated once and tested.
export function restClearAmount(roll, tier) {
  const d = Number.isInteger(roll) && roll > 0 ? roll : 0;
  const t = Number.isInteger(tier) && tier > 0 ? tier : 0;
  return d + t;
}

/**
 * One downtime move applied to the marked boxes. HP, Stress and Armor count what's been spent
 * or taken, so clearing them counts DOWN; Hope counts what you hold, so Prepare counts up —
 * and clampState() stops it above the slots that scars have left.
 *
 * @param {object} state the current table state
 * @param {object} maxes from maxesFromSheet()
 * @param {object|null} move an entry of REST_MOVES, or null (unknown id: nothing happens)
 * @param {{ amount?: number, together?: boolean }} opts amount = the rolled 1d4 + tier;
 *   together = Prepare taken with at least one other party member, which gives 2 Hope not 1.
 * @returns {object} a new, clamped state
 */
export function applyRestMove(state, maxes, move, { amount = 0, together = false } = {}) {
  const base = clampState(state, maxes);
  if (!move || !move.resource) return base;
  if (move.clear === "all") return clampState({ ...base, [move.resource]: 0 }, maxes);
  if (move.clear === "roll") {
    const by = Number.isInteger(amount) && amount > 0 ? amount : 0;
    return clampState({ ...base, [move.resource]: Math.max(0, base[move.resource] - by) }, maxes);
  }
  const gain = together ? move.gainTogether : move.gain;
  return clampState({ ...base, [move.resource]: base[move.resource] + gain }, maxes);
}
