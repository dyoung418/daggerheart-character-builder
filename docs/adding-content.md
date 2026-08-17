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

Valid entries are `classes`, `subclasses`, `ancestries`, `communities`, `transformations`,
`domain-cards`, `weapons`, `armors`, `consumables`, and `effects`. Each is `<name>.json` in your
folder. Anything else in `files` is ignored.

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

### transformations.json

The one record kind with **nothing in `data/srd/` to copy**: the SRD has no transformations, so
this file only ever exists in a source of your own. A transformation is a permanent change to what
a character *is*, granting a benefit and a drawback together.

```json
{
  "id": "myhomebrew_transformation_tide_marked",
  "name": { "en-US": "Tide-Marked" },
  "description": [{ "paragraph": { "en-US": "One sentence on what these are." } }],
  "features": [
    { "name": { "en-US": "The Gift" },  "description": [{ "paragraph": { "en-US": "…" } }] },
    { "name": { "en-US": "The Price" }, "description": [{ "paragraph": { "en-US": "…" } }] }
  ]
}
```

Shaped like an ancestry with no `personalities`: no `level`, no `domain`, no `recallCost`, and no
`tier`. **Required: `id`, `name`.**

What the app does with it:

- The creation wizard grows a **Transformation** step, straight after Ancestry & Community — but
  *only* when some loaded source provides transformations. With the SRD alone there is no such
  step, which is why nothing changes for anyone who doesn't write this file.
- A character has **at most one**. That isn't a rule the app enforces; it's the shape of the field
  (one id, or none), so it can't be broken.
- Picking one is **optional** and never blocks finishing a character. The step is reachable again
  afterwards, because a GM usually hands a transformation out mid-campaign rather than at creation.
- The card doesn't count against the loadout limit, and **every feature applies** — there's no
  choosing between them the way a mixed ancestry chooses.

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
| `<transformationId>:<Feature Name>` | one transformation feature |
| `<itemId>:<Feature Name>` | one weapon's or armour's feature |
| `armor:<Feature Name>`, `weapon:<Feature Name>` | a feature that means the same on every item that has it |
| `<classId>:<Feature Name>` | one class feature, including the Hope feature |

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

  "armor:Very Heavy": { "evasion": -2, "traits": { "agility": -1 } },

  "core_domain_card_armorer": {
    "armorScore": 1,
    "excluded": ["Armorer's downtime armor repair needs a rest, so it isn't counted here"]
  }
}
```

- **Stat keys**, all optional:
  `evasion`, `hitPointSlots`, `stressSlots`, `majorThreshold`, `severeThreshold`, `armorScore`,
  `attack`, `spellcast`, `extraDomainCards`. Each is a finite number, or a value the character's
  own stats decide (below).
- **`traits`** — a bonus or penalty to the character's traits, keyed by trait name **in
  lowercase**: `{ "traits": { "finesse": -1 } }`. That's the shape the SRD's own `armor:Very
  Heavy` and `weapon:Cumbersome` have. Lowercase is enforced rather than corrected, because the
  rest of `data/` writes traits uppercase (a weapon's `"trait": "STRENGTH"`) and a key in the
  wrong case would apply to nothing at all. It reaches the trait tile *and* everything computed
  from it, so a `-1` to Finesse also lowers a Finesse weapon's attack rolls.
- **`permanent`** (boolean) — for a card whose text says the bonus is permanent and tells you to
  vault the card. Without it the bonus stops the moment the card leaves the loadout.
- **`feature`** (string) — which named feature of a multi-feature tier this entry encodes. It's what
  the sheet's breakdown shows, so "Stalwart — Unwavering" rather than "Stalwart".
- **`excluded`** (list of sentences) — bonuses the thing grants that deliberately *aren't* counted.
  They show under "bonuses you have but that aren't counted above", which is how a player learns why
  a number didn't move.
- **`scope`** — `"primary"`, `"secondary"` or `"character"`. Which weapon an `attack` bonus lands
  on, and nothing else: everything a weapon grants besides `attack` applies to the character
  whatever this says. Default is the slot the feature's weapon is in, so you only write it for
  the feature that reaches across (below).
- **`choice`** — when the player picks something (§7).
- **`unarmedProfile`** — replaces the weapon a bare-handed character fights with (below).
- **`advancementOption`** — an extra row on the level-up screen's advancement table (below).
- **`track`** — a named value with a ladder, printed on the sheet: a Rally Die, a Combo Die (below).

Anything else is rejected and reported. `extraDomainCards` is not a stat: it changes how many cards
the character gets to pick, and the level-up screen works it out by diffing before and after.

### A value the character's own stats decide

The books say this constantly — "equal to your Proficiency", "equal to your Presence", "equal to
your Spellcast trait". Write it in place of the number:

```json
{
  "myhomebrew_armor_robes:Spellwoven": {
    "majorThreshold":  { "equalTo": "spellcast" },
    "severeThreshold": { "equalTo": "spellcast" }
  },
  "myhomebrew_armor_finery:Resplendent": { "armorScore": { "equalTo": "presence" } }
}
```

The whole vocabulary after `equalTo`: the six traits (`agility`, `strength`, `finesse`, `instinct`,
`presence`, `knowledge`), plus `spellcast`, `proficiency`, `level` and `tier`.

- **`spellcast`** is whichever trait the character's subclass casts with, which is why it's a word
  of its own — the armour granting the bonus can't know what the wearer's subclass is. A Guardian
  or Warrior has no Spellcast trait, so it comes out as 0 for them and no row appears in the
  breakdown.
- **`tier`** is your tier, not your level — 1 at level 1, 2 at levels 2–4, 3 at 5–7, 4 above. The
  two agree only at level 1, so don't reach for `level` when the text says tier.
- It resolves against the trait **after** equipment has modified it, and it can be **negative**:
  a caster whose Spellcast trait is −1 has their thresholds lowered by 1 wearing the armour above.
  That's the literal reading of the text, and the sheet shows it.
- **`equalTo` is the whole value.** `{ "equalTo": "presence", "plus": 2 }` is refused rather than
  half-applied. If you need arithmetic, the bonus isn't declarative — write an `excluded` note.
- `traits` values stay plain numbers; nothing scales a trait penalty.

### A weapon that boosts the other hand

An `attack` bonus applies to the weapon that grants it — that's `weapon:Reliable`, and it's the
default because it's nearly always what the text means. A feature that says otherwise needs
`scope`:

```json
"myhomebrew_weapon_hammer:Steadfast": { "attack": 1, "scope": "primary" }
```

on a **secondary** weapon whose text reads "+1 to attack rolls made with your primary weapon".
Leave `scope` out and the bonus lands on the off-hand's own attacks instead — wrong in the
player's favour, and it looks entirely correct on the sheet, which is why the key exists.

The breakdown still names the weapon that granted it, so the primary attack's "?" reads
`Sourced Hammer (Steadfast) +1` and the number is explained by the hand it didn't come from.

A character fighting bare-handed still has a primary slot, so the bonus reaches their unarmed
attack too.

### A better pair of fists

The SRD gives bare hands a profile of their own — Strength or Finesse at the GM's call, Melee,
`[Proficiency]d4`. A class whose whole point is fighting with nothing in your hands can put its own
profile in its place:

```json
{
  "myhomebrew_class_scrapper:Iron Hands": {
    "unarmedProfile": {
      "name": { "en-US": "Iron Hands" },
      "traits": ["AGILITY", "STRENGTH", "FINESSE", "INSTINCT", "PRESENCE", "KNOWLEDGE"],
      "range": "MELEE",
      "damage": { "dice": ["D8", "D6"], "type": "PHYSICAL" },
      "note": "Iron Hands can be rolled with any trait you choose."
    },
    "evasion": 1
  }
}
```

- **`traits`** is a list, however long. Every one is offered and none is picked for the player —
  the sheet prints "Strength +2 / Agility +1", the same way it handles the SRD's two. A feature
  reading "a trait of your choice" therefore lists all six.
- **`damage.dice`** may be one die or several. Proficiency multiplies **every** die in the list, so
  the example above rolls `2d8+2d6` at Proficiency 2 — which is exactly why it's a list and not the
  string `"D8+D6"`.
- **`note`** (optional) is the sentence printed under the attack, saying whose choice the trait is.
  Left out, the app names the traits instead.
- **Other keys on the same entry apply only while the profile does.** That's how the `+1` above
  can mean "while this weapon is active" without a condition: an entry carrying an
  `unarmedProfile` is consulted only when the profile is in use, so it stops paying out the moment
  the character picks something up.

The profile stands in **only while both hands are empty** — no primary weapon *and* no secondary.
Equip a shield and the character falls back to the SRD's d4, because a shield is a weapon. That
makes a feature worded "while you have no other active weapons" come out right, and it leaves the
SRD's own profile behaving exactly as it always has.

### A level-up option of your own

Some classes add an advancement option nobody else gets: *"Once per tier, you can increase your
Combo Die by one step as a level advancement option."* Declare it on the feature that says so, and
it appears as one more row in the level-up grid, indistinguishable from the printed six.

```json
"myhomebrew_class_tinker:Escalating Gadget": {
  "advancementOption": {
    "label": "Improve your gadget",
    "slots": { "2": 1, "3": 1, "4": 1 }
  }
}
```

- **`slots`** is per tier, the same shape the printed table has, so "how often" needs no wording of
  its own. `{ "2": 1, "3": 1, "4": 1 }` is **once per tier**; `{ "3": 1 }` is **once ever, and not
  before tier 3**. The difference doesn't show until level 5, so decide which you meant.
- Tiers run 2, 3 and 4 — tier 1 is level 1, before any level up. A tier outside that is refused and
  named.
- **`label`** is the row's text, so write the sentence a player should read.
- A **subclass** can declare one too, keyed `<subclassId>:foundation|specialization|mastery`. The
  row appears when that tier does.

What the app does with it:

- **It marks a slot and spends one of the level's two choice points.** If it climbs a `track`
  (below), say so with `"advances": "<track id>"` and the row will also print what the box buys
  you — "Improve your gadget (d6 → d8)".
- The pick is recorded with the row's label, so a character stays readable in a browser that has
  never loaded your source: the slot still shows as marked, still named.
- A slot that's been marked is never taken away. If you shrink `slots` later, or rename the feature,
  or the folder goes missing, the row stays on the grid with the boxes already spent.

### A die your class rolls

A lot of classes own a value with a ladder: *"At level 1, your Rally Die is a d6… at level 5, your
Rally Die increases to a d8."* Say so, and it prints on both sheets and in the CSV export, beside
the Spellcast trait.

```json
"myhomebrew_class_tinker:Escalating Gadget": {
  "track": { "id": "gadget_die", "label": "Gadget Die", "steps": ["d4", "d6", "d8", "d10"] },
  "advancementOption": {
    "label": "Improve your gadget",
    "slots": { "2": 1, "3": 1, "4": 1 },
    "advances": "gadget_die"
  }
}
```

`id` and `label` are required, plus **exactly one** of three ways of saying which rung you're on:

| | Rung comes from | Use it for |
|---|---|---|
| `"steps": ["d4", "d6", …]` | how many times an `advancementOption` that `advances` this id has been marked | a die you spend advancements on |
| `"byLevel": { "1": "d6", "5": "d8" }` | the highest level named that you've reached | a die that grows on its own |
| `"value": "d10"` | nothing — it's fixed while this feature is on the sheet | a **subclass** revising its class's die |

- **The first `steps` entry is where you start**, not the first upgrade.
- **The rungs are text, and the app never reads them.** It counts, and prints what you wrote — so
  they don't have to be dice. `["once", "twice"]` works exactly as well.
- **Two features can share an id, and the later one wins.** Reading order is class features, then
  ancestry, then transformation, then subclass, then equipment, then cards — which is all it takes
  for a subclass's `value` to override its class's `byLevel`, no extra wiring.
- **`note`** (optional) — a sentence under the value. A `byLevel` track writes its own if you
  don't ("Increases to d8 at level 5.").
- Keep the `label` short: it prints on page 1 of the character sheet, in a row that doesn't wrap
  gracefully.

What it can't do: take its value from a stat. There's no `{ "equalTo": … }` here — a track is a
rung on a ladder you wrote, not a computed number.

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
| a value scaled by a *fraction* (`"half your Agility, round up"`) | one word after `equalTo` is the whole vocabulary; a fraction is the first step towards a small language | `excluded` note |
| an `advancementOption` costing 2 choice points, or marking 2 slots at once | the level replay resolves a recorded pick with no content in hand, so what a pick costs has to be answerable from its key alone | declare it as one point and one slot; the only 2-point options are the printed ones (Proficiency, and Multiclass when it lands) |

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
data/<source>/card-art/transformation/<transformation id>.png
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
