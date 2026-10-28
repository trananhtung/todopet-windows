import type { Mood } from "../core/types";

export type RGB = readonly [number, number, number];

/**
 * A species palette. Slots have the same role on every species so the shared systems can tint them:
 * top/bottom = body gradient, line = outline, belly = light patches (muzzle, belly, white parts),
 * mark = dark patches (stripes, panda black, tips), accent = signature color (beak, horn, nose),
 * inner = inner ears / fins / membranes.
 */
export interface Base {
  top: RGB;
  bottom: RGB;
  line: RGB;
  belly: RGB;
  mark: RGB;
  accent: RGB;
  inner: RGB;
  cheek: RGB;
  cheekA: number;
}

/** Hex strings ready for SVG attributes. */
export interface Colors {
  top: string;
  bottom: string;
  line: string;
  belly: string;
  mark: string;
  accent: string;
  inner: string;
  cheek: string;
  cheekA: number;
  /** Feet: the bottom color pulled a little toward the outline. */
  foot: string;
  /** Arms: between top and bottom. */
  arm: string;
}

export const hex = (s: string): RGB => {
  const n = parseInt(s.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

const h2 = (v: number): string => {
  const x = v < 0 ? 0 : v > 255 ? 255 : Math.round(v);
  return (x < 16 ? "0" : "") + x.toString(16);
};

export const toHex = (c: RGB): string => "#" + h2(c[0]) + h2(c[1]) + h2(c[2]);

export const mix = (a: RGB, b: RGB, k: number): RGB => [
  a[0] + (b[0] - a[0]) * k,
  a[1] + (b[1] - a[1]) * k,
  a[2] + (b[2] - a[2]) * k,
];

const grey = (c: RGB): RGB => {
  const g = c[0] * 0.3 + c[1] * 0.59 + c[2] * 0.11;
  return [g, g, g];
};

function toHsl(c: RGB): [number, number, number] {
  const r = c[0] / 255, g = c[1] / 255, b = c[2] / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h / 6, s, l];
}

function fromHsl(h: number, s: number, l: number): RGB {
  if (s === 0) return [l * 255, l * 255, l * 255];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const pp = 2 * l - q;
  const f = (t: number): number => {
    const u = t < 0 ? t + 1 : t > 1 ? t - 1 : t;
    if (u < 1 / 6) return pp + (q - pp) * 6 * u;
    if (u < 1 / 2) return q;
    if (u < 2 / 3) return pp + (q - pp) * (2 / 3 - u) * 6;
    return pp;
  };
  return [f(h + 1 / 3) * 255, f(h) * 255, f(h - 1 / 3) * 255];
}

/** The outline of every species: its own hue, darkened and slightly saturated, so lines feel inked, not black. */
export const deriveLine = (c: RGB): RGB => {
  const [h, s] = toHsl(c);
  return fromHsl(h, Math.min(1, s * 0.75 + 0.22), 0.24);
};

export interface PaletteInput {
  top: string;
  bottom: string;
  belly?: string;
  mark?: string;
  accent?: string;
  inner?: string;
  line?: string;
  cheek?: string;
  cheekA?: number;
}

export function makeBase(p: PaletteInput): Base {
  const top = hex(p.top), bottom = hex(p.bottom);
  const line = p.line ? hex(p.line) : deriveLine(bottom);
  return {
    top,
    bottom,
    line,
    belly: p.belly ? hex(p.belly) : top,
    mark: p.mark ? hex(p.mark) : mix(bottom, line, 0.45),
    accent: p.accent ? hex(p.accent) : hex("#FF9FB2"),
    inner: p.inner ? hex(p.inner) : hex("#FFB3C4"),
    cheek: hex(p.cheek ?? "#FF8FA3"),
    cheekA: p.cheekA ?? 0.4,
  };
}

const C = {
  warm: hex("#FFD2A6"),
  dust: hex("#A39890"),
  dustLine: hex("#4A4440"),
  dustCheek: hex("#C98F8F"),
  redTop: hex("#FF9E86"),
  red: hex("#E8513C"),
  redBelly: hex("#FFC6B6"),
  redMark: hex("#8E2A1C"),
  redLine: hex("#6E1D12"),
  lavTop: hex("#E9E5FA"),
  lav: hex("#A79FDA"),
  lavBelly: hex("#EFEBFC"),
  lavLine: hex("#4D4775"),
  gold1: hex("#FFF6C2"),
  gold2: hex("#FFC531"),
  goldLine: hex("#8A5A00"),
  goldBelly: hex("#FFF4C4"),
  goldMark: hex("#D99A00"),
  goldAccent: hex("#FFB300"),
  goldInner: hex("#FFE08A"),
  goldCheek: hex("#FF7F9E"),
};

const saturate = (c: RGB, k: number): RGB => mix(grey(c), c, 1 + k);

/** Mood tints applied on top of a species' own palette. */
export function moodBase(b: Base, m: Mood): Base {
  switch (m) {
    case "happy":
    case "celebrating":
      return {
        ...b,
        top: mix(b.top, C.warm, 0.06),
        bottom: mix(saturate(b.bottom, 0.12), C.warm, 0.05),
        cheekA: Math.max(b.cheekA, 0.55),
      };
    case "normal":
    case "focus":
      return b;
    case "annoyed":
      return {
        ...b,
        top: mix(mix(b.top, grey(b.top), 0.4), C.dust, 0.1),
        bottom: mix(mix(b.bottom, grey(b.bottom), 0.45), C.dust, 0.15),
        belly: mix(b.belly, grey(b.belly), 0.35),
        mark: mix(b.mark, grey(b.mark), 0.35),
        accent: mix(b.accent, grey(b.accent), 0.3),
        inner: mix(b.inner, grey(b.inner), 0.35),
        line: mix(b.line, C.dustLine, 0.3),
        cheek: C.dustCheek,
        cheekA: 0.2,
      };
    case "angry":
      // A hot flush, not a new coat: the species must stay recognizable when grumpy (a panda stays black and white).
      return {
        ...b,
        top: mix(b.top, C.redTop, 0.1),
        bottom: mix(b.bottom, C.red, 0.2),
        belly: mix(b.belly, C.redBelly, 0.1),
        mark: mix(b.mark, C.redMark, 0.08),
        accent: mix(b.accent, C.red, 0.1),
        inner: mix(b.inner, C.red, 0.25),
        line: mix(b.line, C.redLine, 0.45),
        cheek: C.red,
        cheekA: 0.5,
      };
    case "sleeping":
      return {
        ...b,
        top: mix(b.top, C.lavTop, 0.45),
        bottom: mix(b.bottom, C.lav, 0.45),
        belly: mix(b.belly, C.lavBelly, 0.4),
        mark: mix(b.mark, C.lavLine, 0.3),
        accent: mix(b.accent, C.lav, 0.3),
        inner: mix(b.inner, C.lav, 0.3),
        line: mix(b.line, C.lavLine, 0.5),
        cheek: hex("#FF9FB8"),
        cheekA: 0.28,
      };
  }
}

/** The rare golden treat turns any pet to gold while keeping its markings readable. */
export function goldenBase(b: Base): Base {
  return {
    top: C.gold1,
    bottom: C.gold2,
    line: C.goldLine,
    belly: mix(b.belly, C.goldBelly, 0.75),
    mark: mix(b.mark, C.goldMark, 0.75),
    accent: mix(b.accent, C.goldAccent, 0.5),
    inner: mix(b.inner, C.goldInner, 0.6),
    cheek: C.goldCheek,
    cheekA: 0.55,
  };
}

export function blendBase(a: Base, b: Base, k: number): Base {
  if (k >= 1) return b;
  if (k <= 0) return a;
  return {
    top: mix(a.top, b.top, k),
    bottom: mix(a.bottom, b.bottom, k),
    line: mix(a.line, b.line, k),
    belly: mix(a.belly, b.belly, k),
    mark: mix(a.mark, b.mark, k),
    accent: mix(a.accent, b.accent, k),
    inner: mix(a.inner, b.inner, k),
    cheek: mix(a.cheek, b.cheek, k),
    cheekA: a.cheekA + (b.cheekA - a.cheekA) * k,
  };
}

export function toColors(b: Base): Colors {
  return {
    top: toHex(b.top),
    bottom: toHex(b.bottom),
    line: toHex(b.line),
    belly: toHex(b.belly),
    mark: toHex(b.mark),
    accent: toHex(b.accent),
    inner: toHex(b.inner),
    cheek: toHex(b.cheek),
    cheekA: b.cheekA,
    foot: toHex(mix(b.bottom, b.line, 0.12)),
    arm: toHex(mix(b.top, b.bottom, 0.6)),
  };
}
