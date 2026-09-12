// Which cards a character owns, and the order they come off the printer.
//
// The PDF export tiles one card per 180x252pt slot, nine to a page, in whatever order this
// function returns — so the deck order IS this file, and nothing downstream re-sorts it. Keeping
// it here rather than inside the fetch-and-canvas code (card-pdf.js) is what makes the order
// assertable in tests/: a descriptor is plain data, and every rule about which cards a character
// has is a rule about records, not about pixels.
//
// Steps 1-6 below match the detail view's card strip (characters.js:557-590) on purpose, so the
// stack you cut out sits in the same order as the screen you built it on.
//
// WHY THE GENERATED CARDS ARE PASSED IN
// -------------------------------------
// The stats card and the class-features cards have no record behind them; they're composed from
// derived stats and feature prose by shared/card-content.js. Building them here would make this
// module depend on that one — and on deriveSheet(), and so on derived-stats.js and effects.js —
// for a job that is only ever "name the cards". Inverted, the dependency runs the other way: the
// caller builds the generated cards and hands them over, this file decides where they sit. The
// tests can then pass two-field fakes and still assert the whole deck order, which is the part
// that breaks.
//
// Deliberately free of DOM, fetch and storage. shared/card-render.js is imported for its five art
// path builders only; that module's renderCardArt() touches the DOM, but importing it does not —
// it and its own imports (lightbox.js, escape.js) declare functions at module scope and nothing
// else, so this stays loadable outside a browser.

import { SUBCLASS_TIER_LABELS, subclassTiersUpTo } from "./advancement.js";
import {
  ancestryCardArtPath,
  communityCardArtPath,
  domainCardArtPath,
  subclassCardArtPath,
  transformationCardArtPath,
} from "./card-render.js";
import { unresolvedReferences } from "./content-sources.js";
import { UNARMED, UNARMORED } from "./gear.js";
import { titleCase } from "./text.js";

function find(list, id) {
  return id ? (list || []).find((r) => r.id === id) || null : null;
}

function name(record) {
  return record?.name?.["en-US"] || "";
}

// A record's features as CardContent sections: name, then the description blocks in source order.
//
// This is a second copy of the flatten in sheet-data.js (`features()`, exported there as
// flattenFeatures) and it stays a copy for two reasons. It emits the `blocks` key the card
// contract names rather than that one's `description`, so a caller would have to rewrite the
// shape anyway; and importing sheet-data.js would drag deriveSheet's whole graph — derived-stats,
// effects, gear formatting — into a module whose entire job is naming cards. If the two ever
// disagree it will be about a THIRD block type, and the fix is to add it in both places: dropping
// an unknown block silently (as both do) is what keeps a new content shape from throwing here.
function sections(features) {
  return (features || []).filter(Boolean).map((f) => ({
    name: f.name?.["en-US"] || "",
    blocks: (f.description || [])
      .map((d) => {
        if (d.paragraph) return { type: "paragraph", text: d.paragraph["en-US"] || "" };
        if (Array.isArray(d.list)) return { type: "list", items: d.list.map((item) => item?.["en-US"] || "") };
        return null;
      })
      .filter(Boolean),
  }));
}

// Every record-backed card carries the text of its own face, drawn when the art 404s. It is not
// optional polish: .gitignore excludes data/*/card-art/, so a clean checkout has no art at all and
// the fallback IS the deck. Same reasoning as card-render.js's CSS fallback, and deliberately the
// same information, so a printed card and an on-screen one say the same thing.
function fallback(title, subtitle, features, footer = "") {
  return { title, subtitle, sections: sections(features), footer };
}

// Level / type / recall, the three things the printed domain card puts outside its rules text.
//
// Recall cost is tested with == null, never for truthiness: 0 is a real and common cost (every
// Level 1 card in the SRD has one), and `if (card.recallCost)` would print those as having no
// cost at all — the same trap card-render.js:44 documents.
function domainCardSubtitle(card) {
  const parts = [`Level ${card.level ?? "—"} ${titleCase(card.type)}`.trim()];
  if (card.recallCost != null) parts.push(`Recall ${card.recallCost}`);
  return parts.join(" · ");
}

// Plain code-unit ordering, not localeCompare(): collation is locale-dependent, so the same
// character exported on two browsers would come out in two different orders, and the diff would be
// invisible to a test running in one locale. The deck has to be reproducible before it has to be
// linguistically perfect.
function compareText(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}

// Domain, then level, then name — how you'd sort them on the table, and how you'd find one again
// in a stack of twenty. The final id tiebreak is what makes it TOTAL: without it, two same-named
// cards from two sources would fall back on the character's stored order, which changes every time
// they move a card to the vault, so the same character would export two different decks.
export function compareDomainCards(a, b) {
  return compareText(titleCase(a.domain), titleCase(b.domain))
    || (a.level || 0) - (b.level || 0)
    || compareText(name(a), name(b))
    || compareText(a.id, b.id);
}

/**
 * The comparator a browsable list of `kind` should stack itself with.
 *
 * One real branch today, because domain cards are the only kind anything browses — but a list of
 * cards belonging to no character has to sort itself somehow, and "somehow" is a per-kind answer
 * (domain cards want domain/level/name; an ancestry browser would want plain name). Naming the
 * choice here means the future ancestry or subclass browser adds a branch instead of inventing a
 * second sort order next to this one, which is how the deck and the browser would drift apart.
 *
 * @param {string} kind a CardDescriptor kind.
 * @returns {(a: object, b: object) => number} a comparator over RECORDS, not descriptors.
 */
export function comparatorFor(kind) {
  if (kind === "domain") return compareDomainCards;
  return (a, b) => compareText(name(a), name(b)) || compareText(a.id, b.id);
}

/**
 * @param {object} character a stored character; drafts are fine, and print what they have.
 * @param {object} db the merged content database.
 * @param {CardDescriptor[]} opts.generated the stats and class cards, already built, which lead
 *   the deck so page 1 top-left is always the stats card.
 * @returns {{cards: CardDescriptor[], missing: Array<{kind: string, id: string}>}}
 */
export function cardSheet(character, db, { generated = [] } = {}) {
  const cards = [...generated];

  // Every subclass card the character has, not just the newest: an upgrade ADDS a card, it doesn't
  // replace the one below it, and the earlier tiers' features are still in play.
  const sub = find(db?.subclasses, character?.subclassId);
  for (const tier of sub ? subclassTiersUpTo(character?.subclassTier) : []) {
    cards.push(cardDescriptor({ kind: "subclass", record: sub, tier, origin: "class" }));
  }

  // The multiclass's own ladder, read from its own stored tier. A subclass upgrade at level-up can
  // name EITHER subclass, so a Mastery character can be carrying a Foundation multiclass — these
  // two loops must never share a variable, and there is a test that says so.
  const mcSub = find(db?.subclasses, character?.multiclass?.subclassId);
  for (const tier of mcSub ? subclassTiersUpTo(character?.multiclass?.tier || "foundation") : []) {
    cards.push(cardDescriptor({ kind: "subclass", record: mcSub, tier, origin: "multiclass" }));
  }

  const community = find(db?.communities, character?.heritage?.communityId);
  if (community) cards.push(cardDescriptor({ kind: "community", record: community }));

  // A mixed ancestry yields TWO full ancestry cards, in the order the character stores them. There
  // is no composite art to print — the mix is a pick of one feature from each — so the deck shows
  // both faces and the player reads their own two chosen features off them, mirroring
  // characters.js:576-579.
  for (const ancestryId of character?.heritage?.ancestryIds || []) {
    const ancestry = find(db?.ancestries, ancestryId);
    if (!ancestry) continue;
    cards.push(cardDescriptor({ kind: "ancestry", record: ancestry }));
  }

  // With the ancestry cards, which is where the rules put it: a transformation joins the loadout
  // "as if it were part of your character's ancestry". Usually null — the SRD ships none.
  const transformation = find(db?.transformations, character?.transformationId);
  if (transformation) cards.push(cardDescriptor({ kind: "transformation", record: transformation }));

  // Every card owned, loadout AND vault: you print once and then own the paper, so a deck that
  // only held the current five would need reprinting every time the player swapped a card in.
  for (const card of (character?.domainCardIds || [])
    .map((id) => find(db?.domainCards, id))
    .filter(Boolean)
    .sort(compareDomainCards)) {
    cards.push(cardDescriptor({ kind: "domain", record: card }));
  }

  return {
    cards,
    // Ids resolving to nothing are skipped above rather than drawn as blanks — a blank card in a
    // printed deck is indistinguishable from a printer fault — so this is the only place the
    // export can admit something was dropped, and the modal prints it.
    //
    // includeAllCards is required: the default checks only the two cards taken at creation, and
    // this deck prints the vault too. The whole report is passed through unfiltered even though
    // some kinds (weapon, armor, class) have no card of their own, because they aren't noise here
    // — those are exactly the records the GENERATED stats and class cards were built from, so a
    // missing weapon means the stats card printed an attack it couldn't look up.
    missing: unresolvedReferences(character, db, { includeAllCards: true, sentinels: [UNARMED, UNARMORED] }),
  };
}

/**
 * One record, one printable card. The whole of what a card kind IS, in one place.
 *
 * cardSheet() above is the statement of deck order and nothing else; this is the statement of what
 * each card looks like, and it is deliberately free of `character` — a descriptor is a fact about a
 * record, which is what lets a browser page print a deck of domain cards owned by nobody. A new
 * card kind is a branch here plus a line of order up there, and nothing in card-pdf.js.
 *
 * KEY ORDER IS PART OF THE CONTRACT. The tests compare whole descriptors with JSON.stringify, so
 * the keys are compared in insertion order — and the kinds do NOT agree: a subclass card carries
 * `tier` and `origin` between `record` and `fallback`, the other four go straight from `record` to
 * `fallback`. Adding a key in the middle of a branch is an observable change.
 *
 * @param {{kind: string, record: object, tier?: string, origin?: string}} entry
 * @returns {CardDescriptor}
 */
export function cardDescriptor({ kind, record, tier, origin }) {
  switch (kind) {
    case "subclass": {
      // Keyed by id AND tier, matching the art filename: one subclass contributes up to three cards
      // and they have to be told apart. Two different subclasses can never collide here — a
      // multiclass is into a different class — so the tier alone is enough to disambiguate.
      const title = `${name(record)} (${SUBCLASS_TIER_LABELS[tier]})`;
      return {
        kind: "subclass",
        key: `${record.id}-${tier}`,
        title,
        art: subclassCardArtPath(record, tier),
        record,
        tier,
        origin,
        // Only this tier's features. The card on the table has the others printed on their own
        // cards, and repeating them would make a Mastery card a summary of the whole subclass.
        fallback: fallback(title, "Subclass", record[tier]?.features),
      };
    }
    case "community":
      return {
        kind: "community",
        key: record.id,
        title: name(record),
        art: communityCardArtPath(record),
        record,
        fallback: fallback(name(record), "Community", record.features),
      };
    case "ancestry":
      return {
        kind: "ancestry",
        key: record.id,
        title: name(record),
        art: ancestryCardArtPath(record),
        record,
        fallback: fallback(name(record), "Ancestry", record.features),
      };
    case "transformation":
      return {
        kind: "transformation",
        key: record.id,
        title: name(record),
        art: transformationCardArtPath(record),
        record,
        fallback: fallback(name(record), "Transformation", record.features),
      };
    case "domain":
      return {
        kind: "domain",
        key: record.id,
        title: name(record),
        art: domainCardArtPath(record),
        record,
        // The domain goes in the footer rather than the subtitle: the printed face carries it as a
        // glyph, so the fallback would otherwise be the one card in the deck that can't say which
        // pile it belongs to, and the subtitle is already spoken for by level/type/recall.
        fallback: fallback(
          name(record), domainCardSubtitle(record), record.features, titleCase(record.domain)),
      };
    default:
      // Not a silent null: an unknown kind is a caller bug (a typo, or a kind whose branch was
      // never added), and a dropped card is exactly the failure the missing-reference report above
      // exists to make impossible to ship unnoticed.
      throw new RangeError(`Unknown card kind: ${kind}`);
  }
}
