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
//
// KEEPING IT THAT WAY
//
// If you add markup built from a template literal, run any user text through escapeHtml()
// before interpolating it — or build the node and set .textContent, as most of the rendering
// code already does.
//
// The second line of defence is the Content-Security-Policy meta tag every page ships.
// `script-src 'self'` means no inline script runs, so an injected `<img onerror=...>` does
// nothing even if an escaping bug slips past. That only holds while the app itself has no
// inline script to allow: avoid inline `<script>`, `on*` handlers, and `style="..."`
// attributes, and wire everything with addEventListener and class names instead.

export function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
