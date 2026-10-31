// Fixes from the v0.4 part A review: the pure helpers (plans, apps, addresses, the place you were at).
import { describe, expect, it } from "vitest";
import type { ForegroundApp, SystemSample } from "../backend/types";
import type { CalEvent } from "./calendar";
import { setLang } from "./l10n";
import * as lines from "./lines";
import { everyOption } from "./variety";
import { taskFromRaw, type TodoTask } from "./models";
import { defaultPrefs, prefsFromJson } from "./prefs";
import { isPrivateTitle, resumeSummary, snapshot, withoutDetails, workUrl, type WorkContext } from "./resume";
import {
  appMatches,
  dueTriggers,
  eventKey,
  goneMeetingPlans,
  rearmTrigger,
  setTrigger,
  shortHash,
  triggerChoices,
  triggersFromJson,
  triggersToJson,
  type TaskTrigger,
  type TriggerContext,
} from "./triggers";

const at = (h: number, m = 0, day = 28) => new Date(2026, 9, day, h, m);
const DAY = "2026-10-28";
const task = (id: string, content = `Task ${id}`): TodoTask => taskFromRaw({ id, content });
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

describe("typed app names (item 8, then the v0.4 evaluation)", () => {
  const vscode = app("Visual Studio Code", "code.exe");

  it("needs 3 characters", () => {
    expect(appMatches(vscode, "e")).toBe(false);
    expect(appMatches(vscode, "co")).toBe(false);
    expect(appMatches(vscode, "  c ")).toBe(false);
    // From 3 letters the start of a word counts (v0.4 evaluation, issue 2): "fig" is Figma, "cod" is Code.
    expect(appMatches(vscode, "cod")).toBe(true);
    expect(appMatches(app("Figma", "figma.exe"), "fig")).toBe(true);
  });

  it("matches whole words of the name, in order, or the exe name without .exe, ignoring case", () => {
    expect(appMatches(vscode, "code")).toBe(true);
    expect(appMatches(vscode, "CODE")).toBe(true);
    expect(appMatches(vscode, "studio")).toBe(true);
    expect(appMatches(vscode, "visual studio")).toBe(true);
    expect(appMatches(vscode, "Visual  Studio   Code")).toBe(true);
    expect(appMatches(vscode, "studio visual")).toBe(false);
    expect(appMatches(app("Figma", "Figma.exe"), "figma")).toBe(true);
    expect(appMatches(app("Microsoft Edge", "msedge.exe"), "msedge")).toBe(true);
    expect(appMatches(app("Microsoft Edge", "msedge.exe"), "edge")).toBe(true);
  });

  it("doesn't match inside words or the .exe suffix", () => {
    expect(appMatches(app("Figma", "figma.exe"), "exe")).toBe(false);
    expect(appMatches(app("Password Manager", "pm.exe"), "word")).toBe(false);
    expect(appMatches(app("Notepad++", "notepad++.exe"), "pad")).toBe(false);
    expect(appMatches(null, "figma")).toBe(false);
    expect(appMatches(vscode, "")).toBe(false);
  });

  it("matches an app chosen from the recent ones by its exe, whatever its name says", () => {
    expect(appMatches(app("Figma", "Figma.exe"), "Figma", "figma.exe")).toBe(true);
    expect(appMatches(app("Figma Beta", "figma-beta.exe"), "Figma", "figma.exe")).toBe(false);
    // A short name is fine when the exe says exactly which app it is.
    expect(appMatches(app("Go", "go.exe"), "Go", "go.exe")).toBe(true);
  });

  it("keeps the exe of a recent app in the choices and in storage, and refuses short typed names", () => {
    const choices = triggerChoices({
      events: [],
      now: at(14),
      recentApps: [app("Figma", "Figma.exe"), app("Visual Studio Code", "code.exe")],
      isDistracting: never,
    });
    expect(choices).toEqual([
      { kind: "appOpen", app: "Figma", exe: "figma.exe" },
      { kind: "appOpen", app: "Visual Studio Code", exe: "code.exe" },
    ]);
    const list = setTrigger([], "1", DAY, choices[0], 5);
    expect(triggersFromJson(JSON.parse(JSON.stringify(triggersToJson(list))))).toEqual(list);
    expect(triggersFromJson([{ taskId: "1", day: DAY, trigger: { kind: "appOpen", app: "ab" } }])).toEqual([]);
    expect(triggersFromJson([{ taskId: "1", day: DAY, trigger: { kind: "appOpen", app: "abc" } }])).toHaveLength(1);
    expect(triggersFromJson([{ taskId: "1", day: DAY, trigger: { kind: "appOpen", app: "Go", exe: "go.exe" } }])).toHaveLength(1);
  });
});

describe("an app plan waits for the app to come to the front (item 3)", () => {
  const ctx = (patch: Partial<TriggerContext> = {}): TriggerContext => ({
    day: DAY,
    now: at(11),
    events: [],
    app: app("Figma", "figma.exe"),
    appSwitchedAt: at(10).getTime(),
    endedEventIds: [],
    ...patch,
  });
  const plan = (setAt: number): TaskTrigger => ({ taskId: "1", day: DAY, trigger: { kind: "appOpen", app: "figma" }, fired: false, setAt, notBefore: null });

  it("doesn't fire for an app that was in front when the plan was made", () => {
    expect(dueTriggers([plan(at(10, 30).getTime())], ctx())).toEqual([]);
    expect(dueTriggers([plan(at(10).getTime())], ctx())).toEqual([]); // switched at the very moment: still not after it
  });

  it("fires once the app has arrived after the plan was made", () => {
    expect(dueTriggers([plan(at(10, 30).getTime())], ctx({ appSwitchedAt: at(10, 45).getTime() }))).toHaveLength(1);
    expect(dueTriggers([plan(at(10, 30).getTime())], ctx({ appSwitchedAt: at(10, 45).getTime(), app: app("Excel") }))).toEqual([]);
  });

  it("doesn't offer the app in front among the choices", () => {
    const choices = triggerChoices({
      events: [],
      now: at(14),
      recentApps: [app("Figma", "figma.exe"), app("Excel", "excel.exe")],
      current: app("Figma", "figma.exe"),
      isDistracting: never,
    });
    expect(choices.map((c) => (c.kind === "appOpen" ? c.app : c.kind))).toEqual(["Excel"]);
  });

  it("reads a plan stored without a time as made when it was loaded", () => {
    const [t] = triggersFromJson([{ taskId: "1", day: DAY, trigger: { kind: "appOpen", app: "figma" }, fired: false }], 777);
    expect(t.setAt).toBe(777);
    expect(t.notBefore).toBeNull();
  });
});

describe('"Later" on a plan (item 9)', () => {
  it("re-arms the plan, not before the given time", () => {
    const base: TaskTrigger = { taskId: "1", day: DAY, trigger: { kind: "afterLunch" }, fired: true, setAt: 0, notBefore: null };
    const list = rearmTrigger([base], "1", DAY, at(14, 30).getTime());
    expect(list).toEqual([{ ...base, fired: false, notBefore: at(14, 30).getTime() }]);
    const c: TriggerContext = { day: DAY, now: at(14), events: [], app: null, appSwitchedAt: 0, endedEventIds: [] };
    expect(dueTriggers(list, c)).toEqual([]);
    expect(dueTriggers(list, { ...c, now: at(14, 30) })).toHaveLength(1);
  });

  it("keeps the time through storage", () => {
    const t: TaskTrigger = { taskId: "1", day: DAY, trigger: { kind: "afterLunch" }, fired: false, setAt: 5, notBefore: 99 };
    expect(triggersFromJson(JSON.parse(JSON.stringify(triggersToJson([t]))))).toEqual([t]);
  });
});

describe("meeting ids and titles in stored plans (items 10, L1, L2)", () => {
  const long = `${"u".repeat(230)}@${at(10).getTime()}`;

  it("keeps a short id as it is and replaces a long one by a short, stable hash", () => {
    expect(eventKey("abc@123")).toBe("abc@123");
    expect(eventKey("x".repeat(200))).toBe("x".repeat(200));
    const key = eventKey(long);
    expect(key.length).toBeLessThanOrEqual(24);
    expect(key).not.toContain("uuuu");
    expect(eventKey(long)).toBe(key);
    expect(eventKey(`${long}2`)).not.toBe(key);
    expect(shortHash("a")).toBe(shortHash("a"));
    expect(shortHash("a")).not.toBe(shortHash("b"));
  });

  it("fires for a meeting with a long id once it is over", () => {
    const choices = triggerChoices({ events: [ev(long, "Planning", at(10), at(11))], now: at(10, 30), recentApps: [], isDistracting: never });
    expect(choices[0]).toEqual({ kind: "afterMeeting", eventId: eventKey(long), title: "Planning" });
    const list = setTrigger([], "1", DAY, choices[0], 0);
    const c: TriggerContext = { day: DAY, now: at(10, 59), events: [ev(long, "Planning", at(10), at(11))], app: null, appSwitchedAt: 0, endedEventIds: [] };
    expect(dueTriggers(list, c)).toEqual([]);
    expect(dueTriggers(list, { ...c, now: at(11) })).toHaveLength(1);
    expect(dueTriggers(list, { ...c, events: [], endedEventIds: [long] })).toHaveLength(1);
  });

  it("hashes a long id that is read from storage, and caps stored titles at 60 characters", () => {
    const [t] = triggersFromJson([{ taskId: "1", day: DAY, trigger: { kind: "afterMeeting", eventId: long, title: "T".repeat(90) } }], 0);
    expect(t.trigger).toEqual({ kind: "afterMeeting", eventId: eventKey(long), title: "T".repeat(60) });
  });

  it("finds the plans whose meeting is no longer on today's calendar, unless it was seen ending", () => {
    const mk = (taskId: string, eventId: string, patch: Partial<TaskTrigger> = {}): TaskTrigger => ({
      taskId,
      day: DAY,
      trigger: { kind: "afterMeeting", eventId, title: "x" },
      fired: false,
      setAt: 0,
      notBefore: null,
      ...patch,
    });
    const list = [
      mk("1", "kept@1"),
      mk("2", "moved@1"),
      mk("3", eventKey(long)),
      mk("4", "ended@1"),
      mk("5", "spent@1", { fired: true }),
      mk("6", "yesterday@1", { day: "2026-10-27" }),
      { taskId: "7", day: DAY, trigger: { kind: "afterLunch" } as const, fired: false, setAt: 0, notBefore: null },
    ];
    const events = [ev("kept@1", "Kept", at(14), at(15)), ev(long, "Long", at(16), at(17))];
    expect(goneMeetingPlans(list, events, ["ended@1"], DAY).map((t) => t.taskId)).toEqual(["2"]);
  });
});

describe("the place you were at (items 7, 14, M2, L4, L5)", () => {
  const chrome = app("Google Chrome", "chrome.exe", "Spec - Google Docs - Google Chrome");

  it("never has a call, the pet or a shell pop-up as its app, page or address, but keeps the task", () => {
    const zoom = snapshot(sample(app("Zoom", "Zoom.exe", "Zoom Meeting")), task("1", "Taxes"), never, at(10), { taskIsNext: false });
    expect(zoom).toMatchObject({ taskId: "1", app: null, windowTitle: null, url: null });
    const meet = snapshot(sample(chrome, "https://meet.google.com/abc-defg-hij"), task("1", "Taxes"), never, at(10));
    expect(meet).toMatchObject({ taskId: "1", app: null, windowTitle: null, url: null });
    expect(snapshot(sample(app("Zoom", "zoom.exe")), null, never, at(10))).toBeNull();
  });

  it("remembers whether the task is only the next one", () => {
    expect(snapshot(sample(chrome), task("1"), never, at(10), { taskIsNext: true })?.taskIsNext).toBe(true);
    expect(snapshot(sample(chrome), task("1"), never, at(10))?.taskIsNext).toBe(false);
  });

  it.each([
    "New Tab - Google Chrome (Incognito)",
    "Inbox - InPrivate - Microsoft Edge",
    "Mozilla Firefox Private Browsing",
    "Home (Private Browsing) - Mozilla Firefox",
    "Tab mới - Chrome (Ẩn danh)",
    "Trang chủ - Cửa sổ riêng tư",
    "Riêng tư - Firefox",
    "Nouvelle fenêtre de navigation privée",
    "Privates Fenster - Firefox",
    "Neues Inkognito-Fenster",
    "Navegación privada - Firefox",
    "Ventana de incógnito",
    "Janela anônima",
    "Navegação privada",
    "Nuova scheda in incognito",
    "Приватное окно - Firefox",
    "Режим инкогнито",
    "シークレット ウィンドウ",
    "プライベートブラウジング",
    "无痕模式 - Chrome",
    "無痕式視窗",
    "시크릿 창",
    "비공개 브라우징",
  ])("keeps only the app name for the private window %s", (title) => {
    expect(isPrivateTitle(title)).toBe(true);
    const ctx = snapshot(sample(app("Google Chrome", "chrome.exe", title), "https://mail.example.com/inbox"), task("1"), never, at(10));
    expect(ctx).toMatchObject({ app: "Google Chrome", windowTitle: null, url: null, taskId: "1" });
  });

  it.each(["Private equity memo - Google Docs", "Spec - Google Chrome", "Hidden mode explained - Wikipedia", "Quarterly report"])(
    "keeps the title of an ordinary window: %s",
    (title) => {
      expect(isPrivateTitle(title)).toBe(false);
      expect(snapshot(sample(app("Google Chrome", "chrome.exe", title), "https://docs.example.com/a"), null, never, at(10))?.windowTitle).toBe(title);
    },
  );

  it("can leave out the page title and address (resumeDetails off)", () => {
    const ctx = snapshot(sample(chrome, "https://docs.google.com/document/d/1/edit"), task("1"), never, at(10), { details: false });
    expect(ctx).toMatchObject({ app: "Google Chrome", windowTitle: null, url: null, taskId: "1" });
    const full = snapshot(sample(chrome, "https://docs.google.com/document/d/1/edit"), task("1"), never, at(10))!;
    expect(withoutDetails(full)).toEqual({ ...full, windowTitle: null, url: null });
    expect(resumeSummary(withoutDetails(full))).toMatchObject({ where: "Google Chrome", canReopen: false, host: null });
  });

  it("gives the host of the page to reopen", () => {
    const base: WorkContext = { taskId: null, taskTitle: null, app: "Google Chrome", windowTitle: null, url: "https://www.docs.google.com/document/d/1", note: null, at: 0, taskIsNext: false };
    expect(resumeSummary(base)).toMatchObject({ canReopen: true, host: "docs.google.com" });
    expect(resumeSummary({ ...base, url: null }).host).toBeNull();
    expect(resumeSummary({ ...base, taskIsNext: true })).toMatchObject({ taskIsNext: true });
  });

  it("drops the parameters of an address that look like secrets, and keeps the rest as written", () => {
    expect(workUrl("https://example.com/cb?code=abc&state=xyz&page=2&q=a%20b")).toBe("https://example.com/cb?page=2&q=a%20b");
    expect(workUrl("https://example.com/a?access_token=1&id_token=2&token=3&key=4&secret=5&sig=6&signature=7&auth=8&session=9&password=10&pwd=11&ok=1")).toBe(
      "https://example.com/a?ok=1",
    );
    expect(workUrl("https://example.com/a?api_key=1&apiKey=2&X-Amz-Signature=3&sessionid=4&idToken=5&Token=6&keep=me")).toBe("https://example.com/a?keep=me");
    expect(workUrl("https://example.com/a?keyword=cats&author=me&monkey=1&q=dogs")).toBe("https://example.com/a?keyword=cats&author=me&monkey=1&q=dogs");
    expect(workUrl("https://example.com/a?token=1")).toBe("https://example.com/a");
    expect(workUrl("https://example.com/a?page=2")).toBe("https://example.com/a?page=2");
    expect(workUrl("https://example.com/a#access_token=1")).toBe("https://example.com/a");
  });

  it("percent-encodes the characters that would make the link unopenable", () => {
    const url = workUrl("https://example.com/a|b?q=c^d`e|f&x=y\\z")!;
    expect(url).not.toMatch(/[|^`\\"<>]/);
    expect(url).toContain("a%7Cb");
    expect(url).toContain("c%5Ed%60e%7Cf");
    expect(url).toContain("y%5Cz");
    expect(workUrl("https://example.com/path/ok?q=1")).toBe("https://example.com/path/ok?q=1");
  });

  it("keeps the cap on the length after encoding", () => {
    const url = workUrl(`https://example.com/?q=${"|".repeat(1000)}`)!;
    expect(url.length).toBeLessThanOrEqual(2048);
    expect(url).not.toMatch(/%[0-9A-F]?$/i);
  });
});

describe("the resume card's words (item 14, M2)", () => {
  const summary = { task: "Taxes", where: "Google Chrome — Spec", note: null, canReopen: true, host: "docs.example.com", taskIsNext: false };

  it("says what was next, not what you were on, when the task is only the next one", () => {
    setLang("en");
    expect(lines.resumeCard(summary, "away")).toContain("You were on: “Taxes”");
    expect(lines.resumeCard({ ...summary, taskIsNext: true }, "away")).toContain("Next up: “Taxes”");
    expect(lines.resumeCard({ ...summary, taskIsNext: true }, "away")).not.toContain("You were on");
    expect(lines.resumeCard({ ...summary, taskIsNext: true, where: null }, "away")).toContain("Next up: “Taxes”");
    setLang("vi");
    expect(lines.resumeCard({ ...summary, taskIsNext: true }, "away")).toContain("Việc tiếp theo: “Taxes”");
    setLang("en");
  });

  // v0.4 evaluation, issue 12: "Next up: X · you were in Y" glued two ideas and read as if Y belonged to X.
  it("puts where you were on a line of its own, never glued to the task with a middle dot", () => {
    for (const lang of ["en", "vi"] as const) {
      setLang(lang);
      for (const next of [false, true]) {
        const card = lines.resumeCard({ ...summary, taskIsNext: next }, "away");
        const place = lines.resumePlace({ ...summary, taskIsNext: next });
        expect(card).not.toContain("·");
        expect(card).not.toContain("Google Chrome");
        expect(place).toContain("Google Chrome — Spec");
        expect(place).not.toContain("\n");
        expect(place).not.toContain("·");
      }
    }
    setLang("en");
    expect(lines.resumePlace(summary)).toBe("Last in: Google Chrome — Spec");
    setLang("vi");
    expect(lines.resumePlace(summary)).toBe("Bạn vừa ở: Google Chrome — Spec");
    setLang("en");
  });

  it("keeps the place in the card itself when there is no task to put it under", () => {
    setLang("en");
    const onlyPlace = { ...summary, task: null };
    expect(lines.resumeCard(onlyPlace, "away")).toContain("You were in: Google Chrome — Spec");
    expect(lines.resumePlace(onlyPlace)).toBe("");
    expect(lines.resumePlace({ ...summary, where: null })).toBe("");
    // The pinned note stays with the card (it is yours); only the place is the quiet line.
    expect(lines.resumeCard({ ...summary, note: "Fix the loop" }, "away")).toContain("📌 Next step: Fix the loop");
    setLang("vi");
    expect(lines.resumeCard(onlyPlace, "away")).toContain("Bạn đang ở: Google Chrome — Spec");
    setLang("en");
  });

  it("opens a break gently, with no 'pick it back up'", () => {
    setLang("en");
    const lead = lines.resumeCard(summary, "distraction").split("\n")[0];
    expect(lead).not.toMatch(/pick it back up/i);
    expect(lead).toMatch(/no rush|whenever/i);
    setLang("vi");
    expect(lines.resumeCard(summary, "distraction").split("\n")[0]).toMatch(/không vội|khi nào/i);
    setLang("en");
  });

  it("labels Reopen with the page's host", () => {
    setLang("en");
    expect(lines.reopenTitle("docs.example.com")).toBe("Reopen ↗ docs.example.com");
    expect(lines.reopenTitle(null)).toBe("Reopen ↗");
    expect(lines.reopenTitle("a".repeat(60)).length).toBeLessThan(45);
    setLang("vi");
    expect(lines.reopenTitle("docs.example.com")).toBe("Mở lại ↗ docs.example.com");
    setLang("en");
  });

  it("is kind when the page can't be reopened", () => {
    setLang("en");
    expect(lines.reopenFailed()).toMatch(/Couldn't reopen that page/);
    setLang("vi");
    expect(lines.reopenFailed().length).toBeGreaterThan(10);
    setLang("en");
  });

  it("describes plans and breathers without names", () => {
    setLang("en");
    expect(lines.triggerKindText({ kind: "afterMeeting", eventId: "x", title: "Secret merger" })).toBe("after a meeting");
    expect(lines.triggerKindText({ kind: "appOpen", app: "Figma" })).toBe("when an app opens");
    expect(lines.triggerKindText({ kind: "afterLunch" })).toBe("after lunch");
    const e = ev("a", "Team sync", at(10), at(11));
    const next = ev("b", "Design", at(11, 8), at(12));
    for (const text of everyOption((say) => lines.meetingOver(e, next, 4, say))) expect(text).toContain("a 4-minute breather");
    for (const text of everyOption((say) => lines.meetingOver(e, next, undefined, say))) expect(text).toContain("a 5-minute breather");
    for (const text of everyOption((say) => lines.meetingOver(e, null, undefined, say))) expect(text).not.toContain("breather");
  });
});

describe("resumeDetails preference (M2)", () => {
  it("is on by default, and read back from storage", () => {
    expect(defaultPrefs(0).resumeDetails).toBe(true);
    expect(prefsFromJson({ resumeDetails: false }, 0).resumeDetails).toBe(false);
    expect(prefsFromJson({ resumeDetails: "no" }, 0).resumeDetails).toBe(true);
    expect(prefsFromJson({}, 0).resumeDetails).toBe(true);
  });
});

// v0.4 evaluation, issue 6: the chip said "⏱ after 11:00 meeting" (the start time, no title) while the menu it came from
// said "After “Team sync” (12:00)" (the end time): two names for one plan.
describe("a plan's chip and its menu entry say the same thing", () => {
  const team = ev("team", "Team sync", at(11), at(12));
  const pick = triggerChoices({ events: [team], now: at(10), recentApps: [], isDistracting: () => false })[0];

  it("names the meeting and its end time, in both languages", () => {
    for (const lang of ["en", "vi"] as const) {
      setLang(lang);
      const choice = lines.triggerChoice(pick, [team]);
      const chip = lines.triggerChip(pick, [team]);
      expect(choice).toContain("“Team sync” (12:00)");
      expect(chip).toContain("“Team sync” (12:00)");
      expect(chip).not.toContain("11:00");
      expect(chip.startsWith("⏱")).toBe(true);
    }
    setLang("en");
    expect(lines.triggerChip(pick, [team])).toBe("⏱ after “Team sync” (12:00)");
    setLang("vi");
    expect(lines.triggerChip(pick, [team])).toBe("⏱ sau họp “Team sync” (12:00)");
    setLang("en");
  });

  it("cuts a long title short and keeps the end time; two meetings at one hour stay apart", () => {
    setLang("en");
    const long = ev("long", "Quarterly business review with the whole leadership group", at(11), at(12, 30));
    const choice = triggerChoices({ events: [long], now: at(10), recentApps: [], isDistracting: () => false })[0];
    const chip = lines.triggerChip(choice, [long]);
    expect(chip).toContain("(12:30)");
    expect(chip.length).toBeLessThan(40);
    expect(chip).toContain("…");
    const other = ev("other", "Design review", at(11), at(12));
    const [a, b] = triggerChoices({ events: [team, other], now: at(10), recentApps: [], isDistracting: () => false });
    expect(lines.triggerChip(a, [team, other])).not.toBe(lines.triggerChip(b, [team, other]));
  });

  it("still says what it can when the meeting has left the calendar (title only)", () => {
    setLang("en");
    expect(lines.triggerChip(pick, [])).toBe("⏱ after “Team sync”");
    // A long event id is stored as a hash: the chip still finds its meeting.
    const longId = ev("e".repeat(260), "Offsite", at(14), at(15));
    const choice = triggerChoices({ events: [longId], now: at(10), recentApps: [], isDistracting: () => false })[0];
    expect(lines.triggerChip(choice, [longId])).toBe("⏱ after “Offsite” (15:00)");
  });
});
