// Filling in an AcroForm template, by appending to it rather than rewriting it.
//
// WHY THIS EXISTS, AND HOW IT DIFFERS FROM shared/pdf.js
// -----------------------------------------------------
// pdf.js writes a PDF from nothing — a deck of card images and some stroked lines, a subset small
// enough to emit by hand. This file does the opposite job on the opposite kind of file: the
// official character sheet is a one-page form somebody drew in Master PDF Editor
// (data/sheet/sheet-template.pdf, a symlink into the private content repo), full of art, fonts
// and 100 form widgets we could not begin to author. We do not want to author it. We want to put
// 52 strings and six ticks into it — its 52 text fields, and six of its 48 checkboxes
// (sheet-fields.js's header says why only six) — and hand back the same file.
//
// So nothing here recreates the template. The output is the original bytes VERBATIM, followed by
// an incremental update: fresh copies of only the objects whose value changed, a cross-reference
// section covering only those, and a trailer whose /Prev points back at the original one. Every
// byte the template already had — its fonts, its art, its appearance streams, the offsets in its
// xref — stays exactly where it was, which is why a template re-save costs this module nothing.
// It also means the only offsets we compute are offsets into bytes we appended ourselves.
//
// The two modules share pdf.js's rules, and import them rather than restating them:
// asciiBytes() (pdf.js:16-27 — never TextEncoder, because one UTF-8 double-byte shifts every
// later xref offset and the file opens blank rather than failing) and formatNumber().
//
// It is in shared/ because it is bytes in, bytes out: no DOM, no fetch, nothing to mock. Fetching
// the template and handing the result to the browser is sheet-pdf.js's job, which is why that file
// sits at the repo root with the other page code. Two exports, and both take the template bytes as
// their first argument: readForm(bytes) and fillForm(bytes, values).
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
// THE TRAP THAT COST THE MOST: STALE WIDGETS
// -------------------------------------------
// The template contains 104 objects carrying /Subtype/Widget, but only 100 live fields. Editing a
// form leaves orphans behind: object 33 is a `name` text field from an earlier session, superseded
// by object 679, and objects 562, 673 and 676 are similar litter. They are not in the page's
// /Annots and not in the AcroForm's /Fields, so no viewer will ever show or fill them — but a scan
// for "every object with a /T" finds them, and then finds `name` twice.
//
// So the live field list comes from the AcroForm's /Fields array (verified equal, object for
// object, to the page's /Annots), and the scan only supplies the bytes. Without that filter a
// perfectly good template makes readForm throw "duplicate field name", and "fix your template"
// would be the wrong advice.
//
// WHY /NeedAppearances, AND WHAT IT COSTS
// ---------------------------------------
// A filled field has two halves: /V, the value, and /AP, a little stream drawing that value in the
// field's box. We write /V and DELETE /AP, then set /NeedAppearances true on the AcroForm to ask
// the viewer to draw the value itself. We don't generate the drawing, because doing so means
// shaping text into a box with a font we would have to measure — every /DA in this template says
// `0 Tf`, i.e. "pick a size that fits", and resolving that is the viewer's job.
//
// DELETING /AP IS NOT TIDINESS, IT IS THE WHOLE THING WORKING. The template's text fields ship
// with an /AP that draws an EMPTY field (`/Tx BMC … EMC`, nothing between). A viewer that trusts a
// present /AP over /NeedAppearances draws that emptiness — the file is correct and the page is
// blank. This was measured, not reasoned about. Rendering the same character three ways and
// counting pixels that differ from the untouched template, at -dPrinted=true -r100:
//
//     keep /AP + /NeedAppearances      ghostscript    39 px   poppler  183546 px
//     drop /AP + /NeedAppearances      ghostscript  4119 px   poppler  183546 px
//     generate our own /AP             ghostscript  4089 px   poppler  ~same
//
// Ghostscript is the one that exposes it, and it is not a toy target: it is the renderer this
// project's own template-fidelity check runs. Poppler regenerates either way, which is exactly why
// testing on one renderer would have shipped a sheet that looks right on screen and prints blank.
//
// The remaining cost of not generating /AP is that each viewer regenerates with its own metrics,
// so the same field is spaced differently in different readers — ghostscript's fallback font is
// noticeably wide. Generating appearance streams here would fix that and is the known next step;
// it needs a Helvetica width table and a wrapper, and neither is in this file, on purpose.
//
// Checkboxes are the other half of the same story. /V alone leaves a box that reads as ticked to a
// script and unticked to a human: /AS is the key that actually selects which of the widget's
// prebuilt appearance states is drawn. Both, always.
//
// BYTES, STRINGS, AND WHICH IS WHICH
// -----------------------------------
// Inside this file a PDF is a "latin1 string": one JavaScript character per byte, code 0-255,
// which is the same representation tests.js uses to assert on pdf.js's output ("byte n of the file
// is character n of this string"). That is what lets a field's dictionary be handed back to a test
// as something it can .includes() on. Composed text still goes out through asciiBytes(); only
// bytes we QUOTED BACK from the template go through verbatimBytes(), which accepts 0x80-0xFF
// precisely because it is copying, not encoding.
//
// DETERMINISM
// -----------
// Same template plus same values in, byte-identical file out: updated objects are written in
// numeric order rather than in the caller's key order, no /Info and no /ID are invented (the
// original trailer's are copied through as references), and no timestamp is written anywhere.

import { asciiBytes, formatNumber } from "./pdf.js";

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

// Bytes → latin1 string, in chunks because String.fromCharCode(...bytes) on a 187KB template
// blows the argument limit and throws RangeError somewhere far from the cause.
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
// perfectly fine. Not a hypothetical, though not every widget either: 33 of this template's 100
// live fields carry /P 4 0 R — all 33 of them text fields, and none of the 48 checkboxes — and
// every one of those 33 is a field the sheet fills.
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
// Chrome honours that array and draws a quote for a bullet; poppler resolves by Unicode and draws
// the bullet, which is exactly the kind of split that ships. Measured across the 15 classes in
// data/: 21 bullets, 7 curly apostrophes, 4 em dashes, 2 en dashes — plus armor-name, which is the
// em dash itself for a character with nothing equipped.
//
// So we ADD a font instead of correcting theirs. Nothing the editor authored is modified, which
// means this does not depend on which editor authored it: whatever any producer writes into
// /Differences becomes irrelevant, because the fields we fill no longer name that font. Correcting
// their font in place would have been ten lines instead of these forty, and would have been a
// patch shaped like one editor's bug.
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

// The AcroForm with our font reachable from /DR/Font, building whichever level is missing.
function acroWithFont(acroDict, font) {
  const drop = ["NeedAppearances"];
  let additions = "/NeedAppearances true";
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
function daNaming(fieldDict, fontName) {
  const da = entryValue(fieldDict.trim(), "DA");
  const inner = da && da.startsWith("(") ? da.slice(1, -1) : "";
  const swapped = /^\s*\/[^\s/]+/.test(inner)
    ? inner.replace(/^\s*\/[^\s/]+/, `/${fontName}`)
    : `/${fontName} 0 Tf 0 g`;
  return `(${swapped})`;
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
export function fillForm(bytes, values) {
  if (!values || typeof values !== "object") {
    throw new TypeError(`pdf-form.js: values must be an object of field name → value, got ${typeof values}`);
  }
  // Two arguments, not three. readForm() is called below, so a caller that already has a form has
  // nothing to thread through — and handing it here would otherwise be reported as "the template
  // has no field called fields", which sends the reader looking in the wrong file.
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

  const updates = new Map(); // object number → the new dictionary, "<<…>>"

  // Only when there is text to draw. A sheet of nothing but ticked boxes needs no font, and adding
  // one would make the output differ from a run that wrote the same boxes a different way.
  const writesText = Object.entries(values).some(([name, value]) =>
    value !== undefined && value !== null && value !== "" && form.fields.get(name)?.type === "Tx");
  let ourFont = null;
  if (writesText) {
    const highest = Math.max(form.acroForm.obj, ...[...form.fields.values()].map((f) => f.obj));
    ourFont = { name: freeFontName(form.acroForm.dict), obj: Math.max(trailer.size, highest + 1) };
  }

  for (const [name, value] of Object.entries(values)) {
    const field = form.fields.get(name);
    if (!field) {
      throw new RangeError(
        `pdf-form.js: the template has no field called ${JSON.stringify(name)}. ` +
        `Its ${form.fields.size} fields are: ${[...form.fields.keys()].join(", ")}`,
      );
    }
    if (value === undefined || value === null || value === "") continue;
    if (field.type === "Btn") {
      const state = value ? onStateOf(field.dict.trim()) : "Off";
      updates.set(field.obj, rewriteDict(field.dict, ["V", "AS"], `/V/${state}/AS/${state}`));
    } else {
      updates.set(field.obj, rewriteDict(field.dict, ["V", "AP", "DA"],
        `/V${utf16HexString(String(value))}/DA${daNaming(field.dict, ourFont.name)}`));
    }
  }
  if (ourFont) updates.set(ourFont.obj, OUR_FONT_DICT);
  updates.set(form.acroForm.obj, acroWithFont(form.acroForm.dict, ourFont));

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
    push(verbatimBytes(updates.get(num)));
    write("\r\nendobj\r\n");
  }

  // /Size is one past the highest object number in the file, and we DO add one — the font above —
  // so this has to grow. Taking the max rather than trailer.size + 1 also covers a template whose
  // own /Size was already too small for its fields, where a reader ignores everything above it and
  // the sheet comes out empty.
  const size = Math.max(trailer.size, changed.length ? changed[changed.length - 1] + 1 : 0);

  const xrefAt = at;
  write("xref\r\n");
  // One subsection per run of consecutive object numbers, which for this template means one
  // subsection per ENTRY. Its fillable objects are never numbered next to each other: the 100 live
  // fields and the AcroForm are scattered from 32 to 713, three apart at the closest, so a
  // realistic export — 52 text fields, six trait marks and the AcroForm — writes 59 subsections of
  // one entry each, and not one run longer than that. Which is fine, and the reason it is fine is
  // that a reader takes each subsection's length from that subsection's own header: what has to
  // add up is the entries, not the runs. Sorting above is for determinism — same values in, same
  // bytes out — and not to make runs long; the run-joining here is only what keeps the section
  // right on some other template whose numbering does fall consecutively.
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
  return out;
}
