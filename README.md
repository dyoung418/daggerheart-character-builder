# Daggerheart Character Builder

[![tests](https://github.com/vietts/daggerheart-character-builder/actions/workflows/tests.yml/badge.svg)](https://github.com/vietts/daggerheart-character-builder/actions/workflows/tests.yml)

A small, framework-free web app for browsing Daggerheart domain cards and building/leveling up characters — a companion tool for players and GMs running the *Daggerheart* tabletop RPG.

Built out of a personal need: converting a tabletop party from D&D 5e to Daggerheart. Sharing it in case it's useful to anyone else going through the same switch.

## What it does

- **Card browser** (`index.html`) — filter the 210 domain cards by domain, type, and level; build a 5-card loadout plus a vault, saved locally.
- **Character creator** (`create.html`) — a 9-step wizard following the Core Rulebook's character creation steps exactly (class → subclass, ancestry/community, traits, derived stats, equipment, background, experience, domain cards, connections), with the same validations the book describes (fixed trait array, mixed-ancestry rule, etc.). The equipment step is also where you upgrade gear later: it offers every tier, with your own already open, and each weapon states its trait, range, damage and burden. Weapon burden is shown and warned about rather than enforced — a Warrior's Combat Training ignores it, and what your character can carry is your GM's call. Going unarmored or fighting unarmed are both choices you can make, with the rules that come with them (including `Bare Bones`).
- **Character list & sheet** (`characters.html`) — save multiple characters locally, view a read-only sheet showing what each piece of your gear does, export a CSV summary for your GM, and save all your characters to a file you can load into another browser. You can also set, replace or remove a character's portrait here — a photo picked from the device, shrunk to fit and kept with the character; the transfer file takes it along. The CSV gives every domain card you own a column of its own, with the card's full text in it — so whoever prints from it can put your cards on the page instead of just their names. That file keeps everything, including the choices you made at each level up, so a character you move across can still have any of its level ups changed or undone. The sheet shows every subclass card you've earned, since an upgrade adds a card rather than replacing the one below it. Every stat that a card can modify has a **?** next to it that shows the modifications that have been applied. The numbers include what your ancestry, subclass, equipment and domain card loadout do to them.
- **Printable sheet** (`sheet.html?id=<character>`, linked as "Print sheet") — a print-first, two-page A4 character sheet with no art: identity, traits, defenses, weapons, experiences and loadout names on page one, with empty pen-fillable circles for HP/Stress/Hope; the full rules text of your loadout cards and features on page two, so the table doesn't need the app open to look anything up.
- **Card PDF** (the "Export cards (PDF)" button on a character) — a PDF of every card the character owns: subclass, ancestry, community, and every domain card in both the loadout and the vault, plus two cards the game doesn't print for you — a combat stats card with your traits, evasion, thresholds and weapon, and a card holding your class features. It comes out 9 cards to a US Letter page at the real card size, 2.5 × 3.5 inches, with cut marks in the margins to cut along. Print it at **100%**, not "fit to page", or the cards come out the wrong size. A card whose art you don't have is written out as a plain text card instead, so nothing is missing from the deck. The cards are pictures rather than text, so the file isn't searchable and you can't select or copy anything out of it.

- **At the table** (`play.html?id=<character>`, linked as "Play") — the character on a phone during a session, styled after the [Foundryborne](https://github.com/Foundryborne/daggerheart) Daggerheart sheet (MIT; fonts under the OFL in `assets/fonts/`): name, level and heritage, the portrait if the character has one (set from the character list), Hope diamonds you tap, the class domains, the six traits on shields (with the tier mark), then tabs — **Status** (HP and Stress pips, Evasion, Armor shields, Proficiency, thresholds, the SRD conditions — Vulnerable, Hidden, Restrained — as toggles with their effect spelled out, experiences, a **Rest** you can take, and free-text session notes saved as you type), **Weapons**, **Cards** (the loadout's full text) and **Features**. Tap a pip to mark up to it, tap a marked one to clear it and the ones after. Long-press a Hope diamond (right-click, or Alt+Enter from the keyboard) to scar it: the slot is crossed out for good, as Avoid Death does in the SRD — it asks before it marks one, and frees one without asking. The page's own labels come in English and Italian (`shared/i18n.js`): it follows `<html lang>`, or `?lang=it` / `?lang=en` on the URL; game data stays in the language of the data files. A rest is the SRD's downtime (p. 105): pick a short or a long rest, then take two moves from its menu — the same move twice is allowed. The long rest's are flat (clear all Hit Points, all Stress, all Armor Slots), the short rest's clear *1d4 + your tier*, and that die is the one thing the page rolls: it prints the roll and the tier next to what it actually cleared, so it can be checked against the die on the table. Prepare is offered alone (+1 Hope) and with the party (+2). Work on a Project is listed for completeness — the countdown it ticks is the GM's, so the sheet doesn't change. Nothing about a rest clears a condition: the SRD's downtime moves don't, and the app doesn't invent rules.

**Undo** in the toolbar steps back the last ten changes — a tap on the wrong box clears every mark after it, and that used to be unrecoverable. It covers taps, conditions, scars and rest moves; the notes field is left to the browser's own undo, since saving on every keystroke would fill the history with steps nobody wants.

The marks are saved with the character; the maxima always come from the current sheet, so a level up or an armor change resizes the rows.

- **Level up** (`level-up.html`) — levels 1–10 following the official advancement rules (tiers, level achievements at 2/5/8, the generic per-tier advancement options with their slot limits). Advancements are marked on a grid laid out like the one printed on the character sheet. A collapsible **Level history** on the character sheet shows which level marked each advancement slot and lets you go back and change any past level up decision. **Multiclassing** is there from level 5: pick a second class, one of its domains and a foundation card from one of its subclasses, and the sheet applies its features. Per tier you can upgrade a subclass or multiclass, never both, and the grid strikes through the option you gave up; a subclass upgrade afterwards can advance either subclass. Cards from the new domain are offered at half your level, rounded up.

Everything is static HTML/CSS/vanilla JS (ES modules), no build step, no backend. All data lives in `localStorage` in your own browser — nothing is sent anywhere.

## Running it

```
python3 -m http.server 8080
```

then open `http://localhost:8080`. Any static file server works.

If a page ever looks broken after you pull an update — buttons that render but do
nothing — your browser is mixing cached files with fresh ones. A hard reload
(Ctrl+Shift+R) fixes it, or run this instead, which tells the browser not to cache
at all:

```
python3 serve.py 8080
```

## Contributing

Pull requests welcome. [`CONTRIBUTING.md`](CONTRIBUTING.md) has how to run it, where code goes, and the one house rule that will look unusual (comments say *why*, not *what*).

## Tests

Open `tests/index.html` in the browser — that's all (or run `node tests/node-runner.mjs` from a terminal, `npm test` for short: same suite, text report, exit code 1 on failure). GitHub Actions runs that same command on every push and pull request. It checks the advancement rules, the level history replay, the derived stats, the effects catalogue, the character transfer file, the PDF writer, the card page layout, the card list, the generated cards, the boxes marked at the table and the picture rules for a portrait in `shared/advancement.js`, `shared/history.js`, `shared/derived-stats.js`, `shared/effects.js`, `shared/transfer.js`, `shared/pdf.js`, `shared/card-layout.js`, `shared/card-sheet.js`, `shared/card-content.js`, `shared/table-state.js`, `shared/portrait.js`, `shared/i18n.js` and `shared/choice-keys.js` against hand-written fixtures. No dependencies, no build step, nothing to install, and nothing the app itself loads. If you delete the `tests/` directory, the app is completely unaffected.

## Security notes

The app has no backend and no accounts: every character lives in the `localStorage`
of the browser that created it. There is no server-side data to breach, and hosting
it does **not** give the group a shared character store — each player sees only their
own browser's characters.

A character file you save from **Backup & transfer** is a plain, unencrypted copy of
your characters. Treat it like any other file you share.

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

This repository does **not** include card artwork. Under the [Darrington Press Community Gaming License](https://darringtonpress.com/license/), artwork, illustrations and imagery are explicitly listed as Prohibited Content — they cannot be redistributed, even in fan projects. Only the text/mechanics of the SRD (names, stats, rules text) may be reused, which is what `data/srd_1_0/*.json` and `data/srd_2_0/*.json` contain.

Without art, cards render with a clean CSS-only fallback (domain-colored border, name, level, and rules text) — the app is fully usable this way.

If you own the official Core Rulebook PDF, you could write your own script to crop the card art out of it for **strictly personal, local use** — the book's "full art cards" gallery pages use a fixed grid layout, so it's a fairly mechanical image-cropping job (e.g. with `pdftoppm` + `Pillow`). That's outside the scope of what's shared here.

## Adding your own content

`data/` holds one folder per body of content. `data/srd_1_0/` and `data/srd_2_0/` are the two SRD editions; anything else you create is yours, and **the folder's name is the category**. Make `data/homebrew/` and you have a category called homebrew.

To add one:

1. Create the folder, e.g. `data/homebrew/`.
2. Create `data/sources.local.json` beside it, listing the folder names you want loaded:

   ```json
   ["homebrew"]
   ```

   That file is gitignored, so your content never ends up in a commit. `data/sources.json` is the tracked one and lists only `["srd"]` — the app loads both, in order.
3. Write `data/homebrew/source.json` saying what the folder holds:

   ```json
   { "label": "My Homebrew", "files": ["domain-cards", "classes", "effects"] }
   ```

   `files` is required and names the files you actually wrote — it's what stops the app fetching things that aren't there. `label` is optional and defaults to the folder name.
4. Write those files, in the same shape as the ones in `data/srd_2_0/`. Every file is optional; a folder holding one `domain-cards.json` is perfectly good.

The **Content** button in the top bar lists your sources with a checkbox each, and reports anything it couldn't use. Switching a source off only changes what you can *pick* — a character already built with it keeps its content and its stats, so turning a source off between sessions never damages a character.

A few things worth knowing when you write content:

- **Ids should be your own.** Reuse an id from another source and yours replaces it — that's how you deliberately revise an SRD card. It's reported in the Content panel either way, so an accidental duplicate is visible.
- **Two joins are by name, not id.** A subclass reaches its class through `"class": "BARD"` — the class's name in uppercase — and a card reaches a class through the class's `domains` list containing the card's `domain`. Classes are also de-duplicated by name, so two sources defining `BARD` leave one.
- **Names may be written either way.** `"name": "WITCH"` and `"name": {"en-US": "Witch"}` both work, in any file; the app normalizes to whichever shape that file's readers expect.
- **New domains are fine.** A card in a domain the SRD doesn't have gets its own filter chip in the card browser and the default card border.
- **Transformations are a kind the SRD doesn't have.** Write a `transformations.json` — records shaped like an ancestry — and the creation wizard grows a Transformation step just after Ancestry & Community. A character can take one or none, never two, and can come back for one later, which is how a transformation handed out mid-campaign gets onto the sheet. The step doesn't exist at all unless some source provides them, so nothing changes if you don't write one.
- **A record missing something essential is dropped, not rendered.** The Content panel names it and says what was missing, rather than the page dying.
- **`effects.json` is how content moves a stat.** Rules text prints on its own, but a bonus only counts if it's declared:

  ```json
  { "hb_card_ironhide": { "armorScore": 1, "permanent": true } }
  ```

  Keys are record ids (`<subclass id>:foundation` for a subclass tier, `<ancestry id>:<feature name>` for an ancestry feature). Values may use any stat the app computes, plus `permanent` — without which a card that says its bonus is permanent stops applying once it's in the vault — `feature`, `excluded`, and a whole `choice` block for "permanently gain two of the following". Conditional bonuses can't be expressed: JSON can't carry the function they'd need, and anything unusable is reported rather than silently ignored.
- **Art**, if you have any, goes in `data/<source>/card-art/` with the same `domain/`, `subclass/`, `community/`, `ancestry/` layout as the SRD's, plus `transformation/` if you have any. There's no fallback to SRD art: those images are whole card faces including their rules text, so a card you revised would show the old wording.

## Data source

The JSON files in `data/srd_1_0/` and `data/srd_2_0/` are the Daggerheart System Reference Document, reused under the DPCGL. They started as a re-export of the community-maintained [`daggersearch/daggerheart-data`](https://github.com/daggersearch/daggerheart-data) dataset — full credit to that project for structuring the SRD as clean JSON in the first place.

**One folder per edition.** `data/srd_1_0/` is SRD 1.0; `data/srd_2_0/` is SRD 2.0, which adds the Hope & Fear content — the Witch, Assassin, Warlock and Brawler with their subclasses, the Dread domain's 21 cards, six ancestries, six communities and the six transformations. Both are switched on out of the box, and where they carry the same card SRD 2.0 wins. That is what the pairing is for: SRD 2.0 dropped nine Tier 3 magic weapons that SRD 1.0 has, so leaving both on keeps them available, and switching SRD 1.0 off on the Content screen gives you the current rules and nothing else.

A record's id says which edition it came from — `srd_2_0_domain_card_vitality`. Characters follow the editions you have loaded: turn one off and the ids a character stored are re-pointed at whatever is still there, so nobody loses a class or a weapon by changing the setting.

### What was corrected

The upstream dataset labelled the Hope & Fear classes `the_void`, after Darrington Press's **playtest** imprint. Playtest material is revised before it reaches a book, and this content was: the Brawler's Hope feature is *Square Up* in SRD 2.0 and *Staggering Strike* in the playtest, which is a different move rather than a rename. `data/srd_2_0/` is transcribed from the published SRD instead, and no playtest record is included. (The Void's actual playtest content is a separate, optional source.)

Thirty-six other differences from the published text were fixed while checking every record against both editions, five of which changed what happens at the table — among them the Buckler's Evasion bonus (Armor **Score**, not Armor Slots), the Primer Shard's missing "with your primary weapon", and two consumables whose digits had been mangled by a bad PDF extraction (`(d20` for `4d20`). Sixteen of the eighteen SRD 1.0 ancestry descriptions had been paraphrased rather than transcribed, and now carry the SRD's own words.

One further divergence, in both `classes.json` files: the Guardian's *Unstoppable* was split across two `classFeatures` entries, the second of which carried the lead-in sentence "While Unstoppable, you gain the following benefits:" in its `name` field rather than its description. Anywhere feature names are listed on their own — the printable sheet's summary strip, for one — that sentence turned up as if it were the name of a second feature. The two entries are merged here into one, with the lead-in as a paragraph before the list it introduces.

## License

The code in this repository is MIT-licensed (see `LICENSE`). The SRD content in `data/srd_1_0/` and `data/srd_2_0/` is © Critical Role, LLC., used under the Darrington Press Community Gaming License — the notice that licence asks for, along with what this project changed and what it deliberately leaves out, is in [`NOTICE.md`](NOTICE.md). This is an unofficial, fan-made tool, neither affiliated with nor endorsed by Darrington Press or Critical Role.
