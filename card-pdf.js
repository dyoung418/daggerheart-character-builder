// The card export's one impure stage: art files in, JPEG bytes out, a PDF at the end.
//
// WHY THIS FILE IS AT THE REPO ROOT AND NOT IN shared/
// ----------------------------------------------------
// shared/csv-export.js's header states the rule this deck was built to keep: everything with a
// rule in it is reachable from tests/. This file has no rules in it. It fetches (new Image), it
// draws (canvas 2D), it encodes (toBlob) — and none of that can be asserted without comparing
// pixels, so it sits beside app.js and sheet.js with the other page code rather than pretending
// to be a testable module. Everything it would otherwise have decided lives in four pure modules
// it composes:
//
//   shared/card-sheet.js    which cards, in what order
//   shared/card-content.js  what the two generated cards say, and where long text breaks
//   shared/card-layout.js   where a card sits on the page, in points
//   shared/pdf.js           the bytes
//
// So the honest summary of this file is: it measures and it draws. It decides nothing. If you
// find yourself adding a rule here — which cards a character owns, which bonuses a printed number
// counts — it belongs in one of those four, where a test can reach it.
//
// THE ENCODER IS LOAD-BEARING, AND UNDOCUMENTED
// ---------------------------------------------
// canvas.toBlob(…, "image/jpeg") emits BASELINE JFIF in Chrome, which is exactly what PDF's
// /DCTDecode filter accepts: progressive JPEG is out of spec for it, and a viewer handed one
// renders a grey rectangle or nothing at all. No browser documents which it emits, so this is a
// real dependency on the encoder's behaviour rather than on a standard — hence this paragraph.
// And never swap the mime type to "image/webp" however much smaller it is: PDF has no WebP
// filter, so the bytes would embed happily and the file would be undisplayable.

import {
  classCardContents,
  fallbackCardContent,
  paginateSections,
  statsCardContent,
} from "./shared/card-content.js";
import { MARK_WIDTH, PAGE_HEIGHT, PAGE_WIDTH, cropMarks, paginate } from "./shared/card-layout.js";
import { cardSheet } from "./shared/card-sheet.js";
import { buildPdf } from "./shared/pdf.js";

// 0.92 was measured against the art, which is a whole card FACE — its rules text is pixels, not
// glyphs, so JPEG ringing lands on letterforms rather than on flat colour. It is named, and used
// once, so raising it is one edit rather than a hunt.
export const JPEG_QUALITY = 0.92;

// The art on disk is 660x924 = exactly 5:7, and a card is 180x252pt, so this is 264ppi — well
// past what a home laser resolves and comfortably past the 300dpi the reference sheet was
// measured at once the JPEG has softened it. Rendering the generated cards at the same size is
// what keeps a text card and an art card looking like they came out of the same deck.
export const CARD_PIXEL_WIDTH = 660;
export const CARD_PIXEL_HEIGHT = 924;

// ---------------------------------------------------------------------------------------------
// Typography for the generated cards.
//
// A system stack, deliberately, and not the app's Oswald: canvas text silently falls back to
// whatever is available if the webfont hasn't finished loading, and unlike the DOM there is no
// signal and no reflow when it arrives — the card would just come out in a different face, and
// only sometimes. A sans face throughout for the same reason 0.92 is safe on the art: at 24px
// rendered and then JPEG'd, a serif's hairlines are the first thing to smear.
const FAMILY = '"Helvetica Neue", Helvetica, Arial, "Liberation Sans", sans-serif';
const font = (size, weight) => `${weight} ${size}px ${FAMILY}`;

// Near-white rather than white: it tells a generated card from an art card at a glance, and it
// is pale enough that the full-bleed fill costs almost no ink. Pale matters for a second reason
// — the sheet has no bleed, so a card cut a hair off-register shows a sliver of its neighbour,
// and a sliver of #faf7f1 against paper is invisible where a sliver of a dark panel is not.
const BG = "#faf7f1";
const INK = "#1c1a17";
const MUTED = "#5f584c";
const RULE = "#b9b0a0";

const PAD_X = 44;
const PAD_TOP = 30;
const PAD_BOTTOM = 34;
const CONTENT_WIDTH = CARD_PIXEL_WIDTH - 2 * PAD_X;

// The header is a FIXED height — two title lines' worth whether or not the title needs two.
// That is not laziness: the body box below it is handed to paginateSections(), which decides
// where a class's features break, and that decision then names the card "(1/2)". A header that
// grew with its title would make the box depend on a suffix that pagination hadn't added yet.
const TITLE_SIZE = 32;
const TITLE_LINE = 40;
const TITLE_BOX = 2 * TITLE_LINE;
const SUBTITLE_SIZE = 20;
const SUBTITLE_TOP = PAD_TOP + TITLE_BOX + 2;
const HEADER_RULE_GAP = 36;
const HEADER_BODY_GAP = 14;

// Where the rule under the header sits, and where the body starts, for THIS content. Not
// constants: the stats card carries no subtitle — its level moved up onto the title row and its
// class and subclass have cards of their own — and a fixed header would leave that row as a hole
// above the traits rather than giving it back to the body, which is what the card is short of.
function headerRuleY(content) {
  return (content?.subtitle ? SUBTITLE_TOP + HEADER_RULE_GAP : PAD_TOP + TITLE_BOX + 6);
}
function bodyTop(content) {
  return headerRuleY(content) + HEADER_BODY_GAP;
}

const BODY_SIZE = 24;
const HEADING_SIZE = 25;
const LINE_HEIGHT = 33;

const FOOTER_SIZE = 17;
const FOOTER_LINE = 22;
// Rule gap above the footer plus clear air below the body. Split out because bodyBottom() and
// drawFooter() both need it and a card whose text overlapped its own footnote would be the
// symptom of them disagreeing.
const FOOTER_RULE_GAP = 12;
const FOOTER_BODY_GAP = 10;

const BAND_GAP = 10;
// How tight the air between bands may get before text starts shrinking instead. See bandLayout().
const MIN_BAND_GAP = 4;
const LABEL_SIZE = 16;
const LABEL_LINE = 19;
const NOTE_SIZE = 16;
const NOTE_LINE = 20;
// The floor the shrinkable band stops at. Below ~14px the JPEG, not the printer, becomes the
// limit — the counters fill in. A band that still doesn't fit at 14 is clipped rather than
// allowed to run over the footer; see drawTextCard().
const MIN_SHRINK_SIZE = 14;

const TRAIT_ROW = 46;
const TRAIT_VALUE_SIZE = 27;
const TRAIT_LABEL_SIZE = 15;
const ROW_LINE = 26;
const ROW_LABEL_SIZE = 18;
const ROW_VALUE_SIZE = 20;
const SLOT_ROW = 29;
// A weapon feature is set at the weapon's own row size, not body size, and indented under it.
const FEATURE_SIZE = ROW_LABEL_SIZE;
const FEATURE_INDENT = 20;
// The damage-threshold scale: the words that name each band, and the numbers that divide them.
const THRESHOLD_WORD_SIZE = ROW_LABEL_SIZE;
const THRESHOLD_VALUE_SIZE = ROW_VALUE_SIZE;
const THRESHOLD_GAP = 10;
// One line of gear. Matches the weapon feature under it, so a weapon and what it does read as
// one block rather than two sizes.
const DETAIL_SIZE = ROW_LABEL_SIZE;
const SLOT_LABEL_WIDTH = 150;
const BOX_SIZE = 20;
const BOX_GAP = 6;
const BOX_STROKE = 2;

const BULLET = "• ";
const ELLIPSIS = "…";

// ---------------------------------------------------------------------------------------------
// Measuring

// The measurer handed to paginateSections(), and the one every wrap below uses. Setting ctx.font
// as a side effect is fine — every draw sets its own font first — and it is the whole reason
// pagination and drawing agree about what fits: they are asking the same canvas the same
// question. A measurer built on a second canvas, or on average character widths, is how a card
// paginates to two and then draws in one and a half.
function measure(ctx, text, size, bold) {
  ctx.font = font(size, bold ? 700 : 400);
  return ctx.measureText(String(text === null || text === undefined ? "" : text)).width;
}

/**
 * Greedy line breaking, character-for-character the same pass as card-content.js's private
 * wrap(): fill a line, hard-break a word wider than the line, take at least one character so an
 * impossible width still terminates.
 *
 * It has to be the same, and this is the one duplication in the export worth having.
 * paginateSections() counts LINES and hands back reassembled paragraphs; this re-wraps them to
 * draw. If the two algorithms differed by one word, a class card would paginate to 21 lines and
 * draw 22, and the lost line would be the last line of the last feature — the one nobody
 * proof-reads. If you change one, change both.
 *
 * firstIndent is the extra width the first line gives up, used for a bold feature name that the
 * text runs on from. card-content.js has no equivalent because it never draws a run-on.
 */
function wrapLines(ctx, text, width, size, bold, firstIndent = 0) {
  const words = String(text === null || text === undefined ? "" : text).split(/\s+/).filter(Boolean);
  const lines = [];
  let line = "";
  const room = () => (lines.length === 0 ? width - firstIndent : width);
  const flush = () => {
    if (line) lines.push(line);
    line = "";
  };
  for (const word of words) {
    if (measure(ctx, word, size, bold) > room()) {
      flush();
      let rest = word;
      while (measure(ctx, rest, size, bold) > room()) {
        let n = 1;
        while (n < rest.length && measure(ctx, rest.slice(0, n + 1), size, bold) <= room()) n++;
        lines.push(rest.slice(0, n));
        rest = rest.slice(n);
      }
      line = rest;
      continue;
    }
    if (!line) {
      line = word;
      continue;
    }
    if (measure(ctx, `${line} ${word}`, size, bold) > room()) {
      flush();
      line = word;
    } else {
      line = `${line} ${word}`;
    }
  }
  flush();
  return lines;
}

// One line, cut with an ellipsis rather than wrapped. Used where the layout has exactly one line
// to give (the subtitle) — a subtitle that wrapped would push the rule down and break the fixed
// header the pagination depends on.
function truncate(ctx, text, width, size, bold) {
  const s = String(text === null || text === undefined ? "" : text);
  if (!s || measure(ctx, s, size, bold) <= width) return s;
  let cut = s.length;
  while (cut > 0 && measure(ctx, `${s.slice(0, cut)}${ELLIPSIS}`, size, bold) > width) cut--;
  return `${s.slice(0, cut)}${ELLIPSIS}`;
}

// A hairline drawn as a filled rect, not a stroke: a 1px stroke on an integer coordinate
// straddles the pixel boundary and comes out 2px of half-grey, which at 264ppi prints as a
// smudge rather than a rule.
function hairline(ctx, y) {
  ctx.fillStyle = RULE;
  ctx.fillRect(PAD_X, y, CONTENT_WIDTH, 1.5);
}

// ---------------------------------------------------------------------------------------------
// The text renderer: a CardContent walked onto the canvas.
//
// Clean typographic, explicitly NOT an imitation of the printed Daggerheart frame: a near-copy
// of someone else's card face is both worse-looking and a claim we have no business making, and
// the frame's dark panels would drink ink on twenty-two cards.

// Where the body must stop. The footer is the caveat about which bonuses the numbers include —
// on the stats card it is the difference between a player trusting the Evasion on the card and
// finding out at the table — so it gets its space first and the body gets what's left.
function footerLines(ctx, footer) {
  // One note or several. The stats card carries two — which bonuses the numbers include, and the
  // Spellcast legend — and they are separate entries rather than one string with a newline in it
  // so that each wraps on its own and a long first note can never pull the second onto its line.
  const notes = (Array.isArray(footer) ? footer : [footer]).filter(Boolean);
  return notes.flatMap((note) => wrapLines(ctx, note, CONTENT_WIDTH, FOOTER_SIZE, false));
}

function bodyBottom(ctx, footer) {
  const lines = footerLines(ctx, footer);
  const floor = CARD_PIXEL_HEIGHT - PAD_BOTTOM;
  if (!lines.length) return floor;
  return floor - lines.length * FOOTER_LINE - FOOTER_RULE_GAP - FOOTER_BODY_GAP;
}

// The options paginateSections() is called with, for THIS content — the height depends on the
// footer, and a fallback domain card carries one (its domain name) while a class card does not.
// Built from the same functions the drawing uses, so the box that was paginated into is the box
// that gets drawn into.
function textOpts(ctx, content) {
  return {
    width: CONTENT_WIDTH,
    height: bodyBottom(ctx, content.footer) - bodyTop(content),
    lineHeight: LINE_HEIGHT,
    bodySize: BODY_SIZE,
    headingSize: HEADING_SIZE,
    measure: (text, size, bold) => measure(ctx, text, size, bold),
  };
}

function drawHeader(ctx, content) {
  // "Level 5", set regular and right-aligned on the title's own row. It reads as an annotation to
  // the name rather than a second heading, and it costs no vertical space at all — which is the
  // point, on the one card that was overflowing.
  const right = content.titleRight || "";
  const rightWidth = right ? measure(ctx, right, SUBTITLE_SIZE, false) + 20 : 0;
  // The title wraps clear of it, so a long name breaks early instead of running underneath.
  const lines = wrapLines(ctx, content.title || "", CONTENT_WIDTH - rightWidth, TITLE_SIZE, true).slice(0, 2);
  // A single-line title sits centred in the two-line box rather than at the top of it: the box is
  // fixed, so the alternative is a card with a conspicuous hole under its name.
  const top = PAD_TOP + (TITLE_BOX - lines.length * TITLE_LINE) / 2;
  ctx.fillStyle = INK;
  ctx.font = font(TITLE_SIZE, 700);
  lines.forEach((line, i) => ctx.fillText(line, PAD_X, top + i * TITLE_LINE));

  if (right) {
    ctx.fillStyle = MUTED;
    ctx.font = font(SUBTITLE_SIZE, 400);
    ctx.textAlign = "right";
    // Nudged down to sit on the title's optical line: with a top baseline the smaller face would
    // otherwise ride high against the capitals beside it.
    ctx.fillText(right, PAD_X + CONTENT_WIDTH, top + (TITLE_SIZE - SUBTITLE_SIZE));
    ctx.textAlign = "left";
  }

  const subtitle = truncate(ctx, content.subtitle || "", CONTENT_WIDTH, SUBTITLE_SIZE, false);
  if (subtitle) {
    ctx.fillStyle = MUTED;
    ctx.font = font(SUBTITLE_SIZE, 400);
    ctx.fillText(subtitle, PAD_X, SUBTITLE_TOP);
  }
  hairline(ctx, headerRuleY(content));
}

function drawFooter(ctx, footer) {
  const lines = footerLines(ctx, footer);
  if (!lines.length) return;
  const top = CARD_PIXEL_HEIGHT - PAD_BOTTOM - lines.length * FOOTER_LINE;
  hairline(ctx, top - FOOTER_RULE_GAP);
  ctx.fillStyle = MUTED;
  ctx.font = font(FOOTER_SIZE, 400);
  lines.forEach((line, i) => ctx.fillText(line, PAD_X, top + i * FOOTER_LINE));
}

/**
 * One band, measured and drawn by the same code path.
 *
 * `draw` false measures, `draw` true paints, and both walk the identical arithmetic — which is
 * the point. A separate measuring function is how a band ends up measured short and drawn long,
 * and the failure surfaces as the last band sitting on top of the footer on one character's card
 * and nobody else's.
 *
 * Returns the band's height.
 */
function renderBand(ctx, band, top, size, draw) {
  let y = top;
  const cells = band.cells || [];

  if (band.type === "note") {
    // A note band's label is the note itself (the "* Spellcast trait" legend has a label and no
    // cells), so it is set small and muted rather than as a section heading.
    if (band.label) {
      if (draw) {
        ctx.fillStyle = MUTED;
        ctx.font = font(NOTE_SIZE, 400);
        ctx.fillText(band.label, PAD_X, y);
      }
      y += NOTE_LINE;
    }
    for (const c of cells) y += renderRunOn(ctx, c.label, c.value, y, size, draw);
    return y - top;
  }

  // A weapon's feature. Same run-on shape as a note — bold name, prose running on from it — but
  // sized and placed as a subordinate of the line above rather than as its own subject.
  if (band.type === "feature") {
    for (const c of cells) y += renderRunOn(ctx, c.label, c.value, y, size, draw, FEATURE_INDENT);
    return y - top;
  }


  if (band.label) {
    if (draw) {
      ctx.fillStyle = MUTED;
      ctx.font = font(LABEL_SIZE, 700);
      ctx.fillText(String(band.label).toUpperCase(), PAD_X, y);
    }
    y += LABEL_LINE;
  }

  // One piece of gear on one line: a muted "Primary weapon -" then the data. Wrapped rather than
  // truncated — a long name ("Improved Round Shield: Agility +0 | 2d4+1 Physical") takes a second
  // line, where cutting it would drop the damage, which is the half you actually roll.
  //
  // Below the shared label block, not above it with the note and feature branches: the first gear
  // line carries the "WEAPONS AND ARMOR" heading, and returning before that block is what left the
  // section unheaded.
  if (band.type === "detail") {
    for (const c of cells) y += renderRunOn(ctx, c.label, c.value, y, DETAIL_SIZE, draw, 0, "muted");
    return y - top;
  }

  if (band.type === "grid") {
    // Six traits, three across. The value carries the weight and the name sits under it: at the
    // table you look for the number first and only then check you're reading the right trait.
    const columns = 3;
    const columnWidth = CONTENT_WIDTH / columns;
    cells.forEach((c, i) => {
      const cx = PAD_X + (i % columns) * columnWidth + columnWidth / 2;
      const cy = y + Math.floor(i / columns) * TRAIT_ROW;
      if (draw) {
        ctx.textAlign = "center";
        ctx.fillStyle = INK;
        ctx.font = font(TRAIT_VALUE_SIZE, 700);
        ctx.fillText(c.value, cx, cy);
        ctx.fillStyle = MUTED;
        ctx.font = font(TRAIT_LABEL_SIZE, 400);
        ctx.fillText(c.label, cx, cy + TRAIT_VALUE_SIZE + 2);
        ctx.textAlign = "left";
      }
    });
    return y + Math.ceil(cells.length / columns) * TRAIT_ROW - top;
  }

  // Evasion on the left, the damage-threshold scale on the right, one row.
  //
  // "Minor 10 Major 16 Severe": alternating words and boundaries, the numbers carrying the weight
  // because they are what a damage roll gets compared against. Each cell is a word plus the
  // number that follows it, so the final cell has no value and closes the scale.
  if (band.type === "defense") {
    const half = CONTENT_WIDTH / 2;
    const c = cells[0];
    if (c && draw) {
      ctx.fillStyle = MUTED;
      ctx.font = font(ROW_LABEL_SIZE, 400);
      ctx.fillText(c.label, PAD_X, y + 2);
      ctx.textAlign = "right";
      ctx.fillStyle = INK;
      ctx.font = font(ROW_VALUE_SIZE, 700);
      ctx.fillText(c.value, PAD_X + half - 24, y);
      ctx.textAlign = "left";
    }

    const parts = [];
    for (const sc of band.scale || []) {
      parts.push({ text: sc.label, strong: false });
      if (sc.value) parts.push({ text: sc.value, strong: true });
    }
    const sizeOf = (p) => (p.strong ? THRESHOLD_VALUE_SIZE : THRESHOLD_WORD_SIZE);
    const width = parts.reduce((w, p) => w + measure(ctx, p.text, sizeOf(p), p.strong), 0)
      + Math.max(0, parts.length - 1) * THRESHOLD_GAP;
    if (draw && parts.length) {
      // Right-aligned in its half, and clamped to the halfway mark so a wide scale (three-digit
      // thresholds, or every number a dash on a draft) can never run back over Evasion.
      let x = Math.max(PAD_X + half, PAD_X + CONTENT_WIDTH - width);
      for (const p of parts) {
        const sz = sizeOf(p);
        ctx.fillStyle = p.strong ? INK : MUTED;
        ctx.font = font(sz, p.strong ? 700 : 400);
        // The words are set smaller than the numbers, so with a top baseline they need nudging
        // down to sit on the same optical line.
        ctx.fillText(p.text, x, y + (p.strong ? 0 : (THRESHOLD_VALUE_SIZE - THRESHOLD_WORD_SIZE)));
        x += measure(ctx, p.text, sz, p.strong) + THRESHOLD_GAP;
      }
    }
    return y + ROW_LINE - top;
  }

  if (band.type === "slots") {
    for (const c of cells) {
      const boxes = c.boxes || 0;
      if (draw) {
        ctx.fillStyle = INK;
        ctx.font = font(ROW_LABEL_SIZE, 400);
        ctx.fillText(c.label, PAD_X, y + 2);
      }
      y += drawBoxes(ctx, boxes, PAD_X + SLOT_LABEL_WIDTH, y, draw);
      if (c.note) y += renderCaption(ctx, c.note, y, draw);
    }
    return y - top;
  }

  // "lines": label on the left, value hard right. Two cells to a row unless any of them carries
  // a caption — a capped stat's explanation ("Capped at the maximum Stress slots of 6.") needs
  // the full width to be readable, and it has to sit under the row it explains rather than under
  // whichever row happened to be beside it.
  const perRow = cells.some((c) => c.note) ? 1 : 2;
  const columnWidth = CONTENT_WIDTH / perRow;
  cells.forEach((c, i) => {
    const column = i % perRow;
    const x = PAD_X + column * columnWidth;
    if (draw) {
      // The label is truncated against the space the VALUE leaves, not against a fixed
      // fraction of the column: an Experience is a phrase the player wrote ("Fixed the
      // Duke's carriage once"), and cutting it at a guessed width would clip names that had
      // room. The number is what must never be cut, so it is measured first and the label
      // gets the rest.
      const gutter = perRow > 1 && column === 0 ? 16 : 0;
      const valueWidth = measure(ctx, c.value, ROW_VALUE_SIZE, true);
      const labelWidth = Math.max(24, columnWidth - gutter - valueWidth - 12);
      ctx.fillStyle = MUTED;
      ctx.font = font(ROW_LABEL_SIZE, 400);
      ctx.fillText(truncate(ctx, c.label, labelWidth, ROW_LABEL_SIZE, false), x, y + 2);
      ctx.textAlign = "right";
      ctx.fillStyle = INK;
      ctx.font = font(ROW_VALUE_SIZE, 700);
      ctx.fillText(c.value, x + columnWidth - gutter, y);
      ctx.textAlign = "left";
    }
    if (column === perRow - 1 || i === cells.length - 1) {
      y += ROW_LINE;
      if (c.note) y += renderCaption(ctx, c.note, y, draw);
    }
  });
  return y - top;
}

// Empty squares, one per box, all unmarked — see card-content.js on why even Hope prints empty.
// They wrap when a high Armor Score runs past the right margin rather than marching off the card.
// A count of zero (a draft with no class, so no Hit Points to have) prints the same em dash the
// printable sheet uses, because a row with no boxes and no dash reads as a printing fault.
function drawBoxes(ctx, count, x, top, draw) {
  if (count <= 0) {
    if (draw) {
      ctx.fillStyle = MUTED;
      ctx.font = font(ROW_LABEL_SIZE, 400);
      ctx.fillText("—", x, top + 2);
    }
    return SLOT_ROW;
  }
  const available = CARD_PIXEL_WIDTH - PAD_X - x;
  const perRow = Math.max(1, Math.floor((available + BOX_GAP) / (BOX_SIZE + BOX_GAP)));
  const rows = Math.ceil(count / perRow);
  if (draw) {
    ctx.strokeStyle = MUTED;
    ctx.lineWidth = BOX_STROKE;
    for (let i = 0; i < count; i++) {
      const bx = x + (i % perRow) * (BOX_SIZE + BOX_GAP);
      const by = top + Math.floor(i / perRow) * SLOT_ROW;
      // Inset by half the stroke so the outline lands inside the square it describes: strokeRect
      // centres the line on the path, and a box drawn flush to the margin would lose its right
      // edge to the crop.
      ctx.strokeRect(bx + BOX_STROKE / 2, by + BOX_STROKE / 2, BOX_SIZE - BOX_STROKE, BOX_SIZE - BOX_STROKE);
    }
  }
  return rows * SLOT_ROW;
}

// A capped-stat caption, under the row it explains — the same placement sheet.js gives it, for
// the same reason: a footnote at the bottom of a card is a footnote nobody reads mid-session.
function renderCaption(ctx, text, top, draw) {
  const lines = wrapLines(ctx, text, CONTENT_WIDTH, NOTE_SIZE, false);
  if (draw) {
    ctx.fillStyle = MUTED;
    ctx.font = font(NOTE_SIZE, 400);
    lines.forEach((line, i) => ctx.fillText(line, PAD_X, top + i * NOTE_LINE));
  }
  return lines.length * NOTE_LINE;
}

// A bold name with its text running on from it — how the weapon feature is set, and the one
// place a name and its prose share a line. The name is its own heading everywhere else; here it
// would waste a line of the block that already has the least room.
function renderRunOn(ctx, name, text, top, size, draw, indent = 0, lead = "strong") {
  const lineHeight = Math.round(size * 1.35);
  const left = PAD_X + indent;
  // The indent narrows the column too. Wrapping to the full width and merely starting further in
  // would run the right-hand edge past the margin the rest of the card keeps.
  const width = CONTENT_WIDTH - indent;
  const nameWidth = name ? measure(ctx, `${name} `, size, lead !== "muted") : 0;
  const lines = wrapLines(ctx, text, width, size, false, nameWidth);
  if (draw) {
    if (name) {
      // "strong" is a feature's own name, which owns its block. "muted" is a label in front of
      // data that matters more than it does — "Primary weapon -" before the weapon.
      ctx.fillStyle = lead === "muted" ? MUTED : INK;
      ctx.font = font(size, lead === "muted" ? 400 : 700);
      ctx.fillText(name, left, top);
    }
    ctx.fillStyle = INK;
    ctx.font = font(size, 400);
    lines.forEach((line, i) => ctx.fillText(line, left + (i === 0 ? nameWidth : 0), top + i * lineHeight));
  }
  return Math.max(1, lines.length) * lineHeight;
}

/**
 * Every band, with the one shrinkable band absorbing whatever overflow there is.
 *
 * card-content.js marks exactly one band `shrink`: the weapon feature, the only block on the
 * stats card whose length varies (median 85 characters, worst case Gravity Arbalest's 248). The
 * rest is bounded by construction, and deliberately never moves — a card whose Evasion is set
 * smaller than the Evasion on the next player's card is a card that gets misread.
 *
 * Stepping a point at a time rather than solving for a size keeps the sizes integral (canvas will
 * happily render 17.3px and it looks like it) and terminates in at most ten passes.
 */
function bandLayout(ctx, bands, available) {
  // A feature band starts at the weapon's row size; everything else at body size. Starting every
  // band at BODY_SIZE is what drew the weapon feature larger than the weapon.
  const sizes = bands.map((band) => (band.type === "feature" ? FEATURE_SIZE : BODY_SIZE));
  let gap = BAND_GAP;
  const total = () => bands.reduce((sum, band, i) => sum + renderBand(ctx, band, 0, sizes[i], false), 0)
    + Math.max(0, bands.length - 1) * gap;

  // Two levers, cheapest first. Air between bands goes before any text gets smaller: a card set
  // two points tighter is visibly worse, and four pixels of gap is not. Only then do the bands
  // that marked themselves shrinkable — the features — start stepping down.
  //
  // Both are bounded, so this terminates whatever it is handed, and neither ever touches the
  // numbers: a card whose Evasion is set smaller than the Evasion on the next player's card is a
  // card that gets misread. If both levers bottom out the clip in drawTextCard() takes over,
  // which is a visibly cut-off card rather than one with a sentence written through its footer.
  while (total() > available && gap > MIN_BAND_GAP) gap -= 1;
  const shrinkable = bands.map((band, i) => (band.shrink ? i : -1)).filter((i) => i >= 0);
  while (total() > available && shrinkable.some((i) => sizes[i] > MIN_SHRINK_SIZE)) {
    for (const i of shrinkable) if (sizes[i] > MIN_SHRINK_SIZE) sizes[i] -= 1;
  }
  return { sizes, gap };
}

// Sections — the class features and the missing-art fallback.
//
// Uniform line height and NO gap between blocks or sections, which looks under-spaced written
// down and correct on the card. paginateSections() packs by counting lines and knows nothing
// about gaps: a 6px breather added here would be invisible on a short card and would push the
// last line of a two-card class off the bottom of card 2/2, which is the half nobody re-reads.
// If this ever wants air, the air has to be a row the paginator can count.
function renderSections(ctx, sections, top, draw) {
  let y = top;
  const itemIndent = measure(ctx, BULLET, BODY_SIZE, false);
  for (const section of sections || []) {
    if (section.name) {
      const lines = wrapLines(ctx, section.name, CONTENT_WIDTH, HEADING_SIZE, true);
      lines.forEach((line, i) => {
        if (draw) {
          ctx.fillStyle = INK;
          ctx.font = font(HEADING_SIZE, 700);
          ctx.fillText(line, PAD_X, y + i * LINE_HEIGHT);
          // The tag ("Hope Feature") rides on the heading's own line, right-aligned. It has to
          // cost zero vertical space: paginateSections() emits no row for it, so a tag on a line
          // of its own would be a line the pagination never allowed for.
          if (i === 0 && section.tag) {
            ctx.textAlign = "right";
            ctx.fillStyle = MUTED;
            ctx.font = font(LABEL_SIZE, 700);
            ctx.fillText(String(section.tag).toUpperCase(), CARD_PIXEL_WIDTH - PAD_X, y + 6);
            ctx.textAlign = "left";
          }
        }
      });
      y += lines.length * LINE_HEIGHT;
    }
    for (const block of section.blocks || []) {
      if (block.type === "list") {
        for (const item of block.items || []) {
          const lines = wrapLines(ctx, item, CONTENT_WIDTH - itemIndent, BODY_SIZE, false);
          lines.forEach((line, i) => {
            if (draw) {
              ctx.fillStyle = INK;
              ctx.font = font(BODY_SIZE, 400);
              if (i === 0) ctx.fillText(BULLET, PAD_X, y);
              ctx.fillText(line, PAD_X + itemIndent, y + i * LINE_HEIGHT);
            }
          });
          y += lines.length * LINE_HEIGHT;
        }
      } else {
        const lines = wrapLines(ctx, block.text || "", CONTENT_WIDTH, BODY_SIZE, false);
        lines.forEach((line, i) => {
          if (draw) {
            ctx.fillStyle = INK;
            ctx.font = font(BODY_SIZE, 400);
            ctx.fillText(line, PAD_X, y + i * LINE_HEIGHT);
          }
        });
        y += lines.length * LINE_HEIGHT;
      }
    }
  }
  return y - top;
}

function drawTextCard(ctx, content) {
  ctx.save();
  ctx.textBaseline = "top";
  ctx.textAlign = "left";
  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, CARD_PIXEL_WIDTH, CARD_PIXEL_HEIGHT);

  drawHeader(ctx, content);
  drawFooter(ctx, content.footer);

  const bottom = bodyBottom(ctx, content.footer);
  // The clip is the backstop, and it is here for two cases that can't be designed away: the
  // worst-case stats card (five Experiences, a class track and Gravity Arbalest's Magnetic) lands
  // within a few pixels of the footer even with the weapon feature at its floor size, and a
  // fallback card is drawn unpaginated — see drawDescriptor(). Clipped text is a card that is
  // visibly cut off; unclipped text is a card whose caveat has a sentence written through it.
  ctx.save();
  ctx.beginPath();
  const top = bodyTop(content);
  ctx.rect(0, top, CARD_PIXEL_WIDTH, Math.max(0, bottom - top));
  ctx.clip();

  let y = top;
  const bands = content.bands || [];
  if (bands.length) {
    const { sizes, gap } = bandLayout(ctx, bands, bottom - top);
    bands.forEach((band, i) => {
      y += renderBand(ctx, band, y, sizes[i], true) + gap;
    });
  }
  renderSections(ctx, content.sections || [], y, true);

  ctx.restore();
  ctx.restore();
}

// ---------------------------------------------------------------------------------------------
// Art

// Centre-crop COVER, never a stretch. SRD art is exactly 5:7 so this is arithmetic that changes
// nothing there — which is precisely why it has to be written down rather than discovered: a
// homebrew source's art is whatever its author exported, and a stretched portrait is the kind of
// wrong that looks like a rendering bug in the app rather than a mismatched asset.
//
// The overflow is left to the canvas to clip rather than computed into a source rectangle: same
// pixels, one fewer expression to get backwards.
function drawCover(ctx, img) {
  const w = img.naturalWidth || img.width;
  const h = img.naturalHeight || img.height;
  if (!w || !h) return;
  const scale = Math.max(CARD_PIXEL_WIDTH / w, CARD_PIXEL_HEIGHT / h);
  const dw = w * scale;
  const dh = h * scale;
  ctx.drawImage(img, (CARD_PIXEL_WIDTH - dw) / 2, (CARD_PIXEL_HEIGHT - dh) / 2, dw, dh);
}

/**
 * Draw one descriptor onto the shared canvas. Resolves true if the art was used, false if the
 * card fell back to text.
 *
 * FILL WHITE FIRST, ALWAYS. A canvas that has not been painted is transparent black, JPEG has no
 * alpha channel, and the encoder therefore writes out a solid BLACK card — a whole page of them
 * if the art is missing. It is the single easiest thing in this file to get wrong, it costs one
 * fillRect, and it is not implied by anything else here: drawCover() covers the canvas by
 * construction and drawTextCard() paints its own background, so the bug hides until the first
 * portrait-shaped homebrew image or the first failed decode.
 */
// An <img> that has finished loading, or a rejection if the file isn't there.
//
// Deliberately not inserted into the document: nothing here is displayed, and an off-document
// image still loads because loading is eager by default. (card-render.js sets loading="lazy" on
// the images it shows, which would be wrong here — a lazy image that never enters a viewport is
// never fetched, so its onload would never fire either.)
function loadArt(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.addEventListener("load", () => resolve(img));
    img.addEventListener("error", () => reject(new Error(`card art not found: ${src}`)));
    img.src = src;
  });
}

async function drawDescriptor(ctx, descriptor) {
  if (descriptor.art) {
    let img;
    try {
      // Same-origin (everything is served out of data/), so the canvas is never tainted and
      // toBlob() will not throw a SecurityError.
      //
      // load/error listeners rather than the tidier img.decode(): decode() NEVER SETTLES here.
      // Measured in Chrome against a real card face — the image finishes loading (complete is
      // true, naturalWidth/Height read 660x924, a plain fetch of the same URL returns in 4ms)
      // and the promise still never resolves or rejects, so the export hung forever on its first
      // art card with the progress bar frozen. An await that never settles cannot be caught, and
      // no unit test can see it, which is why this is the one thing in the deck path verified by
      // driving the real page. card-render.js reaches for the same listeners for the same reason.
      img = await loadArt(descriptor.art);
    } catch {
      // Unpaginated on purpose: cardSheet() fixed the slot count before anything knew this file
      // was missing, and inserting a second physical card here would shift every card after it
      // onto a different slot — and page. The clip in drawTextCard() bounds the damage. In
      // practice the fallbacks are short (one subclass tier, one domain card, one ancestry); the
      // long text in the deck is on the class cards, which are generated and paginated properly.
      drawTextCard(ctx, descriptor.fallback || fallbackCardContent(descriptor));
      return false;
    }
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, CARD_PIXEL_WIDTH, CARD_PIXEL_HEIGHT);
    drawCover(ctx, img);
    return true;
  }
  // A generated card carries its content; fallbackCardContent() is the belt-and-braces path for a
  // descriptor that somehow has neither art nor content, and draws a titled card rather than a
  // blank one.
  drawTextCard(ctx, descriptor.content || fallbackCardContent(descriptor));
  return true;
}

async function encodeCard(canvas) {
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY));
  if (!blob) throw new Error("card-pdf: the browser declined to encode a card as JPEG");
  return new Uint8Array(await blob.arrayBuffer());
}

// ---------------------------------------------------------------------------------------------

// The stats card and the class cards, as descriptors, ready to lead the deck.
//
// Both go through paginateSections() — uniformly, including the stats card, which has no sections
// and comes back unchanged. Four of fifteen classes overflow one card (Druid is 1171 characters
// against a body that holds around a thousand), so this is the normal path and not an edge case.
function generatedDescriptors(ctx, character, db) {
  const out = [];
  const push = (kind, baseKey, content) => {
    for (const [i, page] of paginateSections(content, textOpts(ctx, content)).entries()) {
      out.push({
        kind,
        // The unsuffixed key is the common case and the one the contract names ("stats",
        // "class-1"); a continuation gets a suffix rather than renumbering, so a Druid's second
        // card doesn't take the key its multiclass card would have had.
        key: i === 0 ? baseKey : `${baseKey}-${i + 1}`,
        title: page.title,
        art: null,
        record: null,
        content: page,
      });
    }
  };
  push("stats", "stats", statsCardContent(character, db));
  classCardContents(character, db).forEach((content, i) => push("class", `class-${i + 1}`, content));
  return out;
}

/**
 * The whole export: character in, PDF bytes out.
 *
 * @param {object} character a stored character; drafts are fine and print what they have.
 * @param {object} db the merged content database.
 * @param {{onProgress?: (done: number, total: number, title: string) => void}} opts
 * @returns {Promise<{bytes: Uint8Array, cardCount: number, pageCount: number,
 *   missing: Array<{kind: string, id: string}>, fellBack: string[]}>}
 */
export async function buildCardPdf(character, db, opts = {}) {
  const onProgress = typeof opts.onProgress === "function" ? opts.onProgress : () => {};

  // ONE canvas, reused for every card. Twenty-two canvases would be twenty-two 660x924 RGBA
  // backing stores — about 2.4MB each, 53MB of them — held live until GC got round to it, on a
  // page that is also holding twenty-two JPEGs. Reuse costs a fillRect per card.
  const canvas = document.createElement("canvas");
  canvas.width = CARD_PIXEL_WIDTH;
  canvas.height = CARD_PIXEL_HEIGHT;
  const ctx = canvas.getContext("2d");
  ctx.textBaseline = "top";

  // The canvas exists before the deck does because paginateSections() needs its measureText: the
  // generated cards can't be built until something can say how wide a word is.
  const { cards, missing } = cardSheet(character, db, { generated: generatedDescriptors(ctx, character, db) });
  if (!cards.length) {
    // A guard, not a path anything takes today: the stats card is generated rather than owned, so
    // even a draft with no class, no ancestry and no cards comes back with one card in the deck
    // (dashes where the numbers aren't known yet, and empty slot boxes, which is a usable thing to
    // print). Kept because buildPdf() would otherwise refuse the zero-page document with a message
    // about PDFs rather than about the character.
    throw new RangeError("This character has no cards to print yet.");
  }

  const images = [];
  const imageForCard = [];
  const fellBack = [];
  // Two cards sharing one art file (a mixed ancestry that names the same one twice) embed one
  // XObject: the JPEG for a decoded art file is a pure function of the file, so the second card
  // can point at the first one's bytes. Only for art — a generated card's pixels depend on the
  // character, and a fallback's on the descriptor.
  const byArt = new Map();

  // Sequential, not Promise.all. Three reasons, all of them the point: the progress number is
  // honest, only one decoded image and one canvas are live at a time, and the work is bounded
  // anyway — twenty-two loads and encodes come in under two seconds. The load listener and toBlob
  // callback both yield to the event loop, so the modal repaints between cards without an
  // explicit setTimeout(0).
  for (let i = 0; i < cards.length; i++) {
    const card = cards[i];
    const cached = card.art ? byArt.get(card.art) : undefined;
    if (cached !== undefined) {
      imageForCard.push(cached);
      onProgress(i + 1, cards.length, card.title);
      continue;
    }
    const usedArt = await drawDescriptor(ctx, card);
    if (card.art && !usedArt) fellBack.push(card.title);
    const index = images.length;
    images.push({ bytes: await encodeCard(canvas), width: CARD_PIXEL_WIDTH, height: CARD_PIXEL_HEIGHT });
    if (card.art && usedArt) byArt.set(card.art, index);
    imageForCard.push(index);
    onProgress(i + 1, cards.length, card.title);
  }

  // A backs page would go here: paginate() the same count again, give every slot the one back
  // image, mirror the columns (slot 0<->2, 3<->5, 6<->8) so backs land under fronts, and
  // interleave the two page lists. That mirroring belongs in card-layout.js, which says so.
  const pages = paginate(cards.length).map((page) => ({
    draws: page.slots.map(({ card, rect }) => ({
      image: imageForCard[card],
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height,
    })),
    // All sixteen marks on every page including a short last one — they describe the grid, not
    // the cards on it. lineGray 0 is black; MARK_WIDTH is card-layout.js's measured 0.24pt, and
    // it is passed rather than defaulted because pdf.js deliberately doesn't know about crop
    // marks.
    lines: cropMarks(),
    lineWidth: MARK_WIDTH,
    lineGray: 0,
  }));

  return {
    bytes: buildPdf({ width: PAGE_WIDTH, height: PAGE_HEIGHT, images, pages }),
    cardCount: cards.length,
    pageCount: pages.length,
    missing,
    fellBack,
  };
}

