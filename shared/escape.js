// HTML escaping for values interpolated into innerHTML template literals.
//
// Most of this app builds DOM nodes and assigns .textContent, which is safe. But a
// number of places assemble markup with template literals, and some of the values
// interpolated there are free text the user typed (character name, pronouns,
// Experience names, background/appearance notes, connections). Without escaping,
// typing `<img src=x onerror=...>` into any of those fields stores markup that runs
// as script every time the character is rendered.
//
// escapeHtml() covers both interpolation contexts used here: element content
// (`<strong>${...}</strong>`) and quoted attribute values (`value="${...}"`).
// It is NOT sufficient for unquoted attributes, URLs, or inline event handlers —
// none of which this app generates.

export function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
