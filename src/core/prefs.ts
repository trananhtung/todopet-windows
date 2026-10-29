// User preferences (Prefs.swift). Stored as JSON through the Backend; the Todoist token lives in Credential Manager.
import { addDays, dayKey, isDayKey } from "./dates";
import type { Lang, SpeciesId } from "./types";
import { SPECIES_IDS } from "./types";

export type SoundMode = "off" | "important" | "all";

export interface Prefs {
  /** null = follow the Windows display language. */
  lang: Lang | null;
  petName: string;
  species: SpeciesId;
  /** How many tasks to plan each day (the "Rule of 3"). */
  dailyTarget: number;
  workStart: number;
  workEnd: number;
  /** After this hour the pet worries (and offers to help plan every 30 minutes) if today isn't planned yet. */
  planDeadline: number;
  remindEvery: number;
  focusMinutes: number;
  breakMinutes: number;
  /** Todoist filter that defines "my day". */
  filterQuery: string;
  /** Comma-separated app names that count as distractions. */
  distractionApps: string;
  /** Comma-separated sites ("youtube.com") or address parts ("youtube.com/shorts"). */
  distractionSites: string;
  watchBrowsers: boolean;
  soundMode: SoundMode;
  workSaturday: boolean;
  workSunday: boolean;
  petScale: number;
  chaseWhenAngry: boolean;
  useCalendar: boolean;
  /** Lower the daily target on meeting-heavy days. */
  adaptTarget: boolean;
  meetingLead: number;
  /** After this many days on your list, a task counts as "keeps getting postponed". */
  stuckDays: number;
  claudeModel: string;
  /** Playful mischief (a grumble, a sign parade, a table flip), only while you're on a distracting app or site. */
  antics: boolean;
  /** Say some lines out loud with a Windows voice. */
  voiceOn: boolean;
  /** Hold non-urgent bubbles while you're typing steadily ("in the zone"). */
  protectFlow: boolean;
  /** Keep the pet still while you type. */
  stillWhileTyping: boolean;
  /** Minutes a task counts for when Todoist has no duration for it (15–120): sizes the day for the overbooked warning. */
  defaultEstimate: number;
  /** Minimum minutes between two unsolicited bubbles. */
  bubbleGap: number;
  /** The most unsolicited, non-urgent reminders per day (0–30); check-ins, urgent bubbles and replies are free. */
  nudgeBudget: number;
  /** Keep the pet's diary (on this PC only, 14 days). */
  keepLog: boolean;
  /** Hide the pet while a full-screen app is in front. */
  hideInFullscreen: boolean;
  /** The "where was I?" card may name the page you were on and offer to reopen it; off, it shows only the task and the app. */
  resumeDetails: boolean;
  /** Epoch ms of the first launch; day one never starts with a worried pet. */
  firstLaunch: number;
  /** Days off ("yyyy-MM-dd", sorted): no workday, so no reminders; missing one never hurts the streak, and tasks finished still count. */
  restDays: string[];
}

export const DEFAULT_FILTER = "today | overdue";
export const DEFAULT_CLAUDE_MODEL = "claude-opus-5-5";

export function defaultPrefs(now = Date.now()): Prefs {
  return {
    lang: null,
    petName: "Mochi",
    species: "mochi",
    dailyTarget: 3,
    workStart: 8,
    workEnd: 18,
    planDeadline: 10,
    remindEvery: 45,
    focusMinutes: 25,
    breakMinutes: 5,
    filterQuery: DEFAULT_FILTER,
    distractionApps: "TikTok, Netflix, Steam, Discord",
    distractionSites: "youtube.com, facebook.com, tiktok.com, instagram.com, x.com, reddit.com, netflix.com",
    watchBrowsers: true,
    soundMode: "important",
    workSaturday: false,
    workSunday: false,
    petScale: 1,
    chaseWhenAngry: true,
    useCalendar: true,
    adaptTarget: true,
    meetingLead: 5,
    stuckDays: 3,
    claudeModel: DEFAULT_CLAUDE_MODEL,
    antics: true,
    voiceOn: false,
    protectFlow: true,
    stillWhileTyping: true,
    defaultEstimate: 30,
    bubbleGap: 15,
    nudgeBudget: 8,
    keepLog: true,
    hideInFullscreen: true,
    resumeDetails: true,
    firstLaunch: now,
    restDays: [],
  };
}

export const MAX_REST_DAYS = 60;
/** The longest range Settings adds in one go. */
export const MAX_REST_RANGE = 30;

/** Valid day keys, deduped and sorted; yesterday is kept (it still gets settled), older days go. At most `max`, the nearest. */
export function tidyRestDays(raw: unknown, now = Date.now(), max = MAX_REST_DAYS): string[] {
  if (!Array.isArray(raw)) return [];
  const yesterday = addDays(dayKey(new Date(now)), -1);
  return [...new Set(raw.filter(isDayKey))]
    .filter((k) => k >= yesterday)
    .sort()
    .slice(0, max);
}

/**
 * Adds `days` to the rest days: what to store, how many of them are new, and how many days (new or already there)
 * the 60-day cap left out. The nearest days are kept.
 */
export function addRestDays(current: readonly string[], days: readonly string[], now = Date.now()): { restDays: string[]; added: number; cut: number } {
  const all = tidyRestDays([...current, ...days], now, Infinity);
  const restDays = all.slice(0, MAX_REST_DAYS);
  const before = new Set(current);
  return { restDays, added: restDays.filter((d) => !before.has(d)).length, cut: all.length - restDays.length };
}

/** Every day from `from` to `to` (either order), at most `max` of them; [] when either does not parse. */
export function dayRange(from: string, to: string, max = MAX_REST_RANGE): string[] {
  if (!isDayKey(from) || !isDayKey(to)) return [];
  const [a, b] = from <= to ? [from, to] : [to, from];
  const out: string[] = [];
  for (let k = a; k <= b && out.length < max; k = addDays(k, 1)) out.push(k);
  return out;
}

const clampInt = (v: unknown, lo: number, hi: number, d: number) =>
  typeof v === "number" && Number.isFinite(v) ? Math.min(hi, Math.max(lo, Math.round(v))) : d;

/**
 * Merges stored JSON over the defaults, ignoring unknown keys and wrong types. `now` stands in for a missing
 * `firstLaunch`; `today` (epoch ms) decides which rest days are past.
 */
export function prefsFromJson(raw: unknown, now = Date.now(), today = now): Prefs {
  const d = defaultPrefs(now);
  if (!raw || typeof raw !== "object") return d;
  const r = raw as Record<string, unknown>;
  const str = (k: keyof Prefs) => (typeof r[k] === "string" ? (r[k] as string) : (d[k] as string));
  const bool = (k: keyof Prefs) => (typeof r[k] === "boolean" ? (r[k] as boolean) : (d[k] as boolean));
  return {
    lang: r.lang === "en" || r.lang === "vi" ? r.lang : null,
    petName: str("petName").trim().slice(0, 24) || d.petName,
    species: (SPECIES_IDS as readonly string[]).includes(r.species as string) ? (r.species as SpeciesId) : d.species,
    dailyTarget: clampInt(r.dailyTarget, 1, 10, d.dailyTarget),
    workStart: clampInt(r.workStart, 0, 23, d.workStart),
    workEnd: clampInt(r.workEnd, 1, 24, d.workEnd),
    planDeadline: clampInt(r.planDeadline, 0, 23, d.planDeadline),
    remindEvery: clampInt(r.remindEvery, 10, 240, d.remindEvery),
    focusMinutes: clampInt(r.focusMinutes, 5, 120, d.focusMinutes),
    breakMinutes: clampInt(r.breakMinutes, 1, 60, d.breakMinutes),
    filterQuery: str("filterQuery"),
    distractionApps: str("distractionApps"),
    distractionSites: str("distractionSites"),
    watchBrowsers: bool("watchBrowsers"),
    soundMode: r.soundMode === "off" || r.soundMode === "important" || r.soundMode === "all" ? r.soundMode : d.soundMode,
    workSaturday: bool("workSaturday"),
    workSunday: bool("workSunday"),
    petScale: typeof r.petScale === "number" && r.petScale >= 0.6 && r.petScale <= 1.8 ? r.petScale : d.petScale,
    chaseWhenAngry: bool("chaseWhenAngry"),
    useCalendar: bool("useCalendar"),
    adaptTarget: bool("adaptTarget"),
    meetingLead: clampInt(r.meetingLead, 1, 30, d.meetingLead),
    stuckDays: clampInt(r.stuckDays, 2, 14, d.stuckDays),
    claudeModel: str("claudeModel"),
    antics: bool("antics"),
    voiceOn: bool("voiceOn"),
    protectFlow: bool("protectFlow"),
    stillWhileTyping: bool("stillWhileTyping"),
    defaultEstimate: clampInt(r.defaultEstimate, 15, 120, d.defaultEstimate),
    bubbleGap: clampInt(r.bubbleGap, 0, 120, d.bubbleGap),
    nudgeBudget: clampInt(r.nudgeBudget, 0, 30, d.nudgeBudget),
    keepLog: bool("keepLog"),
    hideInFullscreen: bool("hideInFullscreen"),
    resumeDetails: bool("resumeDetails"),
    firstLaunch: typeof r.firstLaunch === "number" ? r.firstLaunch : d.firstLaunch,
    restDays: tidyRestDays(r.restDays, today),
  };
}

export const effectiveFilter = (p: Prefs) => p.filterQuery.trim() || DEFAULT_FILTER;
export const effectiveClaudeModel = (p: Prefs) => p.claudeModel.trim() || DEFAULT_CLAUDE_MODEL;

export const isRestDay = (p: Prefs, date: Date) => p.restDays.includes(dayKey(date));

export function isWorkday(p: Prefs, date: Date): boolean {
  if (isRestDay(p, date)) return false;
  const wd = date.getDay();
  if (wd === 6) return p.workSaturday;
  if (wd === 0) return p.workSunday;
  return true;
}
