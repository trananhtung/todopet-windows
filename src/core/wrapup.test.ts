// SPEC v0.4 §3 (Shutdown ritual) and §4 (day strip): the pure parts.
import { describe, expect, it } from "vitest";
import type { CalEvent } from "./calendar";
import { dayStrip, loadLevel } from "./load";
import { actionable, buildDay, nextTask, ranked, taskFromRaw, type TodoTask } from "./models";
import { defaultMoodInputs, evaluateMood } from "./mood";
import { defaultPrefs, isWorkday, prefsFromJson } from "./prefs";
import { DEFAULT_ESTIMATE } from "./load";
import {
  canMove,
  canWrapUp,
  chooseFrog,
  chooseMove,
  draftFrog,
  emptyPlanDoc,
  isDoneForToday,
  MAX_NOTE_LENGTH,
  moveAllToTomorrow,
  newDraft,
  nextWorkday,
  nextWorkdayStart,
  planFor,
  planFromDraft,
  planFromJson,
  planToJson,
  prunePlans,
  setNote,
  setPlan,
  tidyNote,
  wrapMoves,
  type DayPlan,
} from "./wrapup";

// Wednesday 28 October 2026, local time. Friday is the 30th, Monday the 2nd of November.
const at = (h: number, m = 0, day = 28, month = 9) => new Date(2026, month, day, h, m);
const task = (id: string, extra: Partial<TodoTask> = {}): TodoTask => ({ ...taskFromRaw({ id, content: `Task ${id}` }), ...extra });
const recurring = { date: "2026-10-28", string: "every day", isRecurring: true, datetime: null };
const plan = (day: string, extra: Partial<DayPlan> = {}): DayPlan => ({ day, frogId: "a", note: "Start with the intro", ...extra });
const workday = (d: Date) => isWorkday(defaultPrefs(), d);

describe("the Wrap up entry", () => {
  it("is in the board menu from 15:00", () => {
    expect(canWrapUp(at(14, 59))).toBe(false);
    expect(canWrapUp(at(15, 0))).toBe(true);
    expect(canWrapUp(at(23, 30))).toBe(true);
    expect(canWrapUp(at(15, 0).getTime())).toBe(true);
  });
});

describe("the one-line note", () => {
  it("collapses spaces, trims and stops at the limit", () => {
    expect(tidyNote("  Fix   the\n retry\tloop ")).toBe("Fix the retry loop");
    expect(tidyNote("x".repeat(MAX_NOTE_LENGTH + 50))).toHaveLength(MAX_NOTE_LENGTH);
    expect(tidyNote("   ")).toBeNull();
    expect(tidyNote("")).toBeNull();
  });

  it("is null for anything that is not text", () => {
    for (const bad of [null, undefined, 4, {}, ["a"], true]) expect(tidyNote(bad)).toBeNull();
  });

  it("never cuts an emoji in half", () => {
    const note = tidyNote("👩‍💻".repeat(MAX_NOTE_LENGTH));
    expect(note).not.toBeNull();
    expect([...new Intl.Segmenter("und", { granularity: "grapheme" }).segment(note ?? "")]).toHaveLength(MAX_NOTE_LENGTH);
  });
});

describe("the stored plan", () => {
  const now = at(16).getTime();

  it("keeps a plan for today and later, and drops earlier days", () => {
    const doc = planFromJson({ plans: [plan("2026-10-27"), plan("2026-10-29"), plan("2026-10-28", { frogId: "b" })], doneUntil: null }, now);
    expect(doc.plans.map((p) => p.day)).toEqual(["2026-10-28", "2026-10-29"]);
    expect(planFor(doc, "2026-10-29")?.frogId).toBe("a");
    expect(planFor(doc, "2026-10-27")).toBeNull();
  });

  it("survives a round trip", () => {
    const doc = setPlan(emptyPlanDoc(), plan("2026-10-29"));
    const back = planFromJson(JSON.parse(JSON.stringify(planToJson({ ...doc, doneUntil: at(8, 0, 29).getTime() }))), now);
    expect(back).toEqual({ plans: [plan("2026-10-29")], doneUntil: at(8, 0, 29).getTime() });
  });

  it("reads nothing from nonsense", () => {
    for (const raw of [null, undefined, 5, "plan", [], { plans: "x" }, { plans: [null, 3, "x", {}] }]) {
      expect(planFromJson(raw, now), JSON.stringify(raw)).toEqual(emptyPlanDoc());
    }
  });

  it("drops entries with a bad day, and entries with neither a frog nor a note", () => {
    const doc = planFromJson(
      { plans: [plan("2026-02-30"), plan("tomorrow"), plan("2026-10-29", { frogId: null, note: null }), plan("2026-10-30", { frogId: null, note: "kept" })] },
      now,
    );
    expect(doc.plans).toEqual([{ day: "2026-10-30", frogId: null, note: "kept" }]);
  });

  it("repairs odd fields: wrong types, long text, spaces", () => {
    const doc = planFromJson({ plans: [{ day: "2026-10-29", frogId: 12, note: "  a   b  " }, { day: "2026-10-30", frogId: "x".repeat(100), note: 5 }, { day: "2026-10-31", frogId: " 77 ", note: "n".repeat(500) }] }, now);
    // A frog id that is not a string (or is absurdly long) is no frog at all; a plan with neither is dropped.
    expect(doc.plans).toEqual([
      { day: "2026-10-29", frogId: null, note: "a b" },
      { day: "2026-10-31", frogId: "77", note: "n".repeat(MAX_NOTE_LENGTH) },
    ]);
  });

  it("keeps one plan per day (the later wins) and at most a week of them", () => {
    const many = Array.from({ length: 12 }, (_, i) => plan(`2026-11-${String(i + 1).padStart(2, "0")}`));
    expect(planFromJson({ plans: many }, now).plans).toHaveLength(7);
    const twice = planFromJson({ plans: [plan("2026-10-29", { note: "first" }), plan("2026-10-29", { note: "second" })] }, now);
    expect(twice.plans).toHaveLength(1);
    expect(twice.plans[0].note).toBe("second");
  });

  it("setPlan replaces the day's plan, and an empty one clears it", () => {
    let doc = setPlan(emptyPlanDoc(), plan("2026-10-29"));
    doc = setPlan(doc, plan("2026-10-29", { note: "Changed my mind" }));
    expect(doc.plans).toHaveLength(1);
    expect(planFor(doc, "2026-10-29")?.note).toBe("Changed my mind");
    doc = setPlan(doc, plan("2026-10-29", { frogId: null, note: null }));
    expect(doc.plans).toEqual([]);
  });

  it("prunePlans drops what is over, and only that", () => {
    const doc = { plans: [plan("2026-10-28"), plan("2026-10-29")], doneUntil: 5 };
    expect(prunePlans(doc, "2026-10-29")).toEqual({ plans: [plan("2026-10-29")], doneUntil: 5 });
    expect(prunePlans(doc, "2026-10-28")).toBe(doc);
  });

  it("believes a 'done for today' only if it is in the near future", () => {
    expect(planFromJson({ doneUntil: now + 3_600_000 }, now).doneUntil).toBe(now + 3_600_000);
    expect(planFromJson({ doneUntil: now - 1 }, now).doneUntil).toBeNull();
    // A year out would silence the pet for good: not a thing the app writes.
    expect(planFromJson({ doneUntil: now + 366 * 86_400_000 }, now).doneUntil).toBeNull();
    for (const bad of ["x", NaN, Infinity, -5, null]) expect(planFromJson({ doneUntil: bad }, now).doneUntil, String(bad)).toBeNull();
  });

  it("is done for today until the moment it is told", () => {
    const doc = { plans: [], doneUntil: at(8, 0, 29).getTime() };
    expect(isDoneForToday(doc, at(16))).toBe(true);
    expect(isDoneForToday(doc, at(7, 59, 29))).toBe(true);
    expect(isDoneForToday(doc, at(8, 0, 29))).toBe(false);
    expect(isDoneForToday(emptyPlanDoc(), at(16))).toBe(false);
  });
});

describe("the next workday", () => {
  it("is tomorrow on a weekday, and Monday after Friday", () => {
    expect(nextWorkday(at(16), workday)).toBe("2026-10-29");
    expect(nextWorkday(at(16, 0, 30), workday)).toBe("2026-11-02");
    expect(nextWorkday(at(16, 0, 31), workday)).toBe("2026-11-02");
  });

  it("skips rest days and honours a working Saturday", () => {
    const rest = (d: Date) => isWorkday({ ...defaultPrefs(), restDays: ["2026-11-02", "2026-11-03"] }, d);
    expect(nextWorkday(at(16, 0, 30), rest)).toBe("2026-11-04");
    const saturday = (d: Date) => isWorkday({ ...defaultPrefs(), workSaturday: true }, d);
    expect(nextWorkday(at(16, 0, 30), saturday)).toBe("2026-10-31");
  });

  it("falls back to tomorrow when no day looks like a workday", () => {
    expect(nextWorkday(at(16), () => false)).toBe("2026-10-29");
  });

  it("starts at the beginning of that day's work", () => {
    expect(nextWorkdayStart(at(16), 8, workday)).toBe(at(8, 0, 29).getTime());
    expect(nextWorkdayStart(at(16, 0, 30), 9, workday)).toBe(at(9, 0, 2, 10).getTime());
    // Wrapping up before the day starts is still wrapping up today.
    expect(nextWorkdayStart(at(7, 30), 8, workday)).toBe(at(8, 0, 29).getTime());
  });
});

describe("the Wrap up sheet", () => {
  const tasks = [task("a", { priority: 4 }), task("b", { priority: 3 }), task("r", { priority: 2, due: recurring }), task("c", { priority: 1 })];

  it("starts with nothing moved, the top task as the frog and no note", () => {
    expect(newDraft(tasks)).toEqual({ moves: {}, frogId: "a", note: "" });
    expect(newDraft([])).toEqual({ moves: {}, frogId: null, note: "" });
  });

  it("starts from the plan already made for tomorrow, if its frog is still on the list", () => {
    expect(newDraft(tasks, plan("2026-10-29", { frogId: "b", note: "Call first" }))).toEqual({ moves: {}, frogId: "b", note: "Call first" });
    expect(newDraft(tasks, plan("2026-10-29", { frogId: "gone" })).frogId).toBe("a");
    expect(newDraft(tasks, plan("2026-10-29", { frogId: null, note: "just a note" }))).toMatchObject({ frogId: null, note: "just a note" });
  });

  it("moves a task to tomorrow or off the plan, or keeps it", () => {
    let d = newDraft(tasks);
    d = chooseMove(d, tasks, "b", "tomorrow");
    d = chooseMove(d, tasks, "c", "none");
    expect(wrapMoves(d, tasks)).toEqual({ tomorrow: [tasks[1]], none: [tasks[3]] });
    d = chooseMove(d, tasks, "b", "keep");
    expect(wrapMoves(d, tasks).tomorrow).toEqual([]);
  });

  it("lets a repeating task stay: its schedule is its own", () => {
    expect(canMove(tasks[2])).toBe(false);
    expect(canMove(tasks[0])).toBe(true);
    const d = chooseMove(newDraft(tasks), tasks, "r", "tomorrow");
    expect(d.moves).toEqual({});
    expect(wrapMoves(chooseMove(d, tasks, "r", "none"), tasks)).toEqual({ tomorrow: [], none: [] });
  });

  it("ignores a task that is not on the list", () => {
    const d = newDraft(tasks);
    expect(chooseMove(d, tasks, "nope", "tomorrow")).toBe(d);
    expect(chooseFrog(d, tasks, "nope")).toBe(d);
  });

  it("takes the frog away from a task that leaves the plan, and won't make such a task the frog", () => {
    let d = newDraft(tasks);
    expect(d.frogId).toBe("a");
    d = chooseMove(d, tasks, "a", "none");
    expect(d.frogId).toBeNull();
    expect(chooseFrog(d, tasks, "a")).toBe(d);
    d = chooseFrog(d, tasks, "b");
    expect(d.frogId).toBe("b");
    // Tomorrow is fine for a frog: it is on tomorrow's list.
    d = chooseMove(d, tasks, "b", "tomorrow");
    expect(d.frogId).toBe("b");
    expect(chooseFrog(d, tasks, null).frogId).toBeNull();
  });

  it("moves everything that can move to tomorrow in one tap, leaving the repeating ones", () => {
    const d = moveAllToTomorrow(chooseMove(newDraft(tasks), tasks, "c", "none"), tasks);
    expect(Object.keys(d.moves).sort()).toEqual(["a", "b", "c"]);
    expect(wrapMoves(d, tasks).tomorrow.map((t) => t.id)).toEqual(["a", "b", "c"]);
    // It does not put the frog (or anything else) back on the plan once taken off, except that everything is now tomorrow's.
    expect(d.frogId).toBe("a");
  });

  it("keeps the note to one line of limited length, leaving the spaces alone while you type", () => {
    expect(setNote(newDraft(tasks), "Start ").note).toBe("Start ");
    expect(setNote(newDraft(tasks), "a\nb\r\nc").note).toBe("a b  c");
    expect(setNote(newDraft(tasks), "x".repeat(500)).note).toHaveLength(MAX_NOTE_LENGTH);
  });

  it("finds the frog among tasks that are still there", () => {
    expect(draftFrog(newDraft(tasks), tasks)?.id).toBe("a");
    expect(draftFrog(newDraft(tasks), tasks.slice(1))).toBeNull();
    expect(draftFrog({ moves: { a: "none" }, frogId: "a", note: "" }, tasks)).toBeNull();
  });

  it("makes the plan for the day: the frog's id and the tidy note", () => {
    const d = setNote({ ...newDraft(tasks), frogId: "b" }, "  Start  with the intro ");
    expect(planFromDraft(d, tasks, "2026-10-29")).toEqual({ day: "2026-10-29", frogId: "b", note: "Start with the intro" });
    // No frog, no note: nothing to remember.
    expect(planFromDraft({ moves: {}, frogId: null, note: "  " }, tasks, "2026-10-29")).toEqual({ day: "2026-10-29", frogId: null, note: null });
    // A frog that is not on the list any more is no frog.
    expect(planFromDraft({ moves: {}, frogId: "gone", note: "" }, tasks, "2026-10-29").frogId).toBeNull();
    // A task moved off the plan is no frog.
    expect(planFromDraft({ moves: { a: "none" }, frogId: "a", note: "" }, tasks, "2026-10-29").frogId).toBeNull();
  });
});

describe("the frog first", () => {
  const now = at(11);
  const day = (frogId: string | null) =>
    buildDay(
      [
        task("p1", { priority: 4, due: { date: "2026-10-28", string: null, isRecurring: false, datetime: null } }),
        task("p2", { priority: 3, due: { date: "2026-10-28", string: null, isRecurring: false, datetime: null } }),
        task("low", { priority: 1, due: { date: "2026-10-28", string: null, isRecurring: false, datetime: null } }),
        task("old", { priority: 2, due: { date: "2026-10-25", string: null, isRecurring: false, datetime: null } }),
      ],
      [],
      now,
      frogId,
    );

  it("puts the chosen task first, whatever its priority", () => {
    expect(day(null).today.map((t) => t.id)).toEqual(["p1", "p2", "low"]);
    expect(day("low").today.map((t) => t.id)).toEqual(["low", "p1", "p2"]);
    expect(nextTask(day("low"))?.id).toBe("low");
    expect(actionable(day("low"))[0].id).toBe("low");
  });

  it("works across the overdue list too", () => {
    const d = day("old");
    expect(d.overdue.map((t) => t.id)).toEqual(["old"]);
    expect(nextTask(d)?.id).toBe("old");
    expect(actionable(d).map((t) => t.id)).toEqual(["old", "p1", "p2", "low"]);
  });

  it("changes nothing when the frog is gone or there is none", () => {
    expect(actionable(day("deleted")).map((t) => t.id)).toEqual(actionable(day(null)).map((t) => t.id));
    expect(ranked([task("a", { priority: 1 }), task("b", { priority: 4 })]).map((t) => t.id)).toEqual(["b", "a"]);
    expect(ranked([task("a", { priority: 1 }), task("b", { priority: 4 })], null).map((t) => t.id)).toEqual(["b", "a"]);
  });

  it("puts the steps of a split frog first, since they are the frog now", () => {
    const d = buildDay([task("f", { priority: 1 }), task("s1", { parentId: "f", priority: 1 }), task("top", { priority: 4 })], [], now, "f");
    expect(actionable(d).map((t) => t.id)).toEqual(["s1", "top"]);
    expect(nextTask(d)?.id).toBe("s1");
  });
});

describe("the default estimate", () => {
  it("is 30 minutes, kept between 15 and 120", () => {
    expect(defaultPrefs().defaultEstimate).toBe(30);
    expect(defaultPrefs().defaultEstimate).toBe(DEFAULT_ESTIMATE);
    expect(prefsFromJson({}).defaultEstimate).toBe(30);
    expect(prefsFromJson({ defaultEstimate: 5 }).defaultEstimate).toBe(15);
    expect(prefsFromJson({ defaultEstimate: 14 }).defaultEstimate).toBe(15);
    expect(prefsFromJson({ defaultEstimate: 15 }).defaultEstimate).toBe(15);
    expect(prefsFromJson({ defaultEstimate: 120 }).defaultEstimate).toBe(120);
    expect(prefsFromJson({ defaultEstimate: 121 }).defaultEstimate).toBe(120);
    expect(prefsFromJson({ defaultEstimate: 9999 }).defaultEstimate).toBe(120);
    expect(prefsFromJson({ defaultEstimate: 44.6 }).defaultEstimate).toBe(45);
    expect(prefsFromJson({ defaultEstimate: "60" }).defaultEstimate).toBe(30);
    expect(prefsFromJson({ defaultEstimate: NaN }).defaultEstimate).toBe(30);
  });
});

describe("a pet that is done for today", () => {
  it("sleeps, but still cheers a finished task and guards a focus session", () => {
    expect(evaluateMood({ ...defaultMoodInputs(), doneForToday: true }).mood).toBe("sleeping");
    expect(evaluateMood({ ...defaultMoodInputs(), doneForToday: true, completed: 3, planned: 3 }).mood).toBe("sleeping");
    expect(evaluateMood({ ...defaultMoodInputs(), doneForToday: true, celebratingNow: true }).mood).toBe("celebrating");
    expect(evaluateMood({ ...defaultMoodInputs(), doneForToday: true, focusing: true }).mood).toBe("focus");
    expect(evaluateMood({ ...defaultMoodInputs() }).mood).not.toBe("sleeping");
  });

  it("is at ease, not worried about the plan or the pace, once the day is wrapped up", () => {
    const worried = { ...defaultMoodInputs(), planned: 1, target: 3, hoursAfterPlanDeadline: 3, remaining: 1, minutesSinceProgress: 300, overdue: 2 };
    expect(evaluateMood(worried).score).toBeLessThan(40);
    const wrapped = evaluateMood({ ...worried, doneForToday: true });
    expect(wrapped.score).toBeGreaterThanOrEqual(55);
    expect(wrapped.reasons.map((r) => r.text).join("|")).not.toMatch(/planned|progress/);
  });

  it("doesn't pretend to be asleep without a Todoist token", () => {
    expect(evaluateMood({ ...defaultMoodInputs(), hasToken: false, doneForToday: true }).mood).toBe("normal");
  });
});

describe("the day strip", () => {
  const ev = (id: string, title: string, start: Date, end: Date): CalEvent => ({ id, title, start, end, joinUrl: null });
  const timed = (local: string) => ({ date: local, string: null, isRecurring: false, datetime: local });
  const base = { workStart: 8, workEnd: 18, defaultEstimate: 30 };

  it("gives the work day, the segments and where now is", () => {
    const strip = dayStrip({
      ...base,
      now: at(11),
      tasks: [task("t1", { content: "Call Anna", due: timed("2026-10-28T14:00:00"), durationMinutes: 60 }), task("t2")],
      events: [ev("e1", "Team sync", at(10), at(11)), ev("e2", "Client", at(13), at(13, 45))],
    });
    expect(strip.startHour).toBe(8);
    expect(strip.endHour).toBe(18);
    expect(strip.now).toBeCloseTo(0.3);
    expect(strip.segments.map((s) => [s.kind, s.id])).toEqual([["meeting", "e1"], ["meeting", "e2"], ["task", "t1"]]);
    expect(strip.segments[0].start).toBeCloseTo(0.2);
    expect(strip.segments[0].end).toBeCloseTo(0.3);
    expect(strip.segments[2].end).toBeCloseTo(0.7);
  });

  it("reports the load against the time left", () => {
    // 11:00: 7h left. Two 30-minute tasks and the 45-minute meeting still ahead: 1h45 of load.
    const strip = dayStrip({ ...base, now: at(11), tasks: [task("a"), task("b")], events: [ev("e", "Client", at(13), at(13, 45))] });
    expect(strip.load).toMatchObject({ taskMinutes: 60, meetingMinutes: 45, capacity: 420, overBy: 0 });
    expect(strip.ratio).toBeCloseTo(105 / 420);
    expect(strip.level).toBe("ok");
    expect(strip.hasContent).toBe(true);
  });

  it("calls a day tight when it just fits or runs a little over, and over from 60 minutes", () => {
    const heavy = (minutes: number) => [task("a", { durationMinutes: minutes })];
    // 16:00: two hours left.
    expect(dayStrip({ ...base, now: at(16), tasks: heavy(110), events: [] }).level).toBe("tight");
    expect(dayStrip({ ...base, now: at(16), tasks: heavy(150), events: [] }).level).toBe("tight");
    expect(dayStrip({ ...base, now: at(16), tasks: heavy(180), events: [] }).level).toBe("over");
    expect(dayStrip({ ...base, now: at(16), tasks: heavy(30), events: [] }).level).toBe("ok");
    expect(loadLevel({ taskMinutes: 0, meetingMinutes: 0, capacity: 0, overBy: 0 })).toBe("ok");
  });

  it("caps the meter at full when the day is over capacity", () => {
    const strip = dayStrip({ ...base, now: at(16), tasks: [task("a", { durationMinutes: 400 })], events: [] });
    expect(strip.ratio).toBe(1);
    expect(strip.load.overBy).toBe(280);
  });

  it("has nothing to show for an empty day, and shows the day once work is over", () => {
    expect(dayStrip({ ...base, now: at(11), tasks: [], events: [] }).hasContent).toBe(false);
    const late = dayStrip({ ...base, now: at(19), tasks: [task("a")], events: [] });
    expect(late.load.capacity).toBe(0);
    expect(late.now).toBe(1);
    expect(late.ratio).toBe(1);
    expect(late.hasContent).toBe(true);
    expect(dayStrip({ ...base, now: at(19), tasks: [], events: [] }).ratio).toBe(0);
  });

  it("ignores a split task for its steps and finished tasks, like the load does", () => {
    const strip = dayStrip({ ...base, now: at(11), tasks: [task("p"), task("s", { parentId: "p" }), task("d", { checked: true })], events: [] });
    expect(strip.load.taskMinutes).toBe(30);
  });
});
