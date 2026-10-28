import type { Gait, Mood } from "../core/types";
import type { PetPose } from "./types";
import { frac } from "./svg";

/** Body dynamics for one frame. Lengths in px of the 160 design space, angles in radians. */
export interface Dyn {
  /** Height of the body above its resting place (jumps, hops, bounces). */
  jump: number;
  /** + = wider and flatter, − = taller and thinner. */
  squash: number;
  /** Horizontal shake / dance offset. */
  shakeX: number;
  /** Breathing: tiny vertical scale. */
  breathe: number;
  /** Horizontal scale of a spin (cos of the turn), 1 when not spinning. */
  spin: number;
  /** Back-flip angle. */
  flip: number;
  /** Side-to-side tilt around the feet (waddle, dance) plus a forward lean (scurry, float). */
  tilt: number;
  /** Floating species hover above the ground. */
  hover: number;
  /** Foot lifts relative to the body (negative = stretched down). */
  liftL: number;
  liftR: number;
  /** Legs hanging while held. */
  dangle: number;
}

const WALK_AMP: Record<Mood, number> = {
  happy: 1.6,
  normal: 1,
  focus: 1,
  annoyed: 0.5,
  angry: 0.7,
  sleeping: 0.3,
  celebrating: 1.6,
};

const { sin, cos, abs, max, PI } = Math;

export function dynamics(p: PetPose, gait: Gait, mood: Mood): Dyn {
  const t = p.t;
  const wp = p.walkPhase;
  let jump = 0, squash = 0, shakeX = 0, breathe = 0, spin = 1, flip = 0, tilt = 0, hover = 0;
  let liftL = 0, liftR = 0;
  const celebrating = mood === "celebrating";
  const walking = p.walking && !p.held && !celebrating;

  if (celebrating) {
    const ph = frac(t * 2.2);
    const h = sin(ph * PI);
    switch (p.celebration) {
      case "dance":
        shakeX = sin(t * 8) * 8;
        jump = abs(sin(t * 8)) * 4.5;
        tilt = sin(t * 8) * 0.12;
        break;
      case "flip":
        jump = h * 30;
        if (ph > 0.12 && ph < 0.88) flip = ((ph - 0.12) / 0.76) * 2 * PI;
        break;
      case "spin":
        jump = h * 16;
        spin = cos(t * 9);
        break;
      case "fireworks":
        jump = h * 32;
        break;
      default:
        jump = h * 22;
    }
    if (p.celebration !== "dance") squash = ph < 0.1 || ph > 0.9 ? 0.12 : -0.06 * h;
  } else if (walking) {
    const amp = WALK_AMP[mood];
    const s = sin(wp);
    switch (gait) {
      case "bounce":
        jump = abs(s) * 3.3 * amp;
        squash = (1 - abs(s)) * 0.04 * amp;
        liftL = max(0, s) * 5.5;
        liftR = max(0, -s) * 5.5;
        break;
      case "hop": {
        // Bigger arcs with a pause on the ground between hops.
        const u = frac(wp / PI);
        const air = 0.62;
        if (u < air) {
          const hh = sin((u / air) * PI);
          jump = hh * 12 * amp;
          squash = -0.07 * hh * Math.min(amp, 1.2);
          liftL = liftR = -hh * 2.5;
        } else {
          squash = 0.1 * sin(((u - air) / (1 - air)) * PI) * Math.min(amp, 1.2);
        }
        break;
      }
      case "waddle":
        tilt = s * 0.13 * Math.min(amp, 1.3);
        jump = abs(s) * 1.6 * amp;
        liftL = max(0, s) * 4.4;
        liftR = max(0, -s) * 4.4;
        break;
      case "float":
        tilt = 0.09;
        jump = sin(wp * 0.5) * 1.5 * amp;
        liftL = 1.5 + s * 1.5;
        liftR = 1.5 - s * 1.5;
        break;
      case "scurry": {
        const s2 = sin(wp * 2);
        jump = abs(s2) * 1.8 * amp;
        tilt = 0.07;
        liftL = max(0, s2) * 3.5;
        liftR = max(0, -s2) * 3.5;
        break;
      }
    }
    if (mood === "angry") squash += 0.05 * abs(cos(wp));
  } else {
    switch (mood) {
      case "happy": {
        const b = abs(sin(t * 3.2));
        jump = b * 6.6;
        squash = (1 - b) * 0.08 - 0.03;
        break;
      }
      case "normal":
      case "focus":
        breathe = sin(t * 2) * 0.02;
        break;
      case "annoyed":
        breathe = sin(t * 1.2) * 0.015;
        // Impatient foot tapping.
        liftR = sin(t * 0.9) > 0 ? max(0, sin(t * 9)) * 3.3 : 0;
        break;
      case "angry": {
        const s5 = abs(sin(t * 5));
        jump = s5 * 2.75;
        squash = (1 - s5) * 0.06;
        liftL = max(0, sin(t * 5)) * 3.3;
        liftR = max(0, -sin(t * 5)) * 3.3;
        break;
      }
      case "sleeping":
        breathe = sin(t * 1.3) * 0.04;
        squash = 0.06;
        break;
    }
  }
  if (mood === "angry") shakeX = sin(t * 47) * (sin(t * 1.7) > 0.2 ? 1.6 : 0.3);

  if (gait === "float") {
    // Floaters hover; asleep they settle down close to the ground.
    hover = mood === "sleeping" ? 2.5 + sin(t * 1.3) * 0.6 : 10 + sin(t * 1.8) * 3;
    if (!walking && !celebrating && mood !== "sleeping") {
      liftL = 1.5 + sin(t * 2.4) * 1.2;
      liftR = 1.5 - sin(t * 2.4) * 1.2;
    }
  }

  if (p.calm && !celebrating) {
    // Motion at the edge of your vision pulls attention: tone it down while you work.
    jump *= 0.3;
    squash *= 0.5;
    shakeX *= 0.2;
    tilt *= 0.3;
    if (gait === "float") hover = 7 + (hover - 7) * 0.3;
  }

  let dangle = 0;
  if (p.held) {
    jump = 0;
    squash = -0.12;
    shakeX = sin(t * 9) * 1.2;
    tilt = 0;
    hover = 0;
    spin = 1;
    flip = 0;
    liftL = liftR = 0;
    dangle = 4.4;
  }
  return { jump, squash, shakeX, breathe, spin, flip, tilt, hover, liftL, liftR, dangle };
}
