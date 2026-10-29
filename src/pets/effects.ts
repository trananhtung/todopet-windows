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
  /** Smallest y, and smallest / largest x, in this layer that are still inside the view. */
  minY: number;
  minX: number;
  maxX: number;
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
  if (c.act) out += actEffects(c, e);
  out += food(c, e);
  return out;
}

const puff = (x: number, y: number, s: number, o: number): string =>
  circle(x, y, 2.6 * s, `fill="#fff" stroke="#B8B0A8" stroke-width="1"${op(o)}`) +
  circle(x + 2.6 * s, y - 1.4 * s, 2.2 * s, `fill="#fff" stroke="#B8B0A8" stroke-width="1"${op(o)}`) +
  circle(x + 2.4 * s, y + 1.6 * s, 1.9 * s, `fill="#fff" stroke="#B8B0A8" stroke-width="1"${op(o)}`);

/** Bold little word centered on x, kept inside the view horizontally. */
const word = (e: EffectSpace, x: number, y: number, size: number, text: string, fill: string, o: number): string => {
  const half = text.length * size * 0.3;
  x = Math.min(Math.max(x, e.minX + half), e.maxX - half);
  return `<text x="${r(x)}" y="${r(y)}" font-size="${r(size)}" font-weight="800" text-anchor="middle" ${FONT} fill="${fill}"${op(o)}>${text}</text>`;
};

/** Little extras that make an act read at a glance (effects layer, unmirrored). */
function actEffects(c: Ctx, e: EffectSpace): string {
  const a = c.act!;
  const { t, k } = a;
  const { top, by, bw, bh } = c;
  const { cx, side } = e;
  const ink = c.pal.line;
  let out = "";
  switch (a.kind) {
    case "dizzy":
      // Three little stars circling over the head; the ones behind are smaller and fainter.
      for (let i = 0; i < 3; i++) {
        const ang = t * 5 + (i * 2 * Math.PI) / 3;
        const depth = (Math.sin(ang) + 1) / 2;
        const x = cx + Math.cos(ang) * bw * 0.34;
        const y = Math.max(e.minY + 5, top - 3 + Math.sin(ang) * 3.5);
        out += path(sparkle(x, y, (3 + 1.6 * depth) * k), `fill="${YELLOW}" stroke="#E0A100" stroke-width="0.6"${op((0.55 + 0.45 * depth) * k)}`);
      }
      break;
    case "giggle":
      // "hehe" bubbling up beside the head.
      for (let i = 0; i < 2; i++) {
        const ph = frac(t * 1.4 + i * 0.5);
        out += word(e, cx + side * (bw * 0.5 + 6 + i * 4), Math.max(e.minY + 9, top + 10 - ph * 16), 8.5, e.lang === "vi" ? "hihi" : "hehe", ink, Math.sin(ph * Math.PI) * k);
      }
      break;
    case "pout": {
      // A tiny "hmph" of air puffed out to the side at the end.
      const ph = clamp01((t - 1.2) / 0.6);
      if (ph > 0 && ph < 1) out += puff(e.mouthX - side * (bw * 0.3 + ph * 9), e.mouthY - 2 - ph * 3, 0.7, (1 - ph) * 0.9);
      break;
    }
    case "shake": {
      // Swoosh lines on both sides while shaking, with a few specks flying off.
      const env = Math.sin(Math.PI * a.u);
      if (env < 0.15) break;
      const ph = t * 2 * Math.PI * 4.4;
      for (const s of [-1, 1]) {
        const x = cx + s * (bw * 0.56 + 4);
        const o = env * (0.4 + 0.6 * Math.abs(Math.sin(ph + s)));
        out += path(`M${p(x, top + bh * 0.25)}q${r(s * 4)} ${r(bh * 0.2)} 0 ${r(bh * 0.4)}M${p(x + s * 4, top + bh * 0.35)}q${r(s * 3)} ${r(bh * 0.13)} 0 ${r(bh * 0.26)}`, `${st(ink, 1.5)}${op(o)}`);
      }
      for (let i = 0; i < 4; i++) {
        const ph2 = frac(t * 2.5 + i / 4);
        const ang = -Math.PI / 2 + (i - 1.5) * 0.9;
        const rr = bw * 0.45 + ph2 * 14;
        out += circle(cx + Math.cos(ang) * rr, Math.max(e.minY + 2, by - bh * 0.55 + Math.sin(ang) * rr * 0.7), 1.3, `fill="#9ED8FF"${op((1 - ph2) * env)}`);
      }
      break;
    }
    case "sniff": {
      // Little "sniff" arcs drawn toward the nose.
      const burst = Math.abs(a.twitch) > 0.05 || (t > 0.15 && t < 0.6) || (t > 0.9 && t < 1.35) ? 1 : 0;
      if (!burst) break;
      for (let i = 0; i < 3; i++) {
        const o = Math.max(0, Math.sin(t * 2 * Math.PI * 3.5 - i * 0.9)) * k;
        const x = e.mouthX + side * (9 + i * 3.6), y = e.mouthY - 5 + i * 0.6;
        out += path(`M${p(x, y - 2.6)}q${r(-side * 1.8)} 2.6 0 5.2`, `${st(ink, 1.3)}${op(o)}`);
      }
      break;
    }
    case "scratch": {
      // Scritch marks by the paw.
      const x = cx + side * (bw * 0.56 + 3), y = top + bh * 0.1;
      const o = (0.5 + 0.5 * Math.abs(Math.sin(t * 2 * Math.PI * 7))) * k;
      out += path(`M${p(x, y)}l${r(side * 3.5)} -2M${p(x + side, y + 3.5)}l${r(side * 3.8)} -0.6M${p(x, y + 7)}l${r(side * 3.5)} 1`, `${st(ink, 1.3)}${op(o)}`);
      break;
    }
    case "wave": {
      // Two motion ticks beside the waving paw.
      const x = cx + side * (bw * 0.62 + 6), y = top + bh * 0.08;
      const o = (0.4 + 0.6 * Math.abs(Math.sin(t * 11))) * k;
      out += path(`M${p(x, y)}q${r(side * 2.5)} 2.5 0 5M${p(x + side * 3.5, y - 1.5)}q${r(side * 3)} 3.5 0 7`, `${st(ink, 1.3)}${op(o)}`);
      break;
    }
    case "hop":
    case "trip": {
      // Dust kicked up on landing (hop) or where the foot caught (trip).
      const t0 = a.kind === "hop" ? 0.5 : 0.05;
      const ph = clamp01((t - t0) / 0.4);
      if (ph > 0 && ph < 1) {
        const x = cx + (a.kind === "hop" ? 0 : -side * bw * 0.3);
        for (const s of a.kind === "hop" ? [-1, 1] : [-side]) {
          out += circle(x + s * (bw * 0.3 + ph * 8), by + 4 - ph * 3, 2 + ph * 1.6, `fill="#E8DCCB" stroke="#C9B9A2" stroke-width="0.8"${op((1 - ph) * 0.9)}`);
        }
      }
      if (a.kind === "trip" && t > 0.85) {
        // Sheepish sweat drop.
        const slide = Math.min(4, (t - 0.85) * 8);
        out += path(drop(cx + side * bw * 0.42, top + bh * 0.1 + slide, 0.85), `fill="#9ED8FF" stroke="#3A8DC7" stroke-width="1.2"${op(k)}`);
      }
      break;
    }
    case "sneeze": {
      // "ah… ah…" while breathing in, then "choo!" with a puff and a few droplets.
      const en = e.lang !== "vi";
      const hx = cx + side * (bw * 0.5 + 8), hy = Math.max(e.minY + 9, top + 2);
      if (t > 0.1 && t < 0.95) {
        const o = Math.min(1, (t - 0.1) / 0.15) * (t > 0.85 ? (0.95 - t) / 0.1 : 1);
        out += word(e, hx, hy, 8, t < 0.5 ? (en ? "ah…" : "hắt…") : en ? "ah… ah…" : "hắt… hắt…", ink, o);
      }
      const ph = clamp01((t - 0.95) / 0.55);
      if (ph > 0 && ph < 1) {
        out += word(e, hx + side * 3, hy - ph * 4, 11 + ph * 2, en ? "choo!" : "xì!", ink, 1 - ph * ph);
        out += puff(e.mouthX + side * (6 + ph * 12), e.mouthY + 1, 0.8 + ph * 0.5, (1 - ph) * 0.95);
        for (let i = 0; i < 3; i++) {
          const ang = (i - 1) * 0.5;
          out += circle(e.mouthX + side * (5 + ph * 18) * Math.cos(ang), e.mouthY + (5 + ph * 18) * Math.sin(ang), 1.1, `fill="#9ED8FF"${op(1 - ph)}`);
        }
      }
      break;
    }
    case "ponder":
      // Thought dots rising one by one on the side the pet looks at.
      for (let i = 0; i < 3; i++) {
        const o = clamp01((t - 0.3 - i * 0.3) / 0.2) * k;
        if (o <= 0) continue;
        out += circle(cx + side * (bw * 0.5 + 4 + i * 6), Math.max(e.minY + 4, top + 2 - i * 7), 1.9 + i * 0.7, `fill="${ink}"${op(o)}`);
      }
      break;
    default:
      break;
  }
  return out;
}

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

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
