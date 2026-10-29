// Date parsing, calendar-day math and text cleanup (DateParse, DayMath and TextClean in Models.swift).
// Everything is local time, like Swift's Calendar.current.
import { L } from "./l10n";

// "2026-10-25T02:00:00Z" or "2026-10-25T09:00:00+07:00" (fractional seconds already stripped).
const ABSOLUTE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(Z|[+-]\d{2}:\d{2})$/;
// "2026-10-25", "2026-10-25T09:30" and "2026-10-25T09:30:00": floating, so local time.
const FLOATING = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2}))?)?$/;

const isLeap = (y: number) => y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0);
const daysInMonth = (y: number, m: number) => [31, isLeap(y) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1];
const pad = (n: number, width = 2) => String(n).padStart(width, "0");

function validParts(y: number, mo: number, d: number, h: number, mi: number, s: number): boolean {
  return mo >= 1 && mo <= 12 && d >= 1 && d <= daysInMonth(y, mo) && h <= 23 && mi <= 59 && s <= 59;
}

/**
 * Parses every date shape Todoist returns: "2026-10-25", "2026-10-25T09:00:00" (floating, local time),
 * "2026-10-25T02:00:00Z" and "2026-10-25T02:00:00.123456Z". Returns null for anything else.
 */
export function parseDate(raw: string | null | undefined): Date | null {
  if (typeof raw !== "string") return null;
  const s = raw.trim().replace(/\.\d+/g, "");

  const abs = ABSOLUTE.exec(s);
  if (abs) {
    const [y, mo, d, h, mi, sec] = abs.slice(1, 7).map(Number);
    let offsetMinutes = 0;
    if (abs[7] !== "Z") {
      const [oh, om] = abs[7].slice(1).split(":").map(Number);
      if (oh > 23 || om > 59) return null;
      offsetMinutes = (abs[7][0] === "-" ? -1 : 1) * (oh * 60 + om);
    }
    if (!validParts(y, mo, d, h, mi, sec)) return null;
    const date = new Date(0);
    date.setUTCFullYear(y, mo - 1, d);
    date.setUTCHours(h, mi, sec, 0);
    return new Date(date.getTime() - offsetMinutes * 60_000);
  }

  const flo = FLOATING.exec(s);
  if (flo) {
    const [y, mo, d, h, mi, sec] = flo.slice(1, 7).map((part) => Number(part ?? 0));
    if (!validParts(y, mo, d, h, mi, sec)) return null;
    const date = new Date(2000, 0, 1);
    date.setFullYear(y, mo - 1, d);
    date.setHours(h, mi, sec, 0);
    return date;
  }
  return null;
}

/** "2026-10-25T02:00:00Z" (UTC, whole seconds), the form the Todoist API takes for since/until. */
export function utcString(date: Date): string {
  return `${date.toISOString().slice(0, 19)}Z`;
}

/** "2026-10-25" for the local calendar day of `date`. */
export function dayKey(date: Date): string {
  return `${pad(date.getFullYear(), 4)}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** A copy of `date` set to hour:minute:00 on the same local day; hour 24 is the next midnight (work ending at 24:00). */
export function atHour(hour: number, minute: number, date: Date): Date {
  const result = new Date(date.getTime());
  result.setHours(Math.min(Math.max(hour, 0), 24), minute, 0, 0);
  return result;
}

export function startOfDay(date: Date): Date {
  return atHour(0, 0, date);
}

/** Whole calendar days from day key `a` to day key `b` ("yyyy-MM-dd"); 0 when either does not parse. */
export function daysBetween(a: string, b: string): number {
  const x = parseDate(a);
  const y = parseDate(b);
  if (!x || !y) return 0;
  const dayNumber = (d: Date) => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86_400_000;
  return dayNumber(y) - dayNumber(x);
}

/** "yesterday" / "3 days ago" for an overdue "yyyy-MM-dd". */
export function daysAgo(day: string, now: Date = new Date()): string {
  const n = daysBetween(day, dayKey(now));
  if (n === 1) return L("hôm qua", "yesterday");
  return L(`${n} ngày trước`, `${n} days ago`);
}

/** 24-hour "HH:MM" in local time. */
export function timeString(date: Date): string {
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** The day key after `key`; "9999" when `key` does not parse (as in the Swift app). */
export function nextDayKey(key: string): string {
  const date = parseDate(key);
  if (!date) return "9999";
  // Noon, so a daylight-saving jump can never skip or repeat the day.
  return dayKey(new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1, 12));
}

/** The day key `n` days after `key` (before it when negative); "9999" when `key` does not parse. */
export function addDays(key: string, n: number): string {
  const date = parseDate(key);
  if (!date) return "9999";
  return dayKey(new Date(date.getFullYear(), date.getMonth(), date.getDate() + n, 12));
}

/** True for a real "yyyy-MM-dd" day ("2026-02-30" and "2026-11-2" are not). */
export const isDayKey = (x: unknown): x is string => typeof x === "string" && /^\d{4}-\d{2}-\d{2}$/.test(x) && parseDate(x) !== null;

/** Strips Todoist markdown so titles read nicely in bubbles. */
export function plainText(s: string): string {
  return s
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/\*\*|__|`/g, "")
    .trim();
}

const graphemes = new Intl.Segmenter("und", { granularity: "grapheme" });

/** `s` when it has at most `max` graphemes, else its first max − 1 graphemes and an ellipsis. */
export function shortText(s: string, max = 42): string {
  if (s.length <= max) return s;
  const parts = Array.from(graphemes.segment(s), (part) => part.segment);
  if (parts.length <= max) return s;
  return `${parts.slice(0, Math.max(max - 1, 0)).join("")}…`;
}

/** "1h", "2h30" for a number of minutes. */
export function hoursText(minutes: number): string {
  const m = Math.round(minutes);
  return m % 60 === 0 ? `${Math.floor(m / 60)}h` : `${Math.floor(m / 60)}h${pad(m % 60)}`;
}
