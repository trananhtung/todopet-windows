// Hedgehog: a cream face and belly peeking out of a crown of brown, light-tipped spines that lie flat when
// happy or asleep and bristle long and sharp when annoyed or angry; tiny round ears, button nose, pink feet.
import { moodTable, type Ctx, type SpeciesDef } from "../kit";
import { makeBase } from "../palette";
import { blob } from "../shapes";
import { circle, ell, fs, p, path, st } from "../svg";

/** Spine length in px. */
const LEN = moodTable(9, 11, 14, 16.5, 8, 12, 12);
/** How far the spines sweep back toward the tail, in radians (flat = soft). */
const SWEEP = moodTable(0.5, 0.3, 0.12, 0, 0.62, 0.22, 0.2);
/** Half the spine base width, in gaps between spines (narrower = sharper; wider bases overlap into a soft coat). */
const BASE = moodTable(0.92, 0.86, 0.76, 0.68, 0.95, 0.82, 0.86);
/** Angle covered by the spines (radians, centered on straight up) and spines per row. */
const SPAN = 2.8;
const FRONT = 14;
const BACK = 13;
/** The back row is a little longer; spines ripple while walking and tremble when angry. */
const BACK_K = 1.12;
const RIPPLE = 0.13;
const TREMBLE = 0.05;

/** One row of spines around the head and sides, as fill, tip and outline path data. */
function row(c: Ctx, n: number, lenK: number, tips: boolean): [string, string] {
  const { cx, by, bw, bh, t } = c;
  const cy = by - bh * 0.5;
  const rx = bw * 0.5, ry = bh * 0.52;
  const len = c.mv(LEN) * lenK, sweep = c.mv(SWEEP), half = (SPAN / n) * c.mv(BASE);
  const walking = c.pose.walking && !c.held;
  const angry = c.mood === "angry";
  let body = "", tip = "";
  for (let i = 0; i < n; i++) {
    const th = SPAN * ((i + 0.5) / n - 0.5);
    const s = Math.sin(th), co = Math.cos(th);
    let l = len * (i % 2 ? 0.9 : 1);
    if (walking) l *= 1 + RIPPLE * Math.sin(c.pose.walkPhase * 2 - i * 0.9);
    if (angry) l *= 1 + TREMBLE * Math.sin(t * 30 + i * 2);
    // Spines lean away from the top of the head (more toward the sides): flat and soft when swept.
    const a = th + Math.sign(th) * sweep * Math.min(1, Math.abs(th) * 2);
    const ex = cx + rx * s, ey = cy - ry * co;
    const tx = ex + Math.sin(a) * l, ty = ey - Math.cos(a) * l;
    const x1 = cx + rx * 0.86 * Math.sin(th - half), y1 = cy - ry * 0.86 * Math.cos(th - half);
    const x2 = cx + rx * 0.86 * Math.sin(th + half), y2 = cy - ry * 0.86 * Math.cos(th + half);
    body += `M${p(x1, y1)}L${p(tx, ty)}L${p(x2, y2)}Z`;
    if (tips) {
      const k = 0.42;
      tip += `M${p(tx + (x1 - tx) * k, ty + (y1 - ty) * k)}L${p(tx, ty)}L${p(tx + (x2 - tx) * k, ty + (y2 - ty) * k)}Z`;
    }
  }
  return [body, tip];
}

export const hedgehog: SpeciesDef = {
  info: {
    id: "hedgehog",
    name: { en: "Hedgehog", vi: "Nhím" },
    emoji: "🦔",
    gait: "scurry",
    sound: { en: "huff puff", vi: "phì phò" },
  },
  base: makeBase({ top: "#FCEBD6", bottom: "#EDCBA4", belly: "#FFF8EE", mark: "#8E5C3B", accent: "#3A2820", inner: "#FFB0BF", line: "#5A3A26" }),
  w: 80,
  h: 64,
  face: { eyeY: 0.55, eyeDX: 0.19, eyeScale: 0.98, mouthY: 0.17, mouthW: 0.8, cheekDX: 0.3, cheekDY: 6 },
  feet: { color: "inner", w: 13, h: 7.5 },
  arms: { color: "inner", scale: 0.74 },
  highlight: null,
  reach: [22, 22],
  headroom: (c) => c.mv(LEN) * BACK_K * (1 + RIPPLE) * (1 + TREMBLE) + 1.5,
  body: (c) => blob(c, { tw: 0.44, sh: 0.26, wy: 0.42, bw2: 0.4 }),
  back(c) {
    const { cx, top, bw, bh } = c;
    const [b1] = row(c, BACK, BACK_K, false);
    const [f1, t1] = row(c, FRONT, 1, true);
    let out =
      path(b1, fs(c.pal.mark, c.pal.line, 2.2)) +
      path(f1, `fill="${c.pal.mark}"`) +
      path(t1, `fill="${c.pal.top}"`) +
      path(f1, `fill="none" stroke="${c.pal.line}" stroke-width="2.2"`);
    // Tiny round ears poking out of the spines.
    for (const side of [-1, 1]) {
      const x = cx + side * bw * 0.31, y = top + bh * 0.1;
      out += circle(x, y, 5.6, fs(c.pal.top, c.pal.line, 2.2)) + circle(x, y + 0.5, 2.8, `fill="${c.pal.inner}"`);
    }
    return out;
  },
  markings(c) {
    const { cx, top, by, bw, bh, fx, ey } = c;
    // Brown coat over the head and sides; the cream face (heart-shaped forehead) and belly show through.
    const y0 = ey - bh * 0.24;
    const w0 = bw * 0.2;
    const face =
      `M${p(fx, y0 + 3.5)}C${p(fx - 3, y0 - 3)} ${p(fx - w0 - 6, y0 - 4)} ${p(fx - bw * 0.36, ey - 2)}` +
      `C${p(fx - bw * 0.46, ey + bh * 0.12)} ${p(cx - bw * 0.46, by - bh * 0.1)} ${p(cx - bw * 0.4, by + 4)}` +
      `L${p(cx + bw * 0.4, by + 4)}` +
      `C${p(cx + bw * 0.46, by - bh * 0.1)} ${p(fx + bw * 0.46, ey + bh * 0.12)} ${p(fx + bw * 0.36, ey - 2)}` +
      `C${p(fx + w0 + 6, y0 - 4)} ${p(fx + 3, y0 - 3)} ${p(fx, y0 + 3.5)}Z`;
    let quills = "";
    for (let i = 0; i < 5; i++) {
      const x = cx + (i - 2) * bw * 0.15, y = top + 6 + Math.abs(i - 2) * 3.5;
      quills += `M${p(x - 2.4, y + 2.2)}L${p(x + (i - 2) * 0.6, y - 2.2)}L${p(x + 2.4, y + 2.2)}`;
    }
    return (
      `<rect x="${cx - bw}" y="${top - 2}" width="${bw * 2}" height="${bh + 4}" fill="${c.pal.mark}"/>` +
      path(quills, `${st(c.pal.line, 1.3)} stroke-opacity="0.45"`) +
      path(face, `fill="${c.pal.top}"`) +
      ell(cx, by - bh * 0.06, bw * 0.26, bh * 0.2, `fill="${c.pal.belly}"`)
    );
  },
  over(c) {
    // Little pointed snout: a soft muzzle with the button nose pushed toward where it looks.
    const { fx, my, lookX } = c;
    const nx = fx + lookX * 2.2;
    return (
      path(
        `M${p(fx - 7.5, my - 3)}Q${p(fx - 6.5, my - 8.5)} ${p(nx, my - 8.6)}Q${p(fx + 6.5, my - 8.5)} ${p(fx + 7.5, my - 3)}Q${p(fx, my + 1.5)} ${p(fx - 7.5, my - 3)}Z`,
        `fill="${c.pal.belly}"`,
      ) +
      path(`M${p(fx - 6.6, my - 2.2)}Q${p(fx, my + 1.6)} ${p(fx + 6.6, my - 2.2)}`, `${st(c.pal.line, 1.2)} stroke-opacity="0.3"`) +
      circle(nx, my - 5.6, 3.1, fs(c.pal.accent, c.pal.line, 1)) +
      circle(nx - 1, my - 6.6, 0.9, `fill="#fff" fill-opacity="0.7"`)
    );
  },
  anchors: (c) => ({
    head: { x: c.cx, y: c.top + 3, s: 0.92 },
    bow: { x: c.cx + c.bw * 0.3, y: c.top + 7 },
    neck: { y: c.my + 7, w: c.bw, sag: c.bh * 0.1 },
    band: { y: c.top + c.bh * 0.3, arch: c.bh * 0.22 },
  }),
};
