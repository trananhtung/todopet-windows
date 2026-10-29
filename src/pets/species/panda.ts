// Panda: white body, round black ears, tilted eye patches (eyes ringed in white), black paws and legs.
import { moodTable, type SpeciesDef } from "../kit";
import { makeBase } from "../palette";
import { blob } from "../shapes";
import { circle, ell, fs } from "../svg";

const EAR_DROP = moodTable(0, 0, 3, 4.5, 2.5);

export const panda: SpeciesDef = {
  info: {
    id: "panda",
    name: { en: "Panda", vi: "Gấu trúc" },
    emoji: "🐼",
    gait: "waddle",
    sound: { en: "munch munch", vi: "nhóp nhép" },
  },
  base: makeBase({
    top: "#FFFFFF",
    bottom: "#E7E3DF",
    belly: "#FFFFFF",
    mark: "#36313C",
    accent: "#36313C",
    inner: "#5A5462",
    line: "#3A3540",
  }),
  w: 84,
  h: 68,
  face: { eyeY: 0.53, eyeDX: 0.2, eyeScale: 1, mouthY: 0.18, eyeHalo: "#FFFFFF" },
  feet: { color: "mark" },
  arms: { color: "mark" },
  reach: [9, 9],
  headroom: (c) => 10 - c.bh * 0.08 + 2,
  body: (c) => blob(c, { tw: 0.42 }),
  back(c) {
    const { cx, top, bw, bh } = c;
    const drop = c.mv(EAR_DROP);
    let out = "";
    for (const side of [-1, 1]) {
      const x = cx + side * bw * (0.34 + drop * 0.01), y = top + bh * 0.08 + drop;
      out += circle(x, y, 10.5, fs(c.pal.mark, c.pal.line, 2.4)) + circle(x - side * 1.2, y + 1.2, 5, `fill="${c.pal.inner}"`);
    }
    return out;
  },
  markings(c) {
    const { cx, by, bw, bh, fx, ey, ex } = c;
    const mark = `fill="${c.pal.mark}"`;
    let out = ell(cx, by + bh * 0.06, bw * 0.56, bh * 0.2, mark);
    for (const side of [-1, 1]) {
      const x = fx + side * ex * 1.1, y = ey + 2;
      out += ell(x, y, 9, 11.5, `${mark} transform="rotate(${-side * 32} ${Math.round(x * 10) / 10} ${Math.round(y * 10) / 10})"`);
    }
    return out;
  },
  front: (c) => ell(c.fx, c.my - 3.6, 3.9, 2.6, `fill="${c.pal.mark}"`),
  anchors: (c) => ({
    head: { x: c.cx, y: c.top + 3, s: 0.95 },
    bow: { x: c.cx + c.bw * 0.22, y: c.top + 5 },
    // Under the mouth, curving up toward the cheeks so it never covers the face.
    neck: { y: c.my + 1, w: c.bw, sag: c.bh * 0.28 },
    band: { y: c.top + c.bh * 0.28, arch: c.bh * 0.2 },
  }),
};
