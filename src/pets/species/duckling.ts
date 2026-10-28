// Duckling: round and yellow, flat orange bill, a three-feather tuft, little wings that flap when celebrating.
import type { SpeciesDef } from "../kit";
import { makeBase } from "../palette";
import { blob } from "../shapes";
import { ell, fs, p, path, r } from "../svg";

const FEATHERS: readonly [number, number][] = [[-30, 9.5], [0, 12.5], [28, 9]];

const feather = (L: number): string =>
  `M${p(-2.6, 1)}C${p(-3.6, -L * 0.6)} ${p(-1.2, -L)} ${p(1, -L)}C${p(0.4, -L * 0.6)} ${p(2.8, -L * 0.35)} ${p(2.6, 1)}Z`;
const FEATHER_D = FEATHERS.map(([, L]) => feather(L));

export const duckling: SpeciesDef = {
  info: {
    id: "duckling",
    name: { en: "Duckling", vi: "Vịt con" },
    emoji: "🐥",
    gait: "waddle",
    sound: { en: "quack", vi: "cạp cạp" },
  },
  base: makeBase({ top: "#FFF3AA", bottom: "#FFCD3C", belly: "#FFF9DC", mark: "#F2B320", accent: "#FF9E2C", inner: "#FF7A1A" }),
  w: 72,
  h: 64,
  face: { eyeY: 0.42, eyeDX: 0.19, mouth: "bill", mouthY: 0.17, mouthW: 0.95, cheekDX: 0.33, cheekDY: 4.4 },
  feet: { color: "accent", w: 17, h: 8, toes: true },
  arms: { style: "wing" },
  reach: [10, 10],
  headroom: () => 15,
  body: (c) => blob(c, { tw: 0.4, sh: 0.24 }),
  back(c) {
    const { cx, top, t } = c;
    const sway = Math.sin(t * 3) * 6 * c.motion;
    let out = "";
    for (let i = 0; i < 3; i++) {
      out += path(FEATHER_D[i], `${fs(c.pal.top, c.pal.line, 2)} transform="translate(${r(cx + (i - 1) * 2.2)} ${r(top + 4)}) rotate(${r(FEATHERS[i][0] + sway)})"`);
    }
    return out;
  },
  markings: (c) => ell(c.cx, c.by - c.bh * 0.14, c.bw * 0.28, c.bh * 0.24, `fill="${c.pal.belly}"`),
  anchors: (c) => ({
    head: { x: c.cx, y: c.top + 3, s: 0.92 },
    bow: { x: c.cx + c.bw * 0.28, y: c.top + 6 },
    neck: { y: c.my + c.bh * 0.17, w: c.bw, sag: c.bh * 0.1 },
    band: { y: c.top + c.bh * 0.26, arch: c.bh * 0.18 },
  }),
};
