// Little acts the overlay plays on top of any mood (docs/research-cute-pets.md §11–16): a wave hello, a
// giggle after a few clicks, dizzy spiral eyes, a pout, a shake-off after being put down, idle fidgets
// (look around, sniff, scratch, stretch), a sleepy yawn, rare clumsy moments (sneeze, trip) and a ponder.
//
// Pure and deterministic: everything is a function of the act's own clock `t` (seconds since it began).
// An act eases in over ~0.12 s and out over its last ~0.2 s, so starting or ending one never pops.
import type { Mood } from "../core/types";
import { landing } from "./motion";
import type { PetPose } from "./types";
import { clamp, smooth } from "./svg";

export const PET_ACTS = [
  "wave",
  "hop",
  "giggle",
  "dizzy",
  "pout",
  "shake",
  "lookaround",
  "sniff",
  "scratch",
  "stretch",
  "yawn",
  "sneeze",
  "trip",
  "ponder",
] as const;
export type PetActKind = (typeof PET_ACTS)[number];

/** How long each act lasts, in seconds. The overlay clears `pose.act` (or lets it run out) after this. */
export const ACT_DURATION: Readonly<Record<PetActKind, number>> = {
  wave: 1.6,
  hop: 0.8,
  giggle: 1.2,
  dizzy: 1.2,
  pout: 2,
  shake: 0.9,
  lookaround: 2.4,
  sniff: 1.6,
  scratch: 1.6,
  stretch: 1.8,
  yawn: 5,
  sneeze: 1.8,
  trip: 1.4,
  ponder: 2,
};

/** A characteristic moment of each act (seconds), for stills in the gallery and docs. */
export const ACT_KEY_T: Readonly<Record<PetActKind, number>> = {
  wave: 0.55,
  hop: 0.32,
  giggle: 0.45,
  dizzy: 0.6,
  pout: 1,
  shake: 0.4,
  lookaround: 0.75,
  sniff: 0.36,
  scratch: 0.7,
  stretch: 0.9,
  yawn: 2,
  sneeze: 1.02,
  trip: 0.36,
  ponder: 0.8,
};

export type ActEyes = "spiral" | "squint" | "squeeze" | "wide" | "closed";
export type ActMouth = "open" | "o" | "yawn" | "pout" | "wavy" | "hmm" | "flat";
export type ActArms = "wave" | "up" | "mouth" | "chin" | "scratch" | "flail" | "out" | "hang";

/** One frame of an act: body motion (added to the mood's), face and arm overrides. */
export interface ActFrame {
  kind: PetActKind;
  /** Seconds since the act began, and the same as a fraction of its duration. */
  t: number;
  u: number;
  /** Envelope: 0 at both ends, 1 in between. */
  k: number;
  jump: number;
  squash: number;
  shakeX: number;
  /** + leans toward where the pet faces (radians, around the feet). */
  tilt: number;
  liftL: number;
  liftR: number;
  /** Extra head tilt in degrees, + toward the facing side (like `PetPose.headTilt`). */
  faceTilt: number;
  /** Where to look in local space (+x = the facing side), blended in by `lookK`. */
  lookX: number;
  lookY: number;
  lookK: number;
  eyes: ActEyes | null;
  /** Upper lids drooping, 0 = open … 1 = shut. */
  lid: number;
  mouth: ActMouth | null;
  /** 0 … 1: how wide the act's mouth opens. */
  open: number;
  arms: ActArms | null;
  /** 0 … 1: blend from resting arms to the act's arms. */
  armK: number;
  blush: boolean;
  /** Puffed cheeks, 0 … 1. */
  puff: number;
  /** Nose and mouth twitch, px (+ = down). */
  twitch: number;
  /** A sleepy tear in the eye corner, 0 … 1. */
  tear: number;
}

const { sin, cos, abs, exp, max, min, PI } = Math;

/** 0 → 1 between a and b, eased. */
const ramp = (x: number, a: number, b: number): number => smooth(clamp((x - a) / (b - a), 0, 1));
/** A smooth hump: 0 outside [a, b], 1 in its middle. */
const bump = (x: number, a: number, b: number): number => (x > a && x < b ? sin((PI * (x - a)) / (b - a)) : 0);

/** The act playing in this pose, or null (none, ended, unknown, while held or celebrating). */
export function actFrame(p: PetPose, mood: Mood): ActFrame | null {
  const a = p.act;
  if (!a || p.held || mood === "celebrating") return null;
  const d = (ACT_DURATION as Readonly<Record<string, number | undefined>>)[a.kind];
  const t = a.t;
  if (d === undefined || !(t >= 0 && t < d)) return null;
  const k = ramp(t, 0, 0.12) * (1 - ramp(t, d - 0.2, d));
  const f: ActFrame = {
    kind: a.kind,
    t,
    u: t / d,
    k,
    jump: 0,
    squash: 0,
    shakeX: 0,
    tilt: 0,
    liftL: 0,
    liftR: 0,
    faceTilt: 0,
    lookX: 0,
    lookY: 0,
    lookK: 0,
    eyes: null,
    lid: 0,
    mouth: null,
    open: 0,
    arms: null,
    armK: 0,
    blush: false,
    puff: 0,
    twitch: 0,
    tear: 0,
  };
  const fw = p.facing === -1 ? -1 : 1;
  const on = k > 0.3;
  switch (a.kind) {
    case "wave":
      // Hello! One paw up, waving, with a happy little bob.
      f.jump = abs(sin(t * 9)) * 1.3 * k;
      f.tilt = 0.04 * k;
      f.arms = "wave";
      f.armK = k;
      if (on) {
        f.mouth = "open";
        f.open = 0.55;
      }
      break;
    case "hop": {
      // Crouch, spring up with the legs stretched, land with a squash that springs back past rest.
      const t0 = 0.14, air = 0.36;
      if (t < t0) f.squash = 0.14 * smooth(t / t0);
      else if (t < t0 + air) {
        const h = sin(((t - t0) / air) * PI);
        f.jump = h * 11;
        f.squash = -0.07 * abs(cos(((t - t0) / air) * PI));
        f.liftL = f.liftR = -h * 2.5;
        f.arms = "up";
        f.armK = h * 0.6;
        f.mouth = "open";
        f.open = 0.6;
      } else f.squash = 0.13 * landing(t - t0 - air);
      break;
    }
    case "giggle": {
      // Hehehe: a wiggle at 5 Hz, squinting, a paw over the mouth, rosy cheeks.
      const w = sin(t * 2 * PI * 5);
      f.tilt = w * 0.06 * k;
      f.jump = abs(w) * 1.6 * k;
      f.squash = sin(t * 2 * PI * 10) * 0.02 * k;
      f.arms = "mouth";
      f.armK = k;
      if (on) {
        f.eyes = "squint";
        f.mouth = "open";
        f.open = 0.35 + 0.35 * abs(w);
        f.blush = true;
      }
      break;
    }
    case "dizzy":
      // Spiral eyes, swaying in a slow circle, arms out for balance.
      f.tilt = sin(t * 7.5) * 0.11 * k;
      f.shakeX = sin(t * 3.75) * 3.3 * k;
      f.squash = 0.03 * k;
      f.arms = "out";
      f.armK = k;
      if (k > 0.2) {
        f.eyes = "spiral";
        f.mouth = "wavy";
      }
      break;
    case "pout": {
      // Sulky, never cross: cheeks puffed, lids low, looking away, with two little huffs.
      const huff = bump(t, 0.25, 0.55) + 0.7 * bump(t, 1.1, 1.4);
      f.squash = (0.045 + 0.03 * huff) * k;
      f.tilt = -0.035 * k;
      f.faceTilt = -7 * k;
      f.lookX = -0.9;
      f.lookY = 0.35;
      f.lookK = k;
      f.puff = k * (0.75 + 0.25 * huff);
      f.arms = "hang";
      f.armK = k;
      if (k > 0.2) f.mouth = "pout";
      break;
    }
    case "shake": {
      // A wet-dog shake-off: three quick shakes that build up and settle, eyes squeezed shut.
      const env = sin(PI * f.u);
      const ph = t * 2 * PI * 4.4;
      f.shakeX = sin(ph) * 4.5 * env;
      f.tilt = sin(ph + 0.5) * 0.09 * env;
      f.squash = 0.04 * env;
      f.arms = "out";
      f.armK = env;
      if (env > 0.3) {
        f.eyes = "squeeze";
        f.mouth = "flat";
      }
      break;
    }
    case "lookaround": {
      // Eyes and face turn to the (screen) left, hold, swing right with a blink, hold, come back.
      const L = -ramp(t, 0.1, 0.4) + 2 * ramp(t, 1.05, 1.35) - ramp(t, 2, 2.3);
      f.lookX = L * fw * 1.25;
      f.lookY = -0.1;
      f.lookK = k;
      f.tilt = 0.035 * L * fw;
      f.faceTilt = 4 * abs(L) * k;
      f.lid = bump(t, 1.1, 1.32);
      break;
    }
    case "sniff": {
      // Lean in, nose twitching in two little bursts, eyes closed to savour the smell.
      const burst = ramp(t, 0.1, 0.18) * (1 - ramp(t, 0.57, 0.65)) + ramp(t, 0.85, 0.93) * (1 - ramp(t, 1.32, 1.4));
      const tw = sin(t * 2 * PI * 7);
      f.tilt = 0.09 * k;
      f.squash = tw * 0.012 * burst;
      f.twitch = tw * 0.9 * burst;
      f.lookX = 0.9;
      f.lookY = 0.45;
      f.lookK = k;
      if (burst > 0.5) f.eyes = "closed";
      break;
    }
    case "scratch": {
      // A quick scratch behind the ear: the head leans into the paw, a foot taps along, blissful squint.
      const sc = sin(t * 2 * PI * 7);
      f.faceTilt = 9 * k;
      f.tilt = 0.02 * k;
      f.jump = abs(sc) * 0.6 * k;
      f.liftR = (1.5 + 1.5 * sc) * k;
      f.arms = "scratch";
      f.armK = k;
      if (on) {
        f.eyes = "squint";
        f.mouth = "open";
        f.open = 0.25;
      }
      break;
    }
    case "stretch": {
      // Rise up tall on tiptoes with the arms up, tremble a little, then let go with a springy settle.
      const up = ramp(t, 0, 0.5);
      const rel = 1.25;
      const down = ramp(t, rel, rel + 0.12);
      f.squash = t < rel ? -0.16 * up + sin(t * 28) * 0.006 * ramp(t, 0.5, 0.6) : -0.16 * (1 - down) + 0.1 * landing(t - rel - 0.12);
      f.liftL = f.liftR = -2.2 * up * (1 - down);
      f.arms = "up";
      f.armK = up * (1 - ramp(t, rel - 0.05, rel + 0.2));
      if (t > 0.3 && t < 1.3) {
        f.eyes = "squeeze";
        f.mouth = "o";
        f.open = 0.5;
      }
      break;
    }
    case "yawn": {
      // Breathe in with the lids falling, a big open-mouthed stretch, close, then sleepy eyes, a tear and a slow blink.
      const inh = ramp(t, 0, 0.9) * (1 - ramp(t, 2.8, 3.4));
      const wide = ramp(t, 0.7, 1.4) * (1 - ramp(t, 2.8, 3.5));
      const arm = ramp(t, 0.9, 1.5) * (1 - ramp(t, 2.7, 3.3));
      const sleepy = ramp(t, 3.2, 3.7) * (1 - ramp(t, 4.6, 5));
      f.open = max(0.25 * inh, wide);
      f.squash = -0.07 * inh - 0.04 * arm + sin(t * 24) * 0.005 * arm + 0.07 * landing(t - 3.3);
      f.tilt = -0.05 * inh;
      f.lookY = -0.5;
      f.lookK = inh;
      f.lid = max(0.6 * inh, 0.55 * sleepy, bump(t, 3.9, 4.6));
      f.arms = "up";
      f.armK = arm;
      f.tear = ramp(t, 2.4, 2.9) * (1 - ramp(t, 4.3, 5));
      if (f.open > 0.08) f.mouth = "yawn";
      if (wide > 0.35) f.eyes = "squeeze";
      break;
    }
    case "sneeze": {
      // "Ah… ah…" (two inhales, the second deeper), "choo!" (a sharp squash forward), a startled hop back.
      const tc = 0.95, th = 1.12, tl = 1.46;
      if (t < tc) {
        const I = max(0.55 * ramp(t, 0, 0.32) * (1 - 0.6 * ramp(t, 0.36, 0.5)), ramp(t, 0.5, 0.92));
        f.squash = -0.13 * I;
        f.tilt = -0.11 * I;
        f.lookY = -0.6;
        f.lookK = I;
        f.lid = (0.25 + 0.5 * I) * k;
        f.twitch = sin(t * 40) * 0.6 * I;
        f.mouth = "o";
        f.open = 0.2 + 0.6 * I;
      } else if (t < th) {
        const a2 = (t - tc) / (th - tc);
        f.squash = -0.13 + 0.27 * sin(min(1, a2 * 2) * (PI / 2));
        f.tilt = 0.15 * (1 - a2 * 0.5);
        f.eyes = "squeeze";
        f.mouth = "open";
        f.open = 1;
      } else if (t < tl) {
        const a2 = (t - th) / (tl - th);
        const h = sin(a2 * PI);
        f.jump = h * 7;
        f.squash = -0.05 * abs(cos(a2 * PI));
        f.shakeX = -fw * 6 * smooth(a2);
        f.tilt = -0.05 * h;
        f.liftL = f.liftR = -h * 2;
        f.eyes = "wide";
        f.mouth = "o";
        f.open = 0.3;
      } else {
        // Shuffle back to where it stood, blinking at what just happened.
        const a2 = (t - tl) / (ACT_DURATION.sneeze - tl);
        f.squash = 0.12 * landing(t - tl);
        f.shakeX = -fw * 6 * (1 - smooth(a2));
        f.liftL = max(0, sin(a2 * 2 * PI)) * 2.5;
        f.liftR = max(0, -sin(a2 * 2 * PI)) * 2.5;
        f.lid = bump(t, 1.55, 1.72);
      }
      break;
    }
    case "trip": {
      // A foot catches, the pet lurches forward flailing, springs back upright, then a sheepish smile.
      const tc = 0.1, tl = 0.45, tr = 0.9;
      if (t < tc) {
        f.tilt = 0.07 * smooth(t / tc);
        f.liftL = 4 * (t / tc);
        f.eyes = "wide";
      } else if (t < tl) {
        const a2 = (t - tc) / (tl - tc);
        f.tilt = 0.07 + 0.09 * smooth(a2);
        f.shakeX = fw * 4 * smooth(a2);
        f.jump = sin(a2 * PI) * 2.5;
        f.liftL = 4 * (1 - a2);
        f.liftR = 3 * sin(a2 * PI);
        f.eyes = "wide";
        f.mouth = "o";
        f.open = 0.7;
        f.arms = "flail";
        f.armK = 1;
      } else if (t < tr) {
        const x = t - tl;
        const a2 = x / (tr - tl);
        f.tilt = 0.16 * exp(-7 * x) * cos(13 * x);
        f.shakeX = fw * 4 * (1 - smooth(a2));
        f.arms = "flail";
        f.armK = 1 - smooth(a2);
        f.eyes = a2 < 0.5 ? "wide" : "squint";
        f.mouth = a2 < 0.5 ? "o" : "wavy";
        f.open = 0.5;
        f.blush = a2 >= 0.5;
      } else {
        f.faceTilt = -6 * k;
        f.eyes = on ? "squint" : null;
        f.mouth = on ? "wavy" : null;
        f.blush = on;
      }
      break;
    }
    case "ponder":
      // Hmm… head tilted, eyes up to one side, a paw at the chin, a slow blink, thought dots.
      f.faceTilt = 13 * k;
      f.lookX = 0.55;
      f.lookY = -0.7;
      f.lookK = k;
      f.lid = bump(t, 0.95, 1.4);
      f.arms = "chin";
      f.armK = k;
      if (on) f.mouth = "hmm";
      break;
  }
  return f;
}
