// Unicorn: white with a lilac blush, golden spiral horn, rainbow mane and tail, little hooves.
import type { SpeciesDef } from "../kit";
import { makeBase } from "../palette";
import { blob, triEar, tube } from "../shapes";
import { p, path, r, st } from "../svg";

const RAINBOW = ["#FF8FB8", "#FFC27A", "#FFE873", "#8FE3A8", "#8CCBFF", "#B9A2FF"];
const HORN = "M-5 0L-0.9 -21Q0 -23.2 0.9 -21L5 0Q0 2 -5 0Z";
const HORN_LINES = "M-3.9 -4L3.7 -6.6M-2.9 -9.2L2.8 -11.4M-1.9 -14.2L1.8 -15.9";

export const unicorn: SpeciesDef = {
  info: {
    id: "unicorn",
    name: { en: "Unicorn", vi: "Kỳ lân" },
    emoji: "🦄",
    gait: "hop",
    sound: { en: "neigh~", vi: "hí hí" },
    unlock: { kind: "tasks", value: 50, label: { en: "Finish 50 tasks", vi: "Xong 50 việc" } },
  },
  base: makeBase({ top: "#FFFFFF", bottom: "#EFE0FA", belly: "#FFFFFF", mark: "#C3ABEE", accent: "#FFD36B", inner: "#FFB6D1", line: "#5B4677" }),
  w: 76,
  h: 68,
  face: { eyeY: 0.54, eyeDX: 0.19, mouthY: 0.165 },
  feet: { color: "mark" },
  reach: [24, 10],
  headroom: () => 26,
  body: (c) => blob(c, { tw: 0.38 }),
  back(c) {
    const { cx, top, by, bw, bh, t } = c;
    const line = c.pal.line;
    const sway = Math.sin(t * 2.4) * 6 * c.motion;
    // Tail: three rainbow strands, outlined together so they read as one tail with stripes.
    const tail = [0, 1, 2].map((i) => `M0 ${i * 4}C-9 ${-7 + i * 4} -19 ${-3 + i * 5} -21 ${9 + i * 4.5}`);
    let out = `<g transform="translate(${r(cx - bw * 0.38)} ${r(by - bh * 0.26)}) rotate(${r(sway)})">`;
    for (const d of tail) out += path(d, st(line, 9));
    tail.forEach((d, i) => (out += path(d, st(RAINBOW[[0, 2, 4][i]], 4.6))));
    out += `</g>`;
    // Mane: five concentric bands down the back of the head, outlined as one shape.
    const mane: string[] = [];
    for (let i = 4; i >= 0; i--) {
      mane.push(
        `M${p(cx + 3 - i * 4.2, top + 0.5 + i * 0.6)}C${p(cx - bw * 0.3 - i * 4, top - 6 - i * 0.8)} ${p(cx - bw * 0.56 - i * 4.6, top + bh * 0.16)} ${p(cx - bw * 0.48 - i * 3.6, top + bh * 0.48 + i * 3.2)}`,
      );
    }
    for (const d of mane) out += path(d, st(line, 9.6));
    mane.forEach((d, i) => (out += path(d, st(RAINBOW[4 - i], 5.4))));
    for (const side of [-1, 1]) {
      out += triEar(c, [cx + side * bw * 0.12, top + bh * 0.08], [cx + side * bw * 0.3, top - bh * 0.2], [cx + side * bw * 0.36, top + bh * 0.2], c.pal.top, c.pal.inner);
    }
    return out;
  },
  markings: (c) =>
    `<ellipse cx="${r(c.cx)}" cy="${r(c.by - c.bh * 0.14)}" rx="${r(c.bw * 0.26)}" ry="${r(c.bh * 0.22)}" fill="${c.pal.belly}"/>`,
  top(c) {
    // Forelock: three short strands over the forehead, toward the front.
    const { cx, top, bw, bh } = c;
    let out = "";
    for (let i = 0; i < 3; i++) {
      const d = `M${p(cx - 2 + i * 3, top + 1)}Q${p(cx + bw * 0.12 + i * 3, top + bh * 0.04)} ${p(cx + bw * (0.12 + i * 0.06), top + bh * (0.2 + i * 0.03))}`;
      out += tube(d, 4.6, RAINBOW[[0, 2, 4][i]], c.pal.line);
    }
    return out;
  },
  last: (c) =>
    `<g transform="translate(${r(c.cx + c.bw * 0.05)} ${r(c.top + 3.5)}) rotate(9)">` +
    path(HORN, `fill="${c.pal.accent}" stroke="#B8862A" stroke-width="1.8"`) +
    path(HORN_LINES, `fill="none" stroke="#D9A43A" stroke-width="1.3"`) +
    `</g>`,
  anchors: (c) => ({
    head: { x: c.cx - c.bw * 0.16, y: c.top + 5, s: 0.82, rot: -14 },
    bow: { x: c.cx - c.bw * 0.3, y: c.top + 9, rot: -20 },
    // Under the mouth, curving up toward the cheeks so it never covers the face.
    neck: { y: c.my + 1, w: c.bw, sag: c.bh * 0.28 },
    band: { y: c.top + c.bh * 0.3, arch: c.bh * 0.22 },
  }),
};
