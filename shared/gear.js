// How a weapon or a piece of armor reads on screen, in one place.
//
// The creation wizard and the character sheet describe the same gear and have to describe it
// identically. Before this, only the wizard described it at all — and it printed the values
// straight out of data/ ("AGILITY · MELEE"), never mentioned burden, and dropped the damage
// modifier, so a Longsword read as d10 when it hits for d10+3.
//
// Deliberately free of DOM. The two screens wrap a row differently, so what's shared is the
// text and the rules, not the elements — which also means all of this is reachable from tests/.
//
// Nothing here reads a character: a caller passes in the records and the one rule flag
// (burden-ignoring) that lives in effects.js. Formatting stays formatting.

import { escapeHtml } from "./escape.js";

// Choosing to wear nothing is a choice, and not the same as not having chosen yet: the SRD says
// "when you choose not to equip armor", and Bare Bones keys off exactly that. So it's a stored
// value rather than a null — but a marker, not a record. There is no such armor in data/, and
// nothing ever looks one up for it.
//
// It lives here because this is the equipment vocabulary both the rules and the pages share;
// putting it in either of them would have the two importing each other.
export const UNARMORED = "unarmored";

// The same idea for weapons. There's a class on the way whose whole point is fighting with
// nothing in your hands, and the SRD already gives unarmed attacks rules of their own, so
// carrying no weapon has to be something a character can say rather than something they've
// failed to fill in.
export const UNARMED = "unarmed";

// enumLabel would turn TWO_HANDED into "Two Handed"; the book hyphenates, and so does the
// wizard's own prose.
const BURDEN_LABELS = { ONE_HANDED: "One-handed", TWO_HANDED: "Two-handed" };

// "phy"/"mag" is the shorthand the wizard already used. The third value exists on exactly one
// weapon (the Ghostblade) and used to be printed as "mag", which is half wrong.
const DAMAGE_TYPE_LABELS = { PHYSICAL: "phy", MAGICAL: "mag", PHYSICAL_OR_MAGICAL: "phy/mag" };

// data/ ships traits, ranges and burdens as SCREAMING_SNAKE; a player sees words. (Not text.js's
// titleCase(), which is for names and splits on whitespace and hyphens — this has to split on the
// underscore. Both capitalise every word, so "VERY_CLOSE" comes back as "Very Close".)
export function enumLabel(value) {
  return String(value ?? "")
    .toLowerCase()
    .split("_")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export function burdenLabel(weapon) {
  return BURDEN_LABELS[weapon?.burden] || "";
}

// A damage rating's dice, as written. Every weapon in data/srd/ rolls ONE kind of die, so `dice`
// is normally a bare string ("D10") — but the rules don't promise that, and a profile that rolls
// two kinds has to say so. A list is therefore accepted anywhere a string is, and joined the way
// the books write it: "d8+d6".
//
// `copies` is what Proficiency multiplies the dice by, and it applies to EVERY die in the list —
// at Proficiency 2 a d8+d6 weapon rolls 2d8+2d6, not 2d8+d6. Left empty for the rating as the
// book states it, so two weapons can be compared without doing arithmetic first.
export function damageDice(damage, copies = "") {
  const dice = Array.isArray(damage?.dice) ? damage.dice : [damage?.dice];
  return dice.filter(Boolean).map((die) => `${copies}${String(die).toLowerCase()}`).join("+");
}

// The modifier is part of the weapon's damage, not a footnote to it: 20 of the 32 tier 1
// weapons have one.
export function damageText(weapon) {
  const d = weapon?.damage;
  if (!d?.dice) return "";
  const mod = d.modifier ? (d.modifier > 0 ? `+${d.modifier}` : String(d.modifier)) : "";
  const type = DAMAGE_TYPE_LABELS[d.type] || "";
  return `${damageDice(d)}${mod}${type ? ` ${type}` : ""}`;
}

// Every part is optional. The test fixtures carry only the fields the check under test needs,
// and an unarmed profile has no burden at all, so a missing field is left out rather than
// printed as "undefined".
const TRAIT_COUNT = 6;

// A profile that names every trait is saying "any trait", and says it in 9 characters instead of
// 62. Only ever reached by an unarmed profile — a weapon from data/ names one `trait`, not a list
// — and only when the list is genuinely all of them, so nothing is hidden by the shorthand.
function traitsLabel(weapon) {
  const traits = weapon?.traits || [];
  if (traits.length >= TRAIT_COUNT) return "Any trait";
  return traits.map(enumLabel).join(" or ");
}

export function weaponStats(weapon) {
  return [
    // An unarmed profile offers a choice of traits rather than naming one, because the SRD hands
    // that pick to the GM per roll — and a profile a class grants may hand it to the player.
    traitsLabel(weapon) || enumLabel(weapon?.trait),
    enumLabel(weapon?.range),
    damageText(weapon),
    burdenLabel(weapon),
  ].filter(Boolean).join(" · ");
}

export function armorStats(armor) {
  if (!armor) return "";
  const parts = [];
  if (armor.baseMajorThreshold != null && armor.baseSevereThreshold != null) {
    parts.push(`thresholds ${armor.baseMajorThreshold}/${armor.baseSevereThreshold}`);
  }
  if (armor.baseScore != null) parts.push(`score ${armor.baseScore}`);
  return parts.join(" · ");
}

export function featureText(feature) {
  let text = "";
  for (const block of feature?.description || []) {
    const paragraph = block.paragraph?.["en-US"];
    // One paragraph per line, for the same reason sheet-data.js's features() keeps them as
    // separate blocks: 65 of 354 features have more than one, and a space between them welds
    // a restriction onto the rule it restricts. Vitality reads "+2 bonus to your damage
    // thresholds Then place this card in your vault permanently" — one sentence running into
    // the next, and after a bullet, part of the bullet.
    //
    // Invisible in this app: both callers escape into HTML, which collapses the newline back
    // to a space. It is the CSV consumers that can act on it.
    if (paragraph) text += (text ? "\n" : "") + paragraph;
    // Sixteen class and subclass features state part of their content as bullets, and for one
    // of them — Guardian's "While Unstoppable, you gain the following benefits:" — the list is
    // the whole feature. Reading only the paragraphs returned an empty string for it. One item
    // per line, because they're separate benefits or alternatives rather than a sentence.
    for (const item of block.list || []) {
      const line = item?.["en-US"];
      if (line) text += `\n• ${line}`;
    }
  }
  return text;
}

function featureName(feature) {
  return feature?.name?.["en-US"] || "";
}

// The two plain-text shapes the CSV export needs, where featureLine() below returns HTML.
//
// They take a features array rather than an item because a class's hopeFeature is a bare
// feature and a subclass tier is { features: [...] } — neither is shaped like a weapon.
//
// Newline-separated, because a slot holding several features is the normal case rather than the
// exception: every ancestry has two, Sorcerer has three class features, and tiers like
// Beastbound's Specialization hold two. The names come back in the same order as the texts, so
// a document printing both keeps them aligned.
export function featureNamesText(features) {
  return (features || []).map(featureName).filter(Boolean).join("\n");
}

export function featuresText(features) {
  return (features || []).map((feature) => {
    const name = featureName(feature);
    const text = featureText(feature);
    // Consumables carry a feature with no name at all ("Clear 1d4 HP."), same as featureLine().
    if (!name) return text;
    if (!text) return name;
    // Guardian's is a sentence, colon and all. A second colon would read as a typo.
    const head = /[:.!?]$/.test(name) ? name : `${name}:`;
    // A list-only feature's text already starts on a new line and needs no space in front.
    return text.startsWith("\n") ? head + text : `${head} ${text}`;
  }).filter(Boolean).join("\n");
}

// Weapons and armor carry named features, several of which change a stat ("Flexible: +1 to
// Evasion"). Without them the list reads as though the only difference between two pieces of
// armor is its thresholds, which is how a player ends up surprised by their own Evasion.
export function featureLine(item) {
  const features = (item?.features || []).map((f) => {
    const name = f.name?.["en-US"] || "";
    const text = featureText(f);
    // Consumables carry a feature with no name at all ("Clear 1d4 HP."), so the colon only
    // belongs here when there's something in front of it.
    if (!name) return escapeHtml(text);
    return `<em>${escapeHtml(name)}</em>${text ? `: ${escapeHtml(text)}` : ""}`;
  });
  return features.length ? `<span class="option-feature">${features.join(" · ")}</span>` : "";
}

export function spellcastBadge() {
  return `<span class="badge-spellcast" title="Spellcasting trait">★ spellcasting</span>`;
}

// A trait, or several: a multiclassed character can cast with either of two, and the badge
// should light up for both.
const spellcastList = (traits) => [].concat(traits ?? []).filter(Boolean);

export function matchesSpellcast(weapon, spellcastTrait) {
  return spellcastList(spellcastTrait).includes(weapon?.trait);
}

// The innards of one row, without the element around it: the wizard puts a radio in front of
// this, the sheet doesn't.
export function weaponRowContent(weapon, { spellcastTrait } = {}) {
  const stats = weaponStats(weapon);
  // The badge stays on the name line; featureLine() wraps to its own line below it.
  const badge = matchesSpellcast(weapon, spellcastTrait) ? ` ${spellcastBadge()}` : "";
  return `<strong>${escapeHtml(weapon.name["en-US"])}</strong>${stats ? ` — ${escapeHtml(stats)}` : ""}` +
    `${badge}${featureLine(weapon)}`;
}

export function armorRowContent(armor) {
  const stats = armorStats(armor);
  return `<strong>${escapeHtml(armor.name["en-US"])}</strong>${stats ? ` — ${escapeHtml(stats)}` : ""}` +
    featureLine(armor);
}

// The SRD's burden rule: a two-handed primary uses both hands, so there's no hand left for a
// secondary. Said as advice rather than enforced — the table decides, and the Warrior's Combat
// Training says outright that they ignore it, so `ignoresBurden` comes in from effects.js.
export function burdenWarning(primary, secondary, ignoresBurden) {
  if (ignoresBurden || !secondary || primary?.burden !== "TWO_HANDED") return null;
  return `${primary.name["en-US"]} is two-handed, which normally leaves no hand for a secondary ` +
    `weapon. Nothing here stops you — it's your GM's call.`;
}

// The other equipment rule the wizard used to know nothing about: wielding a magic weapon takes
// a Spellcast trait, and four of the eighteen subclasses — the Warrior's two and the Guardian's
// two — have none. Advice rather than enforcement, for the same reason burden is: tables
// houserule it, and this app's job is to say what the book says, not to hold the door shut.
//
// "Magic" is read off the DAMAGE, not off the weapon's `type`. Every PRIMARY_MAGIC weapon deals
// MAGICAL damage, so on the SRD alone the two agree — but 14 of Hope and Fear's secondaries deal
// magic damage while typed SECONDARY, and a check keyed on `type` would wave every one of them
// past a Guardian.
//
// PHYSICAL_OR_MAGICAL is deliberately not flagged. There is one such weapon in the SRD (the
// Ghostblade) and four more in Hope and Fear, and the feature that gives them the second kind
// says you *choose* which you deal — so a character with no Spellcast trait can carry one and
// only ever deal the physical half.
export function magicWeaponWarning(primary, secondary, spellcastTrait) {
  if (spellcastList(spellcastTrait).length > 0) return null;
  const magic = [primary, secondary].filter((w) => w?.damage?.type === "MAGICAL");
  if (!magic.length) return null;
  const names = magic.map((w) => w.name["en-US"]).join(" and ");
  const plural = magic.length > 1;
  return `${names} ${plural ? "are magic weapons" : "is a magic weapon"}, which normally ` +
    `${plural ? "take" : "takes"} a Spellcast trait to wield — and this character has none. ` +
    `Nothing here stops you — it's your GM's call.`;
}

// Gear grouped for a picker: every tier in the book, ascending, with the groups worth reading
// already open. That's the character's own tier, plus whichever group holds what they're
// carrying — a shield handed out at level 1 is still theirs at level 8, and a picker that hides
// it is a picker that lies. Higher tiers stay closed rather than absent: your level doesn't cap
// what a GM can hand you, it just says where to look first.
export function groupByTier(items, { tier, equippedId } = {}) {
  const byTier = new Map();
  for (const item of items) {
    if (!byTier.has(item.tier)) byTier.set(item.tier, []);
    byTier.get(item.tier).push(item);
  }
  return [...byTier.keys()].sort((a, b) => a - b).map((t) => {
    const group = byTier.get(t);
    return {
      tier: t,
      items: group,
      open: t === tier || group.some((item) => item.id === equippedId),
    };
  });
}
