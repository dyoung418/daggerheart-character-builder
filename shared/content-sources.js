// Merging several bodies of content into the one `db` the pages read.
//
// `data/` used to hold exactly one body of content: the SRD re-export. It now holds a folder per
// SOURCE — `data/srd/` plus whatever else exists — and the folder's name IS its category. Nothing
// here knows the name of any source but the SRD's; a category exists because a folder does.
//
// Everything found on disk is always loaded and always looked up, so an id never dangles. The
// enabled/disabled toggles filter the PICKER LISTS only (visibleRecords below). That split is the
// whole design: a character stores bare ids with no provenance, so if a switched-off source
// stopped loading, a character built on it would come back full of holes.
//
// This file is pure — no fetch, no DOM, no storage. It takes payloads that have already been
// read and returns the merged result, which is what makes the merge rules testable in
// tests/tests.js the same way every other rule in this app is.

import { EFFECT_STAT_KEYS } from "./effects.js";

// Filename under a source folder -> the key it lands on in `db`. The single statement of that
// mapping; pages that want fewer files pass a subset of these keys.
//
// items.json is deliberately absent. It ships in data/srd/ and is fetched by nothing — a loader
// that enumerated filenames would silently start pulling 23 KB with no consumer, so the SRD's
// own source.json doesn't list it either.
//
// transformations.json is the one kind the SRD doesn't have and can't: a transformation is an
// optional, permanent change to what a character IS, and only a source that isn't the SRD can
// provide one. It's listed here anyway, because a kind the loader doesn't know is a kind no
// amount of well-formed JSON can add.
export const CONTENT_FILES = {
  classes: "classes",
  subclasses: "subclasses",
  ancestries: "ancestries",
  communities: "communities",
  transformations: "transformations",
  "domain-cards": "domainCards",
  weapons: "weapons",
  armors: "armors",
  consumables: "consumables",
};

export const SRD_SOURCE = "srd";

// The manifest is a plain list of folder names, and each name is interpolated straight into a
// fetch URL — so anything that could climb out of data/ is dropped rather than escaped.
const SAFE_NAME = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;

/**
 * A manifest file's contents -> the folder names it names.
 * Absent, empty or malformed input is not an error: it yields no names, and the caller decides
 * what to do about that (content-load.js falls back to ["srd"], so a broken manifest can never
 * leave the app with nothing).
 */
export function parseManifest(text) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  return parsed.filter((name) => typeof name === "string" && SAFE_NAME.test(name));
}

/** Manifests in precedence order, flattened. First occurrence of a name fixes its position. */
export function combineManifests(...lists) {
  const seen = new Set();
  const out = [];
  for (const list of lists) {
    for (const name of list || []) {
      if (seen.has(name)) continue;
      seen.add(name);
      out.push(name);
    }
  }
  return out;
}

// ---------- what a source folder says about itself ----------

/**
 * A source.json -> { label, files }. Returns null if the file is unusable, which the caller
 * reports and treats as "skip this source" rather than guessing at what the folder holds.
 */
export function parseSourceInfo(text, name) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  if (!Array.isArray(parsed.files)) return null;
  const files = parsed.files.filter((f) => typeof f === "string" && (f === "effects" || f in CONTENT_FILES));
  const label = typeof parsed.label === "string" && parsed.label.trim() ? parsed.label.trim() : name;
  return { name, label, files };
}

// ---------- normalization ----------
//
// classes.json is the only file whose top-level `name` is a bare uppercase string ("BARD"); every
// other file uses {"en-US": ...}, and classes.json itself uses the localized shape for
// hopeFeature.name and classItems. That isn't an oversight upstream: a class name is a RELATIONAL
// KEY — subclasses[].class holds "BARD" and create.js joins on it — not a label.
//
// So the most natural authoring mistake is writing a class in the shape of its neighbours. Rather
// than diverge from upstream's data or push the shape onto every consumer, the loader accepts
// both and coerces each to the shape that file's readers expect.

function localizedName(value) {
  if (typeof value === "string") return { "en-US": value };
  return value;
}

function classNameString(value) {
  if (typeof value === "string") return value.toUpperCase();
  const text = value?.["en-US"];
  return typeof text === "string" ? text.toUpperCase() : value;
}

/** A record as the rest of the app expects it. Never mutates its input. */
export function normalizeRecord(kind, record) {
  if (!record || typeof record !== "object") return record;
  if (kind === "classes") return { ...record, name: classNameString(record.name) };
  return { ...record, name: localizedName(record.name) };
}

// ---------- validation ----------
//
// Only the fields whose absence makes a record UNUSABLE — the ones a renderer reads without
// checking, so a missing one is a dead page rather than a missing card. Everything else is left
// alone: this is a guard against a hand-written file killing a screen, not a second definition of
// the data format to keep in step with the real one.
//
// Note what is NOT checked: a domain nobody has heard of is fine. Hope and Fear adds a domain,
// and rejecting unknown ones would block the very case this feature exists to anticipate.

const REQUIRED = {
  classes: (r) => {
    if (typeof r.name !== "string" || !r.name) return "missing: name";
    if (!Array.isArray(r.domains)) return "missing: domains";
    return null;
  },
  subclasses: (r) => {
    if (!r.name?.["en-US"]) return "missing: name";
    if (typeof r.class !== "string" || !r.class) return "missing: class (the class name, uppercase)";
    return null;
  },
  "domain-cards": (r) => {
    if (!r.name?.["en-US"]) return "missing: name";
    if (typeof r.domain !== "string" || !r.domain) return "missing: domain";
    return null;
  },
};

const NAME_ONLY = (r) => (r.name?.["en-US"] ? null : "missing: name");

/** null if the record is usable, else a short sentence naming what's wrong with it. */
export function validateRecord(kind, record) {
  if (!record || typeof record !== "object" || Array.isArray(record)) return "not a record";
  if (typeof record.id !== "string" || !record.id) return "missing: id";
  return (REQUIRED[kind] || NAME_ONLY)(record);
}

// ---------- effects declared by a source ----------
//
// shared/effects.js is hand-maintained and can hold functions and predicates. A source's
// effects.json is JSON, so it holds the declarative subset — which is most of it: flat stat
// numbers, `permanent` (without which a card whose text says the bonus is permanent silently
// stops applying the moment it goes to the vault), `feature`, `excluded`, and a whole `choice`
// block, which shared/effect-choice.js renders with no page code at all.
//
// `when` and function values are rejected rather than ignored: JSON cannot carry them, and
// silently dropping a condition would make a bonus apply when it shouldn't.

const CHOICE_KINDS = new Set(["benefit", "experience"]);
const STAT_KEYS = new Set(EFFECT_STAT_KEYS);

function statEntries(obj, where) {
  for (const [key, value] of Object.entries(obj)) {
    if (!STAT_KEYS.has(key)) continue;
    if (typeof value !== "number" || !Number.isFinite(value)) return `${where}: ${key} must be a number`;
  }
  return null;
}

function validateChoice(choice) {
  if (!choice || typeof choice !== "object" || Array.isArray(choice)) return "choice must be an object";
  if (typeof choice.prompt !== "string" || !choice.prompt) return "choice: missing prompt";
  // effect-choice.js renders anything that isn't "benefit" as an Experience picker rather than
  // failing, so an unrecognised kind would silently ask the wrong question.
  if (!CHOICE_KINDS.has(choice.kind)) return `choice: kind must be "benefit" or "experience"`;
  if (!Array.isArray(choice.options) || choice.options.length === 0) return "choice: missing options";
  if (choice.kind === "benefit" && (typeof choice.pick !== "number" || choice.pick < 1)) {
    return "choice: benefit needs a numeric pick";
  }
  for (const option of choice.options) {
    if (!option || typeof option !== "object") return "choice: an option isn't an object";
    if (typeof option.id !== "string" || !option.id) return "choice: an option has no id";
    if (typeof option.label !== "string" || !option.label) return "choice: an option has no label";
    if (choice.kind === "benefit") {
      const bad = statEntries(option, `choice option "${option.id}"`);
      if (bad) return bad;
    } else if (typeof option.pick !== "number" || typeof option.bonus !== "number") {
      return `choice option "${option.id}": experience options need numeric pick and bonus`;
    }
  }
  return null;
}

const ALLOWED_EFFECT_KEYS = new Set([...EFFECT_STAT_KEYS, "permanent", "feature", "excluded", "choice"]);

/** null if the entry is usable, else why not. */
export function validateEffectEntry(entry) {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) return "not an effect";
  for (const key of Object.keys(entry)) {
    if (!ALLOWED_EFFECT_KEYS.has(key)) {
      return key === "when"
        ? "`when` needs a function, which JSON can't carry — leave it out or state the bonus unconditionally"
        : `unknown key: ${key}`;
    }
  }
  const bad = statEntries(entry, "value");
  if (bad) return bad;
  if ("permanent" in entry && typeof entry.permanent !== "boolean") return "permanent must be true or false";
  if ("feature" in entry && typeof entry.feature !== "string") return "feature must be a string";
  if ("excluded" in entry && !(Array.isArray(entry.excluded) && entry.excluded.every((x) => typeof x === "string"))) {
    return "excluded must be a list of sentences";
  }
  if ("choice" in entry) return validateChoice(entry.choice);
  return null;
}

// ---------- the merge ----------

// A class's real key is its uppercase name, not its id: create.js joins subclasses to classes
// with `s.class === cls.name.toUpperCase()`, which is the one relational join in this app that
// isn't by id. Two classes sharing a name are therefore indistinguishable to that join whatever
// their ids say — so a later source's Bard replaces an earlier one by NAME as well as by id.
// Without this, a revised Bard under a fresh id would put two identical-looking tiles in the picker
// with every Bard subclass appearing under both.
const nameKeyFor = (kind, record) => (kind === "classes" ? String(record.name).toUpperCase() : null);

/**
 * @param {Array<{name, label, records, effects}>} sources in precedence order — srd first, then
 *   whatever the manifest names. Later wins.
 * @returns {{db, effects, report}}
 */
export function mergeSources(sources) {
  const db = {};
  const effects = {};
  const report = { sources: [], collisions: [], effectIssues: [] };

  for (const key of Object.values(CONTENT_FILES)) db[key] = [];

  for (const source of sources) {
    const entry = { name: source.name, label: source.label || source.name, counts: {}, skipped: [] };
    report.sources.push(entry);

    for (const [file, dbKey] of Object.entries(CONTENT_FILES)) {
      const incoming = source.records?.[file];
      if (!Array.isArray(incoming)) continue;

      const list = db[dbKey];
      const byId = new Map(list.map((r, i) => [r.id, i]));
      const byName = new Map(list.map((r, i) => [nameKeyFor(file, r), i]).filter(([k]) => k !== null));
      // What this source CONTRIBUTED, whether it added a record or revised one: the panel's
      // "my-homebrew — 11 cards" should say what the folder holds, not how much happened to be new.
      let merged = 0;

      for (const raw of incoming) {
        const record = normalizeRecord(file, raw);
        const problem = validateRecord(file, record);
        if (problem) {
          entry.skipped.push({ file, id: raw?.id || "(no id)", reason: problem });
          continue;
        }
        const tagged = { ...record, contentSource: source.name };
        const nameKey = nameKeyFor(file, tagged);
        // Replace IN PLACE so a revision keeps the position the original held.
        const at = byId.has(tagged.id) ? byId.get(tagged.id)
          : (nameKey !== null && byName.has(nameKey) ? byName.get(nameKey) : -1);
        if (at >= 0) {
          const over = list[at];
          if (over.contentSource !== source.name) {
            report.collisions.push({
              file, id: tagged.id, from: source.name, over: over.contentSource,
              byName: !byId.has(tagged.id),
            });
          }
          list[at] = tagged;
        } else {
          byId.set(tagged.id, list.length);
          if (nameKey !== null) byName.set(nameKey, list.length);
          list.push(tagged);
        }
        merged += 1;
      }
      entry.counts[dbKey] = (entry.counts[dbKey] || 0) + merged;
    }

    for (const [key, value] of Object.entries(source.effects || {})) {
      const problem = validateEffectEntry(value);
      if (problem) {
        report.effectIssues.push({ source: source.name, key, reason: problem });
        continue;
      }
      effects[key] = value;
    }
  }

  return { db, effects, report };
}

// ---------- what the pickers show ----------

/**
 * The subset of a collection a picker may offer. Records tagged with a switched-off source are
 * dropped; UNTAGGED RECORDS ARE ALWAYS KEPT, so every hand-written fixture in tests/tests.js and
 * every db assembled by something that doesn't know about sources keeps working unchanged.
 */
export function visibleRecords(list, disabled) {
  if (!disabled || disabled.size === 0) return list || [];
  return (list || []).filter((r) => !r.contentSource || !disabled.has(r.contentSource));
}

// ---------- content a character refers to but this browser doesn't have ----------
//
// Renaming a source folder, editing a manifest, or importing a character from a browser with
// different content all produce the same state: stored ids that resolve to nothing. The app is
// deliberately quiet about missing data — derivedStats() returns null rather than throwing — so
// without this a character built on a folder you renamed prints a sheet headed "Class" with
// quietly wrong numbers.
//
// Cards taken at a level up are already reported by validateLevelUps() in shared/history.js
// ("that card no longer exists"), so they're left out here rather than counted twice.

const has = (list, id) => (list || []).some((r) => r.id === id);

/**
 * @param {object} opts.sentinels stored values with no record behind them (unarmed, unarmored).
 * @param {boolean} opts.includeAllCards check the whole card collection rather than just the two
 *   taken at creation. False on the roster, where history.js already reports the rest; true on the
 *   import review, which runs before any of that and wants one honest count of what won't resolve.
 */
export function unresolvedReferences(ch, db, { sentinels = [], includeAllCards = false } = {}) {
  const out = [];
  const check = (kind, id, list) => {
    if (!id || sentinels.includes(id)) return;
    if (!has(list, id)) out.push({ kind, id });
  };

  check("class", ch?.classId, db?.classes);
  check("subclass", ch?.subclassId, db?.subclasses);
  for (const chosen of ch?.heritage?.chosenFeatures || []) check("ancestry", chosen.ancestryId, db?.ancestries);
  check("community", ch?.heritage?.communityId, db?.communities);
  // Stored beside the heritage rather than inside it: heritage's shape is ancestry-specific
  // (a mode, a pair of ids, a feature pick each), and a transformation is one id or none.
  check("transformation", ch?.transformationId, db?.transformations);
  check("weapon", ch?.equipment?.primaryWeaponId, db?.weapons);
  check("weapon", ch?.equipment?.secondaryWeaponId, db?.weapons);
  check("armor", ch?.equipment?.armorId, db?.armors);
  const cardIds = includeAllCards
    ? [...new Set([...(ch?.creationDomainCardIds || []), ...(ch?.domainCardIds || [])])]
    : ch?.creationDomainCardIds || [];
  for (const id of cardIds) check("domain card", id, db?.domainCards);

  return out;
}
