// Where a card goes on the page.
//
// Every number here was measured off the reference sheet the printer produced
// (`cardexportexample.pdf`, read at 300dpi), not chosen — so nothing in this file should be
// "tidied" toward a rounder value. The layout is US Letter, nine poker cards to a page, laid
// edge to edge with no gutter: cards are cut apart on shared lines, so a gutter would only add
// waste and a second cut per seam.
//
// Two things follow from "no gutter" and are the reason this module exists at all:
//
//   - There is nowhere inside the block to draw a crop mark, so the marks live in the outer
//     margins and stand in for the interior lines as well.
//   - The margins are asymmetric (36pt left/right, 18pt top/bottom) because 3x180 and 3x252
//     leave different slack in each axis. Do not average them; the cards would stop being
//     2.5x3.5in.
//
// Pure data and arithmetic: no DOM, no canvas. The canvas walk in card-pdf.js reads these
// rectangles, and tests/ can assert every coordinate without rendering anything.

export const PAGE_WIDTH = 612;
export const PAGE_HEIGHT = 792;

// 2.5in x 3.5in at 72pt/in — poker size, which is what the card art is drawn at (660x924 = 5:7).
export const CARD_WIDTH = 180;
export const CARD_HEIGHT = 252;

export const COLUMNS = 3;
export const ROWS = 3;
export const CARDS_PER_PAGE = COLUMNS * ROWS;

// (612 - 3*180) / 2 = 36, and (792 - 3*252) / 2 = 18. Stated as constants rather than computed
// so a reviewer can check them against the measurement in one glance.
export const MARGIN_X = 36;
export const MARGIN_Y = 18;

// Crop marks: hairline, short, and held off the card block so the blade has something to aim at
// without the ink ever crossing into the art. 0.24pt is one 300dpi pixel — thinner and a laser
// printer may drop it entirely.
export const MARK_LENGTH = 7.2;
export const MARK_GAP = 4.32;
export const MARK_WIDTH = 0.24;

// The four cut lines in each axis, including the two interior ones. GRID_X is
// MARGIN_X + n*CARD_WIDTH and GRID_Y_FROM_TOP is MARGIN_Y + n*CARD_HEIGHT; they are written out
// because they are what was measured, and the fact that the identity holds is itself the check.
//
// GRID_Y_FROM_TOP is top-down, as measured — see pdfY below, which is the only place that ever
// stops being true.
export const GRID_X = [36, 216, 396, 576];
export const GRID_Y_FROM_TOP = [18, 270, 522, 774];

// THE Y-FLIP. It lives here and nowhere else in the codebase.
//
// PDF's origin is the bottom-left corner with y growing upward; the grid above was measured
// from the top of the page down, the way every layout tool states a page. A second copy of
// "PAGE_HEIGHT - something" in a caller is how a sheet ends up mirrored top-to-bottom with each
// half looking individually correct — the failure is invisible until the cards are cut.
const pdfY = (fromTop) => PAGE_HEIGHT - fromTop;

// Crop-mark coordinates are sums of measured decimals, and binary floating point turns
// 774 + 4.32 + 7.2 into 785.5200000000001. The PDF writer caps numbers at 4dp so this never
// reaches the file, but an unrounded value makes every equality test read like a puzzle and
// invites someone to "fix" the constant instead. Rounded where the arithmetic happens; 4dp is
// three orders of magnitude finer than the 1/300in the page was measured at.
const round = (n) => Math.round(n * 1e4) / 1e4;

/**
 * The rectangle for one slot, slot 0 being top-left and slot 8 bottom-right — reading order, so
 * a caller can hand cards to slots in the order they appear in the deck and get the stack back
 * in that order after cutting.
 *
 * Returns lower-left origin in PDF coordinates, ready for a `cm` matrix.
 */
export function slotRect(slot) {
  if (!Number.isInteger(slot) || slot < 0 || slot >= CARDS_PER_PAGE) {
    // Loud, because the alternative is GRID_X[undefined] quietly drawing a card at NaN, which
    // some viewers render as a missing image and others as nothing at all.
    throw new RangeError(`slot ${slot} is outside 0..${CARDS_PER_PAGE - 1}`);
  }
  const column = slot % COLUMNS;
  const row = Math.floor(slot / COLUMNS);
  return {
    // A card's *lower* edge is the next grid line down, i.e. its top plus a card height — which
    // is the same as GRID_Y_FROM_TOP[row + 1]. Written as the sum so the row index doesn't have
    // to be trusted to stay one short of the grid.
    x: GRID_X[column],
    y: pdfY(GRID_Y_FROM_TOP[row] + CARD_HEIGHT),
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
  };
}

/**
 * The 16 crop marks, as segments {x1, y1, x2, y2} in PDF coordinates.
 *
 * Four per margin: one for every grid line in that axis, interior lines included, since there is
 * no gutter to draw them in. Identical on every page, which is why this takes no arguments —
 * including on a partial last page. The marks describe the *grid*, not the cards on it: cutting
 * a uniform grid is one straight pass per line, whereas marks that stop where the cards stop
 * would have the cutter aiming around gaps. Surplus slots simply come out as blank card stock.
 */
export function cropMarks() {
  const top = pdfY(GRID_Y_FROM_TOP[0]);
  const bottom = pdfY(GRID_Y_FROM_TOP[GRID_Y_FROM_TOP.length - 1]);
  const left = GRID_X[0];
  const right = GRID_X[GRID_X.length - 1];
  const marks = [];
  // Vertical ticks in the top and bottom margins, pointing away from the block.
  for (const x of GRID_X) {
    marks.push({ x1: x, y1: round(top + MARK_GAP), x2: x, y2: round(top + MARK_GAP + MARK_LENGTH) });
    marks.push({ x1: x, y1: round(bottom - MARK_GAP), x2: x, y2: round(bottom - MARK_GAP - MARK_LENGTH) });
  }
  // Horizontal ticks in the left and right margins. Same flip as the slots, same one function.
  for (const fromTop of GRID_Y_FROM_TOP) {
    const y = pdfY(fromTop);
    marks.push({ x1: round(left - MARK_GAP), y1: y, x2: round(left - MARK_GAP - MARK_LENGTH), y2: y });
    marks.push({ x1: round(right + MARK_GAP), y1: y, x2: round(right + MARK_GAP + MARK_LENGTH), y2: y });
  }
  return marks;
}

/**
 * Deal `cardCount` cards across pages: `[{slots: [{card, rect}]}]`, where `card` is the card's
 * index in the caller's list. This module knows geometry and nothing about what a card *is*, so
 * it hands back indices and the caller keeps its own array.
 *
 * A short last page carries only the slots it fills — there is nothing to draw in a blank slot,
 * and the crop marks are page-wide anyway. Zero cards gives zero pages rather than one empty
 * sheet; characters.js refuses the export before it gets here, but a PDF with a `/Count 0` page
 * tree would be a corrupt file rather than an empty-looking one.
 *
 * A double-sided variant would deal a second page after each of these with the columns mirrored
 * (slot 0 <-> 2, 3 <-> 5, 6 <-> 8) so backs land under fronts; that is the whole change, and it
 * belongs here rather than in the writer.
 */
export function paginate(cardCount) {
  const pages = [];
  for (let first = 0; first < cardCount; first += CARDS_PER_PAGE) {
    const slots = [];
    for (let slot = 0; slot < CARDS_PER_PAGE && first + slot < cardCount; slot += 1) {
      slots.push({ card: first + slot, rect: slotRect(slot) });
    }
    pages.push({ slots });
  }
  return pages;
}
