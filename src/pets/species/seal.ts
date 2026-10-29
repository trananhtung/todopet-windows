// Seal pup: a fluffy white harp-seal teardrop with huge glossy eyes, a puffy whisker muzzle and a fanned tail.
import { U, moodTable, type SpeciesDef } from "../kit";
import { makeBase } from "../palette";
import { blob, nose } from "../shapes";
import { circle, ell, fs, p, path, r, st } from "../svg";

/** A rear flipper pointing back (−x) from its root, with three rounded toes. */
const FLIPPER =
  "M0 -3.4C-5 -4.2 -11 -7.6 -16.4 -8.9C-19.6 -9.6 -21.4 -6.8 -19.8 -4.6C-21.6 -2.6 -21.4 0.4 -19.6 1.8" +
  "C-20.8 4.1 -19.2 6.7 -16.2 6.3C-11 5.3 -5 3.7 0 3.4Z";
const TOES = "M-17.8 -4.6L-11.5 -2.6M-17.6 1.6L-11.5 0.8";
/** Soft fluff on the crown: three little rounded puffs (only their tops show above the head). */
const TUFT = "M-8 4A3.6 3.6 0 0 1 -5.4 -1.6A3.8 3.8 0 0 1 0.6 -4.4A3.6 3.6 0 0 1 6.4 -0.6A3.2 3.2 0 0 1 8 4Z";
/** Whisker tilt in degrees: up when happy, droopy when annoyed or asleep. */
const WHISK = moodTable(-7, 0, 9, -3, 7);

export const seal: SpeciesDef = {
  info: {
    id: "seal",
    name: { en: "Seal pup", vi: "Hải cẩu con" },
    emoji: "🦭",
    gait: "waddle",
    sound: { en: "mwaa", vi: "oa oa" },
  },
  base: makeBase({
    top: "#FFFFFF",
    bottom: "#D3DFEC",
    belly: "#FFFFFF",
    mark: "#9FB2C8",
    accent: "#2A303D",
    inner: "#D5E1EE",
    line: "#4D6280",
  }),
  w: 80,
  h: 68,
  face: { eyeY: 0.47, eyeDX: 0.205, eyeScale: 1.45, mouthY: 0.22, mouthW: 0.7, cheekDX: 0.36, cheekDY: 7.5 },
  feet: { w: 13, h: 6.5, dx: 0.22, color: "inner" },
  arms: { style: "flipper", color: "inner", scale: 1.05 },
  highlight: [-0.19, 0.16, 0.11, 0.07],
  reach: [16, 9],
  headroom: () => 6,
  body: (c) => blob(c, { tw: 0.36, sh: 0.3, wy: 0.32, bw2: 0.44, bf: 0.05 }),
  back(c) {
    const { cx, top, by, bw, bh, t } = c;
    // The tail flippers fan out behind and wiggle with each waddle step (and a happy little paddle).
    const wig = c.pose.walking
      ? Math.sin(c.pose.walkPhase) * 14
      : Math.sin(t * (c.mood === "happy" ? 7 : 2.4)) * (c.mood === "happy" ? 10 : 4) * c.motion;
    const x = cx - bw * 0.34, y = by - bh * 0.1;
    const a = fs(c.pal.inner, c.pal.line, 2.2);
    const toes = `fill="none" stroke="${c.pal.line}" stroke-width="1.2" stroke-opacity="0.45"`;
    let out = "";
    for (const [ang, s] of [[-14 - wig * 0.6, 0.86], [20 + wig, 1]] as const) {
      out +=
        `<g transform="translate(${r(x)} ${r(y)}) rotate(${r(ang)}) scale(${s})">` +
        path(FLIPPER, a) +
        path(TOES, toes) +
        `</g>`;
    }
    out += path(TUFT, `${fs(c.grad, c.pal.line, 2.2)} transform="translate(${r(cx + 1)} ${r(top + 3.4)})"`);
    return out;
  },
  markings(c) {
    const { cx, by, bw, bh } = c;
    return ell(cx, by - bh * 0.17, bw * 0.31, bh * 0.25, `fill="${c.pal.belly}"`);
  },
  over(c) {
    // Puffy muzzle: two whisker pads, outlined only where they meet the fur.
    const { fx, my } = c;
    const y = my - 4.4, dx = 5.6, rx = 7, ry = 5.4;
    const fill = `fill="${c.pal.belly}"`;
    const rim = `${fs(c.pal.belly, c.pal.line, 1.5)} stroke-opacity="0.7"`;
    const dot = `fill="${c.pal.mark}"`;
    let out = ell(fx - dx, y, rx, ry, rim) + ell(fx + dx, y, rx, ry, rim);
    out += ell(fx - dx, y, rx - 0.75, ry - 0.75, fill) + ell(fx + dx, y, rx - 0.75, ry - 0.75, fill);
    for (const s of [-1, 1]) {
      out += circle(fx + s * (dx + 0.4), y - 1.2, 0.85, dot) + circle(fx + s * (dx + 3.4), y - 0.2, 0.85, dot) + circle(fx + s * (dx + 1.4), y + 2, 0.85, dot);
    }
    return out;
  },
  front(c) {
    const { fx, my, mood } = c;
    const y = my - 4.4;
    const tilt = c.mv(WHISK);
    let w = "";
    for (const s of [-1, 1]) {
      const x0 = fx + s * 11.6;
      for (const [dy, len, lift] of [[-1.8, 11, -3], [1.2, 12, 0.6]] as const) {
        w += `M${p(x0, y + dy)}L${p(x0 + s * len, y + dy + lift + tilt * (len / 10))}`;
      }
    }
    let out = path(w, `${st(c.pal.line, 1.1)} stroke-opacity="0.5"`) + nose(fx, my - 10, 6.2, 4.3, c.pal.accent, c.pal.accent);
    // Extra wet shine on the big round eyes.
    const blink = c.t % 4.3 < 0.13;
    if (!c.held && !blink && ((mood === "normal" && !c.petted) || mood === "focus")) {
      const s = U * (c.def.face.eyeScale ?? 1);
      const h = mood === "focus" ? 8 : 10;
      for (const side of [-1, 1]) {
        const ex = fx + side * c.ex + c.lookX * 1.3 * s;
        const ey = c.ey + c.lookY * 1.5 * s;
        out += circle(ex + 1.9 * s, ey + (h / 2 - 2.6) * s, 0.95 * s, `fill="#fff" fill-opacity="0.9"`);
      }
    }
    return out;
  },
  anchors: (c) => ({
    head: { x: c.cx, y: c.top + 3, s: 0.88 },
    bow: { x: c.cx + c.bw * 0.23, y: c.top + 7, rot: 14 },
    neck: { y: c.by - c.bh * 0.22, w: c.bw, sag: c.bh * 0.08 },
    band: { y: c.top + c.bh * 0.3, arch: c.bh * 0.2 },
    glasses: 1.15,
  }),
};
