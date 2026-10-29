// Regression tests for the races and silent failures found in code review (async ordering in the Brain).
import { describe, expect, it, vi } from "vitest";
import { createDemoBackend } from "../backend/demo";
import { BackendError } from "../backend/types";
import type { RawTask } from "../backend/types";
import { Brain } from "./brain";
import { utcString } from "./dates";
import { setLang } from "./l10n";
import { demoLife, type LifeState } from "./life";

const MIN = 60_000;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const ids = (xs: { id: string }[]) => xs.map((x) => x.id);
/** How often `id` appears: a task must be listed exactly once. */
const times = (xs: { id: string }[], id: string) => xs.filter((x) => x.id === id).length;
const workSample = (t: number, patch: object = {}) => ({
  app: { name: "Code", exe: "code.exe", title: "x" },
  url: null,
  idleSeconds: 0,
  secondsSinceKey: 999,
  fullscreen: false,
  appSwitchedAt: t - 60 * MIN,
  ...patch,
});

async function boot(opts: { demo?: boolean } = {}) {
  const clock = { t: new Date(2026, 9, 28, 9, 0).getTime() };
  const backend = createDemoBackend({ now: () => clock.t, persist: false });
  const brain = await Brain.create(backend, { demo: opts.demo ?? true, now: () => clock.t, random: () => 0.5 });
  setLang("en");
  await brain.start();
  return { backend, brain, clock };
}

describe("Brain races", () => {
  it("completing a task during a background sync lists it once, as done", async () => {
    const { brain } = await boot();
    try {
      const task = brain.getSnapshot().next!;
      const sync = brain.refresh();
      await sleep(10);
      await Promise.all([sync, brain.complete(task)]);
      const s = brain.getSnapshot();
      expect(ids(s.day.today)).not.toContain(task.id);
      expect(times(s.day.completed, task.id)).toBe(1);
    } finally {
      brain.stop();
    }
  });

  it("a sync that lands before a slow close doesn't bring the task back", async () => {
    const { brain, backend } = await boot();
    try {
      const close = backend.todoist.close.bind(backend.todoist);
      backend.todoist.close = async (id) => {
        await sleep(400);
        return close(id);
      };
      const task = brain.getSnapshot().next!;
      const fedBefore = brain.getSnapshot().life.totalDone;
      const done = brain.complete(task);
      await sleep(20);
      await brain.refresh();
      expect(ids(brain.getSnapshot().day.today)).not.toContain(task.id);
      expect(ids(brain.getSnapshot().day.completed)).toContain(task.id);
      await done;
      expect(times(brain.getSnapshot().day.completed, task.id)).toBe(1);
      expect(brain.getSnapshot().life.totalDone).toBe(fedBefore + 1);
    } finally {
      brain.stop();
    }
  });

  it("a task added during a background sync shows up (the follow-up sync isn't dropped)", async () => {
    const { brain } = await boot();
    try {
      const sync = brain.refresh();
      await sleep(10);
      expect(await brain.add("Write tests", "today", 1)).toBe(true);
      expect(brain.getSnapshot().day.today.map((t) => t.content)).toContain("Write tests");
      await sync;
    } finally {
      brain.stop();
    }
  });

  it("completing twice (a stale bubble and the board) feeds once", async () => {
    const { brain } = await boot();
    try {
      const task = brain.getSnapshot().next!;
      const before = brain.getSnapshot().life.totalDone;
      await Promise.all([brain.complete(task), brain.complete(task)]);
      expect(brain.getSnapshot().life.totalDone - before).toBe(1);
      expect(times(brain.getSnapshot().day.completed, task.id)).toBe(1);
      await brain.undoComplete(task);
      await brain.undoComplete(task);
      expect(brain.getSnapshot().life.totalDone).toBe(before);
      expect(ids(brain.getSnapshot().day.today).filter((id) => id === task.id)).toHaveLength(1);
    } finally {
      brain.stop();
    }
  });
});

describe("Brain failures", () => {
  it("a refused token backs off: one bubble, no retries until the token changes", async () => {
    const { brain, backend, clock } = await boot();
    try {
      brain.dismissBubble(brain.getSnapshot().bubble?.id ?? -1, "closed");
      let calls = 0;
      backend.todoist.tasks = async () => {
        calls += 1;
        throw new BackendError({ kind: "unauthorized", message: "revoked" });
      };
      const say = vi.spyOn(brain, "say");
      clock.t += 4 * MIN;
      for (let i = 0; i < 20; i++) {
        clock.t += 15_000;
        brain.tick();
        await sleep(0);
      }
      // Let any sync the ticks started finish before counting.
      await vi.waitFor(() => expect(brain.getSnapshot().loading).toBe(false));
      expect(calls).toBe(1);
      expect(say.mock.calls.filter((c) => /token/i.test(c[0].text))).toHaveLength(1);
      expect(brain.getSnapshot().authError).toBe(true);
    } finally {
      brain.stop();
    }
  });

  it("network errors back off instead of retrying every 15 s", async () => {
    const { brain, backend, clock } = await boot();
    try {
      let calls = 0;
      backend.todoist.tasks = async () => {
        calls += 1;
        throw new BackendError({ kind: "network", message: "offline" });
      };
      clock.t += 4 * MIN;
      for (let i = 0; i < 20; i++) {
        clock.t += 15_000;
        brain.tick();
        await sleep(0);
      }
      // Let any sync the ticks started finish before counting.
      await vi.waitFor(() => expect(brain.getSnapshot().loading).toBe(false));
      // 15 s, 30 s, 60 s, 120 s, then every 5 min: at most 5 attempts in 5 minutes.
      expect(calls).toBeGreaterThan(1);
      expect(calls).toBeLessThanOrEqual(5);
    } finally {
      brain.stop();
    }
  });

  it("failed moves are reported, not announced as done, and the message survives the next sync", async () => {
    const { brain, backend } = await boot();
    try {
      backend.todoist.reschedule = async () => {
        throw new BackendError({ kind: "network", message: "offline" });
      };
      const before = brain.getSnapshot().day.today.length;
      await brain.moveTodayToTomorrow();
      expect(brain.getSnapshot().bubble?.text).toMatch(/Couldn't move/);
      expect(brain.getSnapshot().day.today).toHaveLength(before);
      await brain.reschedule(brain.getSnapshot().day.today[0], "tomorrow");
      expect(brain.getSnapshot().errorText).toMatch(/offline/);
    } finally {
      brain.stop();
    }
  });

  it("a failed read never overwrites saved settings with defaults", async () => {
    const clock = { t: new Date(2026, 9, 28, 9, 0).getTime() };
    const backend = createDemoBackend({ now: () => clock.t, persist: false });
    await backend.storage.save("prefs", { petName: "Rex", species: "fox", firstLaunch: 1 });
    const load = backend.storage.load.bind(backend.storage);
    backend.storage.load = (async (k: string) => {
      if (k === "prefs") throw new BackendError({ kind: "internal", message: "sharing violation" });
      return load(k);
    }) as typeof backend.storage.load;
    const writes: string[] = [];
    const save = backend.storage.save.bind(backend.storage);
    backend.storage.save = async (k, v) => {
      writes.push(k);
      return save(k, v);
    };
    await Brain.create(backend, { now: () => clock.t });
    expect(writes).not.toContain("prefs");
    expect((await load<{ petName: string }>("prefs"))?.petName).toBe("Rex");
  });
});

describe("Brain quietness", () => {
  it("routine hunger ticks don't write to disk or broadcast every 15 s", async () => {
    const { brain, backend, clock } = await boot({ demo: false });
    try {
      // The one-time save (and broadcast) from settling the first day at startup has gone out.
      await vi.waitFor(() => expect((brain as unknown as { lifeSaveTimer: unknown }).lifeSaveTimer).toBeNull());
      const emits: string[] = [];
      const emit = backend.bus.emit.bind(backend.bus);
      backend.bus.emit = async (e) => {
        emits.push(e.type);
        return emit(e);
      };
      brain.onSample(workSample(clock.t));
      for (let i = 0; i < 40; i++) {
        clock.t += 15_000;
        brain.tick();
        await sleep(0);
      }
      expect(emits.filter((e) => e === "life-changed")).toHaveLength(0);
    } finally {
      brain.stop();
    }
  });

  it("stays out of the way while a full-screen app is in front", async () => {
    const { brain, clock } = await boot();
    try {
      const spoken: string[] = [];
      brain.effects = { speak: (t) => spoken.push(t) };
      brain.dismissBubble(brain.getSnapshot().bubble?.id ?? -1, "closed");
      brain.onSample(workSample(clock.t, { fullscreen: true }));
      clock.t += 16 * MIN;
      brain.runRules(clock.t);
      expect(brain.getSnapshot().bubble).toBeNull();
      expect(spoken).toEqual([]);
    } finally {
      brain.stop();
    }
  });

  it("stop() during start() leaves no timers behind", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    try {
      const clock = { t: new Date(2026, 9, 28, 9, 0).getTime() };
      const backend = createDemoBackend({ now: () => clock.t, persist: false });
      const brain = await Brain.create(backend, { demo: true, now: () => clock.t });
      const started = brain.start();
      brain.stop();
      await started;
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("hiding offers a way back, and Undo stops the celebration", async () => {
    const { brain } = await boot();
    try {
      brain.hide(60);
      const b = brain.getSnapshot().bubble!;
      expect(b.urgent).toBe(true);
      brain.pickAction(b.id, 0);
      expect(brain.getSnapshot().hiddenUntil).toBeNull();
      const task = brain.getSnapshot().next!;
      await brain.complete(task);
      expect(brain.getSnapshot().mood).toBe("celebrating");
      await brain.undoComplete(task);
      expect(brain.getSnapshot().celebration).toBeNull();
      expect(brain.getSnapshot().mood).not.toBe("celebrating");
    } finally {
      brain.stop();
    }
  });

  it("demo stunts behave like the real ones: mood, bubble and Spare me", async () => {
    const { brain, backend } = await boot();
    try {
      backend.demo.setForeground({ name: "Google Chrome", exe: "chrome.exe", title: "YouTube" }, "https://www.youtube.com/watch?v=1");
      brain.demoDistract("youtube.com");
      expect(brain.getSnapshot().reasons.some((r) => r.text.includes("distracted by youtube.com"))).toBe(true);
      brain.demoAntic("block");
      const s = brain.getSnapshot();
      expect(s.antic?.kind.type).toBe("block");
      expect(s.mood).toBe("angry");
      const spare = s.bubble!.actions.findIndex((a) => a.title.startsWith("Spare me"));
      expect(spare).toBeGreaterThan(-1);
      brain.pickAction(s.bubble!.id, spare);
      expect(brain.getSnapshot().antic).toBeNull();
    } finally {
      brain.stop();
    }
  });
});

describe("Brain day rollover", () => {
  const at = (day: number, h: number, m = 0) => new Date(2026, 9, day, h, m).getTime();
  const done = (id: string, when: number): RawTask => ({ id, content: `Task ${id}`, checked: true, completed_at: new Date(when).toISOString() });
  /** Yesterday (Tuesday 27th) as the PC last saw it: a workday with nothing done yet. */
  const tuesday = (patch: Partial<LifeState> = {}) => ({ ...demoLife(), dayKey: "2026-10-27", dayCompleted: 0, dayPlanned: 3, dayTarget: 3, dayWorkday: true, daySeen: true, ...patch });

  async function start(t: number, life: object, completed: (since: string, until: string) => Promise<RawTask[]>) {
    const clock = { t };
    const backend = createDemoBackend({ now: () => clock.t, persist: false });
    await backend.storage.save("life", life);
    backend.todoist.completed = completed;
    const brain = await Brain.create(backend, { demo: true, now: () => clock.t, random: () => 0.5 });
    setLang("en");
    await brain.start();
    return { brain, backend, clock };
  }

  it("settles yesterday with what Todoist reports for it, including tasks finished after the last sync", async () => {
    const calls: [string, string][] = [];
    const { brain } = await start(at(28, 9), tuesday({ streak: 5, snacks: 0 }), async (since, until) => {
      calls.push([since, until]);
      // Finished on the phone on Tuesday evening, after the PC was off.
      return until === utcString(new Date(2026, 9, 28)) ? [done("p1", at(27, 21))] : [];
    });
    try {
      expect(calls[0]).toEqual([utcString(new Date(2026, 9, 27)), utcString(new Date(2026, 9, 28))]);
      expect(brain.getSnapshot().life).toMatchObject({ dayKey: "2026-10-28", streak: 6, dirt: 0, repair: null });
    } finally {
      brain.stop();
    }
  });

  it("closes yesterday as a day it never saw when Todoist can't say", async () => {
    const { brain } = await start(at(28, 9), tuesday({ streak: 5, snacks: 0 }), async (_since, until) => {
      if (until === utcString(new Date(2026, 9, 28))) throw new BackendError({ kind: "network", message: "offline" });
      return [];
    });
    try {
      expect(brain.getSnapshot().life).toMatchObject({ dayKey: "2026-10-28", streak: 5, snacks: 0, dirt: 0, repair: null });
    } finally {
      brain.stop();
    }
  });

  it("keeps yesterday's confirmed work when Todoist can't say more at rollover", async () => {
    const { brain } = await start(at(28, 9), tuesday({ streak: 5, snacks: 0, dayCompleted: 2 }), async (_since, until) => {
      if (until === utcString(new Date(2026, 9, 28))) throw new BackendError({ kind: "network", message: "offline" });
      return [];
    });
    try {
      expect(brain.getSnapshot().life).toMatchObject({ dayKey: "2026-10-28", streak: 6, dirt: 0, repair: null });
    } finally {
      brain.stop();
    }
  });

  it("doesn't count today as seen while the finished tasks can't be fetched", async () => {
    let failing = true;
    const { brain } = await start(at(28, 9), { ...demoLife(), dayKey: "2026-10-28", daySeen: false }, async () => {
      if (failing) throw new BackendError({ kind: "internal", message: "not on this plan" });
      return [];
    });
    try {
      expect(brain.getSnapshot().lastSync).not.toBeNull();
      expect(brain.getSnapshot().life.daySeen).toBe(false);
      failing = false;
      await brain.refresh();
      expect(brain.getSnapshot().life.daySeen).toBe(true);
    } finally {
      brain.stop();
    }
  });

  it("a midnight rollover settles yesterday once, before today's counts land on it", async () => {
    let rollovers = 0;
    const { brain, clock } = await start(at(28, 23, 50), { ...demoLife(), dayKey: "2026-10-28", streak: 3, snacks: 0 }, async (_since, until) => {
      if (until !== utcString(new Date(2026, 9, 29))) return [];
      // Wednesday's last task, done on the phone at 23:58, after the PC's last sync.
      rollovers += 1;
      await sleep(300);
      return [done("p1", at(28, 23, 58))];
    });
    try {
      expect(brain.getSnapshot().life).toMatchObject({ dayKey: "2026-10-28", dayCompleted: 0, daySeen: true });
      clock.t = at(29, 0, 1);
      brain.tick();
      // The heartbeat keeps going while Todoist answers.
      for (let i = 0; i < 4; i++) {
        clock.t += 15_000;
        brain.tick();
        await sleep(10);
        expect(brain.getSnapshot().life.dayKey).toBe("2026-10-28");
      }
      await vi.waitFor(() => expect(brain.getSnapshot().life.dayKey).toBe("2026-10-29"));
      expect(rollovers).toBe(1);
      expect(brain.getSnapshot().life).toMatchObject({ streak: 4, dirt: 0, repair: null, dayCompleted: 0 });
    } finally {
      brain.stop();
    }
  });
});
