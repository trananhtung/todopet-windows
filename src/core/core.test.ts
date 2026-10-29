import { describe, expect, it } from "vitest";
import * as calm from "./calm";
import { adaptiveTarget, busy, eventsOnDay, freeMinutes, freeSlots, joinUrl, suggestSlots, type CalEvent } from "./calendar";
import { daysBetween, dayKey, hoursText, nextDayKey, parseDate, plainText, shortText, utcString } from "./dates";
import { asText, parseEntries, summarize } from "./diary";
import { L, langFromLocale, pick, setLang } from "./l10n";
import * as life from "./life";
import { actionable, buildDay, dueTime, nextTask, planned, ranked, statsFromRaw, taskFromRaw, uiPriority, type TodoTask } from "./models";
import { defaultMoodInputs, evaluateMood } from "./mood";
import { dayRange, defaultPrefs, isWorkday, MAX_REST_DAYS, MAX_REST_RANGE, prefsFromJson } from "./prefs";
import { appRules, currentDistraction, hostOf, matchSite, siteRules } from "./sites";
import { findStuck, recordSeen, stuckDays } from "./stuck";

const task = (id: string, extra: Partial<TodoTask> = {}): TodoTask => ({
  ...taskFromRaw({ id, content: `Task ${id}` }),
  ...extra,
});
const due = (date: string) => ({ date, string: null, isRecurring: false, datetime: null });
/** Monday 26 October 2026 as the app saw it: a workday with 3 planned and a target of 3. */
const seenDay = (patch: Partial<life.LifeState> = {}): life.LifeState => ({
  ...life.newLife(),
  dayKey: "2026-10-26",
  dayTarget: 3,
  dayPlanned: 3,
  dayWorkday: true,
  daySeen: true,
  ...patch,
});
const always = () => true;

describe("dates", () => {
  it("parses every Todoist date shape", () => {
    expect(parseDate("2026-10-25")?.getDate()).toBe(25);
    expect(parseDate("2026-10-25T09:30:00")?.getHours()).toBe(9);
    expect(parseDate("2026-10-25T02:00:00Z")?.toISOString()).toBe("2026-10-25T02:00:00.000Z");
    expect(parseDate("2026-10-25T02:00:00.123456Z")?.toISOString()).toBe("2026-10-25T02:00:00.000Z");
    expect(parseDate("2026-10-25T09:00:00+07:00")?.toISOString()).toBe("2026-10-25T02:00:00.000Z");
    expect(parseDate("2026-02-30")).toBeNull();
    expect(parseDate("tomorrow")).toBeNull();
    expect(parseDate(null)).toBeNull();
  });

  it("does calendar-day math in local time", () => {
    expect(daysBetween("2026-10-20", "2026-10-25")).toBe(5);
    expect(nextDayKey("2026-12-31")).toBe("2027-01-01");
    expect(nextDayKey("nope")).toBe("9999");
    expect(dayKey(new Date(2026, 0, 5, 23, 59))).toBe("2026-01-05");
    expect(utcString(new Date("2026-10-25T02:00:00.500Z"))).toBe("2026-10-25T02:00:00Z");
    expect(hoursText(150)).toBe("2h30");
    expect(hoursText(120)).toBe("2h");
  });

  it("cleans Todoist markdown and shortens by grapheme", () => {
    expect(plainText("**Call** [Anna](https://x.y) `now`")).toBe("Call Anna now");
    expect(shortText("abcdef", 4)).toBe("abc…");
    expect(shortText("👩‍👩‍👧‍👦👩‍👩‍👧‍👦👩‍👩‍👧‍👦", 2)).toBe("👩‍👩‍👧‍👦…");
  });
});

describe("l10n", () => {
  it("switches language and picks variants", () => {
    setLang("vi");
    expect(L("Xin chào", "Hello")).toBe("Xin chào");
    expect(pick([["a", "A"], ["b", "B"]], () => 0.99)).toBe("b");
    setLang("en");
    expect(L("Xin chào", "Hello")).toBe("Hello");
    expect(langFromLocale("vi-VN")).toBe("vi");
    expect(langFromLocale("en-US")).toBe("en");
  });
});

describe("models", () => {
  const now = new Date(2026, 9, 28, 11, 0);

  it("converts raw tasks and stats", () => {
    const t = taskFromRaw({ id: "9", content: "x", priority: 4, duration: { amount: 1, unit: "day" }, due: { date: "2026-10-28T15:00:00", is_recurring: true } });
    expect(uiPriority(t)).toBe(1);
    expect(t.durationMinutes).toBe(480);
    expect(t.due?.isRecurring).toBe(true);
    expect(dueTime(t)?.getHours()).toBe(15);
    expect(statsFromRaw({ goals: { current_daily_streak: { count: 4 } } }).streak).toBe(4);
  });

  it("splits today, overdue and late", () => {
    const day = buildDay(
      [
        task("a", { due: due("2026-10-28") }),
        task("b", { due: due("2026-10-25") }),
        task("c", { due: due("2026-10-28T09:00:00") }),
        task("d", { due: due("2026-10-30") }),
        task("e"),
      ],
      [task("z", { checked: true, completedAt: "2026-10-28T03:00:00Z" })],
      now,
    );
    expect(day.today.map((t) => t.id).sort()).toEqual(["a", "c", "e"]);
    expect(day.overdue.map((t) => t.id)).toEqual(["b"]);
    expect(day.late.map((t) => t.id)).toEqual(["c"]);
    expect(planned(day)).toBe(4);
  });

  it("eats the frog: priority, then time, then oldest day", () => {
    const order = ranked([
      task("low", { priority: 1, due: due("2026-10-28") }),
      task("timed", { priority: 4, due: due("2026-10-28T14:00:00") }),
      task("urgent", { priority: 4, due: due("2026-10-28") }),
      task("early", { priority: 4, due: due("2026-10-28T09:00:00") }),
    ]).map((t) => t.id);
    expect(order).toEqual(["early", "timed", "urgent", "low"]);
  });

  it("lets a split task give way to its steps", () => {
    const day = buildDay([task("p", { priority: 4 }), task("s1", { parentId: "p" })], [], now);
    expect(actionable(day).map((t) => t.id)).toEqual(["s1"]);
    expect(nextTask(day)?.id).toBe("s1");
  });
});

describe("mood", () => {
  it("is happy after finishing the plan", () => {
    const r = evaluateMood({ ...defaultMoodInputs(), completed: 3, planned: 3, remaining: 0 });
    expect(r.mood).toBe("happy");
    expect(r.score).toBe(100);
    expect(r.reasons[0].delta).toBe(30);
  });

  it("gets grumpy without a plan after the deadline", () => {
    const r = evaluateMood({ ...defaultMoodInputs(), hoursAfterPlanDeadline: 2, planned: 0, remaining: 0 });
    // 60 − (12 + 3·6 + 16) = 14
    expect(r.score).toBe(14);
    expect(r.mood).toBe("angry");
  });

  it("frowns at distractions, relaxes after work, sleeps when idle", () => {
    expect(evaluateMood({ ...defaultMoodInputs(), planned: 3, remaining: 3, distractedMinutes: 5, distractionApp: "youtube.com" }).score).toBe(35);
    expect(evaluateMood({ ...defaultMoodInputs(), inWorkHours: false, overdue: 5 }).score).toBe(55);
    expect(evaluateMood({ ...defaultMoodInputs(), idleMinutes: 11 }).mood).toBe("sleeping");
    expect(evaluateMood({ ...defaultMoodInputs(), focusing: true }).mood).toBe("focus");
    expect(evaluateMood({ ...defaultMoodInputs(), hasToken: false, overdue: 5 }).mood).toBe("normal");
    expect(evaluateMood({ ...defaultMoodInputs(), celebratingNow: true, focusing: true }).mood).toBe("celebrating");
  });

  it("feels hunger and dirt", () => {
    setLang("en");
    const r = evaluateMood({ ...defaultMoodInputs(), planned: 3, remaining: 3, satiety: 10, dirt: 2 });
    expect(r.score).toBe(60 - 10 - 10);
    expect(r.reasons.map((x) => x.text)).toContain("needs a bath (2 missed days)");
    setLang("vi");
    expect(evaluateMood({ ...defaultMoodInputs(), dirt: 1 }).reasons.map((x) => x.text)).toContain("cần tắm (lỡ 1 ngày)");
    setLang("en");
  });
});

describe("life", () => {
  it("feeds, combos and unlocks", () => {
    const s = life.newLife();
    const t0 = Date.UTC(2026, 9, 28, 9);
    const r1 = life.feed(s, t0, 0.5, 0.0);
    expect(r1.combo).toBe(1);
    expect(s.xp).toBe(10);
    expect(s.satiety).toBe(95);
    expect(r1.unlocked).toEqual(["bow"]);
    expect(s.wearing).toEqual(["bow"]);
    life.feed(s, t0 + 10 * 60_000, 0.5, 0.3);
    const r3 = life.feed(s, t0 + 20 * 60_000, 0.5, 0.3);
    expect(r3.combo).toBe(3);
    expect(r3.kind).toBe("fireworks");
    expect(r3.unlocked).toContain("sunglasses");
    expect(s.xp).toBe(10 + 15 + 20);
    const golden = life.feed(s, t0 + 3 * 3_600_000, 0.05, 0.3);
    expect(golden.golden).toBe(true);
    expect(golden.food).toBe("🍰");
    expect(golden.combo).toBe(1);
  });

  it("cleans one layer of dirt per task and reports level-ups", () => {
    const s = { ...life.newLife(), dirt: 2, xp: 95 };
    const r = life.feed(s, 0, 0.5, 0.5);
    expect(r.cleaned).toBe(true);
    expect(s.dirt).toBe(1);
    expect(r.levelUp).toBe(1);
  });

  it("gets hungry only while working, an hour at most per step", () => {
    const s = { ...life.newLife(), satiety: 50 };
    life.decay(s, 0, true);
    life.decay(s, 3 * 3_600_000, true);
    expect(s.satiety).toBe(43);
    life.decay(s, 4 * 3_600_000, false);
    expect(s.satiety).toBe(43);
  });

  it("settles days: streaks, stickers, snacks and days the app never saw", () => {
    const s = seenDay({ dayCompleted: 3, streak: 2, bestStreak: 2 });
    const r = life.closeDay(s, "2026-10-27", always);
    expect(r.outcome).toBe("kept");
    expect(s.streak).toBe(3);
    expect(s.perfectDays).toEqual(["2026-10-26"]);
    expect(r.sticker).toBe(true);
    expect(r.unlocked).toContain("scarf");
    // The 27th was seen with nothing done: a snack saves it. The 28th (PC off) and 29th (not a workday) are neutral.
    life.syncDay(s, 0, 3, 3, true);
    expect(life.closeDay(s, "2026-10-30", (k) => k !== "2026-10-29").outcome).toBe("frozen");
    expect(s.dirt).toBe(0);
    expect(s.streak).toBe(3);
    expect(s.snacks).toBe(1);
    expect(s.dayKey).toBe("2026-10-30");
    expect(s.daySeen).toBe(false);
  });

  it("tolerates broken saved state and toggles accessories by slot", () => {
    const s = life.lifeFromJson({ satiety: "x", dirt: 9, unlocked: ["bow", "laser", "crown"], wearing: ["bow"] });
    expect(s.satiety).toBe(70);
    expect(s.dirt).toBe(3);
    expect(s.unlocked).toEqual(["bow", "crown"]);
    life.toggleAccessory(s, "crown");
    expect(s.wearing).toEqual(["crown"]);
    life.toggleAccessory(s, "tophat");
    expect(s.wearing).toEqual(["crown"]);
    expect(life.stageOf(700)).toBe(3);
    expect(life.meetsUnlock({ kind: "tasks", value: 50 }, { ...s, totalDone: 50 })).toBe(true);
    expect(life.meetsUnlock({ kind: "streak", value: 7 }, { ...s, bestStreak: 6 })).toBe(false);
  });

  it("shows how far a locked accessory is", () => {
    const s = { ...life.newLife(), totalDone: 12, bestStreak: 9 };
    expect(life.accessoryProgress("tophat", s)).toEqual({ have: 12, need: 25 });
    expect(life.accessoryProgress("crown", s)).toEqual({ have: 7, need: 7 });
    expect(life.isEarned("crown", s)).toBe(true);
    expect(life.accessoryProgress("gradcap", { ...s, xp: 350 })).toEqual({ have: 350, need: 700 });
  });
});

describe("forgiving streaks", () => {
  it("keeps the streak with a single finished task", () => {
    const s = seenDay({ dayCompleted: 1, streak: 2 });
    const r = life.closeDay(s, "2026-10-27", always);
    expect(r).toMatchObject({ day: "2026-10-26", outcome: "kept", snackEarned: false, sticker: false });
    expect(s.streak).toBe(3);
    expect(s.bestStreak).toBe(3);
    expect(s.snacks).toBe(1);
  });

  it("leaves days the app never saw alone", () => {
    const s = seenDay({ dayCompleted: 1, streak: 2 });
    // Tuesday to Thursday the PC stayed off.
    life.closeDay(s, "2026-10-30", always);
    expect(s.streak).toBe(3);
    expect(s.dirt).toBe(0);
    // Friday the app ran but never reached Todoist: nothing is known about it, so nothing changes.
    const r = life.closeDay(s, "2026-10-31", always);
    expect(r.outcome).toBe("none");
    expect(s.streak).toBe(3);
    expect(s.dirt).toBe(0);
    expect(s.snacks).toBe(1);
  });

  it("treats rest days like a weekend", () => {
    const s = seenDay({ dayWorkday: false, streak: 4, snacks: 0 });
    expect(life.closeDay(s, "2026-10-27", always).outcome).toBe("none");
    expect(s.streak).toBe(4);
    expect(s.dirt).toBe(0);
    // The new day starts with what the schedule says about it.
    expect(s.dayWorkday).toBe(true);
    life.closeDay(s, "2026-10-28", (k) => k !== "2026-10-28");
    expect(s.dayWorkday).toBe(false);
  });

  it("excuses a packed calendar day when nothing got done", () => {
    const s = seenDay({ dayBusy: true, streak: 4, snacks: 1 });
    expect(life.closeDay(s, "2026-10-27", always).outcome).toBe("excused");
    expect(s.streak).toBe(4);
    expect(s.dirt).toBe(0);
    expect(s.snacks).toBe(1);
    // A busy day with a finished task still counts.
    life.syncDay(s, 1, 3, 1, true, true);
    expect(life.closeDay(s, "2026-10-28", always).outcome).toBe("kept");
    expect(s.streak).toBe(5);
  });

  it("eats a snack to save a missed day", () => {
    const s = seenDay({ streak: 5, snacks: 1 });
    const r = life.closeDay(s, "2026-10-27", always);
    expect(r.outcome).toBe("frozen");
    expect(s.snacks).toBe(0);
    expect(s.streak).toBe(5);
    expect(s.dirt).toBe(0);
    expect(s.repair).toBeNull();
  });

  it("earns a snack on a goal day, two at most", () => {
    // 3 of 3 done but 4 planned: a goal day, not a perfect day.
    const s = seenDay({ dayCompleted: 3, dayPlanned: 4, snacks: 1 });
    const r = life.closeDay(s, "2026-10-27", always);
    expect(r).toMatchObject({ outcome: "kept", snackEarned: true, sticker: false });
    expect(s.snacks).toBe(2);
    life.syncDay(s, 3, 4, 3, true);
    expect(life.closeDay(s, "2026-10-28", always).snackEarned).toBe(false);
    expect(s.snacks).toBe(life.MAX_SNACKS);
  });

  it("breaks the streak without a snack, offering a repair only for streaks of 2+", () => {
    const s = seenDay({ streak: 3, snacks: 0 });
    const r = life.closeDay(s, "2026-10-27", always);
    expect(r).toMatchObject({ outcome: "broken", lost: 3, repairOffered: true });
    expect(s.streak).toBe(0);
    expect(s.dirt).toBe(1);
    expect(s.repair).toEqual({ streak: 3, until: "2026-11-09" });

    const short = seenDay({ streak: 1, snacks: 0 });
    const r1 = life.closeDay(short, "2026-10-27", always);
    expect(r1).toMatchObject({ outcome: "broken", lost: 1, repairOffered: false });
    expect(short.repair).toBeNull();
  });

  it("repairs the streak once 2 tasks are done on the next workday, and that day counts too", () => {
    const s = seenDay({ streak: 6, snacks: 0 });
    life.closeDay(s, "2026-10-27", always);
    expect(life.activeRepair(s)).toEqual({ streak: 6, until: "2026-11-09" });
    life.syncDay(s, 1, 3, 3, true);
    expect(life.checkRepair(s)).toBe(0);
    expect(s.streak).toBe(0);
    life.syncDay(s, 2, 3, 3, true);
    expect(life.checkRepair(s)).toBe(6);
    expect(s.streak).toBe(6);
    expect(s.repair).toBeNull();
    expect(life.closeDay(s, "2026-10-28", always).outcome).toBe("kept");
    expect(s.streak).toBe(7);
    expect(s.bestStreak).toBe(7);
  });

  it("waits through weekends for the repair, then lets it expire", () => {
    // Broken on Friday 30 October.
    const s = seenDay({ dayKey: "2026-10-30", streak: 4, snacks: 0 });
    life.closeDay(s, "2026-10-31", always);
    // Saturday is not a workday: the quest waits for Monday.
    life.syncDay(s, 0, 0, 3, false);
    expect(life.activeRepair(s)).toBeNull();
    expect(life.closeDay(s, "2026-11-02", always).repairExpired).toBe(false);
    expect(s.repair).not.toBeNull();
    // Monday: one task only, so the quest ends with the day (the day itself still counts).
    life.syncDay(s, 1, 3, 3, true);
    expect(life.activeRepair(s)?.streak).toBe(4);
    const r = life.closeDay(s, "2026-11-03", always);
    expect(r).toMatchObject({ outcome: "kept", repairExpired: true });
    expect(s.repair).toBeNull();
    expect(s.streak).toBe(1);
  });

  it("drops a repair quest 14 days after the break, but not a day earlier", () => {
    const s = seenDay({ streak: 4, snacks: 0 });
    life.closeDay(s, "2026-10-27", always);
    // The PC stays off for two weeks.
    expect(life.closeDay(s, "2026-11-09", always).repairExpired).toBe(false);
    expect(life.activeRepair(s)?.until).toBe("2026-11-09");
    expect(life.closeDay(s, "2026-11-10", always).repairExpired).toBe(true);
    expect(s.repair).toBeNull();
  });
});

describe("sticker pages", () => {
  it("fills the page one perfect day at a time", () => {
    const s = life.newLife();
    expect(s.stickerPage).toBe(1);
    expect(s.pageFilled).toBe(life.PAGE_GIFTS);
    s.dayKey = "2026-10-26";
    life.syncDay(s, 3, 3, 3, true);
    const r = life.closeDay(s, "2026-10-27", always);
    expect(r).toMatchObject({ sticker: true, pageDone: false });
    expect(s.pageFilled).toBe(3);
    expect(s.xp).toBe(30);
  });

  it("rewards a full page with XP and a snack, then starts a new page with 2 gifts", () => {
    const s = seenDay({ dayCompleted: 3, stickerPage: 2, pageFilled: 9, snacks: 0, xp: 0 });
    const r = life.closeDay(s, "2026-10-27", always);
    expect(r).toMatchObject({ sticker: true, pageDone: true, snackEarned: true });
    expect(s.xp).toBe(30 + 50);
    // One snack for the goal day, one for the page.
    expect(s.snacks).toBe(2);
    expect(s.stickerPage).toBe(3);
    expect(s.pageFilled).toBe(life.PAGE_GIFTS);
  });
});

describe("life migration", () => {
  it("fills in snacks, repair and sticker pages for a pet saved by an older version", () => {
    const perfectDays = Array.from({ length: 10 }, (_, i) => `2026-10-${String(10 + i).padStart(2, "0")}`);
    const s = life.lifeFromJson({ streak: 4, perfectDays, dayKey: "2026-10-26", dayCompleted: 0 });
    expect(s.snacks).toBe(1);
    expect(s.repair).toBeNull();
    // 10 perfect days: page 1 + ⌊10 ÷ 8⌋ = 2, with 2 gifts + 10 mod 8 = 4 filled.
    expect(s.stickerPage).toBe(2);
    expect(s.pageFilled).toBe(4);
    // The stored day was seen by the older version.
    expect(s.daySeen).toBe(true);
    expect(s.dayBusy).toBe(false);
  });

  it("clamps broken new fields", () => {
    const s = life.lifeFromJson({ snacks: 9, stickerPage: 0, pageFilled: 42, repair: { streak: "x" } });
    expect(s.snacks).toBe(2);
    expect(s.stickerPage).toBe(1);
    expect(s.pageFilled).toBe(10);
    expect(s.repair).toBeNull();
    const t = life.lifeFromJson({ snacks: -1, repair: { streak: 5, until: "2026-11-01" }, daySeen: false });
    expect(t.snacks).toBe(0);
    expect(t.repair).toEqual({ streak: 5, until: "2026-11-01" });
    expect(t.daySeen).toBe(false);
  });
});

describe("calm", () => {
  it("detects the zone with hysteresis and spaces bubbles", () => {
    const t0 = new Date(2026, 9, 28, 10);
    let since = calm.engagedSince(null, calm.engaged(3, 3, false), 3, t0);
    expect(since).toEqual(t0);
    since = calm.engagedSince(since, calm.engaged(60, 3, false), 60, new Date(t0.getTime() + 60_000));
    expect(since).toEqual(t0);
    expect(calm.inFlow(since, new Date(t0.getTime() + 10 * 60_000))).toBe(true);
    expect(calm.engagedSince(since, false, 200, t0)).toBeNull();
    expect(calm.atBreakpoint(3, 60)).toBe(false);
    expect(calm.atBreakpoint(3, 2)).toBe(true);
    expect(calm.withinBudget(t0, new Date(t0.getTime() + 14 * 60_000), 15)).toBe(false);
  });
});

describe("stuck", () => {
  it("counts days seen or overdue", () => {
    const now = new Date(2026, 9, 28, 10);
    const seen = {};
    const t = task("x", { due: due("2026-10-25") });
    recordSeen(seen, [t], now);
    expect(stuckDays(1, "2026-10-25", "2026-10-28")).toBe(4);
    expect(findStuck(seen, [t], 3, now).map((s) => s.days)).toEqual([4]);
    expect(findStuck(seen, [task("r", { due: { ...due("2026-10-20"), isRecurring: true } })], 3, now)).toEqual([]);
  });
});

describe("sites", () => {
  it("matches domains, subdomains and address parts", () => {
    const rules = siteRules("YouTube.com, https://www.reddit.com, youtube.com/shorts");
    expect(rules).toEqual(["youtube.com", "reddit.com", "youtube.com/shorts"]);
    expect(matchSite("m.youtube.com", "https://m.youtube.com/x", ["youtube.com"])).toBe("youtube.com");
    expect(matchSite("notyoutube.com", "https://notyoutube.com", ["youtube.com"])).toBeNull();
    expect(matchSite("youtube.com", "https://youtube.com/shorts/abc", ["youtube.com/shorts"])).toBe("youtube.com/shorts");
    expect(hostOf("www.facebook.com/feed")).toBe("facebook.com");
  });

  it("finds the distraction in front", () => {
    const sites = siteRules("youtube.com");
    const apps = appRules("Discord, Steam");
    const chrome = { name: "Google Chrome", exe: "chrome.exe", title: "Cats - YouTube - Google Chrome" };
    expect(currentDistraction(chrome, "https://www.youtube.com/watch?v=1", sites, apps, true)).toBe("youtube.com");
    expect(currentDistraction(chrome, null, sites, apps, true)).toBe("youtube.com");
    expect(currentDistraction(chrome, "https://youtube.com", sites, apps, false)).toBeNull();
    expect(currentDistraction({ name: "Discord", exe: "discord.exe", title: "" }, null, sites, apps, true)).toBe("Discord");
    expect(currentDistraction({ name: "Code", exe: "code.exe", title: "" }, null, sites, apps, true)).toBeNull();
  });
});

describe("calendar", () => {
  const day = new Date(2026, 9, 28, 8);
  const ics = (body: string) => `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//t//t//EN\r\n${body}END:VCALENDAR\r\n`;
  const ev = (lines: string[]) => `BEGIN:VEVENT\r\n${lines.join("\r\n")}\r\nEND:VEVENT\r\n`;

  it("reads timed events, skips all-day, free and cancelled ones", () => {
    const text = ics(
      ev(["UID:a", "DTSTART:20261028T100000", "DTEND:20261028T110000", "SUMMARY:Sync", "DESCRIPTION:Join https://meet.google.com/abc-defg"]) +
        ev(["UID:b", "DTSTART;VALUE=DATE:20261028", "DTEND;VALUE=DATE:20261029", "SUMMARY:Holiday"]) +
        ev(["UID:c", "DTSTART:20261028T120000", "DTEND:20261028T130000", "SUMMARY:Lunch", "TRANSP:TRANSPARENT"]) +
        ev(["UID:d", "DTSTART:20261028T140000", "DTEND:20261028T150000", "SUMMARY:Gone", "STATUS:CANCELLED"]) +
        ev(["UID:e", "DTSTART:20261029T100000", "DTEND:20261029T110000", "SUMMARY:Tomorrow"]),
    );
    const events = eventsOnDay([text], day);
    expect(events.map((e) => e.title)).toEqual(["Sync"]);
    expect(events[0].start.getHours()).toBe(10);
    expect(events[0].joinUrl).toBe("https://meet.google.com/abc-defg");
  });

  it("expands recurring series with moved and cancelled occurrences", () => {
    const text = ics(
      ev(["UID:s", "DTSTART:20261001T090000", "DTEND:20261001T091500", "RRULE:FREQ=DAILY", "EXDATE:20261027T090000", "SUMMARY:Standup"]) +
        ev(["UID:s", "RECURRENCE-ID:20261028T090000", "DTSTART:20261028T093000", "DTEND:20261028T094500", "SUMMARY:Standup (moved)"]),
    );
    const events = eventsOnDay([text], day);
    expect(events.map((e) => [e.title, e.start.getHours(), e.start.getMinutes()])).toEqual([["Standup (moved)", 9, 30]]);
    expect(eventsOnDay([text], new Date(2026, 9, 27))).toEqual([]);
    expect(eventsOnDay(["garbage"], day)).toEqual([]);
  });

  it("does free-time math and suggests slots", () => {
    const at = (h: number, m = 0) => new Date(2026, 9, 28, h, m);
    const events: CalEvent[] = [
      { id: "1", title: "A", start: at(10), end: at(11), joinUrl: null },
      { id: "2", title: "B", start: at(10, 30), end: at(11, 30), joinUrl: null },
      { id: "3", title: "C", start: at(14), end: at(15), joinUrl: null },
    ];
    expect(busy(events, at(8), at(18))).toHaveLength(2);
    expect(freeMinutes(events, at(8), at(18))).toBe(600 - 150);
    expect(freeSlots(events, at(8), at(18)).length).toBe(3);
    expect(adaptiveTarget(200, 3)).toBe(2);
    expect(adaptiveTarget(0, 3)).toBe(1);
    const s = suggestSlots([task("1"), task("2", { durationMinutes: 30 })], events, at(9, 50), at(18));
    expect(s[0].start).toEqual(at(11, 30));
    expect(s[1].start).toEqual(at(12, 40));
    expect(joinUrl("https://example.com/e", ["call: https://us02web.zoom.us/j/1"])).toBe("https://us02web.zoom.us/j/1");
    // Anyone can put an invite in your calendar: arbitrary links never reach the "Join" button.
    expect(joinUrl("https://evil.example/login", ["no link here"])).toBeNull();
    expect(joinUrl("http://meet.google.com/abc", [])).toBeNull();
    expect(joinUrl("msteams:/l/meetup-join/19%3ameeting", [])).toBe("msteams:/l/meetup-join/19%3ameeting");
    expect(joinUrl("msteams:/l/app/evil", [])).toBeNull();
  });
});

describe("prefs", () => {
  it("merges stored JSON over defaults and clamps", () => {
    const p = prefsFromJson({ dailyTarget: 99, species: "fox", lang: "vi", soundMode: "loud", petName: "  " }, 1);
    expect(p.dailyTarget).toBe(10);
    expect(p.species).toBe("fox");
    expect(p.lang).toBe("vi");
    expect(p.soundMode).toBe("important");
    expect(p.petName).toBe("Mochi");
    expect(prefsFromJson({ species: "trex" }).species).toBe("mochi");
    expect(isWorkday(defaultPrefs(), new Date(2026, 9, 31))).toBe(false);
  });

  it("keeps rest days tidy: valid, deduped, sorted, from yesterday on, 60 at most", () => {
    const now = new Date(2026, 9, 29, 12).getTime();
    const p = prefsFromJson({ restDays: ["2026-11-02", "2026-10-27", "bad", 5, "2026-10-28", "2026-11-02", "2026-02-30", "2026-11-2"] }, now);
    expect(p.restDays).toEqual(["2026-10-28", "2026-11-02"]);
    expect(prefsFromJson({ restDays: "2026-11-02" }, now).restDays).toEqual([]);
    expect(defaultPrefs(now).restDays).toEqual([]);
    const many = dayRange("2026-10-29", "2026-12-31", 100);
    const capped = prefsFromJson({ restDays: many }, now).restDays;
    expect(capped).toHaveLength(MAX_REST_DAYS);
    expect(capped[0]).toBe("2026-10-29");
  });

  it("is not a workday on a rest day", () => {
    const p = { ...defaultPrefs(), restDays: ["2026-10-28"] };
    expect(isWorkday(p, new Date(2026, 9, 28, 9))).toBe(false);
    expect(isWorkday(p, new Date(2026, 9, 29, 9))).toBe(true);
  });

  it("lists the days of a range, in either order, 30 at most", () => {
    expect(dayRange("2026-10-30", "2026-11-02")).toEqual(["2026-10-30", "2026-10-31", "2026-11-01", "2026-11-02"]);
    expect(dayRange("2026-11-02", "2026-10-30")).toHaveLength(4);
    expect(dayRange("2026-11-01", "2026-12-31")).toHaveLength(MAX_REST_RANGE);
    expect(dayRange("2026-11-01", "")).toEqual([]);
  });
});

describe("diary", () => {
  it("parses, summarizes and exports", () => {
    const lines = [
      JSON.stringify({ at: 1, kind: "bubble", text: "hi" }),
      JSON.stringify({ at: 2, kind: "response", text: "x", tag: "ignored" }),
      "{broken",
      JSON.stringify({ at: 3, kind: "flow", text: "y", tag: "flowEnd", minutes: 12 }),
    ];
    const entries = parseEntries(lines);
    expect(entries).toHaveLength(3);
    const s = summarize(entries);
    expect([s.reminders, s.ignored, s.focusMinutes]).toEqual([1, 1, 12]);
    expect(asText("2026-10-28", entries)).toContain("hi");
  });
});
