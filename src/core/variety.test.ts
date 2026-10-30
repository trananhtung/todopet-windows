import { describe, expect, it } from "vitest";
import { FRESH_MS, MAX_KEYS, chooseLine, normalizeSaid, remember, withEntry, type SaidEntry } from "./variety";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

/** mulberry32, as the pet's blinks use: the same picks every run. */
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let x = Math.imul(a ^ (a >>> 15), 1 | a);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

describe("chooseLine", () => {
  const now = Date.UTC(2026, 9, 30, 9);

  it("picks only among lines never said or said 48 hours ago or more", () => {
    const entry: SaidEntry = { n: 3, at: [now, 0, now - FRESH_MS] };
    for (const r of [0, 0.5, 0.99]) expect([1, 2]).toContain(chooseLine(3, entry, now, () => r));
  });

  it("says the line said longest ago when none is fresh, the first one on a tie", () => {
    expect(chooseLine(3, { n: 3, at: [now - 3, now - 1, now - 3] }, now, () => 0.99)).toBe(0);
  });

  it("forgets an entry made for a pack of another size", () => {
    const entry: SaidEntry = { n: 3, at: [now, now, now] };
    expect(chooseLine(4, entry, now, () => 0.99)).toBe(3);
  });

  it("counts a time in the future as just now", () => {
    expect(chooseLine(2, { n: 2, at: [now + 1e12, now - FRESH_MS] }, now, () => 0)).toBe(1);
  });

  it("after the clock went back, never picks the line said last before it did", () => {
    // Every time is in the future, so all count as now: the tie goes to the one said earliest.
    expect(chooseLine(3, { n: 3, at: [now + 3e9, now + 1e9, now + 2e9] }, now, () => 0)).toBe(1);
  });

  it("has nothing to choose for a single line", () => {
    expect(chooseLine(1, undefined, now, () => 0.7)).toBe(0);
  });
});

describe("remember", () => {
  const now = 1_000_000;

  it("marks the line said now and pulls times from the future back to just before it", () => {
    // Just before, not at: the line said now must stay the newest, or the next pick could tie and say it again.
    expect(remember({ n: 3, at: [5, now + 999, 7] }, 3, 2, now)).toEqual({ n: 3, at: [5, now - 1, now] });
  });

  it("fits the entry to the pack's size, starting over for a pack that changed", () => {
    expect(remember(undefined, 3, 0, now)).toEqual({ n: 3, at: [now, 0, 0] });
    expect(remember({ n: 2, at: [7, 8] }, 4, 3, now)).toEqual({ n: 4, at: [0, 0, 0, now] });
  });

  it("never changes the entry it was given", () => {
    const entry: SaidEntry = { n: 2, at: [1, 2] };
    remember(entry, 2, 0, now);
    expect(entry).toEqual({ n: 2, at: [1, 2] });
  });
});

describe("withEntry", () => {
  it("keeps at most 200 keys, dropping the one used longest ago", () => {
    const said: Record<string, SaidEntry> = {};
    for (let i = 0; i < MAX_KEYS; i++) said[`k${i}`] = { n: 2, at: [i + 1, 0] };
    const next = withEntry(said, "fresh", { n: 2, at: [10_000, 0] });
    expect(Object.keys(next)).toHaveLength(MAX_KEYS);
    expect(next.k0).toBeUndefined();
    expect(next.fresh).toEqual({ n: 2, at: [10_000, 0] });
    expect(said.fresh).toBeUndefined();
  });
});

/**
 * Picks 15 lines a day at 30-minute steps from 9:00 and checks, at every pick, the promises of the spec: a fresh line
 * is said whenever one is left (fresh = never said, or said 48 h ago or more, a time after `now` counting as now), and
 * with two or more lines the same one never comes twice in a row. `jump` moves the clock by that much on day `jumpAfter`.
 */
function simulate(n: number, days: number, opts: { jumpAfter?: number; jump?: number; checkFrom?: number } = {}) {
  const random = seeded(7);
  let entry: SaidEntry | undefined;
  const last: (number | undefined)[] = new Array<number | undefined>(n).fill(undefined);
  let previous = -1;
  let shift = 0;
  const failures: string[] = [];
  for (let day = 0; day < days; day++) {
    if (opts.jumpAfter !== undefined && day === opts.jumpAfter) shift += opts.jump ?? 0;
    for (let k = 0; k < 15; k++) {
      const now = Date.UTC(2026, 0, 1) + day * DAY + 9 * HOUR + k * 30 * 60_000 + shift;
      const fresh = last.map((t, i) => (t === undefined || now - Math.min(t, now) >= FRESH_MS ? i : -1)).filter((i) => i >= 0);
      const i = chooseLine(n, entry, now, random);
      const checked = opts.checkFrom === undefined || now >= opts.checkFrom + shift;
      if (checked && fresh.length > 0 && !fresh.includes(i)) failures.push(`day ${day} pick ${k}: said ${i}, fresh ${fresh.join(",")}`);
      if (n >= 2 && i === previous) failures.push(`day ${day} pick ${k}: ${i} twice in a row`);
      entry = remember(entry, n, i, now);
      for (let j = 0; j < n; j++) if (last[j] !== undefined) last[j] = Math.min(last[j]!, now);
      last[i] = now;
      previous = i;
    }
  }
  return failures;
}

describe("thirty days of lines", () => {
  for (const n of [1, 2, 4, 20]) {
    it(`a pack of ${n}: a fresh line whenever one is left, never the same twice in a row`, () => {
      expect(simulate(n, 30)).toEqual([]);
    });
  }

  it("gets over a clock that went back a year within 48 hours", () => {
    const jumpDay = 10;
    const after = Date.UTC(2026, 0, 1) + jumpDay * DAY + FRESH_MS;
    expect(simulate(4, 20, { jumpAfter: jumpDay, jump: -365 * DAY, checkFrom: after })).toEqual([]);
    expect(simulate(20, 20, { jumpAfter: jumpDay, jump: -365 * DAY, checkFrom: after })).toEqual([]);
  });
});

describe("normalizeSaid", () => {
  it("gives an empty memory for anything but an object", () => {
    for (const raw of [null, undefined, [], "x", 3]) expect(normalizeSaid(raw)).toEqual({});
  });

  it("drops keys that don't look like line keys", () => {
    const ok = { n: 2, at: [1, 2] };
    expect(normalizeSaid({ Done: ok, "1x": ok, ["a".repeat(65)]: ok, done: ok, "nudge.happy": ok })).toEqual({ done: ok, "nudge.happy": ok });
  });

  it("drops an entry whose size is not a whole number from 1 to 40", () => {
    for (const n of [0, 41, 2.5, "3", null]) expect(normalizeSaid({ done: { n, at: [1] } })).toEqual({});
  });

  it("keeps every position: a bad time counts as never said, nothing shifts", () => {
    expect(normalizeSaid({ done: { n: 6, at: [5, Number.NaN, -1, "5", null, 9] } })).toEqual({ done: { n: 6, at: [5, 0, 0, 0, 0, 9] } });
    expect(normalizeSaid({ done: { n: 2, at: [1, 2, 3, 4] } })).toEqual({ done: { n: 2, at: [1, 2] } });
    expect(normalizeSaid({ done: { n: 3, at: [7] } })).toEqual({ done: { n: 3, at: [7, 0, 0] } });
    expect(normalizeSaid({ done: { n: 2 } })).toEqual({ done: { n: 2, at: [0, 0] } });
  });

  it("keeps the 200 keys used last", () => {
    const raw: Record<string, SaidEntry> = {};
    for (let i = 0; i < 250; i++) raw[`k${i}`] = { n: 1, at: [i + 1] };
    const said = normalizeSaid(raw);
    expect(Object.keys(said)).toHaveLength(MAX_KEYS);
    expect(said.k49).toBeUndefined();
    expect(said.k50).toEqual({ n: 1, at: [51] });
  });
});
