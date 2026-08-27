// Shared rendering of a "card" (real art extracted from the PDF, with a CSS-only
// fallback if the file is missing). Used by index.html (domain cards), create.html
// and characters.html (subclass/ancestry/community/domain cards).
//
// This public release does not ship card-art images (see README: it's proprietary
// Darrington Press art, not covered by the DPCGL). Every card gracefully falls back
// to the CSS-only rendering below unless you supply your own data/card-art/ folder.

import { openLightbox } from "./lightbox.js";
import { escapeHtml } from "./escape.js";

/**
 * @param {{ art: string, domainClass?: string, level?: number|string, type?: string, name: string, features?: Array<{name: {"en-US": string}, description: Array<{paragraph: {"en-US": string}}>}> }} card
 * @returns {HTMLDivElement}
 */
// Rendered art is kept and reused instead of rebuilt.
//
// The wizard rebuilds its whole step on every pick (create.js: `panel.innerHTML = ""`), so
// picking an ancestry threw away 39 <img> elements and made 39 new ones. Measured right after
// such a rebuild: 2 of 39 images had pixels. The other 37 were blank until they decoded again
// — from cache, but a decode is still a frame or two, and 37 of them at once is a flash across
// the whole grid. That is the flicker you see when you choose anything.
//
// Moving an element that is already loaded costs nothing: no request, no decode, no blank
// frame. So each card's node is built once and handed back on later calls.
//
// `isConnected` is the guard that makes this safe: a node still in the document is in use, so
// that call gets a fresh one rather than having its node stolen. During a wizard rebuild every
// old node has just been detached, which is exactly when reuse is both safe and wanted.
//
// The map grows to the number of distinct cards ever rendered — a few hundred at most, and
// keeping them decoded is the point, not a leak.
const renderedArt = new Map();

export function renderCardArt(card) {
  const key = card.art || card.name;
  const kept = renderedArt.get(key);
  if (kept && !kept.isConnected) return kept;

  const wrap = document.createElement("div");
  wrap.className = "card-art" + (card.domainClass ? ` domain-${card.domainClass}` : "");
  if (!kept) renderedArt.set(key, wrap);

  const img = document.createElement("img");
  img.loading = "lazy";
  img.alt = card.name;
  img.src = card.art;
  img.title = "Double-click to zoom";
  img.addEventListener("dblclick", (e) => {
    e.stopPropagation();
    openLightbox(card.art, card.name);
  });
  img.addEventListener("error", () => {
    wrap.classList.add("art-missing");
    img.remove();
    const fallback = document.createElement("div");
    fallback.className = "card-fallback";
    fallback.innerHTML = `
      <div class="fallback-header">
        <span class="fallback-level">${escapeHtml(card.level ?? "")}</span>
        <span class="fallback-type">${escapeHtml(card.type ?? "")}</span>
      </div>
      <div class="fallback-title">${escapeHtml(card.name)}</div>
      <div class="fallback-features">${featuresHtml(card.features)}</div>
    `;
    wrap.appendChild(fallback);
  });
  wrap.appendChild(img);
  return wrap;
}

// Feature markup, shared by domain cards, subclasses, ancestries, communities and classes:
// they all share the same shape { name, description: [{paragraph}] }.
// Name and body stay separate elements (not one flattened string) so they can be given
// distinct typography (name stands out, body stays readable).
//
// The fallback-* class names are historical — this markup started life inside the
// missing-art fallback card — but it's the app's only feature-text rendering, and the class
// detail card uses it too.
export function featuresHtml(features) {
  return (features || [])
    .map((f) => {
      const name = f.name?.["en-US"] || "";
      return `
        <div class="fallback-feature">
          ${name ? `<span class="fallback-feature-name">${escapeHtml(name)}</span>` : ""}
          ${descriptionHtml(f.description)}
        </div>
      `;
    })
    .join("");
}

// A description is a sequence of items, most of them paragraphs but some of them bulleted
// lists (e.g. the elements a Warden of the Elements can Channel). Each item keeps its own
// element, so paragraphs don't run together and list items don't vanish.
export function descriptionHtml(description) {
  return (description || [])
    .map((d) => {
      if (d.paragraph) return `<p class="fallback-feature-desc">${escapeHtml(d.paragraph["en-US"] || "")}</p>`;
      if (Array.isArray(d.list)) {
        return `<ul class="fallback-feature-list">${d.list.map((item) => `<li>${escapeHtml(item?.["en-US"] || "")}</li>`).join("")}</ul>`;
      }
      return "";
    })
    .join("");
}

export function domainCardArtPath(id) {
  return `data/card-art/domain/${id}.png`;
}
export function subclassCardArtPath(id, tier) {
  return `data/card-art/subclass/${id}-${tier}.png`;
}
export function communityCardArtPath(id) {
  return `data/card-art/community/${id}.png`;
}
export function ancestryCardArtPath(id) {
  return `data/card-art/ancestry/${id}.png`;
}
