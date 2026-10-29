// Eyes, brows, cheeks and mouths shared by every species (ported from PetArt.swift, then tuned to
// docs/research-cute-pets.md: lower, slightly bigger eyes with two catch-lights, a smaller mouth tucked
// under them, a soft gradient blush, random clustered blinks).
import { U, type Ctx } from "./kit";
import { BREATH_ASLEEP } from "./motion";
import { circle, clamp, ell, op, p, path, r, sparkle, st } from "./svg";

export const INK = "#2B1B14";
const MOUTH = "#5A2A1E";
const TONGUE = "#FF7A8A";

/** The open round eye in face units (× U × eyeScale): 9 × 10.8, so height / width = 1.2 (was 8 × 10). */
export const EYE_W = 9;
export const EYE_H = 10.8;

/** Strokes an eye/brow path, with a light halo first when the eyes sit on a dark patch. */
function inked(d: string, width: number, halo: string | undefined): string {
  const main = path(d, st(INK, width));
  return halo ? path(d, st(halo, width + 2.8)) + main : main;
}

/**
 * Two catch-lights for an eye of w × h px centered on (x, y): a big one up-left (38 % of the width)
 * and a small one down-right (17 %). Both eyes use the same offset, as if lit by one lamp.
 */
function shine(x: number, y: number, w: number, h: number): string {
  return circle(x - w * 0.2, y - h * 0.21, w * 0.19, `fill="#fff"`) + circle(x + w * 0.2, y + h * 0.22, w * 0.085, `fill="#fff"`);
}

function arcEye(x: number, ey: number, up: boolean, s: number, halo?: string): string {
  const y0 = ey + (up ? 2 : -1) * s;
  const d = `M${p(x - 5.5 * s, y0)}Q${p(x, ey + (up ? -6.5 : 4.4) * s)} ${p(x + 5.5 * s, y0)}`;
  return inked(d, 2.6 * s, halo);
}

function brow(x: number, ey: number, side: number, inner: number, outer: number, w: number, s: number, halo?: string): string {
  const d = `M${p(x - side * 6 * s, ey - outer * s)}L${p(x + side * 4 * s, ey - inner * s)}`;
  return inked(d, w * s, halo);
}

/** Worried brow over an eye of height h: a soft curve whose inner end (toward the face center) is raised. */
function worriedBrow(x: number, ey: number, toward: number, h: number, lift: number, s: number, halo?: string): string {
  const xo = x - toward * 5 * s, yo = ey - (h / 2 + 2.2 * lift) * s;
  const xi = x + toward * 3.4 * s, yi = ey - (h / 2 + 5 * lift) * s;
  return inked(`M${p(xo, yo)}Q${p((xo + xi) / 2, (yo + yi) / 2 - 1.1 * s)} ${p(xi, yi)}`, 2 * s, halo);
}

/** An open eye of w × h face units that looks around and blinks (the upper lid falls, the lower rises a bit). */
function roundEye(c: Ctx, x: number, s: number, w: number, h: number, halo?: string): string {
  const shut = c.dyn.blink;
  const ex = x + c.lookX * 1.3 * s;
  const ey = c.ey + c.lookY * 1.5 * s;
  const rx = (w / 2) * s, ry0 = (h / 2) * s;
  if (shut > 0.85) {
    const y = ey + ry0 * 0.3;
    return inked(`M${p(ex - rx - 0.5 * s, y)}Q${p(ex, y + 1.4 * s)} ${p(ex + rx + 0.5 * s, y)}`, 2.4 * s, halo);
  }
  const ry = ry0 * (1 - shut);
  const cy = ey + shut * 0.3 * ry0;
  return (
    (halo ? ell(ex, cy, rx + 1.5, ry + 1.5, `fill="${halo}"`) : "") +
    ell(ex, cy, rx, ry, `fill="${INK}"`) +
    (shut < 0.35 ? shine(ex, cy, 2 * rx, 2 * ry) : "")
  );
}

/** Content, half-closed eye: lower half under a flat lid, with two small catch-lights. */
function relaxedEye(c: Ctx, x: number, s: number): string {
  const shut = c.dyn.blink;
  const ex = x + c.lookX * 1.3 * s;
  const y0 = c.ey - 0.8 * s + shut * 1.6 * s;
  const w = 4.7 * s, d = 5.6 * s * (1 - shut * 0.85);
  return (
    path(`M${p(ex - w, y0)}A${r(w)} ${r(d)} 0 0 0 ${p(ex + w, y0)}Z`, `fill="${INK}"`) +
    (shut < 0.35 ? circle(ex - 1.8 * s, y0 + 2.5 * s, 1.25 * s, `fill="#fff"`) + circle(ex + 1.9 * s, y0 + 3.4 * s, 0.55 * s, `fill="#fff"`) : "") +
    path(`M${p(ex - 6.2 * s, y0)}L${p(ex + 6.2 * s, y0)}`, st(INK, 2.3 * s))
  );
}

/** Soft round blush just outside the eyes, level with their bottom; little hatch marks when happy or petted. */
export function cheeks(c: Ctx): string {
  const f = c.def.face;
  const a = c.pal.cheekA > 0 ? Math.min(1, c.pal.cheekA + (c.pose.hovered ? 0.25 : 0)) : 0;
  if (a <= 0.01) return "";
  const k = U * clamp(f.eyeScale ?? 1, 0.9, 1.15);
  const rx = 0.8 * EYE_W * k, ry = rx * 0.62;
  const dx = c.bw * (f.cheekDX ?? 0.3);
  const y = c.ey + (f.cheekDY ?? 6);
  const attrs = `fill="url(#${c.id}-k)"${op(a)}`;
  let out = ell(c.fx - dx, y, rx, ry, attrs) + ell(c.fx + dx, y, rx, ry, attrs);
  if (c.petted || c.mood === "happy" || c.mood === "celebrating") {
    let d = "";
    for (const side of [-1, 1]) {
      for (const i of [-1, 0, 1]) {
        const hx = c.fx + side * dx + i * 2.7 * k;
        d += `M${p(hx - 1 * k, y + 1.5 * k)}L${p(hx + 1 * k, y - 1.5 * k)}`;
      }
    }
    out += path(d, `${st(c.pal.blush, 1.1)}${op(Math.min(1, a + 0.3))}`);
  }
  return out;
}

export function eyes(c: Ctx): string {
  const f = c.def.face;
  const s = U * (f.eyeScale ?? 1);
  const halo = f.eyeHalo;
  let out = "";
  for (const side of [-1, 1]) {
    const x = c.fx + side * c.ex;
    const ey = c.ey;
    if (c.held) {
      // Surprised: wide white eyes with tiny pupils.
      out += ell(x, ey, 5.9 * s, 6.5 * s, `fill="#fff" stroke="${INK}" stroke-width="${r(1.8 * s)}"`);
      out += circle(x, ey + 0.5 * s, 2.1 * s, `fill="${INK}"`);
      continue;
    }
    switch (c.mood) {
      case "happy":
        out += arcEye(x, ey, true, s, halo);
        break;
      case "celebrating": {
        // Big glossy eyes; the second catch-light becomes a twinkle (sparkles only when celebrating).
        const w = 11.8 * s, h = 14 * s, y = ey - 0.5 * s;
        if (halo) out += ell(x, y, w / 2 + 1.5, h / 2 + 1.5, `fill="${halo}"`);
        out += ell(x, y, w / 2, h / 2, `fill="${INK}"`);
        out += circle(x - w * 0.2, y - h * 0.21, w * 0.19, `fill="#fff"`);
        out += path(sparkle(x + w * 0.2, y + h * 0.2, w * 0.15), `fill="#fff"`);
        break;
      }
      case "normal":
        if (c.petted) out += arcEye(x, ey, true, s, halo);
        else if (f.relaxed && c.dyn.blink < 0.85) out += relaxedEye(c, x, s);
        else out += roundEye(c, x, s, EYE_W, EYE_H, halo);
        break;
      case "focus":
        out += roundEye(c, x, s, EYE_W, EYE_W * 1.05, halo);
        out += brow(x, ey, -side, 7.5, 9.5, 2.4, s, halo);
        break;
      case "annoyed":
        // Worried: open, glossy eyes and brows raised in the middle.
        out += roundEye(c, x, s, EYE_W, EYE_H * 1.04, halo);
        out += worriedBrow(x, ey, -side, EYE_H * 1.04, f.browLift ?? 1, s, halo);
        break;
      case "angry":
        if (halo) out += ell(x, ey + 1 * s, 3.8 * s + 1.5, 4.3 * s + 1.5, `fill="${halo}"`);
        out += ell(x, ey + 1 * s, 3.8 * s, 4.3 * s, `fill="${INK}"`);
        out += brow(x, ey, -side, 4.5, 11, 3.2, s, halo);
        break;
      case "sleeping":
        out += arcEye(x, ey, false, s, halo);
        break;
    }
  }
  return out;
}

function teeth(c: Ctx, y: number, h: number): string {
  const s = U;
  const x0 = c.fx - 2.7 * s;
  return (
    `<rect x="${r(x0)}" y="${r(y)}" width="${r(5.4 * s)}" height="${r(h * s)}" rx="1" fill="#fff" stroke="${c.pal.line}" stroke-width="1.1"/>` +
    path(`M${p(c.fx, y + 0.4)}L${p(c.fx, y + h * s - 0.6)}`, st(c.pal.line, 0.9))
  );
}

/** Open "D" mouth with a tongue; `big` for celebrations. */
function openMouth(c: Ctx, big: number, sx: number, sy: number): string {
  const { fx, my } = c;
  const x0 = fx - 5.6 * big * sx, x1 = fx + 5.6 * big * sx;
  const y0 = my - 1 * sy;
  const cy = my + 10 * big * sy;
  const d = `M${p(x0, y0)}Q${p(fx, cy)} ${p(x1, y0)}Z`;
  // Tongue: the bottom third of the same curve, closed by a shallow arch.
  const tx = 2.8 * big * sx;
  const ty = 0.5625 * y0 + 0.375 * cy + 0.0625 * y0;
  const tc = 0.375 * y0 + 0.625 * cy;
  const tongue = `M${p(fx - tx, ty)}Q${p(fx, tc)} ${p(fx + tx, ty)}Q${p(fx, ty - 2.6 * big * sy)} ${p(fx - tx, ty)}Z`;
  return (
    path(d, `fill="${MOUTH}"`) +
    path(tongue, `fill="${TONGUE}"`) +
    path(d, `fill="none" stroke="${c.pal.line}" stroke-width="${r(1.6 * sy)}"`)
  );
}

/** Snot bubble: grows as the sleeper breathes out, shrinks as it breathes in. */
function sleepBubble(c: Ctx, x: number, y: number): string {
  const rad = 2.2 + 3.3 * (0.5 - 0.5 * Math.sin(c.t * BREATH_ASLEEP));
  return circle(x, y, rad, `fill="#BFE6FF" fill-opacity="0.55" stroke="#7CB8E0" stroke-width="1"`);
}

/** Beaks (penguin) and bills (duckling): open when happy, askew when annoyed, clenched when angry. */
function beak(c: Ctx, bill: boolean): string {
  const s = U * (c.def.face.mouthW ?? 1);
  const { fx, my, mood } = c;
  const fill = c.pal.accent, line = c.pal.line;
  const happy = mood === "happy" || mood === "celebrating" || c.petted;
  const open = c.held ? 3.3 : mood === "celebrating" ? 5.5 : happy ? 4 : mood === "angry" ? 1.4 : 0;
  const tiltDeg = mood === "annoyed" ? -9 : 0;
  const attrs = `fill="${fill}" stroke="${line}" stroke-width="1.8"`;
  let out = "";
  if (open > 0) {
    out += ell(fx, my + open * 0.45, (bill ? 6 : 3.6) * s, open * 0.6 + 1.2, `fill="${MOUTH}"`);
    if (open > 2) out += ell(fx, my + open * 0.75, (bill ? 3.6 : 2.2) * s, open * 0.3, `fill="${TONGUE}"`);
  }
  if (bill) {
    const lo = my + open;
    out += path(`M${p(fx - 7 * s, lo)}Q${p(fx, lo + 6.5 * s)} ${p(fx + 7 * s, lo)}Z`, attrs);
    out += path(
      `M${p(fx - 9 * s, my + 0.5)}Q${p(fx - 9.5 * s, my - 5 * s)} ${p(fx, my - 5.5 * s)}Q${p(fx + 9.5 * s, my - 5 * s)} ${p(fx + 9 * s, my + 0.5)}` +
        `Q${p(fx, my + 3 * s)} ${p(fx - 9 * s, my + 0.5)}Z`,
      attrs,
    );
    out += path(`M${p(fx - 2.4 * s, my - 2.6 * s)}l1 0.3M${p(fx + 1.4 * s, my - 2.6 * s)}l1 -0.3`, st(line, 1.2));
  } else {
    const lo = my + open;
    out += path(`M${p(fx - 4.5 * s, lo)}L${p(fx + 4.5 * s, lo)}L${p(fx, lo + 4.5 * s)}Z`, attrs);
    out += path(`M${p(fx - 5.5 * s, my + 0.5)}Q${p(fx, my - 6 * s)} ${p(fx + 5.5 * s, my + 0.5)}Q${p(fx, my + 2.5 * s)} ${p(fx - 5.5 * s, my + 0.5)}Z`, attrs);
  }
  if (tiltDeg) out = `<g transform="rotate(${tiltDeg} ${r(fx)} ${r(my)})">${out}</g>`;
  if (mood === "sleeping" && !c.held) out += sleepBubble(c, fx + 9 * s, my - 3);
  return out;
}

export function mouth(c: Ctx): string {
  const f = c.def.face;
  const kind = f.mouth ?? "cat";
  if (kind === "beak" || kind === "bill") return beak(c, kind === "bill");
  const sx = U * (f.mouthW ?? 1);
  const sy = U;
  const { fx, my, mood } = c;
  const line = c.pal.line;
  if (c.held) return ell(fx, my + 2.4 * sy, 2.7 * sy, 3.2 * sy, `fill="${MOUTH}"`);
  switch (mood) {
    case "normal":
    case "focus":
      if (!c.petted || mood === "focus") {
        // A small "w" (or a wide smile) tucked right under the eyes.
        const d =
          kind === "wide"
            ? `M${p(fx - 5.4 * sx, my - 0.4)}Q${p(fx, my + 4.2 * sy)} ${p(fx + 5.4 * sx, my - 0.4)}`
            : `M${p(fx - 4.6 * sx, my)}Q${p(fx - 2.3 * sx, my + 3.4 * sy)} ${p(fx, my + 0.5 * sy)}Q${p(fx + 2.3 * sx, my + 3.4 * sy)} ${p(fx + 4.6 * sx, my)}`;
        return path(d, st(line, 1.9)) + (f.teeth ? teeth(c, my + 1.5 * sy, 3.4) : "");
      }
      return openMouth(c, 1, sx, sy) + (f.teeth ? teeth(c, my - 1, 3) : "");
    case "happy":
    case "celebrating":
      return openMouth(c, mood === "celebrating" ? 1.35 : 1, sx, sy) + (f.teeth ? teeth(c, my - 1, 3) : "");
    case "annoyed":
      // Worried: a small wavy mouth.
      return (
        path(`M${p(fx - 4.6 * sx, my + 2.6 * sy)}C${p(fx - 1.5 * sx, my - 1.2 * sy)} ${p(fx + 1.5 * sx, my + 4.3 * sy)} ${p(fx + 4.6 * sx, my + 1.7 * sy)}`, st(line, 1.9)) +
        (f.teeth ? teeth(c, my + 3.2 * sy, 3) : "")
      );
    case "angry": {
      const w = 13.6 * sx, h = 7.2 * sy;
      const x0 = fx - w / 2, y0 = my - 1.5 * sy;
      let d = `M${p(x0 + 1, y0 + h / 2)}L${p(x0 + w - 1, y0 + h / 2)}`;
      for (let i = 1; i < 4; i++) d += `M${p(x0 + (w * i) / 4, y0 + 0.5)}L${p(x0 + (w * i) / 4, y0 + h - 0.5)}`;
      return (
        `<rect x="${r(x0)}" y="${r(y0)}" width="${r(w)}" height="${r(h)}" rx="3" fill="#fff"/>` +
        path(d, `${st(line, 1)} stroke-opacity="0.6"`) +
        `<rect x="${r(x0)}" y="${r(y0)}" width="${r(w)}" height="${r(h)}" rx="3" ${st(line, 1.8)}/>`
      );
    }
    case "sleeping":
      return ell(fx, my + 1.75 * sy, 2 * sy, 1.75 * sy, `fill="${MOUTH}"`) + sleepBubble(c, fx + 6.6 * sx, my - 5.5);
  }
}

export function face(c: Ctx): string {
  return cheeks(c) + eyes(c) + mouth(c);
}
