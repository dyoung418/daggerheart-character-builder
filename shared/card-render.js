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

// Art lives with the content it belongs to: data/<source>/card-art/. These take the RECORD rather
// than its id, because the id alone can't say which folder to look in.
//
// There is deliberately no fallback to the SRD's art when a source ships none. These files are
// whole card faces lifted from the PDF, rules text included — so showing the SRD image for a
// revised card would print superseded text as an unselectable picture while the app applied the
// new record. The CSS fallback card below prints the revised text instead, which is plainer and
// correct. When you do want the old art on a reprint, copy the file into the source's folder.
function artRoot(record) {
  return `data/${record?.contentSource || "srd"}/card-art`;
}

export function domainCardArtPath(card) {
  return `${artRoot(card)}/domain/${card?.id}.png`;
}
export function subclassCardArtPath(subclass, tier) {
  return `${artRoot(subclass)}/subclass/${subclass?.id}-${tier}.png`;
}
export function communityCardArtPath(community) {
  return `${artRoot(community)}/community/${community?.id}.png`;
}
export function ancestryCardArtPath(ancestry) {
  return `${artRoot(ancestry)}/ancestry/${ancestry?.id}.png`;
}
// No srd/ equivalent to fall back to even in principle: the SRD has no transformations at all.
export function transformationCardArtPath(transformation) {
  return `${artRoot(transformation)}/transformation/${transformation?.id}.png`;
}
