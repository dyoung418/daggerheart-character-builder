// A PDF writer, hand-rolled, in about two hundred lines.
//
// WHY THIS EXISTS
// ---------------
// README:15 promises no build step and no backend, and every page sets CSP `script-src 'self'`,
// so a PDF library can be neither bundled nor loaded from a CDN. The alternative was giving up
// on a real .pdf. But the file this app has to produce is unusually small in PDF terms: images
// placed on pages, straight lines stroked over them, and NOTHING else — no fonts, no text
// objects, no transparency, no annotations, no compression. That subset is writable by hand and
// checkable by a test, which is what the rest of this file is.
//
// The card art arrives here already encoded (card-pdf.js runs it through a canvas and
// toBlob("image/jpeg")), so this module never decodes or re-encodes an image: it copies the
// bytes it was handed into an XObject and writes a placement matrix. That is the whole job.
//
// THE ONE INVARIANT: NEVER TextEncoder
// ------------------------------------
// A PDF is a byte file with a byte-offset index (the xref table) pointing at every object in it.
// TextEncoder emits UTF-8, so a single non-ASCII character in any string we write would emit two
// bytes where the string had one character — and every offset recorded after that point would be
// off by one and land in the middle of an object. Acrobat says "damaged and could not be
// repaired"; poppler often says nothing at all and silently renders a blank page, which is worse.
//
// So: every string→bytes conversion in this file goes through asciiBytes(), which throws rather
// than guess, and offsets are read from a running byte counter rather than from string lengths.
// If you ever need a non-ASCII string in a PDF (a document title, say), it goes in as a
// hex-escaped PDF string literal — not as UTF-8 through the back door.
//
// DETERMINISM
// -----------
// No /Info dictionary (which is where a creation date would live) and no /ID: the same input
// produces byte-identical output, so a golden test is possible and two exports of an unchanged
// character diff as identical files.
//
// INPUT SHAPES
// ------------
//   doc   = { width, height, images: PdfImage[], pages: PdfPage[] }   // width/height in points
//   PdfImage = { bytes, width, height, filter?, colorSpace?, bits?, decodeParms? }
//   PdfPage  = { draws: Draw[], lines: Segment[], lineWidth?, lineGray? }
//   Draw     = { image, x, y, width, height }   // x/y are the LOWER-LEFT corner, PDF coords
//   Segment  = { x1, y1, x2, y2 }
//
// `image` is an index into doc.images, not the bytes, so a card face used twice (or the same
// fallback art on twenty cards) is embedded once and referenced twice. At ~156KB a card that is
// the difference between a 3MB file and a 20MB one.
//
// filter/colorSpace/bits are parameters rather than hardcoded DCT constants because the art on
// disk is 8-bit palette PNG, and a non-interlaced PNG's concatenated IDAT bytes are already
// exactly what PDF wants for /FlateDecode with /Predictor 15 and an /Indexed colour space. That
// lossless transplant is out of scope for v1, but when it lands it should need zero changes
// here — it is a different dictionary over the same verbatim-bytes machinery.

const DEFAULT_FILTER = "DCTDecode"; // baseline JPEG, what canvas.toBlob gives us
const DEFAULT_COLOR_SPACE = "DeviceRGB";
const DEFAULT_BITS = 8;

// The PDF default line width, used when a page doesn't say. Deliberately not the crop-mark
// width — geometry belongs to card-layout.js, and a writer that quietly knew about crop marks
// would be the wrong place to change them.
const DEFAULT_LINE_WIDTH = 1;

/**
 * String → bytes, one byte per character, refusing anything that isn't ASCII.
 *
 * This is the whole defence described in the header comment. It throws instead of substituting
 * or dropping, because a silently mangled offset table is a file that opens blank rather than a
 * file that fails loudly.
 *
 * @param {string} str
 * @returns {Uint8Array}
 */
export function asciiBytes(str) {
  const s = String(str);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) {
    const code = s.charCodeAt(i);
    if (code > 0x7f) {
      throw new RangeError(
        `pdf.js: non-ASCII character ${JSON.stringify(s[i])} (U+${code.toString(16).toUpperCase().padStart(4, "0")}) ` +
        `at index ${i} of ${JSON.stringify(s.slice(0, 60))} — encoding it would break every xref offset after it`,
      );
    }
    out[i] = code;
  }
  return out;
}

/**
 * A number as PDF spells one.
 *
 * Three things JavaScript does that PDF does not accept:
 *   - exponential notation. String(1e-7) is "1e-7"; there is no such PDF number, and a parser
 *     reading it sees the number 1 followed by a keyword `e-7` and gives up on the stream.
 *   - "-0". Legal-ish, but it makes byte-identical output depend on which side of zero a
 *     subtraction came out on, which defeats the golden test.
 *   - binary float noise. 13.68 - 4.32 is 9.360000000000001, and a page full of those is a few
 *     hundred wasted bytes per page plus a diff that changes when nothing changed.
 *
 * Four decimal places is far finer than a printer can resolve (0.0001pt is ~35 nanometres) and
 * is what the spec's own implementation limit suggests, so rounding there costs nothing.
 *
 * @param {number} n
 * @returns {string}
 */
export function formatNumber(n) {
  if (typeof n !== "number" || !Number.isFinite(n)) {
    throw new RangeError(`pdf.js: ${JSON.stringify(n)} is not a finite number, so it has no PDF spelling`);
  }
  // toFixed() switches to exponential notation above 1e21. Nothing on a 612x792pt page comes
  // near that, so a value this large is a bug upstream and worth saying so.
  if (Math.abs(n) >= 1e21) {
    throw new RangeError(`pdf.js: ${n} is too large to write without exponential notation`);
  }
  const rounded = Math.round(n * 1e4) / 1e4;
  if (rounded === 0) return "0"; // catches -0 too: -0 === 0
  // Trim only the zeros AFTER the decimal point. A blanket /0+$/ would turn "1000.0000" into
  // "1", which is the kind of bug that draws a card in the wrong place on page four.
  return rounded.toFixed(4).replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "");
}

/**
 * One page's content stream, as a string.
 *
 * Uncompressed on purpose: a few hundred bytes of operators against ~3.3MB of JPEG is not worth
 * a Flate implementation, and an uncompressed stream is readable in a hex dump when something
 * lands in the wrong place.
 *
 * Each image gets its own q…Q. The `cm` inside multiplies into the current transformation
 * matrix, so without the save/restore the second card would be placed in the first card's
 * coordinate system and everything after it would march off the page.
 *
 * All the segments are subpaths of ONE path closed by a single S. Sixteen separate strokes would
 * render identically but cost sixteen times the operator text, and — more to the point — a
 * single stroke means one place where the colour and width are set.
 *
 * @param {{draws?: Array<{image:number,x:number,y:number,width:number,height:number}>,
 *          lines?: Array<{x1:number,y1:number,x2:number,y2:number}>,
 *          lineWidth?: number, lineGray?: number}} page
 * @returns {string}
 */
export function pageContentStream(page) {
  const n = formatNumber;
  const out = [];
  for (const draw of page.draws || []) {
    // The image XObject is drawn into the unit square, so the matrix IS the placement: scale by
    // the card size, translate to the lower-left corner. No rotation, no skew, ever.
    out.push(`q ${n(draw.width)} 0 0 ${n(draw.height)} ${n(draw.x)} ${n(draw.y)} cm /Im${draw.image} Do Q`);
  }
  const lines = page.lines || [];
  if (lines.length) {
    out.push(`q ${n(page.lineGray ?? 0)} G ${n(page.lineWidth ?? DEFAULT_LINE_WIDTH)} w`);
    for (const seg of lines) {
      out.push(`${n(seg.x1)} ${n(seg.y1)} m ${n(seg.x2)} ${n(seg.y2)} l`);
    }
    out.push("S Q");
  }
  return out.length ? `${out.join("\n")}\n` : "";
}

// A PDF name written from a caller-supplied value. Plain identifiers get the slash added
// ("DeviceRGB" → "/DeviceRGB"); anything already starting with / or [ is a name or an array the
// caller composed itself, and goes through untouched — that is the door the /Indexed colour
// space of a future PNG path walks through.
function nameToken(value) {
  const s = String(value);
  return /^[/[]/.test(s) ? s : `/${s}`;
}

// Bytes as handed in, without interpretation. A string is refused rather than encoded: we
// cannot know what encoding was meant, and guessing is exactly the failure this file exists to
// avoid.
function imageBytes(bytes, index) {
  if (bytes instanceof Uint8Array) return bytes;
  if (bytes instanceof ArrayBuffer) return new Uint8Array(bytes);
  if (ArrayBuffer.isView(bytes)) return new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (Array.isArray(bytes)) return Uint8Array.from(bytes);
  throw new TypeError(`pdf.js: image ${index} has no usable bytes (got ${typeof bytes}) — pass a Uint8Array`);
}

/**
 * The whole document, as bytes.
 *
 * Object numbering is closed form rather than allocated as we go, so a test can assert where
 * everything landed without parsing the file first:
 *
 *   1                Catalog
 *   2                Pages          (carries /MediaBox, inherited by every page)
 *   3 … 2+M          the M images   (image i → object 3+i, drawn as /Im<i>)
 *   3+M+2i           Page i
 *   4+M+2i           Page i's content stream
 *   /Size            3 + M + 2P
 *
 * @param {{width:number, height:number, images?:Array<object>, pages?:Array<object>}} doc
 * @returns {Uint8Array}
 */
export function buildPdf(doc) {
  const images = doc.images || [];
  const pages = doc.pages || [];
  const m = images.length;
  const p = pages.length;
  if (!p) {
    // A zero-page PDF is invalid, and a viewer's error message would be the user's first hint
    // that the export was empty. The caller checks for an empty card list and says so properly.
    throw new RangeError("pdf.js: a PDF needs at least one page");
  }

  const imageObj = (i) => 3 + i;
  const pageObj = (i) => 3 + m + 2 * i;
  const contentsObj = (i) => 4 + m + 2 * i;
  const size = 3 + m + 2 * p;

  // Chunks plus a running byte counter. The counter is the ONLY source of an offset: reading it
  // immediately before writing "N 0 obj" is what keeps the xref honest no matter what the
  // chunks contain, whereas measuring a string's length would be a lie the moment anything
  // non-ASCII slipped through (it can't — see asciiBytes — but this way it wouldn't matter).
  const chunks = [];
  let at = 0;
  const push = (bytes) => {
    chunks.push(bytes);
    at += bytes.length;
  };
  const write = (str) => push(asciiBytes(str));

  const offsets = new Array(size).fill(0);
  const beginObject = (num) => {
    offsets[num] = at;
    write(`${num} 0 obj\n`);
  };

  // Header. The four bytes >= 0x80 on the second line are the convention that tells anything
  // transferring this file (an FTP client in ASCII mode, a mail gateway, a text editor that
  // helpfully rewrites line endings) that it is binary and must not be touched. They are written
  // as an explicit Uint8Array precisely because asciiBytes would — correctly — refuse them.
  write("%PDF-1.4\n");
  push(new Uint8Array([0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a]));

  beginObject(1);
  write("<< /Type /Catalog /Pages 2 0 R >>\nendobj\n");

  // /MediaBox lives here and is inherited. Putting it on the Pages node rather than repeating it
  // on every Page is not just tidiness: it makes "every page is the same size" true by
  // construction, which is the property the print-at-100% instruction depends on.
  beginObject(2);
  const kids = pages.map((_, i) => `${pageObj(i)} 0 R`).join(" ");
  write(
    `<< /Type /Pages /Count ${p} /Kids [ ${kids} ] ` +
    `/MediaBox [ 0 0 ${formatNumber(doc.width)} ${formatNumber(doc.height)} ] >>\nendobj\n`,
  );

  images.forEach((image, i) => {
    const bytes = imageBytes(image.bytes, i);
    beginObject(imageObj(i));
    write(
      `<< /Type /XObject /Subtype /Image ` +
      `/Width ${formatNumber(image.width)} /Height ${formatNumber(image.height)} ` +
      `/ColorSpace ${nameToken(image.colorSpace || DEFAULT_COLOR_SPACE)} ` +
      `/BitsPerComponent ${image.bits || DEFAULT_BITS} ` +
      `/Filter ${nameToken(image.filter || DEFAULT_FILTER)} ` +
      (image.decodeParms ? `/DecodeParms ${image.decodeParms} ` : "") +
      // /Length counts the bytes BETWEEN the \n that ends "stream" and the \n that precedes
      // "endstream" — exactly the payload, neither newline included. Get this wrong by one and
      // a JPEG decoder either starves or reads a stray byte as entropy data.
      `/Length ${bytes.length} >>\nstream\n`,
    );
    // Verbatim. Note what is NOT happening here: nothing searches the payload for "endstream" to
    // find where it ends. JPEG entropy-coded data is arbitrary bytes and can contain that exact
    // ASCII string, along with newlines and anything else; the only correct way to bound a
    // stream is the /Length arithmetic above. The test fixture contains the literal string on
    // purpose so that a searching implementation fails loudly.
    push(bytes);
    write("\nendstream\nendobj\n");
  });

  pages.forEach((page, i) => {
    // Only the images this page actually draws go in its /Resources. A card deck reuses art
    // across pages, so listing all M on every page would ask a viewer to resolve twenty
    // XObjects to render nine.
    const used = [...new Set((page.draws || []).map((d) => d.image))].sort((a, b) => a - b);
    for (const index of used) {
      if (!Number.isInteger(index) || index < 0 || index >= m) {
        throw new RangeError(`pdf.js: page ${i} draws image ${index}, but the document has ${m}`);
      }
    }
    const xobjects = used.map((index) => `/Im${index} ${imageObj(index)} 0 R`).join(" ");

    beginObject(pageObj(i));
    write(
      `<< /Type /Page /Parent 2 0 R ` +
      `/Resources << /XObject << ${xobjects} >> >> ` +
      `/Contents ${contentsObj(i)} 0 R >>\nendobj\n`,
    );

    const content = asciiBytes(pageContentStream(page));
    beginObject(contentsObj(i));
    write(`<< /Length ${content.length} >>\nstream\n`);
    push(content);
    write("\nendstream\nendobj\n");
  });

  // The xref table. Every entry is exactly 20 bytes — %010d SP %05d SP (n|f) CR LF — and a
  // reader is entitled to seek straight to entry k at xrefStart + header + 20k. A 19-byte entry
  // (LF alone, the tempting simplification) makes the whole table unreadable to anything that
  // does. Object 0 is the head of the free list and is always "0000000000 65535 f".
  const xrefAt = at;
  write(`xref\n0 ${size}\n`);
  write("0000000000 65535 f\r\n");
  for (let i = 1; i < size; i++) {
    write(`${String(offsets[i]).padStart(10, "0")} 00000 n\r\n`);
  }
  // No /Info and no /ID — see the header comment on determinism.
  write(`trailer\n<< /Size ${size} /Root 1 0 R >>\nstartxref\n${xrefAt}\n%%EOF\n`);

  const out = new Uint8Array(at);
  let cursor = 0;
  for (const chunk of chunks) {
    out.set(chunk, cursor);
    cursor += chunk.length;
  }
  return out;
}
