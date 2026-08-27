// Keyboard behaviour for the wizard's tile grids — the arithmetic only, no DOM.
//
// Every choice in character creation (class, subclass, ancestry, community, domain cards)
// was a <div> with a click listener: no role, no tabindex, nothing. Not one of them could be
// reached, let alone chosen, without a pointer. The whole creation flow existed only for
// people with a mouse.
//
// A grid of mutually exclusive choices is a radio group, and a radio group has a keyboard
// contract people already know: Tab reaches the group once and lands on the current choice,
// arrows move between options, Space or Enter picks. That "Tab reaches it once" is why the
// tabindex roves — a group of 13 classes that each swallow a Tab is its own kind of trap.
//
// The DOM wiring lives in create.js; what is here is what can be got wrong and therefore
// tested: which index a key moves to.

/** Keys that choose the focused option. */
export const CHOOSE_KEYS = [" ", "Enter", "Spacebar"];

/**
 * Where a key press moves the focus inside a grid of `count` options.
 *
 * Returns the new index, or -1 when the key means nothing here (so the caller leaves the
 * event alone — swallowing unknown keys is how you break Tab).
 *
 * Arrows wrap around: at the last option, Right goes back to the first. Wrapping is what the
 * radio-group pattern does, and it means you can never get stuck at an end without knowing
 * which way to turn back. Home and End jump to the ends.
 *
 * `perRow` exists because these are grids, not lists: Down should land under your finger, not
 * on the next option. When the caller cannot measure the columns it passes 1, and Down simply
 * behaves like Right — the honest fallback, since a wrong column count moves focus somewhere
 * the eye is not.
 */
export function nextIndex(key, current, count, perRow = 1) {
  if (count <= 0) return -1;
  const clamp = (i) => ((i % count) + count) % count;
  switch (key) {
    case "ArrowRight":
    case "ArrowDown": {
      const step = key === "ArrowDown" ? Math.max(1, perRow) : 1;
      return clamp(current + step);
    }
    case "ArrowLeft":
    case "ArrowUp": {
      const step = key === "ArrowUp" ? Math.max(1, perRow) : 1;
      return clamp(current - step);
    }
    case "Home":
      return 0;
    case "End":
      return count - 1;
    default:
      return -1;
  }
}

/**
 * Which option holds the group's single Tab stop.
 *
 * The chosen one, so Tab lands on what is currently picked; the first one when nothing is
 * picked yet, so the group is reachable at all. Returning 0 for an empty group is harmless —
 * the caller has nothing to put it on.
 */
export function tabStopIndex(selectedIndex, count) {
  if (selectedIndex >= 0 && selectedIndex < count) return selectedIndex;
  return 0;
}
