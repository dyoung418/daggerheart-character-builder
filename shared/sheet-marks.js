// The slots a character HAS, drawn onto page one under the boxes a player marks in play.
//
// WHAT THIS IS FOR
// ----------------
// The sheet's HP row is twelve boxes: five drawn solid, seven drawn as a dashed outline. Stress is
// six and six. The dashed ones are not decoration — they are the slots a character might GROW into,
// and the printed sheet expects you to trace the ones you actually have in pen, so that at the
// table you can see where your last box is without counting. Proficiency is the same idea in
// circles: six rings, the first with a filled pip in it, and you fill in the rest as you earn them.
//
// The app knows all three numbers and already prints them — `hp-slots`, `stress-slots` and
// `proficiency`, the little fields at the end of each row (shared/sheet-fields.js:257, :324-325).
// This module draws what those numbers mean.
//
// THE NUMBERS COME FROM THE FIELD MAP, NOT FROM A SECOND DERIVATION
// -----------------------------------------------------------------
// slotMarkOps() is handed the very map that is about to be written into the template, and reads the
// three values out of it. That is not laziness about plumbing: the one failure this feature can
// have that a reader would never catch is the drawing disagreeing with the number printed beside
// it — nine traced boxes next to a "10". Deriving the counts a second time is exactly how the two
// would drift, and no test would see it, because both halves would be individually right. Reading
// the printed string makes them the same fact by construction.
//
// A value that isn't a bare integer draws NOTHING for that row. deriveSheet writes "" for a number
// it hasn't got (sheet-fields.js:179-183), and a character with no class has no Hit Points — a row
// of washed-out boxes asserting "you have zero" is a worse answer than the untouched template,
// which asserts nothing.
//
// WHY THIS IS PAGE CONTENT AND NOT AN APPEARANCE STREAM
// -----------------------------------------------------
// Every box here already carries a checkbox widget (`hp1`-`hp12`, `st1`-`st12`), so drawing through
// those widgets' /AP looks like the obvious route. It does not work, for three separate reasons,
// and the first is fatal:
//
//   1. THE WIDGETS ARE DELIBERATELY BIGGER THAN THE BOXES. `hp1`'s /Rect is 14.314 x 10; the box
//      the artwork draws under it is 15.287 x 7.643. That is not sloppy authoring — the template's
//      tick mark is scaled to its widget, and a widget cut down to the printed box draws a check
//      too small to read. An appearance stream is clipped to its own /BBox (§8.10.2), so a stream
//      hung on that widget could not reach the box's right-hand edge: the dashed outline would
//      still show through, one point of it, on every traced box.
//   2. THE PROFICIENCY CIRCLES ARE NOT FIELDS AT ALL. They are artwork, with no widget to hang an
//      appearance on, so half of this feature needs page content whatever the other half does.
//   3. It would only work in one export mode. /NeedAppearances true asks the reader to regenerate
//      appearances, and the readers that honour it draw their own idea of a checkbox over ours.
//      Page content is not an annotation, so the flag has no opinion about it — and, for the same
//      reason, a Chrome save leaves it alone, where it regenerates all 71 appearance streams.
//
// Page content also draws UNDER the annotations, which is the behaviour this wants: a player who
// ticks `hp7` in a reader gets the template's check on top of our traced box, not instead of it.
//
// THE GEOMETRY IS MEASURED, AND THE MEASUREMENT IS CHECKED
// --------------------------------------------------------
// Every number in SLOT_GEOMETRY was read off the template's own artwork (see below for how), not
// eyeballed and not taken from the widget rects — the whole point is that these marks are
// indistinguishable from the boxes the sheet was printed with. Both rows turned out to be exact
// arithmetic progressions, which is why six numbers describe twelve boxes.
//
// The template is not in this repo, so no test here can re-measure it. tools/sheet/slot-geometry.py
// in the private content repo does: it re-derives every constant from the rendered artwork and
// fails if this file has drifted. Run it after any edit to the master PDF that moves these rows.
//
// WHAT IS NOT DRAWN, AND WHY
// ---------------------------
// The ARMOR slots (`as1`-`as12`) are the same idea and are deliberately left alone. Their artwork
// has no available/unavailable convention to complete — twelve identical filled discs, drawn like
// the proficiency rings rather than like the HP boxes — so marking them would mean inventing a
// visual language rather than finishing the sheet's own. HOPE is left alone because everyone has
// exactly six (advancement.js:148), so there is nothing to say.

import { formatNumber as n } from "./pdf.js";

// Page-one geometry in PDF user space: y UP from the bottom of a 612x792 page, which is the space
// a page content stream is in. (The measurements were taken y-down and flipped once, here, so that
// nothing downstream has to know the page height.)
//
// `printed` is how many boxes the artwork already draws solid — the free ones every character has,
// and therefore the first box this module can ever need to trace. `count` is the row length, which
// is also the rules' maximum: Hit Points and Stress are both capped at 12 (advancement.js:136-139)
// and Proficiency tops out at 6 (base 1, achievements at levels 2/5/8, and one two-slot pick in
// each of tiers 3 and 4). The sheet was drawn to those ceilings, so a row can never overflow —
// but the clamp below is kept anyway, because "the constant and the artwork agree" is a claim about
// today's SRD and this module would rather draw twelve boxes than run off the end of the row.
// `last` is where the row's FINAL box starts, measured directly rather than computed. It is
// redundant with x + pitch * (count - 1) and that redundancy is the point: four numbers that were
// read off the artwork separately, and only the true four satisfy the relation. A pitch typed with
// a digit out of place puts box twelve in the next column of the sheet, which is the one mistake
// here that no amount of counting shapes would catch — tests.js asserts the relation, and
// tools/sheet/slot-geometry.py re-measures every term of it.
export const SLOT_GEOMETRY = Object.freeze({
  rows: Object.freeze([
    Object.freeze({ field: "hp-slots", x: 36.956, pitch: 18.777, last: 243.503, width: 15.287, y: 553.765, height: 7.643, count: 12, printed: 5 }),
    Object.freeze({ field: "stress-slots", x: 62.863, pitch: 16.5162, last: 244.541, width: 13.447, y: 531.71, height: 7.643, count: 12, printed: 6 }),
  ]),
  pips: Object.freeze({ field: "proficiency", x: 443.97, pitch: 11.442, last: 501.18, y: 615.04, radius: 3.235, count: 6, printed: 1 }),
  // The artwork's own corner radius and stroke weight. A traced box is the SAME PATH the solid
  // boxes are drawn with, at the same width and the same round cap, which is why it lands on the
  // dashed outline instead of beside it.
  radius: 1.261,
  lineWidth: 1,
  // RGB(108,109,112), lifted from the five solid HP boxes. The dashed ones are RGB(188,189,192) —
  // the same path in a lighter grey, drawn as separate fragments rather than with a dash pattern,
  // which is why a solid stroke of the same weight covers them completely.
  trace: "0.42353 0.42745 0.43922",
  // RGB(217,218,221): the dashed grey, most of the way to white. Chosen by rendering it, not
  // computed. It has to read as "not yours" from across a table while staying clearly lighter than
  // the template's tick — the check a player marks is a small dark stroke about 4pt wide, so a pale
  // even wash across the whole box cannot be mistaken for one.
  wash: "0.85098 0.8549 0.86667",
  // RGB(62,62,63), lifted from the one pip the template fills in for you.
  pip: "0.24314 0.24314 0.24706",
});

// A bare non-negative integer, or null. Deliberately strict: "9" marks nine boxes, and anything
// else — "", "—", "9 (capped)", undefined — marks none. See the header on why a wrong guess here
// is worse than no drawing at all.
function slotCount(value) {
  return typeof value === "string" && /^\d+$/.test(value) ? Number(value) : null;
}

// The rounded rectangle the sheet's own boxes are drawn as: four lines and four quarter-circle
// curves, closed. 0.5523 is the usual circle-from-beziers constant, and it is the one the artwork
// used — its control points sit 0.4477r back from each corner, which is the same statement.
function roundedRect(x0, y0, x1, y1, r) {
  const k = 0.5523 * r;
  return `${n(x0 + r)} ${n(y0)} m ${n(x1 - r)} ${n(y0)} l `
    + `${n(x1 - k)} ${n(y0)} ${n(x1)} ${n(y0 + k)} ${n(x1)} ${n(y0 + r)} c `
    + `${n(x1)} ${n(y1 - r)} l `
    + `${n(x1)} ${n(y1 - k)} ${n(x1 - k)} ${n(y1)} ${n(x1 - r)} ${n(y1)} c `
    + `${n(x0 + r)} ${n(y1)} l `
    + `${n(x0 + k)} ${n(y1)} ${n(x0)} ${n(y1 - k)} ${n(x0)} ${n(y1 - r)} c `
    + `${n(x0)} ${n(y0 + r)} l `
    + `${n(x0)} ${n(y0 + k)} ${n(x0 + k)} ${n(y0)} ${n(x0 + r)} ${n(y0)} c h\n`;
}

function disc(cx, cy, r) {
  const k = 0.5523 * r;
  return `${n(cx + r)} ${n(cy)} m `
    + `${n(cx + r)} ${n(cy + k)} ${n(cx + k)} ${n(cy + r)} ${n(cx)} ${n(cy + r)} c `
    + `${n(cx - k)} ${n(cy + r)} ${n(cx - r)} ${n(cy + k)} ${n(cx - r)} ${n(cy)} c `
    + `${n(cx - r)} ${n(cy - k)} ${n(cx - k)} ${n(cy - r)} ${n(cx)} ${n(cy - r)} c `
    + `${n(cx + k)} ${n(cy - r)} ${n(cx + r)} ${n(cy - k)} ${n(cx + r)} ${n(cy)} c h\n`;
}

function boxAt(row, index) {
  const x = row.x + row.pitch * index;
  return [x, row.y, x + row.width, row.y + row.height];
}

/**
 * The page-one content stream that says which slots this character has.
 *
 * @param {Object<string, (string|boolean)>} fieldValues  what sheetFieldValues() produced. Read for
 *   `hp-slots`, `stress-slots` and `proficiency` and for nothing else; every other key is ignored,
 *   so this can be handed the whole map without being coupled to the rest of it.
 * @returns {string} PDF operators, ASCII only, or "" when there is nothing to draw — which is what
 *   a caller should treat as "append no stream at all" rather than appending an empty one.
 *
 * The output is a self-contained q/Q pair that sets every piece of graphics state it depends on
 * (colour, width, cap, join, dash). It has to be: it is concatenated onto the end of the page's own
 * content, and while both of this template's pages leave the stack balanced with an identity CTM
 * at depth zero — checked, and re-checked by tools/sheet/slot-geometry.py — inherited COLOUR and
 * line width are not something the spec gives us any promise about.
 */
export function slotMarkOps(fieldValues) {
  const values = fieldValues || {};
  const traces = [];
  const washes = [];
  for (const row of SLOT_GEOMETRY.rows) {
    const have = slotCount(values[row.field]);
    if (have === null) continue;
    const to = Math.max(0, Math.min(row.count, have));
    // Trace the ones the artwork drew dashed and this character owns...
    for (let i = row.printed; i < to; i++) traces.push(roundedRect(...boxAt(row, i), SLOT_GEOMETRY.radius));
    // ...and wash out everything past the last one they own, whether the artwork drew it dashed or
    // not. A row can only be shorter than `printed` if a future rule lowers a minimum, and in that
    // case washing a box the template drew solid is the right answer rather than a special case.
    for (let i = to; i < row.count; i++) washes.push(roundedRect(...boxAt(row, i), SLOT_GEOMETRY.radius));
  }

  const pips = [];
  const { pips: p } = SLOT_GEOMETRY;
  const proficiency = slotCount(values[p.field]);
  if (proficiency !== null) {
    for (let i = p.printed; i < Math.min(p.count, proficiency); i++) {
      pips.push(disc(p.x + p.pitch * i, p.y, p.radius));
    }
  }

  if (!traces.length && !washes.length && !pips.length) return "";
  // Washes first, so that a traced box always wins where two ever overlap. They cannot today —
  // the two ranges meet and do not cross — but the order costs nothing and makes the drawing
  // independent of the arithmetic above staying true.
  return "q\n"
    + `${n(SLOT_GEOMETRY.lineWidth)} w 1 J 0 j [] 0 d\n`
    + (washes.length ? `${SLOT_GEOMETRY.wash} rg\n${washes.join("f\n")}f\n` : "")
    + (traces.length ? `${SLOT_GEOMETRY.trace} RG\n${traces.join("S\n")}S\n` : "")
    + (pips.length ? `${SLOT_GEOMETRY.pip} rg\n${pips.join("f\n")}f\n` : "")
    + "Q\n";
}
