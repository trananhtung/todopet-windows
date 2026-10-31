import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createDemoBackend, type DemoBackend } from "../backend/demo";
import { BackendError, type RawTask, type SystemSample } from "../backend/types";
import { Brain, type BrainEffects, type Bubble } from "./brain";
import { L, setLang } from "./l10n";
import { demoLife, type LifeState } from "./life";
import * as lines from "./lines";
import { defaultPrefs, type Prefs } from "./prefs";

const MIN = 60_000;
const at = (day: number, h: number, m = 0) => new Date(2026, 9, day, h, m).getTime();
const YOUTUBE = { app: { name: "Google Chrome", exe: "chrome.exe", title: "Cats - YouTube" }, url: "https://www.youtube.com/watch?v=1" };

describe("Brain with the demo backend", () => {
  let t: number;
  let backend: DemoBackend;
  let brain: Brain;
  const sample = (patch: Partial<SystemSample> = {}): SystemSample => ({
    app: { name: "Visual Studio Code", exe: "code.exe", title: "work" },
    url: null,
    idleSeconds: 0,
    secondsSinceKey: 999,
    fullscreen: false,
    appSwitchedAt: t - 60 * MIN,
    ...patch,
  });

  beforeEach(async () => {
    // A Wednesday, 9:00: inside work hours (8–18), before the 10:00 planning deadline.
    t = new Date(2026, 9, 28, 9, 0).getTime();
    backend = createDemoBackend({ now: () => t, persist: false });
    brain = await Brain.create(backend, { demo: true, now: () => t, random: () => 0.5 });
    setLang("en");
    await brain.start();
    brain.dismissBubble(brain.getSnapshot().bubble?.id ?? -1, "closed");
    brain.onSample(sample());
  });

  afterEach(() => brain.stop());

  it("loads today's tasks and the demo calendar", () => {
    const s = brain.getSnapshot();
    expect(s.hasToken).toBe(true);
    expect(s.day.today).toHaveLength(3);
    expect(s.day.completed.map((t) => t.id)).toEqual(["5"]);
    expect(s.day.overdue).toHaveLength(1);
    expect(s.next?.id).toBe("1");
    expect(s.events.map((e) => e.title)).toEqual(["Team sync", "Client meeting"]);
    expect(s.stuck.map((x) => x.task.id)).toEqual(["3"]);
  });

  it("notes a locked screen, a display that is off and the battery saver, and only when they change", () => {
    expect(brain.getSnapshot()).toMatchObject({ screenOff: false, batterySaver: false });
    brain.onSample(sample({ locked: true }));
    expect(brain.getSnapshot().screenOff).toBe(true);
    brain.onSample(sample({ displayOff: true }));
    expect(brain.getSnapshot().screenOff).toBe(true);
    brain.onSample(sample({ batterySaver: true }));
    expect(brain.getSnapshot()).toMatchObject({ screenOff: false, batterySaver: true });
    // The frame loop wakes on every change: the same news a second later is no change.
    const before = brain.getSnapshot();
    brain.onSample(sample({ batterySaver: true }));
    expect(brain.getSnapshot()).toBe(before);
  });

  it("calls a stunt off when the pet goes out of sight, as hiding it does: it never resumes, stale, later", () => {
    // The frame loop sleeps while nobody can see the pet, so a parade would never reach its end.
    brain.demoAntic("parade");
    expect(brain.getSnapshot().antic).not.toBeNull();
    brain.onSample(sample({ fullscreen: true }));
    expect(brain.getSnapshot().antic).toBeNull();
    brain.onSample(sample());
    brain.demoAntic("grumble");
    brain.onSample(sample({ locked: true }));
    expect(brain.getSnapshot().antic).toBeNull();
    brain.onSample(sample());
    brain.demoAntic("parade");
    brain.onSample(sample({ displayOff: true }));
    expect(brain.getSnapshot().antic).toBeNull();
  });

  it("takes the stunt's bubble with it, and keeps any other urgent bubble", () => {
    brain.demoAntic("parade");
    expect(brain.getSnapshot().bubble).not.toBeNull();
    // Urgent, so it would otherwise stay over the full-screen app for 25 s.
    brain.onSample(sample({ fullscreen: true }));
    expect(brain.getSnapshot()).toMatchObject({ antic: null, bubble: null });
    brain.onSample(sample());
    brain.say({ text: "Team sync in 2 minutes", seconds: 40, urgent: true });
    const meeting = brain.getSnapshot().bubble;
    brain.onSample(sample({ fullscreen: true }));
    expect(brain.getSnapshot().bubble).toBe(meeting);
  });

  it("lets the demo pretend the screen is off or battery saver is on, at once", () => {
    backend.demo.setPower({ batterySaver: true });
    expect(brain.getSnapshot()).toMatchObject({ screenOff: false, batterySaver: true });
    backend.demo.setPower({ displayOff: true });
    expect(brain.getSnapshot()).toMatchObject({ screenOff: true, batterySaver: true });
    backend.demo.setPower({ displayOff: false, batterySaver: false });
    expect(brain.getSnapshot()).toMatchObject({ screenOff: false, batterySaver: false });
  });

  it("greets in the morning with today's plan", () => {
    // The demo hello just spoke: the next unsolicited bubble waits for the 15-minute gap.
    brain.runRules(t);
    expect(brain.getSnapshot().bubble).toBeNull();
    t += 16 * MIN;
    brain.runRules(t);
    const b = brain.getSnapshot().bubble;
    expect(b?.text).toContain("Good morning");
    // The demo day is planned (3 today + 1 done), so it points at the frog, then sums up the calendar.
    expect(b?.text).toContain("Eat the frog first");
    expect(b?.text).toContain("2 meetings today");
    expect(b?.actions[0].title).toBe("▶ Focus 25'");
    expect(b?.reminder).toBe(true);
  });

  it("feeds and celebrates when a task is completed, and can undo", async () => {
    const task = brain.getSnapshot().next!;
    await brain.complete(task);
    const s = brain.getSnapshot();
    expect(s.celebration).not.toBeNull();
    expect(s.mood).toBe("celebrating");
    expect(s.life.totalDone).toBe(32);
    expect(s.bubble?.actions.map((a) => a.title)).toEqual(["Undo"]);
    expect(s.day.completed.map((x) => x.id)).toEqual(["1", "5"]);
    await brain.undoComplete(task);
    expect(brain.getSnapshot().life.totalDone).toBe(31);
    expect(brain.getSnapshot().day.completed.map((x) => x.id)).toEqual(["5"]);
  });

  it("calls out a distracting site after two minutes", () => {
    t += 16 * MIN;
    brain.runRules(t); // morning greeting
    brain.dismissBubble(brain.getSnapshot().bubble!.id, "closed");
    const yt = { app: { name: "Google Chrome", exe: "chrome.exe", title: "Cats - YouTube" }, url: "https://www.youtube.com/watch?v=1", appSwitchedAt: t };
    brain.onSample(sample(yt));
    t += 3 * MIN;
    brain.onSample(sample(yt));
    brain.recompute();
    brain.runRules(t);
    const s = brain.getSnapshot();
    expect(s.bubble?.text.toLowerCase()).toContain("youtube.com");
    expect(s.reasons.some((r) => r.text.includes("distracted by youtube.com"))).toBe(true);
  });

  it("holds reminders while you type, then speaks at a pause", () => {
    t = new Date(2026, 9, 28, 11, 0).getTime();
    brain.runRules(t); // morning greeting
    brain.dismissBubble(brain.getSnapshot().bubble!.id, "closed");
    t += 60 * MIN;
    brain.onSample(sample({ secondsSinceKey: 1 }));
    brain.runRules(t);
    expect(brain.getSnapshot().bubble).toBeNull();
    brain.onSample(sample({ secondsSinceKey: 30 }));
    brain.recompute();
    brain.runRules(t);
    expect(brain.getSnapshot().bubble).not.toBeNull();
  });

  it("stays quiet while muted and during focus, then asks if the task is done", () => {
    brain.quiet(60);
    brain.runRules(t);
    expect(brain.getSnapshot().bubble).toBeNull();
    brain.quiet(null);
    const task = brain.getSnapshot().next!;
    brain.startFocus(task, 25);
    expect(brain.getSnapshot().mood).toBe("focus");
    brain.dismissBubble(brain.getSnapshot().bubble!.id, "closed");
    t += 26 * MIN;
    brain.tick();
    const b = brain.getSnapshot().bubble;
    expect(b?.text).toContain("25 minutes up");
    expect(b?.actions[0].title).toBe("✓ Done");
    expect(brain.getSnapshot().focus).toBeNull();
  });

  it("goes quiet in meetings and reminds before them", () => {
    const meeting = brain.getSnapshot().events[0];
    t = meeting.start.getTime() - 4 * MIN;
    brain.recompute();
    brain.runRules(t);
    const b = brain.getSnapshot().bubble;
    expect(b?.text).toContain("Meeting in 4 min");
    expect(b?.actions[0].title).toBe("Join ↗");
    brain.dismissBubble(b!.id, "closed");
    t = meeting.start.getTime() + 10 * MIN;
    brain.recompute();
    brain.runRules(t);
    expect(brain.getSnapshot().bubble).toBeNull();
    expect(brain.getSnapshot().calmMotion).toBe(true);
  });

  it("follows tray commands", () => {
    backend.demo.command("hide1h");
    expect(brain.getSnapshot().hiddenUntil).toBe(t + 60 * MIN);
    backend.demo.command("show");
    expect(brain.getSnapshot().hiddenUntil).toBeNull();
    backend.demo.command("quiet1h");
    expect(brain.getSnapshot().quietUntil).toBe(t + 60 * MIN);
  });

  it("splits a postponed task into sub-steps", async () => {
    const stuck = brain.getSnapshot().stuck[0].task;
    const steps = await brain.suggestSteps(stuck);
    expect(steps.length).toBeGreaterThanOrEqual(3);
    expect(await brain.split(stuck, steps, true)).toBe(true);
    expect(brain.getSnapshot().bubble?.text).toContain(`Split into ${steps.length} steps`);
    const step = brain.getSnapshot().day.today.find((x) => x.parentId === "3");
    expect(step?.content).toBe(steps[0]);
  });
});

describe("Brain and forgiving streaks", () => {
  const work = (t: number): SystemSample => ({
    app: { name: "Visual Studio Code", exe: "code.exe", title: "work" },
    url: null,
    idleSeconds: 0,
    secondsSinceKey: 999,
    fullscreen: false,
    appSwitchedAt: t - 60 * MIN,
  });

  /**
   * Boots the demo on Wednesday 28 October, 9:00, with yesterday saved as `yesterday` left it. `setup` can change
   * the backend first (Todoist's answer about yesterday, a failing close…).
   */
  async function boot(yesterday: Partial<LifeState>, setup?: (b: DemoBackend) => void, opts: { demo?: boolean; at?: number } = {}) {
    const clock = { t: opts.at ?? new Date(2026, 9, 28, 9, 0).getTime() };
    const backend = createDemoBackend({ now: () => clock.t, persist: false });
    setup?.(backend);
    await backend.storage.save("life", { ...demoLife(), dayKey: "2026-10-27", dayCompleted: 0, dayPlanned: 3, dayTarget: 3, dayWorkday: true, daySeen: true, ...yesterday });
    const brain = await Brain.create(backend, { demo: opts.demo ?? true, now: () => clock.t, random: () => 0.5 });
    setLang("en");
    await brain.start();
    brain.dismissBubble(brain.getSnapshot().bubble?.id ?? -1, "closed");
    brain.onSample(work(clock.t));
    return { brain, clock, backend };
  }

  /** More finished tasks in Todoist (done on the phone, say), each reported for the time range it falls in. */
  const alsoDone = (...when: number[]) => (b: DemoBackend) => {
    const completed = b.todoist.completed.bind(b.todoist);
    const extra = when.map((t, i) => ({ id: `p${i}`, content: `On the phone ${i}`, checked: true, completed_at: new Date(t).toISOString() }));
    b.todoist.completed = async (since, until) => [
      ...(await completed(since, until)),
      ...extra.filter((x) => Date.parse(x.completed_at) >= Date.parse(since) && Date.parse(x.completed_at) < Date.parse(until)),
    ];
  };
  /** As if `count` tasks were done on the 27th in the evening. */
  const doneOn27 = (count: number) => alsoDone(...Array.from({ length: count }, (_, i) => at(27, 20, i)));
  /** Past the gap after the demo's hello: the tasks sync again, and then the greeting (with the kind words in it) can come. */
  const laterThanHello = async (brain: Brain, clock: { t: number }) => {
    clock.t += 16 * MIN;
    brain.onSample(work(clock.t));
    brain.tick();
    await vi.waitFor(() => expect(brain.getSnapshot().loading).toBe(false));
    brain.tick();
  };

  it("explains a frozen day kindly the next morning, in the greeting, as one bubble", async () => {
    const { brain, clock } = await boot({ streak: 5, snacks: 1 });
    try {
      expect(brain.getSnapshot().life.snacks).toBe(0);
      expect(brain.getSnapshot().life.streak).toBe(5);
      // The demo hello just spoke: the greeting (and with it the kind word) waits for the gap between bubbles.
      brain.tick();
      expect(brain.getSnapshot().bubble).toBeNull();
      await laterThanHello(brain, clock);
      const b = brain.getSnapshot().bubble;
      expect(b?.text).toContain("Good morning");
      expect(b?.text).toContain("🍪");
      expect(b?.text).toContain("5");
      expect(b?.text.indexOf("Good morning")).toBeLessThan(b?.text.indexOf("🍪") ?? -1);
      // A check-in like the greeting it rides in: never counted against the day's reminders.
      expect(b?.kind).toBeUndefined();
      // Once only.
      brain.dismissBubble(b!.id, "closed");
      clock.t += 16 * MIN;
      brain.tick();
      expect(brain.getSnapshot().bubble?.text ?? "").not.toContain("🍪");
    } finally {
      brain.stop();
    }
  });

  it("offers a repair after a broken streak and brings it back with the second task today", async () => {
    const { brain, clock } = await boot({ streak: 6, snacks: 0 });
    try {
      let s = brain.getSnapshot().life;
      expect(s.streak).toBe(0);
      expect(s.repair?.streak).toBe(6);
      await laterThanHello(brain, clock);
      expect(brain.getSnapshot().bubble?.text).toContain("2 tasks");
      brain.dismissBubble(brain.getSnapshot().bubble!.id, "closed");
      // The demo already has one task done today; one more finishes the quest.
      await brain.complete(brain.getSnapshot().next!);
      s = brain.getSnapshot().life;
      expect(s.streak).toBe(6);
      // Final when the day closes.
      expect(s.repair?.restored).toEqual({ from: 0 });
      expect(brain.getSnapshot().bubble?.text).toContain("streak is back");
    } finally {
      brain.stop();
    }
  });

  it("takes a restored streak back when Todoist refuses the close", async () => {
    const { brain } = await boot({ streak: 6, snacks: 0 }, (b) => {
      b.todoist.close = async () => {
        throw new BackendError({ kind: "network", message: "offline" });
      };
    });
    try {
      await brain.complete(brain.getSnapshot().next!);
      const s = brain.getSnapshot().life;
      expect(brain.getSnapshot().day.completed).toHaveLength(1);
      expect(s.streak).toBe(0);
      expect(s.repair).toEqual({ streak: 6, until: "2026-11-10" });
    } finally {
      brain.stop();
    }
  });

  it("takes a restored streak back on Undo, and cheers for it once a day", async () => {
    const { brain } = await boot({ streak: 6, snacks: 0 });
    try {
      const task = brain.getSnapshot().next!;
      await brain.complete(task);
      expect(brain.getSnapshot().life.streak).toBe(6);
      expect(brain.getSnapshot().bubble?.text).toContain("streak is back");
      await brain.undoComplete(task);
      expect(brain.getSnapshot().life.streak).toBe(0);
      expect(brain.getSnapshot().life.repair).toEqual({ streak: 6, until: "2026-11-10" });
      await brain.complete(brain.getSnapshot().next!);
      expect(brain.getSnapshot().life.streak).toBe(6);
      expect(brain.getSnapshot().bubble?.text).not.toContain("streak is back");
    } finally {
      brain.stop();
    }
  });

  it("settles yesterday with what Todoist reports for it, then doesn't promise a repair that ran out", async () => {
    // Away since Monday 5 October: more than 14 days, so the 5-day streak can't come back any more.
    const { brain } = await boot({ dayKey: "2026-10-05", streak: 5, snacks: 0 });
    try {
      expect(brain.getSnapshot().life).toMatchObject({ streak: 0, repair: null, dirt: 1 });
      brain.tick();
      expect(brain.getSnapshot().bubble?.text ?? "").not.toContain("bring it back");
    } finally {
      brain.stop();
    }
  });

  it("tells about a growth stage reached overnight with the same words as after a task", async () => {
    // Yesterday was perfect (3 of 3): the sticker's 30 XP takes 290 to 320, a Teen.
    const { brain, clock } = await boot({ xp: 290, streak: 2 }, doneOn27(3));
    try {
      expect(brain.getSnapshot().life.xp).toBe(320);
      await laterThanHello(brain, clock);
      expect(brain.getSnapshot().bubble?.text).toContain("I grew up: Teen");
    } finally {
      brain.stop();
    }
  });

  it("a growth note waiting to be told keeps the line it picked", async () => {
    // Guards nothing while `levelUp` has one line (a one-line pack is never stored); it bites once the pack grows.
    const { brain, clock } = await boot({ xp: 290, streak: 2 }, doneOn27(3));
    try {
      const picked = structuredClone(brain.getSnapshot().life.said.levelUp);
      for (let i = 0; i < 4; i++) {
        clock.t += 15_000;
        brain.tick();
      }
      await laterThanHello(brain, clock);
      expect(brain.getSnapshot().life.said.levelUp).toEqual(picked);
    } finally {
      brain.stop();
    }
  });

  it("keeps the morning-after note for its own day, and not before an hour ahead of work", async () => {
    const nothingDone = (b: DemoBackend) => {
      b.todoist.completed = async () => [];
    };
    // Not the demo (which works around the clock): the PC wakes at 00:30 on Wednesday.
    const { brain, clock } = await boot({ streak: 5, snacks: 1 }, nothingDone, { demo: false, at: at(28, 0, 30) });
    try {
      expect(brain.getSnapshot().life.snacks).toBe(0);
      brain.tick();
      expect(brain.getSnapshot().bubble).toBeNull();
      clock.t = at(28, 6, 59);
      brain.tick();
      expect(brain.getSnapshot().bubble).toBeNull();
      clock.t = at(28, 7);
      brain.tick();
      expect(brain.getSnapshot().bubble?.text).toContain("🍪");
    } finally {
      brain.stop();
    }
  });

  it("drops kind words that weren't told on their own day", async () => {
    // A task finished on the phone before the PC woke up: with the demo's one, the quest is done at startup.
    const { brain, clock } = await boot({ streak: 4, snacks: 0 }, alsoDone(at(28, 8, 30)));
    try {
      expect(brain.getSnapshot().life.streak).toBe(4);
      const said = vi.spyOn(brain, "say");
      // Away all day, so nothing gets said; Thursday morning, Wednesday's words are stale.
      brain.onSample({ ...work(clock.t), idleSeconds: 600 });
      brain.tick();
      expect(brain.getSnapshot().bubble).toBeNull();
      clock.t = at(29, 9);
      brain.onSample(work(clock.t));
      brain.tick();
      await vi.waitFor(() => expect(brain.getSnapshot().life.dayKey).toBe("2026-10-29"));
      brain.tick();
      const texts = said.mock.calls.map((c) => c[0].text).join("\n");
      expect(texts).not.toContain("streak is back");
      expect(texts).not.toContain("slipped");
      expect(brain.getSnapshot().life.streak).toBe(5);
    } finally {
      brain.stop();
    }
  });

  it("marks a day off from the board and takes it back", async () => {
    const { brain } = await boot({ dayCompleted: 1 });
    try {
      await brain.takeDayOff(true);
      expect(brain.getSnapshot().prefs.restDays).toEqual(["2026-10-28"]);
      expect(brain.getSnapshot().life.dayWorkday).toBe(false);
      await brain.takeDayOff(false);
      expect(brain.getSnapshot().prefs.restDays).toEqual([]);
      expect(brain.getSnapshot().life.dayWorkday).toBe(true);
    } finally {
      brain.stop();
    }
  });
});

/**
 * The demo on Wednesday 28 October, 9:00, with `life` (today's) and `prefs` saved first. `step` moves the clock on
 * and runs the rules like the heartbeat does (without the hunger clock, so the pet doesn't get hungry).
 */
async function rig(opts: { life?: Partial<LifeState>; prefs?: Partial<Prefs>; setup?: (b: DemoBackend) => void; effects?: BrainEffects } = {}) {
  const clock = { t: at(28, 9) };
  const backend = createDemoBackend({ now: () => clock.t, persist: false });
  opts.setup?.(backend);
  if (opts.life) await backend.storage.save("life", { ...demoLife(), dayKey: "2026-10-28", ...opts.life });
  if (opts.prefs) await backend.storage.save("prefs", { ...defaultPrefs(clock.t), ...opts.prefs });
  const sample = (patch: Partial<SystemSample> = {}): SystemSample => ({
    app: { name: "Visual Studio Code", exe: "code.exe", title: "work" },
    url: null,
    idleSeconds: 0,
    secondsSinceKey: 999,
    fullscreen: false,
    appSwitchedAt: clock.t - 60 * MIN,
    ...patch,
  });
  const boot = async () => {
    const b = await Brain.create(backend, { demo: true, now: () => clock.t, random: () => 0.5, effects: opts.effects ?? {} });
    setLang("en");
    await b.start();
    // The demo hello is a reply (urgent, no reason): closing it changes nothing.
    b.dismissBubble(b.getSnapshot().bubble?.id ?? -1, "closed");
    b.onSample(sample());
    return b;
  };
  const brain = await boot();
  const step = (minutes = 1): Bubble | null => {
    clock.t += minutes * MIN;
    brain.recompute();
    brain.runRules(clock.t);
    return brain.getSnapshot().bubble;
  };
  /** Taps the last button (usually "Later" or "Show"), or lets a bubble without buttons fade. */
  const answer = (b: Bubble) => (b.actions.length > 0 ? brain.pickAction(b.id, b.actions.length - 1) : brain.dismissBubble(b.id, "ignored"));
  /** Steps a minute at a time, answering other bubbles, until one matches. */
  const until = (match: (b: Bubble) => boolean, max = 60): Bubble => {
    for (let i = 0; i < max; i++) {
      const b = step();
      if (!b) continue;
      if (match(b)) return b;
      answer(b);
    }
    throw new Error("no matching bubble");
  };
  const watchYouTube = (patch: Partial<SystemSample> = {}) => brain.onSample(sample({ ...YOUTUBE, appSwitchedAt: clock.t, ...patch }));
  // Samples come every second, and a distraction ends after two in a row away from it.
  const backToWork = () => {
    brain.onSample(sample({ appSwitchedAt: clock.t }));
    brain.onSample(sample({ appSwitchedAt: clock.t }));
  };
  const diary = vi.spyOn(brain.diary, "add");
  const diaryTexts = (kind?: string) => diary.mock.calls.filter((c) => kind === undefined || c[0] === kind).map((c) => c[1]);
  return { clock, backend, brain, boot, step, answer, until, watchYouTube, backToWork, diaryTexts, sample };
}

/** Like `rig`'s `step`, for a brain booted again after a restart. */
const stepWith = (b: Brain, clock: { t: number }) => (minutes = 1): Bubble | null => {
  clock.t += minutes * MIN;
  b.recompute();
  b.runRules(clock.t);
  return b.getSnapshot().bubble;
};

describe("Brain reminder gates, as reviewed", () => {
  it("doesn't replay today's gates or spend the budget again after a restart", async () => {
    const r = await rig({ prefs: { bubbleGap: 0 } });
    let again: Brain | null = null;
    try {
      r.answer(r.step()!); // morning greeting
      const stuck = r.step();
      expect(stuck?.kind).toBe("stuck");
      r.answer(stuck!);
      const left = r.brain.getSnapshot().nudgesLeft;
      r.brain.stop();
      again = await r.boot();
      const step = stepWith(again, r.clock);
      const seen: Bubble[] = [];
      for (let i = 0; i < 5; i++) {
        const b = step();
        if (!b) continue;
        seen.push(b);
        if (b.actions.length > 0) again.pickAction(b.id, b.actions.length - 1);
        else again.dismissBubble(b.id, "ignored");
      }
      expect(seen.map((b) => b.text).join("\n")).not.toContain("Good morning");
      expect(seen.map((b) => b.kind)).not.toContain("stuck");
      expect(again.getSnapshot().nudgesLeft).toBe(left - seen.filter((b) => b.kind !== undefined).length);
    } finally {
      r.brain.stop();
      again?.stop();
    }
  });

  it("keeps the hold and the back-off across a restart, and clears the hold once it's over", async () => {
    const r = await rig({ prefs: { bubbleGap: 0 } });
    let again: Brain | null = null;
    try {
      r.clock.t = at(28, 11, 30);
      r.answer(r.step(0)!); // morning greeting
      for (let closed = 0; closed < 3; ) {
        const b = r.step();
        if (!b) continue;
        r.brain.dismissBubble(b.id, "closed");
        closed++;
      }
      const hold = r.brain.getSnapshot().nudgeHoldUntil!;
      expect(hold).toBe(r.clock.t + 60 * MIN);
      const backoff = r.brain.getSnapshot().life.dayBackoff;
      expect(Object.values(backoff)).toContain(2);
      r.brain.stop();
      again = await r.boot();
      expect(again.getSnapshot().nudgeHoldUntil).toBe(hold);
      expect(again.getSnapshot().life.dayBackoff).toEqual(backoff);
      const step = stepWith(again, r.clock);
      while (r.clock.t + MIN < hold) {
        const b = step();
        expect(b?.kind, b?.text).toBeUndefined();
        if (b) again.dismissBubble(b.id, "ignored");
      }
      r.clock.t = hold;
      again.tick();
      expect(again.getSnapshot().nudgeHoldUntil).toBeNull();
      expect(again.getSnapshot().life.nudgeHoldUntil).toBeNull();
    } finally {
      r.brain.stop();
      again?.stop();
    }
  });

  it("drops the back-off and the dismissals in a row at midnight, while a hold runs out at its own time", async () => {
    const r = await rig({ life: { dayBackoff: { distract: 4 }, dismissedInRow: 2, nudgeHoldUntil: at(29, 0, 30) } });
    try {
      expect(r.brain.getSnapshot().nudgeHoldUntil).toBe(at(29, 0, 30));
      r.clock.t = at(29, 0, 5);
      r.brain.tick();
      await vi.waitFor(() => expect(r.brain.getSnapshot().life.dayKey).toBe("2026-10-29"));
      expect(r.brain.getSnapshot().life).toMatchObject({ dayBackoff: {}, dismissedInRow: 0, nudgeHoldUntil: at(29, 0, 30) });
      r.clock.t = at(29, 0, 31);
      r.brain.tick();
      expect(r.brain.getSnapshot().nudgeHoldUntil).toBeNull();
    } finally {
      r.brain.stop();
    }
  });

  it("keeps quiet while the pet is hidden, even to welcome you back, and an unseen bubble expires without counting", async () => {
    const r = await rig({ prefs: { bubbleGap: 0 } });
    try {
      r.clock.t = at(28, 11);
      r.answer(r.step(0)!); // morning greeting
      r.brain.hide(240);
      const left = r.brain.getSnapshot().nudgesLeft;
      // Away for 20 minutes, then back while the pet is still hidden.
      r.brain.onSample(r.sample({ idleSeconds: 600 }));
      r.clock.t += MIN;
      r.brain.tick();
      r.clock.t += 20 * MIN;
      r.brain.onSample(r.sample({ idleSeconds: 1260 }));
      r.brain.tick();
      r.brain.onSample(r.sample());
      r.clock.t += MIN;
      r.brain.tick();
      expect(r.brain.getSnapshot().bubble).toBeNull();
      expect(r.brain.getSnapshot().nudgesLeft).toBe(left);
      expect(r.diaryTexts("system").some((t) => t.includes("You came back after"))).toBe(true);
      await vi.waitFor(() => expect(r.brain.getSnapshot().loading).toBe(false));
      // A reminder, then a full-screen app comes up before it can show: it expires, with no back-off and no step
      // toward the hold.
      r.brain.hide(null);
      const b = r.until((x) => x.kind !== undefined);
      r.brain.onSample(r.sample({ fullscreen: true }));
      r.clock.t += (b.seconds + 61) * 1000;
      r.brain.tick();
      expect(r.brain.getSnapshot().bubble).toBeNull();
      expect(r.brain.getSnapshot().life.dayBackoff).toEqual({});
      expect(r.brain.getSnapshot().life.dismissedInRow).toBe(0);
    } finally {
      r.brain.stop();
    }
  });

  it("waits for a fresh sync before counted reminders and check-ins: on a new day, and after sleeping", async () => {
    const r = await rig({ prefs: { bubbleGap: 0 } });
    try {
      r.answer(r.step()!); // Wednesday's greeting
      // Thursday 10:30, after a night asleep: the first tick still has Wednesday's tasks.
      r.clock.t = at(29, 10, 30);
      r.brain.tick();
      expect(r.brain.getSnapshot().bubble).toBeNull();
      await vi.waitFor(() => expect(r.brain.getSnapshot()).toMatchObject({ loading: false, life: { dayKey: "2026-10-29" } }));
      r.brain.tick();
      expect(r.brain.getSnapshot().bubble?.text).toContain("Good morning");
      r.answer(r.brain.getSnapshot().bubble!);
      // Asleep from 10:31 to 15:00: the sync that the first tick starts comes before any reminder.
      r.clock.t = at(29, 15);
      r.brain.tick();
      expect(r.brain.getSnapshot().loading).toBe(true);
      expect(r.brain.getSnapshot().bubble).toBeNull();
      await vi.waitFor(() => expect(r.brain.getSnapshot().loading).toBe(false));
    } finally {
      r.brain.stop();
    }
  });

  it("backs off only the reminders that repeat; a once-a-day one still counts toward the hold", async () => {
    const r = await rig({ prefs: { bubbleGap: 0 } });
    try {
      const b = r.until((x) => x.kind === "timeblock");
      r.brain.dismissBubble(b.id, "closed");
      expect(r.brain.getSnapshot().life.dayBackoff).toEqual({});
      expect(r.brain.getSnapshot().life.dismissedInRow).toBe(1);
      expect(r.diaryTexts("response").at(-1)).not.toContain("back off");
    } finally {
      r.brain.stop();
    }
  });

  it("treats Later, Spare me and a quick break as neutral; only a real answer to a reminder starts over", async () => {
    // One reminder already closed today, and a few kinds backed off.
    const backoff = { stuck: 2, overdue: 2, plan: 2, hungry: 2, nudge: 2 };
    const r = await rig({ prefs: { bubbleGap: 0, antics: false }, life: { dismissedInRow: 1, dayBackoff: backoff } });
    const life = () => r.brain.getSnapshot().life;
    const changesNothing = (b: Bubble, title: string) => {
      r.brain.pickAction(b.id, b.actions.findIndex((a) => a.title === title));
      expect(life().dismissedInRow, title).toBe(1);
      expect(life().dayBackoff, title).toEqual(backoff);
    };
    try {
      r.clock.t = at(28, 11, 30);
      changesNothing(r.step(0)!, "Later"); // on the morning greeting
      r.watchYouTube();
      const called = r.step(2)!;
      expect(called.kind).toBe("distract");
      changesNothing(called, "Just a quick break (10')");
      r.backToWork();
      r.brain.demoAntic("parade");
      changesNothing(r.brain.getSnapshot().bubble!, "Spare me 15'");
      // The Undo on a cheer answers no reminder.
      const task = r.brain.getSnapshot().next!;
      await r.brain.complete(task);
      changesNothing(r.brain.getSnapshot().bubble!, "Undo");
      await vi.waitFor(() => expect(r.brain.getSnapshot()).toMatchObject({ loading: false, next: { id: task.id } }));
      // A real answer ("Split it", "Show"…) starts the row over, and that kind's back-off. (Leaving YouTube after
      // 2+ minutes first brings the resume card, a check-in with no kind: v0.4 §1.)
      const real = r.until((b) => b.kind !== undefined);
      const i = real.actions.findIndex((a) => !a.neutral && !a.title.startsWith("▶"));
      expect(i, real.text).toBeGreaterThan(-1);
      r.brain.pickAction(real.id, i);
      expect(life().dismissedInRow).toBe(0);
      expect(life().dayBackoff[real.kind!]).toBeUndefined();
      expect(Object.keys(life().dayBackoff).length).toBe(Object.keys(backoff).length - 1);
    } finally {
      r.brain.stop();
    }
  });

  it("keeps Later at its own delay, whatever the nudge's back-off", async () => {
    // Worried (a little dirty), so no tips come in between.
    const r = await rig({ prefs: { bubbleGap: 0 }, life: { dirt: 2, dayBackoff: { nudge: 8 } } });
    try {
      r.clock.t = at(28, 11);
      // A quarter of an hour of answers ("Later" where there is one) gets the morning's reminders out of the way.
      let lastLater = r.clock.t;
      for (let i = 0; i < 15; i++) {
        const b = r.step(i === 0 ? 0 : 1);
        if (!b) continue;
        if (b.actions.some((a) => a.title === "Later")) lastLater = r.clock.t;
        r.answer(b);
      }
      // Next nudge: 30 minutes after "Later" (and 45 quiet minutes), not 8 × 45.
      const nudge = r.until((x) => x.kind === "nudge", 60);
      expect(r.clock.t - lastLater).toBeLessThanOrEqual(47 * MIN);
      expect(nudge.kind).toBe("nudge");
    } finally {
      r.brain.stop();
    }
  });

  it("caps the back-off at ×8", async () => {
    const r = await rig({ prefs: { bubbleGap: 0, antics: false }, life: { dayBackoff: { distract: 8 } } });
    try {
      r.clock.t = at(28, 11, 30);
      r.answer(r.step(0)!);
      r.watchYouTube();
      const b = r.step(2)!;
      expect(b.kind).toBe("distract");
      r.brain.dismissBubble(b.id, "closed");
      expect(r.brain.getSnapshot().life.dayBackoff.distract).toBe(8);
      expect(r.diaryTexts("response").at(-1)).toContain("×8");
    } finally {
      r.brain.stop();
    }
  });

  it("doesn't count a bubble without buttons that fades as a refusal, but closing it is one", async () => {
    for (const how of ["ignored", "closed"] as const) {
      const r = await rig({ prefs: { bubbleGap: 0 } });
      try {
        r.clock.t = at(28, 17, 30);
        // The end-of-day review (a check-in), then the tally of today's detours (no buttons).
        const b = r.until((x) => x.kind === "distractsum");
        expect(b.actions).toEqual([]);
        r.brain.dismissBubble(b.id, how);
        expect(r.brain.getSnapshot().life.dismissedInRow).toBe(how === "closed" ? 1 : 0);
        expect(r.brain.getSnapshot().life.dayBackoff).toEqual({});
      } finally {
        r.brain.stop();
      }
    }
  });

  it("still greets, reviews and cheers when the budget is spent or reminders are held", async () => {
    const spent = await rig({ prefs: { bubbleGap: 0, nudgeBudget: 0 } });
    try {
      expect(spent.step()?.text).toContain("Good morning");
    } finally {
      spent.brain.stop();
    }
    const held = await rig({ prefs: { bubbleGap: 0 }, life: { nudgeHoldUntil: at(28, 19) } });
    try {
      held.clock.t = at(28, 17, 30);
      held.answer(held.step(0)!); // morning greeting
      expect(held.step()?.text).toContain("end of day");
    } finally {
      held.brain.stop();
    }
    const done = await rig({ prefs: { bubbleGap: 0 }, life: { dayNudges: 8 } });
    try {
      done.answer(done.step()!); // morning greeting
      for (const t of [...done.brain.getSnapshot().day.today, ...done.brain.getSnapshot().day.overdue]) await done.brain.complete(t);
      done.brain.dismissBubble(done.brain.getSnapshot().bubble!.id, "closed");
      await vi.waitFor(() => expect(done.brain.getSnapshot().loading).toBe(false));
      expect(done.step()?.text).toContain("Everything's done");
    } finally {
      done.brain.stop();
    }
  });

  it("stays quiet with a budget of 0, or one lowered below what's already used", async () => {
    const zero = await rig({ prefs: { bubbleGap: 0, nudgeBudget: 0 } });
    try {
      expect(zero.brain.getSnapshot().nudgesLeft).toBe(0);
      for (let i = 0; i < 30; i++) {
        const b = zero.step();
        expect(b?.kind, b?.text).toBeUndefined();
        if (b) zero.answer(b);
      }
      expect(zero.diaryTexts("hold").filter((t) => t.includes("No reminders left today"))).toHaveLength(1);
    } finally {
      zero.brain.stop();
    }
    const lowered = await rig({ prefs: { bubbleGap: 0 }, life: { dayNudges: 5 } });
    try {
      expect(lowered.brain.getSnapshot().nudgesLeft).toBe(3);
      await lowered.brain.updatePrefs({ nudgeBudget: 3 });
      expect(lowered.brain.getSnapshot().nudgesLeft).toBe(0);
      for (let i = 0; i < 30; i++) {
        const b = lowered.step();
        expect(b?.kind, b?.text).toBeUndefined();
        if (b) lowered.answer(b);
      }
    } finally {
      lowered.brain.stop();
    }
  });

  it("names the budget or the hold as the reason a reminder waits, not the typing", async () => {
    const r = await rig({ prefs: { bubbleGap: 0 }, life: { dayNudges: 8 } });
    try {
      r.answer(r.step()!); // morning greeting
      r.brain.onSample(r.sample({ secondsSinceKey: 1 }));
      r.step();
      expect(r.diaryTexts("hold").some((t) => t.includes("No reminders left today"))).toBe(true);
      expect(r.diaryTexts("hold").some((t) => t.includes("you're typing"))).toBe(false);
    } finally {
      r.brain.stop();
    }
  });
});

describe("Brain and kind moods", () => {
  it("makes mischief only while you're on a distracting app or site", async () => {
    // Dirty and worried from the start (60 + 8 − 7 − 15 − 3 = 43), with work in front.
    const { brain, step, answer, watchYouTube } = await rig({ life: { dirt: 3 }, prefs: { bubbleGap: 0 } });
    try {
      expect(brain.getSnapshot().mood).toBe("annoyed");
      // Twelve worried minutes without a distraction: reminders, but no grumbling and no parade.
      for (let i = 0; i < 12; i++) {
        const b = step();
        expect(brain.getSnapshot().antic).toBeNull();
        if (b) answer(b);
      }
      expect(brain.getSnapshot().mood).toBe("annoyed");
      // On YouTube for 2 minutes: grumpy now, and called out.
      watchYouTube();
      const called = step(2);
      expect(brain.getSnapshot().mood).toBe("angry");
      expect(called?.text).toContain("youtube.com");
      brain.dismissBubble(called!.id, "ignored");
      // Still on it: the sign parade at 5 minutes, and a grumble only 10 minutes in (counted from YouTube, not from
      // how long the pet has been worried).
      for (let m = 3; m < 10; m++) {
        const b = step();
        expect(brain.getSnapshot().antic?.kind.type ?? "none", `${m} min`).toBe(m < 5 ? "none" : "parade");
        if (b) brain.dismissBubble(b.id, "ignored");
      }
      step();
      expect(brain.getSnapshot().antic?.kind.type).toBe("grumble");
    } finally {
      brain.stop();
    }
  });

  it("starts mischief with the sign parade after 5 minutes on a distraction; the table flip comes later, in the same slot", async () => {
    const { brain, clock, step, answer, watchYouTube } = await rig({ life: { dirt: 3 }, prefs: { bubbleGap: 0, nudgeBudget: 30 } });
    try {
      // After the 10–11 meeting, so nothing urgent comes up for a while.
      clock.t = at(28, 11);
      // A quarter of an hour of work first, so the morning's reminders are out of the way.
      for (let i = 0; i < 15; i++) {
        const b = step(i === 0 ? 0 : 1);
        if (b) answer(b);
      }
      watchYouTube();
      const since = clock.t;
      const minutes = () => (clock.t - since) / MIN;
      const called = step(2);
      expect(called?.kind).toBe("distract");
      brain.dismissBubble(called!.id, "ignored");
      let b: Bubble | null = null;
      while (brain.getSnapshot().antic?.kind.type !== "parade") {
        b = step();
        expect(brain.getSnapshot().antic?.kind.type).not.toBe("block");
        expect(minutes()).toBeLessThanOrEqual(5);
        if (b && brain.getSnapshot().antic?.kind.type !== "parade") brain.dismissBubble(b.id, "ignored");
      }
      expect(minutes()).toBe(5);
      expect(b?.kind).toBe("antic");
      // "▶ Focus", then back to YouTube at once, typing a comment: only the stunts and the callout can speak now.
      brain.pickAction(b!.id, 0);
      brain.stopFocus();
      brain.dismissBubble(brain.getSnapshot().bubble?.id ?? -1, "ignored");
      watchYouTube({ secondsSinceKey: 1, appSwitchedAt: since });
      while (minutes() < 24) {
        b = step();
        expect(brain.getSnapshot().antic).toBeNull();
        if (b) brain.dismissBubble(b.id, "ignored");
      }
      // The parade took the 20-minute slot at 5: the table flip (15+ minutes in) gets it at 25.
      b = step();
      expect(minutes()).toBe(25);
      expect(brain.getSnapshot().antic?.kind.type).toBe("block");
      expect(b?.kind).toBe("antic");
    } finally {
      brain.stop();
    }
  });

  it("flips the table only after 15 minutes on a distraction", async () => {
    const { brain, clock, step, answer, watchYouTube } = await rig({ life: { dirt: 3 }, prefs: { bubbleGap: 0 } });
    try {
      clock.t = at(28, 11);
      answer(step(0)!); // morning greeting
      // Typing on YouTube (a comment, say): no parade while typing, and the rest waits for a pause.
      watchYouTube({ secondsSinceKey: 1 });
      const called = step(2);
      expect(called?.kind).toBe("distract");
      brain.dismissBubble(called!.id, "closed");
      for (let m = 3; m < 15; m++) {
        expect(step()).toBeNull();
        expect(brain.getSnapshot().antic).toBeNull();
      }
      const left = brain.getSnapshot().nudgesLeft;
      const b = step();
      expect(brain.getSnapshot().antic?.kind.type).toBe("block");
      expect(b?.kind).toBe("antic");
      // A stunt is a reminder too: it counts against today's budget.
      expect(brain.getSnapshot().nudgesLeft).toBe(left - 1);
    } finally {
      brain.stop();
    }
  });

  it("says kindly when a repair quest ran out, without a 0-day streak breaking", async () => {
    // A quest from an earlier break, a snack in the stash, and no streak yet.
    const { brain, diaryTexts } = await rig({ life: { streak: 0, snacks: 1, repair: { streak: 6, until: "2026-11-05" } } });
    try {
      brain.demoMissDay();
      const s = brain.getSnapshot();
      expect(s.life).toMatchObject({ streak: 0, snacks: 1, repair: null, dirt: 1 });
      expect(s.bubble?.text).toContain("quest ran out");
      const closed = diaryTexts("life").filter((t) => t.startsWith("Closed"));
      expect(closed).toHaveLength(1);
      expect(closed[0]).not.toContain("0-day");
      expect(closed[0]).toContain("no streak to keep");
    } finally {
      brain.stop();
    }
  });

  it("offers a fresh start for overdue tasks: every one that doesn't repeat moves to tomorrow", async () => {
    const { brain, until, diaryTexts } = await rig({ prefs: { bubbleGap: 0 } });
    try {
      const b = until((x) => x.text.includes("overdue"));
      expect(b.actions.map((a) => a.title)).toEqual(["Move to today", "Fresh start", "Show"]);
      brain.pickAction(b.id, 1);
      await vi.waitFor(() => expect(brain.getSnapshot().day.overdue).toHaveLength(0), { timeout: 3000 });
      await vi.waitFor(() => expect(brain.getSnapshot().bubble?.text).toContain("Fresh start"));
      const reply = brain.getSnapshot().bubble;
      expect(reply?.text).toContain("clean slate");
      expect(reply?.reminder).toBe(false);
      expect(reply?.actions.map((a) => a.title)).toEqual(["Undo"]);
      // The task left today's list too: it's due tomorrow now.
      expect(brain.getSnapshot().day.today.map((t) => t.id)).not.toContain("3");
      expect(diaryTexts("system").some((t) => t.includes("Fresh start: moved 1 overdue task to tomorrow: “Reply to the boss's email” (was 2026-10-25)"))).toBe(true);
    } finally {
      brain.stop();
    }
  });

  /** Two more overdue tasks that can move (x2 fails to) and a repeating one. */
  const moreOverdue = (opts: { failing?: string[] } = {}) => (b: DemoBackend) => {
    const tasks = b.todoist.tasks.bind(b.todoist);
    const reschedule = b.todoist.reschedule.bind(b.todoist);
    const extra: RawTask[] = [
      { id: "x1", content: "Old one", priority: 1, due: { date: "2026-10-20", string: "Oct 20" } },
      { id: "x2", content: "Old two", priority: 1, due: { date: "2026-10-21", string: "Oct 21" } },
      { id: "x3", content: "Weekly review", priority: 1, due: { date: "2026-10-26", string: "every monday", is_recurring: true } },
    ];
    const dates = new Map(extra.map((x) => [x.id, x.due!.date]));
    b.todoist.tasks = async (f) => [...(await tasks(f)), ...extra.filter((x) => dates.get(x.id)! <= "2026-10-28").map((x) => ({ ...x, due: { ...x.due!, date: dates.get(x.id)! } }))];
    b.todoist.reschedule = async (id, due) => {
      if (opts.failing?.includes(id)) throw new BackendError({ kind: "network", message: "offline" });
      if (!dates.has(id)) return reschedule(id, due);
      dates.set(id, due === "tomorrow" ? "2026-10-29" : due);
    };
  };

  it("says how a fresh start went when some tasks couldn't move, and Undo puts the moved ones back", async () => {
    const { brain, backend, diaryTexts } = await rig({ prefs: { bubbleGap: 0 }, setup: moreOverdue({ failing: ["x2"] }) });
    try {
      await brain.refresh();
      expect(brain.getSnapshot().day.overdue.map((t) => t.id).sort()).toEqual(["3", "x1", "x2", "x3"]);
      const said = vi.spyOn(brain, "say");
      await brain.freshStart();
      // One bubble: the error isn't replaced by a cheerful one.
      expect(said).toHaveBeenCalledTimes(1);
      const b = brain.getSnapshot().bubble!;
      expect(b.text).toContain("Moved 2 of 3 overdue tasks to tomorrow; 1 couldn't move");
      expect(b.text).toContain("offline");
      expect(b.text).toContain("Repeating tasks stay put");
      expect(b.text).not.toContain("clean slate");
      expect(b.actions.map((a) => a.title)).toEqual(["Undo"]);
      expect(brain.getSnapshot().day.overdue.map((t) => t.id).sort()).toEqual(["x2", "x3"]);
      const log = diaryTexts("system").find((t) => t.startsWith("Fresh start"));
      expect(log).toContain("“Old one” (was 2026-10-20)");
      expect(log).toContain("“Reply to the boss's email” (was 2026-10-25)");
      const moves: [string, string][] = [];
      const reschedule = backend.todoist.reschedule;
      backend.todoist.reschedule = async (id, due) => {
        moves.push([id, due]);
        return reschedule(id, due);
      };
      brain.pickAction(b.id, 0);
      await vi.waitFor(() => expect(brain.getSnapshot().bubble?.text).toContain("Put 2 tasks back"));
      expect(moves.sort()).toEqual([
        ["3", "2026-10-25"],
        ["x1", "2026-10-20"],
      ]);
      expect(brain.getSnapshot().day.overdue.map((t) => t.id).sort()).toEqual(["3", "x1", "x2", "x3"]);
    } finally {
      brain.stop();
    }
  });

  it("doesn't call it a clean slate while repeating tasks are still overdue", async () => {
    const { brain } = await rig({ prefs: { bubbleGap: 0 }, setup: moreOverdue() });
    try {
      await brain.refresh();
      await brain.freshStart();
      const b = brain.getSnapshot().bubble!;
      expect(b.text).toContain("Moved 3 overdue tasks to tomorrow");
      expect(b.text).toContain("Repeating tasks stay put");
      expect(b.text).not.toContain("clean slate");
      expect(brain.getSnapshot().day.overdue.map((t) => t.id)).toEqual(["x3"]);
    } finally {
      brain.stop();
    }
  });

  it("says so when no task could move, with nothing to undo", async () => {
    const { brain, backend, diaryTexts } = await rig({ prefs: { bubbleGap: 0 } });
    try {
      backend.todoist.reschedule = async () => {
        throw new BackendError({ kind: "network", message: "offline" });
      };
      await brain.freshStart();
      const b = brain.getSnapshot().bubble!;
      expect(b.text).toContain("Couldn't move the 1 overdue task");
      expect(b.actions).toEqual([]);
      expect(diaryTexts("system").some((t) => t.startsWith("Fresh start"))).toBe(false);
    } finally {
      brain.stop();
    }
  });

  it("offers only Show when every overdue task repeats", async () => {
    const { brain, until } = await rig({
      prefs: { bubbleGap: 0 },
      setup: (b) => {
        const tasks = b.todoist.tasks.bind(b.todoist);
        b.todoist.tasks = async (f) => [
          ...(await tasks(f)).filter((t) => t.id !== "3"),
          { id: "x3", content: "Weekly review", priority: 1, due: { date: "2026-10-26", string: "every monday", is_recurring: true } },
        ];
      },
    });
    try {
      const b = until((x) => x.kind === "overdue");
      expect(b.text).toContain("1 repeating task is overdue");
      expect(b.text).not.toMatch(/move|fresh start/i);
      expect(b.actions.map((a) => a.title)).toEqual(["Show"]);
    } finally {
      brain.stop();
    }
  });
});

describe("Brain and the nudge budget", () => {
  it("counts unsolicited reminders, but not urgent ones, replies or the two daily check-ins", async () => {
    const { brain, clock, step, answer, until } = await rig({ prefs: { bubbleGap: 0 } });
    try {
      const left = () => brain.getSnapshot().nudgesLeft;
      expect(left()).toBe(8);
      // The morning greeting is a check-in.
      let b = step();
      expect(b?.text).toContain("Good morning");
      expect(b?.reminder).toBe(true);
      expect(left()).toBe(8);
      answer(b!);
      // A postponed task is a reminder.
      b = step();
      expect(b?.kind).toBe("stuck");
      expect(left()).toBe(7);
      answer(b!);
      // The cheer for a finished task is a reply.
      await brain.complete(brain.getSnapshot().next!);
      expect(brain.getSnapshot().bubble?.reminder).toBe(false);
      expect(left()).toBe(7);
      // (Reminders wait for the sync that the completion started.)
      await vi.waitFor(() => expect(brain.getSnapshot().loading).toBe(false));
      // A meeting and a timed task are urgent.
      const meeting = brain.getSnapshot().events[0];
      clock.t = meeting.start.getTime() - 4 * MIN;
      b = step(0);
      expect(b?.text).toContain("Meeting in 4 min");
      b = step(0);
      expect(b?.text).toContain("In 4 min");
      expect(left()).toBe(7);
      brain.dismissBubble(b!.id, "closed");
      // Late in the day: every reminder costs one, the end-of-day review costs nothing.
      clock.t = at(28, 17, 30);
      let before = left();
      const review = until((x) => {
        if (x.text.includes("end of day")) return true;
        expect(x.kind, x.text).toBeDefined();
        expect(left()).toBe(before - 1);
        before = left();
        return false;
      });
      expect(review.reminder).toBe(true);
      expect(review.kind).toBeUndefined();
      expect(left()).toBe(before);
    } finally {
      brain.stop();
    }
  });

  it("stays quiet once today's budget is spent, with one diary line, and still lets urgent bubbles through", async () => {
    const { brain, clock, step, answer, diaryTexts } = await rig({ prefs: { bubbleGap: 0, nudgeBudget: 1 } });
    try {
      answer(step()!); // morning greeting
      const b = step();
      expect(b?.kind).toBe("stuck");
      expect(brain.getSnapshot().nudgesLeft).toBe(0);
      answer(b!);
      // The overdue task, the time slot…: all due, all quiet.
      for (let i = 0; i < 20; i++) expect(step()).toBeNull();
      expect(diaryTexts("hold").filter((t) => t.includes("No reminders left today"))).toHaveLength(1);
      const meeting = brain.getSnapshot().events[0];
      clock.t = meeting.start.getTime() - 4 * MIN;
      expect(step(0)?.text).toContain("Meeting in 4 min");
    } finally {
      brain.stop();
    }
  });

  it("backs a reminder off each time you close it, and resets it when you tap one of its buttons", async () => {
    const { brain, clock, step, answer, watchYouTube } = await rig({ prefs: { antics: false } });
    try {
      // After the 10–11 meeting, so nothing urgent comes up until 12:55.
      clock.t = at(28, 11, 30);
      answer(step(0)!); // morning greeting
      watchYouTube();
      let b = step(2);
      expect(b?.kind).toBe("distract");
      brain.dismissBubble(b!.id, "closed"); // every 10 → 20 minutes
      expect(step(10)).toBeNull();
      b = step(10);
      expect(b?.kind).toBe("distract");
      brain.dismissBubble(b!.id, "ignored"); // → 40 minutes
      expect(step(10)).toBeNull();
      // 20 minutes on, the postponed task gets its turn instead.
      b = step(10);
      expect(b?.kind).toBe("stuck");
      answer(b!);
      expect(step(10)).toBeNull();
      b = step(10);
      expect(b?.kind).toBe("distract");
      expect(b?.actions[0].title).toBe("▶ Focus 25'");
      // A real answer ("Focus", then back to YouTube at once): every 10 minutes again. ("Just a quick break" is
      // neutral and changes nothing.)
      brain.pickAction(b!.id, 0);
      brain.stopFocus();
      brain.dismissBubble(brain.getSnapshot().bubble?.id ?? -1, "ignored");
      b = step(10);
      expect(b?.kind).toBe("distract");
    } finally {
      brain.stop();
    }
  });

  it("holds non-urgent bubbles for an hour after three dismissed reminders in a row", async () => {
    const { brain, clock, step, answer, diaryTexts } = await rig({ prefs: { bubbleGap: 0 } });
    try {
      clock.t = at(28, 11, 30);
      answer(step(0)!); // morning greeting: "Later" asks again in 30 minutes
      for (let closed = 0; closed < 3; ) {
        const b = step();
        if (!b) continue;
        expect(b.kind).toBeDefined();
        brain.dismissBubble(b.id, "closed");
        closed++;
      }
      const until = brain.getSnapshot().nudgeHoldUntil!;
      expect(until).toBe(clock.t + 60 * MIN);
      expect(diaryTexts("hold").some((t) => t.includes("3 reminders in a row"))).toBe(true);
      // The next-task nudge comes due during the hour, and waits.
      while (clock.t + MIN < until) expect(step()).toBeNull();
      expect(diaryTexts("hold").some((t) => t.includes("Held a reminder"))).toBe(true);
      const b = step();
      expect(clock.t).toBeGreaterThanOrEqual(until);
      expect(b?.kind).toBe("nudge");
    } finally {
      brain.stop();
    }
  });

  it("starts every day with a full budget and no back-off", async () => {
    const { brain, clock, step, answer, watchYouTube, backToWork } = await rig({ prefs: { bubbleGap: 0, nudgeBudget: 2, antics: false } });
    try {
      clock.t = at(28, 11, 30);
      answer(step(0)!); // morning greeting
      watchYouTube();
      let b = step(2);
      expect(b?.kind).toBe("distract");
      brain.dismissBubble(b!.id, "closed"); // every 20 minutes for the rest of today
      b = step();
      expect(b?.kind).toBe("stuck");
      brain.dismissBubble(b!.id, "closed");
      expect(brain.getSnapshot().nudgesLeft).toBe(0);
      // Thursday morning, back at work: the greeting is free. It waits for Wednesday to be settled.
      backToWork();
      clock.t = at(29, 9);
      brain.tick();
      await vi.waitFor(() => expect(brain.getSnapshot()).toMatchObject({ loading: false, life: { dayKey: "2026-10-29" } }));
      brain.tick();
      expect(brain.getSnapshot().bubble?.text).toContain("Good morning");
      expect(brain.getSnapshot().life.dayNudges).toBe(0);
      expect(brain.getSnapshot().nudgesLeft).toBe(2);
      answer(brain.getSnapshot().bubble!);
      watchYouTube();
      b = step(2);
      expect(b?.kind).toBe("distract");
      // Mute and unmute from the board: the bubble goes without an answer.
      brain.quiet(60);
      brain.quiet(null);
      expect(step(10)?.kind).toBe("distract");
    } finally {
      brain.stop();
    }
  });

  it("remembers how many reminders were used today across a restart", async () => {
    const r = await rig({ prefs: { bubbleGap: 0 } });
    let again: Brain | null = null;
    try {
      r.answer(r.step()!); // morning greeting
      r.answer(r.until((b) => b.kind !== undefined));
      r.answer(r.until((b) => b.kind !== undefined));
      expect(r.brain.getSnapshot().nudgesLeft).toBe(6);
      r.brain.stop();
      again = await r.boot();
      expect(again.getSnapshot().life.dayNudges).toBe(2);
      expect(again.getSnapshot().nudgesLeft).toBe(6);
    } finally {
      r.brain.stop();
      again?.stop();
    }
  });
});

// ---------- v0.4 "Indispensable": resume card, meeting bookends, if-then starts ----------

/** An ICS calendar with floating local times, like the demo's. */
const stamp = (t: number) => {
  const d = new Date(t);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}T${p(d.getHours())}${p(d.getMinutes())}00`;
};
const icsOf = (...events: { uid: string; title: string; start: number; end: number }[]) =>
  [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    ...events.flatMap((e) => ["BEGIN:VEVENT", `UID:${e.uid}`, `DTSTART:${stamp(e.start)}`, `DTEND:${stamp(e.end)}`, `SUMMARY:${e.title}`, "END:VEVENT"]),
    "END:VCALENDAR",
  ].join("\r\n");
/** The calendar the demo backend serves, replaced by these meetings. */
const meetings =
  (...events: { uid: string; title: string; start: number; end: number }[]) =>
  (b: DemoBackend) => {
    b.calendar.fetchIcs = async () => [{ host: "demo.todopet", ok: true, text: icsOf(...events) }];
  };
const DOCS = { app: { name: "Google Chrome", exe: "chrome.exe", title: "Spec - Google Chrome" }, url: "https://docs.example.com/spec#intro" };
const FIGMA = { app: { name: "Figma", exe: "figma.exe", title: "Landing page" }, url: null };

type Rig = Awaited<ReturnType<typeof rig>>;
/** Goes idle in `front`, stays away for `minutes`, and comes back; returns the bubble the return brings. */
function awayAndBack(r: Rig, front: Partial<SystemSample>, minutes: number): Bubble | null {
  r.brain.onSample(r.sample({ ...front, idleSeconds: 310 }));
  r.brain.runRules(r.clock.t);
  r.clock.t += minutes * MIN;
  r.brain.onSample(r.sample({ ...front, idleSeconds: 310 + minutes * 60 }));
  r.brain.runRules(r.clock.t);
  r.brain.onSample(r.sample({ ...front, idleSeconds: 0 }));
  r.brain.recompute();
  r.brain.runRules(r.clock.t);
  return r.brain.getSnapshot().bubble;
}
const titles = (b: Bubble | null) => b?.actions.map((a) => a.title);
/** Everything a bubble says: its text and its quiet second line (where you were, on the resume card). */
const whole = (b: Bubble | null) => [b?.text, b?.detail].filter(Boolean).join("\n");

describe("Brain v0.4: the resume card (Where was I?)", () => {
  /** A rig past the morning greeting, with the browser in front. */
  async function ready(opts: Parameters<typeof rig>[0] = {}) {
    const r = await rig({ prefs: { bubbleGap: 0 }, ...opts });
    r.answer(r.step()!); // morning greeting
    r.brain.onSample(r.sample(DOCS));
    return r;
  }

  it("welcomes you back with the task, the app and the page after 5+ minutes away, without spending the budget", async () => {
    const r = await ready();
    try {
      const left = r.brain.getSnapshot().nudgesLeft;
      const b = awayAndBack(r, DOCS, 6);
      expect(b?.text).toContain("Next up: “Write the weekly report”");
      expect(b?.detail).toBe("Last in: Google Chrome — Spec");
      expect(titles(b)).toEqual(["Reopen ↗ docs.example.com", "▶ Focus 25'", "Something else"]);
      expect(b?.kind).toBeUndefined();
      expect(r.brain.getSnapshot().nudgesLeft).toBe(left);
      // It replaces the generic welcome-back, which is for when there is nothing to resume.
      expect(b?.text).not.toContain("Welcome back! 👋 Continue");
    } finally {
      r.brain.stop();
    }
  });

  it("doesn't offer it for a short absence", async () => {
    const r = await ready();
    try {
      // Idle for under 5 minutes never counts as away.
      r.brain.onSample(r.sample({ ...DOCS, idleSeconds: 200 }));
      r.brain.runRules(r.clock.t);
      r.brain.onSample(r.sample({ ...DOCS, idleSeconds: 0 }));
      r.brain.runRules(r.clock.t);
      expect(r.brain.getSnapshot().bubble?.text ?? "").not.toContain("You were");
    } finally {
      r.brain.stop();
    }
  });

  it("Reopen opens the page's http(s) address, without its #fragment", async () => {
    const r = await ready();
    try {
      const open = vi.spyOn(r.backend.system, "openUrl").mockResolvedValue();
      const b = awayAndBack(r, DOCS, 6)!;
      r.brain.pickAction(b.id, 0);
      expect(open).toHaveBeenCalledExactlyOnceWith("https://docs.example.com/spec");
    } finally {
      r.brain.stop();
    }
  });

  it.each(["file:///C:/Users/me/secret.txt", "chrome://settings", "javascript:alert(1)", "ftp://files.example.com/a", "not a url"])("offers no Reopen for %s", async (url) => {
    const r = await ready();
    try {
      const open = vi.spyOn(r.backend.system, "openUrl").mockResolvedValue();
      const b = awayAndBack(r, { ...DOCS, url }, 6);
      expect(titles(b)).toEqual(["▶ Focus 25'", "Something else"]);
      expect(b?.text).not.toContain(url);
      expect(open).not.toHaveBeenCalled();
    } finally {
      r.brain.stop();
    }
  });

  it("Focus starts a session on the task, Something else opens the board", async () => {
    const r = await ready();
    try {
      const openBoard = vi.fn();
      r.brain.effects = { openBoard };
      let b = awayAndBack(r, DOCS, 6)!;
      r.brain.pickAction(b.id, 1);
      expect(r.brain.getSnapshot().focus?.task?.id).toBe("1");
      r.brain.stopFocus();
      r.brain.dismissBubble(r.brain.getSnapshot().bubble?.id ?? -1, "closed");
      r.clock.t += 31 * MIN; // one resume card every 30 minutes
      b = awayAndBack(r, DOCS, 6)!;
      r.brain.pickAction(b.id, 2);
      expect(openBoard).toHaveBeenCalledWith(false);
    } finally {
      r.brain.stop();
    }
  });

  it("shows the card once: the same place isn't offered again", async () => {
    const r = await ready();
    try {
      const b = awayAndBack(r, DOCS, 6)!;
      r.brain.dismissBubble(b.id, "closed");
      r.clock.t += MIN;
      r.brain.runRules(r.clock.t);
      expect(r.brain.getSnapshot().bubble?.text ?? "").not.toContain("You were");
    } finally {
      r.brain.stop();
    }
  });

  it("offers it after leaving a distraction for 2+ minutes, with the place you left", async () => {
    const r = await ready();
    try {
      r.watchYouTube();
      r.clock.t += 3 * MIN;
      r.watchYouTube();
      r.backToWork();
      r.brain.runRules(r.clock.t);
      const b = r.brain.getSnapshot().bubble;
      expect(b?.text).toContain("Next up: “Write the weekly report”");
      expect(b?.detail).toBe("Last in: Google Chrome — Spec");
      expect(b?.text).not.toContain("YouTube");
      expect(b?.kind).toBeUndefined();
    } finally {
      r.brain.stop();
    }
  });

  it("stays quiet after a quick peek at a distraction", async () => {
    const r = await ready();
    try {
      r.watchYouTube();
      r.clock.t += MIN;
      r.watchYouTube();
      r.backToWork();
      r.brain.runRules(r.clock.t);
      expect(r.brain.getSnapshot().bubble?.text ?? "").not.toContain("You were");
    } finally {
      r.brain.stop();
    }
  });

  it("has no card when the only place was a distraction, or there is nothing to resume", async () => {
    // The pet starts with YouTube already in front and never sees a work app.
    const clock = { t: at(28, 9) };
    const backend = createDemoBackend({ now: () => clock.t, persist: false });
    const brain = await Brain.create(backend, { demo: true, now: () => clock.t, random: () => 0.5 });
    setLang("en");
    await brain.start();
    try {
      brain.dismissBubble(brain.getSnapshot().bubble?.id ?? -1, "closed");
      const front = (patch: Partial<SystemSample>): SystemSample => ({ ...YOUTUBE, idleSeconds: 0, secondsSinceKey: 999, fullscreen: false, appSwitchedAt: clock.t, ...patch });
      brain.onSample(front({}));
      brain.onSample(front({ idleSeconds: 310 }));
      brain.runRules(clock.t);
      clock.t += 6 * MIN;
      brain.onSample(front({ idleSeconds: 0 }));
      brain.recompute();
      brain.runRules(clock.t);
      expect(brain.getSnapshot().bubble?.text ?? "").not.toContain("You were");
    } finally {
      brain.stop();
    }
    // No tasks and no app in front: empty.
    const clock2 = { t: at(28, 9) };
    const backend2 = createDemoBackend({ now: () => clock2.t, persist: false });
    backend2.todoist.tasks = async () => [];
    const empty = await Brain.create(backend2, { demo: true, now: () => clock2.t, random: () => 0.5 });
    await empty.start();
    try {
      empty.dismissBubble(empty.getSnapshot().bubble?.id ?? -1, "closed");
      const none = (idle: number): SystemSample => ({ app: null, url: null, idleSeconds: idle, secondsSinceKey: 999, fullscreen: false, appSwitchedAt: 0 });
      empty.onSample(none(310));
      empty.runRules(clock2.t);
      clock2.t += 6 * MIN;
      empty.onSample(none(0));
      empty.recompute();
      empty.runRules(clock2.t);
      expect(empty.getSnapshot().bubble?.text ?? "").not.toContain("You were");
    } finally {
      empty.stop();
    }
  });

  it("never makes the pet's own window, or a task that's done, the place", async () => {
    const r = await ready();
    try {
      // The board is open (the pet's window is in front) while you go idle: the page you were on is what counts.
      const pet = { app: { name: "TodoPet", exe: "todopet.exe", title: "TodoPet" }, url: null };
      r.brain.onSample(r.sample(pet));
      const b = awayAndBack(r, pet, 6);
      expect(whole(b)).toContain("Google Chrome — Spec");
      expect(whole(b)).not.toContain("TodoPet");
    } finally {
      r.brain.stop();
    }
  });

  it("pins your place with a next step that the card shows", async () => {
    const r = await ready();
    try {
      // The board is open, so the pet is in front when you press the pin.
      r.brain.onSample(r.sample({ app: { name: "TodoPet", exe: "todopet.exe", title: "TodoPet" } }));
      expect(r.brain.pinPlace("  Fix   the retry loop  ")).toBe(true);
      expect(r.brain.getSnapshot().pinned).toBe(true);
      // A different page and an automatic snapshot afterwards don't wipe the pin.
      const b = awayAndBack(r, { app: { name: "Notepad", exe: "notepad.exe", title: "todo.txt - Notepad" }, url: null }, 6);
      expect(b?.text).toContain("Fix the retry loop");
      expect(whole(b)).toContain("Google Chrome — Spec");
      expect(b?.kind).toBeUndefined();
      expect(r.brain.getSnapshot().pinned).toBe(false);
      // Used up: the next absence (a resume card comes every 30 minutes at most) reports where you are then.
      r.brain.dismissBubble(b!.id, "closed");
      r.clock.t += 31 * MIN;
      const again = awayAndBack(r, { app: { name: "Notepad", exe: "notepad.exe", title: "todo.txt - Notepad" }, url: null }, 6);
      expect(whole(again)).not.toContain("Fix the retry loop");
      expect(whole(again)).toContain("Notepad");
    } finally {
      r.brain.stop();
    }
  });

  it("pins without a note, can unpin, and says no when there is nothing to keep", async () => {
    const r = await ready();
    try {
      expect(r.brain.pinPlace(null)).toBe(true);
      expect(r.brain.getSnapshot().pinned).toBe(true);
      r.brain.unpinPlace();
      expect(r.brain.getSnapshot().pinned).toBe(false);
      expect(r.brain.pinPlace("   ")).toBe(true);
    } finally {
      r.brain.stop();
    }
    const clock = { t: at(28, 9) };
    const backend = createDemoBackend({ now: () => clock.t, persist: false });
    backend.todoist.tasks = async () => [];
    const empty = await Brain.create(backend, { demo: true, now: () => clock.t });
    await empty.start();
    try {
      expect(empty.pinPlace(null)).toBe(false);
      // A note alone is still worth keeping.
      expect(empty.pinPlace("Call mum")).toBe(true);
    } finally {
      empty.stop();
    }
  });

  it("lets a fresh snapshot replace a pin that is hours old", async () => {
    const r = await ready();
    try {
      r.brain.pinPlace("Old plan");
      r.clock.t += 190 * MIN; // before the client meeting at 13:00
      r.brain.onSample(r.sample({ ...DOCS, appSwitchedAt: r.clock.t }));
      const b = awayAndBack(r, DOCS, 6);
      expect(b?.text).not.toContain("Old plan");
      expect(b?.text).toContain("Next up");
    } finally {
      r.brain.stop();
    }
  });

  it("uses the task you were focusing on, then the one you last worked on, then the next one", async () => {
    const r = await ready();
    try {
      const sprint = r.brain.getSnapshot().day.today.find((t) => t.id === "4")!;
      await r.brain.reschedule(sprint, "today");
      r.brain.pinPlace(null);
      const first = awayAndBack(r, DOCS, 6)!;
      expect(first.text).toContain("You were on: “Plan the next sprint”");
      r.brain.pickAction(first.id, 2);
      const call = r.brain.getSnapshot().day.today.find((t) => t.id === "2")!;
      r.brain.startFocus(call);
      r.brain.pinPlace(null);
      r.brain.stopFocus();
      r.brain.dismissBubble(r.brain.getSnapshot().bubble?.id ?? -1, "closed");
      r.clock.t += 31 * MIN; // one resume card every 30 minutes
      expect(awayAndBack(r, DOCS, 6)?.text).toContain("You were on: “Call client ABC”");
    } finally {
      r.brain.stop();
    }
  });

  it("keeps the place in memory only: nothing about it is saved to disk or written in the diary", async () => {
    const r = await ready();
    try {
      const saved: { key: string; json: string }[] = [];
      const save = r.backend.storage.save.bind(r.backend.storage);
      r.backend.storage.save = async (key, value) => {
        saved.push({ key, json: JSON.stringify(value) });
        return save(key, value);
      };
      r.brain.pinPlace("Fix the retry loop");
      const b = awayAndBack(r, DOCS, 6)!;
      r.brain.pickAction(b.id, 2);
      r.brain.pinPlace("Second secret note");
      r.clock.t += MIN;
      r.brain.tick();
      const private_ = ["Fix the retry loop", "Second secret note", "docs.example.com", "Spec - Google Chrome", "Spec", "Google Chrome"];
      for (const s of saved) {
        expect(["life", "prefs", "stuck", "triggers"], `saved key ${s.key}`).toContain(s.key);
        for (const word of private_) expect(s.json, `${s.key} holds ${word}`).not.toContain(word);
      }
      for (const text of r.diaryTexts()) for (const word of private_) expect(text, text).not.toContain(word);
    } finally {
      r.brain.stop();
    }
  });

  it("keeps a pinned note to one short line, emoji and all", async () => {
    const r = await ready();
    try {
      r.brain.pinPlace(`  Fix the 🐛 in\n   the retry loop ${"and so on ".repeat(60)}`);
      const b = awayAndBack(r, DOCS, 6)!;
      const note = b.text.split("\n").find((l) => l.startsWith("📌 Next step: "))!;
      expect(note.startsWith("📌 Next step: Fix the 🐛 in the retry loop")).toBe(true);
      const shown = note.slice("📌 Next step: ".length);
      expect([...new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(shown)].length).toBeLessThanOrEqual(120);
      expect(b.text.split("\n")).toHaveLength(3);
    } finally {
      r.brain.stop();
    }
  });

  it("forgets the place at the day change", async () => {
    const r = await ready();
    try {
      r.brain.pinPlace("Fix the retry loop");
      expect(r.brain.getSnapshot().pinned).toBe(true);
      // Out at the end of the day, back the next morning.
      r.brain.onSample(r.sample({ ...DOCS, idleSeconds: 310 }));
      r.brain.runRules(r.clock.t);
      r.clock.t = at(29, 9);
      r.brain.onSample(r.sample({ ...DOCS, idleSeconds: 0 }));
      r.brain.tick();
      await vi.waitFor(() => expect(r.brain.getSnapshot()).toMatchObject({ loading: false, life: { dayKey: "2026-10-29" } }));
      expect(r.brain.getSnapshot().pinned).toBe(false);
      r.brain.runRules(r.clock.t);
      expect(r.brain.getSnapshot().bubble?.text ?? "").not.toContain("Fix the retry loop");
      expect(r.brain.getSnapshot().bubble?.text ?? "").not.toContain("You were on");
    } finally {
      r.brain.stop();
    }
  });
});

describe("Brain v0.4: meeting bookends", () => {
  const TEAM = { uid: "team", title: "Team sync", start: at(28, 10), end: at(28, 11) };

  it("lists up to 2 related open tasks in the meeting-soon bubble, best match first", async () => {
    const r = await rig({
      prefs: { bubbleGap: 0 },
      setup: meetings({ uid: "abc", title: "Client ABC renewal", start: at(28, 9, 20), end: at(28, 10) }),
    });
    try {
      await r.brain.add("Client brief", "today", 1);
      await r.brain.add("Prepare client renewal terms", "today", 1);
      r.clock.t = at(28, 9, 16);
      r.brain.recompute();
      r.brain.runRules(r.clock.t);
      const b = r.brain.getSnapshot().bubble;
      expect(b?.text).toContain("Meeting in 4 min: “Client ABC renewal”");
      expect(b?.text).toContain("Related: “Prepare client renewal terms”, “Call client ABC”");
      expect(b?.text).not.toContain("Client brief");
      expect(b?.urgent).toBe(true);
    } finally {
      r.brain.stop();
    }
  });

  it("adds no related line when nothing shares a word with the meeting", async () => {
    const r = await rig({ prefs: { bubbleGap: 0 }, setup: meetings({ ...TEAM, start: at(28, 9, 20) }) });
    try {
      r.clock.t = at(28, 9, 16);
      r.brain.runRules(r.clock.t);
      expect(r.brain.getSnapshot().bubble?.text).toContain("Meeting in 4 min");
      expect(r.brain.getSnapshot().bubble?.text).not.toContain("Related");
    } finally {
      r.brain.stop();
    }
  });

  /** A rig where the day's first greeting is behind us, you were at every meeting (a 2-minute quiet stretch in each), and the clock is `h:m`. */
  async function afterGreeting(setup: (b: DemoBackend) => void, h: number, m: number) {
    const r = await rig({ prefs: { bubbleGap: 0 }, setup });
    r.answer(r.step()!); // morning greeting
    for (const e of r.brain.getSnapshot().events) {
      r.clock.t = e.start.getTime() + MIN;
      r.brain.onSample(r.sample({ idleSeconds: 150 }));
    }
    r.clock.t = at(28, h, m);
    r.brain.onSample(r.sample());
    return r;
  }

  it("asks what to capture once after a 15+ minute meeting, as a check-in", async () => {
    const r = await afterGreeting(meetings(TEAM), 11, 2);
    try {
      const left = r.brain.getSnapshot().nudgesLeft;
      const b = r.step(0);
      expect(b?.text).toBe("“Team sync” is over. Anything to capture?");
      expect(titles(b)).toEqual(["＋ Next step", "Nothing"]);
      expect(b?.kind).toBeUndefined();
      expect(b?.urgent).toBe(false);
      expect(r.brain.getSnapshot().nudgesLeft).toBe(left);
      r.brain.pickAction(b!.id, 1);
      // Asked once: whatever else the pet says in the next while, it isn't the question again.
      for (let i = 0; i < 5; i++) {
        const next = r.step(1);
        expect(next?.text ?? "").not.toContain("is over");
        if (next) r.answer(next);
      }
    } finally {
      r.brain.stop();
    }
  });

  it("stays out of short meetings: 14 minutes get no question, 15 do", async () => {
    const short = await afterGreeting(meetings({ uid: "s", title: "Stand-up", start: at(28, 10), end: at(28, 10, 14) }), 10, 16);
    try {
      expect(short.step(0)?.text ?? "").not.toContain("Anything to capture");
    } finally {
      short.brain.stop();
    }
    const exact = await afterGreeting(meetings({ uid: "s", title: "Stand-up", start: at(28, 10), end: at(28, 10, 15) }), 10, 16);
    try {
      expect(exact.step(0)?.text).toContain("“Stand-up” is over");
    } finally {
      exact.brain.stop();
    }
  });

  it("asks only when you're at the PC within 10 minutes of the end", async () => {
    const late = await afterGreeting(meetings(TEAM), 11, 11);
    try {
      expect(late.step(0)?.text ?? "").not.toContain("Anything to capture");
    } finally {
      late.brain.stop();
    }
    // Away when it ended, back 8 minutes later: still in time.
    const back = await afterGreeting(meetings(TEAM), 10, 58);
    try {
      back.brain.onSample(back.sample({ idleSeconds: 400 }));
      back.brain.runRules(back.clock.t);
      back.clock.t = at(28, 11, 8);
      back.brain.onSample(back.sample({ idleSeconds: 0 }));
      back.brain.recompute();
      back.brain.runRules(back.clock.t);
      expect(back.brain.getSnapshot().bubble?.text).toContain("“Team sync” is over");
    } finally {
      back.brain.stop();
    }
  });

  it("waits while the pet is out of the way, and while you are in the next meeting", async () => {
    const r = await afterGreeting(meetings(TEAM, { uid: "next", title: "Design review", start: at(28, 11), end: at(28, 12) }), 11, 2);
    try {
      expect(r.step(0)).toBeNull();
    } finally {
      r.brain.stop();
    }
    const hidden = await afterGreeting(meetings(TEAM), 11, 2);
    try {
      hidden.brain.hide(60);
      hidden.brain.dismissBubble(hidden.brain.getSnapshot().bubble!.id, "closed");
      expect(hidden.step(0)).toBeNull();
      hidden.brain.hide(null);
      expect(hidden.step(1)?.text).toContain("is over");
    } finally {
      hidden.brain.stop();
    }
  });

  it("suggests a 5-minute breather when the next meeting is within 15 minutes", async () => {
    const r = await afterGreeting(meetings(TEAM, { uid: "next", title: "Design review", start: at(28, 11, 12), end: at(28, 12) }), 11, 1);
    try {
      const b = r.step(0);
      expect(b?.text).toContain("“Team sync” is over");
      expect(b?.text).toContain("“Design review” starts at 11:12");
      expect(titles(b)).toEqual(["＋ Next step", "☕ 5-min breather", "Nothing"]);
      r.brain.pickAction(b!.id, 1);
      expect(r.brain.getSnapshot().focus).toMatchObject({ isBreak: true, minutes: 5 });
    } finally {
      r.brain.stop();
    }
    // 16 minutes away is too far to mention.
    const far = await afterGreeting(meetings(TEAM, { uid: "next", title: "Design review", start: at(28, 11, 17), end: at(28, 12) }), 11, 1);
    try {
      const b = far.step(0);
      expect(b?.text).not.toContain("Design review");
      expect(titles(b)).toEqual(["＋ Next step", "Nothing"]);
    } finally {
      far.brain.stop();
    }
  });

  it("opens the add field prefilled with the meeting's name", async () => {
    const r = await afterGreeting(meetings(TEAM), 11, 2);
    try {
      const openBoard = vi.fn();
      r.brain.effects = { openBoard };
      const b = r.step(0)!;
      r.brain.pickAction(b.id, 0);
      expect(openBoard).toHaveBeenCalledExactlyOnceWith(true, "Team sync: ");
    } finally {
      r.brain.stop();
    }
  });

  it("offers the resume card after the question, and after a short meeting right away", async () => {
    const r = await afterGreeting(meetings(TEAM), 9, 30);
    try {
      r.brain.onSample(r.sample(DOCS));
      // Team sync starts at 10:00 with Chrome in front: that's the place to come back to.
      r.clock.t = at(28, 10, 1);
      r.brain.runRules(r.clock.t);
      r.brain.onSample(r.sample({ app: { name: "Zoom", exe: "zoom.exe", title: "Team sync" }, url: null, appSwitchedAt: r.clock.t }));
      // The call runs over and then leaves the front: only then do the question and the card come.
      r.clock.t = at(28, 11, 1);
      const meanwhile = r.step(0); // some other reminder, perhaps, but neither of the follow-ups
      expect(meanwhile?.text ?? "").not.toMatch(/is over|Meeting's done/);
      if (meanwhile) r.brain.dismissBubble(meanwhile.id, "ignored");
      r.brain.onSample(r.sample({ ...DOCS, appSwitchedAt: r.clock.t }));
      let b = r.step(0)!;
      expect(b.text).toContain("is over");
      r.brain.pickAction(b.id, 1); // Nothing
      b = r.step(0)!;
      expect(b.text).toContain("Meeting's done");
      expect(b.text).toContain("Next up");
      expect(b.text).not.toContain("Zoom");
      expect(b.kind).toBeUndefined();
    } finally {
      r.brain.stop();
    }
    const quick = await afterGreeting(meetings({ uid: "q", title: "Stand-up", start: at(28, 10), end: at(28, 10, 10) }), 10, 5);
    try {
      quick.brain.onSample(quick.sample(DOCS));
      quick.brain.runRules(quick.clock.t); // the stand-up has started: Chrome is the place to come back to
      quick.brain.onSample(quick.sample({ app: { name: "Zoom", exe: "zoom.exe", title: "Stand-up" }, url: null, appSwitchedAt: quick.clock.t }));
      quick.clock.t += 6 * MIN;
      quick.brain.onSample(quick.sample({ ...DOCS, appSwitchedAt: quick.clock.t }));
      const b = quick.step(0);
      expect(b?.text).toContain("Meeting's done");
      expect(whole(b)).toContain("Google Chrome");
      expect(b?.text).not.toContain("Anything to capture");
    } finally {
      quick.brain.stop();
    }
  });
});

describe("Brain v0.4: if-then starts and the 2-minute starter", () => {
  const STANDUP = { uid: "standup", title: "Stand-up", start: at(28, 10), end: at(28, 10, 10) };
  const NO_MEETINGS = meetings();
  const sprint = (r: Rig) => r.brain.getSnapshot().day.today.find((t) => t.id === "4")!;
  const triggersOnDisk = async (r: Rig) => (await r.backend.storage.load<{ taskId: string; fired: boolean; trigger: { kind: string } }[]>("triggers")) ?? [];

  async function ready(setup: (b: DemoBackend) => void = NO_MEETINGS, h = 9, m = 1) {
    const r = await rig({ prefs: { bubbleGap: 0 }, setup });
    r.answer(r.step()!); // morning greeting
    r.clock.t = at(28, h, m);
    return r;
  }
  /** Steps on; any other reminder the pet makes is answered, so only a plan's bubble comes back. */
  const planBubble = (r: Rig, minutes = 1): Bubble | null => {
    const b = r.step(minutes);
    if (b && !b.text.startsWith("As planned")) {
      r.answer(b);
      return null;
    }
    return b;
  };

  it("fires 'after the meeting' once, with Focus now and Later, without spending the budget", async () => {
    const r = await ready(meetings(STANDUP), 10, 5);
    try {
      const eventId = r.brain.getSnapshot().events[0].id;
      r.brain.setStartTrigger(sprint(r), { kind: "afterMeeting", eventId, title: "Stand-up" });
      expect(r.step(0)).toBeNull(); // still in the meeting
      const left = r.brain.getSnapshot().nudgesLeft;
      const b = r.step(6);
      expect(b?.text).toBe("As planned: “Plan the next sprint”");
      expect(titles(b)).toEqual(["▶ Focus now", "Later"]);
      expect(b?.kind).toBeUndefined();
      expect(r.brain.getSnapshot().nudgesLeft).toBe(left);
      expect(r.brain.getSnapshot().triggers[0].fired).toBe(true);
      r.brain.dismissBubble(b!.id, "closed");
      // Spent: whatever else the pet says in the next while, it isn't the plan again.
      for (let i = 0; i < 4; i++) {
        const next = r.step(1);
        expect(next?.text ?? "").not.toContain("As planned");
        if (next) r.answer(next);
      }
    } finally {
      r.brain.stop();
    }
  });

  it("Focus now starts a session on that task; the plan is spent", async () => {
    const r = await ready(meetings(STANDUP), 10, 5);
    try {
      const eventId = r.brain.getSnapshot().events[0].id;
      r.brain.setStartTrigger(sprint(r), { kind: "afterMeeting", eventId, title: "Stand-up" });
      const b = r.step(6)!;
      r.brain.pickAction(b.id, 0);
      expect(r.brain.getSnapshot().focus?.task?.id).toBe("4");
      expect(r.brain.getSnapshot().focus?.minutes).toBe(25);
    } finally {
      r.brain.stop();
    }
  });

  it("fires 'when I open ⟨app⟩' once, as the app comes to the front", async () => {
    const r = await ready();
    try {
      r.brain.setStartTrigger(sprint(r), { kind: "appOpen", app: "figma" });
      expect(planBubble(r)).toBeNull();
      const left = r.brain.getSnapshot().nudgesLeft;
      r.brain.onSample(r.sample({ ...FIGMA, appSwitchedAt: r.clock.t }));
      const b = r.step(0);
      expect(b?.text).toBe("As planned: “Plan the next sprint”");
      expect(b?.kind).toBeUndefined();
      expect(r.brain.getSnapshot().nudgesLeft).toBe(left);
      r.brain.dismissBubble(b!.id, "closed");
      // Going away and coming back doesn't repeat it.
      r.backToWork();
      planBubble(r);
      r.brain.onSample(r.sample({ ...FIGMA, appSwitchedAt: r.clock.t }));
      expect(planBubble(r, 0)).toBeNull();
    } finally {
      r.brain.stop();
    }
  });

  it("waits for a pause in your typing, and for the zone to end, before an app trigger speaks", async () => {
    const r = await ready();
    try {
      r.brain.setStartTrigger(sprint(r), { kind: "appOpen", app: "figma" });
      // Figma came to the front a minute ago, after the plan was made.
      r.clock.t += 2 * MIN;
      r.brain.onSample(r.sample({ ...FIGMA, appSwitchedAt: r.clock.t - 60_000, secondsSinceKey: 2 }));
      expect(r.step(0)).toBeNull();
      r.brain.onSample(r.sample({ ...FIGMA, appSwitchedAt: r.clock.t - 60_000, secondsSinceKey: 20 }));
      expect(r.step(0)?.text).toContain("As planned");
    } finally {
      r.brain.stop();
    }
  });

  it("fires 'after lunch' at 13:00 and not a minute earlier", async () => {
    const r = await ready(NO_MEETINGS, 12, 58);
    try {
      r.brain.setStartTrigger(sprint(r), { kind: "afterLunch" });
      expect(planBubble(r)).toBeNull(); // 12:59
      const b = planBubble(r);
      expect(r.clock.t).toBe(at(28, 13));
      expect(b?.text).toBe("As planned: “Plan the next sprint”");
    } finally {
      r.brain.stop();
    }
  });

  it("is quiet about a task that is already done, and doesn't ask twice", async () => {
    const r = await ready();
    try {
      r.brain.setStartTrigger(sprint(r), { kind: "appOpen", app: "figma" });
      await r.brain.complete(sprint(r));
      await vi.waitFor(() => expect(r.brain.getSnapshot().loading).toBe(false));
      r.brain.dismissBubble(r.brain.getSnapshot().bubble?.id ?? -1, "closed");
      r.clock.t += MIN;
      r.brain.onSample(r.sample({ ...FIGMA, appSwitchedAt: r.clock.t }));
      expect(planBubble(r)).toBeNull();
      expect(r.brain.getSnapshot().triggers[0].fired).toBe(true);
    } finally {
      r.brain.stop();
    }
  });

  it("keeps one plan per task, replaces it, and clears it", async () => {
    const r = await ready();
    try {
      r.brain.setStartTrigger(sprint(r), { kind: "afterLunch" });
      r.brain.setStartTrigger(sprint(r), { kind: "appOpen", app: "  Figma  " });
      expect(r.brain.getSnapshot().triggers.map((t) => t.trigger)).toEqual([{ kind: "appOpen", app: "Figma" }]);
      // The diary is on disk: it says what kind of plan, never which app.
      expect(r.diaryTexts().some((t) => t.includes("Start plan for") && t.includes("when an app opens"))).toBe(true);
      expect(r.diaryTexts().some((t) => t.includes("Figma"))).toBe(false);
      r.brain.clearStartTrigger(sprint(r));
      expect(r.brain.getSnapshot().triggers).toEqual([]);
      expect(await triggersOnDisk(r)).toEqual([]);
      // An app name with nothing in it is no plan.
      r.brain.setStartTrigger(sprint(r), { kind: "appOpen", app: "   " });
      expect(r.brain.getSnapshot().triggers).toEqual([]);
    } finally {
      r.brain.stop();
    }
  });

  it("offers today's meetings, recent apps that aren't distractions, and after lunch before 13:00", async () => {
    const r = await ready(meetings(STANDUP));
    try {
      r.brain.onSample(r.sample({ ...FIGMA, appSwitchedAt: r.clock.t }));
      r.brain.onSample(r.sample({ ...YOUTUBE, appSwitchedAt: r.clock.t }));
      r.brain.onSample(r.sample({ app: { name: "TodoPet", exe: "todopet.exe", title: "TodoPet" }, appSwitchedAt: r.clock.t }));
      r.backToWork();
      const kinds = r.brain.startTriggerChoices().map((c) => (c.kind === "appOpen" ? `app:${c.app}` : c.kind));
      // Visual Studio Code is in front (backToWork), so it isn't offered.
      expect(kinds).toEqual(["afterMeeting", "app:Figma", "afterLunch"]);
      r.clock.t = at(28, 13, 5);
      // The meeting is over and lunch has come: only an app is left.
      expect(r.brain.startTriggerChoices().map((c) => c.kind)).toEqual(["appOpen"]);
    } finally {
      r.brain.stop();
    }
  });

  it("saves plans, so a restart keeps them and doesn't fire a spent one again", async () => {
    const r = await ready();
    let again: Brain | null = null;
    try {
      r.brain.setStartTrigger(sprint(r), { kind: "appOpen", app: "figma" });
      expect(await triggersOnDisk(r)).toMatchObject([{ taskId: "4", fired: false, trigger: { kind: "appOpen" } }]);
      r.brain.stop();
      again = await r.boot();
      expect(again.getSnapshot().triggers).toMatchObject([{ taskId: "4", fired: false }]);
      r.clock.t += MIN;
      again.onSample(r.sample({ ...FIGMA, appSwitchedAt: r.clock.t }));
      const step = stepWith(again, r.clock);
      const b = step(1);
      expect(b?.text).toBe("As planned: “Plan the next sprint”");
      expect(await triggersOnDisk(r)).toMatchObject([{ taskId: "4", fired: true }]);
      again.stop();
      again = await r.boot();
      expect(again.getSnapshot().triggers).toMatchObject([{ fired: true }]);
      again.onSample(r.sample({ ...FIGMA, appSwitchedAt: r.clock.t }));
      expect(stepWith(again, r.clock)(1)?.text ?? "").not.toContain("As planned");
    } finally {
      r.brain.stop();
      again?.stop();
    }
  });

  it("drops yesterday's plans when it starts and at the day change", async () => {
    const r = await rig({
      setup: (b) => {
        void b.storage.save("triggers", [
          { taskId: "4", day: "2026-10-27", trigger: { kind: "afterLunch" }, fired: false },
          { taskId: "1", day: "2026-10-28", trigger: { kind: "afterLunch" }, fired: false },
        ]);
      },
    });
    try {
      expect(r.brain.getSnapshot().triggers.map((t) => t.taskId)).toEqual(["1"]);
      r.clock.t = at(29, 9);
      r.brain.tick();
      expect(r.brain.getSnapshot().triggers).toEqual([]);
      await vi.waitFor(async () => expect(await triggersOnDisk(r)).toEqual([]));
    } finally {
      r.brain.stop();
    }
  });

  it("starts a 2-minute focus on the task, and at the end offers a full session or 'that's enough'", async () => {
    const r = await ready();
    try {
      const task = sprint(r);
      r.brain.startTwoMinutes(task);
      let s = r.brain.getSnapshot();
      expect(s.focus).toMatchObject({ minutes: 2, isBreak: false, starter: true });
      expect(s.focus?.task?.id).toBe("4");
      expect(s.bubble?.text).toContain("2 minutes");
      r.clock.t += 2 * MIN + 1000;
      r.brain.tick();
      s = r.brain.getSnapshot();
      expect(s.focus).toBeNull();
      expect(s.bubble?.text).toContain("“Plan the next sprint”");
      expect(titles(s.bubble)).toEqual(["✓ Done", "▶ Focus 25'", "That's enough"]);
      expect(s.bubble?.kind).toBeUndefined();
      r.brain.pickAction(s.bubble!.id, 1);
      expect(r.brain.getSnapshot().focus).toMatchObject({ minutes: 25, task: { id: "4" } });
      expect(r.brain.getSnapshot().focus?.starter).toBeFalsy();
    } finally {
      r.brain.stop();
    }
  });

  it("'That's enough' ends it kindly with no new session", async () => {
    const r = await ready();
    try {
      r.brain.startTwoMinutes(sprint(r));
      r.clock.t += 2 * MIN + 1000;
      r.brain.tick();
      r.brain.pickAction(r.brain.getSnapshot().bubble!.id, 2);
      const s = r.brain.getSnapshot();
      expect(s.focus).toBeNull();
      expect(s.bubble?.text).toMatch(/start/i);
      expect(s.bubble?.actions).toEqual([]);
    } finally {
      r.brain.stop();
    }
  });

  it("lets the demo show each feature at once", async () => {
    const r = await rig({ prefs: { bubbleGap: 0 } });
    try {
      r.answer(r.step()!); // morning greeting
      r.brain.demoComeBack();
      expect(r.brain.getSnapshot().bubble?.text).toContain("Next up: “Write the weekly report”");
      r.brain.dismissBubble(r.brain.getSnapshot().bubble!.id, "closed");
      r.brain.demoMeetingSoon();
      expect(r.brain.getSnapshot().bubble?.text).toContain("Related: “Call client ABC”");
      r.brain.pickAction(r.brain.getSnapshot().bubble!.id, 0);
      r.brain.demoMeetingEnds();
      expect(r.brain.getSnapshot().bubble?.text).toContain("“Q4 planning” is over");
      // (The meeting from the demo before is 4 minutes away, so the breather is cut to 4.)
      expect(titles(r.brain.getSnapshot().bubble)).toContain("☕ 4-min breather");
    } finally {
      r.brain.stop();
    }
  });

  it("offers Try 2 minutes on the postponed-task bubble", async () => {
    const r = await rig({ prefs: { bubbleGap: 0 } });
    try {
      r.answer(r.step()!); // morning greeting
      const b = r.step();
      expect(b?.kind).toBe("stuck");
      expect(titles(b)).toEqual(["✂️ Split it", "▶ Try 2 minutes", "Drop from plan", "Later"]);
      r.brain.pickAction(b!.id, 1);
      expect(r.brain.getSnapshot().focus).toMatchObject({ minutes: 2, starter: true, task: { id: "3" } });
    } finally {
      r.brain.stop();
    }
  });
});

// ---------- v0.4 part A, after review ----------

const ZOOM = { app: { name: "Zoom", exe: "zoom.exe", title: "Zoom Meeting" }, url: null };
const MEET = { app: { name: "Google Chrome", exe: "chrome.exe", title: "Meet - Google Chrome" }, url: "https://meet.google.com/abc-defg-hij" };
const NOTEPAD = { app: { name: "Notepad", exe: "notepad.exe", title: "todo.txt - Notepad" }, url: null };
const REDDIT = { app: { name: "Google Chrome", exe: "chrome.exe", title: "r/aww - Google Chrome" }, url: "https://www.reddit.com/r/aww" };

/** Puts `x` in front as of right now (it just came to the front). */
const front = (r: Rig, x: Partial<SystemSample>) => r.brain.onSample(r.sample({ appSwitchedAt: r.clock.t, ...x }));
/** Moves the clock to `t` and runs the rules like the heartbeat does. */
const tickTo = (r: Rig, t: number): Bubble | null => {
  r.clock.t = t;
  r.brain.recompute();
  r.brain.runRules(t);
  return r.brain.getSnapshot().bubble;
};
/** After the morning greeting, with the clock at h:m, Chrome in front and the budget of reminders at 0, so only check-ins and cards speak. */
async function quietRig(setup: (b: DemoBackend) => void, h: number, m: number, opts: Parameters<typeof rig>[0] = {}) {
  const r = await rig({ ...opts, prefs: { bubbleGap: 0, nudgeBudget: 0, ...opts.prefs }, setup });
  r.answer(r.step()!); // morning greeting
  front(r, DOCS);
  r.clock.t = at(28, h, m);
  return r;
}
const diaryOnDisk = async (b: DemoBackend, day = "2026-10-28") => (await b.diary.read(day)).map((l) => JSON.parse(l).text as string);
const triggersStored = async (r: Rig) => (await r.backend.storage.load<{ taskId: string; trigger: { kind: string; eventId?: string; title?: string }; fired: boolean; notBefore: number | null }[]>("triggers")) ?? [];
const sprintOf = (r: Rig) => r.brain.getSnapshot().day.today.find((t) => t.id === "4")!;

describe("Brain v0.4 review: the meeting's follow-ups wait for the call and a sign you were there", () => {
  const TEAM = { uid: "team", title: "Team sync", start: at(28, 10), end: at(28, 11) };

  it("holds the question and the card while the call is in front, and counts their 10 minutes from when it leaves", async () => {
    const r = await quietRig(meetings(TEAM), 9, 30);
    try {
      tickTo(r, at(28, 10, 1)); // it started with Chrome in front: that's the place to come back to
      front(r, ZOOM);
      expect(tickTo(r, at(28, 11, 5))).toBeNull(); // over on the calendar, still on the call
      expect(tickTo(r, at(28, 11, 40))).toBeNull();
      r.clock.t = at(28, 11, 41);
      front(r, DOCS); // the call has left the front
      const b = tickTo(r, at(28, 11, 41))!;
      expect(b.text).toContain("“Team sync” is over");
      r.brain.pickAction(b.id, 1); // Nothing
      const card = tickTo(r, at(28, 11, 42));
      expect(card?.text).toContain("Meeting's done");
      expect(card?.text).not.toContain("Zoom");
    } finally {
      r.brain.stop();
    }
  });

  it("drops them 10 minutes after the call left, not after the calendar's end", async () => {
    const r = await quietRig(meetings(TEAM), 9, 30);
    try {
      tickTo(r, at(28, 10, 1));
      front(r, ZOOM);
      expect(tickTo(r, at(28, 11, 40))).toBeNull();
      r.clock.t = at(28, 11, 41);
      front(r, DOCS);
      expect(tickTo(r, at(28, 11, 52))?.text ?? "").not.toMatch(/is over|Meeting's done/);
    } finally {
      r.brain.stop();
    }
  });

  it("offers neither when nothing says you were there: you kept working in the same window", async () => {
    const r = await quietRig(meetings(TEAM), 9, 30);
    try {
      tickTo(r, at(28, 10, 1));
      for (let t = at(28, 10, 5); t < at(28, 11); t += 10 * MIN) {
        r.clock.t = t;
        front(r, { ...DOCS, secondsSinceKey: 30, appSwitchedAt: at(28, 9) });
      }
      const b = tickTo(r, at(28, 11, 1));
      expect(b?.text ?? "").not.toMatch(/is over|Meeting's done/);
      expect(tickTo(r, at(28, 11, 2))?.text ?? "").not.toMatch(/is over|Meeting's done/);
    } finally {
      r.brain.stop();
    }
  });

  it.each([
    ["a call app was in front", (r: Rig) => front(r, ZOOM)],
    ["a call tab was in front", (r: Rig) => front(r, MEET)],
    ["you were idle for 2 minutes", (r: Rig) => front(r, { ...DOCS, idleSeconds: 150 })],
    ["another app than before the meeting was in front", (r: Rig) => front(r, NOTEPAD)],
  ])("offers both when there is a sign you were there: %s", async (_sign, sign) => {
    const r = await quietRig(meetings(TEAM), 9, 30);
    try {
      tickTo(r, at(28, 10, 1));
      r.clock.t = at(28, 10, 20);
      sign(r);
      r.clock.t = at(28, 11, 1);
      front(r, DOCS);
      const b = tickTo(r, at(28, 11, 1))!;
      expect(b.text).toContain("is over");
      r.brain.pickAction(b.id, 1);
      expect(tickTo(r, at(28, 11, 2))?.text).toContain("Meeting's done");
    } finally {
      r.brain.stop();
    }
  });

  it("doesn't take a distraction in the meeting's time for a sign that you were there", async () => {
    const r = await quietRig(meetings(TEAM), 9, 30);
    try {
      tickTo(r, at(28, 10, 1));
      r.clock.t = at(28, 10, 20);
      front(r, YOUTUBE);
      r.clock.t = at(28, 11, 1);
      front(r, DOCS);
      expect(tickTo(r, at(28, 11, 1))?.text ?? "").not.toContain("is over");
    } finally {
      r.brain.stop();
    }
  });

  it("never shows the resume card with a call in front, and keeps it until its 10 minutes run out", async () => {
    const r = await quietRig(meetings(), 9, 30);
    try {
      front(r, { ...DOCS, idleSeconds: 310 });
      r.brain.runRules(r.clock.t);
      const back = r.clock.t + 6 * MIN;
      r.clock.t = back;
      front(r, { ...MEET, idleSeconds: 0 }); // back, with a screen share in front
      expect(tickTo(r, back + MIN)).toBeNull();
      expect(tickTo(r, back + 3 * MIN)).toBeNull();
      r.clock.t = back + 4 * MIN;
      front(r, DOCS);
      expect(tickTo(r, back + 4 * MIN)?.text).toContain("Welcome back!");
    } finally {
      r.brain.stop();
    }
    const late = await quietRig(meetings(), 9, 30);
    try {
      front(late, { ...DOCS, idleSeconds: 310 });
      late.brain.runRules(late.clock.t);
      const back = late.clock.t + 6 * MIN;
      late.clock.t = back;
      front(late, { ...ZOOM, idleSeconds: 0 });
      expect(tickTo(late, back + MIN)).toBeNull();
      expect(tickTo(late, back + 11 * MIN)).toBeNull();
      late.clock.t = back + 12 * MIN;
      front(late, DOCS);
      expect(tickTo(late, back + 12 * MIN)?.text ?? "").not.toContain("Welcome back");
    } finally {
      late.brain.stop();
    }
  });

  it("holds a short meeting's card the same way", async () => {
    const r = await quietRig(meetings({ uid: "q", title: "Stand-up", start: at(28, 10), end: at(28, 10, 10) }), 10, 5);
    try {
      tickTo(r, at(28, 10, 5));
      front(r, ZOOM);
      expect(tickTo(r, at(28, 10, 12))).toBeNull();
      r.clock.t = at(28, 10, 14);
      front(r, DOCS);
      expect(tickTo(r, at(28, 10, 14))?.text).toContain("Meeting's done");
    } finally {
      r.brain.stop();
    }
  });
});

describe("Brain v0.4 review: pacing the cards", () => {
  /** A detour of 3 minutes on YouTube, then back to the docs; returns what the return brings. */
  const detour = (r: Rig): Bubble | null => {
    front(r, YOUTUBE);
    r.clock.t += 3 * MIN;
    front(r, YOUTUBE);
    front(r, DOCS);
    front(r, DOCS);
    return tickTo(r, r.clock.t);
  };

  it("lets a resume card come at most every 30 minutes", async () => {
    const r = await quietRig(meetings(), 9, 30);
    try {
      const first = detour(r)!;
      expect(first.text).toContain("No rush");
      const shownAt = r.clock.t;
      r.brain.pickAction(first.id, first.actions.length - 1); // Something else: a real answer
      r.clock.t += 5 * MIN;
      expect(detour(r)).toBeNull();
      r.clock.t = shownAt + 31 * MIN;
      expect(detour(r)?.text).toContain("No rush");
    } finally {
      r.brain.stop();
    }
  });

  it("counts a closed or ignored resume card as a refusal, and stops offering after 2 in a day", async () => {
    const r = await quietRig(meetings(), 9, 30);
    try {
      r.brain.dismissBubble(detour(r)!.id, "closed");
      expect(r.brain.getSnapshot().life.dismissedInRow).toBe(1);
      r.clock.t += 31 * MIN;
      const second = detour(r)!;
      r.brain.dismissBubble(second.id, "ignored");
      expect(r.brain.getSnapshot().life.dismissedInRow).toBe(2);
      r.clock.t += 31 * MIN;
      expect(detour(r)).toBeNull();
      r.clock.t += 31 * MIN;
      expect(detour(r)).toBeNull();
    } finally {
      r.brain.stop();
    }
  });

  it("doesn't count an answer, or a card that expired unseen, as a refusal", async () => {
    const r = await quietRig(meetings(), 9, 30);
    try {
      const b = detour(r)!;
      r.brain.dismissBubble(b.id, "expired");
      expect(r.brain.getSnapshot().life.dismissedInRow).toBe(0);
      r.clock.t += 31 * MIN;
      r.brain.pickAction(detour(r)!.id, 1); // Focus
      expect(r.brain.getSnapshot().life.dismissedInRow).toBe(0);
    } finally {
      r.brain.stop();
    }
  });

  it("stops asking about a meeting after 2 refusals in a day", async () => {
    const M = (n: number, h: number) => ({ uid: `m${n}`, title: `Sync ${n}`, start: at(28, h), end: at(28, h, 30) });
    const r = await quietRig(meetings(M(1, 10), M(2, 11), M(3, 12)), 9, 30);
    try {
      const results: (string | null)[] = [];
      for (const h of [10, 11, 12]) {
        tickTo(r, at(28, h, 1));
        r.clock.t = at(28, h, 10);
        front(r, { ...DOCS, idleSeconds: 150 });
        r.clock.t = at(28, h, 31);
        front(r, DOCS);
        const b = tickTo(r, at(28, h, 31));
        results.push(b?.text.includes("is over") ? b.text : null);
        if (b) r.brain.dismissBubble(b.id, "closed");
      }
      expect(results[0]).toContain("Sync 1");
      expect(results[1]).toContain("Sync 2");
      expect(results[2]).toBeNull();
    } finally {
      r.brain.stop();
    }
  });

  it("holds the card and the question while reminders are held, but not a plan you made", async () => {
    const TEAM = { uid: "team", title: "Team sync", start: at(28, 10), end: at(28, 11) };
    const r = await quietRig(meetings(TEAM), 9, 30, { life: { nudgeHoldUntil: at(28, 15) } });
    try {
      tickTo(r, at(28, 10, 1));
      r.clock.t = at(28, 10, 20);
      front(r, { ...DOCS, idleSeconds: 150 });
      r.clock.t = at(28, 11, 1);
      front(r, DOCS);
      expect(tickTo(r, at(28, 11, 1))?.text ?? "").not.toMatch(/is over|Meeting's done/);
      expect(r.diaryTexts("hold").some((t) => t.includes("Held"))).toBe(true);
      // The detour's card waits too.
      expect(detourCard(r)).toBeNull();
      // A plan you set yourself does not.
      r.brain.setStartTrigger(sprintOf(r), { kind: "afterLunch" });
      expect(tickTo(r, at(28, 13))?.text).toBe("As planned: “Plan the next sprint”");
    } finally {
      r.brain.stop();
    }
  });
});

function detourCard(r: Rig): Bubble | null {
  front(r, YOUTUBE);
  r.clock.t += 3 * MIN;
  front(r, YOUTUBE);
  front(r, DOCS);
  front(r, DOCS);
  return tickTo(r, r.clock.t);
}

describe("Brain v0.4 review: start-when plans", () => {
  it("doesn't offer the app in front, and an app plan waits for it to go away and come back", async () => {
    const r = await quietRig(meetings(), 9, 30);
    try {
      front(r, FIGMA);
      const names = () => r.brain.startTriggerChoices().flatMap((c) => (c.kind === "appOpen" ? [c.app] : []));
      expect(names()).not.toContain("Figma");
      expect(names()).toContain("Google Chrome");
      r.brain.setStartTrigger(sprintOf(r), { kind: "appOpen", app: "Figma" });
      expect(tickTo(r, r.clock.t + MIN)).toBeNull();
      r.clock.t += 2 * MIN;
      front(r, DOCS);
      expect(tickTo(r, r.clock.t + MIN)).toBeNull();
      r.clock.t += MIN;
      front(r, FIGMA);
      expect(tickTo(r, r.clock.t)?.text).toBe("As planned: “Plan the next sprint”");
    } finally {
      r.brain.stop();
    }
  });

  it("refuses a typed app name under 3 characters and keeps the exe of a recent app", async () => {
    const r = await quietRig(meetings(), 9, 30);
    try {
      expect(r.brain.setStartTrigger(sprintOf(r), { kind: "appOpen", app: "ab" })).toBe(false);
      front(r, FIGMA);
      front(r, DOCS);
      const choice = r.brain.startTriggerChoices().find((c) => c.kind === "appOpen" && c.app === "Figma");
      expect(choice).toEqual({ kind: "appOpen", app: "Figma", exe: "figma.exe" });
      expect(r.brain.setStartTrigger(sprintOf(r), choice!)).toBe(true);
      expect((await triggersStored(r))[0].trigger).toMatchObject({ kind: "appOpen", exe: "figma.exe" });
    } finally {
      r.brain.stop();
    }
  });

  it("re-arms the plan for 30 minutes when you tap Later on 'As planned', and does not drop it", async () => {
    const r = await quietRig(meetings(), 12, 58);
    try {
      r.brain.setStartTrigger(sprintOf(r), { kind: "afterLunch" });
      const b = tickTo(r, at(28, 13))!;
      expect(b.text).toBe("As planned: “Plan the next sprint”");
      r.brain.pickAction(b.id, 1); // Later
      expect(r.brain.getSnapshot().triggers[0]).toMatchObject({ fired: false, notBefore: at(28, 13, 30) });
      expect(tickTo(r, at(28, 13, 29))).toBeNull();
      expect(tickTo(r, at(28, 13, 30))?.text).toBe("As planned: “Plan the next sprint”");
      expect(r.brain.getSnapshot().triggers[0].fired).toBe(true);
      expect(await triggersStored(r)).toMatchObject([{ fired: true }]);
    } finally {
      r.brain.stop();
    }
  });

  it("isn't spent while the task's completion is in flight, and fires if the close fails", async () => {
    const r = await quietRig(meetings(), 12, 58);
    try {
      let fail!: (e: unknown) => void;
      r.backend.todoist.close = () => new Promise<void>((_, reject) => (fail = reject));
      r.brain.setStartTrigger(sprintOf(r), { kind: "afterLunch" });
      const done = r.brain.complete(sprintOf(r));
      expect(tickTo(r, at(28, 13))?.text ?? "").not.toContain("As planned");
      expect(r.brain.getSnapshot().triggers[0].fired).toBe(false);
      fail(new BackendError({ kind: "network", message: "offline" }));
      await done;
      r.brain.dismissBubble(r.brain.getSnapshot().bubble?.id ?? -1, "closed");
      await vi.waitFor(() => expect(r.brain.getSnapshot().loading).toBe(false));
      expect(tickTo(r, at(28, 13, 1))?.text).toBe("As planned: “Plan the next sprint”");
    } finally {
      r.brain.stop();
    }
  });

  it("drops a plan whose meeting moved or was cancelled when the calendar syncs, with a diary line, but not when the sync fails", async () => {
    const STAND = { uid: "stand", title: "Stand-up", start: at(28, 10), end: at(28, 10, 10) };
    const r = await quietRig(meetings(STAND), 9, 30);
    try {
      await r.brain.refreshCalendar(true);
      const eventId = r.brain.getSnapshot().events[0].id;
      r.brain.setStartTrigger(sprintOf(r), { kind: "afterMeeting", eventId, title: "Stand-up" });
      // A failed fetch says nothing about the meeting.
      r.backend.calendar.fetchIcs = async () => [{ host: "demo.todopet", ok: false, error: "offline" }];
      await r.brain.refreshCalendar(true);
      expect(r.brain.getSnapshot().triggers).toHaveLength(1);
      // The meeting moved to 11:00: the plan can't come true any more.
      r.backend.calendar.fetchIcs = async () => [{ host: "demo.todopet", ok: true, text: icsOf({ ...STAND, start: at(28, 11), end: at(28, 11, 10) }) }];
      await r.brain.refreshCalendar(true);
      expect(r.brain.getSnapshot().triggers).toEqual([]);
      expect(await triggersStored(r)).toEqual([]);
      expect(r.diaryTexts("system").some((t) => t.includes("plan dropped: meeting moved"))).toBe(true);
      expect(r.diaryTexts().join("\n")).not.toContain("Stand-up");
    } finally {
      r.brain.stop();
    }
  });

  it("stores a short hash for a very long event id, and the plan still fires after the meeting", async () => {
    const uid = "u".repeat(230);
    const LONG = { uid, title: "Planning", start: at(28, 10), end: at(28, 10, 20) };
    const r = await quietRig(meetings(LONG), 9, 30);
    try {
      await r.brain.refreshCalendar(true);
      const choice = r.brain.startTriggerChoices().find((c) => c.kind === "afterMeeting")!;
      expect(choice.kind === "afterMeeting" && choice.eventId.length).toBeLessThanOrEqual(24);
      r.brain.setStartTrigger(sprintOf(r), choice);
      expect((await triggersStored(r))[0].trigger.eventId!.length).toBeLessThanOrEqual(24);
      tickTo(r, at(28, 10, 5));
      expect(tickTo(r, at(28, 10, 21))?.text).toBe("As planned: “Plan the next sprint”");
    } finally {
      r.brain.stop();
    }
  });

  it("writes only generic words about plans in the diary, and keeps event ids out of the day's gates", async () => {
    const TEAM = { uid: "team-secret-id", title: "Secret merger", start: at(28, 10), end: at(28, 11) };
    const r = await quietRig(meetings(TEAM), 9, 30);
    try {
      await r.brain.refreshCalendar(true);
      const eventId = r.brain.getSnapshot().events[0].id;
      r.brain.setStartTrigger(sprintOf(r), { kind: "afterMeeting", eventId, title: "Secret merger" });
      r.brain.setStartTrigger(sprintOf(r), { kind: "appOpen", app: "Figma" });
      r.brain.setStartTrigger(sprintOf(r), { kind: "afterMeeting", eventId, title: "Secret merger" });
      tickTo(r, at(28, 10, 1));
      r.clock.t = at(28, 10, 20);
      front(r, { ...DOCS, idleSeconds: 150 });
      r.clock.t = at(28, 11, 1);
      front(r, DOCS);
      expect(tickTo(r, at(28, 11, 1))?.text).toContain("is over"); // the question comes before the plan
      r.brain.dismissBubble(r.brain.getSnapshot().bubble!.id, "closed");
      expect(tickTo(r, at(28, 11, 2))?.text).toContain("As planned");
      const text = r.diaryTexts().join("\n");
      expect(text).not.toContain("Figma");
      const planLines = r.diaryTexts().filter((t) => /plan/i.test(t)).join("\n");
      expect(planLines).toContain("Start plan for");
      expect(planLines).toContain("because your plan: after a meeting");
      expect(planLines).not.toContain("Secret merger");
      const gates = Object.keys(r.brain.getSnapshot().life.dayFired).filter((k) => k.startsWith("aftermeeting-"));
      expect(gates).toHaveLength(1);
      expect(gates[0]).not.toContain("team-secret-id");
    } finally {
      r.brain.stop();
    }
  });
});

describe("Brain v0.4 review: where the pet looks", () => {
  it("doesn't end a distraction on a sample whose address couldn't be read, nor take that page for the place", async () => {
    const r = await quietRig(meetings(), 9, 30);
    try {
      front(r, REDDIT);
      r.clock.t += 3 * MIN;
      front(r, REDDIT);
      front(r, { app: REDDIT.app, url: null }); // the address isn't there for a second; the title doesn't say Reddit
      expect(tickTo(r, r.clock.t)?.text ?? "").not.toContain("You were");
      front(r, REDDIT);
      r.clock.t += 3 * MIN;
      front(r, REDDIT);
      front(r, DOCS);
      front(r, DOCS);
      const card = tickTo(r, r.clock.t);
      expect(whole(card)).toContain("Google Chrome — Spec");
      expect(whole(card)).not.toContain("r/aww");
    } finally {
      r.brain.stop();
    }
  });

  it("needs 2 samples in a row away from a distraction to end it", async () => {
    const r = await quietRig(meetings(), 9, 30);
    try {
      front(r, YOUTUBE);
      r.clock.t += 3 * MIN;
      front(r, YOUTUBE);
      front(r, DOCS); // one blip
      expect(tickTo(r, r.clock.t)?.text ?? "").not.toContain("No rush");
      front(r, YOUTUBE);
      front(r, DOCS);
      front(r, DOCS);
      expect(tickTo(r, r.clock.t)?.text).toContain("No rush");
    } finally {
      r.brain.stop();
    }
  });

  it("keeps the last readable page as the place while the address is unreadable, but believes a title that stays that way", async () => {
    const SECRET = { app: { name: "Google Chrome", exe: "chrome.exe", title: "Secret plans - Google Chrome" }, url: null };
    const r = await quietRig(meetings(), 9, 30);
    try {
      expect(whole(awayAndBack(r, SECRET, 6))).toContain("Spec");
    } finally {
      r.brain.stop();
    }
    const stuck = await quietRig(meetings(), 9, 30);
    try {
      for (let i = 0; i < 6; i++) front(stuck, SECRET);
      expect(whole(awayAndBack(stuck, SECRET, 6))).toContain("Secret plans");
    } finally {
      stuck.brain.stop();
    }
  });

  it("never takes a call for the place, even when the pet starts with one in front", async () => {
    const clock = { t: at(28, 9) };
    const backend = createDemoBackend({ now: () => clock.t, persist: false });
    const brain = await Brain.create(backend, { demo: true, now: () => clock.t, random: () => 0.5 });
    setLang("en");
    await brain.start();
    try {
      brain.dismissBubble(brain.getSnapshot().bubble?.id ?? -1, "closed");
      const call = (patch: Partial<SystemSample>): SystemSample => ({ ...ZOOM, idleSeconds: 0, secondsSinceKey: 999, fullscreen: false, appSwitchedAt: clock.t, ...patch });
      brain.onSample(call({}));
      brain.onSample(call({ idleSeconds: 310 }));
      brain.runRules(clock.t);
      clock.t += 6 * MIN;
      brain.onSample(call({ idleSeconds: 0 }));
      brain.onSample(front2(clock, DOCS));
      brain.recompute();
      brain.runRules(clock.t);
      const text = brain.getSnapshot().bubble?.text ?? "";
      expect(text).toContain("Next up: “Write the weekly report”");
      expect(text).not.toContain("Zoom");
    } finally {
      brain.stop();
    }
  });

  it("keeps only the app name of a private window, and the task", async () => {
    const r = await quietRig(meetings(), 9, 30);
    try {
      const secret = { app: { name: "Google Chrome", exe: "chrome.exe", title: "Payroll (InPrivate) - Microsoft Edge" }, url: "https://hr.example.com/payroll" };
      const b = awayAndBack(r, secret, 6)!;
      expect(whole(b)).toContain("Google Chrome");
      expect(whole(b)).not.toMatch(/Payroll|hr\.example/);
      expect(titles(b)).toEqual(["▶ Focus 25'", "Something else"]);
    } finally {
      r.brain.stop();
    }
  });

  it("shows only the task and the app when 'resumeDetails' is off", async () => {
    const r = await quietRig(meetings(), 9, 30, { prefs: { resumeDetails: false } });
    try {
      const b = awayAndBack(r, DOCS, 6)!;
      expect(whole(b)).toContain("Google Chrome");
      expect(whole(b)).not.toMatch(/Spec|docs\.example/);
      expect(titles(b)).toEqual(["▶ Focus 25'", "Something else"]);
    } finally {
      r.brain.stop();
    }
  });

  it("says the task is only the next one when it is, and 'you were on' when it is one you acted on", async () => {
    const r = await quietRig(meetings(), 9, 30);
    try {
      const first = awayAndBack(r, DOCS, 6)!;
      expect(first.text).toContain("Next up: “Write the weekly report”");
      expect(first.detail).toBe("Last in: Google Chrome — Spec");
      r.brain.pickAction(first.id, 2);
      await r.brain.reschedule(sprintOf(r), "today");
      r.clock.t += 31 * MIN;
      const again = awayAndBack(r, DOCS, 6);
      expect(again?.text).toContain("You were on: “Plan the next sprint”");
      expect(again?.detail).toBe("Last in: Google Chrome — Spec");
    } finally {
      r.brain.stop();
    }
  });

  it("labels Reopen with the host and says so kindly when the page can't be opened", async () => {
    const r = await quietRig(meetings(), 9, 30);
    try {
      vi.spyOn(r.backend.system, "openUrl").mockRejectedValue(new Error("refused"));
      const b = awayAndBack(r, DOCS, 6)!;
      expect(b.actions[0].title).toBe("Reopen ↗ docs.example.com");
      r.brain.pickAction(b.id, 0);
      await vi.waitFor(() => expect(r.brain.getSnapshot().bubble?.text).toContain("Couldn't reopen that page"));
    } finally {
      r.brain.stop();
    }
  });

  it("leaves secret-looking parameters out of what Reopen opens", async () => {
    const r = await quietRig(meetings(), 9, 30);
    try {
      const open = vi.spyOn(r.backend.system, "openUrl").mockResolvedValue();
      const b = awayAndBack(r, { ...DOCS, url: "https://docs.example.com/spec?id=7&token=abc&code=1#x" }, 6)!;
      r.brain.pickAction(b.id, 0);
      expect(open).toHaveBeenCalledExactlyOnceWith("https://docs.example.com/spec?id=7");
    } finally {
      r.brain.stop();
    }
  });
});

const front2 = (clock: { t: number }, x: Partial<SystemSample>): SystemSample => ({
  app: null,
  url: null,
  idleSeconds: 0,
  secondsSinceKey: 999,
  fullscreen: false,
  appSwitchedAt: clock.t,
  ...x,
});

describe("Brain v0.4 review: coming back and the focus", () => {
  it("settles a return that happened during a meeting then, not at its end", async () => {
    const r = await quietRig(meetings({ uid: "m", title: "Planning", start: at(28, 10), end: at(28, 11) }), 9, 40);
    try {
      front(r, { ...DOCS, idleSeconds: 310 });
      r.brain.runRules(r.clock.t);
      r.clock.t = at(28, 10, 5);
      front(r, { ...ZOOM, idleSeconds: 0 });
      tickTo(r, at(28, 10, 5));
      const came = r.diaryTexts("system").filter((t) => t.includes("You came back after"));
      expect(came).toHaveLength(1);
      expect(came[0]).toContain("after 30 minutes");
      r.clock.t = at(28, 11, 1);
      front(r, DOCS);
      const q = tickTo(r, at(28, 11, 1))!;
      expect(q.text).toContain("is over");
      r.brain.pickAction(q.id, 1);
      const card = tickTo(r, at(28, 11, 2))!;
      expect(card.text).toContain("Meeting's done");
      expect(card.text).not.toContain("Welcome back");
      expect(r.diaryTexts("system").filter((t) => t.includes("You came back after"))).toHaveLength(1);
    } finally {
      r.brain.stop();
    }
  });

  it("forgets a return when you start a focus session before the next heartbeat, so no stale card comes later", async () => {
    const r = await quietRig(meetings(), 9, 30);
    try {
      front(r, { ...DOCS, idleSeconds: 310 });
      r.brain.runRules(r.clock.t);
      r.clock.t += 6 * MIN;
      front(r, DOCS);
      r.brain.startFocus(r.brain.getSnapshot().next!, 25);
      r.brain.dismissBubble(r.brain.getSnapshot().bubble!.id, "closed");
      r.clock.t += 26 * MIN;
      front(r, DOCS);
      r.brain.tick();
      r.brain.dismissBubble(r.brain.getSnapshot().bubble!.id, "closed");
      await vi.waitFor(() => expect(r.brain.getSnapshot().loading).toBe(false));
      r.clock.t += 6 * MIN;
      r.brain.tick();
      expect(r.brain.getSnapshot().bubble?.text ?? "").not.toMatch(/Welcome back|Next up|You were/);
      expect(r.diaryTexts("system").some((t) => t.includes("You came back after"))).toBe(false);
    } finally {
      r.brain.stop();
    }
  });
});

describe("Brain v0.4 review: the 2-minute starter, the breather and the related tasks", () => {
  it("offers no Focus (or Done) when the task is no longer open at the end of the starter", async () => {
    const r = await quietRig(meetings(), 9, 30);
    try {
      const task = sprintOf(r);
      r.brain.startTwoMinutes(task);
      // Finished in the Todoist app meanwhile: the next sync no longer lists it.
      await r.backend.todoist.close(task.id);
      await r.brain.refresh();
      r.clock.t += 2 * MIN + 1000;
      r.brain.tick();
      const b = r.brain.getSnapshot().bubble!;
      expect(b.text).toContain("Two minutes done");
      expect(titles(b)).toEqual(["That's enough"]);
    } finally {
      r.brain.stop();
    }
  });

  it("shortens the breather to the time before the next meeting, and leaves it out under 3 minutes", async () => {
    const TEAM = { uid: "team", title: "Team sync", start: at(28, 10), end: at(28, 11) };
    const attended = async (next: { uid: string; title: string; start: number; end: number }) => {
      const r = await quietRig(meetings(TEAM, next), 9, 30);
      tickTo(r, at(28, 10, 1));
      r.clock.t = at(28, 10, 20);
      front(r, { ...DOCS, idleSeconds: 150 });
      r.clock.t = at(28, 11, 1);
      front(r, DOCS);
      let b = tickTo(r, at(28, 11, 1))!;
      // 5 minutes or less to the next meeting: its own reminder comes first.
      if (b.text.startsWith("📅")) {
        r.brain.dismissBubble(b.id, "closed");
        b = tickTo(r, at(28, 11, 1))!;
      }
      return { r, b };
    };
    const four = await attended({ uid: "n", title: "Design", start: at(28, 11, 5), end: at(28, 12) });
    try {
      expect(four.b.text).toContain("a 4-minute breather");
      expect(titles(four.b)).toEqual(["＋ Next step", "☕ 4-min breather", "Nothing"]);
      four.r.brain.pickAction(four.b.id, 1);
      expect(four.r.brain.getSnapshot().focus).toMatchObject({ isBreak: true, minutes: 4 });
    } finally {
      four.r.brain.stop();
    }
    const three = await attended({ uid: "n", title: "Design", start: at(28, 11, 4), end: at(28, 12) });
    try {
      expect(titles(three.b)).toEqual(["＋ Next step", "☕ 3-min breather", "Nothing"]);
    } finally {
      three.r.brain.stop();
    }
    const two = await attended({ uid: "n", title: "Design", start: at(28, 11, 3), end: at(28, 12) });
    try {
      expect(two.b.text).toContain("is over");
      expect(two.b.text).not.toContain("breather");
      expect(titles(two.b)).toEqual(["＋ Next step", "Nothing"]);
    } finally {
      two.r.brain.stop();
    }
  });

  it("lists related tasks from the ranked list, so the higher-priority one wins a tie", async () => {
    const r = await rig({
      prefs: { bubbleGap: 0 },
      setup: meetings({ uid: "abc", title: "Client renewal", start: at(28, 9, 20), end: at(28, 10) }),
    });
    try {
      await r.brain.add("Client invoice", "today", 2); // P3
      await r.brain.add("Client contract", "today", 4); // P1, added last
      r.clock.t = at(28, 9, 16);
      r.brain.recompute();
      r.brain.runRules(r.clock.t);
      const b = r.brain.getSnapshot().bubble!;
      expect(b.text).toContain("Related: “Client contract”");
    } finally {
      r.brain.stop();
    }
  });
});

describe("Brain v0.4 review: stored plans", () => {
  it("saves the pruned list when it started with yesterday's plans", async () => {
    const r = await rig({
      setup: (b) => {
        void b.storage.save("triggers", [
          { taskId: "4", day: "2026-10-27", trigger: { kind: "afterLunch" }, fired: false },
          { taskId: "1", day: "2026-10-28", trigger: { kind: "afterLunch" }, fired: false },
        ]);
      },
    });
    try {
      const stored = await triggersStored(r);
      expect(stored.map((t) => t.taskId)).toEqual(["1"]);
    } finally {
      r.brain.stop();
    }
  });

  it("says in the diary when the plans can't be read, and when they can't be saved", async () => {
    const clock = { t: at(28, 9) };
    const backend = createDemoBackend({ now: () => clock.t, persist: false });
    const load = backend.storage.load.bind(backend.storage);
    backend.storage.load = async (key) => {
      if (key === "triggers") throw new Error("locked");
      return load(key);
    };
    const brain = await Brain.create(backend, { demo: true, now: () => clock.t, random: () => 0.5 });
    setLang("en");
    await brain.start();
    try {
      await vi.waitFor(async () => expect((await diaryOnDisk(backend)).some((t) => t.includes("Couldn't read saved data"))).toBe(true));
      const save = vi.spyOn(backend.storage, "save");
      brain.setStartTrigger(brain.getSnapshot().day.today[0], { kind: "afterLunch" });
      expect(save).not.toHaveBeenCalledWith("triggers", expect.anything());
      await vi.waitFor(async () => expect((await diaryOnDisk(backend)).some((t) => t.includes("start plans won't be saved"))).toBe(true));
    } finally {
      brain.stop();
    }
    const ok = createDemoBackend({ now: () => clock.t, persist: false });
    ok.storage.save = async (key) => {
      if (key === "triggers") throw new Error("disk full");
    };
    const again = await Brain.create(ok, { demo: true, now: () => clock.t, random: () => 0.5 });
    await again.start();
    try {
      again.setStartTrigger(again.getSnapshot().day.today[0], { kind: "afterLunch" });
      await vi.waitFor(async () => expect((await diaryOnDisk(ok)).some((t) => t.includes("Couldn't save your start plans"))).toBe(true));
    } finally {
      again.stop();
    }
  });
});

describe("Brain v0.8: lines that don't repeat (SPEC v0.8 §1)", () => {
  type Rig = Awaited<ReturnType<typeof rig>>;
  /** Adds a task for today and finishes it through the pet, a minute after the last one; returns its bubble. */
  const finish = async (r: Rig, title: string, brain: Brain = r.brain): Promise<Bubble> => {
    r.clock.t += MIN;
    await brain.add(title, "today", 1);
    const task = await vi.waitFor(() => {
      const found = brain.getSnapshot().day.today.find((t) => t.content === title);
      expect(found, title).toBeDefined();
      return found!;
    });
    await brain.complete(task);
    return brain.getSnapshot().bubble!;
  };
  /** The option said last for a key: the one with the newest time. */
  const newest = (b: Brain, key: string): number => {
    const at = b.getSnapshot().life.said[key]?.at ?? [];
    return at.indexOf(Math.max(...at));
  };
  /** A `say` that says option `i` of the pack, as the pet does once it has chosen. */
  const option = (i: number) => (p: { options: readonly (readonly [string, string])[] }) => L(p.options[i][0], p.options[i][1]);
  /**
   * Finishes tasks until one is cheered with a `done` line (the one that reaches today's target has a line of its
   * own, `done.target`); returns which option it was and the bubble, after checking the bubble says that option.
   */
  const finishDone = async (r: Rig, title: string, brain: Brain = r.brain): Promise<{ index: number; bubble: Bubble }> => {
    for (let k = 1; k <= 3; k++) {
      const bubble = await finish(r, `${title} ${k}`, brain);
      expect(bubble.actions.map((a) => a.title), `${title} ${k}`).toContain(L("Hoàn tác", "Undo"));
      const s = brain.getSnapshot();
      const at = s.life.said.done?.at ?? [];
      if (Math.max(0, ...at) !== r.clock.t) continue;
      const index = newest(brain, "done");
      const task = s.day.completed.find((t) => t.content === `${title} ${k}`)!;
      expect(bubble.text.split("\n")[0]).toBe(lines.done(task, s.day.completed.length, s.target, brain.speciesSound, option(index)));
      return { index, bubble };
    }
    throw new Error(`no done line for ${title}`);
  };

  it("finishing tasks says every done line once before any comes back, and keeps Undo on every bubble", async () => {
    const r = await rig({ prefs: { dailyTarget: 10 } });
    try {
      const said: number[] = [];
      for (let i = 1; i <= 5; i++) said.push((await finishDone(r, `Task ${i}`)).index);
      expect(r.brain.getSnapshot().life.said.done.n).toBe(4);
      expect(new Set(said.slice(0, 4)).size).toBe(4);
      expect(said[4]).not.toBe(said[3]);
    } finally {
      r.brain.stop();
    }
  });

  it("the saved state never holds a task title", async () => {
    const r = await rig({ prefs: { dailyTarget: 10 } });
    try {
      await finishDone(r, "SENTINEL-7f3a");
      const saved = await vi.waitFor(async () => {
        const life = (await r.backend.storage.load("life")) as LifeState | null;
        expect(life?.said?.done).toBeDefined();
        return life;
      });
      expect(JSON.stringify(saved)).not.toContain("SENTINEL-7f3a");
    } finally {
      r.brain.stop();
    }
  });

  it("the line memory survives a restart", async () => {
    const r = await rig({ prefs: { dailyTarget: 10 } });
    let again: Brain | null = null;
    try {
      for (let i = 1; i <= 3; i++) await finishDone(r, `Before ${i}`);
      const unused = r.brain.getSnapshot().life.said.done.at.indexOf(0);
      expect(unused).toBeGreaterThanOrEqual(0);
      await vi.waitFor(async () => expect(((await r.backend.storage.load("life")) as LifeState).said.done.at.indexOf(0)).toBe(unused));
      r.brain.stop();
      again = await r.boot();
      expect((await finishDone(r, "After", again)).index).toBe(unused);
    } finally {
      r.brain.stop();
      again?.stop();
    }
  });

  it("one memory for both languages", async () => {
    const r = await rig({ prefs: { dailyTarget: 10 } });
    try {
      const first = (await finishDone(r, "In English")).index;
      setLang("vi");
      // finishDone checks the bubble says the recorded option, here in Vietnamese.
      expect((await finishDone(r, "Bằng tiếng Việt")).index).not.toBe(first);
    } finally {
      setLang("en");
      r.brain.stop();
    }
  });

  it("a cheer said aloud is remembered only when it is heard, and is read in the language it is written in", async () => {
    // 95 XP: the next task grows the pet up, which the pet cheers aloud when the voice is on and a speaker is wired.
    const cases = [
      { voiceOn: false, speaker: true },
      { voiceOn: true, speaker: false },
      { voiceOn: true, speaker: true },
    ];
    for (const { voiceOn, speaker } of cases) {
      const spoken: [string, string][] = [];
      const effects: BrainEffects = speaker ? { speak: (text, lang) => spoken.push([text, lang]) } : {};
      const r = await rig({ life: { xp: 95 }, prefs: { dailyTarget: 10, voiceOn, lang: null }, effects });
      try {
        // No language chosen in the settings: the pet talks in the system's, here Vietnamese.
        setLang("vi");
        await finish(r, `Grow up, voice ${voiceOn ? "on" : "off"}, ${speaker ? "a" : "no"} speaker`);
        expect(r.brain.getSnapshot().life.xp).toBeGreaterThanOrEqual(100);
        const cheer = r.brain.getSnapshot().life.said["voice.cheer"];
        if (!voiceOn || !speaker) {
          expect(spoken).toEqual([]);
          expect(cheer).toBeUndefined();
        } else {
          expect(cheer).toBeDefined();
          expect(spoken.at(-1)).toEqual([lines.voiceCheer(option(newest(r.brain, "voice.cheer"))), "vi"]);
        }
      } finally {
        setLang("en");
        r.brain.stop();
      }
    }
  });
});
