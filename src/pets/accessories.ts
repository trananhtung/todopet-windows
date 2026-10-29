// The six wearables, drawn as vectors so they look the same on every OS and sit on species anchors.
import type { Accessory } from "../core/types";
import { U, type Anchors, type Ctx } from "./kit";
import { path, p, r, st } from "./svg";

const HAT_FILL = "#3A3542";
const HAT_DARK = "#2A2630";
const HAT_LINE = "#17141C";
const GOLD = "#FFC93C";
const GOLD_LINE = "#A8740A";
/** Head pieces are drawn a little larger than the face scale so they read at small sizes. */
const HAT = 1.2;

// Each head piece is drawn once around (0, 0) = where it sits on the head, then placed with a transform.
const TOPHAT =
  `<ellipse cx="0" cy="-1" rx="17" ry="4.4" fill="${HAT_DARK}" stroke="${HAT_LINE}" stroke-width="2"/>` +
  `<path d="M-11 -2L-12 -24Q0 -27.5 12 -24L11 -2Q0 1 -11 -2Z" fill="${HAT_FILL}" stroke="${HAT_LINE}" stroke-width="2"/>` +
  `<path d="M-11.2 -6.5L-11.5 -11Q0 -9 11.5 -11L11.2 -6.5Q0 -4.5 -11.2 -6.5Z" fill="#D84343"/>` +
  `<ellipse cx="0" cy="-24.2" rx="12" ry="2.6" fill="#4A4553" stroke="${HAT_LINE}" stroke-width="1.6"/>` +
  `<path d="M-7.5 -20.5L-7.8 -13.5" fill="none" stroke="#fff" stroke-opacity="0.3" stroke-width="2"/>`;

const CROWN =
  `<path d="M-13 0L-14.5 -13L-7 -6.5L0 -16.5L7 -6.5L14.5 -13L13 0Q0 2.5 -13 0Z" fill="${GOLD}" stroke="${GOLD_LINE}" stroke-width="1.8"/>` +
  `<path d="M-12.5 -4Q0 -1.8 12.5 -4" fill="none" stroke="#E39E12" stroke-width="1.4"/>` +
  `<circle cx="0" cy="-5" r="2.5" fill="#E53E5C" stroke="${GOLD_LINE}" stroke-width="0.9"/>` +
  `<circle cx="-7.5" cy="-4" r="1.7" fill="#4FB3F7" stroke="${GOLD_LINE}" stroke-width="0.8"/>` +
  `<circle cx="7.5" cy="-4" r="1.7" fill="#4FB3F7" stroke="${GOLD_LINE}" stroke-width="0.8"/>` +
  `<circle cx="-14.5" cy="-13" r="2" fill="#FFE58A" stroke="${GOLD_LINE}" stroke-width="1"/>` +
  `<circle cx="0" cy="-16.5" r="2" fill="#FFE58A" stroke="${GOLD_LINE}" stroke-width="1"/>` +
  `<circle cx="14.5" cy="-13" r="2" fill="#FFE58A" stroke="${GOLD_LINE}" stroke-width="1"/>`;

const GRADCAP =
  `<path d="M-11 -1L-11 -9L11 -9L11 -1Q0 2 -11 -1Z" fill="${HAT_DARK}" stroke="${HAT_LINE}" stroke-width="1.8"/>` +
  `<path d="M0 -17.5L22 -11.5L0 -5.5L-22 -11.5Z" fill="${HAT_FILL}" stroke="${HAT_LINE}" stroke-width="1.8"/>` +
  `<path d="M0 -11.5L14.5 -10L15.5 1.5" fill="none" stroke="${GOLD}" stroke-width="1.6"/>` +
  `<circle cx="0" cy="-11.5" r="1.7" fill="${GOLD}"/>` +
  `<path d="M13.6 0.5L17.4 0.5L18.2 7L12.8 7Z" fill="${GOLD}" stroke="#C99412" stroke-width="0.8"/>`;

const BOW =
  `<path d="M0 0C-4 -7 -11 -8 -10.5 -1C-10 5 -4 4 0 0Z" fill="#FF6F96" stroke="#B83A62" stroke-width="1.6"/>` +
  `<path d="M0 0C4 -7 11 -8 10.5 -1C10 5 4 4 0 0Z" fill="#FF6F96" stroke="#B83A62" stroke-width="1.6"/>` +
  `<path d="M-1 1.5L-4.5 8.5L-1.5 7.5ZM1 1.5L4.5 8.5L1.5 7.5Z" fill="#FF6F96" stroke="#B83A62" stroke-width="1.2"/>` +
  `<path d="M-7.5 -3.5Q-6.5 -5.5 -4.5 -5M7.5 -3.5Q6.5 -5.5 4.5 -5" fill="none" stroke="#fff" stroke-opacity="0.6" stroke-width="1.2"/>` +
  `<circle cx="0" cy="0" r="2.7" fill="#FF8FB0" stroke="#B83A62" stroke-width="1.4"/>`;

const HEAD_PIECES: Partial<Record<Accessory, { svg: string; height: number }>> = {
  tophat: { svg: TOPHAT, height: 28 },
  crown: { svg: CROWN, height: 19 },
  gradcap: { svg: GRADCAP, height: 18.5 },
};

const place = (x: number, y: number, s: number, rotDeg: number, inner: string): string =>
  `<g transform="translate(${r(x)} ${r(y)})${rotDeg ? ` rotate(${r(rotDeg)})` : ""} scale(${Math.round(s * 1000) / 1000})">${inner}</g>`;

function scarf(c: Ctx, an: Anchors): string {
  const { y, w, sag } = an.neck;
  const cx = c.cx;
  const d = `M${p(cx - w * 0.6, y)}Q${p(cx, y + sag)} ${p(cx + w * 0.6, y)}`;
  const band =
    `<g clip-path="${c.clip}">` +
    path(d, st("#D84343", 7.7)) +
    path(d, `${st("#fff", 7.7)} stroke-opacity="0.5" stroke-dasharray="2.2 5.5" stroke-linecap="butt"`) +
    `</g>`;
  const tx = cx + w * 0.24, ty = y + sag * 0.5;
  const ang = 14 + Math.sin(c.t * 4) * 4.6 * c.motion;
  const tail =
    `<g transform="translate(${r(tx)} ${r(ty)}) rotate(${r(ang)})">` +
    `<rect x="-3.3" y="0" width="6.6" height="14.3" rx="2.2" fill="#D84343" stroke="#9E2626" stroke-width="1.2"/>` +
    `<path d="M-3.3 4.5H3.3M-3.3 9H3.3" stroke="#fff" stroke-opacity="0.5" stroke-width="1.6"/>` +
    `</g>`;
  return band + tail;
}

function sunglasses(c: Ctx, an: Anchors): string {
  const g = U * (an.glasses ?? 1);
  const w = 14 * g, h = 10 * g; // tall enough to cover the (bigger) eyes
  let out = "";
  for (const side of [-1, 1]) {
    const x = c.fx + side * c.ex;
    out += `<rect x="${r(x - w / 2)}" y="${r(c.ey - h / 2)}" width="${r(w)}" height="${r(h)}" rx="${r(3.5 * g)}" fill="#111" fill-opacity="0.9"/>`;
    out += path(`M${p(x - w / 2 + 3 * g, c.ey - h / 2 + 2.5 * g)}l${r(3 * g)} 0`, `${st("#fff", 1.4)} stroke-opacity="0.75"`);
  }
  const gap = c.ex - w / 2;
  if (gap > 0) out += path(`M${p(c.fx - gap - 0.5, c.ey - 1.5 * g)}Q${p(c.fx, c.ey - 3.5 * g)} ${p(c.fx + gap + 0.5, c.ey - 1.5 * g)}`, st("#111", 1.8));
  return out;
}

/** Topmost y reached by worn head pieces (for keeping the pet inside the view). */
export function accessoryTop(an: Anchors, wearing: readonly Accessory[]): number {
  let top = Infinity;
  for (const a of wearing) {
    const piece = HEAD_PIECES[a];
    if (piece) top = Math.min(top, an.head.y - piece.height * an.head.s * U * HAT);
    else if (a === "bow") top = Math.min(top, an.bow.y - 9 * (an.bow.s ?? 1) * U);
  }
  return top;
}

export function accessories(c: Ctx, an: Anchors): string {
  const wearing = c.pose.wearing;
  if (wearing.length === 0) return "";
  let out = "";
  if (wearing.includes("scarf")) out += scarf(c, an);
  if (wearing.includes("sunglasses") && c.mood !== "sleeping" && !c.held) {
    out += c.faceTurn ? `<g${c.faceTurn}>${sunglasses(c, an)}</g>` : sunglasses(c, an);
  }
  if (wearing.includes("bow")) out += place(an.bow.x, an.bow.y, U * (an.bow.s ?? 1), an.bow.rot ?? 0, BOW);
  for (const a of ["gradcap", "tophat", "crown"] as const) {
    if (!wearing.includes(a)) continue;
    out += place(an.head.x, an.head.y, U * HAT * an.head.s, an.head.rot ?? 0, HEAD_PIECES[a]!.svg);
  }
  return out;
}
