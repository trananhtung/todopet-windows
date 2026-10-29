// Owlet: a fluffy brown ball with a pale figure-8 facial disc, huge eyes, feather ear tufts, orange beak and toes.
import { moodTable, type SpeciesDef } from "../kit";
import { makeBase } from "../palette";
import { blob } from "../shapes";
import { circle, ell, fs, p, path, r } from "../svg";

/** An ear tuft pointing up from its root: a short inner feather and a tall outer one (+x is outward). */
const TUFT = "M-6 3C-6.4 -2 -5.2 -7 -3 -10.5C-2 -8 -0.8 -7 0.4 -6.8C0.6 -10.5 2 -14.2 4.2 -17C5 -12 6.2 -6 6 3Z";
const TUFT_VEIN = "M2.2 0.5C2.5 -4.5 3 -9.5 3.9 -13.5";
/** Extra outward lean of the tufts in degrees: perky when happy, a cross V when grumpy, flat asleep. */
const TUFT_ANG = moodTable(-6, 0, 34, -24, 52, -4, -10);
const TUFT_LEN = moodTable(1.12, 1, 0.82, 1.05, 0.72);

export const owl: SpeciesDef = {
  info: {
    id: "owl",
    name: { en: "Owlet", vi: "Cú con" },
    emoji: "🦉",
    gait: "hop",
    sound: { en: "hoo hoo", vi: "cú cú" },
  },
  base: makeBase({
    top: "#DDB98F",
    bottom: "#9C7149",
    belly: "#FFF3E0",
    mark: "#86603E",
    accent: "#FFA53A",
    inner: "#F2D6B0",
    line: "#5A3920",
  }),
  w: 80,
  h: 70,
  face: { eyeY: 0.44, eyeDX: 0.2, eyeScale: 1.24, mouth: "beak", mouthY: 0.13, mouthW: 0.9, cheekDX: 0.36, cheekDY: 8.5 },
  feet: { color: "accent", w: 13, h: 7.5, dx: 0.2, toes: true },
  arms: { style: "wing", color: "arm" },
  highlight: [-0.24, 0.12, 0.09, 0.05],
  reach: [10, 10],
  headroom: (c) => 17.5 * c.mv(TUFT_LEN) * Math.cos((Math.max(0, 18 + c.mv(TUFT_ANG)) * Math.PI) / 180) - c.bh * 0.11 + 3,
  body: (c) => blob(c, { tw: 0.46, sh: 0.2, wy: 0.4, bw2: 0.4 }),
  back(c) {
    const { cx, top, bw, bh, t } = c;
    const ang = 18 + c.mv(TUFT_ANG) + (c.mood === "happy" ? Math.sin(t * 5) * 4 * c.motion : 0);
    const len = c.mv(TUFT_LEN);
    let out = "";
    for (const side of [-1, 1]) {
      out +=
        `<g transform="translate(${r(cx + side * bw * 0.3)} ${r(top + bh * 0.11)}) scale(${side} 1) rotate(${r(ang)}) scale(1 ${r(len * 100) / 100})">` +
        path(TUFT, fs(c.pal.arm, c.pal.line, 2.2)) +
        path(TUFT_VEIN, `fill="none" stroke="${c.pal.mark}" stroke-width="1.3" stroke-opacity="0.7"`) +
        `</g>`;
    }
    return out;
  },
  markings(c) {
    const { cx, by, bw, bh, fx, ey, ex } = c;
    const belly = `fill="${c.pal.belly}"`;
    // Pale chest with little scalloped feathers.
    const chestY = by - bh * 0.17;
    let out = ell(cx + (fx - cx) * 0.4, chestY, bw * 0.29, bh * 0.25, belly);
    let d = "";
    const rows: readonly [number, number][] = [[-6, -2.5], [6, -2.5], [-11.5, 4.5], [0, 4], [11.5, 4.5], [-6, 10.5], [6, 10.5]];
    for (const [dx, dy] of rows) {
      const x = cx + (fx - cx) * 0.4 + dx, y = chestY + dy;
      d += `M${p(x - 2.6, y)}Q${p(x, y + 2.8)} ${p(x + 2.6, y)}`;
    }
    out += path(d, `fill="none" stroke="${c.pal.mark}" stroke-width="1.5" stroke-opacity="0.75"`);
    // Facial disc: two pale circles behind the eyes that meet in a figure 8.
    const R = ex + 1.6;
    const rim = fs(c.pal.belly, c.pal.mark, 1.6);
    out += circle(fx - ex, ey, R, rim) + circle(fx + ex, ey, R, rim);
    out += circle(fx - ex, ey, R - 0.8, belly) + circle(fx + ex, ey, R - 0.8, belly);
    return out;
  },
  top(c) {
    // Asleep, the wings fold snugly against the body.
    if (c.mood !== "sleeping" || c.held) return "";
    const { cx, by, bw, bh } = c;
    let out = "";
    for (const side of [-1, 1]) {
      const x = cx + side * bw * 0.45, y = by - bh * 0.36;
      out += ell(x, y, 6.6, 13, `${fs(c.pal.arm, c.pal.line, 2.2)} transform="rotate(${side * -12} ${r(x)} ${r(y)})"`);
    }
    return out;
  },
  anchors: (c) => ({
    head: { x: c.cx, y: c.top + 3.5, s: 0.84 },
    bow: { x: c.cx + c.bw * 0.27, y: c.top + 9, rot: 20 },
    neck: { y: c.by - c.bh * 0.34, w: c.bw, sag: c.bh * 0.1 },
    band: { y: c.top + c.bh * 0.2, arch: c.bh * 0.12 },
    glasses: 1.15,
  }),
};
