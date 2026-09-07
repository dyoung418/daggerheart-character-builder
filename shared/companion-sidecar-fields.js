// The Ranger Companion sidecar, as one flat { field name: value } map.
//
// The RULES half of filling that form: which text goes in which box and which of its checkboxes
// get ticked, for a companion in a given state. The bytes — finding the widgets, writing /V and
// /AS, chaining an incremental update onto the template — belong to shared/pdf-form.js, which
// decides nothing. Same split as shared/stance-sidecar-fields.js and shared/sheet-fields.js, for
// the same reason: what goes IN a box is a rule, and rules are the part tests/ can read.
//
// Pure — no DOM, no fetch, and it does NOT reach into a character: it takes the already-derived
// companion display data (companionStats()'s output) plus the two marked counts. The known-option
// set is companionStats()'s fact; a second derivation here is how the sidecar and the play page
// would come to disagree with nothing to notice.
//
// THE FIELD NAMES ARE THE CONTRACT
// -------------------------------
// Every name below is a /T in data/sheet/companion-sidecar-template.pdf, hand-authored in a PDF
// editor, so nothing but a string match holds the two halves together. A re-save that renames a
// field makes this module fill nothing there and say nothing about it — which is why the names are
// a literal Set, diffed against the template by a field-name-presence check (tests/tests.js), the
// same guard sheet-fields.js's names get from the fidelity tooling.
//
// ONLY MEANINGFUL ENTRIES, NEVER "Off" / ""
// ----------------------------------------
// A checkbox appears in the map only when it should be TICKED; a text field only when it has
// something to say. pdf-form.js leaves any field it's handed no value for exactly as the template
// drew it (pdf-form.js — undefined/null/"" all `continue`), and the template ships blank, so an
// absent key already reads as empty/unticked.
//
// UNPLACED — a homebrew companion option with no checkbox on the fixed official form, reported the
// way stance-sidecar-fields.js reports a homebrew stance and sheet-pdf.js reports `truncated`.

const DAMAGE_DICE = ["D6", "D8", "D10", "D12"];

// The eight SRD option names -> their checkbox base slug on the form. A repeatable option has
// `1`/`2`/`3` boxes (filled from the left); the other four have a single box.
const OPTION_SLUG = {
  "Intelligent": { slug: "companion-intelligent", max: 3 },
  "Vicious": { slug: "companion-vicious", max: 3 },
  "Resilient": { slug: "companion-resilient", max: 3 },
  "Aware": { slug: "companion-aware", max: 3 },
  "Light in the Dark": { slug: "companion-light-in-the-dark", max: 1 },
  "Creature Comfort": { slug: "companion-creature-comfort", max: 1 },
  "Armored": { slug: "companion-armored", max: 1 },
  "Bonded": { slug: "companion-bonded", max: 1 },
};

// Every /T the module knows how to fill — the field-name-presence check diffs this against the
// template. Grouped the way the form lays them out.
export const COMPANION_SIDECAR_FIELD_NAMES = new Set([
  "companion-name", "companion-evasion", "companion-attack-name", "companion-attack-range",
  "companion-experience-name1", "companion-experience-name2", "companion-experience-name3",
  "companion-experience-name4", "companion-experience-name5",
  "experience-value1", "experience-value2", "experience-value3", "experience-value4", "experience-value5",
  "companion-damage-die-d6", "companion-damage-die-d8", "companion-damage-die-d10", "companion-damage-die-d12",
  "companion-stress1", "companion-stress2", "companion-stress3", "companion-stress4", "companion-stress5", "companion-stress6",
  "companion-intelligent1", "companion-intelligent2", "companion-intelligent3",
  "companion-vicious1", "companion-vicious2", "companion-vicious3",
  "companion-resilient1", "companion-resilient2", "companion-resilient3",
  "companion-aware1", "companion-aware2", "companion-aware3",
  "companion-light-in-the-dark", "companion-creature-comfort", "companion-armored", "companion-bonded",
  "companion-hope-slot",
]);

const STRESS_BOXES = 6;

/**
 * The Ranger Companion sidecar's filled fields, for one companion.
 *
 * @param {object} args
 * @param {object} args.companion  companionStats()'s output — `{ name, evasion, attackName,
 *   damageDieLabel, rangeLabel, experiences: [{name, modifier}], options: [{name, count}],
 *   lightSlots }`. Not read out of a character here.
 * @param {number} [args.companionStress]  marked Stress (0..6), filled from the left.
 * @returns {{values: Object<string, string>, unplaced: string[]}}
 *   `values` — `{ field: "Yes" | "<text>" }` for every box that should carry something.
 *   `unplaced` — the name of every option the form has no checkbox for (a homebrew option), in
 *   the order companionStats() gave them.
 */
export function companionSidecarFieldValues({ companion, companionStress = 0 } = {}) {
  const values = {};
  const unplaced = [];
  if (!companion || !companion.present) return { values, unplaced };

  if (companion.name) values["companion-name"] = companion.name;
  if (Number.isFinite(companion.evasion)) values["companion-evasion"] = String(companion.evasion);
  if (companion.attackName) values["companion-attack-name"] = companion.attackName;
  if (companion.rangeLabel) values["companion-attack-range"] = companion.rangeLabel;

  // The damage die: tick the one that matches, if the form has a box for it (d6..d12 only).
  const die = String(companion.damageDieLabel || "").toUpperCase();
  if (DAMAGE_DICE.includes(die)) values[`companion-damage-die-${die.toLowerCase()}`] = "Yes";

  // Up to five Experiences: name + the derived modifier. Slots past the list stay blank.
  (companion.experiences || []).slice(0, 5).forEach((exp, i) => {
    const n = i + 1;
    if (exp.name) values[`companion-experience-name${n}`] = exp.name;
    if (Number.isFinite(exp.modifier)) values[`experience-value${n}`] = `+${exp.modifier}`;
  });

  // Stress marked, from the left — the sheet-marks.js bar convention.
  const marked = clampInt(companionStress, 0, STRESS_BOXES);
  for (let i = 1; i <= marked; i += 1) values[`companion-stress${i}`] = "Yes";

  // The level-up options: fill `<slug>1..count` from the left for a repeatable option, or the
  // single box for a one-off. An option the form doesn't know goes in `unplaced`.
  for (const opt of companion.options || []) {
    const spec = OPTION_SLUG[opt.name];
    if (!spec) { unplaced.push(opt.name); continue; }
    if (spec.max === 1) {
      values[spec.slug] = "Yes";
    } else {
      const n = clampInt(opt.count, 0, spec.max);
      for (let i = 1; i <= n; i += 1) values[`${spec.slug}${i}`] = "Yes";
    }
  }

  // The extra Hope slot the companion gives the character — its own box on the form, ticked
  // whenever Light in the Dark has been taken (the option's own checkbox above says the same, but
  // the form draws this one where the character reads their Hope).
  if ((companion.lightSlots || 0) >= 1) values["companion-hope-slot"] = "Yes";

  return { values, unplaced };
}

function clampInt(v, lo, hi) {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : lo;
}
