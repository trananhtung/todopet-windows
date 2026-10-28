// Composes one frame: shared systems (palette, motion, face, limbs, life, accessories, effects)
// around the parts a species provides.
import type { Lang, Mood } from "../core/types";
import { accessories, accessoryTop } from "./accessories";
import { petEffects, screenEffects } from "./effects";
import { face } from "./face";
import { ART, CENTER_X, GROUND, type Ctx, type MoodTable, type SpeciesDef } from "./kit";
import { STAGE_SCALE, dirt, sprouts } from "./life";
import { arms, feet } from "./limbs";
import { dynamics } from "./motion";
import { blendBase, goldenBase, moodBase, toColors, type Base } from "./palette";
import { about, apply, clamp, ell, mul, matAttr, path, r, rotate, scale, smooth, type Mat } from "./svg";
import type { PetPose, RenderOptions } from "./types";

export interface PetRenderOptions extends RenderOptions {
  /** Language of the little "nom!" after eating. Default "en". */
  lang?: Lang;
}

const MOODS: readonly Mood[] = ["happy", "normal", "annoyed", "angry", "sleeping", "focus", "celebrating"];

/** Palettes are computed once per species and mood. */
const paletteCache = new WeakMap<SpeciesDef, { moods: Record<Mood, Base>; gold: Base }>();

function palettes(def: SpeciesDef): { moods: Record<Mood, Base>; gold: Base } {
  let hit = paletteCache.get(def);
  if (!hit) {
    const moods = {} as Record<Mood, Base>;
    for (const m of MOODS) moods[m] = def.moods?.[m] ?? moodBase(def.base, m);
    hit = { moods, gold: goldenBase(def.base) };
    paletteCache.set(def, hit);
  }
  return hit;
}

const num = (v: number, fallback: number): number => (Number.isFinite(v) ? v : fallback);
const PAD = 2;

/** Frame layout shared by the renderer and the bounds test. */
export interface Layout {
  ctx: Ctx;
  /** Body transform (tilt, flip, spin, mirror) in stage space. */
  body: Mat;
  /** Stage scale + keep-in-view correction, around the feet. */
  outer: Mat;
  /** World bounding box of the pet (approximate, conservative). */
  bounds: { minX: number; maxX: number; minY: number; maxY: number };
}

export function layout(def: SpeciesDef, pose: PetPose, idPrefix: string): Layout {
  const held = pose.held;
  const mood: Mood = held ? "normal" : pose.mood;
  const celebrating = mood === "celebrating";
  const t = num(pose.t, 0);
  const k = smooth(clamp(num(pose.blend, 1), 0, 1));
  const facing = pose.facing === -1 ? -1 : 1;
  const stage = STAGE_SCALE[clamp(Math.round(num(pose.stage, 3)), 0, 4)] * ART;
  const safe: PetPose = { ...pose, t, walkPhase: num(pose.walkPhase, 0), facing, wearing: pose.wearing ?? [] };

  const pals = palettes(def);
  const prev = MOODS.includes(pose.prevMood) ? pose.prevMood : pose.mood;
  const base = celebrating && pose.golden ? pals.gold : blendBase(pals.moods[prev], pals.moods[pose.mood], k);
  const dyn = dynamics(safe, def.info.gait, mood);

  const thin = pose.hungry && !celebrating ? 0.9 : 1;
  const bw = def.w * (1 + dyn.squash) * thin;
  const bh = def.h * (1 - dyn.squash) * (1 + dyn.breathe);
  const cx = CENTER_X + dyn.shakeX;
  const by = GROUND - 5.5 - dyn.jump - dyn.hover;
  const top = by - bh;

  const f = def.face;
  const look = clamp(pose.walking && !held ? 0.8 : num(pose.lookX, 0) * facing, -1, 1);
  const lookY = clamp(num(pose.lookY, 0), -1, 1);
  const fx = cx + look * bw * (f.shift ?? 0.07);
  const ey = top + bh * f.eyeY + lookY * bh * 0.03;
  const my = ey + bh * (f.mouthY ?? 0.21);
  const prevEff: Mood = held ? "normal" : prev;
  const feed = pose.food && pose.foodT >= 0 && pose.foodT < 1.8 ? Math.min(1, pose.foodT / 0.5) * (pose.foodT > 1.4 ? (1.8 - pose.foodT) / 0.4 : 1) : 0;

  const ctx: Ctx = {
    id: idPrefix,
    pose: safe,
    def,
    mood,
    celebrating,
    held,
    petted: pose.hovered && !held && (mood === "normal" || mood === "happy"),
    t,
    k,
    pal: toColors(base),
    dyn,
    cx,
    top,
    by,
    bw,
    bh,
    fx,
    ey,
    my,
    ex: bw * f.eyeDX,
    lookX: look,
    lookY,
    motion: pose.calm && !celebrating ? 0.3 : 1,
    feed,
    grad: `url(#${idPrefix}-b)`,
    clip: `url(#${idPrefix}-c)`,
    mv: (tb: MoodTable) => tb[prevEff] + (tb[mood] - tb[prevEff]) * (held ? 1 : k),
  };

  // Body transform: lean/waddle around the feet, then flip/spin/mirror around the body middle.
  const midY = by - bh / 2;
  const inner = about(mul(rotate(dyn.flip * -facing), scale(facing * (Math.abs(dyn.spin) < 0.12 ? 0.12 * Math.sign(dyn.spin || 1) : dyn.spin), 1)), cx, midY);
  const body = mul(about(rotate(dyn.tilt * facing), cx, GROUND), inner);

  // Keep everything inside the view: shift down while airborne, else shrink a little around the feet.
  const an = def.anchors(ctx);
  const yTop = Math.min(top - def.headroom(ctx), accessoryTop(an, safe.wearing));
  const xL = cx - bw / 2 - def.reach[0], xR = cx + bw / 2 + def.reach[1];
  const yB = by + 7 + dyn.dangle;
  const mx = (xL + xR) / 2, myy = (yTop + yB) / 2;
  const stageM = about(scale(stage, stage), CENTER_X, GROUND);
  const m0 = mul(stageM, body);
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  const corners: [number, number][] = [
    [xL, myy], [xR, myy], [mx, yTop], [mx, yB],
    [mx + (xL - mx) * 0.94, myy + (yTop - myy) * 0.94], [mx + (xR - mx) * 0.94, myy + (yTop - myy) * 0.94],
    [mx + (xL - mx) * 0.94, myy + (yB - myy) * 0.94], [mx + (xR - mx) * 0.94, myy + (yB - myy) * 0.94],
  ];
  for (const [x, y] of corners) {
    const [wx, wy] = apply(m0, x, y);
    if (wx < minX) minX = wx;
    if (wx > maxX) maxX = wx;
    if (wy < minY) minY = wy;
    if (wy > maxY) maxY = wy;
  }
  // Shrink to fit the width and the full height, then slide vertically into view; sliding down is only
  // allowed while airborne (the feet never sink below the ground), otherwise shrink a bit more.
  const half = Math.max(CENTER_X - minX, maxX - CENTER_X);
  let fit = Math.min(1, (CENTER_X - PAD) / half, (160 - 2 * PAD) / (maxY - minY));
  let dy = 0;
  for (let i = 0; i < 3; i++) {
    const topY = GROUND - (GROUND - minY) * fit, botY = GROUND - (GROUND - maxY) * fit;
    dy = clamp(0, PAD - topY, 160 - PAD - botY);
    const air = (dyn.jump + dyn.hover) * stage * fit;
    if (dy <= air + 1e-6) break;
    fit = Math.min(fit, (GROUND + air - PAD) / (GROUND - minY));
  }
  const outer = mul([1, 0, 0, 1, 0, dy], about(scale(stage * fit, stage * fit), CENTER_X, GROUND));
  const total = mul(outer, body);
  // Recompute bounds with the correction applied.
  minX = Infinity; maxX = -Infinity; minY = Infinity; maxY = -Infinity;
  for (const [x, y] of corners) {
    const [wx, wy] = apply(total, x, y);
    minX = Math.min(minX, wx); maxX = Math.max(maxX, wx); minY = Math.min(minY, wy); maxY = Math.max(maxY, wy);
  }
  return { ctx, body, outer, bounds: { minX, maxX, minY, maxY } };
}

export function renderSpecies(def: SpeciesDef, pose: PetPose, opts: PetRenderOptions = {}): string {
  const id = opts.idPrefix ?? "pet";
  const size = opts.size ?? 160;
  const { ctx: c, body, outer } = layout(def, pose, id);
  const an = def.anchors(c);
  const bodyD = def.body(c);
  const air = c.dyn.jump + c.dyn.hover;
  const scaleNow = Math.hypot(outer[0], outer[1]);
  const shW = 62 * (1 - Math.min(air, 34) / 68);

  // Body layers (local, mirrored space).
  let g = "";
  if (def.back) g += def.back(c);
  g += feet(c);
  g += path(bodyD, `fill="${c.grad}"`);
  if (def.markings) g += `<g clip-path="${c.clip}">${def.markings(c)}</g>`;
  const hl = def.highlight === undefined ? ([-0.17, 0.18, 0.13, 0.08] as const) : def.highlight;
  if (hl) g += ell(c.cx + c.bw * hl[0], c.top + c.bh * hl[1], c.bw * hl[2], c.bh * hl[3], `fill="#fff" fill-opacity="0.45"`);
  g += path(bodyD, `fill="none" stroke="${c.pal.line}" stroke-width="2.6"`);
  if (def.over) g += def.over(c);
  if (c.mood === "focus" && !c.held) g += headband(c, an.band);
  g += face(c);
  if (def.front) g += def.front(c);
  g += arms(c);
  if (def.top) g += def.top(c);
  g += sprouts(c, an);
  g += dirt(c);
  g += accessories(c, an);
  if (def.last) g += def.last(c);

  // Effects layer: same stage space as the body but unmirrored.
  const [mouthX, mouthY] = apply(body, c.fx, c.my);
  const fx = petEffects(c, {
    cx: c.cx,
    side: pose.facing === -1 ? -1 : 1,
    mouthX,
    mouthY,
    foodStartY: (6 - outer[5]) / scaleNow,
    minY: (4 - outer[5]) / scaleNow,
    lang: opts.lang ?? "en",
  });

  const shadowA = c.held ? 0.08 : 0.24;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 160" width="${size}" height="${size}">` +
    `<defs>` +
    `<linearGradient id="${id}-b" gradientUnits="userSpaceOnUse" x1="0" y1="${r(c.top)}" x2="0" y2="${r(c.by)}">` +
    `<stop offset="0" stop-color="${c.pal.top}"/><stop offset="1" stop-color="${c.pal.bottom}"/></linearGradient>` +
    `<radialGradient id="${id}-s"><stop offset="0" stop-color="#3a2a1e" stop-opacity="${shadowA}"/>` +
    `<stop offset="0.65" stop-color="#3a2a1e" stop-opacity="${Math.round(shadowA * 60) / 100}"/><stop offset="1" stop-color="#3a2a1e" stop-opacity="0"/></radialGradient>` +
    `<clipPath id="${id}-c"><path d="${bodyD}"/></clipPath>` +
    `</defs>` +
    `<g${matAttr(about(scale(scaleNow, scaleNow), CENTER_X, GROUND))}>${ell(CENTER_X, GROUND, shW / 2, 4.6, `fill="url(#${id}-s)"`)}</g>` +
    `<g${matAttr(outer)} stroke-linecap="round" stroke-linejoin="round">` +
    `<g${matAttr(body)}>${g}</g>` +
    fx +
    `</g>` +
    screenEffects(c) +
    `</svg>`
  );
}

/** Focus headband (clipped to the body) with two tails fluttering behind. */
function headband(c: Ctx, band: { y: number; arch: number }): string {
  const red = "#E53935";
  const { cx, bw, t } = c;
  const y = band.y;
  const d = `M${r(cx - bw * 0.6)} ${r(y)}Q${r(cx)} ${r(y - band.arch)} ${r(cx + bw * 0.6)} ${r(y)}`;
  const ky = y - band.arch / 2;
  let out = `<g clip-path="${c.clip}">${path(d, `fill="none" stroke="${red}" stroke-width="7.7"`)}` +
    `<circle cx="${r(cx)}" cy="${r(ky)}" r="4.4" fill="#fff"/><circle cx="${r(cx)}" cy="${r(ky)}" r="2.4" fill="${red}"/></g>`;
  const kx = cx - bw * 0.47;
  const kyy = y - band.arch * 0.1;
  for (let i = 0; i < 2; i++) {
    const wave = Math.sin(t * 6 + i) * 3.3 * c.motion;
    out += path(
      `M${r(kx)} ${r(kyy)}Q${r(kx - 7.7)} ${r(kyy - 3.3 + i * 4.4)} ${r(kx - 15.4)} ${r(kyy + 4.4 + i * 5.5 + wave)}`,
      `fill="none" stroke="${red}" stroke-width="3.5"`,
    );
  }
  return out;
}
