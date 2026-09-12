// Display casing for the names data/ ships in a shape no player should see.
//
// classes.json holds a class name as a bare uppercase string ("BARD") because subclasses[].class
// joins to it — there it's a key, not a label. Domains arrive the same way, and a few messages want
// a trait key ("agility") in prose. Printing any of them takes the same one-liner, which is how
// three slightly different copies of it came to live in seven files.
//
// Word by word, because a name is not always one word. Every class in the SRD is a single word, so
// three copies of this could quietly assume one and none of them was ever wrong; a content source
// that adds a two-word class name breaks that assumption everywhere at once, including in the CSV,
// which leaves the app. Separators are whitespace and hyphens, never apostrophes: turning
// "SOLDIER'S" into "Soldier'S" would just be a different bug.
//
// This is for values data/ ships as KEYS — an uppercase class name or domain, a lowercase trait
// key — and it lowercases what it's given before capitalising. Don't reach for it to tidy up prose
// somebody already wrote: every word comes back capitalised, articles included. Names that arrive
// written for a reader (every localized {"en-US": …} field) print as they are.
//
// The SCREAMING_SNAKE cousin is enumLabel() in gear.js, which splits on underscores. That one is
// for enum VALUES — ranges, burdens, damage types — rather than names. Phrases like
// PHYSICAL_OR_MAGICAL want sentence case instead ("Physical or magical"), because capitalising a
// conjunction is worse than not title-casing at all; sheet-data.js keeps that one locally.
export function titleCase(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/(^|[\s-])([^\s-])/g, (_, separator, letter) => separator + letter.toUpperCase());
}

// "2 cards", "1 card". The plainest possible rule, and deliberately so: it is only ever handed
// English nouns this app writes itself ("card", "page", "box", "reference", "character"), never a
// name out of data/ and never anything irregular.
export const plural = (n, noun) => `${n} ${noun}${n === 1 ? "" : "s"}`;

// A filename component out of something a person typed. The download attribute would carry a
// character's name in full, but the filesystem it lands on may not, so it's reduced to [a-z0-9-].
// Accents are folded rather than dropped: without the NFD pass Élodie saves as "lodie", which looks
// like the export mangled it.
//
// One copy of the rule, shared by every export that names a file, so the same name can't slug two
// ways in one download folder. `fallback` is what a name made entirely of punctuation — or no name
// at all — comes out as; it is the caller's word because only the caller knows what was being
// named.
export function fileSlug(text, fallback) {
  return String(text ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || fallback;
}
