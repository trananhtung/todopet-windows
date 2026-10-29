import { afterEach, describe, expect, it, vi } from "vitest";
import * as calm from "./calm";
import { adaptiveTarget, busy, eventsOnDay, freeMinutes, freeSlots, joinUrl, suggestSlots, type CalEvent } from "./calendar";
import { daysBetween, dayKey, hoursText, nextDayKey, parseDate, plainText, shortText, utcString } from "./dates";
import { asText, parseEntries, summarize } from "./diary";
import { L, langFromLocale, pick, setLang } from "./l10n";
import * as life from "./life";
import { actionable, buildDay, dueTime, nextTask, planned, ranked, statsFromRaw, taskFromRaw, uiPriority, type TodoTask } from "./models";
import * as lines from "./lines";
import * as friends from "./friends";
import { defaultMoodInputs, evaluateMood, moodEmoji, moodLabel } from "./mood";
import { addRestDays, dayRange, defaultPrefs, isWorkday, MAX_REST_DAYS, MAX_REST_RANGE, prefsFromJson } from "./prefs";
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

  it("worries (never gets grumpy) without a plan after the deadline", () => {
    const r = evaluateMood({ ...defaultMoodInputs(), hoursAfterPlanDeadline: 2, planned: 0, remaining: 0 });
    // 60 − (12 + 3·6 + 16) = 14
    expect(r.score).toBe(14);
    expect(r.mood).toBe("annoyed");
  });

  it("is grumpy only during an active distraction in work hours; everything else bottoms out at worried", () => {
    const awful = { ...defaultMoodInputs(), overdue: 5, late: 3, satiety: 0, dirt: 3, stuck: 3, hoursAfterPlanDeadline: 3, planned: 0, minutesSinceProgress: 400 };
    expect(evaluateMood(awful).score).toBe(0);
    expect(evaluateMood(awful).mood).toBe("annoyed");
    const yt = { distractedMinutes: 3, distractionApp: "youtube.com" };
    expect(evaluateMood({ ...awful, ...yt }).mood).toBe("angry");
    // A glance under 2 minutes, a meeting, or after hours: no distraction, so no grumpiness.
    expect(evaluateMood({ ...awful, ...yt, distractedMinutes: 1.5 }).mood).toBe("annoyed");
    expect(evaluateMood({ ...awful, ...yt, inMeeting: true }).mood).toBe("annoyed");
    expect(evaluateMood({ ...awful, ...yt, inWorkHours: false }).mood).toBe("normal");
    // A distraction alone on a good day only worries it.
    expect(evaluateMood({ ...defaultMoodInputs(), planned: 3, remaining: 3, ...yt }).mood).toBe("annoyed");
  });

  it("calls the second-lowest mood worried", () => {
    setLang("en");
    expect(moodLabel("annoyed")).toBe("worried");
    expect(moodEmoji("annoyed")).toBe("😟");
    setLang("vi");
    expect(moodLabel("annoyed")).toBe("đang lo lắng");
    setLang("en");
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

describe("kind lines", () => {
  const t = task("1", { content: "Write the report" });
  const stuckTask = { task: t, days: 5 };
  /** Every variant of a line, in both languages. */
  const variants = (make: () => string) => {
    const out: string[] = [];
    for (const lang of ["en", "vi"] as const) {
      setLang(lang);
      for (const r of [0, 0.5, 0.99]) {
        const spy = vi.spyOn(Math, "random").mockReturnValue(r);
        out.push(make());
        spy.mockRestore();
      }
    }
    setLang("en");
    return out;
  };
  /** Telling-off words, in both languages (case-insensitive). */
  const scolding = /\?!|💢|😤|😠|😒|😑|\bmad\b|giận|lazy|lười|không làm gì|\bsad\b|buồn|goof|enough|đủ rồi|slack|waste|phí thời gian|bored|chán|get to work|làm việc đi|\bnow!|ngay!|again\?|nữa hả/i;
  /** Never said, not even while you're on a distraction (case-insensitive). */
  const insults = /\?!|!!|💢|😠|\bmad\b|giận|lazy|lười|goof|enough|đủ rồi|stupid|ngốc|useless|vô dụng|shame|xấu hổ|waste|phí thời gian|get to work|làm việc đi/i;
  /** Shouting: a word of four or more capitals (the app name included). */
  const shouting = /\b[A-ZĐ]{4,}\b/;
  /** While you're on a distracting app or site, the pet may be playful (but never insulting or shouting). */
  const DISTRACTION_TIME = new Set(["distraction", "grumble", "parade", "block"]);

  const moods = ["happy", "normal", "annoyed", "angry", "sleeping", "focus", "celebrating"] as const;
  const at9 = new Date(2026, 9, 28, 9);
  const ev = { id: "e", title: "Sync", start: new Date(2026, 9, 28, 10), end: new Date(2026, 9, 28, 11), joinUrl: null };
  const slot = { task: t, start: new Date(2026, 9, 28, 14), end: new Date(2026, 9, 28, 14, 30) };
  /** Sample arguments for every exported line (a new line needs an entry here). */
  const ARGS: Record<string, unknown[][]> = {
    greeting: [[at9], [new Date(2026, 9, 28, 12)], [new Date(2026, 9, 28, 15)], [new Date(2026, 9, 28, 20)]],
    hello: [["Mochi"]],
    morning: [
      [at9, 1, 3, t, 3],
      [at9, 3, 3, t, 3],
      [at9, 3, 0, null, 3],
      [at9, 3, 3, t, 3, { frog: t, note: "Start with the intro" }],
      [at9, 3, 3, t, 3, { frog: task("2", { content: "Call Anna" }), note: null }],
      [at9, 1, 3, t, 3, { frog: t, note: "Call mum" }],
      [at9, 3, 0, null, 3, { frog: null, note: "Call mum" }],
      [at9, 3, 3, t, 3, { frog: null, note: null }],
    ],
    plan: moods.map((m) => [m, 1, 3]),
    nudge: moods.map((m) => [m, t, 3]),
    overdue: moods.flatMap((m) => [[m, 2, 0], [m, 1, 2], [m, 0, 2], [m, 0, 1]]),
    freshStart: [[2, 0], [1, 1]],
    freshStartPartial: [[2, 3, 1, 0, "offline"], [0, 2, 2, 1, "offline"]],
    freshStartUndone: [[2, 0], [1, 1]],
    distraction: moods.flatMap((m) => [[m, "youtube.com", 2, t], [m, "Discord", 1, null]]),
    done: [[t, 1, 3, "meow"], [t, 3, 3, "meow"]],
    allDone: [[]],
    review: [[1, 3, 2], [1, 3, 2, "Monday"], [1, 3, 2, "Thứ Hai"], [3, 3, 0], [0, 0, 0]],
    overbooked: [
      [{ taskMinutes: 360, meetingMinutes: 180, capacity: 420, overBy: 120 }],
      [{ taskMinutes: 200, meetingMinutes: 0, capacity: 90, overBy: 110 }],
      [{ taskMinutes: 480, meetingMinutes: 45, capacity: 30, overBy: 495 }],
    ],
    loadMeter: [
      [{ taskMinutes: 240, meetingMinutes: 120, capacity: 420, overBy: 0 }],
      [{ taskMinutes: 360, meetingMinutes: 180, capacity: 420, overBy: 120 }],
      [{ taskMinutes: 90, meetingMinutes: 0, capacity: 0, overBy: 90 }],
      [{ taskMinutes: 0, meetingMinutes: 0, capacity: 0, overBy: 0 }],
    ],
    loadDetail: [
      [{ taskMinutes: 240, meetingMinutes: 120, capacity: 420, overBy: 0 }],
      [{ taskMinutes: 360, meetingMinutes: 180, capacity: 420, overBy: 120 }],
      [{ taskMinutes: 90, meetingMinutes: 0, capacity: 0, overBy: 90 }],
    ],
    wrappedUp: [[t], [null], [t, "Monday"], [t, "Thứ Hai"]],
    backToWork: [[]],
    welcomeBack: [[t]],
    soon: [[t, 5]],
    dueNow: [[t]],
    focusStart: [[t, 25], [null, 1]],
    focusEnd: [[t, 25], [null, 1]],
    breakStart: [[5]],
    breakEnd: [[]],
    added: [["Buy milk"]],
    planComplete: [[3, t], [3, null]],
    lateNight: [[]],
    error: [["offline"]],
    connected: [[]],
    demoHello: [[]],
    movedToTomorrow: [[2], [2, "Monday"], [2, "Thứ Hai"]],
    wrapIntro: [[null], ["Monday"], ["Thứ Hai"]],
    wrapNoWins: [[null], ["Monday"], ["Thứ Hai"]],
    wrapForLabel: [[null], ["Monday"], ["Thứ Hai"]],
    wrapFrogLabel: [[null], ["Monday"], ["Thứ Hai"]],
    wrapDecideLater: [[null], ["Monday"], ["Thứ Hai"]],
    wrapFrogDone: [["Write the report", null], ["Write the report", "Monday"], ["Write the report", "Thứ Hai"]],
    wrapNoteLabel: [[null], ["Monday"], ["Thứ Hai"]],
    meetingSoon: [[ev, 5], [ev, 5, [t, t]]],
    meetingOver: [[ev, null], [ev, { ...ev, title: "Design review", start: new Date(2026, 9, 28, 11, 10) }], [ev, { ...ev, title: "Design review", start: new Date(2026, 9, 28, 11, 10) }, 4]],
    resumeCard: [
      [{ task: "Write the weekly report", where: "Visual Studio Code — brain.ts", note: "Fix the retry loop", canReopen: true, host: null, taskIsNext: false }, "away"],
      [{ task: "Write the weekly report", where: "Visual Studio Code — brain.ts", note: null, canReopen: false, host: null, taskIsNext: true }, "away"],
      [{ task: "Write the weekly report", where: null, note: null, canReopen: false, host: null, taskIsNext: true }, "meeting"],
      [{ task: null, where: "Notepad", note: null, canReopen: false, host: null, taskIsNext: false }, "meeting"],
      [{ task: "Reply to the boss", where: null, note: null, canReopen: false, host: null, taskIsNext: false }, "distraction"],
      [{ task: null, where: null, note: "Call mum", canReopen: false, host: null, taskIsNext: false }, "away"],
    ],
    resumePlace: [
      [{ task: "Write the weekly report", where: "Google Chrome — Q4 plan - Google Docs", note: null, canReopen: true, host: "docs.google.com", taskIsNext: true }],
      [{ task: "Write the weekly report", where: "Visual Studio Code — brain.ts", note: null, canReopen: false, host: null, taskIsNext: false }],
      [{ task: null, where: "Notepad", note: null, canReopen: false, host: null, taskIsNext: false }],
    ],
    reopenTitle: [["docs.google.com"], [null]],
    reopenFailed: [[]],
    triggerKindText: [[{ kind: "afterMeeting", eventId: "e", title: "Sync" }], [{ kind: "appOpen", app: "Figma" }], [{ kind: "afterLunch" }]],
    starterGone: [[t], [null]],
    resumeDiary: [["Write the weekly report", true], [null, false]],
    pinned: [[]],
    asPlanned: [[t]],
    triggerChip: [
      [{ kind: "afterMeeting", eventId: "e", title: "Sync" }, [ev]],
      [{ kind: "afterMeeting", eventId: "gone", title: "Sync" }, []],
      [{ kind: "appOpen", app: "Visual Studio Code" }, []],
      [{ kind: "afterLunch" }, []],
    ],
    triggerChoice: [
      [{ kind: "afterMeeting", eventId: "e", title: "Sync" }, [ev]],
      [{ kind: "appOpen", app: "Figma" }, []],
      [{ kind: "afterLunch" }, []],
    ],
    appSeen: [["Figma"], ["Visual Studio Code"]],
    appUnseen: [[]],
    switchToStarter: [[0], [1], [12]],
    loadOver: [
      [{ taskMinutes: 600, meetingMinutes: 105, capacity: 480, overBy: 225 }],
      [{ taskMinutes: 90, meetingMinutes: 0, capacity: 0, overBy: 90 }],
    ],
    lightenHint: [["tomorrow"], ["Monday"]],
    dayFits: [[]],
    freesTime: [[20], [120]],
    estimateLabel: [[15], [30], [90], [240]],
    starterStart: [[t], [null]],
    starterEnd: [[t], [null]],
    starterEnough: [[]],
    calendarDay: [[2, 90, 300, 2, true], [1, 30, 400, 3, false]],
    timeBlock: [[slot]],
    timeSet: [[t, slot.start]],
    stuck: moods.map((m) => [stuckTask, m]),
    splitDone: [[3, "Outline"]],
    deleted: [[t]],
    confirmDelete: [[t]],
    unplanned: [[t]],
    golden: [[]],
    combo: [[3]],
    cleaned: [[0], [1]],
    levelUp: [[2]],
    unlocked: [[["bow", "crown"]]],
    speciesUnlocked: [["🐉", "Dragon"]],
    streak: [[4]],
    dirty: [[2]],
    dayFrozen: [["yesterday", 5, 1], ["3 days ago", 2, 0]],
    dayExcused: [["yesterday", 5], ["yesterday", 0]],
    dayBroken: [["yesterday", 5, 2, true], ["yesterday", 5, 2, false]],
    pageDone: [[2, true], [2, false]],
    streakRepaired: [[6]],
    repairExpired: [[0], [1]],
    dayOff: [[true, 4], [true, 0], [false, 4]],
    hungry: [[20, t], [5, null]],
    grumble: [[t]],
    parade: [[t]],
    block: [["youtube.com", t], ["Discord", null]],
    distractionSummary: [[{ "youtube.com": 720, Discord: 300 }]],
    voiceGrumble: [[]],
    voiceAngry: [[t]],
    voiceBlock: [["youtube.com"]],
    voiceHungry: [[]],
    voiceCheer: [[]],
    voiceSummary: [[17]],
    tip: [[]],
    // v0.5 Game: trips and the Monday fresh start.
    tripOffer: [[new Date(2026, 9, 28, 16)]],
    tripGo: [[]],
    tripStay: [[]],
    tripStayed: [[]],
    tripStart: [["Hội An", new Date(2026, 9, 28, 16)]],
    tripBack: [
      [{ place: "hoian", minutes: 120, souvenir: "hoian", xp: 0 }],
      [{ place: "hoian", minutes: 120, souvenir: null, xp: 20 }],
      [{ place: "hoian", minutes: 10, souvenir: null, xp: 0 }],
    ],
    postcard: [["Hội An", "Lanterns on the river at night."]],
    newWeek: [[{ key: "2026-10-26", done: 11, stickers: 2, trips: 1 }], [{ key: "2026-10-26", done: 0, stickers: 0, trips: 0 }], [null]],
  };

  it("never scolds: every line and every spoken line, in both languages; only playful while you're on a distraction", () => {
    const fns = Object.entries(lines).filter((e): e is [string, (...a: unknown[]) => string] => typeof e[1] === "function");
    expect(fns.length).toBeGreaterThan(50);
    for (const [name, fn] of fns) {
      expect(ARGS[name], `sample arguments for lines.${name}`).toBeDefined();
      for (const args of ARGS[name]) {
        for (const text of variants(() => fn(...args))) {
          if (DISTRACTION_TIME.has(name)) {
            expect(text, `${name}: ${text}`).not.toMatch(insults);
            expect(text, `${name}: ${text}`).not.toMatch(shouting);
          } else {
            expect(text, `${name}: ${text}`).not.toMatch(scolding);
          }
        }
      }
    }
  });

  // v0.6 "Friends": the words around cards, friends and the blob live in friends.ts. They never scold either (a refused card is
  // "that's one of your own older cards", never "you did it wrong"), and none of them repeats what a pasted card says.
  it("never scolds in the Friends words: every refusal, help line and win, in both languages", () => {
    const card: friends.PetCard = { pk: "A".repeat(43), name: "Mai", species: "shiba", accessories: [], stage: 2, week: "2026-W44", weekDone: 5, history: "G".repeat(28), date: "2026-10-29" };
    const friend: friends.Friend = { ...card, lastVisit: null };
    const errors: friends.CardError[] = ["empty", "tooLong", "prefix", "encoding", "json", "shape", "version", "key", "name", "species", "accessory", "number", "history", "week", "date", "future", "signature", "unchecked"];
    const refusals = (): string[] => {
      const out: string[] = [];
      // Your own card, an older card of yours, a friend's older card, a full list.
      for (const r of [
        friends.addFriend([], card, card.pk),
        friends.addFriend([], card, null, [card.pk]),
        friends.addFriend([friend], { ...card, date: "2026-10-20", week: "2026-W43" }, null),
        friends.addFriend(Array.from({ length: friends.MAX_FRIENDS }, (_, i) => ({ ...friend, pk: `${i}`.padEnd(43, "B") })), card, null),
      ]) {
        if (!r.ok) out.push(r.message);
      }
      return out;
    };
    const kind: [string, () => string[]][] = [
      ["a card that can't be added", refusals],
      ["a card that can't be read", () => errors.map((e) => friends.cardErrorText(e))],
      ["the blob's help line", () => [friends.bossHelpText()]],
      ["the blob, alone", () => [friends.bossAloneText()]],
      ["the blob, beaten", () => [friends.bossWinText(true), friends.bossWinText(false)]],
      ["the visit's label", () => [friends.visitLabel("Mai", 0), friends.visitLabel("Mai", 4), friends.visitLabel("Mai · #a3f", 12)]],
    ];
    for (const [what, make] of kind) {
      for (const text of variants(() => make().join("\n"))) {
        expect(text, `${what}: ${text}`).not.toMatch(scolding);
        expect(text, `${what}: ${text}`).not.toMatch(shouting);
        // Nothing a card says comes back in an error.
        if (what.startsWith("a card")) expect(text, `${what}: ${text}`).not.toMatch(/\bMai\b|<|>/);
      }
    }
    setLang("en");
    // The older-card words are the ones the sheet promises.
    expect(refusals()[1]).toContain("That's one of your own older cards");
    expect(friends.bossHelpText()).toContain("(each person counts up to 15)");
  });

  it("speaks kindly: the voice lines are invitations, never orders", () => {
    for (const text of [
      ...variants(() => lines.voiceGrumble()),
      ...variants(() => lines.voiceAngry(t)),
      ...variants(() => lines.voiceBlock("YouTube")),
      ...variants(() => lines.voiceSummary(30)),
    ]) {
      expect(text).not.toMatch(scolding);
      expect(text).not.toMatch(insults);
      expect(text).not.toMatch(/!/);
    }
  });

  it("mentions a fresh start for overdue tasks, and only offers what can be done", () => {
    for (const mood of ["normal", "annoyed", "angry"] as const) {
      setLang("en");
      expect(lines.overdue(mood, 2, 0)).toMatch(/fresh start/i);
      expect(lines.overdue(mood, 1, 1)).toMatch(/1 repeating task stays put/i);
      // Every overdue task repeats: nothing to move, so no promise of moving.
      expect(lines.overdue(mood, 0, 2)).not.toMatch(/move|fresh start/i);
      expect(lines.overdue(mood, 0, 2)).toMatch(/2 repeating tasks/);
      setLang("vi");
      expect(lines.overdue(mood, 2, 0)).toMatch(/bắt đầu lại/i);
      expect(lines.overdue(mood, 0, 2)).not.toMatch(/dời|bắt đầu lại/i);
    }
    setLang("en");
    expect(lines.freshStart(2, 0)).toContain("2 overdue tasks");
    expect(lines.freshStart(2, 0)).toContain("clean slate");
    expect(lines.freshStart(1, 1)).toContain("1 overdue task ");
    expect(lines.freshStart(1, 1)).not.toContain("clean slate");
    expect(lines.freshStart(1, 1)).toMatch(/repeating tasks stay put/i);
    expect(lines.freshStartPartial(2, 3, 1, 0, "offline")).toContain("Moved 2 of 3 overdue tasks to tomorrow; 1 couldn't move");
    expect(lines.freshStartPartial(0, 2, 2, 0, "offline")).toMatch(/Couldn't move the 2 overdue tasks/);
  });

  it("says the overbooked day with what is ahead and what is left, in both languages", () => {
    const heavy = { taskMinutes: 360, meetingMinutes: 180, capacity: 420, overBy: 120 };
    setLang("en");
    expect(lines.overbooked(heavy)).toBe("Today looks overbooked: ~6h of tasks + 3h of meetings in 7h left. Move some?");
    expect(lines.overbooked({ taskMinutes: 200, meetingMinutes: 0, capacity: 150, overBy: 50 })).toBe("Today looks overbooked: ~3h20 of tasks in 2h30 left. Move some?");
    // Under an hour is said in minutes, never "0h45".
    expect(lines.overbooked({ taskMinutes: 120, meetingMinutes: 30, capacity: 45, overBy: 105 })).toBe("Today looks overbooked: ~2h of tasks + 30 min of meetings in 45 min left. Move some?");
    setLang("vi");
    expect(lines.overbooked(heavy)).toContain("~6h việc + 3h họp");
    expect(lines.overbooked(heavy)).toContain("7h");
    setLang("en");
  });

  it("shows the load meter as load over time left, and says so kindly when the day is over", () => {
    setLang("en");
    expect(lines.loadMeter({ taskMinutes: 240, meetingMinutes: 120, capacity: 420, overBy: 0 })).toBe("~6h / 7h left");
    expect(lines.loadMeter({ taskMinutes: 360, meetingMinutes: 180, capacity: 420, overBy: 120 })).toBe("~9h / 7h left");
    expect(lines.loadMeter({ taskMinutes: 90, meetingMinutes: 0, capacity: 0, overBy: 90 })).toBe("Work day is over · ~1h30 still open");
    expect(lines.loadDetail({ taskMinutes: 360, meetingMinutes: 180, capacity: 420, overBy: 120 })).toMatch(/6h of tasks.*3h of meetings.*7h.*2h over/);
    setLang("vi");
    expect(lines.loadMeter({ taskMinutes: 240, meetingMinutes: 120, capacity: 420, overBy: 0 })).toBe("~6h / 7h còn lại");
    setLang("en");
  });

  it("wishes you a good evening and names tomorrow's frog when there is one", () => {
    setLang("en");
    expect(lines.wrappedUp(t)).toContain("“Write the report”");
    expect(lines.wrappedUp(t)).toContain("🐸");
    expect(lines.wrappedUp(null)).not.toContain("🐸");
    expect(lines.wrappedUp(null)).toMatch(/rest/i);
    setLang("vi");
    expect(lines.wrappedUp(t)).toContain("“Write the report”");
    setLang("en");
  });

  it("names the frog and the note you left in the morning greeting", () => {
    setLang("en");
    const call = task("2", { content: "Call Anna" });
    // Planned: the frog is the first task, said as your own pick.
    const planned = lines.morning(at9, 3, 3, t, 3, { frog: t, note: "Start with the intro" });
    expect(planned).toContain("Good morning");
    expect(planned).toContain("picked");
    expect(planned).toContain("“Write the report”");
    expect(planned).toContain("📝");
    expect(planned).toContain("“Start with the intro”");
    // Not planned yet: the planning question comes first, the frog and the note follow.
    const asking = lines.morning(at9, 1, 3, t, 3, { frog: call, note: null });
    expect(asking.split("\n")[0]).toContain("1/3");
    expect(asking).toContain("“Call Anna”");
    expect(asking).not.toContain("Your note");
    // A frog that is not the next task is still named, next to the usual line.
    expect(lines.morning(at9, 3, 3, t, 3, { frog: call, note: null })).toMatch(/Eat the frog first: “Write the report”[\s\S]*“Call Anna”/);
    // Without a plan, nothing changes.
    expect(lines.morning(at9, 3, 3, t, 3)).toBe(lines.morning(at9, 3, 3, t, 3, null));
    expect(lines.morning(at9, 3, 3, t, 3, { frog: null, note: null })).toBe(lines.morning(at9, 3, 3, t, 3));
    setLang("vi");
    expect(lines.morning(at9, 3, 3, t, 3, { frog: t, note: "Bắt đầu từ phần mở đầu" })).toContain("“Bắt đầu từ phần mở đầu”");
    setLang("en");
  });

  it("invites you to wrap up the day when it is almost over", () => {
    setLang("en");
    expect(lines.review(1, 3, 2)).toMatch(/end of day/);
    expect(lines.review(1, 3, 2)).toMatch(/wrap up/i);
    setLang("vi");
    expect(lines.review(1, 3, 2)).toMatch(/tổng kết/i);
    setLang("en");
  });

  it("gives the whole choice when asked for it, for the menu's tooltip", () => {
    setLang("en");
    const e = { kind: "afterMeeting", eventId: "e", title: "A very long meeting title that goes on and on and on" } as const;
    expect(lines.triggerChoice(e, [])).toContain("A very long meeting title tha…");
    expect(lines.triggerChoice(e, [], Infinity)).toContain("A very long meeting title that goes on and on and on");
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
    expect(life.checkRepair(s)).toBeNull();
    expect(s.streak).toBe(0);
    life.syncDay(s, 2, 3, 3, true);
    expect(life.checkRepair(s)).toBe("restored");
    expect(s.streak).toBe(6);
    // Not final until the day closes: the quest remembers what the streak was.
    expect(s.repair).toEqual({ streak: 6, until: "2026-11-09", restored: { from: 0 } });
    expect(life.closeDay(s, "2026-10-28", always).outcome).toBe("kept");
    expect(s.repair).toBeNull();
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

describe("forgiving streaks, as reviewed", () => {
  it("keeps a restored streak only while today has 2 tasks done, and makes it final when the day closes", () => {
    const s = seenDay({ streak: 6, snacks: 0 });
    life.closeDay(s, "2026-10-27", always);
    life.syncDay(s, 2, 3, 3, true);
    expect(life.checkRepair(s)).toBe("restored");
    expect(s.streak).toBe(6);
    // Idempotent: the next sync with the same count changes nothing.
    expect(life.checkRepair(s)).toBeNull();
    // A failed close or an Undo: back to 1 of 2, and the streak goes back with it.
    life.syncDay(s, 1, 3, 3, true);
    expect(life.checkRepair(s)).toBe("reverted");
    expect(s.streak).toBe(0);
    expect(s.repair).toEqual({ streak: 6, until: "2026-11-09" });
    life.syncDay(s, 2, 3, 3, true);
    expect(life.checkRepair(s)).toBe("restored");
    // Undone on the phone after the last sync: the day closes with 1 task, so the quest ends unfinished.
    life.syncDay(s, 1, 3, 3, true);
    const r = life.closeDay(s, "2026-10-28", always);
    expect(r).toMatchObject({ outcome: "kept", repairExpired: true });
    expect(s.streak).toBe(1);
    expect(s.repair).toBeNull();
  });

  it("takes a restored streak back when the day closes unchecked, and keeps the quest", () => {
    const s = seenDay({ streak: 6, snacks: 0 });
    life.closeDay(s, "2026-10-27", always);
    // Two tasks finished in the pet, but Todoist never confirmed the day.
    life.syncDay(s, 2, 3, 3, true, false, false);
    expect(life.checkRepair(s)).toBe("restored");
    const r = life.closeDay(s, "2026-10-28", always);
    expect(r).toMatchObject({ outcome: "none", repairExpired: false });
    expect(s.streak).toBe(0);
    expect(s.repair).toEqual({ streak: 6, until: "2026-11-09" });
  });

  it("doesn't offer a repair that has already run out", () => {
    // Back after more than two weeks away: the 14 days have gone by.
    const s = seenDay({ streak: 5, snacks: 0 });
    const r = life.closeDay(s, "2026-11-10", always);
    expect(r).toMatchObject({ outcome: "broken", lost: 5, repairOffered: false, repairExpired: false });
    expect(s.repair).toBeNull();
    // On its last day it still can be done, so it's offered.
    const t = seenDay({ streak: 5, snacks: 0 });
    expect(life.closeDay(t, "2026-11-09", always).repairOffered).toBe(true);
    expect(t.repair?.until).toBe("2026-11-09");
  });

  it("counts a day as seen only from a count Todoist confirmed", () => {
    const s = { ...life.newLife(), dayKey: "2026-10-26" };
    life.syncDay(s, 0, 3, 3, true, false, false);
    expect(s.daySeen).toBe(false);
    life.syncDay(s, 1, 3, 3, true, false, true);
    expect(s.daySeen).toBe(true);
    // A later fetch failed: it's still a day the app saw.
    life.syncDay(s, 1, 3, 3, true, false, false);
    expect(s.daySeen).toBe(true);
  });

  it("counts work done on a rest day or a weekend, and never holds a missed one against you", () => {
    const s = seenDay({ dayWorkday: false, dayCompleted: 3, streak: 4, snacks: 0 });
    const r = life.closeDay(s, "2026-10-27", always);
    expect(r).toMatchObject({ outcome: "kept", snackEarned: true, sticker: true });
    expect(s.streak).toBe(5);
    expect(s.snacks).toBe(1);
    expect(s.perfectDays).toEqual(["2026-10-26"]);
    life.syncDay(s, 0, 0, 3, false);
    expect(life.closeDay(s, "2026-10-28", always).outcome).toBe("none");
    expect(s.streak).toBe(5);
    expect(s.dirt).toBe(0);
    expect(s.snacks).toBe(1);
  });

  it("keeps a packed day excused even if a later calendar fetch fails", () => {
    const s = seenDay({ streak: 4, snacks: 1 });
    life.syncDay(s, 0, 3, 3, true, true);
    life.syncDay(s, 0, 3, 3, true, false);
    expect(s.dayBusy).toBe(true);
    expect(life.closeDay(s, "2026-10-27", always).outcome).toBe("excused");
    expect(s.dayBusy).toBe(false);
  });

  it("keeps the snack when there's no streak to save, and lets an unfinished quest go", () => {
    const s = seenDay({ streak: 5, snacks: 0 });
    life.closeDay(s, "2026-10-27", always);
    s.snacks = 1;
    life.syncDay(s, 0, 3, 3, true);
    const r = life.closeDay(s, "2026-10-28", always);
    expect(r).toMatchObject({ outcome: "broken", lost: 0, repairOffered: false, repairExpired: true });
    expect(s.snacks).toBe(1);
    expect(s.dirt).toBe(2);
    expect(s.repair).toBeNull();
  });

  it("reports a growth stage reached with a sticker's or a page's XP", () => {
    const s = seenDay({ dayCompleted: 3, xp: 95 });
    expect(life.closeDay(s, "2026-10-27", always).levelUp).toBe(1);
    life.syncDay(s, 1, 3, 3, true);
    expect(life.closeDay(s, "2026-10-28", always).levelUp).toBeNull();
    const t = seenDay({ dayCompleted: 3, xp: 250, pageFilled: 9 });
    expect(life.closeDay(t, "2026-10-27", always)).toMatchObject({ pageDone: true, levelUp: 2 });
  });

  it("reads a restored quest back from disk", () => {
    expect(life.lifeFromJson({ repair: { streak: 6, until: "2026-11-09", restored: { from: 1 } } }).repair).toEqual({ streak: 6, until: "2026-11-09", restored: { from: 1 } });
    expect(life.lifeFromJson({ repair: { streak: 6, until: "2026-11-09", restored: "x" } }).repair).toEqual({ streak: 6, until: "2026-11-09" });
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

  it("counts today's reminders until the day closes", () => {
    expect(life.newLife().dayNudges).toBe(0);
    expect(life.lifeFromJson({ streak: 2 }).dayNudges).toBe(0);
    expect(life.lifeFromJson({ dayNudges: 5 }).dayNudges).toBe(5);
    expect(life.lifeFromJson({ dayNudges: -3 }).dayNudges).toBe(0);
    expect(life.lifeFromJson({ dayNudges: "x" }).dayNudges).toBe(0);
    const s = seenDay({ dayNudges: 6, dayCompleted: 1 });
    life.closeDay(s, "2026-10-27", always);
    expect(s.dayNudges).toBe(0);
  });

  it("keeps today's reminder gates, back-off and hold across restarts, until the day closes", () => {
    const saved = {
      dayFired: { "morning-2026-10-26": 1, nudge: 2, bad: "x" },
      dayBackoff: { distract: 4, nudge: 99, plan: 0.5, nope: 2 },
      dismissedInRow: 2,
      nudgeHoldUntil: 1234,
    };
    const s = { ...seenDay(), ...life.lifeFromJson(saved), dayKey: "2026-10-26", daySeen: true, dayCompleted: 1 };
    expect(s.dayFired).toEqual({ "morning-2026-10-26": 1, nudge: 2 });
    // Back-off doubles up to ×8; anything else is dropped.
    expect(s.dayBackoff).toEqual({ distract: 4, nudge: 8 });
    expect(s.dismissedInRow).toBe(2);
    expect(s.nudgeHoldUntil).toBe(1234);
    expect(life.lifeFromJson({}).dayFired).toEqual({});
    expect(life.lifeFromJson({ nudgeHoldUntil: "x", dismissedInRow: -1 })).toMatchObject({ nudgeHoldUntil: null, dismissedInRow: 0, dayBackoff: {} });
    life.closeDay(s, "2026-10-27", always);
    expect(s).toMatchObject({ dayFired: {}, dayBackoff: {}, dismissedInRow: 0 });
    // The hold is an absolute time: it runs out on its own, midnight or not.
    expect(s.nudgeHoldUntil).toBe(1234);
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

  it("adds rest days, telling how many were new and how many the 60-day cap left out", () => {
    const now = new Date(2026, 9, 29, 12).getTime();
    expect(addRestDays(["2026-11-02"], dayRange("2026-11-01", "2026-11-03"), now)).toEqual({
      restDays: ["2026-11-01", "2026-11-02", "2026-11-03"],
      added: 2,
      cut: 0,
    });
    // Already 60 days ahead: an earlier range pushes the furthest days out.
    const full = dayRange("2026-11-01", "2026-12-30", 60);
    expect(full).toHaveLength(MAX_REST_DAYS);
    const earlier = addRestDays(full, dayRange("2026-10-29", "2026-10-31"), now);
    expect(earlier).toMatchObject({ added: 3, cut: 3 });
    expect(earlier.restDays).toHaveLength(MAX_REST_DAYS);
    expect(earlier.restDays.at(-1)).toBe("2026-12-27");
    // A later one doesn't fit at all.
    expect(addRestDays(full, ["2027-01-05"], now)).toMatchObject({ added: 0, cut: 1 });
  });

  it("clamps the daily nudge budget to 0–30, 8 by default", () => {
    expect(defaultPrefs().nudgeBudget).toBe(8);
    expect(prefsFromJson({}).nudgeBudget).toBe(8);
    expect(prefsFromJson({ nudgeBudget: 99 }).nudgeBudget).toBe(30);
    expect(prefsFromJson({ nudgeBudget: -2 }).nudgeBudget).toBe(0);
    expect(prefsFromJson({ nudgeBudget: 0 }).nudgeBudget).toBe(0);
    expect(prefsFromJson({ nudgeBudget: 12.4 }).nudgeBudget).toBe(12);
    expect(prefsFromJson({ nudgeBudget: "5" }).nudgeBudget).toBe(8);
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

  it("skips entries without a finite time, and drops a bad count or day but keeps the entry", () => {
    const lines = [
      JSON.stringify({ at: 1, kind: "life", text: "done", tag: "done", count: 2, day: "2026-10-27" }),
      // JSON can't say Infinity, but a hand-edited file can say a string or null.
      '{"at": null, "kind": "life", "text": "no time"}',
      JSON.stringify({ at: "5", kind: "life", text: "string time" }),
      '{"at": 1e999, "kind": "life", "text": "infinite time"}',
      JSON.stringify({ at: 2, kind: "life", text: "bad count", count: -1 }),
      JSON.stringify({ at: 3, kind: "life", text: "fraction", count: 1.5 }),
      JSON.stringify({ at: 4, kind: "life", text: "text count", count: "3", day: "yesterday" }),
      "null",
      "42",
    ];
    const entries = parseEntries(lines);
    expect(entries.map((e) => e.text)).toEqual(["done", "bad count", "fraction", "text count"]);
    expect(entries[0]).toMatchObject({ count: 2, day: "2026-10-27" });
    for (const e of entries.slice(1)) {
      expect(e.count).toBeUndefined();
      expect(e.day).toBeUndefined();
    }
  });
});

describe("lines that name the next workday (v0.4 evaluation round 2, issue 3)", () => {
  afterEach(() => setLang("en"));

  it("keeps 'tomorrow' for a weekday, and says the day's name when it isn't tomorrow, in both languages", () => {
    setLang("en");
    expect(lines.wrapNoteLabel()).toBe("Where do I start tomorrow?");
    expect(lines.wrapNoteLabel("Monday")).toBe("Where do I start on Monday?");
    expect(lines.wrapDecideLater("Monday")).toBe("I'll decide on Monday");
    expect(lines.wrapForLabel("Monday")).toBe("For Monday");
    expect(lines.wrapIntro("Monday")).toContain("a tidy desk for Monday");
    expect(lines.wrapNoWins("Monday")).toContain("Monday is a fresh page");
    expect(lines.wrapFrogDone("Report", "Monday")).toContain("or decide on Monday");
    expect(lines.review(1, 3, 2, "Monday")).toContain("move the remaining 2 to Monday?");
    expect(lines.wrappedUp("Report", "Monday")).toBe("All wrapped up 🌙 Rest well. Monday starts with “Report” 🐸");
    expect(lines.movedToTomorrow(2, "Monday")).toBe("Moved 2 tasks to Monday. Rest well 🌙");
    setLang("vi");
    expect(lines.wrapNoteLabel()).toBe("Mai mình bắt đầu từ đâu?");
    expect(lines.wrapNoteLabel("Thứ Hai")).toBe("Thứ Hai mình bắt đầu từ đâu?");
    expect(lines.wrapDecideLater("Thứ Hai")).toBe("Thứ Hai mình chọn sau");
    expect(lines.wrapForLabel("Thứ Hai")).toBe("Cho Thứ Hai");
    expect(lines.wrapIntro("Thứ Hai")).toContain("dọn bàn cho Thứ Hai");
    expect(lines.wrapNoWins("Thứ Hai")).toContain("Thứ Hai là một trang mới");
    expect(lines.review(1, 3, 2, "Thứ Hai")).toContain("dời hết sang Thứ Hai?");
    expect(lines.wrappedUp("Report", "Thứ Hai")).toContain("Thứ Hai mình bắt đầu với “Report” 🐸");
    expect(lines.movedToTomorrow(2, "Thứ Hai")).toContain("sang Thứ Hai");
    // On a weekday nothing changes.
    expect(lines.review(1, 3, 2)).toContain("dời hết sang mai?");
    setLang("en");
    expect(lines.review(1, 3, 2)).toContain("move the remaining 2 to tomorrow?");
  });
});
