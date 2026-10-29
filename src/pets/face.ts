// Eyes, brows, cheeks and mouths shared by every species (ported from PetArt.swift, then tuned to
// docs/research-cute-pets.md: lower, slightly bigger eyes with two catch-lights, a smaller mouth tucked
// under them, a soft gradient blush, random clustered blinks).
import type { ActEyes, ActMouth } from "./acts";
import { U, type Ctx } from "./kit";
import { BREATH_ASLEEP } from "./motion";
import { circle, clamp, drop, ell, op, p, path, r, smooth, sparkle, st } from "./svg";

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
  const shut = Math.max(c.dyn.blink, c.dyn.lid);
  const ex = x + c.lookX * 1.3 * s;
  const y0 = c.ey - 0.8 * s + shut * 1.6 * s;
  const w = 4.7 * s, d = 5.6 * s * (1 - shut * 0.85);
  return (
    path(`M${p(ex - w, y0)}A${r(w)} ${r(d)} 0 0 0 ${p(ex + w, y0)}Z`, `fill="${INK}"`) +
    (shut < 0.35 ? circle(ex - 1.8 * s, y0 + 2.5 * s, 1.25 * s, `fill="#fff"`) + circle(ex + 1.9 * s, y0 + 3.4 * s, 0.55 * s, `fill="#fff"`) : "") +
    path(`M${p(ex - 6.2 * s, y0)}L${p(ex + 6.2 * s, y0)}`, st(INK, 2.3 * s))
  );
}

/**
 * An eye under a drooping upper lid (0 open … 1 shut): the part of the ellipse below the lid line, which
 * slants down toward the outer corner (sleepy and soft; a flat lid reads as unimpressed), with the lid drawn
 * as a soft stroke. Used for drowsy and blinking-slowly eyes and the cat blink. `side` −1 = left eye.
 */
function lidEye(c: Ctx, x: number, s: number, w: number, h: number, lid: number, side: number, halo?: string): string {
  const ex = x + c.lookX * 1.3 * s;
  const ey = c.ey + c.lookY * 1.5 * s;
  const rx = (w / 2) * s, ry = (h / 2) * s;
  if (lid > 0.86) {
    const y = ey + ry * 0.3;
    return inked(`M${p(ex - rx - 0.5 * s, y)}Q${p(ex, y + 1.4 * s)} ${p(ex + rx + 0.5 * s, y)}`, 2.4 * s, halo);
  }
  // Lid line in unit-circle space: Y = m + q·X, lower (larger Y) at the outer corner.
  const m = 2 * lid - 1, q = side * 0.38 * Math.min(1, lid * 3);
  const disc = Math.sqrt(Math.max(0, 1 + q * q - m * m));
  const X1 = (-m * q - disc) / (1 + q * q), X2 = (-m * q + disc) / (1 + q * q);
  const x1 = ex + X1 * rx, y1 = ey + (m + q * X1) * ry, x2 = ex + X2 * rx, y2 = ey + (m + q * X2) * ry;
  const d = `M${p(x1, y1)}A${r(rx)} ${r(ry)} 0 ${m < 0 ? 1 : 0} 0 ${p(x2, y2)}Z`;
  let out = halo ? path(d, `fill="${halo}" stroke="${halo}" stroke-width="3"`) : "";
  out += path(d, `fill="${INK}"`);
  const yl = ey + m * ry;
  if (lid < 0.62) {
    // The catch-lights shrink as the lids fall.
    const big = rx * (0.38 - 0.2 * clamp(lid / 0.6, 0, 1));
    out += circle(ex - rx * 0.36, Math.max(ey - ry * 0.42, yl + big + 1), big, `fill="#fff"`);
    out += circle(ex + rx * 0.4, ey + ry * 0.44, rx * 0.17, `fill="#fff"`);
  }
  const mx = (x1 + x2) / 2, my = (y1 + y2) / 2 - 1.2 * s * (1 - lid);
  const ox = (x2 - x1) * 0.06, oy = (y2 - y1) * 0.06;
  return out + inked(`M${p(x1 - ox, y1 - oy + 0.3 * s)}Q${p(mx, my)} ${p(x2 + ox, y2 + oy + 0.3 * s)}`, 1.9 * s, halo);
}

/** An open eye that also droops when the lids are heavy (drowsy, acts). */
function openEye(c: Ctx, x: number, side: number, s: number, w: number, h: number, halo?: string): string {
  const lid = c.dyn.lid;
  return lid > 0.04 ? lidEye(c, x, s, w, h, Math.max(lid, c.dyn.blink), side, halo) : roundEye(c, x, s, w, h, halo);
}

/** Surprised: wide white eyes with tiny pupils (held, a stumble, right after a sneeze). */
function wideEye(x: number, ey: number, s: number): string {
  return ell(x, ey, 5.9 * s, 6.5 * s, `fill="#fff" stroke="${INK}" stroke-width="${r(1.8 * s)}"`) + circle(x, ey + 0.5 * s, 2.1 * s, `fill="${INK}"`);
}

/** Eyes drawn by an act (side −1 = left eye in local space). */
function actEye(c: Ctx, style: ActEyes, x: number, side: number, s: number, halo?: string): string {
  const ey = c.ey;
  switch (style) {
    case "squint":
      return arcEye(x, ey, true, s, halo);
    case "closed":
      return arcEye(x, ey, false, s, halo);
    case "wide":
      return wideEye(x, ey, s);
    case "squeeze": {
      // ">" and "<": the tips point to the middle of the face.
      const dir = -side, w = 2.6 * s, h = 4.2 * s;
      return inked(`M${p(x - dir * w, ey - h)}L${p(x + dir * w, ey)}L${p(x - dir * w, ey + h)}`, 2.5 * s, halo);
    }
    case "spiral": {
      // Two turns winding out from the middle, spinning.
      const R = EYE_H * 0.52 * s;
      const rot = c.t * 9;
      let d = "";
      for (let i = 0; i <= 20; i++) {
        const u = i / 20;
        const a = rot + u * 4 * Math.PI;
        const rr = R * (0.1 + 0.9 * u);
        d += (i ? "L" : "M") + p(x + Math.cos(a) * rr, ey + Math.sin(a) * rr);
      }
      return inked(d, 1.7 * s, halo);
    }
  }
}

/** Lid for slow cat blinks once petting goes past 2 s (`pt` = seconds since then). */
function catLid(pt: number): number {
  const g = 0.3; // the soft gaze between blinks
  if (pt < 0.5) return 1 - (1 - g) * smooth(pt / 0.5); // the squint opens into a soft gaze
  const u = (pt - 0.5) % 3.4;
  if (u < 0.9) return g;
  if (u < 1.5) return g + (1 - g) * smooth((u - 0.9) / 0.6);
  if (u < 1.9) return 1;
  if (u < 2.6) return 1 - (1 - g) * smooth((u - 1.9) / 0.7);
  return g;
}

/** Soft round blush just outside the eyes, level with their bottom; little hatch marks when happy or petted. */
export function cheeks(c: Ctx): string {
  const f = c.def.face;
  const act = c.act;
  const puff = act ? act.puff : 0;
  const warm = c.pose.hovered || c.petting > 0 || (act !== null && (act.blush || puff > 0));
  const a = c.pal.cheekA > 0 ? Math.min(1, c.pal.cheekA + (warm ? 0.25 : 0)) : 0;
  const k = U * clamp(f.eyeScale ?? 1, 0.9, 1.15);
  const dx = c.bw * (f.cheekDX ?? 0.3);
  const y = c.ey + (f.cheekDY ?? 6);
  let out = "";
  if (a > 0.01) {
    // Puffed cheeks (pout) make the blush bigger and rounder.
    const rx = 0.8 * EYE_W * k * (1 + 0.3 * puff), ry = rx * (0.62 + 0.2 * puff);
    const attrs = `fill="url(#${c.id}-k)"${op(Math.min(1, a + 0.2 * puff))}`;
    out += ell(c.fx - dx, y, rx, ry, attrs) + ell(c.fx + dx, y, rx, ry, attrs);
  }
  if (puff > 0.02) {
    // …with a little shine on top of each round cheek, like a held breath.
    const hr = 0.55 * EYE_W * k * (0.8 + 0.2 * puff);
    let d = "";
    for (const side of [-1, 1]) {
      const x = c.fx + side * dx;
      d += `M${p(x - side * hr * 0.9, y - hr * 0.2)}Q${p(x - side * hr * 0.5, y - hr * 0.95)} ${p(x + side * hr * 0.25, y - hr * 0.9)}`;
    }
    out += path(d, `${st("#fff", 1.4)}${op(0.85 * puff)}`);
  }
  if (a <= 0.01) return out;
  if (c.petted || c.mood === "happy" || c.mood === "celebrating" || (act !== null && act.blush)) {
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
  const style = c.held || !c.act ? null : c.act.eyes;
  // Petted for more than 2 s: the happy squint turns into slow cat blinks.
  const cat = !c.held && !style && c.petting >= 2 ? Math.max(catLid(c.petting - 2), c.dyn.lid) : -1;
  let out = "";
  for (const side of [-1, 1]) {
    const x = c.fx + side * c.ex;
    const ey = c.ey;
    if (c.held) {
      // Surprised: wide white eyes with tiny pupils.
      out += wideEye(x, ey, s);
      continue;
    }
    if (style) {
      out += actEye(c, style, x, side, s, halo);
      continue;
    }
    if (cat >= 0) {
      out += lidEye(c, x, s, EYE_W, EYE_H, cat, side, halo);
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
        else if (f.relaxed && Math.max(c.dyn.blink, c.dyn.lid) < 0.85) out += relaxedEye(c, x, s);
        else out += openEye(c, x, side, s, EYE_W, EYE_H, halo);
        break;
      case "focus":
        if (c.petting > 0) {
          out += arcEye(x, ey, true, s, halo);
          break;
        }
        out += openEye(c, x, side, s, EYE_W, EYE_W * 1.05, halo);
        out += brow(x, ey, -side, 7.5, 9.5, 2.4, s, halo);
        break;
      case "annoyed":
        if (c.petting > 0) {
          // Comforted: the worry melts into a squint.
          out += arcEye(x, ey, true, s, halo);
          break;
        }
        // Worried: open, glossy eyes and brows raised in the middle.
        out += openEye(c, x, side, s, EYE_W, EYE_H * 1.04, halo);
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
  const am = c.held || !c.act ? null : c.act.mouth;
  const ao = c.act ? c.act.open : 0;
  const open = c.held
    ? 3.3
    : am
      ? am === "open" ? 4 * (0.7 + 0.4 * ao) : am === "o" ? 1.5 + 2 * ao : am === "yawn" ? 1.5 + 6 * ao : 0
      : mood === "celebrating" ? 5.5 : happy ? 4 : mood === "angry" ? 1.4 : 0;
  const tiltDeg = (mood === "annoyed" && !happy && !am) || am === "wavy" || am === "pout" ? -9 : 0;
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

/** Mouths drawn by an act; `open` 0 … 1 sizes the open ones. */
function actMouth(c: Ctx, m: ActMouth, open: number, sx: number, sy: number): string {
  const { fx, my } = c;
  const line = c.pal.line;
  const t = c.def.face.teeth;
  switch (m) {
    case "open":
      return openMouth(c, 0.7 + 0.4 * open, sx, sy) + (t ? teeth(c, my - 1, 3) : "");
    case "o": {
      const rx = (1.8 + 1.5 * open) * Math.min(sx, 1.5 * U), ry = (1.9 + 2.4 * open) * sy;
      return ell(fx, my + ry * 0.55, rx, ry, `fill="${MOUTH}" stroke="${line}" stroke-width="1.4"`);
    }
    case "yawn": {
      // A tall oval with the tongue at the bottom (and the bunny's teeth at the top).
      const rx = (2.2 + 3.2 * open) * Math.min(sx, 1.7 * U), ry = (1.8 + 4.8 * open) * sy;
      const cy = my + ry * 0.5;
      return (
        ell(fx, cy, rx, ry, `fill="${MOUTH}"`) +
        ell(fx, cy + ry * 0.55, rx * 0.62, ry * 0.32, `fill="${TONGUE}"`) +
        ell(fx, cy, rx, ry, `fill="none" stroke="${line}" stroke-width="1.6"`) +
        (t && open > 0.4 ? teeth(c, cy - ry + 0.2, 2.6) : "")
      );
    }
    case "pout":
      return path(`M${p(fx - 2.6 * sx, my + 1.7 * sy)}Q${p(fx, my + 0.1 * sy)} ${p(fx + 2.6 * sx, my + 1.7 * sy)}`, st(line, 1.9));
    case "wavy":
      return path(`M${p(fx - 4.6 * sx, my + 2.6 * sy)}C${p(fx - 1.5 * sx, my - 1.2 * sy)} ${p(fx + 1.5 * sx, my + 4.3 * sy)} ${p(fx + 4.6 * sx, my + 1.7 * sy)}`, st(line, 1.9));
    case "hmm":
      return path(`M${p(fx - 1.4 * sx, my + 1.4 * sy)}Q${p(fx + 1 * sx, my + 0.5 * sy)} ${p(fx + 3.4 * sx, my + 0.9 * sy)}`, st(line, 1.9));
    case "flat":
      return path(`M${p(fx - 2.8 * sx, my + 1.3 * sy)}L${p(fx + 2.8 * sx, my + 1.3 * sy)}`, st(line, 1.9));
  }
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
  if (c.act && c.act.mouth) return actMouth(c, c.act.mouth, c.act.open, sx, sy);
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
      if (c.petting > 0) return path(`M${p(fx - 4.6 * sx, my)}Q${p(fx - 2.3 * sx, my + 3.4 * sy)} ${p(fx, my + 0.5 * sy)}Q${p(fx + 2.3 * sx, my + 3.4 * sy)} ${p(fx + 4.6 * sx, my)}`, st(line, 1.9));
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
  const a = c.act;
  const m = mouth(c);
  let out = cheeks(c) + eyes(c) + (a && a.twitch ? `<g transform="translate(0 ${r(a.twitch)})">${m}</g>` : m);
  if (a && a.tear > 0.02) {
    // A sleepy tear in the front eye's corner after a yawn.
    const s = U * (c.def.face.eyeScale ?? 1);
    const x = c.fx + c.ex + 0.62 * EYE_W * s, y = c.ey + 1.5 * s + a.tear * 1.2;
    out += path(drop(x, y, 0.42), `fill="#BFE6FF" stroke="#6FB0DC" stroke-width="0.9"${op(Math.min(1, a.tear * 1.4))}`);
  }
  return out;
}
