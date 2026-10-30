import type { Mood } from "../core/types";
import type { ActFrame } from "./acts";
import type { Dyn } from "./motion";
import type { Base, Colors } from "./palette";
import type { PetPose, SpeciesInfo } from "./types";

/** Scale from the macOS app's 120-unit design space to ours (the pet is a bit larger in the 160 box). */
export const U = 1.1;
/** Where the feet touch the ground. */
export const GROUND = 150;
export const CENTER_X = 80;
/** Overall art scale around the feet, on top of the growth stage (fills the 160 box without crowding it). */
export const ART = 1.15;

export type MoodTable = Readonly<Record<Mood, number>>;

/** Builds a per-mood value table; focus defaults to normal and celebrating to happy. */
export const moodTable = (
  happy: number,
  normal: number,
  annoyed: number,
  angry: number,
  sleeping: number,
  focus = normal,
  celebrating = happy,
): MoodTable => ({ happy, normal, annoyed, angry, sleeping, focus, celebrating });

export type MouthKind = "cat" | "wide" | "beak" | "bill";
export type ColorKey = "top" | "bottom" | "line" | "belly" | "mark" | "accent" | "inner" | "foot" | "arm";

export interface FaceSpec {
  /** Eye line, as a fraction of the body height from its top. */
  eyeY: number;
  /** Half the distance between the eyes, as a fraction of the body width. */
  eyeDX: number;
  eyeScale?: number;
  /** Mouth line below the eyes, as a fraction of the body height (default 0.17). */
  mouthY?: number;
  mouth?: MouthKind;
  /** Horizontal mouth/beak scale (default 1). */
  mouthW?: number;
  /** Cheek blush distance from the face center (fraction of body width, default 0.3) and offset below the eyes (px, default 6). */
  cheekDX?: number;
  cheekDY?: number;
  /** A light ring behind eye strokes, for eyes drawn on dark patches (panda). */
  eyeHalo?: string;
  /** How far the face slides toward where the pet looks (fraction of body width, default 0.07). */
  shift?: number;
  /** Buck teeth under the mouth (bunny). */
  teeth?: boolean;
  /** Chill eyes: half-closed lids in the normal mood (capybara). */
  relaxed?: boolean;
  /** How far the worried brows rise above the eyes (default 1; less when the eyes sit on bumps, frog). */
  browLift?: number;
}

export interface FeetSpec {
  /** Distance of each foot from the center, fraction of body width (default 0.236). */
  dx?: number;
  w?: number;
  h?: number;
  color?: ColorKey;
  /** Two little toe lines. */
  toes?: boolean;
  /** A sole line along the bottom (sneakers). */
  sole?: ColorKey;
}

export interface ArmSpec {
  style?: "nub" | "flipper" | "wing";
  scale?: number;
  color?: ColorKey;
  /** Drawn over each nub arm, given its center, angle (radians) and half length (Bảnh Bao's thumbs-up). */
  hand?(c: Ctx, x: number, y: number, angle: number, len: number): string;
}

/** Where shared things attach to a species. All coordinates are in the pet's local (unmirrored) space. */
export interface Anchors {
  /** Hats and sprouts: the point on top of the head, with a size factor and a tilt (degrees). */
  head: { x: number; y: number; s: number; rot?: number };
  /** The bow sits at the side of the head. */
  bow: { x: number; y: number; s?: number; rot?: number };
  /** Scarf: band center line at the middle of the body, its width and how much it sags. */
  neck: { y: number; w: number; sag: number };
  /** Focus headband: y of its ends and how much it arches up in the middle. */
  band: { y: number; arch: number };
  /** Sunglasses size factor (they always sit on the eyes). */
  glasses?: number;
}

/** Everything a species part needs to draw one frame. */
export interface Ctx {
  id: string;
  pose: PetPose;
  def: SpeciesDef;
  /** Effective mood: `held` shows the normal palette dynamics with a surprised face. */
  mood: Mood;
  celebrating: boolean;
  held: boolean;
  /** Hovered or petted while content: blush and happy squint. */
  petted: boolean;
  /** Seconds of petting (0 = none): after 2 s the squint turns into slow cat blinks. */
  petting: number;
  /** The act playing now (wave, dizzy, …), or null. Same as `dyn.act`. */
  act: ActFrame | null;
  /** Knitting progress 0 … 1, or null when not knitting. */
  craft: number | null;
  t: number;
  /** Smoothstepped prevMood → mood blend. */
  k: number;
  pal: Colors;
  dyn: Dyn;
  /** Body box: center x, top, bottom (above the feet), width, height. */
  cx: number;
  top: number;
  by: number;
  bw: number;
  bh: number;
  /** Face: center x, eye line, mouth line, half eye distance. */
  fx: number;
  ey: number;
  my: number;
  ex: number;
  /** Look direction in local space (already mirrored for facing). */
  lookX: number;
  lookY: number;
  /** 1 normally, smaller when calm (typing / in the zone). */
  motion: number;
  /** 0 … 1 while a treat is being eaten. */
  feed: number;
  /** `url(#…)` of the body gradient (userSpaceOnUse, so other parts can share it). */
  grad: string;
  /** `url(#…)` of the body clip path. */
  clip: string;
  /** ` transform="rotate(…)"` turning the face for a head tilt (eyes, mouth, nose, glasses), or "". */
  faceTurn: string;
  /** Blends a per-mood value with the same easing as the colors. */
  mv(table: MoodTable): number;
}

export interface SpeciesDef {
  info: SpeciesInfo;
  base: Base;
  /** Exact per-mood palettes (Mochi keeps the original ones); others are tinted from `base`. */
  moods?: Partial<Record<Mood, Base>>;
  /** Body size at stage scale 1. */
  w: number;
  h: number;
  face: FaceSpec;
  feet?: FeetSpec;
  arms?: ArmSpec;
  /** Glossy highlight [dx, dy, rx, ry] as fractions of the body box, or null for none. */
  highlight?: readonly [number, number, number, number] | null;
  /** Horizontal reach beyond the body (back side, front side) in px, e.g. tails. */
  reach: readonly [number, number];
  /** How far above the body top the tallest part (ears, horns) reaches right now. */
  headroom(c: Ctx): number;
  /** Body outline path data. */
  body(c: Ctx): string;
  /** Behind the body: tails, back ears, wings. */
  back?(c: Ctx): string;
  /** On the body, clipped to it: bellies, stripes, patches. */
  markings?(c: Ctx): string;
  /** Over the body outline, under the face: snouts, cheek pouches, eye bumps. */
  over?(c: Ctx): string;
  /** Over the face: noses, whiskers, fangs (turns with the face on a head tilt). */
  front?(c: Ctx): string;
  /** After arms: front ears, manes, gills. */
  top?(c: Ctx): string;
  /** After accessories: unicorn horn, dragon smoke, capybara yuzu. */
  last?(c: Ctx): string;
  anchors(c: Ctx): Anchors;
}

export const color = (c: Ctx, key: ColorKey): string => c.pal[key];
