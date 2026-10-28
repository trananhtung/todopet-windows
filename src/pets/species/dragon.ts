// Baby dragon: jade green, cream horns and belly plates, little flapping wings, a spiky tail, smoke when grumpy.
import { moodTable, type SpeciesDef } from "../kit";
import { makeBase } from "../palette";
import { blob, tube } from "../shapes";
import { circle, ell, frac, fs, op, p, path, r } from "../svg";

// A bat wing pointing up and out: leading bone along the top, scalloped trailing edge.
const WING = "M-2 2C2 -10 9 -19 20 -24C19 -18 21 -14 25 -11C20 -10 17.5 -7 17 -3C13 -5 9 -3.5 7 0.5C5 -1 2 -0.5 -2 2Z";
const WING_BONE = "M0 0L19 -22M17 -3L21 -15M7 0.5L19.5 -18";
const HORN = "M-4.4 2.5C-4.2 -6.5 -1.6 -13.5 4 -17.5C2.6 -10.5 3.4 -4 4.4 2.5Z";
const TAIL_D = "M0 0C-13 4 -26 1 -31 -11";
const SPIKES = "M-9 1.5L-12 -4.5L-14.5 2.5ZM-18.5 0L-23.5 -5L-24.5 2ZM-26 -4L-32 -6.5L-30 -0.5Z";
const TIP = "M-31 -11L-38.5 -10L-34.5 -17.5L-29 -21L-28.5 -13.5Z";
const ANGRY = moodTable(0, 0, 0, 1, 0);

export const dragon: SpeciesDef = {
  info: {
    id: "dragon",
    name: { en: "Dragon", vi: "Rồng con" },
    emoji: "🐲",
    gait: "float",
    sound: { en: "rawr!", vi: "grào!" },
    unlock: { kind: "streak", value: 7, label: { en: "Hit your goal 7 days in a row", vi: "Đạt mục tiêu 7 ngày liền" } },
  },
  base: makeBase({ top: "#A0E6C4", bottom: "#3DAD86", belly: "#FFF1C6", mark: "#2C8C6A", accent: "#FFE3A3", inner: "#FFB48A" }),
  w: 80,
  h: 66,
  face: { eyeY: 0.47, eyeDX: 0.19, mouthY: 0.21 },
  feet: { w: 15, h: 8.5 },
  arms: { scale: 0.92 },
  reach: [32, 26],
  headroom: () => 17,
  body: (c) => blob(c),
  back(c) {
    const { cx, top, by, bw, bh, t } = c;
    const asleep = c.mood === "sleeping";
    // Wings point outward from the shoulders and beat (folded down while asleep).
    const flap = asleep ? 34 : 14 + Math.sin(t * (c.pose.walking ? 10 : 6)) * 16 * c.motion;
    const sway = Math.sin(t * 2) * 5 * c.motion;
    let out =
      `<g transform="translate(${r(cx - bw * 0.33)} ${r(by - bh * 0.16)}) rotate(${r(sway)})">` +
      path(SPIKES, fs(c.pal.mark, c.pal.line, 1.6)) +
      tube(TAIL_D, 9, c.pal.bottom, c.pal.line) +
      path(TIP, fs(c.pal.mark, c.pal.line, 2)) +
      `</g>`;
    for (const side of [-1, 1]) {
      out +=
        `<g transform="translate(${r(cx + side * bw * 0.33)} ${r(top + bh * 0.48)}) scale(${side * 1.12} 1.12) rotate(${r(flap)})">` +
        path(WING, fs(c.pal.inner, c.pal.line, 2)) +
        path(WING_BONE, `fill="none" stroke="${c.pal.line}" stroke-width="1.3" stroke-opacity="0.6"`) +
        `</g>`;
      out += path(HORN, `${fs(c.pal.accent, c.pal.line, 2)} transform="translate(${r(cx + side * bw * 0.2)} ${r(top + 5.5)}) scale(${side} 1)"`);
    }
    return out;
  },
  markings(c) {
    const { cx, by, bw, bh } = c;
    const y = by - bh * 0.2;
    return (
      ell(cx, y, bw * 0.27, bh * 0.27, `fill="${c.pal.belly}"`) +
      path(`M${p(cx - bw * 0.2, y - 3)}Q${p(cx, y + 1)} ${p(cx + bw * 0.2, y - 3)}M${p(cx - bw * 0.2, y + 6)}Q${p(cx, y + 10)} ${p(cx + bw * 0.2, y + 6)}`, `fill="none" stroke="${c.pal.mark}" stroke-width="1.4" stroke-opacity="0.4"`)
    );
  },
  front(c) {
    const { fx, my, mood } = c;
    const n = `fill="${c.pal.line}"`;
    let out = circle(fx - 3.3, my - 4.6, 1.1, n) + circle(fx + 3.3, my - 4.6, 1.1, n);
    if (!c.held && (mood === "normal" || mood === "focus") && !c.petted) {
      out += path(`M${p(fx + 2.6, my + 1.4)}L${p(fx + 5.4, my + 1.1)}L${p(fx + 4.1, my + 4.4)}Z`, `fill="#fff" stroke="${c.pal.line}" stroke-width="1"`);
    }
    return out;
  },
  last(c) {
    const w = c.mv(ANGRY);
    if (w < 0.05) return "";
    let out = "";
    for (let i = 0; i < 3; i++) {
      const ph = frac(c.t * 1.3 + i / 3);
      out += circle(c.fx + 7 + ph * 24, c.my - 5 - ph * 4 - ph * ph * 14, 2.2 + ph * 4.4, `fill="#E4E1DE" stroke="#8C8885" stroke-width="1"${op(w * (1 - ph) * 0.95)}`);
    }
    return out;
  },
  anchors: (c) => ({
    head: { x: c.cx, y: c.top + 3, s: 0.82 },
    bow: { x: c.cx + c.bw * 0.31, y: c.top + 9 },
    neck: { y: c.by - c.bh * 0.4, w: c.bw, sag: c.bh * 0.14 },
    band: { y: c.top + c.bh * 0.3, arch: c.bh * 0.22 },
  }),
};
