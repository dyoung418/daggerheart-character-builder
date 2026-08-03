# Daggerheart Character Builder

A small, framework-free web app for browsing Daggerheart domain cards and building/leveling up characters — a companion tool for players and GMs running the *Daggerheart* tabletop RPG.

Built out of a personal need: converting a tabletop party from D&D 5e to Daggerheart. Sharing it in case it's useful to anyone else going through the same switch.

## What it does

- **Card browser** (`index.html`) — filter the 189 domain cards by domain, type, and level; build a 5-card loadout plus a vault, saved locally.
- **Character creator** (`create.html`) — a 9-step wizard following the Core Rulebook's character creation steps exactly (class → subclass, ancestry/community, traits, derived stats, equipment, background, experience, domain cards, connections), with the same hard validation the book describes (fixed trait array, mixed-ancestry rule, weapon burden, etc.).
- **Character list & sheet** (`characters.html`) — save multiple characters locally, view a read-only sheet, export a CSV summary for your GM. The sheet shows every subclass card the character has earned (Foundation, then Specialization and Mastery as they're taken), because an upgrade *adds* a card rather than replacing the one below it — the earlier cards' features are still in play. Every derived stat — Evasion, Hit Points, Stress, damage thresholds, Armor Score, your attack modifier per equipped weapon, and which trait your Spellcast Rolls use — has a **?** next to it that shows exactly what the number is built from, so a total you didn't expect can be checked rather than guessed at. The numbers include what your ancestry, subclass, equipment and loadout do to them (see [Which bonuses show up](#which-bonuses-show-up)). A collapsible **Level history** shows which level marked each advancement slot and lets you go back and change any past level up decision, remove the most recent level, or undo the last edit. If changing an early level makes a later one stop adding up, you're told before saving and the affected levels are flagged until you fix them — or keep them as they are, for houserules.
- **Level up** (`level-up.html`) — levels 1–10 following the official advancement rules (tiers, level achievements at 2/5/8, the generic per-tier advancement options with their slot limits). Advancements are marked on a grid laid out like the one printed on the character sheet, so you can spend both of a level's picks on the same option when it still has free slots, and it's clear which tier's slot you're using — that matters for the extra domain card, whose level is capped both by your level and by the tier of the slot you mark. Hit Point and Stress slots stop at 12, and the optional card exchange allowed on every level up is available too. Multiclassing is intentionally not implemented — it's rare in play and would add a lot of complexity for little benefit in a tool this size.

Everything is static HTML/CSS/vanilla JS (ES modules), no build step, no backend. All data lives in `localStorage` in your own browser — nothing is sent anywhere.

## Which bonuses show up

Plenty of things move a stat: a Giant gets an extra Hit Point slot, School of War gets another,
Stalwart raises your damage thresholds at every tier, Gambeson Armor gives +1 Evasion and a
Halberd costs you a point of Finesse. The SRD states all of this as prose, and `data/` is a
straight re-export of it (see [Data source](#data-source)), so the prose→numbers mapping lives
in `shared/effects.js` instead — one hand-maintained file, each entry commented with the
sentence it encodes. A data refresh can't overwrite it, and `tests.html` checks that every id it
names still exists upstream.

A bonus is counted when it's true **right now** given only what the app stores — your permanent
choices, what's in your loadout, how you're equipped — and needs no action during play:

1. Permanent changes (Giant's *Endurance*, *Vitality*).
2. A card in your loadout whose bonus applies the whole time it's there (*Untouchable*).
3. A `*-Touched` card once its four-cards-in-domain requirement is met — judged per benefit.
4. A card in your loadout whose only other requirement is how you're configured rather than
   something you do (*Fortified Armor*: "while you are wearing armor").

Anything that costs Stress or Hope, is "once per rest", or depends on the state of play
(Vulnerable, Hope ≥ 2, all Stress marked) or on the fiction (*Sage-Touched*'s "natural
environment") is left out — it isn't on at the moment you look at the sheet, and this tool
tracks choices and loadouts, not the comings and goings of a scene. Where a card you have
does qualify but one of its benefits doesn't, the sheet lists that benefit under **bonuses you
have but that aren't counted**, so four Codex cards giving you nothing visible reads as a
decision rather than a bug.

Moving a card between loadout and vault changes the numbers, and the sheet updates as you do it.

Three features say "choose" rather than granting something outright — Clank's *Purposeful
Design*, *Vitality* and *Master of the Craft*. You're asked where the effect is gained (the
Experience step for the ancestry one, the level up screen for the cards), and until you answer,
the sheet says so and the bonus isn't counted. It never blocks saving or levelling up, so a
character made before this existed stays editable.

A feature can also hand you a domain card outright — the School of Knowledge's cards each say
"take an additional domain card of your level or lower". You pick it in the wizard for the
Foundation card and on the level up screen when you take the Specialization or Mastery upgrade,
in both cases on top of the guaranteed card and anything bought with an advancement slot.

### Adding a card

When new cards come out, a stat change should be one entry in `shared/effects.js` and nothing
else. Keys are `<entityId>:<discriminator>` — the tier for subclasses, the feature name for
ancestries, armor and weapons; domain cards use the id alone. Armor and weapon features that
mean the same thing wherever they appear are keyed `armor:<feature>` / `weapon:<feature>`, so a
new shield with the existing `Protective` wording needs nothing at all.

Nothing outside that file names a card, a subclass or an ancestry. The pages work from what an
entry declares:

- **Which stat it moves** — any key in `EFFECT_STAT_KEYS`. Values may be numbers or functions
  of the character, and `when` gates them.
- **Where it comes from** — `collectEffects` tags each one `ancestry` / `subclass` / `armor` /
  `weapon` / `domainCard`, and that tag decides where a `choice` gets asked: ancestry choices in
  the wizard, card choices on the level up screen.
- **What shape of choice it asks for** — `shared/effect-choice.js` renders "pick N of these
  benefits" and "pick N of your Experiences" for both screens.
- **How many cards it grants** — the level up screen compares what your effects grant before
  this level's picks against after, so anything that starts granting cards partway through a
  career is picked up by being catalogued.

New code is needed only for a genuinely new *kind* of thing: a stat the app doesn't compute, or
a choice that isn't one of the two shapes above.

## Running it

```
python3 -m http.server 8080
```

then open `http://localhost:8080`. Any static file server works.

## Tests

Open `tests.html` in the browser — that's all. It checks the advancement rules, the level
history replay, the derived stats and the effects catalogue in `shared/advancement.js`,
`shared/history.js`, `shared/derived-stats.js` and `shared/effects.js` against hand-written
fixtures, using the same ES modules the app loads. One group is the exception and reads `data/`
for real: it asserts that every id `effects.js` names still exists, since an upstream rename
would otherwise drop a bonus silently. No dependencies, no build step, nothing to install, and
nothing the app itself loads. Delete the `tests.*` files and the app is completely unaffected.

Every file the suite touches — including the suite itself — is fetched with a per-run token, so
after an edit a plain reload is enough. That matters more than it sounds: a cached copy doesn't
fail, it passes, against code you've already changed.

## Known gaps

**Armor is mandatory, and there's no own-vs-equip.** `equipment` is four ids, all implicitly
worn or wielded, and the wizard requires you to pick armor. The SRD's unarmored rule (Armor
Score 0, Major threshold = your level, Severe = twice your level) is implemented, but nothing
can currently reach it. Consequently *Bare Bones* — which replaces your base Armor Score and
thresholds when you choose not to equip armor — is **not** implemented: it would be the only
user of an effect kind that overrides a base rather than adding to it, and that mechanism isn't
worth building without a caller.

Equipping and unequipping is the feature that unlocks all three at once: *Bare Bones*, the
base-override effect kind it needs, and the plain unarmored rule for characters who don't have
it. Until then, a nullable `armorId` keeps the door open.

**Characters saved before domain card counts were derived** assume the usual 2 starting cards
when their creation cards are worked out for the first time, even for a School of Knowledge
wizard who took 3. It's a one-off migration guess in `ensureLevelFields`, which has no data
files to consult; re-picking the starting cards in the wizard corrects it.

**Multiclassing** is deliberately out of scope — rare in play, and a lot of data and UI for a
tool this size.

## Security notes

The app has no backend and no accounts: every character lives in the `localStorage`
of the browser that created it. There is no server-side data to breach, and hosting
it does **not** give the group a shared character store — each player sees only their
own browser's characters.

Free text the user types (character name, pronouns, Experience names, background and
appearance notes, connections) is rendered through `innerHTML` templates in several
places, so it is escaped with `shared/escape.js` before interpolation. If you add new
markup built from template literals, run user text through `escapeHtml()` — or use
`textContent`, as most of the rendering code already does.

The CSV export is meant to be handed to the GM, i.e. it crosses to someone else's
machine. Spreadsheet apps evaluate a cell whose text begins with `=`, `+`, `-` or `@`
as a formula even when the field is quoted, so `csvField()` prefixes those with an
apostrophe (plain numbers are exempt, to keep negative trait values numeric).

Each page ships a restrictive `Content-Security-Policy` meta tag. Notably
`script-src 'self'` means no inline script runs, which defuses injected event
handlers like `<img onerror=...>` even if an escaping bug slips through. Keep it that
way: avoid inline `<script>`, inline `on*` handlers, and `style="..."` attributes.

### If you expose it beyond localhost

`python3 -m http.server` is a development server — single-threaded, no TLS, no access
control. For a group, put a real static server in front (nginx, Caddy, Apache) and
serve over HTTPS. Send the headers a `<meta>` tag cannot, for example in nginx:

```nginx
add_header Content-Security-Policy "default-src 'self'; script-src 'self'; style-src 'self' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'" always;
add_header X-Content-Type-Options "nosniff" always;
add_header Referrer-Policy "no-referrer" always;
add_header Strict-Transport-Security "max-age=31536000" always;
```

`frame-ancestors` only works as a real header (it is ignored in a `<meta>` tag), so
this is what actually stops the app being framed by another site.

There is no authentication: anyone who can reach the URL can use the builder. Since
nothing is stored server-side that is mostly a non-issue, but put it behind your LAN,
a VPN, or HTTP basic auth if you would rather it not be public.

`style.css` pulls a font from Google Fonts, which means every page load reveals each
player's IP and user agent to Google. Self-host the font (or drop the `@import` and
fall back to the system stack) if that matters to you — and tighten `style-src` and
`font-src` to `'self'` if you do.

## About the card art

This repository does **not** include card artwork. Under the [Darrington Press Community Gaming License](https://darringtonpress.com/license/), artwork, illustrations and imagery are explicitly listed as Prohibited Content — they cannot be redistributed, even in fan projects. Only the text/mechanics of the SRD (names, stats, rules text) may be reused, which is what `data/*.json` contains.

Without art, cards render with a clean CSS-only fallback (domain-colored border, name, level, and rules text) — the app is fully usable this way.

If you own the official Core Rulebook PDF, you could write your own script to crop the card art out of it for **strictly personal, local use** — the book's "full art cards" gallery pages use a fixed grid layout, so it's a fairly mechanical image-cropping job (e.g. with `pdftoppm` + `Pillow`). That's outside the scope of what's shared here.

## Data source

The JSON files in `data/` are the Daggerheart System Reference Document (SRD), reused under the DPCGL. They're a straightforward re-export of the community-maintained [`daggersearch/daggerheart-data`](https://github.com/daggersearch/daggerheart-data) dataset — full credit to that project for structuring the SRD as clean JSON in the first place.

## License

The code in this repository is MIT-licensed (see `LICENSE`). Daggerheart itself, its rules, and its SRD content are © Darrington Press, used here under the DPCGL. This is an unofficial, fan-made tool, not affiliated with or endorsed by Darrington Press.
