// Public API of the pet art: species registry and the SVG renderer.
import { SPECIES_IDS, type SpeciesId } from "../core/types";
import { STAGE_SCALE, STAGE_SPROUTS } from "./life";
import { layout, renderSpecies, type PetRenderOptions } from "./render";
import { DEFS } from "./species";
import type { PetPose, SpeciesInfo } from "./types";

export type { PetPose, RenderOptions, SpeciesInfo } from "./types";
export type { PetRenderOptions } from "./render";
export { ACT_DURATION, ACT_KEY_T, PET_ACTS, type PetActKind } from "./acts";
export { renderDecor, type DecorOptions } from "./decor";
export { STAGE_SCALE, STAGE_SPROUTS };

/** All registered species, in SPECIES_IDS order. */
export const SPECIES: readonly SpeciesInfo[] = SPECIES_IDS.map((id) => DEFS[id].info);

export function speciesInfo(id: SpeciesId): SpeciesInfo {
  return (DEFS[id] ?? DEFS.mochi).info;
}

/** A calm, idle, grown-up pet facing right; override any field. */
export function defaultPose(overrides: Partial<PetPose> = {}): PetPose {
  return {
    mood: "normal",
    t: 0,
    facing: 1,
    walking: false,
    walkPhase: 0,
    lookX: 0,
    lookY: 0,
    hovered: false,
    held: false,
    prevMood: overrides.mood ?? "normal",
    blend: 1,
    calm: false,
    stage: 3,
    hungry: false,
    dirt: 0,
    wearing: [],
    celebration: "jump",
    golden: false,
    food: null,
    foodT: 0,
    ...overrides,
  };
}

/** One frame of `id` as an `<svg>` string (viewBox 0 0 160 160, transparent background). */
export function renderPet(id: SpeciesId, pose: PetPose, opts?: PetRenderOptions): string {
  return renderSpecies(DEFS[id] ?? DEFS.mochi, pose, opts);
}

/** World-space bounding box of the pet for a pose (used by tests to keep every pose inside the view). */
export function petBounds(id: SpeciesId, pose: PetPose): { minX: number; maxX: number; minY: number; maxY: number } {
  return layout(DEFS[id] ?? DEFS.mochi, pose, "pet").bounds;
}
