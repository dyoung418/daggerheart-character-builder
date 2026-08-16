# Adding a content source

This builder ships the Daggerheart SRD in `data/srd/`. It can load any number of other bodies of
content beside it — a homebrew class, a supplement you own, a single revised card — with **no code
changes at all**. If adding content makes you want to edit a `.js` file, something has gone wrong;
say so rather than working around it.

Everything here is the format. Every example below is drawn from `data/srd/`, which is the one body
of content this repository is allowed to carry: the DPCGL grants re-use of the SRD and nothing else.
Whatever you add is yours, stays on your disk, and is gitignored — see §10.

---

## 1. Make the folder

```
data/<your-source-name>/
```

**The folder name is the category.** It appears in the character sheet's CSV export, in the Content
panel, and in the path to that source's card art. It must match `^[A-Za-z0-9][A-Za-z0-9_-]*$` —
names that could climb out of `data/` are dropped rather than escaped, because the name goes
straight into a fetch URL.

Everything under `data/` except `data/srd/` is gitignored, deliberately.

## 2. Name it in a manifest

Two manifests, both lists of folder names:

| File | Tracked? | For |
|---|---|---|
| `data/sources.json` | yes | content that ships with the repo. Holds `["srd"]`. |
| `data/sources.local.json` | no (gitignored) | **yours** |

```json
["my-homebrew"]
```

Use the local one. A tracked reference to a folder that isn't in git makes every clean checkout warn
about a missing source.

Order matters: `sources.json` first, then any name in `sources.local.json` that isn't already
listed. **Later wins** when two sources define the same thing (§5).

Sources load *enabled*. A player switches one off in the **Content** panel, and that only filters
what the pickers offer — see §9.

## 3. Declare what the folder holds: `source.json`

Required. A folder without a usable one is skipped, and the Content panel says so.

```json
{
  "label": "My Homebrew",
  "files": ["classes", "subclasses", "domain-cards", "effects"]
}
```

- **`files`** (required) — only what you actually have. The loader fetches exactly these, so a
  folder with one card file costs one request and produces no 404s in anyone's console.
- **`label`** (optional) — what a human sees. Defaults to the folder name.

Valid entries are `classes`, `subclasses`, `ancestries`, `communities`, `domain-cards`, `weapons`,
`armors`, `consumables`, and `effects`. Each is `<name>.json` in your folder. Anything else in
`files` is ignored.

## 4. The record shapes

Every file is a **JSON array of records** (except `effects.json`, which is an object — §6). Every
record needs a unique `id`.

Two conventions run through all of them:

- **Text is localized**: `{"en-US": "..."}`, never a bare string.
- **Prose is a list of items**, so paragraphs and bullets keep their own elements:
  `[{"paragraph": {"en-US": "..."}}, {"list": [{"en-US": "..."}, ...]}]`. Anything that isn't a
  `paragraph` or a `list` is skipped when rendering.

**The one exception:** a class's top-level `name` is a **bare uppercase string** (`"BARD"`), because
`subclasses[].class` joins to it. That join is the only relational link in this app that isn't by
id. Write it either way and the loader coerces it, but uppercase-string is the shape on disk.

### classes.json

```json
{
  "id": "core_class_bard",
  "name": "BARD",
  "description": [{ "paragraph": { "en-US": "Bards are the most charismatic people…" } }],
  "domains": ["GRACE", "CODEX"],
  "startingEvasion": 10,
  "startingHitPoints": 5,
  "classItems": [{ "en-US": "A romance novel" }, { "en-US": "A letter never opened" }],
  "hopeFeature": { "name": { "en-US": "Make a Scene" }, "description": [ … ] },
  "classFeatures": [{ "name": { "en-US": "Rally" }, "description": [ … ] }]
}
```

`domains` is what gates the card pickers, at creation and at every level up — a domain exists
because a class names it and cards carry it, nothing else. A class name with more than one word is
fine; it's title-cased for display. **Required: `id`, `name`, `domains`.**

### subclasses.json

```json
{
  "id": "core_subclass_beastbound",
  "name": { "en-US": "Beastbound" },
  "class": "RANGER",
  "domains": ["BONE", "SAGE"],
  "spellcastTrait": "AGILITY",
  "foundation":     { "features": [{ "name": { "en-US": "Companion" }, "description": [ … ] }] },
  "specialization": { "features": [ … ] },
  "mastery":        { "features": [ … ] }
}
```

`class` must equal a class's uppercase `name`, not its id. `spellcastTrait` is one of `AGILITY`,
`STRENGTH`, `FINESSE`, `INSTINCT`, `PRESENCE`, `KNOWLEDGE`, or absent for a subclass that doesn't
cast. All three tiers should be present even if a tier has one feature. (`domains` here is carried
for consistency with the SRD's files; no page reads it.)
**Required: `id`, `name`, `class`.**

### domain-cards.json

```json
{
  "id": "core_domain_card_a_soldiers_bond",
  "name": { "en-US": "A Soldier's Bond" },
  "domain": "BLADE",
  "type": "ABILITY",
  "level": 2,
  "recallCost": 1,
  "features": [{ "description": [{ "paragraph": { "en-US": "Once per long rest, when you…" } }] }]
}
```

`type` is `ABILITY`, `SPELL` or `GRIMOIRE`. A card's `features` entries carry **no `name`** — the
card's name is the feature's name. A `domain` the SRD has never heard of is fine and expected: it
appears as a filter chip in the card browser automatically, after the nine SRD domains. It won't
have a colour of its own, which affects only the border of a card with no art.
**Required: `id`, `name`, `domain`.**

### ancestries.json / communities.json

```json
{ "id": "core_ancestry_clank", "name": { "en-US": "Clank" }, "description": [ … ],
  "features": [{ "name": { "en-US": "Purposeful Design" }, "description": [ … ] }] }
```

Communities add `"personalities": [{ "en-US": "Meticulous" }, …]`. **Required: `id`, `name`.**

### weapons.json / armors.json / consumables.json

```json
{ "id": "core_weapon_broadsword", "name": { "en-US": "Broadsword" }, "type": "PRIMARY_PHYSICAL",
  "tier": 1, "trait": "AGILITY", "range": "MELEE",
  "damage": { "dice": "D8", "type": "PHYSICAL" }, "burden": "ONE_HANDED",
  "features": [{ "name": { "en-US": "Reliable" },
                 "description": [{ "paragraph": { "en-US": "+1 to attack rolls" } }] }] }

{ "id": "core_armor_gambeson_armor", "name": { "en-US": "Gambeson Armor" }, "tier": 1,
  "baseMajorThreshold": 5, "baseSevereThreshold": 11, "baseScore": 3, "features": [ … ] }

{ "id": "core_consumable_stride_potion", "name": { "en-US": "Stride Potion" }, "features": [ … ] }
```

Enums are SCREAMING_SNAKE and are turned into words for the player. **Required: `id`, `name`.**

### What validation does and doesn't do

Only fields whose absence would break a screen are checked; a record that fails is **skipped and
named in the Content panel**, and the rest of the file still loads. Unknown fields are ignored — but
they're also useless, so don't invent any. Nothing checks that a domain, trait or tier is one the
SRD uses; unknown ones are exactly what a new source is for.

## 5. Ids, and what replaces what

Prefix your ids with your source (`myhomebrew_class_…`, `myhomebrew_domain_card_…`) — nothing
enforces it, but a character stores bare ids, so a prefix is the only thing that says where a saved
character's class came from when you're reading its JSON.

When a later source has a record with an **id that already exists**, it *replaces* it in place —
keeping the original's position in the list. That's how you revise an SRD card: give your version
the SRD's id.

**Classes also collide by uppercase name**, whatever their ids say. Subclasses join to classes by
name, so two classes called `BARD` would put two identical tiles in the picker with every Bard
subclass under both. The later one wins, and the earlier one's subclasses join to the survivor.

Every collision is listed in the Content panel. Nothing is ever silently merged.

## 6. `effects.json` — making a bonus actually count

The app computes Evasion, Hit Points, thresholds and the rest from a catalogue in
`shared/effects.js`. Your source can add to that catalogue with `effects.json`, an **object keyed by
what the effect belongs to**:

| Key | For |
|---|---|
| `<cardId>` | a domain card |
| `<subclassId>:foundation` \| `:specialization` \| `:mastery` | a subclass tier |
| `<ancestryId>:<Feature Name>` | one ancestry feature |
| `<itemId>:<Feature Name>` | one weapon's or armour's feature |
| `armor:<Feature Name>`, `weapon:<Feature Name>` | a feature that means the same on every item that has it |

A tier implies every tier below it, so a Mastery character collects the Foundation and
Specialization entries too.

### The whole vocabulary

```json
{
  "core_subclass_school_of_war:foundation": { "feature": "Battlemage", "hitPointSlots": 1 },

  "core_subclass_school_of_knowledge:foundation": {
    "feature": "Prepared",
    "extraDomainCards": 1
  },

  "core_domain_card_armorer": {
    "armorScore": 1,
    "excluded": ["Armorer's downtime armor repair needs a rest, so it isn't counted here"]
  }
}
```

- **Stat keys**, all optional, all plain finite numbers:
  `evasion`, `hitPointSlots`, `stressSlots`, `majorThreshold`, `severeThreshold`, `armorScore`,
  `attack`, `spellcast`, `extraDomainCards`.
- **`permanent`** (boolean) — for a card whose text says the bonus is permanent and tells you to
  vault the card. Without it the bonus stops the moment the card leaves the loadout.
- **`feature`** (string) — which named feature of a multi-feature tier this entry encodes. It's what
  the sheet's breakdown shows, so "Stalwart — Unwavering" rather than "Stalwart".
- **`excluded`** (list of sentences) — bonuses the thing grants that deliberately *aren't* counted.
  They show under "bonuses you have but that aren't counted above", which is how a player learns why
  a number didn't move.
- **`choice`** — when the player picks something (§7).

Anything else is rejected and reported. `extraDomainCards` is not a stat: it changes how many cards
the character gets to pick, and the level-up screen works it out by diffing before and after.

### Two shapes of choice

```json
"core_domain_card_vitality": {
  "permanent": true,
  "choice": {
    "prompt": "Vitality: choose two benefits. They're permanent…",
    "kind": "benefit",
    "pick": 2,
    "options": [
      { "id": "stress",     "label": "One Stress slot",  "stressSlots": 1 },
      { "id": "thresholds", "label": "+2 to thresholds", "majorThreshold": 2, "severeThreshold": 2 }
    ]
  }
}
```

```json
"core_ancestry_clank:Purposeful Design": {
  "choice": {
    "prompt": "Purposeful Design: choose the Experience that best aligns…",
    "kind": "experience",
    "options": [{ "id": "one", "label": "+1 to one Experience", "pick": 1, "bonus": 1 }]
  }
}
```

`kind` is `"benefit"` (options carry stat keys; the choice carries `pick`) or `"experience"`
(each option carries its own `pick` and `bonus`). Where the question gets asked follows from where
the effect came from: an ancestry's choice appears in the creation wizard, a card's on the level-up
screen. No page code is needed either way.

### Overriding a built-in effect

Your entry **wins** over the one in `shared/effects.js` with the same key — a revised card is a new
version of that card. An override that declares nothing inherits the built-in entry, including the
parts JSON can't express, and the breakdown labels it with your record's name.

## 7. What JSON deliberately can't express

`shared/effects.js` is JavaScript and can hold functions. `effects.json` can't, and these are
rejected loudly rather than dropped silently:

| Not available | Why | What to do |
|---|---|---|
| `when` — a condition on the bonus | it's a predicate | state the bonus unconditionally if it's always on, or don't state it and write an `excluded` note |
| a value that scales (`"equal to your Proficiency"`) | it's a function of the character | `excluded` note |
| `traits` — a bonus to Agility, Strength… | not a key JSON effects accept | `excluded` note |

The honest test for whether a thing deserves an entry at all: **is it in effect right now, given
only what we store?** Permanent changes, a card sitting in the loadout, a configuration like "while
you're wearing armour" — yes. Anything costing Stress or Hope, anything once per rest, anything
depending on the state of play — no. Those get an `excluded` sentence if a player might expect a
number, and nothing otherwise.

An example of "nothing otherwise": a `*-Touched` card gives its benefits only while four cards of
its domain are in the loadout. That's a `when`. If its benefits all cost Hope anyway, an entry for
it would be an `excluded` note shown to players who don't even meet the requirement — claiming a
bonus they don't have. Leave it out entirely.

## 8. Card art

Art is optional and never shipped. If you have it, it goes in your own folder:

```
data/<source>/card-art/domain/<card id>.png
data/<source>/card-art/subclass/<subclass id>-foundation.png   (…-specialization, …-mastery)
data/<source>/card-art/ancestry/<ancestry id>.png
data/<source>/card-art/community/<community id>.png
```

A card with no file falls back to a readable CSS card that prints the rules text. There is
deliberately **no fallback to the SRD's art**: those images are whole card faces including rules
text, so showing the SRD picture for a card you revised would print the superseded text as an
unselectable image while the app applied your version.

## 9. Switching a source off doesn't unbuild characters

Everything on disk is always loaded and always looked up. The Content panel's checkboxes filter the
**picker lists only**. A character built with a source you've since switched off keeps its class,
its cards, its rules text and its stats — because a character stores bare ids with no provenance,
and a source that stopped loading would leave it full of holes.

Deleting or renaming the folder is the different thing: then the ids resolve to nothing, and the
roster, the sheet and the character importer all say so by name.

## 10. Untracked by design, and not regenerable

Your folder isn't in git, and no script rebuilds it. Card art is disposable — it's extracted from a
book you own in a couple of minutes — but the JSON is transcription work. If you lose it you re-do
it. Keep your own copy if that matters to you.

This is also why nothing outside `data/srd/` may be committed here, and why no file in this
repository — code, comment or test — should quote content that isn't the SRD's.

## 11. When your content becomes official

Sooner or later the SRD ships something your source was providing. Because classes collide by
**name** and local sources load after `srd`, **your copy silently wins** — and, since subclasses
join by class name, it collects both versions' subclasses under yours.

The Content panel names the collision the day it starts. When you see it, delete your file (or the
whole folder) to take the official one.

## 12. Checking it worked

1. Serve the app (`python3 serve.py 8099` — any static server does; nothing depends on that script)
   and open any page.
2. Open **Content** in the top nav. It becomes **Content ⚠** when anything went wrong. The panel
   lists, per source: what it contributed, every record skipped and why, every collision, every
   rejected effect entry, and any file that couldn't be read.
3. Look at the browser console. A correct source produces no messages at all — a 404 there means a
   file you listed in `source.json` isn't present, or art you haven't extracted.
4. Build one character with your content end to end and open its sheet: the numbers on it are the
   only proof that your `effects.json` says what you meant.
