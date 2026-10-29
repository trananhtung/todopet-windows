import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createDemoBackend, type DemoBackend } from "../backend/demo";
import type { SystemSample } from "../backend/types";
import { Brain, type Bubble } from "./brain";
import { setLang } from "./l10n";
import { demoLife, type LifeState } from "./life";
import { defaultPrefs, type Prefs } from "./prefs";

const MIN = 60_000;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
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

  /** Boots the demo on Wednesday 28 October, 9:00, with yesterday saved as `yesterday` left it. */
  async function boot(yesterday: Partial<LifeState>) {
    const clock = { t: new Date(2026, 9, 28, 9, 0).getTime() };
    const backend = createDemoBackend({ now: () => clock.t, persist: false });
    await backend.storage.save("life", { ...demoLife(), dayKey: "2026-10-27", dayCompleted: 0, dayPlanned: 3, dayTarget: 3, dayWorkday: true, daySeen: true, ...yesterday });
    const brain = await Brain.create(backend, { demo: true, now: () => clock.t, random: () => 0.5 });
    setLang("en");
    await brain.start();
    brain.dismissBubble(brain.getSnapshot().bubble?.id ?? -1, "closed");
    brain.onSample(work(clock.t));
    return { brain, clock };
  }

  it("explains a frozen day kindly the next morning, as a reply rather than a reminder", async () => {
    const { brain } = await boot({ streak: 5, snacks: 1 });
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
    brain.stop();
  });

  it("offers a repair after a broken streak and brings it back with the second task today", async () => {
    const { brain } = await boot({ streak: 6, snacks: 0 });
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
    expect(s.repair).toBeNull();
    expect(brain.getSnapshot().bubble?.text).toContain("streak is back");
    brain.stop();
  });

  it("marks a day off from the board and takes it back", async () => {
    const { brain } = await boot({ dayCompleted: 1 });
    await brain.takeDayOff(true);
    expect(brain.getSnapshot().prefs.restDays).toEqual(["2026-10-28"]);
    expect(brain.getSnapshot().life.dayWorkday).toBe(false);
    await brain.takeDayOff(false);
    expect(brain.getSnapshot().prefs.restDays).toEqual([]);
    expect(brain.getSnapshot().life.dayWorkday).toBe(true);
    brain.stop();
  });
});

/**
 * The demo on Wednesday 28 October, 9:00, with `life` (today's) and `prefs` saved first. `step` moves the clock on
 * and runs the rules like the heartbeat does (without the hunger clock, so the pet doesn't get hungry).
 */
async function rig(opts: { life?: Partial<LifeState>; prefs?: Partial<Prefs> } = {}) {
  const clock = { t: at(28, 9) };
  const backend = createDemoBackend({ now: () => clock.t, persist: false });
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
  const watchYouTube = () => brain.onSample(sample({ ...YOUTUBE, appSwitchedAt: clock.t }));
  const backToWork = () => brain.onSample(sample({ appSwitchedAt: clock.t }));
  const diary = vi.spyOn(brain.diary, "add");
  const diaryTexts = (kind?: string) => diary.mock.calls.filter((c) => kind === undefined || c[0] === kind).map((c) => c[1]);
  return { clock, backend, brain, boot, step, answer, until, watchYouTube, backToWork, diaryTexts };
}

describe("Brain and kind moods", () => {
  it("makes mischief only while you're on a distracting app or site", async () => {
    // Dirty and worried from the start (60 + 8 − 7 − 15 − 3 = 43), with work in front.
    const { brain, step, answer, watchYouTube } = await rig({ life: { dirt: 3 }, prefs: { bubbleGap: 0 } });
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
    // Still on it: now the grumbling starts.
    step();
    expect(brain.getSnapshot().antic?.kind.type).toBe("grumble");
    brain.stop();
  });

  it("offers a fresh start for overdue tasks: every one that doesn't repeat moves to tomorrow", async () => {
    const { brain, until, diaryTexts } = await rig({ prefs: { bubbleGap: 0 } });
    const b = until((x) => x.text.includes("overdue"));
    expect(b.actions.map((a) => a.title)).toEqual(["Move to today", "Fresh start", "Show"]);
    brain.pickAction(b.id, 1);
    await vi.waitFor(() => expect(brain.getSnapshot().day.overdue).toHaveLength(0), { timeout: 3000 });
    const reply = brain.getSnapshot().bubble;
    expect(reply?.text).toContain("Fresh start");
    expect(reply?.reminder).toBe(false);
    // The task left today's list too: it's due tomorrow now.
    expect(brain.getSnapshot().day.today.map((t) => t.id)).not.toContain("3");
    expect(diaryTexts("system").some((t) => t.includes("Fresh start: moved 1 overdue task to tomorrow"))).toBe(true);
    brain.stop();
  });
});

describe("Brain and the nudge budget", () => {
  it("counts unsolicited reminders, but not urgent ones, replies or the two daily check-ins", async () => {
    const { brain, clock, step, answer, until } = await rig({ prefs: { bubbleGap: 0 } });
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
    brain.stop();
  });

  it("stays quiet once today's budget is spent, with one diary line, and still lets urgent bubbles through", async () => {
    const { brain, clock, step, answer, diaryTexts } = await rig({ prefs: { bubbleGap: 0, nudgeBudget: 1 } });
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
    brain.stop();
  });

  it("backs a reminder off each time you close it, and resets it when you tap one of its buttons", async () => {
    const { brain, clock, step, answer, watchYouTube } = await rig({ prefs: { antics: false } });
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
    expect(b?.actions[1].title).toBe("Just a quick break (10')");
    brain.pickAction(b!.id, 1); // back to every 10 minutes (after the break)
    b = step(11);
    expect(b?.kind).toBe("distract");
    brain.stop();
  });

  it("holds non-urgent bubbles for an hour after three dismissed reminders in a row", async () => {
    const { brain, clock, step, answer, diaryTexts } = await rig({ prefs: { bubbleGap: 0 } });
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
    brain.stop();
  });

  it("starts every day with a full budget and no back-off", async () => {
    const { brain, clock, step, answer, watchYouTube, backToWork } = await rig({ prefs: { bubbleGap: 0, nudgeBudget: 2, antics: false } });
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
    // Thursday morning, back at work: the greeting is free.
    backToWork();
    clock.t = at(29, 9);
    brain.tick();
    await sleep(400);
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
    brain.stop();
  });

  it("remembers how many reminders were used today across a restart", async () => {
    const r = await rig({ prefs: { bubbleGap: 0 } });
    r.answer(r.step()!); // morning greeting
    r.answer(r.until((b) => b.kind !== undefined));
    r.answer(r.until((b) => b.kind !== undefined));
    expect(r.brain.getSnapshot().nudgesLeft).toBe(6);
    r.brain.stop();
    const again = await r.boot();
    expect(again.getSnapshot().life.dayNudges).toBe(2);
    expect(again.getSnapshot().nudgesLeft).toBe(6);
    again.stop();
  });
});
