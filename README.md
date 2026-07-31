# Daggerheart Character Builder

A small, framework-free web app for browsing Daggerheart domain cards and building/leveling up characters — a companion tool for players and GMs running the *Daggerheart* tabletop RPG.

Built out of a personal need: converting a tabletop party from D&D 5e to Daggerheart. Sharing it in case it's useful to anyone else going through the same switch.

## What it does

- **Card browser** (`index.html`) — filter the 189 domain cards by domain, type, and level; build a 5-card loadout plus a vault, saved locally.
- **Character creator** (`create.html`) — a 9-step wizard following the Core Rulebook's character creation steps exactly (class → subclass, ancestry/community, traits, derived stats, equipment, background, experience, domain cards, connections), with the same hard validation the book describes (fixed trait array, mixed-ancestry rule, weapon burden, etc.).
- **Character list & sheet** (`characters.html`) — save multiple characters locally, view a read-only sheet, export a CSV summary for your GM.
- **Level up** (`level-up.html`) — levels 1–10 following the official advancement rules (tiers, level achievements at 2/5/8, the generic per-tier advancement options with their slot limits). Multiclassing is intentionally not implemented — it's rare in play and would add a lot of complexity for little benefit in a tool this size.

Everything is static HTML/CSS/vanilla JS (ES modules), no build step, no backend. All data lives in `localStorage` in your own browser — nothing is sent anywhere.

## Running it

```
python3 -m http.server 8080
```

then open `http://localhost:8080`. Any static file server works.

## About the card art

This repository does **not** include card artwork. Under the [Darrington Press Community Gaming License](https://darringtonpress.com/license/), artwork, illustrations and imagery are explicitly listed as Prohibited Content — they cannot be redistributed, even in fan projects. Only the text/mechanics of the SRD (names, stats, rules text) may be reused, which is what `data/*.json` contains.

Without art, cards render with a clean CSS-only fallback (domain-colored border, name, level, and rules text) — the app is fully usable this way.

If you own the official Core Rulebook PDF, you could write your own script to crop the card art out of it for **strictly personal, local use** — the book's "full art cards" gallery pages use a fixed grid layout, so it's a fairly mechanical image-cropping job (e.g. with `pdftoppm` + `Pillow`). That's outside the scope of what's shared here.

## Data source

The JSON files in `data/` are the Daggerheart System Reference Document (SRD), reused under the DPCGL. They're a straightforward re-export of the community-maintained [`daggersearch/daggerheart-data`](https://github.com/daggersearch/daggerheart-data) dataset — full credit to that project for structuring the SRD as clean JSON in the first place.

## License

The code in this repository is MIT-licensed (see `LICENSE`). Daggerheart itself, its rules, and its SRD content are © Darrington Press, used here under the DPCGL. This is an unofficial, fan-made tool, not affiliated with or endorsed by Darrington Press.
