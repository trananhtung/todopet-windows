// Shared vocabulary between the logic (src/core), the pet art (src/pets) and the UI.

export type Lang = "en" | "vi";

export const MOODS = ["happy", "normal", "annoyed", "angry", "sleeping", "focus", "celebrating"] as const;
export type Mood = (typeof MOODS)[number];

/** Growth stages, reached with XP from finished tasks. 0 = Baby … 4 = Master. */
export type StageIndex = 0 | 1 | 2 | 3 | 4;

/** The first six are milestone rewards; the rest come out of chests (v0.5), the seasonal ones only in their season. */
export const ACCESSORIES = [
  "bow",
  "scarf",
  "sunglasses",
  "tophat",
  "crown",
  "gradcap",
  "beanie",
  "flowercrown",
  "partyhat",
  "nonla",
  "bandana",
  "heartglasses",
  "roundglasses",
  "starglasses",
  "maicrown",
  "tetscarf",
  "bunnyband",
  "witchhat",
  "santahat",
  "bellcollar",
] as const;
export type Accessory = (typeof ACCESSORIES)[number];
export type AccessorySlot = "head" | "face" | "neck";

/** Where each accessory sits; one accessory per slot. */
export const ACCESSORY_SLOT: Readonly<Record<Accessory, AccessorySlot>> = {
  bow: "head",
  scarf: "neck",
  sunglasses: "face",
  tophat: "head",
  crown: "head",
  gradcap: "head",
  beanie: "head",
  flowercrown: "head",
  partyhat: "head",
  nonla: "head",
  bandana: "neck",
  heartglasses: "face",
  roundglasses: "face",
  starglasses: "face",
  maicrown: "head",
  tetscarf: "neck",
  bunnyband: "head",
  witchhat: "head",
  santahat: "head",
  bellcollar: "neck",
};

export const SEASONS = ["tet", "trungthu", "halloween", "christmas"] as const;
export type Season = (typeof SEASONS)[number];

/** Home decorations the pet knits during focus sessions (v0.5). */
export const DECOR_IDS = ["rug", "plant", "lamp", "cushion", "bookshelf", "mug", "poster", "garland", "fishbowl", "radio", "blanket", "lantern"] as const;
export type DecorId = (typeof DECOR_IDS)[number];

/**
 * Unsolicited reminders, named after their rule's key. Each one counts against the daily nudge budget. The ones that
 * repeat on an interval (`EVERY_KINDS`) back off on their own; the rest come at most once a day. Check-ins (the
 * morning greeting, the resume card, the overbooked warning, v0.5's trip offer…) have no kind: they are never counted.
 */
export const REMINDER_KINDS = ["welcome", "distract", "antic", "night", "plan", "stuck", "hungry", "grumble", "overdue", "timeblock", "distractsum", "nudge", "tip"] as const;
export type ReminderKind = (typeof REMINDER_KINDS)[number];
/** The kinds with an interval, which closing or ignoring stretches (×2, ×4, ×8). */
export const EVERY_KINDS: readonly ReminderKind[] = ["distract", "antic", "plan", "stuck", "hungry", "grumble", "overdue", "nudge", "tip"];

export const CELEBRATIONS = ["jump", "spin", "flip", "dance", "fireworks"] as const;
export type CelebrationKind = (typeof CELEBRATIONS)[number];

export const SPECIES_IDS = [
  "mochi",
  "cat",
  "shiba",
  "bunny",
  "fox",
  "panda",
  "penguin",
  "frog",
  "hamster",
  "axolotl",
  "capybara",
  "duckling",
  "redpanda",
  "otter",
  "hedgehog",
  "koala",
  "hippo",
  "seal",
  "owl",
  "lamb",
  "piglet",
  "bee",
  "dragon",
  "unicorn",
] as const;
export type SpeciesId = (typeof SPECIES_IDS)[number];

/** How a species moves when it walks. */
export type Gait = "bounce" | "hop" | "waddle" | "float" | "scurry";
