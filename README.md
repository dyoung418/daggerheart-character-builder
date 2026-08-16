# Daggerheart Character Builder

A small, framework-free web app for browsing Daggerheart domain cards and building/leveling up characters — a companion tool for players and GMs running the *Daggerheart* tabletop RPG.

Built out of a personal need: converting a tabletop party from D&D 5e to Daggerheart. Sharing it in case it's useful to anyone else going through the same switch.

## What it does

- **Card browser** (`index.html`) — filter the 189 domain cards by domain, type, and level; build a 5-card loadout plus a vault, saved locally.
- **Character creator** (`create.html`) — a 9-step wizard following the Core Rulebook's character creation steps exactly (class → subclass, ancestry/community, traits, derived stats, equipment, background, experience, domain cards, connections), with the same validations the book describes (fixed trait array, mixed-ancestry rule, etc.). The equipment step is also where you upgrade gear later: it offers every tier, with your own already open, and each weapon states its trait, range, damage and burden. Weapon burden is shown and warned about rather than enforced — a Warrior's Combat Training ignores it, and what your character can carry is your GM's call. Going unarmored or fighting unarmed are both choices you can make, with the rules that come with them (including `Bare Bones`).
- **Character list & sheet** (`characters.html`) — save multiple characters locally, view a read-only sheet showing what each piece of your gear does, export a CSV summary for your GM, and save all your characters to a file you can load into another browser. The CSV gives every domain card you own a column of its own, with the card's full text in it — so whoever prints from it can put your cards on the page instead of just their names. That file keeps everything, including the choices you made at each level up, so a character you move across can still have any of its level ups changed or undone. The sheet shows every subclass card you've earned, since an upgrade adds a card rather than replacing the one below it. Every stat that a card can modify has a **?** next to it that shows the modifications that have been applied. The numbers include what your ancestry, subclass, equipment and domain card loadout do to them.
- **Printable sheet** (`sheet.html?id=<character>`, linked as "Print sheet") — a print-first, two-page A4 character sheet with no art: identity, traits, defenses, weapons, experiences and loadout names on page one, with empty pen-fillable circles for HP/Stress/Hope; the full rules text of your loadout cards and features on page two, so the table doesn't need the app open to look anything up.
- **Level up** (`level-up.html`) — levels 1–10 following the official advancement rules (tiers, level achievements at 2/5/8, the generic per-tier advancement options with their slot limits). Advancements are marked on a grid laid out like the one printed on the character sheet. A collapsible **Level history** on the character sheet shows which level marked each advancement slot and lets you go back and change any past level up decision. Multiclassing is intentionally not implemented — it's rare in play and would add a lot of complexity for little benefit in a tool this size.

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

## Tests

Open `tests/index.html` in the browser — that's all. It checks the advancement rules, the level history replay, the derived stats, the effects catalogue and the character transfer file in `shared/advancement.js`, `shared/history.js`, `shared/derived-stats.js`, `shared/effects.js` and `shared/transfer.js` against hand-written fixtures. No dependencies, no build step, nothing to install, and nothing the app itself loads. If you delete the `tests/` directory, the app is completely unaffected.

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

This repository does **not** include card artwork. Under the [Darrington Press Community Gaming License](https://darringtonpress.com/license/), artwork, illustrations and imagery are explicitly listed as Prohibited Content — they cannot be redistributed, even in fan projects. Only the text/mechanics of the SRD (names, stats, rules text) may be reused, which is what `data/srd/*.json` contains.

Without art, cards render with a clean CSS-only fallback (domain-colored border, name, level, and rules text) — the app is fully usable this way.

If you own the official Core Rulebook PDF, you could write your own script to crop the card art out of it for **strictly personal, local use** — the book's "full art cards" gallery pages use a fixed grid layout, so it's a fairly mechanical image-cropping job (e.g. with `pdftoppm` + `Pillow`). That's outside the scope of what's shared here.

## Adding your own content

`data/` holds one folder per body of content. `data/srd/` is the SRD; anything else you create is yours, and **the folder's name is the category**. Make `data/homebrew/` and you have a category called homebrew.

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
4. Write those files, in the same shape as the ones in `data/srd/`. Every file is optional; a folder holding one `domain-cards.json` is perfectly good.

The **Content** button in the top bar lists your sources with a checkbox each, and reports anything it couldn't use. Switching a source off only changes what you can *pick* — a character already built with it keeps its content and its stats, so turning a source off between sessions never damages a character.

A few things worth knowing when you write content:

- **Ids should be your own.** Reuse an id from another source and yours replaces it — that's how you deliberately revise an SRD card. It's reported in the Content panel either way, so an accidental duplicate is visible.
- **Two joins are by name, not id.** A subclass reaches its class through `"class": "BARD"` — the class's name in uppercase — and a card reaches a class through the class's `domains` list containing the card's `domain`. Classes are also de-duplicated by name, so two sources defining `BARD` leave one.
- **Names may be written either way.** `"name": "WITCH"` and `"name": {"en-US": "Witch"}` both work, in any file; the app normalizes to whichever shape that file's readers expect.
- **New domains are fine.** A card in a domain the SRD doesn't have gets its own filter chip in the card browser and the default card border.
- **A record missing something essential is dropped, not rendered.** The Content panel names it and says what was missing, rather than the page dying.
- **`effects.json` is how content moves a stat.** Rules text prints on its own, but a bonus only counts if it's declared:

  ```json
  { "hb_card_ironhide": { "armorScore": 1, "permanent": true } }
  ```

  Keys are record ids (`<subclass id>:foundation` for a subclass tier, `<ancestry id>:<feature name>` for an ancestry feature). Values may use any stat the app computes, plus `permanent` — without which a card that says its bonus is permanent stops applying once it's in the vault — `feature`, `excluded`, and a whole `choice` block for "permanently gain two of the following". Conditional bonuses can't be expressed: JSON can't carry the function they'd need, and anything unusable is reported rather than silently ignored.
- **Art**, if you have any, goes in `data/<source>/card-art/` with the same `domain/`, `subclass/`, `community/`, `ancestry/` layout as the SRD's. There's no fallback to SRD art: those images are whole card faces including their rules text, so a card you revised would show the old wording.

## Data source

The JSON files in `data/srd/` are the Daggerheart System Reference Document (SRD), reused under the DPCGL. They're a re-export of the community-maintained [`daggersearch/daggerheart-data`](https://github.com/daggersearch/daggerheart-data) dataset — full credit to that project for structuring the SRD as clean JSON in the first place.

One deliberate divergence from upstream, in `data/srd/classes.json`: the Guardian's *Unstoppable* was split across two `classFeatures` entries, the second of which carried the lead-in sentence "While Unstoppable, you gain the following benefits:" in its `name` field rather than its description. Anywhere feature names are listed on their own — the printable sheet's summary strip, for one — that sentence turned up as if it were the name of a second feature. The two entries are merged here into one, with the lead-in as a paragraph before the list it introduces. It's the only feature in the whole dataset whose name is a sentence, so re-exporting from upstream means re-applying this.

## License

The code in this repository is MIT-licensed (see `LICENSE`). Daggerheart itself, its rules, and its SRD content are © Darrington Press, used here under the DPCGL. This is an unofficial, fan-made tool, not affiliated with or endorsed by Darrington Press.
