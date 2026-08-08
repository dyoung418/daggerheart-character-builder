// The file a player uses to move their characters to another browser.
//
// The CSV next door is for the GM: it spells every id out into names and prose, and throws the
// structure away. This one is the opposite. It carries the characters exactly as localStorage
// holds them, so the browser that reads it can still open a level, edit it, remove it and undo —
// which only works if the recorded choices survive, not just the numbers they produce.
//
// NOTHING HERE READS data/
// ------------------------
// The CSV has to resolve ids because nothing downstream can look them up. A character file is
// read by this same app, which already has its own data/, so ids travel as ids. That keeps the
// export honest — it can't quietly bake in one browser's idea of what a card does — and it means
// both normalizers this module leans on (ensureLevelFields here, recomputeCharacter elsewhere)
// are usable, since neither takes a db.
//
// THE CHARACTERS GO IN VERBATIM
// -----------------------------
// Tempting to strip the derived fields, since shared/history.js can replay them from baseline +
// levelUps. Don't. For a character saved before levels were recorded, the derived fields ARE the
// truth: ensureLevelFields builds the baseline it never had by reading traits,
// advancementSlotsUsed and domainCardIds. Strip those and a level 6 character arrives with no
// traits and an empty collection. Verbatim also means a field added to blankCharacter next month
// travels without anyone remembering an allowlist, and it carries the sticky creationCardsUnbaked
// flag so the one-off exchange repair doesn't run twice.
//
// WHAT'S DELIBERATELY LEFT OUT
// ----------------------------
// dh-level-edit-undo-v1 is one transient slot meaning "the edit you just made, here". It's keyed
// by character id, so importing it would offer an Undo in a browser where nobody edited anything.
// dh-card-builder-state-v1 is the card browser's own loadout — a property of the session, not of
// any character, with no sensible answer when two sessions each have one.
//
// No DOM, no storage, no fetch: characters.js owns the button, the file input and the download,
// so everything here is reachable from tests/.

import { ensureLevelFields } from "./advancement.js";

export const TRANSFER_FORMAT = "daggerheart-character-builder";
export const TRANSFER_VERSION = 1;

// keep-both leads because it's the only resolution that destroys nothing.
export const DEFAULT_RESOLUTION = "keep-both";

const IMPORTED_SUFFIX = " (imported)";
const MAX_LEVEL = 10;

const isObject = (v) => !!v && typeof v === "object" && !Array.isArray(v);
const copy = (value) => JSON.parse(JSON.stringify(value));

// ---------- writing ----------

export function buildTransferFile(characters, now = new Date()) {
  return {
    format: TRANSFER_FORMAT,
    version: TRANSFER_VERSION,
    // Which of two files is the newer one, answerable without opening either.
    exportedAt: now.toISOString(),
    characters: copy(characters || []),
  };
}

// Indented, because this is a file a person may well open in an editor.
export function serializeTransferFile(characters, now = new Date()) {
  return JSON.stringify(buildTransferFile(characters, now), null, 2) + "\n";
}

export function transferFilename(now = new Date()) {
  return `daggerheart-characters-${now.toISOString().slice(0, 10)}.json`;
}

// ---------- reading ----------

// The GM's CSV opens with a BOM and a quoted Name column. Worth recognising: two files in one
// downloads folder, both starting "daggerheart-characters-", is the likeliest mistake there is,
// and "unexpected token" would be a useless thing to say about it.
function looksLikeTheGmCsv(text) {
  return /^"?Name"?\s*,/.test(String(text).replace(/^\uFEFF/, ""));
}

// Deliberately loose. Admitting a junk entry costs one confusing row that can be deleted;
// rejecting a real character loses a character. Note that tests/tests.js:newCharacter() — and
// any save from before the wizard grew a field — has no heritage and no name, so neither can be
// required here. normalizeImported repairs what's missing.
export function looksLikeCharacter(value) {
  if (!isObject(value)) return false;
  if (typeof value.id !== "string" && typeof value.name !== "string") return false;
  return isObject(value.traits) || Array.isArray(value.domainCardIds);
}

/**
 * @returns {{ok: true, version: number, exportedAt: string|null, characters: object[], dropped: number}
 *          |{ok: false, error: string}}
 */
export function parseTransferFile(text) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    if (looksLikeTheGmCsv(text)) {
      return { ok: false, error: "That's the GM's CSV. It doesn't record your level-up choices, " +
        "so it can't be loaded back — use the file from Save to file." };
    }
    return { ok: false, error: "That file isn't a character file — it couldn't be read as JSON." };
  }

  if (!isObject(parsed) || parsed.format !== TRANSFER_FORMAT) {
    return { ok: false, error: "That's a JSON file, but not one from this app. " +
      "Look for a file named daggerheart-characters-….json." };
  }
  // Only a version we can name as newer is refused. A missing or malformed one is read as this
  // version: every file written so far carries a number, and guessing is kinder than refusing.
  if (typeof parsed.version === "number" && parsed.version > TRANSFER_VERSION) {
    return { ok: false, error: `That file was written by a newer version of the app ` +
      `(file version ${parsed.version}, this one reads ${TRANSFER_VERSION}).` };
  }
  if (!Array.isArray(parsed.characters) || parsed.characters.length === 0) {
    return { ok: false, error: "That file has no characters in it." };
  }

  // One bad entry must not cost the other four characters, so junk is dropped and counted
  // rather than thrown. The count is reported after the import so nothing goes missing quietly.
  const kept = parsed.characters.filter(looksLikeCharacter).map((ch) => normalizeImported(copy(ch)));
  if (kept.length === 0) {
    return { ok: false, error: "Nothing in that file looked like a character." };
  }

  return {
    ok: true,
    version: typeof parsed.version === "number" ? parsed.version : TRANSFER_VERSION,
    exportedAt: typeof parsed.exportedAt === "string" ? parsed.exportedAt : null,
    characters: kept,
    dropped: parsed.characters.length - kept.length,
  };
}

// Everything the app dereferences without checking first.
//
// ensureLevelFields backfills the fields LEVELS need; it says nothing about the ones the WIZARD
// makes. characters.js:isComplete — called for every row of the list — reaches straight into
// heritage.communityId, traits, equipment.armorId, experiences[].name and domainCardIds. A file
// missing any of them throws inside renderList, and the whole roster renders blank with nothing
// shown to the user. So repair first, then normalize.
//
// Widening ensureLevelFields instead would change what create.js and level-up.js do on every
// load, for no benefit those pages asked for. Keep the repair at the boundary it's needed.
export function normalizeImported(ch) {
  if (typeof ch.id !== "string") ch.id = "";
  if (typeof ch.name !== "string") ch.name = "";
  if (typeof ch.pronouns !== "string") ch.pronouns = "";
  if (typeof ch.connectionsNotes !== "string") ch.connectionsNotes = "";
  if (!isObject(ch.background)) ch.background = { description: "", answers: "" };

  if (!isObject(ch.heritage)) ch.heritage = { ancestryMode: "pure", ancestryIds: [], chosenFeatures: [], communityId: null };
  if (!Array.isArray(ch.heritage.ancestryIds)) ch.heritage.ancestryIds = [];
  if (!Array.isArray(ch.heritage.chosenFeatures)) ch.heritage.chosenFeatures = [];

  if (!isObject(ch.traits)) ch.traits = { agility: null, strength: null, finesse: null, instinct: null, presence: null, knowledge: null };
  if (!isObject(ch.equipment)) ch.equipment = { primaryWeaponId: null, secondaryWeaponId: null, armorId: null, potionChoice: null };

  // Both isComplete and ensureLevelFields walk into each entry, so a null in this list is as bad
  // as a missing list.
  if (!Array.isArray(ch.experiences)) ch.experiences = [];
  ch.experiences = ch.experiences.filter(isObject);
  for (const exp of ch.experiences) if (typeof exp.name !== "string") exp.name = "";

  if (!Array.isArray(ch.domainCardIds)) ch.domainCardIds = [];
  if (!Array.isArray(ch.domainVaultIds)) ch.domainVaultIds = [];
  // Left undefined rather than guessed at: ensureLevelFields has a documented rule for filling
  // this in, and it should be the one to apply it.
  if (ch.creationDomainCardIds !== undefined && !Array.isArray(ch.creationDomainCardIds)) {
    delete ch.creationDomainCardIds;
  }
  const level = Math.floor(Number(ch.level));
  ch.level = Number.isFinite(level) ? Math.min(MAX_LEVEL, Math.max(1, level)) : 1;

  return ensureLevelFields(ch);
}

// ---------- merging into a roster ----------

/**
 * Which incoming characters are new here and which already exist. Id is the only key: two
 * characters sharing a NAME are two characters, and always have been.
 *
 * @returns {{incoming: object[], fresh: object[], clashes: Array<{id: string, incoming: object, existing: object}>}}
 */
export function planImport(incoming, existing) {
  const fresh = [];
  const clashes = [];
  for (const ch of incoming || []) {
    const at = ch.id ? (existing || []).find((c) => c.id === ch.id) : null;
    if (at) clashes.push({ id: ch.id, incoming: ch, existing: at });
    else fresh.push(ch);
  }
  return { incoming: [...(incoming || [])], fresh, clashes };
}

/**
 * The roster after the import, given what the player chose for each clash.
 *
 * Pure with respect to both inputs — every character that lands is a deep copy — so the review
 * screen can be re-confirmed after they change their mind.
 *
 * @param {object[]} existing
 * @param {{incoming: object[], clashes: object[]}} plan
 * @param {Record<string, "keep-both"|"overwrite"|"skip">} resolutions keyed by incoming id
 * @param {{rand?: () => number}} [opts]
 */
export function applyImport(existing, plan, resolutions, opts = {}) {
  const rand = opts.rand || Math.random;
  const chosen = resolutions || {};
  const next = [...(existing || [])];
  // Seeded from the roster and added to as we go, so a minted id can't collide with a character
  // already here OR with one placed a moment ago out of the same file.
  const taken = new Set(next.map((c) => c.id).filter(Boolean));
  const clashIds = new Set(plan.clashes.map((c) => c.id));

  let added = 0;
  let replaced = 0;
  let skipped = 0;
  const renamed = [];
  const overwrittenIds = [];

  // File order, so what the player saw listed is the order things arrive in.
  for (const source of plan.incoming) {
    const isClash = source.id && clashIds.has(source.id);
    const resolution = isClash ? chosen[source.id] || DEFAULT_RESOLUTION : null;

    if (resolution === "skip") {
      skipped += 1;
      continue;
    }

    if (resolution === "overwrite") {
      // In place: the roster must not reshuffle under someone who only meant to update one row.
      const at = next.findIndex((c) => c.id === source.id);
      next[at] = copy(source);
      overwrittenIds.push(source.id);
      replaced += 1;
      continue;
    }

    const ch = copy(source);
    if (!ch.id || taken.has(ch.id)) ch.id = mintCharacterId(taken, rand);
    if (resolution === DEFAULT_RESOLUTION) {
      // A row shows only name, level, class and subclass, so two copies of a character that has
      // since diverged by one level up would be indistinguishable — and the obvious next move,
      // deleting the wrong one, is destructive. Only keep-both is marked: a plain add and an
      // overwrite have nothing to be told apart from.
      ch.name = importedName(ch.name);
      renamed.push(ch.name);
    }
    taken.add(ch.id);
    next.push(ch);
    added += 1;
  }

  return { characters: next, added, replaced, skipped, renamed, overwrittenIds };
}

/**
 * A fresh id in the same shape create.js mints, absent from `taken`.
 * @param {Set<string>|string[]} taken
 * @param {() => number} [rand] injectable so the suite can force a collision and see the retry
 */
export function mintCharacterId(taken, rand = Math.random) {
  const has = (id) => (taken instanceof Set ? taken.has(id) : (taken || []).includes(id));
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const id = "char_" + rand().toString(36).slice(2, 10);
    if (id.length > 5 && !has(id)) return id;
  }
  // Only reachable with a rand() that keeps handing back the same number. Never spin forever.
  let n = 0;
  let id = "char_" + Date.now().toString(36);
  while (has(id)) id = "char_" + Date.now().toString(36) + (n++).toString(36);
  return id;
}

// Idempotent, so importing the same file twice doesn't produce "Kaz (imported) (imported)".
export function importedName(name) {
  const s = typeof name === "string" ? name : "";
  if (s.endsWith(IMPORTED_SUFFIX)) return s;
  if (!s.trim()) return IMPORTED_SUFFIX.trim();
  return s + IMPORTED_SUFFIX;
}
