// Koala: soft grey with huge round fluffy ears (white tufts inside), a big glossy dark nose, white chin
// and belly; the ears droop when annoyed or asleep, and it nibbles a eucalyptus sprig when happy.
import { moodTable, type Ctx, type SpeciesDef } from "../kit";
import { makeBase } from "../palette";
import { blob } from "../shapes";
import { ell, fs, op, p, path, r, st } from "../svg";

/** Ear tilt in degrees (outward and down). */
const DROOP = moodTable(-4, 0, 20, 8, 26);
const NIBBLE = moodTable(1, 0, 0, 0, 0, 0, 0);
const EAR_R = 15.5;

/** A circle with a scalloped, fluffy edge (radius `rad`, `n` tufts), centered on (0, 0). */
function fluffy(rad: number, n: number, bump: number, phase: number): string {
  let d = "";
  for (let i = 0; i <= n; i++) {
    const a = phase + (i / n) * Math.PI * 2;
    const x = Math.cos(a) * rad, y = Math.sin(a) * rad;
    if (i === 0) {
      d += `M${p(x, y)}`;
      continue;
    }
    const am = a - Math.PI / n;
    d += `Q${p(Math.cos(am) * (rad + bump), Math.sin(am) * (rad + bump))} ${p(x, y)}`;
  }
  return d + "Z";
}

const EAR_D = fluffy(EAR_R, 13, 2.6, 0.2);
const TUFT_D = fluffy(7.4, 10, 2.6, 0);

/** Eucalyptus sprig: a stem with three grey-green leaves, from (0, 0) toward +x. */
function sprig(c: Ctx): string {
  const leaf = fs(c.pal.accent, "#3F7356", 1.1);
  return (
    path("M0 0Q5 -1.5 11 -5", st("#6A5A4A", 1.4)) +
    ell(5, -6, 4.2, 2.1, `${leaf} transform="rotate(-60 5 -6)"`) +
    ell(8.5, 0.6, 4.2, 2.1, `${leaf} transform="rotate(25 8.5 0.6)"`) +
    ell(13.4, -6.6, 4.6, 2.3, `${leaf} transform="rotate(-25 13.4 -6.6)"`)
  );
}

export const koala: SpeciesDef = {
  info: {
    id: "koala",
    name: { en: "Koala", vi: "Gấu koala" },
    emoji: "🐨",
    gait: "waddle",
    sound: { en: "mrrr", vi: "ừm ừm" },
  },
  base: makeBase({ top: "#C9CDD6", bottom: "#959BA9", belly: "#FFFFFF", mark: "#37333D", accent: "#86C29A", inner: "#EBD3DC", line: "#46434F" }),
  w: 84,
  h: 66,
  face: { eyeY: 0.49, eyeDX: 0.25, eyeScale: 0.98, mouthY: 0.285, mouthW: 0.8, cheekDX: 0.35, cheekDY: 6.5 },
  feet: { toes: true },
  arms: { scale: 0.95 },
  reach: [21, 21],
  headroom: () => 9,
  body: (c) => blob(c, { tw: 0.44, sh: 0.28, wy: 0.42, bw2: 0.4 }),
  back(c) {
    const { cx, top, bw, bh } = c;
    const droop = c.mv(DROOP);
    let out = "";
    for (const side of [-1, 1]) {
      const ax = cx + side * bw * 0.3, ay = top + bh * 0.3;
      out +=
        `<g transform="translate(${r(ax)} ${r(ay)}) rotate(${r(side * droop)}) scale(${side} 1) translate(${r(bw * 0.17)} ${r(-bh * 0.15)})">` +
        path(EAR_D, fs(c.grad, c.pal.line, 2.4)) +
        ell(2.6, 0.6, 10, 10.4, `fill="${c.pal.inner}"`) +
        `<path d="${TUFT_D}" fill="${c.pal.belly}" transform="translate(4.4 0.6)"/>` +
        `</g>`;
    }
    return out;
  },
  markings(c) {
    const { cx, by, bw, bh, fx, my } = c;
    const white = `fill="${c.pal.belly}"`;
    return (
      ell(cx, by - bh * 0.06, bw * 0.3, bh * 0.24, white) +
      // White chin under the nose.
      ell(fx, my + 3, bw * 0.17, bh * 0.13, white)
    );
  },
  front(c) {
    const { fx, ey, bh } = c;
    const y = ey + bh * 0.13;
    // Big glossy nose: wider at the top, a soft rounded spoon.
    return (
      path(
        `M${p(fx, y - 9.4)}C${p(fx + 6.8, y - 9.4)} ${p(fx + 8.2, y - 4)} ${p(fx + 7, y + 2)}C${p(fx + 6, y + 7.4)} ${p(fx + 3, y + 9)} ${p(fx, y + 9)}` +
          `C${p(fx - 3, y + 9)} ${p(fx - 6, y + 7.4)} ${p(fx - 7, y + 2)}C${p(fx - 8.2, y - 4)} ${p(fx - 6.8, y - 9.4)} ${p(fx, y - 9.4)}Z`,
        fs(c.pal.mark, c.pal.line, 1.4),
      ) +
      ell(fx - 3, y - 4.6, 2.6, 3.4, `fill="#fff" fill-opacity="0.42" transform="rotate(20 ${r(fx - 3)} ${r(y - 4.6)})"`) +
      ell(fx + 2.6, y + 5.2, 1.2, 0.8, `fill="#fff" fill-opacity="0.3"`)
    );
  },
  last(c) {
    const w = c.mv(NIBBLE);
    if (w < 0.05 || c.held || c.pose.walking) return "";
    const munch = Math.sin(c.t * 9) * 6 * c.motion;
    const x = c.fx + 5.5, y = c.my + 2;
    return `<g transform="translate(${r(x)} ${r(y)}) rotate(${r(munch - 8)})"${op(w)}>${sprig(c)}</g>`;
  },
  anchors: (c) => ({
    head: { x: c.cx, y: c.top + 3, s: 0.95 },
    bow: { x: c.cx + c.bw * 0.2, y: c.top + 5 },
    neck: { y: c.my + 7, w: c.bw, sag: c.bh * 0.08 },
    band: { y: c.top + c.bh * 0.24, arch: c.bh * 0.16 },
    glasses: 0.95,
  }),
};
