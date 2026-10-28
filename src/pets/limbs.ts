// Feet and arms, posed per mood like the original, styled per species (nubs, flippers, wings).
import { U, color, type Ctx } from "./kit";
import { DEG, ell, fs, p, path, r, st } from "./svg";

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
    out += ell(x, y, w / 2, h / 2, fs(fill, line, 2.2));
    if (spec.toes) {
      out += path(`M${p(x - w * 0.16, y + h * 0.5)}l0 ${r(-h * 0.38)}M${p(x + w * 0.16, y + h * 0.5)}l0 ${r(-h * 0.38)}`, st(line, 1.2));
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
  const attrs = `${fs(fill, c.pal.line, 2.2)} ${tr}`;
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
    case "annoyed":
      if (!c.pose.walking && style === "nub") {
        // Crossed arms.
        const fill = color(c, c.def.arms?.color ?? "arm");
        const sc = (c.def.arms?.scale ?? 1) * U;
        for (const side of [-1, 1]) {
          const d = `M${p(cx + side * bw * 0.38, by - bh * 0.14)}L${p(cx - side * bw * 0.14, by - bh * 0.05)}`;
          out.push(path(d, st(c.pal.line, 12 * sc)) + path(d, st(fill, 8 * sc)));
        }
        break;
      }
      arm(cx - bw * 0.5, shoulderY + 2, 0.15, -1);
      arm(cx + bw * 0.5, shoulderY + 2, -0.15, 1);
      break;
    case "angry":
      for (const side of [-1, 1]) {
        const shake = Math.sin(t * 20 + side) * 2;
        const y = top + bh * 0.52 + shake;
        if (style === "nub") {
          const sc = (c.def.arms?.scale ?? 1) * U;
          out.push(ell(cx + side * bw * 0.5, y, 6 * sc, 6 * sc, fs(color(c, c.def.arms?.color ?? "arm"), c.pal.line, 2.2)));
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
