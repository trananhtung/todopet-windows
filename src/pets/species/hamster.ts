// Hamster: round and white with a ginger cap and white forehead blaze, tiny round ears,
// cheek pouches that puff up while eating, pink paws.
import type { SpeciesDef } from "../kit";
import { makeBase } from "../palette";
import { blob } from "../shapes";
import { circle, ell, fs, p, path, r } from "../svg";

export const hamster: SpeciesDef = {
  info: {
    id: "hamster",
    name: { en: "Hamster", vi: "Chuột hamster" },
    emoji: "🐹",
    gait: "scurry",
    sound: { en: "squeak", vi: "chít chít" },
  },
  base: makeBase({ top: "#FFFDF8", bottom: "#F1DEC8", belly: "#FFFFFF", mark: "#F4A05A", accent: "#FF8FA3", inner: "#FFC0CC", line: "#7A4A2A" }),
  w: 86,
  h: 66,
  face: { eyeY: 0.5, eyeDX: 0.17, eyeScale: 0.97, mouthY: 0.16, mouthW: 0.8, cheekDX: 0.3, cheekDY: 7 },
  feet: { w: 14, h: 8, color: "inner" },
  arms: { scale: 0.72 },
  reach: [12, 12],
  headroom: () => 9,
  body: (c) => blob(c, { tw: 0.44, sh: 0.26, wy: 0.4, bw2: 0.4 }),
  back(c) {
    const { cx, top, bw, bh } = c;
    let out = "";
    for (const side of [-1, 1]) {
      const x = cx + side * bw * 0.3, y = top + bh * 0.07;
      out += circle(x, y, 7.7, fs(c.pal.mark, c.pal.line, 2.4)) + circle(x, y + 0.8, 4.2, `fill="${c.pal.inner}"`);
    }
    return out;
  },
  markings(c) {
    const { cx, top, bw, bh, fx } = c;
    const cap = `fill="${c.pal.mark}"`;
    return (
      ell(cx, top + bh * 0.06, bw * 0.6, bh * 0.36, cap) +
      ell(cx - bw * 0.5, top + bh * 0.5, bw * 0.17, bh * 0.28, cap) +
      ell(cx + bw * 0.5, top + bh * 0.5, bw * 0.17, bh * 0.28, cap) +
      // White blaze down the forehead.
      ell(fx, top + bh * 0.16, 4.6, bh * 0.2, `fill="${c.pal.belly}"`)
    );
  },
  over(c) {
    // Cheek pouches: their outer edge becomes the silhouette when they puff.
    const puff = 1 + 0.42 * c.feed + (c.mood === "happy" ? 0.05 : 0);
    const rad = 10.5 * puff;
    let out = "";
    for (const side of [-1, 1]) {
      const x = c.fx + side * (c.bw * 0.31 + 3 * c.feed), y = c.ey + c.bh * 0.2;
      out += circle(x, y, rad, `fill="${c.pal.belly}"`);
      out += path(`M${p(x, y - rad)}A${r(rad)} ${r(rad)} 0 0 ${side > 0 ? 1 : 0} ${p(x, y + rad)}`, `fill="none" stroke="${c.pal.line}" stroke-width="2.4"`);
    }
    return out;
  },
  front: (c) => ell(c.fx, c.my - 3.6, 2.6, 1.9, `fill="${c.pal.accent}" stroke="${c.pal.line}" stroke-width="0.9"`),
  anchors: (c) => ({
    head: { x: c.cx, y: c.top + 3, s: 0.95 },
    bow: { x: c.cx + c.bw * 0.33, y: c.top + 9 },
    // Under the mouth, curving up toward the cheeks so it never covers the face.
    neck: { y: c.my + 1, w: c.bw, sag: c.bh * 0.28 },
    band: { y: c.top + c.bh * 0.28, arch: c.bh * 0.2 },
  }),
};
