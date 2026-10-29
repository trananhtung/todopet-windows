// Tiny SVG string helpers. Everything here is pure and allocation-light: renderPet runs ~30×/s.

/** Rounds to one decimal so the markup stays short (String(-0) is "0", so no "-0" either). */
export const r = (n: number): number => Math.round(n * 10) / 10;

/** "x y" pair for path data. */
export const p = (x: number, y: number): string => `${r(x)} ${r(y)}`;

export const ell = (cx: number, cy: number, rx: number, ry: number, attrs: string): string =>
  `<ellipse cx="${r(cx)}" cy="${r(cy)}" rx="${r(Math.abs(rx))}" ry="${r(Math.abs(ry))}" ${attrs}/>`;

export const circle = (cx: number, cy: number, rad: number, attrs: string): string =>
  `<circle cx="${r(cx)}" cy="${r(cy)}" r="${r(Math.abs(rad))}" ${attrs}/>`;

export const path = (d: string, attrs: string): string => `<path d="${d}" ${attrs}/>`;

/** fill + stroke attributes. */
export const fs = (fill: string, stroke: string, width: number): string =>
  `fill="${fill}" stroke="${stroke}" stroke-width="${r(width)}"`;

/** Stroke-only attributes. */
export const st = (stroke: string, width: number): string =>
  `fill="none" stroke="${stroke}" stroke-width="${r(width)}"`;

/** ` opacity="…"` or nothing when fully opaque. */
export const op = (o: number): string => {
  const v = Math.round(Math.max(0, Math.min(1, o)) * 100) / 100;
  return v >= 1 ? "" : ` opacity="${v}"`;
};

export const rot = (deg: number, x: number, y: number): string =>
  `transform="rotate(${r(deg)} ${r(x)} ${r(y)})"`;

/** Four-pointed twinkle centered on (x, y). */
export const sparkle = (x: number, y: number, rad: number): string =>
  `M${p(x, y - rad)}Q${p(x, y)} ${p(x + rad, y)}Q${p(x, y)} ${p(x, y + rad)}Q${p(x, y)} ${p(x - rad, y)}Q${p(x, y)} ${p(x, y - rad)}Z`;

/** Sweat drop with its tip at the top. */
export const drop = (x: number, y: number, s = 1): string =>
  `M${p(x, y - 6.6 * s)}C${p(x + 2.2 * s, y - 2.2 * s)} ${p(x + 5.5 * s, y + 4.4 * s)} ${p(x, y + 4.4 * s)}` +
  `C${p(x - 5.5 * s, y + 4.4 * s)} ${p(x - 2.2 * s, y - 2.2 * s)} ${p(x, y - 6.6 * s)}Z`;

/** Closed path through points (straight segments). */
export const poly = (pts: readonly (readonly [number, number])[]): string => {
  let d = "";
  for (let i = 0; i < pts.length; i++) d += (i === 0 ? "M" : "L") + p(pts[i][0], pts[i][1]);
  return d + "Z";
};

export const esc = (s: string): string =>
  s.replace(/[&<>"]/g, (ch) => (ch === "&" ? "&amp;" : ch === "<" ? "&lt;" : ch === ">" ? "&gt;" : "&quot;"));

export const FONT = `font-family="'Segoe UI Variable Display','Segoe UI',system-ui,sans-serif"`;
export const EMOJI_FONT = `font-family="'Segoe UI Emoji','Apple Color Emoji','Noto Color Emoji',sans-serif"`;

// ── Affine matrices [a b c d e f] (SVG order) ──────────────────────────────

export type Mat = readonly [number, number, number, number, number, number];

export const IDENTITY: Mat = [1, 0, 0, 1, 0, 0];

/** m · n (n is applied first). */
export const mul = (m: Mat, n: Mat): Mat => [
  m[0] * n[0] + m[2] * n[1],
  m[1] * n[0] + m[3] * n[1],
  m[0] * n[2] + m[2] * n[3],
  m[1] * n[2] + m[3] * n[3],
  m[0] * n[4] + m[2] * n[5] + m[4],
  m[1] * n[4] + m[3] * n[5] + m[5],
];

export const translate = (x: number, y: number): Mat => [1, 0, 0, 1, x, y];
export const rotate = (rad: number): Mat => [Math.cos(rad), Math.sin(rad), -Math.sin(rad), Math.cos(rad), 0, 0];
export const scale = (sx: number, sy: number): Mat => [sx, 0, 0, sy, 0, 0];

/** Applies `m` around the point (x, y). */
export const about = (m: Mat, x: number, y: number): Mat => mul(translate(x, y), mul(m, translate(-x, -y)));

export const apply = (m: Mat, x: number, y: number): [number, number] => [
  m[0] * x + m[2] * y + m[4],
  m[1] * x + m[3] * y + m[5],
];

const r4 = (n: number): number => Math.round(n * 10000) / 10000;

export const matAttr = (m: Mat): string =>
  m[0] === 1 && m[1] === 0 && m[2] === 0 && m[3] === 1 && m[4] === 0 && m[5] === 0
    ? ""
    : ` transform="matrix(${r4(m[0])} ${r4(m[1])} ${r4(m[2])} ${r4(m[3])} ${r(m[4])} ${r(m[5])})"`;

// ── Small math ─────────────────────────────────────────────────────────────

export const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);
export const frac = (v: number): number => v - Math.floor(v);
export const smooth = (k: number): number => k * k * (3 - 2 * k);
export const lerp = (a: number, b: number, k: number): number => a + (b - a) * k;
export const DEG = 180 / Math.PI;

/** The characters an id prefix may use: it is written into `id="…"` and `url(#…)`, where a quote, a bracket or a space would break out. */
const ID_PREFIX_RE = /^[A-Za-z0-9_-]{1,80}$/;

/** Returns `prefix` when it is safe to write into markup; throws when it is not (a caller bug, never user text: a friend's key is base64url). */
export function checkIdPrefix(prefix: string): string {
  if (typeof prefix !== "string" || !ID_PREFIX_RE.test(prefix)) throw new Error("idPrefix may only hold letters, digits, - and _ (1 to 80 characters)");
  return prefix;
}
