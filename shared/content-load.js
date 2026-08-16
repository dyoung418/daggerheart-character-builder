// Reading the content sources off disk. The impure half of content-sources.js: this file does the
// fetching and the localStorage, and hands everything else to the pure merge.
//
// Deliberately thin, because none of it is unit-testable — it's verified by loading a page and
// reading the console, which is also why it works hard not to put anything in that console.

import {
  CONTENT_FILES,
  SRD_SOURCE,
  combineManifests,
  mergeSources,
  parseManifest,
  parseSourceInfo,
} from "./content-sources.js";

const STORAGE_KEY = "dh-content-sources-v1";

const BASE_MANIFEST = "data/sources.json";
const LOCAL_MANIFEST = "data/sources.local.json";

async function readText(path) {
  try {
    const res = await fetch(path);
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

async function readJson(path) {
  const text = await readText(path);
  if (text === null) return { ok: false, reason: "could not be read" };
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch {
    return { ok: false, reason: "isn't valid JSON" };
  }
}

/**
 * Which sources are switched OFF. Storing the disabled list rather than the enabled one is what
 * makes a new folder appear the moment you create it: you only make one because you want it, and
 * "I added void and nothing showed up" is the bug the other way round produces. A browser with no
 * preference yet has everything on, srd included.
 */
export function readDisabledSources() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    return new Set(Array.isArray(parsed?.disabled) ? parsed.disabled.filter((n) => typeof n === "string") : []);
  } catch {
    return new Set();
  }
}

export function writeDisabledSources(disabled) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ disabled: [...disabled] }));
}

async function readManifests(warnings) {
  const baseText = await readText(BASE_MANIFEST);
  // The one fetch that can 404 in a clean checkout: sources.local.json is gitignored and most
  // people will never have one. That costs a single console line, which is the price of the
  // manifest being a file rather than a setting — see the README section on adding content.
  const localText = await readText(LOCAL_MANIFEST);

  if (baseText === null) warnings.push(`${BASE_MANIFEST} could not be read — loading the SRD only.`);
  else if (parseManifest(baseText).length === 0) warnings.push(`${BASE_MANIFEST} named no usable sources — loading the SRD only.`);

  const names = combineManifests(parseManifest(baseText || ""), parseManifest(localText || ""));
  // A manifest problem must never leave the app with no content at all. Switching everything off
  // deliberately is a different thing, and the pickers say so themselves.
  return names.length > 0 ? names : [SRD_SOURCE];
}

/**
 * @param {string[]} [files] which of CONTENT_FILES to read — the level up screen wants four of
 *   the eight. A source is only asked for the files its own source.json says it holds, so this is
 *   an upper bound, not a list of fetches.
 * @returns {{db, report, disabled}} `db` carries the eight collections plus `effects`.
 */
export async function loadContent({ files = Object.keys(CONTENT_FILES) } = {}) {
  const warnings = [];
  const names = await readManifests(warnings);
  const wanted = new Set(files);

  const sources = await Promise.all(names.map(async (name) => {
    const info = parseSourceInfo((await readText(`data/${name}/source.json`)) ?? "", name);
    if (!info) {
      warnings.push(`data/${name}/source.json is missing or unusable — that source was skipped.`);
      return null;
    }

    const records = {};
    let effects = {};
    await Promise.all(info.files.map(async (file) => {
      if (file !== "effects" && !wanted.has(file)) return;
      const read = await readJson(`data/${name}/${file}.json`);
      if (!read.ok) {
        warnings.push(`data/${name}/${file}.json ${read.reason} — that file was skipped.`);
        return;
      }
      if (file === "effects") effects = read.value && typeof read.value === "object" ? read.value : {};
      else records[file] = read.value;
    }));

    return { name: info.name, label: info.label, records, effects };
  }));

  const { db, effects, report } = mergeSources(sources.filter(Boolean));
  db.effects = effects;
  // Manifest order, and the only place a source's display label reaches code that never sees the
  // report — the CSV's Content column, for one.
  db.sourceLabels = Object.fromEntries(report.sources.map((s) => [s.name, s.label]));
  report.warnings = warnings;

  return { db, report, disabled: readDisabledSources() };
}
