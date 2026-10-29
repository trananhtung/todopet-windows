// Home decorations the pet knits during focus sessions (v0.5): twelve little 64×64 pictures in the pets'
// style (tinted outlines, soft gradients, rounded corners), each with one tiny cute detail. Pure: the same
// id and options always give the same SVG.
import type { DecorId } from "../core/types";
import { sparkle } from "./svg";

export interface DecorOptions {
  /** Outer width/height in px (default 64; the viewBox is always 0 0 64 64). */
  size?: number;
  /** Prefix for gradient and pattern ids so several decorations can share a page (default "decor-<id>"). */
  idPrefix?: string;
}

const n = (v: number): string => String(Math.round(v * 100) / 100);

/** A vertical linear gradient def. */
const lin = (id: string, top: string, bottom: string): string =>
  `<linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${top}"/><stop offset="1" stop-color="${bottom}"/></linearGradient>`;

/** A soft radial glow def: `color` in the middle fading out. */
const glow = (id: string, color: string, a: number): string =>
  `<radialGradient id="${id}"><stop offset="0" stop-color="${color}" stop-opacity="${a}"/>` +
  `<stop offset="0.55" stop-color="${color}" stop-opacity="${n(a * 0.45)}"/><stop offset="1" stop-color="${color}" stop-opacity="0"/></radialGradient>`;

/** Soft contact shadow on the floor. */
const shadow = (rx: number, y = 58.6): string => `<ellipse cx="32" cy="${y}" rx="${rx}" ry="2.8" fill="#3a2a1e" fill-opacity="0.13"/>`;

const heart = (x: number, y: number, s: number): string =>
  `M${n(x)} ${n(y + s * 0.9)}C${n(x - s * 1.7)} ${n(y - s * 0.1)} ${n(x - s * 0.75)} ${n(y - s * 1.35)} ${n(x)} ${n(y - s * 0.45)}` +
  `C${n(x + s * 0.75)} ${n(y - s * 1.35)} ${n(x + s * 1.7)} ${n(y - s * 0.1)} ${n(x)} ${n(y + s * 0.9)}Z`;

/** Five-point star, first point up. */
function star(x: number, y: number, R: number, inner: number): string {
  let d = "";
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 ? R * inner : R;
    d += `${i ? "L" : "M"}${n(x + Math.cos(a) * rr)} ${n(y + Math.sin(a) * rr)}`;
  }
  return d + "Z";
}

/** A music note (♪): head, stem and flag. */
const note = (x: number, y: number, s: number, color: string): string =>
  `<ellipse cx="${n(x)}" cy="${n(y)}" rx="${n(2.3 * s)}" ry="${n(1.7 * s)}" fill="${color}" transform="rotate(-20 ${n(x)} ${n(y)})"/>` +
  `<path d="M${n(x + 2 * s)} ${n(y - 0.4 * s)}V${n(y - 8 * s)}Q${n(x + 4.6 * s)} ${n(y - 6.6 * s)} ${n(x + 5.2 * s)} ${n(y - 4 * s)}" fill="none" stroke="${color}" stroke-width="${n(1.3 * s)}"/>`;

type Part = { defs: string; body: string };

// ── The twelve decorations ─────────────────────────────────────────────────────────────────────

/** An oval rug with a cream ring, fringes and a little heart in the middle. */
function rug(P: string): Part {
  return {
    defs: lin(`${P}-a`, "#FFC2CF", "#FFA6B6"),
    body:
      `<ellipse cx="32" cy="50" rx="29" ry="10" fill="#3a2a1e" fill-opacity="0.1"/>` +
      `<path d="M3.4 46.6l-2.6 -1M3 49.6h-2.8M3.4 52.8l-2.6 1M60.6 46.6l2.6 -1M61 49.6h2.8M60.6 52.8l2.6 1" fill="none" stroke="#C9707E" stroke-width="1.3"/>` +
      `<ellipse cx="32" cy="49.4" rx="28.5" ry="9.6" fill="url(#${P}-a)" stroke="#C9707E" stroke-width="2"/>` +
      `<ellipse cx="32" cy="49.4" rx="21.5" ry="7" fill="none" stroke="#FFF3E6" stroke-width="2.2"/>` +
      `<ellipse cx="32" cy="49.4" rx="21.5" ry="7" fill="none" stroke="#E68FA3" stroke-width="0.8" stroke-dasharray="1.4 2.2"/>` +
      `<ellipse cx="32" cy="49.4" rx="13" ry="4.3" fill="#FFE3EA" stroke="#E68FA3" stroke-width="1.2"/>` +
      `<path d="${heart(32, 49.6, 2.6)}" fill="#FF6F96" stroke="#D63A6E" stroke-width="0.9"/>`,
  };
}

/** A terracotta pot with a sleepy-happy face and round leaves. */
function plant(P: string): Part {
  const leaves: readonly [number, number, number][] = [[21.5, 25, 6.4], [41, 20.5, 7], [31.5, 12.5, 6.2], [45.5, 31.5, 5], [18.5, 34.5, 4.6]];
  let stems = "", leafs = "";
  for (const [x, y, rr] of leaves) {
    stems += `M32 37Q${n((32 + x) / 2)} ${n(y + 8)} ${n(x)} ${n(y + rr * 0.55)}`;
    leafs += `<circle cx="${n(x)}" cy="${n(y)}" r="${n(rr)}" fill="url(#${P}-b)" stroke="#3E7F2E" stroke-width="1.6"/>`;
    leafs += `<path d="M${n(x)} ${n(y + rr * 0.55)}L${n(x + rr * 0.15)} ${n(y - rr * 0.45)}" fill="none" stroke="#3E7F2E" stroke-width="0.9" stroke-opacity="0.5"/>`;
    leafs += `<circle cx="${n(x - rr * 0.35)}" cy="${n(y - rr * 0.35)}" r="${n(rr * 0.22)}" fill="#fff" fill-opacity="0.45"/>`;
  }
  return {
    defs: lin(`${P}-a`, "#F7A77A", "#D9734A") + lin(`${P}-b`, "#9FDD7C", "#5DAF4A"),
    body:
      shadow(15) +
      `<path d="${stems}" fill="none" stroke="#4E8E3A" stroke-width="1.7"/>` +
      leafs +
      `<path d="M20 40L44 40L41.2 57Q32 59.4 22.8 57Z" fill="url(#${P}-a)" stroke="#9C4A2B" stroke-width="2"/>` +
      `<rect x="17.5" y="35.6" width="29" height="6.4" rx="2.6" fill="#F4A274" stroke="#9C4A2B" stroke-width="2"/>` +
      `<path d="M20.5 37.6H30" stroke="#fff" stroke-opacity="0.45" stroke-width="1.3"/>` +
      // The pot's face: closed happy eyes, a small smile, rosy cheeks.
      `<path d="M26.6 48.6Q28 47.2 29.4 48.6M34.6 48.6Q36 47.2 37.4 48.6" fill="none" stroke="#5A2A1E" stroke-width="1.3"/>` +
      `<path d="M30.4 51Q32 52.6 33.6 51" fill="none" stroke="#5A2A1E" stroke-width="1.2"/>` +
      `<ellipse cx="25.2" cy="51.2" rx="2.2" ry="1.3" fill="#FF7F8F" fill-opacity="0.55"/><ellipse cx="38.8" cy="51.2" rx="2.2" ry="1.3" fill="#FF7F8F" fill-opacity="0.55"/>`,
  };
}

/** A glowing mushroom lamp with white spots and a heart-shaped pull charm. */
function lamp(P: string): Part {
  const cap = "M7.5 32C7.5 11.5 56.5 11.5 56.5 32Q32 37.5 7.5 32Z";
  return {
    defs: glow(`${P}-g`, "#FFE08A", 0.75) + lin(`${P}-a`, "#FF9A8A", "#E2574C") + lin(`${P}-b`, "#FFF7E6", "#EED6B0"),
    body:
      `<circle cx="32" cy="30" r="31" fill="url(#${P}-g)"/>` +
      shadow(14) +
      `<ellipse cx="32" cy="56" rx="13" ry="3.4" fill="#E6C69A" stroke="#B08A5E" stroke-width="1.8"/>` +
      `<path d="M27 33L26 54.5Q32 57 38 54.5L37 33Z" fill="url(#${P}-b)" stroke="#B08A5E" stroke-width="1.8"/>` +
      `<path d="M11.5 32Q32 39.5 52.5 32" fill="#FFE9B8" stroke="#E2A04C" stroke-width="1"/>` +
      `<path d="${cap}" fill="url(#${P}-a)" stroke="#A8382E" stroke-width="2"/>` +
      `<ellipse cx="20" cy="24.5" rx="3.6" ry="3" fill="#fff"/><ellipse cx="33" cy="18.2" rx="3.2" ry="2.6" fill="#fff"/>` +
      `<ellipse cx="44.6" cy="25.4" rx="3.8" ry="3" fill="#fff"/><ellipse cx="27" cy="29.6" rx="1.8" ry="1.4" fill="#fff"/>` +
      `<ellipse cx="51" cy="30" rx="1.4" ry="1.1" fill="#fff"/>` +
      `<path d="M14 22Q18 16 25 14" fill="none" stroke="#fff" stroke-opacity="0.5" stroke-width="1.6"/>` +
      `<path d="M45 35V42.5" stroke="#B08A5E" stroke-width="1" stroke-dasharray="0.1 1.6"/>` +
      `<path d="${heart(45, 44.4, 1.9)}" fill="#FFC93C" stroke="#B8860B" stroke-width="0.8"/>`,
  };
}

/** A plump lilac floor cushion with a button, golden corner tassels and an embroidered star. */
function cushion(P: string): Part {
  const body = "M10 23Q32 16.5 54 23Q58.5 38 54 52Q32 57.5 10 52Q5.5 38 10 23Z";
  let tassels = "";
  for (const [x, y, sx, sy] of [[10, 23, -1, -1], [54, 23, 1, -1], [10, 52, -1, 1], [54, 52, 1, 1]] as const) {
    tassels += `<path d="M${x} ${y}l${2.6 * sx} ${2 * sy}M${x} ${y}l${1 * sx} ${3.2 * sy}M${x} ${y}l${3.2 * sx} ${0.8 * sy}" fill="none" stroke="#E0A100" stroke-width="1.2"/>`;
    tassels += `<circle cx="${x}" cy="${y}" r="1.7" fill="#FFC93C" stroke="#B8860B" stroke-width="0.7"/>`;
  }
  return {
    defs: lin(`${P}-a`, "#E3D6FF", "#B39DF0"),
    body:
      shadow(22) +
      tassels +
      `<path d="${body}" fill="url(#${P}-a)" stroke="#6E57B8" stroke-width="2"/>` +
      `<path d="M13 26Q32 20.5 51 26" fill="none" stroke="#fff" stroke-opacity="0.5" stroke-width="1.6"/>` +
      `<path d="M32 37.5L25.5 31M32 37.5L38.5 31M32 37.5L25.5 44M32 37.5L38.5 44" fill="none" stroke="#6E57B8" stroke-width="1" stroke-opacity="0.35"/>` +
      `<circle cx="32" cy="37.5" r="2.7" fill="#9C84E0" stroke="#6E57B8" stroke-width="1"/>` +
      `<circle cx="31.2" cy="36.7" r="0.8" fill="#fff" fill-opacity="0.7"/>` +
      `<path d="${star(19.5, 31, 3.4, 0.5)}" fill="#FFE27A" stroke="#E0A100" stroke-width="0.8"/>` +
      `<path d="M45 45.4q1.4 -1.2 2.8 0" fill="none" stroke="#fff" stroke-opacity="0.7" stroke-width="1" stroke-dasharray="0.8 1"/>`,
  };
}

/** A little wooden bookshelf with colorful books and a rubber duck reading along. */
function bookshelf(P: string): Part {
  const books = (y: number, list: readonly [number, number, number, string, number?][]): string => {
    let s = "";
    for (const [x, w, h, c, rot] of list) {
      const tr = rot ? ` transform="rotate(${rot} ${n(x + w / 2)} ${y})"` : "";
      s += `<g${tr}><rect x="${n(x)}" y="${n(y - h)}" width="${n(w)}" height="${n(h)}" rx="1" fill="${c}" stroke="#5A3A22" stroke-width="1.1"/>`;
      s += `<path d="M${n(x + 1)} ${n(y - h + 3)}H${n(x + w - 1)}M${n(x + 1)} ${n(y - 3)}H${n(x + w - 1)}" stroke="#fff" stroke-opacity="0.6" stroke-width="0.9"/></g>`;
    }
    return s;
  };
  return {
    defs: lin(`${P}-a`, "#D9A06C", "#B07844"),
    body:
      shadow(26) +
      `<rect x="7.5" y="8.5" width="49" height="50" rx="3.2" fill="url(#${P}-a)" stroke="#6E4425" stroke-width="2"/>` +
      `<rect x="11.5" y="12.5" width="41" height="18.5" rx="1.4" fill="#8C5A33"/>` +
      `<rect x="11.5" y="35" width="41" height="19.5" rx="1.4" fill="#8C5A33"/>` +
      books(31, [[13, 5, 15, "#FF8FA3"], [18.4, 4.2, 13, "#7FB8F0"], [23, 5.6, 16.5, "#FFD54F"], [29, 4.4, 14, "#8ED36F"], [36.4, 4.6, 13.2, "#C9A7F5", 14]]) +
      books(54.5, [[13, 5.4, 15.5, "#7FB8F0"], [18.8, 4.4, 13, "#FFB36B"], [23.6, 5, 16, "#FF8FA3"], [29, 4, 12.5, "#6CCFB6"]]) +
      // A little potted cactus on the top shelf…
      `<path d="M44.5 24.5Q44.5 17.5 47 17.5Q49.5 17.5 49.5 24.5Z" fill="#7CC46A" stroke="#3E7F2E" stroke-width="1"/>` +
      `<path d="M43.5 24.5H50.5L49.6 31H44.4Z" fill="#F4A274" stroke="#9C4A2B" stroke-width="1"/>` +
      `<circle cx="47" cy="17.2" r="1.1" fill="#FF8FB1"/>` +
      // …and a rubber duck reading on the bottom one.
      `<ellipse cx="43.5" cy="50.6" rx="6" ry="4" fill="#FFD54F" stroke="#C99A0B" stroke-width="1.1"/>` +
      `<circle cx="46.6" cy="45.4" r="3.4" fill="#FFD54F" stroke="#C99A0B" stroke-width="1.1"/>` +
      `<path d="M49.6 45.6Q52.2 45.8 51.6 47.2Q50.4 47.6 49.4 46.8Z" fill="#FF9A3D" stroke="#C25A1A" stroke-width="0.7"/>` +
      `<circle cx="47.4" cy="44.6" r="0.75" fill="#3A2A1E"/>` +
      `<ellipse cx="46.2" cy="46.8" rx="1" ry="0.6" fill="#FF8FA3" fill-opacity="0.7"/>` +
      `<rect x="10" y="31" width="44" height="4" rx="1" fill="#C98F5E" stroke="#6E4425" stroke-width="1.4"/>`,
  };
}

/** A cozy mug of cocoa with a heart on it and steam curling up. */
function mug(P: string): Part {
  return {
    defs: lin(`${P}-a`, "#FFFBF4", "#F0DEC6"),
    body:
      shadow(17) +
      `<path d="M24 20Q20.5 15 24 11M31 19Q27 13.5 31.5 8.5M38 20Q34.5 15 38 11" fill="none" stroke="#C9B8A6" stroke-width="1.8" stroke-opacity="0.75"/>` +
      `<path d="M45 31C55 30 55.5 47.5 44.5 47" fill="none" stroke="#B08A6A" stroke-width="5.6"/>` +
      `<path d="M45 31C55 30 55.5 47.5 44.5 47" fill="none" stroke="#FFF6EA" stroke-width="2.6"/>` +
      `<path d="M14 25L15.6 52.5Q16 57 21 57H39Q44 57 44.4 52.5L46 25Z" fill="url(#${P}-a)" stroke="#B08A6A" stroke-width="2"/>` +
      `<ellipse cx="30" cy="25" rx="16" ry="3.8" fill="#8A5A3A" stroke="#B08A6A" stroke-width="2"/>` +
      `<ellipse cx="27" cy="24.4" rx="2.4" ry="1.2" fill="#fff" fill-opacity="0.85"/><ellipse cx="33.5" cy="25.2" rx="2" ry="1" fill="#fff" fill-opacity="0.85"/>` +
      `<path d="M18 30L19.2 50" stroke="#fff" stroke-opacity="0.6" stroke-width="1.8"/>` +
      `<path d="${heart(30, 40.6, 5.2)}" fill="#FF6F96" stroke="#D63A6E" stroke-width="1.3"/>` +
      `<path d="M26 37.2Q26.6 35.6 28.2 35.4" fill="none" stroke="#fff" stroke-opacity="0.8" stroke-width="1.1"/>`,
  };
}

/** A poster taped to the wall: mountains under a smiling sun. */
function poster(P: string): Part {
  return {
    defs: lin(`${P}-a`, "#BDE6FF", "#FFE3F0") + lin(`${P}-b`, "#8FD49A", "#5DAF7A"),
    body:
      `<rect x="10" y="7.5" width="44" height="50" rx="2.2" fill="#3a2a1e" fill-opacity="0.1" transform="translate(1.2 1.6)"/>` +
      `<rect x="10" y="7.5" width="44" height="50" rx="2.2" fill="#FFFDF7" stroke="#C9B8A0" stroke-width="1.8"/>` +
      `<rect x="14" y="11.5" width="36" height="34" rx="1.2" fill="url(#${P}-a)"/>` +
      `<path d="M14 39L22.4 27.6Q24 25.6 25.6 27.6L31 34.4L36.6 26.6Q38.2 24.6 39.8 26.6L50 39V45.5H14Z" fill="url(#${P}-b)"/>` +
      `<path d="M22.6 28.8L24 27.4L25.2 28.8M36.8 27.8L38.2 26.2L39.6 27.8" fill="none" stroke="#fff" stroke-width="1.4"/>` +
      `<ellipse cx="22" cy="19" rx="4" ry="1.8" fill="#fff"/><ellipse cx="25.2" cy="18" rx="2.6" ry="1.8" fill="#fff"/>` +
      `<circle cx="41" cy="19.6" r="5" fill="#FFD54F" stroke="#E0A100" stroke-width="1"/>` +
      `<circle cx="39.4" cy="19" r="0.7" fill="#5A3A22"/><circle cx="42.6" cy="19" r="0.7" fill="#5A3A22"/>` +
      `<path d="M39.8 21Q41 22.2 42.2 21" fill="none" stroke="#5A3A22" stroke-width="0.8"/>` +
      `<ellipse cx="38.4" cy="20.8" rx="0.9" ry="0.5" fill="#FF8FA3" fill-opacity="0.8"/><ellipse cx="43.6" cy="20.8" rx="0.9" ry="0.5" fill="#FF8FA3" fill-opacity="0.8"/>` +
      `<rect x="14" y="11.5" width="36" height="34" rx="1.2" fill="none" stroke="#C9B8A0" stroke-width="1"/>` +
      `<path d="M20 50.5H44M24 53.6H40" stroke="#D9CBB8" stroke-width="1.6"/>` +
      `<rect x="5.5" y="5.5" width="11" height="4.6" rx="0.8" fill="#FF9EBB" fill-opacity="0.8" transform="rotate(-32 11 7.8)"/>` +
      `<rect x="47.5" y="5.5" width="11" height="4.6" rx="0.8" fill="#9ED8FF" fill-opacity="0.85" transform="rotate(32 53 7.8)"/>`,
  };
}

/** Bunting: a string of pastel pennants, the middle one with a heart. */
function garland(_P: string): Part {
  const colors = ["#FF9EBB", "#FFD54F", "#86D3C1", "#C9A7F5", "#FFB36B", "#9ED8FF"];
  const lines = ["#D9577E", "#C99A0B", "#3B8574", "#7E5BC4", "#C2702A", "#3A8DC7"];
  // String: quadratic from (3, 16) via (32, 40) to (61, 16).
  const at = (u: number): [number, number, number] => {
    const x = (1 - u) ** 2 * 3 + 2 * u * (1 - u) * 32 + u * u * 61;
    const y = (1 - u) ** 2 * 16 + 2 * u * (1 - u) * 40 + u * u * 16;
    const dx = 2 * (1 - u) * 29 + 2 * u * 29, dy = 2 * (1 - u) * 24 - 2 * u * 24;
    return [x, y, (Math.atan2(dy, dx) * 180) / Math.PI];
  };
  let flags = "";
  for (let i = 0; i < 6; i++) {
    const [x, y, deg] = at(0.1 + i * 0.16);
    flags +=
      `<g transform="translate(${n(x)} ${n(y)}) rotate(${n(deg)})">` +
      `<path d="M-4.6 0L4.6 0L1.2 10.6Q0 12.2 -1.2 10.6Z" fill="${colors[i]}" stroke="${lines[i]}" stroke-width="1.3"/>` +
      `<path d="M-3 1.6L-1 7" stroke="#fff" stroke-opacity="0.55" stroke-width="1"/>` +
      (i === 2 || i === 3 ? `<path d="${heart(0, 4.4, 1.5)}" fill="#fff"/>` : `<circle cx="0" cy="4" r="1" fill="#fff" fill-opacity="0.85"/>`) +
      `</g>`;
  }
  return {
    defs: "",
    body:
      `<path d="M3 16Q32 40 61 16" fill="none" stroke="#8A6A4A" stroke-width="1.5"/>` +
      `<circle cx="3" cy="16" r="2" fill="#C9A25E" stroke="#8A6A4A" stroke-width="1"/><circle cx="61" cy="16" r="2" fill="#C9A25E" stroke="#8A6A4A" stroke-width="1"/>` +
      flags,
  };
}

/** A round fishbowl with pebbles, a weed, bubbles and a little orange fish with rosy cheeks. */
function fishbowl(P: string): Part {
  return {
    defs: lin(`${P}-a`, "#BDEBFF", "#6FBFEA"),
    body:
      shadow(16) +
      `<path d="M17.5 24A19.5 19.5 0 1 0 46.5 24Z" fill="url(#${P}-a)" fill-opacity="0.9"/>` +
      `<ellipse cx="32" cy="24" rx="14.5" ry="1.9" fill="#DDF5FF"/>` +
      `<path d="M20 52Q19 46 22 41Q24.5 37 22.5 32M24 53Q25.5 47 24.4 43" fill="none" stroke="#5DAF4A" stroke-width="2"/>` +
      `<ellipse cx="25" cy="53.6" rx="3.4" ry="1.8" fill="#FFB3C4"/><ellipse cx="31" cy="54.6" rx="3" ry="1.6" fill="#FFE08A"/>` +
      `<ellipse cx="37" cy="54" rx="3.6" ry="1.8" fill="#C9A7F5"/><ellipse cx="42.4" cy="52.4" rx="2.4" ry="1.4" fill="#9ED8FF"/>` +
      // The fish, facing left, with a tail, fin, eye and blush.
      `<path d="M41 38.4L46.5 34.4Q47.6 38.4 46.5 42.4Z" fill="#FFB36B" stroke="#C25A1A" stroke-width="1.1"/>` +
      `<ellipse cx="35" cy="38.4" rx="6.6" ry="4.6" fill="#FF9A3D" stroke="#C25A1A" stroke-width="1.3"/>` +
      `<path d="M34 34.2Q36.6 31.6 38.6 34.4" fill="#FFB36B" stroke="#C25A1A" stroke-width="1"/>` +
      `<circle cx="31.4" cy="37.4" r="1.25" fill="#3A2A1E"/><circle cx="31" cy="37" r="0.45" fill="#fff"/>` +
      `<ellipse cx="32.6" cy="40.2" rx="1.3" ry="0.7" fill="#FF6F96" fill-opacity="0.6"/>` +
      `<circle cx="27" cy="33" r="1.2" fill="none" stroke="#fff" stroke-width="0.8"/><circle cx="25.4" cy="29" r="1.7" fill="none" stroke="#fff" stroke-width="0.8"/>` +
      `<path d="M24.2 17.5A21 21 0 1 0 39.8 17.5" fill="#fff" fill-opacity="0.12" stroke="#7FB0CF" stroke-width="2"/>` +
      `<ellipse cx="32" cy="17.5" rx="7.8" ry="1.8" fill="none" stroke="#7FB0CF" stroke-width="1.8"/>` +
      `<path d="M16.5 32Q17.5 25 22.5 21.5" fill="none" stroke="#fff" stroke-opacity="0.85" stroke-width="2"/>`,
  };
}

/** A mint retro radio playing: speaker grille, tuning dial, knobs, antenna and floating notes. */
function radio(P: string): Part {
  let holes = "";
  for (let i = -2; i <= 2; i++) {
    for (let j = -2; j <= 2; j++) {
      if (i * i + j * j > 6) continue;
      holes += `<circle cx="${n(23.5 + i * 3)}" cy="${n(38 + j * 3)}" r="0.9" fill="#2F7F6B" fill-opacity="0.75"/>`;
    }
  }
  return {
    defs: lin(`${P}-a`, "#A2E8D4", "#5CC2A6"),
    body:
      shadow(23) +
      `<path d="M43 21L52 7" stroke="#8A8A99" stroke-width="1.6"/><circle cx="52" cy="7" r="2.1" fill="#FF8FA3" stroke="#C9577A" stroke-width="0.8"/>` +
      `<path d="M18 21Q18 13 25 13H39Q46 13 46 21" fill="none" stroke="#2F7F6B" stroke-width="3"/>` +
      `<rect x="11" y="54" width="6" height="3.4" rx="1.2" fill="#2F7F6B"/><rect x="47" y="54" width="6" height="3.4" rx="1.2" fill="#2F7F6B"/>` +
      `<rect x="7.5" y="20.5" width="49" height="35" rx="8" fill="url(#${P}-a)" stroke="#2F7F6B" stroke-width="2"/>` +
      `<path d="M12 25.5H31" stroke="#fff" stroke-opacity="0.55" stroke-width="1.6"/>` +
      `<circle cx="23.5" cy="38" r="9.6" fill="#F4FFF9" stroke="#2F7F6B" stroke-width="1.6"/>` +
      holes +
      `<rect x="36.5" y="28" width="15" height="10" rx="2" fill="#FFF6DA" stroke="#2F7F6B" stroke-width="1.4"/>` +
      `<path d="M39 34.5V36M41.5 33.5V36M44 34.5V36M46.5 33.5V36M49 34.5V36" stroke="#2F7F6B" stroke-width="0.8"/>` +
      `<path d="M45 30.5L43.6 36.2" stroke="#E53935" stroke-width="1.1"/>` +
      `<circle cx="40.5" cy="46.5" r="3.1" fill="#FFC93C" stroke="#B8860B" stroke-width="1.2"/><path d="M40.5 44v2" stroke="#B8860B" stroke-width="1"/>` +
      `<circle cx="48" cy="46.5" r="3.1" fill="#FFC93C" stroke="#B8860B" stroke-width="1.2"/><path d="M49.4 45.2l-1.2 1.2" stroke="#B8860B" stroke-width="1"/>` +
      note(8, 15, 0.9, "#FF6F96") +
      note(56, 22, 0.75, "#9C84E0") +
      `<path d="${sparkle(31, 7, 2)}" fill="#FFD54F"/>`,
  };
}

/** A folded plaid blanket with fringe and a little heart label sewn on. */
function blanket(P: string): Part {
  const layer = (y: number, h: number, x0: number, x1: number): string =>
    `<rect x="${x0}" y="${y}" width="${x1 - x0}" height="${h}" rx="5"`;
  return {
    defs:
      lin(`${P}-a`, "#FFC6B3", "#FF9C85") +
      `<pattern id="${P}-p" width="10" height="10" patternUnits="userSpaceOnUse">` +
      `<rect x="0" y="3.5" width="10" height="3" fill="#fff" fill-opacity="0.38"/>` +
      `<rect x="3.5" y="0" width="3" height="10" fill="#fff" fill-opacity="0.38"/>` +
      `<path d="M0 5H10M5 0V10" stroke="#C2523A" stroke-opacity="0.35" stroke-width="0.8"/></pattern>`,
    body:
      shadow(26) +
      `<path d="M7 50l-2.4 1M7 53l-2.8 0.4M57 50l2.4 1M57 53l2.8 0.4" fill="none" stroke="#C2523A" stroke-width="1.3"/>` +
      `${layer(42, 15, 7, 57)} fill="url(#${P}-a)" stroke="#B4472F" stroke-width="2"/>` +
      `${layer(42, 15, 7, 57)} fill="url(#${P}-p)"/>` +
      `${layer(29, 15.5, 9, 55)} fill="url(#${P}-a)" stroke="#B4472F" stroke-width="2"/>` +
      `${layer(29, 15.5, 9, 55)} fill="url(#${P}-p)"/>` +
      `${layer(16.5, 15, 11, 53)} fill="url(#${P}-a)" stroke="#B4472F" stroke-width="2"/>` +
      `${layer(16.5, 15, 11, 53)} fill="url(#${P}-p)"/>` +
      `<path d="M15 20.5Q32 18 49 20.5" fill="none" stroke="#fff" stroke-opacity="0.6" stroke-width="1.5"/>` +
      `<rect x="38" y="45" width="10" height="7.4" rx="1.4" fill="#FFF6EA" stroke="#C9A98A" stroke-width="1"/>` +
      `<path d="M38.8 45.8h8.4v5.8h-8.4z" fill="none" stroke="#C9A98A" stroke-width="0.5" stroke-dasharray="0.8 0.8"/>` +
      `<path d="${heart(43, 48.6, 1.9)}" fill="#FF6F96"/>`,
  };
}

/** Đèn ông sao, the Mid-Autumn star lantern: red paper on a bamboo stick, glowing, with golden tassels. */
function lantern(P: string): Part {
  const S = star(32, 27, 18, 0.5);
  let frame = "";
  for (let i = 0; i < 5; i++) {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / 5;
    frame += `M32 27L${n(32 + Math.cos(a) * 16.5)} ${n(27 + Math.sin(a) * 16.5)}`;
  }
  const tassel = (x: number, y: number): string =>
    `<path d="M${x} ${y}l-1.4 5M${x} ${y}l0 5.6M${x} ${y}l1.4 5" fill="none" stroke="#FFC93C" stroke-width="1.1"/>` +
    `<circle cx="${x}" cy="${y}" r="1.4" fill="#FFD54F" stroke="#C99A0B" stroke-width="0.6"/>`;
  return {
    defs: glow(`${P}-g`, "#FFD86B", 0.8) + lin(`${P}-a`, "#FF7A66", "#D62828") + glow(`${P}-c`, "#FFF4C2", 1),
    body:
      `<circle cx="32" cy="27" r="30" fill="url(#${P}-g)"/>` +
      `<path d="M32 44L33.5 62" stroke="#9C7A3E" stroke-width="3.6"/>` +
      `<path d="M32 44L33.5 62" stroke="#D9B26A" stroke-width="2"/>` +
      `<path d="M32.4 50.5h2.2M32.9 56.5h2.2" stroke="#9C7A3E" stroke-width="1"/>` +
      tassel(14.8, 21.4) +
      tassel(49.2, 21.4) +
      `<path d="${S}" fill="url(#${P}-a)" stroke="#9E1B1B" stroke-width="2.4"/>` +
      `<circle cx="32" cy="28" r="8" fill="url(#${P}-c)"/>` +
      `<path d="${frame}" fill="none" stroke="#FFD34D" stroke-opacity="0.55" stroke-width="0.9"/>` +
      `<path d="${star(32, 27.5, 7.5, 0.5)}" fill="none" stroke="#FFD34D" stroke-width="1.1"/>` +
      `<circle cx="32" cy="28" r="2.2" fill="#FFF8DC"/>` +
      `<path d="M24.5 17.5L28.6 16.4" stroke="#fff" stroke-opacity="0.55" stroke-width="1.4"/>` +
      `<path d="${sparkle(10, 9, 2.2)}" fill="#FFE27A"/><path d="${sparkle(55, 44, 1.8)}" fill="#FFE27A"/>`,
  };
}

const DRAW: Readonly<Record<DecorId, (P: string) => Part>> = {
  rug,
  plant,
  lamp,
  cushion,
  bookshelf,
  mug,
  poster,
  garland,
  fishbowl,
  radio,
  blanket,
  lantern,
};

/** One decoration as an `<svg>` string (viewBox 0 0 64 64, transparent background). */
export function renderDecor(id: DecorId, opts: DecorOptions = {}): string {
  const draw = DRAW[id] ?? DRAW.plant;
  const P = opts.idPrefix ?? `decor-${id}`;
  const size = opts.size ?? 64;
  const { defs, body } = draw(P);
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="${size}" height="${size}">` +
    (defs ? `<defs>${defs}</defs>` : "") +
    `<g stroke-linecap="round" stroke-linejoin="round">${body}</g></svg>`
  );
}
