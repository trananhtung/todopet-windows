// Bee: a round bumblebee with brown stripes, fluttering glassy wings, bobbing antennae, tiny stinger.
import type { Mood } from "../../core/types";
import { moodTable, type Ctx, type SpeciesDef } from "../kit";
import { makeBase } from "../palette";
import { blob } from "../shapes";
import { circle, fs, p, path, r } from "../svg";

/** A wing pointing up from its root (rounded teardrop) and its vein. */
const WING = "M0 2C-7.5 -3 -10 -16 -5 -23.5C-0.5 -30 10.5 -28.5 11.5 -19C12.5 -9.5 6 -2 0 2Z";
const VEIN = "M0.5 -1C1 -8 2 -14 3.5 -21";
/** Antenna droop in degrees: perky when happy, sagging when annoyed or asleep. */
const ANT = moodTable(-8, 0, 34, -14, 58, 4, -12);
/** Wing beat (rad/s) and swing (deg) per mood. */
const BEAT: Readonly<Record<Mood, readonly [number, number]>> = {
  happy: [30, 18],
  celebrating: [38, 22],
  normal: [17, 12],
  focus: [15, 9],
  annoyed: [9, 8],
  angry: [34, 14],
  sleeping: [2, 4],
};

/** Bands wrap around the round body, so they bow down in the middle. */
const BOW = 5.5;
const stripe = (c: Ctx, f: number): string => {
  const { cx, by, bw, bh } = c;
  const y = by - bh * f;
  return `M${p(cx - bw * 0.6, y - BOW)}Q${p(cx, y + BOW)} ${p(cx + bw * 0.6, y - BOW)}`;
};

export const bee: SpeciesDef = {
  info: {
    id: "bee",
    name: { en: "Bee", vi: "Ong nhỏ" },
    emoji: "🐝",
    gait: "float",
    sound: { en: "bzz bzz", vi: "vo ve" },
    unlock: { kind: "tasks", value: 20, label: { en: "Finish 20 tasks", vi: "Xong 20 việc" } },
  },
  base: makeBase({
    top: "#FFE57A",
    bottom: "#F7B52C",
    belly: "#FFF2B8",
    mark: "#553621",
    accent: "#553621",
    inner: "#D9F0FF",
    line: "#5A3814",
  }),
  w: 78,
  h: 70,
  face: { eyeY: 0.39, eyeDX: 0.2, mouthY: 0.17, mouthW: 0.75, cheekDX: 0.33, cheekDY: 6 },
  feet: { w: 11, h: 7, dx: 0.2, color: "mark" },
  arms: { scale: 0.72 },
  reach: [11, 9],
  headroom: () => 16,
  body: (c) => blob(c, { tw: 0.36, sh: 0.28, wy: 0.48, bw2: 0.32, bf: 0.16 }),
  back(c) {
    const { cx, top, by, bw, bh, t } = c;
    const asleep = c.mood === "sleeping";
    const [speed, amp] = BEAT[c.mood];
    // Flutter fades to nearly still while the user is typing (motion² keeps it subtle).
    const flap = Math.sin(t * speed) * amp * c.motion * c.motion;
    const wingAng = (asleep ? 64 : 36) + flap;
    const wing = `fill="${c.pal.inner}" fill-opacity="0.8" stroke="${c.pal.line}" stroke-opacity="0.6" stroke-width="2"`;
    const vein = `fill="none" stroke="#fff" stroke-width="1.6" stroke-opacity="0.8"`;
    let out = "";
    for (const side of [-1, 1]) {
      out +=
        `<g transform="translate(${r(cx + side * bw * 0.22)} ${r(top + bh * 0.2)}) scale(${side} 1) rotate(${r(wingAng)})">` +
        path(WING, wing) +
        path(VEIN, vein) +
        `</g>`;
    }
    // Antennae with ball tips, bobbing.
    const droop = c.mv(ANT);
    for (const side of [-1, 1]) {
      const bob = Math.sin(t * 3.2 + side * 0.9) * 5 * c.motion;
      out +=
        `<g transform="translate(${r(cx + side * bw * 0.11)} ${r(top + 3)}) scale(${side} 1) rotate(${r(droop + bob)})">` +
        path("M0 0Q0.5 -8.5 7 -13", `fill="none" stroke="${c.pal.line}" stroke-width="2.2"`) +
        circle(7, -13, 3.4, fs(c.pal.accent, c.pal.line, 1.6)) +
        circle(6, -14.2, 1.1, `fill="#fff" fill-opacity="0.6"`) +
        `</g>`;
    }
    // Tiny stinger at the back.
    out += path(
      `M${p(cx - bw * 0.42, by - bh * 0.26)}L${p(cx - bw * 0.42 - 8, by - bh * 0.17)}L${p(cx - bw * 0.4, by - bh * 0.12)}Z`,
      fs(c.pal.mark, c.pal.line, 1.6),
    );
    return out;
  },
  markings(c) {
    const s = `fill="none" stroke="${c.pal.mark}" stroke-width="${r(c.bh * 0.11)}"`;
    return path(stripe(c, 0.23), s) + path(stripe(c, 0.04), s);
  },
  anchors: (c) => ({
    head: { x: c.cx, y: c.top + 3, s: 0.88 },
    bow: { x: c.cx + c.bw * 0.27, y: c.top + 8, rot: 16 },
    neck: { y: c.by - c.bh * 0.4, w: c.bw, sag: c.bh * 0.1 },
    band: { y: c.top + c.bh * 0.26, arch: c.bh * 0.16 },
  }),
};
