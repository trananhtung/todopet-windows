// Feet and arms, posed per mood like the original, styled per species (nubs, flippers, wings).
import type { ActFrame } from "./acts";
import { U, color, type Ctx } from "./kit";
import { DEG, ell, fs, p, path, r, st } from "./svg";

/** Inner strokes (limbs, toes) are thinner than the 2.4 px body outline (spec rule 5). */
const LIMB_LINE = 1.8;

export function feet(c: Ctx): string {
  const spec = c.def.feet ?? {};
  const fill = color(c, spec.color ?? "foot");
  const line = c.pal.line;
  const w = (spec.w ?? 17) * U, h = (spec.h ?? 9) * U;
  const dx = c.bw * (spec.dx ?? 0.236);
  const dangle = c.dyn.dangle;
  let out = "";
  for (const side of [-1, 1]) {
    const lift = side < 0 ? c.dyn.liftL : c.dyn.liftR;
    const swing = c.held ? Math.sin(c.t * 10 + side * 17) * 2.2 : 0;
    const x = c.cx + side * dx + swing;
    const y = c.by + 1.65 - lift + dangle;
    out += ell(x, y, w / 2, h / 2, fs(fill, line, LIMB_LINE));
    if (spec.toes) {
      out += path(`M${p(x - w * 0.16, y + h * 0.5)}l0 ${r(-h * 0.38)}M${p(x + w * 0.16, y + h * 0.5)}l0 ${r(-h * 0.38)}`, st(line, 1));
    }
  }
  return out;
}

/** One arm: an ellipse (or wing / flipper) rotated by `angle` radians around its center. */
function limb(c: Ctx, x: number, y: number, angle: number, side: number): string {
  const spec = c.def.arms ?? {};
  const style = spec.style ?? "nub";
  const sc = (spec.scale ?? 1) * U;
  const fill = color(c, spec.color ?? "arm");
  const tr = `transform="rotate(${r(angle * DEG)} ${r(x)} ${r(y)})"`;
  const attrs = `${fs(fill, c.pal.line, LIMB_LINE)} ${tr}`;
  if (style === "flipper") {
    const w = 4.6 * sc, h = 13 * sc;
    return path(`M${p(x - w, y - h * 0.55)}Q${p(x, y - h * 0.8)} ${p(x + w, y - h * 0.55)}Q${p(x + w * 0.6, y + h * 0.6)} ${p(x, y + h)}Q${p(x - w * 0.9, y + h * 0.5)} ${p(x - w, y - h * 0.55)}Z`, attrs);
  }
  if (style === "wing") {
    // A rounded wing with two feather tips at the bottom, mirrored per side.
    const w = 6.5 * sc, h = 9.5 * sc, o = side;
    return path(
      `M${p(x - o * w * 0.2, y - h)}Q${p(x + o * w * 1.1, y - h * 0.7)} ${p(x + o * w, y + h * 0.35)}` +
        `Q${p(x + o * w * 0.75, y + h)} ${p(x + o * w * 0.2, y + h * 0.82)}Q${p(x, y + h * 1.05)} ${p(x - o * w * 0.45, y + h * 0.7)}` +
        `Q${p(x - o * w * 1.05, y)} ${p(x - o * w * 0.2, y - h)}Z`,
      attrs,
    );
  }
  return ell(x, y, 5.5 * sc, 8 * sc, attrs);
}

export function arms(c: Ctx): string {
  const { cx, top, by, bw, bh, t, mood } = c;
  const style = c.def.arms?.style ?? "nub";
  const shoulderY = by - bh * 0.36;
  const out: string[] = [];
  const arm = (x: number, y: number, a: number, side: number): void => {
    out.push(limb(c, x, y, a, side));
  };
  if (c.held) {
    for (const side of [-1, 1]) arm(cx + side * bw * 0.52, top + bh * 0.32, side * (2.4 + Math.sin(t * 14) * 0.3), side);
    return out.join("");
  }
  const act = c.act;
  if (act && act.arms && act.armK > 0.02) return actArms(c, act, shoulderY);
  if (c.craft !== null) {
    // Holding the needles in front of the chest (see craft.ts), paws turned in.
    const hx = cx + (c.fx - cx) * 0.4, w = Math.min(22, bw * 0.3);
    for (const side of [-1, 1]) arm(hx + side * (w / 2 + 6), by - bh * 0.3 + 4.5, side * 0.6, side);
    return out.join("");
  }
  switch (mood) {
    case "celebrating":
      if (c.pose.celebration === "dance") {
        // Disco: one arm up, then the other.
        const up = Math.sin(t * 8) > 0;
        arm(cx - bw * 0.5, up ? top + bh * 0.18 : shoulderY, up ? -2.6 : 0.35, -1);
        arm(cx + bw * 0.5, up ? shoulderY : top + bh * 0.18, up ? -0.35 : 2.6, 1);
      } else {
        // Wings flap hard; paws wave.
        const flap = style === "wing" || style === "flipper" ? Math.sin(t * 22) * 0.55 : Math.sin(t * 12) * 0.25;
        for (const side of [-1, 1]) arm(cx + side * bw * 0.5, top + bh * 0.2, side * (2.5 + flap), side);
      }
      break;
    case "happy":
      if (c.pose.walking) {
        const sw = Math.sin(c.pose.walkPhase) * 0.5;
        arm(cx - bw * 0.5, shoulderY, 0.35 + sw, -1);
        arm(cx + bw * 0.5, shoulderY, -0.35 + sw, 1);
      } else {
        arm(cx - bw * 0.5, shoulderY, 0.35, -1);
        arm(cx + bw * 0.52, top + bh * 0.3, -2.3 + Math.sin(t * 8) * 0.45, 1);
      }
      break;
    case "annoyed": {
      // Worried: arms hang straight down, tucked in a little (never crossed).
      const sw = c.pose.walking ? Math.sin(c.pose.walkPhase) * 0.25 : 0;
      arm(cx - bw * 0.48, shoulderY + 3, 0.08 + sw, -1);
      arm(cx + bw * 0.48, shoulderY + 3, -0.08 + sw, 1);
      break;
    }
    case "angry":
      for (const side of [-1, 1]) {
        const shake = Math.sin(t * 20 + side) * 2;
        const y = top + bh * 0.52 + shake;
        if (style === "nub") {
          const sc = (c.def.arms?.scale ?? 1) * U;
          out.push(ell(cx + side * bw * 0.5, y, 6 * sc, 6 * sc, fs(color(c, c.def.arms?.color ?? "arm"), c.pal.line, LIMB_LINE)));
        } else {
          arm(cx + side * bw * 0.5, y, side * (1.2 + shake * 0.1), side);
        }
      }
      break;
    case "sleeping":
      break;
    default: {
      const sw = c.pose.walking ? Math.sin(c.pose.walkPhase) * 0.5 : Math.sin(t * 2) * 0.06;
      arm(cx - bw * 0.5, shoulderY, 0.35 + sw, -1);
      arm(cx + bw * 0.5, shoulderY, -0.35 + sw, 1);
    }
  }
  return out.join("");
}

/** Arms for an act, blended from resting arms by `act.armK`. Side −1 is the back, +1 the facing side. */
function actArms(c: Ctx, a: ActFrame, shoulderY: number): string {
  const { cx, top, bw, bh, t } = c;
  const k = Math.min(1, a.armK);
  let out = "";
  for (const side of [-1, 1]) {
    // Rest: hanging a little outward.
    const x0 = cx + side * bw * 0.5, y0 = shoulderY, a0 = -side * 0.35;
    let x = x0, y = y0, ang = a0;
    const front = side > 0;
    switch (a.arms) {
      case "wave":
        if (front) [x, y, ang] = [cx + bw * 0.52, top + bh * 0.3, -2.3 + Math.sin(t * 11) * 0.5];
        break;
      case "up":
        // Raised high and out to the sides ("\o/"), clear of the ears.
        [x, y, ang] = [cx + side * bw * 0.5, top + bh * 0.13, side * 0.55];
        break;
      case "mouth":
        if (front) [x, y, ang] = [c.fx + 3.6, c.my + 3.2, 0.55];
        break;
      case "chin":
        if (front && (c.def.arms?.style ?? "nub") !== "flipper") [x, y, ang] = [c.fx + bw * 0.2, c.my + 9, -0.45];
        break;
      case "scratch": {
        const sc = Math.sin(t * 2 * Math.PI * 7);
        if (front) [x, y, ang] = [cx + bw * 0.42, top + bh * 0.12 + sc * 2, -2.6 + sc * 0.2];
        break;
      }
      case "flail":
        [x, y, ang] = [cx + side * bw * 0.52, top + bh * 0.24 + Math.sin(t * 25 + side) * 2, -side * (2.3 + Math.sin(t * 22 + side * 1.3) * 0.5)];
        break;
      case "out": {
        const flop = a.kind === "shake" ? Math.sin(t * 2 * Math.PI * 4.4 + side) * 0.5 : Math.sin(t * 7.5 + side) * 0.25;
        [x, y, ang] = [cx + side * bw * 0.54, shoulderY - 3, -side * (1.15 + flop)];
        break;
      }
      case "hang":
        [x, y, ang] = [cx + side * bw * 0.48, shoulderY + 3, -side * 0.08];
        break;
    }
    out += limb(c, x0 + (x - x0) * k, y0 + (y - y0) * k, a0 + (ang - a0) * k, side);
  }
  return out;
}
