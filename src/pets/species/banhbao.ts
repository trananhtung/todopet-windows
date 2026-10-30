// Bảnh Bao: a dapper little person on a mochi body. Spiky black hair swept forward, a charcoal polo with a
// collar and two buttons, white trousers and sneakers, a black crossbody bag at the hip, and a thumbs-up when
// happy (two when celebrating). The name is a pun: "bảnh bao" is dapper, "bánh bao" a round steamed bun.
import { U, moodTable, type Ctx, type SpeciesDef } from "../kit";
import { makeBase } from "../palette";
import { blob } from "../shapes";
import { circle, ell, fs, p, path, r, st } from "../svg";

/** The thumb of the thumbs-up, pointing up out of a fist around (0, 0). */
export const THUMB_D = "M-2 -2.6V-8.6Q-2 -10.8 0 -10.8Q2 -10.8 2 -8.6V-2.6Z";
/** The crossbody bag, hanging from its strap at (0, 0). */
export const BAG_D = "M-8.6 0Q-8.6 -1.2 -7.4 -1.2H7.4Q8.6 -1.2 8.6 0V9.6Q8.6 12 6.2 12H-6.2Q-8.6 12 -8.6 9.6Z";
const FLAP_D = "M-8.6 0Q-8.6 -1.2 -7.4 -1.2H7.4Q8.6 -1.2 8.6 0V5Q0 7.6 -8.6 5Z";
const CURLS_D = "M0.8 -1.4H4.2M0.8 1.2H4.2";
/** How far the hair tufts stand up: flat when worried or asleep, on end when angry. */
const SPIKE = moodTable(1, 0.85, 0.4, 1.15, 0.3);
/** Hair tufts on top, back to front: [end x as a fraction of the half width, end y and peak above the head in px]. */
const TUFTS = [
  [-0.3, -4, 14],
  [0.02, -5, 18],
  [0.34, -4, 16],
  [0.7, 1, 11],
] as const;
/** Fringe points over the forehead, front to back: [tip x, tip y, next base x, next base y] (fractions of the body box). */
const FRINGE = [
  [0.66, 0.25, 0.44, 0.15],
  [0.26, 0.245, 0.04, 0.14],
  [-0.16, 0.235, -0.38, 0.14],
  [-0.56, 0.22, -0.74, 0.16],
] as const;

function hair(c: Ctx): string {
  const { cx, top, bw, bh } = c;
  const a = bw / 2;
  const X = (f: number): number => cx + f * a;
  const Y = (f: number): number => top + f * bh;
  const lift = c.mv(SPIKE);
  let d = `M${p(X(-1), Y(0.32))}C${p(X(-1.08), Y(0.12))} ${p(X(-0.9), top - 3)} ${p(X(-0.62), top - 1)}`;
  let px = -0.62;
  for (const [x, y, h] of TUFTS) {
    d += `Q${p(X((px + x) / 2), top - 2 - h * lift)} ${p(X(x), top + y)}`;
    px = x;
  }
  // Down the front, then back along the fringe with rounded tips swept toward the face.
  d += `C${p(X(0.98), top + 3)} ${p(X(1.06), Y(0.16))} ${p(X(1), Y(0.3))}Q${p(X(0.92), Y(0.22))} ${p(X(0.8), Y(0.16))}`;
  for (const [tx, ty, bx, by] of FRINGE) {
    d += `Q${p(X(tx + 0.07), Y(ty))} ${p(X(tx), Y(ty))}Q${p(X(tx - 0.07), Y(ty))} ${p(X(bx), Y(by))}`;
  }
  d += `Q${p(X(-0.9), Y(0.2))} ${p(X(-0.88), Y(0.31))}Z`;
  return (
    path(d, fs(c.pal.accent, c.pal.line, 2.2)) +
    path(`M${p(X(-0.4), top + 3)}Q${p(X(-0.14), top - 2)} ${p(X(0.1), top + 1)}`, `${st("#fff", 2)} stroke-opacity="0.24"`)
  );
}

/** Where the strap across the chest ends: the ring on the bag's near corner, at the front hip. */
const hangPoint = (c: Ctx): [number, number] => [c.cx + c.bw * 0.08, c.by - c.bh * 0.23];
/** Distance between the bag's two strap rings. */
const RINGS = 15.2;

/** A metal strap ring. */
const ring = (c: Ctx, x: number, y: number): string =>
  circle(x, y, 2.1, `fill="none" stroke="${c.pal.line}" stroke-width="2.6"`) + circle(x, y, 2.1, `fill="none" stroke="#C9CED6" stroke-width="1.3"`);

/**
 * The bag hangs from the strap's ring and sways a little, swings while walking and dangles when held. From the
 * far ring the strap goes on round the hip to the back, so it reads as one loop.
 */
function bag(c: Ctx): string {
  const { cx, by, bw, bh, t } = c;
  let swing = Math.sin(t * 1.6) * 1.5 * c.motion;
  if (c.held) swing = Math.sin(t * 10) * 14;
  else if (c.celebrating) swing = Math.sin(t * 12) * 12;
  else if (c.pose.walking) swing = Math.sin(c.pose.walkPhase) * 6;
  const [x, y] = hangPoint(c);
  const a = (swing * Math.PI) / 180;
  const back = `M${p(x + Math.cos(a) * RINGS, y + Math.sin(a) * RINGS)}Q${p(cx + bw * 0.4, by - bh * 0.24)} ${p(cx + bw * 0.56, by - bh * 0.34)}`;
  return (
    `<g clip-path="${c.clip}">${path(back, st(c.pal.line, 4.4))}${path(back, st(c.pal.accent, 2.8))}</g>` +
    `<g transform="translate(${r(x)} ${r(y)}) rotate(${r(swing)})">` +
    // The rings go in first: the bag covers their lower half, so they peek out of its top like D-rings.
    ring(c, 0, 0) +
    ring(c, RINGS, 0) +
    `<g transform="translate(${RINGS / 2} 1.4)">` +
    path(BAG_D, fs(c.pal.accent, c.pal.line, 1.8)) +
    path(FLAP_D, fs(c.pal.accent, c.pal.line, 1.4)) +
    `<rect x="-1.8" y="4.2" width="3.6" height="2.8" rx="0.8" fill="#C9CED6" stroke="${c.pal.line}" stroke-width="0.8"/>` +
    path("M-6 1.2Q-2 0 2 1.2", `${st("#fff", 1.4)} stroke-opacity="0.3"`) +
    `</g>` +
    `</g>`
  );
}

/** A fist with the thumb up on each raised arm, when happy or celebrating (nothing otherwise). */
function thumbsUp(c: Ctx, x: number, y: number, angle: number, len: number): string {
  if (c.mood !== "happy" && c.mood !== "celebrating") return "";
  if (c.held || (c.act && c.act.armK > 0.02)) return "";
  // Only an arm placed high on the body is raised (hanging and walking arms sit at the shoulder).
  if (y > c.by - c.bh * 0.5) return "";
  // The fist goes on the upper end of the arm.
  const dx = -Math.sin(angle) * len * 0.9, dy = Math.cos(angle) * len * 0.9;
  const hx = dy < 0 ? x + dx : x - dx, hy = dy < 0 ? y + dy : y - dy;
  const wobble = Math.sin(c.t * 8) * 8 * c.motion;
  return (
    `<g transform="translate(${r(hx)} ${r(hy)}) rotate(${r(wobble)}) scale(${r(U * 1.2)})">` +
    path(THUMB_D, fs(c.pal.top, c.pal.line, 1.6)) +
    ell(0, 0, 4.8, 4.2, fs(c.pal.top, c.pal.line, 1.6)) +
    path(CURLS_D, `${st(c.pal.line, 1)} stroke-opacity="0.6"`) +
    `</g>`
  );
}

export const banhbao: SpeciesDef = {
  info: {
    id: "banhbao",
    name: { en: "Dapper Bao", vi: "Bảnh Bao" },
    emoji: "👍",
    gait: "bounce",
    sound: { en: "nice!", vi: "ok luôn!" },
  },
  base: makeBase({
    top: "#FCE4CF",
    bottom: "#F3C7A4",
    line: "#5E3A2A",
    belly: "#FBFAF6",
    mark: "#4A4E58",
    accent: "#262222",
    inner: "#EBA98A",
    cheekA: 0.42,
  }),
  w: 76,
  h: 78,
  face: { eyeY: 0.4, eyeDX: 0.19, mouthY: 0.14, cheekDX: 0.31, cheekDY: 5 },
  feet: { w: 19, h: 9.5, color: "belly", sole: "mark" },
  arms: { color: "mark", hand: thumbsUp },
  // The hair has its own shine.
  highlight: null,
  reach: [9, 13],
  headroom: (c) => 4.5 + 9.5 * c.mv(SPIKE),
  body: (c) => blob(c, { tw: 0.42 }),
  back(c) {
    // Ears on the sides of the head, peeking out from under the hair.
    const { cx, top, bw, bh } = c;
    let out = "";
    for (const side of [-1, 1]) {
      const x = cx + side * (bw * 0.5 + 0.6), y = top + bh * 0.42;
      out +=
        ell(x, y, 4.6, 6, fs(c.pal.top, c.pal.line, 2.2)) +
        path(`M${p(x + side * 0.6, y - 3)}Q${p(x + side * 2.6, y)} ${p(x + side * 0.6, y + 3)}`, st(c.pal.inner, 1.5));
    }
    return out;
  },
  markings(c) {
    const { cx, top, by, bw, bh } = c;
    const yc = top + bh * 0.66; // the collar, in the middle
    const ys = top + bh * 0.58; // the shoulders
    const yp = by - bh * 0.13; // the trouser waist
    const L = cx - bw * 0.6, R = cx + bw * 0.6;
    const shirt = path(`M${p(L, ys)}Q${p(cx, 2 * yc - ys)} ${p(R, ys)}L${p(R, by + 3)}L${p(L, by + 3)}Z`, `fill="${c.pal.mark}"`);
    const waist = `M${p(L, yp)}Q${p(cx, yp + 3)} ${p(R, yp)}`;
    const trousers =
      path(`${waist}L${p(R, by + 3)}L${p(L, by + 3)}Z`, `fill="${c.pal.belly}"`) +
      path(waist, `${st(c.pal.line, 1.6)} stroke-opacity="0.45"`) +
      path(`M${p(cx, yp + 4)}L${p(cx, by + 2)}`, `${st(c.pal.line, 1.3)} stroke-opacity="0.35"`);
    // Polo collar: skin in the open V, two flaps, a placket with two buttons.
    let collar = path(`M${p(cx - 2.6, yc - 0.6)}L${p(cx + 2.6, yc - 0.6)}L${p(cx, yc + 7)}Z`, `fill="${c.grad}"`);
    for (const side of [-1, 1]) {
      collar += path(`M${p(cx + side * 0.6, yc - 0.6)}L${p(cx + side * 11, yc - 2.6)}L${p(cx + side * 4.6, yc + 6.4)}Z`, fs(c.pal.mark, c.pal.line, 1.4));
    }
    collar +=
      path(`M${p(cx, yc + 7)}L${p(cx, yc + 13)}`, `${st(c.pal.line, 1.1)} stroke-opacity="0.5"`) +
      circle(cx, yc + 8.6, 0.95, `fill="${c.pal.belly}" fill-opacity="0.7"`) +
      circle(cx, yc + 11.8, 0.95, `fill="${c.pal.belly}" fill-opacity="0.7"`);
    // The bag strap, from over the back shoulder down across the chest to the bag's ring, sagging a little.
    const sx = cx - bw * 0.52, sy = top + bh * 0.55;
    const [hx, hy] = hangPoint(c);
    const strap = `M${p(sx, sy)}Q${p((sx + hx) / 2, (sy + hy) / 2 + 3)} ${p(hx, hy)}`;
    return shirt + trousers + collar + path(strap, st(c.pal.line, 4.4)) + path(strap, st(c.pal.accent, 2.8));
  },
  over: (c) => hair(c) + bag(c),
  anchors: (c) => ({
    // Hats sit on the hair, so a few tufts peek out.
    head: { x: c.cx + 1, y: c.top - 3, s: 1 },
    bow: { x: c.cx + c.bw * 0.32, y: c.top + 4 },
    // Round the collar.
    neck: { y: c.top + c.bh * 0.64, w: c.bw, sag: c.bh * 0.06 },
    band: { y: c.top + c.bh * 0.2, arch: c.bh * 0.1 },
  }),
};
