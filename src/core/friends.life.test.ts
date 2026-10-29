// v0.6 "Friends" in the pet's life: the 28-day record that goes on a card (written when a day is settled, with a
// tolerant migration for pets saved before it) and the weekly boss's reward (+50 XP and a 🏅 on the sticker page).
import { beforeEach, describe, expect, it } from "vitest";
import { addDays } from "./dates";
import { setLang } from "./l10n";
import * as life from "./life";

beforeEach(() => setLang("en"));

const always = () => true;
/** A day the app saw, about to be settled. */
function day(patch: Partial<life.LifeState> = {}): life.LifeState {
  return { ...life.newLife(), dayKey: "2026-10-26", daySeen: true, dayWorkday: true, dayTarget: 3, dayPlanned: 3, dayCompleted: 0, ...patch };
}
const mark = (s: life.LifeState, d = "2026-10-26") => s.history[d];

describe("the 28-day record: what each settled day is remembered as", () => {
  it("remembers a day that met the goal as G, and one with a task or two as K", () => {
    const goal = day({ dayCompleted: 3 });
    life.closeDay(goal, "2026-10-27", always);
    expect(mark(goal)).toBe("G");
    const more = day({ dayCompleted: 5 });
    life.closeDay(more, "2026-10-27", always);
    expect(mark(more)).toBe("G");
    const some = day({ dayCompleted: 1 });
    life.closeDay(some, "2026-10-27", always);
    expect(mark(some)).toBe("K");
  });

  it("remembers a goal met on a rest day as G, and a task on a rest day as K", () => {
    const s = day({ dayCompleted: 3, dayWorkday: false });
    life.closeDay(s, "2026-10-27", always);
    expect(mark(s)).toBe("G");
    const t = day({ dayCompleted: 1, dayWorkday: false });
    life.closeDay(t, "2026-10-27", always);
    expect(mark(t)).toBe("K");
  });

  it("remembers a day off with nothing done as R, a busy day with nothing done too (it was excused), and a missed day as -", () => {
    const off = day({ dayWorkday: false });
    life.closeDay(off, "2026-10-27", always);
    expect(mark(off)).toBe("R");
    const busy = day({ dayBusy: true });
    expect(life.closeDay(busy, "2026-10-27", always).outcome).toBe("excused");
    expect(mark(busy)).toBe("R");
    const frozen = day({ streak: 3, snacks: 1 });
    expect(life.closeDay(frozen, "2026-10-27", always).outcome).toBe("frozen");
    expect(mark(frozen)).toBe("-");
    const broken = day({ streak: 3, snacks: 0 });
    expect(life.closeDay(broken, "2026-10-27", always).outcome).toBe("broken");
    expect(mark(broken)).toBe("-");
  });

  it("remembers a day the app never saw as - on a workday and R on a day off", () => {
    const work = day({ daySeen: false, dayCompleted: 4 });
    life.closeDay(work, "2026-10-27", always);
    expect(mark(work)).toBe("-");
    const off = day({ daySeen: false, dayWorkday: false });
    life.closeDay(off, "2026-10-27", always);
    expect(mark(off)).toBe("R");
  });

  it("leaves the days between alone: the PC was off, so they have no entry", () => {
    const s = day({ dayCompleted: 3 });
    life.closeDay(s, "2026-10-30", always);
    expect(Object.keys(s.history)).toEqual(["2026-10-26"]);
  });

  it("keeps only the last 28 days", () => {
    const s = day({ dayCompleted: 1 });
    for (let i = 0; i < 40; i++) {
      s.daySeen = true;
      s.dayCompleted = 1;
      life.closeDay(s, addDays(s.dayKey, 1), always);
    }
    expect(s.dayKey).toBe("2026-12-05");
    // The window is the 28 days ending today; today itself is not settled yet, so 27 are there.
    const keys = Object.keys(s.history).sort();
    expect(keys).toHaveLength(27);
    expect(keys[0]).toBe("2026-11-08");
    expect(keys.at(-1)).toBe("2026-12-04");
  });

  it("settles the day it was told about once: the day in progress has no entry yet", () => {
    const s = day({ dayCompleted: 3 });
    life.closeDay(s, "2026-10-26", always);
    expect(s.history).toEqual({});
  });

  it("starts a new pet with an empty record", () => {
    expect(life.newLife().history).toEqual({});
    expect(life.newLife().bossWins).toEqual([]);
    expect(life.newLife().pageMedals).toBe(0);
  });
});

describe("saved pets from before the record", () => {
  it("get one: perfect days were goal days", () => {
    const s = life.lifeFromJson({ perfectDays: ["2026-10-20", "2026-10-22"], xp: 10 });
    expect(s.history).toEqual({ "2026-10-20": "G", "2026-10-22": "G" });
    expect(s.xp).toBe(10);
  });

  it("keep what they saved, and drop what isn't a day or a mark", () => {
    const saved = { "2026-10-20": "K", "2026-10-21": "R", "2026-10-22": "-", "2026-10-23": "G", "2026-13-01": "G", soon: "G", "2026-10-24": "X", "2026-10-25": 5, "2026-10-19": null };
    const s = life.lifeFromJson({ history: saved, perfectDays: ["2026-10-20"] });
    // The saved mark wins over what a perfect day would suggest.
    expect(s.history).toEqual({ "2026-10-20": "K", "2026-10-21": "R", "2026-10-22": "-", "2026-10-23": "G" });
  });

  it("keep only the newest 28 entries", () => {
    const history: Record<string, string> = {};
    for (let i = 0; i < 40; i++) history[addDays("2026-09-01", i)] = "K";
    const keys = Object.keys(life.lifeFromJson({ history }).history).sort();
    expect(keys).toHaveLength(28);
    expect(keys[0]).toBe(addDays("2026-09-01", 12));
    expect(keys.at(-1)).toBe(addDays("2026-09-01", 39));
  });

  it("shrug off a record that isn't an object", () => {
    for (const history of [null, 5, "GGG", ["G"], true]) expect(life.lifeFromJson({ history }).history).toEqual({});
  });

  it("round-trip through JSON, and never lose the rest of the pet", () => {
    const s = { ...life.demoLife(), perfectDays: [] as string[], history: { "2026-10-20": "G", "2026-10-21": "R" } as Record<string, life.DayMark>, bossWins: ["2026-W43"], pageMedals: 1, pageFilled: 5 };
    const back = life.lifeFromJson(JSON.parse(JSON.stringify(s)));
    expect(back.history).toEqual(s.history);
    expect(back.bossWins).toEqual(["2026-W43"]);
    expect(back.pageMedals).toBe(1);
    expect(back.xp).toBe(s.xp);
    expect(back.souvenirs).toEqual(s.souvenirs);
  });

  it("gives the demo pet a record to show", () => {
    const s = life.demoLife();
    expect(Object.keys(s.history).length).toBeGreaterThan(5);
    expect(Object.values(s.history).every((m) => life.DAY_MARKS.includes(m))).toBe(true);
  });
});

describe("the weekly boss's reward", () => {
  const winner = (patch: Partial<life.LifeState> = {}): life.LifeState => ({ ...life.newLife(), week: { key: "2026-10-26", done: 3, stickers: 0, trips: 0 }, ...patch });

  it("is 50 XP and a 🏅 on the sticker page", () => {
    const s = winner({ xp: 200, stickerPage: 1, pageFilled: 4 });
    const r = life.winBoss(s, "2026-W44", "2026-10-29");
    expect(r).toMatchObject({ xp: 50, pageDone: false, snack: false, levelUp: null });
    expect(s).toMatchObject({ xp: 250, pageFilled: 5, pageMedals: 1, bossWins: ["2026-W44"] });
  });

  it("counts as a sticker in the week's recap", () => {
    const s = winner();
    life.winBoss(s, "2026-W44", "2026-10-29");
    expect(s.week.stickers).toBe(1);
  });

  it("comes once a week, however many times it is asked", () => {
    const s = winner({ xp: 0 });
    expect(life.winBoss(s, "2026-W44", "2026-10-29")).not.toBeNull();
    expect(life.winBoss(s, "2026-W44", "2026-10-30")).toBeNull();
    expect(life.winBoss(s, "2026-W44", "2026-11-01")).toBeNull();
    expect(s).toMatchObject({ xp: 50, pageMedals: 1, bossWins: ["2026-W44"] });
    // The next week's blob is a new one.
    expect(life.winBoss(s, "2026-W45", "2026-11-04")).not.toBeNull();
    expect(s).toMatchObject({ xp: 100, pageMedals: 2, bossWins: ["2026-W44", "2026-W45"] });
  });

  it("is never given for a week with no name", () => {
    const s = winner();
    expect(life.winBoss(s, "", "2026-10-29")).toBeNull();
    expect(s.xp).toBe(0);
  });

  it("can fill the page: the page's own +50 XP and a snack come with it, and the medals go back to 0", () => {
    const s = winner({ xp: 10, stickerPage: 2, pageFilled: 9, pageMedals: 2, snacks: 0 });
    const r = life.winBoss(s, "2026-W44", "2026-10-29");
    expect(r).toMatchObject({ pageDone: true, snack: true, xp: 100 });
    expect(s).toMatchObject({ xp: 110, stickerPage: 3, pageFilled: life.PAGE_GIFTS, pageMedals: 0, snacks: 1 });
  });

  it("can grow the pet a stage", () => {
    const s = winner({ xp: 80 });
    const r = life.winBoss(s, "2026-W44", "2026-10-29");
    expect(r?.levelUp).toBe(1);
    expect(life.stageOf(s.xp)).toBe(1);
  });

  it("keeps the list of wins short", () => {
    const s = winner();
    for (let i = 1; i <= 80; i++) life.winBoss(s, `2026-W${String(i % 53 || 53).padStart(2, "0")}-${i}`, "2026-10-29");
    expect(s.bossWins.length).toBeLessThanOrEqual(60);
    expect(s.bossWins.at(-1)).toBe("2026-W27-80");
  });

  it("is read back safely from a saved pet", () => {
    const s = life.lifeFromJson({ bossWins: ["2026-W44", 5, null, "2026-W44", "2026-W43"], pageFilled: 4, pageMedals: 9 });
    expect(s.bossWins).toEqual(["2026-W44", "2026-W43"]);
    // At most as many medals as the page has stickers of its own (4 − the 2 gifts).
    expect(s.pageMedals).toBe(2);
    expect(life.lifeFromJson({ pageMedals: -3 }).pageMedals).toBe(0);
    expect(life.lifeFromJson({ bossWins: "2026-W44" }).bossWins).toEqual([]);
  });

  it("starts a page that a perfect day filled without medals", () => {
    const s = day({ dayCompleted: 3, pageFilled: 9, pageMedals: 1, stickerPage: 1 });
    life.closeDay(s, "2026-10-27", always);
    expect(s.pageFilled).toBe(life.PAGE_GIFTS);
    expect(s.pageMedals).toBe(0);
  });
});
