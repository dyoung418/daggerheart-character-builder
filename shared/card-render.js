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
export function renderCardArt(card) {
  const wrap = document.createElement("div");
  wrap.className = "card-art" + (card.domainClass ? ` domain-${card.domainClass}` : "");

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

// Feature markup for the CSS-only fallback, shared by domain cards, subclasses,
// ancestries and communities: they all share the same shape { name, description: [{paragraph}] }.
// Name and body stay separate elements (not one flattened string) so the fallback can
// give them distinct typography (name stands out, body stays readable).
function featuresHtml(features) {
  return (features || [])
    .map((f) => {
      const name = f.name?.["en-US"] || "";
      const desc = (f.description || []).map((d) => d.paragraph?.["en-US"] || "").join(" ");
      return `
        <div class="fallback-feature">
          ${name ? `<span class="fallback-feature-name">${escapeHtml(name)}</span>` : ""}
          <p class="fallback-feature-desc">${escapeHtml(desc)}</p>
        </div>
      `;
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
