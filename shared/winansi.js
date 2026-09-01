// WinAnsi and Helvetica: the character layer under our own appearance streams.
//
// WHY THIS EXISTS
// ---------------
// pdf-form.js fills the official sheet by writing each field's /V and setting /NeedAppearances
// true — a formal request that the READER lay the text out, for the reasons its own header gives
// at pdf-form.js:63-91. Four readers answered it four ways, and on paper Firefox dropped 341 of
// the 1430 characters in `class-features`, including the whole of the Druid's Strange Patterns,
// with nothing on the page to say so. The fix is to draw the text ourselves — an /AP /N Form
// XObject per filled field, /NeedAppearances false — so the reader draws what we drew.
//
// Drawing it ourselves means knowing how wide it is BEFORE anything is drawn, and knowing that
// without a font file means carrying a metric table. That table is this file, together with the
// encoder that turns a JavaScript string into the bytes a PDF literal must hold to name those
// glyphs, and the escaper that makes those bytes safe to paste into a content stream.
//
// Three jobs, one per export, and deliberately nothing else: no boxes, no line breaking, no
// operators. Wrapping and fitting are pdf-text.js; objects, streams and xref offsets are
// pdf-form.js. Nothing here imports anything — no DOM, no fetch, no dependencies — so
// tests/tests.js can import it and assert on it directly.
//
// WHERE EVERY NUMBER CAME FROM
// ----------------------------
// Derived on this machine, never transcribed. `tools/sheet/helvetica-table.py` in the private
// content repo prints the two literals below on stdout — they are pasted here verbatim, which is
// why their comments spell a dash "--" where the rest of this file uses an em dash — and prints
// its checks on stderr:
//
//   - WIDTHS: glyph name → width, from /usr/share/fonts/type1/urw-base35/NimbusSans-Regular.afm,
//     joined to the encoding ON THE GLYPH NAME. The AFM's own `C` column is the trap: its line 14
//     reads `EncodingScheme AdobeStandardEncoding`, which disagrees with WinAnsi almost everywhere
//     above code 126, so joining on the code would look right and be wrong.
//   - ENCODING: code → glyph name, taken two independent ways and required to agree on all 256
//     codes — dumped out of a running ghostscript (`/WinAnsiEncoding .findencoding`), and
//     separately re-parsed out of that same ghostscript's Resource/Init/gs_wan_e.ps source.
//   - CROSS-CHECKS, and neither of them is a source: pdfminer's Adobe Helvetica metrics agree with
//     the AFM on 223 of the 224 codes 32-255. The single disagreement is code 128 /Euro, for which
//     pdfminer has no width at all, so the AFM's 556 stands. Python's cp1252 codec agrees with the
//     WinAnsi vector on 216 of 224 mappings, and the 8 differences are exactly WinAnsi's
//     documented fills — see the trap below.
//   - A RE-DERIVATION IS CHECKABLE THREE WAYS WITHOUT READING 256 NUMBERS: codes 32-255 sum to
//     120823, they take 28 distinct values, and "Hello" at 11pt measures 25.058pt — which is what
//     PyMuPDF measures for real Helvetica.
//
// THE TRAP: CODE 127 IS /bullet, WIDTH 350
// ----------------------------------------
// WinAnsi is neither Latin-1 nor cp1252. It fills DEL and cp1252's five holes (0x81 0x8D 0x8F
// 0x90 0x9D) with /bullet, 0xA0 with /space and 0xAD with /hyphen. So byte 127 is a printing
// glyph 350/1000 em wide, and a table that zeroed "the control range" would silently mis-measure
// every line containing one.
//
// The trap runs the other way too, which is why encodeWinAnsi() removes U+007F and U+0080-U+009F
// instead of passing them through: the Unicode code point U+0085 is a control character, but
// WinAnsi BYTE 0x85 is /ellipsis, and writing one for the other would print three dots the
// character sheet never said. Unicode code point and WinAnsi byte are different numbers that
// happen to share a range; treating either as the other is the whole class of bug this file
// exists to close.
//
// WHY THERE IS NO KERNING
// -----------------------
// The AFM ships 3838 kern pairs (`StartKernPairs 3838`) and this module consults none of them, on
// purpose. Kerning in PDF is not something a reader applies on a font's behalf: it is an operator
// — `TJ`, with adjustment numbers between the string pieces — and WE emit the operators, one `Tm`
// and one single-string `Tj` per line. A `Tj` advances by exactly the sum of the glyph widths, so
// that sum is what the page actually draws. Kerning the measurement without kerning the drawing
// would make the fitter measure a string nobody rendered, and the error runs the dangerous way: a
// measured-narrower line is judged to fit a box it then overflows, which is a description of the
// Firefox bug this whole feature exists to fix. If a `TJ` emitter ever lands, the kern table
// lands in the same commit.
//
// TWO SUBSTITUTIONS THAT RUN IN OPPOSITE DIRECTIONS, AND ONLY ONE OF THEM IS HERE
// -------------------------------------------------------------------------------
// This file substitutes U+2212 MINUS SIGN and U+2011 NON-BREAKING HYPHEN with "-", IN THE DRAWING
// ONLY. /V keeps the true character, so the data stays right and only the render is approximate.
// That direction is load-bearing: scanning every JSON under data/ (2026-08-31), exactly two code
// points in the entire catalogue are outside WinAnsi's repertoire, and they are these two — 24
// occurrences of U+2212 and 10 of U+2011. Nine of the 69 SRD 2.0 armors carry U+2212, Scale Mail,
// Banded and their improved forms among them, so reporting it as unmappable rather than
// substituting it would switch this whole feature off for a large share of real characters.
//
// The OTHER substitution — U+2018/U+2019 → ' and U+201C/U+201D → " — is deliberately NOT here, and
// must not be added here. WinAnsi draws all four perfectly well (bytes 0x91-0x94), so there is
// nothing for a drawing layer to fix. They are rewritten in /V ITSELF, at the sink in
// sheetFieldValues(), to deny Chrome's save something to corrupt: the same character in three
// files showed the raw export carrying 4 × U+2019, Firefox's save preserving all four, and
// Chrome's save rewriting every one as a semicolon (`Beastform;s`). Doing it here as well would
// leave the /V uncorrected and change nothing.
//
// featuresText's bullet needs neither rule: sheet-fields.js:104 already maps U+2022 to
// PDF_BULLET, U+00B7 MIDDLE DOT (:101), which is WinAnsi byte 0xB7 at 278/1000 em.
//
// WHAT IS REMOVED, AND WHY REMOVING IS NOT DROPPING
// -------------------------------------------------
// U+00AD SOFT HYPHEN and the non-printing code points (U+0000-U+001F, U+007F, U+0080-U+009F) are
// removed from the drawing. The soft hyphen is the one with a witness in the shipped data:
// data/srd_2_0/classes.json:788, the Warlock's Patron's Pact, reads "supernatural entity<AD>—such
// as", and WinAnsi's 0xAD is a REAL /hyphen glyph, so passing it through prints "entity-—such".
// The controls go because there is nothing to draw (codes 0-31) or because the byte draws the
// wrong thing (0x7F, and the C1 range above) — and they are removed rather than reported
// unmappable because a stray \t, \r or U+0000, all of which transfer.js can carry in since it
// normalises structure and not text, must not switch the whole document back to today's behaviour
// over a character nobody can see.
//
// Nothing is dropped silently. Every removal, substitution and unmappable character comes back in
// `notes`, deduplicated by code point, in first-appearance order, with a count. THE CALLER
// DECIDES what to do: the rule for what reaches the user is "report what changes what the sheet
// SAYS", so notes.unmappable is meaning-changing and forces the document-level fallback, while
// substituted and removed are glyph choices that preserve the meaning and are not reported. That
// is also why the three live in separate arrays: a caller that wrote `if (notes.length)` would
// fall back on every sheet carrying Scale Mail, and the shape should make that unwritable.
//
// LATIN1 STRINGS, ASCII OUTPUT, DETERMINISM
// -----------------------------------------
// `codes` is a "latin1 string" in exactly pdf-form.js's sense (:94-101): one JavaScript character
// per byte, code 0-255, where charCodeAt(i) IS the byte to draw. It is not Unicode text and it is
// not idempotent input — encode once, and never feed a `codes` string back to encodeWinAnsi(),
// which would read byte 0x95 /bullet as the control character U+0095 and remove it.
//
// literalBody() then turns those bytes into PURE ASCII, because everything this project composes
// goes out through asciiBytes() (pdf.js:72-86), which throws above 0x7F rather than emit UTF-8 and
// shift every xref offset after it. Octal escapes are also one byte per character, so a /Length
// counted in characters stays trivially correct.
//
// Same input, byte-identical output: no Date, no Math.random, no iteration over an unordered Map,
// and notes built in encounter order rather than gathered from a Set.
//
// Both literals below are frozen. They are module-level constants a fitter reads thousands of
// times per sheet, and ES modules are strict mode, so an accidental write throws where it happens
// instead of quietly changing the metrics for every later field in the same session.

// Helvetica's advance widths in 1/1000 em, indexed by WinAnsi code -- the whole reason
// this module can lay text out without a font file. Derived, never transcribed:
// tools/sheet/helvetica-table.py in the private content repo joins ghostscript's own
// WinAnsiEncoding vector to the urw-base35 Helvetica AFM and cross-checks every value
// against pdfminer's Adobe metrics and every mapping against cp1252. Codes 0-31 are 0
// because nothing may draw them; codes 32-255 sum to 120823 across 28 distinct values.
//
// CODE 127 IS /bullet, WIDTH 350, not a control character: WinAnsi fills DEL and cp1252's
// five holes (0x81 0x8D 0x8F 0x90 0x9D) with a bullet. 0xA0 is /space and 0xAD is
// /hyphen -- real glyphs, which is why neither is treated as a break opportunity here.
export const HELVETICA_WIDTHS = Object.freeze([
  /*   0 */ 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
  /*  16 */ 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
  /*  32 */ 278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278,
  /*  48 */ 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556,
  /*  64 */ 1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778,
  /*  80 */ 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556,
  /*  96 */ 333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556,
  /* 112 */ 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584, 350,
  /* 128 */ 556, 350, 222, 556, 333, 1000, 556, 556, 333, 1000, 667, 333, 1000, 350, 611, 350,
  /* 144 */ 350, 222, 222, 333, 333, 350, 556, 1000, 333, 1000, 500, 333, 944, 350, 500, 667,
  /* 160 */ 278, 333, 556, 556, 556, 556, 260, 556, 333, 737, 370, 556, 584, 333, 737, 333,
  /* 176 */ 400, 584, 333, 333, 333, 556, 537, 278, 333, 333, 365, 556, 834, 834, 834, 611,
  /* 192 */ 667, 667, 667, 667, 667, 667, 1000, 722, 667, 667, 667, 667, 278, 278, 278, 278,
  /* 208 */ 722, 722, 778, 778, 778, 778, 778, 584, 778, 722, 722, 722, 722, 667, 667, 611,
  /* 224 */ 556, 556, 556, 556, 556, 556, 889, 500, 556, 556, 556, 556, 278, 278, 278, 278,
  /* 240 */ 556, 556, 556, 556, 556, 556, 556, 584, 611, 556, 556, 556, 556, 500, 556, 500,
]);

// The Unicode code points above U+00FF that WinAnsi CAN represent, mapped to the byte
// that draws them -- all 27 of them, and the count is the point: any other code
// point above U+00FF is undrawable and trips the document-level fallback. Same generator,
// same cross-checks. The byte is cp1252's own answer, which is why U+2022 comes back as
// 0x95 and not as one of the six codes the WinAnsi vector also maps to /bullet.
export const HIGH_CODES = Object.freeze({
  0x0152: 0x8c, // Œ  /OE
  0x0153: 0x9c, // œ  /oe
  0x0160: 0x8a, // Š  /Scaron
  0x0161: 0x9a, // š  /scaron
  0x0178: 0x9f, // Ÿ  /Ydieresis
  0x017d: 0x8e, // Ž  /Zcaron
  0x017e: 0x9e, // ž  /zcaron
  0x0192: 0x83, // ƒ  /florin
  0x02c6: 0x88, // ˆ  /circumflex
  0x02dc: 0x98, // ˜  /tilde
  0x2013: 0x96, // –  /endash
  0x2014: 0x97, // —  /emdash
  0x2018: 0x91, // ‘  /quoteleft
  0x2019: 0x92, // ’  /quoteright
  0x201a: 0x82, // ‚  /quotesinglbase
  0x201c: 0x93, // “  /quotedblleft
  0x201d: 0x94, // ”  /quotedblright
  0x201e: 0x84, // „  /quotedblbase
  0x2020: 0x86, // †  /dagger
  0x2021: 0x87, // ‡  /daggerdbl
  0x2022: 0x95, // •  /bullet
  0x2026: 0x85, // …  /ellipsis
  0x2030: 0x89, // ‰  /perthousand
  0x2039: 0x8b, // ‹  /guilsinglleft
  0x203a: 0x9b, // ›  /guilsinglright
  0x20ac: 0x80, // €  /Euro
  0x2122: 0x99, // ™  /trademark
});

// The only two substitutions this file makes, keyed by code point. Both draw a hyphen, both leave
// /V alone, and both are reported as `substituted` rather than `unmappable` — the header says why
// that distinction is what keeps the feature switched on for nine of the 69 SRD 2.0 armors.
const SUBSTITUTIONS = Object.freeze({
  0x2212: "-", // MINUS SIGN — WinAnsi has no minus glyph; Helvetica's hyphen is the nearest thing
  0x2011: "-", // NON-BREAKING HYPHEN — drawn as a hyphen, and the wrapper cannot break it anyway
});

/**
 * Is there nothing in WinAnsi worth drawing for this code point?
 *
 * Four ranges, three of them controls and one of them the soft hyphen. Two of the four are here
 * because the BYTE at the same number is a real glyph and passing the code point through would
 * invent one: 0x7F draws /bullet and 0x80-0x9F draw the punctuation HIGH_CODES maps above.
 *
 * Note what is NOT here. U+00A0 NO-BREAK SPACE is a glyph (/space, 278/1000 em) and encodes to
 * 0xA0; it survives, and the wrapper must not treat it as a break opportunity, which is the whole
 * point of a character that says so in its name.
 *
 * @param {number} codePoint
 * @returns {boolean}
 */
function isNonPrinting(codePoint) {
  return codePoint <= 0x1f                       // C0 controls: \n and \t and U+0000 among them
    || codePoint === 0x7f                        // DEL — but WinAnsi byte 0x7F is /bullet
    || (codePoint >= 0x80 && codePoint <= 0x9f)  // C1 controls — those bytes are punctuation
    || codePoint === 0xad                        // SOFT HYPHEN — byte 0xAD is a real /hyphen
    // The invisible formatting characters. None of them draws anything, so removing one costs the
    // reader nothing — but calling one UNMAPPABLE would cost the whole sheet, because unmappable
    // is what trips the document-level fallback. That matters here rather than in theory: a
    // zero-width space is what a browser leaves behind when text is pasted from a web page, and
    // three of this sheet's fields are unbounded textareas a player pastes a backstory into. One
    // invisible character would have sent every field back to reader layout, with nothing on the
    // page, in the modal, or in the notes to say which character did it or that anything had.
    // Silent, total, and untraceable — the exact failure this whole feature exists to remove.
    || codePoint === 0x200b                      // ZERO WIDTH SPACE
    || codePoint === 0x200c                      // ZERO WIDTH NON-JOINER
    || codePoint === 0x200d                      // ZERO WIDTH JOINER
    || (codePoint >= 0x200e && codePoint <= 0x200f)  // LEFT/RIGHT-TO-LEFT MARK
    || (codePoint >= 0x2028 && codePoint <= 0x202e)  // line/paragraph separators, bidi embedding
    || (codePoint >= 0x2060 && codePoint <= 0x2064)  // WORD JOINER and the invisible operators
    || (codePoint >= 0xfe00 && codePoint <= 0xfe0f)  // variation selectors
    || codePoint === 0xfeff;                     // ZERO WIDTH NO-BREAK SPACE / BOM
}

/**
 * Record one note, folded into any earlier note for the same code point.
 *
 * Linear, because these lists hold one entry per DISTINCT code point and real values produce
 * between zero and a handful. First-appearance order plus a count is what makes the notes
 * deterministic without a Map to iterate.
 *
 * @param {Array<object>} list
 * @param {number} codePoint
 * @param {string} char
 * @param {string} [replacement]  present only on a substitution, and always present there
 */
function note(list, codePoint, char, replacement) {
  for (const entry of list) {
    if (entry.codePoint === codePoint) {
      entry.count += 1;
      return;
    }
  }
  list.push(replacement === undefined
    ? { char, codePoint, count: 1 }
    : { char, codePoint, count: 1, replacement });
}

/**
 * @typedef {{char: string, codePoint: number, count: number, replacement?: string}} Note
 *   One DISTINCT code point encodeWinAnsi() did something other than draw, and how many times it
 *   met it. `replacement` is present on every substitution note and on no other kind.
 */

/**
 * Unicode text → the bytes that draw it in WinAnsi-encoded Helvetica.
 *
 * Walks CODE POINTS, not code units (`for…of` over a string does exactly that), so an astral
 * character — an emoji, a rare CJK ideograph — is one unmappable thing to report rather than two
 * surrogate halves that mean nothing to whoever reads the message. A lone surrogate, which
 * `for…of` yields as its own code point, comes back unmappable for the same reason.
 *
 * @param {string} text  Unicode text, exactly as it sits in the field's /V
 * @returns {{codes: string, notes: {unmappable: Note[], substituted: Note[], removed: Note[]}}}
 *   `codes` is a latin1 string: one character per byte, charCodeAt(i) IS the byte to draw, ready
 *   for measure() and literalBody().
 *
 *   A Note is `{char, codePoint, count}`, plus `replacement` on a substitution. Notes are
 *   deduplicated by code point and ordered by first appearance, so the same text always yields
 *   the same notes in the same order.
 *
 *   notes.unmappable is the one a caller must act on, and it acts on it for the WHOLE DOCUMENT:
 *   with /NeedAppearances false, a field carrying /V and no /AP draws NOTHING in Firefox — its
 *   _getAppearance returns null and getOperatorList hands back an empty operator list — so there
 *   is no per-field fallback to reach for.
 */
export function encodeWinAnsi(text) {
  const source = String(text ?? "");
  const unmappable = [];
  const substituted = [];
  const removed = [];
  let codes = "";
  for (const char of source) {
    const codePoint = char.codePointAt(0);
    const replacement = SUBSTITUTIONS[codePoint];
    if (replacement !== undefined) {
      note(substituted, codePoint, char, replacement);
      codes += replacement; // ASCII by construction, so no second pass over it is needed
    } else if (isNonPrinting(codePoint)) {
      note(removed, codePoint, char);
    } else if (codePoint <= 0xff) {
      // Everything left below 0x0100 is WinAnsi's own Latin-1 half: the byte is the code point.
      codes += String.fromCharCode(codePoint);
    } else if (HIGH_CODES[codePoint] !== undefined) {
      codes += String.fromCharCode(HIGH_CODES[codePoint]);
    } else {
      note(unmappable, codePoint, char);
    }
  }
  return { codes, notes: { unmappable, substituted, removed } };
}

/**
 * How wide an encoded string draws, in points, at a given font size.
 *
 * sum(widths) / 1000 × size, and nothing else: no kerning (the header says why at length), no
 * word spacing, no horizontal scaling, no character spacing, because the appearance streams this
 * feeds set none of those. What it returns is therefore what the page draws, exactly.
 *
 * Multiplying before dividing is deliberate. The width sum is an integer and a fitted size is an
 * integer, so their product is exact in a double and there is exactly one rounding; dividing
 * first would round twice. It matters only at a boundary, but a fit predicate is all boundary.
 *
 * @param {string} codes  a latin1 string from encodeWinAnsi()
 * @param {number} size   font size in points
 * @returns {number} width in points
 */
export function measure(codes, size) {
  if (typeof size !== "number" || !Number.isFinite(size)) {
    throw new RangeError(`winansi.js: ${JSON.stringify(size)} is not a finite font size`);
  }
  const s = String(codes);
  let thousandths = 0;
  for (let i = 0; i < s.length; i++) {
    const code = s.charCodeAt(i);
    if (code > 0xff) {
      throw new RangeError(
        `winansi.js: measure() was given the character ${JSON.stringify(s[i])} ` +
        `(U+${code.toString(16).toUpperCase().padStart(4, "0")}) at index ${i}, which is not a byte — ` +
        "this looks like Unicode text rather than encodeWinAnsi()'s codes, and measuring it would " +
        "silently return the width of a glyph nobody is going to draw",
      );
    }
    thousandths += HELVETICA_WIDTHS[code];
  }
  return (thousandths * size) / 1000;
}

/**
 * Encoded bytes → the body of a PDF literal string: what goes between the ( and the ).
 *
 * Pure ASCII out, always. Everything this project composes is written with asciiBytes()
 * (pdf.js:72-86), which throws above 0x7F rather than emit UTF-8 and shift every xref offset after
 * it, so a drawable byte reaches the file as an octal escape or not at all. Escapes are one
 * character per byte too, which keeps a /Length counted in characters correct.
 *
 * FOUR RULES, EVERY ONE OF THEM UNCONDITIONAL
 *   \ ( )              backslash-escaped: the string syntax itself. Escaping both parens rather
 *                      than tracking balance means no input can end the string early.
 *   < 0x20 or > 0x7E   three-digit octal. Covers every high byte (which is what makes the output
 *                      ASCII) and every control. encodeWinAnsi() cannot currently produce a
 *                      control, but this is the last thing standing between a byte and the file,
 *                      so it stays total.
 *   every `j`          as \152.
 *   every `/`          as \057.
 *
 * The last two are not tidiness, they are what stops a character sheet from producing a file this
 * project's own reader refuses. readForm() rejects, loudly, any file containing /ObjStm, /Encrypt
 * or /Type/XRef (pdf-form.js:546-561); its object scanner finds objects with a line-anchored
 * `\d+ \d+ obj` (:467) and their ends with indexOf("endobj") (:477). Every one of those tokens is
 * something a user can type: `class-features`, `appearance` and `connections` are unbounded
 * textareas, and transfer.js normalises structure rather than text, so an imported character can
 * carry any bytes at all. Escaping every `j` defuses "endobj", a line-anchored "N 0 obj" and
 * "/ObjStm"; escaping every `/` defuses "/Encrypt" and "/Type/XRef", and "/ObjStm" a second time.
 * Because both rules are unconditional they cannot be defeated by a token split across two lines
 * or by which check happens to run first. The error a user would otherwise get names the TEMPLATE
 * as unreadable, which is both wrong and unfixable from where they are standing.
 *
 * "trailer" and "startxref" need no defusing: readTrailer() takes the LAST of each
 * (pdf-form.js:495 and :510), and an appearance stream is always earlier in the file than the
 * incremental update's own trailer.
 *
 * @param {string} codes  a latin1 string from encodeWinAnsi()
 * @returns {string} pure ASCII, to be wrapped in ( ) by the caller
 */
export function literalBody(codes) {
  const s = String(codes);
  let out = "";
  for (let i = 0; i < s.length; i++) {
    const code = s.charCodeAt(i);
    if (code > 0xff) {
      throw new RangeError(
        `winansi.js: literalBody() was given the character ${JSON.stringify(s[i])} ` +
        `(U+${code.toString(16).toUpperCase().padStart(4, "0")}) at index ${i}, which is not a byte — ` +
        "pass it through encodeWinAnsi() first, so an undrawable character is reported rather than " +
        "written into the file as whatever its low half happens to be",
      );
    }
    const char = s[i];
    if (char === "\\" || char === "(" || char === ")") {
      out += "\\" + char;
    } else if (code < 0x20 || code > 0x7e || char === "j" || char === "/") {
      out += "\\" + code.toString(8).padStart(3, "0");
    } else {
      out += char;
    }
  }
  return out;
}
