// v0.5 "Game" in the brain: chests for active work, knitting during focus, trips, and the Monday fresh start.
import { describe, expect, it, vi } from "vitest";
import { createDemoBackend, type DemoBackend } from "../backend/demo";
import type { SystemSample } from "../backend/types";
import { Brain, type Bubble } from "./brain";
import { dayKey } from "./dates";
import { setLang } from "./l10n";
import { demoLife, type LifeState } from "./life";
import * as lines from "./lines";
import { defaultPrefs, type Prefs } from "./prefs";
import { DECOR_IDS } from "./types";
import { everyOption } from "./variety";

const MIN = 60_000;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const at = (month: number, day: number, h: number, m = 0) => new Date(2026, month - 1, day, h, m).getTime();
const YOUTUBE = { app: { name: "Google Chrome", exe: "chrome.exe", title: "Cats - YouTube" }, url: "https://www.youtube.com/watch?v=1" };

/** The trip offer: a check-in, so it has no kind (only counted reminders do); it's known by its "Go!" button. */
const isTripOffer = (b: Bubble) => b.actions.some((a) => a.title === "Go!");

/** Random numbers from `values`, then 0.5. */
const seq = (values: number[]) => () => values.shift() ?? 0.5;

/**
 * The demo, by default on Wednesday 28 October 2026 at 9:00, with `life` (for today unless it says otherwise) and
 * `prefs` saved first.
 */
async function rig(opts: { start?: number; life?: Partial<LifeState>; prefs?: Partial<Prefs>; random?: () => number; setup?: (b: DemoBackend) => void } = {}) {
  const clock = { t: opts.start ?? at(10, 28, 9) };
  const backend = createDemoBackend({ now: () => clock.t, persist: false });
  opts.setup?.(backend);
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
  return { clock, backend, brain, show, tick, step, until, diary, s: () => brain.getSnapshot() };
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

  it("says so once, quietly, when a chest is earned (a reply: not counted)", async () => {
    const { s, tick, brain } = await rig({ life: { chests: 0, chestsToday: 0, chestDay: "2026-10-28", workSec: 1790 } });
    const left = s().nudgesLeft;
    const chime = vi.fn();
    brain.effects.chime = chime;
    tick();
    const b = s().bubble!;
    expect(b.text).toBe("🎁 I found a chest! Finish your next task to open it");
    expect(b).toMatchObject({ reminder: false, urgent: false, actions: [] });
    expect(b.kind).toBeUndefined();
    expect(s().nudgesLeft).toBe(left);
    expect(chime).not.toHaveBeenCalled();
    brain.dismissBubble(b.id, "ignored");
    // Once per chest: holding it says nothing more.
    for (let i = 0; i < 20; i++) tick();
    expect(s().bubble?.text ?? "").not.toContain("found a chest");
    brain.stop();
  });

  it("lets the chest note go stale once the chest is opened", async () => {
    const { s, tick, brain } = await rig({ life: { chests: 0, chestsToday: 0, chestDay: "2026-10-28", workSec: 1790 } });
    tick();
    const note = s().bubble!;
    expect(note.text).toContain("found a chest");
    expect(brain.bubbleStale(note)).toBe(false);
    await brain.complete(s().day.today[0]!);
    expect(s().life.chests).toBe(0);
    expect(brain.bubbleStale(note)).toBe(true);
    brain.stop();
  });

  it("keeps a chest earned during focus for the end-of-session bubble", async () => {
    const { s, tick, clock, brain } = await rig({ life: { chests: 0, chestsToday: 0, chestDay: "2026-10-28", workSec: 1790 } });
    const start = clock.t;
    brain.startFocus(s().next, 25);
    brain.dismissBubble(s().bubble!.id, "closed");
    tick();
    expect(s().life.chests).toBe(1);
    expect(s().bubble).toBeNull();
    clock.t = start + 25 * MIN;
    brain.tick();
    expect(s().bubble?.text).toContain("25 minutes");
    expect(s().bubble?.text).toContain("I found a chest!");
    brain.stop();
  });

  it("puts the chest back when Todoist can't close the task", async () => {
    const { s, brain } = await rig({ life: { chests: 1, xp: 100 } });
    vi.spyOn(brain.backend.todoist, "close").mockRejectedValueOnce(new Error("offline"));
    await brain.complete(s().next!);
    expect(s().life).toMatchObject({ chests: 1, xp: 100 });
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
  it("knits during focus and finishes a decoration when a whole session completes", async () => {
    // Picks the first decoration not owned yet.
    const { s, tick, clock, brain } = await rig({ life: { craft: 0, decor: ["rug"] }, random: () => 0 });
    expect(s().craft).toBeNull();
    const start = clock.t;
    brain.startFocus(s().next, 25);
    expect(s().craft).toBe(0);
    for (let i = 0; i < 10; i++) tick();
    expect(s().life.craft).toBeCloseTo(150 / 1500);
    expect(s().craft).toBeCloseTo(0.1);
    // The heartbeat runs out of phase with the session: the last 7 s are knitted at 0:00.
    tick(8);
    while (clock.t + 15_000 < start + 25 * MIN) tick();
    expect(s().life.craft).toBeLessThan(1);
    clock.t = start + 25 * MIN;
    brain.tick();
    const b = s().bubble!;
    expect(b.text).toContain("25 minutes");
    expect(b.text).toContain("All done! A potted plant");
    expect(s().life).toMatchObject({ craft: 0, decor: ["rug", "plant"] });
    expect(s().craft).toBeNull();
    expect(s().reveal).toMatchObject({ kind: "craft", decor: "plant", xp: 0 });
    brain.stop();
  });

  it("gives a short session only its share, at the running session's own length", async () => {
    const { s, tick, brain } = await rig({ life: { craft: 0.4, decor: ["rug"] }, prefs: { focusMinutes: 25 } });
    // The demo's "Focus 1'" (and "Try 2 minutes"): a twenty-fifth of an item a minute, no decoration at the end.
    brain.startFocus(s().next, 1);
    for (let i = 0; i < 4; i++) tick();
    expect(s().focus).toBeNull();
    expect(s().life.craft).toBeCloseTo(0.44);
    expect(s().life.decor).toEqual(["rug"]);
    expect(s().bubble?.text).not.toContain("All done");
    // A 50-minute session knits at its own pace: half an item in 25 minutes.
    brain.startFocus(s().next, 50);
    for (let i = 0; i < 100; i++) tick();
    expect(s().life.craft).toBeCloseTo(0.94);
    brain.stop();
  });

  it("knits only while you're working on it: not idle, not on a distraction", async () => {
    const { s, tick, show, brain } = await rig({ life: { craft: 0 } });
    brain.startFocus(s().next, 25);
    tick();
    expect(s().life.craft).toBeCloseTo(0.01);
    show({ idleSeconds: 90 });
    tick();
    tick();
    expect(s().life.craft).toBeCloseTo(0.01);
    show(YOUTUBE);
    tick();
    expect(s().life.craft).toBeCloseTo(0.01);
    show({});
    tick();
    expect(s().life.craft).toBeCloseTo(0.02);
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
    brain.stopFocus();
    expect(s().life.craft).toBeCloseTo(0.2);
    expect(s().life.decor).toHaveLength(3);
    brain.stop();
  });

  it("finishes the item the moment it's complete, mid-session, so no dropped stitch can take it back", async () => {
    const { s, tick, show, brain } = await rig({ life: { craft: 0.9 }, random: () => 0 });
    brain.startFocus(s().next, 25);
    brain.dismissBubble(s().bubble!.id, "closed");
    for (let i = 0; i < 9; i++) tick();
    expect(s().life.craft).toBeCloseTo(0.99);
    tick();
    expect(s().life.decor).toHaveLength(4);
    expect(s().life.craft).toBe(0);
    expect(s().bubble?.text).toContain("All done!");
    expect(s().reveal).toMatchObject({ kind: "craft" });
    expect(s().focus).not.toBeNull();
    // Off to YouTube right after: the finished item is safe, the new one has nothing to lose yet.
    brain.dismissBubble(s().bubble!.id, "ignored");
    show(YOUTUBE);
    tick();
    tick();
    expect(s().life.decor).toHaveLength(4);
    expect(s().life.craft).toBe(0);
    brain.stop();
  });

  it("gives at most 90 knitting XP a day once every decoration is owned", async () => {
    const { s, tick, brain } = await rig({ life: { craft: 0, decor: [...DECOR_IDS], xp: 100 } });
    for (let n = 0; n < 4; n++) {
      brain.startFocus(s().next, 25);
      for (let i = 0; i < 100; i++) tick();
      expect(s().focus).toBeNull();
      brain.dismissBubble(s().bubble!.id, "closed");
    }
    // Three items for 30 XP each, the fourth for none (the feed XP from tasks doesn't come into it).
    expect(s().life.xp).toBe(190);
    expect(s().life.craftXpToday).toBe(90);
    brain.stop();
  });

  it("drops a few stitches after 30 s on a distraction during focus, once per visit", async () => {
    const { s, tick, show, brain } = await rig({ life: { craft: 0.5 } });
    brain.startFocus(s().next, 25);
    brain.dismissBubble(s().bubble!.id, "closed");
    show(YOUTUBE);
    tick();
    expect(s().life.craft).toBeCloseTo(0.5);
    tick();
    expect(s().life.craft).toBeCloseTo(0.4);
    expect(s().bubble?.text).toContain("dropped a few stitches");
    expect(s().bubble?.reminder).toBe(false);
    tick();
    tick();
    expect(s().life.craft).toBeCloseTo(0.4);
    // Back to work, then off again: a new visit.
    show({});
    tick();
    expect(s().life.craft).toBeCloseTo(0.41);
    show(YOUTUBE);
    tick();
    tick();
    tick();
    expect(s().life.craft).toBeCloseTo(0.31);
    // The note is about this session: once it's over, a note still waiting (behind the board) is dropped.
    const note = s().bubble!;
    expect(note.text).toContain("dropped a few stitches");
    brain.stopFocus();
    expect(brain.bubbleStale(note)).toBe(true);
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
    expect(s().life.craft).toBeCloseTo(0.5);
    tick();
    expect(s().life.craft).toBeCloseTo(0.4);
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
    const offer = until(isTripOffer);
    expect(offer.text).toMatch(/Back at \d\d:\d\d/);
    expect(offer.reminder).toBe(true);
    expect(offer.kind).toBeUndefined();
    expect(offer.actions.map((a) => a.title)).toEqual(["Go!", "Stay"]);
    expect(s().nudgesLeft).toBe(left);
    brain.pickAction(offer.id, 0);
    expect(s().trip).not.toBeNull();
    expect(s().life.tripDay).toBe("2026-10-28");
    const bye = s().bubble!;
    // Any of its lines: each says when the pet will be back.
    expect(bye.text).toMatch(/\d{2}:\d{2}/);
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
    // One of the early-return lines (no souvenir, no XP: the place doesn't show).
    expect(everyOption((say) => lines.tripBack({ place: "hoian", minutes: 10, souvenir: null, xp: 0 }, say))).toContain(s().bubble?.text);
    expect(s().reveal).toMatchObject({ kind: "souvenir", souvenir: null });
    brain.callBack();
    // A stray click doesn't cost the day's trip.
    expect(s().life.tripDay).toBe("");
    expect(brain.goOnTrip()).toBe(true);
    clock.t += 40 * MIN;
    brain.callBack();
    expect(s().life.tripDay).toBe("2026-10-28");
    expect(brain.goOnTrip()).toBe(false);
    brain.stop();
  });

  it("offers the trip again after an early call-back, but never after Stay, not even after a restart", async () => {
    const { s, until, clock, backend, brain } = await rig({ prefs: { bubbleGap: 0 } });
    for (const id of ["1", "2", "4"]) await brain.complete(s().day.today.find((t) => t.id === id)!);
    await brain.refresh();
    brain.dismissBubble(s().bubble!.id, "ignored");
    brain.pickAction(until(isTripOffer).id, 0);
    clock.t += 5 * MIN;
    brain.callBack();
    brain.dismissBubble(s().bubble!.id, "ignored");
    const again = until(isTripOffer);
    brain.pickAction(again.id, 1);
    expect(s().life.tripDeclined).toBe("2026-10-28");
    brain.stop();
    // A restart: the saved "Stay" holds for the rest of the day.
    const next = await Brain.create(backend, { demo: true, now: () => clock.t, random: () => 0.5 });
    await next.start();
    expect(next.getSnapshot().life.tripDeclined).toBe("2026-10-28");
    for (let i = 0; i < 30; i++) {
      clock.t += MIN;
      next.recompute();
      next.runRules(clock.t);
      const b = next.getSnapshot().bubble;
      expect(b !== null && isTripOffer(b)).toBe(false);
      if (b) next.dismissBubble(b.id, "ignored");
    }
    next.stop();
  });

  it("ends a trip at once when the clock is earlier than its start", async () => {
    const { s, clock, tick, show, brain } = await rig();
    brain.goOnTrip();
    clock.t -= 3 * 60 * MIN;
    show({ idleSeconds: 900 });
    tick(0);
    expect(s().trip).toBeNull();
    expect(s().life.souvenirs).toHaveLength(4);
    brain.stop();
  });
});

describe("Brain and the trip offer as a check-in", () => {
  // Merged with v0.4: one mechanism for the budget. Only counted reminders have a kind; check-ins (the morning
  // greeting, the resume card, the overbooked warning, the trip offer) have none. The trip offer used to carry a
  // "trip" kind that the budget skipped; now it is a plain check-in, so answering it starts the dismissal run over
  // like answering any other check-in (v0.4's rule), and closing it is still a "Stay", never a refusal.
  it("drops a waiting offer when a focus session starts first, and offers it again once the session is over", async () => {
    const { s, until, tick, clock, brain } = await rig({ prefs: { bubbleGap: 0 } });
    for (const id of ["1", "2", "4"]) await brain.complete(s().day.today.find((t) => t.id === id)!);
    await brain.refresh();
    brain.dismissBubble(s().bubble!.id, "ignored");
    const offer = until(isTripOffer);
    brain.startFocus(null, 25);
    expect(s().bubble?.id).not.toBe(offer.id);
    // Unseen, so neither a Stay nor a refusal.
    expect(s().life.tripDeclined).not.toBe("2026-10-28");
    expect(s().life.dismissedInRow).toBe(0);
    clock.t += 25 * MIN;
    tick();
    expect(s().focus).toBeNull();
    brain.dismissBubble(s().bubble!.id, "ignored");
    await brain.refresh(); // let the sync started by the heartbeat land
    const again = until(isTripOffer);
    expect(again.id).not.toBe(offer.id);
    expect(brain.bubbleStale(again)).toBe(false);
    brain.stop();
  });

  it("is never counted, and closing it is a Stay, not a refusal", async () => {
    const { s, until, brain } = await rig({ prefs: { bubbleGap: 0 } });
    for (const id of ["1", "2", "4"]) await brain.complete(s().day.today.find((t) => t.id === id)!);
    await brain.refresh();
    brain.dismissBubble(s().bubble!.id, "ignored");
    const left = s().nudgesLeft;
    const offer = until(isTripOffer);
    expect(offer.kind).toBeUndefined();
    expect(s().nudgesLeft).toBe(left);
    const run = s().life.dismissedInRow;
    const backoff = s().life.dayBackoff;
    brain.dismissBubble(offer.id, "closed");
    expect(s().life).toMatchObject({ tripDeclined: "2026-10-28", dismissedInRow: run, dayBackoff: backoff });
    brain.stop();
  });
});

describe("Brain and Done for today (v0.4)", () => {
  /** "Done for today" in the Wrap up sheet, moving nothing: the pet sleeps until the next workday starts. */
  const doneForToday = async (brain: Brain) => {
    expect(await brain.wrapUp({ moves: {}, frogId: null, note: "" })).toMatchObject({ ok: true });
    expect(brain.getSnapshot().doneUntil).not.toBeNull();
    brain.dismissBubble(brain.getSnapshot().bubble!.id, "ignored");
  };

  it("holds the trip offer while done for today; it comes once you're back at it", async () => {
    const { s, step, until, brain } = await rig({ prefs: { bubbleGap: 0 } });
    for (const id of ["1", "2", "4"]) await brain.complete(s().day.today.find((t) => t.id === id)!);
    await brain.refresh();
    brain.dismissBubble(s().bubble!.id, "ignored");
    await doneForToday(brain);
    for (let i = 0; i < 30; i++) {
      const b = step();
      if (!b) continue;
      // Only urgent bubbles (meetings, timed tasks) get through.
      expect(b.urgent, b.text).toBe(true);
      brain.dismissBubble(b.id, "ignored");
    }
    expect(s().life.tripDay).toBe("");
    brain.resumeDay();
    brain.dismissBubble(s().bubble!.id, "ignored");
    expect(until(isTripOffer).reminder).toBe(true);
    brain.stop();
  });

  it("slips back in quietly from a trip after Done for today, but answers when you call it", async () => {
    const { s, tick, clock, brain } = await rig();
    expect(brain.goOnTrip()).toBe(true);
    brain.dismissBubble(s().bubble!.id, "ignored");
    await doneForToday(brain);
    clock.t += 2 * 60 * MIN;
    tick();
    expect(s().trip).toBeNull();
    expect(s().life.souvenirs).toHaveLength(5);
    expect(s().bubble).toBeNull();

    const called = await rig();
    expect(called.brain.goOnTrip()).toBe(true);
    called.brain.dismissBubble(called.s().bubble!.id, "ignored");
    await doneForToday(called.brain);
    called.clock.t += 45 * MIN;
    called.brain.callBack();
    expect(called.s().bubble?.text).toBeTruthy();
    brain.stop();
    called.brain.stop();
  });

  it("keeps earning chests silently while done for today, and says so on waking", async () => {
    const { s, tick, brain } = await rig({ life: { chests: 0, chestsToday: 0, chestDay: "2026-10-28", workSec: 1790 } });
    await doneForToday(brain);
    tick();
    expect(s().life.chests).toBe(1);
    expect(s().chests.held).toBe(1);
    for (let i = 0; i < 10; i++) {
      tick();
      expect(s().bubble).toBeNull();
    }
    brain.resumeDay();
    brain.dismissBubble(s().bubble!.id, "ignored");
    tick();
    expect(s().bubble?.text).toBe("🎁 I found a chest! Finish your next task to open it");
    brain.stop();
  });
});

describe("Brain and stale bubbles", () => {
  it("gives back only the one reminder a stale bubble counted, and notes it once", async () => {
    const { s, until, brain, diary } = await rig({ prefs: { bubbleGap: 0, remindEvery: 10 } });
    const nudge = until((b) => b.kind === "nudge", 120);
    expect(nudge.stillValid).toBeDefined();
    const used = s().life.dayNudges;
    expect(used).toBeGreaterThan(1);
    diary.mockClear();
    // The task it is about is done: the waiting nudge is out of date.
    await brain.complete(s().day.today.concat(s().day.overdue).find((t) => nudge.text.includes(t.content))!);
    expect(s().life.dayNudges).toBe(used - 1);
    expect(diary.mock.calls.filter((c) => c[2]?.tag === "stale")).toHaveLength(1);
    brain.stop();
  });

  it("drops a waiting trip offer once a new task for today comes in", async () => {
    const { s, until, brain, backend } = await rig({ prefs: { bubbleGap: 0 } });
    for (const id of ["1", "2", "4"]) await brain.complete(s().day.today.find((t) => t.id === id)!);
    await brain.refresh();
    brain.dismissBubble(s().bubble!.id, "ignored");
    const offer = until(isTripOffer);
    // Added on the phone: it arrives with the next sync.
    await backend.todoist.add({ content: "One more thing", dueString: "today", priority: 1, parentId: null });
    await brain.refresh();
    expect(s().day.today).toHaveLength(1);
    expect(brain.bubbleStale(offer)).toBe(true);
    expect(s().bubble?.id).not.toBe(offer.id);
    brain.stop();
  });

  it("notes a trip offer that went stale once", async () => {
    const { s, until, brain, diary } = await rig({ prefs: { bubbleGap: 0 } });
    for (const id of ["1", "2", "4"]) await brain.complete(s().day.today.find((t) => t.id === id)!);
    await brain.refresh();
    brain.dismissBubble(s().bubble!.id, "ignored");
    until(isTripOffer);
    diary.mockClear();
    brain.startFocus(null, 25);
    expect(diary.mock.calls.filter((c) => c[2]?.tag === "stale")).toHaveLength(1);
    brain.stop();
  });
});

describe("Brain and weekly chapters", () => {
  it("starts the week's first greeting with last week's recap, then counts the new week", async () => {
    // Monday 2 November; Friday was a perfect day. (v0.4 settles a day with Todoist's own count for it, so Todoist
    // reports Friday's three tasks too.)
    const { s, step, clock, brain } = await rig({
      start: at(11, 2, 9),
      prefs: { bubbleGap: 0 },
      setup: (b) => {
        const completed = b.todoist.completed.bind(b.todoist);
        const friday = [0, 1, 2].map((i) => ({ id: `f${i}`, content: `Friday ${i}`, checked: true, completed_at: new Date(at(10, 30, 15, i)).toISOString() }));
        b.todoist.completed = async (since, until) => [
          ...(await completed(since, until)),
          ...friday.filter((x) => Date.parse(x.completed_at) >= Date.parse(since) && Date.parse(x.completed_at) < Date.parse(until)),
        ];
      },
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
    expect(hello.text).toMatch(/week/i);
    expect(hello.text).toContain("11 tasks · 2 stickers · 2 trips");
    expect(s().life.weekGreeted).toBe("2026-11-02");
    brain.dismissBubble(hello.id, "closed");
    await brain.complete(s().next!);
    expect(s().life.week).toMatchObject({ key: "2026-11-02", done: 1 });
    // Tuesday's greeting is an ordinary one. (v0.4: it waits for the new day's first sync, then comes on the next
    // heartbeat.)
    clock.t = at(11, 3, 9);
    brain.tick();
    await sleep(400);
    await vi.waitFor(() => expect(s()).toMatchObject({ loading: false, life: { dayKey: "2026-11-03" } }));
    brain.tick();
    expect(s().bubble?.text).toContain("Good morning");
    expect(s().bubble?.text).not.toContain("New week");
    brain.stop();
  });
});
