import type { Gait, Mood } from "../core/types";
import type { PetPose } from "./types";
import { frac } from "./svg";

/** Body dynamics for one frame. Lengths in px of the 160 design space, angles in radians. */
export interface Dyn {
  /** Height of the body above its resting place (jumps, hops, bounces). */
  jump: number;
  /** + = flatter and wider, − = taller and thinner: height × (1 − squash), width ÷ (1 − squash), so the volume is kept. */
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
  /** Eyelids: 0 = open … 1 = shut (random clustered blinks). */
  blink: number;
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

const { sin, cos, abs, max, exp, PI } = Math;

// ── Breathing (spec rule 8: 0.25–0.33 Hz awake, ~0.15 Hz asleep; the feet stay put) ─────────────

/** Angular breathing rates (rad/s). */
export const BREATH_AWAKE = 2; // 0.32 Hz
export const BREATH_WORRIED = 1.57; // 0.25 Hz
export const BREATH_ASLEEP = 0.97; // 0.155 Hz

// ── Blinking (spec rule 7) ───────────────────────────────────────────────────────────────────────
// Real blinks are irregular and come in clusters: 1.5–8 s apart (median ~3.5 s), 12 % of them
// doubled. A fixed-seed generator lays out one long schedule when the module loads, so the renderer
// stays pure (same t in, same lids out) without a visible period.

const BLINK_CLOSE = 0.08;
const BLINK_SHUT = 0.06;
const BLINK_OPEN = 0.15;
const BLINK_LEN = BLINK_CLOSE + BLINK_SHUT + BLINK_OPEN;
/** No blink in the first moments (the gallery's stills are taken at t = 1.3). */
const BLINK_FROM = 1.6;
/** Second blink of a double, after the first has reopened. */
const BLINK_DOUBLE = 0.4;

/** mulberry32: a tiny seeded PRNG (never Math.random in the renderer). */
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let x = Math.imul(a ^ (a >>> 15), 1 | a);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

/** Blink start times, relative to BLINK_FROM, over one schedule period. */
const BLINKS: number[] = [];
let BLINK_PERIOD = 0;
{
  const rnd = seeded(0x7a11e7);
  let at = 0;
  for (let i = 0; i < 160; i++) {
    BLINKS.push(at);
    let gap = 0;
    if (rnd() < 0.12) {
      BLINKS.push(at + BLINK_DOUBLE);
      gap += BLINK_DOUBLE;
    }
    // Log-normal gap around a 3.5 s median, kept within 1.5–8 s (Box–Muller).
    const z = Math.sqrt(-2 * Math.log(1 - rnd())) * cos(2 * PI * rnd());
    gap += Math.min(8, Math.max(1.5, 3.5 * exp(0.42 * z)));
    at += gap;
  }
  BLINK_PERIOD = at;
}

/** Lid closure (0 open … 1 shut) at time t; deterministic. */
export function blinkAt(t: number): number {
  if (!(t >= BLINK_FROM)) return 0;
  const u = (t - BLINK_FROM) % BLINK_PERIOD;
  // Last blink that started at or before u.
  let lo = 0, hi = BLINKS.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (BLINKS[mid] <= u) lo = mid;
    else hi = mid - 1;
  }
  const dt = u - BLINKS[lo];
  if (dt >= BLINK_LEN) return 0;
  if (dt < BLINK_CLOSE) {
    const k = dt / BLINK_CLOSE;
    return k * k; // the lid speeds up as it falls
  }
  if (dt < BLINK_CLOSE + BLINK_SHUT) return 1;
  const k = 1 - (dt - BLINK_CLOSE - BLINK_SHUT) / BLINK_OPEN;
  return k * k * (3 - 2 * k);
}

// ── Landing (spec rule 9) ────────────────────────────────────────────────────────────────────────
// Squash in over ~50 ms, then a damped spring back that overshoots by ~10 % (a slight stretch).
// The renderer keeps the volume: width = 1 / height.

const LAND_IN = 0.05;
const LAND_W = 26; // rad/s: the overshoot peaks ~0.12 s after the deepest squash
const LAND_DECAY = (LAND_W * Math.LN10) / PI; // e^(−decay·π/ω) = 0.1

/** Landing response, `dt` seconds after touchdown: 0 → 1 (deepest) → −0.1 (overshoot) → 0. */
export function landing(dt: number): number {
  if (!(dt > 0)) return 0;
  if (dt < LAND_IN) return sin((dt / LAND_IN) * (PI / 2));
  const u = dt - LAND_IN;
  return exp(-LAND_DECAY * u) * cos(LAND_W * u);
}

/**
 * One hop of a repeating cycle. `u` = phase 0…1, `air` = airborne share, `period` = seconds per cycle.
 * Airborne the body stretches with its speed (most at takeoff and touchdown); on the ground it lands.
 */
function hop(u: number, air: number, period: number, squashDepth: number, stretch: number): [lift: number, squash: number] {
  if (u < air) {
    const a = u / air;
    return [sin(a * PI), -stretch * abs(cos(a * PI))];
  }
  return [0, squashDepth * landing((u - air) * period)];
}

/** Seconds per hop step at the overlay's hop speed (34 px per step at 48 px/s). */
const HOP_STEP_S = 0.7;

export function dynamics(p: PetPose, gait: Gait, mood: Mood): Dyn {
  const t = p.t;
  const wp = p.walkPhase;
  let jump = 0, squash = 0, shakeX = 0, breathe = 0, spin = 1, flip = 0, tilt = 0, hover = 0;
  let liftL = 0, liftR = 0;
  const celebrating = mood === "celebrating";
  const walking = p.walking && !p.held && !celebrating;

  if (celebrating) {
    // Jumps: ~75 % in the air, then a short landing (squash to ~0.82 of the height, spring back).
    const ph = frac(t * 2.2);
    const air = 0.75;
    const [h, sq] = hop(ph, air, 1 / 2.2, 0.18, 0.06);
    switch (p.celebration) {
      case "dance":
        shakeX = sin(t * 8) * 8;
        jump = abs(sin(t * 8)) * 4.5;
        tilt = sin(t * 8) * 0.12;
        break;
      case "flip": {
        jump = h * 30;
        const a = ph / air;
        if (a > 0.12 && a < 0.88) flip = ((a - 0.12) / 0.76) * 2 * PI;
        break;
      }
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
    if (p.celebration !== "dance") squash = sq;
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
        // Bigger arcs with a pause on the ground between hops: legs stretch out in the air, the body
        // squashes on landing and springs back before the next hop.
        const u = frac(wp / PI);
        const k = Math.min(amp, 1.2);
        const [hh, sq] = hop(u, 0.62, HOP_STEP_S, 0.15 * k, 0.05 * k);
        jump = hh * 12 * amp;
        squash = sq;
        liftL = liftR = -hh * 2.5;
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
        // Little hops on the spot, same rhythm as before (one every ~0.98 s), now with a landing.
        const [b, sq] = hop(frac((t * 3.2) / PI), 0.7, PI / 3.2, 0.1, 0.04);
        jump = b * 6.6;
        squash = sq;
        break;
      }
      case "normal":
      case "focus":
        breathe = sin(t * BREATH_AWAKE) * 0.02;
        break;
      case "annoyed":
        // Worried: shallow breaths and a small, unsure weight shift (no impatient foot tapping).
        breathe = sin(t * BREATH_WORRIED) * 0.016;
        tilt = sin(t * 0.8) * 0.025;
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
        breathe = sin(t * BREATH_ASLEEP) * 0.04;
        squash = 0.06;
        break;
    }
  }
  if (mood === "angry") shakeX = sin(t * 47) * (sin(t * 1.7) > 0.2 ? 1.6 : 0.3);

  if (gait === "float") {
    // Floaters hover; asleep they settle down close to the ground.
    hover = mood === "sleeping" ? 2.5 + sin(t * BREATH_ASLEEP) * 0.6 : 10 + sin(t * 1.8) * 3;
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
  // Eyes that are open blink; held pets stare in surprise.
  const blink = p.held || mood === "sleeping" ? 0 : blinkAt(t);
  return { jump, squash, shakeX, breathe, spin, flip, tilt, hover, liftL, liftR, dangle, blink };
}
