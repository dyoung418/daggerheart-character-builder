// The cards nobody ships art for: the combat stats card, the class's features, and the text
// card drawn in place of an art file the browser couldn't fetch.
//
// Pure — no DOM, no canvas, no fetch. Everything here is DATA a renderer walks: bands and
// sections, never coordinates. That split is the whole point. Card geometry is arithmetic that
// can be asserted (shared/card-layout.js), the drawing is pixels that can't, and what goes ON a
// card is rules — which trait carries the asterisk, which bonuses count — so it lives here where
// tests/ can read it. card-pdf.js measures and draws; it decides nothing.
//
// NUMBERS COME FROM deriveSheet(), NEVER FROM derivedStats() DIRECTLY
// -------------------------------------------------------------------
// sheet-data.js already solved every awkward case a printed page has: a null total prints "—",
// a trait carries a signed `display`, an unarmed attack is already the "(+2) Strength / (0) Finesse"
// string rather than an object, and a capped stat carries the `note` explaining the clamp. Going
// to derivedStats() here would be a sixth place that formats those, and the first one to disagree
// with the printed sheet — the exact fault sheet-data.js's own header says it was fixed out of.
//
// PERMANENT BONUSES ONLY
// ----------------------
// The stats on this card are derived from permanentSubject() — every card owned, none of them in
// play — and derived-stats.js states that rule once for the three exports that share it. This is
// the one rule on this card a reader is most likely to "fix" into a bug, so the reasoning is at
// that function's definition, and the footer below is what tells a player why their Evasion here
// differs from the app's.

import { MAX_HOPE } from "./advancement.js";
import { permanentSubject, spellcastTraitKeys } from "./derived-stats.js";
import { attackText, deriveSheet, flattenFeatures } from "./sheet-data.js";
import { titleCase } from "./text.js";

// What deriveSheet() prints for a number it doesn't have. Repeated here rather than imported
// because it's the same character sheet-data.js uses for the same reason, and this file has to
// produce it for values (Hope, thresholds) that never reach deriveSheet at all.
const DASH = "—";

// The footer is not decoration: without it a player reads an Evasion off this card, compares it
// with the app, and finds a different number. Say why, on the card, where the number is.
export const PERMANENT_ONLY_NOTE = "Stats include permanent bonuses only";

// The legend for the asterisk the traits grid puts on the Spellcast trait. It lives in the footer
// beside PERMANENT_ONLY_NOTE rather than under the grid: both are footnotes about how to read the
// numbers above them, and one of them sitting mid-card while the other sits at the bottom made the
// grid look like it had a caption and the card look like it had two footers.
export const SPELLCAST_NOTE = "* spellcasting trait; stats include permanent bonuses only";

const BULLET = "• ";

function find(list, id) {
  return id ? (list || []).find((x) => x.id === id) || null : null;
}

// Cells are compared whole in tests, so an absent note is an absent KEY rather than an
// `undefined` one — otherwise every expected fixture has to spell out the fields that aren't
// there.
function cell(label, value, note) {
  return note ? { label, value, note } : { label, value };
}

// A slot row's value is the boxes themselves. Printing the count beside them would be a second
// statement of the same fact, and the two would eventually disagree — a player who pencils in a
// 13th Armor box has changed the card, not the rules.
//
// marked is ALWAYS 0. Not an oversight: see statsCardContent.
function slotCell(label, boxes, note) {
  const c = cell(label, "", note);
  return { ...c, boxes: Math.max(0, boxes || 0), marked: 0 };
}

function num(value) {
  return value === null || value === undefined ? DASH : String(value);
}

// A flattened feature (name + description blocks) as a card section. The blocks are already
// Block shape — { type: "paragraph", text } | { type: "list", items } — because flattenFeatures()
// produces exactly that, which is why this file uses it rather than gear.js's featuresText():
// that one joins a whole feature into one "Name: text" line for a CSV cell, losing the split a
// card wants (the name takes weight, a bullet stays a bullet).
function featureSection(feature, tag) {
  const name = feature.name || "";
  const blocks = feature.description || [];
  // Key order matches what paginateSections() reassembles, so a section compares equal whether
  // or not it went through pagination.
  return tag ? { name, tag, blocks } : { name, blocks };
}

// One string for a feature that has to fit in a cell rather than in a section: the weapon
// feature on the stats card. Bullets keep their marker because losing it would run a list of
// alternatives together into a single sentence that reads as a sequence.
function featureText(feature) {
  return (feature.description || [])
    .map((block) => (block.type === "list" ? (block.items || []).map((i) => `${BULLET}${i}`).join(" ") : block.text))
    .filter(Boolean)
    .join(" ");
}

/**
 * The combat stats card.
 *
 * Bounded by construction, so it never paginates and paginateSections() is never called on it:
 * six traits, four slot rows, at most five Experiences (two at creation plus one at each of
 * levels 2/5/8) and exactly one weapon feature — no weapon in any source has two. Only that
 * feature's length varies (median 85 characters, worst case 248), which is why its band alone
 * carries `shrink`: it is the one block a renderer may step the type down inside. The numbers,
 * traits and boxes never move and never shrink; a stats card whose Evasion is smaller than the
 * one on the next character's card is a card that gets misread at the table.
 */
export function statsCardContent(character, db) {
  const s = deriveSheet(permanentSubject(character), db);
  // Read off the character, not the vaulted subject: which trait you cast with is a property of
  // your subclasses, and vaulting cards can't change it. Passing the subject would work today
  // and quietly stop working the day a card declares a Spellcast trait.
  const casting = new Set(spellcastTraitKeys(character, db));
  const bands = [];

  bands.push({
    type: "grid",
    label: "Traits",
    // The asterisk goes on the label rather than into a "Spellcast" row of its own: the roll uses
    // the trait, and its value is already in the grid, so a separate line would restate a number
    // the card already prints and become the copy that goes stale.
    cells: s.traits.map((t) => cell(casting.has(t.key) ? `${t.label}*` : t.label, t.display)),
  });

  // Evasion on the left, the damage-threshold scale beside it on the right. One row, because the
  // scale needs no heading of its own — "Minor 10 Major 16 Severe" says what it is — and a card
  // this dense cannot afford a heading and a row for three numbers.
  //
  // The scale replaced two rows reading "Major threshold 10" and "Severe threshold 16". Those
  // name each number after the band ABOVE it, so working out what 10 means takes a moment every
  // time: it is the number damage has to reach to stop being Minor. As a track, each number sits
  // on the boundary it actually is, between the two words it divides.
  //
  // A scale cell is one word plus the number that follows it, so the last carries no value.
  // Dashes rather than an omitted scale when there's no equipment yet: this card prints dashes
  // wherever a number isn't known, and a row that vanishes reads as a printing fault.
  bands.push({
    type: "defense",
    label: "Defense",
    cells: [cell("Evasion", num(s.evasion))],
    scale: [
      cell("Minor", num(s.thresholds?.major)),
      cell("Major", num(s.thresholds?.severe)),
      cell("Severe", ""),
    ],
  });

  // No heading. The four marked tracks read as a continuation of Defense above them, which is
  // what they are, and the word "Slots" was a row of vertical space spent naming something the
  // boxes already say. Only Traits, Defense, Weapons and armor, and Experiences keep a heading.
  bands.push({
    type: "slots",
    label: "",
    cells: [
      slotCell("Armor", s.armorScore, s.armorScoreNote),
      slotCell("Hit Points", s.hitPoints, s.hitPointsNote),
      slotCell("Stress", s.stress, s.stressNote),
      // MAX_HOPE, not deriveSheet's hardcoded hopeSlots: Hope is the one number on this card that
      // isn't derived from anything, and advancement.js is where the two Hope constants live.
      //
      // Every box is empty, Hope included. STARTING_HOPE is deliberately NOT read here: a card
      // printed with two Hope filled in is true for the five minutes after it comes off the
      // printer and misleading for the rest of the character's life. The player fills these in.
      slotCell("Hope", MAX_HOPE),
    ],
  });

  // Rally Die, Unstoppable Die, Combo Die, Patron Die. Four of fifteen classes have one, so the
  // band is emitted only when there's something in it rather than printing an empty label on the
  // other eleven cards.
  if (s.tracks.length > 0) {
    // Also unheaded: the row already reads "Rally Die  d8", and a "CLASS TRACK" line above it
    // spends a row to say what the next row says.
    bands.push({
      type: "lines",
      label: "",
      cells: s.tracks.map((t) => cell(t.label, t.display, t.note)),
    });
  }

  // Weapons and armor: one line each, with anything that line carries a feature indented under
  // it — the same shape for all three, so the eye learns it once.
  //
  // A weapon used to cost three rows: its name as a band heading, then an Attack row and a Damage
  // row, for four values. As one line it costs one, which is what buys the secondary weapon and
  // the armour their place on a card that was already full.
  //
  // "Primary weapon -" leads rather than the weapon's name, because with two weapons the thing
  // you reach for first is which hand, not which sword. deriveSheet returns [primary, secondary]
  // with the empty slot already filtered out, so the index is the only thing that knows which is
  // which — and a character fighting one-handed simply has no second entry.
  //
  // A feature band, not a note: a note is set at body size, which drew the feature LARGER than
  // the line it belongs to and made the one discretionary block on the card its loudest. A
  // feature matches its owner's size and indents under it, so it reads as something that weapon
  // or armour does rather than as a new subject. The feature's own name is the heading inside the
  // cell; a band label here would print "Weapon feature" above the word "Magnetic".
  const featureBand = (features) => ({
    type: "feature",
    label: "",
    cells: features.map((f) => cell(f.name, featureText(f))),
    shrink: true,
  });

  const gear = [];
  const slotName = ["Primary weapon", "Secondary weapon"];
  s.weapons.forEach((weapon, i) => {
    // "+1 Agility", and the whole rule — bonus first, when a trait label is welded on and when a
    // bracket has to separate it — is sheet-data.js's attackText(), which the official sheet's
    // form fields call too. A lone bonus stays BARE here: this line sits inside a sentence
    // ("Longsword: +1 Agility | 2d10+3 Physical"), where the sheet's is one value in a column of
    // boxes and brackets it to line up with the alternatives beside it.
    const attack = attackText(weapon);
    const damage = [weapon.damage, weapon.damageType].filter(Boolean).join(" ");
    gear.push({ lead: `${slotName[i] || "Weapon"} -`, text: `${weapon.name}: ${attack} | ${damage}`,
      features: weapon.features });
  });

  // Armour, on the same footing. BASE thresholds and BASE score deliberately — they are the
  // armour's own numbers, the ones printed on its card, and they don't move with level. The
  // figures that apply to THIS character are the scale beside Evasion and the Armor boxes above;
  // repeating those here would print them twice and invite the reader to add them together.
  //
  // Read off the record rather than deriveSheet, which carries the armour's name and features but
  // not its bases — nothing else that reads deriveSheet has ever wanted them. Absent for an
  // unarmored character, whose numbers come from the SRD's unarmored rule or from Bare Bones
  // standing in for the armour they aren't wearing, and neither has a base to print.
  const armor = (db?.armors || []).find((a) => a.id === character.equipment?.armorId) || null;
  if (armor) {
    gear.push({
      lead: "Armor -",
      text: `${armor.name["en-US"]}: ${armor.baseMajorThreshold}/${armor.baseSevereThreshold} | ${armor.baseScore}`,
      features: s.armorFeatures,
    });
  } else if (s.armorName && s.armorName !== DASH) {
    gear.push({ lead: "Armor -", text: s.armorName, features: s.armorFeatures });
  }

  // No section heading. Every one of these lines opens by saying what it is — "Primary weapon -",
  // "Secondary weapon -", "Armor -" — so a WEAPONS AND ARMOR rule above them spends a row
  // announcing what the next row already announces.
  for (const entry of gear) {
    bands.push({ type: "detail", label: "", cells: [cell(entry.lead, entry.text)] });
    if (entry.features.length > 0) bands.push(featureBand(entry.features));
  }

  if (s.experiences.length > 0) {
    bands.push({
      type: "lines",
      label: "Experiences",
      cells: s.experiences.map((e) => cell(e.name, e.display)),
    });
  }

  return {
    title: s.name,
    // The level rides on the title's own row, right-aligned, and there is no subtitle at all.
    // Class and subclass used to sit here — "Level 3 Guardian — Stalwart" — but both have cards
    // of their own a few slots later in this same deck, so the line restated what the deck
    // already says and cost the body a row it needed.
    titleRight: `Level ${s.level}`,
    subtitle: "",
    bands,
    // One line, carrying both footnotes. The asterisk half only appears when a trait is actually
    // starred — a legend for a mark that appears nowhere is worse than no legend, because it
    // sends a Guardian looking for an asterisk they don't have. Two traits are starred for a
    // multiclass whose second subclass also casts, which is why spellcastTraitKeys() returns an
    // array and the grid asterisks every key in it; one legend still covers both.
    footer: casting.size > 0 ? SPELLCAST_NOTE : PERMANENT_ONLY_NOTE,
  };
}

/**
 * The class features, one CardContent per class — the first class's Hope feature followed by its
 * class features, then, for a multiclass, a second card holding only the second class's class
 * features.
 *
 * A multiclass grants NO Hope feature (sheet-data.js says the same where it builds
 * multiclassFeatures, and effects.js skips the second class's hopeFeature when collecting), so
 * mcClass.hopeFeature is never read here. It exists in data/ — reading it would print a second
 * Hope feature that the character does not have.
 *
 * Not deriveSheet().multiclassFeatures either: that field deliberately concatenates the second
 * class's classFeatures WITH its subclass tier features, and every one of those tiers already has
 * its own art card in this deck. Pulling them apart again would mean string-matching the `source`
 * label it stamped on them.
 *
 * Returns unpaginated content: a class whose features overflow one card is split by
 * paginateSections(), which needs a measurer this module has no business owning. Four of fifteen
 * classes do overflow, so the caller always has to run it — it is not an edge case.
 */
export function classCardContents(character, db) {
  const out = [];
  const cls = find(db?.classes, character.classId);
  if (cls) {
    const sections = [
      // A bare object, not an array — hence the wrap. flattenFeatures() drops falsy entries, so a
      // source shipping a class without a Hope feature (validateRecord doesn't require one)
      // produces no section rather than throwing.
      ...flattenFeatures([cls.hopeFeature]).map((f) => featureSection(f, "Hope Feature")),
      ...flattenFeatures(cls.classFeatures).map((f) => featureSection(f)),
    ];
    if (sections.length > 0) out.push(classCard(cls, "Class Features", sections));
  }

  const mcClass = find(db?.classes, character.multiclass?.classId);
  if (mcClass) {
    const sections = flattenFeatures(mcClass.classFeatures).map((f) => featureSection(f));
    if (sections.length > 0) out.push(classCard(mcClass, "Multiclass Features", sections));
  }
  return out;
}

// A class with no features at all yields no card, rather than a card with a title and nothing
// under it: this deck is cut up by hand, and a blank is a card someone has to throw away.
function classCard(cls, subtitle, sections) {
  return { title: titleCase(cls.name), subtitle, sections, footer: "" };
}

/**
 * The text card drawn when a card's art file isn't there — a clean checkout has none of it
 * (.gitignore excludes each source's card-art/), and homebrew may never have had any. Not a blank and
 * not a skip: a player who owns the card owns it whether or not this browser can draw its face.
 */
export function fallbackCardContent(descriptor) {
  const record = descriptor?.record || null;
  // A subclass card's features hang off the tier, not off the record: the descriptor already
  // knows which tier this card is, because the deck prints one card per unlocked tier.
  const source = descriptor?.tier && record?.[descriptor.tier] ? record[descriptor.tier] : record;
  return {
    title: descriptor?.title || "",
    subtitle: fallbackSubtitle(record),
    sections: flattenFeatures(source?.features).map((f) => featureSection(f)),
    footer: "",
  };
}

// Everything a domain card's frame prints around the art, in the order the frame prints it.
// Only domain cards have any of these fields, so anything else comes back with "" and the
// renderer draws a title and its text — which is all an ancestry card's frame holds anyway.
function fallbackSubtitle(record) {
  if (!record || !record.domain) return "";
  return [
    `${titleCase(record.domain)} ${record.level}`,
    record.type ? titleCase(record.type) : "",
    record.recallCost === undefined || record.recallCost === null ? "" : `Recall ${record.recallCost}`,
  ].filter(Boolean).join(" · ");
}

/**
 * Split one CardContent's sections across as many physical cards as they need.
 *
 * PURE, with the measurer injected — that is the entire reason this is testable. card-pdf.js
 * passes a canvas ctx.measureText wrapper; tests pass `(text) => text.length * 10` and can then
 * assert exactly where the break lands. A version of this that reached for a canvas would be
 * verifiable only by comparing pixels.
 *
 * opts: { width, height, lineHeight, bodySize, headingSize, measure }, where measure is
 * (text, size, bold) => width in the same units as `width`.
 *
 * Titles gain a "(n/m)" suffix only when m > 1: a suffix on a card that has no continuation
 * tells a player to go looking for a card that doesn't exist.
 */
export function paginateSections(content, opts) {
  const { width, height, lineHeight, bodySize, measure } = opts;
  const headingSize = opts.headingSize === undefined ? bodySize : opts.headingSize;
  const sections = content.sections || [];
  // At least one line per card even if the caller hands us a body shorter than a line: a card
  // that can hold nothing is a loop that never ends.
  const maxLines = Math.max(1, Math.floor(height / lineHeight));
  // A bullet is drawn in the margin the item is indented by, so the item wraps to the narrower
  // width. Measured rather than assumed — the renderer's font decides how wide "• " is.
  const itemWidth = Math.max(1, width - measure(BULLET, bodySize, false));

  // Everything becomes rows of exactly one line, tagged with where it came from, so packing is
  // counting and reassembly is grouping. Doing it the other way round — deciding page breaks
  // from character counts — is what makes a paginator that works until one section is all short
  // words and another is all long ones.
  const rows = [];
  sections.forEach((section, si) => {
    if (section.name) {
      wrap(section.name, width, headingSize, true, measure).forEach((line, i) => {
        rows.push({ si, kind: "heading", startsSection: i === 0, ...line });
      });
    }
    (section.blocks || []).forEach((block, bi) => {
      if (block.type === "list") {
        (block.items || []).forEach((item, ii) => {
          for (const line of wrap(item, itemWidth, bodySize, false, measure)) {
            rows.push({ si, kind: "body", blockIndex: bi, blockType: "list", itemIndex: ii, ...line });
          }
        });
      } else {
        for (const line of wrap(block.text || "", width, bodySize, false, measure)) {
          rows.push({ si, kind: "body", blockIndex: bi, blockType: "paragraph", ...line });
        }
      }
    });
  });

  const pages = [];
  let i = 0;
  while (i < rows.length) {
    const taken = [];
    while (i < rows.length && taken.length < maxLines) {
      const row = rows[i];
      // A heading alone at the foot of a card is a promise the card doesn't keep, so a section
      // starts here only if its whole name AND its first line of prose fit. Skipped when the
      // card is still empty: moving a section off an empty card moves it forever.
      if (row.startsSection && taken.length > 0) {
        let h = 0;
        while (rows[i + h] && rows[i + h].kind === "heading" && rows[i + h].si === row.si) h++;
        const next = rows[i + h];
        const needsFirstLine = next && next.kind === "body" && next.si === row.si ? 1 : 0;
        if (taken.length + h + needsFirstLine > maxLines) break;
      }
      taken.push(row);
      i++;
    }
    pages.push(taken);

    // A section cut mid-prose picks its name back up on the next card, because the reader of card
    // 2/2 has the other half in a different hand. Only when this card actually printed some of
    // that section's prose: repeating a heading that was itself the last thing on the card would
    // insert a heading before every card forever and never advance.
    const last = taken[taken.length - 1];
    const nextRow = rows[i];
    if (last && last.kind === "body" && nextRow && nextRow.kind === "body" && nextRow.si === last.si) {
      const name = sections[last.si]?.name;
      if (name) {
        const cont = wrap(`${name} (cont.)`, width, headingSize, true, measure)
          .map((line) => ({ si: last.si, kind: "heading", startsSection: false, ...line }));
        rows.splice(i, 0, ...cont);
      }
    }
  }
  // No sections at all is one card, unchanged: the stats card goes through here untouched by
  // whatever the caller does uniformly to every card.
  if (pages.length === 0) pages.push([]);

  return pages.map((pageRows, index) => {
    const card = {
      title: pages.length > 1 ? `${content.title} (${index + 1}/${pages.length})` : content.title,
      subtitle: content.subtitle || "",
      sections: assemble(pageRows, sections),
    };
    // Rides along for the same reason the bands do: only the stats card sets it and that card is
    // always one page, but a card that ever did split should not lose its level on page two.
    if (content.titleRight) card.titleRight = content.titleRight;
    // Bands aren't paginated — only the stats card has any, and it is bounded by construction so
    // it is always one page. They ride on the first card so nothing is lost if that ever changes.
    if (index === 0 && content.bands) card.bands = content.bands;
    // On every card, not just the last: each one gets cut out and read on its own, and the only
    // footer in the deck is the caveat about which bonuses the numbers include.
    card.footer = content.footer || "";
    return card;
  });
}

// Rows back into sections and blocks. The renderer re-wraps what comes out and, given the same
// measurer and width, gets the same lines back — so this returns Block shape rather than lines,
// and the CardContent contract stays one shape whether it went through here or not.
function assemble(rows, sections) {
  const out = [];
  for (const row of rows) {
    let section = out[out.length - 1];
    // Rows of one section are contiguous within a card, so a change of index is a new section.
    if (!section || section.si !== row.si) {
      const source = sections[row.si] || {};
      section = { si: row.si, name: "", blocks: [] };
      if (source.tag !== undefined) section.tag = source.tag;
      out.push(section);
    }
    if (row.kind === "heading") {
      section.name = section.name ? `${section.name} ${row.text}` : row.text;
      continue;
    }
    let block = section.blocks[section.blocks.length - 1];
    const sameBlock = block && block.bi === row.blockIndex;
    if (row.blockType === "list") {
      if (!sameBlock) {
        block = { type: "list", items: [], bi: row.blockIndex, ii: null };
        section.blocks.push(block);
      }
      if (block.ii !== row.itemIndex) {
        block.items.push(row.text);
        block.ii = row.itemIndex;
      } else {
        block.items[block.items.length - 1] += join(row);
      }
    } else {
      if (!sameBlock) {
        block = { type: "paragraph", text: "", bi: row.blockIndex };
        section.blocks.push(block);
        block.text = row.text;
      } else {
        block.text += join(row);
      }
    }
  }
  // The bookkeeping fields never leave this function: a CardContent is compared whole in tests
  // and handed to a renderer that has no business seeing row indices.
  return out.map((section) => {
    const blocks = section.blocks.map(stripBlock);
    return section.tag === undefined
      ? { name: section.name, blocks }
      : { name: section.name, tag: section.tag, blocks };
  });
}

// A line that continues a hard-broken word rejoins with nothing between; every other line
// rejoins with the space that wrapping consumed. Without this a word too long for the line comes
// back out with a space in the middle of it, which is a different word.
function join(row) {
  return row.glue ? row.text : ` ${row.text}`;
}

function stripBlock(block) {
  return block.type === "list" ? { type: "list", items: block.items } : { type: "paragraph", text: block.text };
}

// Greedy line breaking. Returns { text, glue } per line; `glue` marks a line that continues a
// word rather than starting one, which is what lets assemble() put the word back together.
function wrap(text, width, size, bold, measure) {
  const words = String(text === null || text === undefined ? "" : text).split(/\s+/).filter(Boolean);
  const lines = [];
  let line = "";
  let glue = false;
  const flush = () => {
    if (line) lines.push({ text: line, glue });
    line = "";
    glue = false;
  };
  for (const word of words) {
    // A word wider than the whole line has to be cut, or the greedy loop below would push it to a
    // fresh line forever and it would never be drawn. One character is always taken, so this
    // terminates even against a measurer that says everything is too wide.
    if (measure(word, size, bold) > width) {
      flush();
      let rest = word;
      let first = true;
      while (measure(rest, size, bold) > width) {
        const head = longestFit(rest, width, size, bold, measure);
        lines.push({ text: head, glue: !first });
        rest = rest.slice(head.length);
        first = false;
      }
      // Only glued if there IS a tail: a word that divided evenly across lines leaves the next
      // word starting a line of its own, with the space that separated them intact.
      line = rest;
      glue = rest.length > 0;
      continue;
    }
    if (!line) {
      line = word;
      continue;
    }
    if (measure(`${line} ${word}`, size, bold) > width) {
      flush();
      line = word;
    } else {
      line = `${line} ${word}`;
    }
  }
  flush();
  return lines;
}

function longestFit(word, width, size, bold, measure) {
  let n = 1;
  while (n < word.length && measure(word.slice(0, n + 1), size, bold) <= width) n++;
  return word.slice(0, n);
}
