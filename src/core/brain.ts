// The pet's brain (Brain.swift): Todoist sync, mood, reminder rules, focus timer, pet life and mischief.
// It never touches the OS directly: everything goes through the Backend, so it runs in Tauri, in the
// browser demo and in unit tests with a fake clock.
import { demoSignedCard } from "../backend/demoCards";
import { BackendError, type AppCommand, type AvailableUpdate, type Backend, type ForegroundApp, type SecretsStatus, type SystemSample, type UpdateProgress, type UpdateStatus } from "../backend/types";
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
import { addDays, atHour, dayKey, daysAgo, parseDate, shortText, startOfDay, timeString, utcString, weekdayName } from "./dates";
import { Diary } from "./diary";
import { L, getLang, langFromLocale, plural, setLang } from "./l10n";
import * as life from "./life";
import * as lines from "./lines";
import { dayLoad, isOverbooked, taskEstimate, type DayLoad, type DayLoadInput } from "./load";
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
  ranked,
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
import { isConferencing, isNotWorkApp, resumeSummary, shouldOfferResume, snapshot, withNote, withoutDetails, workUrl, type WorkContext } from "./resume";
import { appRules, currentDistraction, isBrowser, siteRules } from "./sites";
import { findStuck, pretendSeen, recordSeen, type SeenLog, type StuckTask } from "./stuck";
import {
  appMatches,
  clearTrigger,
  dueTriggers,
  goneMeetingPlans,
  markFired,
  pruneTriggers,
  rearmTrigger,
  setTrigger,
  shortHash,
  triggerChoices,
  triggersFromJson,
  triggersToJson,
  type StartTrigger,
  type TaskTrigger,
} from "./triggers";
import { EVERY_KINDS, REMINDER_KINDS, type Accessory, type CelebrationKind, type Lang, type Mood, type ReminderKind, type SpeciesId } from "./types";
import {
  emptyPlanDoc,
  isDoneForToday,
  newDraft,
  nextWorkday,
  nextWorkdayStart,
  planFor,
  planFromDraft,
  planFromJson,
  planToJson,
  prunePlans,
  reconcileDraft,
  setPlan,
  wrapMoves,
  type DayPlan,
  type PlanDoc,
  type WrapDraft,
} from "./wrapup";
// v0.5 "Game".
import * as chapters from "./chapters";
import * as chests from "./chests";
import * as craft from "./craft";
import { activeSeason, type ActiveSeason } from "./seasons";
import * as trips from "./trips";
// v0.6 "Friends".
import * as fr from "./friends";
// v0.7 "Always fresh".
import * as updates from "./updates";
import { chooseLine, remember, stickyPhrase, withEntry, type Pack, type Phrase } from "./variety";

const MIN = 60_000;
const NEVER = -8.64e15;
/** Idle for this long is "away" (the pet sleeps, nobody to see a visit). */
const AWAY_SECONDS = 300;
/** Away for this long and back: the day's first visit waits again (see `noteAway`). */
const LONG_AWAY_MS = 30 * MIN;

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
/** v0.5: a heartbeat gap longer than this (the PC slept mid-session) knits this much at most. */
const KNIT_GAP_MAX_SEC = 60;
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
/** A breather shorter than this isn't worth suggesting. */
const BREATHER_MIN = 3;
const STARTER_MINUTES = 2;
/** A confirmation ("Starting 25 minutes…") is shown within this long of what it confirms, or never. */
const CONFIRM_MS = 30_000;
/** At most one resume card per this many minutes. */
const RESUME_COOLDOWN = 30;
/** Cards you closed or ignored this many times in a day aren't offered again that day. */
const MAX_REFUSALS = 2;
/** A browser whose address can't be read this many samples in a row (1 per second) is believed: its title it is. */
const UNREADABLE_AFTER = 5;
/** "Later" on a plan that came true. */
const PLAN_LATER_MINUTES = 30;
/** v0.7: the pet's life is saved before an install, but not waited for longer than this (the install goes on and the diary says so). */
const SAVE_WAIT_MS = 5000;
/** v0.7: a check the pet was asked for that is still going after this long gets a "Let me look…". */
const LOOK_AFTER_MS = 700;

/** The check-ins that count their refusals: closing or ignoring one twice in a day stops that kind for the day. */
type CardKind = "resume" | "aftermeeting";
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
  /** A check-in that isn't counted but whose refusals are: see `CardKind`. */
  card?: CardKind;
  /** A quieter second line under the text (where you were, on the resume card). */
  detail?: string;
  /**
   * A check-in that is not urgent but still shows as a banner in the open board ("Move some?"). Once it was read
   * there, the board closing drops it: it is not shown again over the pet.
   */
  inBoard?: boolean;
  /** After this time (epoch ms) the bubble is out of date (the meeting it announces has started) and is dropped unseen. */
  validUntil?: number;
  /** Turns false once what the bubble is about has changed (its session stopped, its task is gone): it is dropped unseen. */
  stillValid?: () => boolean;
  /**
   * v0.7: the update's download, shown as a bar under the text (the share is null when the size isn't known). The text and bar change
   * in place. `spoken` is what a screen reader is told: it changes only at the start, halfway and the last step.
   */
  progress?: { percent: number | null; spoken: string };
}

/**
 * Does this bubble get through while the board is open? Urgent ones that announce or ask something (a meeting, a timed
 * task, "is it done?") do, as a banner in the board, and so does the day's "Move some?" check-in. The quiet replies
 * ("Added ✔︎") don't: the board says so itself. A reply the board does not say by itself ("You're on the newest version") is
 * marked `inBoard`, and shows even without a button.
 */
export const showsOverBoard = (b: Bubble): boolean => b.inBoard === true || (b.urgent && (b.reminder || b.actions.length > 0));

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

/** v0.5: what the pet just revealed (a new `id` each time), for the overlay's reveal animation. */
export type Reveal =
  | { id: number; at: number; kind: "chest"; chest: chests.ChestResult }
  | ({ id: number; at: number; kind: "craft" } & craft.CraftResult)
  | ({ id: number; at: number; kind: "souvenir" } & trips.TripReturn);

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
  /** The screen is locked or the display is off: nobody can see the pet, so nothing is drawn. */
  screenOff: boolean;
  /** Windows' battery saver is on: the pet stands still unless something happens. */
  batterySaver: boolean;
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
  /** The frog and the note you left yourself in the Wrap up sheet, for today (kept in storage until the day is over). */
  todayPlan: DayPlan | null;
  /** "Done for today": the pet sleeps and holds non-urgent bubbles until then (epoch ms); null when it is not. */
  doneUntil: number | null;
  /** The Wrap up sheet's choices once you have made one (kept for the day, so closing the board doesn't lose them). */
  wrapDraft: WrapDraft | null;
  // v0.5 "Game".
  /** Knitting progress (0–1) while a focus session runs, else null (the pet's `craft` pose). */
  craft: number | null;
  /** Chests held, earned today (3 at most), and progress toward the next one (0–1). */
  chests: { held: number; today: number; next: number };
  /** The pet's trip while it is away (the sign shows `back`), else null. */
  trip: trips.Trip | null;
  /** The season in progress (seasonal chest items, days left), or null. */
  season: ActiveSeason | null;
  /** The last chest, decoration or souvenir revealed. */
  reveal: Reveal | null;
  // v0.6 "Friends".
  /** The friends' latest pet cards (kept in storage, up to 12). */
  friends: fr.Friend[];
  /** Days in a row you both reached your goal, per friend (their public key), against your card as it is now. */
  buddyStreaks: Record<string, number>;
  /** This week's Procrastination Blob: its HP, who has hurt it, and whether it is beaten. */
  boss: fr.Boss;
  /** A friend's pet that is dropping by (ambient: not a bubble), or null. */
  visitor: fr.Visit | null;
  /** This install's public key for pet cards (base64url), or null when Credential Manager couldn't give it. It is not a secret: it is on every card. */
  myKey: string | null;
  // v0.7 "Always fresh".
  /** The running version ("0.7.0"), or null when the backend couldn't say. */
  version: string | null;
  /** A newer published release on offer (the board's chip, the tray item and the notice are about it), or null. */
  update: AvailableUpdate | null;
  /** While an update installs: the download with its share, then the last step; else null. */
  installing: updates.Installing | null;
}

/** What adding a friend's card came to: the friend, or the kind words for why not (which never repeat what the card says). */
export type FriendAdd =
  | { ok: true; friend: fr.Friend; replaced: boolean }
  | { ok: false; error: fr.CardError | "self" | "former" | "older" | "full"; message: string };

/** What `wrapUp` did: the pet only goes to sleep when every move you chose went through. */
export interface WrapResult {
  ok: boolean;
  /** Tasks moved to tomorrow. */
  moved: number;
  /** Tasks taken off the plan (no date). */
  offPlan: number;
  failed: number;
  error: string | null;
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
  card?: CardKind;
  /** No chime: a small note that shouldn't make a sound (v0.5: a chest was found). */
  silent?: boolean;
} & ({ why: string; kind: ReminderKind } | { why?: string; kind?: undefined });

/** What the UI provides: sounds, speech and opening views. All optional. */
export interface BrainEffects {
  chime?(c: Chime): void;
  speak?(text: string, lang: Lang): void;
  /**
   * `prefill` is put in the add field ("Team sync: "); `focusTaskId` scrolls to that task and gives it the focus;
   * `lighten` opens the board to move tasks off an overbooked day.
   */
  openBoard?(focusAdd: boolean, prefill?: string, opts?: { focusTaskId?: string; lighten?: boolean }): void;
  openSplit?(task: TodoTask): void;
  /** Opens the board on the Wrap up sheet. */
  openWrapUp?(): void;
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
  /** Words that name how long ago it was are worded again when they are told, if they waited (a weekend of "done for today"). */
  rebuild?: (nowMs: number) => string | null;
}

interface Context {
  workday: boolean;
  inWork: boolean;
  night: boolean;
  hoursAfterPlanDeadline: number;
  reviewTime: number;
  /** The middle of the work day: the overbooked check ends here. */
  midday: number;
}

/**
 * One of today's meetings, as the samples saw it. The follow-ups (the question, the "Meeting's done" card) need
 * `attended`, and count their 10 minutes from `since`: the calendar's end, or the moment the call that ran over left
 * the front.
 */
interface MeetingTrack {
  /** The work app in front when it began (the name only): the "pre-meeting snapshot". */
  before: string | null;
  /** A call was in front, you were idle for 2+ minutes, or another app than `before` was in front. */
  attended: boolean;
  /** Over on the calendar, and no call in front now. */
  closed: boolean;
  /** Over on the calendar, with the call still in front. */
  held: boolean;
  since: number | null;
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
  /** What the samples during and after today's meetings say about whether you were there (see `MeetingTrack`). */
  private meetingTracks = new Map<string, MeetingTrack>();
  /** Samples in a row away from the distraction you were on (it ends at 2), and in a row with an unreadable address. */
  private calmSamples = 0;
  private unreadableRun = 0;
  /** False after a failed read of the plans: never overwrite what's on disk with an empty list. */
  private persistTriggers = true;
  /** Tomorrow's frog and note, and "done for today" (SPEC v0.4 §3); same rule about a failed read. */
  private plan: PlanDoc = emptyPlanDoc();
  private persistPlan = true;
  /** The sheet's draft, for the day it was started on. */
  private draft: WrapDraft | null = null;
  /** A "Done for today" that didn't go through: the plan worked out on the first press, reused by a retry of the same sheet. */
  private wrapAttempt: { sig: string; plan: DayPlan; frogTitle: string | null } | null = null;
  /** Titles of the tasks seen this session, so a frog that has moved away can still be named. */
  private titles = new Map<string, string>();
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
  /** The bubble that announced the current stunt (a parade, a block, a grumble): it goes when the stunt is called off. */
  private anticBubbleId: number | null = null;
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
  /** Demo controls: Saturdays and Sundays are days off as in real life, so "Monday" can be seen after a Friday. */
  private demoWeekends = false;
  private filterTimer: ReturnType<typeof setTimeout> | null = null;
  /**
   * Kind words that wait until you're around, for the day they were written on: how the last day was settled, and
   * a repaired streak. Dropped once that day is over.
   */
  /** The "Move some?" bubble that is waiting, so opening the lighten view (its answer) can drop it. */
  private overbookedBubble: number | null = null;
  /** The board's lighten view is open: the day's weight is on show, so "Move some?" has nothing to add. */
  private lightening = false;
  /** A check-in that showed as a banner in the open board: it was read there, so the board closing drops it. */
  private readInBoard: number | null = null;
  private dayNote: Note | null = null;
  private repairNote: Note | null = null;
  /** Todoist confirmed today's finished tasks at least once (the completed-tasks fetch worked). */
  private verifiedToday = false;
  /** The stored day being settled: Todoist is asked how many tasks were done on it first. */
  private settling: Promise<void> | null = null;
  /** v0.5: the distraction visit (its start) that already cost stitches during focus. */
  private stitchesDroppedAt: number | null = null;
  /** v0.5: knitting is counted up to here (epoch ms) in the running focus session. */
  private knitAt: number | null = null;
  /** v0.5: an item finished mid-session whose line couldn't be shown yet: it joins the end-of-session bubble. */
  private craftLine: string | null = null;
  /** v0.5: a chest was just earned and the pet hasn't said so yet (once per chest). */
  private chestNotice = false;
  /** v0.5: the bubble that offers today's trip (a check-in, so it has no kind): closing it is a "Stay". */
  private tripOfferId: number | null = null;
  /** v0.6: the friends' cards and today's visits (the `friends` storage key). */
  private friendsDoc: fr.FriendsDoc = { friends: [], visits: { day: "", count: 0, lastAt: null }, oldKeys: [] };
  /** v0.6: this install's public key (from the backend; the secret half never leaves Rust), null until it could be read. */
  private myKey: string | null = null;
  /** False after a failed read at startup: never overwrite what's on disk. */
  private persistFriends = true;
  /** v0.6: no visit before this (epoch ms): a session and a day start quietly. */
  private visitAfter = 0;
  /** v0.6: the words for a won boss that haven't been said yet (a reply, so never counted), and the ISO week they are about: once it is over they are not news any more. Kept in memory only. */
  private bossNotice: { text: string; week: string } | null = null;
  /** v0.6: a beaten blob whose last finished task is still being closed in Todoist. It is paid (for that week, even if the week turns meanwhile) when the closing is done. */
  private pendingWin: { week: string; day: string; together: boolean } | null = null;
  /** v0.6: when the current time away began (epoch ms), or null while you are here. */
  private awayFrom: number | null = null;
  /** v0.6: a friend's card pasted into the Friends sheet but not added yet, so that going back to the board doesn't lose it. */
  friendDraft = "";
  /** v0.6: the board is open (a visitor makes way for it, and none comes). */
  private boardIsOpen = false;
  /** v0.7: when the automatic checks last ran (see `updates.checkDue`), the check in flight, and the status last taken (to tell other windows when it changed). */
  private updateLog: updates.CheckLog = { startedAt: 0, last: null };
  private checking: Promise<UpdateStatus | null> | null = null;
  private lastUpdateStatus: UpdateStatus | null = null;
  /** v0.7: the first start of a newer version, still to be told at a calm moment (the highlights are the notes saved before the install). */
  private cheer: { version: string; notes: string | null } | null = null;
  /** v0.7: the install's bubble. Once you close it, the progress stays off the pet (the board's chip still shows it). */
  private progressBubble: number | null = null;

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
      screenOff: false,
      batterySaver: false,
      life: lifeState,
      prefs,
      nudgesLeft: budgetLeft({ prefs, life: lifeState }),
      nudgeHoldUntil: lifeState.nudgeHoldUntil,
      triggers: [],
      pinned: false,
      todayPlan: null,
      doneUntil: null,
      wrapDraft: null,
      craft: null,
      chests: { held: 0, today: 0, next: 0 },
      trip: null,
      season: activeSeason(new Date(this.now())),
      reveal: null,
      friends: [],
      buddyStreaks: {},
      boss: fr.bossOf({ today: this.dayKey, myDone: 0, friends: [] }),
      visitor: null,
      myKey: null,
      version: null,
      update: null,
      installing: null,
    };
    Object.assign(this.state, this.gameView());
  }

  /** Loads prefs, the pet's life and the postponed-task log, then picks the language. */
  static async create(backend: Backend, opts: BrainOptions = {}): Promise<Brain> {
    const now = (opts.now ?? Date.now)();
    const [p, l, st, tr, pl, fd, key, locale] = await Promise.all([
      loadRetrying<unknown>(backend, "prefs"),
      loadRetrying<unknown>(backend, "life"),
      loadRetrying<SeenLog>(backend, "stuck"),
      loadRetrying<unknown>(backend, "triggers"),
      loadRetrying<unknown>(backend, "plan"),
      loadRetrying<unknown>(backend, "friends"),
      // The public key of this install (made on first use); a PC whose Credential Manager says no still has a pet.
      backend.cards.publicKey().catch(() => null),
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
    const storedTriggers = triggersFromJson(tr.ok ? tr.value : null, now);
    brain.state.triggers = pruneTriggers(storedTriggers, dayKey(new Date(now)));
    // Yesterday's plans don't stay on disk either.
    if (tr.ok && brain.state.triggers.length < storedTriggers.length) await backend.storage.save("triggers", triggersToJson(brain.state.triggers)).catch(() => undefined);
    brain.persistPlan = pl.ok;
    brain.plan = planFromJson(pl.ok ? pl.value : null, now);
    brain.state.todayPlan = planFor(brain.plan, dayKey(new Date(now)));
    brain.state.doneUntil = isDoneForToday(brain.plan, now) ? brain.plan.doneUntil : null;
    // v0.6: this install's public key, and the friends (a failed read is not a missing file, so it is kept in memory only).
    brain.myKey = fr.isPublicKey(key) ? key : null;
    brain.state.myKey = brain.myKey;
    brain.friendsDoc = fr.docFromJson(fd.ok ? fd.value : null, brain.myKey, now);
    brain.persistFriends = fd.ok;
    brain.visitAfter = now + fr.visitDelayMs(brain.myKey ?? "", dayKey(new Date(now)));
    Object.assign(brain.state, brain.friendsView(now));
    if (!p.ok || !l.ok || !tr.ok || !fd.ok) {
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
    if (patch.life || "focus" in patch) Object.assign(this.state, this.gameView());
    // A visitor goes when the moment stops being calm (hidden, muted, focusing, a meeting, a trip…).
    if (this.state.visitor && !("visitor" in patch)) this.checkVisit();
    // What a bubble is about may have changed with this (the focus session stopped, the task is gone): drop it unseen.
    const waiting = this.state.bubble;
    if (waiting && patch.bubble === undefined && waiting.stillValid && !waiting.stillValid()) {
      this.dismissBubble(waiting.id, "stale");
      return;
    }
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

  /** Writes the life now; resolves with whether the write worked (callers that don't care ignore it). */
  private flushLife(): Promise<boolean> {
    if (this.lifeSaveTimer) clearTimeout(this.lifeSaveTimer);
    this.lifeSaveTimer = null;
    const saved = this.backend.storage.save("life", this.state.life).then(
      () => true,
      () => false,
    );
    if (this.lifeSaveBroadcast) this.backend.bus.emit({ type: "life-changed" }).catch(() => undefined);
    this.lifeSaveBroadcast = false;
    return saved;
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
        if (e.type === "update-changed") void this.reloadUpdates();
        if (e.type === "update-install") void this.startUpdate();
      }),
    );
    // v0.7: which version is running and whether one is on offer (the backend's cached answer: no network), before the tray is labelled.
    this.updateLog.startedAt = this.now();
    await this.reloadUpdates();
    this.noteVersion();
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
    this.reflowWrapUp();
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
        updates: updates.trayLabel(this.state.update?.version ?? null),
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
      case "update":
        void this.updateCommand();
        break;
    }
  }

  onSample(s: SystemSample): void {
    const now = this.now();
    const prev = this.sample;
    this.sample = s;
    this.noteAway(now, s.idleSeconds);
    const screenOff = !!s.locked || !!s.displayOff;
    const batterySaver = !!s.batterySaver;
    if (prev.fullscreen !== s.fullscreen || screenOff !== this.state.screenOff || batterySaver !== this.state.batterySaver) {
      // Gone out of sight (a full-screen app the pet hides for, or nobody at the screen): a stunt is called off with its
      // bubble, as hiding the pet does, since the frame loop that would finish it sleeps until the pet is seen again.
      // Any other bubble stays (an urgent one still shows over a full-screen app).
      const hideFull = this.state.prefs.hideInFullscreen;
      const wasSeen = !(prev.fullscreen && hideFull) && !this.state.screenOff;
      const seen = !(s.fullscreen && hideFull) && !screenOff;
      const stuntBubble = this.state.bubble !== null && this.state.bubble.id === this.anticBubbleId;
      const callOff = wasSeen && !seen ? { antic: null, ...(stuntBubble ? { bubble: null } : {}) } : {};
      this.set({ fullscreen: s.fullscreen, screenOff, batterySaver, ...callOff });
    }
    // First, while the work app from before is still the last one known.
    this.noteMeetings(now, s);
    // An address that can't be read for a second says nothing about where you are; one that stays unreadable is believed.
    this.unreadableRun = isBrowser(s.app) && s.url === null ? this.unreadableRun + 1 : 0;
    const unreadable = this.unreadableRun > 0 && this.unreadableRun < UNREADABLE_AFTER;
    const label = this.currentDistractionLabel();
    const was = this.distractionSince;
    if (label !== null) {
      // Onto a distraction from work: remember the work.
      this.calmSamples = 0;
      if (label !== was?.label) {
        if (!was) this.takeSnapshot(now);
        this.distractionSince = { label, since: now };
      }
    } else if (unreadable) {
      this.noteRecentApp(s.app);
    } else if (was) {
      // Off one for 2 samples in a row, after 2+ minutes on it: offer the work back.
      this.calmSamples += 1;
      if (this.calmSamples >= 2) {
        this.calmSamples = 0;
        if (shouldOfferResume({ leftDistractionMinutes: (now - was.since) / MIN })) this.pendingResume = { reason: "distraction", at: now };
        this.distractionSince = null;
        this.noteWorkApp(s);
      }
    } else {
      this.calmSamples = 0;
      this.noteWorkApp(s);
    }
    const calmMotion = this.computeCalmMotion();
    if (calmMotion !== this.state.calmMotion) this.set({ calmMotion });
  }

  /** Remembers an app that was in front (its name and exe only): the choices of "Start when I open…". */
  private noteRecentApp(app: ForegroundApp | null): void {
    if (!app || isNotWorkApp(app)) return;
    this.recentApps = [{ name: app.name, exe: app.exe, title: "" }, ...this.recentApps.filter((a) => a.name.toLowerCase() !== app.name.toLowerCase())].slice(0, MAX_RECENT_APPS);
  }

  /** Remembers the work app in front (for the place to come back to) and the apps used lately. A call is never the place. */
  private noteWorkApp(s: SystemSample): void {
    const app = s.app;
    if (!app || isNotWorkApp(app)) return;
    this.noteRecentApp(app);
    if (!isConferencing(app, s.url)) this.lastWork = s;
  }

  private readonly isDistractingNow = (app: ForegroundApp | null, url: string | null): boolean => {
    const p = this.state.prefs;
    return currentDistraction(app, url, siteRules(p.distractionSites), appRules(p.distractionApps), p.watchBrowsers) !== null;
  };

  /**
   * The task to remember: the one being focused on, else the one last worked on from the board, else the next one
   * (`isNext`: then the card says "Next up", not "You were on").
   */
  private contextTask(): { task: TodoTask | null; isNext: boolean } {
    const open = openTasks(this.state.day);
    const f = this.state.focus;
    const focused = f && !f.isBreak && f.task ? open.find((t) => t.id === f.task?.id) : undefined;
    const acted = this.lastActedId ? open.find((t) => t.id === this.lastActedId) : undefined;
    const task = focused ?? acted;
    return task ? { task, isNext: false } : { task: this.state.next, isNext: true };
  }

  /** The place as it stands now: the last work app (never a call, the pet or a distraction), and the task. */
  private currentPlace(nowMs: number): WorkContext | null {
    const { task, isNext } = this.contextTask();
    return snapshot(this.lastWork, task, this.isDistractingNow, nowMs, { taskIsNext: isNext, details: this.state.prefs.resumeDetails });
  }

  private setPinned(pinned: boolean): void {
    this.pinned = pinned;
    this.patchState({ pinned });
  }

  /** Remembers where you are (you went idle, a meeting started, you moved onto a distraction). A recent pin stays. */
  private takeSnapshot(nowMs: number): void {
    if (this.pinned && this.workContext && nowMs - this.workContext.at < PIN_KEEPS) return;
    const ctx = this.currentPlace(nowMs);
    if (!ctx) return;
    this.workContext = ctx;
    this.setPinned(false);
  }

  /** **📌 Pin my place**: remembers the place now, with an optional one-line next step the resume card shows. */
  pinPlace(note: string | null = null): boolean {
    const nowMs = this.now();
    const base = this.currentPlace(nowMs);
    const empty: WorkContext = { taskId: null, taskTitle: null, taskIsNext: false, app: null, windowTitle: null, url: null, note: null, at: nowMs };
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
    for (const t of [...act, ...(fetchedDone ?? [])]) this.titles.set(t.id, taskTitle(t));
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
    // Read in full: only then does a meeting missing from it mean that it moved.
    let complete = false;
    if (!this.state.prefs.useCalendar || this.calendarHosts.length === 0) {
      this.icsTexts = [];
    } else {
      const results = await this.backend.calendar.fetchIcs();
      this.icsTexts = results.filter((r) => r.ok && r.text).map((r) => r.text as string);
      complete = results.length > 0 && results.every((r) => r.ok && r.text);
      for (const r of results) {
        if (!r.ok) this.diary.add("sync", L(`Không tải được lịch ${r.host}: `, `Couldn't load the calendar at ${r.host}: `) + (r.error ?? ""), { throttle: `ics-${r.host}`, every: 60 });
      }
    }
    this.recomputeEvents();
    if (complete) this.dropGonePlans();
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
    this.meetingTracks.clear();
    this.setPinned(false);
    const kept = pruneTriggers(this.state.triggers, this.dayKey);
    if (kept.length !== this.state.triggers.length) this.setTriggers(kept);
    this.draft = null;
    this.wrapAttempt = null;
    this.patchState({ wrapDraft: null });
    // Yesterday's frog and note have done their day.
    const plan = prunePlans(this.plan, this.dayKey);
    if (plan !== this.plan) this.setPlanDoc(plan);
    // A new day starts quietly for the friends too.
    this.visitAfter = this.now() + fr.visitDelayMs(this.myKey ?? "", this.dayKey);
  }

  // ---------- Mood ----------

  private context(now: number): Context {
    const d = new Date(now);
    const h = d.getHours() + d.getMinutes() / 60;
    const p = this.state.prefs;
    // The demo is always a working day (unless you take it off), so every behavior can be tried at any hour.
    const demo = this.state.isDemo;
    const workday = this.workdayOn(d);
    return {
      workday,
      inWork: workday && (demo || (h >= p.workStart && h < p.workEnd)),
      night: !demo && (h >= 23 || h < 6),
      hoursAfterPlanDeadline: h - p.planDeadline,
      reviewTime: atHour(p.workEnd, 0, d).getTime() - 30 * MIN,
      midday: (atHour(p.workStart, 0, d).getTime() + atHour(p.workEnd, 0, d).getTime()) / 2,
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
    const todayPlan = planFor(this.plan, dayKey(now));
    const day = buildDay(this.active, this.completed, now, todayPlan?.frogId ?? null);
    const doneForToday = isDoneForToday(this.plan, nowMs);
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
    this.patchState({ day, target, suggestions, stuck, next: nextTask(day), todayPlan, doneUntil: doneForToday ? this.plan.doneUntil : null });
    this.reconcileWrapDraft();
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
    i.doneForToday = doneForToday;
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
    this.patchState(this.friendsView(nowMs));
    this.settleBoss(nowMs);
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
        return d ? this.workdayOn(d) : false;
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
      this.diary.add("life", text, r.sticker ? { tag: "sticker", day: r.day } : {});
      // The note is rebuilt while it waits, so it picks each of its lines once and keeps them.
      const say = stickyPhrase((p) => this.pickLine(p));
      const note = this.dayCloseNote(r, after, nowMs, say);
      // A later close with nothing to say (a Saturday) doesn't wipe the words still waiting; stale ones are dropped when told.
      if (note) this.dayNote = { day: today, text: note, rebuild: (n) => this.dayCloseNote(r, after, n, say) };
    }
    if (r.unlocked.length > 0) this.say({ text: lines.unlocked(r.unlocked), seconds: 12, urgent: true });
  }

  /**
   * The morning-after explanation of a frozen, excused or broken (repairable) day, a quest that ran out, a filled
   * sticker page and a growth stage the day's XP reached.
   */
  private dayCloseNote(r: life.DayClose, s: life.LifeState, nowMs: number, say: Phrase): string | null {
    const when = daysAgo(r.day, new Date(nowMs));
    const parts: string[] = [];
    if (r.outcome === "frozen") parts.push(lines.dayFrozen(when, s.streak, s.snacks));
    if (r.outcome === "excused") parts.push(lines.dayExcused(when, s.streak));
    // Only a quest that is really there afterwards gets promised.
    if (r.outcome === "broken" && r.repairOffered && s.repair) parts.push(lines.dayBroken(when, r.lost, life.REPAIR_TASKS, life.activeRepair(s) !== null));
    if (r.repairExpired) parts.push(lines.repairExpired(s.streak));
    if (r.pageDone) parts.push(lines.pageDone(s.stickerPage - 1, r.snackEarned));
    if (r.levelUp !== null) parts.push(lines.levelUp(r.levelUp, say));
    return parts.length > 0 ? parts.join("\n") : null;
  }

  /**
   * The kind words waiting for today (SPEC v0.3 §1), or null. Only the day they were written for: words that "done
   * for today" held back count as today's, the rest of the stale ones are dropped.
   */
  private waitingNotes(nowMs: number): string | null {
    const now = new Date(nowMs);
    const today = dayKey(now);
    // While "done for today" holds them back they wait for the first greeting after it, so they count as today's.
    const sleeping = isDoneForToday(this.plan, nowMs);
    if (this.dayNote && this.dayNote.day !== today) this.dayNote = sleeping ? { ...this.dayNote, day: today } : null;
    if (this.repairNote && this.repairNote.day !== today) this.repairNote = sleeping ? { ...this.repairNote, day: today } : null;
    const text = [this.dayNote ? (this.dayNote.rebuild?.(nowMs) ?? this.dayNote.text) : undefined, this.repairNote?.text].filter(Boolean).join("\n");
    return text || null;
  }

  private clearNotes(): void {
    this.dayNote = null;
    this.repairNote = null;
  }

  /**
   * Is today's first greeting still to come? Then the waiting kind words go into it, one bubble with the greeting
   * first, instead of taking its place (a bubble of their own would hold the greeting back for the gap between
   * bubbles, and on a day when nothing got done that is the day the frog and the note matter most).
   */
  private greetingComes(nowMs: number): boolean {
    return this.state.hasToken && this.context(nowMs).inWork && this.firedAt(`morning-${this.dayKey}`) === undefined && !isDoneForToday(this.plan, nowMs);
  }

  /**
   * Says the waiting kind words once you're here: a reply, not a reminder (no `why`), so it isn't counted. Only on
   * the day they were written for, and not in the middle of the night: from an hour before work starts (the demo
   * works around the clock). When the day's greeting is still to come they wait for it and ride along in it
   * (`now`: the demo's button wants them at once).
   */
  private tellNotes(nowMs: number, now = false): void {
    const date = new Date(nowMs);
    const text = this.waitingNotes(nowMs);
    // "Done for today" keeps even these until the next workday starts.
    if (!text || this.state.bubble || this.outOfTheWay || this.sample.idleSeconds > 300 || isDoneForToday(this.plan, nowMs)) return;
    if (!this.state.isDemo && nowMs < atHour(this.state.prefs.workStart - 1, 0, date).getTime()) return;
    if (this.state.quietUntil !== null && nowMs < this.state.quietUntil) return;
    if (!now && this.greetingComes(nowMs)) return;
    this.clearNotes();
    this.say({ text, seconds: 12 });
  }

  /**
   * A chest was earned: one small, silent line once you're around and nothing else is showing. A reply (never
   * counted), once per chest. During focus it waits for the end-of-session bubble instead.
   */
  private tellChest(nowMs: number): void {
    if (!this.chestNotice) return;
    if (this.state.life.chests <= 0) {
      this.chestNotice = false;
      return;
    }
    const f = this.state.focus;
    if (this.state.bubble || this.outOfTheWay || this.state.flow || (f && !f.isBreak) || this.sample.idleSeconds > 300) return;
    // "Done for today": the chest is kept (it still accrues silently); the note waits for the next workday.
    if (isDoneForToday(this.plan, nowMs)) return;
    if (this.state.quietUntil !== null && nowMs < this.state.quietUntil) return;
    if (!calm.atBreakpoint(this.sample.secondsSinceKey, this.secondsSinceAppSwitch())) return;
    this.chestNotice = false;
    this.say({ text: chests.chestEarnedText(), seconds: 6, stillValid: () => this.state.life.chests > 0 }, { silent: true });
  }

  // ---------- Talking ----------

  /**
   * Which option of a pack to say (SPEC v0.8 §1): one not said in the last two days while one is left, never the same
   * twice in a row. The pick is kept in `life.said`, by index and time only (lines carry task titles).
   */
  private pickLine(pack: Pack): number {
    const n = pack.options.length;
    if (n <= 1) return 0;
    const now = this.now();
    const entry = this.state.life.said[pack.key];
    const i = chooseLine(n, entry, now, this.random);
    this.mutateLife((s) => {
      s.said = withEntry(s.said, pack.key, remember(entry, n, i, now));
    }, "routine");
    return i;
  }

  /** Turns a pack of lines into what the pet says, picked by `pickLine`. */
  private readonly phrase: Phrase = (pack) => {
    if (pack.options.length === 0) return "";
    const [vi, en] = pack.options[this.pickLine(pack)];
    return L(vi, en);
  };
  /**
   * Shows a bubble (unless one waiting for an answer, or an urgent one, is in the way). `why` marks it as an
   * unsolicited reminder and records the reason in the diary; without it the bubble is a reply to something you did.
   * `kind` makes the reminder count against today's budget. `say` doesn't check the budget or the hold itself: the
   * rules do (`remindEvery`, `remindOnce`, `mayRemind`) before a reminder's timer is set, so a held reminder keeps
   * its turn and comes as soon as the hold ends. Returns whether the bubble showed.
   */
  say(b: { text: string; detail?: string; actions?: BubbleAction[]; seconds: number; urgent?: boolean; inBoard?: boolean; validUntil?: number; stillValid?: () => boolean; progress?: Bubble["progress"] }, opts: SayOptions = {}): boolean {
    // v0.5: while the pet is away on a trip, only urgent bubbles and replies show.
    if (this.state.life.trip && opts.why !== undefined && !b.urgent) return false;
    // A bubble that went stale never blocks the next one.
    this.pruneBubble();
    const cur = this.state.bubble;
    const actions = b.actions ?? [];
    if (cur && cur.actions.length > 0 && !b.urgent && actions.length === 0) return false;
    if (cur && cur.urgent && !b.urgent) return false;
    const bubble: Bubble = { id: ++this.bubbleSeq, text: b.text, actions, seconds: b.seconds, urgent: b.urgent ?? false, reminder: opts.why !== undefined };
    if (b.detail) bubble.detail = b.detail;
    if (b.inBoard) bubble.inBoard = true;
    if (b.validUntil !== undefined) bubble.validUntil = b.validUntil;
    if (b.stillValid) bubble.stillValid = b.stillValid;
    if (b.progress) bubble.progress = b.progress;
    if (opts.kind) bubble.kind = opts.kind;
    if (opts.card) bubble.card = opts.card;
    if (opts.antic) this.anticBubbleId = bubble.id;
    this.lastBubbleAt = this.now();
    this.set({ bubble });
    if (opts.kind) {
      this.mutateLife((s) => {
        s.dayNudges += 1;
      });
    }
    if (!opts.silent) this.play(opts.chime ?? "chatter");
    const quote = `“${shortText((opts.diaryText ?? b.text).replace(/\n/g, " "), 90)}”`;
    const left = opts.kind ? L(` (còn ${this.state.nudgesLeft} lượt nhắc hôm nay)`, ` (${this.state.nudgesLeft} left today)`) : "";
    if (opts.why !== undefined) this.diary.add(opts.antic ? "antic" : "bubble", `${quote} — ${L("vì ", "because ")}${opts.why}${left}`);
    else this.diary.add("system", L("Pet nói ", "Pet said ") + quote);
    return true;
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
  dismissBubble(bubbleId: number, how: "closed" | "ignored" | "expired" | "stale" | "seen"): void {
    const b = this.state.bubble;
    if (!b || b.id !== bubbleId) return;
    const kind = b.kind;
    const card = b.card;
    const refused = (kind !== undefined || card !== undefined) && (how === "closed" || (how === "ignored" && b.actions.length > 0));
    // Gone first: the changes below go through `set`, which would otherwise find this bubble still waiting (and stale)
    // and dismiss it again, once per change.
    this.set({ bubble: null });
    // v0.5: closing the trip offer is a "Stay" too.
    if (b.id === this.tripOfferId && how === "closed") this.mutateLife((s) => trips.declineTrip(s, this.now()));
    // An offer that went stale unseen (a focus session started first) may come again once the day allows it.
    if (b.id === this.tripOfferId && how === "stale") this.markFired(`trip-${this.dayKey}`, null);
    let backoff = "";
    if (refused) {
      const m = kind && isEveryKind(kind) ? Math.min(life.MAX_BACKOFF, (this.state.life.dayBackoff[kind] ?? 1) * 2) : null;
      this.mutateLife((s) => {
        if (m && kind) s.dayBackoff[kind] = m;
        s.dismissedInRow += 1;
      });
      if (card) this.noteRefusal(card);
      if (m && kind) backoff = L(` → nhắc “${kindName(kind)}” thưa hơn (×${m})`, ` → “${kindName(kind)}” reminders back off (×${m})`);
    }
    if (b.reminder || b.actions.length > 0) {
      const what =
        how === "closed"
          ? L("Bạn đóng bong bóng", "You closed the bubble")
          : how === "ignored"
            ? L("Bạn không phản hồi (tự ẩn)", "No response (faded away)")
            : how === "stale"
              ? L("Bong bóng đã cũ (việc nó nói tới đã đổi) nên mình bỏ đi, không tính là bạn từ chối", "The bubble was out of date (what it was about had changed), so it was dropped: not a refusal")
              : how === "seen"
                ? L("Bạn đã thấy bong bóng trong bảng việc nên mình không hiện lại, không tính là bạn từ chối", "You saw the bubble in the board, so it isn't shown again: not a refusal")
                : L("Bong bóng hết hạn mà chưa hiện ra (pet đang ẩn)", "The bubble expired without showing (the pet was out of the way)");
        this.diary.add("response", what + backoff, { tag: how });
    }
    // Dropped unseen because what it said stopped being true: that costs nothing, so the reminder it counted is given back.
    if (how === "stale" && kind !== undefined) {
      this.mutateLife((s) => {
        s.dayNudges = Math.max(0, s.dayNudges - 1);
      });
    }
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

  /** The board shows a check-in as a banner (a bubble with `inBoard`): the user has it in front of them. */
  bannerRead(id: number): void {
    const b = this.state.bubble;
    if (b && b.id === id && b.inBoard && !b.urgent) this.readInBoard = id;
  }

  /**
   * The board closed. A check-in that was read there as a banner is not shown again over the pet: no refusal, no
   * reminder skipped, it costs nothing. Urgent news stays (the meeting is still about to start).
   */
  boardClosed(): void {
    this.boardIsOpen = false;
    const id = this.readInBoard;
    this.readInBoard = null;
    this.lightening = false;
    if (id !== null) this.dismissBubble(id, "seen");
  }

  /**
   * The lighten view is open (or closed): that is what "Move some?" asks for, so its bubble goes, and it isn't said
   * while the view is open. The board closing ends it.
   */
  setLightening(on: boolean): void {
    this.lightening = on;
    const id = this.overbookedBubble;
    if (on && id !== null && this.state.bubble?.id === id) this.dismissBubble(id, "seen");
    this.overbookedBubble = null;
  }

  /** Is the bubble out of date: its time is up, or what it is about has changed? */
  bubbleStale(b: Bubble, nowMs = this.now()): boolean {
    if (b.validUntil !== undefined && nowMs >= b.validUntil) return true;
    return b.stillValid !== undefined && !b.stillValid();
  }

  /** Drops the waiting bubble if it is out of date (the board never showed it): neither a refusal nor a reminder skipped. */
  pruneBubble(nowMs = this.now()): boolean {
    const b = this.state.bubble;
    if (!b || !this.bubbleStale(b, nowMs)) return false;
    this.dismissBubble(b.id, "stale");
    return true;
  }

  /** `stillValid` for a bubble about this task: false once it is finished or gone. */
  private whileOpen(t: TodoTask): () => boolean {
    return () => openTasks(this.state.day).some((x) => x.id === t.id);
  }

  private play(c: Chime): void {
    const mode = this.state.prefs.soundMode;
    if (mode === "off") return;
    if (mode === "important" && (c === "chatter" || c === "grumble")) return;
    this.effects.chime?.(c);
  }

  private get outOfTheWay(): boolean {
    const s = this.state;
    return s.hiddenUntil !== null || (s.fullscreen && s.prefs.hideInFullscreen) || s.life.trip !== null;
  }

  /**
   * Says a line aloud, in the language it is written in (the UI's, which follows the system when none is chosen). The
   * line is chosen only when it will be heard, so a line nobody heard is not remembered as said.
   */
  private speak(line: (say: Phrase) => string): void {
    const speak = this.effects.speak;
    if (speak && this.state.prefs.voiceOn && !this.outOfTheWay) speak(line(this.phrase), getLang());
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
   * Are reminders held (after three dismissed in a row)? The check-ins that aren't counted (the resume card, the
   * question after a meeting) wait too; a plan you made yourself does not. `what` names the held thing in the diary.
   */
  private onHold(what: string): boolean {
    const until = this.state.life.nudgeHoldUntil;
    if (until === null || this.now() >= until) return false;
    const time = timeString(new Date(until));
    this.diary.add(
      "hold",
      L(`Giữ ${what} tới ${time}: bạn vừa bỏ qua ${HOLD_AFTER} lời nhắc liên tiếp`, `Held ${what} until ${time}: you passed on ${HOLD_AFTER} reminders in a row`),
      { throttle: `hold-card-${what}`, every: 15 },
    );
    return true;
  }

  /** Today's gate for the n-th refusal of a card kind (kept in the pet's life with the other gates of the day). */
  private refusalKey = (card: CardKind, n: number) => `refused-${card}-${n}-${this.dayKey}`;

  private noteRefusal(card: CardKind): void {
    for (let n = 1; n <= MAX_REFUSALS; n++) {
      if (this.firedAt(this.refusalKey(card, n)) === undefined) {
        this.markFired(this.refusalKey(card, n), this.now());
        return;
      }
    }
  }

  private refusedEnough(card: CardKind): boolean {
    return this.firedAt(this.refusalKey(card, MAX_REFUSALS)) !== undefined;
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
    this.pruneBubble(nowMs);
    const b = this.state.bubble;
    if (b && nowMs - this.bubbleAt > (b.seconds + 60) * 1000) this.dismissBubble(b.id, "expired");
    void this.refreshCalendar();
    // Hunger grows during work hours (not during meetings or while you're away).
    const ctx = this.context(nowMs);
    // Not once you have said you are done for today: the pet sleeps, so neither its hunger nor your detours are counted.
    const sleeping = isDoneForToday(this.plan, nowMs);
    const working = this.state.hasToken && ctx.inWork && !sleeping && currentEvent(this.state.events, now) === null && this.sample.idleSeconds < 300;
    this.mutateLife((s) => life.decay(s, nowMs, working), "routine");
    const d = this.currentDistraction();
    if (this.state.hasToken && ctx.inWork && !sleeping && d) this.mutateLife((s) => life.addDistraction(s, d.app, 15), "routine");
    this.gameTick(nowMs, ctx.inWork, d !== null);
    // Left the distracting app or site: the pet gets out of the way.
    if (this.state.antic?.kind.type === "block" && !d) this.set({ antic: null });
    this.trackDistraction(nowMs);
    this.updateFlow(now);
    this.recompute();
    // v0.7: the automatic check (the notice below waits for a calm moment, this does not).
    // (Not while an update installs: the answer would only change what the install is about.)
    if (!this.checking && !this.state.installing && updates.checkDue(this.state.prefs.autoUpdateCheck, this.updateLog, nowMs)) void this.checkForUpdate(false);
    // A day that ended is still being settled: its kind words, and today's greeting with the streak, wait for it.
    if (this.settling) return;
    this.tellNotes(nowMs);
    this.tellChest(nowMs);
    this.tellBoss(nowMs);
    this.runRules(nowMs);
    this.tellUpdated(nowMs);
    this.tellUpdate(nowMs);
    this.tickVisits(nowMs);
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
    this.pruneBubble(nowMs);
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

    // Back from being away: settled here, before any early return below (a meeting, a focus session), so the time
    // away is told when it ends and a card for it is never stale.
    const cameBack = this.backFromAway(nowMs);

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
        // The tasks that go with it can be opened from here: the board scrolls to the task and gives it the focus.
        const related = relatedTasks(upcoming.title, ranked(openTasks(s.day), s.day.frogId), 2);
        // One button has the room for most of a title; with more buttons beside it each gets less.
        const room = related.length === 1 && !upcoming.joinUrl ? 26 : 16;
        related.forEach((t, i) =>
          actions.push({
            title: L(`Mở “${shortText(taskTitle(t), room)}”`, `Open “${shortText(taskTitle(t), room)}”`),
            primary: i === 0 && !upcoming.joinUrl,
            run: () => this.effects.openBoard?.(false, undefined, { focusTaskId: t.id }),
          }),
        );
        actions.push({ title: "OK", run: () => undefined });
        this.say(
          {
            text: lines.meetingSoon(upcoming, Math.max(1, Math.ceil(mins)), related),
            actions,
            seconds: 90,
            urgent: true,
            // "In 4 min" is only true until it starts.
            validUntil: upcoming.start.getTime(),
          },
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
    // "Done for today": only the urgent bubbles (meetings above, timed tasks below) get through until work starts.
    const done = isDoneForToday(this.plan, nowMs);

    // With a place to come back to, the resume card (a check-in) takes the welcome's place.
    // Not while the pet is out of the way (nobody would see it), nor on a stale list of tasks.
    if (cameBack !== null && cameBack.resume === null && !done && cameBack.minutes > 15 && ctx.inWork && next && !this.outOfTheWay && this.snapshotFresh && this.mayRemind("welcome")) {
      this.say(
        { text: lines.welcomeBack(next, this.phrase), actions: [this.focusAction(next), this.laterAction()], seconds: 30, stillValid: this.whileOpen(next) },
        { why: L(`bạn vừa quay lại sau ${cameBack.minutes} phút`, `you just came back after ${cameBack.minutes} minutes`), kind: "welcome" },
      );
      return;
    }

    // 1. Tasks with an exact time: 10 minutes before, and when due.
    for (const t of open) {
      const time = dueTime(t);
      if (!time) continue;
      const mins = (time.getTime() - nowMs) / MIN;
      if (mins > 0 && mins <= 10 && this.once(`soon-${t.id}`)) {
        this.say(
          // True until it is due (then "It's time" takes over), and while the task is still open.
          { text: lines.soon(t, Math.ceil(mins), this.phrase), actions: [this.focusAction(t), this.completeAction(t)], seconds: 40, urgent: true, validUntil: time.getTime(), stillValid: this.whileOpen(t) },
          { chime: "important", why: L(`việc hẹn lúc ${timeString(time)}`, `task due at ${timeString(time)}`) },
        );
        return;
      }
      if (mins <= 0 && mins > -5 && this.once(`now-${t.id}`)) {
        this.say(
          { text: lines.dueNow(t, this.phrase), actions: [this.focusAction(t), this.completeAction(t)], seconds: 60, urgent: true, validUntil: time.getTime() + 5 * MIN, stillValid: this.whileOpen(t) },
          { chime: "important", why: L(`tới giờ hẹn ${timeString(time)}`, `due now (${timeString(time)})`) },
        );
        return;
      }
    }
    // Done for today: nothing below is urgent.
    if (done) return;
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
        { text: lines.block(d.app, next, this.phrase), actions: [this.focusAction(next), this.spareAction()], seconds: 25, urgent: true },
        {
          chime: "grumble",
          antic: true,
          kind: "antic",
          why: L(`đang cáu và ở ${d.app} ${Math.trunc(d.minutes)} phút → nhảy lên chắn màn hình`, `grumpy and on ${d.app} for ${Math.trunc(d.minutes)} min → jumped in the way`),
        },
      );
      this.speak((say) => lines.voiceBlock(d.app, say));
      return;
    }
    if (stunts && d.minutes >= 5 && next && this.sample.secondsSinceKey > 60 && this.remindEvery("antic", 20)) {
      this.startAntic({ type: "parade", title: taskTitle(next) }, nowMs);
      this.say(
        { text: lines.parade(next, this.phrase), actions: [this.focusAction(next), this.spareAction()], seconds: 25, urgent: true },
        {
          chime: "grumble",
          antic: true,
          kind: "antic",
          why: L(`đang cáu và ở ${d.app} ${Math.trunc(d.minutes)} phút, không gõ phím → diễu hành với biển`, `grumpy and on ${d.app} for ${Math.trunc(d.minutes)} min, not typing → sign parade`) + this.reasonSuffix(),
        },
      );
      this.speak((say) => lines.voiceAngry(next, say));
      return;
    }
    if (ctx.inWork && open.length > 0 && d && d.minutes >= 2 && this.remindEvery("distract", 10)) {
      this.say(
        {
          text: lines.distraction(s.mood, d.app, open.length, next, this.phrase),
          actions: [
            this.focusAction(next),
            s.antic
              ? this.spareAction()
              : { title: L("Nghỉ xíu thôi (10')", "Just a quick break (10')"), neutral: true, run: () => (this.distractionSnoozedUntil = this.now() + 10 * MIN) },
          ],
          seconds: 30,
          ...(next ? { stillValid: this.whileOpen(next) } : {}),
        },
        { why: L(`ở ${d.app} ${Math.trunc(d.minutes)} phút trong giờ làm`, `on ${d.app} for ${Math.trunc(d.minutes)} min during work hours`), kind: "distract" },
      );
      return;
    }

    if (ctx.night && now.getHours() >= 23 && this.remindOnce("night", `night-${this.dayKey}`)) {
      this.say({ text: lines.lateNight(this.phrase), seconds: 10 }, { why: L("đã quá 23 giờ mà bạn vẫn dùng máy", "past 11pm and you're still at it"), kind: "night" });
      return;
    }

    // 2. Everything finished: a reply to your last task, so it doesn't count against the budget.
    if (day.completed.length > 0 && day.today.length === 0 && day.overdue.length === 0 && this.once(`alldone-${this.dayKey}`)) {
      this.celebrateUntil = nowMs + 4000;
      this.recompute();
      this.say(
        { text: lines.allDone(this.phrase), actions: [{ title: L("＋ Việc cho mai", "＋ Plan tomorrow"), run: () => this.effects.openBoard?.(true) }], seconds: 20 },
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
      // The frog and the note you left yourself the evening before; a frog that is done or gone isn't mentioned.
      const left = planFor(this.plan, dayKey(now));
      const frog = left?.frogId ? (open.find((t) => t.id === left.frogId) ?? null) : null;
      const kept = left && (frog || left.note) ? { frog, note: left.note } : null;
      let text = lines.morning(now, planned(day), open.length, next, target, kept, this.phrase);
      if (s.events.length > 0) {
        const start = atHour(s.prefs.workStart, 0, now);
        const end = atHour(s.prefs.workEnd, 0, now);
        const free = freeMinutes(s.events, start, end);
        text += `\n${lines.calendarDay(s.events.length, (end.getTime() - start.getTime()) / MIN - free, free, target, target < s.prefs.dailyTarget)}`;
      }
      // The kind words about the day before ride along, after the greeting: one bubble, so neither waits for the other.
      const words = this.waitingNotes(nowMs);
      if (words) {
        text += `\n${words}`;
        this.clearNotes();
      }
      if (s.life.dirt > 0) text += `\n${lines.dirty(s.life.dirt, this.phrase)}`;
      // The kind words already say where the streak stands.
      if (s.life.streak > 0 && !words) text += `\n${lines.streak(s.life.streak, this.phrase)}`;
      const fresh = this.mutateLife((l) => chapters.takeFreshStart(l, this.dayKey), "routine");
      if (fresh) text += `\n${lines.newWeek(fresh.last, this.phrase)}`;
      this.say(
        { text, actions: needsPlan ? this.planActions() : next ? [this.focusAction(next), this.laterAction()] : [], seconds: 60 },
        {
          why:
            L("lời chào đầu ngày làm việc", "first greeting of the workday") +
            (needsPlan ? L(`, mới có ${planned(day)}/${target} việc`, `, only ${planned(day)}/${target} planned`) : "") +
            (kept ? L(", kèm con ếch và ghi chú bạn để lại", ", with the frog and note you left") : "") +
            (words ? L(", kèm lời nhắn về hôm qua", ", with a kind word about yesterday") : ""),
        },
      );
      return;
    }

    // 3b. Overbooked? Once a day, after planning and before the middle of the work day, when what's ahead runs an hour or
    // more over the time left. A daily check-in: never counted. Later in the day it is too late to rearrange (and the
    // end-of-day review does the same job).
    if (ctx.inWork && nowMs < ctx.midday && (planned(day) >= target || ctx.hoursAfterPlanDeadline >= 0) && this.firedAt(`overbooked-${this.dayKey}`) === undefined) {
      const load = this.currentLoad();
      if (load.capacity > 0 && isOverbooked(load) && this.once(`overbooked-${this.dayKey}`)) {
        this.sayOverbooked(load);
        return;
      }
    }

    // 3c. Today's plan is done: the pet asks to go on a trip (v0.5). A check-in: never counted.
    if (this.offerTrip(nowMs, ctx.inWork)) return;

    // 4. Not planned enough: nag every 30 minutes once the planning deadline passed.
    if (ctx.inWork && planned(day) < target && ctx.hoursAfterPlanDeadline >= 0 && this.remindEvery("plan", 30)) {
      this.say(
        { text: lines.plan(s.mood, planned(day), target, this.phrase), actions: this.planActions(), seconds: 60 },
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
          text: lines.stuck(stuck, s.mood, this.phrase),
          actions: [
            { title: L("✂️ Chia nhỏ", "✂️ Split it"), primary: true, run: () => this.effects.openSplit?.(stuck.task) },
            { title: L("▶ Thử 2 phút", "▶ Try 2 minutes"), run: () => this.startTwoMinutes(stuck.task) },
            { title: L("Bỏ khỏi kế hoạch", "Drop from plan"), run: () => void this.unplan(stuck.task) },
            this.laterAction(),
          ],
          seconds: 60,
          // Not once a session has started, or the task is done.
          stillValid: () => this.state.focus === null && this.whileOpen(stuck.task)(),
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
        { text: lines.hungry(s.life.satiety, next, this.phrase), actions: next ? [this.focusAction(next), this.laterAction()] : [], seconds: 30, ...(next ? { stillValid: this.whileOpen(next) } : {}) },
        { why: L(`độ no còn ${Math.trunc(s.life.satiety)}%`, `only ${Math.trunc(s.life.satiety)}% full`), kind: "hungry" },
      );
      this.speak(lines.voiceHungry);
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
          { text: lines.grumble(next, this.phrase), actions: [this.focusAction(next), this.spareAction()], seconds: 15 },
          {
            chime: "grumble",
            antic: true,
            kind: "grumble",
            why: L(`tâm trạng đi xuống, ở ${d.app} ${minutes} phút`, `in a low mood, on ${d.app} for ${minutes} min`) + this.reasonSuffix(),
          },
        );
        this.speak(lines.voiceGrumble);
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
        { text: lines.overdue(s.mood, movable, repeating, this.phrase), actions, seconds: 45 },
        { why: L(`${day.overdue.length} việc quá hạn (nhắc tối đa 90 phút/lần)`, `${day.overdue.length} overdue task(s) (at most every 90 min)`), kind: "overdue" },
      );
      return;
    }

    // 8. Give the next task a concrete time slot (implementation intention), once a day.
    const slot = s.suggestions[0];
    if (ctx.inWork && planned(day) >= target && slot && slot.start.getTime() - nowMs < 3 * 60 * MIN && this.remindOnce("timeblock", `timeblock-${this.dayKey}`)) {
      this.say(
        {
          text: lines.timeBlock(slot),
          actions: [{ title: L("⏰ Đặt giờ", "⏰ Set time"), primary: true, run: () => void this.schedule(slot) }, this.laterAction()],
          seconds: 60,
          stillValid: this.whileOpen(slot.task),
        },
        { why: L("gợi ý khung giờ trống (mỗi ngày một lần)", "a free time slot (once a day)"), kind: "timeblock" },
      );
      return;
    }

    // 9. End-of-day review (shutdown ritual): opens the Wrap up sheet. A daily check-in: never counted.
    if (ctx.inWork && nowMs >= ctx.reviewTime && day.today.length > 0 && this.once(`review-${this.dayKey}`)) {
      this.sayReview();
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
      this.speak(() => lines.voiceSummary(Math.trunc(life.distractionTotal(s.life) / 60)));
      return;
    }

    // 10. Regular nudge with the next task.
    const minutes = s.prefs.remindEvery;
    if (ctx.inWork && next && nowMs - this.lastBubbleAt > minutes * MIN && this.nudgeDue(minutes) && this.mayRemind("nudge")) {
      this.markFired("nudge", nowMs);
      this.markFired(LATER, null);
      const idleHours = (nowMs - this.lastProgress()) / (60 * MIN);
      this.say(
        { text: lines.nudge(s.mood, next, idleHours, this.phrase), actions: [this.focusAction(next), this.completeAction(next), this.laterAction()], seconds: 45, stillValid: this.whileOpen(next) },
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
      this.say({ text: lines.tip(this.phrase), seconds: 14 }, { why: L("pet đang vui và đã im lặng 40 phút", "the pet is in a good mood and quiet for 40 min"), kind: "tip" });
    }
  }

  /** The end-of-day review: what got done, and a way into the Wrap up sheet. */
  private sayReview(): void {
    const day = this.state.day;
    // "Tomorrow" is the next workday: its name when that isn't tomorrow, in the words and on the button.
    const name = this.wrapDayName();
    this.say(
      {
        text: lines.review(day.completed.length, planned(day), day.today.length, name, this.phrase),
        actions: [
          { title: L("Tổng kết ngày", "Wrap up"), primary: true, run: () => this.effects.openWrapUp?.() },
          // With nothing left there is nothing to move.
          ...(day.today.length > 0 ? [{ title: L(`Dời sang ${name ?? "mai"}`, `Move to ${name ?? "tomorrow"}`), run: () => void this.moveTodayToTomorrow() }] : []),
          { title: L("Làm tiếp", "Keep going"), run: () => undefined },
        ],
        seconds: 90,
      },
      { why: L(`30 phút trước giờ tan làm, còn ${day.today.length} việc`, `30 min before work ends, ${day.today.length} left`) },
    );
  }

  // ---------- Meeting bookends, plans and the resume card (SPEC v0.4) ----------

  /** You are back (the PC saw you idle for 5+ minutes before): tells the diary and sets the resume card up. */
  private backFromAway(nowMs: number): { minutes: number; resume: "away" | null } | null {
    if (this.awaySince === null) return null;
    const minutes = Math.trunc((nowMs - this.awaySince) / MIN);
    this.awaySince = null;
    this.diary.add("system", L(`Bạn quay lại sau ${minutes} phút`, `You came back after ${minutes} minutes`));
    if (this.workContext && shouldOfferResume({ awayMinutes: minutes })) {
      this.pendingResume = { reason: "away", at: nowMs };
      return { minutes, resume: "away" };
    }
    return { minutes, resume: null };
  }

  /** Notes the meeting in progress, and meetings that ended (see `MeetingTrack`); the one in progress is a moment to remember where you were. */
  private trackMeetings(nowMs: number, now: Date): void {
    this.noteMeetings(nowMs, this.sample);
    const current = currentEvent(this.state.events, now);
    if (current && this.once(`context-${current.id}`)) this.takeSnapshot(nowMs);
  }

  /**
   * What a sample says about today's meetings. During one: signs that you were there (a call in front, 2+ idle minutes,
   * another app than before). After one: its follow-ups start, but not while a call is still in front: their 10 minutes
   * count from when it leaves. Runs even while muted or away.
   */
  private noteMeetings(nowMs: number, s: SystemSample): void {
    const inCall = isConferencing(s.app, s.url);
    for (const e of this.state.events) {
      const start = e.start.getTime();
      const end = e.end.getTime();
      if (nowMs < start) continue;
      let t = this.meetingTracks.get(e.id);
      if (nowMs < end) {
        t ??= { before: this.lastWork?.app?.name ?? null, attended: false, closed: false, held: false, since: null };
        this.meetingTracks.set(e.id, t);
        if (!t.attended) {
          const elsewhere = t.before !== null && s.app !== null && !isNotWorkApp(s.app) && s.app.name !== t.before && !this.isDistractingNow(s.app, s.url);
          t.attended = inCall || s.idleSeconds >= 120 || elsewhere;
        }
        continue;
      }
      if (!this.endedEventIds.includes(e.id)) this.endedEventIds.push(e.id);
      if (!t || t.closed) continue;
      if (inCall) {
        t.held = true;
        continue;
      }
      t.closed = true;
      t.since = t.held ? nowMs : end;
      t.held = false;
      if (t.attended && nowMs - t.since <= RESUME_WINDOW) this.pendingResume = { reason: "meeting", at: nowMs };
    }
  }

  private setTriggers(list: TaskTrigger[]): void {
    this.set({ triggers: list });
    if (!this.persistTriggers) {
      this.diary.add(
        "system",
        L("Phiên này không lưu các kế hoạch bắt đầu (không đọc được những kế hoạch đã lưu)", "This session's start plans won't be saved (the saved ones couldn't be read)"),
        { throttle: "triggers-not-saved", every: 60 },
      );
      return;
    }
    this.backend.storage.save("triggers", triggersToJson(list)).catch(() => {
      this.diary.add("system", L("Không lưu được các kế hoạch bắt đầu", "Couldn't save your start plans"), { throttle: "triggers-save-failed", every: 30 });
    });
  }

  /** Marks the plan as spent, whether it spoke or the task was already gone. */
  private finishTrigger(t: TaskTrigger): void {
    this.setTriggers(markFired(this.state.triggers, t.taskId, t.day));
  }

  /** Plans whose meeting is no longer on a calendar that has just been read in full (it moved or was cancelled) can't come true. */
  private dropGonePlans(): void {
    const gone = goneMeetingPlans(this.state.triggers, this.state.events, this.endedEventIds, this.dayKey);
    if (gone.length === 0) return;
    this.setTriggers(this.state.triggers.filter((t) => !gone.includes(t)));
    for (let i = 0; i < gone.length; i++) this.diary.add("system", L("Bỏ kế hoạch bắt đầu: cuộc họp đã dời hoặc huỷ", "Start plan dropped: meeting moved or cancelled"));
  }

  private afterMeetingKey = (id: string) => `aftermeeting-${shortHash(id)}-${this.dayKey}`;

  /**
   * "“Team sync” is over. Anything to capture?" once after a meeting of 15+ minutes that you were at (and whose call is
   * off the screen), if you are here to hear it. Waits while reminders are held; two refusals a day end it.
   */
  private offerAfterMeeting(nowMs: number): boolean {
    const s = this.state;
    if (this.refusedEnough("aftermeeting")) return false;
    const over = s.events
      .filter((e) => {
        const t = this.meetingTracks.get(e.id);
        if (!t || !t.closed || !t.attended || t.since === null) return false;
        const ago = nowMs - t.since;
        return ago >= 0 && ago <= BOOKEND_WINDOW && e.end.getTime() - e.start.getTime() >= BOOKEND_MIN_LENGTH && this.firedAt(this.afterMeetingKey(e.id)) === undefined;
      })
      .sort((a, b) => b.end.getTime() - a.end.getTime())[0];
    if (!over) return false;
    if (this.onHold(L("câu hỏi sau họp", "the question after the meeting"))) return false;
    if (!this.once(this.afterMeetingKey(over.id))) return false;
    // A breather only if the next meeting leaves at least 3 minutes, and no longer than the time there is.
    const next = nextEvent(s.events, new Date(nowMs));
    const left = next && next.start.getTime() - nowMs <= BREATHER_IF_NEXT_WITHIN ? Math.floor((next.start.getTime() - nowMs) / MIN) : 0;
    const soon = next && left >= BREATHER_MIN ? next : null;
    const breather = Math.min(BREATHER_MINUTES, left);
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
    if (soon) actions.push({ title: L(`☕ Nghỉ ${breather} phút`, `☕ ${breather}-min breather`), run: () => this.startBreak(breather) });
    actions.push({ title: L("Không có gì", "Nothing"), run: () => undefined });
    this.say(
      // The breather is offered before the next meeting: not after it has started.
      { text: lines.meetingOver(over, soon, breather, this.phrase), actions, seconds: 60, ...(soon ? { validUntil: soon.start.getTime() } : {}) },
      { why: L(`họp “${shortText(over.title, 30)}” vừa kết thúc`, `“${shortText(over.title, 30)}” just ended`), card: "aftermeeting" },
    );
    return true;
  }

  /** Starts a plan that has come true ("As planned: …"); a plan for a task that is gone is simply spent. */
  private fireTriggers(nowMs: number, open: TodoTask[]): boolean {
    const s = this.state;
    const due = dueTriggers(s.triggers, {
      day: dayKey(new Date(nowMs)),
      now: nowMs,
      events: s.events,
      app: this.sample.app,
      appSwitchedAt: this.sample.appSwitchedAt,
      endedEventIds: this.endedEventIds,
    });
    for (const t of due) {
      // Being completed right now: if Todoist refuses, the task is back and the plan still stands.
      if (this.closing.has(t.taskId)) continue;
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
      const later: BubbleAction = {
        title: L("Để sau", "Later"),
        neutral: true,
        // Not dropped: the plan comes back, not before the time asked for.
        run: () => this.setTriggers(rearmTrigger(this.state.triggers, t.taskId, t.day, this.now() + PLAN_LATER_MINUTES * MIN)),
      };
      this.say(
        { text: lines.asPlanned(task), actions: [{ title: L("▶ Bắt đầu ngay", "▶ Focus now"), primary: true, run: () => this.startFocus(task) }, later], seconds: 45, stillValid: this.whileOpen(task) },
        { why: L(`kế hoạch bạn đặt: ${lines.triggerKindText(t.trigger)}`, `your plan: ${lines.triggerKindText(t.trigger)}`) },
      );
      return true;
    }
    return false;
  }

  /**
   * The resume card: "You were on: ⟨task⟩ · in ⟨app — title⟩" with Reopen ↗ ⟨host⟩ (http/https only), Focus and Something
   * else. Never with a call in front (it would show on a screen share): it waits, for its 10 minutes. Also waits for a
   * pause, while reminders are held, and it comes at most every 30 minutes and twice a day if you keep closing it.
   */
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
    if (isConferencing(this.sample.app, this.sample.url)) return false;
    if (this.state.flow || !calm.atBreakpoint(this.sample.secondsSinceKey, this.secondsSinceAppSwitch())) return false;
    const gate = `resumecard-${this.dayKey}`;
    if (this.refusedEnough("resume") || !this.isDue(gate, RESUME_COOLDOWN) || this.onHold(L("thẻ “bạn đang làm gì”", "the resume card"))) {
      this.pendingResume = null;
      return false;
    }
    // A task finished meanwhile is no longer where you were.
    const task = ctx.taskId ? open.find((t) => t.id === ctx.taskId) ?? null : null;
    const details = this.state.prefs.resumeDetails;
    const sum = resumeSummary(details ? ctx : withoutDetails(ctx));
    const shown = { ...sum, task: task ? sum.task : null };
    this.pendingResume = null;
    this.workContext = null;
    this.setPinned(false);
    if (!shown.task && !shown.where && !shown.note) return false;
    this.markFired(gate, nowMs);
    const actions: BubbleAction[] = [];
    const url = details ? workUrl(ctx.url) : null;
    if (url) {
      actions.push({
        title: lines.reopenTitle(sum.host),
        primary: true,
        run: () => void this.backend.system.openUrl(url).catch(() => this.say({ text: lines.reopenFailed(), seconds: 10, urgent: true })),
      });
    }
    const target = task ?? this.state.next;
    // One primary button: Reopen when there is a page to go back to, else Focus.
    if (target) actions.push({ ...this.focusAction(target), primary: url === null });
    actions.push({ title: L("Việc khác", "Something else"), run: () => this.effects.openBoard?.(false) });
    const place = lines.resumePlace(shown);
    this.say(
      { text: lines.resumeCard(shown, pending.reason), ...(place ? { detail: place } : {}), actions, seconds: 45, ...(task ? { stillValid: this.whileOpen(task) } : {}) },
      { why: L("bạn vừa quay lại", "you just came back"), diaryText: lines.resumeDiary(shown.task, shown.note !== null), card: "resume" },
    );
    return true;
  }

  /** Sets (or replaces) the task's "start when…" plan for today. Returns false for a plan with nothing in it. */
  setStartTrigger(task: TodoTask, trigger: StartTrigger): boolean {
    const nowMs = this.now();
    const day = dayKey(new Date(nowMs));
    const [clean] = triggersFromJson([{ taskId: task.id, day, trigger, fired: false }], nowMs);
    if (!clean) return false;
    this.lastActedId = task.id;
    this.setTriggers(setTrigger(this.state.triggers, task.id, day, clean.trigger, nowMs));
    // Never the meeting's title or the app's name: the diary is on disk.
    this.diary.add("system", L(`Hẹn bắt đầu “${shortText(taskTitle(task), 40)}”: ${lines.triggerKindText(clean.trigger)}`, `Start plan for “${shortText(taskTitle(task), 40)}”: ${lines.triggerKindText(clean.trigger)}`));
    return true;
  }

  clearStartTrigger(task: TodoTask): void {
    const day = dayKey(new Date(this.now()));
    if (this.state.triggers.some((t) => t.taskId === task.id && t.day === day)) this.setTriggers(clearTrigger(this.state.triggers, task.id, day));
  }

  /** The choices of a task's "Start when…" menu (not the app in front: a plan for it would have nothing to wait for). */
  startTriggerChoices(): StartTrigger[] {
    return triggerChoices({ events: this.state.events, now: this.now(), recentApps: this.recentApps, current: this.sample.app, isDistracting: this.isDistractingNow });
  }

  /**
   * The app lately in front (or in front now) that a typed name for "Start when I open…" matches, or null: the dialog
   * shows it, and says kindly when nothing matches yet (the plan is still kept, and waits for the app).
   */
  recentAppMatch(typed: string): ForegroundApp | null {
    const apps = [...(this.sample.app ? [this.sample.app] : []), ...this.recentApps];
    return apps.find((a) => !isNotWorkApp(a) && appMatches(a, typed)) ?? null;
  }

  /** **▶ Try 2 minutes**: a 2-minute focus on the task ("just open it"); at the end the pet offers a full session or lets you stop. */
  startTwoMinutes(task: TodoTask | null): void {
    this.startFocus(task, STARTER_MINUTES, true);
  }

  // ---------- Wrapping up the day and the overbooked check (SPEC v0.4 §3, §4) ----------

  /** Is this a day the pet works on? The demo works every day unless you take it off (or turned weekends on). */
  private readonly workdayOn = (d: Date): boolean => (this.state.isDemo && !this.demoWeekends ? !isRestDay(this.state.prefs, d) : isWorkday(this.state.prefs, d));

  private setPlanDoc(doc: PlanDoc): void {
    this.plan = doc;
    if (!this.persistPlan) return;
    this.backend.storage.save("plan", planToJson(doc)).catch(() => undefined);
  }

  /**
   * The moment the day's load is measured from: now. The demo (which pretends every hour is a work hour) measures from
   * an hour into the work day when it is not, so the numbers always make sense.
   */
  loadClock(): number {
    const nowMs = this.now();
    if (!this.state.isDemo) return nowMs;
    const p = this.state.prefs;
    const now = new Date(nowMs);
    const inside = nowMs >= atHour(p.workStart, 0, now).getTime() && nowMs < atHour(p.workEnd, 0, now).getTime();
    return inside ? nowMs : atHour(p.workStart + 1, 0, now).getTime();
  }

  /** What the day's load and the board's day strip are worked out from: today's open tasks and meetings against the work hours. */
  dayInput(nowMs = this.loadClock()): DayLoadInput {
    const p = this.state.prefs;
    return { tasks: this.state.day.today, events: this.state.events, now: nowMs, workStart: p.workStart, workEnd: p.workEnd, defaultEstimate: p.defaultEstimate };
  }

  currentLoad(nowMs = this.loadClock()): DayLoad {
    return dayLoad(this.dayInput(nowMs));
  }

  private sayOverbooked(load: DayLoad): void {
    if (this.lightening) return;
    this.say(
      {
        text: lines.overbooked(load),
        // A check-in, not urgent news; but if the board is open it shows in it, and is read there once.
        inBoard: true,
        actions: [
          // The board opens ready to choose: durations on the rows and a way to move each one.
          { title: L("Chọn việc để dời", "Pick tasks to move"), primary: true, run: () => this.effects.openBoard?.(false, undefined, { lighten: true }) },
          { title: L("Không sao", "It's fine"), run: () => undefined },
        ],
        seconds: 60,
        // Not once moving things has made the day fit.
        stillValid: () => {
          const now = this.currentLoad();
          return now.capacity > 0 && isOverbooked(now);
        },
      },
      { why: L(`ngày có vẻ quá tải: dư ${load.overBy} phút so với thời gian còn lại`, `the day looks overbooked: ${load.overBy} min more than the time left`) },
    );
    const b = this.state.bubble;
    this.overbookedBubble = b && b.inBoard ? b.id : null;
  }

  /** What the Wrap up sheet works on: today's open tasks and the overdue ones. */
  wrapTasks(): TodoTask[] {
    return openTasks(this.state.day);
  }

  /** The next workday, where "tomorrow" in the sheet and in the end-of-day review really goes. */
  wrapDay(): { day: string; isTomorrow: boolean } {
    const nowMs = this.now();
    const day = nextWorkday(nowMs, this.workdayOn);
    return { day, isTomorrow: day === addDays(dayKey(new Date(nowMs)), 1) };
  }

  /** The next workday's name ("Monday", "Thứ Hai") when it isn't tomorrow; null for tomorrow. One name for every line and button. */
  wrapDayName(): string | null {
    const next = this.wrapDay();
    return next.isTomorrow ? null : weekdayName(next.day);
  }

  /** The current time, for the board (it shows the Wrap up button from the same clock the brain uses). */
  clockNow(): number {
    return this.now();
  }

  /** What the load counts for a task: its Todoist duration (`own`), else the default estimate. */
  estimateOf(task: TodoTask): { minutes: number; own: boolean } {
    const own = task.durationMinutes !== null && Number.isFinite(task.durationMinutes) && task.durationMinutes > 0;
    return { minutes: taskEstimate(task, this.state.prefs.defaultEstimate), own };
  }

  /** One tap to "tomorrow" while lightening the day: the next workday (Monday after a Friday), like the Wrap up sheet. */
  moveToNextWorkday(task: TodoTask): Promise<boolean> {
    return this.reschedule(task, this.wrapDay().day);
  }

  /**
   * The Wrap up sheet's draft for today: made on the first call, from the plan you may already have chosen for the next
   * workday, and kept until it is sent or the day ends. Closing the board doesn't lose it.
   */
  wrapDraft(): WrapDraft {
    this.draft ??= newDraft(this.wrapTasks(), planFor(this.plan, this.wrapDay().day), this.state.day.completed);
    return this.draft;
  }

  /** A change to the draft (a choice, a letter in the note). */
  editWrapDraft(change: (draft: WrapDraft, tasks: TodoTask[]) => WrapDraft): void {
    this.draft = change(this.wrapDraft(), this.wrapTasks());
    this.patchState({ wrapDraft: this.draft });
  }

  /** After a sync: a frog finished elsewhere, or an untouched default frog that the list has moved on from. */
  private reconcileWrapDraft(): void {
    if (!this.draft) return;
    const next = reconcileDraft(this.draft, this.wrapTasks(), this.state.day.completed);
    if (next === this.draft) return;
    this.draft = next;
    this.patchState({ wrapDraft: next });
  }

  /**
   * **Done for today** (SPEC v0.4 §3): moves the tasks you chose (to the next workday, or off the plan), saves that day's
   * frog and note, and puts the pet to sleep until it starts. If a move fails nothing goes to sleep: the frog and note
   * are kept (they're yours and local), the failure is reported, and the same call can be repeated: it moves only what
   * is still on the list and keeps the plan it worked out the first time.
   */
  async wrapUp(draft: WrapDraft = this.wrapDraft()): Promise<WrapResult> {
    const nowMs = this.now();
    const open = this.wrapTasks();
    const { tomorrow, none } = wrapMoves(draft, open);
    const target = this.wrapDay().day;
    const sig = JSON.stringify([draft.frogId, draft.note, draft.frogId === null ? null : (draft.moves[draft.frogId] ?? null), target]);
    let attempt = this.wrapAttempt?.sig === sig ? this.wrapAttempt : null;
    if (!attempt) {
      const saved = planFor(this.plan, target);
      // A frog that moved to tomorrow has left today's list; the saved plan still knows it.
      const known = new Set([...open.map((t) => t.id), ...(saved?.frogId ? [saved.frogId] : [])]);
      const plan = planFromDraft(draft, known, new Set(this.state.day.completed.map((t) => t.id)), target);
      attempt = { sig, plan, frogTitle: plan.frogId ? (this.titles.get(plan.frogId) ?? null) : null };
    }
    this.wrapAttempt = attempt;
    const { plan, frogTitle } = attempt;
    if (tomorrow.length + none.length > 0) this.lastPlanAction = nowMs;
    const [a, b] = await Promise.all([this.rescheduleAll(tomorrow, target), this.rescheduleAll(none, "no date")]);
    const failed = a.failed + b.failed;
    const error = a.error ?? b.error;
    const result: WrapResult = { ok: failed === 0, moved: a.moved.length, offPlan: b.moved.length, failed, error };
    if (tomorrow.length + none.length > 0) await this.refresh();
    const doneUntil = result.ok ? nextWorkdayStart(nowMs, this.state.prefs.workStart, this.workdayOn) : this.plan.doneUntil;
    this.setPlanDoc({ ...setPlan(this.plan, plan), doneUntil });
    if (!result.ok) {
      this.recompute();
      this.sayMoveFailed(failed, error ?? "");
      return result;
    }
    this.wrapAttempt = null;
    this.draft = null;
    this.patchState({ wrapDraft: null });
    const dayName = this.wrapDayName();
    this.diary.add(
      "system",
      L(`Tổng kết ngày: ${result.moved} việc sang ${dayName ?? "mai"}, ${result.offPlan} việc ra khỏi kế hoạch`, `Wrapped up the day: ${result.moved} moved to ${dayName ?? "tomorrow"}, ${result.offPlan} off the plan`) +
        (frogTitle ? L(`; con ếch ${dayName ?? "ngày mai"} “${shortText(frogTitle, 40)}”`, `; ${dayName ? `${dayName}'s` : "tomorrow's"} frog “${shortText(frogTitle, 40)}”`) : "") +
        (plan.note ? L("; kèm ghi chú", "; with a note") : "") +
        L(`; yên tĩnh tới ${timeString(new Date(doneUntil ?? nowMs))}`, `; quiet until ${timeString(new Date(doneUntil ?? nowMs))}`),
    );
    this.set({ antic: null });
    this.recompute();
    this.say({ text: lines.wrappedUp(frogTitle, dayName), seconds: 10, urgent: true });
    return result;
  }

  /**
   * Rest days (or work days) changed after a wrap-up: "done for today" ends at the new next workday's start, and the
   * frog and note you left move to that day.
   */
  private reflowWrapUp(): void {
    const nowMs = this.now();
    const until = this.plan.doneUntil;
    if (until === null || !isDoneForToday(this.plan, nowMs)) return;
    const next = nextWorkdayStart(nowMs, this.state.prefs.workStart, this.workdayOn);
    if (next === until) return;
    const was = dayKey(new Date(until));
    const day = nextWorkday(nowMs, this.workdayOn);
    const kept = planFor(this.plan, was);
    const doc = kept && was !== day ? setPlan({ ...this.plan, plans: this.plan.plans.filter((p) => p.day !== was) }, { ...kept, day }) : this.plan;
    this.setPlanDoc({ ...doc, doneUntil: next });
  }

  /** Wakes the pet from "done for today" (you changed your mind and want to keep going). The frog and note stay. */
  resumeDay(): void {
    if (!isDoneForToday(this.plan, this.now())) return;
    this.setPlanDoc({ ...this.plan, doneUntil: null });
    this.diary.add("system", L("Bạn làm tiếp — pet thức dậy", "You're back at it — the pet woke up"));
    this.recompute();
    this.say({ text: lines.backToWork(this.phrase), seconds: 6, urgent: true });
  }

  // ---------- Actions ----------

  /** Feeds the pet once per finished task, then dances with a random (sometimes rare golden) celebration. */
  /** Returns what the feeding gave (XP, golden), so Undo can take back exactly that. */
  private celebrate(task: TodoTask | null, viaPet: boolean, feeds = 1, sound = "yay"): { xp: number; golden: boolean; chest: chests.ChestResult | null } | null {
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
    // v0.5: a finished task opens a held chest; its XP isn't taken back by Undo.
    const chest = task ? this.openChest(nowMs) : null;
    const stageNow = life.stageOf(this.state.life.xp);
    if (chest && levelUp === null && stageNow !== life.stageOf(xpBefore)) levelUp = stageNow;
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
    this.diary.add("life", fed, { tag: "done", count: Math.max(1, feeds) });
    this.celebrateUntil = nowMs + (r.golden || levelUp !== null ? 5000 : 4000);
    this.recompute();
    this.play(r.golden || levelUp !== null ? "big" : "celebrate");
    if (task) {
      const parts = [lines.done(task, this.state.day.completed.length, this.state.target, sound, this.phrase)];
      if (r.golden) parts.push(lines.golden(this.phrase));
      if (r.combo >= 2) parts.push(lines.combo(r.combo, this.phrase));
      if (r.cleaned) parts.push(lines.cleaned(this.state.life.dirt, this.phrase));
      if (levelUp !== null) parts.push(lines.levelUp(levelUp, this.phrase));
      if (unlocked.length > 0) parts.push(lines.unlocked(unlocked));
      if (chest) parts.push(chests.chestText(chest));
      // The task that finished today's repair quest: say so in the same bubble.
      const repaired = this.repairNote?.text ?? null;
      if (repaired) parts.push(repaired);
      this.repairNote = null;
      const actions: BubbleAction[] = viaPet ? [{ title: L("Hoàn tác", "Undo"), run: () => void this.undoComplete(task) }] : [];
      this.lastBubbleAt = nowMs;
      const big = unlocked.length > 0 || levelUp !== null || repaired !== null || chest?.reward === "accessory";
      this.set({ bubble: { id: ++this.bubbleSeq, text: parts.join("\n"), actions, seconds: big ? 14 : 8, urgent: true, reminder: false } });
      if (levelUp !== null || r.golden) this.speak(lines.voiceCheer);
    }
    this.later(() => this.recompute(), 4200);
    return { xp: this.state.life.xp - xpBefore - (chest?.xp ?? 0), golden: r.golden, chest };
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
    if (this.state.focus && !this.state.focus.isBreak && this.state.focus.task?.id === task.id) {
      this.dropFocusKnitting();
      this.set({ focus: null });
    }
    const gained = this.celebrate(done, true, 1, this.speciesSound);
    if (gained) this.feeds.set(task.id, { xp: gained.xp, golden: gained.golden });
    try {
      await this.backend.todoist.close(task.id);
    } catch (e) {
      // The win this task was part of (if it was one) may not stand: whatever still stands is found again just below.
      this.pendingWin = null;
      this.completed = this.completed.filter((t) => t.id !== task.id);
      this.completedViaPet.delete(task.id);
      this.knownCompleted.delete(task.id);
      if (!this.active.some((t) => t.id === task.id)) this.active = [...this.active, task];
      this.feeds.delete(task.id);
      this.mutateLife((s) => {
        life.unfeed(s, gained ?? undefined);
        // v0.5: the chest it opened goes back, so the next finished task opens it again.
        if (gained?.chest) chests.restoreChest(s, gained.chest);
      });
      if (gained?.chest) this.diary.add("life", L("Chưa đóng được việc trong Todoist → cất rương lại chờ mở", "Couldn't close the task in Todoist → the chest is back, waiting to be opened"));
      this.lastCelebration = NEVER;
      this.celebrateUntil = NEVER;
      this.set({ celebration: null });
      this.recompute();
      this.say({ text: lines.error(this.fail(e)), seconds: 10, urgent: true });
    } finally {
      this.closing.delete(task.id);
    }
    // Nothing is being closed any more: a beaten blob that waited for it is paid now (see `settleBoss`).
    this.settleBoss(this.now());
    void this.refresh();
  }

  /**
   * Undoes a finished task. It takes back what the task gave (`unfeed`: its XP, the satiety, the combo, the week's count) and nothing else:
   * if it was the task that beat the weekly blob, the 🏅 and its 50 XP stay (see `settleBoss`).
   */
  async undoComplete(task: TodoTask): Promise<void> {
    if (!this.completed.some((t) => t.id === task.id)) return;
    const gained = this.feeds.get(task.id);
    this.feeds.delete(task.id);
    this.mutateLife((s) => life.unfeed(s, gained));
    this.diary.add("life", L(`Hoàn tác “${shortText(taskTitle(task), 40)}”`, `Undid “${shortText(taskTitle(task), 40)}”`), { tag: "undone" });
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
      this.say({ text: lines.planComplete(target, next, this.phrase), actions: next ? [this.focusAction(next)] : [], seconds: 20, urgent: true });
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
    // "Tomorrow" is the next workday: Monday after a Friday.
    const { moved, failed, error } = await this.rescheduleAll(tasks, this.wrapDay().day);
    if (error) this.sayMoveFailed(failed, error);
    await this.refresh();
    if (moved.length > 0) this.say({ text: lines.movedToTomorrow(moved.length, this.wrapDayName()), seconds: 8 });
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
    if (this.state.focus && !this.state.focus.isBreak && this.state.focus.task?.id === task.id) {
      this.dropFocusKnitting();
      this.set({ focus: null });
    }
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
    this.say({ text: lines.splitDone(clean.length, clean[0], this.phrase), actions: start ? [this.focusAction(start)] : [], seconds: 30, urgent: true });
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
    this.knitUntil(nowMs);
    this.knitAt = nowMs;
    // You are here and working: a return not yet seen by the heartbeat, and the card for it, would only come late.
    this.awaySince = null;
    this.pendingResume = null;
    this.set({ focus: { task: t, start: nowMs, end: nowMs + m * MIN, isBreak: false, minutes: m, ...(starter ? { starter: true } : {}) }, antic: null });
    this.finishFocusAt(nowMs + m * MIN);
    this.recompute();
    this.lastBubbleAt = nowMs;
    // A confirmation: right away, or not at all (the board may have been open; and not once the session is over).
    this.set({
      bubble: {
        id: ++this.bubbleSeq,
        text: starter ? lines.starterStart(t, m, this.phrase) : lines.focusStart(t, m, this.phrase),
        actions: [],
        seconds: 5,
        urgent: false,
        reminder: false,
        validUntil: nowMs + CONFIRM_MS,
        stillValid: () => this.state.focus?.start === nowMs,
      },
    });
    this.diary.add(
      "focus",
      (starter ? L(`Bắt đầu thử ${m} phút`, `Started a ${m}-minute starter`) : L(`Bắt đầu tập trung ${m} phút`, `Started a ${m}-minute focus session`)) + (t ? `: “${shortText(taskTitle(t), 40)}”` : ""),
    );
  }

  startBreak(minutes?: number): void {
    const nowMs = this.now();
    const m = minutes ?? this.state.prefs.breakMinutes;
    this.knitUntil(nowMs);
    this.knitAt = null;
    this.set({ focus: { task: null, start: nowMs, end: nowMs + m * MIN, isBreak: true, minutes: m } });
    this.finishFocusAt(nowMs + m * MIN);
    this.recompute();
    this.set({
      bubble: { id: ++this.bubbleSeq, text: lines.breakStart(m, this.phrase), actions: [], seconds: 6, urgent: false, reminder: false, validUntil: nowMs + CONFIRM_MS, stillValid: () => this.state.focus?.start === nowMs },
    });
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
    // v0.5: knitting counts up to now; a complete item gets finished, anything less waits for the next session.
    this.knitUntil(this.now());
    this.knitAt = null;
    this.set({ focus: null });
    this.recompute();
    const made = f && !f.isBreak ? this.craftEnd() : null;
    if (made) this.say({ text: made, seconds: 10, urgent: true });
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
    // v0.5: the last few seconds of knitting, up to 0:00 (the heartbeat counts every 15 s).
    this.knitUntil(f.end);
    this.knitAt = null;
    this.diary.add("focus", f.isBreak ? L("Hết giờ nghỉ", "Break over") : L(`Xong phiên tập trung ${f.minutes} phút`, `Finished a ${f.minutes}-minute focus session`));
    this.set({ focus: null });
    this.recompute();
    this.play("important");
    let bubble: Bubble;
    if (f.isBreak) {
      bubble = { id: ++this.bubbleSeq, text: lines.breakEnd(this.phrase), actions: [this.focusAction(this.state.next), this.laterAction()], seconds: 60, urgent: true, reminder: false };
    } else {
      const actions: BubbleAction[] = [];
      const t = f.task;
      const stillOpen = t !== null && openTasks(this.state.day).some((x) => x.id === t.id);
      // v0.5: what was knitted, and a chest earned during the session: said here rather than in the middle of your focus.
      const made = this.craftEnd();
      const chest = this.chestNotice && this.state.life.chests > 0 ? chests.chestEarnedText() : null;
      this.chestNotice = false;
      const extra = [made, chest].filter(Boolean).join("\n");
      const more = extra ? `\n${extra}` : "";
      if (f.starter) {
        // The 2-minute starter: a full session if it got going, or "that's enough". A task that is gone gets no Focus.
        const gone = t !== null && !stillOpen;
        if (t && stillOpen) actions.push({ title: L("✓ Xong rồi", "✓ Done"), run: () => void this.complete(t) });
        if (!gone) actions.push({ ...this.focusAction(t), primary: true });
        actions.push({
          title: L("Thế là được rồi", "That's enough"),
          run: () => {
            this.diary.add("focus", L("Bạn dừng sau 2 phút thử", "You stopped after the 2-minute starter"));
            this.say({ text: lines.starterEnough(this.phrase), seconds: 6 });
          },
        });
        bubble = { id: ++this.bubbleSeq, text: (gone ? lines.starterGone(t, this.phrase) : lines.starterEnd(t, this.phrase)) + more, actions, seconds: 120, urgent: true, reminder: false };
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
        bubble = { id: ++this.bubbleSeq, text: lines.focusEnd(f.task, f.minutes, this.phrase) + more, actions, seconds: 120, urgent: true, reminder: false };
      }
    }
    this.lastBubbleAt = this.now();
    this.set({ bubble });
  }

  // ---------- v0.5 Game: chests, knitting, trips ----------

  /** The game fields of BrainState, derived from the pet's life and the focus session. */
  private gameView(): Pick<BrainState, "craft" | "chests" | "trip"> {
    const l = this.state.life;
    const f = this.state.focus;
    return {
      craft: f && !f.isBreak && !l.trip ? l.craft : null,
      chests: { held: l.chests, today: l.chestsToday, next: Math.min(1, l.workSec / chests.CHEST_EVERY_SEC) },
      trip: l.trip,
    };
  }

  /** The heartbeat's game part: chests for active work, knitting and dropped stitches during focus, the trip's end. */
  private gameTick(nowMs: number, inWork: boolean, distracted: boolean): void {
    const now = new Date(nowMs);
    this.patchState({ season: activeSeason(now) });
    const inMeeting = currentEvent(this.state.events, now) !== null;
    if (this.state.hasToken && chests.isActiveWork({ inWork, idleSeconds: this.sample.idleSeconds, distracted, inMeeting })) {
      if (this.mutateLife((s) => chests.accrueWork(s, 15, dayKey(now)), "routine")) {
        this.saveLife("broadcast");
        const held = this.state.life.chests;
        this.diary.add("life", L(`Làm việc đủ 30 phút → nhận 1 rương 🎁 (đang giữ ${held})`, `30 minutes of active work → earned a chest 🎁 (${held} held)`));
        this.chestNotice = true;
      }
    }
    const f = this.state.focus;
    if (f && !f.isBreak && !this.state.life.trip) {
      this.knitUntil(nowMs);
      // Finished mid-session: it goes home right away, so no dropped stitch can ever undo it.
      if (craft.isFinished(this.state.life.craft)) {
        const made = this.craftDone();
        if (made && !this.say({ text: made, seconds: 8 })) this.craftLine = [this.craftLine, made].filter(Boolean).join("\n");
      }
      // 30 s on a distracting app or site drops a few stitches, once per visit.
      const d = this.distractionSince;
      if (d && nowMs - Math.max(d.since, f.start) >= craft.DROP_AFTER_SEC * 1000 && this.stitchesDroppedAt !== d.since) {
        this.stitchesDroppedAt = d.since;
        const lost = this.mutateLife((s) => craft.dropStitches(s));
        if (lost > 0) {
          this.diary.add("focus", L(`Ở ${d.label} 30 giây khi đang tập trung → tuột vài mũi đan (−${Math.round(lost * 100)}%)`, `30 s on ${d.label} during focus → dropped a few stitches (−${Math.round(lost * 100)}%)`));
          this.say({ text: craft.droppedText(), seconds: 8, stillValid: () => this.state.focus?.start === f.start });
        }
      }
    }
    // Back at the time on the sign, once you're at the PC to say hello (at once if the clock went back before it left).
    const trip = this.state.life.trip;
    if (trip && trips.tripOver(trip, nowMs) && (nowMs < trip.start || this.sample.idleSeconds < 300)) this.returnFromTrip();
  }

  /** Opens a held chest for a finished task; returns what was inside for the celebration bubble. */
  private openChest(nowMs: number): chests.ChestResult | null {
    if (this.state.life.chests <= 0) return null;
    const season = activeSeason(new Date(nowMs))?.season ?? null;
    const r = this.mutateLife((s) => chests.openChest(s, this.random(), this.random(), season));
    if (!r) return null;
    this.set({ reveal: { id: ++this.bubbleSeq, at: nowMs, kind: "chest", chest: r } });
    this.diary.add("life", chests.chestText(r));
    return r;
  }

  /**
   * Knits the running focus session up to `until` (epoch ms, never past its end), if you're working on it: input in
   * the last minute and not on a distraction. A gap longer than a minute (the PC slept) counts as a minute at most.
   */
  private knitUntil(until: number): void {
    const f = this.state.focus;
    const from = this.knitAt;
    if (!f || f.isBreak || from === null) return;
    const to = Math.max(from, Math.min(until, f.end));
    this.knitAt = to;
    const seconds = Math.min(KNIT_GAP_MAX_SEC, (to - from) / 1000);
    if (seconds <= 0 || this.state.life.trip) return;
    if (!craft.isKnitting({ idleSeconds: this.sample.idleSeconds, distracted: this.currentDistraction() !== null })) return;
    this.mutateLife((s) => craft.knit(s, seconds, f.minutes), "routine");
  }

  /** The session ends without an end bubble (its task was finished or deleted): knitting counts up to now. */
  private dropFocusKnitting(): void {
    this.knitUntil(this.now());
    this.knitAt = null;
    this.craftLine = null;
  }

  /** The end of a focus session: finishes the item if it's complete; returns the lines for the end bubble. */
  private craftEnd(): string | null {
    const parts = [this.craftLine, this.craftDone()].filter(Boolean);
    this.craftLine = null;
    return parts.length > 0 ? parts.join("\n") : null;
  }

  /** Finishes the knitted item once it is complete (only real progress counts: no top-up). Returns its line. */
  private craftDone(): string | null {
    if (this.state.life.trip) return null;
    const day = dayKey(new Date(this.now()));
    const r = this.mutateLife((s) => craft.finishCraft(s, this.random(), day));
    if (!r) return null;
    this.set({ reveal: { id: ++this.bubbleSeq, at: this.now(), kind: "craft", ...r } });
    this.diary.add(
      "life",
      r.decor
        ? L(`Đan xong: ${craft.decorName(r.decor)} ${craft.decorEmoji(r.decor)}`, `Finished knitting: ${craft.decorName(r.decor)} ${craft.decorEmoji(r.decor)}`)
        : r.xp > 0
          ? L(`Đan xong một món (+${r.xp} XP)`, `Finished knitting something (+${r.xp} XP)`)
          : L("Đan xong một món (hôm nay đủ 90 XP đan len rồi)", "Finished knitting something (today's 90 knitting XP already given)"),
    );
    return craft.craftText(r);
  }

  /** Today's plan is done: asks to go on a trip, once a day (a check-in: no kind, so never counted). */
  /** What `trips.canOfferTrip` needs, from the state now. */
  private tripOffer(nowMs: number, inWork: boolean): trips.TripOfferInput {
    const s = this.state;
    return {
      now: nowMs,
      workEnd: atHour(s.prefs.workEnd, 0, new Date(nowMs)).getTime(),
      inWork,
      completed: s.day.completed.length,
      target: s.target,
      left: s.day.today.length,
      tripDay: s.life.tripDay,
      declined: s.life.tripDeclined,
      away: s.life.trip !== null,
    };
  }

  private offerTrip(nowMs: number, inWork: boolean): boolean {
    const offer = this.tripOffer(nowMs, inWork);
    const workEnd = offer.workEnd;
    if (!trips.canOfferTrip(offer) || !this.once(`trip-${this.dayKey}`)) return false;
    const shown = this.say(
      {
        text: lines.tripOffer(new Date(trips.backTime(nowMs, workEnd)), this.phrase),
        actions: [
          { title: lines.tripGo(), primary: true, run: () => void this.goOnTrip() },
          {
            title: lines.tripStay(),
            run: () => {
              this.mutateLife((l) => trips.declineTrip(l, this.now()));
              this.say({ text: lines.tripStayed(this.phrase), seconds: 5 });
            },
          },
        ],
        seconds: 60,
        // Waiting behind the board: gone once it couldn't be offered any more (the pet left, a new task came in, it's
        // too late to go), or you're focusing or done for today.
        stillValid: () => {
          const t = this.now();
          return trips.canOfferTrip(this.tripOffer(t, true)) && this.state.focus === null && !isDoneForToday(this.plan, t);
        },
      },
      { why: L("xong hết kế hoạch hôm nay", "today's plan is done") },
    );
    if (shown) this.tripOfferId = this.state.bubble?.id ?? null;
    return true;
  }

  /** Sends the pet on today's trip (from the offer, or the UI). False when it is away already or went today. */
  goOnTrip(): boolean {
    const nowMs = this.now();
    const l = this.state.life;
    if (l.trip || l.tripDay === dayKey(new Date(nowMs))) return false;
    const workEnd = atHour(this.state.prefs.workEnd, 0, new Date(nowMs)).getTime();
    const trip = this.mutateLife((s) => trips.startTrip(s, nowMs, workEnd, this.random()));
    const place = trips.placeName(trip.place);
    const back = new Date(trip.back);
    this.set({ antic: null });
    this.diary.add("life", L(`Pet đi chơi ${place}, hẹn ${timeString(back)} về`, `The pet set off for ${place}, back at ${timeString(back)}`));
    this.say({ text: lines.tripStart(place, back, this.phrase), seconds: 8, urgent: true });
    return true;
  }

  /** Calls the pet back early (a click on its sign). A souvenir needs 30 minutes away. */
  callBack(): void {
    if (this.state.life.trip) this.returnFromTrip(true);
  }

  /** Home again: the souvenir (or XP), a postcard in the diary and a little dance. A reply, not a reminder. */
  private returnFromTrip(asked = false): void {
    const nowMs = this.now();
    const r = this.mutateLife((s) => trips.endTrip(s, nowMs));
    if (!r) return;
    const place = trips.placeName(r.place);
    if (r.souvenir || r.xp > 0) {
      this.diary.add("life", lines.postcard(place, trips.postcardText(r.place)), { tag: "postcard" });
      this.celebrateUntil = nowMs + 4000;
      this.set({ celebration: { id: ++this.bubbleSeq, kind: "dance", food: "", golden: false, combo: 0, start: nowMs } });
      this.play("celebrate");
    } else {
      this.diary.add("life", L(`Pet về sớm từ ${place} sau ${r.minutes} phút`, `The pet came back early from ${place} after ${r.minutes} min`));
      // Too short to count: today's trip can still be offered and taken.
      this.markFired(`trip-${this.dayKey}`, null);
    }
    this.set({ reveal: { id: ++this.bubbleSeq, at: nowMs, kind: "souvenir", ...r } });
    this.recompute();
    // After "Done for today" the pet slips back in quietly (the souvenir and postcard still land), unless you called it.
    if (asked || !isDoneForToday(this.plan, nowMs)) this.say({ text: lines.tripBack(r, this.phrase), seconds: 14, urgent: true });
  }

  // ---------- v0.6 Friends: cards, the weekly boss, visits ----------

  /**
   * My pet card as it stands now (not the text): the pet, this week's tasks and the last 28 days, with this install's public key
   * (an empty one while the key is unknown: that card is only good for the buddy streaks, never sent).
   */
  private cardData(nowMs: number): fr.PetCard {
    const date = new Date(nowMs);
    const today = dayKey(date);
    const s = this.state;
    const l = s.life;
    const isWorkday = (key: string) => {
      const d = parseDate(key);
      return d ? this.workdayOn(d) : true;
    };
    const mark = fr.todayMark(s.day.completed.length, s.target, this.workdayOn(date));
    return fr.buildCard({
      pk: this.myKey ?? "",
      petName: s.prefs.petName,
      species: s.prefs.species,
      wearing: l.wearing,
      stage: life.stageOf(l.xp),
      weekDone: fr.weekDoneOf(l.week, today),
      history: fr.cardHistory(l.history, today, mark, isWorkday),
      today,
    });
  }

  /** The text that my card signs, as it stands now, or null while this PC's key is unknown. The UI watches it to know when to ask for a new card. */
  myCardPayload(): string | null {
    return this.myKey === null ? null : fr.cardPayload(this.cardData(this.now()));
  }

  /** Asks the backend for this install's key if it isn't known yet (Credential Manager may have been busy at the start). */
  private async ensureKey(): Promise<string | null> {
    if (this.myKey !== null) return this.myKey;
    try {
      const key = await this.backend.cards.publicKey();
      if (fr.isPublicKey(key)) {
        this.myKey = key;
        this.patchState({ myKey: key });
      }
    } catch {
      // Still unknown: the caller says so.
    }
    return this.myKey;
  }

  /**
   * The text of my card, signed with this install's key by the backend (the secret never comes here): what the Friends sheet
   * copies for you to send. Built live from the pet and the settings. Rejects with kind words when the key can't be read.
   */
  async myCard(): Promise<string> {
    if ((await this.ensureKey()) === null) throw new Error(L("Không đọc được khoá thẻ của máy này (Windows Credential Manager). Bạn thử lại sau nhé.", "Couldn't read this PC's card key (Windows Credential Manager). Please try again in a moment."));
    const card = this.cardData(this.now());
    return fr.encodeCard(card, await this.backend.cards.sign(fr.cardPayload(card)));
  }

  /**
   * Makes a new card identity: a new key pair, so the cards you send from now on carry a new public key and friends see a
   * new person (they can remove the old entry). The friends you have stay; the first visit waits again. The old secret key
   * is gone once the new one is stored; its public half is remembered (up to 10 of them, in the friends document), so that
   * an old card of mine pasted back in later is refused as mine rather than added as a friend.
   */
  async resetCardKey(): Promise<{ ok: true } | { ok: false; message: string }> {
    const sorry = { ok: false as const, message: L("Chưa tạo được danh tính thẻ mới. Danh tính cũ vẫn như cũ, bạn thử lại sau nhé.", "Couldn't make a new card identity just now. Nothing changed; please try again in a moment.") };
    // The key I have now becomes an "older" one, once the replacement is really made.
    const before = await this.ensureKey();
    try {
      await this.backend.cards.resetKey();
    } catch {
      return sorry;
    }
    if (before !== null) {
      this.friendsDoc = fr.retireKey(this.friendsDoc, before);
      this.saveFriends();
    }
    let key: unknown = null;
    try {
      key = await this.backend.cards.publicKey();
    } catch {
      // The key is replaced, but the new one can't be read yet: forget the old, and ask again when it is needed.
    }
    this.myKey = fr.isPublicKey(key) ? key : null;
    this.visitAfter = this.now() + fr.visitDelayMs(this.myKey ?? "", this.dayKey);
    this.diary.add("system", L("Tạo danh tính thẻ mới (bạn bè sẽ thấy bạn như một người mới)", "Made a new card identity (friends will see you as a new person)"));
    this.patchState({ myKey: this.myKey, ...this.friendsView(this.now()) });
    return this.myKey === null ? sorry : { ok: true };
  }

  /** The friends, their buddy streaks and this week's boss, from the document and the pet as they are now. */
  private friendsView(nowMs: number): Pick<BrainState, "friends" | "buddyStreaks" | "boss"> {
    const today = dayKey(new Date(nowMs));
    const friends = this.friendsDoc.friends;
    const mine = this.cardData(nowMs);
    return {
      friends,
      buddyStreaks: Object.fromEntries(friends.map((f) => [f.pk, fr.buddyStreak(mine, f)])),
      boss: fr.bossOf({ today, myDone: fr.weekDoneOf(this.state.life.week, today), friends }),
    };
  }

  private refreshFriends(): void {
    this.patchState(this.friendsView(this.now()));
  }

  private saveFriends(): void {
    if (!this.persistFriends) {
      this.diary.add("system", L("Phiên này không lưu danh sách bạn bè (không đọc được danh sách đã lưu)", "This session's friends won't be saved (the saved ones couldn't be read)"), {
        throttle: "friends-not-saved",
        every: 60,
      });
      return;
    }
    this.backend.storage.save("friends", fr.docToJson(this.friendsDoc)).catch(() => {
      this.diary.add("system", L("Không lưu được danh sách bạn bè", "Couldn't save your friends"), { throttle: "friends-save-failed", every: 30 });
    });
  }

  /**
   * Adds the friend whose card was pasted. Strict about what it reads (see `parseCard`), and a card is only accepted once
   * the backend has checked its signature against the key it names; a card that doesn't check out, your own, an older one
   * than you have, or a 13th friend gets kind words (never repeating what the card says) and changes nothing. A newer card
   * from the same key replaces theirs: only that key could have signed it.
   */
  async addFriendCard(raw: string): Promise<FriendAdd> {
    const parsed = fr.parseCard(raw, dayKey(new Date(this.now())));
    if (!parsed.ok) return { ok: false, error: parsed.error, message: parsed.message };
    const refused = (error: "signature" | "unchecked"): FriendAdd => ({ ok: false, error, message: fr.cardErrorText(error) });
    try {
      if (!(await this.backend.cards.verify(parsed.card.pk, parsed.payload, parsed.signature))) return refused("signature");
    } catch (e) {
      // A key or signature the backend finds malformed is a card that doesn't check out; anything else is not the card's fault.
      return refused(e instanceof BackendError && e.kind === "invalid" ? "signature" : "unchecked");
    }
    await this.ensureKey();
    // From here to the end nothing waits: another card added meanwhile is already in the list.
    const out = fr.addFriend(this.friendsDoc.friends, parsed.card, this.myKey, this.friendsDoc.oldKeys);
    if (!out.ok) return out;
    this.friendsDoc = { ...this.friendsDoc, friends: out.friends };
    this.saveFriends();
    // The diary is on disk: it says a card came, never whose.
    this.diary.add("system", out.replaced ? L("Cập nhật thẻ của một người bạn", "Updated a friend's card") : L("Thêm một người bạn mới", "Added a friend"));
    this.refreshFriends();
    this.settleBoss(this.now());
    return { ok: true, friend: out.friend, replaced: out.replaced };
  }

  /** Takes a friend off the list (their card is gone from this PC; they can send it again). */
  removeFriend(pk: string): boolean {
    if (!this.friendsDoc.friends.some((f) => f.pk === pk)) return false;
    this.friendsDoc = { ...this.friendsDoc, friends: fr.removeFriend(this.friendsDoc.friends, pk) };
    this.saveFriends();
    this.diary.add("system", L("Xoá một người bạn khỏi danh sách", "Removed a friend"));
    if (this.state.visitor?.friend.pk === pk) this.set({ visitor: null });
    this.refreshFriends();
    this.settleBoss(this.now());
    return true;
  }

  /**
   * The week's blob is beaten: +50 XP and a 🏅 on the sticker page, once a week, and a few kind words when you are
   * around (a reply: never counted). Not while a task is still being closed in Todoist (if it refuses, the task comes
   * back and the win would have been undeserved): a win that stands meanwhile is remembered and paid when the closing is
   * done, for the week it was won in even if Sunday midnight passed meanwhile.
   *
   * **A win is final.** Once paid it stays: undoing the task that beat the blob takes that task's own XP back
   * (`undoComplete`), not the 🏅 or its 50 XP, and finishing it again pays nothing more (one reward per ISO week). The
   * week was beaten; a changed mind is not a loss. (SPEC v0.6 §6.)
   */
  private settleBoss(nowMs: number): void {
    if (!this.state.hasToken) return;
    const boss = this.state.boss;
    const today = dayKey(new Date(nowMs));
    if (this.closing.size > 0) {
      if (boss.defeated && !this.state.life.bossWins.includes(boss.week) && this.pendingWin?.week !== boss.week) {
        this.pendingWin = { week: boss.week, day: today, together: boss.members.length > 1 };
      }
      return;
    }
    const pending = this.pendingWin;
    this.pendingWin = null;
    // A win remembered from an earlier week: nothing more to check, the closing it waited for went through.
    if (pending && pending.week !== boss.week) this.payBoss(pending.week, pending.day, pending.together, nowMs);
    if (boss.defeated) this.payBoss(boss.week, today, boss.members.length > 1, nowMs);
  }

  /** Pays the blob of ISO `week`, beaten on `day`: once per week. */
  private payBoss(week: string, day: string, together: boolean, nowMs: number): void {
    if (this.state.life.bossWins.includes(week)) return;
    const reward = this.mutateLife((l) => life.winBoss(l, week, day));
    if (!reward) return;
    this.diary.add(
      "life",
      L(`Cả nhóm hạ gục Quái Vật Trì Hoãn tuần ${week}: +${reward.xp} XP và một sticker 🏅`, `Beat the Procrastination Blob of ${week}: +${reward.xp} XP and a 🏅 sticker`),
      { tag: "sticker", day },
    );
    const parts = [fr.bossWinText(together)];
    if (reward.levelUp !== null) parts.push(lines.levelUp(reward.levelUp, this.phrase));
    if (reward.unlocked.length > 0) parts.push(lines.unlocked(reward.unlocked));
    if (reward.pageDone) parts.push(lines.pageDone(this.state.life.stickerPage - 1, reward.snack));
    this.bossNotice = { text: parts.join("\n"), week };
    this.celebrateUntil = nowMs + 4000;
    this.set({ celebration: { id: ++this.bubbleSeq, kind: "dance", food: "", golden: false, combo: 0, start: nowMs } });
  }

  /**
   * Says a won boss once you're around and nothing else is showing (like a chest: a small reply, never counted). It is about
   * the week it was won in: once that week is over it is no news and is dropped. It never takes the morning greeting's
   * place or makes it wait: while today's greeting is still to come, this waits for it.
   */
  private tellBoss(nowMs: number): void {
    const notice = this.bossNotice;
    if (notice === null) return;
    if (notice.week !== fr.isoWeekKey(dayKey(new Date(nowMs)))) {
      this.bossNotice = null;
      return;
    }
    const f = this.state.focus;
    if (this.state.bubble || this.outOfTheWay || this.state.flow || (f && !f.isBreak) || this.sample.idleSeconds > 300 || isDoneForToday(this.plan, nowMs)) return;
    if (this.state.quietUntil !== null && nowMs < this.state.quietUntil) return;
    if (this.greetingComes(nowMs)) return;
    if (!calm.atBreakpoint(this.sample.secondsSinceKey, this.secondsSinceAppSwitch())) return;
    this.bossNotice = null;
    this.say({ text: notice.text, seconds: 14 }, { chime: "celebrate" });
  }

  /** What stands in the way of company right now (see `CalmMoment`). */
  private calmNow(nowMs: number): fr.CalmMoment {
    const s = this.state;
    const f = s.focus;
    return fr.calmMoment({
      typing: s.flow || this.sample.secondsSinceKey < calm.TYPING_WINDOW,
      focusing: !!f && !f.isBreak,
      inMeeting: currentEvent(s.events, new Date(nowMs)) !== null,
      doneForToday: isDoneForToday(this.plan, nowMs),
      quiet: s.quietUntil !== null && nowMs < s.quietUntil,
      hidden: s.hiddenUntil !== null,
      fullscreen: s.fullscreen && s.prefs.hideInFullscreen,
      away: this.sample.idleSeconds > 300,
      sleeping: s.mood === "sleeping",
      onTrip: s.life.trip !== null,
      bubble: s.bubble !== null,
      boardOpen: this.boardIsOpen,
      mischief: s.antic !== null,
      inCall: isConferencing(this.sample.app, this.sample.url),
    });
  }

  /**
   * Notes when you leave and come back. Coming back after a long time away (30 minutes or more, a night) starts the wait for
   * the day's first visit again: it is not for the moment you sit down. Once the day's first visit has come, being away
   * changes nothing (the two hours between visits are all there is).
   */
  private noteAway(nowMs: number, idleSeconds: number): void {
    if (idleSeconds > AWAY_SECONDS) {
      this.awayFrom ??= nowMs - idleSeconds * 1000;
      return;
    }
    const from = this.awayFrom;
    this.awayFrom = null;
    if (from === null || nowMs - from < LONG_AWAY_MS) return;
    const visits = this.friendsDoc.visits;
    if (visits.day === dayKey(new Date(nowMs)) && visits.count > 0) return;
    this.visitAfter = Math.max(this.visitAfter, nowMs + fr.visitDelayMs(this.myKey ?? "", dayKey(new Date(nowMs))));
  }

  /**
   * A friend's pet drops by when it is calm (SPEC v0.6 §4), at most twice a day. Ambient: not a bubble, no sound, never
   * counted against the nudge budget. While one is here, it leaves as soon as the time is up or the moment is not calm.
   */
  private tickVisits(nowMs: number): void {
    const v = this.state.visitor;
    if (v) {
      if (nowMs >= v.end) this.set({ visitor: null });
      else this.checkVisit();
      return;
    }
    // Never before today's morning greeting has been told: a visitor is the second thing of the day, not the first.
    if (nowMs < this.visitAfter || !this.state.hasToken || this.settling || this.greetingComes(nowMs)) return;
    const doc = this.friendsDoc;
    const friend = fr.pickVisitor({ friends: doc.friends, today: dayKey(new Date(nowMs)), now: nowMs, log: doc.visits, calm: this.calmNow(nowMs) }, this.random);
    if (friend) this.startVisit(friend, nowMs, true);
  }

  private startVisit(friend: fr.Friend, nowMs: number, record: boolean): void {
    if (record) {
      this.friendsDoc = fr.recordVisit(this.friendsDoc, friend.pk, nowMs, dayKey(new Date(nowMs)));
      this.saveFriends();
    }
    const id = ++this.bubbleSeq;
    const end = nowMs + fr.VISIT_SECONDS * 1000;
    const here = this.friendsDoc.friends.find((f) => f.pk === friend.pk) ?? friend;
    this.set({ visitor: { id, friend: here, streak: this.state.buddyStreaks[friend.pk] ?? 0, start: nowMs, end } });
    // The diary is on disk: it says a visit happened, never whose.
    this.diary.add("system", L("Pet của một người bạn ghé chơi", "A friend's pet dropped by"));
    this.later(() => {
      if (this.state.visitor?.id === id && this.now() >= end) this.set({ visitor: null });
    }, fr.VISIT_SECONDS * 1000 + 50);
  }

  /** The moment isn't calm any more (the typing and a waiting bubble don't count: a visitor keeps still and keeps out of the bubble's way). */
  private checkVisit(): void {
    if (!this.state.visitor) return;
    const c = this.calmNow(this.now());
    if (!fr.isCalm({ ...c, typing: false, bubble: false })) this.endVisit();
  }

  /** A visitor that has only just walked in is gone at once; one that has been here walks out. */
  endVisit(): void {
    const v = this.state.visitor;
    if (!v) return;
    const nowMs = this.now();
    if (nowMs - v.start < fr.VISIT_WALK_MS) this.set({ visitor: null });
    else if (v.end - nowMs > fr.VISIT_WALK_MS) {
      const end = nowMs + fr.VISIT_WALK_MS;
      this.set({ visitor: { ...v, end } });
      // It is gone when its walk is done, with or without another beat to notice.
      this.later(() => {
        if (this.state.visitor?.id === v.id && this.now() >= end) this.set({ visitor: null });
      }, fr.VISIT_WALK_MS + 50);
    }
  }

  /** The board opened: no company while it is open, and a visitor makes way (its click opens the Friends sheet). */
  boardOpened(): void {
    this.boardIsOpen = true;
    this.checkVisit();
  }

  /** Demo: adds the two sample friends (cards made from sample data, "signed" by the demo's stand-in key, added like any pasted card). Returns how many were new. */
  async demoAddFriends(): Promise<number> {
    let added = 0;
    for (const card of fr.sampleCards(dayKey(new Date(this.now())))) {
      const out = await this.addFriendCard(demoSignedCard(card));
      if (out.ok && !out.replaced) added += 1;
    }
    return added;
  }

  /** Demo: a friend's pet drops by right now, whatever the schedule and the moment (it doesn't use up the day's visits). */
  demoVisit(): boolean {
    const today = dayKey(new Date(this.now()));
    const able = this.friendsDoc.friends.filter((f) => fr.canVisit(f, today));
    if (able.length === 0) return false;
    // A plain bubble (the demo's hello) would hide the label: clear it. A question is left alone.
    const b = this.state.bubble;
    if (b && b.actions.length === 0) this.dismissBubble(b.id, "closed");
    this.startVisit(able[Math.min(able.length - 1, Math.floor(this.random() * able.length))], this.now(), false);
    return true;
  }

  // ---------- v0.7 Always fresh: the update notice and the one-click update ----------

  /** Takes the backend's cached answer (no network): the running version and the update on offer, if any. */
  private async reloadUpdates(): Promise<void> {
    try {
      this.applyUpdateStatus(await this.backend.updates.status());
    } catch {
      // The version stays as it was (unknown at the start): nothing below depends on it.
    }
  }

  private applyUpdateStatus(st: UpdateStatus): void {
    const before = this.state.update?.version ?? null;
    this.lastUpdateStatus = st;
    // A check somebody else made (Settings' "Check now", one made before this window looked) counts for the schedule too.
    if (st.checkedAt !== null && (this.updateLog.last === null || st.checkedAt > this.updateLog.last.at)) this.updateLog.last = { at: st.checkedAt, ok: st.error === null };
    this.patchState({ version: st.current, update: st.available });
    // The tray item says "✨ Update to 0.7.1" while one is on offer.
    if ((st.available?.version ?? null) !== before) this.pushTrayLabels();
  }

  /**
   * Asks the backend for a newer release, which the backend rate-limits itself (`force` is for "Check now"): one check at
   * a time, and a failure is not an error here. It only goes in the diary and brings the next try forward to 30 minutes.
   * Other windows (Settings) are told when the answer changed.
   */
  private checkForUpdate(force: boolean): Promise<UpdateStatus | null> {
    if (this.checking) return this.checking;
    const run = (async (): Promise<UpdateStatus | null> => {
      const before = JSON.stringify(this.lastUpdateStatus);
      let st: UpdateStatus | null = null;
      let failure: string | null = null;
      try {
        st = await this.backend.updates.check(force);
        failure = st.error?.message ?? null;
      } catch (e) {
        failure = e instanceof Error ? e.message : String(e);
      }
      if (this.stopped) return st;
      this.updateLog.last = { at: this.now(), ok: failure === null };
      if (failure !== null) this.diary.add("sync", L("Không kiểm tra được bản mới: ", "Couldn't check for updates: ") + failure, { throttle: "update-check", every: 30 });
      if (st) {
        this.applyUpdateStatus(st);
        // (Not while an update installs: Settings takes "update-changed" as the end of its wait.)
        if (JSON.stringify(st) !== before && !this.state.installing) this.backend.bus.emit({ type: "update-changed" }).catch(() => undefined);
      }
      return st;
    })().finally(() => {
      this.checking = null;
    });
    this.checking = run;
    return run;
  }

  /**
   * The first start of a newer version than the one that ran last time is an update to celebrate (told at a calm moment, see
   * `tellUpdated`); the very first run only records its version, and so does a step back. Notes saved for a version that is
   * running now or behind us are dropped.
   */
  private noteVersion(): void {
    const current = this.state.version;
    if (current === null || updates.parseVersion(current) === null) return;
    const l = this.state.life;
    const outcome = updates.afterStart(l.lastVersion, current);
    if (outcome === "updated") {
      this.cheer = { version: current, notes: updates.notesFor(l.pendingNotes, current) };
      this.diary.add("system", L(`Đã cập nhật lên bản ${current} (trước đó bản ${l.lastVersion})`, `Updated to version ${current} (it was ${l.lastVersion})`));
      return;
    }
    if (outcome === "same" && !updates.notesStale(l.pendingNotes, current)) return;
    this.mutateLife((s) => {
      if (outcome !== "same") s.lastVersion = current;
      if (updates.notesStale(s.pendingNotes, current)) s.pendingNotes = null;
    }, "quiet");
  }

  /**
   * May a notice that is no reminder speak now? Only at a calm moment (the one a friend's visit waits for: no typing or zone,
   * focus session, meeting, call, full-screen app, board or waiting bubble; not muted, hidden, away, done for today), and not
   * before today's greeting. `spaced` (a notice nobody asked for) also keeps the gap between bubbles and the hold after three
   * dismissed reminders; a reply to what you did does not wait for those.
   */
  private calmForNotice(nowMs: number, spaced: boolean): boolean {
    if (this.settling || this.greetingComes(nowMs) || !fr.isCalm(this.calmNow(nowMs))) return false;
    if (!spaced) return true;
    return calm.withinBudget(new Date(this.lastBubbleAt), new Date(nowMs), this.state.prefs.bubbleGap) && !this.onHold(L("thông báo bản mới", "the new-version notice"));
  }

  /** A new version is on offer and not yet announced: said once, at a calm moment, outside the nudge budget. */
  private tellUpdate(nowMs: number): void {
    const u = this.state.update;
    if (!u || !this.state.prefs.autoUpdateCheck || !updates.shouldAnnounce(u.version, this.state.life.updateAnnounced)) return;
    if (!this.calmForNotice(nowMs, true)) return;
    this.announceUpdate(u, false);
  }

  /**
   * "There's a new version of me: 0.7.1", with the first highlights and the way to get it: **Update now** when one click
   * works, else **Download page**; and **Later**, which asks for nothing more (the chip and the tray item stay). `reply`: it
   * answers the tray's "Check for updates…" (urgent, so it shows whatever the moment). Counts as told either way.
   */
  private announceUpdate(u: AvailableUpdate, reply: boolean): void {
    const actions: BubbleAction[] = [
      u.canInstall ? { title: lines.updateNow(), primary: true, run: () => void this.installUpdate() } : { title: lines.downloadPage(), primary: true, run: () => void this.openUpdatePage() },
      { title: lines.updateLater(), neutral: true, run: () => undefined },
    ];
    const detail = lines.whatsNew(updates.highlights(u.notes));
    const bubble = {
      text: lines.updateAvailable(u.version),
      ...(detail ? { detail } : {}),
      actions,
      seconds: reply ? 60 : 45,
      urgent: reply,
      // True until it goes (the release was pulled) or the install starts (the progress takes its place).
      stillValid: () => this.state.update?.version === u.version && this.state.installing === null,
    };
    const spoke = reply
      ? this.say(bubble)
      : this.say(bubble, { why: L(`bản ${u.version} đã ra (chỉ báo một lần cho mỗi bản)`, `version ${u.version} is out (told once per version)`) });
    if (spoke) {
      this.mutateLife((s) => {
        s.updateAnnounced = u.version;
      }, "quiet");
    }
  }

  /** The first start of a newer version, told once at a calm moment: "I'm on 0.7.1 now!" with the saved highlights, and a happy pet. */
  private tellUpdated(nowMs: number): void {
    const c = this.cheer;
    if (!c || !this.calmForNotice(nowMs, false)) return;
    this.cheer = null;
    const detail = lines.whatsNew(updates.highlights(c.notes ?? ""));
    this.say({ text: lines.updated(c.version), ...(detail ? { detail } : {}), seconds: 20 }, { chime: "celebrate" });
    this.celebrateUntil = nowMs + 4000;
    this.set({ celebration: { id: ++this.bubbleSeq, kind: "dance", food: "", golden: false, combo: 0, start: nowMs } });
    this.recompute();
    this.mutateLife((s) => {
      s.lastVersion = c.version;
      if (updates.notesStale(s.pendingNotes, c.version)) s.pendingNotes = null;
    }, "quiet");
  }

  /**
   * The tray's "Check for updates…" / "✨ Update to 0.7.1": install when one is ready to install, open its page when it can't
   * be installed in one click, else ask now and answer: what it found, "you're on the newest version", or kind words.
   */
  private async updateCommand(): Promise<void> {
    if (this.state.update || this.state.installing) {
      await this.startUpdate();
      return;
    }
    // A check takes a moment (up to the backend's timeout): so the tray click never looks dead.
    this.later(() => {
      if (this.checking) this.say({ text: lines.lookingForUpdate(), seconds: 20, urgent: true, inBoard: true, stillValid: () => this.checking !== null });
    }, LOOK_AFTER_MS);
    const st = await this.checkForUpdate(true);
    if (st?.available) this.announceUpdate(st.available, true);
    // (`inBoard`: the open board does not say these by itself.)
    else this.say({ text: st && !st.error ? lines.upToDate() : lines.updateCheckFailed(), seconds: 8, urgent: true, inBoard: true });
  }

  /**
   * What a click on the board's chip (and the tray item, and Settings' button) does: install in one click when that works,
   * else open the download page. While an install runs it only brings its progress back, if you had closed it.
   */
  async startUpdate(): Promise<void> {
    if (this.state.installing) {
      this.showProgress(true);
      return;
    }
    // (Settings asks over the bus: its check may have found one that this window hasn't heard of yet.)
    if (!this.state.update) await this.reloadUpdates();
    const u = this.state.update;
    if (!u) {
      // Nothing to do after all: let Settings stop waiting.
      this.backend.bus.emit({ type: "update-changed" }).catch(() => undefined);
      return;
    }
    if (u.canInstall) {
      await this.installUpdate();
    } else {
      await this.openUpdatePage();
      // Nothing is installing: if Settings asked, it must not go on saying that the app will restart.
      this.backend.bus.emit({ type: "update-changed" }).catch(() => undefined);
    }
  }

  /** Opens the release's page (the fallback that always works). */
  private async openUpdatePage(): Promise<void> {
    try {
      await this.backend.updates.openPage();
    } catch {
      this.say({ text: lines.updatePageFailed(), seconds: 8, urgent: true, inBoard: true });
    }
  }

  /**
   * Installs the update on offer. The pet's life is saved first, with the release notes for the new version to show
   * (`life.pendingNotes`), because the app exits while the installer runs. (The preferences are not saved here: they are
   * saved the moment they change, by whoever changes them, and this window's copy could be older than Settings'.) Then the
   * bubble shows the download and the last step. If it fails, the download page is offered.
   */
  private async installUpdate(): Promise<void> {
    const u = this.state.update;
    if (!u || this.state.installing) return;
    // Each attempt hears only its own progress: a channel can deliver a message after the attempt has failed or come back, and
    // that must not bring "Installing…" back to a pet that is no longer installing (nor move a retry's bar).
    let live = true;
    this.progressBubble = null;
    this.set({ installing: { phase: "downloading", percent: null } });
    this.showProgress();
    // Settings, if it asked, now knows it was taken (and that the wait may be long).
    this.backend.bus.emit({ type: "update-installing" }).catch(() => undefined);
    this.mutateLife((s) => {
      s.pendingNotes = { version: u.version, notes: updates.shrinkNotes(u.notes) };
      s.updateAnnounced = u.version;
    }, "quiet");
    await this.saveLifeBeforeInstall();
    try {
      await this.backend.updates.install((p) => {
        if (live) this.onUpdateProgress(p);
      });
    } catch (e) {
      live = false;
      this.diary.add("system", L("Không tự cập nhật được: ", "Couldn't update by itself: ") + (e instanceof Error ? e.message : String(e)));
      this.progressBubble = null;
      this.set({ installing: null });
      this.say({
        text: lines.updateFailed(),
        actions: [{ title: lines.downloadPage(), primary: true, run: () => void this.openUpdatePage() }, { title: lines.updateLater(), neutral: true, run: () => undefined }],
        seconds: 60,
        urgent: true,
      });
      // Settings may be waiting for this one.
      this.backend.bus.emit({ type: "update-changed" }).catch(() => undefined);
      return;
    }
    live = false;
    // The real app is gone by now (the installer restarts it); the demo "restarts" in place: the same thing as a new start.
    this.progressBubble = null;
    this.set({ installing: null });
    await this.reloadUpdates();
    this.noteVersion();
  }

  /**
   * Saves the pet's life before the installer takes the app away, but waits at most `SAVE_WAIT_MS`: a disk that is slow or
   * refuses must not keep the update from starting. If the save did not finish, the install goes on and the diary says so.
   */
  private async saveLifeBeforeInstall(): Promise<void> {
    if (!this.persistLife) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const late = new Promise<"late">((resolve) => {
      timer = setTimeout(() => resolve("late"), SAVE_WAIT_MS);
    });
    const outcome = await Promise.race([this.flushLife(), late]);
    clearTimeout(timer);
    if (outcome !== true) {
      this.diary.add("system", L("Chưa lưu xong dữ liệu trước khi cập nhật (vẫn tiếp tục)", "Couldn't finish saving before the update (going on anyway)"));
    }
  }

  private onUpdateProgress(p: UpdateProgress): void {
    // (Belt and braces beside the attempt's own flag: with nothing installing there is nothing to move.)
    if (this.state.installing === null) return;
    const next: updates.Installing = p.phase === "installing" ? { phase: "installing" } : { phase: "downloading", percent: updates.percentOf(p) };
    // A download reports every chunk, but only a change of the percent is worth a render.
    if (JSON.stringify(next) === JSON.stringify(this.state.installing)) return;
    this.set({ installing: next });
    this.showProgress();
  }

  /**
   * The install's one bubble, changed in place as the download goes (a new bubble for every percent would flicker). It is
   * urgent, so no other bubble covers it. Once you close it, it stays closed; `again` (the tray item, pressed while it installs)
   * brings it back. (The board's chip is not pressable while it installs: it shows the progress itself.)
   */
  private showProgress(again = false): void {
    const i = this.state.installing;
    if (!i) return;
    const text = updates.progressText(i);
    const progress = { percent: i.phase === "installing" ? 100 : i.percent, spoken: updates.spokenProgress(i) };
    const b = this.state.bubble;
    if (b && b.id === this.progressBubble) {
      if (b.text !== text || b.progress?.percent !== progress.percent || b.progress?.spoken !== progress.spoken) this.set({ bubble: { ...b, text, progress } });
      return;
    }
    if (this.progressBubble !== null && !again) return;
    if (this.say({ text, seconds: 600, urgent: true, progress, stillValid: () => this.state.installing !== null }, { silent: true })) {
      this.progressBubble = this.state.bubble?.id ?? null;
    }
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
      if (next) this.say({ text: lines.parade(next, this.phrase), actions, seconds: 25, urgent: true }, { chime: "grumble", why, antic: true });
    } else if (kind === "block") {
      this.startAntic({ type: "block" }, now);
      this.say({ text: lines.block(this.currentDistraction()?.app ?? "YouTube", next, this.phrase), actions, seconds: 25, urgent: true }, { chime: "grumble", why, antic: true });
    } else {
      this.startAntic({ type: "grumble" }, now);
      if (next) this.say({ text: lines.grumble(next, this.phrase), actions, seconds: 15, urgent: true }, { chime: "grumble", why, antic: true });
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
    const overId = `demo-over-${nowMs}`;
    this.addDemoEvent({ id: overId, title: L("Họp kế hoạch quý", "Q4 planning"), start: new Date(nowMs - 31 * MIN), end: new Date(nowMs - MIN), joinUrl: null });
    // As if you had been there, so the question can show.
    this.meetingTracks.set(overId, { before: null, attended: true, closed: true, held: false, since: nowMs - MIN });
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
    this.tellNotes(nowMs, true);
  }

  /** Demo: open the Wrap up sheet, whatever the hour. */
  demoWrapUp(): void {
    this.effects.openWrapUp?.();
  }

  /** Demo: the end-of-day review bubble now, past the gap between bubbles and the hour (it opens the Wrap up sheet). */
  demoReview(): void {
    this.set({ bubble: null });
    this.sayReview();
  }

  /** Demo: Saturdays and Sundays are days off as in real life, so a Friday's "tomorrow" is Monday. */
  setDemoWeekends(on: boolean): void {
    if (this.demoWeekends === on) return;
    this.demoWeekends = on;
    this.recompute();
  }

  /** Demo: when "the next morning" is: 8:20 on the next workday (Monday after a Friday, with weekends on). */
  nextMorning(): number {
    return nextWorkdayStart(this.now(), this.state.prefs.workStart, this.workdayOn) + 20 * MIN;
  }

  /**
   * Demo: show the overbooked warning for the day as it stands (the demo panel makes the day heavy first, or light
   * again with `on` false), without waiting for the once-a-day check.
   */
  async demoOverbooked(on = true): Promise<void> {
    this.clearForDemo();
    await this.refresh();
    if (!on) return;
    const load = this.currentLoad();
    if (load.capacity > 0 && isOverbooked(load)) this.sayOverbooked(load);
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
