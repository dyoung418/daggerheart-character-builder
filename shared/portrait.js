// The character's portrait: a picture chosen on the device, shrunk here and kept with the
// character as a data URL. There is no server to upload to, so size is the whole problem —
// every character lives in one localStorage key, together, under a few megabytes.
//
// Pure functions first, the canvas work at the bottom (that one needs a browser).
// characters.js is the only page that sets a portrait; play.js only shows it.

export const MAX_EDGE = 512;      // longest side, in px
export const MAX_BYTES = 120_000; // length of the data URL string, ~120 KB

// SVG is deliberately not here: it can carry script, and an <img> is not a safe place for it.
const ALLOWED = ["image/webp", "image/jpeg", "image/png"];

// Fit inside a maxEdge square, keeping the aspect ratio. Never enlarges: a picture already
// smaller than the box is left as it is rather than blown up into mush.
export function fitWithin(width, height, maxEdge = MAX_EDGE) {
  const longest = Math.max(width, height);
  if (!(longest > 0)) return { width: 0, height: 0 };
  const scale = Math.min(1, maxEdge / longest);
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

export function isPortrait(value) {
  if (typeof value !== "string" || value.length > MAX_BYTES) return false;
  return ALLOWED.some((mime) => value.startsWith(`data:${mime};base64,`));
}

// The app's own encoder never writes more than MAX_EDGE, but an imported file can say anything.
// A picture that decodes to tens of thousands of pixels a side is small on disk and ruinous in
// memory, so the size is read from the header before the data URL ever reaches an <img>.
export const MAX_DECODED_EDGE = 2048;

// Only the start of the data URL is ever decoded — enough for the header, never the whole
// picture. atob needs whole base64 quartets; padding ('=') only ever appears at the very end
// of the full string, so a prefix cut on a 4-character boundary that stops before the end is
// always clean data with nothing to pad.
function decodeBase64Prefix(base64, maxBytes) {
  const wanted = Math.ceil((maxBytes * 4) / 3);
  const rounded = wanted + ((4 - (wanted % 4)) % 4);
  const slice = base64.length <= rounded ? base64 : base64.slice(0, rounded);
  try {
    const binary = atob(slice);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  } catch {
    return null;
  }
}

function readU32BE(bytes, offset) {
  return ((bytes[offset] << 24) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3]) >>> 0;
}
function readU16LE(bytes, offset) {
  return bytes[offset] | (bytes[offset + 1] << 8);
}
function readU32LE(bytes, offset) {
  return (bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24)) >>> 0;
}
function read24LE(bytes, offset) {
  return bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16);
}
function matchAscii(bytes, offset, text) {
  for (let i = 0; i < text.length; i++) if (bytes[offset + i] !== text.charCodeAt(i)) return false;
  return true;
}

// PNG: an 8-byte signature, then the IHDR chunk — 4-byte length, 4-byte "IHDR", then width and
// height as 4-byte big-endian integers. Always the first chunk (the spec requires it), so no
// scanning is needed.
function pngSize(bytes) {
  if (!bytes || bytes.length < 24) return null;
  if (!matchAscii(bytes, 0, "\x89PNG\r\n\x1a\n")) return null;
  const width = readU32BE(bytes, 16);
  const height = readU32BE(bytes, 20);
  return width > 0 && height > 0 ? { width, height } : null;
}

// JPEG: SOI, then a run of segments (APPn, DQT, DHT, ...) until an SOF marker — the frame
// header, precision + height + width + component count. Everything before it has to be walked
// past using each segment's own length, because there's no fixed offset to jump to.
function jpegSize(bytes) {
  if (!bytes || bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  let pos = 2;
  while (pos + 1 < bytes.length) {
    if (bytes[pos] !== 0xff) return null; // lost sync — not a segment boundary
    let mpos = pos + 1;
    while (mpos < bytes.length && bytes[mpos] === 0xff) mpos++; // fill bytes before the marker
    if (mpos >= bytes.length) return null;
    const marker = bytes[mpos];
    pos = mpos + 1;

    // Markers with no length field: RST0-RST7, TEM, and the standalone SOI/EOI.
    if (marker === 0xd8 || marker === 0xd9 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (pos + 1 >= bytes.length) return null;

    const isSOF = (marker >= 0xc0 && marker <= 0xc3) || (marker >= 0xc5 && marker <= 0xc7) ||
      (marker >= 0xc9 && marker <= 0xcb) || (marker >= 0xcd && marker <= 0xcf);
    if (isSOF) {
      const p = pos + 2; // past the segment's own length field, at the precision byte
      if (p + 4 >= bytes.length) return null;
      const height = (bytes[p + 1] << 8) | bytes[p + 2];
      const width = (bytes[p + 3] << 8) | bytes[p + 4];
      return width > 0 && height > 0 ? { width, height } : null;
    }
    const length = (bytes[pos] << 8) | bytes[pos + 1];
    if (length < 2) return null; // malformed — would spin in place
    pos += length;
  }
  return null;
}

// WebP: RIFF/WEBP, then one chunk. Lossy (VP8 ) hides width/height in the frame tag after a
// fixed start code; lossless (VP8L) packs them into one 32-bit field; extended (VP8X) — used
// whenever the file carries metadata, animation or alpha on top of the encoded frame — states
// the canvas size directly, one less than the real value in each direction.
function webpSize(bytes) {
  if (!bytes || bytes.length < 21) return null;
  if (!matchAscii(bytes, 0, "RIFF") || !matchAscii(bytes, 8, "WEBP")) return null;

  if (matchAscii(bytes, 12, "VP8 ")) {
    if (bytes.length < 30) return null;
    if (bytes[23] !== 0x9d || bytes[24] !== 0x01 || bytes[25] !== 0x2a) return null;
    const width = readU16LE(bytes, 26) & 0x3fff;
    const height = readU16LE(bytes, 28) & 0x3fff;
    return width > 0 && height > 0 ? { width, height } : null;
  }
  if (matchAscii(bytes, 12, "VP8L")) {
    if (bytes.length < 25 || bytes[20] !== 0x2f) return null;
    const bits = readU32LE(bytes, 21);
    const width = (bits & 0x3fff) + 1;
    const height = ((bits >>> 14) & 0x3fff) + 1;
    return { width, height };
  }
  if (matchAscii(bytes, 12, "VP8X")) {
    if (bytes.length < 30) return null;
    const width = read24LE(bytes, 24) + 1;
    const height = read24LE(bytes, 27) + 1;
    return { width, height };
  }
  return null;
}

// { width, height } from the header of a PNG, JPEG or WebP data URL, or null when the bytes
// don't say. Null means "can't tell", not "too big": an unreadable header is a picture the
// decoder will refuse anyway, and failing closed here would drop honest files.
export function decodedSize(dataUrl) {
  if (typeof dataUrl !== "string") return null;
  const comma = dataUrl.indexOf(",");
  if (comma < 0) return null;
  const base64 = dataUrl.slice(comma + 1);

  if (dataUrl.startsWith("data:image/png;base64,")) return pngSize(decodeBase64Prefix(base64, 1024));
  // JPEG can carry a few KB of EXIF/thumbnail/quantization data before the frame header, so it
  // gets a bigger allowance than the other two formats before giving up.
  if (dataUrl.startsWith("data:image/jpeg;base64,")) return jpegSize(decodeBase64Prefix(base64, 4096));
  if (dataUrl.startsWith("data:image/webp;base64,")) return webpSize(decodeBase64Prefix(base64, 1024));
  return null;
}

export function sanitizePortrait(value) {
  if (!isPortrait(value)) return null;
  const size = decodedSize(value);
  if (size && (size.width > MAX_DECODED_EDGE || size.height > MAX_DECODED_EDGE)) return null;
  return value;
}

// ---------- the part that needs a browser ----------

// A File from <input type="file"> → a data URL small enough to save. Two quality passes and
// no more: if 0.6 still doesn't fit, the picture is refused out loud instead of silently
// eating everyone else's storage.
export async function encodePortrait(file, { maxEdge = MAX_EDGE, maxBytes = MAX_BYTES } = {}) {
  const bitmap = await createImageBitmap(file);
  const { width, height } = fitWithin(bitmap.width, bitmap.height, maxEdge);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  canvas.getContext("2d").drawImage(bitmap, 0, 0, width, height);
  bitmap.close?.();

  for (const quality of [0.8, 0.6]) {
    let url = canvas.toDataURL("image/webp", quality);
    // A browser that can't write WebP quietly hands back a PNG, which is far bigger: ask for
    // JPEG instead rather than saving the PNG.
    if (!url.startsWith("data:image/webp")) url = canvas.toDataURL("image/jpeg", quality);
    if (url.length <= maxBytes && isPortrait(url)) return url;
  }
  throw new Error("too-big");
}
