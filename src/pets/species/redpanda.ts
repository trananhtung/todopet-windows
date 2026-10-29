// Red panda: rust coat with a white face mask (cheeks, muzzle, brow dots) split by red-brown tear tracks,
// round white-rimmed ears, dark legs and underside, and a big ringed tail that swishes.
import { moodTable, type Ctx, type SpeciesDef } from "../kit";
import { makeBase } from "../palette";
import { blob, nose } from "../shapes";
import { ell, fs, p, path, r, st } from "../svg";

const EAR = moodTable(1, 0.95, 0.62, 0.45, 0.7);
/** Tail angle in degrees: + tucks it up behind the back, − lowers it. */
const TAIL = moodTable(6, 0, -8, 2, 14);
/** Angry red pandas puff up their tail. */
const PUFF = moodTable(1, 1, 1, 1.13, 0.95);
// Tail drawn around its root: it sweeps back, then curls up to a round tip.
const TAIL_D = "M6 -8C-9 -7 -22 -11 -24.5 -31A11 11 0 0 0 -46.5 -31C-49 5 -15 15 6 8Z";
const TAIL_AXIS = "M8 0C-12 3 -36 -2 -35.5 -31";

type Pt = readonly [number, number];
const lerp2 = (a: Pt, b: Pt, k: number): Pt => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k];

/** A wide triangle with a well-rounded tip and gently bowed sides. */
function roundTri(b1: Pt, tip: Pt, b2: Pt, k: number): string {
  const a = lerp2(tip, b1, k), b = lerp2(tip, b2, k);
  const s1 = lerp2(b1, a, 0.5), s2 = lerp2(b2, b, 0.5);
  const mx = (b1[0] + b2[0] + tip[0]) / 3, my = (b1[1] + b2[1] + tip[1]) / 3;
  // Bow the sides outward a little, away from the ear's center.
  const bow = (q: Pt): string => p(q[0] + (q[0] - mx) * 0.18, q[1] + (q[1] - my) * 0.18);
  return `M${p(b1[0], b1[1])}Q${bow(s1)} ${p(a[0], a[1])}Q${p(tip[0], tip[1])} ${p(b[0], b[1])}Q${bow(s2)} ${p(b2[0], b2[1])}Z`;
}

function ear(c: Ctx, side: number, lift: number): string {
  const { cx, top, bw, bh } = c;
  const b1: Pt = [cx + side * bw * 0.05, top + bh * 0.17];
  const tip: Pt = [cx + side * bw * (0.33 + (1 - lift) * 0.2), top - bh * 0.24 * lift + (1 - lift) * 8];
  const b2: Pt = [cx + side * bw * 0.5, top + bh * 0.38];
  const gx = (b1[0] + b2[0] + tip[0]) / 3, gy = (b1[1] + b2[1] + tip[1]) / 3 + 1.6;
  const shrink = (q: Pt, k: number): Pt => [gx + (q[0] - gx) * k, gy + (q[1] - gy) * k];
  const i1 = shrink(b1, 0.64), it = shrink(tip, 0.64), i2 = shrink(b2, 0.64);
  // White fluff rising from the bottom of the ear.
  const f0 = lerp2(i1, it, 0.1), f1 = lerp2(i1, it, 0.42), f3 = lerp2(i2, it, 0.42), f4 = lerp2(i2, it, 0.1);
  const fm = lerp2(lerp2(i1, i2, 0.5), it, 0.55);
  const v1 = lerp2(lerp2(i1, i2, 0.32), it, 0.22), v2 = lerp2(lerp2(i1, i2, 0.68), it, 0.22);
  return (
    path(roundTri(b1, tip, b2, 0.42), fs(c.pal.belly, c.pal.line, 2.4)) +
    path(roundTri(i1, it, i2, 0.4), `fill="${c.pal.inner}"`) +
    path(
      `M${p(f0[0], f0[1])}L${p(f1[0], f1[1])}L${p(v1[0], v1[1])}L${p(fm[0], fm[1])}L${p(v2[0], v2[1])}L${p(f3[0], f3[1])}L${p(f4[0], f4[1])}Z`,
      `fill="${c.pal.belly}" stroke="${c.pal.belly}" stroke-width="1.2"`,
    )
  );
}

export const redpanda: SpeciesDef = {
  info: {
    id: "redpanda",
    name: { en: "Red panda", vi: "Gấu trúc đỏ" },
    emoji: "🎋",
    gait: "scurry",
    sound: { en: "huff-quack", vi: "khụt khịt" },
  },
  base: makeBase({ top: "#F79A55", bottom: "#D45A2A", belly: "#FFFBF5", mark: "#76291A", accent: "#2B1B14", inner: "#B4452A" }),
  w: 80,
  h: 66,
  face: { eyeY: 0.54, eyeDX: 0.19, mouthY: 0.165, cheekDX: 0.32, cheekDY: 6.5 },
  feet: { color: "mark" },
  arms: { color: "mark", scale: 0.95 },
  reach: [40, 10],
  headroom: (c) => c.bh * 0.24 * c.mv(EAR) + 4,
  body: (c) => blob(c, { tw: 0.4, sh: 0.24, wy: 0.4 }),
  back(c) {
    const { cx, by, bw, bh, t, id } = c;
    const happy = c.mood === "happy" || c.mood === "celebrating";
    const angry = c.mood === "angry";
    const swish = Math.sin(t * (happy ? 8 : angry ? 6 : 2.2)) * (happy ? 9 : angry ? 6 : 4) * c.motion;
    const puff = c.mv(PUFF);
    const clip = `${id}-rpt`;
    let out =
      `<g transform="translate(${r(cx - bw * 0.3)} ${r(by - bh * 0.16)}) rotate(${r(c.mv(TAIL) + swish)}) scale(${r(puff * 100) / 100})">` +
      `<clipPath id="${clip}"><path d="${TAIL_D}"/></clipPath>` +
      path(TAIL_D, `fill="${c.pal.top}"`) +
      `<g clip-path="url(#${clip})">` +
      path(TAIL_AXIS, `${st(c.pal.mark, 34)} stroke-dasharray="6.5 7" stroke-dashoffset="-3" stroke-linecap="butt"`) +
      ell(-35.5, -38, 14, 8.5, `fill="${c.pal.mark}"`) +
      `</g>` +
      path(TAIL_D, `fill="none" stroke="${c.pal.line}" stroke-width="2.4"`) +
      `</g>`;
    const lift = c.mv(EAR);
    out += ear(c, -1, lift) + ear(c, 1, lift);
    return out;
  },
  markings(c) {
    const { cx, by, bw, bh, fx, ey, my, ex } = c;
    const white = `fill="${c.pal.belly}"`;
    let out =
      // Dark underside.
      ell(cx, by + bh * 0.08, bw * 0.66, bh * 0.29, `fill="${c.pal.mark}" fill-opacity="0.35"`) +
      ell(cx, by + bh * 0.11, bw * 0.62, bh * 0.25, `fill="${c.pal.mark}"`) +
      // White mask: cheeks, muzzle and the little brow dots.
      ell(fx - bw * 0.33, my - 3, bw * 0.21, bh * 0.17, white) +
      ell(fx + bw * 0.33, my - 3, bw * 0.21, bh * 0.17, white) +
      ell(fx, my - 1.5, bw * 0.17, bh * 0.145, white) +
      ell(fx - ex * 1.02, ey - 10, 4.4, 3, white) +
      ell(fx + ex * 1.02, ey - 10, 4.4, 3, white);
    // Tear tracks from under the eyes down to the corners of the mouth.
    let d = "";
    for (const side of [-1, 1]) {
      d += `M${p(fx + side * ex * 0.8, ey + 3)}Q${p(fx + side * ex * 1.0, my - 2)} ${p(fx + side * bw * 0.15, my + 6)}`;
    }
    out += path(d, `${st(c.pal.mark, 3.4)} stroke-opacity="0.85"`);
    return out;
  },
  front: (c) => nose(c.fx, c.my - 4.2, 7.4, 4.8, c.pal.accent, c.pal.line),
  anchors: (c) => ({
    head: { x: c.cx, y: c.top + 3, s: 0.92 },
    bow: { x: c.cx + c.bw * 0.3, y: c.top + 8 },
    neck: { y: c.my + 7.5, w: c.bw, sag: c.bh * 0.1 },
    band: { y: c.top + c.bh * 0.3, arch: c.bh * 0.22 },
  }),
};
