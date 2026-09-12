import { renderCardArt } from "./shared/card-render.js";
import { escapeHtml } from "./shared/escape.js";
import { loadContent } from "./shared/content-load.js";
import { mountContentSettings } from "./shared/content-settings.js";
// Which cards this page shows, in what order, and what a tile needs to draw one — all of it over
// there, because app.js is imported by no test and that list is the page's one hard question.
// TYPES is imported rather than restated because the chips and the filter that answers them have to
// read the same vocabulary; SRD_DOMAINS is not imported at all, because the domain chips are
// domainsInPlay()'s answer (the ten, plus whatever a loaded source brought with it) and this page
// has no business holding a second copy of the ten.
import {
  TYPES,
  blankFilters,
  browseCards,
  cardView,
  domainCardsPdfFilename,
  domainsInPlay,
} from "./shared/card-browser.js";
import { cardDescriptor } from "./shared/card-sheet.js";
import { dateStamp, openProgressModal, runCardPdfExport } from "./shared/export-ui.js";

const MAX_LOADOUT = 5;
const STORAGE_KEY = "dh-card-builder-state-v1";

let content = null; // what loadContent() reported: which sources loaded, and which are switched off

const state = {
  cards: [],
  filters: blankFilters(),
  loadout: [], // array of card ids, max 5
  vault: [], // array of card ids
};

function loadPersisted() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    state.loadout = Array.isArray(parsed.loadout) ? parsed.loadout : [];
    state.vault = Array.isArray(parsed.vault) ? parsed.vault : [];
  } catch (err) {
    console.warn("Could not read saved state", err);
  }
}

function persist() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ loadout: state.loadout, vault: state.vault }));
}

async function loadCards() {
  content = await loadContent({ files: ["domain-cards"] });
  // The records WHOLE, exactly as loaded — not a copy with the handful of fields a tile happens to
  // draw. A copy drops `supersededBy`, and visibleRecords() reads that field to decide which of two
  // versions of one card is the live one; without it the browser showed all 399 records, i.e. every
  // card shared by SRD 1.0 and 2.0 twice (189 duplicate names), instead of the 231 that are really
  // in play. Flattening for display is cardView()'s job, per tile, at render time.
  //
  // The loadout and vault look cards up in this list by id, so it holds everything loaded. Only the
  // grid is filtered (renderGrid), which is what keeps a saved loadout intact when the source one of
  // its cards came from is switched off.
  state.cards = content.db.domainCards;
}

// The kinds this page browses. One today; a future ancestry or subclass browser adds an entry here
// and nothing else — the sort, the filters and the PDF all key off `kind` already.
const catalogue = () => [{ kind: "domain", records: state.cards }];

function buildChipGroup(container, values, activeSet, onToggle) {
  container.innerHTML = "";
  for (const value of values) {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "chip";
    chip.textContent = value.charAt(0) + value.slice(1).toLowerCase();
    chip.dataset.domain = value;
    chip.classList.toggle("active", activeSet.has(value));
    chip.addEventListener("click", () => {
      if (activeSet.has(value)) activeSet.delete(value);
      else activeSet.add(value);
      chip.classList.toggle("active");
      renderGrid();
    });
    container.appendChild(chip);
  }
}

function renderGrid() {
  const grid = document.getElementById("card-grid");
  const resultCount = document.getElementById("result-count");
  grid.innerHTML = "";

  // The same call the export makes, so the number under the filters and the number of cards in the
  // file are the same answer rather than two that agree today.
  const shown = browseCards(catalogue(), content.disabled, state.filters);
  resultCount.textContent = `${shown.length} cards`;
  // Nothing to print is a disabled button, not an export that opens a modal to say so.
  document.getElementById("export-cards-btn").disabled = shown.length === 0;

  for (const entry of shown) {
    // The flat shape the tile draws from: the records in state.cards are raw, so `record.name` is
    // still {"en-US": …} and interpolating one renders "[object Object]" without throwing.
    const card = cardView(entry);
    const el = document.createElement("article");
    el.className = "card";
    el.appendChild(renderCardArt({ ...card, domainClass: card.domain.toLowerCase() }));

    const meta = document.createElement("div");
    meta.className = "card-meta";
    meta.innerHTML = `<strong>${escapeHtml(card.name)}</strong><span>Lv ${escapeHtml(card.level)} · ${escapeHtml(card.domain)} · ${escapeHtml(card.type)}</span>`;
    el.appendChild(meta);

    const actions = document.createElement("div");
    actions.className = "card-actions";

    const inLoadout = state.loadout.includes(card.id);
    const inVault = state.vault.includes(card.id);

    const loadoutBtn = document.createElement("button");
    loadoutBtn.className = "btn-small";
    loadoutBtn.dataset.role = "loadout-btn";
    loadoutBtn.dataset.cardId = card.id;
    loadoutBtn.textContent = inLoadout ? "− Loadout" : "+ Loadout";
    loadoutBtn.disabled = !inLoadout && state.loadout.length >= MAX_LOADOUT;
    loadoutBtn.addEventListener("click", () => toggleLoadout(card.id));

    const vaultBtn = document.createElement("button");
    vaultBtn.className = "btn-small";
    vaultBtn.dataset.role = "vault-btn";
    vaultBtn.dataset.cardId = card.id;
    vaultBtn.textContent = inVault ? "− Vault" : "+ Vault";
    vaultBtn.addEventListener("click", () => toggleVault(card.id));

    actions.appendChild(loadoutBtn);
    actions.appendChild(vaultBtn);
    el.appendChild(actions);

    grid.appendChild(el);
  }
}

function toggleLoadout(id) {
  const idx = state.loadout.indexOf(id);
  if (idx >= 0) {
    state.loadout.splice(idx, 1);
  } else {
    if (state.loadout.length >= MAX_LOADOUT) return;
    state.loadout.push(id);
    const vIdx = state.vault.indexOf(id);
    if (vIdx >= 0) state.vault.splice(vIdx, 1);
  }
  persist();
  updateButtonStates();
  renderPanel();
}

function toggleVault(id) {
  const idx = state.vault.indexOf(id);
  if (idx >= 0) {
    state.vault.splice(idx, 1);
  } else {
    state.vault.push(id);
    const lIdx = state.loadout.indexOf(id);
    if (lIdx >= 0) state.loadout.splice(lIdx, 1);
  }
  persist();
  updateButtonStates();
  renderPanel();
}

function updateButtonStates() {
  const loadoutFull = state.loadout.length >= MAX_LOADOUT;
  document.querySelectorAll('[data-role="loadout-btn"]').forEach((btn) => {
    const id = btn.dataset.cardId;
    const inLoadout = state.loadout.includes(id);
    btn.textContent = inLoadout ? "− Loadout" : "+ Loadout";
    btn.disabled = !inLoadout && loadoutFull;
  });
  document.querySelectorAll('[data-role="vault-btn"]').forEach((btn) => {
    const id = btn.dataset.cardId;
    btn.textContent = state.vault.includes(id) ? "− Vault" : "+ Vault";
  });
}

// Deliberately state.cards and not browseCards(): the panel looks a saved id up in the UNFILTERED,
// UNSUPERSEDED list. Route it through the browse call and a card would drop out of your loadout the
// moment you ticked a domain chip, or the moment the source it came from was switched off.
function cardById(id) {
  return state.cards.find((c) => c.id === id);
}

// Raw records, so the name is still a locale map. Falls back to the bare id, which is what a
// loadout entry whose content source is missing has left to show.
function cardName(id) {
  const record = cardById(id);
  return record ? record.name["en-US"] : id;
}

function renderPanel() {
  const loadoutList = document.getElementById("loadout-slots");
  const vaultList = document.getElementById("vault-list");
  document.getElementById("loadout-count").textContent = `(${state.loadout.length}/${MAX_LOADOUT})`;
  document.getElementById("vault-count").textContent = `(${state.vault.length})`;

  loadoutList.innerHTML = "";
  for (let i = 0; i < MAX_LOADOUT; i++) {
    const li = document.createElement("li");
    const id = state.loadout[i];
    if (id) {
      li.textContent = cardName(id);
      li.className = "slot-filled";
      li.addEventListener("click", () => toggleLoadout(id));
    } else {
      li.textContent = "— empty —";
      li.className = "slot-empty";
    }
    loadoutList.appendChild(li);
  }

  vaultList.innerHTML = "";
  for (const id of state.vault) {
    const li = document.createElement("li");
    li.className = "slot-filled";
    li.textContent = cardName(id);
    li.addEventListener("click", () => toggleVault(id));
    vaultList.appendChild(li);
  }
}

function renderAll() {
  renderGrid();
  renderPanel();
}

// ---------- the PDF export ----------
//
// The same nine-to-a-page deck the character export prints (characters.js:1244), built from the
// browse list instead of from a character — which is the whole of the difference, because
// card-sheet.js's descriptor is a fact about a record and knows nothing about who owns it.

// Written once and used twice: buildDeckPdf() throws this when the deck is empty and
// runCardPdfExport() shows it when a render comes back with no cards, and the reader should not be
// able to tell which of those two happened by reading the modal.
const NOTHING_TO_PRINT = "No cards match these filters, so there is nothing to print.";

async function openCardsPdfModal() {
  // Capture what is shown SYNCHRONOUSLY, before the modal opens: the render takes seconds and a
  // filter change mid-flight must not shift the deck under it. The filters are copied for the same
  // reason — the filename names the chosen domain, and state.filters.domains is a live Set.
  const entries = browseCards(catalogue(), content.disabled, state.filters);
  const filters = { ...state.filters, domains: new Set(state.filters.domains) };
  const hint = "The cards this page is showing, in the order it shows them — nine to a US Letter " +
    "page with crop marks.";
  const { body, bar, line } = openProgressModal("Export cards (PDF)", hint, "Reading the cards…");
  runCardPdfExport({
    body,
    bar,
    line,
    build: async (opts) => {
      // Fetched on click, not on load: card-pdf.js drags card-content.js and its whole rules graph
      // (~160KB) for the two GENERATED cards, and this deck has none — it is all domain cards. The
      // first frame of the modal covers the fetch, and a failed one lands in the error box rather
      // than as an unhandled rejection.
      const { buildDeckPdf } = await import("./card-pdf.js");
      // The `ctx` argument is ignored: nothing here needs measuring, because no card in this deck
      // is generated from prose.
      return buildDeckPdf(() => ({ cards: entries.map(cardDescriptor) }), {
        ...opts,
        emptyMessage: NOTHING_TO_PRINT,
      });
    },
    // A thunk, not a string: the name carries today's date, so it is answered when the render
    // finishes rather than when it starts.
    filename: () => domainCardsPdfFilename(filters, dateStamp()),
    empty: NOTHING_TO_PRINT,
  });
}

function setupFilters() {
  buildChipGroup(
    document.getElementById("domain-filters"),
    domainsInPlay(state.cards, content.disabled),
    state.filters.domains,
  );
  buildChipGroup(document.getElementById("type-filters"), TYPES, state.filters.types);

  document.getElementById("level-min").addEventListener("input", (e) => {
    state.filters.levelMin = Number(e.target.value) || 1;
    renderGrid();
  });
  document.getElementById("level-max").addEventListener("input", (e) => {
    state.filters.levelMax = Number(e.target.value) || 10;
    renderGrid();
  });
  document.getElementById("search").addEventListener("input", (e) => {
    state.filters.search = e.target.value.trim().toLowerCase();
    renderGrid();
  });
  document.getElementById("reset-filters").addEventListener("click", () => {
    // One statement of "no filters", shared with the page's opening state, rather than five
    // assignments here that a sixth filter would quietly not be added to.
    state.filters = blankFilters();
    document.getElementById("level-min").value = 1;
    document.getElementById("level-max").value = 10;
    document.getElementById("search").value = "";
    setupFilters();
    renderGrid();
  });
  document.getElementById("clear-loadout").addEventListener("click", () => {
    state.loadout = [];
    state.vault = [];
    persist();
    renderAll();
  });
}

async function init() {
  loadPersisted();
  await loadCards();
  mountContentSettings(content);
  // Bound here rather than in setupFilters(), which Reset calls again: a second listener on this
  // button would open two modals and render the deck twice.
  document.getElementById("export-cards-btn").addEventListener("click", openCardsPdfModal);
  setupFilters();
  renderAll();
}

init();
