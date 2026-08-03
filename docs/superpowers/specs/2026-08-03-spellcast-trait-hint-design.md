# Spellcast trait hint in Traits & Equipment steps

Addresses [issue #2](https://github.com/vietts/daggerheart-character-builder/issues/2): while assigning trait scores and picking starting equipment, the wizard gives no way to see which trait a subclass casts spells with, so there's no way to know which trait to max or which weapon lines up with it.

## Problem

`renderTraitsStep` shows six bare `<select>` rows with no reference to the chosen subclass. `renderEquipmentStep` / `weaponSelect` already prints each weapon's trait (e.g. "AGILITY · MELEE · D10 phy"), but nothing marks which trait is the *player's* spellcasting trait, so the information on screen can't be connected to a decision.

The core rulebook has suggested starting trait arrays per class; the SRD data shipped in this repo (`data/*.json`) does not. That data is out of reach, but it isn't needed: `subclasses.json` already carries a `spellcastTrait` field per subclass (`null` for non-casters like Warrior and Guardian), and `weapons.json` already carries `trait` per weapon. That's sufficient to answer the question the issue actually asks.

## Design

No new data, no new panel, no new files. Two existing render functions in `create.js` gain a small highlight, styled with one new CSS rule.

**Traits step** (`renderTraitsStep`): if `selectedSubclass()?.spellcastTrait` matches a trait row, append a badge to that row's label — e.g. "Agility ★ spellcasting (Beastbound)". Reuses the visual pattern of the existing `.badge-draft` pill (`style.css`) under a new `.badge-spellcast` class.

**Equipment step** (`weaponSelect`): weapons whose `trait` matches the subclass's `spellcastTrait` get the same badge appended inline to their row text, plus an accent left-border on the row (new modifier class) so they stand out in the list without touching unrelated rows.

**Non-casters and no-subclass-yet**: when `spellcastTrait` is `null` (Warrior, Guardian subclasses) or no subclass is selected yet, nothing is rendered — both steps look exactly as they do today. The step-nav sidebar (`goToStep`) has no validation gate, so a player can reach Traits/Equipment before picking a class; `selectedSubclass()` returning `null` in that case must not throw or show a stray badge.

## Testing

Manual browser walkthrough (no automated UI tests exist in this project):
- A spellcasting subclass (e.g. Wizard/School of Knowledge, `spellcastTrait: KNOWLEDGE`) shows the badge on the Knowledge trait row and on every Knowledge-trait weapon in Equipment.
- The Guardian test character from the PR review earlier in this session (`spellcastTrait: null`) shows no badge anywhere — confirms no regression for non-casters.
- Jumping directly to Traits/Equipment via the step-nav before selecting a class confirms no error and no stray badge.
