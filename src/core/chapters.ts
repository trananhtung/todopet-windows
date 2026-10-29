// Weekly chapters (v0.5): what each week brought (tasks, stickers, trips), the Monday fresh start, and the diary's
// week headers. Pure; weeks start on Monday and are keyed by that Monday's day key.
import { addDays, dayKey, parseDate } from "./dates";
import type { DiaryEntry } from "./diary";
import { L, plural } from "./l10n";

export interface WeekStats {
  /** The Monday ("yyyy-MM-dd"); "" before the first counted day. */
  key: string;
  done: number;
  stickers: number;
  trips: number;
}

/** What these rules read and change in the pet's life (LifeState has these fields). */
export interface WeekHolder {
  week: WeekStats;
  lastWeek: WeekStats | null;
  /** The week whose fresh-start line was said ("" never). */
  weekGreeted: string;
}

export const emptyWeek = (key = ""): WeekStats => ({ key, done: 0, stickers: 0, trips: 0 });

/** The Monday's day key of the week holding `date` (a Date or a day key). */
export function weekKey(date: Date | string): string {
  const d = typeof date === "string" ? parseDate(date) : date;
  if (!d) return "";
  // Noon, so a daylight-saving jump can never move the day.
  return dayKey(new Date(d.getFullYear(), d.getMonth(), d.getDate() - ((d.getDay() + 6) % 7), 12));
}

/** Turns to `day`'s week if it is newer. Last week is kept only when it is the one just before. */
export function rollWeek(s: WeekHolder, day: string): void {
  const key = weekKey(day);
  if (!key || key <= s.week.key) return;
  if (s.week.key) s.lastWeek = s.week.key === addDays(key, -7) ? s.week : null;
  s.week = emptyWeek(key);
}

/** Counts `n` for `day` into its week: this week (turning the page if needed) or last week; older weeks are gone. */
export function countWeek(s: WeekHolder, day: string, field: "done" | "stickers" | "trips", n = 1): void {
  const key = weekKey(day);
  if (!key) return;
  rollWeek(s, day);
  const w = s.week.key === key ? s.week : s.lastWeek?.key === key ? s.lastWeek : null;
  if (w) w[field] = Math.max(0, w[field] + n);
}

/**
 * The first greeting of a week: returns last week (null when there's nothing to look back on) when the fresh-start
 * line is due, and marks the week as greeted. The very first week with the app has no fresh start.
 */
export function takeFreshStart(s: WeekHolder, today: string): { last: WeekStats | null } | null {
  rollWeek(s, today);
  if (!s.week.key || s.weekGreeted === s.week.key) return null;
  const due = s.weekGreeted !== "" || s.lastWeek !== null;
  s.weekGreeted = s.week.key;
  return due ? { last: s.lastWeek } : null;
}

/** "12 tasks · 2 stickers · 1 trip", leaving out what's zero; "" for an empty week. */
export function weekRecap(w: WeekStats | null): string {
  if (!w) return "";
  const parts: string[] = [];
  if (w.done > 0) parts.push(plural(w.done, "việc", "task", "tasks"));
  if (w.stickers > 0) parts.push(plural(w.stickers, "sticker", "sticker", "stickers"));
  if (w.trips > 0) parts.push(plural(w.trips, "chuyến đi", "trip", "trips"));
  return parts.join(" · ");
}

const count = (x: unknown) => (typeof x === "number" && Number.isFinite(x) ? Math.max(0, Math.trunc(x)) : 0);

/** A saved week, or null when it doesn't look like one. */
export function weekFromJson(x: unknown): WeekStats | null {
  if (!x || typeof x !== "object") return null;
  const r = x as Record<string, unknown>;
  if (typeof r.key !== "string" || (r.key !== "" && weekKey(r.key) !== r.key)) return null;
  return { key: r.key, done: count(r.done), stickers: count(r.stickers), trips: count(r.trips) };
}

export interface WeekChapter {
  /** The Monday and the Sunday ("yyyy-MM-dd"). */
  key: string;
  end: string;
  /** In the order given. */
  entries: DiaryEntry[];
  done: number;
  stickers: number;
  trips: number;
  /** "12 tasks · 2 stickers · 1 trip", or a kind word for a quiet week. */
  recap: string;
}

/**
 * Groups diary entries by week, newest week first, with a one-line recap from their tags: "done" / "undone"
 * (`count` tasks), "sticker" (counted for the day it is about) and "postcard" (a trip).
 */
export function weekChapters(entries: readonly DiaryEntry[]): WeekChapter[] {
  const byKey = new Map<string, WeekChapter>();
  const chapter = (key: string) => {
    let c = byKey.get(key);
    if (!c) {
      c = { key, end: addDays(key, 6), entries: [], done: 0, stickers: 0, trips: 0, recap: "" };
      byKey.set(key, c);
    }
    return c;
  };
  for (const e of entries) chapter(weekKey(new Date(e.at))).entries.push(e);
  for (const e of entries) {
    const c = byKey.get(weekKey(e.day ?? new Date(e.at)));
    if (!c) continue;
    const n = e.count ?? 1;
    if (e.tag === "done") c.done += n;
    else if (e.tag === "undone") c.done = Math.max(0, c.done - n);
    else if (e.tag === "sticker") c.stickers += 1;
    else if (e.tag === "postcard") c.trips += 1;
  }
  const out = [...byKey.values()].sort((a, b) => (a.key < b.key ? 1 : -1));
  for (const c of out) c.recap = weekRecap(c) || L("Một tuần nhẹ nhàng 🌿", "A quiet week 🌿");
  return out;
}
