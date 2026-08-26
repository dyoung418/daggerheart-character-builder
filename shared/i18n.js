// Labels for the play page (play.html), in English and Italian. Game data — class names, card
// text, feature prose — stays in the language of the data files; only what the app itself says
// is translated here. The page picks its language from <html lang>, so a site that serves the
// builder can flip the play page to Italian by editing one attribute (see pickLanguage).
//
// Pure: no DOM. translator(lang) returns t(key, vars); an unknown key comes back as the key so a
// typo shows on screen instead of vanishing, and an Italian gap falls back to English.

export const LANGUAGES = ["en", "it"];

const EN = {
  "title.play": "At the Table",
  "nav.characters": "← My Characters",
  "nav.print": "Print sheet",
  "notfound": "Character not found.",
  "notfound.back": "Back to My Characters",
  "level": "Level",
  "hope": "Hope",
  "hope.of": "Hope: {n} of {max}",
  "hope.one": "Hope {n} of {max}",
  "hope.scar": "Scar",
  "hope.scarred": "Hope {n} of {max}, scarred",
  "hope.scar.confirm": "Mark a scar? This crosses out a Hope slot for good.",
  "hope.scar.yes": "Mark it",
  "hope.scar.cancel": "Cancel",
  "hope.journeyEnds": "This character's journey ends here.",
  "trait.tierMark": "Marked this tier",
  "trait.spellcast": "Spellcast trait",
  "tab.status": "Status",
  "tab.weapons": "Weapons",
  "tab.cards": "Cards",
  "tab.features": "Features",
  "hp": "HP",
  "stress": "Stress",
  "armor": "Armor",
  "bar.of": "{label}: {n} of {max} marked",
  "bar.one": "{label} {n} of {max}",
  "evasion": "Evasion",
  "proficiency": "Prof.",
  "threshold.minor": "Minor",
  "threshold.major": "Major",
  "threshold.severe": "Severe",
  "conditions": "Conditions",
  "condition.vulnerable.label": "Vulnerable",
  "condition.vulnerable.effect": "Rolls against you have advantage.",
  "condition.hidden.label": "Hidden",
  "condition.hidden.effect": "Rolls against you have disadvantage, until you're seen, act or move into view.",
  "condition.restrained.label": "Restrained",
  "condition.restrained.effect": "You can't move, but you can still act.",
  "spellcast": "Spellcast",
  "unresolved": "Unresolved choices — these grant nothing until answered:",
  "experience": "Experience",
  "experience.none": "No experiences yet.",
  "notes": "Notes",
  "notes.aria": "Session notes",
  "notes.placeholder": "Session notes: temporary effects, debts, countdowns, who owes whom…",
  "weapons": "Weapons",
  "weapons.none": "No weapon equipped.",
  "armor.score": "Armor Score",
  "armor.thresholds": "Thresholds {major} / {severe}",
  "potion": "Potion: {name}",
  "loadout": "Loadout {n}/5",
  "loadout.none": "No cards in loadout.",
  "card.level": "Lv {n}",
  "card.recall": "Recall {n}",
  "features.hope": "{cls} — Hope feature",
  "features.ancestry": "Ancestry",
  "features.community": "Community",
  "features.none": "No features yet.",
};

const IT = {
  "title.play": "Al tavolo",
  "nav.characters": "← I miei personaggi",
  "nav.print": "Scheda da stampare",
  "notfound": "Personaggio non trovato.",
  "notfound.back": "Torna ai personaggi",
  "level": "Livello",
  "hope": "Speranza",
  "hope.of": "Speranza: {n} su {max}",
  "hope.one": "Speranza {n} di {max}",
  "hope.scar": "Cicatrice",
  "hope.scarred": "Speranza {n} di {max}, cicatrizzata",
  "hope.scar.confirm": "Segnare una cicatrice? Barra per sempre una slot di Speranza.",
  "hope.scar.yes": "Segna",
  "hope.scar.cancel": "Annulla",
  "hope.journeyEnds": "Il viaggio di questo personaggio finisce qui.",
  "trait.tierMark": "Segnato in questo tier",
  "trait.spellcast": "Tratto da incantesimo",
  "tab.status": "Stato",
  "tab.weapons": "Armi",
  "tab.cards": "Carte",
  "tab.features": "Abilità",
  "hp": "PF",
  "stress": "Stress",
  "armor": "Armatura",
  "bar.of": "{label}: {n} su {max} segnati",
  "bar.one": "{label} {n} di {max}",
  "evasion": "Evasione",
  "proficiency": "Comp.",
  "threshold.minor": "Lieve",
  "threshold.major": "Grave",
  "threshold.severe": "Severa",
  "conditions": "Condizioni",
  "condition.vulnerable.label": "Vulnerabile",
  "condition.vulnerable.effect": "I tiri contro di te hanno vantaggio.",
  "condition.hidden.label": "Nascosto",
  "condition.hidden.effect": "I tiri contro di te hanno svantaggio, finché non vieni visto, agisci o ti muovi allo scoperto.",
  "condition.restrained.label": "Immobilizzato",
  "condition.restrained.effect": "Non puoi muoverti, ma puoi ancora agire.",
  "spellcast": "Incantesimi",
  "unresolved": "Scelte in sospeso — non danno nulla finché non rispondi:",
  "experience": "Esperienze",
  "experience.none": "Nessuna esperienza.",
  "notes": "Note",
  "notes.aria": "Note di sessione",
  "notes.placeholder": "Note di sessione: effetti temporanei, debiti, countdown, chi deve cosa a chi…",
  "weapons": "Armi",
  "weapons.none": "Nessun'arma equipaggiata.",
  "armor.score": "Valore armatura",
  "armor.thresholds": "Soglie {major} / {severe}",
  "potion": "Pozione: {name}",
  "loadout": "Loadout {n}/5",
  "loadout.none": "Nessuna carta nel loadout.",
  "card.level": "Liv. {n}",
  "card.recall": "Richiamo {n}",
  "features.hope": "{cls} — Abilità di Speranza",
  "features.ancestry": "Ascendenza",
  "features.community": "Comunità",
  "features.none": "Nessuna abilità.",
};

const DICTS = { en: EN, it: IT };

export function pickLanguage(tag) {
  const base = String(tag || "").toLowerCase().split("-")[0];
  return LANGUAGES.includes(base) ? base : "en";
}

export function translator(lang) {
  const dict = DICTS[pickLanguage(lang)];
  const t = (key, vars = {}) => {
    const raw = dict[key] ?? EN[key] ?? key;
    return raw.replace(/\{(\w+)\}/g, (m, name) => (name in vars ? String(vars[name]) : m));
  };
  t.keys = () => Object.keys(EN);
  return t;
}
