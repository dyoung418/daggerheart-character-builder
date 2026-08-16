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
