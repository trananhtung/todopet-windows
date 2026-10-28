// User preferences (Prefs.swift). Stored as JSON through the Backend; the Todoist token lives in Credential Manager.
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
  /** After this hour the pet gets grumpy if today isn't planned yet. */
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
  /** ICS links, one per line. */
  calendarUrls: string;
  useCalendar: boolean;
  /** Lower the daily target on meeting-heavy days. */
  adaptTarget: boolean;
  meetingLead: number;
  /** After this many days on your list, a task counts as "keeps getting postponed". */
  stuckDays: number;
  claudeModel: string;
  /** Escalating mischief when you slack off. */
  antics: boolean;
  /** Say some lines out loud with a Windows voice. */
  voiceOn: boolean;
  /** Hold non-urgent bubbles while you're typing steadily ("in the zone"). */
  protectFlow: boolean;
  /** Keep the pet still while you type. */
  stillWhileTyping: boolean;
  /** Minimum minutes between two unsolicited bubbles. */
  bubbleGap: number;
  /** Keep the pet's diary (on this PC only, 14 days). */
  keepLog: boolean;
  /** Hide the pet while a full-screen app is in front. */
  hideInFullscreen: boolean;
  /** Epoch ms of the first launch; day one never starts with a grumpy pet. */
  firstLaunch: number;
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
    calendarUrls: "",
    useCalendar: true,
    adaptTarget: true,
    meetingLead: 5,
    stuckDays: 3,
    claudeModel: DEFAULT_CLAUDE_MODEL,
    antics: true,
    voiceOn: false,
    protectFlow: true,
    stillWhileTyping: true,
    bubbleGap: 15,
    keepLog: true,
    hideInFullscreen: true,
    firstLaunch: now,
  };
}

const clampInt = (v: unknown, lo: number, hi: number, d: number) =>
  typeof v === "number" && Number.isFinite(v) ? Math.min(hi, Math.max(lo, Math.round(v))) : d;

/** Merges stored JSON over the defaults, ignoring unknown keys and wrong types. */
export function prefsFromJson(raw: unknown, now = Date.now()): Prefs {
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
    calendarUrls: str("calendarUrls"),
    useCalendar: bool("useCalendar"),
    adaptTarget: bool("adaptTarget"),
    meetingLead: clampInt(r.meetingLead, 1, 30, d.meetingLead),
    stuckDays: clampInt(r.stuckDays, 2, 14, d.stuckDays),
    claudeModel: str("claudeModel"),
    antics: bool("antics"),
    voiceOn: bool("voiceOn"),
    protectFlow: bool("protectFlow"),
    stillWhileTyping: bool("stillWhileTyping"),
    bubbleGap: clampInt(r.bubbleGap, 0, 120, d.bubbleGap),
    keepLog: bool("keepLog"),
    hideInFullscreen: bool("hideInFullscreen"),
    firstLaunch: typeof r.firstLaunch === "number" ? r.firstLaunch : d.firstLaunch,
  };
}

export const effectiveFilter = (p: Prefs) => p.filterQuery.trim() || DEFAULT_FILTER;
export const effectiveClaudeModel = (p: Prefs) => p.claudeModel.trim() || DEFAULT_CLAUDE_MODEL;

export function isWorkday(p: Prefs, date: Date): boolean {
  const wd = date.getDay();
  if (wd === 6) return p.workSaturday;
  if (wd === 0) return p.workSunday;
  return true;
}

/** ICS links from the settings text (one per line or comma-separated), only https:// and webcal://. */
export function calendarLinks(p: Prefs): string[] {
  return p.calendarUrls
    .split(/[\n,]/)
    .map((s) => s.trim())
    .filter((s) => /^(https|webcal):\/\//i.test(s))
    .slice(0, 10);
}
