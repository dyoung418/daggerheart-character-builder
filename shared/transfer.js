// Moving characters between browsers as a JSON file: one format for a single character or
// the whole list, parsed and merged here as pure functions over plain objects. characters.js
// does the file dialog, the download and the "already exists" banner and nothing else.
//
// The CSV export (characters.js) is a summary for the GM and stays what it is; this is the
// round-trip: what serializeCharacters() writes, parseImport() reads back unchanged.

import { ensureLevelFields } from "./advancement.js";

export const EXPORT_FORMAT = "dh-characters";
export const EXPORT_VERSION = 1;

export function serializeCharacters(characters, now = new Date()) {
  return JSON.stringify({
    format: EXPORT_FORMAT,
    version: EXPORT_VERSION,
    exportedAt: now.toISOString(),
    characters,
  }, null, 2);
}

// { characters, errors }: any error means nothing should be imported. Entries go through
// ensureLevelFields() so a file written before some field existed still loads, the same way
// loadCharacters() treats what's already in localStorage.
export function parseImport(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    return { characters: [], errors: ["This file is not valid JSON."] };
  }
  if (!data || typeof data !== "object" || data.format !== EXPORT_FORMAT || !Array.isArray(data.characters)) {
    return { characters: [], errors: ["This is not a Daggerheart character file."] };
  }
  if (typeof data.version !== "number" || data.version > EXPORT_VERSION) {
    return { characters: [], errors: [`This file is version ${data.version}; this app reads up to version ${EXPORT_VERSION}.`] };
  }
  const errors = [];
  data.characters.forEach((entry, i) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) errors.push(`Entry ${i + 1} is not a character.`);
    else if (typeof entry.id !== "string" || !entry.id) errors.push(`Entry ${i + 1} (${entry.name || "unnamed"}) is missing an id.`);
  });
  if (errors.length) return { characters: [], errors };
  return { characters: data.characters.map((c) => ensureLevelFields(c)), errors: [] };
}

export function importConflicts(existing, incoming) {
  const ids = new Set(existing.map((c) => c.id));
  return incoming.filter((c) => ids.has(c.id));
}

// mode "replace": an incoming character with a saved id takes that slot. mode "copy": the saved
// one stays and the incoming one is appended under a fresh id, its name marked so the two can
// be told apart in the list. New ids are appended either way. Never mutates its inputs.
export function mergeImported(existing, incoming, mode, makeId = newCharacterId) {
  const out = existing.map((c) => c);
  for (const c of incoming) {
    const at = out.findIndex((x) => x.id === c.id);
    if (at === -1) out.push(c);
    else if (mode === "replace") out[at] = c;
    else out.push({ ...c, id: makeId(), name: `${c.name || "(unnamed)"} (imported)` });
  }
  return out;
}

// Same shape create.js uses for new characters.
export function newCharacterId() {
  return "char_" + Math.random().toString(36).slice(2, 10);
}

export function exportFileName(characters, stamp) {
  if (characters.length !== 1) return `daggerheart-characters-${stamp}.json`;
  const slug = String(characters[0].name || "")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return `${slug || "character"}.json`;
}
