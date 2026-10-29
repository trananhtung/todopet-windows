// Sea otter: round brown floater with a pale head, tiny low ears, a big dark nose, dotted whisker pads,
// and a pink scallop shell hugged to its chest (tapped when happy, raised like a trophy when celebrating).
import { moodTable, type Ctx, type SpeciesDef } from "../kit";
import { makeBase } from "../palette";
import { blob, nose } from "../shapes";
import { circle, ell, fs, p, path, r, st } from "../svg";

const SHELL_D = "M0 7L-9.6 -0.8Q-11 -5.2 -7.2 -6.6Q-5.6 -9.4 -2.5 -8.4Q0 -10.4 2.5 -8.4Q5.6 -9.4 7.2 -6.6Q11 -5.2 9.6 -0.8Z";
const SHELL_HINGE = "M-3.6 4.4L-5.6 8.4Q0 9.6 5.6 8.4L3.6 4.4Z";
const SHELL_RIDGES = "M0 5.5L-6.6 -4.4M0 5.5L-2.4 -7M0 5.5L2.4 -7M0 5.5L6.6 -4.4";
const TAIL_D = "M0 -3.5C-6 -5 -15 -4.5 -19 -1C-21 1 -19 3.5 -16 3.6C-10 3.8 -5 4 0 3.5Z";
const SLEEPY = moodTable(0, 0, 0, 0, 1);
// Shell pose per mood: tapping (happy), a gentle idle bob, a shake (angry), sinking, tilt and paw spread.
const TAP = moodTable(1, 0, 0, 0, 0, 0);
const IDLE = moodTable(0, 1, 0, 0, 0, 1);
const SHAKE = moodTable(0, 0, 0, 1, 0);
const SINK = moodTable(0, 0, 0, 0, 2);
const TILT = moodTable(0, 0, -12, 0, 12);
const SPREAD = moodTable(0, 0, -2, -2.5, 1);

/** The pink scallop shell around (0, 0), hinge down. */
function shell(c: Ctx): string {
  return (
    path(SHELL_HINGE, fs(c.pal.accent, c.pal.line, 1.6)) +
    path(SHELL_D, fs(c.pal.accent, c.pal.line, 1.8)) +
    path(SHELL_RIDGES, `${st(c.pal.inner, 1.5)} stroke-opacity="0.9"`) +
    ell(-4.2, -5.2, 2.2, 1.2, `fill="#fff" fill-opacity="0.6" transform="rotate(-30 -4.2 -5.2)"`)
  );
}

/** A little paw (same size and style as the shared nub arms). */
const paw = (c: Ctx, x: number, y: number, deg: number): string =>
  ell(x, y, 5, 6.4, `${fs(c.pal.arm, c.pal.line, 2.2)} transform="rotate(${r(deg)} ${r(x)} ${r(y)})"`);

export const otter: SpeciesDef = {
  info: {
    id: "otter",
    name: { en: "Sea otter", vi: "Rái cá" },
    emoji: "🦦",
    gait: "float",
    sound: { en: "squeak", vi: "chiu chiu" },
  },
  base: makeBase({ top: "#B4835F", bottom: "#7C5036", belly: "#F6EBDC", mark: "#3B2820", accent: "#FF9DB6", inner: "#E0607F" }),
  w: 82,
  h: 70,
  face: { eyeY: 0.4, eyeDX: 0.2, eyeScale: 0.92, mouthY: 0.18, mouthW: 0.85, cheekDX: 0.33, cheekDY: 6.5 },
  feet: { w: 15, h: 8, toes: true },
  // The paws are drawn with the shell (see `last`), so the shared arms are hidden.
  arms: { scale: 0 },
  highlight: [-0.18, 0.14, 0.12, 0.07],
  reach: [16, 12],
  headroom: () => 4,
  body: (c) => blob(c, { tw: 0.46, sh: 0.3, wy: 0.45, bw2: 0.42 }),
  back(c) {
    const { cx, top, by, bw, bh, t } = c;
    const wag = Math.sin(t * (c.mood === "happy" ? 6 : 2)) * 6 * c.motion * (1 - c.mv(SLEEPY));
    let out =
      `<g transform="translate(${r(cx - bw * 0.36)} ${r(by - bh * 0.1)}) rotate(${r(-14 + wag)})">` +
      path(TAIL_D, fs(c.pal.bottom, c.pal.line, 2.2)) +
      `</g>`;
    for (const side of [-1, 1]) {
      const x = cx + side * bw * 0.45, y = top + bh * 0.25;
      out += circle(x, y, 5.2, fs(c.pal.top, c.pal.line, 2.2)) + circle(x - side * 0.8, y + 0.4, 2.3, `fill="${c.pal.bottom}"`);
    }
    return out;
  },
  markings(c) {
    const { fx, top, bh, bw } = c;
    const pale = `fill="${c.pal.belly}"`;
    // Pale head and face, with a soft edge into the brown body.
    return (
      ell(fx, top + bh * 0.37, bw * 0.56, bh * 0.42, `${pale} fill-opacity="0.45"`) +
      ell(fx, top + bh * 0.35, bw * 0.53, bh * 0.39, pale)
    );
  },
  over(c) {
    // Puffy whisker pads with little dots.
    const { fx, my } = c;
    let out = "";
    for (const side of [-1, 1]) {
      const x = fx + side * 4.6, y = my - 1;
      out += circle(x, y, 5, `fill="#fff" fill-opacity="0.55"`);
      out += path(`M${p(x - 5, y + 0.3)}A5 5 0 0 0 ${p(x + 5, y + 0.3)}`, `${st(c.pal.line, 1.2)} stroke-opacity="0.35"`);
      for (let i = 0; i < 3; i++) out += circle(x + side * (1.2 + (i % 2) * 2), y - 0.6 + i * 1.6 - (i === 2 ? 0.4 : 0), 0.65, `fill="${c.pal.mark}"`);
    }
    return out;
  },
  front(c) {
    const { fx, my } = c;
    let whiskers = "";
    for (const side of [-1, 1]) {
      const x0 = fx + side * 9;
      whiskers += `M${p(x0, my - 2)}L${p(x0 + side * 9, my - 4.4)}M${p(x0, my + 0.4)}L${p(x0 + side * 9.5, my + 0.8)}`;
    }
    return path(whiskers, `${st(c.pal.line, 1.1)} stroke-opacity="0.5"`) + nose(fx, my - 5.8, 10, 6.6, c.pal.mark, c.pal.line);
  },
  last(c) {
    const { cx, fx, top, by, bw, bh, t } = c;
    const m = c.motion;
    let sx = cx + (fx - cx) * 0.6, sy = by - bh * 0.15;
    if (c.celebrating) {
      // Holds the shell up like a trophy and waves with the other paw.
      const bob = Math.sin(t * 12) * 1.6;
      const x = cx + bw * 0.44, y = top + bh * 0.22 + bob;
      const wave = -150 + Math.sin(t * 12) * 22;
      return (
        paw(c, cx - bw * 0.46, top + bh * 0.4, wave) +
        `<g transform="translate(${r(x)} ${r(y)}) rotate(${r(14 + Math.sin(t * 12) * 8)})"><g transform="scale(1.12)">${shell(c)}</g>${paw(c, 3, 9.4, 70)}</g>`
      );
    }
    // Every mood pose is blended, so the shell glides between them instead of jumping.
    const tap = c.mv(TAP) * m, shake = c.mv(SHAKE), idle = c.mv(IDLE) * m;
    sy += c.mv(SINK) + Math.sin(t * 2) * 0.6 * idle - Math.abs(Math.sin(t * 7)) * 3.2 * tap;
    sx += Math.sin(t * 22) * 1.2 * shake;
    const rot = c.mv(TILT) + Math.sin(t * 7) * 4 * tap;
    let spread = c.mv(SPREAD);
    if (c.held) {
      sy -= 2;
      spread = -1.5;
    }
    if (c.pose.walking && !c.held) sy += Math.sin(c.pose.walkPhase) * 1;
    return (
      `<g transform="translate(${r(sx)} ${r(sy)}) rotate(${r(rot)})">` +
      `<g transform="scale(1.12)">${shell(c)}</g>` +
      paw(c, -11.6 - spread, 2.2, -28) +
      paw(c, 11.6 + spread, 2.2, 28) +
      `</g>`
    );
  },
  anchors: (c) => ({
    head: { x: c.cx, y: c.top + 3, s: 0.95 },
    bow: { x: c.cx + c.bw * 0.3, y: c.top + 7 },
    neck: { y: c.by - c.bh * 0.34, w: c.bw, sag: c.bh * 0.1 },
    band: { y: c.top + c.bh * 0.24, arch: c.bh * 0.18 },
  }),
};
