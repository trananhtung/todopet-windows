// Shiba: orange coat with cream "urajiro" cheeks and chest, maro eyebrow dots, perky ears, curled tail.
import { moodTable, type SpeciesDef } from "../kit";
import { makeBase } from "../palette";
import { blob, nose, triEar, tube } from "../shapes";
import { ell, path, r, st } from "../svg";

const EAR = moodTable(1, 0.95, 0.55, 0.4, 0.55);
const TAIL_D = "M0 0C-13 -1 -21 -12 -16 -21C-11 -29 0 -26 -2.5 -17.5";
const TAIL_IN = "M-14.5 -9C-17 -15 -14 -21 -9.5 -22.5";

export const shiba: SpeciesDef = {
  info: {
    id: "shiba",
    name: { en: "Shiba", vi: "Shiba" },
    emoji: "🐕",
    gait: "bounce",
    sound: { en: "woof", vi: "gâu gâu" },
  },
  base: makeBase({ top: "#F9BE7F", bottom: "#E5883F", belly: "#FFF7EA", mark: "#C9692A", accent: "#2B1B14", inner: "#FFE6CC" }),
  w: 80,
  h: 68,
  face: { eyeY: 0.52, eyeDX: 0.19, mouthY: 0.18 },
  reach: [20, 9],
  headroom: (c) => c.bh * 0.26 * c.mv(EAR) + 3,
  body: (c) => blob(c),
  back(c) {
    const { cx, top, by, bw, bh, t } = c;
    const happy = c.mood === "happy" || c.mood === "celebrating";
    const wag = Math.sin(t * (happy ? 13 : 3)) * (happy ? 9 : 3) * c.motion;
    const droop = c.mv(moodTable(0, 0, -14, -6, -20));
    let out =
      `<g transform="translate(${r(cx - bw * 0.38)} ${r(by - bh * 0.42)}) rotate(${r(wag + droop)})">` +
      tube(TAIL_D, 10, c.pal.top, c.pal.line) +
      path(TAIL_IN, st(c.pal.belly, 3.6)) +
      `</g>`;
    const lift = c.mv(EAR);
    for (const side of [-1, 1]) {
      out += triEar(
        c,
        [cx + side * bw * 0.1, top + bh * 0.1],
        [cx + side * bw * (0.33 + (1 - lift) * 0.28), top - bh * 0.26 * lift + (1 - lift) * 8],
        [cx + side * bw * 0.43, top + bh * 0.34],
        c.pal.top,
        c.pal.inner,
        0.48,
      );
    }
    return out;
  },
  markings(c) {
    const { cx, by, bw, bh, fx, my, ey, ex } = c;
    const belly = `fill="${c.pal.belly}"`;
    return (
      ell(fx - bw * 0.19, my - 1, bw * 0.21, bh * 0.16, belly) +
      ell(fx + bw * 0.19, my - 1, bw * 0.21, bh * 0.16, belly) +
      ell(cx, by - bh * 0.06, bw * 0.3, bh * 0.24, belly) +
      // Maro: the little cream eyebrow dots.
      ell(fx - ex * 1.02, ey - 9.4, 3.8, 2.5, belly) +
      ell(fx + ex * 1.02, ey - 9.4, 3.8, 2.5, belly)
    );
  },
  front: (c) => nose(c.fx, c.my - 4.2, 7.4, 4.8, c.pal.accent, c.pal.line),
  anchors: (c) => ({
    head: { x: c.cx, y: c.top + 3, s: 0.95 },
    bow: { x: c.cx + c.bw * 0.29, y: c.top + 7 },
    // Under the mouth, curving up toward the cheeks so it never covers the face.
    neck: { y: c.my + 1, w: c.bw, sag: c.bh * 0.28 },
    band: { y: c.top + c.bh * 0.28, arch: c.bh * 0.2 },
  }),
};
