// Pygmy hippo: a plump, glossy lavender-grey bean with a wide pink-grey muzzle, two nostrils on top,
// eyes set high, tiny round ears that flick now and then, a strong pink blush and stubby toed feet.
import type { Ctx, SpeciesDef } from "../kit";
import { makeBase } from "../palette";
import { blob } from "../shapes";
import { ell, fs, p, path, r, st } from "../svg";

/** Ear flick angle (degrees): a quick twitch every few seconds, each ear on its own clock. */
function flick(t: number, period: number, offset: number): number {
  const ph = ((t + offset) % period) / period;
  return ph < 0.12 ? Math.sin((ph / 0.12) * Math.PI * 2) * 26 : 0;
}

function muzzle(c: Ctx): string {
  const { fx, top, bw, bh } = c;
  const x = fx, y = top + bh * 0.66;
  const w = bw * 0.41, h = bh * 0.23;
  return (
    `M${p(x - w, y)}C${p(x - w, y - h * 0.8)} ${p(x - w * 0.64, y - h * 1.06)} ${p(x - w * 0.3, y - h)}` +
    `Q${p(x, y - h * 0.82)} ${p(x + w * 0.3, y - h)}` +
    `C${p(x + w * 0.64, y - h * 1.06)} ${p(x + w, y - h * 0.8)} ${p(x + w, y)}` +
    `C${p(x + w, y + h * 0.78)} ${p(x + w * 0.56, y + h)} ${p(x, y + h)}` +
    `C${p(x - w * 0.56, y + h)} ${p(x - w, y + h * 0.78)} ${p(x - w, y)}Z`
  );
}

export const hippo: SpeciesDef = {
  info: {
    id: "hippo",
    name: { en: "Pygmy hippo", vi: "Hà mã lùn" },
    emoji: "🦛",
    gait: "waddle",
    sound: { en: "hmmph", vi: "hừm hừm" },
  },
  base: makeBase({
    top: "#C9BEDB",
    bottom: "#9182AB",
    belly: "#EBCBD7",
    mark: "#5F4E78",
    accent: "#FF7FA3",
    inner: "#F4A3BB",
    line: "#4D4163",
    cheek: "#FF6F98",
    cheekA: 0.55,
  }),
  w: 94,
  h: 68,
  face: { eyeY: 0.35, eyeDX: 0.19, eyeScale: 0.92, mouth: "wide", mouthY: 0.39, mouthW: 1.25, cheekDX: 0.37, cheekDY: 9.5 },
  feet: { w: 19, h: 8.5, toes: true },
  arms: { scale: 0.9 },
  highlight: [-0.2, 0.13, 0.15, 0.065],
  reach: [9, 9],
  headroom: () => 6,
  body: (c) => blob(c, { tw: 0.36, sh: 0.32, wy: 0.42, bw2: 0.46 }),
  back(c) {
    const { cx, top, bw, t } = c;
    let out = "";
    for (const side of [-1, 1]) {
      const x = cx + side * bw * 0.22, y = top + 3.6;
      const a = side * 12 + flick(t, side < 0 ? 3.1 : 3.7, side < 0 ? 0 : 1.7);
      out +=
        `<g transform="rotate(${r(a)} ${r(x)} ${r(y + 3)})">` +
        ell(x, y, 5.6, 4.9, fs(c.grad, c.pal.line, 2.2)) +
        ell(x, y + 0.5, 2.8, 2.4, `fill="${c.pal.inner}"`) +
        `</g>`;
    }
    return out;
  },
  markings(c) {
    // Wet-look shine: a second glint and a streak down the side.
    const { cx, top, bw, bh } = c;
    return (
      ell(cx + bw * 0.24, top + bh * 0.11, 3.2, 1.9, `fill="#fff" fill-opacity="0.45"`) +
      path(`M${p(cx - bw * 0.43, top + bh * 0.36)}Q${p(cx - bw * 0.46, top + bh * 0.5)} ${p(cx - bw * 0.43, top + bh * 0.6)}`, `${st("#fff", 2.4)} stroke-opacity="0.32"`)
    );
  },
  over(c) {
    const { fx, top, bw, bh } = c;
    const ny = top + bh * 0.66 - bh * 0.23 * 0.62;
    let out = path(muzzle(c), fs(c.pal.belly, c.pal.line, 2.1));
    out += ell(fx - bw * 0.2, top + bh * 0.58, bw * 0.06, bh * 0.025, `fill="#fff" fill-opacity="0.5"`);
    for (const side of [-1, 1]) {
      const x = fx + side * bw * 0.11;
      out += ell(x, ny, 2.3, 1.6, `fill="${c.pal.mark}" transform="rotate(${side * 22} ${r(x)} ${r(ny)})"`);
    }
    return out;
  },
  anchors: (c) => ({
    head: { x: c.cx, y: c.top + 3, s: 1 },
    bow: { x: c.cx + c.bw * 0.34, y: c.top + 7 },
    neck: { y: c.my + 7, w: c.bw, sag: c.bh * 0.06 },
    band: { y: c.top + c.bh * 0.2, arch: c.bh * 0.12 },
  }),
};
