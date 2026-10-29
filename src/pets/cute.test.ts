// @vitest-environment jsdom
// The cuteness pass (docs/research-cute-pets.md, rules 1–10) and the worried mood art.
import { describe, expect, it } from "vitest";
import { SPECIES_IDS, type Mood } from "../core/types";
import { EYE_H, INK } from "./face";
import { defaultPose, petBounds, renderPet, type PetPose } from "./index";
import { U } from "./kit";
import { arms } from "./limbs";
import { blinkAt, dynamics, landing } from "./motion";
import { layout } from "./render";
import { DEFS } from "./species";

const parser = new DOMParser();
const doc = (svg: string): Document => parser.parseFromString(svg, "image/svg+xml");
const num = (el: Element, a: string): number => Number(el.getAttribute(a));

/** Blink onsets (closure leaves 0) sampled every 5 ms over [from, to). */
function onsets(from: number, to: number): number[] {
  const out: number[] = [];
  let prev = 0;
  for (let i = Math.round(from * 200); i < to * 200; i++) {
    const v = blinkAt(i / 200);
    if (v > 0 && prev === 0) out.push(i / 200);
    prev = v;
  }
  return out;
}

describe("blinking (rule 7)", () => {
  it("is a pure function of t", () => {
    for (const t of [0, 1.7, 2.345, 77.7, 1234.5, 99999.99]) expect(blinkAt(t)).toBe(blinkAt(t));
    const pose = defaultPose({ t: 0 });
    // Find a frame in the middle of a blink and render it twice.
    let t = 1.6;
    while (blinkAt(t) < 1) t += 0.005;
    expect(renderPet("mochi", { ...pose, t })).toBe(renderPet("mochi", { ...pose, t }));
    expect(renderPet("mochi", { ...pose, t })).not.toBe(renderPet("mochi", { ...pose, t: t + 1 }));
  });

  it("stays open at the start and on garbage time", () => {
    for (let t = 0; t < 1.6; t += 0.01) expect(blinkAt(t)).toBe(0);
    expect(blinkAt(Number.NaN)).toBe(0);
    expect(blinkAt(-5)).toBe(0);
  });

  it("closes fully in ~80 ms, stays shut ~60 ms, reopens in ~150 ms", () => {
    const [start] = onsets(1.6, 20);
    expect(blinkAt(start + 0.04)).toBeGreaterThan(0);
    expect(blinkAt(start + 0.04)).toBeLessThan(1);
    expect(blinkAt(start + 0.1)).toBe(1);
    expect(blinkAt(start + 0.2)).toBeGreaterThan(0);
    expect(blinkAt(start + 0.2)).toBeLessThan(1);
    expect(blinkAt(start + 0.3)).toBe(0);
  });

  it("comes at random, clustered intervals of 1.5–8 s (no fixed period), ~12 % doubles", () => {
    const all = onsets(0, 1500); // longer than one schedule period, so the wrap-around is covered
    // Group onsets less than 0.6 s apart into one blink event (a double blink).
    const events: number[][] = [];
    for (const t of all) {
      const last = events[events.length - 1];
      if (last && t - last[last.length - 1] < 0.6) last.push(t);
      else events.push([t]);
    }
    expect(events.length).toBeGreaterThan(250);
    // From the last blink of one event to the first of the next.
    const gaps = events.slice(1).map((e, i) => e[0] - events[i][events[i].length - 1]);
    for (const g of gaps) {
      expect(g).toBeGreaterThanOrEqual(1.5 - 0.01);
      expect(g).toBeLessThanOrEqual(8 + 0.01);
    }
    const sorted = [...gaps].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    expect(median).toBeGreaterThan(2.8);
    expect(median).toBeLessThan(4.5);
    const mean = gaps.reduce((a, b) => a + b, 0) / gaps.length;
    const sd = Math.sqrt(gaps.reduce((a, b) => a + (b - mean) ** 2, 0) / gaps.length);
    expect(sd).toBeGreaterThan(0.8);
    // Within one stretch of a few minutes hardly any two gaps are the same.
    const early = gaps.slice(0, 100);
    expect(new Set(early.map((g) => g.toFixed(2))).size).toBeGreaterThan(80);
    const doubles = events.filter((e) => e.length === 2).length / events.length;
    expect(doubles).toBeGreaterThan(0.05);
    expect(doubles).toBeLessThan(0.2);
    expect(events.every((e) => e.length <= 2)).toBe(true);
  });

  it("shuts the eyes in the rendered frame", () => {
    let t = 1.6;
    while (blinkAt(t) < 1) t += 0.005;
    const shut = doc(renderPet("cat", defaultPose({ t })));
    expect(Array.from(shut.querySelectorAll("ellipse")).filter((e) => e.getAttribute("fill") === INK)).toHaveLength(0);
  });
});

describe("eyes and face (rules 1–4)", () => {
  /** White catch-lights inside an ink eye ellipse. */
  const lights = (d: Document, eye: Element): Element[] => {
    const cx = num(eye, "cx"), cy = num(eye, "cy"), rx = num(eye, "rx"), ry = num(eye, "ry");
    return Array.from(d.querySelectorAll("circle")).filter(
      (c) =>
        c.getAttribute("fill") === "#fff" &&
        !c.hasAttribute("fill-opacity") &&
        ((num(c, "cx") - cx) / rx) ** 2 + ((num(c, "cy") - cy) / ry) ** 2 < 1,
    );
  };

  it("gives every open neutral eye two catch-lights: a big one up-left, a small one down-right", () => {
    for (const id of SPECIES_IDS) {
      if (DEFS[id].face.relaxed) continue; // capybara's half-lidded eyes are checked below
      const d = doc(renderPet(id, defaultPose({ t: 1.3 })));
      const eyes = Array.from(d.querySelectorAll("ellipse")).filter((e) => e.getAttribute("fill") === INK);
      expect(eyes, id).toHaveLength(2);
      const offsets: [number, number][] = [];
      for (const eye of eyes) {
        const w = 2 * num(eye, "rx");
        const ls = lights(d, eye).sort((a, b) => num(b, "r") - num(a, "r"));
        expect(ls, id).toHaveLength(2);
        const [big, small] = ls;
        // Main 35–40 % of the eye width, second 15–20 % (diameters; a little slack for rounding to 0.1 px).
        expect(2 * num(big, "r") / w).toBeGreaterThan(0.33);
        expect(2 * num(big, "r") / w).toBeLessThan(0.42);
        expect(2 * num(small, "r") / w).toBeGreaterThan(0.13);
        expect(2 * num(small, "r") / w).toBeLessThan(0.22);
        expect(num(big, "cx")).toBeLessThan(num(eye, "cx"));
        expect(num(big, "cy")).toBeLessThan(num(eye, "cy"));
        expect(num(small, "cx")).toBeGreaterThan(num(eye, "cx"));
        expect(num(small, "cy")).toBeGreaterThan(num(eye, "cy"));
        offsets.push([num(big, "cx") - num(eye, "cx"), num(big, "cy") - num(eye, "cy")]);
      }
      // Same offset in both eyes, as if lit by one lamp (up to rounding to 0.1 px).
      expect(Math.abs(offsets[0][0] - offsets[1][0]), id).toBeLessThan(0.15);
      expect(Math.abs(offsets[0][1] - offsets[1][1]), id).toBeLessThan(0.15);
    }
  });

  it("gives the capybara's relaxed eyes two catch-lights each too", () => {
    const d = doc(renderPet("capybara", defaultPose({ t: 1.3 })));
    const whites = Array.from(d.querySelectorAll("circle")).filter((c) => c.getAttribute("fill") === "#fff" && !c.hasAttribute("fill-opacity"));
    expect(whites).toHaveLength(4);
  });

  it("keeps the eye aspect at 1.0–1.2 and tucks the default mouth right under the eyes", () => {
    for (const id of SPECIES_IDS) {
      const def = DEFS[id];
      const { ctx } = layout(def, defaultPose({ t: 1.3 }), "pet");
      const s = U * (def.face.eyeScale ?? 1);
      // Species whose mouth sits under a snout or a big nose keep it there (their identity).
      if (def.face.mouth === undefined && !["capybara", "koala", "piglet"].includes(id)) {
        // Mouth center (the "w" sits ~1.7 face units under the mouth line) within 0.8 eye heights of the eye bottom.
        const eyeBottom = ctx.ey + (EYE_H / 2) * s;
        expect((ctx.my + 1.7 * U - eyeBottom) / (EYE_H * s), id).toBeLessThanOrEqual(0.8);
      }
    }
    const d = doc(renderPet("mochi", defaultPose({ t: 1.3 })));
    const eye = Array.from(d.querySelectorAll("ellipse")).find((e) => e.getAttribute("fill") === INK)!;
    const aspect = num(eye, "ry") / num(eye, "rx");
    expect(aspect).toBeGreaterThanOrEqual(1);
    expect(aspect).toBeLessThanOrEqual(1.21);
  });

  it("draws a soft gradient blush, with hatch marks only when happy or petted", () => {
    const chill = renderPet("mochi", defaultPose({ t: 1.3 }));
    expect(chill).toContain('<radialGradient id="pet-k">');
    expect(chill).toContain('fill="url(#pet-k)"');
    /** Number of little strokes in the hatch path (3 per cheek), 0 when there is none. */
    const hatch = (svg: string): number => {
      const p = Array.from(doc(svg).querySelectorAll("path")).find((e) => e.getAttribute("stroke-width") === "1.1" && e.getAttribute("stroke")?.startsWith("#"));
      return p ? (p.getAttribute("d") ?? "").split("M").length - 1 : 0;
    };
    expect(hatch(chill)).toBe(0);
    expect(hatch(renderPet("mochi", defaultPose({ t: 1.3, mood: "happy" })))).toBe(6);
    expect(hatch(renderPet("mochi", defaultPose({ t: 1.3, hovered: true })))).toBe(6);
    expect(hatch(renderPet("mochi", defaultPose({ t: 1.3, mood: "annoyed" })))).toBe(0);
  });
});

describe("worried (the old annoyed mood)", () => {
  it("has hanging arms, never crossed ones", () => {
    for (const id of SPECIES_IDS) {
      for (const walking of [false, true]) {
        const { ctx } = layout(DEFS[id], defaultPose({ mood: "annoyed", t: 1.3, walking, walkPhase: 1.1 }), "pet");
        const svg = arms(ctx);
        // The crossed arms were two thick stroked bars across the belly.
        expect(svg, id).not.toMatch(/stroke-width="(?:[7-9]|1\d)(?:\.\d)?"/);
        const rots = Array.from(svg.matchAll(/rotate\((-?[\d.]+) (-?[\d.]+) (-?[\d.]+)\)/g)).map((m) => ({ deg: Number(m[1]), x: Number(m[2]) }));
        expect(rots, id).toHaveLength(2);
        const [left, right] = rots;
        // One arm on each side of the body, hanging down (close to vertical).
        expect(left.x).toBeLessThan(ctx.cx - ctx.bw * 0.4);
        expect(right.x).toBeGreaterThan(ctx.cx + ctx.bw * 0.4);
        for (const a of rots) expect(Math.abs(a.deg), id).toBeLessThan(20);
      }
    }
  });

  it("raises the brows in the middle (inner ends higher) and keeps the eyes open", () => {
    const d = doc(renderPet("mochi", defaultPose({ mood: "annoyed", t: 1.3 })));
    const eyes = Array.from(d.querySelectorAll("ellipse")).filter((e) => e.getAttribute("fill") === INK);
    expect(eyes).toHaveLength(2);
    const brows = Array.from(d.querySelectorAll("path")).filter((p) => p.getAttribute("stroke") === INK && /^M[^Q]+Q[^Q]+$/.test(p.getAttribute("d") ?? ""));
    expect(brows).toHaveLength(2);
    const cx = 80;
    for (const b of brows) {
      const nums = (b.getAttribute("d") ?? "").match(/-?[\d.]+/g)!.map(Number);
      const [x0, y0] = nums, [x1, y1] = nums.slice(-2);
      const inner = Math.abs(x0 - cx) < Math.abs(x1 - cx) ? { x: x0, y: y0 } : { x: x1, y: y1 };
      const outer = inner.x === x0 ? { y: y1 } : { y: y0 };
      expect(inner.y).toBeLessThan(outer.y);
    }
  });

  it("keeps the sweat drop and the wavy mouth", () => {
    const svg = renderPet("mochi", defaultPose({ mood: "annoyed", t: 1.3 }));
    expect(svg).toContain('fill="#9ED8FF"'); // the drop
    expect(svg).toMatch(/<path d="M[\d. ]+C[\d. ]+"[^>]*stroke-width="1.9"/); // the wave
  });
});

describe("motion (rules 8–10)", () => {
  const rate = (mood: Mood): number => {
    const pose = defaultPose({ mood });
    let crossings = 0;
    let prev = dynamics({ ...pose, t: 0.001 }, "bounce", mood).breathe;
    for (let i = 1; i <= 6000; i++) {
      const v = dynamics({ ...pose, t: 0.001 + i / 100 }, "bounce", mood).breathe;
      if (v > 0 && prev <= 0) crossings++;
      prev = v;
    }
    return crossings / 60;
  };

  it("breathes at 0.25–0.33 Hz awake and ~0.15 Hz asleep", () => {
    for (const mood of ["normal", "focus", "annoyed"] as const) {
      expect(rate(mood), mood).toBeGreaterThanOrEqual(0.23);
      expect(rate(mood), mood).toBeLessThanOrEqual(0.34);
    }
    expect(rate("sleeping")).toBeGreaterThan(0.13);
    expect(rate("sleeping")).toBeLessThan(0.18);
  });

  it("lands with a quick squash, then springs back past rest by ~10 %", () => {
    expect(landing(0)).toBe(0);
    expect(landing(0.05)).toBeCloseTo(1, 5);
    let min = 1;
    for (let t = 0.05; t < 0.5; t += 0.002) min = Math.min(min, landing(t));
    expect(min).toBeLessThan(-0.07);
    expect(min).toBeGreaterThan(-0.13);
    expect(Math.abs(landing(0.6))).toBeLessThan(0.01);
  });

  it("keeps the volume when squashed: ~0.82 of the height spreads to ~1.22 of the width", () => {
    let best = { sq: 0, bw: 0, bh: 0 };
    for (let i = 0; i < 400; i++) {
      const { ctx } = layout(DEFS.mochi, defaultPose({ mood: "celebrating", celebration: "jump", t: 2 + i / 400 }), "pet");
      if (ctx.dyn.squash > best.sq) best = { sq: ctx.dyn.squash, bw: ctx.bw, bh: ctx.bh };
    }
    expect(best.bh / DEFS.mochi.h).toBeCloseTo(0.82, 1);
    expect(best.bw / DEFS.mochi.w).toBeCloseTo(1.22, 1);
    expect((best.bw * best.bh) / (DEFS.mochi.w * DEFS.mochi.h)).toBeCloseTo(1, 3);
  });

  it("overshoots into a slight stretch after a happy hop lands", () => {
    let minSq = 0;
    for (let i = 0; i < 1000; i++) {
      const d = dynamics({ ...defaultPose({ mood: "happy" }), t: i / 1000 }, "bounce", "happy");
      if (d.jump === 0) minSq = Math.min(minSq, d.squash);
    }
    expect(minSq).toBeLessThan(-0.005);
  });

  it("tilts the head toward the facing side, deterministically, and stays inside the view", () => {
    const base = renderPet("cat", defaultPose({ t: 1.3 }));
    const tilted = renderPet("cat", defaultPose({ t: 1.3, headTilt: 12 }));
    expect(tilted).not.toBe(base);
    expect(tilted).toBe(renderPet("cat", defaultPose({ t: 1.3, headTilt: 12 })));
    expect(renderPet("cat", defaultPose({ t: 1.3, headTilt: Number.NaN }))).toBe(base);
    expect(renderPet("cat", defaultPose({ t: 1.3, headTilt: 12, held: true }))).toBe(renderPet("cat", defaultPose({ t: 1.3, held: true })));
    // + leans toward the facing side: the top of the head moves right when facing right, left when facing left.
    const topX = (p: Partial<PetPose>): number => {
      const b = petBounds("mochi", defaultPose({ t: 1.3, ...p }));
      return (b.minX + b.maxX) / 2;
    };
    expect(topX({ headTilt: 15 })).toBeGreaterThan(topX({}));
    expect(topX({ headTilt: 15, facing: -1 })).toBeLessThan(topX({ facing: -1 }));
    for (const id of SPECIES_IDS) {
      for (const headTilt of [-20, -12, 12, 20, 45]) {
        for (const p of [{}, { mood: "celebrating" as const, celebration: "flip" as const, t: 2.2 }, { wearing: ["tophat" as const], stage: 4 as const }]) {
          const b = petBounds(id, defaultPose({ t: 1.3, headTilt, ...p }));
          expect(b.minX).toBeGreaterThanOrEqual(0);
          expect(b.minY).toBeGreaterThanOrEqual(0);
          expect(b.maxX).toBeLessThanOrEqual(160);
          expect(b.maxY).toBeLessThanOrEqual(160);
        }
      }
    }
  });
});
