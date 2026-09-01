// Filling in an AcroForm template, by appending to it rather than rewriting it.
//
// WHY THIS EXISTS, AND HOW IT DIFFERS FROM shared/pdf.js
// -----------------------------------------------------
// pdf.js writes a PDF from nothing — a deck of card images and some stroked lines, a subset small
// enough to emit by hand. This file does the opposite job on the opposite kind of file: the
// official character sheet is a two-page form somebody drew in Master PDF Editor
// (data/sheet/sheet-template.pdf, a symlink into the private content repo), full of art, fonts
// and 182 form widgets we could not begin to author. We do not want to author it. We want to put
// 56 strings and 46 ticks into it — 56 of its 71 text fields, and 46 of its 111 checkboxes
// (sheet-fields.js's header says which boxes it leaves blank, and the two different reasons it
// leaves them) — and hand back the same file.
//
// Every count in this header was measured in that template on 2026-08-31, after the page-2
// normalisation that step 0 of the appearance work did: 469,823 bytes, 182 live widgets, 71 /Tx
// and 111 /Btn. An earlier reading of the same file, before that pass, was 453,448 bytes; the
// field counts did not move.
//
// One thing does get DRAWN rather than filled, and it is not a field at all: an `overlays` option
// appends a content stream to a page, under its annotations. shared/sheet-marks.js is the only
// caller, and it uses it to trace the HP and Stress boxes a character actually has and to fill in
// their Proficiency pips — geometry the sheet's own artwork already half-draws, and which no
// widget can carry because the checkboxes over those boxes are deliberately bigger than them.
// Being page content and not an annotation, it is untouched by /NeedAppearances, by the
// whole-document fallback below, and by a Chrome save.
//
// So nothing here recreates the template. The output is the original bytes VERBATIM, followed by
// an incremental update: fresh copies of only the objects whose value changed, one new appearance
// stream per value we drew, one more per overlaid page, a cross-reference section covering only
// those, and a trailer whose /Prev points back at the original one. Every byte the template already had — its fonts, its art,
// its own appearance streams, the offsets in its xref — stays exactly where it was, which is why a
// template re-save costs this module nothing. It also means the only offsets we compute are
// offsets into bytes we appended ourselves.
//
// The two modules share pdf.js's rules, and import them rather than restating them:
// asciiBytes() (pdf.js:16-27 — never TextEncoder, because one UTF-8 double-byte shifts every
// later xref offset and the file opens blank rather than failing) and formatNumber().
//
// It is in shared/ because it is bytes in, bytes out: no DOM, no fetch, nothing to mock. Fetching
// the template and handing the result to the browser is sheet-pdf.js's job, which is why that file
// sits at the repo root with the other page code.
//
// Since the appearance work it imports one more thing: shared/pdf-text.js's textAppearance(), the
// only call in this file that knows what a letter is. The direction of that import is the design —
// this file hands out a box and gets back a finished content stream, and pdf-text.js has never
// seen a PDF object.
//
// THE EXPORTS, AND WHY THE READERS ARE AMONG THEM
// -----------------------------------------------
// Three entry points, all taking the template bytes first: readForm(bytes),
// fillFormWithReport(bytes, values, options) — the fill, plus the record of what it could not do —
// and fillForm(bytes, values, options), which is that call with the record thrown away, for the
// caller and the 21 test call sites that only ever wanted the bytes.
//
// Under them, five readers of a widget's dictionary: rectOf(), daParts(), multilineOf(),
// quadOf(), and fieldBox(), which composes those four into the box shared/pdf-text.js lays text
// into. They are exported for a reason no other private helper here has: the geometry they
// compute has an INDEPENDENT ANSWER inside the template. Master PDF Editor wrote a correct /BBox
// into all 71 existing /AP /N objects, and on this template every one of them matches its
// widget's /Rect to within 0.001pt — so a test can diff our arithmetic against the file's own,
// field by field, but only if it can call the reader. Nothing else here is public because
// nothing else has a witness.
//
// The character and layout layers are deliberately NOT here: shared/winansi.js owns bytes and
// widths, shared/pdf-text.js owns wrapping, fitting and operators, and both are pure and
// dependency-free so the suite can assert on a content stream as one exact literal. This file
// owns objects, streams and xref offsets, and it is the only one of the three that has ever seen
// a byte of the template.
//
// THE SUBSET THIS HANDLES — AND WHAT IT REFUSES
// ---------------------------------------------
// Handled: a classic `xref` table with a classic `trailer` dictionary, generation 0 throughout, a
// FLAT field tree (every /Fields entry is itself the widget annotation — no /Parent, no /Kids, so
// no radio groups and no partial-name assembly), text fields and checkboxes. The /Fields array
// itself may be written inline or handed over as an indirect reference; one level of that is
// resolved rather than refused, for the reason readForm() gives where it does it.
//
// Refused, loudly, at readForm():
//   - /ObjStm or /Type/XRef anywhere in the file. A template saved with compressed object streams
//     hides its field dictionaries inside a Flate stream where this scanner cannot see them, and
//     appending a classic xref section to a file indexed by an xref STREAM produces something no
//     reader agrees about. The check is deliberately over-broad — it matches those bytes wherever
//     they appear, including inside a compressed stream — because refusing a file we might mangle
//     is cheaper than shipping one that opens blank.
//   - /Encrypt. Strings in an encrypted file are ciphertext; a plaintext /V would be rendered as
//     mojibake, silently.
//   - a missing trailer, /Root, or /AcroForm.
//   - two live fields with the same /T. See the next paragraph, which is the whole reason this is
//     an error and not "last one wins".
//
// Refused later, and ONLY when appearances are being generated — with `appearances: false` none of
// this is parsed, so every refusal below has the same answer: fill without them.
//   - a widget whose /MK /R says it is rotated (fieldBox). We would draw the text upright inside a
//     box the reader turns, which is a wrong sheet rather than an ugly one. The check sees only an
//     INLINE /MK, which is 57 of this template's 182 widgets; fieldBox's own comment says why the
//     other 125 are not resolved and what was measured in them instead.
//   - a /Rect that is not four numbers, or an /Ff that is not an integer (rectOf, multilineOf).
//     Both are geometry we would otherwise have to guess, and both guesses lose text.
//   - a box with no room to draw in, which reaches us from shared/pdf-text.js and is re-thrown
//     with the field's name on it, because that module is handed a box and never learns whose.
//
// THE TRAP THAT COST THE MOST: STALE WIDGETS
// -------------------------------------------
// Editing a form leaves orphans behind, and this template used to carry four: object 33 was a
// `name` text field from an earlier session, superseded by object 679, with objects 562, 673 and
// 676 similar litter. They were in neither the page's /Annots nor the AcroForm's /Fields, so no
// viewer would ever have shown or filled them — but a scan for "every object with a /T" finds
// them, and then finds `name` twice.
//
// Today's file has none: 182 widget objects, 182 live fields, and objects 33, 562, 673 and 676
// are not in it at all (a re-save dropped them; 679 is still `name`). So the filter below is
// currently load-bearing for nobody, and the thing that keeps it honest is the hand-built fixture
// at tests/tests.js:5200, which carries the second `name` on purpose. Do not delete the filter
// because the template stopped needing it — the template stopped needing it by being re-saved,
// and the next re-save is a save away.
//
// So the live field list comes from the AcroForm's /Fields array (verified equal, object for
// object, to the page's /Annots), and the scan only supplies the bytes. Without that filter a
// perfectly good template makes readForm throw "duplicate field name", and "fix your template"
// would be the wrong advice.
//
// TWO WAYS TO FILL A FORM, AND WHY THE SECOND ONE EXISTS
// ------------------------------------------------------
// A filled field has two halves: /V, the value, and /AP, a little stream drawing that value in the
// field's box. There are only two coherent things to do about the second half, and this module
// does both — `appearances` picks which:
//
//   false (the default)  write /V, DELETE /AP, set /NeedAppearances true. A formal request that
//                        the READER lay the text out. Also what runs when anything below cannot
//                        be done, so this path is never dead code.
//   true                 write /V, REPLACE /AP with a Form XObject we composed, and set
//                        /NeedAppearances false. The reader draws what we drew.
//
// The second exists because four readers answered the first request four ways, and one of them
// answered it by dropping text. On paper, Firefox lost 341 of the 1430 characters in
// `class-features` — the whole of the Druid's Strange Patterns — with nothing on the page to say
// so: pdf.worker.mjs:54240 sizes the block so that `chunks × fontSize ≤ height` and then renders
// it at `height / numberOfLines ≈ 1.35 × fontSize`, so the laid-out block overflows the field and
// the /AP's own /BBox clips the tail. Silently. shared/pdf-text.js exists to not make that
// mistake, and its header carries the arithmetic and the placement constants.
//
// WHAT THE FLAG COSTS, MEASURED. When /AP is deleted, /NeedAppearances true is not tidiness, it is
// the whole thing working. The template's text fields ship with an /AP that draws an EMPTY field —
// 12 FlateDecode bytes that inflate to exactly `q\nQ\n`, byte-identical in all 71 of them
// (measured 2026-09-01; the token `/Tx BMC` an earlier version of this comment named occurs ZERO
// times in the file) — and a viewer that trusts a present /AP over /NeedAppearances draws that
// emptiness. The file is correct and the page is blank. Rendering the same character three ways
// and counting pixels that differ from the untouched template, at -dPrinted=true -r100:
//
//     keep /AP + /NeedAppearances      ghostscript    39 px   poppler  183546 px
//     drop /AP + /NeedAppearances      ghostscript  4119 px   poppler  183546 px
//     generate our own /AP             ghostscript  4089 px   poppler  ~same
//
// Ghostscript is the one that exposes it, and it is not a toy target: it is the renderer this
// project's template-fidelity check drives (tools/sheet/fidelity.py, which lives in the private
// content repo and not in this tree — it was deleted along the way, when the LibreOffice re-export
// it used as its control was deleted, and has come back since with a synthesised one). Poppler
// regenerates either way, which is exactly why testing on one renderer would have shipped a sheet
// that looks right on screen and prints blank.
//
// The third row is the argument for writing the /AP rather than deleting one: it is the only row
// that does not depend on a reader agreeing to do the work, and it lands within 30 pixels of the
// row that does. Everything the second row leaves to the reader, each reader answers differently —
// ghostscript's substituted Helvetica is noticeably wide, Chrome shrinks `class-features` to 6pt
// in 19 lines using 127 of the box's 195.7 points, and Firefox drops 341 of its 1430 characters.
//
// AND WHAT A CHROME SAVE COSTS, WHICH IS THE OTHER HALF OF THE ARGUMENT. Ctrl-S in Chrome does not
// hand back the file it was given. It regenerates all 71 appearances at its own sizes; it rewrites
// every U+2019 in /V as a SEMICOLON (the same character in three files: the raw export has 4,
// Firefox's save keeps all 4, Chrome's save has 0 and four semicolons — `Beastform;s`, which is on
// the printed paper); and it draws em dashes through a CJK fallback font, `/_86 6 Tf (\xa1\xaa) Tj`,
// 30 of them across the prose fields. Two of those three have an answer upstream of the save: the
// em dash is ours the moment we draw it, and the curly quotes are to be rewritten in /V itself at
// sheetFieldValues() — a separate step of the same plan, and deliberately not this file's, since
// /V is the value and this module only ever copies it. Nothing here can stop the regeneration
// itself, which is why "Clean format" is worth a user-facing checkbox rather than a silent default.
//
// "CHROME AND FIREFOX AGREE" IS A CLAIM ABOUT PRINT, AND ONLY PRINT. Firefox's viewer never draws
// our /AP at all: pdf.worker.mjs:53928 hands a text field to an HTML input and paints that
// instead. Checking this feature by looking at Firefox's screen is checking something else.
//
// Checkboxes are the other half of the same story, and NO code path here writes an /AP for one.
// /V alone leaves a box that reads as ticked to a script and unticked to a human: /AS is the key
// that actually selects which of the widget's prebuilt appearance states is drawn. Both, always.
// Their appearance does change with the flag even though not one line here touches them — with
// /NeedAppearances true, MuPDF and PDFium ignore a ticked box's /AP and draw a check of their own;
// with it false, both draw the tick the template's author drew. Every ticked box on a filled sheet
// therefore changes appearance in Chrome's engine, and no test in this project can see it: the way
// to check is one export from before this change against one from after, side by side on screen.
//
// THE UNDRAWABLE CHARACTER, AND WHY THE FALLBACK IS THE WHOLE DOCUMENT'S
// ----------------------------------------------------------------------
// If any value carries a character WinAnsi cannot draw and shared/winansi.js has no substitution
// for — a CJK ideograph, Cyrillic, an emoji — this module writes NO appearance streams at all and
// emits exactly the file the `false` path would have, reporting what it found and where.
//
// Not per field, and the difference is the whole point. With /NeedAppearances false, a field
// carrying /V and no /AP is still laid out by PDFium, MuPDF and ghostscript — but Firefox draws
// NOTHING for it: `_getAppearance` returns null (pdf.worker.mjs:54101), `this.appearance` is never
// set, and `getOperatorList` (:53936) hands back an empty operator list. So a per-field fallback
// would be one field silently blank in one reader, which is this feature's own defect wearing our
// name. Read out of Firefox 154's shipped source, not inferred.
//
// THE FIRST STREAM THIS MODULE HAS EVER WRITTEN
// ----------------------------------------------
// Everything above the emit loop used to be dictionaries, so `updates` held strings. It now holds
// `string | {dict, stream}` — a TYPED UNION rather than a flag or a second map, so the loop has to
// look at what it is holding before it can write it, and so /Length is counted off the bytes that
// loop actually pushed. /Length counts what lies between the newline that ends `stream` and the
// one that begins `endstream`, neither included; pdf.js:260-271 is the precedent and says what
// getting it wrong costs.
//
// One FRESH object per drawn field, numbered base+1 … base+N above the added font at base, and
// ordered by WIDGET OBJECT NUMBER — never by the caller's keys, or the same character exported
// from two differently-ordered value maps would produce two different files. Nothing here ever
// writes into an /AP object the template already had: in the test fixture object 10 is the
// appearance for both text widgets AND for both states of both checkboxes, so "update the /AP the
// widget points at" would draw one field's text into five places, two of them ticks. The real
// template is one step short of that trap — its 71 text /APs are separate objects — but every one
// of them is FlateDecode-compressed, so "reusing" one still means composing a whole new object
// from scratch and appending it. Reuse would save an object NUMBER and nothing else, in exchange
// for the one failure mode above.
//
// BYTES, STRINGS, AND WHICH IS WHICH
// -----------------------------------
// Inside this file a PDF is a "latin1 string": one JavaScript character per byte, code 0-255,
// which is the same representation tests.js uses to assert on pdf.js's output ("byte n of the file
// is character n of this string"). That is what lets a field's dictionary be handed back to a test
// as something it can .includes() on. Composed text still goes out through asciiBytes(); only
// bytes we QUOTED BACK from the template go through verbatimBytes(), which accepts 0x80-0xFF
// precisely because it is copying, not encoding. An appearance stream is composed, not quoted —
// shared/winansi.js octal-escapes every byte above 0x7E on the way in — so it goes out through
// asciiBytes() like any other text this file writes, and a leaked high byte is a thrown error
// rather than a silently shifted xref.
//
// DETERMINISM
// -----------
// Same template plus same values in, byte-identical file out: updated objects are written in
// numeric order rather than in the caller's key order, appearance objects are ALLOCATED in widget
// order rather than in the caller's key order (which is the same rule one layer earlier — the
// number is in the file, so it has to be decided by something the file already fixes), no /Info
// and no /ID are invented (the original trailer's are copied through as references), and no
// timestamp is written anywhere.

import { asciiBytes, formatNumber } from "./pdf.js";
import { textAppearance } from "./pdf-text.js";

// PDF's own whitespace set (including NUL) and delimiters. Getting these two right is what stops
// "/V" from matching "/Version" and what makes a dictionary walk terminate where the spec says.
const WHITESPACE = "\0\t\n\f\r ";
const DELIMITERS = "()<>[]{}/%";
const isWhitespace = (c) => c !== undefined && WHITESPACE.includes(c);
const isDelimiter = (c) => c !== undefined && DELIMITERS.includes(c);

// The on-state a checkbox uses when this template doesn't say. Every /Btn here carries
// /AP/N<</Yes …/Off …>>, so the fallback is only reached by a hand-written fixture.
const DEFAULT_ON_STATE = "Yes";

/**
 * An error the caller can distinguish: the file is a PDF, but not one this module can edit.
 * Not exported — catch by name if you need to, or just show the message, which says what to do.
 */
class UnsupportedPdfError extends Error {
  constructor(message) {
    super(message);
    this.name = "UnsupportedPdfError";
  }
}

// Bytes → latin1 string, in chunks because String.fromCharCode(...bytes) on a 470KB template blows
// the argument limit and throws RangeError somewhere far from the cause.
function latin1(bytes) {
  let out = "";
  for (let i = 0; i < bytes.length; i += 0x2000) {
    out += String.fromCharCode(...bytes.subarray(i, Math.min(i + 0x2000, bytes.length)));
  }
  return out;
}

/**
 * Latin1 string → bytes, one byte per character.
 *
 * This is NOT a second asciiBytes(), and it is not a way around it. asciiBytes() refuses bytes
 * above 0x7F because it is ENCODING text and cannot know what was meant; this function is COPYING
 * bytes that came out of the template a moment ago, where 0x80-0xFF is just what was there. Every
 * string this file composes still goes through asciiBytes(). Above 0xFF it throws, because that
 * can only mean a real string leaked into a path meant for quoted bytes.
 */
function verbatimBytes(str) {
  const out = new Uint8Array(str.length);
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);
    if (code > 0xff) {
      throw new RangeError(
        `pdf-form.js: character ${JSON.stringify(str[i])} (U+${code.toString(16).toUpperCase().padStart(4, "0")}) ` +
        `at index ${i} is not a byte — this path copies template bytes, it does not encode text`,
      );
    }
    out[i] = code;
  }
  return out;
}

function skipWhitespace(s, i) {
  let at = i;
  while (at < s.length && isWhitespace(s[at])) at++;
  return at;
}

// The end of a /Name token, exclusive of the delimiter that stopped it.
function endOfName(s, i) {
  let at = i + 1; // the '/' itself
  while (at < s.length && !isWhitespace(s[at]) && !isDelimiter(s[at])) at++;
  return at;
}

// The end of a (literal string), which may nest unescaped parentheses and escape anything with a
// backslash. Scanning for the next ")" is the version of this that eventually meets a field value
// containing "(1/2)" and truncates a dictionary mid-write.
function endOfLiteralString(s, i) {
  let depth = 0;
  let at = i;
  while (at < s.length) {
    const c = s[at];
    if (c === "\\") { at += 2; continue; }
    if (c === "(") depth++;
    else if (c === ")" && --depth === 0) return at + 1;
    at++;
  }
  throw new SyntaxError(`pdf-form.js: unterminated string starting at ${i}`);
}

// The end of a << dictionary >> or an [ array ], counting nesting and stepping over strings so a
// ")" or a ">" inside a value can't close it early.
function endOfBracketed(s, i, open, close) {
  let depth = 0;
  let at = i;
  while (at < s.length) {
    if (s.startsWith(open, at)) { depth++; at += open.length; continue; }
    if (s.startsWith(close, at)) { depth--; at += close.length; if (!depth) return at; continue; }
    if (s[at] === "(") { at = endOfLiteralString(s, at); continue; }
    // A <hex string> ends in the same ">" a dictionary does, and when one is a dictionary's last
    // entry the two sit flush: /MK<</CA<0034>>> is "<0034>" followed by ">>", so a walk that only
    // knows about literal strings counts the FIRST ">>" — the hex terminator plus half the close —
    // and stops a byte early. What the caller then sees is not "short walk" but dictEntries
    // reporting a perfectly good widget as `expected a /Name key … found ">/V(Old)/P 4 0 R"`.
    // Latent in this template, which is why it survived: Master PDF Editor writes /MK/CA as the
    // literal (4), and no hex string in the file sits flush against a ">" at all.
    if (s[at] === "<") {
      // "<<" here can only be a dictionary opening inside an ARRAY — when `open` is "<<" a nested
      // one was already counted above. Step past the opener and let the loop walk its ">>" the way
      // it walks any other bytes; it is not our close either way.
      if (s[at + 1] === "<") { at += 2; continue; }
      const hexEnd = s.indexOf(">", at);
      if (hexEnd < 0) throw new SyntaxError(`pdf-form.js: unterminated hex string starting at ${at}`);
      at = hexEnd + 1;
      continue;
    }
    at++;
  }
  throw new SyntaxError(`pdf-form.js: unterminated ${open}…${close} starting at ${i}`);
}

// An indirect reference is three tokens ("4 0 R"), so a value that starts as a number has to look
// ahead or the walk below reads " 0 R" as the next key and gives up on a dictionary that is
// perfectly fine. Not a hypothetical, though not every widget either: 41 of this template's 182
// live fields carry an indirect /P — 34 of them `/P 4 0 R` for page 1 and 7 pointing at page 2 —
// and all 41 are text fields, none of the 111 checkboxes among them (measured 2026-09-01). /BS and
// /MK add another 125 apiece, on widgets of both kinds.
const REFERENCE_TAIL = /^[\0\t\n\f\r ]+\d+[\0\t\n\f\r ]+R(?![A-Za-z0-9])/;

// The end of any one value token, starting at a non-whitespace character.
function endOfValue(s, i) {
  const c = s[i];
  if (c === "/") return endOfName(s, i);
  if (c === "(") return endOfLiteralString(s, i);
  if (c === "<" && s[i + 1] === "<") return endOfBracketed(s, i, "<<", ">>");
  if (c === "<") {
    const close = s.indexOf(">", i);
    if (close < 0) throw new SyntaxError(`pdf-form.js: unterminated hex string starting at ${i}`);
    return close + 1;
  }
  if (c === "[") return endOfBracketed(s, i, "[", "]");
  let at = i;
  while (at < s.length && !isWhitespace(s[at]) && !isDelimiter(s[at])) at++;
  if (at === i) throw new SyntaxError(`pdf-form.js: no value at ${i} (found ${JSON.stringify(s.slice(i, i + 12))})`);
  const tail = REFERENCE_TAIL.exec(s.slice(at));
  return tail ? at + tail[0].length : at;
}

/**
 * A dictionary's TOP-LEVEL entries, as {key, start, valueStart, end} in source order.
 *
 * Top-level is the point. A widget's /AP<</N<</Yes …>>>> and /MK<</R 0/CA(4)>> are dictionaries
 * inside the dictionary, and a search-and-replace for "/V" that doesn't know the difference will
 * one day rewrite a nested one. Walking costs a few lines and removes the whole class.
 */
function dictEntries(dict) {
  if (!dict.startsWith("<<")) {
    throw new SyntaxError(`pdf-form.js: expected a dictionary, found ${JSON.stringify(dict.slice(0, 24))}`);
  }
  const entries = [];
  let at = 2;
  for (;;) {
    at = skipWhitespace(dict, at);
    if (dict.startsWith(">>", at)) return entries;
    if (at >= dict.length) throw new SyntaxError("pdf-form.js: unterminated dictionary");
    if (dict[at] !== "/") {
      throw new SyntaxError(
        `pdf-form.js: expected a /Name key at ${at}, found ${JSON.stringify(dict.slice(at, at + 16))}`,
      );
    }
    const start = at;
    const keyEnd = endOfName(dict, at);
    const valueStart = skipWhitespace(dict, keyEnd);
    const end = endOfValue(dict, valueStart);
    entries.push({ key: dict.slice(start + 1, keyEnd), start, valueStart, end });
    at = end;
  }
}

function entryValue(dict, key) {
  const entry = dictEntries(dict).find((e) => e.key === key);
  return entry ? dict.slice(entry.valueStart, entry.end) : null;
}

/**
 * A PDF string token → its characters. Handles both spellings a /T can use.
 *
 * The UTF-16 branch matters even though this template's names are plain slugs: a name written as
 * <FEFF…> and decoded byte-wise would key the map on mojibake, and the caller's perfectly correct
 * "name" would then throw as unknown.
 */
function decodeString(raw) {
  if (raw.startsWith("<")) {
    const hex = raw.slice(1, -1).replace(/[^0-9A-Fa-f]/g, "");
    const digits = hex.length % 2 ? `${hex}0` : hex;
    let bytes = "";
    for (let i = 0; i < digits.length; i += 2) bytes += String.fromCharCode(parseInt(digits.slice(i, i + 2), 16));
    if (bytes.charCodeAt(0) === 0xfe && bytes.charCodeAt(1) === 0xff) {
      let out = "";
      for (let i = 2; i + 1 < bytes.length; i += 2) {
        out += String.fromCharCode((bytes.charCodeAt(i) << 8) | bytes.charCodeAt(i + 1));
      }
      return out;
    }
    return bytes;
  }
  const body = raw.slice(1, -1);
  const escapes = { n: "\n", r: "\r", t: "\t", b: "\b", f: "\f" };
  let out = "";
  for (let i = 0; i < body.length; i++) {
    if (body[i] !== "\\") { out += body[i]; continue; }
    const next = body[++i];
    if (next === undefined) break;
    if (next >= "0" && next <= "7") {
      let octal = next;
      while (octal.length < 3 && body[i + 1] >= "0" && body[i + 1] <= "7") octal += body[++i];
      out += String.fromCharCode(parseInt(octal, 8));
    } else if (next === "\n") {
      // A backslash at end of line is a line continuation: it contributes nothing.
    } else if (next === "\r") {
      if (body[i + 1] === "\n") i++;
    } else {
      out += escapes[next] ?? next; // covers \( \) \\ and, per the spec, any other char as itself
    }
  }
  return out;
}

// A string as PDF spells one for us: UTF-16BE, hex, with the byte-order mark that tells a reader
// it is UTF-16 at all. It is the form this template already uses, and it is the reason a character
// called "Fáelán" survives the round trip — a literal (…) string would be PDFDocEncoding, which
// has no code point for half the accents a player will type.
function utf16HexString(value) {
  let hex = "";
  for (let i = 0; i < value.length; i++) {
    hex += value.charCodeAt(i).toString(16).toUpperCase().padStart(4, "0");
  }
  return `<FEFF${hex}>`;
}

/**
 * A copy of `dict` with `dropKeys` removed and `additions` spliced in before the closing >>.
 *
 * Removing first is not tidiness: a dictionary with two /V entries is undefined behaviour, and the
 * one a reader picks is the one you didn't write.
 */
// A FONT OF OUR OWN, ADDED RATHER THAN SUBSTITUTED
// -------------------------------------------------
// The viewer draws /V using the font a field's /DA names, looked up in the AcroForm's /DR. If that
// font declares an encoding under which our characters aren't where the viewer expects them, the
// value is right and the glyph is wrong — and this is not hypothetical. The sheet template's
// /Helvetica carries a /Differences array that reassigns the WinAnsi block 145-160:
//
//     149 -> /Lslash   (WinAnsi: bullet)      151 -> /Scaron  (WinAnsi: emdash)
//     146 -> /trademark (WinAnsi: quoteright) 150 -> /OE      (WinAnsi: endash)
//
// BOTH PDFium (Chrome) AND MuPDF HONOUR THAT ARRAY, including inside a content stream we write —
// measured, and worth stating twice because an earlier version of this comment guessed the other
// way. Draw a bullet through their /Helvetica and a Ł comes out. Poppler resolves by Unicode and
// draws the bullet, which is exactly the kind of split that ships. Measured across the 15 classes
// in data/: 21 bullets, 7 curly apostrophes, 4 em dashes, 2 en dashes — plus armor-name, which is
// the em dash itself for a character with nothing equipped.
//
// So we ADD a font instead of correcting theirs. Nothing the editor authored is modified, which
// means this does not depend on which editor authored it: whatever any producer writes into
// /Differences becomes irrelevant, because the fields we fill no longer name that font. Correcting
// their font in place would have been ten lines instead of these forty, and would have been a
// patch shaped like one editor's bug.
//
// The same font, by the same name, is what every appearance stream this module writes names in its
// OWN /Resources (appearanceDict below). That is not belt and braces: a form XObject with no /Font
// resource of its own inherits the page's, and the page's is theirs.
const OUR_FONT_DICT = "<</Type/Font/Subtype/Type1/BaseFont/Helvetica/Encoding/WinAnsiEncoding>>";

// Inserts entries before a dictionary's closing >>.
function withEntries(dict, additions) {
  const body = dict.trim();
  if (!body.startsWith("<<") || !body.endsWith(">>")) {
    throw new SyntaxError(`pdf-form.js: expected a dictionary, found ${JSON.stringify(body.slice(0, 24))}`);
  }
  return `${body.slice(0, -2)}${additions}>>`;
}

// A resource name no font in the template already uses. Suffixed rather than failed on collision:
// a template of ours is not the only thing this could ever be pointed at.
function freeFontName(acroDict) {
  const dr = entryValue(acroDict.trim(), "DR");
  const fonts = dr ? entryValue(dr.trim(), "Font") : null;
  const taken = new Set(fonts ? [...fonts.matchAll(/\/([^\s/<>[\]()]+)/g)].map((m) => m[1]) : []);
  let name = "DhHelv";
  for (let i = 2; taken.has(name); i++) name = `DhHelv${i}`;
  return name;
}

// The AcroForm with our font reachable from /DR/Font, building whichever level is missing, and
// with /NeedAppearances set either way round.
//
// The font goes in /DR whether we drew the values or not, and it is not redundant when we did: our
// /AP carries its own /Resources, but the moment anyone TYPES in a field the reader regenerates
// that field's appearance from /DA and /DR, and /DR is where it looks the name up. Leaving it out
// would make our own /DA name a font the file does not offer, which is a blank field the first
// time someone corrects a typo.
function acroWithFont(acroDict, font, needAppearances) {
  const drop = ["NeedAppearances"];
  let additions = `/NeedAppearances ${needAppearances ? "true" : "false"}`;
  if (font) {
    const dr = entryValue(acroDict.trim(), "DR");
    const fontsRef = `/${font.name} ${font.obj} 0 R`;
    let newDr;
    if (!dr) {
      newDr = `<</Font<<${fontsRef}>>>>`;
    } else {
      const fonts = entryValue(dr.trim(), "Font");
      newDr = fonts
        ? withEntries(dr.trim().replace(fonts, withEntries(fonts, fontsRef)), "")
        : withEntries(dr.trim(), `/Font<<${fontsRef}>>`);
    }
    drop.push("DR");
    additions += `/DR${newDr}`;
  }
  return rewriteDict(acroDict, drop, additions);
}

// The field's own /DA with the font name swapped for ours, so the size and colour the template
// chose survive — including `0 Tf`, which is what asks the viewer to fit the text to the box.
function daNaming(fieldDict, fontName, size = 0) {
  const da = entryValue(fieldDict.trim(), "DA");
  const inner = da && da.startsWith("(") ? da.slice(1, -1) : "";
  const swapped = /^\s*\/[^\s/]+/.test(inner)
    ? inner.replace(/^\s*\/[^\s/]+/, `/${fontName}`)
    : `/${fontName} 0 Tf 0 g`;
  // WRITE THE SIZE WE CHOSE, once we have chosen one. Every /DA in this template says `0 Tf` —
  // "reader, pick a size" — and preserving that while drawing at a size of our own leaves the
  // field telling two stories. It also has one very visible consequence, which is the reason this
  // parameter exists at all:
  //
  // Firefox's VIEWER never draws an /AP. pdf.worker.mjs:53927 hands every field to a real HTML
  // <input>, and pdf.mjs:17421 sizes that input `min(fontSize || 9, (height - 2) / 1.35)` — so
  // `0 Tf` falls through to a hardcoded NINE POINTS whatever the box is. `evasion` is a 32.3pt
  // shield and Firefox draws its two digits at 9px, which is what "it still looks small in
  // Firefox" means: not our layout losing, our layout never being consulted. Writing 26 there
  // gives min(26, 22.4) = 22.4px instead, and the on-screen field finally resembles the printed
  // one. Chrome's regeneration reads the same key, so a Chrome save lands nearer our layout too.
  //
  // Only when appearances are ON. With them off the reader really is doing the fitting, and a
  // fixed size would stop it shrinking to fit text the user types — which is precisely the mode
  // chosen by someone who intends to type into it.
  const sized = size > 0 ? swapped.replace(/(^\s*\/[^\s/]+\s+)[\d.]+(\s+Tf)/, `$1${formatNumber(size)}$2`) : swapped;
  return `(${sized})`;
}

function rewriteDict(dict, dropKeys, additions) {
  const body = dict.trim();
  const entries = dictEntries(body);
  let out = "";
  let cut = 0;
  for (const entry of entries) {
    if (!dropKeys.includes(entry.key)) continue;
    out += body.slice(cut, entry.start);
    cut = entry.end;
  }
  out += body.slice(cut);
  if (!out.endsWith(">>")) throw new SyntaxError("pdf-form.js: dictionary did not end with >> after rewriting");
  return `${out.slice(0, -2)}${additions}>>`;
}

// Which appearance state means "ticked" for this widget. Read from /AP/N rather than assumed,
// because the whole point of /AS is to name a state the widget actually has: writing /AS/Yes to a
// box whose states are /1 and /Off ticks nothing and reports no error.
function onStateOf(dict) {
  const ap = entryValue(dict, "AP");
  if (!ap || !ap.startsWith("<<")) return DEFAULT_ON_STATE;
  const normal = entryValue(ap, "N");
  if (!normal || !normal.startsWith("<<")) return DEFAULT_ON_STATE;
  const state = dictEntries(normal).find((e) => e.key !== "Off");
  return state ? state.key : DEFAULT_ON_STATE;
}

// ---------- what a widget says about its own box ----------
//
// Five readers over one widget dictionary, all of them built on entryValue() above, and all five
// exported for the reason the header gives: the geometry they compute has an independent answer
// inside the template, so a test can diff our arithmetic against the file's own.
//
// They are only ever called when appearances are being generated. With `appearances: false` this
// module writes no drawing, so none of this is parsed and a template that would fail one of these
// checks still fills — which is the fallback advice every refusal below gives.

// PDF numbers: optionally signed, decimal point optional, and NO exponent — `1e-7` is the number 1
// followed by a keyword in this grammar. Matching them out of the array rather than splitting on
// whitespace means "[ 11.6295 22.2755 274.019 227.972]" (Master PDF Editor's own spacing, note the
// leading space) needs no trimming, and an indirect "/Rect 5 0 R" comes out as two numbers rather
// than as a rectangle at the origin.
const PDF_NUMBERS = /[-+]?(?:\d+\.?\d*|\.\d+)/g;

// /Ff bit 13 (1-based, so 1 << 12): the text field is multiline. Set on 16 of this template's 71
// text fields, always alongside bit 26 — /Ff 33558528 is 4096 + 33554432 — which is why this masks
// rather than compares.
const MULTILINE_FLAG = 1 << 12;

// The three non-stroking colour operators a /DA may end with, and how many operands each takes.
// Nothing else from a /DA is ever copied into a stream we compose; see daParts().
const COLOUR_ARITY = Object.freeze({ g: 1, rg: 3, k: 4 });

// A colour operand as the plan's whitelist spells one: digits and an optional point, no sign, no
// exponent. Colour components are 0..1, so a "-" here is a malformed /DA and not a colour.
const COLOUR_OPERAND = /^\d*\.?\d+$/;

/**
 * A widget's /Rect, normalised so width and height are positive.
 *
 * NORMALISING IS NOT TIDINESS. §12.5.2 says a /Rect may store its corners in either order, and
 * this template really does: `hope1` is `[41.25 487.5 52.75 477]`, top-left to bottom-right
 * (measured 2026-09-01; it is the only one of the 182, and it is a checkbox, so no text field
 * depends on this today). Subtracting in file order there gives a height of −10.5, and a form
 * XObject whose /BBox has a negative extent draws NOTHING in either PDFium or MuPDF — no error, no
 * warning, an empty field on the page. min/max on BOTH axes, because the same is true sideways.
 *
 * @param {string} dict  the widget's dictionary, "<<…>>"
 * @returns {{x:number, y:number, width:number, height:number}} the lower-left corner and the extents
 */
export function rectOf(dict) {
  const raw = entryValue(dict.trim(), "Rect");
  if (raw === null) {
    throw new UnsupportedPdfError(
      "pdf-form.js: a widget has no /Rect, so there is no box to draw its value into. Fill with " +
      "appearances switched off, which asks the reader to place it instead.",
    );
  }
  const numbers = (raw.match(PDF_NUMBERS) || []).map(Number);
  if (numbers.length !== 4 || numbers.some((n) => !Number.isFinite(n))) {
    throw new UnsupportedPdfError(
      `pdf-form.js: a widget's /Rect is ${JSON.stringify(raw)}, which is not four numbers. ` +
      "An indirect /Rect (`5 0 R`) looks like this and is deliberately not resolved: a rectangle " +
      "is two corners, and this module takes both of them from the widget itself.",
    );
  }
  const [x0, y0, x1, y1] = numbers;
  return {
    x: Math.min(x0, x1),
    y: Math.min(y0, y1),
    width: Math.abs(x1 - x0),
    height: Math.abs(y1 - y0),
  };
}

/**
 * A text field's /DA, split into the size it asks for and the colour it draws in.
 *
 * THE COLOUR IS REBUILT, NOT QUOTED. A /DA is a string somebody else's editor wrote, and the
 * drawing this module composes is a content stream: pasting bytes from one into the other is how a
 * template gets to choose our operators. So the operands are matched against a whitelist of
 * digits, counted against the operator's own arity, and then RE-EMITTED through formatNumber() —
 * what reaches the stream is a number we computed, not a byte we copied. shared/pdf-text.js checks
 * the same shape again at the last moment (its COLOUR_OPERATORS), because it is the file that
 * actually writes it.
 *
 * The size comes back and is deliberately not used: all 71 /DA strings in this template read
 * `/Helvetica 0 Tf …`, and `0 Tf` means "pick a size that fits", which is the whole job
 * shared/pdf-text.js does. Honouring a template's FIXED size would mean drawing a block we have
 * not proved fits the box — which is Firefox's bug (pdf.worker.mjs:54240) with our name on it. It
 * is returned because splitting the string is what makes the colour trustworthy: you cannot know
 * which tokens are the colour without knowing what the others were.
 *
 * @param {string} dict  the widget's dictionary
 * @returns {{size:number, colour:(string|null)}}  size 0 means "fit it" (or "no /DA"); a null
 *   colour means the /DA named none we recognise, and the caller draws black.
 */
export function daParts(dict) {
  const raw = entryValue(dict.trim(), "DA");
  // An indirect /DA — legal, and what `19 0 R` would look like here — reads as "no /DA": the
  // default is black at a fitted size, which is what every field on this template asks for anyway.
  if (raw === null || (!raw.startsWith("(") && !raw.startsWith("<"))) return { size: 0, colour: null };
  const da = decodeString(raw);
  const tokens = da.trim().split(/[\0\t\n\f\r ]+/);
  let size = 0;
  let colour = null;
  for (let i = 0; i < tokens.length; i++) {
    // Later operators win, exactly as they would if a reader executed the string, so this keeps
    // looking rather than stopping at the first hit.
    if (tokens[i] === "Tf" && i >= 1 && Number.isFinite(Number(tokens[i - 1]))) size = Number(tokens[i - 1]);
    const arity = COLOUR_ARITY[tokens[i]];
    if (arity === undefined || i < arity) continue;
    const operands = tokens.slice(i - arity, i);
    if (!operands.every((operand) => COLOUR_OPERAND.test(operand))) continue;
    colour = `${operands.map((operand) => formatNumber(Number(operand))).join(" ")} ${tokens[i]}`;
  }
  return { size, colour };
}

/**
 * Is this text field multiline? /Ff bit 13.
 *
 * REFUSES rather than defaults when /Ff is there but unreadable — an indirect one, say. Guessing
 * "single line" for a 205pt-tall box is not a small mistake: the fitter would size one line to the
 * box's width, hit the 6pt floor, and report a truncation that dropped most of the value. Guessing
 * the other way is no better. A template this module cannot read the flags of is one to fill with
 * appearances switched off.
 *
 * @param {string} dict  the widget's dictionary
 * @returns {boolean}
 */
export function multilineOf(dict) {
  const raw = entryValue(dict.trim(), "Ff");
  if (raw === null) return false;
  const flags = Number(raw.trim());
  if (!Number.isInteger(flags)) {
    throw new UnsupportedPdfError(
      `pdf-form.js: a widget's /Ff is ${JSON.stringify(raw)}, which is not an integer, so whether ` +
      "the field is multiline cannot be read. Fill with appearances switched off.",
    );
  }
  return (flags & MULTILINE_FLAG) !== 0;
}

/**
 * A field's /Q: 0 left, 1 centre, 2 right, and 0 when it says nothing. On this template 25 fields
 * are centred, 3 right, 1 explicitly 0, and 153 say nothing at all.
 *
 * DEFAULTS where multilineOf() refuses, and the difference is what the mistake costs. A /Q nobody
 * can read costs a line its alignment — ugly, and every character still on the page. A misread
 * /Ff costs the page most of a paragraph. Only one of those is worth stopping an export over.
 *
 * @param {string} dict  the widget's dictionary
 * @returns {number}
 */
export function quadOf(dict) {
  const raw = entryValue(dict.trim(), "Q");
  if (raw === null) return 0;
  const quad = Number(raw.trim());
  return Number.isInteger(quad) ? quad : 0;
}

/**
 * Everything shared/pdf-text.js needs to lay one field's value out, read off the widget.
 *
 * WHAT IS NOT READ HERE, AND WHY: the border width. The clip and every inset in the placement
 * constants stand off by 1 point, and that 1 is a constant here rather than the widget's own
 * /BS /W. It could not be read cheaply anyway — /BS is an INDIRECT reference on 125 of this
 * template's 182 widgets, so entryValue() hands back "797 0 R" — and resolving it would mean
 * carrying the object table into a geometry reader for a number the template already agrees with:
 * all 182 of its /BS dictionaries say `/W 1`, 57 inline and 125 in objects of their own (measured
 * 2026-09-01). If a template ever disagrees, the text is a point off the border, which is a
 * cosmetic loss on a rule this module never draws.
 *
 * THE ROTATION REFUSAL HAS THE SAME BLIND SPOT, on purpose and worth stating. /MK is indirect on
 * the same 125 widgets, so a rotated one among those would not be seen. Every /MK in this
 * template says `/R 0` — 57 inline, and the other 125 resolved and checked one by one by a script
 * on 2026-09-01 — so the hole is empty here; it is a hole in what a DIFFERENT template could
 * smuggle past this reader, and closing it means resolving references from inside a function whose
 * whole contract is that it reads one dictionary. The refusal is loud where it can see, and the
 * answer it gives (fill with appearances off) is the right answer to a rotated field either way.
 *
 * @param {string} dict  the widget's dictionary
 * @param {string} [name]  the field's name, for the message if this refuses
 * @returns {{width:number, height:number, multiline:boolean, quad:number, colour:(string|null)}}
 */
export function fieldBox(dict, name) {
  const body = dict.trim();
  const mk = entryValue(body, "MK");
  const rotation = mk && mk.startsWith("<<") ? (entryValue(mk, "R") || "0").trim() : "0";
  if (Number(rotation) !== 0) {
    throw new UnsupportedPdfError(
      `pdf-form.js: the field ${JSON.stringify(name ?? "(unnamed)")} is rotated — its /MK says /R ${rotation}. ` +
      "This module would draw the text upright inside a box the reader then turns, which is a wrong " +
      "sheet rather than an ugly one. Fill with appearances switched off and the reader places it.",
    );
  }
  const rect = rectOf(body);
  return {
    width: rect.width,
    height: rect.height,
    multiline: multilineOf(body),
    quad: quadOf(body),
    colour: daParts(body).colour,
  };
}

/**
 * Every "N 0 obj … endobj" block in the file, as objectNumber → {obj, dict}.
 *
 * The scan skips past each object's own endobj before looking for the next header, so a byte
 * sequence that happens to spell "12 0 obj" INSIDE a compressed font stream is never mistaken for
 * object 12 — it is inside object 500's body, which we have already stepped over. (A stream whose
 * bytes spell "endobj" can still end its object early here. The objects this module actually
 * rewrites are dictionaries with no stream at all, and they are cross-checked against /Fields
 * below, so the blast radius of that is an error, not a corrupt file.)
 *
 * Later definitions win, which is what an incremental update means — and it is what makes
 * fillForm(fillForm(bytes, a), b) do the sensible thing rather than resurrect the first pass.
 */
function scanObjects(text) {
  const header = /(^|[\r\n])(\d+)[\0\t\n\f\r ]+(\d+)[\0\t\n\f\r ]+obj/g;
  const objects = new Map();
  let at = 0;
  for (;;) {
    header.lastIndex = at;
    const match = header.exec(text);
    if (!match) return objects;
    const num = Number(match[2]);
    const generation = Number(match[3]);
    const bodyAt = match.index + match[0].length;
    const endAt = text.indexOf("endobj", bodyAt);
    if (endAt < 0) {
      throw new UnsupportedPdfError(
        `pdf-form.js: object ${num} at byte ${match.index + match[1].length} has no endobj — the file is truncated`,
      );
    }
    // Generation 0 throughout is one of this module's stated assumptions; a template with a reused
    // object number is out of scope, and silently rewriting the wrong generation would be worse
    // than the "unknown field" the caller gets instead.
    if (generation === 0) {
      objects.set(num, { obj: num, dict: text.slice(bodyAt, endAt) });
    }
    at = endAt + "endobj".length;
  }
}

// The last trailer in the file is the current one; everything before it has been superseded.
function readTrailer(text) {
  const at = text.lastIndexOf("trailer");
  if (at < 0) {
    throw new UnsupportedPdfError(
      "pdf-form.js: no `trailer` keyword — this file has no classic trailer dictionary, so there is " +
      "nothing to append an incremental update to",
    );
  }
  const dictAt = skipWhitespace(text, at + "trailer".length);
  const dict = text.slice(dictAt, endOfBracketed(text, dictAt, "<<", ">>"));
  const root = /^(\d+)/.exec(entryValue(dict, "Root") || "");
  if (!root) throw new UnsupportedPdfError("pdf-form.js: the trailer names no /Root, so the Catalog can't be found");
  const size = Number(entryValue(dict, "Size"));
  if (!Number.isInteger(size) || size < 1) {
    throw new UnsupportedPdfError(`pdf-form.js: the trailer's /Size is ${JSON.stringify(entryValue(dict, "Size"))}`);
  }
  const startxrefAt = text.lastIndexOf("startxref");
  if (startxrefAt < 0) throw new UnsupportedPdfError("pdf-form.js: no startxref, so there is no xref table to chain to");
  const offset = /^[\0\t\n\f\r ]*(\d+)/.exec(text.slice(startxrefAt + "startxref".length));
  if (!offset) throw new UnsupportedPdfError("pdf-form.js: startxref is not followed by a byte offset");
  return {
    root: Number(root[1]),
    size,
    info: entryValue(dict, "Info"),
    id: entryValue(dict, "ID"),
    prevStartxref: Number(offset[1]),
  };
}

// The pages, in the order a reader shows them.
//
// WALKED, NOT SCANNED. Picking every object whose /Type is /Page and sorting by object number
// would be shorter and would happen to be right for this template, whose two pages are objects 4
// and 735 in that order — but page order is the /Kids arrays' business and nothing else's, and an
// editor that re-saves a file is free to renumber. A caller asking for "page 1" and silently
// getting page 2 is the kind of wrong that only shows up on paper.
//
// Depth-first through /Kids, following /Type/Pages nodes and collecting /Type/Page leaves. `seen`
// is not defensive tidiness: a /Kids cycle is a file this would otherwise hang on, and a template
// nobody can open is a better outcome than a browser tab that stops responding.
function readPages(objects, catalogDict) {
  const rootRef = /^(\d+)[\0\t\n\f\r ]+0[\0\t\n\f\r ]+R$/.exec((entryValue(catalogDict, "Pages") || "").trim());
  if (!rootRef) {
    throw new UnsupportedPdfError(
      "pdf-form.js: the Catalog has no /Pages reference, so the page tree can't be walked. (A page " +
      "tree written inline rather than as an indirect reference is also unsupported.)",
    );
  }
  const pages = [];
  const seen = new Set();
  const walk = (num) => {
    if (seen.has(num)) {
      throw new UnsupportedPdfError(`pdf-form.js: the page tree visits object ${num} twice — /Kids has a cycle`);
    }
    seen.add(num);
    const object = objects.get(num);
    if (!object) throw new UnsupportedPdfError(`pdf-form.js: the page tree names object ${num}, which isn't in the file`);
    const dict = object.dict.trim();
    const type = entryValue(dict, "Type");
    if (type === "/Page") {
      pages.push({ obj: num, dict: object.dict });
      return;
    }
    if (type !== "/Pages") {
      throw new UnsupportedPdfError(
        `pdf-form.js: object ${num} is in the page tree but its /Type is ${JSON.stringify(type || "(none)")}`,
      );
    }
    for (const kid of (entryValue(dict, "Kids") || "").matchAll(/(\d+)[\0\t\n\f\r ]+0[\0\t\n\f\r ]+R/g)) {
      walk(Number(kid[1]));
    }
  };
  walk(Number(rootRef[1]));
  return pages;
}

function toLatin1Text(bytes) {
  if (bytes instanceof Uint8Array) return latin1(bytes);
  if (bytes instanceof ArrayBuffer) return latin1(new Uint8Array(bytes));
  if (ArrayBuffer.isView(bytes)) return latin1(new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength));
  throw new TypeError(`pdf-form.js: expected the template as a Uint8Array, got ${typeof bytes}`);
}

/**
 * Read a form template: what fields it has, and everything fillForm needs to append to it.
 *
 * @param {Uint8Array} bytes  the template, as it sits on disk
 * @returns {{fields: Map<string, {obj:number, type:('Tx'|'Btn'), dict:string}>,
 *            pages: {obj:number, dict:string}[],
 *            acroForm: {obj:number, dict:string}, root:number, size:number, prevStartxref:number}}
 *   `dict` is the raw bytes between "N 0 obj" and "endobj" as a latin1 string — one character per
 *   byte, the representation tests.js already uses for PDF bytes — so it can be searched directly.
 */
export function readForm(bytes) {
  const text = toLatin1Text(bytes);
  if (!text.startsWith("%PDF-")) {
    throw new UnsupportedPdfError("pdf-form.js: this does not start with %PDF- — it isn't a PDF");
  }
  // Both of these are checked before anything else is parsed: they describe files where the
  // parsing below would appear to succeed and produce a broken result.
  const compressed = text.includes("/ObjStm") ? "/ObjStm (compressed object streams)"
    : /\/Type[\0\t\n\f\r ]*\/XRef/.test(text) ? "/Type /XRef (a cross-reference stream)" : null;
  if (compressed) {
    throw new UnsupportedPdfError(
      `pdf-form.js: the template contains ${compressed}, which this module cannot read or extend. ` +
      "Re-save it from Master PDF Editor with compression switched off (File → Save As, and clear " +
      "the option that compresses objects), so the file keeps one classic xref table and one classic " +
      "trailer.",
    );
  }
  if (text.includes("/Encrypt")) {
    throw new UnsupportedPdfError(
      "pdf-form.js: the template is encrypted (/Encrypt). Field values would have to be encrypted " +
      "too, and writing them in plain text produces a sheet full of mojibake. Re-save it without a " +
      "password or permissions.",
    );
  }

  const trailer = readTrailer(text);
  const objects = scanObjects(text);

  const catalog = objects.get(trailer.root);
  if (!catalog) throw new UnsupportedPdfError(`pdf-form.js: the trailer's /Root is object ${trailer.root}, which isn't in the file`);
  const acroRef = /^(\d+)/.exec(entryValue(catalog.dict.trim(), "AcroForm") || "");
  if (!acroRef) {
    throw new UnsupportedPdfError(
      "pdf-form.js: the Catalog has no /AcroForm, so this PDF has no form fields to fill. (An " +
      "/AcroForm written inline rather than as an indirect reference is also unsupported.)",
    );
  }
  const acroObj = Number(acroRef[1]);
  const acro = objects.get(acroObj);
  if (!acro) throw new UnsupportedPdfError(`pdf-form.js: /AcroForm points at object ${acroObj}, which isn't in the file`);
  const acroDict = acro.dict.trim();

  // The live list. See the header: a scan of every /Subtype/Widget in this template finds four
  // orphans left behind by editing, one of which is a second widget called `name`. /Fields is the
  // list a viewer fills from, so it is the list this module fills from.
  //
  // RESOLVED, not refused, when /Fields is an indirect reference. Master PDF Editor writes the
  // array inline, but `/Fields 6 0 R` is just as legal and every reader follows it — and following
  // it here is a lookup in a table we have already built, which is a cheaper thing to own than one
  // more template this module can't open. Doing neither is what the code did before: the reference
  // scanned as a field number, object 6 turned out to be the array rather than a widget, and
  // dictEntries blamed a sound template with `expected a dictionary, found "[5 0 R]"`. One level
  // only — an object holding nothing but another reference is not something an editor writes, and
  // chasing an arbitrary chain would mean owning a cycle check for it.
  let fieldsArray = entryValue(acroDict, "Fields") || "";
  // Generation is matched as (\d+) rather than a literal 0 so that a non-zero one is REFUSED
  // rather than falling through. It would otherwise match neither this pattern nor the reference
  // scan below, leaving `listed` empty, which reads as "no /Fields at all" and silently drops to
  // scanning every widget in the file — on this template that means the four orphans come back and
  // the reader then dies on the duplicate `name`, blaming a template whose only oddity is a
  // generation number. scanObjects only keeps generation 0, so there is nothing to resolve to.
  const fieldsRef = /^(\d+)[\0\t\n\f\r ]+(\d+)[\0\t\n\f\r ]+R$/.exec(fieldsArray.trim());
  if (fieldsRef && fieldsRef[2] !== "0") {
    throw new UnsupportedPdfError(
      `pdf-form.js: the AcroForm's /Fields is a reference to object ${fieldsRef[1]} generation ` +
      `${fieldsRef[2]}, and this reader only follows generation 0 — so the template's field list ` +
      "can't be read",
    );
  }
  if (fieldsRef) {
    const target = objects.get(Number(fieldsRef[1]));
    if (!target || !target.dict.trim().startsWith("[")) {
      throw new UnsupportedPdfError(
        `pdf-form.js: the AcroForm's /Fields is a reference to object ${fieldsRef[1]}, which ` +
        `${target ? "is not an array" : "isn't in the file"} — so the template's field list can't be read`,
      );
    }
    fieldsArray = target.dict.trim();
  }
  const listed = [...fieldsArray.matchAll(/(\d+)[\0\t\n\f\r ]+0[\0\t\n\f\r ]+R/g)].map((m) => Number(m[1]));
  // No /Fields at all — a hand-written fixture, say. Fall back to every widget in the file, in
  // file order, and accept that the orphan filter is gone with it: a template without /Fields has
  // no orphans to filter, because a viewer would show it as having no fields at all.
  const live = listed.length ? listed : [...objects.keys()].filter((num) => {
    const dict = objects.get(num).dict.trim();
    return dict.startsWith("<<") && entryValue(dict, "Subtype") === "/Widget";
  });

  const fields = new Map();
  for (const num of live) {
    const object = objects.get(num);
    if (!object) {
      throw new UnsupportedPdfError(
        `pdf-form.js: /Fields names object ${num}, which isn't in the file — the template's field list ` +
        "and its objects disagree",
      );
    }
    const dict = object.dict.trim();
    const title = entryValue(dict, "T");
    if (!title) continue; // a field with no name is a field nothing can address; not ours to fix
    const name = decodeString(title);
    const type = (entryValue(dict, "FT") || "").slice(1);
    if (type !== "Tx" && type !== "Btn") {
      throw new UnsupportedPdfError(
        `pdf-form.js: field ${JSON.stringify(name)} (object ${num}) has /FT ${JSON.stringify(type || "(none)")}. ` +
        "This module fills text fields (/Tx) and checkboxes (/Btn) only.",
      );
    }
    if (fields.has(name)) {
      throw new UnsupportedPdfError(
        `pdf-form.js: two live fields are both called ${JSON.stringify(name)} (objects ${fields.get(name).obj} and ${num}). ` +
        "Rename one in Master PDF Editor — nothing here can know which one a value was meant for.",
      );
    }
    fields.set(name, { obj: num, type, dict: object.dict });
  }

  return {
    fields,
    pages: readPages(objects, catalog.dict.trim()),
    acroForm: { obj: acroObj, dict: acro.dict },
    root: trailer.root,
    size: trailer.size,
    prevStartxref: trailer.prevStartxref,
  };
}

/**
 * The template with values in it: the original bytes, then an incremental update.
 *
 * @param {Uint8Array} bytes   the template
 * @param {Object<string, (string|boolean)>} values  field name → value
 * @param {{appearances?: boolean}} [options]  see fillFormWithReport()
 * @returns {Uint8Array}
 *
 * A value of undefined, null or "" leaves that field exactly as the template had it, so a
 * character with no secondary weapon gets a blank line rather than a field asserting emptiness.
 * For a checkbox, that same rule means "" and undefined leave the box alone; `false` (which is what
 * a sheet actually says about an unmarked slot) writes /V/Off and /AS/Off explicitly.
 *
 * An unknown field name throws. sheet-fields.js and the template are two halves of one thing kept
 * in step by hand, and a typo in either is worth a stopped export rather than a sheet that is
 * silently missing a line nobody notices until it is printed.
 */
export function fillForm(bytes, values, options) {
  return fillFormWithReport(bytes, values, options).bytes;
}

/**
 * @typedef {object} FillReport  What the fill could not do, for a caller with somewhere to show it.
 * @property {null|{reason: string, fields: {field: string, characters: object[]}[]}} fellBack
 *   null when the drawing was written (or was never asked for). Otherwise the document fell back
 *   to /NeedAppearances, and this says why: `reason` is "unmappable", and `fields` names each
 *   field and the DISTINCT code points in it that WinAnsi cannot draw, in widget order, each with
 *   a count. One field's worth is enough to write the message with — "`appearance` contains
 *   characters this font can't draw (漢 ×3)" — and having them per field is what lets the message
 *   say WHERE.
 * @property {string[]} truncated  the fields whose value did not fit at the 6pt floor and were cut
 *   with a visible ellipsis, in widget-object order. Empty on every ordinary sheet.
 *
 * Two things are deliberately NOT in here, and shared/winansi.js's header argues it at length: the
 * minus-sign and non-breaking-hyphen substitutions, and the removed invisible characters. The rule
 * is REPORT WHAT CHANGES WHAT THE SHEET SAYS. A hyphen drawn for a U+2212 preserves the meaning,
 * and nine of the 69 SRD 2.0 armors carry one — reporting it would put a warning on a large share
 * of real sheets, which teaches people to ignore the panel that also carries the real losses.
 */

/**
 * fillForm(), plus the record of what it could not do.
 *
 * @param {Uint8Array} bytes   the template
 * @param {Object<string, (string|boolean)>} values  field name → value
 * @param {{appearances?: boolean, overlays?: Object<number, string>}} [options]
 *   `appearances: false` (the default) writes /V, deletes /AP and sets /NeedAppearances true —
 *   the reader lays the text out. `appearances: true` writes /V, an /AP /N Form XObject per filled
 *   text field, and /NeedAppearances false: the reader draws what we drew. The header argues which
 *   costs what.
 *
 *   `overlays` — page index → PDF operators to append to that page's content, under its
 *   annotations. Independent of `appearances` in both directions: this is page content, so
 *   /NeedAppearances has no opinion about it and neither does the fallback. An empty string draws
 *   nothing rather than appending an empty stream, so a caller can hand over a whole page's worth
 *   of "maybe" without testing it first.
 * @returns {{bytes: Uint8Array, fellBack: FillReport["fellBack"], truncated: string[]}}
 */
export function fillFormWithReport(bytes, values, { appearances = false, overlays = null } = {}) {
  if (!values || typeof values !== "object") {
    throw new TypeError(`pdf-form.js: values must be an object of field name → value, got ${typeof values}`);
  }
  // The values go SECOND, and a readForm() result handed over here is the mistake the signature
  // invites: readForm() is called below, so a caller that already has a form has nothing to thread
  // through. Without this the error would be "the template has no field called fields", which
  // sends the reader looking in the wrong file.
  if (values.fields instanceof Map && values.acroForm) {
    throw new TypeError(
      "pdf-form.js: fillForm(bytes, values) takes the values object as its SECOND argument — that " +
      "looks like a readForm() result. Call fillForm(template, sheetFieldValues(…)); readForm() is " +
      "called internally.",
    );
  }
  const text = toLatin1Text(bytes);
  const form = readForm(bytes);
  const trailer = readTrailer(text);

  // Object number → what to write for it: a dictionary, or a dictionary and the stream that
  // follows it. A TYPED UNION rather than a second Map or a flag, so the emit loop below has to
  // look at what it is holding before it can write it — and so /Length is counted off the bytes
  // that loop actually pushes rather than off a length computed anywhere else.
  const updates = new Map(); // object number → "<<…>>" | {dict: "<<…>>", stream: "…"}

  // The two kinds of fill, separated once here rather than tested for again in three places. Both
  // keep the caller's key order, which is what makes the "unknown field" error name the first
  // offending key rather than an arbitrary one; the DRAWING order is imposed further down, and it
  // is not this one.
  const ticks = [];
  const texts = [];
  for (const [name, value] of Object.entries(values)) {
    const field = form.fields.get(name);
    if (!field) {
      throw new RangeError(
        `pdf-form.js: the template has no field called ${JSON.stringify(name)}. ` +
        `Its ${form.fields.size} fields are: ${[...form.fields.keys()].join(", ")}`,
      );
    }
    if (value === undefined || value === null || value === "") continue;
    (field.type === "Btn" ? ticks : texts).push({ name, field, value });
  }

  // Only when there is text to draw. A sheet of nothing but ticked boxes needs no font, and adding
  // one would make the output differ from a run that wrote the same boxes a different way.
  // The first object number no template object is using. /Size is one past the template's highest,
  // and `highest + 1` covers a template whose own /Size is too small for its objects — a file a
  // reader would already be mis-reading, but not one we should make worse by writing over object
  // 1334 because a trailer said 900.
  const highest = Math.max(form.acroForm.obj, ...[...form.fields.values()].map((f) => f.obj));
  let ourFont = null;
  if (texts.length) {
    ourFont = { name: freeFontName(form.acroForm.dict), obj: Math.max(trailer.size, highest + 1) };
  }

  const drawn = appearances && ourFont ? drawFields(texts, ourFont) : { streams: null, fellBack: null, truncated: [] };

  for (const { field, value } of ticks) {
    const state = value ? onStateOf(field.dict.trim()) : "Off";
    updates.set(field.obj, rewriteDict(field.dict, ["V", "AS"], `/V/${state}/AS/${state}`));
  }
  for (const { field, value } of texts) {
    const drawing = drawn.streams ? drawn.streams.get(field.obj) : undefined;
    // "AP" stays in the drop list in BOTH modes, and the additions differ instead. Leaving it out
    // when we add one of our own would leave the widget carrying two /AP keys: rewriteDict's own
    // doc comment says why that is not a near-miss but a coin toss, and ghostscript takes the
    // FIRST — which is the template's `q\nQ\n`, so every filled field prints blank, with no
    // fallback and nothing on the page to say so.
    updates.set(field.obj, rewriteDict(field.dict, ["V", "AP", "DA"],
      `/V${utf16HexString(String(value))}/DA${daNaming(field.dict, ourFont.name, drawing ? drawing.size : 0)}` +
      (drawing ? `/AP<</N ${formatNumber(drawing.obj)} 0 R>>` : "")));
    if (drawing) updates.set(drawing.obj, { dict: appearanceDict(drawing.box, ourFont), stream: drawing.ops });
  }
  if (ourFont) updates.set(ourFont.obj, OUR_FONT_DICT);
  // /NeedAppearances is false exactly when there is a drawing of ours to look at, and true in every
  // other case — including a fill of nothing but ticks, and including the document-level fallback.
  // The flag means "reader, please lay these values out"; the only reason to stop asking is that
  // we have laid them out ourselves.
  updates.set(form.acroForm.obj, acroWithFont(form.acroForm.dict, ourFont, drawn.streams === null));

  // ---------- page overlays ----------
  //
  // Content appended to a page, under its annotations: what shared/sheet-marks.js draws for the HP,
  // Stress and Proficiency slots. This end of it knows nothing about slots — it takes operators and
  // a page index and appends a stream, which is the same division fillForm keeps everywhere else.
  //
  // /Contents BECOMES AN ARRAY, and the spec's own rule is what makes that safe: §7.8.2 says the
  // streams in a /Contents array are concatenated AS IF they were one stream, with the division
  // only permitted at a token boundary. So the operators arrive in the graphics state the page's
  // own content left behind. Both of this template's pages leave the q/Q stack balanced at depth
  // zero with no top-level `cm` (measured 2026-09-01: page one 530 q and 530 Q, page two 315 and
  // 315, neither ever going negative), so an appended stream starts in identity user space — but
  // sheet-marks.js still sets every piece of state it uses, because that is a fact about this
  // template rather than a promise from the spec.
  //
  // ALLOCATED LAST, above the font and every appearance stream. That ordering is the whole reason
  // this block sits below them rather than beside them: turning overlays on must not renumber a
  // single appearance object, or the "same values, keys reordered, byte-identical" test stops
  // meaning what it says.
  if (overlays) {
    let free = Math.max(trailer.size, highest + 1, ...[...updates.keys()].map((num) => num + 1));
    for (const key of Object.keys(overlays).sort((a, b) => Number(a) - Number(b))) {
      const ops = overlays[key];
      if (!ops) continue; // "" means "this page has nothing to draw", not "append an empty stream"
      const index = Number(key);
      const page = form.pages[index];
      if (!page) {
        throw new RangeError(
          `pdf-form.js: an overlay was given for page index ${JSON.stringify(key)}, and the document ` +
          `has ${form.pages.length} page${form.pages.length === 1 ? "" : "s"}`,
        );
      }
      const obj = free++;
      updates.set(obj, { dict: "<<>>", stream: ops });
      // /Contents is one reference, an array of them, or absent — and the first two shapes both
      // appear in this very template: page one is `/Contents 1366 0 R`, page two is a
      // three-element array left behind by the normalisation pass that wrapped its content in a
      // translation. Absent is legal too (§7.7.3.3: a page with no content is an empty page), and
      // it is what a hand-built fixture has. Anything else — an inline stream, which is not legal
      // here, or a reference this scan can't parse — is refused rather than guessed at, because
      // the failure mode of guessing is a page that draws nothing at all.
      const contents = (entryValue(page.dict.trim(), "Contents") || "").trim();
      const existing = contents.startsWith("[") ? contents.slice(1, -1).trim() : contents;
      if (existing && !/^(\d+[\0\t\n\f\r ]+\d+[\0\t\n\f\r ]+R[\0\t\n\f\r ]*)+$/.test(existing)) {
        throw new UnsupportedPdfError(
          `pdf-form.js: page ${index + 1} (object ${page.obj}) has /Contents ${JSON.stringify(contents.slice(0, 40))}, ` +
          "which is neither a stream reference nor an array of them, so there is nothing to append to",
        );
      }
      updates.set(page.obj, rewriteDict(page.dict, ["Contents"],
        `/Contents[${existing ? `${existing} ` : ""}${formatNumber(obj)} 0 R]`));
    }
  }

  // Chunks plus a running byte counter, exactly as pdf.js:216-228 does it and for the same reason:
  // an offset read from the counter is true whatever the chunks contain, where an offset computed
  // from a string's length is a guess about encoding that is wrong the moment it matters.
  const chunks = [];
  let at = 0;
  const push = (bytesOut) => { chunks.push(bytesOut); at += bytesOut.length; };
  const write = (str) => push(asciiBytes(str));

  push(bytes instanceof Uint8Array ? bytes : verbatimBytes(text));
  // An update must start on its own line. Master PDF Editor ends the file with "%%EOF\r\n", but a
  // template that ends flush against %%EOF would otherwise glue "1 0 obj" onto it.
  const lastByte = text.charCodeAt(text.length - 1);
  if (lastByte !== 0x0a && lastByte !== 0x0d) write("\r\n");

  const changed = [...updates.keys()].sort((a, b) => a - b);
  const offsets = new Map();
  for (const num of changed) {
    offsets.set(num, at);
    write(`${formatNumber(num)} 0 obj\r\n`);
    const update = updates.get(num);
    if (typeof update === "string") {
      // A rewritten dictionary: mostly template bytes, quoted back, so verbatimBytes and not
      // write(). The BYTES, STRINGS section of the header is about exactly this line.
      push(verbatimBytes(update));
    } else {
      // An appearance stream, and every byte of it is ours: the dictionary is composed here and
      // the operators come out of shared/pdf-text.js, which guarantees pure ASCII (its literal
      // bodies are octal-escaped above 0x7E). So this side goes through asciiBytes(), which is
      // the stricter check and the right one — nothing here is a copy.
      //
      // /Length COUNTED FROM THE BYTES THIS LOOP PUSHES, which is the whole reason `updates` is a
      // union rather than two maps: it counts the bytes between the newline that ends "stream" and
      // the one that begins "endstream", neither included, exactly as pdf.js:260-271 does it. A
      // /Length computed anywhere else is a claim about bytes somebody else wrote.
      const body = asciiBytes(update.stream);
      write(withEntries(update.dict, `/Length ${formatNumber(body.length)}`));
      write("\r\nstream\n");
      push(body);
      write("\nendstream");
    }
    write("\r\nendobj\r\n");
  }

  // /Size is one past the highest object number in the file, and we DO add objects — the font, and
  // one appearance stream per drawn field — so this has to grow. Taking the max rather than
  // trailer.size + N also covers a template whose own /Size was already too small for its fields,
  // where a reader ignores everything above it and the sheet comes out empty.
  const size = Math.max(trailer.size, changed.length ? changed[changed.length - 1] + 1 : 0);

  const xrefAt = at;
  write("xref\r\n");
  // One subsection per run of consecutive object numbers. NOTHING THE TEMPLATE OWNS IS EVER IN A
  // RUN: its 182 widgets are numbered 41 to 1334 and its AcroForm is 32, three apart at the
  // closest, so a realistic export writes one subsection per rewritten widget — 73 of them, all of
  // one entry, for the 48 text fields, 23 ticks, the AcroForm and the font of a real character
  // (measured 2026-09-01 against data/sheet/sheet-template.pdf).
  //
  // The objects WE allocate are the exception, and they are why the run-joining below is no longer
  // theoretical: the font and the N appearance streams are consecutive by construction. That same
  // export with appearances on writes the same 73 subsections but 121 entries, the last of them a
  // single run of 49 — the font, then one stream per drawn field. This loop had never once been
  // round its `while` before that.
  //
  // Either shape is fine, and the reason it is fine is that a reader takes each subsection's
  // length from that subsection's own header: what has to add up is the entries, not the runs.
  // Sorting above is for determinism — same values in, same bytes out — not to make runs long.
  for (let i = 0; i < changed.length;) {
    let end = i + 1;
    while (end < changed.length && changed[end] === changed[end - 1] + 1) end++;
    write(`${formatNumber(changed[i])} ${formatNumber(end - i)}\r\n`);
    for (let k = i; k < end; k++) {
      // EXACTLY 20 bytes: %010d SP %05d SP n CR LF. pdf.js:300-303 has the long version of why —
      // a reader is entitled to seek straight to entry k, and a 19-byte entry makes every entry
      // after the first land one byte early.
      const offset = formatNumber(offsets.get(changed[k])).padStart(10, "0");
      if (offset.length !== 10) {
        throw new RangeError(`pdf-form.js: offset ${offset} needs more than 10 digits, which would break the 20-byte xref entry`);
      }
      write(`${offset} 00000 n\r\n`);
    }
    i = end;
  }

  // /Info and /ID are copied through as they were, never invented: the same character exported
  // twice has to diff as an identical file, and a fresh /ID (or a /ModDate) is the usual reason it
  // doesn't. /Prev is what makes this a supplement to the template's xref rather than a
  // replacement for it — drop it and every object we did NOT rewrite disappears from the document.
  write(`trailer\r\n<</Size ${formatNumber(size)}/Root ${formatNumber(form.root)} 0 R`);
  // Quoted back from the template, so verbatimBytes — not write(). A file identifier is two byte
  // strings and they may be written literally rather than as hex, in which case they are 16 random
  // bytes and almost certainly contain one above 0x7F. asciiBytes() would refuse it, blaming an
  // encoding for what is a copy, and naming pdf.js for a fault that is ours.
  if (trailer.info) push(verbatimBytes(`/Info ${trailer.info}`));
  if (trailer.id) push(verbatimBytes(`/ID${trailer.id}`));
  write(`/Prev ${formatNumber(trailer.prevStartxref)}>>\r\nstartxref\r\n${formatNumber(xrefAt)}\r\n%%EOF\r\n`);

  const out = new Uint8Array(at);
  let cursor = 0;
  for (const chunk of chunks) {
    out.set(chunk, cursor);
    cursor += chunk.length;
  }
  return { bytes: out, fellBack: drawn.fellBack, truncated: drawn.truncated };
}

/**
 * Lay out every filled text field, or decide the document cannot be drawn at all.
 *
 * ORDERED BY WIDGET OBJECT NUMBER, never by the caller's keys. The appearance objects are numbered
 * as they are ALLOCATED, so allocating in key order would make `{name, level}` and `{level, name}`
 * produce two different files out of the same character. tests.js:5447 is where that rule is
 * already written down for the dictionaries — same values, keys swapped, byte-identical output —
 * and note that its fixture fills ONE text field, so a version of this test with teeth needs two.
 * (The real template does have teeth: 48 text fields filled from a reversed value map came back
 * byte-identical, checked while writing this.) The widget numbers come from the template, so they
 * are the same list whatever the caller did.
 *
 * FRESH OBJECTS, ALWAYS: base+1 … base+N, above the font at base. Nothing here ever writes into
 * the template's existing /AP objects, and the test fixture is built to punish an implementation
 * that tries — its object 10 is the appearance for BOTH text widgets AND for both states of BOTH
 * checkboxes, so "update the /AP the widget already points at" would draw one field's text into
 * five places, two of them ticks. The real template is one step short of that: all 71 of its text
 * /APs are separate objects. They are FlateDecode-compressed, though, so reusing one would mean
 * composing a whole new object anyway — the only thing saved would be an object number.
 *
 * THE FALLBACK IS THE WHOLE DOCUMENT'S, and this is where it is decided. If any value carries a
 * character WinAnsi cannot draw and winansi.js has no substitution for, no stream is written at
 * all and the caller emits exactly today's file. NOT per field: with /NeedAppearances false, a
 * field carrying /V and no /AP is laid out by PDFium, MuPDF and ghostscript, but Firefox draws
 * NOTHING for it — `_getAppearance` returns null (pdf.worker.mjs:54101), `this.appearance` is
 * never set, and `getOperatorList` (:53936) hands back an empty operator list. So a per-field
 * fallback would be one field silently blank in one reader, which is the exact failure this
 * feature exists to remove, reproduced with our own name on it.
 *
 * @param {{name: string, field: {obj: number, dict: string}, value: *}[]} texts  the filled text fields
 * @param {{name: string, obj: number}} ourFont
 * @returns {{streams: (Map<number, {obj:number, ops:string, box:object}>|null),
 *            fellBack: (null|object), truncated: string[]}}
 *   `streams` is keyed by WIDGET object number and null when the document fell back.
 */
function drawFields(texts, ourFont) {
  const ordered = [...texts].sort((a, b) => a.field.obj - b.field.obj);
  const laid = ordered.map(({ name, field, value }) => {
    // fieldBox() names the field in its own refusals, so it stays outside the try.
    const box = fieldBox(field.dict, name);
    // textAppearance() cannot name it — it is handed a box and never learns whose — so its errors
    // are re-thrown with the field on them here, the only place that knows both. "box.width is 0.5"
    // without a field name is a message that sends someone reading 71 widgets by hand.
    try {
      return { name, field, result: textAppearance(String(value), { ...box, fontName: ourFont.name }), box };
    } catch (err) {
      throw new UnsupportedPdfError(
        `pdf-form.js: the field ${JSON.stringify(name)} (object ${field.obj}) cannot be drawn: ${err.message}`,
      );
    }
  });

  const unmappable = laid
    .filter((entry) => entry.result.notes.unmappable.length)
    .map((entry) => ({ field: entry.name, characters: entry.result.notes.unmappable }));
  if (unmappable.length) {
    return { streams: null, fellBack: { reason: "unmappable", fields: unmappable }, truncated: [] };
  }

  const streams = new Map();
  const truncated = [];
  laid.forEach((entry, index) => {
    streams.set(entry.field.obj, {
      obj: ourFont.obj + 1 + index, ops: entry.result.ops, box: entry.box, size: entry.result.size,
    });
    if (entry.result.notes.truncated) truncated.push(entry.name);
  });
  return { streams, fellBack: null, truncated };
}

/**
 * One appearance stream's dictionary, /Length excluded — the emit loop counts that off the bytes
 * it pushes.
 *
 * /BBox is [0 0 w h] and /Matrix is the identity, which together are what map the drawing onto the
 * widget: §12.5.5 transforms the /BBox by the /Matrix and then fits the result to the annotation's
 * /Rect. Equal extents plus an identity matrix means that fit is 1:1, so a coordinate in this
 * stream is a point in the field's box and page 2's origin never enters into it. (Master PDF
 * Editor's own /AP objects agree, which is the check worth having: every one of the template's 71
 * text /BBoxes matches its widget's /Rect extents to within 0.001pt, measured 2026-09-01.)
 *
 * /Resources NAMING OUR OWN FONT IS LOAD-BEARING, not insurance. The template's /Helvetica carries
 * a /Differences array that moves 149 off /bullet and onto /Lslash, and BOTH PDFium and MuPDF
 * honour a /Differences inside a content stream — so a stream that inherited the page's font, or
 * named the AcroForm's, would draw Ł where these bytes say bullet. Chrome's own regenerated
 * appearances name /DhHelv in all 53 of them for the same reason.
 *
 * @param {{width: number, height: number}} box
 * @param {{name: string, obj: number}} font
 * @returns {string}
 */
function appearanceDict(box, font) {
  return "<</Type/XObject/Subtype/Form/FormType 1"
    + `/BBox[0 0 ${formatNumber(box.width)} ${formatNumber(box.height)}]`
    + "/Matrix[1 0 0 1 0 0]"
    + `/Resources<</Font<</${font.name} ${formatNumber(font.obj)} 0 R>>>>>>`;
}
