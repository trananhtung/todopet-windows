// v0.5 "Game" in the brain: chests for active work, knitting during focus, trips, and the Monday fresh start.
import { describe, expect, it, vi } from "vitest";
import { createDemoBackend } from "../backend/demo";
import type { SystemSample } from "../backend/types";
import { Brain, type Bubble } from "./brain";
import { dayKey } from "./dates";
import { setLang } from "./l10n";
import { demoLife, type LifeState } from "./life";
import { defaultPrefs, type Prefs } from "./prefs";

const MIN = 60_000;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const at = (month: number, day: number, h: number, m = 0) => new Date(2026, month - 1, day, h, m).getTime();
const YOUTUBE = { app: { name: "Google Chrome", exe: "chrome.exe", title: "Cats - YouTube" }, url: "https://www.youtube.com/watch?v=1" };

/** Random numbers from `values`, then 0.5. */
const seq = (values: number[]) => () => values.shift() ?? 0.5;

/**
 * The demo, by default on Wednesday 28 October 2026 at 9:00, with `life` (for today unless it says otherwise) and
 * `prefs` saved first.
 */
async function rig(opts: { start?: number; life?: Partial<LifeState>; prefs?: Partial<Prefs>; random?: () => number } = {}) {
  const clock = { t: opts.start ?? at(10, 28, 9) };
  const backend = createDemoBackend({ now: () => clock.t, persist: false });
  if (opts.life) await backend.storage.save("life", { ...demoLife(), dayKey: dayKey(new Date(clock.t)), ...opts.life });
  if (opts.prefs) await backend.storage.save("prefs", { ...defaultPrefs(clock.t), ...opts.prefs });
  let front: Partial<SystemSample> = {};
  const sample = (): SystemSample => ({
    app: { name: "Visual Studio Code", exe: "code.exe", title: "work" },
    url: null,
    idleSeconds: 0,
    secondsSinceKey: 999,
    fullscreen: false,
    appSwitchedAt: clock.t - 60 * MIN,
    ...front,
  });
  const brain = await Brain.create(backend, { demo: true, now: () => clock.t, random: opts.random ?? (() => 0.5) });
  setLang("en");
  await brain.start();
  brain.dismissBubble(brain.getSnapshot().bubble?.id ?? -1, "closed");
  brain.onSample(sample());
  const show = (patch: Partial<SystemSample>) => {
    front = patch;
    brain.onSample(sample());
  };
  /** The heartbeat, `seconds` later. */
  const tick = (seconds = 15) => {
    clock.t += seconds * 1000;
    brain.onSample(sample());
    brain.tick();
  };
  /** The rules only (no heartbeat), `minutes` later. */
  const step = (minutes = 1): Bubble | null => {
    clock.t += minutes * MIN;
    brain.recompute();
    brain.runRules(clock.t);
    return brain.getSnapshot().bubble;
  };
  /** Steps a minute at a time, letting other bubbles fade, until one matches. */
  const until = (match: (b: Bubble) => boolean, max = 60): Bubble => {
    for (let i = 0; i < max; i++) {
      const b = step();
      if (!b) continue;
      if (match(b)) return b;
      brain.dismissBubble(b.id, "ignored");
    }
    throw new Error("no matching bubble");
  };
  const diary = vi.spyOn(brain.diary, "add");
  return { clock, brain, show, tick, step, until, diary, s: () => brain.getSnapshot() };
}

describe("Brain and chests", () => {
  it("earns a chest with active work, but not while distracted or away", async () => {
    const { s, tick, show, brain } = await rig({ life: { chests: 0, chestsToday: 0, chestDay: "2026-10-28", workSec: 1790 } });
    tick();
    expect(s().life).toMatchObject({ chests: 1, chestsToday: 1, workSec: 5 });
    expect(s().chests).toEqual({ held: 1, today: 1, next: 5 / 1800 });
    show(YOUTUBE);
    tick();
    expect(s().life.workSec).toBe(5);
    show({ idleSeconds: 120 });
    tick();
    expect(s().life.workSec).toBe(5);
    show({});
    tick();
    expect(s().life.workSec).toBe(20);
    brain.stop();
  });

  it("opens a held chest when a task is done, in the same celebration bubble", async () => {
    // The feed rolls 0.5 and 0.5 (no golden treat); the chest rolls 0.8 (rare) and picks the first new accessory.
    const { s, brain } = await rig({ life: { chests: 1 }, random: seq([0.5, 0.5, 0.8, 0]) });
    await brain.complete(s().next!);
    const b = s().bubble!;
    expect(b.text).toContain("Rare chest! A new 🧶 Beanie");
    expect(b.reminder).toBe(false);
    expect(b.actions.map((a) => a.title)).toEqual(["Undo"]);
    expect(s().life.chests).toBe(0);
    expect(s().life.unlocked).toContain("beanie");
    expect(s().life.wearing).toContain("beanie");
    expect(s().reveal).toMatchObject({ kind: "chest", chest: { tier: "rare", reward: "accessory", accessory: "beanie" } });
    brain.stop();
  });

  it("keeps the chest open after Undo, taking back only what the task gave", async () => {
    const { s, brain } = await rig({ life: { chests: 2, xp: 100 } });
    const task = s().next!;
    await brain.complete(task);
    // 10 XP for the task, 20 from a common chest.
    expect(s().life.xp).toBe(130);
    expect(s().bubble?.text).toContain("Opened a chest: +20 XP");
    await brain.undoComplete(task);
    expect(s().life).toMatchObject({ xp: 120, chests: 1 });
    brain.stop();
  });

  it("says nothing about chests when none is held", async () => {
    const { s, brain } = await rig({ life: { chests: 0 } });
    await brain.complete(s().next!);
    expect(s().bubble?.text).not.toContain("chest");
    expect(s().reveal).toBeNull();
    brain.stop();
  });

  it("shows the season in progress", async () => {
    const { s, brain } = await rig();
    expect(s().season).toMatchObject({ season: "halloween", daysLeft: 5 });
    brain.stop();
  });
});

describe("Brain and crafting", () => {
  it("knits during focus and finishes a decoration when the session completes", async () => {
    // Picks the first decoration not owned yet.
    const { s, tick, clock, brain } = await rig({ life: { craft: 0, decor: ["rug"] }, random: () => 0 });
    expect(s().craft).toBeNull();
    const start = clock.t;
    brain.startFocus(s().next, 25);
    expect(s().craft).toBe(0);
    for (let i = 0; i < 10; i++) tick();
    expect(s().life.craft).toBeCloseTo(150 / 1500);
    expect(s().craft).toBeCloseTo(0.1);
    clock.t = start + 25 * MIN - 15_000;
    tick();
    const b = s().bubble!;
    expect(b.text).toContain("25 minutes up");
    expect(b.text).toContain("All done! A potted plant");
    expect(s().life).toMatchObject({ craft: 0, decor: ["rug", "plant"] });
    expect(s().craft).toBeNull();
    expect(s().reveal).toMatchObject({ kind: "craft", decor: "plant", xp: 0 });
    brain.stop();
  });

  it("keeps the progress when you stop early, and doesn't knit on a break", async () => {
    const { s, tick, brain } = await rig({ life: { craft: 0 } });
    brain.startFocus(s().next, 25);
    for (let i = 0; i < 20; i++) tick();
    brain.stopFocus();
    expect(s().life.craft).toBeCloseTo(0.2);
    expect(s().craft).toBeNull();
    brain.startBreak();
    for (let i = 0; i < 4; i++) tick();
    expect(s().life.craft).toBeCloseTo(0.2);
    // A carried-over item that is already done gets finished when you stop.
    brain.stopFocus();
    brain.startFocus(s().next, 25);
    for (let i = 0; i < 90; i++) tick();
    expect(s().life.craft).toBe(1);
    brain.stopFocus();
    expect(s().life.craft).toBe(0);
    expect(s().life.decor).toHaveLength(4);
    expect(s().bubble?.text).toContain("All done!");
    brain.stop();
  });

  it("drops a few stitches after 30 s on a distraction during focus, once per visit", async () => {
    const { s, tick, show, brain } = await rig({ life: { craft: 0.5 } });
    brain.startFocus(s().next, 25);
    brain.dismissBubble(s().bubble!.id, "closed");
    show(YOUTUBE);
    tick();
    expect(s().life.craft).toBeCloseTo(0.51);
    tick();
    expect(s().life.craft).toBeCloseTo(0.42);
    expect(s().bubble?.text).toContain("dropped a few stitches");
    expect(s().bubble?.reminder).toBe(false);
    tick();
    tick();
    expect(s().life.craft).toBeCloseTo(0.44);
    // Back to work, then off again: a new visit.
    show({});
    tick();
    show(YOUTUBE);
    tick();
    tick();
    tick();
    expect(s().life.craft).toBeCloseTo(0.38);
    brain.stop();
  });
});

describe("Brain and crafting, already distracted", () => {
  it("counts the 30 s from the start of the session", async () => {
    const { s, tick, show, brain } = await rig({ life: { craft: 0.5 } });
    show(YOUTUBE);
    tick(120);
    brain.startFocus(s().next, 25);
    tick();
    expect(s().life.craft).toBeCloseTo(0.51);
    tick();
    expect(s().life.craft).toBeCloseTo(0.42);
    brain.stop();
  });
});

describe("Brain and trips", () => {
  it("offers a trip once today's plan is done (a check-in, not counted) and stays quiet while away", async () => {
    const { s, step, until, show, brain } = await rig({ prefs: { bubbleGap: 0 } });
    for (const id of ["1", "2", "4"]) await brain.complete(s().day.today.find((t) => t.id === id)!);
    await brain.refresh(); // let the syncs started by each completion land
    brain.dismissBubble(s().bubble!.id, "ignored");
    const left = s().nudgesLeft;
    const offer = until((b) => b.kind === "trip");
    expect(offer.text).toMatch(/Back at \d\d:\d\d/);
    expect(offer.reminder).toBe(true);
    expect(offer.actions.map((a) => a.title)).toEqual(["Go!", "Stay"]);
    expect(s().nudgesLeft).toBe(left);
    brain.pickAction(offer.id, 0);
    expect(s().trip).not.toBeNull();
    expect(s().life.tripDay).toBe("2026-10-28");
    const bye = s().bubble!;
    expect(bye.text).toContain("Back at");
    brain.dismissBubble(bye.id, "ignored");
    // Coming back to the PC while it's away: no welcome-back.
    show({ idleSeconds: 20 * 60 });
    expect(step()).toBeNull();
    show({});
    expect(step()).toBeNull();
    // The postponed task, the overdue one…: all wait. The meeting at 10:00 still gets through.
    let b: Bubble | null = null;
    while (!b) b = step();
    expect(b.text).toContain("Meeting in 5 min");
    expect(b.urgent).toBe(true);
    // One trip a day.
    expect(brain.goOnTrip()).toBe(false);
    brain.stop();
  });

  it("comes back at the time on the sign with a souvenir and a postcard, once you're at the PC", async () => {
    const { s, clock, tick, show, diary, brain } = await rig();
    expect(brain.goOnTrip()).toBe(true);
    const trip = s().trip!;
    expect(trip.back).toBe(at(10, 28, 11));
    expect(s().life.trip).toEqual(trip);
    // Away from the PC at 11:00: the pet waits for you.
    clock.t = trip.back;
    show({ idleSeconds: 600 });
    tick(0);
    expect(s().trip).not.toBeNull();
    show({});
    tick();
    expect(s().trip).toBeNull();
    // demoLife has 4 souvenirs; 0.5 picks the 7th of the other 12.
    expect(s().life.souvenirs).toEqual(["hoian", "dalat", "kyoto", "paris", "phuquoc"]);
    expect(s().life.week.trips).toBe(1);
    expect(s().bubble?.text).toContain("Phú Quốc");
    expect(s().celebration).not.toBeNull();
    expect(s().reveal).toMatchObject({ kind: "souvenir", place: "phuquoc", souvenir: "phuquoc" });
    const postcard = diary.mock.calls.find((c) => c[2]?.tag === "postcard");
    expect(postcard?.[0]).toBe("life");
    expect(postcard?.[1]).toContain("Phú Quốc");
    brain.stop();
  });

  it("comes back empty-handed when called back within half an hour", async () => {
    const { s, clock, brain } = await rig();
    brain.goOnTrip();
    clock.t += 10 * MIN;
    brain.callBack();
    expect(s().trip).toBeNull();
    expect(s().life.souvenirs).toHaveLength(4);
    expect(s().life.week.trips).toBe(0);
    expect(s().bubble?.text).toContain("Back already");
    expect(s().reveal).toMatchObject({ kind: "souvenir", souvenir: null });
    brain.callBack();
    brain.stop();
  });
});

describe("Brain and weekly chapters", () => {
  it("starts the week's first greeting with last week's recap, then counts the new week", async () => {
    // Monday 2 November; Friday was a perfect day.
    const { s, step, clock, brain } = await rig({
      start: at(11, 2, 9),
      prefs: { bubbleGap: 0 },
      life: {
        dayKey: "2026-10-30",
        dayCompleted: 3,
        dayPlanned: 3,
        dayTarget: 3,
        dayWorkday: true,
        daySeen: true,
        week: { key: "2026-10-26", done: 11, stickers: 1, trips: 2 },
        weekGreeted: "2026-10-26",
      },
    });
    expect(s().life.lastWeek).toEqual({ key: "2026-10-26", done: 11, stickers: 2, trips: 2 });
    const hello = step()!;
    expect(hello.text).toContain("Good morning");
    expect(hello.text).toContain("New week, fresh start!");
    expect(hello.text).toContain("11 tasks · 2 stickers · 2 trips");
    expect(s().life.weekGreeted).toBe("2026-11-02");
    brain.dismissBubble(hello.id, "closed");
    await brain.complete(s().next!);
    expect(s().life.week).toMatchObject({ key: "2026-11-02", done: 1 });
    // Tuesday's greeting is an ordinary one.
    clock.t = at(11, 3, 9);
    brain.tick();
    await sleep(400);
    expect(s().bubble?.text).toContain("Good morning");
    expect(s().bubble?.text).not.toContain("New week");
    brain.stop();
  });
});
