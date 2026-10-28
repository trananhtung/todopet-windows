// The pet's brain (Brain.swift): Todoist sync, mood, reminder rules, focus timer, pet life and mischief.
// It never touches the OS directly: everything goes through the Backend, so it runs in Tauri, in the
// browser demo and in unit tests with a fake clock.
import { BackendError, type AppCommand, type Backend, type ForegroundApp, type SystemSample } from "../backend/types";
import * as calm from "./calm";
import {
  adaptiveTarget,
  currentEvent,
  eventsOnDay,
  freeMinutes,
  nextEvent,
  suggestSlots,
  type CalEvent,
  type SlotSuggestion,
} from "./calendar";
import { atHour, dayKey, parseDate, shortText, startOfDay, timeString, utcString } from "./dates";
import { Diary } from "./diary";
import { L, langFromLocale, setLang } from "./l10n";
import * as life from "./life";
import * as lines from "./lines";
import {
  actionable,
  buildDay,
  completedDate,
  dueTime,
  emptyDay,
  isRecurring,
  nextTask,
  openTasks,
  planned,
  statsFromRaw,
  taskFromRaw,
  taskTitle,
  type DaySnapshot,
  type Stats,
  type TodoTask,
} from "./models";
import { defaultMoodInputs, evaluateMood, moodEmoji, moodLabel, type MoodReason } from "./mood";
import { calendarLinks, effectiveClaudeModel, effectiveFilter, isWorkday, prefsFromJson, type Prefs } from "./prefs";
import { appRules, currentDistraction, siteRules } from "./sites";
import { findStuck, pretendSeen, recordSeen, type SeenLog, type StuckTask } from "./stuck";
import type { Accessory, CelebrationKind, Lang, Mood, SpeciesId } from "./types";

const MIN = 60_000;
const NEVER = -8.64e15;

export interface BubbleAction {
  title: string;
  primary?: boolean;
  run: () => void;
}

export interface Bubble {
  id: number;
  text: string;
  actions: BubbleAction[];
  seconds: number;
  /** Important enough to replace a bubble that is waiting for an answer. */
  urgent: boolean;
  /** Unsolicited (a reminder), as opposed to a reply to something you did. */
  reminder: boolean;
}

export interface FocusSession {
  task: TodoTask | null;
  start: number;
  end: number;
  isBreak: boolean;
  minutes: number;
}

export interface CelebrationEvent {
  id: number;
  kind: CelebrationKind;
  food: string;
  golden: boolean;
  combo: number;
  start: number;
}

export type AnticKind = { type: "grumble" } | { type: "parade"; title: string } | { type: "block" };

export interface AnticEvent {
  id: number;
  kind: AnticKind;
  start: number;
}

export type DueChoice = "today" | "tomorrow" | "none" | "smart";
export type Chime = "chatter" | "important" | "celebrate" | "big" | "grumble";

export interface BrainState {
  hasToken: boolean;
  isDemo: boolean;
  hasClaudeKey: boolean;
  day: DaySnapshot;
  next: TodoTask | null;
  stats: Stats | null;
  mood: Mood;
  score: number;
  reasons: MoodReason[];
  loading: boolean;
  lastSync: number | null;
  errorText: string | null;
  bubble: Bubble | null;
  focus: FocusSession | null;
  quietUntil: number | null;
  hiddenUntil: number | null;
  target: number;
  events: CalEvent[];
  suggestions: SlotSuggestion[];
  stuck: StuckTask[];
  celebration: CelebrationEvent | null;
  antic: AnticEvent | null;
  /** In the zone: steady typing for 10+ minutes. */
  flow: boolean;
  /** Keep still: typing, in the zone, or in a meeting. */
  calmMotion: boolean;
  /** A full-screen app is in front and the user wants the pet out of the way. */
  fullscreen: boolean;
  life: life.LifeState;
  prefs: Prefs;
}

/** What the UI provides: sounds, speech and opening views. All optional. */
export interface BrainEffects {
  chime?(c: Chime): void;
  speak?(text: string, lang: Lang): void;
  openBoard?(focusAdd: boolean): void;
  openSplit?(task: TodoTask): void;
}

export interface BrainOptions {
  demo?: boolean;
  now?: () => number;
  random?: () => number;
  effects?: BrainEffects;
}

interface Context {
  workday: boolean;
  inWork: boolean;
  night: boolean;
  hoursAfterPlanDeadline: number;
  reviewTime: number;
}

export class Brain {
  private state: BrainState;
  private listeners = new Set<() => void>();
  private readonly now: () => number;
  private readonly random: () => number;
  readonly diary: Diary;
  effects: BrainEffects;

  private active: TodoTask[] = [];
  private completed: TodoTask[] = [];
  private fired = new Map<string, number>();
  private dayKey: string;
  private knownCompleted = new Set<string>();
  private completedViaPet = new Set<string>();
  private didLoadOnce = false;
  private celebrateUntil = NEVER;
  private lastCelebration = NEVER;
  private lastPlanAction = NEVER;
  private lastBubbleAt = NEVER;
  private lastStatsAt = NEVER;
  private lastCalendarAt = NEVER;
  private awaySince: number | null = null;
  private distractionSnoozedUntil = NEVER;
  private anticSnoozedUntil = NEVER;
  private annoyedSince: number | null = null;
  private angrySince: number | null = null;
  private engagedSince: Date | null = null;
  private flowStartedAt = 0;
  private lastFlowEnd = NEVER;
  private distractionSession: { label: string; start: number; logged: boolean } | null = null;
  private distractionSince: { label: string; since: number } | null = null;
  private sample: SystemSample = {
    app: null,
    url: null,
    idleSeconds: 0,
    secondsSinceKey: 999,
    fullscreen: false,
    appSwitchedAt: 0,
  };
  private seen: SeenLog = {};
  private icsTexts: string[] = [];
  private timer: ReturnType<typeof setInterval> | null = null;
  private unsubs: (() => void)[] = [];
  private bubbleSeq = 0;
  private syncing = false;
  private lifeSaveQueued = false;

  private constructor(
    readonly backend: Backend,
    prefs: Prefs,
    lifeState: life.LifeState,
    seen: SeenLog,
    opts: BrainOptions,
  ) {
    this.now = opts.now ?? Date.now;
    this.random = opts.random ?? Math.random;
    this.effects = opts.effects ?? {};
    this.seen = seen;
    this.dayKey = dayKey(new Date(this.now()));
    this.diary = new Diary(backend.diary, this.now, () => void backend.bus.emit({ type: "diary-changed" }).catch(() => undefined));
    this.diary.enabled = prefs.keepLog;
    this.state = {
      hasToken: false,
      isDemo: opts.demo ?? false,
      hasClaudeKey: false,
      day: emptyDay(),
      next: null,
      stats: null,
      mood: "normal",
      score: 60,
      reasons: [],
      loading: false,
      lastSync: null,
      errorText: null,
      bubble: null,
      focus: null,
      quietUntil: null,
      hiddenUntil: null,
      target: prefs.dailyTarget,
      events: [],
      suggestions: [],
      stuck: [],
      celebration: null,
      antic: null,
      flow: false,
      calmMotion: false,
      fullscreen: false,
      life: lifeState,
      prefs,
    };
  }

  /** Loads prefs, the pet's life and the postponed-task log, then picks the language. */
  static async create(backend: Backend, opts: BrainOptions = {}): Promise<Brain> {
    const now = (opts.now ?? Date.now)();
    const [rawPrefs, rawLife, rawSeen, locale] = await Promise.all([
      backend.storage.load<unknown>("prefs").catch(() => null),
      backend.storage.load<unknown>("life").catch(() => null),
      backend.storage.load<SeenLog>("stuck").catch(() => null),
      backend.system.systemLocale().catch(() => "en"),
    ]);
    const prefs = prefsFromJson(rawPrefs, now);
    if (rawPrefs === null && !opts.demo) await backend.storage.save("prefs", prefs).catch(() => undefined);
    setLang(prefs.lang ?? langFromLocale(locale));
    const lifeState = opts.demo ? life.demoLife() : life.lifeFromJson(rawLife);
    const seen = !opts.demo && rawSeen && typeof rawSeen === "object" ? rawSeen : {};
    return new Brain(backend, prefs, lifeState, seen, opts);
  }

  // ---------- React glue ----------

  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  getSnapshot = (): BrainState => this.state;

  private set(patch: Partial<BrainState>): void {
    this.state = { ...this.state, ...patch };
    for (const fn of this.listeners) fn();
  }

  get prefs(): Prefs {
    return this.state.prefs;
  }

  private mutateLife<T>(change: (s: life.LifeState) => T): T {
    const s = structuredClone(this.state.life);
    const result = change(s);
    if (JSON.stringify(s) !== JSON.stringify(this.state.life)) {
      this.set({ life: s });
      this.saveLifeSoon();
    }
    return result;
  }

  private saveLifeSoon(): void {
    if (this.state.isDemo || this.lifeSaveQueued) return;
    this.lifeSaveQueued = true;
    queueMicrotask(() => {
      this.lifeSaveQueued = false;
      this.backend.storage.save("life", this.state.life).catch(() => undefined);
      this.backend.bus.emit({ type: "life-changed" }).catch(() => undefined);
    });
  }

  // ---------- Lifecycle ----------

  async start(): Promise<void> {
    const sys = this.backend.system;
    this.unsubs.push(
      sys.onSample((s) => this.onSample(s)),
      sys.onCommand((c) => this.onCommand(c)),
      this.backend.bus.on((e) => {
        if (e.type === "prefs-changed" || e.type === "species-changed") void this.reloadPrefs();
        if (e.type === "secrets-changed") void this.reloadSecrets(true);
      }),
    );
    this.pushTrayLabels();
    await this.reloadSecrets(false);
    if (this.state.isDemo) this.prepareDemo();
    this.timer = setInterval(() => this.tick(), 15_000);
    this.recompute();
    if (this.state.hasToken) {
      await this.refresh();
      await this.refreshCalendar(true);
      if (this.state.isDemo) this.say({ text: lines.demoHello(), seconds: 10, urgent: true });
    } else {
      setTimeout(() => this.askForToken(), 1500);
    }
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    for (const u of this.unsubs) u();
    this.unsubs = [];
  }

  private prepareDemo(): void {
    const now = new Date(this.now());
    // A task that has sat on the list for a while, so the "split it" flow can be tried.
    pretendSeen(this.seen, "3", 4, now);
  }

  private async reloadSecrets(announce: boolean): Promise<void> {
    try {
      const s = await this.backend.secrets.status();
      const gained = s.todoist && !this.state.hasToken;
      this.set({ hasToken: s.todoist, hasClaudeKey: s.anthropic });
      if (!s.todoist) {
        this.active = [];
        this.completed = [];
        this.recompute();
      } else if (gained) {
        this.resetDay();
        await this.refresh();
        if (announce) this.say({ text: lines.connected(), seconds: 6 });
      }
    } catch {
      // Credential Manager unavailable: behave as if not connected.
    }
  }

  private async reloadPrefs(): Promise<void> {
    const raw = await this.backend.storage.load<unknown>("prefs").catch(() => null);
    const locale = await this.backend.system.systemLocale().catch(() => "en");
    const before = this.state.prefs;
    const prefs = prefsFromJson(raw ?? before, before.firstLaunch);
    setLang(prefs.lang ?? langFromLocale(locale));
    this.diary.enabled = prefs.keepLog;
    this.set({ prefs });
    this.pushTrayLabels();
    if (before.filterQuery !== prefs.filterQuery) void this.refresh();
    if (before.calendarUrls !== prefs.calendarUrls || before.useCalendar !== prefs.useCalendar) void this.refreshCalendar(true);
    this.recompute();
  }

  /** Saves new preferences (from the settings window or the board) and tells other windows. */
  async updatePrefs(patch: Partial<Prefs>): Promise<void> {
    const prefs = { ...this.state.prefs, ...patch };
    this.set({ prefs });
    await this.backend.storage.save("prefs", prefs).catch(() => undefined);
    await this.reloadPrefs();
    // An open Settings window shows the change too.
    const type = Object.keys(patch).length === 1 && "species" in patch ? "species-changed" : "prefs-changed";
    await this.backend.bus.emit({ type }).catch(() => undefined);
  }

  private pushTrayLabels(): void {
    this.backend.system
      .setTrayLabels({
        board: L("Bảng việc", "Task board"),
        add: L("Thêm việc…", "Add task…"),
        focus: L("Tập trung", "Focus"),
        hide: L("Ẩn pet 1 giờ", "Hide pet for 1 hour"),
        quiet: L("Im lặng 1 giờ", "Quiet for 1 hour"),
        settings: L("Cài đặt…", "Settings…"),
        diary: L("Nhật ký của pet", "Pet diary"),
        quit: L("Thoát TodoPet", "Quit TodoPet"),
      })
      .catch(() => undefined);
  }

  // ---------- Commands and OS samples ----------

  private onCommand(c: AppCommand): void {
    switch (c) {
      case "board":
        this.effects.openBoard?.(false);
        break;
      case "add":
        this.effects.openBoard?.(true);
        break;
      case "focus":
        this.startFocus(null);
        break;
      case "hide1h":
        this.hide(60);
        break;
      case "quiet1h":
        this.quiet(60);
        break;
      case "show":
        this.set({ hiddenUntil: null });
        break;
    }
  }

  onSample(s: SystemSample): void {
    const now = this.now();
    const prev = this.sample;
    this.sample = s;
    if (prev.fullscreen !== s.fullscreen) this.set({ fullscreen: s.fullscreen });
    const label = this.currentDistractionLabel();
    if (label !== (this.distractionSince?.label ?? null)) {
      this.distractionSince = label ? { label, since: now } : null;
    }
    const calmMotion = this.computeCalmMotion();
    if (calmMotion !== this.state.calmMotion) this.set({ calmMotion });
  }

  private secondsSinceAppSwitch(): number {
    return (this.now() - this.sample.appSwitchedAt) / 1000;
  }

  private currentDistractionLabel(): string | null {
    const p = this.state.prefs;
    return currentDistraction(this.sample.app, this.sample.url, siteRules(p.distractionSites), appRules(p.distractionApps), p.watchBrowsers);
  }

  /** The distracting app or site in front right now (minutes on it), ignoring snoozes. */
  private currentDistraction(): { app: string; minutes: number } | null {
    const d = this.distractionSince;
    return d ? { app: d.label, minutes: (this.now() - d.since) / MIN } : null;
  }

  private distraction(): { app: string; minutes: number } | null {
    return this.now() > this.distractionSnoozedUntil ? this.currentDistraction() : null;
  }

  private computeCalmMotion(): boolean {
    const p = this.state.prefs;
    return p.stillWhileTyping && (this.state.flow || this.sample.secondsSinceKey < 20 || currentEvent(this.state.events, new Date(this.now())) !== null);
  }

  /** Foreground app, for the board's status line. */
  get frontApp(): ForegroundApp | null {
    return this.sample.app;
  }

  // ---------- Token ----------

  async setToken(raw: string): Promise<boolean> {
    const token = raw.trim();
    if (!token) return false;
    try {
      await this.backend.secrets.setTodoistToken(token);
    } catch (e) {
      this.set({ errorText: errorMessage(e) });
      return false;
    }
    this.set({ errorText: null });
    await this.backend.bus.emit({ type: "secrets-changed" }).catch(() => undefined);
    await this.reloadSecrets(true);
    return true;
  }

  async removeToken(): Promise<void> {
    await this.backend.secrets.clearTodoistToken().catch(() => undefined);
    await this.backend.bus.emit({ type: "secrets-changed" }).catch(() => undefined);
    await this.reloadSecrets(false);
  }

  private askForToken(): void {
    if (this.state.hasToken) return;
    this.say({
      text: lines.hello(this.state.prefs.petName),
      actions: [{ title: L("Kết nối Todoist", "Connect Todoist"), primary: true, run: () => this.effects.openBoard?.(false) }],
      seconds: 60,
    });
  }

  // ---------- Sync ----------

  async refresh(): Promise<void> {
    if (!this.state.hasToken || this.syncing) return;
    this.syncing = true;
    this.set({ loading: true });
    const now = this.now();
    try {
      const act = (await this.backend.todoist.tasks(effectiveFilter(this.state.prefs))).map(taskFromRaw);
      const since = startOfDay(new Date(now));
      // The completed-tasks endpoint can fail on some plans: then keep the completions we saw ourselves.
      let done: TodoTask[] | null = null;
      try {
        done = (await this.backend.todoist.completed(utcString(since), utcString(new Date(now + 2 * MIN)))).map(taskFromRaw);
      } catch {
        done = null;
      }
      if (now - this.lastStatsAt > 15 * MIN || !this.state.stats) {
        try {
          this.set({ stats: statsFromRaw(await this.backend.todoist.stats()) });
        } catch {
          // Stats are decoration; the board works without them.
        }
        this.lastStatsAt = now;
      }
      this.apply(act, done);
      this.set({ errorText: null, lastSync: this.now() });
    } catch (e) {
      const msg = errorMessage(e);
      this.set({ errorText: msg });
      this.diary.add("sync", L("Lỗi đồng bộ Todoist: ", "Todoist sync failed: ") + msg, { throttle: "sync-error", every: 30 });
      if (e instanceof BackendError && (e.kind === "unauthorized" || e.kind === "no_token")) {
        this.say({
          text: lines.error(msg),
          actions: [{ title: L("Nhập token mới", "Enter a new token"), primary: true, run: () => this.effects.openBoard?.(false) }],
          seconds: 30,
        });
      }
    } finally {
      this.syncing = false;
      this.set({ loading: false });
    }
  }

  private apply(act: TodoTask[], done: TodoTask[] | null): void {
    this.active = act;
    const today = dayKey(new Date(this.now()));
    if (done) {
      // Keep our own optimistic completions until Todoist reports them.
      const ids = new Set(done.map((t) => t.id));
      const pending = this.completed.filter((t) => this.completedViaPet.has(t.id) && !ids.has(t.id) && !act.some((a) => a.id === t.id));
      this.completed = [...done, ...pending];
    } else {
      this.completed = this.completed.filter((t) => {
        const d = completedDate(t);
        return d !== null && dayKey(d) === today;
      });
    }
    // Celebrate (and feed the pet for) tasks completed in the Todoist app since the last sync.
    const fresh = this.completed.filter((t) => !this.knownCompleted.has(t.id) && !this.completedViaPet.has(t.id));
    if (this.didLoadOnce && fresh.length > 0) {
      this.recompute();
      this.celebrate(fresh[0], false, fresh.length);
    }
    this.knownCompleted = new Set([...this.completed.map((t) => t.id), ...this.completedViaPet]);
    this.didLoadOnce = true;
    const now = new Date(this.now());
    if (recordSeen(this.seen, openTasks(buildDay(act, this.completed, now)), now) && !this.state.isDemo) {
      this.backend.storage.save("stuck", this.seen).catch(() => undefined);
    }
    this.recompute();
  }

  async refreshCalendar(force = false): Promise<void> {
    const now = this.now();
    if (!force && now - this.lastCalendarAt < 15 * MIN) {
      this.recomputeEvents();
      return;
    }
    this.lastCalendarAt = now;
    const p = this.state.prefs;
    const links = calendarLinks(p);
    if (!p.useCalendar || (links.length === 0 && !this.state.isDemo)) {
      this.icsTexts = [];
    } else {
      const results = await this.backend.calendar.fetchIcs(this.state.isDemo ? ["https://demo.todopet/calendar.ics"] : links);
      this.icsTexts = results.filter((r) => r.ok && r.text).map((r) => r.text as string);
      for (const r of results) {
        if (!r.ok) this.diary.add("sync", L("Không tải được lịch: ", "Couldn't load a calendar: ") + (r.error ?? r.url), { throttle: `ics-${r.url}`, every: 60 });
      }
    }
    this.recomputeEvents();
    this.recompute();
  }

  private recomputeEvents(): void {
    const events = this.state.prefs.useCalendar ? eventsOnDay(this.icsTexts, new Date(this.now())) : [];
    if (JSON.stringify(events) !== JSON.stringify(this.state.events)) this.set({ events });
  }

  private resetDay(): void {
    this.dayKey = dayKey(new Date(this.now()));
    this.fired.clear();
    this.knownCompleted.clear();
    this.completedViaPet.clear();
    this.didLoadOnce = false;
    this.completed = [];
  }

  // ---------- Mood ----------

  private context(now: number): Context {
    const d = new Date(now);
    const h = d.getHours() + d.getMinutes() / 60;
    const p = this.state.prefs;
    const workday = isWorkday(p, d);
    return {
      workday,
      inWork: workday && h >= p.workStart && h < p.workEnd,
      night: h >= 23 || h < 6,
      hoursAfterPlanDeadline: h - p.planDeadline,
      reviewTime: atHour(p.workEnd, 0, d).getTime() - 30 * MIN,
    };
  }

  private lastProgress(): number {
    const now = this.now();
    const p = this.state.prefs;
    let t = Math.max(atHour(p.workStart, 0, new Date(now)).getTime(), p.firstLaunch, this.lastPlanAction, this.lastCelebration);
    for (const c of this.state.day.completed) {
      const d = completedDate(c);
      if (d) t = Math.max(t, d.getTime());
    }
    const f = this.state.focus;
    if (f) t = Math.max(t, Math.min(now, f.start));
    // Deep work counts as progress, even before a task gets ticked off.
    t = Math.max(t, this.state.flow ? now : this.lastFlowEnd);
    // Time in meetings counts as work.
    for (const e of this.state.events) if (e.start.getTime() <= now) t = Math.max(t, Math.min(e.end.getTime(), now));
    return t;
  }

  recompute(): void {
    const nowMs = this.now();
    const now = new Date(nowMs);
    const p = this.state.prefs;
    const day = buildDay(this.active, this.completed, now);
    const ctx = this.context(nowMs);
    const events = this.state.events;
    const dayStart = atHour(p.workStart, 0, now);
    const dayEnd = atHour(p.workEnd, 0, now);
    const target = p.adaptTarget && events.length > 0 ? adaptiveTarget(freeMinutes(events, dayStart, dayEnd), p.dailyTarget) : p.dailyTarget;
    const suggestions = ctx.inWork ? suggestSlots(actionable(day), events, now, dayEnd) : [];
    const stuck = findStuck(this.seen, openTasks(day), p.stuckDays, now);
    this.patchState({ day, target, suggestions, stuck, next: nextTask(day) });
    this.settleLife(nowMs);
    if (this.state.hasToken && this.didLoadOnce) {
      const s = this.state.life;
      const done = day.completed.length;
      const plannedCount = planned(day);
      if (s.dayCompleted !== done || s.dayPlanned !== plannedCount || s.dayTarget !== target || s.dayWorkday !== ctx.workday) {
        this.mutateLife((l) => life.syncDay(l, done, plannedCount, target, ctx.workday));
      }
    }

    const i = defaultMoodInputs();
    i.hasToken = this.state.hasToken;
    i.workday = ctx.workday;
    i.inWorkHours = ctx.inWork;
    i.night = ctx.night;
    i.hoursAfterPlanDeadline = ctx.hoursAfterPlanDeadline;
    i.target = target;
    i.inMeeting = currentEvent(events, now) !== null;
    i.stuck = stuck.length;
    i.planned = planned(day);
    i.completed = day.completed.length;
    i.remaining = day.today.length;
    i.overdue = day.overdue.length;
    i.late = day.late.length;
    i.minutesSinceProgress = (nowMs - this.lastProgress()) / MIN;
    i.minutesSinceCelebration = (nowMs - this.lastCelebration) / MIN;
    const d = this.distraction();
    if (d) {
      i.distractedMinutes = d.minutes;
      i.distractionApp = d.app;
    }
    i.idleMinutes = this.sample.idleSeconds / 60;
    i.focusing = this.state.focus ? !this.state.focus.isBreak : false;
    i.celebratingNow = nowMs < this.celebrateUntil;
    i.satiety = this.state.life.satiety;
    i.dirt = this.state.life.dirt;
    const r = evaluateMood(i);
    const old = this.state.mood;
    if (old !== r.mood && old !== "celebrating" && r.mood !== "celebrating") {
      const why = r.reasons
        .slice(0, 2)
        .map((x) => `${x.delta > 0 ? "+" : ""}${x.delta} ${x.text}`)
        .join("; ");
      this.diary.add(
        "mood",
        L(`Tâm trạng: ${moodLabel(old)} → ${moodLabel(r.mood)} (điểm ${Math.trunc(r.score)})`, `Mood: ${moodLabel(old)} → ${moodLabel(r.mood)} (score ${Math.trunc(r.score)})`) +
          (why ? ` — ${why}` : ""),
        { throttle: `mood-${old}-${r.mood}`, every: 2 },
      );
    }
    this.patchState({ score: r.score, reasons: r.reasons, mood: r.mood, calmMotion: this.computeCalmMotion() });
    if (r.mood === "angry") this.angrySince ??= nowMs;
    else this.angrySince = null;
    if (r.mood === "annoyed" || r.mood === "angry") this.annoyedSince ??= nowMs;
    else this.annoyedSince = null;
    this.updateTray();
  }

  /** Like set(), but skips the render when nothing changed (recompute runs every 15 s). */
  private patchState(patch: Partial<BrainState>): void {
    const changed = (Object.keys(patch) as (keyof BrainState)[]).some((k) => JSON.stringify(patch[k]) !== JSON.stringify(this.state[k]));
    if (changed) this.set(patch);
  }

  /** Tray tooltip: mood and progress, or the focus timer. */
  updateTray(): void {
    const s = this.state;
    let text: string;
    if (s.focus) {
      const left = Math.max(0, Math.round((s.focus.end - this.now()) / 1000));
      const mm = String(Math.floor(left / 60)).padStart(2, "0");
      const ss = String(left % 60).padStart(2, "0");
      text = `${s.focus.isBreak ? "☕" : "🍅"} ${mm}:${ss}`;
    } else if (!s.hasToken) {
      text = `TodoPet — ${L("chưa kết nối Todoist", "not connected to Todoist")}`;
    } else {
      text = `TodoPet — ${moodEmoji(s.mood)} ${s.day.completed.length}/${s.target}`;
    }
    this.backend.system.setTrayStatus(text).catch(() => undefined);
  }

  /** Settles a finished day (streak, perfect-day sticker, dirt) once the date has changed, even after a restart. */
  private settleLife(nowMs: number): void {
    const today = dayKey(new Date(nowMs));
    if (this.state.life.dayKey === today) return;
    const before = this.state.life;
    const unlocked = this.mutateLife((s) => life.closeDay(s, today, (key) => {
      const d = parseDate(key);
      return d ? isWorkday(this.state.prefs, d) : false;
    }));
    const after = this.state.life;
    if (before.dayKey) {
      let text = L(
        `Chốt ngày ${before.dayKey}: xong ${before.dayCompleted}/${before.dayTarget} → chuỗi ${after.streak} ngày`,
        `Closed ${before.dayKey}: ${before.dayCompleted}/${before.dayTarget} done → ${after.streak}-day streak`,
      );
      if (after.perfectDays.length > before.perfectDays.length) text += L(", nhận sticker 🌟", ", earned a 🌟 sticker");
      if (after.dirt > before.dirt) text += L(`, bẩn thêm ${after.dirt - before.dirt} lớp`, `, ${after.dirt - before.dirt} more layer(s) of dirt`);
      this.diary.add("life", text);
    }
    if (unlocked.length > 0) this.say({ text: lines.unlocked(unlocked), seconds: 12, urgent: true });
  }

  // ---------- Talking ----------

  /**
   * Shows a bubble. `why` marks it as an unsolicited reminder and records the reason in the diary;
   * without it the bubble is a reply to something you did.
   */
  say(
    b: { text: string; actions?: BubbleAction[]; seconds: number; urgent?: boolean },
    opts: { chime?: Chime; why?: string; antic?: boolean } = {},
  ): void {
    const cur = this.state.bubble;
    const actions = b.actions ?? [];
    if (cur && cur.actions.length > 0 && !b.urgent && actions.length === 0) return;
    const bubble: Bubble = { id: ++this.bubbleSeq, text: b.text, actions, seconds: b.seconds, urgent: b.urgent ?? false, reminder: opts.why !== undefined };
    this.lastBubbleAt = this.now();
    this.set({ bubble });
    this.play(opts.chime ?? "chatter");
    const quote = `“${shortText(b.text.replace(/\n/g, " "), 90)}”`;
    if (opts.why !== undefined) this.diary.add(opts.antic ? "antic" : "bubble", `${quote} — ${L("vì ", "because ")}${opts.why}`);
    else this.diary.add("system", L("Pet nói ", "Pet said ") + quote);
  }

  /** The user tapped a bubble button. */
  pickAction(bubbleId: number, index: number): void {
    const b = this.state.bubble;
    if (!b || b.id !== bubbleId) return;
    const a = b.actions[index];
    if (!a) return;
    this.diary.add("response", L(`Bạn bấm “${a.title}”`, `You tapped “${a.title}”`), { tag: "picked" });
    this.set({ bubble: null });
    a.run();
  }

  /** The user closed the bubble, or it faded away on its own. */
  dismissBubble(bubbleId: number, how: "closed" | "ignored"): void {
    const b = this.state.bubble;
    if (!b || b.id !== bubbleId) return;
    if (b.reminder || b.actions.length > 0) {
      this.diary.add(
        "response",
        how === "closed" ? L("Bạn đóng bong bóng", "You closed the bubble") : L("Bạn không phản hồi (tự ẩn)", "No response (faded away)"),
        { tag: how },
      );
    }
    this.set({ bubble: null });
  }

  private play(c: Chime): void {
    const mode = this.state.prefs.soundMode;
    if (mode === "off") return;
    if (mode === "important" && (c === "chatter" || c === "grumble")) return;
    this.effects.chime?.(c);
  }

  private speak(text: string): void {
    if (this.state.prefs.voiceOn) this.effects.speak?.(text, this.state.prefs.lang ?? langFromLocale(null));
  }

  private once(key: string): boolean {
    if (this.fired.has(key)) return false;
    this.fired.set(key, this.now());
    return true;
  }

  private every(key: string, minutes: number): boolean {
    const last = this.fired.get(key);
    if (last !== undefined && this.now() - last < minutes * MIN) return false;
    this.fired.set(key, this.now());
    return true;
  }

  /** Without setting it: has `key` not fired for `minutes`? */
  private isDue(key: string, minutes: number): boolean {
    const last = this.fired.get(key);
    return last === undefined || this.now() - last >= minutes * MIN;
  }

  quiet(minutes: number | null): void {
    const until = minutes === null ? null : this.now() + minutes * MIN;
    this.set({ quietUntil: until, ...(until ? { bubble: null } : {}) });
    if (until) this.diary.add("hold", L(`Bạn bật im lặng tới ${timeString(new Date(until))}`, `You muted the pet until ${timeString(new Date(until))}`));
    else this.diary.add("system", L("Bạn bật lại nhắc nhở", "You turned reminders back on"));
  }

  hide(minutes: number | null): void {
    const until = minutes === null ? null : this.now() + minutes * MIN;
    this.set({ hiddenUntil: until, ...(until ? { bubble: null, antic: null } : {}) });
    if (until) this.diary.add("hold", L(`Bạn ẩn pet tới ${timeString(new Date(until))}`, `You hid the pet until ${timeString(new Date(until))}`));
  }

  // ---------- The 15-second heartbeat ----------

  tick(): void {
    const nowMs = this.now();
    const now = new Date(nowMs);
    if (dayKey(now) !== this.dayKey) {
      this.resetDay();
      void this.refresh();
      void this.refreshCalendar(true);
    }
    if (this.state.hiddenUntil !== null && nowMs >= this.state.hiddenUntil) this.set({ hiddenUntil: null });
    const f = this.state.focus;
    if (f && nowMs >= f.end) this.finishFocus();
    if (this.state.hasToken && !this.state.loading && (this.state.lastSync === null || nowMs - this.state.lastSync > 3 * MIN)) void this.refresh();
    void this.refreshCalendar();
    // Hunger grows during work hours (not during meetings or while you're away).
    const ctx = this.context(nowMs);
    const working = this.state.hasToken && ctx.inWork && currentEvent(this.state.events, now) === null && this.sample.idleSeconds < 300;
    this.mutateLife((s) => life.decay(s, nowMs, working));
    const d = this.currentDistraction();
    if (this.state.hasToken && ctx.inWork && d) this.mutateLife((s) => life.addDistraction(s, d.app, 15));
    // Left the distracting app or site: the pet gets out of the way.
    if (this.state.antic?.kind.type === "block" && !d) this.set({ antic: null });
    this.trackDistraction(nowMs);
    this.updateFlow(now);
    this.recompute();
    this.runRules(nowMs);
  }

  /** Tracks steady typing in work apps; ten minutes of it is "the zone". */
  private updateFlow(now: Date): void {
    const sinceKey = this.sample.secondsSinceKey;
    const isEngaged = calm.engaged(sinceKey, this.sample.idleSeconds, this.currentDistraction() !== null);
    this.engagedSince = calm.engagedSince(this.engagedSince, isEngaged, sinceKey, now);
    const inFlow = this.state.prefs.protectFlow && this.state.hasToken && calm.inFlow(this.engagedSince, now);
    if (this.state.flow === inFlow) return;
    this.set({ flow: inFlow });
    if (inFlow) {
      this.flowStartedAt = this.engagedSince?.getTime() ?? now.getTime();
      this.diary.add("flow", L("Bạn vào guồng (gõ phím đều 10 phút) — pet giữ im lặng", "You're in the zone (10 minutes of steady typing) — the pet stays quiet"), { tag: "flowStart" });
    } else {
      this.lastFlowEnd = now.getTime();
      const minutes = Math.trunc((now.getTime() - this.flowStartedAt) / MIN);
      this.diary.add("flow", L(`Hết guồng sau ${minutes} phút`, `Left the zone after ${minutes} minutes`), { tag: "flowEnd", minutes });
    }
  }

  /** Logs how long you stay in each distracting app or site. */
  private trackDistraction(nowMs: number): void {
    const current = this.currentDistraction()?.app ?? null;
    const s = this.distractionSession;
    if (s && s.label !== current) {
      const minutes = Math.trunc((nowMs - s.start) / MIN);
      if (minutes >= 1) this.diary.add("distraction", L(`Rời ${s.label} sau ${minutes} phút`, `Left ${s.label} after ${minutes} minutes`), { tag: "end", minutes });
      this.distractionSession = null;
    }
    if (!current) return;
    this.distractionSession ??= { label: current, start: nowMs, logged: false };
    const session = this.distractionSession;
    if (!session.logged && nowMs - session.start >= 2 * MIN) {
      this.diary.add("distraction", L(`Đang ở ${current} hơn 2 phút`, `On ${current} for 2+ minutes`));
      session.logged = true;
    }
  }

  private focusAction(task: TodoTask | null): BubbleAction {
    const m = this.state.prefs.focusMinutes;
    return { title: `▶ ${L(`Tập trung ${m}'`, `Focus ${m}'`)}`, primary: true, run: () => this.startFocus(task) };
  }

  private laterAction(minutes = 30): BubbleAction {
    return {
      title: L("Để sau", "Later"),
      run: () => this.fired.set("nudge", this.now() + minutes * MIN - this.state.prefs.remindEvery * MIN),
    };
  }

  private completeAction(t: TodoTask): BubbleAction {
    return { title: L("✓ Xong rồi", "✓ Done"), run: () => this.complete(t) };
  }

  private spareAction(): BubbleAction {
    return {
      title: L("Tha cho tôi 15'", "Spare me 15'"),
      run: () => {
        const until = this.now() + 15 * MIN;
        this.anticSnoozedUntil = until;
        this.distractionSnoozedUntil = until;
        this.set({ antic: null });
      },
    };
  }

  private planActions(): BubbleAction[] {
    const a: BubbleAction[] = [{ title: L("＋ Thêm việc", "＋ Add tasks"), primary: true, run: () => this.effects.openBoard?.(true) }];
    const movable = this.state.day.overdue.filter((t) => !isRecurring(t));
    if (movable.length > 0) {
      a.push({ title: L(`Kéo ${movable.length} việc quá hạn vào`, `Pull ${movable.length} overdue in`), run: () => void this.pullOverdueToToday() });
    }
    a.push(this.laterAction());
    return a;
  }

  /** " (−30 only 1/3 planned; −10 no progress…)": the top reasons behind the current mood. */
  private reasonSuffix(): string {
    const r = this.state.reasons
      .filter((x) => x.delta < 0)
      .slice(0, 2)
      .map((x) => `${x.delta} ${x.text}`)
      .join("; ");
    return r ? ` (${r})` : "";
  }

  private startAntic(kind: AnticKind, nowMs: number): void {
    this.set({ antic: { id: ++this.bubbleSeq, kind, start: nowMs } });
  }

  /** The reminder rules, in priority order (see "When it talks" in the README). */
  runRules(nowMs: number): void {
    const now = new Date(nowMs);
    const s = this.state;
    if (s.quietUntil !== null && nowMs < s.quietUntil) return;
    if (s.quietUntil !== null) this.set({ quietUntil: null });

    const idle = this.sample.idleSeconds;
    if (idle > 300) {
      if (this.awaySince === null) {
        this.awaySince = nowMs - idle * 1000;
        this.diary.add("system", L(`Bạn rời máy từ ${timeString(new Date(this.awaySince))} — pet không nhắc gì`, `You stepped away at ${timeString(new Date(this.awaySince))} — no reminders`));
      }
      return;
    }

    // Meetings come first, even during a focus session; during a meeting the pet stays quiet.
    const upcoming = nextEvent(s.events, now);
    if (upcoming) {
      const mins = (upcoming.start.getTime() - nowMs) / MIN;
      if (mins <= s.prefs.meetingLead && this.once(`meeting-${upcoming.id}`)) {
        const actions: BubbleAction[] = [];
        if (upcoming.joinUrl) {
          const url = upcoming.joinUrl;
          actions.push({ title: L("Vào họp ↗", "Join ↗"), primary: true, run: () => void this.backend.system.openUrl(url).catch(() => undefined) });
        }
        actions.push({ title: "OK", run: () => undefined });
        this.say(
          { text: lines.meetingSoon(upcoming, Math.max(1, Math.ceil(mins))), actions, seconds: 90, urgent: true },
          { chime: "important", why: L(`họp lúc ${timeString(upcoming.start)}`, `meeting at ${timeString(upcoming.start)}`) },
        );
        return;
      }
    }
    const meeting = currentEvent(s.events, now);
    if (meeting) {
      if (this.once(`in-meeting-${meeting.id}`)) {
        this.diary.add("meeting", L(`Đang họp “${meeting.title}” tới ${timeString(meeting.end)} — pet giữ im lặng`, `In “${meeting.title}” until ${timeString(meeting.end)} — the pet stays quiet`));
      }
      return;
    }
    if (s.focus) return;

    if (!s.hasToken) {
      if (this.every("token", 60)) this.askForToken();
      return;
    }
    const ctx = this.context(nowMs);
    const target = s.target;
    const day = s.day;
    const next = s.next;
    const open = openTasks(day);

    if (this.awaySince !== null) {
      const minutes = Math.trunc((nowMs - this.awaySince) / MIN);
      this.awaySince = null;
      this.diary.add("system", L(`Bạn quay lại sau ${minutes} phút`, `You came back after ${minutes} minutes`));
      if (minutes > 15 && ctx.inWork && next) {
        this.say(
          { text: lines.welcomeBack(next), actions: [this.focusAction(next), this.laterAction()], seconds: 30 },
          { why: L(`bạn vừa quay lại sau ${minutes} phút`, `you just came back after ${minutes} minutes`) },
        );
        return;
      }
    }

    // 1. Tasks with an exact time: 10 minutes before, and when due.
    for (const t of open) {
      const time = dueTime(t);
      if (!time) continue;
      const mins = (time.getTime() - nowMs) / MIN;
      if (mins > 0 && mins <= 10 && this.once(`soon-${t.id}`)) {
        this.say(
          { text: lines.soon(t, Math.ceil(mins)), actions: [this.focusAction(t), this.completeAction(t)], seconds: 40, urgent: true },
          { chime: "important", why: L(`việc hẹn lúc ${timeString(time)}`, `task due at ${timeString(time)}`) },
        );
        return;
      }
      if (mins <= 0 && mins > -5 && this.once(`now-${t.id}`)) {
        this.say(
          { text: lines.dueNow(t), actions: [this.focusAction(t), this.completeAction(t)], seconds: 60, urgent: true },
          { chime: "important", why: L(`tới giờ hẹn ${timeString(time)}`, `due now (${timeString(time)})`) },
        );
        return;
      }
    }
    if (s.hiddenUntil !== null) return;
    if (this.state.bubble) return;

    // Distracting apps and sites come first: there's no concentration to protect right then.
    // Grumpy and stuck on one for 5+ minutes: the pet jumps in the way.
    const d = this.distraction();
    if (s.prefs.antics && ctx.inWork && s.mood === "angry" && nowMs > this.anticSnoozedUntil && open.length > 0 && d && d.minutes >= 5 && this.every("antic", 20)) {
      this.startAntic({ type: "block" }, nowMs);
      this.say(
        { text: lines.block(d.app, next), actions: [this.focusAction(next), this.spareAction()], seconds: 25, urgent: true },
        {
          chime: "grumble",
          antic: true,
          why: L(`đang cáu và ở ${d.app} ${Math.trunc(d.minutes)} phút → nhảy lên chắn màn hình`, `grumpy and on ${d.app} for ${Math.trunc(d.minutes)} min → jumped in the way`),
        },
      );
      this.speak(lines.voiceBlock(d.app));
      return;
    }
    if (ctx.inWork && open.length > 0 && d && d.minutes >= 2 && this.every("distract", 10)) {
      this.say(
        {
          text: lines.distraction(s.mood, d.app, open.length, next),
          actions: [
            this.focusAction(next),
            { title: L("Nghỉ xíu thôi (10')", "Just a quick break (10')"), run: () => (this.distractionSnoozedUntil = this.now() + 10 * MIN) },
          ],
          seconds: 30,
        },
        { why: L(`ở ${d.app} ${Math.trunc(d.minutes)} phút trong giờ làm`, `on ${d.app} for ${Math.trunc(d.minutes)} min during work hours`) },
      );
      return;
    }

    if (ctx.night && now.getHours() >= 23 && this.once(`night-${this.dayKey}`)) {
      this.say({ text: lines.lateNight(), seconds: 10 }, { why: L("đã quá 23 giờ mà bạn vẫn dùng máy", "past 11pm and you're still at it") });
      return;
    }

    // 2. Everything finished.
    if (day.completed.length > 0 && day.today.length === 0 && day.overdue.length === 0 && this.once(`alldone-${this.dayKey}`)) {
      this.celebrateUntil = nowMs + 4000;
      this.recompute();
      this.say(
        { text: lines.allDone(), actions: [{ title: L("＋ Việc cho mai", "＋ Plan tomorrow"), run: () => this.effects.openBoard?.(true) }], seconds: 20 },
        { why: L("xong hết việc hôm nay", "everything for today is done") },
      );
      return;
    }

    // Calm: everything below can wait. Never during deep work, only at a natural pause, and at most one
    // unsolicited bubble per `bubbleGap` minutes. Held reminders go to the diary so thresholds can be tuned.
    const somethingDue =
      ctx.inWork &&
      ((planned(day) < target && ctx.hoursAfterPlanDeadline >= 0 && this.isDue("plan", 30)) ||
        (next !== null && nowMs - this.lastBubbleAt > s.prefs.remindEvery * MIN && this.isDue("nudge", s.prefs.remindEvery)) ||
        s.stuck.some((x) => !this.fired.has(`stuck-${x.task.id}-${this.dayKey}`)) ||
        (life.isHungry(s.life) && this.isDue("hungry", 60)));
    if (s.flow) {
      if (somethingDue) this.diary.add("hold", L("Có lời nhắc đến hạn nhưng bạn đang vào guồng — để sau", "A reminder is due but you're in the zone — later"), { throttle: "hold-flow", every: 15 });
      return;
    }
    if (!calm.atBreakpoint(this.sample.secondsSinceKey, this.secondsSinceAppSwitch())) {
      if (somethingDue) this.diary.add("hold", L("Hoãn nhắc vì bạn đang gõ phím — chờ bạn ngừng tay", "Held a reminder: you're typing — waiting for a pause"), { throttle: "hold-typing", every: 10 });
      return;
    }
    if (!calm.withinBudget(new Date(this.lastBubbleAt), now, s.prefs.bubbleGap)) {
      if (somethingDue) {
        this.diary.add(
          "hold",
          L(
            `Hoãn nhắc: lần nhắc trước lúc ${timeString(new Date(this.lastBubbleAt))}, cần cách ít nhất ${s.prefs.bubbleGap} phút`,
            `Held a reminder: last one at ${timeString(new Date(this.lastBubbleAt))}, at least ${s.prefs.bubbleGap} min apart`,
          ),
          { throttle: "hold-gap", every: 10 },
        );
      }
      return;
    }

    if (!ctx.workday) return;

    // 3. Morning greeting, with planning if today has fewer than `target` tasks.
    if (ctx.inWork && this.once(`morning-${this.dayKey}`)) {
      const needsPlan = planned(day) < target;
      if (needsPlan) this.fired.set("plan", nowMs);
      let text = lines.morning(now, planned(day), open.length, next, target);
      if (s.events.length > 0) {
        const start = atHour(s.prefs.workStart, 0, now);
        const end = atHour(s.prefs.workEnd, 0, now);
        const free = freeMinutes(s.events, start, end);
        text += `\n${lines.calendarDay(s.events.length, (end.getTime() - start.getTime()) / MIN - free, free, target, target < s.prefs.dailyTarget)}`;
      }
      if (s.life.dirt > 0) text += `\n${lines.dirty(s.life.dirt)}`;
      if (s.life.streak > 0) text += `\n${lines.streak(s.life.streak)}`;
      this.say(
        { text, actions: needsPlan ? this.planActions() : next ? [this.focusAction(next), this.laterAction()] : [], seconds: 60 },
        { why: L("lời chào đầu ngày làm việc", "first greeting of the workday") + (needsPlan ? L(`, mới có ${planned(day)}/${target} việc`, `, only ${planned(day)}/${target} planned`) : "") },
      );
      return;
    }

    // 4. Not planned enough: nag every 30 minutes once the planning deadline passed.
    if (ctx.inWork && planned(day) < target && ctx.hoursAfterPlanDeadline >= 0 && this.every("plan", 30)) {
      this.say(
        { text: lines.plan(s.mood, planned(day), target), actions: this.planActions(), seconds: 60 },
        { why: L(`đã qua ${s.prefs.planDeadline}h mà mới có ${planned(day)}/${target} việc`, `past ${s.prefs.planDeadline}:00 with only ${planned(day)}/${target} planned`) },
      );
      return;
    }

    // 6. A task that keeps getting postponed: offer to split it (or drop it). Once per task per day.
    const stuck = s.stuck.find((x) => !this.fired.has(`stuck-${x.task.id}-${this.dayKey}`));
    if (ctx.inWork && stuck && this.every("stuck", 120)) {
      this.fired.set(`stuck-${stuck.task.id}-${this.dayKey}`, nowMs);
      this.say(
        {
          text: lines.stuck(stuck, s.mood),
          actions: [
            { title: L("✂️ Chia nhỏ", "✂️ Split it"), primary: true, run: () => this.effects.openSplit?.(stuck.task) },
            { title: L("Bỏ khỏi kế hoạch", "Drop from plan"), run: () => void this.unplan(stuck.task) },
            this.laterAction(),
          ],
          seconds: 60,
        },
        { why: L(`“${shortText(taskTitle(stuck.task), 30)}” nằm trong danh sách ${stuck.days} ngày`, `“${shortText(taskTitle(stuck.task), 30)}” has been on your list ${stuck.days} days`) },
      );
      return;
    }

    // 6b. A hungry pet begs for a finished task.
    if (ctx.inWork && life.isHungry(s.life) && this.every("hungry", 60)) {
      this.say(
        { text: lines.hungry(s.life.satiety, next), actions: next ? [this.focusAction(next), this.laterAction()] : [], seconds: 30 },
        { why: L(`độ no còn ${Math.trunc(s.life.satiety)}%`, `only ${Math.trunc(s.life.satiety)}% full`) },
      );
      this.speak(lines.voiceHungry());
      return;
    }

    // 6c. Mischief that escalates while you slack: grumbling, then a parade with the task on a sign.
    // Never while you're typing (that's work, even if no task got ticked off yet).
    if (s.prefs.antics && ctx.inWork && nowMs > this.anticSnoozedUntil && this.sample.secondsSinceKey > 60 && next) {
      if (this.angrySince !== null && nowMs - this.angrySince >= 10 * MIN && this.every("antic", 20)) {
        const minutes = Math.trunc((nowMs - this.angrySince) / MIN);
        this.startAntic({ type: "parade", title: taskTitle(next) }, nowMs);
        this.say(
          { text: lines.parade(next), actions: [this.focusAction(next), this.spareAction()], seconds: 25, urgent: true },
          { chime: "grumble", antic: true, why: L(`đã cáu ${minutes} phút, không gõ phím → diễu hành với biển`, `grumpy for ${minutes} min, not typing → sign parade`) + this.reasonSuffix() },
        );
        this.speak(lines.voiceAngry(next));
        return;
      }
      if (this.annoyedSince !== null && nowMs - this.annoyedSince >= 10 * MIN && this.every("grumble", 30)) {
        const minutes = Math.trunc((nowMs - this.annoyedSince) / MIN);
        this.startAntic({ type: "grumble" }, nowMs);
        this.say(
          { text: lines.grumble(next), actions: [this.focusAction(next), this.spareAction()], seconds: 15 },
          { chime: "grumble", antic: true, why: L(`đã nhăn nhó ${minutes} phút`, `annoyed for ${minutes} min`) + this.reasonSuffix() },
        );
        this.speak(lines.voiceGrumble());
        return;
      }
    }

    // 7. Overdue tasks.
    if (ctx.inWork && day.overdue.length > 0 && this.every("overdue", 90)) {
      this.say(
        {
          text: lines.overdue(s.mood, day.overdue.length),
          actions: [
            { title: L("Dời vào hôm nay", "Move to today"), primary: true, run: () => void this.pullOverdueToToday() },
            { title: L("Xem", "Show"), run: () => this.effects.openBoard?.(false) },
          ],
          seconds: 45,
        },
        { why: L(`${day.overdue.length} việc quá hạn (nhắc tối đa 90 phút/lần)`, `${day.overdue.length} overdue task(s) (at most every 90 min)`) },
      );
      return;
    }

    // 8. Give the next task a concrete time slot (implementation intention), once a day.
    const slot = s.suggestions[0];
    if (ctx.inWork && planned(day) >= target && slot && slot.start.getTime() - nowMs < 3 * 60 * MIN && this.once(`timeblock-${this.dayKey}`)) {
      this.say(
        { text: lines.timeBlock(slot), actions: [{ title: L("⏰ Đặt giờ", "⏰ Set time"), primary: true, run: () => void this.schedule(slot) }, this.laterAction()], seconds: 60 },
        { why: L("gợi ý khung giờ trống (mỗi ngày một lần)", "a free time slot (once a day)") },
      );
      return;
    }

    // 9. End-of-day review (shutdown ritual).
    if (ctx.inWork && nowMs >= ctx.reviewTime && day.today.length > 0 && this.once(`review-${this.dayKey}`)) {
      this.say(
        {
          text: lines.review(day.completed.length, planned(day), day.today.length),
          actions: [
            { title: L("Dời sang mai", "Move to tomorrow"), primary: true, run: () => void this.moveTodayToTomorrow() },
            { title: L("Làm tiếp", "Keep going"), run: () => undefined },
          ],
          seconds: 90,
        },
        { why: L(`30 phút trước giờ tan làm, còn ${day.today.length} việc`, `30 min before work ends, ${day.today.length} left`) },
      );
      return;
    }

    // 9b. A sulky end-of-day report on time spent in distracting apps and sites.
    if (ctx.inWork && nowMs >= ctx.reviewTime && life.distractionTotal(s.life) >= 10 * 60 && this.once(`distractsum-${this.dayKey}`)) {
      this.say(
        { text: lines.distractionSummary(s.life.distraction), seconds: 25 },
        { why: L(`cuối ngày, xao nhãng ${Math.trunc(life.distractionTotal(s.life) / 60)} phút`, `end of day, ${Math.trunc(life.distractionTotal(s.life) / 60)} min of distractions`) },
      );
      this.speak(lines.voiceSummary(Math.trunc(life.distractionTotal(s.life) / 60)));
      return;
    }

    // 10. Regular nudge with the next task.
    const minutes = s.prefs.remindEvery;
    if (ctx.inWork && next && nowMs - this.lastBubbleAt > minutes * MIN && this.every("nudge", minutes)) {
      const idleHours = (nowMs - this.lastProgress()) / (60 * MIN);
      this.say(
        { text: lines.nudge(s.mood, next, idleHours), actions: [this.focusAction(next), this.completeAction(next), this.laterAction()], seconds: 45 },
        {
          why: L(
            `${minutes} phút chưa nhắc; ${idleHours.toFixed(1)} giờ chưa có tiến triển`,
            `${minutes} min since the last reminder; no progress for ${idleHours.toFixed(1)}h`,
          ),
        },
      );
      return;
    }

    // 11. A tip now and then, only when the mood is good.
    if (ctx.inWork && (s.mood === "happy" || s.mood === "normal") && nowMs - this.lastBubbleAt > 40 * MIN && this.every("tip", 150)) {
      this.say({ text: lines.tip(), seconds: 14 }, { why: L("pet đang vui và đã im lặng 40 phút", "the pet is in a good mood and quiet for 40 min") });
    }
  }

  // ---------- Actions ----------

  /** Feeds the pet once per finished task, then dances with a random (sometimes rare golden) celebration. */
  private celebrate(task: TodoTask | null, viaPet: boolean, feeds = 1, sound = "yay"): void {
    const nowMs = this.now();
    this.lastCelebration = nowMs;
    let result: life.FeedResult | null = null;
    const unlocked: Accessory[] = [];
    let levelUp: life.FeedResult["levelUp"] = null;
    for (let i = 0; i < Math.max(1, feeds); i++) {
      const r = this.mutateLife((s) => life.feed(s, nowMs, this.random(), this.random()));
      unlocked.push(...r.unlocked);
      levelUp = r.levelUp ?? levelUp;
      result = r;
    }
    if (!result) return;
    const r = result;
    this.set({ antic: null, celebration: { id: ++this.bubbleSeq, kind: r.kind, food: r.food, golden: r.golden, combo: r.combo, start: nowMs } });
    const st = this.state.life;
    const title = shortText(task ? taskTitle(task) : "", 40);
    let fed = L(
      `Xong “${title}”${viaPet ? "" : " (trong Todoist)"} → no ${Math.trunc(st.satiety)}%, ${st.xp} XP`,
      `Done “${title}”${viaPet ? "" : " (in Todoist)"} → ${Math.trunc(st.satiety)}% full, ${st.xp} XP`,
    );
    if (feeds > 1) fed += L(` (${feeds} việc)`, ` (${feeds} tasks)`);
    if (r.combo >= 2) fed += `, combo ×${r.combo}`;
    if (r.golden) fed += L(", bánh vàng hiếm", ", rare golden treat");
    if (levelUp !== null) fed += L(`, lớn lên thành ${life.stageName(levelUp)}`, `, grew up: ${life.stageName(levelUp)}`);
    if (unlocked.length > 0) fed += L(", mở khoá ", ", unlocked ") + unlocked.map(life.accessoryEmoji).join("");
    this.diary.add("life", fed);
    this.celebrateUntil = nowMs + (r.golden || levelUp !== null ? 5000 : 4000);
    this.recompute();
    this.play(r.golden || levelUp !== null ? "big" : "celebrate");
    if (task) {
      const parts = [lines.done(task, this.state.day.completed.length, this.state.target, sound)];
      if (r.golden) parts.push(lines.golden());
      if (r.combo >= 2) parts.push(lines.combo(r.combo));
      if (r.cleaned) parts.push(lines.cleaned(this.state.life.dirt));
      if (levelUp !== null) parts.push(lines.levelUp(levelUp));
      if (unlocked.length > 0) parts.push(lines.unlocked(unlocked));
      const actions: BubbleAction[] = viaPet ? [{ title: L("Hoàn tác", "Undo"), run: () => void this.undoComplete(task) }] : [];
      this.lastBubbleAt = nowMs;
      this.set({ bubble: { id: ++this.bubbleSeq, text: parts.join("\n"), actions, seconds: unlocked.length === 0 && levelUp === null ? 8 : 14, urgent: true, reminder: false } });
      if (levelUp !== null || r.golden) this.speak(lines.voiceCheer());
    }
    setTimeout(() => this.recompute(), 4200);
  }

  /** What the species says when cheering; set by the UI from the species registry. */
  speciesSound = "yay";

  async complete(task: TodoTask): Promise<void> {
    if (!this.state.hasToken) return;
    this.active = this.active.filter((t) => t.id !== task.id);
    const done: TodoTask = { ...task, checked: true, completedAt: utcString(new Date(this.now())) };
    this.completed = [done, ...this.completed];
    this.completedViaPet.add(task.id);
    this.knownCompleted.add(task.id);
    if (this.state.focus && !this.state.focus.isBreak && this.state.focus.task?.id === task.id) this.set({ focus: null });
    this.celebrate(done, true, 1, this.speciesSound);
    try {
      await this.backend.todoist.close(task.id);
    } catch (e) {
      const msg = errorMessage(e);
      this.completed = this.completed.filter((t) => t.id !== task.id);
      this.completedViaPet.delete(task.id);
      this.active = [...this.active, task];
      this.mutateLife((s) => life.unfeed(s));
      this.set({ errorText: msg });
      this.recompute();
      this.say({ text: lines.error(msg), seconds: 10, urgent: true });
    }
  }

  async undoComplete(task: TodoTask): Promise<void> {
    this.mutateLife((s) => life.unfeed(s));
    this.completed = this.completed.filter((t) => t.id !== task.id);
    this.completedViaPet.delete(task.id);
    this.active = [...this.active, { ...task, checked: false, completedAt: null }];
    this.lastCelebration = NEVER;
    this.set({ celebration: null });
    this.recompute();
    await this.backend.todoist.reopen(task.id).catch(() => undefined);
    await this.refresh();
  }

  async add(text: string, due: DueChoice, priority: number): Promise<boolean> {
    const content = text.trim();
    if (!this.state.hasToken || !content) return false;
    const plannedBefore = planned(this.state.day);
    try {
      if (due === "smart") await this.backend.todoist.quickAdd(content);
      else {
        const dueString = due === "today" ? "today" : due === "tomorrow" ? "tomorrow" : null;
        await this.backend.todoist.add({ content, dueString, priority, parentId: null });
      }
    } catch (e) {
      this.set({ errorText: errorMessage(e) });
      return false;
    }
    this.lastPlanAction = this.now();
    await this.refresh();
    const target = this.state.target;
    if (plannedBefore < target && planned(this.state.day) >= target) {
      this.lastCelebration = this.now();
      this.recompute();
      const next = this.state.next;
      this.say({ text: lines.planComplete(target, next), actions: next ? [this.focusAction(next)] : [], seconds: 20, urgent: true });
    } else {
      this.say({ text: lines.added(content), seconds: 4, urgent: true });
    }
    return true;
  }

  async reschedule(task: TodoTask, dueString: string): Promise<void> {
    this.lastPlanAction = this.now();
    try {
      await this.backend.todoist.reschedule(task.id, dueString);
    } catch (e) {
      this.set({ errorText: errorMessage(e) });
    }
    await this.refresh();
  }

  async pullOverdueToToday(): Promise<void> {
    const tasks = this.state.day.overdue.filter((t) => !isRecurring(t));
    this.lastPlanAction = this.now();
    for (const t of tasks) await this.backend.todoist.reschedule(t.id, "today").catch(() => undefined);
    await this.refresh();
  }

  async moveTodayToTomorrow(): Promise<void> {
    const tasks = this.state.day.today.filter((t) => !isRecurring(t));
    for (const t of tasks) await this.backend.todoist.reschedule(t.id, "tomorrow").catch(() => undefined);
    await this.refresh();
    this.say({ text: lines.movedToTomorrow(tasks.length), seconds: 8 });
  }

  /** Gives a task the suggested time today, so the pet can remind you right on time. */
  async schedule(s: SlotSuggestion): Promise<void> {
    this.lastPlanAction = this.now();
    try {
      await this.backend.todoist.reschedule(s.task.id, `today at ${timeString(s.start)}`);
    } catch (e) {
      this.set({ errorText: errorMessage(e) });
      return;
    }
    await this.refresh();
    this.say({ text: lines.timeSet(s.task, s.start), seconds: 6, urgent: true });
  }

  /** Deletes a task (and its sub-tasks) from Todoist for good. The UI asks for confirmation first. */
  async remove(task: TodoTask): Promise<void> {
    this.active = this.active.filter((t) => t.id !== task.id && t.parentId !== task.id);
    if (this.state.focus && !this.state.focus.isBreak && this.state.focus.task?.id === task.id) this.set({ focus: null });
    this.lastPlanAction = this.now();
    this.recompute();
    try {
      await this.backend.todoist.remove(task.id);
    } catch (e) {
      const msg = errorMessage(e);
      this.set({ errorText: msg });
      this.say({ text: lines.error(msg), seconds: 10, urgent: true });
      await this.refresh();
      return;
    }
    this.say({ text: lines.deleted(task), seconds: 5, urgent: true });
    await this.refresh();
  }

  /** Takes a task off today's plan without deleting it (it stays in Todoist with no date). */
  async unplan(task: TodoTask): Promise<void> {
    this.lastPlanAction = this.now();
    try {
      await this.backend.todoist.reschedule(task.id, "no date");
    } catch (e) {
      this.set({ errorText: errorMessage(e) });
      return;
    }
    await this.refresh();
    this.say({ text: lines.unplanned(task), seconds: 6, urgent: true });
  }

  async suggestSteps(task: TodoTask): Promise<string[]> {
    const lang = this.state.prefs.lang ?? langFromLocale(await this.backend.system.systemLocale().catch(() => "en"));
    return this.backend.claude.splitTask({ title: taskTitle(task), notes: task.description, lang, model: effectiveClaudeModel(this.state.prefs) });
  }

  /** Adds the steps as Todoist sub-tasks; the first one goes on today's plan. */
  async split(task: TodoTask, steps: string[], firstToday: boolean): Promise<boolean> {
    const clean = steps.map((s) => s.trim()).filter((s) => s.length > 0);
    if (clean.length === 0) return false;
    let firstId: string | null = null;
    try {
      for (const [i, step] of clean.entries()) {
        const created = await this.backend.todoist.add({ content: step, dueString: i === 0 && firstToday ? "today" : null, priority: task.priority, parentId: task.id });
        if (i === 0) firstId = created?.id ?? null;
      }
    } catch (e) {
      this.set({ errorText: errorMessage(e) });
      return false;
    }
    this.lastPlanAction = this.now();
    await this.refresh();
    const start = firstId ? openTasks(this.state.day).find((t) => t.id === firstId) ?? null : null;
    this.say({ text: lines.splitDone(clean.length, clean[0]), actions: start ? [this.focusAction(start)] : [], seconds: 30, urgent: true });
    return true;
  }

  async setClaudeKey(key: string | null): Promise<void> {
    const k = key?.trim() ?? "";
    await this.backend.secrets.setAnthropicKey(k ? k : null);
    await this.backend.bus.emit({ type: "secrets-changed" }).catch(() => undefined);
    await this.reloadSecrets(false);
  }

  toggleAccessory(a: Accessory): void {
    this.mutateLife((s) => life.toggleAccessory(s, a));
  }

  async setSpecies(id: SpeciesId): Promise<void> {
    await this.updatePrefs({ species: id });
  }

  // ---------- Focus (Pomodoro) ----------

  startFocus(task: TodoTask | null, minutes?: number): void {
    const m = minutes ?? this.state.prefs.focusMinutes;
    const nowMs = this.now();
    const t = task ?? this.state.next;
    this.set({ focus: { task: t, start: nowMs, end: nowMs + m * MIN, isBreak: false, minutes: m }, antic: null });
    this.recompute();
    this.lastBubbleAt = nowMs;
    this.set({ bubble: { id: ++this.bubbleSeq, text: lines.focusStart(t, m), actions: [], seconds: 5, urgent: false, reminder: false } });
    this.diary.add("focus", L(`Bắt đầu tập trung ${m} phút`, `Started a ${m}-minute focus session`) + (t ? `: “${shortText(taskTitle(t), 40)}”` : ""));
  }

  startBreak(): void {
    const nowMs = this.now();
    const m = this.state.prefs.breakMinutes;
    this.set({ focus: { task: null, start: nowMs, end: nowMs + m * MIN, isBreak: true, minutes: m } });
    this.recompute();
    this.set({ bubble: { id: ++this.bubbleSeq, text: lines.breakStart(m), actions: [], seconds: 6, urgent: false, reminder: false } });
    this.diary.add("focus", L(`Nghỉ ${m} phút`, `${m}-minute break`));
  }

  stopFocus(): void {
    const f = this.state.focus;
    if (f) {
      const minutes = Math.trunc((this.now() - f.start) / MIN);
      this.diary.add(
        "focus",
        f.isBreak ? L(`Bạn dừng giờ nghỉ sau ${minutes} phút`, `You ended the break after ${minutes} min`) : L(`Bạn dừng tập trung sau ${minutes}/${f.minutes} phút`, `You stopped focusing after ${minutes}/${f.minutes} min`),
      );
    }
    this.set({ focus: null });
    this.recompute();
  }

  private finishFocus(): void {
    const f = this.state.focus;
    if (!f) return;
    this.diary.add("focus", f.isBreak ? L("Hết giờ nghỉ", "Break over") : L(`Xong phiên tập trung ${f.minutes} phút`, `Finished a ${f.minutes}-minute focus session`));
    this.set({ focus: null });
    this.recompute();
    this.play("important");
    let bubble: Bubble;
    if (f.isBreak) {
      bubble = { id: ++this.bubbleSeq, text: lines.breakEnd(), actions: [this.focusAction(this.state.next), this.laterAction()], seconds: 60, urgent: true, reminder: false };
    } else {
      const actions: BubbleAction[] = [];
      const t = f.task;
      if (t && openTasks(this.state.day).some((x) => x.id === t.id)) {
        actions.push({
          title: L("✓ Xong rồi", "✓ Done"),
          primary: true,
          run: () => {
            void this.complete(t);
            this.startBreak();
          },
        });
      }
      actions.push({ title: L(`+${f.minutes}' nữa`, `+${f.minutes}' more`), run: () => this.startFocus(f.task, f.minutes) });
      actions.push({ title: L(`☕ Nghỉ ${this.state.prefs.breakMinutes}'`, `☕ Break ${this.state.prefs.breakMinutes}'`), run: () => this.startBreak() });
      bubble = { id: ++this.bubbleSeq, text: lines.focusEnd(f.task, f.minutes), actions, seconds: 120, urgent: true, reminder: false };
    }
    this.lastBubbleAt = this.now();
    this.set({ bubble });
  }

  // ---------- Pet interaction ----------

  /** Clicking the pet calls off any mischief. */
  petClicked(): void {
    if (this.state.antic) this.set({ antic: null });
  }

  endAntic(): void {
    this.set({ antic: null });
  }

  /** Dev hook (demo only): play a stunt right away. */
  demoAntic(kind: "parade" | "block" | "grumble"): void {
    const next = this.state.next;
    if (kind === "parade") this.startAntic({ type: "parade", title: next ? taskTitle(next) : "Demo" }, this.now());
    else this.startAntic(kind === "block" ? { type: "block" } : { type: "grumble" }, this.now());
  }

  /** Dev hook (demo only): celebrate as if a task was finished. */
  demoCelebrate(): void {
    const t = this.state.next;
    this.celebrate(t, true, 1, this.speciesSound);
  }
}

export function errorMessage(e: unknown): string {
  if (e instanceof BackendError) {
    switch (e.kind) {
      case "unauthorized":
        return L("Token Todoist không hợp lệ hoặc đã hết hạn.", "The Todoist token is invalid or expired.");
      case "rate_limited":
        return L("Todoist đang giới hạn tốc độ, thử lại sau ít phút.", "Todoist is rate limiting, retrying in a few minutes.");
      case "network":
        return L("Lỗi mạng: ", "Network error: ") + e.message;
      case "no_token":
        return L("Chưa kết nối Todoist.", "Not connected to Todoist.");
      default:
        return e.message;
    }
  }
  return e instanceof Error ? e.message : String(e);
}
