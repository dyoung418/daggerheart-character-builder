# Spellcast Trait Hint Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** During the Traits and Equipment steps of character creation, badge the trait row and the matching weapons with the subclass's spellcasting trait, so a player can see which trait to raise and which weapon to pick without leaving the step.

**Architecture:** Two existing render functions in `create.js` (`renderTraitsStep`, `renderEquipmentStep` → `weaponSelect`) gain a small conditional badge, driven by the `spellcastTrait` field already present on every entry in `data/subclasses.json`. One shared helper builds the badge markup; one new CSS class styles it; one modifier class puts an accent border on a matching weapon row. No new files, no new data fetching, no new state on the `character` object.

**Tech Stack:** Vanilla JS (ES modules), no build step, no test framework — same as the rest of the project. Verification is a manual browser walkthrough via `python3 -m http.server`, the same method used to verify the four level-history PRs merged earlier in this session.

## Global Constraints

- No automated UI test framework exists in this repo. `tests.html`/`tests.js` (merged in PR #6) cover only the pure functions in `shared/advancement.js` and `shared/history.js` — they do not touch `create.js`. Every verification step in this plan is therefore "open the page in a browser and read what's rendered," not a test runner invocation.
- Match existing code style exactly: `escapeHtml()` around every piece of text that reaches `innerHTML`, `TRAIT_KEYS`/`TRAIT_LABELS` constants already defined at the top of `create.js`, CSS variables already defined in `style.css` (`--accent-bright`, `--panel-alt`, `--border`) — do not introduce new ones.
- `subclass.spellcastTrait` is uppercase (`"AGILITY"`, `"KNOWLEDGE"`, ...) or `null`. `TRAIT_KEYS` entries are lowercase (`"agility"`, ...). Compare with `k.toUpperCase() === spellcastTrait`.
- The step-nav sidebar (`goToStep`, `create.js:195`) has no validation gate — a player can land on Traits or Equipment with no class/subclass chosen yet. `selectedSubclass()` returns `null` in that case; every new code path must treat `null` (and `spellcastTrait: null` for non-casters like Warrior/Guardian) as "render nothing extra," matching current behavior exactly.

---

### Task 1: Shared badge helper + CSS

**Files:**
- Modify: `create.js:14` (after the `TRAIT_LABELS` constant)
- Modify: `style.css` (near the existing `.badge-draft` rule, `style.css:502`)

**Interfaces:**
- Produces: `spellcastBadge()` — a module-level function in `create.js`, no arguments, returns a literal HTML string: `<span class="badge-spellcast" title="Spellcasting trait">★ spellcasting</span>`. Tasks 2 and 3 call this function to get the badge markup; it takes no arguments because the string is fixed (no interpolated user data, so no `escapeHtml` needed).

- [ ] **Step 1: Add the `spellcastBadge()` helper to `create.js`**

Open `create.js`. Immediately after the `TRAIT_LABELS` constant (currently `create.js:14`), add:

```js
function spellcastBadge() {
  return `<span class="badge-spellcast" title="Spellcasting trait">★ spellcasting</span>`;
}
```

- [ ] **Step 2: Add the CSS rules to `style.css`**

Open `style.css`. Immediately after the `.badge-draft` rule (currently `style.css:502`), add:

```css
.badge-spellcast { display: inline-block; background: var(--panel-alt); color: var(--accent-bright); font-size: 0.65rem; padding: 0.1rem 0.4rem; border-radius: 4px; letter-spacing: 0.04em; white-space: nowrap; }
.trait-row-trailing { display: flex; align-items: center; gap: 0.4rem; }
.option-row.trait-match { border-left: 3px solid var(--accent-bright); }
```

(`.trait-row-trailing` is used by Task 2 to keep `.trait-row`'s `justify-content: space-between` layout correct when both the existing "now" hint and the new badge are present.)

- [ ] **Step 3: Verify in browser**

```bash
cd /private/tmp/claude-501/-Users-francesconguyen/c7e9905f-4a7a-4b96-8c35-ee590e7958bd/scratchpad/daggerheart-character-builder
python3 -m http.server 8935 &
```

Open `http://localhost:8935/create.html` in a browser. The page must load with no console errors (the new function is unused so far — this step just confirms no syntax error was introduced). Check the browser console via `mcp__claude-in-chrome__read_console_messages` or equivalent; expect zero errors.

- [ ] **Step 4: Commit**

```bash
git add create.js style.css
git commit -m "Add spellcastBadge() helper and badge/highlight CSS"
```

---

### Task 2: Badge the spellcasting trait row in the Traits step

**Files:**
- Modify: `create.js:459-478` (`renderTraitsStep`, the trait-row loop)

**Interfaces:**
- Consumes: `spellcastBadge()` from Task 1. `selectedSubclass()` (already defined at `create.js:138`, returns the subclass object or `null`). `TRAIT_KEYS`, `TRAIT_LABELS`, `TRAIT_ARRAY` (already defined constants).
- Produces: nothing new consumed by later tasks — this task's output is purely rendered DOM.

- [ ] **Step 1: Read the current loop for context**

The loop to modify is inside `renderTraitsStep`, right after `const grid = document.createElement("div");`:

```js
  const grid = document.createElement("div");
  grid.className = "traits-grid";
  for (const k of TRAIT_KEYS) {
    const row = document.createElement("div");
    row.className = "trait-row";
    const current = base[k];
    const options = TRAIT_ARRAY.filter((v, i, arr) => arr.indexOf(v) === i); // distinct values: 2,1,0,-1
    let optionsHtml = `<option value="">—</option>`;
    for (const v of options) {
      const available = usedCount[v] + (current === v ? 1 : 0);
      if (available > 0) {
        optionsHtml += `<option value="${v}" ${current === v ? "selected" : ""}>${v > 0 ? "+" + v : v}</option>`;
      }
    }
    const gained = (character.traits[k] ?? 0) - (current ?? 0);
    const nowLabel = levelled && gained > 0 ? `<span class="hint">→ ${character.traits[k] > 0 ? "+" : ""}${character.traits[k]} now</span>` : "";
    row.innerHTML = `<label>${TRAIT_LABELS[k]}</label><select data-trait="${k}">${optionsHtml}</select>${nowLabel}`;
    grid.appendChild(row);
  }
```

- [ ] **Step 2: Replace it with the badge-aware version**

```js
  const grid = document.createElement("div");
  grid.className = "traits-grid";
  const subclass = selectedSubclass();
  for (const k of TRAIT_KEYS) {
    const row = document.createElement("div");
    row.className = "trait-row";
    const current = base[k];
    const options = TRAIT_ARRAY.filter((v, i, arr) => arr.indexOf(v) === i); // distinct values: 2,1,0,-1
    let optionsHtml = `<option value="">—</option>`;
    for (const v of options) {
      const available = usedCount[v] + (current === v ? 1 : 0);
      if (available > 0) {
        optionsHtml += `<option value="${v}" ${current === v ? "selected" : ""}>${v > 0 ? "+" + v : v}</option>`;
      }
    }
    const gained = (character.traits[k] ?? 0) - (current ?? 0);
    const nowLabel = levelled && gained > 0 ? `<span class="hint">→ ${character.traits[k] > 0 ? "+" : ""}${character.traits[k]} now</span>` : "";
    const isSpellcastTrait = subclass && subclass.spellcastTrait === k.toUpperCase();
    const trailing = nowLabel || isSpellcastTrait
      ? `<span class="trait-row-trailing">${nowLabel}${isSpellcastTrait ? spellcastBadge() : ""}</span>`
      : "";
    row.innerHTML = `<label>${TRAIT_LABELS[k]}</label><select data-trait="${k}">${optionsHtml}</select>${trailing}`;
    grid.appendChild(row);
  }
```

The only changes: `const subclass = selectedSubclass();` added once before the loop, `isSpellcastTrait` computed per row, and `nowLabel` wrapped (together with the badge) in a `.trait-row-trailing` span instead of being spliced in directly — this keeps `.trait-row`'s `space-between` layout at three visual columns (label / select / trailing-info) instead of growing to four when both a "now" hint and a badge are present.

- [ ] **Step 3: Verify — spellcaster subclass shows the badge**

With the server from Task 1 still running (or restart it: `python3 -m http.server 8935` from the repo root), open `http://localhost:8935/create.html`, pick class **Wizard** → subclass **School of Knowledge** (`spellcastTrait: KNOWLEDGE`), advance to the Traits step. Confirm the **Knowledge** row shows the "★ spellcasting" badge and no other row does.

- [ ] **Step 4: Verify — non-caster subclass shows no badge**

Start a second new character, pick class **Guardian** → subclass **Stalwart** (`spellcastTrait: null`), advance to Traits. Confirm no row shows a badge, and the layout is visually identical to before this change (no stray empty `.trait-row-trailing` spacing artifact).

- [ ] **Step 5: Verify — no class selected yet**

Start a third new character. Without picking a class, click "Traits" directly in the left step-nav. Confirm the step renders (six bare rows, no badge) with no console error — this exercises `selectedSubclass() === null`.

- [ ] **Step 6: Commit**

```bash
git add create.js
git commit -m "Badge the spellcasting trait row in the Traits step"
```

---

### Task 3: Highlight matching weapons in the Equipment step

**Files:**
- Modify: `create.js:513-546` (`renderEquipmentStep`, the two `weaponSelect(...)` call sites)
- Modify: `create.js:583-595` (`weaponSelect` function signature and body)

**Interfaces:**
- Consumes: `spellcastBadge()` from Task 1.
- Produces: `weaponSelect(weapons, selectedId, onSelect, spellcastTrait)` — adds a 4th parameter to the existing function. `spellcastTrait` is the uppercase trait string (e.g. `"KNOWLEDGE"`) or `null`. This is a breaking change to `weaponSelect`'s signature within the same file — both call sites in `renderEquipmentStep` must be updated in this same task (there are no other call sites; verified below).

- [ ] **Step 1: Confirm there are no other callers of `weaponSelect`**

```bash
grep -n "weaponSelect(" create.js
```

Expected: exactly three matches — the function definition and the two calls inside `renderEquipmentStep`. If there are more, every one of them needs the new 4th argument in Step 3 below.

- [ ] **Step 2: Update `weaponSelect` to accept and use `spellcastTrait`**

Current code:

```js
function weaponSelect(weapons, selectedId, onSelect) {
  const list = document.createElement("div");
  list.className = "option-list";
  for (const w of weapons) {
    const dmg = `${w.damage.dice} ${w.damage.type === "PHYSICAL" ? "phy" : "mag"}`;
    const row = document.createElement("label");
    row.className = "option-row";
    row.innerHTML = `<input type="radio" name="weapon-${escapeHtml(w.type)}-${escapeHtml(w.burden)}" value="${escapeHtml(w.id)}" ${selectedId === w.id ? "checked" : ""}/> <strong>${escapeHtml(w.name["en-US"])}</strong> — ${escapeHtml(w.trait)} · ${escapeHtml(w.range)} · ${escapeHtml(dmg)}`;
    row.querySelector("input").addEventListener("change", () => onSelect(w.id));
    list.appendChild(row);
  }
  return list;
}
```

Replace with:

```js
function weaponSelect(weapons, selectedId, onSelect, spellcastTrait) {
  const list = document.createElement("div");
  list.className = "option-list";
  for (const w of weapons) {
    const dmg = `${w.damage.dice} ${w.damage.type === "PHYSICAL" ? "phy" : "mag"}`;
    const matchesSpellcast = !!spellcastTrait && w.trait === spellcastTrait;
    const row = document.createElement("label");
    row.className = "option-row" + (matchesSpellcast ? " trait-match" : "");
    const badge = matchesSpellcast ? ` ${spellcastBadge()}` : "";
    row.innerHTML = `<input type="radio" name="weapon-${escapeHtml(w.type)}-${escapeHtml(w.burden)}" value="${escapeHtml(w.id)}" ${selectedId === w.id ? "checked" : ""}/> <strong>${escapeHtml(w.name["en-US"])}</strong> — ${escapeHtml(w.trait)} · ${escapeHtml(w.range)} · ${escapeHtml(dmg)}${badge}`;
    row.querySelector("input").addEventListener("change", () => onSelect(w.id));
    list.appendChild(row);
  }
  return list;
}
```

- [ ] **Step 3: Pass the subclass's trait at both call sites in `renderEquipmentStep`**

Current code (`renderEquipmentStep`):

```js
  const h3a = document.createElement("h3");
  h3a.textContent = "Primary weapon (Tier 1)";
  panel.appendChild(h3a);
  panel.appendChild(weaponSelect(primaries, e.primaryWeaponId, (id) => { e.primaryWeaponId = id; onChange(); }));

  if (e.weaponMode === "one-handed") {
    const secondaries = db.weapons.filter((w) => w.tier === 1 && w.type === "SECONDARY");
    const h3b = document.createElement("h3");
    h3b.textContent = "Secondary weapon (Tier 1)";
    panel.appendChild(h3b);
    panel.appendChild(weaponSelect(secondaries, e.secondaryWeaponId, (id) => { e.secondaryWeaponId = id; onChange(); }));
  }
```

Replace with (adds one `const` line and one argument at each of the two call sites):

```js
  const spellcastTrait = selectedSubclass()?.spellcastTrait ?? null;

  const h3a = document.createElement("h3");
  h3a.textContent = "Primary weapon (Tier 1)";
  panel.appendChild(h3a);
  panel.appendChild(weaponSelect(primaries, e.primaryWeaponId, (id) => { e.primaryWeaponId = id; onChange(); }, spellcastTrait));

  if (e.weaponMode === "one-handed") {
    const secondaries = db.weapons.filter((w) => w.tier === 1 && w.type === "SECONDARY");
    const h3b = document.createElement("h3");
    h3b.textContent = "Secondary weapon (Tier 1)";
    panel.appendChild(h3b);
    panel.appendChild(weaponSelect(secondaries, e.secondaryWeaponId, (id) => { e.secondaryWeaponId = id; onChange(); }, spellcastTrait));
  }
```

Place the new `const spellcastTrait = ...` line right after the `const e = character.equipment;` line at the top of `renderEquipmentStep` — before it is first used by the two-handed/one-handed weapon filtering that follows.

- [ ] **Step 4: Verify — spellcaster subclass highlights matching weapons**

Continue the Wizard/School of Knowledge character from Task 2 (or start fresh with that class/subclass), advance to Equipment. Among the primary weapons, confirm every weapon whose trait is **Knowledge** (e.g. Greatstaff) shows the "★ spellcasting" badge and an accent left border, and no Knowledge-trait weapon is missing it. Confirm weapons of other traits show neither.

- [ ] **Step 5: Verify — non-caster subclass highlights nothing**

Continue the Guardian/Stalwart character from Task 2, advance to Equipment. Confirm no weapon row has the badge or the accent border — visually identical to before this change.

- [ ] **Step 6: Verify — no class selected yet**

Start a new character, jump straight to "Equipment" via the step-nav without picking a class. Confirm the step renders with no console error (this exercises `selectedSubclass()?.spellcastTrait ?? null` evaluating to `null` when `selectedSubclass()` itself is `null`).

- [ ] **Step 7: Commit**

```bash
git add create.js
git commit -m "Highlight weapons matching the subclass's spellcasting trait"
```

---

### Task 4: Stop the dev server and final full walkthrough

**Files:** none (verification only).

- [ ] **Step 1: Full walkthrough on a fresh spellcaster character**

Create a new character end-to-end: class **Sorcerer** → subclass **Elemental Origin** (`spellcastTrait: INSTINCT`), through to Traits (confirm badge on Instinct) and Equipment (confirm badge + border on Instinct-trait weapons, e.g. Dualstaff), then finish the wizard normally through to the character sheet. Confirm the character saves and opens correctly — this task changes only rendering, so nothing about save/load should differ, but it's the cheapest way to catch a stray syntax error that unit-by-unit verification missed.

- [ ] **Step 2: Stop the local server**

```bash
kill %1 2>/dev/null || pkill -f "http.server 8935"
```

- [ ] **Step 3: Review the full diff against the spec**

```bash
git diff main --stat
git diff main
```

Confirm every change traces back to the design spec (`docs/superpowers/specs/2026-08-03-spellcast-trait-hint-design.md`): `spellcastBadge()` helper, `.badge-spellcast`/`.trait-row-trailing`/`.option-row.trait-match` CSS, the Traits-step badge, and the Equipment-step badge + border. No unrelated files should appear in the diff.
