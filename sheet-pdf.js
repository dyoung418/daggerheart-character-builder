// The official-sheet export's one impure stage: a template file in, a filled copy of it out.
//
// WHY THIS FILE IS AT THE REPO ROOT AND NOT IN shared/
// ----------------------------------------------------
// The same line card-pdf.js's header draws, for the same reason its header gives: everything with
// a rule in it is reachable from tests/, and this file has no rules in it. It fetches — which is
// exactly what a shared/ module is forbidden to do — and then composes two pure modules that do
// all of the deciding:
//
//   shared/sheet-fields.js  what each named field says: which number is Evasion, what
//                           `class-subclass` reads for a multiclassed character, what an
//                           unfilled slot prints instead of a number
//   shared/sheet-marks.js   what gets DRAWN rather than typed: the HP and Stress boxes this
//                           character actually has, and their Proficiency pips
//   shared/pdf-form.js      the bytes: which fields the template actually has, and the
//                           incremental update that fills them
//
// So the honest summary of this file is: it fetches, and it hands off. If you find yourself
// deciding here what a field should say, or which of two disagreeing numbers is the real one, it
// belongs in shared/sheet-fields.js, where a test can reach it — this file having an opinion about
// a field would mean two places to look when the sheet prints the wrong thing, and only one of
// them under test.
//
// THE TEMPLATE IS NOT IN THIS REPO, AND THAT IS THE NORMAL CASE
// -------------------------------------------------------------
// data/sheet/ is a symlink into a private content repo, the way data/void and data/hopeandfear
// already are: the official character sheet is a copyrighted PDF and cannot ship in a public fork.
// So for everyone but the maintainer the fetch below 404s, sheetTemplate() resolves null, and
// characters.js leaves the export out of the detail view entirely. Null is a state this export
// has, not a failure it suffered — the only thing that treats it as an error is buildSheetPdf(),
// and only because being asked to fill a template that isn't there means a caller skipped the
// check.

import { fillFormWithReport } from "./shared/pdf-form.js";
import { sheetFieldValues } from "./shared/sheet-fields.js";
import { slotMarkOps } from "./shared/sheet-marks.js";

const TEMPLATE_PATH = "data/sheet/sheet-template.pdf";

// The memo is on the PROMISE, not on the resolved bytes, so two callers that arrive before the
// first fetch settles share one request rather than starting a second. It never resets: a null
// result is remembered too, so installing the template mid-session takes a reload. That is the
// right trade for a file that appears once, by hand, on one machine. Nothing on a render path ever
// probes — characters.js reads a module-level boolean it resolved in init() — so the memo is
// earning its keep on the export path and on remembering a null, not on saving a fetch per click.
let templatePromise = null;

/**
 * The template bytes, or null when this browser hasn't got the template installed.
 *
 * Memoised because characters.js asks on startup and buildSheetPdf() asks again for every export,
 * and the template is 469,823 bytes (measured 2026-09-01, after the page-2 normalisation; an
 * earlier reading of the same file, which several comments used to quote, was 453,448).
 *
 * @returns {Promise<Uint8Array|null>}
 */
export function sheetTemplate() {
  if (templatePromise === null) {
    templatePromise = (async () => {
      try {
        // The 404 this logs in a clean checkout is accepted, and it is the same trade
        // shared/content-load.js:64-67 already documents for sources.local.json: the alternative
        // is a manifest or a setting listing what's installed, which is a second thing to keep in
        // step with what's actually on disk. One console line, once per page load.
        const res = await fetch(TEMPLATE_PATH);
        if (!res.ok) return null;
        return new Uint8Array(await res.arrayBuffer());
      } catch {
        // A network-layer failure (offline, file:// with no server) reads the same as absent
        // here, deliberately: both mean "there is no template to fill", and the caller's answer
        // to both is to not offer the export. readText() in shared/content-load.js:21-29 collapses
        // the same two cases for the same reason.
        return null;
      }
    })();
  }
  return templatePromise;
}

/**
 * The whole export: character in, a filled PDF and the record of what it could not do out.
 *
 * @param {object} character a stored character; drafts are fine and fill what they have.
 * @param {object} db the merged content database.
 * @param {{loadout?: boolean, appearances?: boolean}} opts
 *   `loadout` — whether the cards in the loadout count toward the numbers. Passed straight
 *   through, UNDEFAULTED: which of the two sheets is the default is a rule about what a printed
 *   sheet ought to say, and shared/sheet-fields.js owns it. A default restated here would be a
 *   second opinion, and the day the two disagree this one wins silently.
 *
 *   `appearances` — whether we draw the text ourselves. Defaulted HERE, and the difference from
 *   `loadout` one line up is the whole reason this comment is long. No pure module has an opinion
 *   to defer to: shared/pdf-form.js does default it, to false, but that is a library's answer to
 *   "the caller did not ask", and it is also the path everything falls back to, so it has to stay
 *   the conservative one. Which of the two the APP ships is a product decision about readers and
 *   printers, and this file is the app's edge. True, because the checkbox in characters.js is
 *   checked by default and the two must not be able to disagree — see that modal for the wording
 *   and shared/pdf-form.js's header for what each mode costs.
 * @returns {Promise<{bytes: Uint8Array, fellBack: (null|object), truncated: string[]}>}
 *
 * A RECORD, NOT BARE BYTES, following buildCardPdf (card-pdf.js:814) — and for its reason, not for
 * symmetry. Both exports can succeed and still lose something a user would want to know about, and
 * a caller handed only bytes has no way to find out: the card export names the cards that printed
 * as text, and this one names a document that fell back to the reader's own layout and each field
 * cut at the 6pt floor. shared/pdf-form.js's FillReport typedef defines both, including the two
 * losses deliberately absent from them.
 */
export async function buildSheetPdf(character, db, { loadout, appearances = true } = {}) {
  const template = await sheetTemplate();
  if (template === null) {
    // Not the path a user takes — the export isn't offered without a template — so this is a
    // guard against a caller that didn't check, and it says which file rather than "failed to
    // load" so the answer is in the message and not in the network tab.
    throw new Error(
      `The official sheet template isn't installed: ${TEMPLATE_PATH} wasn't found. ` +
      "It's a copyrighted file, so it isn't shipped with the app.",
    );
  }

  // fillFormWithReport() reads the template itself, so this file never holds a parsed form and
  // never learns what a widget carries. That is the point: PDF structure is pdf-form.js's business
  // at both ends. It also means the field names come from the template AS IT STANDS rather than
  // from a list written down beside it, so a template re-authored with a field renamed fills short
  // instead of filling wrong.
  //
  // The report is returned as it arrives, unread. What counts as worth telling a user is a
  // question about a modal, and characters.js answers it; this file deciding would put half the
  // answer somewhere no test can reach it.
  // ONE call to sheetFieldValues, and the marks are read back out of its result rather than
  // derived again. shared/sheet-marks.js's header argues why at length; the short version is that
  // the drawing and the number printed beside it have to be the same fact, and two derivations of
  // one number is how they stop being.
  const values = sheetFieldValues(character, db, { loadout });
  return fillFormWithReport(template, values, { appearances, overlays: { 0: slotMarkOps(values) } });
}
