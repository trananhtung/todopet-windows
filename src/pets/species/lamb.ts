// Lamb: a scalloped cloud of cream wool, a smooth pink-beige face under forehead curls, floppy ears, dark hooves.
import { moodTable, type Ctx, type SpeciesDef } from "../kit";
import { makeBase } from "../palette";
import { circle, ell, fs, p, path, r } from "../svg";

const BUMPS = 14;
const DEPTH = 4;
/** Ear droop in degrees below horizontal. */
const EAR = moodTable(6, 22, 50, 12, 62, 18, 0);
/** Little wool curls (fractions of the body box) on the fleece around the face. */
const CURLS: readonly [number, number, number][] = [
  [-0.36, 0.3, 1], [0.37, 0.34, -1], [-0.4, 0.72, 1], [0.41, 0.68, -1], [-0.16, 0.9, 1], [0.18, 0.9, -1],
];

// Unit superellipse directions for the scallop points, computed once.
const DIRS: readonly [number, number][] = Array.from({ length: BUMPS }, (_, i) => {
  const a = -Math.PI / 2 + ((i + 0.5) / BUMPS) * Math.PI * 2;
  const co = Math.cos(a), si = Math.sin(a);
  const k = 2 / 2.6;
  return [Math.sign(co) * Math.abs(co) ** k, Math.sign(si) * Math.abs(si) ** k];
});

/** The fleece: one closed path of outward bumps around a plump superellipse (also the clip path). */
function fleece(c: Ctx): string {
  const { cx, top, by, bw, bh } = c;
  const rx = bw / 2 - DEPTH, ry = bh / 2 - DEPTH, my = (top + by) / 2;
  let x0 = cx + DIRS[0][0] * rx, y0 = my + DIRS[0][1] * ry;
  let d = `M${p(x0, y0)}`;
  for (let i = 1; i <= BUMPS; i++) {
    const q = DIRS[i % BUMPS];
    const x = cx + q[0] * rx, y = my + q[1] * ry;
    const rad = Math.hypot(x - x0, y - y0) * 0.6;
    d += `A${r(rad)} ${r(rad)} 0 0 1 ${p(x, y)}`;
    x0 = x;
    y0 = y;
  }
  return d + "Z";
}

const faceBox = (c: Ctx): [number, number, number, number] => [c.fx, c.ey + c.bh * 0.08, c.bw * 0.29, c.bh * 0.33];

export const lamb: SpeciesDef = {
  info: {
    id: "lamb",
    name: { en: "Lamb", vi: "Cừu non" },
    emoji: "🐑",
    gait: "hop",
    sound: { en: "baa", vi: "be be" },
  },
  base: makeBase({
    top: "#FFFEF8",
    bottom: "#EDE0CA",
    belly: "#FBE3D5",
    mark: "#6E5142",
    accent: "#F28CA5",
    inner: "#FFB3C2",
    line: "#7A5B48",
  }),
  w: 86,
  h: 68,
  face: { eyeY: 0.48, eyeDX: 0.165, eyeScale: 0.95, mouthY: 0.2, mouthW: 0.75, cheekDX: 0.25, cheekDY: 6.5 },
  feet: { w: 14, h: 8.5, dx: 0.22, color: "mark" },
  arms: { scale: 0.82 },
  highlight: [-0.2, 0.16, 0.1, 0.06],
  reach: [12, 12],
  headroom: () => 3,
  body: fleece,
  markings(c) {
    const { cx, top, bw, bh } = c;
    let d = "";
    for (const [fx, fy, s] of CURLS) {
      const x = cx + bw * fx, y = top + bh * fy;
      d += `M${p(x - s * 2.6, y + 1.4)}A2.6 2.6 0 1 ${s > 0 ? 1 : 0} ${p(x + s * 1.2, y - 1.2)}`;
    }
    return path(d, `fill="none" stroke="${c.pal.line}" stroke-width="1.3" stroke-opacity="0.28"`);
  },
  over(c) {
    const [x, y, rx, ry] = faceBox(c);
    const droop = c.mv(EAR) + (c.mood === "happy" ? Math.sin(c.t * 6) * 5 * c.motion : 0);
    let out = "";
    // Floppy ears poke out sideways from under the forehead wool.
    for (const side of [-1, 1]) {
      const ax = x + side * (rx - 4), ay = y - ry * 0.42;
      out +=
        `<g transform="translate(${r(ax)} ${r(ay)}) scale(${side} 1) rotate(${r(droop)})">` +
        ell(11, 0, 11.5, 5.6, fs(c.pal.belly, c.pal.line, 2.2)) +
        ell(12, 0.4, 7.4, 3, `fill="${c.pal.inner}"`) +
        `</g>`;
    }
    out += ell(x, y, rx, ry, fs(c.pal.belly, c.pal.line, 2));
    // Forehead curls, overlapping the top of the face.
    const ty = y - ry + 1.5;
    const wool = fs(c.grad, c.pal.line, 1.9);
    out += circle(x - 8.5, ty + 2.2, 5.6, wool) + circle(x + 8.5, ty + 2.2, 5.6, wool) + circle(x, ty - 0.4, 6.6, wool);
    return out;
  },
  front: (c) =>
    path(
      `M${p(c.fx - 2.8, c.my - 5.2)}Q${p(c.fx, c.my - 6.6)} ${p(c.fx + 2.8, c.my - 5.2)}Q${p(c.fx + 1, c.my - 2.4)} ${p(c.fx, c.my - 2.2)}Q${p(c.fx - 1, c.my - 2.4)} ${p(c.fx - 2.8, c.my - 5.2)}Z`,
      `fill="${c.pal.accent}" stroke="${c.pal.line}" stroke-width="1"`,
    ),
  anchors: (c) => ({
    head: { x: c.cx, y: c.top + 3.5, s: 0.95 },
    bow: { x: c.cx + c.bw * 0.3, y: c.top + 9, rot: 16 },
    neck: { y: c.by - c.bh * 0.21, w: c.bw, sag: c.bh * 0.08 },
    band: { y: c.top + c.bh * 0.28, arch: c.bh * 0.16 },
  }),
};
