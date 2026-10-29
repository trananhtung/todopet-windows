import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createDemoBackend, type DemoBackend } from "../backend/demo";
import { BackendError, type RawTask, type SystemSample } from "../backend/types";
import { Brain, type Bubble } from "./brain";
import { setLang } from "./l10n";
import { demoLife, type LifeState } from "./life";
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

  it("explains a frozen day kindly the next morning, as a reply rather than a reminder", async () => {
    const { brain } = await boot({ streak: 5, snacks: 1 });
    try {
      expect(brain.getSnapshot().life.snacks).toBe(0);
      expect(brain.getSnapshot().life.streak).toBe(5);
      brain.tick();
      const b = brain.getSnapshot().bubble;
      expect(b?.text).toContain("🍪");
      expect(b?.text).toContain("5");
      expect(b?.reminder).toBe(false);
      expect(b?.seconds).toBe(12);
      // Once only.
      brain.dismissBubble(b!.id, "closed");
      brain.tick();
      expect(brain.getSnapshot().bubble?.text ?? "").not.toContain("🍪");
    } finally {
      brain.stop();
    }
  });

  it("offers a repair after a broken streak and brings it back with the second task today", async () => {
    const { brain } = await boot({ streak: 6, snacks: 0 });
    try {
      let s = brain.getSnapshot().life;
      expect(s.streak).toBe(0);
      expect(s.repair?.streak).toBe(6);
      brain.tick();
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
    const { brain } = await boot({ xp: 290, streak: 2 }, doneOn27(3));
    try {
      expect(brain.getSnapshot().life.xp).toBe(320);
      brain.tick();
      expect(brain.getSnapshot().bubble?.text).toContain("I grew up: Teen");
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
async function rig(opts: { life?: Partial<LifeState>; prefs?: Partial<Prefs>; setup?: (b: DemoBackend) => void } = {}) {
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
    const b = await Brain.create(backend, { demo: true, now: () => clock.t, random: () => 0.5 });
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
  const backToWork = () => brain.onSample(sample({ appSwitchedAt: clock.t }));
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
      r.clock.t = at(28, 11);
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
      r.clock.t = at(28, 11);
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
      // A real answer ("Split it", "Show"…) starts the row over, and that kind's back-off.
      const real = r.step()!;
      expect(real.kind).toBeDefined();
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
      r.clock.t = at(28, 11);
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
      brain.dismissBubble(brain.getSnapshot().bubble!.id, "ignored");
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
      clock.t = at(28, 11);
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
      brain.dismissBubble(brain.getSnapshot().bubble!.id, "ignored");
      b = step(10);
      expect(b?.kind).toBe("distract");
    } finally {
      brain.stop();
    }
  });

  it("holds non-urgent bubbles for an hour after three dismissed reminders in a row", async () => {
    const { brain, clock, step, answer, diaryTexts } = await rig({ prefs: { bubbleGap: 0 } });
    try {
      clock.t = at(28, 11);
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
      clock.t = at(28, 11);
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
