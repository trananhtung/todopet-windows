// Bunny: long ears that perk up when happy and droop when annoyed, angry or asleep; cotton tail; buck teeth.
import { moodTable, type Ctx, type SpeciesDef } from "../kit";
import { makeBase } from "../palette";
import { blob } from "../shapes";
import { fs, p, path, r } from "../svg";

/** 1 = ears straight up, 0 = fully drooped to the sides. */
const EAR = moodTable(1, 0.86, 0.3, 0.2, 0.04, 0.9, 1);

const earAngle = (c: Ctx, side: number): number => {
  const lift = c.mv(EAR);
  const perk = c.mood === "happy" ? Math.sin(c.t * 4 + side) * 3 * c.motion : 0;
  // The right ear flops a little more: a bit of asymmetry reads as character.
  return side * (5 + (1 - lift) * 92 + (side > 0 ? 6 * (1 - lift * 0.6) : 0)) + perk;
};

const earLen = (c: Ctx): number => c.bh * 0.68;

/** A fluffy cotton tail: a circle with scalloped edges. */
function cotton(x: number, y: number, rad: number): string {
  let d = `M${p(x + rad, y)}`;
  for (let i = 1; i <= 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    d += `A${r(rad * 0.48)} ${r(rad * 0.48)} 0 0 1 ${p(x + Math.cos(a) * rad, y + Math.sin(a) * rad)}`;
  }
  return d + "Z";
}

export const bunny: SpeciesDef = {
  info: {
    id: "bunny",
    name: { en: "Bunny", vi: "Thỏ" },
    emoji: "🐰",
    gait: "hop",
    sound: { en: "boing!", vi: "tưng tưng" },
  },
  base: makeBase({ top: "#FFFFFF", bottom: "#E5D6D2", belly: "#FFFFFF", mark: "#D8C5C0", accent: "#FF9FB2", inner: "#FF8FA3", line: "#6B4E48" }),
  w: 74,
  h: 64,
  face: { eyeY: 0.5, eyeDX: 0.2, mouthY: 0.2, teeth: true },
  feet: { w: 21, h: 9, dx: 0.24 },
  reach: [20, 20],
  headroom(c) {
    const a = Math.min(Math.abs(earAngle(c, -1)), Math.abs(earAngle(c, 1)));
    return Math.max(0, earLen(c) * Math.cos((a * Math.PI) / 180) - c.bh * 0.14) + 4;
  },
  body: (c) => blob(c, { tw: 0.34, sh: 0.3, wy: 0.36, bw2: 0.4 }),
  back(c) {
    const { cx, top, by, bw, bh } = c;
    const L = earLen(c), ew = bw * 0.21;
    // Drooping ears also bend at the tip so they hang instead of sticking out sideways.
    const droop = 1 - c.mv(EAR);
    let out = path(cotton(cx - bw * 0.46, by - bh * 0.22, 8.4), fs(c.pal.belly, c.pal.line, 2.2));
    for (const side of [-1, 1]) {
      const b = side * droop * L * 0.42;
      const ear =
        `M${p(-ew * 0.42, 4)}C${p(-ew * 0.78 + b * 0.25, -L * 0.45)} ${p(-ew * 0.5 + b, -L)} ${p(b, -L)}` +
        `C${p(ew * 0.5 + b, -L)} ${p(ew * 0.78 + b * 0.25, -L * 0.45)} ${p(ew * 0.42, 4)}Z`;
      const inner =
        `M${p(-ew * 0.18, -3)}C${p(-ew * 0.42 + b * 0.2, -L * 0.45)} ${p(-ew * 0.26 + b * 0.85, -L * 0.86)} ${p(b * 0.85, -L * 0.86)}` +
        `C${p(ew * 0.26 + b * 0.85, -L * 0.86)} ${p(ew * 0.42 + b * 0.2, -L * 0.45)} ${p(ew * 0.18, -3)}Z`;
      out +=
        `<g transform="translate(${r(cx + side * bw * 0.16)} ${r(top + bh * 0.14)}) rotate(${r(earAngle(c, side))})">` +
        path(ear, fs(c.pal.top, c.pal.line, 2.4)) +
        path(inner, `fill="${c.pal.accent}"`) +
        `</g>`;
    }
    return out;
  },
  markings: (c) =>
    `<ellipse cx="${r(c.cx)}" cy="${r(c.by - c.bh * 0.16)}" rx="${r(c.bw * 0.27)}" ry="${r(c.bh * 0.24)}" fill="${c.pal.belly}"/>`,
  front: (c) =>
    path(
      `M${p(c.fx - 3, c.my - 4.8)}Q${p(c.fx, c.my - 6.4)} ${p(c.fx + 3, c.my - 4.8)}L${p(c.fx, c.my - 1.6)}Z`,
      `fill="${c.pal.inner}" stroke="${c.pal.line}" stroke-width="1"`,
    ),
  anchors: (c) => ({
    head: { x: c.cx, y: c.top + 3.5, s: 0.8 },
    bow: { x: c.cx + c.bw * 0.25, y: c.top + 6, rot: 18 },
    neck: { y: c.by - c.bh * 0.4, w: c.bw, sag: c.bh * 0.14 },
    band: { y: c.top + c.bh * 0.3, arch: c.bh * 0.22 },
  }),
};
