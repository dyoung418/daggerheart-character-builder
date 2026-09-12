// The page half of an export that writes a file: the progress modal, the download itself, and the
// panels that say what a finished render lost. Everything with a rule in it — which cards a
// character owns, where they land on the page, what the generated cards say — is in card-pdf.js
// and the pure modules it calls; what's here is markup and a Blob.
//
// Deliberately untested, and the same call the other shared DOM modules make (card-render.js,
// popover.js, lightbox.js): there is nothing to assert here that isn't "a <p> was appended", and
// the suite imports no page file anyway. What checks this module is loading the page and reading
// the console.
//
// It is in shared/ because a second page is about to export cards: characters.js does one
// character's deck, app.js's card browser does a selection out of the whole catalogue. The print
// advice is the part that must not drift between them — it is the difference between cards that
// fit a sleeve and cards that don't — so it is written once, here, rather than copied.
//
// characters.js is the only importer at the moment. That is the state of this commit, not the
// reason the module exists; if the browser export is ever dropped, this belongs back in the page.

import { closePopover, openModal } from "./popover.js";
import { plural } from "./text.js";

// The only thing in the app that writes a file. Every export goes through it: the CSV and the
// transfer file hand it a string, the card decks, the official sheet and the two sidecars hand it a
// Uint8Array. Blob takes either without being told which, so nothing here has to branch — hence
// `data`, not `text`. (It read "all four exports" until 2026-09-12, when it was six and counting;
// the number was the part that kept going stale, so it no longer names one.)
export function downloadFile(filename, data, mime) {
  const blob = new Blob([data], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// One stamp for every export that names a file — the CSV, the cards, the sheet — so today's run
// can't overwrite the one you did before you levelled up. Shared rather than repeated because the
// day this goes local (toISOString is UTC, so a 7pm PDT export stamps tomorrow) the three have to
// move together, or one run writes two dates across the folder.
export const dateStamp = () => new Date().toISOString().slice(0, 10);

/**
 * The markup half of a long export: a hint, a progress bar and a status line, opened in the shared
 * modal. The caller keeps the three nodes and writes to them as the render reports in.
 *
 * The hint is the caller's, not this module's: what goes in the file is the page's business, and
 * the one thing this modal must not do is describe an export it doesn't perform.
 *
 * @param {string} title the modal's title
 * @param {string} hint what this export puts in the file
 * @param {string} firstLine the status line before the first progress callback arrives
 * @returns {{body: HTMLElement, bar: HTMLProgressElement, line: HTMLElement}}
 */
export function openProgressModal(title, hint, firstLine) {
  const body = document.createElement("div");

  const hintEl = document.createElement("p");
  hintEl.className = "hint";
  hintEl.textContent = hint;
  body.appendChild(hintEl);

  const wrap = document.createElement("div");
  wrap.className = "export-progress";
  // Created with neither max nor value, so it renders indeterminate until the first card
  // reports in — which is the honest state. How many cards there are is the card sheet's
  // answer, arriving with that first callback; a bar starting at 0 of a guessed maximum would
  // be a lie that then visibly jumps when the real total lands.
  const bar = document.createElement("progress");
  const line = document.createElement("p");
  line.className = "hint";
  line.textContent = firstLine;
  wrap.appendChild(bar);
  wrap.appendChild(line);
  body.appendChild(wrap);

  openModal(title, body);
  return { body, bar, line };
}

// Split out so the modal above is just markup: this is the half that can fail. Each card is an
// image decode plus a JPEG encode, both of which yield, so the bar repaints on its own without
// anything here having to hand control back to the browser.
//
// `build` is handed the progress callback and returns card-pdf.js's record; `filename` is a thunk
// rather than a string because it is only answered once the render is done — it stamps the date,
// and a name computed before a long render could carry yesterday's.
export async function runCardPdfExport({ body, bar, line, build, filename, empty }) {
  let result;
  try {
    result = await build({
      onProgress: (done, total, title) => {
        bar.max = total;
        bar.value = done;
        line.textContent = title
          ? `Rendering card ${done} of ${total} — ${title}`
          : `Rendering card ${done} of ${total}`;
      },
    });
  } catch (err) {
    // Not a parameter, unlike `empty`: both callers render cards the same way and fail the same
    // way, so the one sentence that describes it belongs in one place.
    showExportProblem(body, "The cards couldn't be rendered, so nothing was saved. " +
      (err && err.message ? err.message : String(err)));
    return;
  }

  // A character with nothing chosen yet would export a page of blank slots, so say so instead
  // of saving one. Read off the result rather than counted again up here: which cards exist is
  // the card sheet's answer to give, and a second opinion is a second thing to get wrong.
  if (!result.cardCount) {
    showExportProblem(body, empty);
    return;
  }

  downloadFile(filename(), result.bytes, "application/pdf");
  showCardPdfAdvice(body, result);
}

// Every ending rewrites the body of the modal that's already open rather than opening a new
// one. If the render outlasted the modal — Escape, or the close button — this body is detached
// and writing to it does nothing, which is the right outcome: reopening would shove a panel
// back over whatever the user went off and did instead.
//
// Named for exports rather than for cards because both PDF exports fail into it, and the answer
// is the same either way: a problem box and a Close button. A second copy under a second name
// would be two places to fix the day the wording or the class name changes.
export function showExportProblem(body, message) {
  body.innerHTML = "";
  const box = document.createElement("div");
  box.className = "problem-box";
  box.textContent = message;
  body.appendChild(box);
  appendExportClose(body);
}

// The modal stays open on success. A self-closing one would fire the download and take the
// print settings away with it in the same instant, and those settings are the difference
// between cards that fit a card sleeve and cards that don't.
export function showCardPdfAdvice(body, result) {
  body.innerHTML = "";

  const advice = document.createElement("p");
  advice.appendChild(document.createTextNode(
    `${plural(result.cardCount, "card")} over ${plural(result.pageCount, "page")}. Print at `,
  ));
  // The one instruction that ruins the export if it's missed: "fit to page" is most printers'
  // default and it scales everything down a few percent, which is invisible until you measure
  // a cut card against a sleeve. Emphasised rather than merely stated.
  const scale = document.createElement("strong");
  scale.textContent = "100%";
  advice.appendChild(scale);
  advice.appendChild(document.createTextNode(
    ", not “fit to page”, and cut along the crop marks — each card comes out 2.5 × 3.5 in. " +
    "There is no bleed, so cut on the marks: misregistration shows a sliver of the neighbouring card.",
  ));
  body.appendChild(advice);

  // Named, not silent. A deck that's quietly two cards short reads as a bug in the export;
  // knowing the count and the cause points at the content settings, which is where the fix is.
  const missing = result.missing || [];
  if (missing.length > 0) {
    const note = document.createElement("p");
    note.className = "hint";
    note.textContent = `${plural(missing.length, "card")} couldn't be included — a content ` +
      "source this character was built with is switched off, renamed or missing.";
    body.appendChild(note);
  }

  // A different failure with a different fix: the card is in the deck, it just printed as its
  // rules text instead of its picture. Worth saying, because a mixed deck otherwise looks like
  // the renderer gave up halfway.
  const fellBack = result.fellBack || [];
  if (fellBack.length > 0) {
    const note = document.createElement("p");
    note.className = "hint";
    note.textContent = `${plural(fellBack.length, "card")} printed as text because ` +
      `${fellBack.length === 1 ? "its" : "their"} art wasn't found.`;
    body.appendChild(note);
  }

  appendExportClose(body);
}

// The button is built here rather than through a page's button() helper: this is the one button
// shared/ needs, and importing a page module to get it would point a shared module at a page.
export function appendExportClose(body) {
  const row = document.createElement("div");
  row.className = "export-choices";
  const close = document.createElement("button");
  close.className = "btn-primary";
  close.textContent = "Close";
  close.addEventListener("click", closePopover);
  row.appendChild(close);
  body.appendChild(row);
}
