// Shared vocabulary between the logic (src/core), the pet art (src/pets) and the UI.

export type Lang = "en" | "vi";

export const MOODS = ["happy", "normal", "annoyed", "angry", "sleeping", "focus", "celebrating"] as const;
export type Mood = (typeof MOODS)[number];

/** Growth stages, reached with XP from finished tasks. 0 = Baby … 4 = Master. */
export type StageIndex = 0 | 1 | 2 | 3 | 4;

export const ACCESSORIES = ["bow", "scarf", "sunglasses", "tophat", "crown", "gradcap"] as const;
export type Accessory = (typeof ACCESSORIES)[number];
export type AccessorySlot = "head" | "face" | "neck";

/**
 * Unsolicited reminders, named after their rule's key. Each one counts against the daily nudge budget. The ones that
 * repeat on an interval (`EVERY_KINDS`) back off on their own; the rest come at most once a day.
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
