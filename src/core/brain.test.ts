import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createDemoBackend, type DemoBackend } from "../backend/demo";
import type { SystemSample } from "../backend/types";
import { Brain } from "./brain";
import { setLang } from "./l10n";
import { demoLife, type LifeState } from "./life";

const MIN = 60_000;

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
