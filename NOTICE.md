# Notices

## Code

MIT (see `LICENSE`).

## Game data

The JSON files in `data/srd_1_0/` and `data/srd_2_0/` carry SRD content, used under the
Darrington Press Community Gaming License:

> This product includes materials from the Daggerheart System Reference Document 1.0 and the
> Daggerheart System Reference Document 2.0, © Critical Role, LLC. under the terms of the
> Darrington Press Community Gaming (DPCGL) License. More information can be found at
> https://www.daggerheart.com. There are previous modifications by others.

The previous modifications are [`daggersearch/daggerheart-data`](https://github.com/daggersearch/daggerheart-data),
which structured the SRD as JSON — its `core` release, which is SRD 1.0.

Modifications made here:

- **`data/srd_1_0/`** is that `core` release with the Combat Wheelchairs added (they are in
  SRD 1.0 and were not imported), and with thirty-six passages corrected against the published
  document — five of which changed a rule, and sixteen of which were ancestry descriptions that
  had been paraphrased rather than transcribed.
- **`data/srd_2_0/`** is SRD 2.0: the above plus the Hope & Fear content, less the nine Tier 3
  magic weapons SRD 2.0 dropped, transcribed here from the published SRD. It is **not** the
  upstream `the_void` release, which is Darrington Press's playtest imprint and was revised
  before publication; no playtest record is included.
- The Guardian's *Unstoppable* is merged into a single `classFeatures` entry in both, described
  under "Data source" in the README.

This fork keeps the dataset in per-edition folders under `data/` rather than in `data/` itself,
so that additional content sources can sit beside it; see "Adding your own content" in the
README. Nothing else about the licence position changes — only SRD content is committed here.

## Prohibited Content

Artwork, illustrations, imagery and logos are Prohibited Content under the DPCGL and are
**never** committed to this repository. `data/<source>/card-art/` is git-ignored and the card renderer
degrades to a CSS-only fallback without it. The fonts in `assets/fonts/` are not Daggerheart
material: they are Cinzel, Cinzel Decorative, Montserrat and Overpass, under the SIL Open
Font License.

## Trademark

Daggerheart is a trademark of Darrington Press / Critical Role, LLC. This is an unofficial,
fan-made tool, neither affiliated with nor endorsed by them.
