// The stance sidecar export's one impure stage: a template file in, a filled copy of it out.
//
// WHY THIS FILE IS AT THE REPO ROOT AND NOT IN shared/
// ----------------------------------------------------
// The same line sheet-pdf.js and card-pdf.js draw in their headers, for the reason those headers
// give: everything with a rule in it is reachable from tests/, and this file has no rules in it.
// It fetches — which is exactly what a shared/ module is forbidden to do — and then hands off to
// two modules that do all the deciding:
//
//   shared/stance-sidecar-fields.js  which of the 22 boxes get ticked, and which known stances
//                                    the fixed official form has no box for
//   shared/pdf-form.js               the bytes: the incremental update that writes /V and /AS and
//                                    chains a new xref section onto the template
//
// So the honest summary of this file is: it fetches, and it hands off. A rule that landed here —
// which stances a character knows, what Focus they sit at — would be a rule no test could reach,
// and a second place to look when the sidecar prints the wrong boxes.
//
// THE TEMPLATE IS NOT IN THIS REPO, AND THAT IS THE NORMAL CASE
// -------------------------------------------------------------
// data/sheet/ is a symlink into a private content repo, the way data/void and data/hopeandfear
// already are: the sidecar template is a copyrighted PDF and cannot ship in a public fork. So for
// everyone but the maintainer the fetch below 404s, stanceSidecarTemplate() resolves null, and
// characters.js leaves the export out of the detail view entirely. Null is a state this export
// has, not a failure it suffered — the only thing that treats it as an error is
// buildStanceSidecarPdf(), and only because being asked to fill a template that isn't there means
// a caller skipped the check. This mirrors sheet-pdf.js exactly; that file's header carries the
// longer version of every paragraph here.

import { fillFormWithReport } from "./shared/pdf-form.js";
import { stanceSidecarFieldValues } from "./shared/stance-sidecar-fields.js";

const TEMPLATE_PATH = "data/sheet/stance-sidecar-template.pdf";

// The memo is on the PROMISE, not on the resolved bytes, so two callers that arrive before the
// first fetch settles share one request rather than starting a second. It never resets: a null
// result is remembered too, so installing the template mid-session takes a reload. That is the
// right trade for a file that appears once, by hand, on one machine — the same call sheet-pdf.js's
// sheetTemplate() makes.
let templatePromise = null;

/**
 * The sidecar template bytes, or null when this browser hasn't got the template installed.
 *
 * Memoised because characters.js asks on startup (to decide whether to offer the export) and
 * buildStanceSidecarPdf() asks again for every export.
 *
 * @returns {Promise<Uint8Array|null>}
 */
export function stanceSidecarTemplate() {
  if (templatePromise === null) {
    templatePromise = (async () => {
      try {
        // The 404 this logs in a clean checkout is accepted, the same trade sheet-pdf.js and
        // shared/content-load.js already document: the alternative is a manifest listing what's
        // installed, a second thing to keep in step with what's actually on disk.
        const res = await fetch(TEMPLATE_PATH);
        if (!res.ok) return null;
        return new Uint8Array(await res.arrayBuffer());
      } catch {
        // A network-layer failure (offline, file:// with no server) reads the same as absent here,
        // deliberately: both mean "there is no template to fill", and the caller's answer to both
        // is to not offer the export.
        return null;
      }
    })();
  }
  return templatePromise;
}

/**
 * The whole export: a known-stance set and a Focus in, a filled PDF and the record of what it
 * could not place out.
 *
 * @param {{knownStanceIds: string[], focus: number}} args  handed straight to
 *   stanceSidecarFieldValues — the caller resolves the ids, this file never reads a character.
 * @param {object} db  the merged content db; used only to name an unplaced homebrew stance.
 * @returns {Promise<{bytes: Uint8Array, unplaced: string[]}>}
 *
 * A RECORD, NOT BARE BYTES, following buildSheetPdf: the export can succeed and still have left
 * something out that a user would want to know about. Here that is `unplaced` — a known stance the
 * fixed official form has no checkbox for (a homebrew stance) — and characters.js surfaces it
 * beside the export the way it surfaces sheet-pdf.js's `truncated`.
 */
export async function buildStanceSidecarPdf({ knownStanceIds, focus }, db) {
  const template = await stanceSidecarTemplate();
  if (template === null) {
    // Not the path a user takes — the export isn't offered without a template — so this is a guard
    // against a caller that didn't check, and it names the file rather than saying "failed to
    // load" so the answer is in the message and not in the network tab.
    throw new Error(
      `The stance sidecar template isn't installed: ${TEMPLATE_PATH} wasn't found. ` +
      "It's a copyrighted file, so it isn't shipped with the app.",
    );
  }

  // fillFormWithReport() reads the template itself, so this file never holds a parsed form and
  // never learns what a widget carries. The field names come from stance-sidecar-fields.js and the
  // widgets from the template AS IT STANDS, so a template re-authored with a checkbox renamed
  // fills short instead of filling wrong.
  //
  // appearances: false because the sidecar is ALL checkboxes and no text: there is no appearance
  // stream to compose, and pdf-form.js writes no /AP for a checkbox in either mode (pdf-form.js:199
  // — "Checkboxes are the other half of the same story, and NO code path here writes an /AP for
  // one"). The report it returns (`fellBack`, `truncated`) is therefore empty for an all-checkbox
  // value map and is dropped here; the one loss this export can actually have is
  // stance-sidecar-fields.js's `unplaced`, and that is what comes back.
  const { values, unplaced } = stanceSidecarFieldValues({ knownStanceIds, focus, db });
  const { bytes } = fillFormWithReport(template, values, { appearances: false });
  return { bytes, unplaced };
}
