// Axolotl: pink, wide-headed, three feathery gills per side that wiggle, a fin tail, tiny limbs. Floats.
import { moodTable, type SpeciesDef } from "../kit";
import { makeBase } from "../palette";
import { blob } from "../shapes";
import { circle, ell, path, r } from "../svg";

const FROND = "M0 -3C5 -6.5 11 -7.5 17.5 -4.6C20 -3 20 1 17.5 2.4C11 5 5 4.5 0 3Z";
const FRINGE = "M5 -5.2l0.6 -3.2M9.5 -6.2l0.4 -3.3M14 -5.8l0.3 -3";
const ANGLES = [-40, -12, 16];
const DROOP = moodTable(-4, 0, 10, -6, 18);
const TAIL_D = "M0 -9C-12 -14 -25 -15 -33 -7C-36 -3 -32 2 -25 2.5C-17 3 -9 6 0 9Z";

export const axolotl: SpeciesDef = {
  info: {
    id: "axolotl",
    name: { en: "Axolotl", vi: "Kỳ giông" },
    emoji: "🦎",
    gait: "float",
    sound: { en: "blub blub", vi: "lúp búp" },
  },
  base: makeBase({ top: "#FFD6E5", bottom: "#F59BC1", belly: "#FFEAF2", mark: "#E8679D", accent: "#C93A75", inner: "#FFC7DD" }),
  w: 84,
  h: 60,
  face: { eyeY: 0.46, eyeDX: 0.27, eyeScale: 0.85, mouth: "wide", mouthW: 1.25, mouthY: 0.18, cheekDX: 0.34 },
  feet: { w: 11, h: 7, dx: 0.2 },
  arms: { scale: 0.7 },
  reach: [22, 14],
  headroom: () => 9,
  body: (c) => blob(c, { tw: 0.44, sh: 0.24, wy: 0.42, bw2: 0.38 }),
  back(c) {
    const { cx, top, by, bw, bh, t } = c;
    const speed = c.mood === "angry" ? 9 : c.mood === "sleeping" ? 1.2 : 3.2;
    const amp = (c.mood === "sleeping" ? 3 : 9) * c.motion;
    const droop = c.mv(DROOP);
    const tailA = Math.sin(t * 2.5) * 7 * c.motion;
    let out =
      `<g transform="translate(${r(cx - bw * 0.3)} ${r(by - bh * 0.25)}) rotate(${r(tailA)})">` +
      path(TAIL_D, `fill="${c.pal.inner}" stroke="${c.pal.line}" stroke-width="2.2"`) +
      path("M-4 -2C-12 -4 -20 -5 -28 -3", `fill="none" stroke="${c.pal.mark}" stroke-width="1.4" stroke-opacity="0.6"`) +
      `</g>`;
    for (const side of [-1, 1]) {
      for (let i = 0; i < 3; i++) {
        const a = ANGLES[i] + droop + Math.sin(t * speed + i * 1.3 + side) * amp;
        out +=
          `<g transform="translate(${r(cx + side * bw * 0.4)} ${r(top + bh * (0.17 + i * 0.15))}) scale(${side} 1) rotate(${r(a)})">` +
          path(FROND, `fill="${c.pal.mark}" stroke="${c.pal.line}" stroke-width="2"`) +
          path(FRINGE, `fill="none" stroke="${c.pal.accent}" stroke-width="1.7"`) +
          `</g>`;
      }
    }
    return out;
  },
  markings(c) {
    const { cx, top, by, bw, bh } = c;
    const dot = `fill="${c.pal.mark}" fill-opacity="0.45"`;
    return (
      ell(cx, by - bh * 0.08, bw * 0.3, bh * 0.25, `fill="${c.pal.belly}"`) +
      circle(cx - 10, top + 8, 1.6, dot) +
      circle(cx - 4.5, top + 5.5, 1.2, dot) +
      circle(cx + 7, top + 6.5, 1.6, dot) +
      circle(cx + 12.5, top + 10.5, 1.2, dot)
    );
  },
  anchors: (c) => ({
    head: { x: c.cx, y: c.top + 3, s: 1 },
    bow: { x: c.cx + c.bw * 0.27, y: c.top + 6 },
    neck: { y: c.by - c.bh * 0.38, w: c.bw, sag: c.bh * 0.12 },
    band: { y: c.top + c.bh * 0.3, arch: c.bh * 0.2 },
  }),
};
