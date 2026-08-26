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

export function sanitizePortrait(value) {
  return isPortrait(value) ? value : null;
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
