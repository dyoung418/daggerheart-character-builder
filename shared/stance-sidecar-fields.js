// The Brawler / Martial Artist stance sidecar, as one flat { field name: "Yes" } map.
//
// This is the RULES half of filling that little form: which of its 22 checkboxes get ticked for a
// character who knows a given set of martial stances and sits at a given Focus. The other half —
// finding the widgets, writing /V and /AS, chaining an incremental update onto the template —
// belongs to shared/pdf-form.js, and it decides nothing. It is the same split
// shared/sheet-fields.js and sheet-pdf.js already use for the official character sheet, and it is
// here for the same reason: what goes IN a box is a rule, and rules are the part tests/ can read.
//
// Pure — no DOM, no fetch. And it does NOT reach into a character: `knownStanceIds` arrives
// already resolved by whatever selector owns the level history (the creation picks plus every
// level-up pick, replayed, deduped, orphan rows kept). This module never looks at `levelUps`,
// never replays anything, and would be wrong to — the known-stance set is history.js's fact, and a
// second derivation of it here is exactly how the sidecar and the level-history list would come to
// disagree with nothing to notice it.
//
// THE FIELD NAMES ARE THE CONTRACT
// --------------------------------
// Every entry of STANCE_FIELD_NAMES below is a checkbox /T in
// data/sheet/stance-sidecar-template.pdf, and every one of them is the BARE STANCE SLUG — a stance
// record id (`srd_2_0_stance_anchored`) with its source-and-kind prefix stripped off (`anchored`).
// The template was hand-authored in a PDF editor, so nothing but a string match holds the two
// halves together: a re-save that renames a checkbox makes this module tick nothing for that
// stance and say nothing about it, silently. That is why the 16 names are written out as a literal
// Set rather than sliced off a record field at runtime — a separate field-name-presence check
// (owned elsewhere, the way sheet-fields.js's names are pinned by the fidelity tooling) diffs this
// Set against the template so that drift is caught loudly instead of printed blank.
//
// FOCUS IS A COUNT, DRAWN AS A BAR. focus1..focus6 are six checkboxes; N of them are ticked for a
// character at Focus N, filled from the left. WHICH of the six is a presentation choice, not a
// fact — Focus is a pool, not six distinct slots — so this fills 1..N and leaves the rest absent,
// the same way sheet-marks.js fills the HP bar from the left. FOCUS_MAX mirrors the template's six
// boxes AND the SRD's own cap (clear the track, roll d6s equal to Instinct, gain Focus equal to
// the highest, cap 6). A `focus` argument outside 0..6 is clamped rather than trusted: a value
// that named `focus7` would make shared/pdf-form.js throw on a field the template has not got.
//
// ONLY "Yes" ENTRIES, NEVER "Off"
// ------------------------------
// The map carries a key only for a box that should be TICKED. shared/pdf-form.js leaves any field
// it is handed no value for exactly as the template drew it (pdf-form.js:1196 — undefined, null
// and "" all `continue`), and the template ships with all 22 boxes clear, so an absent key already
// reads as "unticked" and emitting "Off" for the rest would buy nothing but noise. This is the
// narrower of the two blanks sheet-fields.js's header describes: the deliberately-unanswered box,
// not the "" that means "I considered this field and it stays empty". The value is the string
// "Yes" because that is this template's checkbox on-state; pdf-form.js also accepts any truthy
// value and resolves the real on-state out of /AP/N (pdf-form.js:629), but naming it keeps the map
// readable as the thing it is.
//
// UNPLACED — HOMEBREW STANCES ON A FIXED OFFICIAL FORM
// ---------------------------------------------------
// The form has 16 stance boxes, one per SRD 2.0 stance. A character who knows a homebrew stance
// (some other source declared the `stances` kind and added its own) then holds a stance with no
// box to tick — exactly as a homebrew weapon has no line on the main sheet. Rather than drop it
// without a word, its name goes in `unplaced` (its id, when no `db` is passed to name it), and the
// caller surfaces that the way sheet-pdf.js surfaces `truncated`: a panel beside the export, never
// a thrown error.

// The 16 stance checkboxes, by tier, spelled exactly as the template spells them. A rename in a
// re-save breaks the fill for that stance; the field-name-presence check exists to catch it.
const STANCE_FIELD_NAMES = new Set([
  // Tier 1
  "favored", "invigorating", "quick", "reliable",
  // Tier 2
  "aggressive", "anchored", "defensive", "otherworldly",
  // Tier 3
  "grappling", "scary", "stable", "vigilant",
  // Tier 4
  "crushing", "exacting", "honed", "isolating",
]);

// The template's Focus bar is six boxes (focus1..focus6) and the SRD caps Focus at six; a `focus`
// argument outside 0..6 is clamped to this. Renumbering focus1..focus6 in a re-save breaks the
// fill the same way a renamed stance box does — the field-name-presence check covers both.
const FOCUS_MAX = 6;

// Everything after `_stance_` in a record id: `srd_2_0_stance_anchored` -> `anchored`,
// `homebrew_2_0_stance_iron_root` -> `iron_root`. This regex is the whole rule for the slug;
// db.stances is consulted (in the caller below) only to confirm an id names a loaded stance and to
// recover its display name for the `unplaced` report. With no db, the regex stands alone — an id
// that doesn't contain `_stance_` yields null and is reported unplaced under its own id.
function stanceSlug(id) {
  const match = /_stance_(.+)$/.exec(typeof id === "string" ? id : "");
  return match ? match[1] : null;
}

/**
 * The stance sidecar's ticked boxes, for one character.
 *
 * @param {object} args
 * @param {string[]} args.knownStanceIds  the stance record ids the character knows, resolved by
 *   the caller (creation + level-up picks, replayed, deduped, orphans kept). NOT read out of a
 *   character here.
 * @param {number} args.focus  current Focus. Clamped to 0..FOCUS_MAX defensively — a value outside
 *   that range is an upstream bug, and one naming `focus7` would make pdf-form.js throw.
 * @param {object} [args.db]  the merged content db (has `db.stances` once the kind is registered).
 *   Used only to name a stance in `unplaced`; the slug itself always comes off the id. Absent is a
 *   supported state — the id is the fallback name.
 * @returns {{values: Object<string, "Yes">, unplaced: string[]}}
 *   `values` — `{ slug: "Yes" }` for every known stance the form has a box for, plus `focus1..N`
 *   for a character at Focus N. Only ticked boxes appear; the header says why there are no "Off"
 *   entries.
 *   `unplaced` — the name (or id, when `db` can't name it) of every known stance the form has NO
 *   box for, in the order the ids were given. The caller shows this like sheet-pdf.js's `truncated`.
 */
export function stanceSidecarFieldValues({ knownStanceIds = [], focus = 0, db } = {}) {
  const values = {};
  const unplaced = [];

  // Dedupe defensively while keeping the caller's order: a Set iterates in insertion order, so
  // `unplaced` still lists homebrew stances in the order their ids arrived.
  const ids = new Set(Array.isArray(knownStanceIds) ? knownStanceIds : []);
  for (const id of ids) {
    const slug = stanceSlug(id);
    if (slug && STANCE_FIELD_NAMES.has(slug)) {
      values[slug] = "Yes";
      continue;
    }
    const record = db?.stances?.find((stance) => stance.id === id) || null;
    unplaced.push(record?.name?.["en-US"] || id);
  }

  // Math.floor(Number(...)) turns "3", 3.9 and 3 all into 3; a NaN (undefined, "", a string that
  // isn't a number) falls through to 0 rather than clamping to it, so the reason stays legible.
  const requested = Math.floor(Number(focus));
  const clampedFocus = Number.isFinite(requested) ? Math.max(0, Math.min(FOCUS_MAX, requested)) : 0;
  for (let i = 1; i <= clampedFocus; i += 1) values[`focus${i}`] = "Yes";

  return { values, unplaced };
}
