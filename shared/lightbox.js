// Shared lightbox: double-click a card art to open it at full resolution.
// A single overlay is created lazily and reused by every page.

let overlay = null;
let imgEl = null;
let captionEl = null;

function ensureOverlay() {
  if (overlay) return;
  overlay = document.createElement("div");
  overlay.className = "lightbox-overlay";
  overlay.innerHTML = `
    <button class="lightbox-close" aria-label="Close">×</button>
    <img class="lightbox-img" alt="" />
    <div class="lightbox-caption"></div>
  `;
  imgEl = overlay.querySelector(".lightbox-img");
  captionEl = overlay.querySelector(".lightbox-caption");

  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) closeLightbox();
  });
  overlay.querySelector(".lightbox-close").addEventListener("click", closeLightbox);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && overlay.classList.contains("open")) closeLightbox();
  });

  document.body.appendChild(overlay);
}

export function openLightbox(src, caption) {
  ensureOverlay();
  imgEl.src = src;
  imgEl.alt = caption || "";
  captionEl.textContent = caption || "";
  overlay.classList.add("open");
}

export function closeLightbox() {
  if (overlay) overlay.classList.remove("open");
}
