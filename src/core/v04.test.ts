import { afterEach, describe, expect, it } from "vitest";
import type { ForegroundApp, SystemSample } from "../backend/types";
import type { CalEvent } from "./calendar";
import { dayLoad, dayStrip, DEFAULT_ESTIMATE, isOverbooked, taskEstimate, timeline, type DayLoadInput } from "./load";
import { nextWorkday, nextWorkdayStart } from "./wrapup";
import { taskFromRaw, type TodoTask } from "./models";
import { normalizeWords, relatedTasks, significantWords } from "./related";
import { isConferencing, isNotWorkApp, resumeSummary, shouldOfferResume, snapshot, withNote, workUrl, type WorkContext } from "./resume";
import {
  appMatches,
  clearTrigger,
  dueTriggers,
  markFired,
  pruneTriggers,
  setTrigger,
  triggerChoices,
  triggerFor,
  triggersFromJson,
  triggersToJson,
  type TaskTrigger,
  type TriggerContext,
} from "./triggers";

// Wednesday 28 October 2026, local time throughout.
const at = (h: number, m = 0, day = 28) => new Date(2026, 9, day, h, m);
const DAY = "2026-10-28";

const task = (id: string, content = `Task ${id}`, extra: Partial<TodoTask> = {}): TodoTask => ({
  ...taskFromRaw({ id, content }),
  ...extra,
});
const timed = (local: string) => ({ date: local, string: null, isRecurring: false, datetime: local });
const ev = (id: string, title: string, start: Date, end: Date): CalEvent => ({ id, title, start, end, joinUrl: null });
const app = (name: string, exe = `${name.toLowerCase().replace(/\s+/g, "")}.exe`, title = ""): ForegroundApp => ({ name, exe, title });
const sample = (a: ForegroundApp | null, url: string | null = null): SystemSample => ({
  app: a,
  url,
  idleSeconds: 0,
  secondsSinceKey: 0,
  fullscreen: false,
  appSwitchedAt: 0,
});
const never = () => false;

describe("related tasks", () => {
  it("normalizes case and diacritics, including đ", () => {
    expect(normalizeWords("Họp nhóm: Đề xuất ngân sách")).toEqual(["hop", "nhom", "de", "xuat", "ngan", "sach"]);
    expect(normalizeWords("ĐƯỜNG dây NÓNG")).toEqual(["duong", "day", "nong"]);
    expect(normalizeWords("  Q4/budget—Acme!  ")).toEqual(["q4", "budget", "acme"]);
    expect(normalizeWords("")).toEqual([]);
  });

  it("keeps only words of 4+ characters with a letter that aren't stop words", () => {
    expect([...significantWords("Weekly sync with ACME about the 2026 budget, Q4")]).toEqual(["acme", "budget"]);
    expect([...significantWords("Họp nhóm hàng tuần với khách")]).toEqual(["khach"]);
  });

  it("matches across diacritics and case", () => {
    const tasks = [task("1", "Gui de xuat NGAN SACH"), task("2", "Mua cà phê")];
    expect(relatedTasks("Họp: Đề xuất ngân sách", tasks).map((t) => t.id)).toEqual(["1"]);
    expect(relatedTasks("đường dây nóng", [task("3", "Fix Duong day")]).map((t) => t.id)).toEqual(["3"]);
    expect(relatedTasks("ACME kickoff", [task("4", "email acme")]).map((t) => t.id)).toEqual(["4"]);
  });

  it("ignores stop words, short words and numbers", () => {
    const tasks = [task("1", "Review weekly team notes"), task("2", "Báo cáo tuần nhóm"), task("3", "Q4 ads"), task("4", "Plan 2026")];
    expect(relatedTasks("Weekly team sync meeting", tasks)).toEqual([]);
    expect(relatedTasks("Họp nhóm tuần", tasks)).toEqual([]);
    expect(relatedTasks("Q4 ads", tasks)).toEqual([]);
    expect(relatedTasks("Budget 2026", tasks)).toEqual([]);
  });

  it("ranks by shared words, then original order, and respects the limit", () => {
    const tasks = [
      task("a", "Email Acme"),
      task("b", "Acme launch budget draft"),
      task("c", "Launch checklist"),
      task("d", "Acme budget"),
      task("e", "Unrelated"),
    ];
    expect(relatedTasks("Acme launch budget", tasks).map((t) => t.id)).toEqual(["b", "d"]);
    expect(relatedTasks("Acme launch budget", tasks, 10).map((t) => t.id)).toEqual(["b", "d", "a", "c"]);
    expect(relatedTasks("Acme launch budget", tasks, 1).map((t) => t.id)).toEqual(["b"]);
    expect(relatedTasks("Acme launch budget", tasks, 0)).toEqual([]);
  });

  it("reads plain task titles and skips completed tasks", () => {
    const tasks = [task("1", "Acme deck", { checked: true }), task("2", "[Acme](https://acme.test) contract")];
    expect(relatedTasks("Acme", tasks).map((t) => t.id)).toEqual(["2"]);
    expect(relatedTasks("", tasks)).toEqual([]);
  });
});

describe("day load", () => {
  const base = (patch: Partial<DayLoadInput> = {}): DayLoadInput => ({
    tasks: [],
    events: [],
    now: at(10),
    workStart: 8,
    workEnd: 18,
    defaultEstimate: 30,
    ...patch,
  });

  it("estimates with the Todoist duration, else the default", () => {
    const tasks = [task("1", "A", { durationMinutes: 90 }), task("2"), task("3")];
    expect(dayLoad(base({ tasks })).taskMinutes).toBe(150);
    expect(dayLoad(base({ tasks, defaultEstimate: 45 })).taskMinutes).toBe(180);
    expect(taskEstimate(task("4"), Number.NaN)).toBe(DEFAULT_ESTIMATE);
    expect(taskEstimate(task("5", "x", { durationMinutes: 0 }), 20)).toBe(20);
  });

  it("ignores completed tasks and parents split into open steps", () => {
    const tasks = [
      task("p", "Report", { durationMinutes: 120 }),
      task("s1", "Outline", { parentId: "p" }),
      task("s2", "Draft", { parentId: "p" }),
      task("done", "Old", { checked: true }),
    ];
    expect(dayLoad(base({ tasks })).taskMinutes).toBe(60);
  });

  it("merges overlapping meetings and counts only what's left of the current one", () => {
    const events = [ev("a", "A", at(11), at(12)), ev("b", "B", at(11, 30), at(12, 30)), ev("c", "C", at(9, 30), at(10, 30))];
    const load = dayLoad(base({ events }));
    expect(load.meetingMinutes).toBe(120);
    expect(load.capacity).toBe(480);
    expect(load.overBy).toBe(0);
  });

  it("clips meetings to work hours", () => {
    const events = [ev("early", "Early", at(7), at(9)), ev("late", "Late", at(17, 30), at(19)), ev("night", "Night", at(20), at(21))];
    const load = dayLoad(base({ events, now: at(7, 30) }));
    expect(load.meetingMinutes).toBe(90);
    expect(load.capacity).toBe(600);
  });

  it("has no capacity after work, so every task is over", () => {
    const load = dayLoad(base({ tasks: [task("1"), task("2")], events: [ev("a", "A", at(17), at(19))], now: at(19) }));
    expect(load).toEqual({ taskMinutes: 60, meetingMinutes: 0, capacity: 0, overBy: 60 });
    expect(dayLoad(base({ workStart: 18, workEnd: 8 })).capacity).toBe(0);
  });

  it("computes overBy against what's left", () => {
    const tasks = Array.from({ length: 12 }, (_, i) => task(String(i))); // 6h of tasks
    const events = [ev("a", "A", at(14), at(17))]; // 3h of meetings
    const load = dayLoad(base({ tasks, events, now: at(11) })); // 7h left
    expect(load).toEqual({ taskMinutes: 360, meetingMinutes: 180, capacity: 420, overBy: 120 });
    expect(isOverbooked(load)).toBe(true);
  });

  it("calls the day overbooked from 60 minutes over", () => {
    expect(isOverbooked({ taskMinutes: 0, meetingMinutes: 0, capacity: 0, overBy: 59 })).toBe(false);
    expect(isOverbooked({ taskMinutes: 0, meetingMinutes: 0, capacity: 0, overBy: 60 })).toBe(true);
  });

  it("places meetings and timed tasks on the work day, clamped", () => {
    const events = [ev("early", "Early", at(7), at(9)), ev("late", "Late", at(17), at(19)), ev("gone", "Gone", at(6), at(7))];
    const tasks = [
      task("noon", "Lunch prep", { due: timed("2026-10-28T12:00:00"), durationMinutes: 60 }),
      task("eve", "Wrap", { due: timed("2026-10-28T17:30:00") }),
      task("untimed", "Someday"),
      task("after", "After work", { due: timed("2026-10-28T18:00:00") }),
    ];
    const t = timeline(base({ events, tasks, now: at(13) }));
    expect(t.now).toBeCloseTo(0.5);
    expect(t.segments.map((s) => [s.kind, s.id, +s.start.toFixed(3), +s.end.toFixed(3)])).toEqual([
      ["meeting", "early", 0, 0.1],
      ["task", "noon", 0.4, 0.5],
      ["meeting", "late", 0.9, 1],
      ["task", "eve", 0.95, 1],
    ]);
    expect(t.segments.find((s) => s.id === "noon")?.title).toBe("Lunch prep");
  });

  it("clamps now and handles an empty work day", () => {
    expect(timeline(base({ now: at(6) })).now).toBe(0);
    expect(timeline(base({ now: at(20) })).now).toBe(1);
    expect(timeline(base({ workStart: 9, workEnd: 9, events: [ev("a", "A", at(9), at(10))] }))).toEqual({ segments: [], now: 0 });
  });
});

// The project has no Node typings; the time zone is switched through the environment.
const env = (globalThis as unknown as { process: { env: Record<string, string | undefined> } }).process.env;

describe("day load and timeline, after review", () => {
  const input = (patch: Partial<DayLoadInput> = {}): DayLoadInput => ({ tasks: [], events: [], now: at(10), workStart: 8, workEnd: 18, defaultEstimate: 30, ...patch });
  const timedAt = (local: string) => ({ date: local, string: null, isRecurring: false, datetime: local });

  it("doesn't count a timed task twice when it falls inside a meeting", () => {
    const meeting = ev("m", "Review", at(11), at(12));
    const inside = task("t", "Demo", { due: timedAt("2026-10-28T11:00:00"), durationMinutes: 30 });
    const load = dayLoad(input({ events: [meeting], tasks: [inside] }));
    expect(load.meetingMinutes).toBe(60);
    expect(load.taskMinutes).toBe(0);
    // Half in, half out: only the part outside the meeting is extra work.
    const edge = task("e", "Edge", { due: timedAt("2026-10-28T11:45:00"), durationMinutes: 30 });
    expect(dayLoad(input({ events: [meeting], tasks: [edge] })).taskMinutes).toBe(15);
    // A meeting that is over has no minutes left to count, so it doesn't swallow the task.
    expect(dayLoad(input({ events: [meeting], tasks: [inside], now: at(13) })).taskMinutes).toBe(30);
    // Outside, or without a time: counted in full.
    const outside = task("o", "After", { due: timedAt("2026-10-28T14:00:00"), durationMinutes: 30 });
    expect(dayLoad(input({ events: [meeting], tasks: [outside, task("u")] })).taskMinutes).toBe(60);
  });

  it("copes with a work day that ends at 24", () => {
    const load = dayLoad(input({ workEnd: 24, now: at(10) }));
    expect(load.capacity).toBe(14 * 60);
    const t = timeline(input({ workEnd: 24, now: at(12), events: [ev("late", "Late", at(22), at(23))] }));
    expect(t.now).toBeCloseTo(4 / 16);
    expect(t.segments[0].start).toBeCloseTo(14 / 16);
    expect(t.segments[0].end).toBeCloseTo(15 / 16);
    expect(dayStrip(input({ workEnd: 24 })).endHour).toBe(24);
  });

  it("puts blocks that overlap in a second lane", () => {
    const events = [ev("a", "A", at(10), at(11)), ev("b", "B", at(10, 30), at(11, 30)), ev("c", "C", at(11), at(12)), ev("d", "D", at(14), at(15))];
    const tasks = [task("t", "Timed", { due: timedAt("2026-10-28T10:45:00"), durationMinutes: 30 })];
    const strip = dayStrip(input({ events, tasks }));
    const lane = (id: string) => strip.segments.find((x) => x.id === id)?.lane;
    expect(lane("a")).toBe(0);
    expect(lane("b")).toBe(1);
    expect(lane("t")).toBe(2);
    // C starts when A ends: it takes the first lane that is free.
    expect(lane("c")).toBe(0);
    expect(lane("d")).toBe(0);
    expect(strip.lanes).toBe(3);
    expect(dayStrip(input({ events: [events[0], events[3]] })).lanes).toBe(1);
    expect(dayStrip(input()).lanes).toBe(1);
  });

  describe("on the day the clocks change", () => {
    const zone = env.TZ;
    afterEach(() => {
      if (zone === undefined) delete env.TZ;
      else env.TZ = zone;
    });

    it("keeps the work day, its capacity and the strip sane when it is 25 hours long", () => {
      env.TZ = "America/New_York";
      // Sunday 1 November 2026: 02:00 happens twice.
      const day = (h: number, m = 0) => new Date(2026, 10, 1, h, m);
      expect(day(0).getTimezoneOffset()).not.toBe(day(12).getTimezoneOffset());
      const events = [ev("m", "Sync", day(9), day(10))];
      const strip = dayStrip(input({ now: day(8), events, workStart: 8, workEnd: 18 }));
      // 08:00 to 18:00 on the wall is 10 real hours: the repeated hour comes before 08:00.
      expect(strip.load.capacity).toBe(10 * 60);
      expect(strip.load.meetingMinutes).toBe(60);
      expect(strip.segments[0].start).toBeCloseTo(0.1);
      expect(strip.now).toBe(0);
      const night = dayStrip(input({ now: day(1), events: [], workStart: 0, workEnd: 24 }));
      // From the first 01:00 to midnight: 24 real hours.
      expect(night.load.capacity).toBe(24 * 60);
      expect(night.now).toBeGreaterThanOrEqual(0);
      expect(night.now).toBeLessThanOrEqual(1);
    });

    it("finds the next workday and its start across a spring-forward weekend", () => {
      env.TZ = "America/New_York";
      // Friday 6 March 2026, wrapped up at 16:00; the clocks go forward on Sunday the 8th.
      const friday = new Date(2026, 2, 6, 16);
      const isWork = (d: Date) => d.getDay() !== 0 && d.getDay() !== 6;
      expect(nextWorkday(friday, isWork)).toBe("2026-03-09");
      expect(nextWorkdayStart(friday, 8, isWork)).toBe(new Date(2026, 2, 9, 8).getTime());
      // Wrapped up on Saturday night, the PC left on: still Monday.
      expect(nextWorkday(new Date(2026, 2, 7, 23, 30), isWork)).toBe("2026-03-09");
      // And the fall-back weekend.
      const fri = new Date(2026, 9, 30, 16);
      expect(nextWorkday(fri, isWork)).toBe("2026-11-02");
      expect(nextWorkdayStart(fri, 8, isWork)).toBe(new Date(2026, 10, 2, 8).getTime());
    });
  });
});

describe("if-then triggers", () => {
  const trig = (taskId: string, trigger: TaskTrigger["trigger"], patch: Partial<TaskTrigger> = {}): TaskTrigger => ({
    taskId,
    day: DAY,
    trigger,
    fired: false,
    setAt: 0,
    notBefore: null,
    ...patch,
  });
  const ctx = (patch: Partial<TriggerContext> = {}): TriggerContext => ({
    day: DAY,
    now: at(11),
    events: [ev("e1", "Standup", at(9), at(10)), ev("e2", "Design", at(10, 30), at(11, 30)), ev("e5", "Exact", at(10), at(11))],
    app: null,
    appSwitchedAt: at(10).getTime(),
    endedEventIds: [],
    ...patch,
  });
  const ids = (list: TaskTrigger[]) => list.map((t) => t.taskId);

  it("fires after a meeting has ended", () => {
    const list = [
      trig("1", { kind: "afterMeeting", eventId: "e1", title: "Standup" }),
      trig("2", { kind: "afterMeeting", eventId: "e2", title: "Design" }),
      trig("3", { kind: "afterMeeting", eventId: "e3", title: "Dropped" }),
      trig("4", { kind: "afterMeeting", eventId: "e4", title: "Unknown" }),
      trig("5", { kind: "afterMeeting", eventId: "e5", title: "Exact" }),
    ];
    expect(ids(dueTriggers(list, ctx({ endedEventIds: ["e3"] })))).toEqual(["1", "3", "5"]);
    expect(ids(dueTriggers(list, ctx({ now: at(11, 30) })))).toEqual(["1", "2", "5"]);
  });

  it("fires when the app is in front, ignoring case", () => {
    const figma = app("Figma", "Figma.exe", "Homepage");
    const list = [
      trig("1", { kind: "appOpen", app: "figma" }),
      trig("2", { kind: "appOpen", app: "FIGMA" }),
      trig("5", { kind: "appOpen", app: "fig" }),
      trig("3", { kind: "appOpen", app: "photoshop" }),
      trig("4", { kind: "appOpen", app: "   " }),
    ];
    expect(ids(dueTriggers(list, ctx({ app: figma })))).toEqual(["1", "2"]);
    expect(dueTriggers(list, ctx({ app: null }))).toEqual([]);
    expect(appMatches(app("Visual Studio Code", "code.exe"), "code")).toBe(true);
    expect(appMatches(app("Excel", "excel.exe"), "")).toBe(false);
    // Whole words or the exe's name only, and 3+ characters (the plans' review): "fig" is not Figma.
    expect(appMatches(figma, "fig")).toBe(false);
  });

  it("fires after lunch from 13:00", () => {
    const list = [trig("1", { kind: "afterLunch" })];
    expect(dueTriggers(list, ctx({ now: at(12, 59) }))).toEqual([]);
    expect(ids(dueTriggers(list, ctx({ now: at(13) })))).toEqual(["1"]);
    expect(ids(dueTriggers(list, ctx({ now: at(13).getTime() })))).toEqual(["1"]);
  });

  it("skips fired triggers and other days", () => {
    const list = [
      trig("1", { kind: "afterLunch" }, { fired: true }),
      trig("2", { kind: "afterLunch" }, { day: "2026-10-27" }),
      trig("3", { kind: "afterLunch" }),
    ];
    expect(ids(dueTriggers(list, ctx({ now: at(14) })))).toEqual(["3"]);
  });

  it("marks fired, prunes other days, sets one per task per day", () => {
    let list = [trig("1", { kind: "afterLunch" }), trig("2", { kind: "afterLunch" }), trig("1", { kind: "afterLunch" }, { day: "2026-10-27" })];
    list = markFired(list, "1", DAY);
    expect(list.map((t) => t.fired)).toEqual([true, false, false]);
    expect(ids(dueTriggers(list, ctx({ now: at(14) })))).toEqual(["2"]);
    expect(pruneTriggers(list, DAY).map((t) => [t.taskId, t.fired])).toEqual([
      ["1", true],
      ["2", false],
    ]);

    list = setTrigger(list, "2", DAY, { kind: "appOpen", app: "Excel" }, 0);
    expect(list.filter((t) => t.taskId === "2")).toEqual([trig("2", { kind: "appOpen", app: "Excel" })]);
    expect(triggerFor(list, "2", DAY)?.trigger).toEqual({ kind: "appOpen", app: "Excel" });
    list = clearTrigger(list, "2", DAY);
    expect(triggerFor(list, "2", DAY)).toBeNull();
  });

  it("offers meetings not yet over, recent work apps and lunch", () => {
    const events = [
      ev("past", "Standup", at(9), at(10)),
      ev("now", "Design", at(10, 30), at(11, 30)),
      ev("later", "Planning", at(14), at(15)),
      ev("tomorrow", "Retro", at(9, 0, 29), at(10, 0, 29)),
    ];
    const recentApps = [
      app("TodoPet", "todopet.exe"),
      app("Discord"),
      app("Figma"),
      app("figma", "figma.exe", "Other file"),
      app(""),
      app("Visual Studio Code", "code.exe"),
      app("Excel"),
      app("Word"),
    ];
    const isDistracting = (a: ForegroundApp | null) => a?.name === "Discord";
    expect(triggerChoices({ events, now: at(11), recentApps, isDistracting })).toEqual([
      { kind: "afterMeeting", eventId: "now", title: "Design" },
      { kind: "afterMeeting", eventId: "later", title: "Planning" },
      { kind: "appOpen", app: "Figma", exe: "figma.exe" },
      { kind: "appOpen", app: "Visual Studio Code", exe: "code.exe" },
      { kind: "appOpen", app: "Excel", exe: "excel.exe" },
      { kind: "afterLunch" },
    ]);
    expect(triggerChoices({ events, now: at(14, 30), recentApps: [], isDistracting })).toEqual([
      { kind: "afterMeeting", eventId: "later", title: "Planning" },
    ]);
  });

  it("round-trips through JSON and drops junk", () => {
    const list = [
      trig("1", { kind: "afterMeeting", eventId: "e1@1", title: "Standup" }),
      trig("2", { kind: "appOpen", app: "Figma" }, { fired: true }),
      trig("3", { kind: "afterLunch" }, { day: "2026-10-27" }),
    ];
    expect(triggersFromJson(JSON.parse(JSON.stringify(triggersToJson(list))))).toEqual(list);

    for (const junk of [null, undefined, "x", 5, {}, { triggers: list }]) expect(triggersFromJson(junk)).toEqual([]);
    const messy = [
      null,
      1,
      "a",
      { taskId: "1" },
      { taskId: "1", day: "2026-02-30", trigger: { kind: "afterLunch" } },
      { taskId: "", day: DAY, trigger: { kind: "afterLunch" } },
      { taskId: "2", day: DAY, trigger: { kind: "teleport" } },
      { taskId: "3", day: DAY, trigger: { kind: "appOpen", app: "  " } },
      { taskId: "4", day: DAY, trigger: { kind: "afterMeeting", eventId: "e", title: 5 }, fired: "yes" },
      { taskId: "5", day: DAY, trigger: { kind: "afterLunch" }, extra: true },
      { taskId: "5", day: DAY, trigger: { kind: "appOpen", app: " Excel " } },
    ];
    expect(triggersFromJson(messy, 0)).toEqual([
      trig("4", { kind: "afterMeeting", eventId: "e", title: "" }),
      trig("5", { kind: "appOpen", app: "Excel" }),
    ]);
  });
});

describe("where was I", () => {
  const code = app("Visual Studio Code", "code.exe", "brain.ts - todopet - Visual Studio Code");
  const chrome = app("Google Chrome", "chrome.exe", "Spec - Google Docs - Google Chrome");
  const isDistracting = (a: ForegroundApp | null, url: string | null) => a?.name === "Discord" || (url ?? "").includes("youtube.com");

  it("never keeps a distraction", () => {
    expect(snapshot(sample(app("Discord")), task("1"), isDistracting, at(10))).toBeNull();
    expect(snapshot(sample(chrome, "https://www.youtube.com/watch?v=1"), task("1"), isDistracting, at(10))).toBeNull();
  });

  it("keeps the task, app, title and http(s) address", () => {
    const ctx = snapshot(sample(chrome, "https://docs.google.com/document/d/1/edit#heading=h.1"), task("7", "Write **spec**"), isDistracting, at(10));
    expect(ctx).toEqual({
      taskId: "7",
      taskTitle: "Write spec",
      taskIsNext: false,
      app: "Google Chrome",
      windowTitle: "Spec - Google Docs - Google Chrome",
      url: "https://docs.google.com/document/d/1/edit",
      note: null,
      at: at(10).getTime(),
    });
    expect(snapshot(sample(code), null, never, at(10).getTime())?.at).toBe(at(10).getTime());
  });

  it("drops addresses that aren't http(s), and credentials", () => {
    expect(snapshot(sample(chrome, "file:///C:/notes.pdf"), null, never, at(10))?.url).toBeNull();
    expect(workUrl("chrome://settings")).toBeNull();
    expect(workUrl("javascript:alert(1)")).toBeNull();
    expect(workUrl("not a url")).toBeNull();
    expect(workUrl("https://user:pw@example.com/a?b=1#c")).toBe("https://example.com/a?b=1");
    expect(workUrl("http://example.com")).toBe("http://example.com/");
  });

  it("trims and caps titles and addresses", () => {
    const long = "x".repeat(200);
    const ctx = snapshot(sample(app("Word", "winword.exe", `  ${long}  `)), task("1", `  ${long}`), never, at(10));
    expect(ctx?.windowTitle).toHaveLength(120);
    expect(ctx?.windowTitle?.endsWith("…")).toBe(true);
    expect(ctx?.taskTitle).toHaveLength(120);
    expect(snapshot(sample(app("Word", "winword.exe", "  Report \n draft  ")), null, never, at(10))?.windowTitle).toBe("Report draft");

    const url = workUrl(`https://example.com/?q=${"a".repeat(3000)}`);
    expect(url).toHaveLength(2048);
    const cut = workUrl(`https://example.com/${"a".repeat(2047 - 20)}%E2%9C%93`);
    expect(cut!.length).toBeLessThanOrEqual(2048);
    expect(cut).not.toMatch(/%[0-9A-F]?$/i);
  });

  it("returns null when there is nothing useful", () => {
    expect(snapshot(null, null, never, at(10))).toBeNull();
    expect(snapshot(sample(null), null, never, at(10))).toBeNull();
    expect(snapshot(sample(app("", "x.exe", "  ")), null, never, at(10))).toBeNull();
    expect(snapshot(sample(app("TodoPet", "todopet.exe", "TodoPet")), null, never, at(10))).toBeNull();
    expect(snapshot(sample(app("Windows Default Lock Screen", "LockApp.exe", "")), null, never, at(10))).toBeNull();
    const onlyTask = snapshot(sample(app("TodoPet", "todopet.exe", "TodoPet")), task("1", "Taxes"), never, at(10));
    expect(onlyTask).toMatchObject({ taskId: "1", taskTitle: "Taxes", app: null, windowTitle: null, url: null });
  });

  it("offers the card after 5 min away, a meeting, or 2+ min of distraction", () => {
    expect(shouldOfferResume({ awayMinutes: 5 })).toBe(true);
    expect(shouldOfferResume({ awayMinutes: 4.9 })).toBe(false);
    expect(shouldOfferResume({ afterMeeting: true })).toBe(true);
    expect(shouldOfferResume({ leftDistractionMinutes: 2 })).toBe(true);
    expect(shouldOfferResume({ leftDistractionMinutes: 1.5 })).toBe(false);
    expect(shouldOfferResume({ awayMinutes: 1, afterMeeting: false, leftDistractionMinutes: null })).toBe(false);
    expect(shouldOfferResume({})).toBe(false);
  });

  it("summarizes for the resume card", () => {
    const base: WorkContext = { taskId: "1", taskTitle: "Spec", taskIsNext: false, app: null, windowTitle: null, url: null, note: null, at: 0 };
    expect(resumeSummary({ ...base, app: "Google Chrome", windowTitle: "Docs - Google Chrome", url: "https://docs.google.com/" })).toEqual({
      task: "Spec",
      where: "Google Chrome — Docs",
      note: null,
      canReopen: true,
      host: "docs.google.com",
      taskIsNext: false,
    });
    expect(resumeSummary({ ...base, app: "Excel", windowTitle: "Excel" })).toMatchObject({ where: "Excel", canReopen: false });
    expect(resumeSummary({ ...base, windowTitle: "Budget.xlsx" }).where).toBe("Budget.xlsx");
    expect(resumeSummary({ ...base, url: "https://www.figma.com/file/1" }).where).toBe("figma.com");
    expect(resumeSummary({ ...base, taskTitle: null }).where).toBeNull();
    expect(resumeSummary({ ...base, url: "ftp://x" }).canReopen).toBe(false);
    const where = resumeSummary({ ...base, app: "Word", windowTitle: "y".repeat(100) }).where!;
    expect(where.length).toBeLessThan(80);
  });

  it("adds a one-line next step", () => {
    const ctx = snapshot(sample(code), task("1"), never, at(10))!;
    expect(withNote(ctx, "  fix the\n tests ").note).toBe("fix the tests");
    expect(withNote(ctx, "   ").note).toBeNull();
    expect(resumeSummary(withNote(ctx, "next: tests"))).toMatchObject({ note: "next: tests", where: "Visual Studio Code — brain.ts - todopet" });
  });
});

describe("which windows are never where you were", () => {
  it("knows the pet's own window, shell pop-ups and call apps", () => {
    expect(isNotWorkApp(app("TodoPet", "todopet.exe"))).toBe(true);
    expect(isNotWorkApp(app("Lock", "LockApp.exe"))).toBe(true);
    expect(isNotWorkApp(app("Visual Studio Code", "code.exe"))).toBe(false);
    expect(isConferencing(app("Zoom", "Zoom.exe"), null)).toBe(true);
    expect(isConferencing(app("Microsoft Teams", "ms-teams.exe"), null)).toBe(true);
    expect(isConferencing(app("Google Chrome", "chrome.exe"), "https://meet.google.com/abc-defg-hij")).toBe(true);
    expect(isConferencing(app("Google Chrome", "chrome.exe"), "https://eu.zoom.us/j/1")).toBe(true);
    expect(isConferencing(app("Google Chrome", "chrome.exe"), "https://notzoom.us.example.com/")).toBe(false);
    expect(isConferencing(app("Google Chrome", "chrome.exe"), "https://docs.example.com/spec")).toBe(false);
    expect(isConferencing(null, null)).toBe(false);
  });
});
