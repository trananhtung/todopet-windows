// Knitting during focus sessions (v0.5 crafting): a yarn ball on the floor beside the pet, two needles
// held in front of the chest that click, and the knitted piece growing row by row with `pose.craft`.
import { GROUND, type Ctx } from "./kit";
import { circle, p, path, r, st } from "./svg";

const YARN = "#FF8C6B";
const YARN_DARK = "#E2674A";
const YARN_LINE = "#B4472F";
const CREAM = "#FFF1DC";
const NEEDLE = "#D9A866";
const NEEDLE_LINE = "#8C5E2A";

/** Where the needles cross and the piece hangs from (local space). */
function hook(c: Ctx): [number, number] {
  return [c.cx + (c.fx - c.cx) * 0.4, c.by - c.bh * 0.3];
}

/** The yarn ball beside the front foot, wound with a few strands, and the loose strand up to the work. */
export function yarnBall(c: Ctx): string {
  const R = 7.2;
  const x = c.cx + c.bw * 0.47, y = GROUND - R - 0.6;
  const [hx, hy] = hook(c);
  const wobble = Math.sin(c.t * 2.2 * Math.PI * 2) * 0.6 * c.motion;
  const strand = path(`M${p(x - 3, y - R + 1.4)}Q${p(x - 7, hy + 8 + wobble)} ${p(hx + 5, hy + 1.5)}`, `${st(YARN_DARK, 1.2)}`);
  return (
    strand +
    circle(x, y, R, `fill="${YARN}" stroke="${YARN_LINE}" stroke-width="1.6"`) +
    circle(x, y, R, `fill="url(#${c.id}-g)"`) +
    path(
      `M${p(x - R * 0.82, y - R * 0.3)}Q${p(x, y - R * 0.95)} ${p(x + R * 0.7, y - R * 0.55)}` +
        `M${p(x - R * 0.9, y + R * 0.1)}Q${p(x, y - R * 0.5)} ${p(x + R * 0.9, y - R * 0.05)}` +
        `M${p(x - R * 0.6, y + R * 0.62)}Q${p(x + R * 0.1, y + R * 0.02)} ${p(x + R * 0.78, y + R * 0.45)}`,
      `${st(YARN_LINE, 1)} stroke-opacity="0.55"`,
    ) +
    path(`M${p(x - R * 0.45, y - R * 0.55)}q${r(R * 0.25)} ${r(-R * 0.2)} ${r(R * 0.5)} ${r(-R * 0.18)}`, `${st("#fff", 1.1)} stroke-opacity="0.7"`)
  );
}

/** Needles and the knitted piece: a striped little scarf whose length follows `c.craft` (0 … 1). */
export function knitting(c: Ctx): string {
  const prog = c.craft ?? 0;
  const [hx, hy] = hook(c);
  const W = Math.min(22, c.bw * 0.3);
  const H = 3.2 + Math.min(16, c.bh * 0.3 + 4) * prog;
  const x0 = hx - W / 2, y0 = hy;
  const rows = Math.max(1, Math.round(H / 3));
  const rh = H / rows;
  // The piece: rows of little "v" stitches, a cream stripe every third row, rounded at the bottom.
  const body = `M${p(x0, y0)}L${p(x0 + W, y0)}L${p(x0 + W, y0 + H - 2)}Q${p(x0 + W, y0 + H)} ${p(x0 + W - 2, y0 + H)}L${p(x0 + 2, y0 + H)}Q${p(x0, y0 + H)} ${p(x0, y0 + H - 2)}Z`;
  let stripes = "";
  let stitches = "";
  const n = Math.max(3, Math.round(W / 3.2));
  const sw = W / n;
  for (let i = 0; i < rows; i++) {
    const ry = y0 + i * rh;
    if (i % 3 === 2) stripes += `<rect x="${r(x0 + 0.6)}" y="${r(ry)}" width="${r(W - 1.2)}" height="${r(Math.min(rh, y0 + H - ry - 1))}" fill="${CREAM}"/>`;
    let d = "";
    for (let j = 0; j < n; j++) {
      const sx = x0 + j * sw;
      d += `M${p(sx + sw * 0.15, ry + rh * 0.25)}L${p(sx + sw * 0.5, ry + rh * 0.8)}L${p(sx + sw * 0.85, ry + rh * 0.25)}`;
    }
    stitches += d;
  }
  const piece =
    path(body, `fill="${YARN}"`) +
    stripes +
    path(stitches, `${st(YARN_LINE, 0.8)} stroke-opacity="0.5"`) +
    path(body, `fill="url(#${c.id}-g)"`) +
    path(body, `fill="none" stroke="${YARN_LINE}" stroke-width="1.4"`);
  // Two needles crossing over the top row; their tips click toward each other.
  const click = Math.sin(c.t * 2.2 * Math.PI * 2) * 5 * c.motion;
  const needle = (side: number): string => {
    const bx = hx + side * (W / 2 + 7), byy = y0 + 3.5;
    const tx = hx - side * (W / 2 - 1), ty = y0 - 6;
    return (
      `<g transform="rotate(${r(side * click)} ${r(bx)} ${r(byy)})">` +
      path(`M${p(bx, byy)}L${p(tx, ty)}`, st(NEEDLE_LINE, 3)) +
      path(`M${p(bx, byy)}L${p(tx, ty)}`, st(NEEDLE, 1.6)) +
      circle(bx, byy, 2, `fill="${YARN_DARK}" stroke="${YARN_LINE}" stroke-width="1"`) +
      `</g>`
    );
  };
  return needle(-1) + piece + needle(1);
}
