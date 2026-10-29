import { describe, expect, it } from "vitest";
import { ACT_DURATION, type PetActKind } from "../pets";
import { FIDGETS, greetingFor, INTERACT, PetLife, pickFidget, type InteractInput, type InteractOutput } from "./interact";

/** Deterministic RNG (mulberry32). */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const PET = { x: 600, y: 700, size: 150 };
/** A point on the pet's body, and one far away from it. */
const ON = { x: 600, y: 640 };
const FAR = { x: 100, y: 100 };

const base = (now: number, patch: Partial<InteractInput> = {}): InteractInput => ({
  now,
  pet: PET,
  cursor: FAR,
  held: false,
  grounded: true,
  walking: false,
  idleSec: 0,
  typing: false,
  focus: false,
  meeting: false,
  mood: "normal",
  busy: false,
  away: false,
  ...patch,
});

type Patch = Partial<InteractInput> | ((now: number) => Partial<InteractInput>);

/** Steps from `from` to `to` at `fps`, returning every output with its time. */
function run(life: PetLife, from: number, to: number, patch: Patch = {}, fps = 30): { now: number; out: InteractOutput }[] {
  const outs: { now: number; out: InteractOutput }[] = [];
  const n = Math.round((to - from) * fps);
  for (let k = 0; k <= n; k++) {
    const now = from + k / fps;
    const p = typeof patch === "function" ? patch(now) : patch;
    outs.push({ now, out: life.step(base(now, p)) });
  }
  return outs;
}

/** The acts that started in a run, in order. */
function started(outs: { now: number; out: InteractOutput }[]): { kind: PetActKind; at: number }[] {
  const list: { kind: PetActKind; at: number }[] = [];
  let prev: { kind: PetActKind; t: number } | null = null;
  for (const { now, out } of outs) {
    const a = out.act;
    if (a && (!prev || prev.kind !== a.kind || a.t < prev.t)) list.push({ kind: a.kind, at: now - a.t });
    prev = a;
  }
  return list;
}

/** A stroke back and forth across the pet at `speed` px/s. */
const stroke = (speed: number) => (now: number) => {
  const span = 60;
  const ph = ((now * speed) / span) % 2;
  return { cursor: { x: PET.x - 30 + (ph < 1 ? ph : 2 - ph) * span, y: 640 } };
};

describe("petting", () => {
  it("starts after 0.3 s of stroking faster than 40 px/s and grows while it lasts", () => {
    const life = new PetLife(rng(1));
    const outs = run(life, 0, 3, stroke(200));
    const first = outs.find((o) => o.out.petting > 0)!;
    expect(first.now).toBeGreaterThanOrEqual(INTERACT.petAfter - 0.05);
    expect(first.now).toBeLessThan(0.45);
    expect(outs[outs.length - 1].out.petting).toBeGreaterThan(2.4);
  });

  it("ends 0.5 s after the strokes stop, easing out", () => {
    const life = new PetLife(rng(2));
    run(life, 0, 2, stroke(200));
    // The cursor rests on the pet: no more motion.
    const outs = run(life, 2 + 1 / 30, 3.5, { cursor: ON });
    const at = (t: number) => outs.find((o) => o.now >= t)!.out.petting;
    expect(at(2.4)).toBeGreaterThan(1.5);
    // Ended by ~2.7 (0.2 s speed window + 0.5 s grace), then a quick fade.
    expect(at(2.85)).toBeLessThan(0.4);
    expect(at(3.2)).toBe(0);
  });

  it("ignores slow moves and strokes beside the pet", () => {
    const slow = run(new PetLife(rng(3)), 0, 3, stroke(25));
    expect(slow.every((o) => o.out.petting === 0)).toBe(true);
    const beside = run(new PetLife(rng(3)), 0, 3, (now) => ({ cursor: { x: 300 + (now * 200) % 60, y: 640 } }));
    expect(beside.every((o) => o.out.petting === 0)).toBe(true);
  });

  it("stops at once when the pet is picked up", () => {
    const life = new PetLife(rng(4));
    run(life, 0, 1.5, stroke(200));
    life.grab(1.5);
    const out = life.step(base(1.55, { held: true, cursor: ON }));
    expect(out.petting).toBe(0);
  });
});

describe("click combos", () => {
  const clickAt = (life: PetLife, times: number[]) => times.map((t) => (life.step(base(t)), life.click(t)));

  it("giggles on the third click within 2 s, not before", () => {
    const life = new PetLife(rng(5));
    run(life, 0, 1);
    const pokes = clickAt(life, [1, 1.5, 1.9]);
    expect(pokes).toEqual([false, false, true]);
    expect(life.step(base(2)).act?.kind).toBe("giggle");

    const slow = new PetLife(rng(5));
    run(slow, 0, 1);
    clickAt(slow, [1, 2.2, 3.4]);
    expect(slow.step(base(3.5)).act).toBeNull();
  });

  it("gets dizzy on the sixth click within 4 s, then pouts", () => {
    const life = new PetLife(rng(6));
    run(life, 0, 1);
    clickAt(life, [1, 1.4, 1.8, 2.2, 2.6, 3.0]);
    const outs = run(life, 3.0, 8);
    const acts = started(outs).map((a) => a.kind);
    expect(acts).toEqual(["dizzy", "pout"]);
    const pout = started(outs)[1];
    expect(pout.at).toBeCloseTo(3 + ACT_DURATION.dizzy, 1);
  });

  it("rests 10 s before reacting again", () => {
    const life = new PetLife(rng(7));
    run(life, 0, 1);
    clickAt(life, [1, 1.3, 1.6]); // giggle, ends at 2.8
    run(life, 1.6, 6);
    clickAt(life, [6, 6.3, 6.6]); // within the cooldown
    expect(life.step(base(6.7)).act).toBeNull();
    run(life, 6.7, 13);
    clickAt(life, [13, 13.3, 13.6]); // 2.8 + 10 = 12.8: ready again
    expect(life.step(base(13.7)).act?.kind).toBe("giggle");
  });

  it("keeps pokes from toggling the board during a combo", () => {
    const life = new PetLife(rng(8));
    run(life, 0, 1);
    const pokes = clickAt(life, [1, 1.3, 1.6, 2.5, 3.2, 3.6]);
    expect(pokes).toEqual([false, false, true, true, true, true]);
  });

  it("does not react while held or celebrating", () => {
    const life = new PetLife(rng(9));
    run(life, 0, 1, { mood: "celebrating" });
    [1, 1.2, 1.4].forEach((t) => {
      life.step(base(t, { mood: "celebrating" }));
      life.click(t);
    });
    expect(life.step(base(1.5, { mood: "celebrating" })).act).toBeNull();
  });
});

describe("pick-up and put-down", () => {
  it("shakes once it has landed, then looks at the user", () => {
    const life = new PetLife(rng(10));
    run(life, 0, 1);
    life.grab(1);
    run(life, 1, 2, { held: true, grounded: false });
    life.drop(2);
    // Still falling: no shake yet.
    expect(life.step(base(2.1, { grounded: false })).act).toBeNull();
    const landed = life.step(base(2.3));
    expect(landed.act?.kind).toBe("shake");
    const outs = run(life, 2.3, 5);
    const afterShake = outs.find((o) => o.now > 2.3 + ACT_DURATION.shake + 0.05)!;
    expect(afterShake.out.act).toBeNull();
    expect(afterShake.out.lookAtUser).toBe(true);
    expect(outs[outs.length - 1].out.lookAtUser).toBe(false);
  });
});

describe("return greeting", () => {
  it("scales the hello with time away", () => {
    expect(greetingFor(6 * 60)).toEqual(["wave"]);
    expect(greetingFor(45 * 60)).toEqual(["hop", "wave"]);
    expect(greetingFor(3 * 3600)).toEqual(["hop", "hop", "hop", "wave"]);
  });

  const away = (seconds: number, wakeMood: InteractInput["mood"] = "normal") => {
    const life = new PetLife(rng(11));
    run(life, 0, 2, { idleSec: seconds, mood: "sleeping" }, 10);
    return started(run(life, 2, 12, { idleSec: 0.5, mood: wakeMood }));
  };

  it("waves after 5–30 min, hops after up to 2 h, hops a few times after longer", () => {
    expect(away(400).map((a) => a.kind)).toEqual(["wave"]);
    expect(away(3600).map((a) => a.kind)).toEqual(["hop", "wave"]);
    expect(away(9000).map((a) => a.kind)).toEqual(["hop", "hop", "hop", "wave"]);
  });

  it("does not greet after a short pause, and never sulks", () => {
    expect(away(200)).toEqual([]);
    for (const s of [400, 3600, 9000, 30000]) expect(away(s).some((a) => a.kind === "pout")).toBe(false);
  });

  it("waits for the pet to wake up, and gives up after 30 s", () => {
    const life = new PetLife(rng(12));
    run(life, 0, 1, { idleSec: 900, mood: "sleeping" }, 10);
    const asleep = run(life, 1, 5, { idleSec: 0.5, mood: "sleeping" });
    expect(started(asleep)).toEqual([]);
    expect(asleep[asleep.length - 1].out.greeting).toBe(true);
    expect(started(run(life, 5, 8, { idleSec: 0.5 })).map((a) => a.kind)).toEqual(["wave"]);

    const late = new PetLife(rng(12));
    run(late, 0, 1, { idleSec: 900, mood: "sleeping" }, 10);
    run(late, 1, 40, { idleSec: 0.5, mood: "sleeping" }, 10);
    expect(started(run(late, 40, 45, { idleSec: 0.5 })).filter((a) => a.kind === "wave")).toEqual([]);
  });
});

describe("idle fidgets", () => {
  const fidgetKinds = new Set(FIDGETS.map((f) => f.kind));

  it("starts after 15 s without interaction, every 8–30 s, never the same twice in a row", () => {
    const life = new PetLife(rng(13));
    const acts = started(run(life, 0, 600, {}, 10));
    expect(acts.length).toBeGreaterThan(15);
    expect(acts[0].at).toBeGreaterThanOrEqual(INTERACT.fidgetQuiet - 0.01);
    expect(acts[0].at).toBeLessThan(INTERACT.fidgetQuiet + 0.2);
    for (let k = 1; k < acts.length; k++) {
      expect(fidgetKinds.has(acts[k].kind)).toBe(true);
      expect(acts[k].kind).not.toBe(acts[k - 1].kind);
      const gap = acts[k].at - acts[k - 1].at;
      expect(gap).toBeGreaterThanOrEqual(INTERACT.fidgetGapMin - 0.01);
      expect(gap).toBeLessThanOrEqual(INTERACT.fidgetGapMax + 0.2);
    }
  });

  it("picks by weight and never repeats the last one", () => {
    const counts: Record<string, number> = {};
    const r = rng(14);
    for (let k = 0; k < 20000; k++) {
      const f = pickFidget(null, r());
      counts[f] = (counts[f] ?? 0) + 1;
    }
    for (const f of FIDGETS) expect(counts[f.kind] / 20000).toBeCloseTo(f.weight, 1);
    for (const last of FIDGETS) for (let k = 0; k < 50; k++) expect(pickFidget(last.kind, k / 50)).not.toBe(last.kind);
  });

  it("never interrupts typing, focus, meetings, celebrations, holding or a chase", () => {
    const blockers: Partial<InteractInput>[] = [
      { typing: true },
      { focus: true },
      { meeting: true },
      { mood: "celebrating" },
      { held: true, grounded: false },
      { busy: true },
      { mood: "sleeping" },
      { away: true },
    ];
    for (const b of blockers) {
      const acts = started(run(new PetLife(rng(15)), 0, 400, b, 10));
      expect(acts, JSON.stringify(b)).toEqual([]);
    }
  });

  it("resets the quiet timer whenever the cursor is near the pet", () => {
    const life = new PetLife(rng(16));
    // Near the pet for 30 s, then away: the first fidget comes 15 s after it left.
    const acts = started(run(life, 0, 60, (now) => ({ cursor: now < 30 ? { x: 640, y: 600 } : FAR }), 10));
    // The last frame near the pet is at 29.9 s (10 fps).
    expect(acts[0].at).toBeGreaterThanOrEqual(29.9 + INTERACT.fidgetQuiet - 0.01);
  });

  it("waits until the pet stops walking", () => {
    const life = new PetLife(rng(17));
    const acts = started(run(life, 0, 40, (now) => ({ walking: now < 25 }), 10));
    expect(acts[0].at).toBeGreaterThanOrEqual(25);
  });
});

describe("drowsiness", () => {
  it("ramps from 3 to 5 min of no input, then yawns", () => {
    const life = new PetLife(rng(18));
    const outs = run(life, 0, 400, (now) => ({ idleSec: now }), 10);
    const at = (t: number) => outs.find((o) => o.now >= t)!.out;
    expect(at(170).drowsy).toBe(0);
    expect(at(240).drowsy).toBeGreaterThan(0.4);
    expect(at(240).drowsy).toBeLessThan(0.6);
    expect(at(305).drowsy).toBe(1);
    const yawns = started(outs).filter((a) => a.kind === "yawn");
    expect(yawns.length).toBeGreaterThanOrEqual(1);
    expect(yawns[0].at).toBeGreaterThanOrEqual(290);
    expect(yawns[0].at).toBeLessThan(310);
  });

  it("wakes up quickly on input and never yawns in a meeting or during focus", () => {
    const life = new PetLife(rng(19));
    run(life, 0, 2, { idleSec: 320 }, 10);
    const outs = run(life, 2, 4, { idleSec: 0.2 });
    expect(outs[outs.length - 1].out.drowsy).toBeLessThan(0.05);

    for (const b of [{ meeting: true }, { focus: true }]) {
      const acts = started(run(new PetLife(rng(20)), 0, 500, (now) => ({ idleSec: now, ...b }), 10));
      expect(acts.filter((a) => a.kind === "yawn")).toEqual([]);
    }
  });
});

describe("clumsy moments", () => {
  it("sneezes or trips at most once an hour, and not while typing", () => {
    const life = new PetLife(rng(21));
    // Interaction near the pet keeps fidgets out of the way; clumsy moments need quiet too, so let it be quiet.
    const acts = started(run(life, 0, 4 * 3600, {}, 4)).filter((a) => a.kind === "sneeze" || a.kind === "trip");
    expect(acts.length).toBeGreaterThanOrEqual(1);
    expect(acts.length).toBeLessThanOrEqual(4);
    expect(acts[0].at).toBeGreaterThanOrEqual(INTERACT.clumsyFirst);
    for (let k = 1; k < acts.length; k++) expect(acts[k].at - acts[k - 1].at).toBeGreaterThanOrEqual(3600);

    const typing = started(run(new PetLife(rng(21)), 0, 4 * 3600, { typing: true }, 4));
    expect(typing).toEqual([]);
  });
});

describe("head tilt", () => {
  it("eases to 10–15° when the cursor rests near the pet for 0.6 s, and back when it leaves", () => {
    const life = new PetLife(rng(22));
    const near = { x: 680, y: 590 };
    const outs = run(life, 0, 3, (now) => ({ cursor: now < 2 ? near : FAR }));
    const at = (t: number) => outs.find((o) => o.now >= t)!.out.headTilt;
    expect(at(0.5)).toBe(0);
    expect(at(1.15)).toBeGreaterThan(9);
    expect(at(1.9)).toBeGreaterThanOrEqual(INTERACT.tiltMin - 0.2);
    expect(at(1.9)).toBeLessThanOrEqual(INTERACT.tiltMax);
    expect(at(2.6)).toBeLessThan(1);
  });

  it("stops a walking pet to look, and tilts only once it stands", () => {
    const life = new PetLife(rng(26));
    const near = { x: 680, y: 590 };
    const walking = run(life, 0, 1.5, { cursor: near, walking: true });
    expect(walking[walking.length - 1].out.curious).toBe(true);
    expect(walking.every((o) => o.out.headTilt === 0)).toBe(true);
    const standing = run(life, 1.5, 2.3, { cursor: near });
    expect(standing[standing.length - 1].out.headTilt).toBeGreaterThan(9);
  });

  it("does not tilt for a cursor that keeps moving or is far away", () => {
    const moving = run(new PetLife(rng(23)), 0, 3, (now) => ({ cursor: { x: 640 + ((now * 120) % 60), y: 590 } }));
    expect(moving.every((o) => o.out.headTilt < 9)).toBe(true);
    const far = run(new PetLife(rng(23)), 0, 3, { cursor: FAR });
    expect(far.every((o) => o.out.headTilt === 0)).toBe(true);
  });

  it("ponders for 0.4 s before a celebration", () => {
    const life = new PetLife(rng(24));
    run(life, 0, 1);
    expect(life.celebrate(1)).toBe(INTERACT.ponder);
    const during = life.step(base(1.2, { mood: "celebrating" }));
    expect(during.act?.kind).toBe("ponder");
    expect(during.pondering).toBe(true);
    const after = life.step(base(1.45, { mood: "celebrating" }));
    expect(after.pondering).toBe(false);
    expect(after.act).toBeNull();
  });

  it("skips the ponder for a pet in the air", () => {
    const life = new PetLife(rng(25));
    life.step(base(0, { held: true }));
    expect(life.celebrate(0.1)).toBe(0);
  });
});
