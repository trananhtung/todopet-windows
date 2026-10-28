// Mood effects around the pet (sweat, anger, steam, Zzz, hearts, sparkles, treats) and celebration
// confetti / fireworks. Drawn unmirrored so text and symbols always read correctly.
import type { Lang } from "../core/types";
import type { Ctx } from "./kit";
import { flies, rumble } from "./life";
import { EMOJI_FONT, FONT, circle, drop, esc, frac, op, p, path, r, sparkle, st } from "./svg";

const CONFETTI = ["#FF5C8A", "#FFC93C", "#4FC3F7", "#66BB6A", "#AB47BC"];
const YELLOW = "#FFC93C";

const heart = (x: number, y: number, s: number): string =>
  `M${p(x, y + s * 0.9)}C${p(x - s * 1.7, y - s * 0.1)} ${p(x - s * 0.75, y - s * 1.35)} ${p(x, y - s * 0.45)}` +
  `C${p(x + s * 0.75, y - s * 1.35)} ${p(x + s * 1.7, y - s * 0.1)} ${p(x, y + s * 0.9)}Z`;

/** The 💢 anger vein, as four curved brackets. */
const anger = (x: number, y: number, s: number): string => {
  const a = 2 * s, b = 6.5 * s;
  return (
    `M${p(x - a, y - b)}Q${p(x - a, y - a)} ${p(x - b, y - a)}M${p(x + a, y - b)}Q${p(x + a, y - a)} ${p(x + b, y - a)}` +
    `M${p(x - a, y + b)}Q${p(x - a, y + a)} ${p(x - b, y + a)}M${p(x + a, y + b)}Q${p(x + a, y + a)} ${p(x + b, y + a)}`
  );
};

export interface EffectSpace {
  /** Pet center x in the effects layer. */
  cx: number;
  /** 1 = facing right. Asymmetric effects sit on the side the pet faces. */
  side: number;
  /** Mouth position in the effects layer, and the y where falling food starts. */
  mouthX: number;
  mouthY: number;
  foodStartY: number;
  /** Smallest y in this layer that is still inside the view. */
  minY: number;
  lang: Lang;
}

/** Effects attached to the pet (inside the stage-scaled group, unmirrored). */
export function petEffects(c: Ctx, e: EffectSpace): string {
  const { t, top, by, bw, bh, mood } = c;
  const { cx, side } = e;
  let out = "";
  switch (mood) {
    case "happy": {
      const pts: [number, number][] = [[-46, top + 4.4], [47, top - 4.4], [33, top - 20]];
      for (let i = 0; i < 3; i++) {
        const sc = 0.45 + 0.55 * Math.abs(Math.sin(t * 3 + i * 2.1));
        out += path(sparkle(cx + side * pts[i][0], Math.max(e.minY + 7, pts[i][1]), 6.6 * sc), `fill="${YELLOW}" fill-opacity="0.9"`);
      }
      break;
    }
    case "celebrating":
      out += path(sparkle(cx - side * 44, Math.max(e.minY + 8, top + 2), 7.7), `fill="${YELLOW}"`);
      out += path(sparkle(cx + side * 44, Math.max(e.minY + 6, top - 6.6), 5.5), `fill="${YELLOW}"`);
      if (c.pose.golden) {
        for (let i = 0; i < 6; i++) {
          const a = t * 1.5 + (i / 6) * 2 * Math.PI;
          const x = cx + Math.cos(a) * bw * 0.66;
          const y = by - bh * 0.5 + Math.sin(a) * bh * 0.8;
          out += path(sparkle(x, y, 4.4 + 2.2 * Math.abs(Math.sin(t * 5 + i))), `fill="#FFD700" stroke="#FFF6C2" stroke-width="0.6"`);
        }
      }
      break;
    case "annoyed": {
      const slide = (t * 5) % 9;
      out += path(drop(cx + side * bw * 0.42, top + bh * 0.12 + slide), `fill="#9ED8FF" stroke="#3A8DC7" stroke-width="1.3"`);
      break;
    }
    case "angry": {
      const pulse = 1 + 0.15 * Math.sin(t * 8);
      out += path(anger(cx + side * bw * 0.4, top + 3, pulse), st("#E53935", 2.6));
      for (let i = 0; i < 3; i++) {
        const ph = frac(t * 0.9 + i / 3);
        const rad = 3.3 + ph * 6.6;
        for (const s of [-1, 1]) {
          const x = cx + s * (bw * 0.44 + ph * 11);
          const y = Math.max(e.minY + rad, top + 11 - ph * 28);
          out += circle(x, y, rad, `fill="#fff" fill-opacity="${r((1 - ph) * 0.85)}" stroke="#9a9a9a" stroke-opacity="${r((1 - ph) * 0.5)}" stroke-width="1"`);
        }
      }
      break;
    }
    case "sleeping":
      for (let i = 0; i < 3; i++) {
        const ph = frac(t * 0.35 + i / 3);
        const size = 9.9 + ph * 7.7;
        const x = cx + side * (26 + ph * 20);
        const y = Math.max(e.minY + size, top - 2 - ph * 26);
        out += `<text x="${r(x)}" y="${r(y)}" font-size="${r(size)}" font-weight="800" text-anchor="middle" ${FONT} fill="${c.pal.line}"${op(Math.sin(ph * Math.PI))}>Z</text>`;
      }
      break;
    default:
      break;
  }
  if (c.petted) {
    const ph = frac(t * 0.6);
    out += path(heart(cx - side * 34, Math.max(e.minY + 8, top - ph * 20), 5 + ph * 2), `fill="#FF5C8A"${op(1 - ph)}`);
  }
  out += flies(c, cx, e.minY) + rumble(c, cx, side);
  out += food(c, e);
  return out;
}

/** The treat falls from the top of the view into the mouth (~0.8 s), then "nom!". */
function food(c: Ctx, e: EffectSpace): string {
  const f = c.pose.food;
  const ft = c.pose.foodT;
  if (!f || !(ft >= 0) || ft >= 1.8) return "";
  if (ft < 0.8) {
    const k = ft / 0.8;
    const y = e.foodStartY + (e.mouthY - e.foodStartY) * k * k;
    const size = 24 - 4 * k;
    return `<text x="${r(e.mouthX)}" y="${r(y)}" font-size="${r(size)}" text-anchor="middle" dominant-baseline="central" ${EMOJI_FONT}>${esc(f)}</text>`;
  }
  const fade = 1 - (ft - 0.8) / 1;
  const word = e.lang === "vi" ? "măm!" : "nom!";
  return `<text x="${r(e.mouthX + e.side * 30)}" y="${r(e.mouthY - 16 - (1 - fade) * 8.8)}" font-size="12" font-weight="800" text-anchor="middle" ${FONT} fill="${c.pal.line}"${op(fade)}>${word}</text>`;
}

/** Confetti and fireworks fill the whole view (world space, not scaled with the pet). */
export function screenEffects(c: Ctx): string {
  if (c.mood !== "celebrating") return "";
  const t = c.t;
  let out = "";
  for (let i = 0; i < 16; i++) {
    const seed = i * 7.31;
    const speed = 50 + (seed % 5) * 12;
    const y = ((t * speed + seed * 49) % 150) + 4;
    const x = ((seed * 70.7) % 150) + 5 + Math.sin(t * 2 + seed) * 8;
    const a = ((t * 3 + seed) * 57.3) % 360;
    out += `<rect x="-2.2" y="-3.8" width="4.4" height="7.6" fill="${CONFETTI[i % 5]}"${op(1 - y / 165)} transform="translate(${r(x)} ${r(y)}) rotate(${r(a)})"/>`;
  }
  if (c.pose.celebration === "fireworks") {
    const centers: [number, number][] = [[37, 36], [121, 30], [82, 26]];
    for (let k = 0; k < 3; k++) {
      const ph = frac(t * 1.1 + k / 3);
      const rad = 4 + ph * 18;
      const [x0, y0] = centers[k];
      for (let j = 0; j < 10; j++) {
        const a = (j / 10) * 2 * Math.PI;
        out += circle(x0 + Math.cos(a) * rad, y0 + Math.sin(a) * rad, 1.9, `fill="${CONFETTI[(j + k) % 5]}"${op(1 - ph)}`);
      }
    }
  }
  return out;
}
