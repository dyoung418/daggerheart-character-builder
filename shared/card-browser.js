// What the card browser is showing, as a pure function of the content and the filter state.
//
// This is the page's one hard question — "which cards, in what order" — and it lives here rather
// than in app.js because app.js is imported by no test. The browser renders this list and the PDF
// export prints it, from the SAME call, so the count on the page and the deck in the file cannot
// disagree.
//
// Today the catalogue holds one kind. The shapes below are sized for more: a browse entry is
// {kind, record} rather than a bare record, because one subclass record yields up to three card
// faces (foundation/specialization/mastery) with three art files, and a bare record cannot say
// which of them it is.
import { cardDescriptor, comparatorFor } from "./card-sheet.js";
import { visibleRecords } from "./content-sources.js";
import { fileSlug } from "./text.js";

// The ten SRD domains, in the order the book lists them — nine from the core SRD plus DREAD, which
// arrived with the Hope & Fear release of the dataset and is SRD content like the rest. Not the
// whole list: content sources may bring their own, so the chips are these plus whatever else turns
// up in the cards actually loaded. A domain with no CSS rule of its own simply gets the default
// card border, which is fine; a domain with no CHIP would be unfilterable, and worse, ticking any
// other chip would hide its cards with no way to bring them back.
export const SRD_DOMAINS = ["ARCANA", "BLADE", "BONE", "CODEX", "DREAD", "GRACE", "MIDNIGHT", "SAGE", "SPLENDOR", "VALOR"];
export const TYPES = ["ABILITY", "SPELL", "GRIMOIRE"];

/** One definition of "no filters", so page state and the Reset button cannot drift apart. */
export function blankFilters() {
  return { domains: new Set(), types: new Set(), levelMin: 1, levelMax: 10, search: "" };
}

// A description block is a paragraph or a bullet list; either way, the words. Deliberately its own
// flattener rather than a fifth caller of one of the typed walkers (card-sheet.js:61,
// card-render.js:116, sheet-data.js:84, effects.js:955): those build display objects, HTML and
// bullet-prefixed lines, and a haystack wants none of that — just text to match against.
function blockWords(block) {
  if (block?.paragraph) return block.paragraph["en-US"] || "";
  if (Array.isArray(block?.list)) return block.list.map((i) => i?.["en-US"] || "").join(" ");
  return "";
}

/** Everything about a card a search should look at: its name and its rules text. */
export function cardSearchText(record) {
  const parts = [record?.name?.["en-US"] || ""];
  for (const feature of record?.features || []) {
    // A feature's name is localized like every other name — `f.name?.["en-US"] || ""`, the same
    // read card-sheet.js:58 and card-render.js:99 make. Taking `f.name` raw puts "[object Object]"
    // in the haystack, which is how the bug this search replaces went unnoticed.
    parts.push(feature?.name?.["en-US"] || "");
    for (const block of feature?.description || []) parts.push(blockWords(block));
  }
  return parts.join(" ").toLowerCase();
}

/**
 * Does one card answer the filters as they stand?
 *
 * Domain, type and level are asked only of the kind that HAS them. A future ancestry or subclass
 * card ignores all three rather than being excluded by them — whether a kind appears at all is the
 * kind filter's question to answer, not this one's.
 */
export function cardMatchesFilters(entry, filters) {
  const f = filters || blankFilters();
  const { kind, record } = entry;

  if (kind === "domain") {
    // An empty set means "every domain", not "no domains" — the chips start empty and the page
    // must open showing everything.
    if (f.domains.size > 0 && !f.domains.has(record.domain)) return false;
    if (f.types.size > 0 && !f.types.has(record.type)) return false;
    if (record.level < f.levelMin || record.level > f.levelMax) return false;
  }

  // The box says "Search by name or text", so it searches both.
  if (f.search && !cardSearchText(record).includes(f.search)) return false;
  return true;
}

/**
 * The cards on the page, in the order they are on the page.
 *
 * @param {Array<{kind: string, records: object[]}>} catalogue one entry per card kind, in the
 *   order the kinds should stack — the same reading the printed deck gets from card-sheet.js.
 * @param {Set<string>} disabled content sources the reader has switched off.
 * @returns {Array<{kind: string, record: object}>}
 */
export function browseCards(catalogue, disabled, filters) {
  return (catalogue || []).flatMap(({ kind, records }) => {
    const compare = comparatorFor(kind);
    // visibleRecords() FIRST, and on the raw records: it is what enforces the supersession rules —
    // SRD 2.0 over SRD 1.0, a homebrew source over either, and the earlier record coming back when
    // the one that beat it is switched off. It reads `supersededBy`, so anything that copies a
    // record field by field before this point silently prints every shared card twice.
    return visibleRecords(records, disabled)
      .map((record) => ({ kind, record }))
      .filter((entry) => cardMatchesFilters(entry, filters))
      .sort((a, b) => compare(a.record, b.record));
  });
}

/** The ten, plus any domain a loaded card brought with it. */
export function domainsInPlay(records, disabled) {
  const extra = [...new Set(visibleRecords(records, disabled).map((r) => r.domain))]
    .filter((d) => d && !SRD_DOMAINS.includes(d));
  return [...SRD_DOMAINS, ...extra.sort()];
}

/**
 * The flat shape the grid tiles render from. The art path comes from the card's own descriptor
 * rather than from a second lookup here, so the picture on the page and the picture in the PDF can
 * never be two different files.
 */
export function cardView(entry) {
  const { record } = entry;
  return {
    id: record.id,
    name: record.name["en-US"],
    domain: record.domain,
    type: record.type,
    level: record.level,
    recallCost: record.recallCost,
    features: record.features,
    art: cardDescriptor(entry).art,
  };
}

/**
 * `daggerheart-domain-cards[-<domain>]-<YYYY-MM-DD>.pdf`.
 *
 * The stem is its own, not the character export's `daggerheart-cards-<slug>-<date>.pdf`: a
 * character named "Dread" would otherwise land on exactly the same filename, in the same download
 * folder, on the same day.
 *
 * Only the domain is named, and only when exactly one is chosen. Levels, types and the search box
 * are left out on purpose — a filename is a label, not a query, and the modal already prints the
 * count the file actually contains.
 */
export function domainCardsPdfFilename(filters, stamp) {
  const chosen = [...(filters?.domains || [])];
  const only = chosen.length === 1 ? fileSlug(chosen[0], "") : "";
  return `daggerheart-domain-cards${only ? `-${only}` : ""}-${stamp}.pdf`;
}
