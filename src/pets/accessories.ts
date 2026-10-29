// The wearables, drawn as vectors so they look the same on every OS and sit on species anchors.
// Head pieces sit on `head`, the bow on `bow`, scarves and collars on `neck`, glasses on the eyes.
import type { Accessory } from "../core/types";
import { U, type Anchors, type Ctx } from "./kit";
import { circle, ell, path, p, r, sparkle, st } from "./svg";

const HAT_FILL = "#3A3542";
const HAT_DARK = "#2A2630";
const HAT_LINE = "#17141C";
const GOLD = "#FFC93C";
const GOLD_LINE = "#A8740A";
/** Head pieces are drawn a little larger than the face scale so they read at small sizes. */
const HAT = 1.2;

// ── Small shape helpers (hat units) ─────────────────────────────────────────────────────────────

const n1 = (v: number): string => String(Math.round(v * 100) / 100);

/** A fluffy pom-pom: a circle with scalloped edges. */
function pom(x: number, y: number, rad: number, bumps: number): string {
  let d = `M${n1(x + rad)} ${n1(y)}`;
  for (let i = 1; i <= bumps; i++) {
    const a = (i / bumps) * Math.PI * 2;
    d += `A${n1((rad * 2.6) / bumps)} ${n1((rad * 2.6) / bumps)} 0 0 1 ${n1(x + Math.cos(a) * rad)} ${n1(y + Math.sin(a) * rad)}`;
  }
  return d + "Z";
}

/** A five-point star centered on (x, y), first point up, turned by `rot` radians. */
function star(x: number, y: number, R: number, inner: number, rot = 0): string {
  let d = "";
  for (let i = 0; i < 10; i++) {
    const a = rot - Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 ? R * inner : R;
    d += `${i ? "L" : "M"}${n1(x + Math.cos(a) * rr)} ${n1(y + Math.sin(a) * rr)}`;
  }
  return d + "Z";
}

/** Small heart centered near (x, y): s ≈ half its width. */
const heartD = (x: number, y: number, s: number): string =>
  `M${n1(x)} ${n1(y + s * 0.9)}C${n1(x - s * 1.7)} ${n1(y - s * 0.1)} ${n1(x - s * 0.75)} ${n1(y - s * 1.35)} ${n1(x)} ${n1(y - s * 0.45)}` +
  `C${n1(x + s * 0.75)} ${n1(y - s * 1.35)} ${n1(x + s * 1.7)} ${n1(y - s * 0.1)} ${n1(x)} ${n1(y + s * 0.9)}Z`;

/** Round-petal flower: outline layer first so the petals merge into one silhouette, then fills, then the heart. */
function flower(x: number, y: number, s: number, fill: string, line: string): string {
  let o = "", f = "";
  for (let i = 0; i < 5; i++) {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / 5;
    const px = x + Math.cos(a) * 2.5 * s, py = y + Math.sin(a) * 2.5 * s;
    o += `<circle cx="${n1(px)}" cy="${n1(py)}" r="${n1(2.4 * s)}" fill="${line}" stroke="${line}" stroke-width="1.8"/>`;
    f += `<circle cx="${n1(px)}" cy="${n1(py)}" r="${n1(2.4 * s)}" fill="${fill}"/>`;
  }
  return o + f + `<circle cx="${n1(x)}" cy="${n1(y)}" r="${n1(1.5 * s)}" fill="#FFD54F" stroke="#E0A100" stroke-width="0.8"/>`;
}

/** Hoa mai: five long yellow petals around an orange heart with tiny stamens. */
function mai(x: number, y: number, s: number): string {
  let o = "", f = "", dots = "";
  for (let i = 0; i < 5; i++) {
    const deg = -90 + i * 72;
    const a = (deg * Math.PI) / 180;
    const px = x + Math.cos(a) * 2.7 * s, py = y + Math.sin(a) * 2.7 * s;
    const tr = `transform="rotate(${n1(deg + 90)} ${n1(px)} ${n1(py)})"`;
    o += `<ellipse cx="${n1(px)}" cy="${n1(py)}" rx="${n1(1.85 * s)}" ry="${n1(2.8 * s)}" fill="#D99A00" stroke="#D99A00" stroke-width="1.6" ${tr}/>`;
    f += `<ellipse cx="${n1(px)}" cy="${n1(py)}" rx="${n1(1.85 * s)}" ry="${n1(2.8 * s)}" fill="#FFD43B" ${tr}/>`;
    const b = a + Math.PI / 5;
    dots += `<circle cx="${n1(x + Math.cos(b) * 1.9 * s)}" cy="${n1(y + Math.sin(b) * 1.9 * s)}" r="${n1(0.42 * s)}" fill="#D9480F"/>`;
  }
  return o + f + `<circle cx="${n1(x)}" cy="${n1(y)}" r="${n1(1.3 * s)}" fill="#FF8A3D"/>` + dots;
}

/** A leaf as a pointed-but-soft ellipse, rotated. */
const leaf = (x: number, y: number, rx: number, ry: number, deg: number, fill: string, line: string): string =>
  `<ellipse cx="${n1(x)}" cy="${n1(y)}" rx="${n1(rx)}" ry="${n1(ry)}" fill="${fill}" stroke="${line}" stroke-width="0.9" transform="rotate(${n1(deg)} ${n1(x)} ${n1(y)})"/>`;

/** The scalloped fur band of the Santa hat, bulging down in the middle like a brim on a round head. */
function fluffBand(x0: number, x1: number, y0: number, y1: number, n: number): string {
  const sag = (x: number): number => 2.2 * (1 - ((2 * (x - x0)) / (x1 - x0) - 1) ** 2);
  const step = (x1 - x0) / n;
  const bump = step * 0.62;
  let d = `M${n1(x0)} ${n1(y0 + sag(x0))}`;
  for (let i = 1; i <= n; i++) {
    const x = x0 + i * step;
    d += `A${n1(bump)} ${n1(bump)} 0 0 1 ${n1(x)} ${n1(y0 + sag(x))}`;
  }
  d += `A${n1((y1 - y0) / 2)} ${n1((y1 - y0) / 2)} 0 0 1 ${n1(x1)} ${n1(y1 + sag(x1))}`;
  for (let i = n - 1; i >= 0; i--) {
    const x = x0 + i * step;
    d += `A${n1(bump)} ${n1(bump)} 0 0 1 ${n1(x)} ${n1(y1 + sag(x))}`;
  }
  return d + `A${n1((y1 - y0) / 2)} ${n1((y1 - y0) / 2)} 0 0 1 ${n1(x0)} ${n1(y0 + sag(x0))}Z`;
}

// ── Head pieces, drawn once around (0, 0) = where they sit on the head ─────────────────────────────
// `g` is the shared sheen gradient (white at the top, a soft shade at the bottom) laid over a fill.

const sheen = (d: string, g: string): string => `<path d="${d}" fill="${g}"/>`;

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

// Beanie: a mint knit dome with a ribbed cuff, a cream pom-pom and a tiny heart patch.
const BEANIE_DOME = "M-15.5 -4C-15.5 -14.5 -8.5 -19 0 -19C8.5 -19 15.5 -14.5 15.5 -4Z";
const BEANIE_CUFF = "M-17 -6Q0 -9 17 -6L17.2 0.6Q0 3.6 -17.2 0.6Z";
const BEANIE_RIBS = (() => {
  let d = "";
  for (let x = -13.5; x <= 13.6; x += 3) {
    const u = (x + 17) / 34, bow = 6 * u * (1 - u);
    d += `M${n1(x)} ${n1(-6 - bow + 1.3)}L${n1(x)} ${n1(0.6 + bow - 1.3)}`;
  }
  return d;
})();
const BEANIE = (g: string): string =>
  `<path d="${BEANIE_DOME}" fill="#86D3C1" stroke="#3B8574" stroke-width="1.8"/>` +
  sheen(BEANIE_DOME, g) +
  `<path d="M-9 -5Q-10 -12 -5 -17.2M0 -5L0 -18.6M9 -5Q10 -12 5 -17.2" fill="none" stroke="#3B8574" stroke-width="1.1" stroke-opacity="0.35"/>` +
  `<path d="${BEANIE_CUFF}" fill="#68BEAB" stroke="#3B8574" stroke-width="1.8"/>` +
  sheen(BEANIE_CUFF, g) +
  `<path d="${BEANIE_RIBS}" fill="none" stroke="#3B8574" stroke-width="1" stroke-opacity="0.4"/>` +
  `<path d="${heartD(10.2, -2.4, 1.5)}" fill="#FF8FB1" stroke="#C9577A" stroke-width="0.8"/>` +
  `<path d="${pom(0, -20.6, 4.8, 9)}" fill="#FFF7EC" stroke="#C7AF95" stroke-width="1.5"/>` +
  `<path d="M-2.4 -22.2Q-1.6 -23.6 0 -23.8" fill="none" stroke="#fff" stroke-width="1.2"/>`;

// Flower crown: a vine ring with five little flowers and leaves.
const FLOWERCROWN = (() => {
  let s =
    `<path d="M-15.5 -4Q0 -11.5 15.5 -4" fill="none" stroke="#6DB55A" stroke-width="1.5"/>` +
    `<path d="M-17.5 -3.5Q0 3.5 17.5 -3.5" fill="none" stroke="#4E9A3E" stroke-width="2"/>`;
  s += leaf(-11.2, -1.2, 2.6, 1.3, -20, "#8ED36F", "#4E9A3E") + leaf(11.2, -1.2, 2.6, 1.3, 20, "#8ED36F", "#4E9A3E");
  s += leaf(-3.8, 0.4, 2.4, 1.2, 25, "#8ED36F", "#4E9A3E") + leaf(3.8, 0.4, 2.4, 1.2, -25, "#8ED36F", "#4E9A3E");
  const fl: readonly [number, number, number, string, string][] = [
    [-15, -3.3, 0.92, "#D9C4FF", "#8C6CC9"],
    [-7.6, -1.7, 1, "#FFFFFF", "#C9A0A8"],
    [7.6, -1.7, 1, "#FFC896", "#C98040"],
    [15, -3.3, 0.92, "#FFFFFF", "#C9A0A8"],
    [0, -1.1, 1.18, "#FF9EC0", "#C9577A"],
  ];
  for (const [x, y, sc, fill, line] of fl) s += flower(x, y, sc, fill, line);
  return s;
})();

// Party hat: a periwinkle cone with pink and yellow rings, white dots, a white frill and a pink pom-pom.
const PARTY_CONE = "M-10 -1L-2.1 -23.6Q0 -26 2.1 -23.6L10 -1Q0 2.6 -10 -1Z";
const PARTYHAT = (g: string): string => {
  let frillO = "", frillF = "";
  for (let x = -9; x <= 9; x += 3) {
    const u = (x + 10) / 20, y = -1 + 7.2 * u * (1 - u) * 0.5 + 0.2;
    frillO += `<circle cx="${n1(x)}" cy="${n1(y)}" r="1.9" fill="#B9A6E0" stroke="#B9A6E0" stroke-width="1.6"/>`;
    frillF += `<circle cx="${n1(x)}" cy="${n1(y)}" r="1.9" fill="#fff"/>`;
  }
  return (
    `<g transform="rotate(9)">` +
    `<path d="${PARTY_CONE}" fill="#8EB8FF"/>` +
    `<path d="M-7.55 -8Q0 -6 7.55 -8L6.5 -11Q0 -9.2 -6.5 -11Z" fill="#FF8FB1"/>` +
    `<path d="M-4.93 -15.5Q0 -14 4.93 -15.5L4.06 -18Q0 -16.7 -4.06 -18Z" fill="#FFD54F"/>` +
    `<circle cx="-4.6" cy="-3.6" r="1.15" fill="#fff"/><circle cx="3.8" cy="-4.4" r="1.15" fill="#fff"/>` +
    `<circle cx="0.3" cy="-12.9" r="1" fill="#fff"/><circle cx="0.6" cy="-20.6" r="0.9" fill="#fff"/>` +
    sheen(PARTY_CONE, g) +
    `<path d="${PARTY_CONE}" fill="none" stroke="#4A6FC4" stroke-width="1.8"/>` +
    frillO +
    frillF +
    `<path d="${pom(0, -26.2, 4.2, 8)}" fill="#FF8FB1" stroke="#C9577A" stroke-width="1.5"/>` +
    `<path d="M-1.9 -27.6Q-1.2 -28.8 0.2 -29" fill="none" stroke="#fff" stroke-width="1.1" stroke-opacity="0.8"/>` +
    `</g>`
  );
};

// Nón lá: a wide straw cone with woven rings and ribs, a peek of the brim underneath and a painted lotus.
const NONLA_CONE = "M-23.6 -0.3L-2.4 -14.9Q0 -16.7 2.4 -14.9L23.6 -0.3Q0 3.8 -23.6 -0.3Z";
const NONLA = (g: string): string =>
  `<ellipse cx="0" cy="0" rx="23.6" ry="3.8" fill="#D9B46A" stroke="#A87B35" stroke-width="1.6"/>` +
  `<path d="${NONLA_CONE}" fill="#F7E0A3"/>` +
  sheen(NONLA_CONE, g) +
  `<path d="M0 -14L-14 1M0 -14L-5 1.7M0 -14L5 1.7M0 -14L14 1" fill="none" stroke="#C9A057" stroke-width="0.7" stroke-opacity="0.5"/>` +
  `<path d="M-16.3 -5.3Q0 -1.8 16.3 -5.3M-9.3 -10.1Q0 -7.6 9.3 -10.1" fill="none" stroke="#C9A057" stroke-width="1"/>` +
  `<path d="${NONLA_CONE}" fill="none" stroke="#A87B35" stroke-width="1.8"/>` +
  `<g fill="#FF9EBB" stroke="#D9577E" stroke-width="0.6">` +
  `<path d="M9.4 -3.4Q7.1 -5.4 7.6 -7.6Q9.9 -6.4 9.4 -3.4Z"/><path d="M9.4 -3.4Q11.7 -5.4 11.2 -7.6Q8.9 -6.4 9.4 -3.4Z"/>` +
  `<path d="M9.4 -3.4Q7.9 -6.6 9.4 -8.8Q10.9 -6.6 9.4 -3.4Z"/></g>`;

// Mai crown (Tết): a twig ring with three yellow apricot blossoms, buds and fresh leaves.
const MAICROWN = (() => {
  let s =
    `<path d="M-15 -4Q0 -11 15 -4" fill="none" stroke="#8A5A3A" stroke-width="1.3"/>` +
    `<path d="M-17.5 -3.4Q0 3.6 17.5 -3.4" fill="none" stroke="#7A4A2C" stroke-width="2"/>`;
  s += leaf(-6.2, 1.2, 2.6, 1.25, 28, "#9AD46A", "#5A9A33") + leaf(6.2, 1.2, 2.6, 1.25, -28, "#9AD46A", "#5A9A33");
  s += leaf(-16.4, -3.4, 2.3, 1.1, -50, "#9AD46A", "#5A9A33") + leaf(16.4, -3.4, 2.3, 1.1, 50, "#9AD46A", "#5A9A33");
  for (const x of [-6.6, 6.6]) s += `<circle cx="${x}" cy="-2.6" r="1.5" fill="#FFE57A" stroke="#D99A00" stroke-width="0.8"/>`;
  const fl: readonly [number, number, number][] = [[-12.4, -3.2, 0.95], [12.4, -3.2, 0.95], [0, -1.6, 1.18]];
  for (const [x, y, sc] of fl) s += mai(x, y, sc);
  return s;
})();

// Moon-rabbit ears (Trung Thu): a red headband, two fluffy ears (one flops a bit) and a crescent-moon charm.
const EAR_OUT = "M-3.8 1C-5.4 -8 -4.4 -18 0 -19.8C4.4 -18 5.4 -8 3.8 1Z";
const EAR_IN = "M-1.8 -1C-2.7 -8 -2.1 -14.6 0 -16.2C2.1 -14.6 2.7 -8 1.8 -1Z";
const BUNNYBAND = (g: string): string => {
  const ear = (tr: string): string =>
    `<g transform="${tr}"><path d="${EAR_OUT}" fill="#FFFFFF" stroke="#B48C98" stroke-width="1.8"/>${sheen(EAR_OUT, g)}<path d="${EAR_IN}" fill="#FFB3C4"/></g>`;
  return (
    ear("translate(-6.5 -3) rotate(-13)") +
    ear("translate(6.5 -3) rotate(22) scale(0.9)") +
    `<path d="M-16.5 1.5Q0 -9.5 16.5 1.5" fill="none" stroke="#A62C42" stroke-width="4.4"/>` +
    `<path d="M-16.5 1.5Q0 -9.5 16.5 1.5" fill="none" stroke="#F05A70" stroke-width="2.6"/>` +
    `<path d="M1 -7.8C-4.6 -7.6 -4.6 -1.6 1 -1.4C-2.2 -2.5 -2.2 -6.7 1 -7.8Z" fill="#FFD54F" stroke="#C99A0B" stroke-width="1"/>` +
    `<path d="${sparkle(3.4, -8.4, 1.8)}" fill="#FFE27A"/>`
  );
};

// Witch hat (Halloween): a crooked purple cone with a curled tip, an orange band, a star buckle, a twinkle.
const WITCH_BRIM = "M-20 -1.5A20 4.8 0 1 0 20 -1.5A20 4.8 0 1 0 -20 -1.5Z";
const WITCH_CONE =
  "M-10.5 -2.5C-9 -13 -5.5 -23 0 -29C3 -32.4 7.6 -32 9.2 -29.4C9.9 -28 8.6 -26.5 7 -27.3C4 -28.6 2.6 -24 3 -19C3.5 -12 7.5 -6 10.5 -2.5Q0 0.6 -10.5 -2.5Z";
const WITCHHAT = (g: string): string =>
  `<path d="${WITCH_BRIM}" fill="#5A3E9E" stroke="#2F1F63" stroke-width="1.8"/>` +
  sheen(WITCH_BRIM, g) +
  `<path d="${WITCH_CONE}" fill="#7C5CC4"/>` +
  sheen(WITCH_CONE, g) +
  `<path d="M-10.2 -3Q-9.9 -5 -9.6 -7Q0 -4.6 7.9 -7Q9 -5 10.2 -3Q0 0 -10.2 -3Z" fill="#FFA94D" stroke="#C4621A" stroke-width="1.2"/>` +
  `<path d="${WITCH_CONE}" fill="none" stroke="#3D2A80" stroke-width="1.8"/>` +
  `<path d="${star(0, -4.9, 2.6, 0.48)}" fill="#FFE27A" stroke="#C99A0B" stroke-width="0.8"/>` +
  `<path d="${sparkle(-3.4, -15, 2.1)}" fill="#FFE27A"/>` +
  `<circle cx="1.6" cy="-21.4" r="0.8" fill="#FFE27A"/>`;

// Santa hat (Christmas): a floppy red cap, a fluffy white trim, a pom-pom, a sprig of holly.
const SANTA_CONE =
  "M-13 -3C-13.5 -14 -6 -23.5 3 -24.8C9.5 -25.6 15 -21.5 17 -15C17.5 -13.2 15.8 -12.2 14.6 -13.6C12.6 -16.5 9.4 -17.6 7.8 -15C6.6 -11 10.6 -7 12.8 -3Z";
const SANTA_FUR = fluffBand(-15.5, 15.5, -7.6, 0.4, 7);
const SANTAHAT = (g: string): string =>
  `<path d="${SANTA_CONE}" fill="#E53935" stroke="#9E1B1B" stroke-width="1.8"/>` +
  sheen(SANTA_CONE, g) +
  `<path d="M-6.5 -18Q-2 -22 3.5 -22.6" fill="none" stroke="#fff" stroke-opacity="0.35" stroke-width="1.6"/>` +
  `<path d="${pom(15.8, -12.2, 4.6, 9)}" fill="#FFFFFF" stroke="#C9B3B3" stroke-width="1.5"/>` +
  `<path d="${SANTA_FUR}" fill="#FFFFFF" stroke="#C9B3B3" stroke-width="1.5"/>` +
  sheen(SANTA_FUR, g) +
  leaf(-11.4, -4.6, 2.6, 1.25, -32, "#43A047", "#2E7D32") +
  leaf(-7.6, -4.6, 2.6, 1.25, 32, "#43A047", "#2E7D32") +
  `<circle cx="-9.5" cy="-3.3" r="1.25" fill="#E53935" stroke="#9E1B1B" stroke-width="0.6"/>` +
  `<circle cx="-8" cy="-2.2" r="1.05" fill="#E53935" stroke="#9E1B1B" stroke-width="0.6"/>`;

interface HeadPiece {
  svg: string | ((g: string) => string);
  /** Box in hat units [x0, y0, x1, y1] around the anchor (y0 = top of the piece). */
  box: readonly [number, number, number, number];
}

const HEAD_PIECES: Partial<Record<Accessory, HeadPiece>> = {
  gradcap: { svg: GRADCAP, box: [-22, -18.5, 22, 7] },
  tophat: { svg: TOPHAT, box: [-17, -28, 17, 4.4] },
  crown: { svg: CROWN, box: [-14.5, -19, 14.5, 2.5] },
  beanie: { svg: BEANIE, box: [-17.5, -26.2, 17.5, 3.4] },
  flowercrown: { svg: FLOWERCROWN, box: [-18.6, -9.6, 18.6, 3] },
  maicrown: { svg: MAICROWN, box: [-18.6, -10.2, 18.6, 3] },
  bunnyband: { svg: BUNNYBAND, box: [-17.5, -24, 17.5, 2.6] },
  partyhat: { svg: PARTYHAT, box: [-10.8, -31.2, 13.2, 3.2] },
  nonla: { svg: NONLA, box: [-24.5, -17.2, 24.5, 4.8] },
  witchhat: { svg: WITCHHAT, box: [-20.6, -33.2, 20.6, 4] },
  santahat: { svg: SANTAHAT, box: [-16.6, -26.4, 21.2, 3.6] },
};
const HEAD_ORDER = Object.keys(HEAD_PIECES) as Accessory[];

/** Accessories that use the shared sheen gradient (`<id>-g`). */
const SHEENED: ReadonlySet<Accessory> = new Set<Accessory>([
  "beanie",
  "partyhat",
  "nonla",
  "bunnyband",
  "witchhat",
  "santahat",
  "bandana",
  "bellcollar",
]);

/** Head pieces with a sheen are built once per SVG id prefix. */
const headCache = new Map<string, Map<Accessory, string>>();

function headSvg(a: Accessory, piece: HeadPiece, g: string): string {
  if (typeof piece.svg === "string") return piece.svg;
  let m = headCache.get(g);
  if (!m) {
    if (headCache.size > 512) headCache.clear();
    m = new Map();
    headCache.set(g, m);
  }
  let s = m.get(a);
  if (s === undefined) {
    s = piece.svg(g);
    m.set(a, s);
  }
  return s;
}

const place = (x: number, y: number, s: number, rotDeg: number, inner: string): string =>
  `<g transform="translate(${r(x)} ${r(y)})${rotDeg ? ` rotate(${r(rotDeg)})` : ""} scale(${Math.round(s * 1000) / 1000})">${inner}</g>`;

/** `<defs>` entries the worn accessories (and the knitting) need: one soft sheen gradient. */
export function accessoryDefs(c: Ctx): string {
  let need = c.craft !== null;
  if (!need) for (const a of c.pose.wearing) if (SHEENED.has(a)) need = true;
  if (!need) return "";
  return (
    `<linearGradient id="${c.id}-g" x1="0" y1="0" x2="0" y2="1">` +
    `<stop offset="0" stop-color="#fff" stop-opacity="0.55"/><stop offset="0.45" stop-color="#fff" stop-opacity="0"/>` +
    `<stop offset="1" stop-color="#2a1a10" stop-opacity="0.16"/></linearGradient>`
  );
}

// ── Neck pieces ──────────────────────────────────────────────────────────────────────────────────

const neckPath = (c: Ctx, an: Anchors): string => {
  const { y, w, sag } = an.neck;
  return `M${p(c.cx - w * 0.6, y)}Q${p(c.cx, y + sag)} ${p(c.cx + w * 0.6, y)}`;
};

function scarf(c: Ctx, an: Anchors): string {
  const { y, w, sag } = an.neck;
  const cx = c.cx;
  const d = neckPath(c, an);
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

const BANDANA = "#FF8A3D";
const BANDANA_LINE = "#B9531A";

/** An orange kerchief: a band round the neck and a triangle on the chest with white dots and a tiny heart. */
function bandana(c: Ctx, an: Anchors): string {
  const { y, sag } = an.neck;
  const d = neckPath(c, an);
  const band = `<g clip-path="${c.clip}">${path(d, st(BANDANA_LINE, 6.4))}${path(d, st(BANDANA, 4.6))}</g>`;
  const x = c.cx + (c.fx - c.cx) * 0.6, y0 = y + sag * 0.5 - 2.4;
  const hw = 13 * U * 0.92, L = 15 * U * 0.92;
  const tri = `M${p(x - hw, y0)}Q${p(x, y0 + 3)} ${p(x + hw, y0)}L${p(x + 2.4, y0 + L - 1.6)}Q${p(x, y0 + L + 0.8)} ${p(x - 2.4, y0 + L - 1.6)}Z`;
  return (
    band +
    path(tri, `fill="${BANDANA}" stroke="${BANDANA_LINE}" stroke-width="1.6"`) +
    path(tri, `fill="url(#${c.id}-g)"`) +
    circle(x - hw * 0.55, y0 + 2.6, 0.95, `fill="#fff"`) +
    circle(x + hw * 0.55, y0 + 2.6, 0.95, `fill="#fff"`) +
    circle(x - 3, y0 + 8.4, 0.9, `fill="#fff"`) +
    circle(x + 3, y0 + 8.4, 0.9, `fill="#fff"`) +
    path(heartD(x, y0 + 5, 1.6), `fill="#fff"`)
  );
}

const TET_RED = "#D62828";
const TET_LINE = "#8E1414";
const TET_GOLD = "#FFD34D";

/** Red Tết scarf: gold edges and dots on the band, two tails with gold stripes, fringe and a blossom. */
function tetscarf(c: Ctx, an: Anchors): string {
  const { y, w, sag } = an.neck;
  const d = neckPath(c, an);
  const band =
    `<g clip-path="${c.clip}">` +
    path(d, st("#E0A100", 8.6)) +
    path(d, st(TET_RED, 6)) +
    path(d, `${st(TET_GOLD, 1.9)} stroke-dasharray="0.1 4.4"`) +
    `</g>`;
  const tx = c.cx + w * 0.24, ty = y + sag * 0.5;
  const sway = Math.sin(c.t * 4) * 4.6 * c.motion;
  const tail = (ang: number, len: number, flowerOn: boolean): string =>
    `<g transform="translate(${r(tx)} ${r(ty)}) rotate(${r(ang)})">` +
    `<rect x="-3.4" y="0" width="6.8" height="${len}" rx="2.2" fill="${TET_RED}" stroke="${TET_LINE}" stroke-width="1.2"/>` +
    `<path d="M-3.4 ${len - 3.4}H3.4" stroke="${TET_GOLD}" stroke-width="1.4"/>` +
    `<path d="M-2.4 ${len}v2.4M-0.8 ${len}v2.4M0.8 ${len}v2.4M2.4 ${len}v2.4" stroke="#E0A100" stroke-width="1"/>` +
    (flowerOn ? `<g transform="translate(0 4.6) scale(0.55)">${mai(0, 0, 1)}</g>` : "") +
    `</g>`;
  return band + tail(-4 + sway * 0.6, 11.5, false) + tail(16 + sway, 14.5, true);
}

/** Christmas bell collar: a red collar with stitches, a swinging golden bell and a sprig of holly. */
function bellcollar(c: Ctx, an: Anchors): string {
  const { y, sag } = an.neck;
  const d = neckPath(c, an);
  const band =
    `<g clip-path="${c.clip}">` +
    path(d, st("#8E1B1B", 6.2)) +
    path(d, st("#D83A3A", 4.4)) +
    path(d, `${st("#fff", 0.9)} stroke-opacity="0.75" stroke-dasharray="1.6 2.6"`) +
    `</g>`;
  const x = c.cx + (c.fx - c.cx) * 0.5, y0 = y + sag * 0.5 + 1.6;
  const swing = Math.sin(c.t * 3.2) * 9 * c.motion;
  const s = U * 1.18;
  const bell =
    `<g transform="translate(${r(x)} ${r(y0)}) rotate(${r(swing)}) scale(${s})">` +
    `<circle cx="0" cy="0.6" r="1.4" fill="none" stroke="#A8740A" stroke-width="1"/>` +
    `<circle cx="0" cy="5.4" r="4.4" fill="#FFD24D" stroke="#A8740A" stroke-width="1.3"/>` +
    `<circle cx="0" cy="5.4" r="4.4" fill="url(#${c.id}-g)"/>` +
    `<path d="M-4.1 4.4Q0 5.6 4.1 4.4" fill="none" stroke="#A8740A" stroke-width="0.9"/>` +
    `<path d="M-2.1 7.4L2.1 7.4" stroke="#7A5205" stroke-width="1.1"/>` +
    `<circle cx="-2.1" cy="7.4" r="0.75" fill="#7A5205"/><circle cx="2.1" cy="7.4" r="0.75" fill="#7A5205"/>` +
    `<circle cx="-1.6" cy="3.6" r="1.1" fill="#fff" fill-opacity="0.85"/>` +
    `</g>`;
  const hx = x - 7 * s, hy = y0 - 0.6;
  const holly =
    leaf(hx - 1.6, hy, 2.7, 1.3, -30, "#43A047", "#2E7D32") +
    leaf(hx + 1.4, hy - 0.4, 2.7, 1.3, 30, "#43A047", "#2E7D32") +
    circle(hx, hy + 1, 1.2, `fill="#E53935" stroke="#9E1B1B" stroke-width="0.6"`) +
    circle(hx + 1.6, hy + 1.8, 1, `fill="#E53935" stroke="#9E1B1B" stroke-width="0.6"`);
  return band + holly + bell;
}

// ── Glasses (they sit on the eyes and turn with the face) ──────────────────────────────────────────

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

/** A small arched bridge between two lenses whose inner edges are `half` from each eye center. */
function bridge(c: Ctx, half: number, g: number, color: string, width: number): string {
  const gap = c.ex - half;
  if (gap <= -1) return "";
  const x0 = c.fx - gap - 0.6, x1 = c.fx + gap + 0.6;
  return path(`M${p(x0, c.ey - 1.5 * g)}Q${p(c.fx, c.ey - 4.2 * g)} ${p(x1, c.ey - 1.5 * g)}`, st(color, width));
}

/** Round glasses: warm brown rims, clear lenses (the eyes show through), a glint, little temples. */
function roundglasses(c: Ctx, an: Anchors): string {
  const g = U * (an.glasses ?? 1);
  const R = 7.4 * g;
  const frame = "#8A5A2B";
  let out = "";
  for (const side of [-1, 1]) {
    const x = c.fx + side * c.ex;
    out += path(`M${p(x + side * R, c.ey - 0.8 * g)}l${r(side * 3.4 * g)} ${r(-1.4 * g)}`, st(frame, 1.7 * g));
    out += circle(x, c.ey, R, `fill="#EAF6FF" fill-opacity="0.25" stroke="${frame}" stroke-width="${r(1.9 * g)}"`);
    out += path(`M${p(x - R * 0.62, c.ey - R * 0.12)}Q${p(x - R * 0.58, c.ey - R * 0.55)} ${p(x - R * 0.18, c.ey - R * 0.66)}`, `${st("#fff", 1.3)} stroke-opacity="0.9"`);
  }
  return out + bridge(c, R, g, frame, 1.7 * g);
}

/** Heart glasses: rosy see-through heart lenses with a pink rim and a shine. */
function heartglasses(c: Ctx, an: Anchors): string {
  const g = U * (an.glasses ?? 1);
  const s = 6.9 * g;
  let out = "";
  for (const side of [-1, 1]) {
    const x = c.fx + side * c.ex, y = c.ey + 0.4 * g;
    out += path(heartD(x, y, s), `fill="#FF6F9C" fill-opacity="0.68" stroke="#D63A6E" stroke-width="${r(1.8 * g)}"`);
    out += ell(x - s * 0.62, y - s * 0.62, s * 0.2, s * 0.13, `fill="#fff" fill-opacity="0.85" transform="rotate(-35 ${r(x - s * 0.62)} ${r(y - s * 0.62)})"`);
  }
  return out + bridge(c, s * 1.05, g, "#D63A6E", 1.7 * g);
}

/** Star glasses: chubby gold star frames (two-tone, so the rim reads), sky-blue lenses, a twinkle. */
function starglasses(c: Ctx, an: Anchors): string {
  const g = U * (an.glasses ?? 1);
  const R = 9.4 * g;
  let out = "";
  for (const side of [-1, 1]) {
    const x = c.fx + side * c.ex, y = c.ey + 0.6 * g;
    const d = star(x, y, R, 0.58, side * 0.14);
    out += path(d, `fill="#9ED8FF" fill-opacity="0.5" stroke="#C98A0B" stroke-width="${r(3 * g)}"`);
    out += path(d, `fill="none" stroke="#FFD54F" stroke-width="${r(1.5 * g)}"`);
    out += path(sparkle(x - R * 0.32, y - R * 0.18, R * 0.2), `fill="#fff" fill-opacity="0.9"`);
  }
  return out + bridge(c, R * 0.75, g, "#C98A0B", 1.8 * g);
}

const GLASSES: readonly [Accessory, (c: Ctx, an: Anchors) => string][] = [
  ["sunglasses", sunglasses],
  ["roundglasses", roundglasses],
  ["heartglasses", heartglasses],
  ["starglasses", starglasses],
];

// ── Layout support ────────────────────────────────────────────────────────────────────────────────

/** Topmost y reached by worn head pieces (for keeping the pet inside the view). */
export function accessoryTop(an: Anchors, wearing: readonly Accessory[]): number {
  let top = Infinity;
  for (const a of wearing) {
    const piece = HEAD_PIECES[a];
    if (piece) top = Math.min(top, an.head.y + piece.box[1] * an.head.s * U * HAT);
    else if (a === "bow") top = Math.min(top, an.bow.y - 9 * (an.bow.s ?? 1) * U);
  }
  return top;
}

/** Corners of each worn head piece's box in local space (wide brims, tilted hats), for the layout bounds. */
export function accessoryPoints(an: Anchors, wearing: readonly Accessory[]): [number, number][] {
  const out: [number, number][] = [];
  if (wearing.length === 0) return out;
  const s = an.head.s * U * HAT;
  const a = ((an.head.rot ?? 0) * Math.PI) / 180;
  const cs = Math.cos(a) * s, sn = Math.sin(a) * s;
  for (const w of wearing) {
    const piece = HEAD_PIECES[w];
    if (!piece) continue;
    const [x0, y0, x1, y1] = piece.box;
    for (const [x, y] of [[x0, y0], [x1, y0], [x0, y1], [x1, y1]] as const) {
      out.push([an.head.x + x * cs - y * sn, an.head.y + x * sn + y * cs]);
    }
  }
  return out;
}

export function accessories(c: Ctx, an: Anchors): string {
  const wearing = c.pose.wearing;
  if (wearing.length === 0) return "";
  let out = "";
  if (wearing.includes("scarf")) out += scarf(c, an);
  if (wearing.includes("bandana")) out += bandana(c, an);
  if (wearing.includes("tetscarf")) out += tetscarf(c, an);
  if (wearing.includes("bellcollar")) out += bellcollar(c, an);
  if (c.mood !== "sleeping" && !c.held) {
    let glasses = "";
    for (const [a, draw] of GLASSES) if (wearing.includes(a)) glasses += draw(c, an);
    if (glasses) out += c.faceTurn ? `<g${c.faceTurn}>${glasses}</g>` : glasses;
  }
  if (wearing.includes("bow")) out += place(an.bow.x, an.bow.y, U * (an.bow.s ?? 1), an.bow.rot ?? 0, BOW);
  const g = `url(#${c.id}-g)`;
  for (const a of HEAD_ORDER) {
    if (!wearing.includes(a)) continue;
    out += place(an.head.x, an.head.y, U * HAT * an.head.s, an.head.rot ?? 0, headSvg(a, HEAD_PIECES[a]!, g));
  }
  return out;
}

const BOW =
  `<path d="M0 0C-4 -7 -11 -8 -10.5 -1C-10 5 -4 4 0 0Z" fill="#FF6F96" stroke="#B83A62" stroke-width="1.6"/>` +
  `<path d="M0 0C4 -7 11 -8 10.5 -1C10 5 4 4 0 0Z" fill="#FF6F96" stroke="#B83A62" stroke-width="1.6"/>` +
  `<path d="M-1 1.5L-4.5 8.5L-1.5 7.5ZM1 1.5L4.5 8.5L1.5 7.5Z" fill="#FF6F96" stroke="#B83A62" stroke-width="1.2"/>` +
  `<path d="M-7.5 -3.5Q-6.5 -5.5 -4.5 -5M7.5 -3.5Q6.5 -5.5 4.5 -5" fill="none" stroke="#fff" stroke-opacity="0.6" stroke-width="1.2"/>` +
  `<circle cx="0" cy="0" r="2.7" fill="#FF8FB0" stroke="#B83A62" stroke-width="1.4"/>`;
