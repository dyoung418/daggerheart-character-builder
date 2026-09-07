// The Ranger Companion sidecar export's one impure stage: a template file in, a filled copy out.
//
// At the repo root, not in shared/, for the reason sheet-pdf.js and stance-sidecar-pdf.js give in
// their headers: everything with a rule in it is reachable from tests/, and this file has none. It
// fetches — forbidden in shared/ — and hands off to two modules that do all the deciding:
//
//   shared/companion-sidecar-fields.js  which boxes get text and which checkboxes get ticked, and
//                                       which options the fixed official form has no box for
//   shared/pdf-form.js                  the bytes: the incremental update writing /V and /AS
//
// THE TEMPLATE IS NOT IN THIS REPO, AND THAT IS THE NORMAL CASE
// -----------------------------------------------------------
// data/sheet/ is a symlink into a private content repo; the sidecar template is a copyrighted PDF
// and can't ship in a public fork. So for everyone but the maintainer the fetch below 404s,
// companionSidecarTemplate() resolves null, and characters.js leaves the export out. This mirrors
// sheet-pdf.js and stance-sidecar-pdf.js exactly.

import { fillFormWithReport } from "./shared/pdf-form.js";
import { companionSidecarFieldValues } from "./shared/companion-sidecar-fields.js";

const TEMPLATE_PATH = "data/sheet/companion-sidecar-template.pdf";

let templatePromise = null;

/**
 * The sidecar template bytes, or null when this browser hasn't got the template installed.
 * Memoised — characters.js asks on startup to decide whether to offer the export, and again for
 * every export. A null is remembered too, so installing the template mid-session takes a reload.
 *
 * @returns {Promise<Uint8Array|null>}
 */
export function companionSidecarTemplate() {
  if (templatePromise === null) {
    templatePromise = (async () => {
      try {
        const res = await fetch(TEMPLATE_PATH);
        if (!res.ok) return null;
        return new Uint8Array(await res.arrayBuffer());
      } catch {
        return null;
      }
    })();
  }
  return templatePromise;
}

/**
 * The whole export: the companion display data and its marked Stress in, a filled PDF and the
 * record of what it couldn't place out.
 *
 * @param {{companion: object, companionStress: number}} args  handed straight to
 *   companionSidecarFieldValues — the caller derives `companion` (companionStats()), this file
 *   never reads a character.
 * @returns {Promise<{bytes: Uint8Array, unplaced: string[]}>}
 *
 * `unplaced` — a homebrew companion option the fixed official form has no checkbox for —
 * characters.js surfaces beside the export the way it surfaces sheet-pdf.js's `truncated`.
 */
export async function buildCompanionSidecarPdf({ companion, companionStress }) {
  const template = await companionSidecarTemplate();
  if (template === null) {
    throw new Error(
      `The companion sidecar template isn't installed: ${TEMPLATE_PATH} wasn't found. ` +
      "It's a copyrighted file, so it isn't shipped with the app.",
    );
  }

  // appearances: false — the sidecar is all checkboxes and short text, so there's no appearance
  // stream to compose; pdf-form.js writes no /AP for a checkbox in either mode. The one loss this
  // export can have is `unplaced`, which is what comes back.
  const { values, unplaced } = companionSidecarFieldValues({ companion, companionStress });
  const { bytes } = fillFormWithReport(template, values, { appearances: false });
  return { bytes, unplaced };
}
