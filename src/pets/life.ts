// Long-term life state drawn on any species: sprouts (young pets), dirt + flies, hungry rumble.
import { U, type Anchors, type Ctx } from "./kit";
import { DEG, ell, fs, op, p, path, r, st } from "./svg";

export const STAGE_SCALE = [0.8, 0.88, 0.95, 1.02, 1.08] as const;
export const STAGE_SPROUTS = [2, 1, 0, 0, 0] as const;

const LEAF = "#6CC04A";
const STEM = "#3E8E2A";

/** Little leaves on the head: 2 for Baby, 1 for Kid. */
export function sprouts(c: Ctx, an: Anchors): string {
  const n = STAGE_SPROUTS[c.pose.stage] ?? 0;
  if (n === 0) return "";
  const s = U * Math.max(0.8, an.head.s);
  const x = an.head.x, y = an.head.y;
  const tipX = x + 1 * s, tipY = y - 8 * s;
  const sway = Math.sin(c.t * 2.5) * 0.15 * c.motion;
  let out = path(`M${p(x, y + 1)}Q${p(x - 2 * s, y - 3 * s)} ${p(tipX, tipY)}`, st(STEM, 1.9));
  const angles = n >= 2 ? [Math.PI + 0.6, -0.6] : [-0.6];
  for (const a of angles) {
    const deg = (a + sway) * DEG;
    // Leaf: an ellipse from the stem tip outward, rotated around the tip.
    out += ell(tipX + 4.95 * s, tipY, 4.95 * s, 2.86 * s, `${fs(LEAF, STEM, 1.1)} transform="rotate(${r(deg)} ${r(tipX)} ${r(tipY)})"`);
  }
  return out;
}

/** Smudges after lazy days, clipped to the body. */
export function dirt(c: Ctx): string {
  const level = Math.max(0, Math.min(3, Math.floor(c.pose.dirt)));
  if (level === 0 || c.celebrating) return "";
  const { cx, by, bw, bh } = c;
  let out = "";
  for (let i = 0; i < level * 3; i++) {
    const a = i * 2.39996;
    const rr = 0.25 + 0.2 * (i % 3);
    const x = cx + Math.cos(a) * rr * bw * 0.9;
    const y = by - bh * 0.45 + Math.sin(a) * rr * bh * 0.8;
    const w = (4 + (i % 3) * 2) * U * 1.15;
    out += ell(x, y, w / 2, w / 3, `fill="#6B5544" fill-opacity="0.34"`);
  }
  return `<g clip-path="${c.clip}">${out}</g>`;
}

/**
 * Flies buzzing around a pet left dirty for days (level 3). Drawn in the effects layer (unmirrored),
 * `cx` already in that space.
 */
export function flies(c: Ctx, cx: number, minY: number): string {
  if (c.pose.dirt < 3 || c.celebrating) return "";
  let out = "";
  for (let i = 0; i < 2; i++) {
    const a = c.t * (3 + i) + i * 2.5;
    const x = cx + Math.cos(a) * c.bw * 0.72;
    const y = Math.max(minY + 6, c.top - 6 + Math.sin(a * 1.7) * 7);
    const wing = Math.abs(Math.sin(c.t * 40)) * 2.5 + 1;
    out += ell(x - 1, y - wing / 2 - 1, 1.6, wing / 2 + 0.3, `fill="#fff" fill-opacity="0.85" stroke="#7a8a99" stroke-width="0.5"`);
    out += ell(x + 1.2, y - wing / 2 - 1, 1.6, wing / 2 + 0.3, `fill="#fff" fill-opacity="0.85" stroke="#7a8a99" stroke-width="0.5"`);
    out += ell(x, y, 2.2, 1.7, `fill="#222"`);
  }
  // Wavy stink lines rising from the body.
  const ph = (c.t * 0.8) % 1;
  for (let i = 0; i < 2; i++) {
    const x = cx + (i ? 1 : -1) * c.bw * 0.3;
    const y = c.top + 6 - ph * 12;
    out += path(`M${p(x, y + 8)}q-3 -2 0 -4t0 -4`, `${st("#8A9A6A", 1.5)}${op((1 - ph) * 0.8)}`);
  }
  return out;
}

/** A hungry tummy rumbles (effects layer). `side` = facing, so the rumble sits on the front side. */
export function rumble(c: Ctx, cx: number, side: number): string {
  if (!c.pose.hungry || c.celebrating || c.mood === "sleeping" || Math.sin(c.t * 1.6) <= 0.3) return "";
  let out = "";
  for (let i = 0; i < 2; i++) {
    const x0 = cx + side * (c.bw * 0.5 + 2 + i * 4.4);
    const y0 = c.by - c.bh * 0.3 + i * 6.6;
    const d = `M${p(x0, y0)}c${r(side * 2.2)} -3.3 ${r(side * 6.6)} 3.3 ${r(side * 8.8)} 0`;
    out += path(d, `${st(c.pal.line, 1.6)} stroke-opacity="0.7"`);
  }
  return out;
}
