// Yaoyiyao: a chibi companion with short bangs, tiny pigtails and denim overalls.
// All artwork is procedural SVG; no reference photographs are bundled.
import type { Ctx, SpeciesDef } from "../kit";
import { makeBase } from "../palette";
import { ell, fs, p, path, r, st } from "../svg";

const HAIR = "#292728";
const HAIR_LIGHT = "#48403D";
const DENIM = "#779DB1";
const SEAM = "#486A82";
const CREAM = "#FFF8EC";

// Normalized coordinates keep the head, clothes and hair attached through squash/stretch.
const pt = (c: Ctx, x: number, y: number): string => p(c.cx + c.bw * x, c.top + c.bh * y);

export const yaoyiyao: SpeciesDef = {
  info: {
    id: "yaoyiyao",
    name: { en: "Yaoyiyao", vi: "Yaoyiyao" },
    emoji: "👧",
    gait: "waddle",
    sound: { en: "hehe~", vi: "hì hì~" },
  },
  base: makeBase({
    top: "#FDE5D2", bottom: "#EFC3AD", line: "#785A4E",
    belly: CREAM, mark: HAIR, accent: "#E9959E", inner: "#F2B49F",
    cheek: "#EC9B91", cheekA: 0.42,
  }),
  w: 78,
  h: 96,
  face: { eyeY: 0.36, eyeDX: 0.177, eyeScale: 0.86, eyeAspect: 0.72, mouthY: 0.16,
    mouth: "baby", mouthW: 0.94, cheekDX: 0.325, cheekDY: 9.5, shift: 0.035 },
  feet: { dx: 0.19, w: 15, h: 9, color: "belly", sole: "accent" },
  arms: {
    scale: 0.78,
    color: "belly",
    hand(c, x, y, angle, len) {
      // A small hand at the end of each cream sleeve, including raised/waving arms.
      return ell(x - Math.sin(angle) * len * 0.68, y + Math.cos(angle) * len * 0.68,
        3.3, 3.4, fs(c.pal.arm, c.pal.line, 1.2));
    },
  },
  highlight: null,
  reach: [15, 15],
  headroom: () => 3,
  body(c) {
    return `M${pt(c, 0, 0)}C${pt(c, -0.34, -0.015)} ${pt(c, -0.49, 0.09)} ${pt(c, -0.49, 0.28)}` +
      `C${pt(c, -0.57, 0.43)} ${pt(c, -0.55, 0.56)} ${pt(c, -0.27, 0.625)}` +
      `Q${pt(c, -0.44, 0.6)} ${pt(c, -0.46, 0.66)}L${pt(c, -0.42, 0.73)}L${pt(c, -0.3, 0.79)}L${pt(c, -0.3, 0.97)}` +
      `Q${pt(c, 0, 1.035)} ${pt(c, 0.3, 0.97)}L${pt(c, 0.3, 0.79)}L${pt(c, 0.42, 0.73)}L${pt(c, 0.46, 0.66)}` +
      `Q${pt(c, 0.44, 0.6)} ${pt(c, 0.27, 0.625)}C${pt(c, 0.55, 0.56)} ${pt(c, 0.57, 0.43)} ${pt(c, 0.49, 0.28)}` +
      `C${pt(c, 0.49, 0.09)} ${pt(c, 0.34, -0.015)} ${pt(c, 0, 0)}Z`;
  },
  back(c) {
    let out = "";
    for (const side of [-1, 1]) {
      const x = c.cx + side * c.bw * 0.47, y = c.top + c.bh * 0.3;
      const wag = Math.sin(c.t * (c.pose.walking ? 9 : 3.4) + side * 0.5) * (c.mood === "sleeping" ? 2 : 6) * c.motion;
      out += `<g transform="translate(${r(x)} ${r(y)}) rotate(${r(side * (12 + wag))}) scale(${side} 1)">` +
        path("M-1 0Q6 2 11 -2L14 -5L12 0L15 -1L12 3L13 5Q5 5 0 3Z", fs(HAIR, HAIR, 0.8)) +
        path("M4 2Q10 3 13 0M5 1L10 -1", st(HAIR_LIGHT, 0.7)) +
        ell(2, 2, 1.1, 2.5, 'fill="#705D4E"') + `</g>`;
      out += ell(c.cx + side * c.bw * 0.48, c.top + c.bh * 0.39, 3.7, 5.5, fs(c.pal.arm, c.pal.line, 1.1));
    }
    return out;
  },
  markings(c) {
    // Cream shirt and a curved neckline, then a bib, straps, pocket and two brass buttons.
    let out = path(`M${pt(c, -0.55, 0.6)}Q${pt(c, 0, 0.69)} ${pt(c, 0.55, 0.6)}L${pt(c, 0.55, 1.1)}L${pt(c, -0.55, 1.1)}Z`, `fill="${c.pal.belly}"`);
    out += path(`M${pt(c, -0.17, 0.618)}Q${pt(c, 0, 0.688)} ${pt(c, 0.17, 0.618)}`, st("#D7BAA7", 1.1));
    out += path(`M${pt(c, -0.255, 0.765)}Q${pt(c, 0, 0.8)} ${pt(c, 0.255, 0.765)}L${pt(c, 0.34, 1.02)}L${pt(c, -0.34, 1.02)}Z`, fs(DENIM, SEAM, 1.3));
    for (const side of [-1, 1]) {
      out += path(`M${pt(c, side * 0.26, 0.625)}L${pt(c, side * 0.2, 0.815)}`, st(DENIM, 6.4));
      out += path(`M${pt(c, side * 0.282, 0.63)}L${pt(c, side * 0.222, 0.8)}`, `${st("#A8C2D0", 0.9)} stroke-dasharray="1.5 2"`);
      out += ell(c.cx + side * c.bw * 0.204, c.top + c.bh * 0.798, 2.1, 2.1, fs("#EBCB85", SEAM, 0.7));
    }
    out += path(`M${pt(c, -0.105, 0.845)}L${pt(c, 0.105, 0.845)}L${pt(c, 0.09, 0.914)}Q${pt(c, 0, 0.955)} ${pt(c, -0.09, 0.914)}Z`, fs("#89ABBD", SEAM, 1));
    out += path(`M${pt(c, 0, 0.96)}L${pt(c, 0, 1.03)}`, st(SEAM, 1.2));
    return out;
  },
  over(c) {
    // Wispy, asymmetric bangs: curved locks taper separately instead of a zig-zag helmet edge.
    const hair = `M${pt(c, -0.485, 0.395)}C${pt(c, -0.54, 0.12)} ${pt(c, -0.32, -0.025)} ${pt(c, 0.015, 0)}` +
      `C${pt(c, 0.34, -0.01)} ${pt(c, 0.55, 0.11)} ${pt(c, 0.485, 0.4)}L${pt(c, 0.43, 0.35)}` +
      `Q${pt(c, 0.425, 0.21)} ${pt(c, 0.31, 0.14)}Q${pt(c, 0.34, 0.23)} ${pt(c, 0.315, 0.28)}` +
      `Q${pt(c, 0.27, 0.23)} ${pt(c, 0.24, 0.17)}Q${pt(c, 0.255, 0.235)} ${pt(c, 0.21, 0.268)}` +
      `Q${pt(c, 0.195, 0.22)} ${pt(c, 0.16, 0.17)}Q${pt(c, 0.17, 0.23)} ${pt(c, 0.13, 0.258)}` +
      `Q${pt(c, 0.11, 0.215)} ${pt(c, 0.09, 0.16)}Q${pt(c, 0.085, 0.25)} ${pt(c, 0.04, 0.28)}` +
      `Q${pt(c, 0.04, 0.22)} ${pt(c, 0.015, 0.17)}Q${pt(c, -0.02, 0.25)} ${pt(c, -0.055, 0.265)}` +
      `L${pt(c, -0.04, 0.17)}Q${pt(c, -0.08, 0.235)} ${pt(c, -0.13, 0.25)}` +
      `L${pt(c, -0.11, 0.17)}Q${pt(c, -0.18, 0.26)} ${pt(c, -0.22, 0.27)}` +
      `L${pt(c, -0.205, 0.18)}Q${pt(c, -0.27, 0.265)} ${pt(c, -0.32, 0.285)}` +
      `L${pt(c, -0.31, 0.185)}Q${pt(c, -0.4, 0.245)} ${pt(c, -0.42, 0.35)}Z`;
    let out = path(hair, fs(HAIR, HAIR, 0.7));
    // Fine strands follow the crown and are intentionally subtle at normal desktop size.
    for (const [start, end, depth] of [[-0.05, -0.42, 0.3], [-0.015, -0.3, 0.24], [0.03, -0.18, 0.22], [0.065, -0.04, 0.235], [0.09, 0.13, 0.22], [0.11, 0.28, 0.23], [0.13, 0.43, 0.3]]) {
      out += path(`M${pt(c, start, 0.035)}Q${pt(c, (start + end) * 0.65, 0.08)} ${pt(c, end, depth)}`, `${st(HAIR_LIGHT, 0.65)} stroke-opacity="0.7"`);
    }
    out += path(`M${pt(c, -0.13, 0.01)}Q${pt(c, -0.07, -0.025)} ${pt(c, 0.04, -0.008)}M${pt(c, 0.07, 0.008)}Q${pt(c, 0.15, -0.02)} ${pt(c, 0.2, 0.01)}`, st(HAIR, 0.7));
    for (const side of [-1, 1]) out += ell(c.cx + side * c.bw * 0.31, c.top + c.bh * 0.49, c.bw * 0.17, c.bh * 0.09, `fill="url(#${c.id}-k)" opacity="0.24"`);
    out += path(`M${pt(c, -0.27, 0.625)}Q${pt(c, 0, 0.706)} ${pt(c, 0.27, 0.625)}`, 'fill="none" stroke="#D1A58D" stroke-width="1"');
    return out;
  },
  front(c) {
    // Low, rounded nose and a faint lower edge. The face engine preserves acts and feeding.
    const ny = c.my - 6.2;
    let out = ell(c.fx, ny - 1, 4.4, 3.1, `fill="${c.pal.inner}" fill-opacity="0.5"`) +
      path(`M${p(c.fx - 4, ny)}Q${p(c.fx - 3.6, ny + 1.8)} ${p(c.fx - 1.8, ny + 1.1)}Q${p(c.fx, ny + 2.3)} ${p(c.fx + 1.8, ny + 1.1)}Q${p(c.fx + 3.6, ny + 1.8)} ${p(c.fx + 4, ny)}`, 'fill="none" stroke="#B88672" stroke-width="0.8"');
    if (!c.held && !c.act && c.mood === "normal" && !c.petted) {
      for (const side of [-1, 1]) {
        const x = c.fx + side * c.ex;
        out += path(`M${p(x - 4.7, c.ey - 6)}Q${p(x, c.ey - 7.4)} ${p(x + 4.5, c.ey - 5.8)}`, 'fill="none" stroke="#7E6556" stroke-opacity="0.45" stroke-width="0.8"');
      }
    }
    if (c.mood === "happy" || c.mood === "celebrating") {
      for (const side of [-1, 1]) out += path(`M${p(c.fx + side * 7, ny + 1)}Q${p(c.fx + side * 11, c.my - 1)} ${p(c.fx + side * 10.5, c.my + 3)}`, 'fill="none" stroke="#C58E7D" stroke-opacity="0.55" stroke-width="0.8"');
    }
    return out;
  },
  anchors: (c) => ({
    head: { x: c.cx, y: c.top + 2, s: 0.88 },
    bow: { x: c.cx + c.bw * 0.35, y: c.top + c.bh * 0.16, s: 0.7 },
    neck: { y: c.top + c.bh * 0.63, w: c.bw * 0.67, sag: c.bh * 0.07 },
    band: { y: c.top + c.bh * 0.28, arch: c.bh * 0.11 },
    glasses: 0.9,
  }),
};
