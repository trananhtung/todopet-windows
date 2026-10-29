// @vitest-environment jsdom
// v0.5 "Game" art: the 14 new accessories, home decorations, acts, knitting, petting and drowsiness.
import { describe, expect, it } from "vitest";
import { ACCESSORIES, DECOR_IDS, SPECIES_IDS, type Accessory, type Mood, type StageIndex } from "../core/types";
import { accessoryTop } from "./accessories";
import { actFrame } from "./acts";
import { ACT_DURATION, ACT_KEY_T, PET_ACTS, defaultPose, petBounds, renderDecor, renderPet, type PetActKind, type PetPose } from "./index";
import { blinkAt, dynamics } from "./motion";
import { layout } from "./render";
import { DEFS } from "./species";

const parser = new DOMParser();

/** Parses an SVG string; fails on XML errors, NaN/undefined leaks, unprefixed or duplicate ids, dangling url(#…). */
function check(svg: string, prefix: string, viewBox = "0 0 160 160"): Document {
  expect(svg.startsWith("<svg ")).toBe(true);
  expect(svg).not.toMatch(/NaN|undefined|Infinity|null/);
  const doc = parser.parseFromString(svg, "image/svg+xml");
  expect(doc.getElementsByTagName("parsererror").length).toBe(0);
  expect(doc.documentElement.tagName).toBe("svg");
  expect(doc.documentElement.getAttribute("viewBox")).toBe(viewBox);
  const ids = new Set<string>();
  for (const el of Array.from(doc.querySelectorAll("[id]"))) {
    const id = el.getAttribute("id")!;
    expect(id.startsWith(`${prefix}-`)).toBe(true);
    expect(ids.has(id)).toBe(false);
    ids.add(id);
  }
  for (const m of svg.matchAll(/url\(#([^)]+)\)/g)) expect(ids.has(m[1]), m[1]).toBe(true);
  return doc;
}

const inside = (b: { minX: number; maxX: number; minY: number; maxY: number }, what: string): void => {
  expect(b.minX, what).toBeGreaterThanOrEqual(0);
  expect(b.minY, what).toBeGreaterThanOrEqual(0);
  expect(b.maxX, what).toBeLessThanOrEqual(160);
  expect(b.maxY, what).toBeLessThanOrEqual(160);
};

const NEW: readonly Accessory[] = ACCESSORIES.slice(6);
const HATS: readonly Accessory[] = ["beanie", "flowercrown", "partyhat", "nonla", "maicrown", "bunnyband", "witchhat", "santahat"];

describe("the 14 new accessories", () => {
  it("are exactly the v0.5 catalog entries after the six milestone ones", () => {
    expect(NEW).toEqual([
      "beanie",
      "flowercrown",
      "partyhat",
      "nonla",
      "bandana",
      "heartglasses",
      "roundglasses",
      "starglasses",
      "maicrown",
      "tetscarf",
      "bunnyband",
      "witchhat",
      "santahat",
      "bellcollar",
    ]);
  });

  it("each draws something on every species, as well-formed SVG", () => {
    for (const id of SPECIES_IDS) {
      const bare = renderPet(id, defaultPose({ t: 1.3 }), { idPrefix: "w" });
      for (const a of NEW) {
        const svg = renderPet(id, defaultPose({ t: 1.3, wearing: [a] }), { idPrefix: "w" });
        check(svg, "w");
        expect(svg, `${id} ${a}`).not.toBe(bare);
      }
    }
  });

  it("stays inside the 160 view on every species: stages, hops, flips, tilts, both sides", () => {
    const poses: Partial<PetPose>[] = [
      { t: 1.3 },
      { mood: "happy", t: 0.4 },
      { mood: "celebrating", celebration: "flip", t: 1.068 },
      { mood: "celebrating", celebration: "fireworks", t: 1.136 },
      { headTilt: 20, t: 1.3 },
      { headTilt: -20, facing: -1, t: 1.3 },
      { walking: true, walkPhase: 1.1 },
      { act: { kind: "stretch", t: 0.9 } },
      { act: { kind: "hop", t: 0.32 } },
    ];
    for (const id of SPECIES_IDS) {
      for (const a of NEW) {
        for (const stage of [0, 4] as StageIndex[]) {
          for (const p of poses) inside(petBounds(id, defaultPose({ ...p, stage, wearing: [a] })), `${id} ${a} ${stage} ${JSON.stringify(p)}`);
        }
      }
      // Everything at once (the slot rule lives in core; the art must still cope).
      inside(petBounds(id, defaultPose({ wearing: [...ACCESSORIES], stage: 4, headTilt: 20 })), `${id} all`);
    }
  });

  it("raises the layout top for tall hats, the witch hat tallest", () => {
    for (const id of SPECIES_IDS) {
      const { ctx } = layout(DEFS[id], defaultPose({ t: 1.3 }), "pet");
      const an = DEFS[id].anchors(ctx);
      const top = (a: Accessory): number => accessoryTop(an, [a]);
      for (const a of HATS) expect(top(a), `${id} ${a}`).toBeLessThan(an.head.y);
      expect(top("witchhat")).toBeLessThan(top("tophat"));
      expect(top("partyhat")).toBeLessThan(top("tophat"));
      expect(top("flowercrown")).toBeGreaterThan(top("crown"));
      expect(accessoryTop(an, ["bandana", "roundglasses"])).toBe(Infinity);
    }
  });

  it("puts glasses on the eyes, turning with a head tilt, and takes them off asleep or held", () => {
    const pink = "#D63A6E"; // the heart glasses' rim
    expect(renderPet("cat", defaultPose({ t: 1.3, wearing: ["heartglasses"] }))).toContain(pink);
    expect(renderPet("cat", defaultPose({ t: 1.3, wearing: ["heartglasses"], mood: "sleeping" }))).not.toContain(pink);
    expect(renderPet("cat", defaultPose({ t: 1.3, wearing: ["heartglasses"], held: true }))).not.toContain(pink);
    const tilted = renderPet("cat", defaultPose({ t: 1.3, wearing: ["roundglasses"], headTilt: 12 }));
    const turned = tilted.match(/<g transform="rotate\([^"]+\)">([^]*?)<\/g>/g) ?? [];
    expect(turned.some((g) => g.includes("#8A5A2B"))).toBe(true); // the round rims sit inside the face turn
  });

  it("adds one shared sheen gradient only when a piece needs it", () => {
    expect(renderPet("mochi", defaultPose({ wearing: ["tophat"] }))).not.toContain('id="pet-g"');
    const svg = renderPet("mochi", defaultPose({ wearing: ["beanie", "santahat", "bellcollar"] }));
    expect(svg.match(/id="pet-g"/g)).toHaveLength(1);
    const a = renderPet("fox", defaultPose({ wearing: ["witchhat", "bandana"] }), { idPrefix: "left" });
    const b = renderPet("fox", defaultPose({ wearing: ["witchhat", "bandana"] }), { idPrefix: "right" });
    check(a, "left");
    expect(a.replaceAll("left-", "X-")).toBe(b.replaceAll("right-", "X-"));
  });
});

describe("acts", () => {
  const samples = (kind: PetActKind): number[] => {
    const d = ACT_DURATION[kind];
    return [0, 0.06, 0.15, 0.3, 0.45, 0.6, 0.75, 0.9, 0.99].map((f) => f * d).concat(ACT_KEY_T[kind]);
  };

  it("lists 14 acts with durations, a ~5 s yawn, a half-beat ponder and key moments inside each act", () => {
    expect(PET_ACTS).toHaveLength(14);
    expect(Object.keys(ACT_DURATION).sort()).toEqual([...PET_ACTS].sort());
    // The ponder before a celebration is half a beat; the overlay plays all of it.
    expect(ACT_DURATION.ponder).toBeCloseTo(0.4);
    for (const k of PET_ACTS) {
      expect(ACT_DURATION[k]).toBeGreaterThan(k === "ponder" ? 0.3 : 0.5);
      expect(ACT_KEY_T[k]).toBeGreaterThan(0);
      expect(ACT_KEY_T[k]).toBeLessThan(ACT_DURATION[k]);
    }
    expect(ACT_DURATION.yawn).toBeGreaterThanOrEqual(4.5);
    expect(ACT_DURATION.yawn).toBeLessThanOrEqual(5.5);
    expect(ACT_DURATION.dizzy).toBeCloseTo(1.2); // rule 12: spiral eyes for 1.2 s, then a 2 s pout
    expect(ACT_DURATION.pout).toBeCloseTo(2);
  });

  it("keeps every act inside the view at many moments, for every species, stage, side and a tall hat", () => {
    for (const id of SPECIES_IDS) {
      for (const kind of PET_ACTS) {
        for (const t of samples(kind)) {
          for (const stage of [0, 4] as StageIndex[]) {
            for (const facing of [1, -1] as const) {
              for (const wearing of [[], ["witchhat"]] as Accessory[][]) {
                inside(petBounds(id, defaultPose({ act: { kind, t }, stage, facing, wearing, t: 2 + t })), `${id} ${kind}@${t} s${stage} f${facing} ${wearing}`);
              }
            }
          }
        }
      }
    }
  });

  it("renders well-formed SVG and is deterministic (same pose in, same SVG out)", () => {
    for (const id of SPECIES_IDS) {
      for (const kind of PET_ACTS) {
        for (const t of [ACT_KEY_T[kind], ACT_DURATION[kind] * 0.2, ACT_DURATION[kind] * 0.8]) {
          const pose = defaultPose({ act: { kind, t }, t: 3 + t, wearing: ["roundglasses", "bandana"] });
          const svg = renderPet(id, pose, { idPrefix: "a" });
          check(svg, "a");
          expect(renderPet(id, structuredClone(pose), { idPrefix: "a" })).toBe(svg);
        }
      }
    }
    for (const lang of ["en", "vi"] as const) check(renderPet("cat", defaultPose({ act: { kind: "sneeze", t: 1.02 } }), { lang }), "pet");
  });

  it("changes the frame while playing and has no effect outside its time, held, celebrating or unknown", () => {
    const base = defaultPose({ t: 2 });
    const plain = renderPet("mochi", base);
    for (const kind of PET_ACTS) {
      expect(renderPet("mochi", { ...base, act: { kind, t: ACT_KEY_T[kind] } }), kind).not.toBe(plain);
      expect(renderPet("mochi", { ...base, act: { kind, t: -0.5 } })).toBe(plain);
      expect(renderPet("mochi", { ...base, act: { kind, t: ACT_DURATION[kind] + 0.01 } })).toBe(plain);
      expect(renderPet("mochi", { ...base, act: { kind, t: Number.NaN } })).toBe(plain);
      const held = { ...base, held: true };
      expect(renderPet("mochi", { ...held, act: { kind, t: ACT_KEY_T[kind] } })).toBe(renderPet("mochi", held));
      const party = { ...base, mood: "celebrating" as Mood, prevMood: "celebrating" as Mood };
      expect(renderPet("mochi", { ...party, act: { kind, t: ACT_KEY_T[kind] } })).toBe(renderPet("mochi", party));
    }
    expect(renderPet("mochi", { ...base, act: { kind: "moonwalk" as PetActKind, t: 0.5 } })).toBe(plain);
    expect(renderPet("mochi", { ...base, act: null })).toBe(plain);
  });

  it("eases in and out: the body barely moves at the first and last moments", () => {
    const rest = dynamics(defaultPose({ t: 2 }), "bounce", "normal");
    for (const kind of PET_ACTS) {
      for (const t of [0.001, ACT_DURATION[kind] - 0.001]) {
        const p = defaultPose({ t: 2, act: { kind, t } });
        const d = dynamics(p, "bounce", "normal", actFrame(p, "normal"));
        expect(Math.abs(d.jump - rest.jump), `${kind}@${t}`).toBeLessThan(0.3);
        expect(Math.abs(d.squash - rest.squash), `${kind}@${t}`).toBeLessThan(0.02);
        expect(Math.abs(d.shakeX - rest.shakeX), `${kind}@${t}`).toBeLessThan(0.3);
        expect(Math.abs(d.tilt - rest.tilt), `${kind}@${t}`).toBeLessThan(0.01);
      }
    }
  });

  it("draws the signature of each act", () => {
    const at = (kind: PetActKind, t = ACT_KEY_T[kind], id: (typeof SPECIES_IDS)[number] = "mochi"): string =>
      renderPet(id, defaultPose({ t: 2, act: { kind, t } }), { lang: "en" });
    const frame = (kind: PetActKind, t = ACT_KEY_T[kind]) => actFrame(defaultPose({ act: { kind, t } }), "normal")!;
    expect(frame("dizzy").eyes).toBe("spiral");
    expect(at("dizzy")).toContain("#FFC93C"); // the stars circling overhead
    expect(frame("giggle")).toMatchObject({ eyes: "squint", arms: "mouth", blush: true });
    expect(at("giggle")).toContain(">hehe<");
    expect(frame("pout").puff).toBeGreaterThan(0.7);
    expect(frame("pout").mouth).toBe("pout");
    expect(frame("shake").eyes).toBe("squeeze");
    expect(frame("wave").arms).toBe("wave");
    expect(frame("hop", 0.2).squash).toBeLessThan(-0.03); // stretched on the way up
    expect(frame("hop", 0.08).squash).toBeGreaterThan(0.05); // crouched before
    expect(dynamics(defaultPose({ act: { kind: "hop", t: 0.32 } }), "bounce", "normal", frame("hop")).jump).toBeGreaterThan(8);
    expect(frame("lookaround", 0.6).lookX).toBeLessThan(0); // facing right, it looks left first…
    expect(frame("lookaround", 1.7).lookX).toBeGreaterThan(0); // …then right
    expect(Math.abs(frame("sniff").twitch)).toBeGreaterThan(0);
    expect(frame("scratch").arms).toBe("scratch");
    expect(frame("stretch").squash).toBeLessThan(-0.1);
    expect(frame("yawn")).toMatchObject({ mouth: "yawn", eyes: "squeeze", arms: "up" });
    expect(frame("yawn", 3.8).tear).toBeGreaterThan(0.5);
    // Sneeze: two inhales (the second deeper), a squash, then a hop backwards.
    expect(frame("sneeze", 0.3).squash).toBeLessThan(0);
    expect(frame("sneeze", 0.85).squash).toBeLessThan(frame("sneeze", 0.3).squash);
    expect(frame("sneeze", 1.02).squash).toBeGreaterThan(0.08);
    expect(frame("sneeze", 1.3).jump).toBeGreaterThan(4);
    expect(frame("sneeze", 1.3).shakeX).toBeLessThan(0);
    expect(actFrame(defaultPose({ facing: -1, act: { kind: "sneeze", t: 1.3 } }), "normal")!.shakeX).toBeGreaterThan(0);
    expect(at("sneeze")).toContain(">choo!<");
    expect(renderPet("mochi", defaultPose({ act: { kind: "sneeze", t: 1.02 } }), { lang: "vi" })).toContain(">xì!<");
    expect(frame("trip").tilt).toBeGreaterThan(0.1);
    expect(frame("trip").eyes).toBe("wide");
    expect(frame("trip", 1.2)).toMatchObject({ eyes: "squint", blush: true });
    expect(frame("ponder")).toMatchObject({ arms: "chin", mouth: "hmm" });
    expect(frame("ponder").faceTilt).toBeGreaterThan(10);
    expect(at("ponder")).not.toBe(at("ponder", ACT_DURATION.ponder - 0.001)); // the thought dots
    // It eases back to rest by its end instead of being cut mid-pose.
    const end = frame("ponder", ACT_DURATION.ponder - 0.01);
    expect(end.faceTilt).toBeLessThan(0.5);
    expect(end.armK).toBeLessThan(0.05);
  });
});

describe("knitting, petting and drowsiness", () => {
  it("knits: yarn ball, needles and a piece that grows with progress, inside the view", () => {
    const yarn = "#FF8C6B";
    expect(renderPet("cat", defaultPose({ t: 1.3 }))).not.toContain(yarn);
    const rows = (p: number): number => (renderPet("cat", defaultPose({ t: 1.3, craft: p })).match(/fill="#FFF1DC"/g) ?? []).length;
    for (const p of [0, 0.3, 1]) check(renderPet("cat", defaultPose({ t: 1.3, craft: p, mood: "focus" })), "pet");
    expect(renderPet("cat", defaultPose({ t: 1.3, craft: 0.5 }))).toContain(yarn);
    expect(rows(1)).toBeGreaterThan(rows(0.3));
    for (const id of SPECIES_IDS) {
      for (const stage of [0, 4] as StageIndex[]) inside(petBounds(id, defaultPose({ craft: 1, stage, mood: "focus" })), `${id} craft`);
    }
    const plain = renderPet("cat", defaultPose({ t: 1.3 }));
    expect(renderPet("cat", defaultPose({ t: 1.3, craft: null }))).toBe(plain);
    expect(renderPet("cat", defaultPose({ t: 1.3, craft: Number.NaN }))).toBe(plain);
    expect(renderPet("cat", defaultPose({ t: 1.3, craft: 0.5, mood: "sleeping" }))).not.toContain(yarn);
    expect(renderPet("cat", defaultPose({ t: 1.3, craft: 0.5, held: true }))).not.toContain(yarn);
  });

  it("melts when petted: squint and blush, a lean toward the cursor, slow cat blinks after 2 s", () => {
    /** Little strokes in the blush hatch path (3 per cheek), 0 when there is none. */
    const hatch = (svg: string): number => {
      const el = Array.from(parser.parseFromString(svg, "image/svg+xml").querySelectorAll("path")).find(
        (e) => e.getAttribute("stroke-width") === "1.1" && e.getAttribute("stroke")?.startsWith("#"),
      );
      return el ? (el.getAttribute("d") ?? "").split("M").length - 1 : 0;
    };
    const petted = renderPet("mochi", defaultPose({ t: 1.3, petting: 1, lookX: 1 }));
    expect(petted).not.toBe(renderPet("mochi", defaultPose({ t: 1.3, lookX: 1 })));
    expect(hatch(petted)).toBe(6);
    expect(hatch(renderPet("mochi", defaultPose({ t: 1.3, lookX: 1 })))).toBe(0);
    expect(hatch(renderPet("mochi", defaultPose({ t: 1.3, petting: 1, mood: "annoyed" })))).toBe(6);
    // Leans toward the cursor's side.
    const midX = (p: Partial<PetPose>): number => {
      const b = petBounds("mochi", defaultPose({ t: 1.3, ...p }));
      return (b.minX + b.maxX) / 2;
    };
    expect(midX({ petting: 1, lookX: 1 })).toBeGreaterThan(midX({ lookX: 1 }));
    expect(midX({ petting: 1, lookX: -1 })).toBeLessThan(midX({ lookX: -1 }));
    expect(midX({ petting: 1, lookX: 1, facing: -1 })).toBeGreaterThan(midX({ lookX: 1, facing: -1 }));
    // After 2 s the squint opens into a soft gaze with slow blinks: filled eyes come back, then close again.
    const inkEyes = (t: number): number =>
      (renderPet("mochi", defaultPose({ t: 1.3, petting: t })).match(/<path d="M[^"]+A[^"]+Z" fill="#2B1B14"\/>/g) ?? []).length;
    expect(inkEyes(1)).toBe(0);
    expect(inkEyes(2.8)).toBe(2);
    expect(inkEyes(2 + 0.5 + 1.7)).toBe(0); // shut in the middle of a slow blink
    // Grumpy and sleeping pets carry on.
    expect(renderPet("mochi", defaultPose({ t: 1.3, mood: "angry", petting: 1 }))).toBe(renderPet("mochi", defaultPose({ t: 1.3, mood: "angry" })));
    for (const id of SPECIES_IDS) inside(petBounds(id, defaultPose({ petting: 3, lookX: 1, stage: 4, wearing: ["witchhat"] })), id);
  });

  it("gets drowsy: heavy lids, slower and longer blinks, little head dips", () => {
    // Slowed blinks last longer on the same schedule.
    const closedFor = (slow: number): number => {
      let n = 0;
      for (let t = 1.6; t < 60; t += 0.005) if (blinkAt(t, slow) > 0) n++;
      return n;
    };
    expect(closedFor(2.1)).toBeGreaterThan(closedFor(1) * 2);
    for (const t of [0, 1.7, 33.3, 1234.5]) expect(blinkAt(t, 1)).toBe(blinkAt(t));
    // Lids and dips.
    let maxDip = 0;
    for (let i = 0; i < 100; i++) maxDip = Math.max(maxDip, dynamics(defaultPose({ t: i * 0.05, drowsy: 1 }), "bounce", "normal").dip);
    expect(maxDip).toBeGreaterThan(0.9);
    expect(dynamics(defaultPose({ t: 1, drowsy: 0.6 }), "bounce", "normal").lid).toBeGreaterThan(0.15);
    expect(dynamics(defaultPose({ t: 1, drowsy: 0 }), "bounce", "normal").lid).toBe(0);
    expect(renderPet("mochi", defaultPose({ t: 1.3, drowsy: 0 }))).toBe(renderPet("mochi", defaultPose({ t: 1.3 })));
    expect(renderPet("mochi", defaultPose({ t: 1.3, drowsy: 0.8 }))).not.toBe(renderPet("mochi", defaultPose({ t: 1.3 })));
    expect(renderPet("mochi", defaultPose({ t: 1.3, drowsy: Number.NaN }))).toBe(renderPet("mochi", defaultPose({ t: 1.3 })));
    for (const id of SPECIES_IDS) {
      for (let i = 0; i < 6; i++) inside(petBounds(id, defaultPose({ t: i * 0.7, drowsy: 1, stage: 4 })), id);
      check(renderPet(id, defaultPose({ t: 2.15, drowsy: 1 })), "pet");
    }
  });
});

describe("renderDecor", () => {
  it("gives valid, prefixed 64×64 SVG for every decoration", () => {
    for (const d of DECOR_IDS) {
      const svg = renderDecor(d);
      const doc = check(svg, `decor-${d}`, "0 0 64 64");
      expect(doc.documentElement.getAttribute("width")).toBe("64");
      expect(doc.documentElement.querySelectorAll("path, circle, ellipse, rect").length, d).toBeGreaterThan(5);
      const sized = check(renderDecor(d, { size: 40, idPrefix: "home-1" }), "home-1", "0 0 64 64");
      expect(sized.documentElement.getAttribute("height")).toBe("40");
    }
  });

  it("is pure, distinct per item, and lets several share a page", () => {
    const all = DECOR_IDS.map((d) => renderDecor(d, { idPrefix: "x" }));
    expect(new Set(all).size).toBe(DECOR_IDS.length);
    for (const d of DECOR_IDS) {
      expect(renderDecor(d, { idPrefix: "a" })).toBe(renderDecor(d, { idPrefix: "a" }));
      expect(renderDecor(d, { idPrefix: "a" }).replaceAll("a-", "Z-")).toBe(renderDecor(d, { idPrefix: "b" }).replaceAll("b-", "Z-"));
    }
    // Ids from different prefixes never collide when placed side by side.
    const page = DECOR_IDS.map((d, i) => renderDecor(d, { idPrefix: `h${i}` })).join("");
    const ids = Array.from(page.matchAll(/id="([^"]+)"/g), (m) => m[1]);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("purity and speed", () => {
  it("never calls Math.random in the renderer", () => {
    const sources = import.meta.glob(["./*.ts", "./species/*.ts", "!./*.test.ts"], { query: "?raw", import: "default", eager: true }) as Record<string, string>;
    expect(Object.keys(sources).length).toBeGreaterThan(30);
    for (const [file, src] of Object.entries(sources)) expect(src, file).not.toMatch(/Math\.random\s*\(/);
  });

  it("renders act, knitting, petting and dressed-up frames in well under 0.5 ms on average", () => {
    const poses: PetPose[] = [
      defaultPose({ act: { kind: "yawn", t: 2 }, wearing: ["santahat", "bellcollar", "starglasses"] }),
      defaultPose({ craft: 0.6, mood: "focus", wearing: ["nonla", "tetscarf"] }),
      defaultPose({ petting: 3, drowsy: 0.5, wearing: ["witchhat", "heartglasses", "bandana"] }),
      defaultPose({ act: { kind: "dizzy", t: 0.6 }, wearing: [...ACCESSORIES] }),
    ];
    for (let i = 0; i < 400; i++) renderPet(SPECIES_IDS[i % SPECIES_IDS.length], poses[i % poses.length]); // warm up
    const n = 3000;
    const start = performance.now();
    for (let i = 0; i < n; i++) {
      const p = poses[i % poses.length];
      p.t = i / 30;
      if (p.act) p.act = { kind: p.act.kind, t: (i / 30) % ACT_DURATION[p.act.kind] };
      renderPet(SPECIES_IDS[i % SPECIES_IDS.length], p);
    }
    expect((performance.now() - start) / n).toBeLessThan(0.5);
  });
});
