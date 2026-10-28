import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createDemoBackend, type DemoBackend } from "../backend/demo";
import type { SystemSample } from "../backend/types";
import { Brain } from "./brain";
import { setLang } from "./l10n";

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
    expect(s.day.today).toHaveLength(2);
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
    // Overdue tasks don't count as planned: 2/3, so it asks for one more, then sums up the calendar.
    expect(b?.text).toContain("Only 2/3 planned");
    expect(b?.text).toContain("2 meetings today");
    expect(b?.actions[0].title).toBe("＋ Add tasks");
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
    expect(s.day.completed.map((x) => x.id)).toEqual(["1"]);
    await brain.undoComplete(task);
    expect(brain.getSnapshot().life.totalDone).toBe(31);
    expect(brain.getSnapshot().day.completed).toHaveLength(0);
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
