import type { Accessory, CelebrationKind, Gait, Lang, Mood, SpeciesId, StageIndex } from "../core/types";

/**
 * Everything needed to draw one frame of the pet. Mirrors `PetPose` in the macOS app.
 * The renderer is pure: same pose in, same SVG out.
 */
export interface PetPose {
  mood: Mood;
  /** Seconds since the app started; drives idle animation (breathing, blinking, tail wag). */
  t: number;
  /** 1 = facing right, -1 = facing left. */
  facing: 1 | -1;
  walking: boolean;
  /** Advances with distance walked; one step = π. */
  walkPhase: number;
  /** Where the pet looks, -1 (left) … 1 (right) and -1 (up) … 1 (down). */
  lookX: number;
  lookY: number;
  hovered: boolean;
  /** Being dragged by the cursor: legs dangle, surprised face. */
  held: boolean;
  /** Colors cross-fade from `prevMood` to `mood` while `blend` goes 0 → 1. */
  prevMood: Mood;
  blend: number;
  /** The user is typing or in the zone: keep movements small. */
  calm: boolean;
  /**
   * Head tilt in degrees (optional, default 0; clamped to ±20). + tilts toward where the pet faces.
   * The face turns by most of it and the body leans onto one foot by the rest. The caller eases it in
   * (10–15° over ~0.5 s) when the cursor rests near the pet, a task arrives, or just before a
   * celebration. Ignored while held.
   */
  headTilt?: number;

  // Long-term life state.
  stage: StageIndex;
  hungry: boolean;
  /** 0–3 levels of dirt (smudges, then flies). */
  dirt: number;
  wearing: Accessory[];

  // Celebration after a finished task (only used when mood === "celebrating").
  celebration: CelebrationKind;
  golden: boolean;
  /** Emoji of the treat falling into the pet's mouth, or null. */
  food: string | null;
  /** Seconds since the food started falling. */
  foodT: number;
}

export interface SpeciesInfo {
  id: SpeciesId;
  name: Record<Lang, string>;
  /** One emoji for menus and the tray. */
  emoji: string;
  gait: Gait;
  /** What it "says" in celebration lines, e.g. { en: "meow", vi: "meo meo" }. */
  sound: Record<Lang, string>;
  /** Locked species: what the user must achieve. Absent = available from the start. */
  unlock?: {
    kind: "streak" | "tasks";
    value: number;
    label: Record<Lang, string>;
  };
}

export interface RenderOptions {
  /** Prefix for SVG ids (gradients, clip paths) so several pets can live on one page. Default "pet". */
  idPrefix?: string;
  /** Outer width/height attributes in px. Default 160 (the viewBox is always 0 0 160 160). */
  size?: number;
}

/**
 * Public API of src/pets (implemented in src/pets/index.ts):
 *
 *   export const SPECIES: readonly SpeciesInfo[];            // all 24, in SPECIES_IDS order
 *   export function speciesInfo(id: SpeciesId): SpeciesInfo;
 *   export function defaultPose(overrides?: Partial<PetPose>): PetPose;
 *   export function renderPet(id: SpeciesId, pose: PetPose, opts?: RenderOptions): string; // "<svg …>…</svg>"
 *
 * Design space: viewBox 0 0 160 160, the feet touch the ground at y = 150, body centered on x = 80.
 * Jumps, flips and accessories must stay inside the viewBox. Background is transparent.
 */
export type RenderPet = (id: SpeciesId, pose: PetPose, opts?: RenderOptions) => string;
