// Shared vocabulary between the logic (src/core), the pet art (src/pets) and the UI.

export type Lang = "en" | "vi";

export const MOODS = ["happy", "normal", "annoyed", "angry", "sleeping", "focus", "celebrating"] as const;
export type Mood = (typeof MOODS)[number];

/** Growth stages, reached with XP from finished tasks. 0 = Baby … 4 = Master. */
export type StageIndex = 0 | 1 | 2 | 3 | 4;

export const ACCESSORIES = ["bow", "scarf", "sunglasses", "tophat", "crown", "gradcap"] as const;
export type Accessory = (typeof ACCESSORIES)[number];
export type AccessorySlot = "head" | "face" | "neck";

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
  "dragon",
  "unicorn",
] as const;
export type SpeciesId = (typeof SPECIES_IDS)[number];

/** How a species moves when it walks. */
export type Gait = "bounce" | "hop" | "waddle" | "float" | "scurry";
