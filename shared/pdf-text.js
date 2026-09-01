// Laying text into a form field's box: the layout layer under our own appearance streams.
//
// WHY THIS EXISTS
// ---------------
// pdf-form.js fills the official sheet by writing each field's /V and setting /NeedAppearances
// true — a formal request that the READER lay the text out, for the reasons its own header gives.
// Four readers answered it four ways, and on paper Firefox dropped 341 of the 1430 characters in
// `class-features`, including the whole of the Druid's Strange Patterns, with nothing on the page
// to say so. The fix is to draw the text ourselves: an /AP /N Form XObject per filled field and
// /NeedAppearances false, so every reader draws what we drew.
//
// winansi.js is the character layer under that — bytes and widths. This file is the layer above
// it: where the line breaks go, how big the type is, and which operators say so. It takes a
// field's value and its box and hands back a finished content stream. It does not know what a PDF
// object is, does not know which field it is drawing, and imports nothing but winansi.js and
// pdf.js's formatNumber() — so tests/tests.js can import it and assert on the stream as one exact
// literal, the way tests.js:4049 already does for pdf.js's output.
//
// THE FIT RULE IS THE BUG
// -----------------------
// Firefox's shipped pdf.worker.mjs:54240 chooses a font size such that `chunks × fontSize ≤
// height` — one fontSize of vertical space per line — and then RENDERS the block at
// `lineHeight = height / numberOfLines`, which for the size it just picked is about 1.35 ×
// fontSize. The laid-out block is therefore ~35% taller than the block it sized, it runs out of
// the bottom of the field, and the /AP's own /BBox clips the overflow. No error, no ellipsis, no
// scrollbar: the text is simply not on the paper. Simulating that arithmetic reproduces 338
// clipped characters against the 341 measured on the printed sheet.
//
// So the one rule this file exists to keep is: THE FITTER TESTS THE LAID-OUT BLOCK, at the same
// leading AND from the same first baseline the emitter below is about to draw with.
// `lines × fontSize` is the shape of the bug. Every accepted layout satisfies
//
//     h − 1 − 0.905×size − (lines−1) × LEADING × size ≥ DESCENT × size   (the LAST baseline the
//                                                                        emitter will write,
//                                                                        with room under it)
//     max line width                                 ≤ width − 2
//
// The first inequality is deliberately expressed as a baseline and not as a block height. The
// tidier-looking `lines × LEADING × size + DESCENT × size ≤ height − 2` charges every line a full
// leading including the first, which no line actually costs: the first baseline sits
// FIRST_BASELINE (0.905em) below the top inset, not a whole LEADING (1.116em) below it, and only
// the gaps between lines cost LEADING. On a tall box the two agree — class-features' 22 lines
// land on 7pt either way — but on this sheet's three 16pt-tall multiline boxes the block form is
// two points conservative, sizing `class-subclass` at 10pt where the text demonstrably fits at
// 12. Measured against the render this design was approved on, which draws it at 12.
//
// That pair of inequalities, checked over every field of a real character, is the assertion that
// stands in for a reader we cannot run, and it is what the suite should test. What the suite must
// NOT do is pin the sizes this file chooses for catalogue text: data/ is user-installable
// (sources.local.json can say ["void"], which is 24 classes rather than 15), so an SRD update
// would turn a pinned 7 red with a message blaming the fitter for a change in the words.
//
// WHY 1.156 FOR ONE LINE, AND WHY 1.35 IS THE WRONG CONSTANT HERE
// ---------------------------------------------------------------
// 1.35 is a LEADING factor: the height of a line box in running text, with roughly 46% of space
// added above the glyphs so consecutive lines do not touch. In a fixed-height box with ONE line
// in it, that added space is height the glyphs can never use, so the size bottoms out on the box
// height long before the box is full.
//
// The irony worth recording: 1.35 is not what breaks the readers' single-line branch. There they
// size with it and render with it, so the text is merely smaller than it needed to be —
// self-consistent and safe. The bug is that their MULTILINE branch sizes with one constant
// (fontSize) and draws with another (1.35 × fontSize). A constant is not wrong or right on its
// own; using two of them for the same distance is.
//
// What a single line in a fixed box actually needs is the tallest any glyph can be. Adobe
// Helvetica's FontBBox is [-166 -225 1000 931] (pdfminer.fontmetrics agrees, and it is the metric
// every reader uses for the standard 14 — the urw-base35 AFM on this machine reports its own
// wider box, which is why the number is not taken from there), so that height is
// (931 + 225)/1000 = 1.156em. Sizing so the FONT's bbox fits guarantees no glyph of any value can
// touch the box edge, and — the reason it is worth more than a per-string ascent — it does not
// depend on the string, so `evasion` "13" and `armor-score` "4" come out a point apart instead of
// six, and the same box is the same size on every character's sheet. Measured against the
// readers, this is never smaller than Chrome and up to 20% larger: evasion 22 (Firefox) / 25
// (Chrome) / 26 (ours), armor-score 22 / 25 / 27, agility "+2" 19 / 20 / 24, name 10 / 12 / 13 —
// and running this file over the same character's 48 filled fields returns that last column
// exactly, which is the check that the formula here is the one the survey measured.
//
// DESCENT is 0.207 rather than the bbox's 0.225: it is the descent the placement measurement
// reserved below the last baseline, and it is the number the reference render was approved with.
// The two differ by 0.018em — 0.22pt at 12pt — and only the multiline predicate uses it; 0.225
// appears here only as half of the 1.156 divisor above.
//
// WHY MULTILINE IS CAPPED AT 12 AND SINGLE-LINE IS NOT
// ----------------------------------------------------
// A multiline box on this sheet is sized for a LIST, not for its current contents. `inventory-
// items` is 294.5 × 91.2pt (measured in data/sheet/sheet-template.pdf) and often holds one short
// line: uncapped, this fitter puts "Minor Health Potion" and "Flexible: +1 to Evasion" in it at
// 36pt — the planning survey, whose predicate was a shade looser, said 40 and 25 — and every one
// of those numbers looks like a mistake rather than a character sheet. So multiline walks the
// sizes 12 → 6 in quarter points and takes the first that fits. Single-line boxes are the stat
// the name banner, where filling the box IS the design, so that branch is closed-form and uncapped.
//
// THE 6pt FLOOR, AND WHY IT ENDS IN AN ELLIPSIS
// ---------------------------------------------
// Below 6pt the text stops being readable on paper, so 6 is the floor in both branches. When even
// 6pt will not hold the value, this file truncates, ends the last drawn line with a visible
// ellipsis (WinAnsi 0x85, /ellipsis), and REPORTS it in notes.truncated. Never clip silently —
// silent clipping is the defect this whole feature exists to fix, and reproducing it with our own
// arithmetic instead of Firefox's would be the same page with a different author.
//
// It is reachable, barely: of the sheet's 71 text fields (16 of them multiline, counted in the
// template) the three free-text boxes are the only ones a person can type into without limit, and
// `appearance` (180.9 × 127.8pt) holds on the order of 430 characters of prose at 10pt and 1,180
// at 6pt — this fitter, on the sample sheet's own class-features text; the planning survey said
// 440 and 1,273. The exact number depends on which words, so treat either as an order of
// magnitude: filling that box takes deliberate typing.
//
// PLACEMENT — MEASURED OFF CHROME, 53 FIELDS, 0 DISAGREEMENTS
// -----------------------------------------------------------
//     inset x (/Q 0)      1.0                     centre x (/Q 1)  (w − textWidth) / 2
//     right x (/Q 2)      w − 1 − textWidth       clip             1 1 (w−2) (h−2) re W n
//     multiline first y   h − 1 − 0.905 × size    leading          1.116 × size
//     single-line y       h/2 − 0.355 × size
//
// These are not to be swapped for something that looks tidier. Two designs proposed
// `h/2 − 0.2555 × size` and `h/2 − 0.3 × size` for the single-line baseline; at 12pt in a 16pt
// box those are out by 1.10pt and 0.56pt, which is a visibly crooked stat circle. And MuPDF is
// NOT a witness here: its generated appearances use a different first baseline and a leading of
// about 1.563, so letting it lay a page out proves nothing about ours.
//
// One consequence of Chrome's first baseline, since it looks like an off-by-one: h − 1 − 0.905s
// puts the FontBBox top of the first line at h − 1 + 0.026s, a hair above the clip rectangle's
// own top edge. At 12pt that is 0.31pt, and only a glyph that reaches the full bbox top (an
// accented capital) gets anywhere near it. Chrome's own appearance streams do exactly this, the
// reference render was read and approved with it, and the vertical predicate above therefore
// reserves the descent at the bottom and nothing at the top.
//
// WRAPPING: NEWLINES ARE STRUCTURE, AND THEY COME FIRST
// -----------------------------------------------------
// Values really do contain newlines, and losing them changes what the sheet says: gear.js:183
// joins a weapon's features with "\n", gear.js:149 prefixes each list item with "\n• ", and
// sheet-fields.js:405 joins two classes' features with "\n\n" — a blank line the reader has to
// see, or the multiclass's features read as more of the first class's. So the value is split on
// 0x0A first and each paragraph is wrapped on its own; wrapping never runs across a newline, and
// a blank paragraph stays a blank line that costs a full leading step.
//
// The greedy algorithm and its hard-break are card-content.js:523 `wrap()` and :568
// `longestFit()`, which are the established ones in this project and are reproduced rather than
// reused for two reasons. First, they are not exported. Second, and the reason a re-export would
// not have been enough: card-content splits on /\s+/, which destroys every newline in the value
// before the wrap starts, and in the latin1 "codes" strings this file works with, JavaScript's \s
// ALSO matches 0xA0 — which winansi.js maps from U+00A0 NO-BREAK SPACE and which is a real
// /space glyph 278/1000 em wide. Breaking a line at a no-break space is the one thing that
// character exists to forbid. Here the only break opportunity is the ASCII space, 0x20.
//
// Runs of spaces collapse in the DRAWING, exactly as they do in card-content: a line is rebuilt
// by joining its words with one space. /V keeps the true string; and the alternative — carrying a
// trailing space into a wrap point — shifts a /Q 1 line half a space off centre for a character
// nobody can see. Trailing BLANK lines are dropped for the same class of reason: they are
// invisible, they can push a fit down a whole point, and at the floor they would make us report a
// truncation that dropped nothing.
//
// MEASURER INJECTED
// -----------------
// Every entry point takes the measurer (as an argument, or as box.measure), defaulting to
// winansi.js's real Helvetica one — the idiom card-content.js:363 states and tests.js:4870 uses.
// A test passes `(codes, size) => codes.length * 10`, counts the breaks by hand, and asserts on
// where they landed; a version of this that reached for the width table directly could only be
// checked by rendering it.
//
// DETERMINISM
// -----------
// Same value and same box in, byte-identical stream out. No Date, no Math.random, no iteration
// over an unordered Map, every number through formatNumber() (pdf.js:105), and notes folded in
// first-appearance order rather than gathered from a Set.

import { formatNumber } from "./pdf.js";
import { encodeWinAnsi, literalBody, measure as helveticaMeasure } from "./winansi.js";

// The layout constants, all of them in ems (multiply by the font size) except INSET, which is
// points. Frozen and exported because the fit predicate has to be checkable from outside this
// file. Sharing the numbers means such a check cannot catch a WRONG constant — only a re-measure
// against a reader can do that, and the header says where each one came from. What it does catch
// is the fitter and the emitter drifting apart, which is the failure that actually happened, in
// Firefox, and cost 341 characters.
export const LAYOUT = Object.freeze({
  INSET: 1,            // the border the clip and every left edge stand off by, on all four sides
  LEADING: 1.116,      // baseline to baseline, multiline
  FIRST_BASELINE: 0.905, // first baseline, down from the top inset
  SINGLE_BASELINE: 0.355, // single-line baseline, down from the vertical centre
  DESCENT: 0.207,      // reserved below the LAST baseline, so a comma stays inside the clip
  BBOX_HEIGHT: 1.156,  // (931 + 225)/1000: the tallest Helvetica can draw, the single-line divisor
  MAX_MULTILINE_SIZE: 12, // see the header: a list-sized box holding one potion name
  MIN_SIZE: 6,         // the floor; below it, truncate with an ellipsis and report
  SIZE_STEP: 0.25,     // the size granularity; see WHY SIZES ARE FRACTIONAL in the header
});

const { INSET, LEADING, FIRST_BASELINE, SINGLE_BASELINE, DESCENT, BBOX_HEIGHT } = LAYOUT;
const { MAX_MULTILINE_SIZE, MIN_SIZE, SIZE_STEP } = LAYOUT;

// The ladder, as integer STEPS rather than accumulated floats: 12, 11.75, … 6. Counting in steps
// and multiplying once keeps every size exactly representable and the search deterministic —
// `size -= 0.25` twenty-four times does not land on 6, and byte-identical output is a tested
// contract here (tests.js fills the same values with the keys reordered and demands the same
// bytes).
const STEPS_MAX = Math.round(MAX_MULTILINE_SIZE / SIZE_STEP);
const STEPS_MIN = Math.round(MIN_SIZE / SIZE_STEP);
const stepSize = (n) => n * SIZE_STEP;

// WinAnsi 0x85 is /ellipsis — one glyph, 1000/1000 em. This is a latin1 CODES character, not the
// Unicode U+2026 it draws and not the C1 control that shares its number; winansi.js's header
// spells out why those are three different things.
const ELLIPSIS = "\u0085";

// The name pdf-form.js gives the plain WinAnsi Helvetica in each appearance stream's OWN
// /Resources, and so the name this file writes after the Tf's slash. It is deliberately NOT the
// font the template's fields name: all 71 of their /DA strings read `/Helvetica 0 Tf …` (counted
// in data/sheet/sheet-template.pdf), and that /Helvetica carries a /Differences mapping 149 to
// /Lslash which both MuPDF and PDFium honour inside a content stream — so inheriting it would
// draw a Ł where the bytes say bullet. /DhHelv is the name Chrome's own regenerated appearances
// use, in all 53 of them. Only reached when a caller omits box.fontName.
const DEFAULT_FONT = "DhHelv";

// Black, when the field's /DA does not say. Every text field on this sheet does say: 68 of them
// end `0 g`, two end `0 0 0 rg`, and one ends `1 1 1 rg` — `name-pg2`, white on a dark banner. It
// carries the same string as `name`, so the template gives a free two-colour check on one value,
// and it is the reason the colour is read from the field instead of assumed here.
const DEFAULT_COLOUR = "0 g";

// A colour is a few numbers and one of the three non-stroking colour operators, and NOTHING else
// goes into a content stream from a template we did not write. pdf-form.js's daParts() applies
// the same whitelist when it reads the /DA; this is the second one, because this file is the last
// thing standing between that string and the bytes, and an unrecognised /DA fragment here would
// corrupt every operator after it.
const COLOUR_OPERATORS = /^[\d.\s]+(?:g|rg|k)$/;

// A PDF name written without escapes. Anything outside this cannot be spelled as `/name` in the
// stream without #-encoding, and a font name that does not match the /Resources key draws nothing.
const SIMPLE_NAME = /^[A-Za-z0-9_.+-]+$/;

/**
 * @typedef {object} Box  A field's geometry and its drawing style, all of it read from the widget.
 * @property {number} width      the /Rect's width in points, normalised positive
 * @property {number} height     the /Rect's height in points, normalised positive
 * @property {boolean} [multiline]  /Ff bit 13
 * @property {number} [quad]     /Q: 0 left, 1 centre, 2 right. Anything else is treated as left.
 * @property {string} [colour]   the colour operators from the field's own /DA, e.g. "0 g"
 * @property {string} [fontName] the font name for the /AP's /Resources, without the slash
 * @property {(codes: string, size: number) => number} [measure]  injected; defaults to Helvetica
 */

/**
 * Greedy line breaking, on an ENCODED string, honouring the newlines in it.
 *
 * @param {string} codes  a latin1 codes string, 0x0A separating paragraphs. Note that
 *   encodeWinAnsi() REMOVES 0x0A as a C0 control, so a caller that wants newlines honoured splits
 *   on them before encoding — which is what encodeParagraphs() below does, and why textAppearance
 *   does not report a newline as a removed character.
 * @param {number} width  the width available for text, in points: the box width less both insets
 * @param {number} size   font size in points
 * @param {(codes: string, size: number) => number} [measure]  injected; defaults to Helvetica
 * @returns {string[]} one latin1 codes string per line, "" for a blank line. No line contains a
 *   0x0A. Trailing blank lines are dropped; interior and leading ones are kept.
 */
export function wrapLines(codes, width, size, measure = helveticaMeasure) {
  const lines = [];
  for (const paragraph of String(codes).split("\n")) {
    // A paragraph with nothing but spaces in it is a blank line, not a line with no words: the
    // word loop below would drop it entirely and take a real blank line off the sheet with it.
    // Only 0x20 counts — 0xA0 is a glyph, and a line of them is a line.
    if (/^ *$/.test(paragraph)) {
      lines.push("");
      continue;
    }
    let line = "";
    for (const word of paragraph.split(" ")) {
      if (!word) continue; // a run of spaces; the join below puts exactly one back
      // A word wider than the whole line has to be cut, or the greedy loop would push it to a
      // fresh line forever and it would never be drawn. longestFit() always takes at least one
      // character, so this terminates even against a measurer that says everything is too wide.
      if (measure(word, size) > width) {
        if (line) lines.push(line);
        line = "";
        let rest = word;
        while (measure(rest, size) > width) {
          const head = longestFit(rest, width, size, measure);
          lines.push(head);
          rest = rest.slice(head.length);
        }
        line = rest;
        continue;
      }
      if (!line) {
        line = word;
      } else if (measure(`${line} ${word}`, size) > width) {
        lines.push(line);
        line = word;
      } else {
        line = `${line} ${word}`;
      }
    }
    if (line) lines.push(line);
  }
  // Invisible height is still height: a value ending in "\n\n" would otherwise cost two leading
  // steps, which can push the whole field down a point, and at the 6pt floor would make us
  // report a truncation whose dropped lines were empty.
  while (lines.length && lines[lines.length - 1] === "") lines.pop();
  return lines;
}

/**
 * The longest prefix of `word` that fits, never fewer than one character.
 *
 * card-content.js:568, with the `bold` parameter dropped: there is one font here.
 *
 * @param {string} word
 * @param {number} width
 * @param {number} size
 * @param {(codes: string, size: number) => number} measure
 * @returns {string}
 */
function longestFit(word, width, size, measure) {
  let n = 1;
  while (n < word.length && measure(word.slice(0, n + 1), size) <= width) n++;
  return word.slice(0, n);
}

/**
 * Choose the font size and the lines for one field.
 *
 * @param {string} value  the field's /V, as Unicode text
 * @param {Box} box
 * @returns {{size: number, lines: string[], truncated: boolean}}
 *   `lines` are latin1 codes strings — hand them to measure() or literalBody(), never to the DOM.
 *   `truncated` is true only when characters were DROPPED, and it is the thing that must be
 *   reported to the user; textAppearance() carries the same flag as notes.truncated.
 */
export function fitLines(value, box) {
  return fitCodes(encodeParagraphs(value).codes, box);
}

/**
 * One field's finished appearance stream.
 *
 * @param {string} value  the field's /V, as Unicode text
 * @param {Box} box
 * @returns {{ops: string, size: number, lines: string[], notes: object}}
 *   `ops` is the COMPLETE content stream as pure ASCII: operators one per line, newline-separated,
 *   with no trailing newline, ready to go between `stream\n` and `\nendstream` with a /Length
 *   equal to its .length (winansi.js's literalBody() guarantees one byte per character).
 *
 *   `notes` is winansi.js's {unmappable, substituted, removed} for the whole value, folded across
 *   paragraphs, PLUS `truncated`. TWO OF THOSE FOUR ARE FOR THE USER AND TWO ARE NOT: the rule
 *   is "report what changes what the sheet SAYS". notes.unmappable is meaning-changing and forces
 *   the document-level fallback (with /NeedAppearances false, a field with /V and no /AP draws
 *   NOTHING in Firefox, so there is no per-field fallback to reach for); notes.truncated is
 *   meaning-changing and names a field. `substituted` and `removed` are glyph choices that
 *   preserve the meaning — a hyphen drawn for a minus sign — and reporting them would put a
 *   warning on every sheet carrying Scale Mail, which trains people to ignore the panel.
 */
export function textAppearance(value, box) {
  const { codes, notes } = encodeParagraphs(value);
  const fit = fitCodes(codes, box);
  return {
    ops: drawOps(fit, box),
    size: fit.size,
    lines: fit.lines,
    notes: {
      unmappable: notes.unmappable,
      substituted: notes.substituted,
      removed: notes.removed,
      truncated: fit.truncated,
    },
  };
}

/**
 * Unicode text → encoded bytes with the newlines still in them, plus one folded set of notes.
 *
 * The split has to happen before the encode, because encodeWinAnsi() removes 0x0A along with the
 * rest of the C0 controls — correctly, since nothing draws it. Splitting first means a newline is
 * treated as the structure it is instead of being reported as a character we threw away, and it
 * means a stray \r (transfer.js normalises structure, not text, so an imported character can
 * carry one) still vanishes into notes.removed where it belongs.
 *
 * U+2028 LINE SEPARATOR and U+2029 PARAGRAPH SEPARATOR break here too, and that is the whole
 * reason they are not on winansi.js's invisible list beside the zero-width characters: they are
 * the one pair in that block that MEANS something. Removing one would silently run two lines
 * together — a small loss, but a loss, and this feature exists because a silent one shipped.
 * Reachable the same way the zero-width space is: a paste from a web page into one of the three
 * unbounded textareas. \r\n and a lone \r are normalised with them, since transfer.js repairs
 * structure and not text, so an imported character file can carry either.
 *
 * @param {string} value
 * @returns {{codes: string, notes: {unmappable: object[], substituted: object[], removed: object[]}}}
 */
function encodeParagraphs(value) {
  const notes = { unmappable: [], substituted: [], removed: [] };
  const parts = [];
  // Escaped, never literal: two of these four are invisible in an editor, and a source file
  // whose behaviour depends on a character you cannot see is one bad paste from a silent bug.
  for (const paragraph of String(value ?? "").split(/\r\n?|\n|\u2028|\u2029/)) {
    const encoded = encodeWinAnsi(paragraph);
    parts.push(encoded.codes);
    foldNotes(notes.unmappable, encoded.notes.unmappable);
    foldNotes(notes.substituted, encoded.notes.substituted);
    foldNotes(notes.removed, encoded.notes.removed);
  }
  return { codes: parts.join("\n"), notes };
}

/**
 * Merge one paragraph's notes into the field's, folding by code point.
 *
 * Linear on purpose, and copying rather than adopting the note objects: these lists hold one
 * entry per DISTINCT code point and real values produce between zero and a handful, and
 * first-appearance order plus a summed count is what keeps the result deterministic without a Map
 * to iterate. Same shape as winansi.js's own note().
 *
 * @param {object[]} into
 * @param {object[]} from
 */
function foldNotes(into, from) {
  for (const note of from) {
    const existing = into.find((entry) => entry.codePoint === note.codePoint);
    if (existing) existing.count += note.count;
    else into.push({ ...note });
  }
}

/**
 * The fit, on already-encoded codes. Both public entry points come through here.
 *
 * @param {string} codes
 * @param {Box} box
 * @returns {{size: number, lines: string[], truncated: boolean}}
 */
function fitCodes(codes, box) {
  checkBox(box);
  const measure = box.measure || helveticaMeasure;
  return box.multiline ? fitMultiline(codes, box, measure) : fitSingle(codes, box, measure);
}

/**
 * Multiline: the largest size from 12 down, in quarter points, whose LAID-OUT block fits.
 *
 * The predicate is the header's, and it is the whole point of this file. Note that the width test
 * is very nearly redundant — wrapLines() breaks at the same width, so it can only fail when a
 * SINGLE glyph is wider than the whole line, and by the 6pt floor that would take a box under
 * about 8pt wide (the widest WinAnsi glyph, /at at 1015/1000 em, is 6.09pt there; the narrowest
 * text box on this sheet is 16.0pt, which leaves 14). It is checked anyway, because "the wrapper
 * and the fitter disagree about a width" is exactly the class of failure this feature exists to
 * stop, and the cost of catching it is one size smaller rather than a box that overflows.
 *
 * @param {string} codes
 * @param {Box} box
 * @param {(codes: string, size: number) => number} measure
 * @returns {{size: number, lines: string[], truncated: boolean}}
 */
function fitMultiline(codes, box, measure) {
  const width = box.width - 2 * INSET;
  for (let n = STEPS_MAX; n >= STEPS_MIN; n--) {
    const size = stepSize(n);
    const lines = wrapLines(codes, width, size, measure);
    if (lastBaseline(lines.length, size, box.height) >= DESCENT * size
      && widestLine(lines, size, measure) <= width) {
      return { size, lines, truncated: false };
    }
  }

  // The floor. Keep as many lines as the box can hold at 6pt and end the last one with an
  // ellipsis, so the sheet says "there was more" rather than pretending there wasn't.
  const size = MIN_SIZE;
  const lines = wrapLines(codes, width, size, measure);
  // At least one line even in a box too short to hold one: drawing a clipped line and reporting it
  // beats drawing nothing. Unreachable on the real sheet — its shortest multiline box is 16.0pt
  // tall, and one 6pt line puts its baseline at 9.57pt with 1.24pt of descender to spare.
  // Solved from lastBaseline() rather than restated, so the floor keeps exactly as many lines as
  // the loop above would have accepted: boxHeight − INSET − FIRST_BASELINE·s − (n−1)·LEADING·s ≥
  // DESCENT·s.
  const room = box.height - INSET - (FIRST_BASELINE + DESCENT) * size;
  const maxLines = Math.max(1, 1 + Math.floor(room / (LEADING * size)));
  if (lines.length <= maxLines) return { size, lines, truncated: false };
  const kept = lines.slice(0, maxLines);
  // Never hang the ellipsis on a blank line: it would read as a stray mark in the middle of the
  // box rather than as the end of the text.
  while (kept.length > 1 && kept[kept.length - 1] === "") kept.pop();
  kept[kept.length - 1] = withEllipsis(kept[kept.length - 1], width, size, measure);
  return { size, lines: kept, truncated: true };
}

/**
 * Single-line: closed-form, no iteration, no cap.
 *
 * min(h / 1.156, (w − 2) / textWidth), floored to a quarter point. The asymmetry is deliberate and
 * is not a missing inset: the HEIGHT term divides the FULL box height, which is what 1.156 was
 * chosen against and what the readers' own single-line branch divides too (by 1.35), while the
 * WIDTH term is the drawable width, because the line really is placed one point in from the edge
 * and has to stop one point before the far one.
 *
 * QUARTER points, not whole ones. This was whole points until 2026-09-01, on the argument that a
 * stat circle reading 26 beside one reading 25.7143 is a rendering artefact made visible, and that
 * a size a reader also lands on makes an edited field blend in. Danny overruled it, and the
 * measurement is why: the ladder is coarse where it costs most. `class-features` at its worst
 * takes 6pt, because 7pt needs 30 lines and about 25 fit — which left 45pt of a 205.7pt box empty
 * and the hardest-to-read field on the sheet a point smaller than it needed to be. A quarter of a
 * point is invisible as a difference between two boxes and worth 5-8% of type size inside one:
 * that worst case goes 6 → 6.5, the longest single class 9 → 9.5, a mid-length one 10 → 10.5.
 *
 * Not finer than a quarter. The gain past that is under a percent, and every extra decimal is
 * another digit in every Tf and every Tm of a stream that is already the biggest thing we append.
 * @param {string} codes
 * @param {Box} box
 * @param {(codes: string, size: number) => number} measure
 * @returns {{size: number, lines: string[], truncated: boolean}}
 */
function fitSingle(codes, box, measure) {
  // A newline in a single-line field is not a line break — the field has one line. Drawing the
  // paragraphs run together is what every reader does with it, and /V keeps the newline.
  const line = String(codes).split("\n").join(" ");
  const width = box.width - 2 * INSET;
  const unit = measure(line, 1); // linear in size, so one measurement is the whole width term
  const byWidth = unit > 0 ? width / unit : Infinity; // an empty line is height-limited
  const size = stepSize(Math.floor(Math.min(box.height / BBOX_HEIGHT, byWidth) / SIZE_STEP));
  if (size >= MIN_SIZE) return { size, lines: [line], truncated: false };

  // The floor. Only the width term can bring us here on this sheet: the shortest single-line box
  // is 14.0pt, and 14 / 1.156 is 12.1. A box under 6.94pt tall would be sized to 6 here and then
  // clipped by its own /BBox — the one case this module cannot fix without a lower floor, and
  // there is no such field in the template.
  if (measure(line, MIN_SIZE) <= width) return { size: MIN_SIZE, lines: [line], truncated: false };
  return { size: MIN_SIZE, lines: [withEllipsis(line, width, MIN_SIZE, measure)], truncated: true };
}

/**
 * Where the LAST of `count` lines puts its baseline, measured up from the bottom of the box —
 * written once so the size loop above and the floor's line count below cannot come to disagree
 * about what "fits" means. A block fits when this leaves room for a descender: `>= DESCENT×size`.
 *
 * THIS IS THE PREDICATE, and it is deliberately not the simpler `count×LEADING + DESCENT <=
 * height − 2×INSET`. That form charges every line a full leading, including the first, which no
 * line actually costs: the first baseline is placed FIRST_BASELINE (0.905em) below the top inset,
 * not a whole leading (1.116em) below it, and only the gaps between lines cost LEADING. On a tall
 * box the two agree — class-features' 22 lines land on 7pt either way — but on the sheet's three
 * 16pt-tall multiline boxes the block form is over-conservative by two points: it sizes
 * class-subclass at 10pt where the text demonstrably fits at 12. Measured against the render this
 * design was approved on, which draws them at 12pt and 9pt.
 *
 * It is still the strict direction. Firefox's bug (pdf.worker.mjs:54240) is the opposite mistake:
 * it tests `count × size`, with no leading term at all, then draws at `1.35 × size`, so the block
 * runs up to 35% past the bottom and the /AP's own /BBox clips it silently. Every term here is
 * one the emitter below actually uses.
 *
 * @param {number} count
 * @param {number} size
 * @param {number} boxHeight  the FULL box height, inset included — this measures from its bottom
 * @returns {number}
 */
function lastBaseline(count, size, boxHeight) {
  return boxHeight - INSET - FIRST_BASELINE * size - (count - 1) * LEADING * size;
}

/**
 * @param {string[]} lines
 * @param {number} size
 * @param {(codes: string, size: number) => number} measure
 * @returns {number} the widest line's width in points, 0 for no lines
 */
function widestLine(lines, size, measure) {
  let widest = 0;
  for (const line of lines) {
    const width = measure(line, size);
    if (width > widest) widest = width;
  }
  return widest;
}

/**
 * `line`, shortened as far as it takes for it plus an ellipsis to fit, with the ellipsis on it.
 *
 * Always appends: it is called when something has already been dropped, so the caller has decided
 * the ellipsis is owed and this only decides how much room to make for it. Trailing spaces are
 * cut after the shortening, which cannot make the line wider. If not even the ellipsis fits, the
 * ellipsis alone comes back — a mark slightly over the edge is still a better answer than a box
 * that quietly says less than the character does.
 *
 * @param {string} line
 * @param {number} width
 * @param {number} size
 * @param {(codes: string, size: number) => number} measure
 * @returns {string}
 */
function withEllipsis(line, width, size, measure) {
  let head = line;
  while (head.length > 0 && measure(head + ELLIPSIS, size) > width) head = head.slice(0, -1);
  return head.replace(/ +$/, "") + ELLIPSIS;
}

/**
 * The operators, in the order Chrome writes them.
 *
 *     /Tx BMC                        the marked-content tag every form appearance carries
 *     q                              …so the clip and the colour cannot escape into the page
 *     1 1 (w−2) (h−2) re W n         the field's own clip, one point in on every side
 *     BT
 *     <colour>                       from the field's OWN /DA — `name-pg2` is white on its banner
 *     /<font> <size> Tf
 *     1 0 0 1 x y Tm (…) Tj          one per non-empty line
 *     ET  Q  EMC
 *
 * An ABSOLUTE Tm per line, not a relative Td and not TL/T*, because /Q means every line starts at
 * a different x: a centred line's x depends on that line's own width. Absolute placement also
 * means a mis-measured line cannot drag the ones after it, and it is what the measured Chrome
 * streams do.
 *
 * A blank line emits no operators and still costs a full leading step — that is how "\n\n"
 * survives as a blank line the reader can see.
 *
 * @param {{size: number, lines: string[]}} fit
 * @param {Box} box
 * @returns {string}
 */
function drawOps(fit, box) {
  const measure = box.measure || helveticaMeasure;
  const n = formatNumber;
  const { width, height } = box;
  const { size, lines } = fit;
  const ops = [
    "/Tx BMC",
    "q",
    `${n(INSET)} ${n(INSET)} ${n(width - 2 * INSET)} ${n(height - 2 * INSET)} re W n`,
    "BT",
    colourOperators(box.colour),
    `/${fontName(box.fontName)} ${n(size)} Tf`,
  ];
  if (box.multiline) {
    let y = height - INSET - FIRST_BASELINE * size;
    for (const line of lines) {
      if (line !== "") ops.push(showLine(line, size, y, box, measure));
      y -= LEADING * size;
    }
  } else {
    const line = lines[0] === undefined ? "" : lines[0];
    if (line !== "") ops.push(showLine(line, size, height / 2 - SINGLE_BASELINE * size, box, measure));
  }
  ops.push("ET", "Q", "EMC");
  return ops.join("\n");
}

/**
 * One line, placed and shown.
 *
 * @param {string} line   a latin1 codes string
 * @param {number} size
 * @param {number} y      the baseline, in form space
 * @param {Box} box
 * @param {(codes: string, size: number) => number} measure
 * @returns {string}
 */
function showLine(line, size, y, box, measure) {
  const n = formatNumber;
  return `1 0 0 1 ${n(lineX(line, size, box, measure))} ${n(y)} Tm (${literalBody(line)}) Tj`;
}

/**
 * Where a line starts, given the field's /Q.
 *
 * 0 (left) and anything the spec does not define both come out left-aligned: /Q's only values are
 * 0, 1 and 2, and a widget carrying something else is a template bug that should not decide where
 * the text goes.
 *
 * @param {string} line
 * @param {number} size
 * @param {Box} box
 * @param {(codes: string, size: number) => number} measure
 * @returns {number}
 */
function lineX(line, size, box, measure) {
  if (box.quad === 1) return (box.width - measure(line, size)) / 2;
  if (box.quad === 2) return box.width - INSET - measure(line, size);
  return INSET;
}

/**
 * The colour operators to write, or black.
 *
 * @param {string} [colour] the fragment daParts() lifted out of the field's /DA
 * @returns {string}
 */
function colourOperators(colour) {
  const normalised = String(colour === undefined || colour === null ? "" : colour)
    .trim()
    .replace(/\s+/g, " ");
  return COLOUR_OPERATORS.test(normalised) ? normalised : DEFAULT_COLOUR;
}

/**
 * The font name to write after the slash.
 *
 * Refuses rather than repairs: a name with a space or a delimiter in it cannot be written as
 * `/name` without #-escapes, and quietly substituting one that is not the key in the /AP's own
 * /Resources would draw a page of nothing. The name comes from our own reader, so this can only
 * fire on a caller bug.
 *
 * @param {string} [name]
 * @returns {string}
 */
function fontName(name) {
  const value = name === undefined || name === null ? DEFAULT_FONT : String(name);
  if (!SIMPLE_NAME.test(value)) {
    throw new RangeError(
      `pdf-text.js: ${JSON.stringify(value)} cannot be written as a PDF name without escaping, ` +
      "so it would not match the key in the appearance stream's own /Resources and the field " +
      "would draw nothing",
    );
  }
  return value;
}

/**
 * A box has to have a positive width and height before anything can be laid into it.
 *
 * A reversed /Rect is the case in the field: a negative-extent /BBox renders NOTHING in PDFium and
 * MuPDF, with no error, so pdf-form.js's rectOf() normalises with min/max on both axes. This is
 * the assertion that says so out loud — if that ever regresses, the failure should name the box
 * rather than showing up as an empty field on paper.
 *
 * @param {Box} box
 */
function checkBox(box) {
  for (const key of ["width", "height"]) {
    const value = box[key];
    if (typeof value !== "number" || !Number.isFinite(value) || value <= 2 * INSET) {
      throw new RangeError(
        `pdf-text.js: box.${key} is ${JSON.stringify(value)}, which leaves no room to draw in — ` +
        "a /Rect is normalised with min/max on both axes before it gets here, so a value this " +
        "small means the rectangle never was",
      );
    }
  }
}
