// Capybara: a chill brown loaf with a big blunt snout and tiny ears. Sleeps with a yuzu on its head.
import { moodTable, type SpeciesDef } from "../kit";
import { makeBase } from "../palette";
import { blob } from "../shapes";
import { circle, ell, fs, op, p, path, r } from "../svg";

const ASLEEP = moodTable(0, 0, 0, 0, 1);

export const capybara: SpeciesDef = {
  info: {
    id: "capybara",
    name: { en: "Capybara", vi: "Chuột lang nước" },
    emoji: "🦫",
    gait: "waddle",
    sound: { en: "chill~", vi: "chill~" },
  },
  base: makeBase({ top: "#D2AA80", bottom: "#A47850", belly: "#DCC29F", mark: "#7A5538", accent: "#FFC234", inner: "#8E6646" }),
  w: 92,
  h: 62,
  face: { eyeY: 0.34, eyeDX: 0.2, eyeScale: 0.85, mouthY: 0.34, mouthW: 0.75, cheekDX: 0.34, cheekDY: 7, relaxed: true },
  feet: { color: "mark", w: 18, h: 8 },
  arms: { scale: 0.9 },
  highlight: [-0.2, 0.14, 0.12, 0.06],
  reach: [9, 9],
  headroom: (c) => 6 + 13 * c.mv(ASLEEP),
  body: (c) => blob(c, { tw: 0.46, sh: 0.14, wy: 0.42, bw2: 0.42, bf: 0.03 }),
  back(c) {
    const { cx, top, bw } = c;
    let out = "";
    for (const side of [-1, 1]) {
      const x = cx + side * bw * 0.33, y = top + 2.4;
      out += ell(x, y, 4.8, 3.8, `${fs(c.grad, c.pal.line, 2.2)} transform="rotate(${side * 20} ${r(x)} ${r(y)})"`);
    }
    return out;
  },
  markings(c) {
    // A few fur strokes on the forehead.
    const { cx, top } = c;
    return path(
      `M${p(cx - 6, top + 4)}l1.5 4M${p(cx, top + 3)}l0 4.5M${p(cx + 6, top + 4)}l-1.5 4`,
      `fill="none" stroke="${c.pal.mark}" stroke-width="1.6" stroke-opacity="0.6"`,
    );
  },
  over(c) {
    const { fx, ey, bw, bh } = c;
    const sy = ey + bh * 0.24;
    return (
      ell(fx, sy, bw * 0.23, bh * 0.15, fs(c.pal.inner, c.pal.line, 1.8)) +
      ell(fx - bw * 0.07, sy - bh * 0.08, bw * 0.07, bh * 0.03, `fill="#fff" fill-opacity="0.2"`) +
      // Broad dark nose pad with two nostrils.
      ell(fx, sy - bh * 0.055, bw * 0.1, bh * 0.045, `fill="${c.pal.mark}"`) +
      ell(fx - 3.3, sy - bh * 0.05, 1.3, 1, `fill="${c.pal.line}"`) +
      ell(fx + 3.3, sy - bh * 0.05, 1.3, 1, `fill="${c.pal.line}"`)
    );
  },
  last(c) {
    const w = c.mv(ASLEEP);
    const hat = c.pose.wearing.some((a) => a === "tophat" || a === "crown" || a === "gradcap");
    if (w < 0.02 || hat) return "";
    const { cx, top } = c;
    const x = cx + 3, y = top - 6.5;
    return (
      `<g${op(w)}>` +
      circle(x, y, 9, fs(c.pal.accent, "#B97E00", 1.8)) +
      circle(x - 3, y - 3, 2.4, `fill="#fff" fill-opacity="0.55"`) +
      circle(x + 3.5, y + 2, 0.7, `fill="#C98A00"`) +
      circle(x - 1, y + 4, 0.7, `fill="#C98A00"`) +
      path(`M${p(x, y - 8.5)}l0.6 -3`, `fill="none" stroke="#5E7A2A" stroke-width="1.6"`) +
      ell(x + 4.5, y - 10.5, 4.4, 2.2, `${fs("#7CC04A", "#3E8E2A", 1)} transform="rotate(-25 ${r(x + 4.5)} ${r(y - 10.5)})"`) +
      `</g>`
    );
  },
  anchors: (c) => ({
    head: { x: c.cx, y: c.top + 3, s: 1 },
    bow: { x: c.cx + c.bw * 0.27, y: c.top + 5 },
    neck: { y: c.by - c.bh * 0.34, w: c.bw, sag: c.bh * 0.12 },
    band: { y: c.top + c.bh * 0.2, arch: c.bh * 0.12 },
  }),
};
