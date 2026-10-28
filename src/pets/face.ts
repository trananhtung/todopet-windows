// Eyes, brows, cheeks and mouths shared by every species (ported from PetArt.swift).
import { U, type Ctx } from "./kit";
import { circle, ell, op, p, path, r, st } from "./svg";

export const INK = "#2B1B14";
const MOUTH = "#5A2A1E";
const TONGUE = "#FF7A8A";

/** Strokes an eye/brow path, with a light halo first when the eyes sit on a dark patch. */
function inked(d: string, width: number, halo: string | undefined): string {
  const main = path(d, st(INK, width));
  return halo ? path(d, st(halo, width + 2.8)) + main : main;
}

function arcEye(x: number, ey: number, up: boolean, s: number, halo?: string): string {
  const y0 = ey + (up ? 2 : -1) * s;
  const d = `M${p(x - 5 * s, y0)}Q${p(x, ey + (up ? -6 : 4) * s)} ${p(x + 5 * s, y0)}`;
  return inked(d, 2.6 * s, halo);
}

function brow(x: number, ey: number, side: number, inner: number, outer: number, w: number, s: number, halo?: string): string {
  const d = `M${p(x - side * 6 * s, ey - outer * s)}L${p(x + side * 4 * s, ey - inner * s)}`;
  return inked(d, w * s, halo);
}

function roundEye(c: Ctx, x: number, s: number, w: number, h: number, blink: boolean, halo?: string): string {
  const ey = c.ey;
  if (blink) return inked(`M${p(x - (w / 2) * s, ey)}L${p(x + (w / 2) * s, ey)}`, 2.4 * s, halo);
  // The whole eye moves a little toward where the pet looks.
  const ex = x + c.lookX * 1.3 * s;
  const ey2 = ey + c.lookY * 1.5 * s;
  return (
    (halo ? ell(ex, ey2, (w / 2) * s + 1.5, (h / 2) * s + 1.5, `fill="${halo}"`) : "") +
    ell(ex, ey2, (w / 2) * s, (h / 2) * s, `fill="${INK}"`) +
    circle(ex - (w / 2 - 2.9) * s, ey2 - (h / 2 - 3.1) * s, 1.7 * s, `fill="#fff"`)
  );
}

/** Content, half-closed eye: lower half under a flat lid, with a small highlight. */
function relaxedEye(c: Ctx, x: number, s: number): string {
  const ex = x + c.lookX * 1.3 * s;
  const y0 = c.ey - 0.8 * s;
  return (
    path(`M${p(ex - 4.2 * s, y0)}A${r(4.2 * s)} ${r(5 * s)} 0 0 0 ${p(ex + 4.2 * s, y0)}Z`, `fill="${INK}"`) +
    circle(ex - 1.6 * s, y0 + 1.8 * s, 1.1 * s, `fill="#fff"`) +
    path(`M${p(ex - 5.6 * s, y0)}L${p(ex + 5.6 * s, y0)}`, st(INK, 2.3 * s))
  );
}

export function cheeks(c: Ctx): string {
  const f = c.def.face;
  const a = c.pal.cheekA > 0 ? Math.min(1, c.pal.cheekA + (c.pose.hovered ? 0.25 : 0)) : 0;
  if (a <= 0.01) return "";
  const dx = c.bw * (f.cheekDX ?? 0.31);
  const y = c.ey + (f.cheekDY ?? 6.9);
  const attrs = `fill="${c.pal.cheek}"${op(a)}`;
  return ell(c.fx - dx, y, 6.6, 3.6, attrs) + ell(c.fx + dx, y, 6.6, 3.6, attrs);
}

export function eyes(c: Ctx): string {
  const f = c.def.face;
  const s = U * (f.eyeScale ?? 1);
  const halo = f.eyeHalo;
  const blink = c.t % 4.3 < 0.13;
  let out = "";
  for (const side of [-1, 1]) {
    const x = c.fx + side * c.ex;
    const ey = c.ey;
    if (c.held) {
      // Surprised: wide white eyes with tiny pupils.
      out += ell(x, ey, 5.5 * s, 6 * s, `fill="#fff" stroke="${INK}" stroke-width="${r(1.8 * s)}"`);
      out += circle(x, ey + 0.5 * s, 2 * s, `fill="${INK}"`);
      continue;
    }
    switch (c.mood) {
      case "happy":
        out += arcEye(x, ey, true, s, halo);
        break;
      case "celebrating":
        if (halo) out += ell(x, ey - 0.5 * s, 7 * s, 8 * s, `fill="${halo}"`);
        out += ell(x, ey - 0.5 * s, 5.5 * s, 6.5 * s, `fill="${INK}"`);
        out += circle(x - 1.75 * s, ey - 3.25 * s, 2.25 * s, `fill="#fff"`);
        out += circle(x + 1.9 * s, ey + 2.6 * s, 1.1 * s, `fill="#fff"`);
        break;
      case "normal":
        if (c.petted) out += arcEye(x, ey, true, s, halo);
        else if (f.relaxed && !blink) out += relaxedEye(c, x, s);
        else out += roundEye(c, x, s, 8, 10, blink, halo);
        break;
      case "focus":
        out += roundEye(c, x, s, 8, 8, blink, halo);
        out += brow(x, ey, -side, 7.5, 9.5, 2.4, s, halo);
        break;
      case "annoyed": {
        // Half-lidded: the lower half of the eye under a flat, tilted lid.
        const y0 = ey - 0.5 * s;
        const d = `M${p(x - 4 * s, y0)}A${r(4 * s)} ${r(5 * s)} 0 0 0 ${p(x + 4 * s, y0)}Z`;
        if (halo) out += path(d, `fill="${INK}" stroke="${halo}" stroke-width="2.6"`);
        out += path(d, `fill="${INK}"`);
        out += inked(`M${p(x - 5.5 * s, y0 - side * 0.8 * s)}L${p(x + 5.5 * s, y0 + side * 0.8 * s)}`, 2.4 * s, halo);
        out += brow(x, ey, -side, 7, 9, 2, s, halo);
        break;
      }
      case "angry":
        if (halo) out += ell(x, ey + 1 * s, 3.5 * s + 1.5, 4 * s + 1.5, `fill="${halo}"`);
        out += ell(x, ey + 1 * s, 3.5 * s, 4 * s, `fill="${INK}"`);
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
  const x0 = fx - 7 * big * sx, x1 = fx + 7 * big * sx;
  const y0 = my - 1 * sy;
  const cy = my + 12 * big * sy;
  const d = `M${p(x0, y0)}Q${p(fx, cy)} ${p(x1, y0)}Z`;
  // Tongue: the bottom third of the same curve, closed by a shallow arch.
  const tx = 3.5 * big * sx;
  const ty = 0.5625 * y0 + 0.375 * cy + 0.0625 * y0;
  const tc = 0.375 * y0 + 0.625 * cy;
  const tongue = `M${p(fx - tx, ty)}Q${p(fx, tc)} ${p(fx + tx, ty)}Q${p(fx, ty - 2.6 * big * sy)} ${p(fx - tx, ty)}Z`;
  return (
    path(d, `fill="${MOUTH}"`) +
    path(tongue, `fill="${TONGUE}"`) +
    path(d, `fill="none" stroke="${c.pal.line}" stroke-width="${r(1.6 * sy)}"`)
  );
}

function sleepBubble(c: Ctx, x: number, y: number): string {
  const rad = 2.2 + 3.3 * Math.abs(Math.sin(c.t * 1.3));
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
  if (c.held) return ell(fx, my + 2.5 * sy, 3 * sy, 3.5 * sy, `fill="${MOUTH}"`);
  switch (mood) {
    case "normal":
    case "focus":
      if (!c.petted || mood === "focus") {
        const d =
          kind === "wide"
            ? `M${p(fx - 7 * sx, my - 0.5)}Q${p(fx, my + 5 * sy)} ${p(fx + 7 * sx, my - 0.5)}`
            : `M${p(fx - 6 * sx, my)}Q${p(fx - 3 * sx, my + 4 * sy)} ${p(fx, my + 0.5 * sy)}Q${p(fx + 3 * sx, my + 4 * sy)} ${p(fx + 6 * sx, my)}`;
        return path(d, st(line, 2.2)) + (f.teeth ? teeth(c, my + 1.6 * sy, 3.6) : "");
      }
      return openMouth(c, 1, sx, sy) + (f.teeth ? teeth(c, my - 1, 3) : "");
    case "happy":
    case "celebrating":
      return openMouth(c, mood === "celebrating" ? 1.35 : 1, sx, sy) + (f.teeth ? teeth(c, my - 1, 3) : "");
    case "annoyed":
      return (
        path(`M${p(fx - 6 * sx, my + 3 * sy)}C${p(fx - 2 * sx, my - 1.5 * sy)} ${p(fx + 2 * sx, my + 5 * sy)} ${p(fx + 6 * sx, my + 2 * sy)}`, st(line, 2.2)) +
        (f.teeth ? teeth(c, my + 3.4 * sy, 3) : "")
      );
    case "angry": {
      const w = 16 * sx, h = 8 * sy;
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
      return ell(fx, my + 1.75 * sy, 2 * sy, 1.75 * sy, `fill="${MOUTH}"`) + sleepBubble(c, fx + 7.7 * sx, my - 5.5);
  }
}

export function face(c: Ctx): string {
  return cheeks(c) + eyes(c) + mouth(c);
}
