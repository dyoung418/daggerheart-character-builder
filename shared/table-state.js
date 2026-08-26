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

export function defaultState() {
  return { hp: 0, stress: 0, hope: HOPE_START, armor: 0 };
}

// Tapping box `index` (0-based) on a row with `marked` boxes filled: a box past the marked
// ones fills everything up to and including it; a marked box clears itself and every box
// after it. One tap reaches any value, and tapping the last marked box undoes one.
export function tapBox(marked, index) {
  return index >= marked ? index + 1 : index;
}

// `maxes` is { hp, stress, hope, armor } from maxesFromSheet(); a null maximum (a draft with
// no class or armor yet) means nothing can be marked there. Always returns a new object.
export function clampState(state, maxes) {
  const defaults = defaultState();
  const out = {};
  for (const key of RESOURCE_KEYS) {
    const raw = state?.[key];
    const value = Number.isInteger(raw) && raw >= 0 ? raw : defaults[key];
    const max = maxes?.[key] ?? 0;
    out[key] = Math.min(value, max);
  }
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
