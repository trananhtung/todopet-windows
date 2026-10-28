// Penguin: a tall navy egg with a white heart-shaped face and belly, orange beak and feet, flippers.
import type { SpeciesDef } from "../kit";
import { makeBase } from "../palette";
import { blob } from "../shapes";
import { circle, ell } from "../svg";

export const penguin: SpeciesDef = {
  info: {
    id: "penguin",
    name: { en: "Penguin", vi: "Chim cánh cụt" },
    emoji: "🐧",
    gait: "waddle",
    sound: { en: "noot noot", vi: "noot noot" },
  },
  base: makeBase({
    top: "#5A6B93",
    bottom: "#2E3A58",
    belly: "#FFFFFF",
    mark: "#2E3A58",
    accent: "#FFAA3B",
    inner: "#FF8A1F",
    line: "#18203A",
  }),
  w: 70,
  h: 76,
  face: { eyeY: 0.4, eyeDX: 0.16, eyeScale: 0.95, mouth: "beak", mouthY: 0.14, cheekDX: 0.28, cheekDY: 4.4 },
  feet: { color: "accent", w: 16, h: 8, toes: true },
  arms: { style: "flipper", color: "mark" },
  highlight: [-0.2, 0.14, 0.1, 0.06],
  reach: [10, 10],
  headroom: () => 3,
  body: (c) => blob(c, { tw: 0.3, sh: 0.26, wy: 0.36, bw2: 0.4 }),
  markings(c) {
    const { cx, by, bw, bh, fx, ey } = c;
    const w = `fill="${c.pal.belly}"`;
    return (
      circle(fx - bw * 0.15, ey + 1, bw * 0.22, w) +
      circle(fx + bw * 0.15, ey + 1, bw * 0.22, w) +
      ell(cx + (fx - cx) * 0.5, by - bh * 0.3, bw * 0.37, bh * 0.4, w)
    );
  },
  anchors: (c) => ({
    head: { x: c.cx, y: c.top + 3, s: 0.88 },
    bow: { x: c.cx + c.bw * 0.24, y: c.top + 7 },
    neck: { y: c.ey + c.bh * 0.27, w: c.bw, sag: c.bh * 0.1 },
    band: { y: c.top + c.bh * 0.24, arch: c.bh * 0.17 },
  }),
};
