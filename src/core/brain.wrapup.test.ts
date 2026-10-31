// SPEC v0.4 §3 (Shutdown ritual) and §4 (Overbooked warning), through the Brain with the demo backend.
import { afterEach, describe, expect, it, vi } from "vitest";
import { createDemoBackend, type DemoBackend } from "../backend/demo";
import { BackendError, type RawTask, type SystemSample } from "../backend/types";
import { Brain, showsOverBoard, type Bubble } from "./brain";
import { dayKey } from "./dates";
import { setLang } from "./l10n";
import { demoLife, type LifeState } from "./life";
import * as lines from "./lines";
import { defaultPrefs, type Prefs } from "./prefs";
import { everyOption } from "./variety";
import { chooseFrog, chooseMove, newDraft, planFromJson, setNote, type WrapDraft } from "./wrapup";

const MIN = 60_000;
/** Local time on a day of October 2026 (the 28th is a Wednesday, the 30th a Friday). */
const at = (day: number, h: number, m = 0) => new Date(2026, 9, day, h, m).getTime();

type Clock = { t: number };
type Setup = (b: DemoBackend, clock: Clock) => void;
const combine =
  (...setups: Setup[]): Setup =>
  (b, clock) =>
    setups.forEach((s) => s(b, clock));

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
/** The calendar the demo serves, replaced by these meetings (none: a free day). */
const meetings =
  (...events: { uid: string; title: string; start: number; end: number }[]): Setup =>
  (b) => {
    b.calendar.fetchIcs = async () => [{ host: "demo.todopet", ok: true, text: icsOf(...events) }];
  };
/** Rewrites the tasks Todoist answers with. */
const reshape =
  (f: (t: RawTask, clock: Clock) => RawTask | null): Setup =>
  (b, clock) => {
    const tasks = b.todoist.tasks.bind(b.todoist);
    b.todoist.tasks = async (filter) =>
      (await tasks(filter)).flatMap((t) => {
        const r = f(t, clock);
        return r ? [r] : [];
      });
  };
/** No task has a time of day, so no "in 10 minutes" bubble gets in the way. */
const untimed = reshape((t) => (t.due ? { ...t, due: { ...t.due, date: t.due.date.slice(0, 10) } } : t));
/** Today's tasks (1, 2 and 4) are due on whatever day the clock shows, like a real list that rolls on. */
const evergreen = reshape((t, clock) => (["1", "2", "4"].includes(t.id) ? { ...t, due: { date: dayKey(new Date(clock.t)), string: "today" } } : t));
/** Task id → minutes. */
const lasting = (minutes: Record<string, number>): Setup =>
  reshape((t) => (minutes[t.id] ? { ...t, duration: { amount: minutes[t.id], unit: "minute" } } : t));
const only = (...ids: string[]): Setup => reshape((t) => (ids.includes(t.id) ? t : null));
/** Today's tasks (1, 2 and 4) at these lengths, with no time of day; the meetings are up to the caller. */
const lengths = (a: number, b: number, c: number, ...events: Parameters<typeof meetings>): Setup => combine(meetings(...events), untimed, lasting({ "1": a, "2": b, "4": c }));
const YOUTUBE = { app: { name: "Google Chrome", exe: "chrome.exe", title: "Cats - YouTube" }, url: "https://www.youtube.com/watch?v=1" };

interface RigOptions {
  /** Start of the session (epoch ms); Wednesday 28 October 9:00 by default. */
  start?: number;
  life?: Partial<LifeState>;
  prefs?: Partial<Prefs>;
  /** What the `plan` store holds when the pet starts. */
  plan?: unknown;
  setup?: Setup;
  /** False: not the demo, so the day follows the real work hours. */
  demo?: boolean;
  /** What is in front when the pet starts (a work app by default). */
  front?: Partial<SystemSample>;
}

/** The demo at `start`, with today's life and `prefs` saved first. `step` moves the clock on and runs the rules. */
async function rig(opts: RigOptions = {}) {
  const clock: Clock = { t: opts.start ?? at(28, 9) };
  const backend = createDemoBackend({ now: () => clock.t, persist: false });
  opts.setup?.(backend, clock);
  await backend.storage.save("life", { ...demoLife(), dayKey: dayKey(new Date(clock.t)), ...opts.life });
  await backend.storage.save("prefs", { ...defaultPrefs(clock.t), bubbleGap: 0, ...opts.prefs });
  if (opts.plan !== undefined) await backend.storage.save("plan", opts.plan);
  const sample = (patch: Partial<SystemSample> = {}): SystemSample => ({
    app: { name: "Visual Studio Code", exe: "code.exe", title: "work" },
    url: null,
    idleSeconds: 0,
    secondsSinceKey: 999,
    fullscreen: false,
    appSwitchedAt: clock.t - 60 * MIN,
    ...patch,
  });
  const brains: Brain[] = [];
  let brain!: Brain;
  /** Starts a brain on the same backend (a restart); from then on `step`, `until` and `r.brain` are about that one. */
  const boot = async () => {
    const b = await Brain.create(backend, { demo: opts.demo ?? true, now: () => clock.t, random: () => 0.5 });
    brains.push(b);
    brain = b;
    setLang("en");
    await b.start();
    b.dismissBubble(b.getSnapshot().bubble?.id ?? -1, "closed");
    b.onSample(sample(opts.front));
    return b;
  };
  await boot();
  const step = (minutes = 1): Bubble | null => {
    clock.t += minutes * MIN;
    brain.recompute();
    brain.runRules(clock.t);
    return brain.getSnapshot().bubble;
  };
  const answer = (b: Bubble) => (b.actions.length > 0 ? brain.pickAction(b.id, b.actions.length - 1) : brain.dismissBubble(b.id, "ignored"));
  /** Steps a minute at a time, answering other bubbles, until one matches. */
  const until = (match: (b: Bubble) => boolean, max = 90): Bubble => {
    for (let i = 0; i < max; i++) {
      const b = step();
      if (!b) continue;
      if (match(b)) return b;
      answer(b);
    }
    throw new Error("no matching bubble");
  };
  /** Every bubble the pet makes in the next `minutes` minutes (each answered with its last button). */
  const bubblesIn = (minutes: number): Bubble[] => {
    const seen: Bubble[] = [];
    for (let i = 0; i < minutes; i++) {
      const b = step();
      if (!b) continue;
      seen.push(b);
      answer(b);
    }
    return seen;
  };
  /** Past the morning greeting, then at exactly `h:m`: whatever the pet says there. */
  const checkAt = (h: number, m = 0): Bubble | null => {
    const greeting = step();
    if (greeting) answer(greeting);
    clock.t = at(new Date(clock.t).getDate(), h, m);
    return step(0);
  };
  const watchYouTube = () => brain.onSample(sample({ ...YOUTUBE, appSwitchedAt: clock.t }));
  const restart = async () => {
    brain.stop();
    return boot();
  };
  return {
    clock,
    backend,
    get brain() {
      return brain;
    },
    boot,
    restart,
    step,
    answer,
    until,
    bubblesIn,
    checkAt,
    watchYouTube,
    sample,
    stop: () => brains.forEach((b) => b.stop()),
  };
}
type Rig = Awaited<ReturnType<typeof rig>>;

const titles = (b: Bubble | null) => b?.actions.map((a) => a.title);
const todayTasks = (r: Rig) => r.brain.getSnapshot().day.today;
const draftFor = (r: Rig, f?: (d: WrapDraft, tasks: ReturnType<typeof todayTasks>) => WrapDraft): WrapDraft => {
  const d = r.brain.wrapDraft();
  return f ? f(d, todayTasks(r)) : d;
};
const planOnDisk = (r: Rig) => r.backend.storage.load<{ plans: { day: string; frogId: string | null; note: string | null }[]; doneUntil: number | null }>("plan");

let live: Rig | null = null;
const started = async (opts: RigOptions = {}) => (live = await rig(opts));
afterEach(() => {
  live?.stop();
  live = null;
  vi.restoreAllMocks();
});

describe("Brain v0.4: the end-of-day review opens the Wrap up sheet", () => {
  it("offers Wrap up first, then the quick options, as a check-in that costs nothing", async () => {
    const r = await started({ start: at(28, 17, 28), setup: combine(meetings(), untimed) });
    const b = r.until((x) => x.text.includes("end of day"));
    expect(titles(b)).toEqual(["Wrap up", "Move to tomorrow", "Keep going"]);
    expect(b.actions[0].primary).toBe(true);
    expect(b.actions[1].primary).toBeFalsy();
    expect(b.kind).toBeUndefined();
    const left = r.brain.getSnapshot().nudgesLeft;
    const openWrapUp = vi.fn();
    r.brain.effects = { openWrapUp };
    r.brain.pickAction(b.id, 0);
    expect(openWrapUp).toHaveBeenCalledOnce();
    expect(r.brain.getSnapshot().nudgesLeft).toBe(left);
  });

  it("still moves everything to tomorrow with the quick option", async () => {
    const r = await started({ start: at(28, 17, 28), setup: combine(meetings(), untimed) });
    const b = r.until((x) => x.text.includes("end of day"));
    expect(b.text).toContain("Wrap up the day");
    r.brain.pickAction(b.id, 1);
    await vi.waitFor(() => expect(todayTasks(r)).toEqual([]));
  });

  it("lets you keep going, which opens nothing", async () => {
    const r = await started({ start: at(28, 17, 28), setup: combine(meetings(), untimed) });
    const review = r.until((x) => x.text.includes("end of day"));
    const openWrapUp = vi.fn();
    r.brain.effects = { openWrapUp };
    r.brain.pickAction(review.id, 2);
    expect(openWrapUp).not.toHaveBeenCalled();
    expect(todayTasks(r)).toHaveLength(3);
  });

  it("asks for the sheet from the demo", async () => {
    const r = await started();
    const openWrapUp = vi.fn();
    r.brain.effects = { openWrapUp };
    r.brain.demoWrapUp();
    expect(openWrapUp).toHaveBeenCalledOnce();
  });
});

describe("Brain v0.4: wrapping up the day", () => {
  const afternoon = () => started({ start: at(28, 16), setup: combine(meetings(), untimed) });

  it("moves the tasks you chose to tomorrow or off the plan, and leaves the rest", async () => {
    const r = await afternoon();
    const reschedule = vi.spyOn(r.backend.todoist, "reschedule");
    const draft = draftFor(r, (d, tasks) => chooseMove(chooseMove(d, tasks, "2", "tomorrow"), tasks, "4", "none"));
    const result = await r.brain.wrapUp(draft);
    expect(result).toMatchObject({ ok: true, moved: 1, offPlan: 1, failed: 0, error: null });
    // "Tomorrow" is the next workday's date.
    expect(reschedule.mock.calls.map((c) => [c[0], c[1]]).sort()).toEqual([["2", "2026-10-29"], ["4", "no date"]]);
    expect(todayTasks(r).map((t) => t.id)).toEqual(["1"]);
  });

  it("leaves everything alone when you keep every task", async () => {
    const r = await afternoon();
    const reschedule = vi.spyOn(r.backend.todoist, "reschedule");
    const result = await r.brain.wrapUp(draftFor(r));
    expect(result).toMatchObject({ ok: true, moved: 0, offPlan: 0, failed: 0 });
    expect(reschedule).not.toHaveBeenCalled();
    expect(todayTasks(r)).toHaveLength(3);
  });

  it("never reschedules a repeating task, even if the draft says to", async () => {
    const r = await started({
      start: at(28, 16),
      setup: combine(meetings(), untimed, reshape((t) => (t.id === "4" ? { ...t, due: { date: "2026-10-28", string: "every day", is_recurring: true } } : t))),
    });
    const reschedule = vi.spyOn(r.backend.todoist, "reschedule");
    const result = await r.brain.wrapUp({ moves: { "4": "tomorrow", "2": "none" }, frogId: null, note: "" });
    expect(result).toMatchObject({ ok: true, moved: 0, offPlan: 1 });
    expect(reschedule.mock.calls.map((c) => c[0])).toEqual(["2"]);
  });

  it("ignores choices for tasks that are not on today's list any more", async () => {
    const r = await afternoon();
    const reschedule = vi.spyOn(r.backend.todoist, "reschedule");
    const result = await r.brain.wrapUp({ moves: { gone: "tomorrow", "2": "tomorrow" }, frogId: "gone", note: "" });
    expect(result.moved).toBe(1);
    expect(reschedule.mock.calls.map((c) => c[0])).toEqual(["2"]);
    expect((await planOnDisk(r))?.plans ?? []).toEqual([]);
  });

  it("saves the frog and the note for the next workday, tidied", async () => {
    const r = await afternoon();
    await r.brain.wrapUp(draftFor(r, (d, tasks) => setNote(chooseFrog(d, tasks, "2"), "  Start  with the intro ")));
    expect(await planOnDisk(r)).toEqual({ plans: [{ day: "2026-10-29", frogId: "2", note: "Start with the intro" }], doneUntil: at(29, 8) });
  });

  it("plans for Monday when you wrap up on a Friday", async () => {
    const r = await started({ start: at(30, 16), setup: combine(meetings(), untimed), demo: false });
    await r.brain.wrapUp(draftFor(r, (d, tasks) => chooseFrog(d, tasks, "2")));
    const saved = await planOnDisk(r);
    expect(saved?.plans[0].day).toBe("2026-11-02");
    expect(saved?.doneUntil).toBe(new Date(2026, 10, 2, 8).getTime());
  });

  it("remembers a frog or a note on its own, and nothing when there is neither", async () => {
    const r = await afternoon();
    await r.brain.wrapUp({ moves: {}, frogId: null, note: "Call mum first" });
    expect((await planOnDisk(r))?.plans).toEqual([{ day: "2026-10-29", frogId: null, note: "Call mum first" }]);
    await r.brain.wrapUp({ moves: {}, frogId: null, note: "  " });
    expect((await planOnDisk(r))?.plans).toEqual([]);
  });

  it("starts the sheet from the plan you already made, if you open it again", async () => {
    const r = await afternoon();
    await r.brain.wrapUp(draftFor(r, (d, tasks) => setNote(chooseFrog(d, tasks, "4"), "Open the doc")));
    r.brain.resumeDay();
    expect(r.brain.wrapDraft()).toMatchObject({ frogId: "4", note: "Open the doc", moves: {} });
  });

  it("starts the sheet with the top task as the frog", async () => {
    const r = await afternoon();
    expect(r.brain.wrapDraft()).toEqual(newDraft(todayTasks(r)));
    expect(r.brain.wrapDraft().frogId).toBe("1");
  });

  it("says a kind goodnight, naming the frog, without spending the budget", async () => {
    const r = await afternoon();
    const left = r.brain.getSnapshot().nudgesLeft;
    await r.brain.wrapUp(draftFor(r, (d, tasks) => chooseFrog(d, tasks, "2")));
    const b = r.brain.getSnapshot().bubble;
    expect(b?.text).toContain("Rest well");
    expect(b?.text).toContain("“Call client ABC”");
    expect(b?.kind).toBeUndefined();
    expect(b?.reminder).toBe(false);
    expect(r.brain.getSnapshot().nudgesLeft).toBe(left);
  });

  it("reports moves that failed, keeps the pet awake and lets you try again", async () => {
    const r = await afternoon();
    const reschedule = r.backend.todoist.reschedule.bind(r.backend.todoist);
    r.backend.todoist.reschedule = async () => {
      throw new BackendError({ kind: "network", message: "offline" });
    };
    const draft = draftFor(r, (d, tasks) => setNote(chooseMove(chooseMove(d, tasks, "2", "tomorrow"), tasks, "4", "tomorrow"), "Keep this"));
    const result = await r.brain.wrapUp(draft);
    expect(result).toMatchObject({ ok: false, moved: 0, failed: 2 });
    expect(result.error).toContain("offline");
    expect(r.brain.getSnapshot().bubble?.text).toMatch(/Couldn't move 2 tasks/);
    expect(r.brain.getSnapshot().doneUntil).toBeNull();
    expect(r.brain.getSnapshot().mood).not.toBe("sleeping");
    expect(todayTasks(r)).toHaveLength(3);
    // The note is yours: it is kept either way.
    expect((await planOnDisk(r))?.plans[0].note).toBe("Keep this");
    r.backend.todoist.reschedule = reschedule;
    expect(await r.brain.wrapUp(draft)).toMatchObject({ ok: true, moved: 2 });
    expect(r.brain.getSnapshot().doneUntil).toBe(at(29, 8));
  });

  it("only retries what is still on the list", async () => {
    const r = await afternoon();
    const real = r.backend.todoist.reschedule.bind(r.backend.todoist);
    r.backend.todoist.reschedule = async (id, due) => {
      if (id === "4") throw new BackendError({ kind: "network", message: "offline" });
      return real(id, due);
    };
    const draft = draftFor(r, (d, tasks) => chooseMove(chooseMove(d, tasks, "2", "tomorrow"), tasks, "4", "tomorrow"));
    expect(await r.brain.wrapUp(draft)).toMatchObject({ ok: false, moved: 1, failed: 1 });
    expect(todayTasks(r).map((t) => t.id).sort()).toEqual(["1", "4"]);
    const again = vi.fn(real);
    r.backend.todoist.reschedule = again;
    expect(await r.brain.wrapUp(draft)).toMatchObject({ ok: true, moved: 1 });
    expect(again.mock.calls.map((c) => c[0])).toEqual(["4"]);
  });

  it("writes the diary a line about it, without the note", async () => {
    const r = await afternoon();
    const add = vi.spyOn(r.brain.diary, "add");
    await r.brain.wrapUp(draftFor(r, (d, tasks) => setNote(chooseFrog(d, tasks, "2"), "Secret plan for tomorrow")));
    const texts = add.mock.calls.map((c) => c[1]).join("\n");
    expect(texts).toContain("Wrapped up");
    expect(texts).toContain("Call client ABC");
    expect(texts).not.toContain("Secret plan");
  });
});

describe("Brain v0.4: tomorrow's frog and note in the morning", () => {
  /** Wraps up on Wednesday 28th at 16:00 with “Call client ABC” as the frog and a note, then restarts on Thursday 9:00. */
  async function nextMorning(opts: RigOptions = {}) {
    const r = await started({ start: at(28, 16), setup: combine(meetings(), evergreen), ...opts });
    await r.brain.wrapUp(draftFor(r, (d, tasks) => setNote(chooseFrog(d, tasks, "2"), "Start with the intro")));
    r.brain.stop();
    r.clock.t = at(29, 9);
    await r.backend.storage.save("life", { ...demoLife(), dayKey: "2026-10-29" });
    const brain = await r.boot();
    return { r, brain };
  }

  it("names them in the next morning's greeting, even after a restart", async () => {
    const { r, brain } = await nextMorning();

    expect(brain.getSnapshot().todayPlan).toEqual({ day: "2026-10-29", frogId: "2", note: "Start with the intro" });
    const b = r.until((x) => x.text.includes("Good morning"));
    // Any of the picked-frog lines: each says you picked it, then names it.
    expect(b.text).toMatch(/picked[^\n]*“Call client ABC”/);
    expect(b.text).toContain("📝 Your note: “Start with the intro”");
    expect(b.kind).toBeUndefined();
    expect(b.reminder).toBe(true);
  });

  it("puts the frog first that day", async () => {
    const r = await started({ start: at(28, 16), setup: combine(meetings(), evergreen) });
    // Today the order is the usual one: the plan is for tomorrow.
    await r.brain.wrapUp(draftFor(r, (d, tasks) => chooseFrog(d, tasks, "2")));
    expect(r.brain.getSnapshot().day.frogId).toBeNull();
    expect(r.brain.getSnapshot().next?.id).toBe("1");
    expect(todayTasks(r).map((t) => t.id)).toEqual(["1", "2", "4"]);
    r.brain.stop();
    r.clock.t = at(29, 9);
    await r.backend.storage.save("life", { ...demoLife(), dayKey: "2026-10-29" });
    const brain = await r.boot();
    expect(brain.getSnapshot().next?.id).toBe("2");
    expect(brain.getSnapshot().day.today.map((t) => t.id)).toEqual(["2", "1", "4"]);
    expect(brain.getSnapshot().day.frogId).toBe("2");
  });

  it("puts the frog first that day only", async () => {
    const { r, brain } = await nextMorning();
    expect(brain.getSnapshot().next?.id).toBe("2");
    // The next day, in the same session: the plan has done its day.
    r.clock.t = at(30, 9);
    brain.tick();
    await vi.waitFor(() => expect(brain.getSnapshot().loading).toBe(false));
    brain.recompute();
    expect(brain.getSnapshot().todayPlan).toBeNull();
    expect(brain.getSnapshot().day.frogId).toBeNull();
    expect(brain.getSnapshot().next?.id).toBe("1");
    await vi.waitFor(async () => expect((await planOnDisk(r))?.plans).toEqual([]));
  });

  it("names the note alone when the frog is already done", async () => {
    const { r } = await nextMorning();
    r.brain.stop();
    // Finished on the phone overnight.
    const tasks = r.backend.todoist.tasks.bind(r.backend.todoist);
    r.backend.todoist.tasks = async (f) => (await tasks(f)).filter((t) => t.id !== "2");
    await r.boot();
    const b = r.until((x) => x.text.includes("Good morning"));
    expect(b.text).not.toContain("Call client ABC");
    expect(b.text).toContain("Your note: “Start with the intro”");
  });

  it("asks you to plan first when the day is thin, and still names them", async () => {
    const { r } = await nextMorning();
    r.brain.stop();
    const tasks = r.backend.todoist.tasks.bind(r.backend.todoist);
    r.backend.todoist.tasks = async (f) => (await tasks(f)).filter((t) => t.id === "2");
    await r.boot();
    const b = r.until((x) => x.text.includes("Good morning"));
    // The planning question (any of its lines) shows planned against the target of 3.
    expect(b.text.split("\n")[0]).toMatch(/\d+\/3\b/);
    expect(b.text).toContain("“Call client ABC”");
    expect(b.text).toContain("Your note");
  });

  it("greets as always when there is no plan", async () => {
    const r = await started({ setup: combine(meetings(), untimed) });
    const b = r.until((x) => x.text.includes("Good morning"));
    // The usual line names the next task as today's frog, never as one you picked.
    expect(b.text).toMatch(/frog/i);
    expect(b.text).not.toContain("picked");
    expect(b.text).not.toContain("Your note");
  });

  it("shows the note to the board for the day", async () => {
    const { brain } = await nextMorning();
    expect(brain.getSnapshot().todayPlan?.note).toBe("Start with the intro");
  });

  it("drops plans of days gone by when it starts, and keeps later ones", async () => {
    const r = await started({
      start: at(29, 9),
      setup: combine(meetings(), evergreen),
      plan: {
        plans: [
          { day: "2026-10-27", frogId: "1", note: "old" },
          { day: "2026-10-30", frogId: "4", note: "later" },
        ],
        doneUntil: null,
      },
    });
    expect(r.brain.getSnapshot().todayPlan).toBeNull();
    // Friday's plan survives until Friday.
    r.clock.t = at(30, 9);
    r.brain.tick();
    await vi.waitFor(() => expect(r.brain.getSnapshot().todayPlan?.note).toBe("later"));
  });

  it("never overwrites the stored plan with an empty one after a failed read", async () => {
    const r = await started({
      start: at(28, 16),
      setup: combine(meetings(), untimed),
      plan: { plans: [{ day: "2026-10-29", frogId: "2", note: "precious" }], doneUntil: null },
    });
    r.brain.stop();
    const load = r.backend.storage.load.bind(r.backend.storage);
    r.backend.storage.load = (async (k: string) => {
      if (k === "plan") throw new BackendError({ kind: "internal", message: "sharing violation" });
      return load(k);
    }) as typeof r.backend.storage.load;
    const saved: string[] = [];
    const save = r.backend.storage.save.bind(r.backend.storage);
    r.backend.storage.save = async (k, v) => {
      saved.push(k);
      return save(k, v);
    };
    vi.useFakeTimers({ toFake: ["setTimeout"], shouldAdvanceTime: true });
    try {
      const boot = r.boot();
      await vi.advanceTimersByTimeAsync(5000);
      const brain = await boot;
      await brain.wrapUp({ moves: {}, frogId: "4", note: "new" });
      expect(saved).not.toContain("plan");
    } finally {
      vi.useRealTimers();
      r.backend.storage.load = load;
    }
    expect((await planOnDisk(r))?.plans[0].note).toBe("precious");
  });
});

describe("Brain v0.4: done for today", () => {
  const afternoon = (extra: RigOptions = {}) => started({ start: at(28, 16), setup: combine(meetings(), untimed), ...extra });
  const wrap = async (r: Rig, f?: Parameters<typeof draftFor>[1]) => {
    const result = await r.brain.wrapUp(draftFor(r, f));
    r.brain.dismissBubble(r.brain.getSnapshot().bubble?.id ?? -1, "closed");
    return result;
  };

  it("puts the pet to sleep until the next workday starts", async () => {
    const r = await afternoon();
    expect(r.brain.getSnapshot().mood).not.toBe("sleeping");
    await wrap(r);
    expect(r.brain.getSnapshot().mood).toBe("sleeping");
    expect(r.brain.getSnapshot().doneUntil).toBe(at(29, 8));
  });

  it("stops the reminders that are not urgent, however many minutes go by", async () => {
    // Control: the same afternoon without wrapping up is not quiet.
    const control = await afternoon();
    expect(control.bubblesIn(90).length).toBeGreaterThan(2);
    control.stop();

    const r = await afternoon();
    await wrap(r);
    // The end-of-day review, nudges, stuck tasks, the overdue list, hunger, the tip: none of them.
    expect(r.bubblesIn(120).map((b) => b.text)).toEqual([]);
    // Nor a distraction, which would be called out on any other afternoon.
    r.watchYouTube();
    r.brain.demoDistract("youtube.com");
    expect(r.bubblesIn(30)).toEqual([]);
  });

  it("stays quiet through the evening and the night, until work starts", async () => {
    const r = await afternoon();
    await wrap(r);
    r.clock.t = at(28, 23, 5);
    expect(r.step(0)).toBeNull();
    r.clock.t = at(29, 7, 30);
    expect(r.step(0)).toBeNull();
    expect(r.brain.getSnapshot().mood).toBe("sleeping");
    expect(r.brain.getSnapshot().doneUntil).toBe(at(29, 8));
  });

  it("holds the kind words about yesterday's streak too, until work starts", async () => {
    const r = await started({
      start: at(29, 7, 15),
      setup: combine(meetings(), evergreen),
      // Yesterday ended with nothing done and a snack to eat; the pet had already wrapped up that evening.
      life: { dayKey: "2026-10-28", dayCompleted: 0, dayPlanned: 3, dayTarget: 3, dayWorkday: true, daySeen: true, streak: 3, snacks: 1 },
      plan: { plans: [], doneUntil: at(29, 8) },
    });
    r.brain.tick();
    await vi.waitFor(() => expect(r.brain.getSnapshot().life.dayKey).toBe("2026-10-29"));
    r.brain.tick();
    expect(r.brain.getSnapshot().bubble).toBeNull();
    r.clock.t = at(29, 8, 5);
    r.brain.tick();
    // Work started: the greeting waits for the tasks to sync, and the kind words ride in it.
    await vi.waitFor(() => expect(r.brain.getSnapshot().loading).toBe(false));
    r.brain.tick();
    const b = r.brain.getSnapshot().bubble;
    expect(b?.text).toContain("Good morning");
    expect(b?.text).toContain("ate a snack");
  });

  it("still brings a meeting reminder", async () => {
    const r = await afternoon({ setup: combine(meetings({ uid: "m", title: "Budget review", start: at(28, 16, 30), end: at(28, 17) }), untimed) });
    await wrap(r);
    r.clock.t = at(28, 16, 20);
    expect(r.step(0)).toBeNull(); // 10 minutes away: not yet
    const b = r.step(6); // 16:26: the 5-minute lead is on
    expect(b?.text).toContain("Meeting in");
    expect(b?.text).toContain("Budget review");
    expect(b?.urgent).toBe(true);
  });

  it("still brings a reminder for a task with a time", async () => {
    const r = await afternoon({ setup: meetings() });
    // Timed tasks come only from this one: the demo's own is long gone.
    const sprint = todayTasks(r).find((t) => t.id === "4")!;
    await r.brain.reschedule(sprint, "today at 16:40");
    await wrap(r);
    r.clock.t = at(28, 16, 31);
    const b = r.step(1);
    expect(b?.text).toMatch(/in 8 min/i);
    expect(b?.text).toContain("Plan the next sprint");
    expect(b?.urgent).toBe(true);
    r.brain.dismissBubble(b!.id, "closed");
    const due = r.step(8);
    expect(due?.text).toMatch(/time/i);
  });

  it("still cheers a finished task, and the pet wakes to celebrate", async () => {
    const r = await afternoon();
    await wrap(r);
    await r.brain.complete(r.brain.getSnapshot().day.today[0]);
    expect(r.brain.getSnapshot().bubble?.actions.map((a) => a.title)).toEqual(["Undo"]);
    expect(r.brain.getSnapshot().mood).toBe("celebrating");
  });

  it("doesn't ask for the end-of-day review afterwards", async () => {
    const r = await afternoon({ start: at(28, 17, 20) });
    await wrap(r);
    expect(r.bubblesIn(40).map((b) => b.text)).toEqual([]);
  });

  it("doesn't welcome you back with a nudge either", async () => {
    // Only a distracting site was ever in front, so there is no place to come back to and the plain welcome is what comes.
    const away = (r: Rig) => {
      r.brain.onSample(r.sample({ ...YOUTUBE, idleSeconds: 400 }));
      r.brain.runRules(r.clock.t);
      r.clock.t += 40 * MIN;
      r.brain.onSample(r.sample({ ...YOUTUBE, idleSeconds: 0 }));
      r.brain.recompute();
      r.brain.runRules(r.clock.t);
      return r.brain.getSnapshot().bubble;
    };
    const control = await afternoon({ front: YOUTUBE });
    expect(away(control)?.text).toContain("Welcome back");
    control.stop();
    const r = await afternoon({ front: YOUTUBE });
    await wrap(r);
    expect(away(r)).toBeNull();
  });

  it("survives a restart: still asleep, still quiet", async () => {
    const r = await afternoon();
    await wrap(r);
    r.clock.t = at(28, 18, 30);
    const brain = await r.restart();
    brain.recompute();
    expect(brain.getSnapshot().doneUntil).toBe(at(29, 8));
    expect(brain.getSnapshot().mood).toBe("sleeping");
    expect(r.bubblesIn(30)).toEqual([]);
  });

  it("goes back to normal when the next workday starts", async () => {
    const r = await started({ start: at(28, 16), setup: combine(meetings(), evergreen) });
    await wrap(r, (d, tasks) => chooseFrog(d, tasks, "4"));
    r.brain.stop();
    r.clock.t = at(29, 8);
    await r.backend.storage.save("life", { ...demoLife(), dayKey: "2026-10-29" });
    const brain = await r.boot();
    brain.recompute();
    expect(brain.getSnapshot().doneUntil).toBeNull();
    expect(brain.getSnapshot().mood).not.toBe("sleeping");
    const b = r.until((x) => x.text.includes("Good morning"));
    expect(b.text).toContain("“Plan the next sprint”");
  });

  it("goes back to normal in the same session too", async () => {
    const r = await afternoon();
    await wrap(r);
    expect(r.brain.getSnapshot().mood).toBe("sleeping");
    r.clock.t = at(29, 8, 1);
    r.brain.tick();
    await vi.waitFor(() => expect(r.brain.getSnapshot().loading).toBe(false));
    r.brain.recompute();
    expect(r.brain.getSnapshot().doneUntil).toBeNull();
    expect(r.brain.getSnapshot().mood).not.toBe("sleeping");
  });

  it("sleeps over the weekend after a Friday, and wakes on Monday", async () => {
    const r = await afternoon({ start: at(30, 16), demo: false });
    await wrap(r);
    const monday = new Date(2026, 10, 2, 8).getTime();
    expect(r.brain.getSnapshot().doneUntil).toBe(monday);
    r.clock.t = at(31, 11);
    r.brain.recompute();
    expect(r.brain.getSnapshot().mood).toBe("sleeping");
    r.clock.t = monday - MIN;
    r.brain.recompute();
    expect(r.brain.getSnapshot().mood).toBe("sleeping");
    r.clock.t = monday;
    r.brain.recompute();
    expect(r.brain.getSnapshot().doneUntil).toBeNull();
    expect(r.brain.getSnapshot().mood).not.toBe("sleeping");
  });

  it("can be undone: the pet wakes up and the reminders come back", async () => {
    const r = await afternoon();
    await wrap(r, (d) => setNote(d, "Keep me"));
    expect(r.brain.getSnapshot().doneUntil).not.toBeNull();
    r.brain.resumeDay();
    expect(r.brain.getSnapshot().doneUntil).toBeNull();
    expect(r.brain.getSnapshot().mood).not.toBe("sleeping");
    // The pet wakes up (any of its back-to-work lines).
    expect(everyOption(lines.backToWork)).toContain(r.brain.getSnapshot().bubble?.text);
    expect((await planOnDisk(r))?.doneUntil).toBeNull();
    // What you wrote for tomorrow stays.
    expect((await planOnDisk(r))?.plans[0].note).toBe("Keep me");
    r.brain.dismissBubble(r.brain.getSnapshot().bubble!.id, "closed");
    expect(r.bubblesIn(90).length).toBeGreaterThan(0);
  });

  it("does nothing when asked to wake a pet that is awake", async () => {
    const r = await afternoon();
    r.brain.resumeDay();
    expect(r.brain.getSnapshot().bubble).toBeNull();
  });

  it("skips a rest day when it looks for the next workday", async () => {
    const r = await afternoon({ prefs: { restDays: ["2026-10-29"] }, demo: false });
    await wrap(r);
    expect(r.brain.getSnapshot().doneUntil).toBe(at(30, 8));
    expect((await planOnDisk(r))?.doneUntil).toBe(at(30, 8));
    // The frog is for the day work starts again.
    expect((await planOnDisk(r))?.plans.map((p) => p.day)).toEqual(["2026-10-30"]);
  });
});

describe("Brain v0.4: the overbooked check", () => {
  const overbooked = (b: Bubble | null) => (b?.text ?? "").includes("overbooked");

  it("warns once planning is done, with the numbers, a way to move tasks and a way to say it's fine", async () => {
    // 9:00: 9 hours left. Three tasks of 200 minutes = 10 hours, and 45 minutes of meeting still ahead.
    const r = await started({ start: at(28, 8, 58), setup: lengths(200, 200, 200, { uid: "m", title: "Client", start: at(28, 13), end: at(28, 13, 45) }) });
    const b = r.checkAt(9)!;
    expect(b.text).toBe("Today looks overbooked: ~10h of tasks + 45 min of meetings in 9h left. Move some?");
    expect(titles(b)).toEqual(["Pick tasks to move", "It's fine"]);
    expect(b.actions[0].primary).toBe(true);
    expect(b.reminder).toBe(true);
  });

  it("is a check-in: not counted against the budget, and it comes even when the budget is spent", async () => {
    const r = await started({ start: at(28, 8, 58), setup: lengths(200, 200, 200), prefs: { nudgeBudget: 0 } });
    const left = r.brain.getSnapshot().nudgesLeft;
    const b = r.checkAt(9)!;
    expect(overbooked(b)).toBe(true);
    expect(b.kind).toBeUndefined();
    expect(r.brain.getSnapshot().nudgesLeft).toBe(left);
    // Closing it is not a refusal either.
    r.brain.dismissBubble(b.id, "closed");
    expect(r.brain.getSnapshot().life.dismissedInRow).toBe(0);
    expect(r.brain.getSnapshot().life.dayBackoff).toEqual({});
  });

  it("comes once a day: not again after 'It's fine', nor after closing it", async () => {
    for (const how of ["fine", "closed"] as const) {
      const r = await started({ start: at(28, 8, 58), setup: lengths(200, 200, 200) });
      const b = r.checkAt(9)!;
      expect(overbooked(b), how).toBe(true);
      if (how === "fine") r.brain.pickAction(b.id, 1);
      else r.brain.dismissBubble(b.id, "closed");
      expect(r.bubblesIn(240).filter(overbooked), how).toEqual([]);
      r.stop();
    }
  });

  it("doesn't come again after a restart on the same day", async () => {
    const r = await started({ start: at(28, 8, 58), setup: lengths(200, 200, 200) });
    const b = r.checkAt(9)!;
    r.brain.pickAction(b.id, 1);
    await r.restart();
    expect(r.bubblesIn(120).filter(overbooked)).toEqual([]);
  });

  it("Pick tasks to move opens the board, ready to lighten the day (v0.4 evaluation, issue 3)", async () => {
    const r = await started({ start: at(28, 8, 58), setup: lengths(200, 200, 200) });
    const openBoard = vi.fn();
    r.brain.effects = { openBoard };
    const b = r.checkAt(9)!;
    r.brain.pickAction(b.id, 0);
    expect(openBoard).toHaveBeenCalledExactlyOnceWith(false, undefined, { lighten: true });
  });

  it("'It's fine' changes nothing and asks nothing more", async () => {
    const r = await started({ start: at(28, 8, 58), setup: lengths(200, 200, 200) });
    const openBoard = vi.fn();
    r.brain.effects = { openBoard };
    const b = r.checkAt(9)!;
    r.brain.pickAction(b.id, 1);
    expect(openBoard).not.toHaveBeenCalled();
    expect(todayTasks(r)).toHaveLength(3);
    expect(r.brain.getSnapshot().bubble).toBeNull();
  });

  it("needs a full hour over: 59 minutes over is fine, 60 is not", async () => {
    // 9:00 with no meetings: 540 minutes left.
    const fits = await started({ start: at(28, 8, 58), setup: lengths(200, 200, 199) });
    expect(overbooked(fits.checkAt(9))).toBe(false);
    fits.stop();
    const over = await started({ start: at(28, 8, 58), setup: lengths(200, 200, 200) });
    expect(overbooked(over.checkAt(9))).toBe(true);
  });

  it("counts the meetings still ahead, not the ones that are over", async () => {
    // 12:00: 6 hours left, 5 hours of tasks.
    const past = await started({ start: at(28, 11, 58), setup: lengths(100, 100, 100, { uid: "m", title: "Done", start: at(28, 9), end: at(28, 11) }) });
    expect(overbooked(past.checkAt(12))).toBe(false);
    past.stop();
    const ahead = await started({ start: at(28, 11, 58), setup: lengths(100, 100, 100, { uid: "m", title: "Soon", start: at(28, 14), end: at(28, 17, 30) }) });
    const b = ahead.checkAt(12);
    expect(overbooked(b)).toBe(true);
    expect(b?.text).toContain("~5h of tasks + 3h30 of meetings in 6h left");
  });

  it("counts a meeting only from now on, even one that has begun", async () => {
    // 12:00: the meeting runs 11:00-14:00, so 2 of its 3 hours are ahead. 5h of tasks + 2h of meeting in 6h: over by 1h.
    const r = await started({ start: at(28, 11, 58), setup: lengths(100, 100, 100, { uid: "m", title: "Workshop", start: at(28, 11), end: at(28, 14) }) });
    // (In the meeting the pet says nothing; the meeting counts from the moment it speaks.)
    expect(r.checkAt(12)).toBeNull();
    const after = r.brain.currentLoad(at(28, 12));
    expect(after).toMatchObject({ taskMinutes: 300, meetingMinutes: 120, capacity: 360, overBy: 60 });
  });

  it("uses the default estimate for tasks without a length", async () => {
    // 14:00: 4 hours left (a 12:00-18:00 day, so the middle is 15:00); three tasks with no length.
    const small = await started({ start: at(28, 13, 58), setup: combine(meetings(), untimed), prefs: { defaultEstimate: 30, workStart: 12 } });
    expect(overbooked(small.checkAt(14))).toBe(false);
    small.stop();
    const big = await started({ start: at(28, 13, 58), setup: combine(meetings(), untimed), prefs: { defaultEstimate: 120, workStart: 12 } });
    const b = big.checkAt(14);
    expect(b?.text).toBe("Today looks overbooked: ~6h of tasks in 4h left. Move some?");
  });

  it("prefers the Todoist length over the default", async () => {
    const r = await started({ start: at(28, 13, 58), setup: lengths(15, 15, 15), prefs: { defaultEstimate: 120, workStart: 12 } });
    expect(overbooked(r.checkAt(14))).toBe(false);
  });

  it("waits for the plan: not while fewer tasks than the target are planned and the deadline is ahead", async () => {
    // One task for today (and the one finished): 2 of 3 planned. 9:00 is before the 10:00 deadline.
    const r = await started({ start: at(28, 8, 58), setup: combine(meetings(), untimed, only("1"), lasting({ "1": 600 })) });
    expect(overbooked(r.checkAt(9))).toBe(false);
    // After the deadline the plan is what it is: overbooked all the same (480 minutes left, 600 of task).
    r.clock.t = at(28, 10);
    expect(overbooked(r.step(0))).toBe(true);
  });

  it("hands over to the end-of-day review in the last half hour", async () => {
    const r = await started({ start: at(28, 17, 31), setup: lengths(200, 200, 200) });
    const seen = r.bubblesIn(20).map((b) => b.text);
    expect(seen.some((t) => t.includes("end of day"))).toBe(true);
    expect(seen.some((t) => t.includes("overbooked"))).toBe(false);
  });

  it("says nothing once the work day is over", async () => {
    const r = await started({ start: at(28, 19), setup: lengths(200, 200, 200), demo: false });
    expect(r.bubblesIn(60)).toEqual([]);
  });

  it("is quiet when the day is done for today", async () => {
    const r = await started({ start: at(28, 8, 58), setup: lengths(200, 200, 200) });
    await r.brain.wrapUp({ moves: {}, frogId: null, note: "" });
    expect(r.bubblesIn(120).filter(overbooked)).toEqual([]);
  });

  it("is not a check for a day off", async () => {
    const r = await started({ start: at(28, 8, 58), setup: lengths(200, 200, 200), prefs: { restDays: ["2026-10-28"] }, demo: false });
    expect(r.bubblesIn(120).filter(overbooked)).toEqual([]);
  });

  it("holds during a meeting, and comes after it", async () => {
    const r = await started({ start: at(28, 8, 58), setup: lengths(200, 200, 200, { uid: "m", title: "Long one", start: at(28, 9, 1), end: at(28, 11) }) });
    const greeting = r.step();
    if (greeting) r.answer(greeting);
    expect(r.bubblesIn(100).filter(overbooked)).toEqual([]); // 9:00-10:40
    r.clock.t = at(28, 11, 2);
    expect(r.bubblesIn(30).filter(overbooked)).toHaveLength(1);
  });

  it("can be shown from the demo at any hour, with the day made heavy", async () => {
    const r = await started({ start: at(28, 22), setup: meetings() });
    r.backend.demo.setHeavyDay(true);
    await r.brain.demoOverbooked();
    const b = r.brain.getSnapshot().bubble;
    expect(overbooked(b)).toBe(true);
    expect(titles(b)).toEqual(["Pick tasks to move", "It's fine"]);
    // The demo pretends it is an hour into the work day when it is not.
    expect(b?.text).toBe("Today looks overbooked: ~11h of tasks in 9h left. Move some?");
    expect(r.brain.loadClock()).toBe(at(28, 9));
    r.backend.demo.setHeavyDay(false);
  });

  it("measures from now, with the real clock, when it is not the demo", async () => {
    const r = await started({ start: at(28, 22), setup: meetings(), demo: false });
    expect(r.brain.loadClock()).toBe(at(28, 22));
  });

  it("measures from now in the demo during work hours too", async () => {
    const r = await started({ start: at(28, 13, 20), setup: meetings() });
    expect(r.brain.loadClock()).toBe(at(28, 13, 20));
  });
});

describe("Brain v0.4: what the brain stores", () => {
  it("writes what it can read back", async () => {
    const r = await started({ start: at(28, 16), setup: combine(meetings(), untimed) });
    await r.brain.wrapUp(draftFor(r, (d, tasks) => setNote(chooseFrog(d, tasks, "4"), "x")));
    expect(planFromJson(await planOnDisk(r), at(28, 17))).toEqual({ plans: [{ day: "2026-10-29", frogId: "4", note: "x" }], doneUntil: at(29, 8) });
  });

  it("writes nothing to the plan store until you wrap up", async () => {
    const r = await started({ start: at(28, 16), setup: combine(meetings(), untimed) });
    const saved: string[] = [];
    const save = r.backend.storage.save.bind(r.backend.storage);
    r.backend.storage.save = async (k, v) => {
      saved.push(k);
      return save(k, v);
    };
    r.bubblesIn(30);
    r.brain.tick();
    expect(saved).not.toContain("plan");
  });
});

// ---------- v0.4 part B, after review ----------

describe("Brain v0.4 review: the frog survives a retry and a second wrap-up", () => {
  const afternoon = (extra: RigOptions = {}) => started({ start: at(28, 16), setup: combine(meetings(), untimed), ...extra });
  const failing = (r: Rig, id: string) => {
    const real = r.backend.todoist.reschedule.bind(r.backend.todoist);
    r.backend.todoist.reschedule = async (taskId, due) => {
      if (taskId === id) throw new BackendError({ kind: "network", message: "offline" });
      return real(taskId, due);
    };
    return real;
  };

  it("keeps a frog that was moved to tomorrow when the same sheet is sent again", async () => {
    const r = await afternoon();
    const real = failing(r, "4");
    const draft = draftFor(r, (d, tasks) => chooseFrog(chooseMove(chooseMove(d, tasks, "2", "tomorrow"), tasks, "4", "tomorrow"), tasks, "2"));
    expect(await r.brain.wrapUp(draft)).toMatchObject({ ok: false, moved: 1, failed: 1 });
    expect((await planOnDisk(r))?.plans).toEqual([{ day: "2026-10-29", frogId: "2", note: null }]);
    r.backend.todoist.reschedule = real;
    expect(await r.brain.wrapUp(draft)).toMatchObject({ ok: true, moved: 1 });
    expect((await planOnDisk(r))?.plans).toEqual([{ day: "2026-10-29", frogId: "2", note: null }]);
    // The goodnight names it, though it is no longer on today's list.
    expect(r.brain.getSnapshot().bubble?.text).toContain("“Call client ABC”");
  });

  it("keeps it when the sheet is opened again after 'Back to work'", async () => {
    const r = await afternoon();
    await r.brain.wrapUp(draftFor(r, (d, tasks) => chooseFrog(chooseMove(d, tasks, "2", "tomorrow"), tasks, "2")));
    r.brain.resumeDay();
    const again = r.brain.wrapDraft();
    expect(again).toMatchObject({ frogId: "2", picked: true });
    expect(await r.brain.wrapUp(again)).toMatchObject({ ok: true });
    expect((await planOnDisk(r))?.plans[0].frogId).toBe("2");
  });

  it("lets go of a frog that was finished meanwhile, and says so in the draft", async () => {
    const r = await afternoon();
    const draft = draftFor(r, (d, tasks) => chooseFrog(d, tasks, "2"));
    r.brain.editWrapDraft(() => draft);
    // Finished in the Todoist app: no longer open, and on the list of what was done today.
    await r.backend.todoist.close("2");
    await r.brain.refresh();
    expect(r.brain.getSnapshot().wrapDraft).toMatchObject({ frogId: null, frogDone: "Call client ABC" });
    expect(await r.brain.wrapUp(r.brain.wrapDraft())).toMatchObject({ ok: true });
    expect((await planOnDisk(r))?.plans ?? []).toEqual([]);
  });

  it("starts the sheet from the saved plan even before the first sync, and doesn't wipe it", async () => {
    const r = await started({
      start: at(28, 16),
      setup: combine(meetings(), untimed, (b) => {
        b.todoist.tasks = async () => {
          throw new BackendError({ kind: "network", message: "offline" });
        };
      }),
      plan: { plans: [{ day: "2026-10-29", frogId: "2", note: "Start with the call" }], doneUntil: null },
    });
    expect(r.brain.getSnapshot().day.today).toEqual([]);
    expect(r.brain.wrapDraft()).toMatchObject({ frogId: "2", note: "Start with the call" });
    await r.brain.wrapUp(r.brain.wrapDraft());
    expect((await planOnDisk(r))?.plans).toEqual([{ day: "2026-10-29", frogId: "2", note: "Start with the call" }]);
  });
});

describe("Brain v0.4 review: tomorrow means the next workday", () => {
  const friday = (extra: RigOptions = {}) => started({ start: at(30, 16), demo: false, setup: combine(meetings(), untimed), ...extra });

  it("moves to the next workday's date, not to 'tomorrow'", async () => {
    const r = await started({ start: at(28, 16), setup: combine(meetings(), untimed) });
    const reschedule = vi.spyOn(r.backend.todoist, "reschedule");
    await r.brain.wrapUp(draftFor(r, (d, tasks) => chooseMove(chooseMove(d, tasks, "2", "tomorrow"), tasks, "4", "none")));
    expect(reschedule.mock.calls.map((c) => [c[0], c[1]]).sort()).toEqual([["2", "2026-10-29"], ["4", "no date"]]);
    expect(r.brain.wrapDay()).toEqual({ day: "2026-10-29", isTomorrow: true });
  });

  it("means Monday on a Friday, and skips a rest day", async () => {
    const r = await friday();
    const reschedule = vi.spyOn(r.backend.todoist, "reschedule");
    expect(r.brain.wrapDay()).toEqual({ day: "2026-11-02", isTomorrow: false });
    await r.brain.wrapUp(draftFor(r, (d, tasks) => chooseMove(d, tasks, "2", "tomorrow")));
    expect(reschedule.mock.calls.map((c) => [c[0], c[1]])).toEqual([["2", "2026-11-02"]]);
    const mid = await started({ start: at(28, 16), demo: false, prefs: { restDays: ["2026-10-29"] }, setup: combine(meetings(), untimed) });
    expect(mid.brain.wrapDay()).toEqual({ day: "2026-10-30", isTomorrow: false });
  });

  it("moves the review bubble's 'Move to tomorrow' to the next workday too", async () => {
    const r = await friday({ start: at(30, 17, 25) });
    const reschedule = vi.spyOn(r.backend.todoist, "reschedule");
    await r.brain.moveTodayToTomorrow();
    expect(reschedule.mock.calls.length).toBeGreaterThan(0);
    for (const [, due] of reschedule.mock.calls) expect(due).toBe("2026-11-02");
  });

  it("brings the tasks and the frog on Monday morning after a Friday wrap-up", async () => {
    const r = await friday();
    await r.brain.wrapUp(draftFor(r, (d, tasks) => setNote(chooseFrog(chooseMove(d, tasks, "2", "tomorrow"), tasks, "2"), "Open with the call")));
    r.brain.dismissBubble(r.brain.getSnapshot().bubble?.id ?? -1, "closed");
    r.clock.t = new Date(2026, 10, 2, 8, 30).getTime();
    r.brain.onSample(r.sample());
    // Todoist lists the task for Monday now (the demo's list only brings it back when asked).
    await r.backend.todoist.reschedule("2", "2026-11-02");
    r.brain.tick();
    await vi.waitFor(() => expect(r.brain.getSnapshot()).toMatchObject({ loading: false, life: { dayKey: "2026-11-02" } }));
    expect(todayTasks(r).map((t) => t.id)).toContain("2");
    r.brain.tick();
    const b = r.brain.getSnapshot().bubble;
    expect(b?.text).toContain("Good morning");
    expect(b?.text).toContain("“Call client ABC”");
    expect(b?.text).toContain("Open with the call");
  });
});

describe("Brain v0.4 review: the sheet and the day", () => {
  it("lists overdue tasks too: they can move, and one can be the frog", async () => {
    const r = await started({ start: at(28, 16), setup: combine(meetings(), untimed) });
    const draft = r.brain.wrapDraft();
    expect(r.brain.getSnapshot().day.overdue.map((t) => t.id)).toEqual(["3"]);
    const reschedule = vi.spyOn(r.backend.todoist, "reschedule");
    const tasks = r.brain.wrapTasks();
    expect(tasks.map((t) => t.id)).toContain("3");
    const chosen = chooseFrog(chooseMove(draft, tasks, "3", "tomorrow"), tasks, "3");
    expect(await r.brain.wrapUp(chosen)).toMatchObject({ ok: true, moved: 1 });
    expect(reschedule.mock.calls.map((c) => [c[0], c[1]])).toEqual([["3", "2026-10-29"]]);
    expect((await planOnDisk(r))?.plans[0].frogId).toBe("3");
  });

  it("works on a day with only overdue tasks", async () => {
    const r = await started({ start: at(28, 16), setup: combine(meetings(), untimed, only("3")) });
    expect(todayTasks(r)).toEqual([]);
    expect(r.brain.wrapDraft().frogId).toBe("3");
    expect(await r.brain.wrapUp(r.brain.wrapDraft())).toMatchObject({ ok: true });
    expect((await planOnDisk(r))?.plans[0]).toMatchObject({ frogId: "3" });
    expect(r.brain.getSnapshot().doneUntil).toBe(at(29, 8));
  });

  it("keeps the draft in the brain: still there after closing the board, gone once it is sent", async () => {
    const r = await started({ start: at(28, 16), setup: combine(meetings(), untimed) });
    r.brain.editWrapDraft((d, tasks) => setNote(chooseMove(d, tasks, "2", "tomorrow"), "Call first"));
    expect(r.brain.getSnapshot().wrapDraft).toMatchObject({ note: "Call first", moves: { "2": "tomorrow" } });
    expect(r.brain.wrapDraft()).toMatchObject({ note: "Call first" });
    await r.brain.wrapUp(r.brain.wrapDraft());
    expect(r.brain.getSnapshot().wrapDraft).toBeNull();
    r.brain.resumeDay();
    expect(r.brain.wrapDraft().note).toBe("Call first"); // from the saved plan now
    expect(r.brain.wrapDraft().moves).toEqual({});
  });

  it("drops the draft when the day ends", async () => {
    const r = await started({ start: at(28, 16), setup: combine(meetings(), untimed, evergreen) });
    r.brain.editWrapDraft((d) => setNote(d, "Yesterday's thoughts"));
    r.clock.t = at(29, 9);
    r.brain.tick();
    await vi.waitFor(() => expect(r.brain.getSnapshot().life.dayKey).toBe("2026-10-29"));
    expect(r.brain.getSnapshot().wrapDraft).toBeNull();
    expect(r.brain.wrapDraft().note).toBe("");
  });

  it("pauses hunger and the distraction tally while the day is done", async () => {
    const r = await started({ start: at(28, 16), setup: combine(meetings(), untimed) });
    await r.brain.wrapUp(r.brain.wrapDraft());
    r.brain.dismissBubble(r.brain.getSnapshot().bubble?.id ?? -1, "closed");
    const before = r.brain.getSnapshot().life;
    for (let i = 0; i < 40; i++) {
      r.clock.t += 5 * MIN;
      r.watchYouTube();
      r.brain.tick();
    }
    const after = r.brain.getSnapshot().life;
    expect(after.satiety).toBe(before.satiety);
    expect(after.distraction).toEqual(before.distraction);
  });

  it("moves the wrap-up day and the sleep when a rest day is added afterwards", async () => {
    const r = await started({ start: at(28, 16), demo: false, setup: combine(meetings(), untimed) });
    await r.brain.wrapUp(r.brain.wrapDraft());
    expect(r.brain.getSnapshot().doneUntil).toBe(at(29, 8));
    await r.brain.updatePrefs({ restDays: ["2026-10-29"] });
    expect(r.brain.getSnapshot().doneUntil).toBe(at(30, 8));
    expect(await planOnDisk(r)).toMatchObject({ doneUntil: at(30, 8) });
    expect((await planOnDisk(r))?.plans.map((p) => p.day)).toEqual(["2026-10-30"]);
    // Taking the day off again brings it back.
    await r.brain.updatePrefs({ restDays: [] });
    expect(r.brain.getSnapshot().doneUntil).toBe(at(29, 8));
    expect((await planOnDisk(r))?.plans.map((p) => p.day)).toEqual(["2026-10-29"]);
  });

  it("doesn't excuse a day with nothing done because you wrapped up", async () => {
    const nothing = (b: DemoBackend) => {
      b.todoist.completed = async () => [];
    };
    const r = await started({
      start: at(28, 16),
      demo: false,
      setup: combine(meetings(), untimed, nothing),
      life: { streak: 3, snacks: 0, dayCompleted: 0, dayPlanned: 3, dayTarget: 3, dayWorkday: true, daySeen: true },
    });
    await r.brain.wrapUp(r.brain.wrapDraft());
    r.clock.t = at(29, 9);
    r.brain.tick();
    await vi.waitFor(() => expect(r.brain.getSnapshot().life.dayKey).toBe("2026-10-29"));
    // The v0.3 rules: no task, no snack: the streak breaks (and can be repaired).
    expect(r.brain.getSnapshot().life.streak).toBe(0);
    expect(r.brain.getSnapshot().life.repair?.streak).toBe(3);
  });
});

describe("Brain v0.4 review: kind words wait through 'done for today'", () => {
  it("tells Friday's frozen streak on Monday morning, after the PC was left on all weekend", async () => {
    const nothing = (b: DemoBackend) => {
      b.todoist.completed = async () => [];
    };
    const r = await started({
      start: at(30, 16),
      demo: false,
      setup: combine(meetings(), untimed, nothing),
      life: { streak: 3, snacks: 1, dayCompleted: 0, dayPlanned: 3, dayTarget: 3, dayWorkday: true, daySeen: true },
    });
    await r.brain.wrapUp(r.brain.wrapDraft());
    r.brain.dismissBubble(r.brain.getSnapshot().bubble?.id ?? -1, "closed");
    // Two heartbeats, as in life: the first of a new day starts settling the last one, the second tells what it found.
    const tickTo = async (t: number) => {
      r.clock.t = t;
      r.brain.onSample(r.sample());
      r.brain.tick();
      await vi.waitFor(() => expect(r.brain.getSnapshot().loading).toBe(false));
      await new Promise((resolve) => setTimeout(resolve, 20));
      r.brain.tick();
      return r.brain.getSnapshot().bubble;
    };
    for (const t of [at(31, 0, 5), at(31, 9), at(31, 23, 59), new Date(2026, 10, 1, 9).getTime(), new Date(2026, 10, 2, 7, 30).getTime()]) {
      const b = await tickTo(t);
      expect(b?.text ?? "").not.toContain("🍪");
    }
    const monday = await tickTo(new Date(2026, 10, 2, 8, 1).getTime());
    expect(monday?.text).toContain("🍪");
    // Worded for Monday, not for "yesterday".
    expect(monday?.text).toContain("3 days ago");
  });
});

describe("Brain v0.4 review: the overbooked check's window", () => {
  const overbooked = (b: Bubble | null) => (b?.text ?? "").includes("overbooked");
  const heavy = (...events: Parameters<typeof meetings>) => lengths(200, 200, 200, ...events);

  it("speaks up before the middle of the work day", async () => {
    const r = await started({ start: at(28, 10, 58), setup: heavy() });
    expect(overbooked(r.checkAt(11))).toBe(true);
  });

  it("doesn't start after the middle of the work day, however heavy it has become", async () => {
    const r = await started({ start: at(28, 12, 58), setup: heavy() });
    // 13:00 is the middle of 8:00-18:00.
    const seen = r.bubblesIn(120);
    expect(seen.some((b) => overbooked(b))).toBe(false);
  });

  it("doesn't double-count a timed task that is in a meeting", async () => {
    const load = (await started({
      start: at(28, 10),
      setup: combine(
        meetings({ uid: "m", title: "Review", start: at(28, 11), end: at(28, 12) }),
        reshape((t) => (t.id === "2" ? { ...t, due: { date: "2026-10-28T11:00:00", string: "today", datetime: "2026-10-28T11:00:00" }, duration: { amount: 60, unit: "minute" } } : t)),
      ),
    })).brain.currentLoad();
    expect(load.meetingMinutes).toBe(60);
    // Tasks 1 and 4 at the default 30 minutes; the timed one is inside the meeting.
    expect(load.taskMinutes).toBe(60);
  });
});

// ---------- The v0.4 evaluation (feedback-v04-001): stale bubbles, typed apps, the overbooked flow, the demo ----------

describe("Brain v0.4 evaluation: bubbles that went stale are dropped unseen (issues 1 and 8)", () => {
  const abc = { uid: "abc", title: "Client ABC renewal", start: at(28, 9, 20), end: at(28, 10) };
  const bubbleOf = (r: Rig) => r.brain.getSnapshot().bubble;

  it("drops the meeting-soon bubble once the meeting has started, and that is no refusal", async () => {
    const r = await started({ setup: combine(meetings(abc), untimed) });
    r.clock.t = at(28, 9, 16);
    r.brain.runRules(r.clock.t);
    const b = bubbleOf(r)!;
    expect(b.text).toContain("Meeting in 4 min");
    expect(b.validUntil).toBe(at(28, 9, 20));
    // Still ahead: still there.
    r.clock.t = at(28, 9, 19) + 30_000;
    r.brain.pruneBubble();
    expect(bubbleOf(r)?.id).toBe(b.id);
    // Started (the board was open, so nobody saw it): gone, never shown with "in 4 min".
    r.clock.t = at(28, 9, 21);
    r.brain.pruneBubble();
    expect(bubbleOf(r)).toBeNull();
    expect(r.brain.getSnapshot().life.dismissedInRow).toBe(0);
    expect(r.brain.getSnapshot().life.nudgeHoldUntil).toBeNull();
  });

  it("drops it at the heartbeat and at the next rule run too", async () => {
    const r = await started({ setup: combine(meetings(abc), untimed) });
    r.clock.t = at(28, 9, 16);
    r.brain.runRules(r.clock.t);
    expect(bubbleOf(r)).not.toBeNull();
    r.clock.t = at(28, 9, 22);
    r.brain.tick();
    expect(bubbleOf(r)?.text ?? "").not.toContain("Meeting in");
    const again = await started({ setup: combine(meetings(abc), untimed) });
    again.clock.t = at(28, 9, 16);
    again.brain.runRules(again.clock.t);
    again.clock.t = at(28, 9, 22);
    again.brain.runRules(again.clock.t);
    expect(bubbleOf(again)?.text ?? "").not.toContain("Meeting in");
  });

  it("says why in the diary, in words that name no one", async () => {
    const r = await started({ setup: combine(meetings(abc), untimed) });
    const diary = vi.spyOn(r.brain.diary, "add");
    r.clock.t = at(28, 9, 16);
    r.brain.runRules(r.clock.t);
    r.clock.t = at(28, 9, 21);
    r.brain.pruneBubble();
    expect(diary.mock.calls.some((c) => c[0] === "response" && /out of date/.test(String(c[1])))).toBe(true);
  });

  it("drops a 2-minute starter's bubble as soon as the session is stopped, and a focus start's too", async () => {
    const r = await started({ setup: combine(meetings(), untimed) });
    const [one, two] = todayTasks(r);
    r.brain.startTwoMinutes(two);
    expect(bubbleOf(r)?.text).toContain("2 minutes");
    r.brain.stopFocus();
    expect(bubbleOf(r)).toBeNull();
    r.brain.startFocus(one);
    expect(bubbleOf(r)?.text).toContain("25 minutes");
    r.brain.stopFocus();
    expect(bubbleOf(r)).toBeNull();
    r.brain.startBreak(5);
    expect(bubbleOf(r)?.text).toContain("5-minute break");
    r.brain.stopFocus();
    expect(bubbleOf(r)).toBeNull();
  });

  it("drops a confirmation that is waiting past its moment (the board was open all that time)", async () => {
    const r = await started({ setup: combine(meetings(), untimed) });
    const [, two] = todayTasks(r);
    r.brain.startTwoMinutes(two);
    const first = bubbleOf(r)!;
    expect(first.validUntil).toBe(r.clock.t + 30_000);
    r.clock.t += 20_000;
    r.brain.pruneBubble();
    expect(bubbleOf(r)?.id).toBe(first.id);
    r.clock.t += 20_000;
    r.brain.pruneBubble();
    expect(bubbleOf(r)).toBeNull();
    // The session itself is untouched.
    expect(r.brain.getSnapshot().focus?.starter).toBe(true);
  });

  it("drops a timed task's bubble when the task was finished somewhere else", async () => {
    // Task 2 is due at 10:00; at 9:52 it is "in 8 min".
    const r = await started({ setup: meetings() });
    r.clock.t = at(28, 9, 52);
    r.brain.runRules(r.clock.t);
    const b = bubbleOf(r)!;
    expect(b.text).toMatch(/in 8 min/i);
    expect(b.validUntil).toBe(at(28, 10));
    // Deleted elsewhere (finished elsewhere would be answered by a cheer of its own).
    await r.backend.todoist.remove("2");
    await r.brain.refresh();
    expect(bubbleOf(r)).toBeNull();
  });

  it("drops the 'due now' bubble five minutes on, and the 'in 8 min' one the moment it is due", async () => {
    const r = await started({ setup: meetings() });
    r.clock.t = at(28, 9, 52);
    r.brain.runRules(r.clock.t);
    r.clock.t = at(28, 10) + 30_000;
    r.brain.pruneBubble();
    expect(bubbleOf(r)).toBeNull();
    r.brain.runRules(r.clock.t);
    const now = bubbleOf(r)!;
    expect(now.text).toMatch(/time/i);
    expect(now.validUntil).toBe(at(28, 10, 5));
    r.clock.t = at(28, 10, 6);
    r.brain.pruneBubble();
    expect(bubbleOf(r)).toBeNull();
  });

  it("drops the overbooked warning once the day fits again", async () => {
    const r = await started({ start: at(28, 8, 58), setup: lengths(200, 200, 200) });
    const b = r.checkAt(9)!;
    expect(b.text).toContain("overbooked");
    expect(bubbleOf(r)?.id).toBe(b.id);
    for (const t of todayTasks(r).slice(0, 2)) await r.brain.reschedule(t, "tomorrow");
    expect(r.brain.currentLoad().overBy).toBeLessThan(60);
    expect(bubbleOf(r)).toBeNull();
  });

  it("drops an 'as planned' card whose task was finished somewhere else", async () => {
    const r = await started({ setup: combine(meetings(), untimed) });
    const sprint = todayTasks(r).find((t) => t.id === "4")!;
    r.answer(r.step()!); // the morning greeting
    r.brain.setStartTrigger(sprint, { kind: "afterLunch" });
    r.clock.t = at(28, 13, 1);
    const b = r.until((x) => x.text.startsWith("As planned"));
    expect(bubbleOf(r)?.id).toBe(b.id);
    await r.backend.todoist.remove("4");
    await r.brain.refresh();
    expect(bubbleOf(r)).toBeNull();
  });

  it("drops a regular nudge whose task is gone before anyone read it", async () => {
    const r = await started({ setup: combine(meetings(), untimed) });
    r.answer(r.step()!); // the morning greeting
    const nudge = r.until((x) => x.kind === "nudge", 120);
    const next = r.brain.getSnapshot().next!;
    expect(nudge.text).toContain(next.content);
    await r.backend.todoist.remove(next.id);
    await r.brain.refresh();
    expect(bubbleOf(r)).toBeNull();
  });

  it("shows over the board only what is urgent and asks or announces something", () => {
    const base: Bubble = { id: 1, text: "x", actions: [], seconds: 5, urgent: false, reminder: false };
    const act = [{ title: "OK", run: () => undefined }];
    expect(showsOverBoard({ ...base, urgent: true, reminder: true })).toBe(true); // a meeting, a timed task
    expect(showsOverBoard({ ...base, urgent: true, actions: act })).toBe(true); // "Is it done?"
    expect(showsOverBoard({ ...base, urgent: true })).toBe(false); // "Added ✔︎": the board says so itself
    expect(showsOverBoard({ ...base, actions: act, reminder: true })).toBe(false); // not urgent: it waits
  });
});

describe("Brain v0.4 evaluation: the meeting's related tasks can be opened (issue 13)", () => {
  const abc = { uid: "abc", title: "Client ABC renewal", start: at(28, 9, 20), end: at(28, 10) };

  it("adds an Open button per related task, which asks the board to focus that task", async () => {
    const r = await started({ setup: combine(meetings(abc), untimed) });
    const openBoard = vi.fn();
    r.brain.effects = { openBoard };
    r.clock.t = at(28, 9, 16);
    r.brain.runRules(r.clock.t);
    const b = r.brain.getSnapshot().bubble!;
    expect(titles(b)).toEqual(["Open “Call client ABC”", "OK"]);
    expect(b.actions[0].primary).toBe(true);
    r.brain.pickAction(b.id, 0);
    expect(openBoard).toHaveBeenCalledWith(false, undefined, { focusTaskId: "2" });
  });

  it("has only OK when nothing is related", async () => {
    const r = await started({ setup: combine(meetings({ ...abc, title: "Weekly sync" }), untimed) });
    r.clock.t = at(28, 9, 16);
    r.brain.runRules(r.clock.t);
    expect(titles(r.brain.getSnapshot().bubble)).toEqual(["OK"]);
  });

  // v0.4 evaluation round 2, minor: "Open “Draft the Clien…”" was cut at 16 characters even with room for the rest.
  it("shows a single related task's title in full up to 26 characters, and cuts it short when there are more buttons", async () => {
    const rename = reshape((t) => (t.id === "2" ? { ...t, content: "Call client ABC renewal!" } : t));
    const r = await started({ setup: combine(meetings(abc), untimed, rename) });
    r.clock.t = at(28, 9, 16);
    r.brain.runRules(r.clock.t);
    expect(titles(r.brain.getSnapshot().bubble)).toEqual(["Open “Call client ABC renewal!”", "OK"]);
    r.stop();
    const long = reshape((t) => (t.id === "2" ? { ...t, content: "Call client ABC about the renewal terms" } : t));
    const r2 = await started({ setup: combine(meetings(abc), untimed, long) });
    r2.clock.t = at(28, 9, 16);
    r2.brain.runRules(r2.clock.t);
    expect(titles(r2.brain.getSnapshot().bubble)![0]).toBe("Open “Call client ABC about the…”");
  });

  it("cuts a long task title on its button", async () => {
    const r = await started({ setup: combine(meetings(abc), untimed) });
    await r.brain.add("Prepare the client renewal terms and the whole pricing table", "today", 1);
    r.clock.t = at(28, 9, 16);
    r.brain.runRules(r.clock.t);
    const open = titles(r.brain.getSnapshot().bubble)!.filter((t) => t.startsWith("Open"));
    expect(open.length).toBeGreaterThan(0);
    for (const t of open) expect(t.length).toBeLessThanOrEqual(24);
  });
});

describe("Brain v0.4 evaluation: typed app names (issue 2)", () => {
  const FIGMA = { app: { name: "Figma", exe: "figma.exe", title: "Landing page" }, url: null };

  it("knows which typed names match an app seen lately", async () => {
    const r = await started({ setup: combine(meetings(), untimed) });
    r.brain.onSample(r.sample({ ...FIGMA, appSwitchedAt: r.clock.t }));
    r.brain.onSample(r.sample({ appSwitchedAt: r.clock.t + 1 }));
    expect(r.brain.recentAppMatch("fig")?.name).toBe("Figma");
    expect(r.brain.recentAppMatch("Figma.exe")?.name).toBe("Figma");
    expect(r.brain.recentAppMatch("code")?.name).toBe("Visual Studio Code");
    expect(r.brain.recentAppMatch("photoshop")).toBeNull();
    expect(r.brain.recentAppMatch("fi")).toBeNull();
  });

  it("stores 'Figma.exe' as Figma and fires when Figma comes to the front", async () => {
    const r = await started({ setup: combine(meetings(), untimed) });
    const sprint = todayTasks(r).find((t) => t.id === "4")!;
    r.answer(r.step()!); // the morning greeting
    expect(r.brain.setStartTrigger(sprint, { kind: "appOpen", app: "  Figma.exe " })).toBe(true);
    expect(r.brain.getSnapshot().triggers[0].trigger).toEqual({ kind: "appOpen", app: "Figma" });
    r.brain.onSample(r.sample({ ...FIGMA, appSwitchedAt: r.clock.t + 1000 }));
    r.clock.t += 20_000;
    const b = r.step(0);
    expect(b?.text).toBe("As planned: “Plan the next sprint”");
  });

  it("fires a plan typed as 'fig'", async () => {
    const r = await started({ setup: combine(meetings(), untimed) });
    const sprint = todayTasks(r).find((t) => t.id === "4")!;
    r.answer(r.step()!);
    r.brain.setStartTrigger(sprint, { kind: "appOpen", app: "fig" });
    r.brain.onSample(r.sample({ ...FIGMA, appSwitchedAt: r.clock.t + 1000 }));
    r.clock.t += 20_000;
    expect(r.step(0)?.text).toBe("As planned: “Plan the next sprint”");
  });
});

describe("Brain v0.4 evaluation: lighten the day (issue 3)", () => {
  it("'Pick tasks to move' opens the board in the lighten-the-day state", async () => {
    const r = await started({ start: at(28, 8, 58), setup: lengths(200, 200, 200) });
    const openBoard = vi.fn();
    r.brain.effects = { openBoard };
    const b = r.checkAt(9)!;
    r.brain.pickAction(b.id, 0);
    expect(openBoard).toHaveBeenCalledWith(false, undefined, { lighten: true });
  });

  it("knows each task's estimate: its Todoist duration, else the default", async () => {
    const r = await started({ setup: combine(meetings(), untimed, lasting({ "1": 90 })) });
    const [one, two] = todayTasks(r);
    expect(r.brain.estimateOf(one)).toEqual({ minutes: 90, own: true });
    expect(r.brain.estimateOf(two)).toEqual({ minutes: 30, own: false });
  });

  it("moves one task to the next workday and the load drops at once", async () => {
    const r = await started({ start: at(28, 9), setup: lengths(200, 200, 200) });
    const before = r.brain.currentLoad();
    const [one] = todayTasks(r);
    expect(await r.brain.moveToNextWorkday(one)).toBe(true);
    expect(todayTasks(r).map((t) => t.id)).not.toContain(one.id);
    expect(r.brain.currentLoad().taskMinutes).toBe(before.taskMinutes - 200);
  });

  it("moves to Monday on a Friday, as the Wrap up sheet does", async () => {
    const r = await started({ start: at(30, 16), setup: combine(meetings(), untimed), demo: false });
    r.brain.setDemoWeekends(true);
    const [one] = todayTasks(r);
    const moves: string[] = [];
    const reschedule = r.backend.todoist.reschedule.bind(r.backend.todoist);
    r.backend.todoist.reschedule = async (id, due) => {
      moves.push(`${id}:${due}`);
      return reschedule(id, due);
    };
    await r.brain.moveToNextWorkday(one);
    expect(moves).toEqual([`${one.id}:2026-11-02`]);
  });
});

describe("Brain v0.4 evaluation: demo reach (issue 11)", () => {
  it("shows the end-of-day review at any hour, past the gap between bubbles", async () => {
    const r = await started({ start: at(28, 11), setup: combine(meetings(), untimed), prefs: { bubbleGap: 15 } });
    r.brain.say({ text: "Just now", seconds: 5, urgent: true });
    r.brain.dismissBubble(r.brain.getSnapshot().bubble!.id, "ignored");
    r.brain.demoReview();
    const b = r.brain.getSnapshot().bubble!;
    expect(b.text).toMatch(/end of day/i);
    expect(titles(b)).toEqual(["Wrap up", "Move to tomorrow", "Keep going"]);
    const openWrapUp = vi.fn();
    r.brain.effects = { openWrapUp };
    r.brain.pickAction(b.id, 0);
    expect(openWrapUp).toHaveBeenCalledOnce();
  });

  it("can pretend weekends are weekends, so 'Monday' shows after a Friday", async () => {
    const r = await started({ start: at(30, 16), setup: combine(meetings(), untimed) });
    expect(r.brain.wrapDay()).toEqual({ day: "2026-10-31", isTomorrow: true });
    r.brain.setDemoWeekends(true);
    expect(r.brain.wrapDay()).toEqual({ day: "2026-11-02", isTomorrow: false });
    r.brain.setDemoWeekends(false);
    expect(r.brain.wrapDay().isTomorrow).toBe(true);
  });

  it("jumps to the start of the next workday: Monday after a Friday, with weekends on", async () => {
    const r = await started({ start: at(30, 16), setup: combine(meetings(), untimed) });
    expect(r.brain.nextMorning()).toBe(at(31, 8, 20));
    r.brain.setDemoWeekends(true);
    expect(r.brain.nextMorning()).toBe(new Date(2026, 10, 2, 8, 20).getTime());
  });

  it("brings what you moved to tomorrow back as today's tasks the next morning", async () => {
    const r = await started({ start: at(28, 16, 30), setup: meetings() });
    const sprint = todayTasks(r).find((t) => t.id === "4")!;
    await r.brain.moveToNextWorkday(sprint);
    expect(todayTasks(r).map((t) => t.id)).not.toContain("4");
    r.clock.t = r.brain.nextMorning();
    r.brain.tick();
    await r.brain.refresh();
    expect(new Date(r.clock.t).getDate()).toBe(29);
    expect(todayTasks(r).map((t) => t.id)).toContain("4");
    expect(r.brain.getSnapshot().day.overdue.map((t) => t.id)).toContain("1");
  });
});

describe("Brain v0.4 evaluation round 2: the morning greeting after a day with nothing done (issue 1)", () => {
  /** Todoist knows of nothing finished on any past day, so the day that ends was a missed one. */
  const nothingDone: Setup = (b) => {
    b.todoist.completed = async () => [];
  };
  const missed = { streak: 5, snacks: 1, dayCompleted: 0, dayPlanned: 3, dayTarget: 3, dayWorkday: true, daySeen: true };

  /** Wraps up at 16:00 with “Call client ABC” as the frog and a note; `extra` is what the test changes in the rig. */
  async function wrapped(start: number, extra: RigOptions = {}) {
    const r = await started({ start, setup: combine(meetings(), evergreen, nothingDone), life: missed, prefs: { bubbleGap: 15 }, ...extra });
    r.brain.setDemoWeekends(extra.demo === false ? false : new Date(start).getDay() === 5);
    await r.brain.wrapUp(draftFor(r, (d, tasks) => setNote(chooseFrog(d, tasks, "2"), "Start with the numbers tab")));
    r.brain.dismissBubble(r.brain.getSnapshot().bubble?.id ?? -1, "closed");
    return r;
  }
  /** The demo's “Next morning” button: the clock jumps, the pet notices, the day settles, the beats go on. */
  async function wakeUp(r: Rig, minutes = 20) {
    const day = dayKey(new Date(r.brain.nextMorning()));
    r.clock.t = r.brain.nextMorning();
    r.brain.onSample(r.sample());
    r.brain.tick();
    await vi.waitFor(() => expect(r.brain.getSnapshot().life.dayKey).toBe(day));
    await vi.waitFor(() => expect(r.brain.getSnapshot().loading).toBe(false));
    const seen: Bubble[] = [];
    for (let i = 0; i < minutes; i++) {
      // A beat of the pet, as in life (it tells the waiting kind words and then runs the rules).
      if (i > 0) r.clock.t += MIN;
      r.brain.onSample(r.sample());
      r.brain.tick();
      const b = r.brain.getSnapshot().bubble;
      if (!b) continue;
      seen.push(b);
      r.brain.dismissBubble(b.id, "closed");
    }
    return seen;
  }

  it("brings the frog and the note in the greeting, with the snack's kind word in the same bubble", async () => {
    const r = await wrapped(at(28, 16));
    const seen = await wakeUp(r);
    const first = seen[0];
    expect(first.text).toContain("Good morning");
    expect(first.text).toMatch(/picked[^\n]*“Call client ABC”/);
    expect(first.text).toContain("📝 Your note: “Start with the numbers tab”");
    // The kind word comes after the greeting, in the same bubble, and is said only once.
    expect(first.text).toContain("Nothing got done yesterday, so I ate a snack to keep your 🔥5 streak safe");
    expect(first.text.indexOf("Good morning")).toBeLessThan(first.text.indexOf("ate a snack"));
    expect(seen.filter((b) => b.text.includes("ate a snack"))).toHaveLength(1);
    expect(first.reminder).toBe(true);
    expect(first.kind).toBeUndefined();
    expect(r.brain.getSnapshot().nudgesLeft).toBe(defaultPrefs(0).nudgeBudget);
  });

  it("does the same on a Friday evening wrapped up, for Monday morning", async () => {
    const r = await wrapped(at(30, 16));
    expect(r.brain.wrapDay().isTomorrow).toBe(false);
    const seen = await wakeUp(r);
    const first = seen[0];
    expect(new Date(r.clock.t).getDay()).toBe(1);
    expect(first.text).toContain("Good morning");
    expect(first.text).toMatch(/picked[^\n]*“Call client ABC”/);
    expect(first.text).toContain("Your note: “Start with the numbers tab”");
    expect(first.text).toContain("ate a snack");
    expect(first.text).toContain("3 days ago");
    expect(seen.filter((b) => b.text.includes("ate a snack"))).toHaveLength(1);
  });

  it("does the same through two mornings in a row (greeting, nothing done, wrap up with a note, next morning)", async () => {
    const r = await wrapped(at(28, 16));
    await wakeUp(r);
    // Thursday goes by with nothing done either; Thursday evening: wrap up with a note again.
    r.clock.t = at(29, 16);
    r.brain.onSample(r.sample());
    r.brain.tick();
    await vi.waitFor(() => expect(r.brain.getSnapshot().loading).toBe(false));
    await r.brain.wrapUp(draftFor(r, (d, tasks) => setNote(chooseFrog(d, tasks, "4"), "Open the budget sheet")));
    r.brain.dismissBubble(r.brain.getSnapshot().bubble?.id ?? -1, "closed");
    const seen = await wakeUp(r);
    const first = seen[0];
    expect(first.text).toContain("Good morning");
    expect(first.text).toContain("“Plan the next sprint”");
    expect(first.text).toContain("Your note: “Open the budget sheet”");
    expect(first.text).toMatch(/snack|streak/);
  });

  it("speaks Vietnamese in the same bubble, greeting first", async () => {
    const r = await wrapped(at(28, 16));
    setLang("vi");
    const seen = await wakeUp(r);
    const first = seen[0];
    expect(first.text).toContain("Chào buổi sáng");
    expect(first.text).toContain("Ghi chú của bạn: “Start with the numbers tab”");
    expect(first.text).toContain("mình ăn một bánh để giữ chuỗi 🔥5");
    expect(first.text.indexOf("Chào buổi sáng")).toBeLessThan(first.text.indexOf("mình ăn một bánh"));
  });

  it("still says the kind word alone when there is no greeting to put it in (a day off)", async () => {
    const r = await started({
      start: at(28, 9),
      setup: combine(meetings(), evergreen, nothingDone),
      life: { ...missed, dayKey: "2026-10-27" },
      prefs: { bubbleGap: 15, restDays: ["2026-10-28"] },
    });
    r.brain.tick();
    const b = r.brain.getSnapshot().bubble;
    expect(b?.text ?? "").toContain("ate a snack");
    expect(b?.text ?? "").not.toContain("Good morning");
    expect(b?.reminder).toBe(false);
  });

  it("does not hold the kind word back when the greeting was already said", async () => {
    const r = await started({ start: at(28, 9), setup: combine(meetings(), evergreen, nothingDone), life: { ...missed, dayKey: "2026-10-28" }, prefs: { bubbleGap: 0 } });
    const greeting = r.until((b) => b.text.includes("Good morning"));
    r.brain.dismissBubble(greeting.id, "closed");
    // Todoist could only say later that yesterday was a missed one.
    r.brain.demoMissDay();
    const b = r.brain.getSnapshot().bubble;
    expect(b?.text).toContain("ate a snack");
    expect(b?.text).not.toContain("Good morning");
  });
});

describe("Brain v0.4 evaluation round 2: Friday says Monday everywhere (issue 3)", () => {
  /** Friday 30 October, 16:30, weekends off. */
  const friday = async (lang: "en" | "vi" = "en") => {
    const r = await started({ start: at(30, 16, 30), setup: combine(meetings(), untimed) });
    r.brain.setDemoWeekends(true);
    setLang(lang);
    return r;
  };

  it("names the next workday, once, from the brain: Monday on a Friday, nothing on a Wednesday", async () => {
    const r = await friday();
    expect(r.brain.wrapDayName()).toBe("Monday");
    setLang("vi");
    expect(r.brain.wrapDayName()).toBe("Thứ Hai");
    r.brain.setDemoWeekends(false);
    expect(r.brain.wrapDayName()).toBeNull();
  });

  it("says Monday in the review bubble and on its button, and 'tomorrow' on a weekday", async () => {
    const r = await friday();
    r.brain.demoReview();
    const b = r.brain.getSnapshot().bubble!;
    expect(b.text).toContain("move the remaining 3 to Monday?");
    expect(b.text).not.toMatch(/tomorrow/i);
    expect(titles(b)).toEqual(["Wrap up", "Move to Monday", "Keep going"]);
    r.brain.setDemoWeekends(false);
    r.brain.demoReview();
    const w = r.brain.getSnapshot().bubble!;
    expect(w.text).toContain("to tomorrow?");
    expect(titles(w)).toEqual(["Wrap up", "Move to tomorrow", "Keep going"]);
  });

  it("says it in Vietnamese too", async () => {
    const r = await friday("vi");
    r.brain.demoReview();
    const b = r.brain.getSnapshot().bubble!;
    expect(b.text).toContain("dời hết sang Thứ Hai?");
    expect(b.text).not.toMatch(/\bmai\b/i);
    expect(titles(b)).toEqual(["Tổng kết ngày", "Dời sang Thứ Hai", "Làm tiếp"]);
  });

  it("says 'Monday starts with…' after Done for today, and 'Monday' when the quick option moves the rest", async () => {
    const r = await friday();
    await r.brain.wrapUp(draftFor(r, (d, tasks) => chooseFrog(d, tasks, "2")));
    expect(r.brain.getSnapshot().bubble?.text).toBe("All wrapped up 🌙 Rest well. Monday starts with “Call client ABC” 🐸");
    expect(r.brain.getSnapshot().bubble?.text).not.toMatch(/tomorrow/i);
    const r2 = await friday();
    await r2.brain.moveTodayToTomorrow();
    expect(r2.brain.getSnapshot().bubble?.text).toBe("Moved 3 tasks to Monday. Rest well 🌙");
  });

  it("starts the day after with 'Tomorrow starts with…' on a Wednesday", async () => {
    const r = await started({ start: at(28, 16), setup: combine(meetings(), untimed) });
    await r.brain.wrapUp(draftFor(r, (d, tasks) => chooseFrog(d, tasks, "2")));
    expect(r.brain.getSnapshot().bubble?.text).toBe("All wrapped up 🌙 Rest well. Tomorrow starts with “Call client ABC” 🐸");
  });

  it("writes the diary with the day's name too", async () => {
    const r = await friday();
    const add = vi.spyOn(r.brain.diary, "add");
    await r.brain.wrapUp(draftFor(r, (d, tasks) => chooseFrog(chooseMove(d, tasks, "4", "tomorrow"), tasks, "2")));
    const texts = add.mock.calls.map((c) => c[1]).join("\n");
    expect(texts).toContain("1 moved to Monday");
    expect(texts).toContain("Monday's frog “Call client ABC”");
  });
});

describe("Brain v0.4 evaluation round 2: 'Move some?' over the open board (issue 2)", () => {
  const heavy = (b: DemoBackend) => b.demo.setHeavyDay(true);
  const overbooked = async () => {
    const r = await started({ start: at(28, 9), setup: combine(meetings(), untimed), prefs: { bubbleGap: 0 } });
    heavy(r.backend);
    await r.brain.demoOverbooked();
    const b = r.brain.getSnapshot().bubble!;
    expect(b.text).toMatch(/overbooked/i);
    return { r, b };
  };

  it("is a check-in that shows in the open board (a banner), though it is not urgent", async () => {
    const { b } = await overbooked();
    expect(b.urgent).toBe(false);
    expect(b.inBoard).toBe(true);
    expect(showsOverBoard(b)).toBe(true);
  });

  it("is not shown again over the pet once it was read as a banner and the board closes", async () => {
    const { r, b } = await overbooked();
    r.brain.bannerRead(b.id);
    r.brain.boardClosed();
    expect(r.brain.getSnapshot().bubble).toBeNull();
    // No refusal and no reminder skipped: it costs nothing.
    expect(r.brain.getSnapshot().life.dismissedInRow).toBe(0);
    expect(r.brain.getSnapshot().life.dayBackoff).toEqual({});
  });

  it("stays when the board closes without ever showing it (it was not read)", async () => {
    const { r, b } = await overbooked();
    r.brain.boardClosed();
    expect(r.brain.getSnapshot().bubble?.id).toBe(b.id);
  });

  it("is not said at all while the lighten view is open, and may be again once the board has closed", async () => {
    const r = await started({ start: at(28, 9), setup: combine(meetings(), untimed), prefs: { bubbleGap: 0 } });
    heavy(r.backend);
    r.brain.setLightening(true);
    await r.brain.demoOverbooked();
    expect(r.brain.getSnapshot().bubble).toBeNull();
    r.brain.boardClosed();
    await r.brain.demoOverbooked();
    expect(r.brain.getSnapshot().bubble?.text).toMatch(/overbooked/i);
  });

  it("goes when the lighten view opens (that was its question), whoever opened it", async () => {
    const { r, b } = await overbooked();
    r.brain.setLightening(true);
    expect(r.brain.getSnapshot().bubble?.id).not.toBe(b.id);
    expect(r.brain.getSnapshot().bubble).toBeNull();
  });

  it("is dropped by the lighten view only if it is that bubble", async () => {
    const { r } = await overbooked();
    r.brain.dismissBubble(r.brain.getSnapshot().bubble!.id, "closed");
    r.brain.say({ text: "Something else", seconds: 5 });
    r.brain.setLightening(true);
    expect(r.brain.getSnapshot().bubble?.text).toBe("Something else");
  });

  it("is still the same bubble that other check-ins in the board never get dropped by accident", async () => {
    const r = await started({ start: at(28, 9), setup: combine(meetings(), untimed) });
    r.brain.say({ text: "Meeting in 4 min", seconds: 90, urgent: true, actions: [{ title: "OK", run: () => undefined }] }, { why: "a meeting" });
    const id = r.brain.getSnapshot().bubble!.id;
    r.brain.bannerRead(id);
    r.brain.boardClosed();
    // An urgent bubble is news that stays true: it is still there.
    expect(r.brain.getSnapshot().bubble?.id).toBe(id);
  });

  it("says in the diary that it was seen, not refused", async () => {
    const { r, b } = await overbooked();
    const add = vi.spyOn(r.brain.diary, "add");
    r.brain.bannerRead(b.id);
    r.brain.boardClosed();
    const text = add.mock.calls.map((c) => c[1]).join("\n");
    expect(text).toMatch(/seen|saw/i);
    expect(text).not.toMatch(/closed the bubble|no response/i);
  });
});

describe("Brain v0.4 evaluation round 2: the review with nothing left, and what a stale bubble costs (minor items)", () => {
  it("doesn't offer to move 'the remaining 0' when nothing is left", async () => {
    const r = await started({ start: at(28, 16, 30), setup: combine(meetings(), untimed, only("5")) });
    expect(todayTasks(r)).toEqual([]);
    r.brain.demoReview();
    const b = r.brain.getSnapshot().bubble!;
    expect(b.text).not.toMatch(/remaining 0|move the remaining/i);
    expect(b.text).toMatch(/Wrap up the day/);
    expect(titles(b)).toEqual(["Wrap up", "Keep going"]);
    setLang("vi");
    r.brain.demoReview();
    const v = r.brain.getSnapshot().bubble!;
    expect(v.text).not.toMatch(/Còn 0 việc|dời hết/);
    expect(titles(v)).toEqual(["Tổng kết ngày", "Làm tiếp"]);
  });

  it("gives back the reminder it counted when a bubble goes stale unseen (it costs nothing)", async () => {
    const r = await started({ start: at(28, 9, 5), setup: combine(meetings(), untimed) });
    r.brain.dismissBubble(r.brain.getSnapshot().bubble?.id ?? -1, "closed");
    const before = r.brain.getSnapshot().nudgesLeft;
    let valid = true;
    r.brain.say({ text: "Still on this?", seconds: 30, actions: [{ title: "Yes", run: () => undefined }], stillValid: () => valid }, { why: "a nudge", kind: "nudge" });
    expect(r.brain.getSnapshot().nudgesLeft).toBe(before - 1);
    valid = false;
    expect(r.brain.pruneBubble()).toBe(true);
    expect(r.brain.getSnapshot().bubble).toBeNull();
    expect(r.brain.getSnapshot().nudgesLeft).toBe(before);
    // ...but a reminder you saw and closed is spent.
    r.brain.say({ text: "Again?", seconds: 30, actions: [{ title: "Yes", run: () => undefined }] }, { why: "a nudge", kind: "nudge" });
    r.brain.dismissBubble(r.brain.getSnapshot().bubble!.id, "closed");
    expect(r.brain.getSnapshot().nudgesLeft).toBe(before - 1);
  });

  it("never refunds below nothing, and not for a bubble that wasn't counted", async () => {
    const r = await started({ start: at(28, 9, 5), setup: combine(meetings(), untimed) });
    r.brain.dismissBubble(r.brain.getSnapshot().bubble?.id ?? -1, "closed");
    const before = r.brain.getSnapshot().nudgesLeft;
    r.brain.say({ text: "A check-in", seconds: 30, actions: [{ title: "Yes", run: () => undefined }], stillValid: () => false }, { why: "a check-in" });
    r.brain.pruneBubble();
    expect(r.brain.getSnapshot().nudgesLeft).toBe(before);
  });
});
