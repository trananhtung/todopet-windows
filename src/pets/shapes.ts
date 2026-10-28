// Reusable shape builders for species parts.
import type { Ctx } from "./kit";
import { fs, p, path, r, st } from "./svg";

export interface BlobShape {
  /** Width of the rounded top (control handle), fraction of width. Default 0.40. */
  tw?: number;
  /** Shoulder: how low the side handles start, fraction of height. Default 0.22. */
  sh?: number;
  /** Widest point, fraction of height above the bottom. Default 0.38. */
  wy?: number;
  /** Bottom handle width, fraction of width. Default 0.36. */
  bw2?: number;
  /** Bottom corner roundness, fraction of height. Default 0.04. */
  bf?: number;
}

/** The Mochi body (from PetArt.bodyPath), with knobs so each species gets its own silhouette. */
export function blob(c: Ctx, s: BlobShape = {}): string {
  const { cx, top, by, bw: w, bh: h } = c;
  const tw = s.tw ?? 0.4, sh = s.sh ?? 0.22, wy = s.wy ?? 0.38, bw2 = s.bw2 ?? 0.36, bf = s.bf ?? 0.04;
  const l = cx - w / 2, rr = cx + w / 2;
  return (
    `M${p(cx, top)}C${p(cx + w * tw, top)} ${p(rr, top + h * sh)} ${p(rr, by - h * wy)}` +
    `C${p(rr, by - h * bf)} ${p(cx + w * bw2, by)} ${p(cx, by)}` +
    `C${p(cx - w * bw2, by)} ${p(l, by - h * bf)} ${p(l, by - h * wy)}` +
    `C${p(l, top + h * sh)} ${p(cx - w * tw, top)} ${p(cx, top)}Z`
  );
}

/** A thick outlined stroke (tails, gills): outline first, then the fill on top. */
export function tube(d: string, width: number, fill: string, line: string, extra = ""): string {
  return path(d, st(line, width + 4.4)) + path(d, `${st(fill, width)}${extra}`);
}

/** Triangle ear with a rounded tip, plus an inner triangle pulled toward its center. */
export function triEar(
  c: Ctx,
  b1: readonly [number, number],
  tip: readonly [number, number],
  b2: readonly [number, number],
  fill: string,
  innerFill: string,
  innerScale = 0.5,
): string {
  const ccx = (b1[0] + b2[0] + tip[0]) / 3, ccy = (b1[1] + b2[1] + tip[1]) / 3;
  const inw = (q: readonly [number, number]): string => p(ccx + (q[0] - ccx) * innerScale, ccy + (q[1] - ccy) * innerScale + 2.2);
  return (
    path(`M${p(b1[0], b1[1])}L${p(tip[0], tip[1])}L${p(b2[0], b2[1])}Z`, fs(fill, c.pal.line, 2.4)) +
    path(`M${inw(b1)}L${inw(tip)}L${inw(b2)}Z`, `fill="${innerFill}"`)
  );
}

/** Rotation attribute in degrees around a point. */
export const turn = (deg: number, x: number, y: number): string => `transform="rotate(${r(deg)} ${r(x)} ${r(y)})"`;

/** A small dark nose (rounded triangle) centered at (x, y). */
export const nose = (x: number, y: number, w: number, h: number, fill: string, line: string): string =>
  path(`M${p(x - w / 2, y - h / 2)}Q${p(x, y - h * 0.8)} ${p(x + w / 2, y - h / 2)}Q${p(x + w * 0.2, y + h / 2)} ${p(x, y + h / 2)}Q${p(x - w * 0.2, y + h / 2)} ${p(x - w / 2, y - h / 2)}Z`, `fill="${fill}" stroke="${line}" stroke-width="1"`) +
  path(`M${p(x - w * 0.18, y - h * 0.25)}l${r(w * 0.18)} 0`, `${st("#fff", 1)} stroke-opacity="0.6"`);
