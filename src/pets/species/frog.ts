// Frog: wide squat body, eyes on two bumps on top, ear-to-ear mouth, spotted back, webbed feet.
import type { SpeciesDef } from "../kit";
import { makeBase } from "../palette";
import { blob } from "../shapes";
import { circle, ell, fs } from "../svg";

const BUMP = 11.5;

export const frog: SpeciesDef = {
  info: {
    id: "frog",
    name: { en: "Frog", vi: "Ếch" },
    emoji: "🐸",
    gait: "hop",
    sound: { en: "ribbit", vi: "ộp ộp" },
  },
  base: makeBase({ top: "#AEE282", bottom: "#5FAF48", belly: "#F4F7CF", mark: "#3F8A33", accent: "#FF7A8A", inner: "#FFFFFF" }),
  w: 90,
  h: 56,
  face: { eyeY: -0.02, eyeDX: 0.25, eyeScale: 1.1, mouth: "wide", mouthW: 1.75, mouthY: 0.52, cheekDX: 0.34, cheekDY: 24 },
  feet: { w: 21, h: 9, dx: 0.3, toes: true },
  arms: { scale: 0.9 },
  highlight: [-0.2, 0.3, 0.1, 0.07],
  reach: [9, 9],
  headroom: (c) => BUMP - (c.ey - c.top) + 2,
  body: (c) => blob(c, { tw: 0.44, sh: 0.3, wy: 0.4, bw2: 0.4, bf: 0.05 }),
  back(c) {
    const a = fs(c.grad, c.pal.line, 2.6);
    return circle(c.fx - c.ex, c.ey, BUMP, a) + circle(c.fx + c.ex, c.ey, BUMP, a);
  },
  markings(c) {
    const { cx, top, by, bw, bh } = c;
    const spot = `fill="${c.pal.mark}" fill-opacity="0.55"`;
    return (
      ell(cx, by - bh * 0.1, bw * 0.32, bh * 0.3, `fill="${c.pal.belly}"`) +
      circle(cx - bw * 0.4, top + bh * 0.42, 3.9, spot) +
      circle(cx + bw * 0.4, top + bh * 0.42, 3.9, spot) +
      circle(cx - bw * 0.33, top + bh * 0.64, 2.6, spot) +
      circle(cx + bw * 0.33, top + bh * 0.64, 2.6, spot)
    );
  },
  // Cover the body outline where it crosses the eye bumps so they merge into the head.
  over: (c) =>
    circle(c.fx - c.ex, c.ey, BUMP - 1.3, `fill="${c.grad}"`) + circle(c.fx + c.ex, c.ey, BUMP - 1.3, `fill="${c.grad}"`),
  anchors: (c) => ({
    head: { x: c.fx, y: c.top + 4, s: 0.62 },
    bow: { x: c.fx + c.ex + 7, y: c.ey - 8, s: 0.85, rot: 20 },
    neck: { y: c.my + c.bh * 0.17, w: c.bw, sag: c.bh * 0.08 },
    band: { y: c.top + c.bh * 0.24, arch: c.bh * 0.1 },
    glasses: 1.15,
  }),
};
