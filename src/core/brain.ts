// The pet's brain (Brain.swift): Todoist sync, mood, reminder rules, focus timer, pet life and mischief.
// It never touches the OS directly: everything goes through the Backend, so it runs in Tauri, in the
// browser demo and in unit tests with a fake clock.
import { BackendError, type AppCommand, type Backend, type ForegroundApp, type SecretsStatus, type SystemSample } from "../backend/types";
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
import { addDays, atHour, dayKey, daysAgo, parseDate, shortText, startOfDay, timeString, utcString } from "./dates";
import { Diary } from "./diary";
import { L, langFromLocale, plural, setLang } from "./l10n";
import * as life from "./life";
import * as lines from "./lines";
import {
  actionable,
  buildDay,
  completedDate,
  dueDay,
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
import { effectiveClaudeModel, effectiveFilter, isRestDay, isWorkday, prefsFromJson, type Prefs } from "./prefs";
import { relatedTasks } from "./related";
import { isConferencing, isNotWorkApp, resumeSummary, shouldOfferResume, snapshot, withNote, workUrl, type WorkContext } from "./resume";
import { appRules, currentDistraction, siteRules } from "./sites";
import { findStuck, pretendSeen, recordSeen, type SeenLog, type StuckTask } from "./stuck";
import {
  clearTrigger,
  dueTriggers,
  markFired,
  pruneTriggers,
  setTrigger,
  triggerChoices,
  triggersFromJson,
  triggersToJson,
  type StartTrigger,
  type TaskTrigger,
} from "./triggers";
import { EVERY_KINDS, REMINDER_KINDS, type Accessory, type CelebrationKind, type Lang, type Mood, type ReminderKind, type SpeciesId } from "./types";

const MIN = 60_000;
const NEVER = -8.64e15;

/**
 * Unsolicited reminders (see `REMINDER_KINDS`). Each one counts against the daily nudge budget; the repeating ones
 * back off on their own. Urgent bubbles (timed tasks, meetings), replies and the daily check-ins (morning greeting,
 * end-of-day review, all done) have no kind.
 */
export type { ReminderKind } from "./types";

const KIND_NAMES: Readonly<Record<ReminderKind, readonly [string, string]>> = {
  welcome: ["chào mừng quay lại", "welcome back"],
  distract: ["xao nhãng", "distraction"],
  antic: ["nghịch ngợm", "mischief"],
  night: ["thức khuya", "late night"],
  plan: ["lên kế hoạch", "planning"],
  stuck: ["việc bị dời", "postponed task"],
  hungry: ["đói bụng", "hunger"],
  grumble: ["càu nhàu", "grumbling"],
  overdue: ["việc quá hạn", "overdue tasks"],
  timeblock: ["gắn giờ", "time slot"],
  distractsum: ["tổng kết xao nhãng", "distraction summary"],
  nudge: ["việc tiếp theo", "next task"],
  tip: ["mẹo", "tip"],
};
const kindName = (k: ReminderKind) => L(KIND_NAMES[k][0], KIND_NAMES[k][1]);
const isEveryKind = (k: string): k is ReminderKind => (EVERY_KINDS as readonly string[]).includes(k);
/** "Later" on a bubble: the next-task nudge may come at this time (epoch ms), whatever its back-off. */
const LATER = "later";
/** This many reminders dismissed in a row hold the rest for `HOLD_MINUTES`. */
const HOLD_AFTER = 3;
const HOLD_MINUTES = 60;
const budgetLeft = (s: { prefs: Prefs; life: life.LifeState }) => Math.max(0, s.prefs.nudgeBudget - s.life.dayNudges);
/** The place you pinned outlives the automatic snapshots for this long. */
const PIN_KEEPS = 3 * 60 * MIN;
/** A resume card is offered within this long of coming back; after that it is dropped. */
const RESUME_WINDOW = 10 * MIN;
/** "Anything to capture?" asks about meetings that ran this long, within this long of their end. */
const BOOKEND_MIN_LENGTH = 15 * MIN;
const BOOKEND_WINDOW = 10 * MIN;
/** The next meeting this close makes the pet suggest a breather. */
const BREATHER_IF_NEXT_WITHIN = 15 * MIN;
const BREATHER_MINUTES = 5;
const STARTER_MINUTES = 2;
const MAX_RECENT_APPS = 8;

export interface BubbleAction {
  title: string;
  primary?: boolean;
  /** "Later", "Spare me 15'", "Just a quick break": neither a yes nor a no, so the back-off and the dismissals in a row stay as they are. */
  neutral?: boolean;
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
  /** Set when it counts against the daily budget; closing or ignoring it backs that kind off. */
  kind?: ReminderKind;
}

export interface FocusSession {
  task: TodoTask | null;
  start: number;
  end: number;
  isBreak: boolean;
  minutes: number;
  /** The 2-minute "just open it" starter: when it ends the pet offers a full session or lets you stop. */
  starter?: boolean;
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
  /** Todoist refused the saved token: the board shows the connect form again. */
  authError: boolean;
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
  /** Reminders left in today's budget (`prefs.nudgeBudget` minus those shown today). */
  nudgesLeft: number;
  /** After three dismissed reminders in a row, non-urgent ones wait until then (epoch ms); kept in `life`. */
  nudgeHoldUntil: number | null;
  /** Today's "start when…" plans (kept in storage for the day). */
  triggers: TaskTrigger[];
  /** You pinned your place and the resume card will show it (the place itself is never stored or exposed). */
  pinned: boolean;
}

/**
 * What `say` takes besides the bubble. `why` marks an unsolicited reminder (the reason goes in the diary); `kind`
 * makes it count against today's budget, and needs a `why`.
 */
type SayOptions = {
  chime?: Chime;
  antic?: boolean;
  /** What the diary (which is on disk) records instead of the bubble's text, for bubbles that name the app or page you were on. */
  diaryText?: string;
} & ({ why: string; kind: ReminderKind } | { why?: string; kind?: undefined });

/** What the UI provides: sounds, speech and opening views. All optional. */
export interface BrainEffects {
  chime?(c: Chime): void;
  speak?(text: string, lang: Lang): void;
  /** `prefill` is put in the add field ("Team sync: "). */
  openBoard?(focusAdd: boolean, prefill?: string): void;
  openSplit?(task: TodoTask): void;
}

export interface BrainOptions {
  demo?: boolean;
  now?: () => number;
  random?: () => number;
  effects?: BrainEffects;
}

/** Kind words for the day (`yyyy-MM-dd`) they were written on. */
interface Note {
  day: string;
  text: string;
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
  /** Gates that live for this session only (urgent ones: meetings, timed tasks, the token); today's others are in `life`. */
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
  /**
   * "Where was I?" (SPEC v0.4 §1): kept in memory only, never saved or written to the diary, and dropped at the day
   * change. `lastWork` is the latest sample on a work app (not a distraction, the pet's own window or a call).
   */
  private workContext: WorkContext | null = null;
  private pinned = false;
  private lastWork: SystemSample | null = null;
  private lastActedId: string | null = null;
  private pendingResume: { reason: lines.ResumeReason; at: number } | null = null;
  /** Apps recently in front (names only), newest first: the choices of "Start when I open…". */
  private recentApps: ForegroundApp[] = [];
  /** Meetings seen ending today. */
  private endedEventIds: string[] = [];
  /** False after a failed read of the plans: never overwrite what's on disk with an empty list. */
  private persistTriggers = true;
  private distractionSnoozedUntil = NEVER;
  private anticSnoozedUntil = NEVER;
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
  private inflight: Promise<void> | null = null;
  private syncQueued = false;
  /** Sync backoff after failures (Infinity while Todoist refuses the token). */
  private nextSyncAt = 0;
  private syncFailures = 0;
  /** An action just failed: a background sync must not wipe its error message right away. */
  private opErrorAt = NEVER;
  /** Close/reopen requests in flight: kept as the user left them until Todoist confirms. */
  private closing = new Set<string>();
  private reopening = new Map<string, TodoTask>();
  /** What each feed gave, so Undo takes back exactly that. */
  private feeds = new Map<string, { xp: number; golden: boolean }>();
  private lifeSaveTimer: ReturnType<typeof setTimeout> | null = null;
  private lifeSaveBroadcast = false;
  /** False after a failed read at startup: never overwrite what's on disk with defaults. */
  private persistLife = true;
  private timeouts = new Set<ReturnType<typeof setTimeout>>();
  private stopped = false;
  private bubbleAt = 0;
  private calendarHosts: string[] = [];
  /** Demo controls: a mood shown for a few seconds while a stunt plays. */
  private demoMood: { mood: Mood; until: number } | null = null;
  private filterTimer: ReturnType<typeof setTimeout> | null = null;
  /**
   * Kind words that wait until you're around, for the day they were written on: how the last day was settled, and
   * a repaired streak. Dropped once that day is over.
   */
  private dayNote: Note | null = null;
  private repairNote: Note | null = null;
  /** Todoist confirmed today's finished tasks at least once (the completed-tasks fetch worked). */
  private verifiedToday = false;
  /** The stored day being settled: Todoist is asked how many tasks were done on it first. */
  private settling: Promise<void> | null = null;

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
      authError: false,
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
      nudgesLeft: budgetLeft({ prefs, life: lifeState }),
      nudgeHoldUntil: lifeState.nudgeHoldUntil,
      triggers: [],
      pinned: false,
    };
  }

  /** Loads prefs, the pet's life and the postponed-task log, then picks the language. */
  static async create(backend: Backend, opts: BrainOptions = {}): Promise<Brain> {
    const now = (opts.now ?? Date.now)();
    const [p, l, st, tr, locale] = await Promise.all([
      loadRetrying<unknown>(backend, "prefs"),
      loadRetrying<unknown>(backend, "life"),
      loadRetrying<SeenLog>(backend, "stuck"),
      loadRetrying<unknown>(backend, "triggers"),
      backend.system.systemLocale().catch(() => "en"),
    ]);
    const prefs = prefsFromJson(p.ok ? p.value : null, now, now);
    // A failed read (antivirus scanning at logon…) is not a missing file: only a missing file gets defaults saved.
    if (p.ok && p.value === null && !opts.demo) await backend.storage.save("prefs", prefs).catch(() => undefined);
    setLang(prefs.lang ?? langFromLocale(locale));
    const storedLife = l.ok ? l.value : null;
    const lifeState = storedLife ? life.lifeFromJson(storedLife) : opts.demo ? life.demoLife() : life.newLife();
    const seen = !opts.demo && st.ok && st.value && typeof st.value === "object" ? st.value : {};
    const brain = new Brain(backend, prefs, lifeState, seen, opts);
    brain.persistLife = l.ok;
    brain.persistTriggers = tr.ok;
    brain.state.triggers = pruneTriggers(triggersFromJson(tr.ok ? tr.value : null), dayKey(new Date(now)));
    if (!p.ok || !l.ok) {
      brain.diary.add("system", L("Không đọc được dữ liệu đã lưu — phiên này sẽ không ghi đè lên nó", "Couldn't read saved data — this session won't overwrite it"));
    }
    return brain;
  }

  // ---------- React glue ----------

  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  getSnapshot = (): BrainState => this.state;

  private set(patch: Partial<BrainState>): void {
    if (patch.bubble) this.bubbleAt = this.now();
    this.state = { ...this.state, ...patch };
    if (patch.life || patch.prefs) this.state.nudgesLeft = budgetLeft(this.state);
    if (patch.life) this.state.nudgeHoldUntil = patch.life.nudgeHoldUntil;
    for (const fn of this.listeners) fn();
  }

  get prefs(): Prefs {
    return this.state.prefs;
  }

  /**
   * Changes the pet's life. `routine` changes (hunger ticking, seconds on a distraction) are saved at most once
   * a minute and not broadcast; `quiet` ones (today's reminder gates, which no other window shows) are saved right
   * away without a broadcast; everything else is saved right away and tells other windows.
   */
  private mutateLife<T>(change: (s: life.LifeState) => T, mode: "broadcast" | "quiet" | "routine" = "broadcast"): T {
    const s = structuredClone(this.state.life);
    const result = change(s);
    const sameApartFromClock = JSON.stringify({ ...s, lastDecayAt: null }) === JSON.stringify({ ...this.state.life, lastDecayAt: null });
    if (sameApartFromClock) {
      // Only the hunger clock moved: keep it, without a render or a disk write.
      this.state = { ...this.state, life: s };
    } else {
      this.set({ life: s });
      this.saveLife(mode);
    }
    return result;
  }

  private saveLife(mode: "broadcast" | "quiet" | "routine"): void {
    if (!this.persistLife) return;
    const routine = mode === "routine";
    if (mode === "broadcast") this.lifeSaveBroadcast = true;
    if (this.lifeSaveTimer) {
      if (routine) return;
      clearTimeout(this.lifeSaveTimer);
    }
    this.lifeSaveTimer = setTimeout(() => this.flushLife(), routine ? 60_000 : 0);
  }

  private flushLife(): void {
    if (this.lifeSaveTimer) clearTimeout(this.lifeSaveTimer);
    this.lifeSaveTimer = null;
    this.backend.storage.save("life", this.state.life).catch(() => undefined);
    if (this.lifeSaveBroadcast) this.backend.bus.emit({ type: "life-changed" }).catch(() => undefined);
    this.lifeSaveBroadcast = false;
  }

  /** setTimeout that dies with the brain. */
  private later(fn: () => void, ms: number): void {
    const id = setTimeout(() => {
      this.timeouts.delete(id);
      if (!this.stopped) fn();
    }, ms);
    this.timeouts.add(id);
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
    if (this.stopped) return;
    if (this.state.isDemo) this.prepareDemo();
    this.timer = setInterval(() => this.tick(), 15_000);
    this.recompute();
    if (this.state.hasToken) {
      if (!this.didLoadOnce) await this.refresh();
      await this.refreshCalendar(true);
      if (this.state.isDemo) this.say({ text: lines.demoHello(), seconds: 10, urgent: true });
    } else {
      this.fired.set("token", this.now());
      this.later(() => this.askForToken(), 1500);
    }
  }

  stop(): void {
    this.stopped = true;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    for (const id of this.timeouts) clearTimeout(id);
    this.timeouts.clear();
    for (const u of this.unsubs) u();
    this.unsubs = [];
    this.diary.dispose();
    if (this.filterTimer) clearTimeout(this.filterTimer);
    if (this.lifeSaveTimer) this.flushLife();
  }

  private prepareDemo(): void {
    const now = new Date(this.now());
    // A task that has sat on the list for a while, so the "split it" flow can be tried.
    pretendSeen(this.seen, "3", 4, now);
  }

  private async reloadSecrets(announce: boolean): Promise<void> {
    let s: SecretsStatus;
    try {
      s = await this.backend.secrets.status();
    } catch {
      return; // Credential Manager unavailable: keep what we had.
    }
    const gained = s.todoist && !this.state.hasToken;
    const retryAuth = announce && this.state.authError;
    const hostsChanged = s.calendarHosts.join("\n") !== this.calendarHosts.join("\n");
    this.calendarHosts = s.calendarHosts;
    // Any change of secrets (a new token…) lifts the sync backoff.
    if (announce) {
      this.nextSyncAt = 0;
      this.syncFailures = 0;
    }
    this.set({ hasToken: s.todoist, hasClaudeKey: s.anthropic, authError: s.todoist && this.state.authError && !announce });
    if (!s.todoist) {
      this.active = [];
      this.completed = [];
      this.recompute();
    } else if (gained || retryAuth) {
      this.resetDay();
      await this.refresh();
      if (announce && !this.state.authError) this.say({ text: lines.connected(), seconds: 6 });
    }
    if (hostsChanged && announce) void this.refreshCalendar(true);
  }

  private async reloadPrefs(): Promise<void> {
    const raw = await this.backend.storage.load<unknown>("prefs").catch(() => null);
    const locale = await this.backend.system.systemLocale().catch(() => "en");
    const before = this.state.prefs;
    const prefs = prefsFromJson(raw ?? before, before.firstLaunch, this.now());
    setLang(prefs.lang ?? langFromLocale(locale));
    this.diary.enabled = prefs.keepLog;
    this.set({ prefs });
    this.pushTrayLabels();
    if (before.filterQuery !== prefs.filterQuery) {
      // Typing a filter saves on every pause; sync once the user has stopped.
      if (this.filterTimer) clearTimeout(this.filterTimer);
      this.filterTimer = setTimeout(() => {
        this.filterTimer = null;
        if (!this.stopped) void this.refresh();
      }, 1500);
    }
    if (before.useCalendar !== prefs.useCalendar) void this.refreshCalendar(true);
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
        this.hide(null);
        break;
    }
  }

  onSample(s: SystemSample): void {
    const now = this.now();
    const prev = this.sample;
    this.sample = s;
    if (prev.fullscreen !== s.fullscreen) this.set({ fullscreen: s.fullscreen });
    const label = this.currentDistractionLabel();
    if (label === null) this.noteWorkApp(s);
    const was = this.distractionSince;
    if (label !== (was?.label ?? null)) {
      // Onto a distraction from work: remember the work. Off one after 2+ minutes: offer it back.
      if (label && !was) this.takeSnapshot(now);
      if (!label && was && shouldOfferResume({ leftDistractionMinutes: (now - was.since) / MIN })) this.pendingResume = { reason: "distraction", at: now };
      this.distractionSince = label ? { label, since: now } : null;
    }
    const calmMotion = this.computeCalmMotion();
    if (calmMotion !== this.state.calmMotion) this.set({ calmMotion });
  }

  /** Remembers the work app in front (for the place to come back to) and the apps used lately (names only). */
  private noteWorkApp(s: SystemSample): void {
    const app = s.app;
    if (!app || isNotWorkApp(app)) return;
    this.recentApps = [{ name: app.name, exe: app.exe, title: "" }, ...this.recentApps.filter((a) => a.name.toLowerCase() !== app.name.toLowerCase())].slice(0, MAX_RECENT_APPS);
    if (!isConferencing(app, s.url)) this.lastWork = s;
  }

  private readonly isDistractingNow = (app: ForegroundApp | null, url: string | null): boolean => {
    const p = this.state.prefs;
    return currentDistraction(app, url, siteRules(p.distractionSites), appRules(p.distractionApps), p.watchBrowsers) !== null;
  };

  /** The task to remember: the one being focused on, else the one last worked on from the board, else the next one. */
  private contextTask(): TodoTask | null {
    const open = openTasks(this.state.day);
    const f = this.state.focus;
    const focused = f && !f.isBreak && f.task ? open.find((t) => t.id === f.task?.id) : undefined;
    const acted = this.lastActedId ? open.find((t) => t.id === this.lastActedId) : undefined;
    return focused ?? acted ?? this.state.next;
  }

  private setPinned(pinned: boolean): void {
    this.pinned = pinned;
    this.patchState({ pinned });
  }

  /** Remembers where you are (you went idle, a meeting started, you moved onto a distraction). A recent pin stays. */
  private takeSnapshot(nowMs: number): void {
    if (this.pinned && this.workContext && nowMs - this.workContext.at < PIN_KEEPS) return;
    const ctx = snapshot(this.lastWork ?? this.sample, this.contextTask(), this.isDistractingNow, nowMs);
    if (!ctx) return;
    this.workContext = ctx;
    this.setPinned(false);
  }

  /** **📌 Pin my place**: remembers the place now, with an optional one-line next step the resume card shows. */
  pinPlace(note: string | null = null): boolean {
    const nowMs = this.now();
    const base = snapshot(this.lastWork ?? this.sample, this.contextTask(), this.isDistractingNow, nowMs);
    const empty: WorkContext = { taskId: null, taskTitle: null, app: null, windowTitle: null, url: null, note: null, at: nowMs };
    const ctx = withNote(base ?? empty, note);
    if (!base && !ctx.note) return false;
    this.workContext = ctx;
    this.setPinned(true);
    this.diary.add("system", L("Bạn ghim chỗ đang làm", "You pinned your place") + (ctx.note ? L(" (kèm bước tiếp theo)", " (with a next step)") : ""));
    return true;
  }

  unpinPlace(): void {
    if (!this.pinned) return;
    this.workContext = null;
    this.setPinned(false);
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

  /**
   * Syncs with Todoist. Calls during a sync don't get dropped: one more sync runs right after the current one
   * (so the caller's change is included) and the returned promise resolves after it.
   */
  async refresh(): Promise<void> {
    if (!this.state.hasToken) return;
    if (this.inflight) {
      this.syncQueued = true;
      return this.inflight;
    }
    this.inflight = (async () => {
      try {
        do {
          this.syncQueued = false;
          await this.syncOnce();
        } while (this.syncQueued && this.state.hasToken && !this.stopped);
      } finally {
        this.inflight = null;
      }
    })();
    return this.inflight;
  }

  private async syncOnce(): Promise<void> {
    this.set({ loading: true });
    // A day that ended is settled first, with its own count: today's sync must not land on it.
    await this.settleLife(this.now()).catch(() => undefined);
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
      this.syncFailures = 0;
      this.nextSyncAt = 0;
      const keepOpError = this.now() - this.opErrorAt < 10_000;
      this.set({ lastSync: this.now(), authError: false, ...(keepOpError ? {} : { errorText: null }) });
    } catch (e) {
      const msg = errorMessage(e);
      const auth = e instanceof BackendError && (e.kind === "unauthorized" || e.kind === "no_token");
      this.syncFailures += 1;
      // Back off 15 s, 30 s, 1 min … 5 min; a refused token waits until the user changes it.
      this.nextSyncAt = auth ? Infinity : this.now() + Math.min(5 * MIN, 15_000 * 2 ** (this.syncFailures - 1));
      this.set({ errorText: msg, authError: auth });
      this.diary.add("sync", L("Lỗi đồng bộ Todoist: ", "Todoist sync failed: ") + msg, { throttle: "sync-error", every: 30 });
      if (auth && this.every("auth-error", 60)) {
        this.say({
          text: lines.error(msg),
          actions: [{ title: L("Nhập token mới", "Enter a new token"), primary: true, run: () => this.effects.openBoard?.(false) }],
          seconds: 30,
        });
      }
    } finally {
      this.set({ loading: false });
    }
  }

  private apply(fetched: TodoTask[], fetchedDone: TodoTask[] | null): void {
    // Close/reopen requests still in flight win over a snapshot taken before they landed.
    let act = fetched.filter((t) => !this.closing.has(t.id));
    for (const t of this.reopening.values()) if (!act.some((a) => a.id === t.id)) act = [...act, t];
    const done = fetchedDone?.filter((t) => !this.reopening.has(t.id)) ?? null;
    this.active = act;
    const today = dayKey(new Date(this.now()));
    // Only a count Todoist confirmed makes today a day the app saw.
    if (done) this.verifiedToday = true;
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

  /** Fetches the saved ICS links every 15 minutes (parsing is costly, so only after a fetch). */
  async refreshCalendar(force = false): Promise<void> {
    const now = this.now();
    if (!force && now - this.lastCalendarAt < 15 * MIN) return;
    this.lastCalendarAt = now;
    if (!this.state.prefs.useCalendar || this.calendarHosts.length === 0) {
      this.icsTexts = [];
    } else {
      const results = await this.backend.calendar.fetchIcs();
      this.icsTexts = results.filter((r) => r.ok && r.text).map((r) => r.text as string);
      for (const r of results) {
        if (!r.ok) this.diary.add("sync", L(`Không tải được lịch ${r.host}: `, `Couldn't load the calendar at ${r.host}: `) + (r.error ?? ""), { throttle: `ics-${r.host}`, every: 60 });
      }
    }
    this.recomputeEvents();
    this.recompute();
  }

  private recomputeEvents(): void {
    const events = this.state.prefs.useCalendar ? eventsOnDay(this.icsTexts, new Date(this.now())) : [];
    if (JSON.stringify(events) !== JSON.stringify(this.state.events)) this.set({ events });
  }

  /** A new day (or a new token): what the brain knows about today's tasks starts over. Today's gates, back-off and
   * hold live in `life` and are reset when the day closes. */
  private resetDay(): void {
    this.dayKey = dayKey(new Date(this.now()));
    this.fired.clear();
    this.knownCompleted.clear();
    this.completedViaPet.clear();
    this.didLoadOnce = false;
    this.verifiedToday = false;
    this.completed = [];
    // The place you were at never outlives the day; the plans of earlier days are dropped.
    this.workContext = null;
    this.lastWork = null;
    this.lastActedId = null;
    this.pendingResume = null;
    this.recentApps = [];
    this.endedEventIds = [];
    this.setPinned(false);
    const kept = pruneTriggers(this.state.triggers, this.dayKey);
    if (kept.length !== this.state.triggers.length) this.setTriggers(kept);
  }

  // ---------- Mood ----------

  private context(now: number): Context {
    const d = new Date(now);
    const h = d.getHours() + d.getMinutes() / 60;
    const p = this.state.prefs;
    // The demo is always a working day (unless you take it off), so every behavior can be tried at any hour.
    const demo = this.state.isDemo;
    const workday = demo ? !isRestDay(p, d) : isWorkday(p, d);
    return {
      workday,
      inWork: workday && (demo || (h >= p.workStart && h < p.workEnd)),
      night: !demo && (h >= 23 || h < 6),
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
    const free = events.length > 0 ? freeMinutes(events, dayStart, dayEnd) : null;
    const target = p.adaptTarget && free !== null ? adaptiveTarget(free, p.dailyTarget) : p.dailyTarget;
    // A packed calendar excuses a day with nothing done.
    const busy = p.useCalendar && free !== null && free < 60;
    const suggestions = ctx.inWork ? suggestSlots(actionable(day), events, now, dayEnd) : [];
    const stuck = findStuck(this.seen, openTasks(day), p.stuckDays, now);
    this.patchState({ day, target, suggestions, stuck, next: nextTask(day) });
    void this.settleLife(nowMs);
    // Not while a day that ended is still being settled: today's counts don't belong to it.
    if (this.state.hasToken && this.didLoadOnce && this.state.life.dayKey >= dayKey(now)) {
      const s = this.state.life;
      const done = day.completed.length;
      const plannedCount = planned(day);
      const verified = this.verifiedToday;
      const changed = s.dayCompleted !== done || s.dayPlanned !== plannedCount || s.dayTarget !== target || s.dayWorkday !== ctx.workday;
      if (changed || (busy && !s.dayBusy) || (verified && !s.daySeen)) {
        const repair = this.mutateLife((l) => {
          life.syncDay(l, done, plannedCount, target, ctx.workday, busy, verified);
          return life.checkRepair(l);
        });
        const streak = this.state.life.streak;
        if (repair === "restored") {
          this.diary.add("life", L(`Xong ${done} việc hôm nay → nối lại chuỗi ${streak} ngày (chốt khi hết ngày)`, `${done} tasks done today → the ${streak}-day streak is back (final when the day ends)`));
          // Cheered once a day, even if it flips back and forth.
          if (this.once(`repaired-${this.dayKey}`)) this.repairNote = { day: dayKey(now), text: lines.streakRepaired(streak) };
        } else if (repair === "reverted") {
          this.repairNote = null;
          this.diary.add("life", L(`Còn ${done}/${life.REPAIR_TASKS} việc hôm nay → chuỗi chờ nối lại`, `Down to ${done}/${life.REPAIR_TASKS} tasks today → the streak waits to come back`));
        }
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
    if (this.demoMood && nowMs < this.demoMood.until && r.mood !== "celebrating") r.mood = this.demoMood.mood;
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

  /**
   * Settles a finished day (streak, snack, sticker, dirt, repair quest) once the date has changed, even after a
   * restart. Todoist is asked first how many tasks were finished that day (some may have been done on the phone after
   * the last sync); when it can't say, the day closes as one the app never saw. One settlement at a time: callers
   * during the fetch (the heartbeat, a sync) join it.
   */
  private settleLife(nowMs: number): Promise<void> {
    const stored = this.state.life.dayKey;
    const today = dayKey(new Date(nowMs));
    // Today, or the clock went back: nothing to settle.
    if (stored !== "" && stored >= today) return Promise.resolve();
    if (this.settling) return this.settling;
    if (stored === "" || !this.state.hasToken) {
      // The very first day, or no Todoist to ask.
      this.closeStoredDay(null, nowMs);
      return Promise.resolve();
    }
    this.settling = (async () => {
      const count = await this.completedOn(stored);
      // Stopped, or settled meanwhile (a restart wrote it): leave it.
      if (this.stopped || this.state.life.dayKey !== stored) return;
      this.closeStoredDay(count, this.now());
      this.recompute();
    })().finally(() => {
      this.settling = null;
    });
    return this.settling;
  }

  /** How many tasks Todoist says were finished on `day` (local), or null when it can't say. */
  private async completedOn(day: string): Promise<number | null> {
    const start = parseDate(day);
    const end = parseDate(addDays(day, 1));
    if (!start || !end) return null;
    try {
      return (await this.backend.todoist.completed(utcString(start), utcString(end))).length;
    } catch {
      return null;
    }
  }

  /**
   * Closes the stored day with `count` tasks done (as Todoist reported them), or as a day the app never saw when
   * `count` is null, and keeps a kind word about it for when you're around.
   */
  private closeStoredDay(count: number | null, nowMs: number): void {
    const today = dayKey(new Date(nowMs));
    let before = this.state.life;
    const r = this.mutateLife((s) => {
      // Todoist can't say: work it already confirmed still counts, otherwise the day stays one the app never saw.
      if (count === null) s.daySeen = s.daySeen && s.dayCompleted > 0;
      else life.syncDay(s, count, s.dayPlanned, s.dayTarget, s.dayWorkday, s.dayBusy, true);
      before = { ...s };
      return life.closeDay(s, today, (key) => {
        const d = parseDate(key);
        return d ? (this.state.isDemo ? !isRestDay(this.state.prefs, d) : isWorkday(this.state.prefs, d)) : false;
      });
    });
    const after = this.state.life;
    if (r.day) {
      const done = L(`xong ${before.dayCompleted}/${before.dayTarget}`, `${before.dayCompleted}/${before.dayTarget} done`);
      let text = L(`Chốt ngày ${r.day}: `, `Closed ${r.day}: `);
      switch (r.outcome) {
        case "kept":
          text += L(`${done} → chuỗi ${after.streak} ngày`, `${done} → ${after.streak}-day streak`);
          break;
        case "excused":
          text += L(`lịch kín, chưa xong việc nào → được miễn, chuỗi giữ ${after.streak} ngày`, `packed calendar, nothing done → excused, streak stays at ${after.streak}`);
          break;
        case "frozen":
          text += L(`chưa xong việc nào → ăn 1 🍪 để giữ chuỗi ${after.streak} ngày (còn ${after.snacks})`, `nothing done → ate a 🍪 to keep the ${after.streak}-day streak (${after.snacks} left)`);
          break;
        case "broken":
          text +=
            r.lost > 0
              ? L(`chưa xong việc nào, hết 🍪 → chuỗi ${r.lost} ngày đứt`, `nothing done, no 🍪 left → the ${r.lost}-day streak broke`)
              : L("chưa xong việc nào (chưa có chuỗi để giữ)", "nothing done (no streak to keep)");
          break;
        case "none":
          text += !before.daySeen
            ? L("không kiểm tra được với Todoist → không tính", "couldn't check with Todoist → not counted")
            : L("ngày nghỉ → chuỗi giữ nguyên", "a day off → streak unchanged");
      }
      if (r.snackEarned) text += L(", thêm 1 🍪", ", +1 🍪");
      if (r.sticker) text += L(", nhận sticker 🌟", ", earned a 🌟 sticker");
      if (r.pageDone) text += L(`, xong trang sticker ${after.stickerPage - 1} (+50 XP)`, `, filled sticker page ${after.stickerPage - 1} (+50 XP)`);
      if (r.levelUp !== null) text += L(`, lớn lên thành ${life.stageName(r.levelUp)}`, `, grew up: ${life.stageName(r.levelUp)}`);
      if (after.dirt > before.dirt) text += L(`, bẩn thêm ${after.dirt - before.dirt} lớp`, `, ${after.dirt - before.dirt} more layer(s) of dirt`);
      if (r.repairOffered && after.repair) text += L(`, có nhiệm vụ nối chuỗi tới hết ${after.repair.until}`, `, repair quest open until ${after.repair.until}`);
      if (r.repairExpired) text += L(", nhiệm vụ nối chuỗi đã hết hạn", ", the repair quest ran out");
      this.diary.add("life", text);
      const note = this.dayCloseNote(r, after, nowMs);
      this.dayNote = note ? { day: today, text: note } : null;
    }
    if (r.unlocked.length > 0) this.say({ text: lines.unlocked(r.unlocked), seconds: 12, urgent: true });
  }

  /**
   * The morning-after explanation of a frozen, excused or broken (repairable) day, a quest that ran out, a filled
   * sticker page and a growth stage the day's XP reached.
   */
  private dayCloseNote(r: life.DayClose, s: life.LifeState, nowMs: number): string | null {
    const when = daysAgo(r.day, new Date(nowMs));
    const parts: string[] = [];
    if (r.outcome === "frozen") parts.push(lines.dayFrozen(when, s.streak, s.snacks));
    if (r.outcome === "excused") parts.push(lines.dayExcused(when, s.streak));
    // Only a quest that is really there afterwards gets promised.
    if (r.outcome === "broken" && r.repairOffered && s.repair) parts.push(lines.dayBroken(when, r.lost, life.REPAIR_TASKS, life.activeRepair(s) !== null));
    if (r.repairExpired) parts.push(lines.repairExpired(s.streak));
    if (r.pageDone) parts.push(lines.pageDone(s.stickerPage - 1, r.snackEarned));
    if (r.levelUp !== null) parts.push(lines.levelUp(r.levelUp));
    return parts.length > 0 ? parts.join("\n") : null;
  }

  /**
   * Says the waiting kind words once you're here: a reply, not a reminder (no `why`), so it isn't counted. Only on
   * the day they were written for, and not in the middle of the night: from an hour before work starts (the demo
   * works around the clock).
   */
  private tellNotes(nowMs: number): void {
    const now = new Date(nowMs);
    const today = dayKey(now);
    if (this.dayNote && this.dayNote.day !== today) this.dayNote = null;
    if (this.repairNote && this.repairNote.day !== today) this.repairNote = null;
    const text = [this.dayNote?.text, this.repairNote?.text].filter(Boolean).join("\n");
    if (!text || this.state.bubble || this.outOfTheWay || this.sample.idleSeconds > 300) return;
    if (!this.state.isDemo && nowMs < atHour(this.state.prefs.workStart - 1, 0, now).getTime()) return;
    if (this.state.quietUntil !== null && nowMs < this.state.quietUntil) return;
    this.dayNote = null;
    this.repairNote = null;
    this.say({ text, seconds: 12 });
  }

  // ---------- Talking ----------

  /**
   * Shows a bubble (unless one waiting for an answer, or an urgent one, is in the way). `why` marks it as an
   * unsolicited reminder and records the reason in the diary; without it the bubble is a reply to something you did.
   * `kind` makes the reminder count against today's budget. `say` doesn't check the budget or the hold itself: the
   * rules do (`remindEvery`, `remindOnce`, `mayRemind`) before a reminder's timer is set, so a held reminder keeps
   * its turn and comes as soon as the hold ends.
   */
  say(b: { text: string; actions?: BubbleAction[]; seconds: number; urgent?: boolean }, opts: SayOptions = {}): void {
    const cur = this.state.bubble;
    const actions = b.actions ?? [];
    if (cur && cur.actions.length > 0 && !b.urgent && actions.length === 0) return;
    if (cur && cur.urgent && !b.urgent) return;
    const bubble: Bubble = { id: ++this.bubbleSeq, text: b.text, actions, seconds: b.seconds, urgent: b.urgent ?? false, reminder: opts.why !== undefined };
    if (opts.kind) bubble.kind = opts.kind;
    this.lastBubbleAt = this.now();
    this.set({ bubble });
    if (opts.kind) {
      this.mutateLife((s) => {
        s.dayNudges += 1;
      });
    }
    this.play(opts.chime ?? "chatter");
    const quote = `“${shortText((opts.diaryText ?? b.text).replace(/\n/g, " "), 90)}”`;
    const left = opts.kind ? L(` (còn ${this.state.nudgesLeft} lượt nhắc hôm nay)`, ` (${this.state.nudgesLeft} left today)`) : "";
    if (opts.why !== undefined) this.diary.add(opts.antic ? "antic" : "bubble", `${quote} — ${L("vì ", "because ")}${opts.why}${left}`);
    else this.diary.add("system", L("Pet nói ", "Pet said ") + quote);
  }

  /**
   * The user tapped a bubble button. A real answer to a reminder resets that kind's back-off and the dismissals in a
   * row; a neutral one ("Later", "Spare me", "Just a quick break") and a reply's button (Undo) change neither.
   */
  pickAction(bubbleId: number, index: number): void {
    const b = this.state.bubble;
    if (!b || b.id !== bubbleId) return;
    const a = b.actions[index];
    if (!a) return;
    const kind = b.kind;
    if (b.reminder && !a.neutral && (this.state.life.dismissedInRow > 0 || (kind && this.state.life.dayBackoff[kind]))) {
      this.mutateLife((s) => {
        if (kind) delete s.dayBackoff[kind];
        s.dismissedInRow = 0;
      });
    }
    this.diary.add("response", L(`Bạn bấm “${a.title}”`, `You tapped “${a.title}”`), { tag: "picked" });
    this.set({ bubble: null });
    a.run();
  }

  /**
   * The user closed the bubble, it faded away on its own, or it expired without ever showing (the pet was hidden or
   * a full-screen app was in front). A closed or unanswered reminder is a refusal (a bubble without buttons that
   * fades was read, not refused; an expired one was never seen): a repeating kind's interval doubles, up to ×8, and
   * three refusals in a row hold the rest for an hour.
   */
  dismissBubble(bubbleId: number, how: "closed" | "ignored" | "expired"): void {
    const b = this.state.bubble;
    if (!b || b.id !== bubbleId) return;
    const kind = b.kind;
    const refused = kind !== undefined && (how === "closed" || (how === "ignored" && b.actions.length > 0));
    let backoff = "";
    if (refused && kind) {
      const m = isEveryKind(kind) ? Math.min(life.MAX_BACKOFF, (this.state.life.dayBackoff[kind] ?? 1) * 2) : null;
      this.mutateLife((s) => {
        if (m) s.dayBackoff[kind] = m;
        s.dismissedInRow += 1;
      });
      if (m) backoff = L(` → nhắc “${kindName(kind)}” thưa hơn (×${m})`, ` → “${kindName(kind)}” reminders back off (×${m})`);
    }
    if (b.reminder || b.actions.length > 0) {
      const what =
        how === "closed"
          ? L("Bạn đóng bong bóng", "You closed the bubble")
          : how === "ignored"
            ? L("Bạn không phản hồi (tự ẩn)", "No response (faded away)")
            : L("Bong bóng hết hạn mà chưa hiện ra (pet đang ẩn)", "The bubble expired without showing (the pet was out of the way)");
      this.diary.add("response", what + backoff, { tag: how });
    }
    this.set({ bubble: null });
    if (this.state.life.dismissedInRow >= HOLD_AFTER) {
      const until = this.now() + HOLD_MINUTES * MIN;
      this.mutateLife((s) => {
        s.dismissedInRow = 0;
        s.nudgeHoldUntil = until;
      });
      this.diary.add(
        "hold",
        L(
          `Bạn bỏ qua ${HOLD_AFTER} lời nhắc liên tiếp — mình tạm im tới ${timeString(new Date(until))} (việc gấp vẫn nhắc)`,
          `You passed on ${HOLD_AFTER} reminders in a row — holding the rest until ${timeString(new Date(until))} (urgent ones still come)`,
        ),
      );
    }
  }

  private play(c: Chime): void {
    const mode = this.state.prefs.soundMode;
    if (mode === "off") return;
    if (mode === "important" && (c === "chatter" || c === "grumble")) return;
    this.effects.chime?.(c);
  }

  private get outOfTheWay(): boolean {
    const s = this.state;
    return s.hiddenUntil !== null || (s.fullscreen && s.prefs.hideInFullscreen);
  }

  private speak(text: string): void {
    if (this.state.prefs.voiceOn && !this.outOfTheWay) this.effects.speak?.(text, this.state.prefs.lang ?? langFromLocale(null));
  }

  /**
   * Today's gates of counted bubbles and check-ins (the reminder kinds' timers, "Later", and the once-a-day keys,
   * which end with today's date) are kept in the pet's life, so a restart doesn't replay them; the day's close
   * resets them. The rest (meetings, timed tasks, the token) live for this session.
   */
  private isDayGate(key: string): boolean {
    return (REMINDER_KINDS as readonly string[]).includes(key) || key === LATER || key.endsWith(`-${this.dayKey}`);
  }

  private firedAt(key: string): number | undefined {
    return this.isDayGate(key) ? this.state.life.dayFired[key] : this.fired.get(key);
  }

  /** Records when `key` fired (or clears it with null). */
  private markFired(key: string, at: number | null): void {
    if (!this.isDayGate(key)) {
      if (at === null) this.fired.delete(key);
      else this.fired.set(key, at);
      return;
    }
    if ((this.state.life.dayFired[key] ?? null) === at) return;
    this.mutateLife((s) => {
      if (at === null) delete s.dayFired[key];
      else s.dayFired[key] = at;
    }, "quiet");
  }

  private once(key: string): boolean {
    if (this.firedAt(key) !== undefined) return false;
    this.markFired(key, this.now());
    return true;
  }

  /** Has `key` not fired for `minutes` (times its back-off)? Then it fires now. */
  private every(key: string, minutes: number): boolean {
    if (!this.isDue(key, minutes)) return false;
    this.markFired(key, this.now());
    return true;
  }

  /** Without setting it: has `key` not fired for `minutes` (times its back-off, for a repeating reminder kind)? */
  private isDue(key: string, minutes: number): boolean {
    const last = this.firedAt(key);
    const backoff = isEveryKind(key) ? (this.state.life.dayBackoff[key] ?? 1) : 1;
    return last === undefined || this.now() - last >= minutes * backoff * MIN;
  }

  /** The next-task nudge is due: its interval (with back-off) has passed, or the time "Later" asked for has come. */
  private nudgeDue(minutes: number): boolean {
    const later = this.firedAt(LATER);
    return later !== undefined ? this.now() >= later : this.isDue("nudge", minutes);
  }

  /**
   * May an unsolicited reminder speak now? Not once today's budget is spent (one diary line), nor while reminders
   * are held after three dismissed in a row (each skip goes in the diary). Checked before a rule fires, so a held
   * reminder comes as soon as the hold ends.
   */
  private mayRemind(kind: ReminderKind): boolean {
    const s = this.state;
    if (s.life.dayNudges >= s.prefs.nudgeBudget) {
      if (this.once(`budget-${this.dayKey}`)) {
        this.diary.add(
          "hold",
          L(
            `Hôm nay hết lượt nhắc (tối đa ${s.prefs.nudgeBudget}): mình im lặng tới mai, trừ việc gấp`,
            `No reminders left today (budget ${s.prefs.nudgeBudget}): staying quiet until tomorrow, except for urgent ones`,
          ),
        );
      }
      return false;
    }
    const until = s.life.nudgeHoldUntil;
    if (until !== null && this.now() < until) {
      const time = timeString(new Date(until));
      this.diary.add(
        "hold",
        L(`Giữ lời nhắc “${kindName(kind)}” tới ${time}: bạn vừa bỏ qua ${HOLD_AFTER} lời nhắc liên tiếp`, `Held a reminder (${kindName(kind)}) until ${time}: you passed on ${HOLD_AFTER} in a row`),
        { throttle: `hold-dismissed-${kind}`, every: 15 },
      );
      return false;
    }
    return true;
  }

  /** `every` for an unsolicited reminder: due, and allowed by the budget and the hold. */
  private remindEvery(kind: ReminderKind, minutes: number): boolean {
    return this.isDue(kind, minutes) && this.mayRemind(kind) && this.every(kind, minutes);
  }

  /** `once` for an unsolicited reminder. */
  private remindOnce(kind: ReminderKind, key: string): boolean {
    return this.firedAt(key) === undefined && this.mayRemind(kind) && this.once(key);
  }

  /**
   * Today's tasks are known: a sync finished since the day started and none is running. Not so on the first tick of
   * a new day, nor right after waking from sleep (the tick starts a sync first).
   */
  private get snapshotFresh(): boolean {
    const last = this.state.lastSync;
    return this.didLoadOnce && !this.state.loading && last !== null && last >= startOfDay(new Date(this.now())).getTime();
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
    if (!until) return;
    const at = timeString(new Date(until));
    this.diary.add("hold", L(`Bạn ẩn pet tới ${at}`, `You hid the pet until ${at}`));
    // Urgent, so it shows while the pet is away: the only way back besides the tray.
    this.say({ text: L(`Mình trốn tới ${at} nhé 🙈`, `Hiding until ${at} 🙈`), actions: [{ title: L("Hiện lại", "Show me now"), run: () => this.hide(null) }], seconds: 8, urgent: true });
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
    const hold = this.state.life.nudgeHoldUntil;
    if (hold !== null && nowMs >= hold) {
      this.mutateLife((s) => {
        s.nudgeHoldUntil = null;
      });
    }
    const f = this.state.focus;
    if (f && nowMs >= f.end) this.finishFocus();
    const stale = this.state.lastSync === null || nowMs - this.state.lastSync > 3 * MIN;
    if (this.state.hasToken && !this.state.loading && stale && nowMs >= this.nextSyncAt) void this.refresh();
    // A bubble the overlay never got to show (pet hidden, full-screen app) must not block reminders forever. It
    // expired unseen: no back-off, and no step toward the hold.
    const b = this.state.bubble;
    if (b && nowMs - this.bubbleAt > (b.seconds + 60) * 1000) this.dismissBubble(b.id, "expired");
    void this.refreshCalendar();
    // Hunger grows during work hours (not during meetings or while you're away).
    const ctx = this.context(nowMs);
    const working = this.state.hasToken && ctx.inWork && currentEvent(this.state.events, now) === null && this.sample.idleSeconds < 300;
    this.mutateLife((s) => life.decay(s, nowMs, working), "routine");
    const d = this.currentDistraction();
    if (this.state.hasToken && ctx.inWork && d) this.mutateLife((s) => life.addDistraction(s, d.app, 15), "routine");
    // Left the distracting app or site: the pet gets out of the way.
    if (this.state.antic?.kind.type === "block" && !d) this.set({ antic: null });
    this.trackDistraction(nowMs);
    this.updateFlow(now);
    this.recompute();
    // A day that ended is still being settled: its kind words, and today's greeting with the streak, wait for it.
    if (this.settling) return;
    this.tellNotes(nowMs);
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

  /** "Later": the next-task nudge comes in `minutes`, however much it is backed off. */
  private laterAction(minutes = 30): BubbleAction {
    return {
      title: L("Để sau", "Later"),
      neutral: true,
      run: () => this.markFired(LATER, this.now() + minutes * MIN),
    };
  }

  private completeAction(t: TodoTask): BubbleAction {
    return { title: L("✓ Xong rồi", "✓ Done"), run: () => this.complete(t) };
  }

  private spareAction(): BubbleAction {
    return {
      title: L("Tha cho tôi 15'", "Spare me 15'"),
      neutral: true,
      run: () => {
        const until = this.now() + 15 * MIN;
        this.anticSnoozedUntil = until;
        this.distractionSnoozedUntil = until;
        this.demoMood = null;
        this.set({ antic: null });
        this.recompute();
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
    this.trackMeetings(nowMs, now);
    if (s.quietUntil !== null && nowMs < s.quietUntil) return;
    if (s.quietUntil !== null) this.set({ quietUntil: null });

    const idle = this.sample.idleSeconds;
    if (idle > 300) {
      if (this.awaySince === null) {
        this.awaySince = nowMs - idle * 1000;
        this.takeSnapshot(this.awaySince);
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
          { text: lines.meetingSoon(upcoming, Math.max(1, Math.ceil(mins)), relatedTasks(upcoming.title, openTasks(s.day), 2)), actions, seconds: 90, urgent: true },
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
      // With a place to come back to, the resume card (a check-in) takes the welcome's place.
      if (this.workContext && shouldOfferResume({ awayMinutes: minutes })) this.pendingResume = { reason: "away", at: nowMs };
      // Not while the pet is out of the way (nobody would see it), nor on a stale list of tasks.
      else if (minutes > 15 && ctx.inWork && next && !this.outOfTheWay && this.snapshotFresh && this.mayRemind("welcome")) {
        this.say(
          { text: lines.welcomeBack(next), actions: [this.focusAction(next), this.laterAction()], seconds: 30 },
          { why: L(`bạn vừa quay lại sau ${minutes} phút`, `you just came back after ${minutes} minutes`), kind: "welcome" },
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
    // Hidden or a full-screen app in front: only the timed reminders above get through.
    if (this.outOfTheWay) return;
    if (this.state.bubble) return;
    // Everything below is counted or a check-in: not on yesterday's tasks or a list older than the sync in flight.
    if (!this.snapshotFresh) return;

    // Check-ins and the plans you asked for: never counted, never held back by the budget. In this order: the
    // question after a long meeting, a "start when…" plan that has come true, then the place you were at.
    if (this.offerAfterMeeting(nowMs)) return;
    if (this.fireTriggers(nowMs, open)) return;
    if (this.offerResume(nowMs, open)) return;

    // Distracting apps and sites come first: there's no concentration to protect right then.
    // Grumpy and on one for 5+ minutes, the stunts start: a parade with the next task on a sign (never while you're
    // typing), then, 15+ minutes in, the pet jumps in the way. Both share one slot, every 20 minutes at most.
    const d = this.distraction();
    const stunts = s.prefs.antics && ctx.inWork && s.mood === "angry" && nowMs > this.anticSnoozedUntil && open.length > 0 && d !== null;
    if (stunts && d.minutes >= 15 && this.remindEvery("antic", 20)) {
      this.startAntic({ type: "block" }, nowMs);
      this.say(
        { text: lines.block(d.app, next), actions: [this.focusAction(next), this.spareAction()], seconds: 25, urgent: true },
        {
          chime: "grumble",
          antic: true,
          kind: "antic",
          why: L(`đang cáu và ở ${d.app} ${Math.trunc(d.minutes)} phút → nhảy lên chắn màn hình`, `grumpy and on ${d.app} for ${Math.trunc(d.minutes)} min → jumped in the way`),
        },
      );
      this.speak(lines.voiceBlock(d.app));
      return;
    }
    if (stunts && d.minutes >= 5 && next && this.sample.secondsSinceKey > 60 && this.remindEvery("antic", 20)) {
      this.startAntic({ type: "parade", title: taskTitle(next) }, nowMs);
      this.say(
        { text: lines.parade(next), actions: [this.focusAction(next), this.spareAction()], seconds: 25, urgent: true },
        {
          chime: "grumble",
          antic: true,
          kind: "antic",
          why: L(`đang cáu và ở ${d.app} ${Math.trunc(d.minutes)} phút, không gõ phím → diễu hành với biển`, `grumpy and on ${d.app} for ${Math.trunc(d.minutes)} min, not typing → sign parade`) + this.reasonSuffix(),
        },
      );
      this.speak(lines.voiceAngry(next));
      return;
    }
    if (ctx.inWork && open.length > 0 && d && d.minutes >= 2 && this.remindEvery("distract", 10)) {
      this.say(
        {
          text: lines.distraction(s.mood, d.app, open.length, next),
          actions: [
            this.focusAction(next),
            s.antic
              ? this.spareAction()
              : { title: L("Nghỉ xíu thôi (10')", "Just a quick break (10')"), neutral: true, run: () => (this.distractionSnoozedUntil = this.now() + 10 * MIN) },
          ],
          seconds: 30,
        },
        { why: L(`ở ${d.app} ${Math.trunc(d.minutes)} phút trong giờ làm`, `on ${d.app} for ${Math.trunc(d.minutes)} min during work hours`), kind: "distract" },
      );
      return;
    }

    if (ctx.night && now.getHours() >= 23 && this.remindOnce("night", `night-${this.dayKey}`)) {
      this.say({ text: lines.lateNight(), seconds: 10 }, { why: L("đã quá 23 giờ mà bạn vẫn dùng máy", "past 11pm and you're still at it"), kind: "night" });
      return;
    }

    // 2. Everything finished: a reply to your last task, so it doesn't count against the budget.
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
    const due: ReminderKind[] = [];
    if (ctx.inWork) {
      if (planned(day) < target && ctx.hoursAfterPlanDeadline >= 0 && this.isDue("plan", 30)) due.push("plan");
      if (next !== null && nowMs - this.lastBubbleAt > s.prefs.remindEvery * MIN && this.nudgeDue(s.prefs.remindEvery)) due.push("nudge");
      if (s.stuck.some((x) => this.firedAt(`stuck-${x.task.id}-${this.dayKey}`) === undefined)) due.push("stuck");
      if (life.isHungry(s.life) && this.isDue("hungry", 60)) due.push("hungry");
    }
    // A due reminder that the budget or the hold would stop anyway: that's the reason the diary gives
    // (`mayRemind` writes it), not the typing or the zone.
    const somethingDue = due.length > 0 && this.mayRemind(due[0]);
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

    // 3. Morning greeting, with planning if today has fewer than `target` tasks. A daily check-in: never counted.
    if (ctx.inWork && this.once(`morning-${this.dayKey}`)) {
      const needsPlan = planned(day) < target;
      if (needsPlan) this.markFired("plan", nowMs);
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
    if (ctx.inWork && planned(day) < target && ctx.hoursAfterPlanDeadline >= 0 && this.remindEvery("plan", 30)) {
      this.say(
        { text: lines.plan(s.mood, planned(day), target), actions: this.planActions(), seconds: 60 },
        {
          why: L(`đã qua ${s.prefs.planDeadline}h mà mới có ${planned(day)}/${target} việc`, `past ${s.prefs.planDeadline}:00 with only ${planned(day)}/${target} planned`),
          kind: "plan",
        },
      );
      return;
    }

    // 6. A task that keeps getting postponed: offer to split it (or drop it). Once per task per day.
    const stuck = s.stuck.find((x) => this.firedAt(`stuck-${x.task.id}-${this.dayKey}`) === undefined);
    if (ctx.inWork && stuck && this.remindEvery("stuck", 120)) {
      this.markFired(`stuck-${stuck.task.id}-${this.dayKey}`, nowMs);
      this.say(
        {
          text: lines.stuck(stuck, s.mood),
          actions: [
            { title: L("✂️ Chia nhỏ", "✂️ Split it"), primary: true, run: () => this.effects.openSplit?.(stuck.task) },
            { title: L("▶ Thử 2 phút", "▶ Try 2 minutes"), run: () => this.startTwoMinutes(stuck.task) },
            { title: L("Bỏ khỏi kế hoạch", "Drop from plan"), run: () => void this.unplan(stuck.task) },
            this.laterAction(),
          ],
          seconds: 60,
        },
        {
          why: L(`“${shortText(taskTitle(stuck.task), 30)}” nằm trong danh sách ${stuck.days} ngày`, `“${shortText(taskTitle(stuck.task), 30)}” has been on your list ${stuck.days} days`),
          kind: "stuck",
        },
      );
      return;
    }

    // 6b. A hungry pet begs for a finished task.
    if (ctx.inWork && life.isHungry(s.life) && this.remindEvery("hungry", 60)) {
      this.say(
        { text: lines.hungry(s.life.satiety, next), actions: next ? [this.focusAction(next), this.laterAction()] : [], seconds: 30 },
        { why: L(`độ no còn ${Math.trunc(s.life.satiety)}%`, `only ${Math.trunc(s.life.satiety)}% full`), kind: "hungry" },
      );
      this.speak(lines.voiceHungry());
      return;
    }

    // 6c. A grumble, in a low mood after 10 minutes on a distracting app or site (counted from the distraction, so
    // being worried about the day already doesn't make it come sooner; the stunts above come first). Never while
    // you're typing (that's work, even if no task got ticked off yet).
    const low = s.mood === "annoyed" || s.mood === "angry";
    if (s.prefs.antics && ctx.inWork && d && d.minutes >= 10 && low && nowMs > this.anticSnoozedUntil && this.sample.secondsSinceKey > 60 && next) {
      if (this.remindEvery("grumble", 30)) {
        const minutes = Math.trunc(d.minutes);
        this.startAntic({ type: "grumble" }, nowMs);
        this.say(
          { text: lines.grumble(next), actions: [this.focusAction(next), this.spareAction()], seconds: 15 },
          {
            chime: "grumble",
            antic: true,
            kind: "grumble",
            why: L(`tâm trạng đi xuống, ở ${d.app} ${minutes} phút`, `in a low mood, on ${d.app} for ${minutes} min`) + this.reasonSuffix(),
          },
        );
        this.speak(lines.voiceGrumble());
        return;
      }
    }

    // 7. Overdue tasks: move them to today, or a fresh start (all of them to tomorrow). Recurring ones stay put.
    if (ctx.inWork && day.overdue.length > 0 && this.remindEvery("overdue", 90)) {
      const movable = day.overdue.filter((t) => !isRecurring(t)).length;
      const repeating = day.overdue.length - movable;
      // Every overdue task repeats: nothing to move, so only Show.
      const actions: BubbleAction[] =
        movable > 0
          ? [
              { title: L("Dời vào hôm nay", "Move to today"), primary: true, run: () => void this.pullOverdueToToday() },
              { title: L("Bắt đầu lại", "Fresh start"), run: () => void this.freshStart() },
            ]
          : [];
      actions.push({ title: L("Xem", "Show"), primary: movable === 0, run: () => this.effects.openBoard?.(false) });
      this.say(
        { text: lines.overdue(s.mood, movable, repeating), actions, seconds: 45 },
        { why: L(`${day.overdue.length} việc quá hạn (nhắc tối đa 90 phút/lần)`, `${day.overdue.length} overdue task(s) (at most every 90 min)`), kind: "overdue" },
      );
      return;
    }

    // 8. Give the next task a concrete time slot (implementation intention), once a day.
    const slot = s.suggestions[0];
    if (ctx.inWork && planned(day) >= target && slot && slot.start.getTime() - nowMs < 3 * 60 * MIN && this.remindOnce("timeblock", `timeblock-${this.dayKey}`)) {
      this.say(
        { text: lines.timeBlock(slot), actions: [{ title: L("⏰ Đặt giờ", "⏰ Set time"), primary: true, run: () => void this.schedule(slot) }, this.laterAction()], seconds: 60 },
        { why: L("gợi ý khung giờ trống (mỗi ngày một lần)", "a free time slot (once a day)"), kind: "timeblock" },
      );
      return;
    }

    // 9. End-of-day review (shutdown ritual). A daily check-in: never counted.
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

    // 9b. An end-of-day note on time spent in distracting apps and sites: a neutral tally and an offer to help.
    if (ctx.inWork && nowMs >= ctx.reviewTime && life.distractionTotal(s.life) >= 10 * 60 && this.remindOnce("distractsum", `distractsum-${this.dayKey}`)) {
      this.say(
        { text: lines.distractionSummary(s.life.distraction), seconds: 25 },
        {
          why: L(`cuối ngày, xao nhãng ${Math.trunc(life.distractionTotal(s.life) / 60)} phút`, `end of day, ${Math.trunc(life.distractionTotal(s.life) / 60)} min of distractions`),
          kind: "distractsum",
        },
      );
      this.speak(lines.voiceSummary(Math.trunc(life.distractionTotal(s.life) / 60)));
      return;
    }

    // 10. Regular nudge with the next task.
    const minutes = s.prefs.remindEvery;
    if (ctx.inWork && next && nowMs - this.lastBubbleAt > minutes * MIN && this.nudgeDue(minutes) && this.mayRemind("nudge")) {
      this.markFired("nudge", nowMs);
      this.markFired(LATER, null);
      const idleHours = (nowMs - this.lastProgress()) / (60 * MIN);
      this.say(
        { text: lines.nudge(s.mood, next, idleHours), actions: [this.focusAction(next), this.completeAction(next), this.laterAction()], seconds: 45 },
        {
          why: L(
            `${minutes} phút chưa nhắc; ${idleHours.toFixed(1)} giờ chưa có tiến triển`,
            `${minutes} min since the last reminder; no progress for ${idleHours.toFixed(1)}h`,
          ),
          kind: "nudge",
        },
      );
      return;
    }

    // 11. A tip now and then, only when the mood is good.
    if (ctx.inWork && (s.mood === "happy" || s.mood === "normal") && nowMs - this.lastBubbleAt > 40 * MIN && this.remindEvery("tip", 150)) {
      this.say({ text: lines.tip(), seconds: 14 }, { why: L("pet đang vui và đã im lặng 40 phút", "the pet is in a good mood and quiet for 40 min"), kind: "tip" });
    }
  }

  // ---------- Meeting bookends, plans and the resume card (SPEC v0.4) ----------

  /**
   * Notes meetings that just ended (a short one leaves the place to come back to; the long ones get a question first)
   * and the one in progress (its start is a moment to remember where you were). Runs even while muted or away.
   */
  private trackMeetings(nowMs: number, now: Date): void {
    for (const e of this.state.events) {
      if (e.end.getTime() > nowMs || this.endedEventIds.includes(e.id)) continue;
      this.endedEventIds.push(e.id);
      // A meeting from earlier (the pet just started, a calendar that loaded late) is old news.
      if (nowMs - e.end.getTime() <= RESUME_WINDOW && shouldOfferResume({ afterMeeting: true })) this.pendingResume = { reason: "meeting", at: nowMs };
    }
    const current = currentEvent(this.state.events, now);
    if (current && this.once(`context-${current.id}`)) this.takeSnapshot(nowMs);
  }

  private setTriggers(list: TaskTrigger[]): void {
    this.set({ triggers: list });
    if (!this.persistTriggers) return;
    this.backend.storage.save("triggers", triggersToJson(list)).catch(() => undefined);
  }

  /** Marks the plan as spent, whether it spoke or the task was already gone. */
  private finishTrigger(t: TaskTrigger): void {
    this.setTriggers(markFired(this.state.triggers, t.taskId, t.day));
  }

  /** "“Team sync” is over. Anything to capture?" once after a meeting of 15+ minutes, if you are here to hear it. */
  private offerAfterMeeting(nowMs: number): boolean {
    const s = this.state;
    const over = s.events
      .filter((e) => {
        const ago = nowMs - e.end.getTime();
        return ago >= 0 && ago <= BOOKEND_WINDOW && e.end.getTime() - e.start.getTime() >= BOOKEND_MIN_LENGTH && this.firedAt(`aftermeeting-${e.id}-${this.dayKey}`) === undefined;
      })
      .sort((a, b) => b.end.getTime() - a.end.getTime())[0];
    if (!over || !this.once(`aftermeeting-${over.id}-${this.dayKey}`)) return false;
    const next = nextEvent(s.events, new Date(nowMs));
    const soon = next && next.start.getTime() - nowMs <= BREATHER_IF_NEXT_WITHIN ? next : null;
    const actions: BubbleAction[] = [
      {
        title: L("＋ Bước tiếp theo", "＋ Next step"),
        primary: true,
        run: () => {
          // You are capturing, so the "where was I" card would only pile on.
          this.pendingResume = null;
          this.effects.openBoard?.(true, `${shortText(over.title, 60)}: `);
        },
      },
    ];
    if (soon) actions.push({ title: L("☕ Nghỉ 5 phút", "☕ 5-min breather"), run: () => this.startBreak(BREATHER_MINUTES) });
    actions.push({ title: L("Không có gì", "Nothing"), run: () => undefined });
    this.say(
      { text: lines.meetingOver(over, soon), actions, seconds: 60 },
      { why: L(`họp “${shortText(over.title, 30)}” vừa kết thúc`, `“${shortText(over.title, 30)}” just ended`) },
    );
    return true;
  }

  /** Starts a plan that has come true ("As planned: …"); a plan for a task that is gone is simply spent. */
  private fireTriggers(nowMs: number, open: TodoTask[]): boolean {
    const s = this.state;
    const due = dueTriggers(s.triggers, { day: dayKey(new Date(nowMs)), now: nowMs, events: s.events, app: this.sample.app, endedEventIds: this.endedEventIds });
    for (const t of due) {
      const task = open.find((x) => x.id === t.taskId);
      if (!task) {
        this.finishTrigger(t);
        continue;
      }
      // Not in the middle of typing or in the zone: it waits for a pause (the plan stays).
      if (s.flow || !calm.atBreakpoint(this.sample.secondsSinceKey, this.secondsSinceAppSwitch())) return false;
      this.finishTrigger(t);
      // The plan says what to do now; the "where was I" card would only second-guess it.
      this.pendingResume = null;
      this.say(
        { text: lines.asPlanned(task), actions: [{ title: L("▶ Bắt đầu ngay", "▶ Focus now"), primary: true, run: () => this.startFocus(task) }, this.laterAction()], seconds: 45 },
        { why: L(`kế hoạch bạn đặt: ${lines.triggerChoice(t.trigger, s.events)}`, `your plan: ${lines.triggerChoice(t.trigger, s.events)}`) },
      );
      return true;
    }
    return false;
  }

  /** The resume card: "You were on: ⟨task⟩ · in ⟨app — title⟩" with Reopen ↗ (http/https only), Focus and Something else. */
  private offerResume(nowMs: number, open: TodoTask[]): boolean {
    const pending = this.pendingResume;
    if (!pending) return false;
    if (nowMs - pending.at > RESUME_WINDOW) {
      this.pendingResume = null;
      return false;
    }
    const ctx = this.workContext;
    if (!ctx) {
      this.pendingResume = null;
      return false;
    }
    if (this.state.flow || !calm.atBreakpoint(this.sample.secondsSinceKey, this.secondsSinceAppSwitch())) return false;
    // A task finished meanwhile is no longer where you were.
    const task = ctx.taskId ? open.find((t) => t.id === ctx.taskId) ?? null : null;
    const sum = resumeSummary(ctx);
    const shown = { ...sum, task: task ? sum.task : null };
    this.pendingResume = null;
    this.workContext = null;
    this.setPinned(false);
    if (!shown.task && !shown.where && !shown.note) return false;
    const actions: BubbleAction[] = [];
    const url = workUrl(ctx.url);
    if (url) actions.push({ title: L("Mở lại ↗", "Reopen ↗"), primary: true, run: () => void this.backend.system.openUrl(url).catch(() => undefined) });
    const target = task ?? this.state.next;
    // One primary button: Reopen when there is a page to go back to, else Focus.
    if (target) actions.push({ ...this.focusAction(target), primary: url === null });
    actions.push({ title: L("Việc khác", "Something else"), run: () => this.effects.openBoard?.(false) });
    this.say(
      { text: lines.resumeCard(shown, pending.reason), actions, seconds: 45 },
      { why: L("bạn vừa quay lại", "you just came back"), diaryText: lines.resumeDiary(shown.task, shown.note !== null) },
    );
    return true;
  }

  /** Sets (or replaces) the task's "start when…" plan for today. Returns false for a plan with nothing in it. */
  setStartTrigger(task: TodoTask, trigger: StartTrigger): boolean {
    const day = dayKey(new Date(this.now()));
    const [clean] = triggersFromJson([{ taskId: task.id, day, trigger, fired: false }]);
    if (!clean) return false;
    this.lastActedId = task.id;
    this.setTriggers(setTrigger(this.state.triggers, task.id, day, clean.trigger));
    this.diary.add(
      "system",
      L(`Hẹn bắt đầu “${shortText(taskTitle(task), 40)}”: ${lines.triggerChoice(clean.trigger, this.state.events)}`, `Start plan for “${shortText(taskTitle(task), 40)}”: ${lines.triggerChoice(clean.trigger, this.state.events)}`),
    );
    return true;
  }

  clearStartTrigger(task: TodoTask): void {
    const day = dayKey(new Date(this.now()));
    if (this.state.triggers.some((t) => t.taskId === task.id && t.day === day)) this.setTriggers(clearTrigger(this.state.triggers, task.id, day));
  }

  /** The choices of a task's "Start when…" menu. */
  startTriggerChoices(): StartTrigger[] {
    return triggerChoices({ events: this.state.events, now: this.now(), recentApps: this.recentApps, isDistracting: this.isDistractingNow });
  }

  /** **▶ Try 2 minutes**: a 2-minute focus on the task ("just open it"); at the end the pet offers a full session or lets you stop. */
  startTwoMinutes(task: TodoTask | null): void {
    this.startFocus(task, STARTER_MINUTES, true);
  }

  // ---------- Actions ----------

  /** Feeds the pet once per finished task, then dances with a random (sometimes rare golden) celebration. */
  /** Returns what the feeding gave (XP, golden), so Undo can take back exactly that. */
  private celebrate(task: TodoTask | null, viaPet: boolean, feeds = 1, sound = "yay"): { xp: number; golden: boolean } | null {
    const nowMs = this.now();
    this.lastCelebration = nowMs;
    const xpBefore = this.state.life.xp;
    let result: life.FeedResult | null = null;
    const unlocked: Accessory[] = [];
    let levelUp: life.FeedResult["levelUp"] = null;
    for (let i = 0; i < Math.max(1, feeds); i++) {
      const r = this.mutateLife((s) => life.feed(s, nowMs, this.random(), this.random()));
      unlocked.push(...r.unlocked);
      levelUp = r.levelUp ?? levelUp;
      result = r;
    }
    if (!result) return null;
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
      // The task that finished today's repair quest: say so in the same bubble.
      const repaired = this.repairNote?.text ?? null;
      if (repaired) parts.push(repaired);
      this.repairNote = null;
      const actions: BubbleAction[] = viaPet ? [{ title: L("Hoàn tác", "Undo"), run: () => void this.undoComplete(task) }] : [];
      this.lastBubbleAt = nowMs;
      const big = unlocked.length > 0 || levelUp !== null || repaired !== null;
      this.set({ bubble: { id: ++this.bubbleSeq, text: parts.join("\n"), actions, seconds: big ? 14 : 8, urgent: true, reminder: false } });
      if (levelUp !== null || r.golden) this.speak(lines.voiceCheer());
    }
    this.later(() => this.recompute(), 4200);
    return { xp: this.state.life.xp - xpBefore, golden: r.golden };
  }

  /** What the species says when cheering; set by the UI from the species registry. */
  speciesSound = "yay";

  /** Marks a task done (optimistically: the pet celebrates at once) and closes it in Todoist. */
  async complete(task: TodoTask): Promise<void> {
    // Idempotent: a stale "✓ Done" button for a task that's already done does nothing.
    if (!this.state.hasToken || !this.active.some((t) => t.id === task.id)) return;
    this.closing.add(task.id);
    this.active = this.active.filter((t) => t.id !== task.id);
    const done: TodoTask = { ...task, checked: true, completedAt: utcString(new Date(this.now())) };
    this.completed = [done, ...this.completed];
    this.completedViaPet.add(task.id);
    this.knownCompleted.add(task.id);
    if (this.state.focus && !this.state.focus.isBreak && this.state.focus.task?.id === task.id) this.set({ focus: null });
    const gained = this.celebrate(done, true, 1, this.speciesSound);
    if (gained) this.feeds.set(task.id, gained);
    try {
      await this.backend.todoist.close(task.id);
    } catch (e) {
      this.completed = this.completed.filter((t) => t.id !== task.id);
      this.completedViaPet.delete(task.id);
      this.knownCompleted.delete(task.id);
      if (!this.active.some((t) => t.id === task.id)) this.active = [...this.active, task];
      this.feeds.delete(task.id);
      this.mutateLife((s) => life.unfeed(s, gained ?? undefined));
      this.lastCelebration = NEVER;
      this.celebrateUntil = NEVER;
      this.set({ celebration: null });
      this.recompute();
      this.say({ text: lines.error(this.fail(e)), seconds: 10, urgent: true });
    } finally {
      this.closing.delete(task.id);
    }
    void this.refresh();
  }

  async undoComplete(task: TodoTask): Promise<void> {
    if (!this.completed.some((t) => t.id === task.id)) return;
    const gained = this.feeds.get(task.id);
    this.feeds.delete(task.id);
    this.mutateLife((s) => life.unfeed(s, gained));
    const reopened: TodoTask = { ...task, checked: false, completedAt: null };
    this.reopening.set(task.id, reopened);
    this.completed = this.completed.filter((t) => t.id !== task.id);
    this.completedViaPet.delete(task.id);
    this.knownCompleted.delete(task.id);
    if (!this.active.some((t) => t.id === task.id)) this.active = [...this.active, reopened];
    // Stop the dance right away: the stats are already back.
    this.lastCelebration = NEVER;
    this.celebrateUntil = NEVER;
    this.set({ celebration: null });
    this.recompute();
    try {
      await this.backend.todoist.reopen(task.id);
    } catch (e) {
      this.fail(e);
    } finally {
      this.reopening.delete(task.id);
    }
    await this.refresh();
  }

  /** Records a failed action so the next background sync doesn't hide its message. Returns the message. */
  private fail(e: unknown): string {
    const msg = errorMessage(e);
    this.opErrorAt = this.now();
    this.set({ errorText: msg });
    return msg;
  }

  /**
   * Reschedules several tasks at once, each to `due` (or to its own date). Says nothing itself: callers tell the
   * user, so a cheerful bubble never replaces an error. `error` is the first failure's message.
   */
  private async rescheduleAll(tasks: TodoTask[], due: string | ((t: TodoTask) => string)): Promise<{ moved: TodoTask[]; failed: number; error: string | null }> {
    const results = await Promise.allSettled(tasks.map((t) => this.backend.todoist.reschedule(t.id, typeof due === "string" ? due : due(t))));
    const moved = tasks.filter((_, i) => results[i].status === "fulfilled");
    const rejected = results.find((r): r is PromiseRejectedResult => r.status === "rejected");
    return { moved, failed: tasks.length - moved.length, error: rejected ? this.fail(rejected.reason) : null };
  }

  /** "Couldn't move 2 tasks 😵 …", urgent so that a later reply doesn't hide it. */
  private sayMoveFailed(failed: number, error: string): void {
    this.say({ text: L(`Không dời được ${failed} việc 😵 ${error}`, `Couldn't move ${plural(failed, "", "task", "tasks").trim()} 😵 ${error}`), seconds: 10, urgent: true });
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
      this.fail(e);
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

  /** Returns whether Todoist accepted the new date. */
  async reschedule(task: TodoTask, dueString: string): Promise<boolean> {
    this.lastPlanAction = this.now();
    this.lastActedId = task.id;
    let ok = true;
    try {
      await this.backend.todoist.reschedule(task.id, dueString);
    } catch (e) {
      ok = false;
      this.say({ text: lines.error(this.fail(e)), seconds: 10, urgent: true });
    }
    await this.refresh();
    return ok;
  }

  async pullOverdueToToday(): Promise<void> {
    const tasks = this.state.day.overdue.filter((t) => !isRecurring(t));
    this.lastPlanAction = this.now();
    const r = await this.rescheduleAll(tasks, "today");
    if (r.error) this.sayMoveFailed(r.failed, r.error);
    await this.refresh();
  }

  /**
   * "Fresh start" from the overdue bubble: every overdue task that doesn't repeat moves to tomorrow. One bubble says
   * how it went (some may not have moved; repeating ones stay put), with an Undo that puts them back on their old days.
   */
  async freshStart(): Promise<void> {
    const tasks = this.state.day.overdue.filter((t) => !isRecurring(t));
    if (tasks.length === 0) return;
    const was = new Map(tasks.map((t) => [t.id, dueDay(t)]));
    this.lastPlanAction = this.now();
    const { moved, error } = await this.rescheduleAll(tasks, "tomorrow");
    await this.refresh();
    const overdue = this.state.day.overdue;
    const repeating = overdue.filter(isRecurring).length;
    // Accepted by Todoist but still overdue (or refused): not moved.
    const gone = moved.filter((t) => !overdue.some((o) => o.id === t.id));
    const notMoved = tasks.length - gone.length;
    const moves = moved.flatMap((task) => {
      const from = was.get(task.id);
      return from ? [{ task, from }] : [];
    });
    if (gone.length > 0) {
      const list = moves.map((m) => `“${shortText(taskTitle(m.task), 30)}” (${L("từ", "was")} ${m.from})`).join(", ");
      this.diary.add(
        "system",
        L(`Bắt đầu lại: dời ${gone.length} việc quá hạn sang mai: ${list}`, `Fresh start: moved ${plural(gone.length, "", "overdue task", "overdue tasks").trim()} to tomorrow: ${list}`),
      );
    }
    const actions: BubbleAction[] = moves.length > 0 ? [{ title: L("Hoàn tác", "Undo"), run: () => void this.undoFreshStart(moves) }] : [];
    const text = notMoved > 0 ? lines.freshStartPartial(gone.length, tasks.length, notMoved, repeating, error ?? "") : lines.freshStart(gone.length, repeating);
    this.say({ text, actions, seconds: notMoved > 0 ? 15 : 10, urgent: true });
  }

  /** Undo of a fresh start: each moved task goes back to the day it was due (`yyyy-MM-dd` as the due string). */
  private async undoFreshStart(moves: { task: TodoTask; from: string }[]): Promise<void> {
    const from = new Map(moves.map((m) => [m.task.id, m.from]));
    this.lastPlanAction = this.now();
    const { moved, failed, error } = await this.rescheduleAll(
      moves.map((m) => m.task),
      (t) => from.get(t.id) ?? "today",
    );
    await this.refresh();
    if (moved.length > 0) {
      const list = moved.map((t) => `“${shortText(taskTitle(t), 30)}” (${from.get(t.id)})`).join(", ");
      this.diary.add("system", L(`Hoàn tác bắt đầu lại: trả về ${list}`, `Undid the fresh start: put back ${list}`));
    }
    this.say({ text: lines.freshStartUndone(moved.length, failed) + (error ? ` ${error}` : ""), seconds: 8, urgent: true });
  }

  async moveTodayToTomorrow(): Promise<void> {
    const tasks = this.state.day.today.filter((t) => !isRecurring(t));
    const { moved, failed, error } = await this.rescheduleAll(tasks, "tomorrow");
    if (error) this.sayMoveFailed(failed, error);
    await this.refresh();
    if (moved.length > 0) this.say({ text: lines.movedToTomorrow(moved.length), seconds: 8 });
  }

  /** Gives a task the suggested time today, so the pet can remind you right on time. */
  async schedule(s: SlotSuggestion): Promise<void> {
    this.lastPlanAction = this.now();
    try {
      await this.backend.todoist.reschedule(s.task.id, `today at ${timeString(s.start)}`);
    } catch (e) {
      this.say({ text: lines.error(this.fail(e)), seconds: 10, urgent: true });
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
      this.say({ text: lines.error(this.fail(e)), seconds: 10, urgent: true });
      await this.refresh();
      return;
    }
    this.say({ text: lines.deleted(task), seconds: 5, urgent: true });
    await this.refresh();
  }

  /** Takes a task off today's plan without deleting it (it stays in Todoist with no date). Returns success. */
  async unplan(task: TodoTask): Promise<boolean> {
    this.lastPlanAction = this.now();
    this.lastActedId = task.id;
    try {
      await this.backend.todoist.reschedule(task.id, "no date");
    } catch (e) {
      this.say({ text: lines.error(this.fail(e)), seconds: 10, urgent: true });
      return false;
    }
    await this.refresh();
    this.say({ text: lines.unplanned(task), seconds: 6, urgent: true });
    return true;
  }

  async suggestSteps(task: TodoTask): Promise<string[]> {
    const lang = this.state.prefs.lang ?? langFromLocale(await this.backend.system.systemLocale().catch(() => "en"));
    return this.backend.claude.splitTask({ title: taskTitle(task), notes: task.description, lang, model: effectiveClaudeModel(this.state.prefs) });
  }

  /** Adds the steps as Todoist sub-tasks; the first one goes on today's plan. */
  async split(task: TodoTask, steps: string[], firstToday: boolean): Promise<boolean> {
    const clean = steps.map((s) => s.trim()).filter((s) => s.length > 0);
    if (clean.length === 0) return false;
    this.lastActedId = task.id;
    let firstId: string | null = null;
    let created = 0;
    try {
      for (const [i, step] of clean.entries()) {
        const t = await this.backend.todoist.add({ content: step, dueString: i === 0 && firstToday ? "today" : null, priority: task.priority, parentId: task.id });
        if (i === 0) firstId = t?.id ?? null;
        created += 1;
      }
    } catch (e) {
      const msg = this.fail(e);
      if (created > 0) {
        // Some steps exist now: show them, so a retry doesn't add them twice.
        await this.refresh();
        this.say({ text: L(`Mới thêm được ${created}/${clean.length} bước 😵 ${msg}`, `Only ${created} of ${clean.length} steps were added 😵 ${msg}`), seconds: 12, urgent: true });
      }
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

  /** "Take today off" from the board: today becomes a rest day (like a weekend), or a workday again. */
  async takeDayOff(on: boolean): Promise<void> {
    const today = dayKey(new Date(this.now()));
    const rest = this.state.prefs.restDays.filter((d) => d !== today);
    await this.updatePrefs({ restDays: on ? [...rest, today].sort() : rest });
    this.diary.add("system", on ? L("Bạn nghỉ hôm nay — pet không nhắc gì", "You took today off — no reminders") : L("Bạn làm việc lại hôm nay", "You're back at work today"));
    this.say({ text: lines.dayOff(on, this.state.life.streak), seconds: 8 });
  }

  toggleAccessory(a: Accessory): void {
    this.mutateLife((s) => life.toggleAccessory(s, a));
  }

  async setSpecies(id: SpeciesId): Promise<void> {
    await this.updatePrefs({ species: id });
  }

  // ---------- Focus (Pomodoro) ----------

  startFocus(task: TodoTask | null, minutes?: number, starter = false): void {
    const m = minutes ?? this.state.prefs.focusMinutes;
    const nowMs = this.now();
    const t = task ?? this.state.next;
    if (task) this.lastActedId = task.id;
    this.set({ focus: { task: t, start: nowMs, end: nowMs + m * MIN, isBreak: false, minutes: m, ...(starter ? { starter: true } : {}) }, antic: null });
    this.finishFocusAt(nowMs + m * MIN);
    this.recompute();
    this.lastBubbleAt = nowMs;
    this.set({ bubble: { id: ++this.bubbleSeq, text: starter ? lines.starterStart(t, m) : lines.focusStart(t, m), actions: [], seconds: 5, urgent: false, reminder: false } });
    this.diary.add(
      "focus",
      (starter ? L(`Bắt đầu thử ${m} phút`, `Started a ${m}-minute starter`) : L(`Bắt đầu tập trung ${m} phút`, `Started a ${m}-minute focus session`)) + (t ? `: “${shortText(taskTitle(t), 40)}”` : ""),
    );
  }

  startBreak(minutes?: number): void {
    const nowMs = this.now();
    const m = minutes ?? this.state.prefs.breakMinutes;
    this.set({ focus: { task: null, start: nowMs, end: nowMs + m * MIN, isBreak: true, minutes: m } });
    this.finishFocusAt(nowMs + m * MIN);
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

  /** Ends the session right at 0:00 rather than at the next 15-second tick (the tick stays as a fallback). */
  private finishFocusAt(end: number): void {
    this.later(() => {
      const f = this.state.focus;
      if (f && f.end === end && this.now() >= end - 1000) this.finishFocus();
    }, Math.max(0, end - this.now()));
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
      const stillOpen = t !== null && openTasks(this.state.day).some((x) => x.id === t.id);
      if (f.starter) {
        // The 2-minute starter: a full session if it got going, or "that's enough".
        if (t && stillOpen) actions.push({ title: L("✓ Xong rồi", "✓ Done"), run: () => void this.complete(t) });
        actions.push({ ...this.focusAction(t), primary: true });
        actions.push({
          title: L("Thế là được rồi", "That's enough"),
          run: () => {
            this.diary.add("focus", L("Bạn dừng sau 2 phút thử", "You stopped after the 2-minute starter"));
            this.say({ text: lines.starterEnough(), seconds: 6 });
          },
        });
        bubble = { id: ++this.bubbleSeq, text: lines.starterEnd(t), actions, seconds: 120, urgent: true, reminder: false };
      } else {
        if (t && stillOpen) {
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
    }
    this.lastBubbleAt = this.now();
    this.set({ bubble });
  }

  // ---------- Pet interaction ----------

  /** Clicking the pet calls off any mischief. */
  petClicked(): void {
    if (this.state.antic) this.endAntic();
  }

  endAntic(): void {
    this.demoMood = null;
    this.set({ antic: null });
    this.recompute();
  }

  /**
   * Demo controls: play a stunt exactly as the real rule would (mood, bubble, "Spare me"), right away.
   * The table flip stays until "Spare me", a click on the pet, or leaving the distraction.
   */
  demoAntic(kind: "parade" | "block" | "grumble"): void {
    const now = this.now();
    const next = this.state.next;
    this.demoMood = { mood: kind === "grumble" ? "annoyed" : "angry", until: now + (kind === "grumble" ? 8_000 : 30_000) };
    const actions = [this.focusAction(next), this.spareAction()];
    const why = L("bảng demo", "demo controls");
    if (kind === "parade") {
      this.startAntic({ type: "parade", title: next ? taskTitle(next) : L("Làm việc đi!", "Get to work!") }, now);
      if (next) this.say({ text: lines.parade(next), actions, seconds: 25, urgent: true }, { chime: "grumble", why, antic: true });
    } else if (kind === "block") {
      this.startAntic({ type: "block" }, now);
      this.say({ text: lines.block(this.currentDistraction()?.app ?? "YouTube", next), actions, seconds: 25, urgent: true }, { chime: "grumble", why, antic: true });
    } else {
      this.startAntic({ type: "grumble" }, now);
      if (next) this.say({ text: lines.grumble(next), actions, seconds: 15, urgent: true }, { chime: "grumble", why, antic: true });
    }
    this.recompute();
  }

  /**
   * Demo controls: pretend the distraction now in front (`label`, e.g. "youtube.com") started 3 minutes ago,
   * so one click shows its effect on the mood and the reminders.
   */
  demoDistract(label: string): void {
    this.takeSnapshot(this.now());
    this.distractionSince = { label, since: this.now() - 3 * MIN };
    // Clear a leftover greeting so "Run rules" shows the reminder right away.
    const b = this.state.bubble;
    if (b && !b.urgent) this.dismissBubble(b.id, "closed");
    this.recompute();
  }

  /** Demo: pretend you were away from the work app in front for 8 minutes and are back now: the resume card. */
  demoComeBack(): void {
    const nowMs = this.now();
    this.clearForDemo();
    this.takeSnapshot(nowMs - 8 * MIN);
    this.awaySince = nowMs - 8 * MIN;
    this.runRules(nowMs);
  }

  /** Demo: a meeting starts in 4 minutes, with a title that shares a word with one of the tasks. */
  demoMeetingSoon(): void {
    const nowMs = this.now();
    this.clearForDemo();
    this.addDemoEvent({ id: `demo-soon-${nowMs}`, title: L("Gia hạn với khách hàng ABC", "Client ABC renewal"), start: new Date(nowMs + 4 * MIN), end: new Date(nowMs + 34 * MIN), joinUrl: null });
    this.runRules(nowMs);
  }

  /** Demo: a 30-minute meeting just ended and the next one starts in 12 minutes (the question and the breather). */
  demoMeetingEnds(): void {
    const nowMs = this.now();
    this.clearForDemo();
    this.takeSnapshot(nowMs - 31 * MIN);
    this.addDemoEvent({ id: `demo-over-${nowMs}`, title: L("Họp kế hoạch quý", "Q4 planning"), start: new Date(nowMs - 31 * MIN), end: new Date(nowMs - MIN), joinUrl: null });
    this.addDemoEvent({ id: `demo-next-${nowMs}`, title: L("Review thiết kế", "Design review"), start: new Date(nowMs + 12 * MIN), end: new Date(nowMs + 42 * MIN), joinUrl: null });
    this.runRules(nowMs);
  }

  private addDemoEvent(e: CalEvent): void {
    this.set({ events: [...this.state.events, e].sort((a, b) => a.start.getTime() - b.start.getTime()) });
  }

  /** Clears a waiting non-urgent bubble so a demo button's result shows at once. */
  private clearForDemo(): void {
    const b = this.state.bubble;
    if (b && !b.urgent) this.dismissBubble(b.id, "closed");
  }

  /** Demo: pretend yesterday went by with nothing done, and wake up to it (a snack saves it, or the streak breaks). */
  demoMissDay(): void {
    const nowMs = this.now();
    const yesterday = addDays(dayKey(new Date(nowMs)), -1);
    this.mutateLife((s) => {
      life.syncDay(s, 0, Math.max(s.dayPlanned, 3), s.dayTarget, true);
      // Pretend: a quiet calendar, so the day isn't excused.
      s.dayBusy = false;
      s.dayKey = yesterday;
    });
    this.closeStoredDay(0, nowMs);
    this.recompute();
    this.set({ bubble: null });
    this.tellNotes(nowMs);
  }

  /** Dev hook (demo only): celebrate as if a task was finished. */
  demoCelebrate(): void {
    const t = this.state.next;
    this.celebrate(t, true, 1, this.speciesSound);
  }
}

/**
 * Reads a stored document, retrying a few times: right after logon, antivirus scans can briefly lock files.
 * `ok: false` means the read failed (not that the document is missing, which is `ok: true, value: null`).
 */
async function loadRetrying<T>(backend: Backend, key: string): Promise<{ ok: true; value: T | null } | { ok: false }> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return { ok: true, value: await backend.storage.load<T>(key) };
    } catch {
      await new Promise((r) => setTimeout(r, 300 * (attempt + 1)));
    }
  }
  return { ok: false };
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
