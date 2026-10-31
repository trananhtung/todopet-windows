// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { ACCESSORIES, CELEBRATIONS, MOODS, SPECIES_IDS, type Mood, type StageIndex } from "../core/types";
import { appIconSvg } from "./icon";
import { renderDecor } from "./decor";
import { SPECIES, defaultPose, petBounds, renderPet, speciesInfo, type PetPose } from "./index";
import { BAG_D, THUMB_D } from "./species/banhbao";

const parser = new DOMParser();

/** Parses an SVG string and fails on XML errors, NaN/undefined leaks and unresolved url(#…) references. */
function check(svg: string, prefix = "pet"): Document {
  expect(svg.startsWith("<svg ")).toBe(true);
  expect(svg).not.toMatch(/NaN|undefined|Infinity|null/);
  const doc = parser.parseFromString(svg, "image/svg+xml");
  expect(doc.getElementsByTagName("parsererror").length).toBe(0);
  const root = doc.documentElement;
  expect(root.tagName).toBe("svg");
  expect(root.getAttribute("viewBox")).toBe("0 0 160 160");
  const ids = new Set<string>();
  for (const el of Array.from(doc.querySelectorAll("[id]"))) {
    const id = el.getAttribute("id")!;
    expect(id.startsWith(`${prefix}-`)).toBe(true);
    expect(ids.has(id)).toBe(false);
    ids.add(id);
  }
  for (const m of svg.matchAll(/url\(#([^)]+)\)/g)) expect(ids.has(m[1])).toBe(true);
  return doc;
}

const busyPose = (over: Partial<PetPose> = {}): PetPose =>
  defaultPose({
    t: 2.71,
    walking: true,
    walkPhase: 4.2,
    hovered: true,
    hungry: true,
    dirt: 3,
    wearing: [...ACCESSORIES],
    lookX: -0.6,
    lookY: 0.4,
    ...over,
  });

describe("species registry", () => {
  it("lists all registered species in SPECIES_IDS order", () => {
    expect(SPECIES.map((s) => s.id)).toEqual([...SPECIES_IDS]);
  });

  it("has complete info for every id", () => {
    for (const id of SPECIES_IDS) {
      const info = speciesInfo(id);
      expect(info.id).toBe(id);
      expect(info.name.en.length).toBeGreaterThan(0);
      expect(info.name.vi.length).toBeGreaterThan(0);
      expect(info.sound.en.length).toBeGreaterThan(0);
      expect(info.sound.vi.length).toBeGreaterThan(0);
      expect(info.emoji.length).toBeGreaterThan(0);
      expect(["bounce", "hop", "waddle", "float", "scurry"]).toContain(info.gait);
    }
  });

  it("locks exactly the bee (20 tasks), the dragon (7-day streak) and the unicorn (50 tasks)", () => {
    const locked = SPECIES.filter((s) => s.unlock).map((s) => s.id);
    expect(locked).toEqual(["bee", "dragon", "unicorn"]);
    expect(speciesInfo("bee").unlock).toMatchObject({ kind: "tasks", value: 20 });
    expect(speciesInfo("dragon").unlock).toMatchObject({ kind: "streak", value: 7 });
    expect(speciesInfo("unicorn").unlock).toMatchObject({ kind: "tasks", value: 50 });
    expect(speciesInfo("dragon").unlock?.label.vi).toBe("Giữ chuỗi 7 ngày");
    expect(speciesInfo("dragon").unlock?.label.en).toBe("Keep a 7-day streak");
  });

  it("uses the gaits from the spec", () => {
    const gaits = Object.fromEntries(SPECIES.map((s) => [s.id, s.gait]));
    expect(gaits).toMatchObject({ mochi: "bounce", bunny: "hop", fox: "scurry", panda: "waddle", axolotl: "float", dragon: "float", unicorn: "hop" });
    expect(gaits).toMatchObject({ redpanda: "scurry", otter: "float", hedgehog: "scurry", koala: "waddle", hippo: "waddle" });
    expect(gaits).toMatchObject({ seal: "waddle", owl: "hop", lamb: "hop", piglet: "bounce", bee: "float" });
    expect(speciesInfo("frog").sound).toEqual({ en: "ribbit", vi: "ộp ộp" });
    expect(speciesInfo("piglet").sound).toEqual({ en: "oink oink", vi: "ụt ịt" });
  });
});

describe("Bảnh Bao", () => {
  /** Thumbs-ups in a frame (the thumb is drawn from one constant path). */
  const thumbs = (pose: Partial<PetPose>): number => renderPet("banhbao", defaultPose({ t: 1.2, ...pose })).split(THUMB_D).length - 1;

  it("is a dapper little person, open from the start, who bounces and says ok", () => {
    expect(speciesInfo("banhbao")).toEqual({
      id: "banhbao",
      name: { en: "Dapper Bao", vi: "Bảnh Bao" },
      emoji: "👍",
      gait: "bounce",
      sound: { en: "nice!", vi: "ok luôn!" },
    });
  });

  it("gives a thumbs-up when happy, two when celebrating, and none otherwise", () => {
    expect(thumbs({ mood: "happy" })).toBe(1);
    expect(thumbs({ mood: "celebrating" })).toBe(2);
    for (const mood of ["normal", "focus", "annoyed", "angry", "sleeping"] as const) expect(thumbs({ mood }), mood).toBe(0);
    // Arms swing while walking, so no thumbs then.
    expect(thumbs({ mood: "happy", walking: true, walkPhase: 1.1 })).toBe(0);
    expect(thumbs({ mood: "happy", held: true })).toBe(0);
  });

  it("wears the crossbody bag in every mood, held or not", () => {
    for (const mood of MOODS) expect(renderPet("banhbao", defaultPose({ mood, t: 1.2 })), mood).toContain(BAG_D);
    expect(renderPet("banhbao", busyPose({ held: true }))).toContain(BAG_D);
  });

  it("hangs the bag from a ring at the end of the strap, so the strap never looks cut", () => {
    for (const pose of [{}, { mood: "celebrating" as const }, { walking: true, walkPhase: 1.1 }, { held: true }]) {
      const d = check(renderPet("banhbao", defaultPose({ t: 1.2, ...pose })));
      const bag = Array.from(d.querySelectorAll("path")).find((e) => e.getAttribute("d") === BAG_D)!;
      const hanger = bag.closest("g[transform*='rotate']")!;
      const [x, y] = hanger.getAttribute("transform")!.match(/translate\(([-\d.]+) ([-\d.]+)\)/)!.slice(1).map(Number);
      // A ring sits where the bag hangs…
      expect(Array.from(hanger.children).some((e) => e.tagName === "circle" && e.getAttribute("cx") === "0" && e.getAttribute("cy") === "0")).toBe(true);
      // …and the strap across the chest ends in it.
      const strap = Array.from(d.querySelectorAll("path")).find((e) => e.getAttribute("stroke-width") === "2.8")!;
      const end = strap.getAttribute("d")!.trim().split(/[\sA-Z]+/).filter(Boolean).slice(-2).map(Number);
      expect(end).toEqual([x, y]);
    }
  });
});

describe("defaultPose", () => {
  it("is a calm grown-up facing right, and applies overrides", () => {
    const p = defaultPose();
    expect(p).toMatchObject({ mood: "normal", facing: 1, stage: 3, blend: 1, wearing: [], food: null });
    const q = defaultPose({ mood: "angry", stage: 0 });
    expect(q.mood).toBe("angry");
    expect(q.prevMood).toBe("angry");
    expect(q.stage).toBe(0);
  });
});

describe("renderPet", () => {
  it("renders every species × mood × stage 0/4 as well-formed SVG", () => {
    for (const id of SPECIES_IDS) {
      for (const mood of MOODS) {
        for (const stage of [0, 4] as StageIndex[]) {
          const kinds = mood === "celebrating" ? CELEBRATIONS : (["jump"] as const);
          for (const celebration of kinds) {
            check(renderPet(id, defaultPose({ mood, stage, celebration, t: 1.1 + stage * 0.07 })));
          }
        }
      }
    }
  });

  it("renders busy poses (walking, held, dirt, hunger, all accessories, golden treat, mirrored)", () => {
    for (const id of SPECIES_IDS) {
      check(renderPet(id, busyPose()));
      check(renderPet(id, busyPose({ held: true, facing: -1 })));
      check(renderPet(id, busyPose({ calm: true, mood: "focus", prevMood: "sleeping", blend: 0.4 })));
      check(renderPet(id, busyPose({ mood: "celebrating", celebration: "fireworks", golden: true, food: "🍙", foodT: 0.4 })));
      check(renderPet(id, busyPose({ mood: "celebrating", food: "<b>&", foodT: 1.2 }), { lang: "vi" }));
    }
  });

  it("survives garbage input without leaking NaN", () => {
    const bad = defaultPose({
      t: Number.NaN,
      walkPhase: Number.POSITIVE_INFINITY,
      blend: Number.NaN,
      lookX: Number.NaN,
      stage: 9 as StageIndex,
      dirt: 42,
      prevMood: "nope" as Mood,
    });
    for (const id of SPECIES_IDS) check(renderPet(id, bad));
  });

  it("prefixes every id so several pets can share a page", () => {
    const a = renderPet("fox", busyPose(), { idPrefix: "left" });
    const b = renderPet("fox", busyPose(), { idPrefix: "right" });
    check(a, "left");
    check(b, "right");
    expect(a.replaceAll("left-", "X-")).toBe(b.replaceAll("right-", "X-"));
  });

  it("only takes an id prefix of letters, digits, dash and underscore (it goes into markup, and a friend's key is in one)", () => {
    // Nothing else may reach `id="…"` and `url(#…)`: a quote, a bracket or a space would end the attribute or the reference.
    const bad = ['a"b', "a b", "a)b", "a(b", "a<b", "a>b", "a#b", "a'b", "a&b", "a\nb", "a;b", "a.b", "a:b", "é", "", "x\u0000", '"/><script>x</script>', "a".repeat(81)];
    for (const idPrefix of bad) {
      expect(() => renderPet("fox", busyPose(), { idPrefix }), JSON.stringify(idPrefix)).toThrow(/idPrefix/);
      expect(() => renderDecor("plant", { idPrefix }), JSON.stringify(idPrefix)).toThrow(/idPrefix/);
    }
    // What the app uses is fine, including a public key (base64url: letters, digits, - and _).
    const key = "AbC-_0123456789AbC-_0123456789AbC-_0123456789A";
    for (const idPrefix of ["pet", "visitor", `friend-${key}`, "wear-fox-2-bow", "board-plant-48", "p0", "a".repeat(80)]) {
      expect(() => renderPet("fox", busyPose(), { idPrefix }), idPrefix).not.toThrow();
      expect(() => renderDecor("plant", { idPrefix }), idPrefix).not.toThrow();
    }
    // And with no prefix there is a default.
    expect(() => renderPet("fox", busyPose())).not.toThrow();
    expect(() => renderDecor("plant")).not.toThrow();
  });

  it("is deterministic", () => {
    for (const id of SPECIES_IDS) {
      const pose = busyPose({ mood: "celebrating", celebration: "flip", t: 3.33 });
      expect(renderPet(id, pose)).toBe(renderPet(id, { ...pose, wearing: [...pose.wearing] }));
    }
  });

  it("sets the outer size and keeps the 160 viewBox", () => {
    const doc = check(renderPet("panda", defaultPose(), { size: 96 }));
    expect(doc.documentElement.getAttribute("width")).toBe("96");
    expect(doc.documentElement.getAttribute("height")).toBe("96");
  });

  it("changes with mood, look and time (it is actually animated)", () => {
    const base = renderPet("cat", defaultPose({ t: 1 }));
    expect(renderPet("cat", defaultPose({ t: 1, mood: "angry" }))).not.toBe(base);
    expect(renderPet("cat", defaultPose({ t: 1, lookX: 1 }))).not.toBe(base);
    expect(renderPet("cat", defaultPose({ t: 1.5 }))).not.toBe(base);
    expect(renderPet("capybara", defaultPose({ mood: "sleeping" }))).toContain("#3E8E2A"); // the yuzu leaf
  });
});

describe("layout", () => {
  it("keeps every pose inside the 160×160 view, flips and fireworks included", () => {
    const poses: Partial<PetPose>[] = [];
    for (const wearing of [[], ["tophat"], ["crown", "scarf", "sunglasses"]] as PetPose["wearing"][]) {
      for (const mood of MOODS) poses.push({ mood, wearing, t: 0.9 });
      for (const celebration of CELEBRATIONS) {
        for (let i = 0; i < 20; i++) poses.push({ mood: "celebrating", celebration, wearing, t: 2 + i / 44, facing: i % 2 ? 1 : -1 });
      }
      for (let i = 0; i < 8; i++) poses.push({ mood: "happy", walking: true, walkPhase: i * 0.8, wearing });
    }
    for (const id of SPECIES_IDS) {
      for (const stage of [0, 4] as StageIndex[]) {
        for (const p of poses) {
          const b = petBounds(id, defaultPose({ ...p, stage }));
          expect(b.minX).toBeGreaterThanOrEqual(0);
          expect(b.minY).toBeGreaterThanOrEqual(0);
          expect(b.maxX).toBeLessThanOrEqual(160);
          expect(b.maxY).toBeLessThanOrEqual(160);
        }
      }
    }
  });

  it("grows with the stage around the feet", () => {
    const h = (stage: StageIndex): number => {
      const b = petBounds("mochi", defaultPose({ stage }));
      return b.maxY - b.minY;
    };
    expect(h(0)).toBeLessThan(h(2));
    expect(h(2)).toBeLessThan(h(4));
    expect(petBounds("mochi", defaultPose({ stage: 0 })).maxY).toBeCloseTo(petBounds("mochi", defaultPose({ stage: 4 })).maxY, 0);
  });
});

describe("performance", () => {
  it("renders a frame in well under 0.5 ms on average", () => {
    const poses = [
      defaultPose({ walking: true }),
      busyPose(),
      busyPose({ mood: "celebrating", celebration: "fireworks", golden: true, food: "🍩", foodT: 0.3 }),
    ];
    for (let i = 0; i < 300; i++) renderPet(SPECIES_IDS[i % SPECIES_IDS.length], poses[i % 3]); // warm up
    const n = 3000;
    const start = performance.now();
    for (let i = 0; i < n; i++) {
      const p = poses[i % 3];
      p.t = i / 30;
      p.walkPhase = i / 5;
      renderPet(SPECIES_IDS[i % SPECIES_IDS.length], p);
    }
    const perCall = (performance.now() - start) / n;
    expect(perCall).toBeLessThan(0.5);
  });
});

describe("app icon", () => {
  it("is a well-formed 1024×1024 SVG", () => {
    const svg = appIconSvg();
    expect(svg).not.toMatch(/NaN|undefined/);
    const doc = parser.parseFromString(svg, "image/svg+xml");
    expect(doc.getElementsByTagName("parsererror").length).toBe(0);
    expect(doc.documentElement.getAttribute("viewBox")).toBe("0 0 1024 1024");
  });
});
