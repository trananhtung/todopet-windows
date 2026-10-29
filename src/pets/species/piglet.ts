// Piglet: round and pink with a big oval snout, floppy ears whose tips fold forward, a corkscrew tail, tiny hooves.
import type { Mood } from "../../core/types";
import { moodTable, type Ctx, type SpeciesDef } from "../kit";
import { makeBase } from "../palette";
import { blob, tube } from "../shapes";
import { circle, ell, fs, p, path, r } from "../svg";

/** 1 = ears perked up, 0 = flopped down to the sides. */
const EAR = moodTable(1, 0.78, 0.3, 0.6, 0.1, 0.82, 1);
/** A curly-q that leaves the rump, loops once and flicks up. */
const TAIL_D = "M0 0C-4.5 0.5 -8.5 -1.5 -9.5 -5.5C-10.5 -9.5 -6.5 -11.5 -4.8 -8.8C-3.2 -6.2 -6.2 -3.2 -10 -4C-13.5 -4.8 -15 -8 -14.6 -11";
/** Tail wiggle speed (rad/s): a happy pig wiggles fast. */
const TAIL_SPEED: Readonly<Record<Mood, number>> = { happy: 15, celebrating: 18, normal: 4, focus: 3.5, angry: 9, annoyed: 2.2, sleeping: 1.2 };

type Pt = readonly [number, number];

/** Ear corners: two base points on the head, the fold points and the folded-down tip. */
function ear(c: Ctx, side: number): { b1: Pt; b2: Pt; e1: Pt; e2: Pt; ft: Pt } {
  const { cx, top, bw, bh } = c;
  const L = c.mv(EAR) + (c.mood === "happy" ? Math.sin(c.t * 6 + side) * 0.05 * c.motion : 0);
  const b1: Pt = [cx + side * bw * 0.07, top + bh * 0.08];
  const b2: Pt = [cx + side * bw * 0.42, top + bh * 0.28];
  const tip: Pt = [cx + side * bw * (0.3 + (1 - L) * 0.36), top - bh * 0.36 * L + (1 - L) * 8];
  const f = 0.6 + 0.1 * L;
  const e1: Pt = [b1[0] + (tip[0] - b1[0]) * f, b1[1] + (tip[1] - b1[1]) * f];
  const e2: Pt = [b2[0] + (tip[0] - b2[0]) * f, b2[1] + (tip[1] - b2[1]) * f];
  // The tip folds forward over the fold line: mirror it across e1–e2, a little shortened.
  const ux = e2[0] - e1[0], uy = e2[1] - e1[1];
  const k = ((tip[0] - e1[0]) * ux + (tip[1] - e1[1]) * uy) / (ux * ux + uy * uy);
  const px = e1[0] + ux * k, py = e1[1] + uy * k;
  const ft: Pt = [px - (tip[0] - px) * 0.9, py - (tip[1] - py) * 0.9 + 1.5];
  return { b1, b2, e1, e2, ft };
}

export const piglet: SpeciesDef = {
  info: {
    id: "piglet",
    name: { en: "Piglet", vi: "Heo con" },
    emoji: "🐷",
    gait: "bounce",
    sound: { en: "oink oink", vi: "ụt ịt" },
  },
  base: makeBase({
    top: "#FFE1E8",
    bottom: "#F7A8BC",
    belly: "#FFEFF3",
    mark: "#E27996",
    accent: "#F7899F",
    inner: "#F27E9C",
    line: "#8A3B53",
  }),
  w: 84,
  h: 66,
  face: { eyeY: 0.4, eyeDX: 0.22, mouthY: 0.3, mouthW: 0.62, cheekDX: 0.34, cheekDY: 8 },
  feet: { w: 14, h: 8.5, dx: 0.23, color: "mark" },
  arms: { scale: 0.85 },
  highlight: [-0.2, 0.15, 0.11, 0.06],
  reach: [16, 10],
  headroom(c) {
    const { e1, e2 } = ear(c, 1);
    return Math.max(3, c.top - Math.min(e1[1], e2[1]) + 2.5);
  },
  body: (c) => blob(c, { tw: 0.42, sh: 0.24, wy: 0.4, bw2: 0.4 }),
  back(c) {
    const { cx, by, bw, bh, t } = c;
    const speed = TAIL_SPEED[c.mood];
    const amp = c.mood === "happy" || c.mood === "celebrating" ? 14 : c.mood === "sleeping" ? 3 : 7;
    const wag = Math.sin(t * speed) * amp * c.motion;
    let out =
      `<g transform="translate(${r(cx - bw * 0.44)} ${r(by - bh * 0.34)}) rotate(${r(wag)})">` +
      tube(TAIL_D, 3.4, c.pal.arm, c.pal.line) +
      `</g>`;
    for (const side of [-1, 1]) {
      const { b1, b2, e1, e2 } = ear(c, side);
      const mx = (b1[0] + b2[0] + e1[0] + e2[0]) / 4, my = (b1[1] + b2[1] + e1[1] + e2[1]) / 4;
      const inw = (q: Pt, k = 0.6): string => p(mx + (q[0] - mx) * k, my + (q[1] - my) * k + 0.5);
      // Edges bow out a little so the ear looks soft, not folded paper.
      const bow = (a: Pt, b: Pt): string => p((a[0] + b[0]) / 2 + ((a[0] + b[0]) / 2 - mx) * 0.22, (a[1] + b[1]) / 2 + ((a[1] + b[1]) / 2 - my) * 0.22);
      out +=
        path(`M${p(b1[0], b1[1])}Q${bow(b1, e1)} ${p(e1[0], e1[1])}L${p(e2[0], e2[1])}Q${bow(e2, b2)} ${p(b2[0], b2[1])}Z`, fs(c.pal.top, c.pal.line, 2.4)) +
        path(`M${inw(b1)}L${inw(e1)}L${inw(e2)}L${inw(b2)}Z`, `fill="${c.pal.inner}"`);
    }
    return out;
  },
  markings(c) {
    const { cx, by, bw, bh, fx, ey } = c;
    let out = ell(cx, by - bh * 0.12, bw * 0.27, bh * 0.2, `fill="${c.pal.belly}"`);
    // A few faint freckles on each cheek.
    const dot = `fill="${c.pal.mark}" fill-opacity="0.55"`;
    for (const s of [-1, 1]) {
      const x = fx + s * bw * 0.35, y = ey + 4.5;
      out += circle(x - 2.6, y, 1, dot) + circle(x + 2.6, y, 1, dot) + circle(x, y - 2.4, 1, dot);
    }
    return out;
  },
  over(c) {
    // The snout: a big deeper-pink oval with two nostrils (they flare when grumpy).
    const { fx, ey, bw, bh } = c;
    const y = ey + bh * 0.165, rx = bw * 0.165, ry = bh * 0.12;
    const flare = c.mood === "angry" ? 1 + Math.abs(Math.sin(c.t * 7)) * 0.35 : 1;
    const nos = `fill="${c.pal.line}" fill-opacity="0.75"`;
    return (
      ell(fx, y, rx, ry, fs(c.pal.accent, c.pal.line, 2)) +
      ell(fx - rx * 0.3, y - ry * 0.5, rx * 0.36, ry * 0.2, `fill="#fff" fill-opacity="0.35"`) +
      ell(fx - rx * 0.36, y + 0.6, 1.7 * flare, 2.7 * flare, nos) +
      ell(fx + rx * 0.36, y + 0.6, 1.7 * flare, 2.7 * flare, nos)
    );
  },
  top(c) {
    // Folded ear tips, drawn in front so they flop over the head.
    let out = "";
    for (const side of [-1, 1]) {
      const { e1, e2, ft } = ear(c, side);
      // A rounded flap: straight sides into a soft tip.
      const k = 0.32;
      const a1 = p(ft[0] + (e1[0] - ft[0]) * k, ft[1] + (e1[1] - ft[1]) * k);
      const a2 = p(ft[0] + (e2[0] - ft[0]) * k, ft[1] + (e2[1] - ft[1]) * k);
      out += path(`M${p(e1[0], e1[1])}L${a1}Q${p(ft[0], ft[1])} ${a2}L${p(e2[0], e2[1])}Z`, fs(c.pal.arm, c.pal.line, 2.2));
    }
    return out;
  },
  anchors: (c) => ({
    head: { x: c.cx, y: c.top + 3, s: 0.92 },
    bow: { x: c.cx + c.bw * 0.3, y: c.top + 10, rot: 16 },
    neck: { y: c.by - c.bh * 0.2, w: c.bw, sag: c.bh * 0.08 },
    band: { y: c.top + c.bh * 0.24, arch: c.bh * 0.16 },
  }),
};
