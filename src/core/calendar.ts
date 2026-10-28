// Meetings from ICS links (Google "secret address in iCal format", Outlook "Publish calendar", iCloud)
// and the calendar arithmetic of the macOS app (CalendarMath in CalendarWatcher.swift).
import ICAL from "ical.js";
import { dueTime, isRecurring, type TodoTask } from "./models";

export interface CalEvent {
  id: string;
  title: string;
  start: Date;
  end: Date;
  joinUrl: string | null;
}

export interface SlotSuggestion {
  task: TodoTask;
  start: Date;
  end: Date;
}

interface Interval {
  start: number;
  end: number;
}

const MEETING_HOSTS = ["zoom.us", "meet.google.com", "teams.microsoft.com", "teams.live.com", "webex.com", "whereby.com"];

const isMeetingHost = (url: string) => {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return MEETING_HOSTS.some((h) => host === h || host.endsWith(`.${h}`));
  } catch {
    return false;
  }
};

/** Finds a video-call link in the event URL, location or notes; falls back to the event URL. */
export function joinUrl(url: string | null, texts: (string | null | undefined)[]): string | null {
  if (url && isMeetingHost(url)) return url;
  for (const text of texts) {
    if (!text) continue;
    for (const m of text.matchAll(/https?:\/\/[^\s<>"']+/g)) {
      if (isMeetingHost(m[0])) return m[0];
    }
  }
  return url;
}

const propText = (c: ICAL.Component, name: string): string | null => {
  const v = c.getFirstPropertyValue(name);
  return typeof v === "string" ? v : v == null ? null : String(v);
};

/**
 * Today's timed, busy, non-cancelled events from ICS documents, sorted by start.
 * Recurring series are expanded (with their moved/cancelled exceptions); all-day and "free" events are skipped.
 */
export function eventsOnDay(icsTexts: string[], day: Date): CalEvent[] {
  const dayStart = new Date(day.getFullYear(), day.getMonth(), day.getDate()).getTime();
  const dayEnd = new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1).getTime();
  const out: CalEvent[] = [];

  for (const text of icsTexts) {
    let root: ICAL.Component;
    try {
      root = new ICAL.Component(ICAL.parse(text));
    } catch {
      continue;
    }
    for (const tz of root.getAllSubcomponents("vtimezone")) {
      try {
        ICAL.TimezoneService.register(tz);
      } catch {
        // A broken VTIMEZONE only affects that zone's events, which then read as floating (local) time.
      }
    }
    const masters = new Map<string, ICAL.Event>();
    const exceptions: ICAL.Event[] = [];
    for (const v of root.getAllSubcomponents("vevent")) {
      const e = new ICAL.Event(v);
      if (e.isRecurrenceException()) exceptions.push(e);
      else masters.set(e.uid, e);
    }
    for (const ex of exceptions) {
      const master = masters.get(ex.uid);
      if (master) master.relateException(ex);
      else masters.set(`${ex.uid}#${ex.recurrenceId?.toString()}`, ex);
    }

    for (const event of masters.values()) {
      const consider = (item: ICAL.Event, start: ICAL.Time, end: ICAL.Time) => {
        if (start.isDate) return;
        const c = item.component;
        if ((propText(c, "status") ?? "").toUpperCase() === "CANCELLED") return;
        if ((propText(c, "transp") ?? "").toUpperCase() === "TRANSPARENT") return;
        const s = start.toJSDate().getTime();
        const e = Math.max(end.toJSDate().getTime(), s);
        if (e <= dayStart || s >= dayEnd) return;
        out.push({
          id: `${item.uid}@${s}`,
          title: item.summary ?? "",
          start: new Date(s),
          end: new Date(e),
          joinUrl: joinUrl(propText(c, "url"), [propText(c, "x-google-conference"), item.location, item.description]),
        });
      };
      try {
        if (!event.isRecurring()) {
          consider(event, event.startDate, event.endDate);
          continue;
        }
        const it = event.iterator();
        for (let next = it.next(), guard = 0; next && guard < 20_000; next = it.next(), guard++) {
          const d = event.getOccurrenceDetails(next);
          if (d.startDate.toJSDate().getTime() >= dayEnd) break;
          consider(d.item, d.startDate, d.endDate);
        }
      } catch {
        // One malformed event never hides the rest of the calendar.
      }
    }
  }
  const seen = new Set<string>();
  return out
    .filter((e) => (seen.has(e.id) ? false : (seen.add(e.id), true)))
    .sort((a, b) => a.start.getTime() - b.start.getTime());
}

/** Busy intervals clipped to [from, to] and merged when they overlap. */
export function busy(events: CalEvent[], from: Date, to: Date): Interval[] {
  const clipped = events
    .map((e) => ({ start: Math.max(e.start.getTime(), from.getTime()), end: Math.min(e.end.getTime(), to.getTime()) }))
    .filter((i) => i.start < i.end)
    .sort((a, b) => a.start - b.start);
  const merged: Interval[] = [];
  for (const i of clipped) {
    const last = merged[merged.length - 1];
    if (last && i.start <= last.end) last.end = Math.max(last.end, i.end);
    else merged.push({ ...i });
  }
  return merged;
}

export function freeSlots(events: CalEvent[], from: Date, to: Date, minMinutes = 30): Interval[] {
  if (from >= to) return [];
  const min = minMinutes * 60_000;
  const slots: Interval[] = [];
  let cursor = from.getTime();
  for (const b of busy(events, from, to)) {
    if (b.start - cursor >= min) slots.push({ start: cursor, end: b.start });
    cursor = Math.max(cursor, b.end);
  }
  if (to.getTime() - cursor >= min) slots.push({ start: cursor, end: to.getTime() });
  return slots;
}

export function freeMinutes(events: CalEvent[], from: Date, to: Date): number {
  if (from >= to) return 0;
  const busyMs = busy(events, from, to).reduce((sum, i) => sum + (i.end - i.start), 0);
  return (to.getTime() - from.getTime() - busyMs) / 60_000;
}

/** About one meaningful task per 2 free hours, capped by the user's daily target. */
export function adaptiveTarget(free: number, maxTarget: number): number {
  return Math.max(1, Math.min(maxTarget, Math.ceil(free / 120)));
}

export const currentEvent = (events: CalEvent[], now: Date) => events.find((e) => e.start <= now && now < e.end) ?? null;
export const nextEvent = (events: CalEvent[], now: Date) => events.find((e) => e.start > now) ?? null;

/** Places the top tasks (without a time yet) into today's next free slots. */
export function suggestSlots(tasks: TodoTask[], events: CalEvent[], now: Date, dayEnd: Date, limit = 3): SlotSuggestion[] {
  const quarter = 15 * 60_000;
  const start = new Date(Math.ceil(now.getTime() / quarter) * quarter);
  const slots = freeSlots(events, start, dayEnd, 30);
  const out: SlotSuggestion[] = [];
  for (const task of tasks) {
    if (dueTime(task) || isRecurring(task)) continue;
    if (out.length >= limit) break;
    const wanted = (task.durationMinutes ?? 60) * 60_000;
    const i = slots.findIndex((s) => s.end - s.start >= Math.min(wanted, 30 * 60_000));
    if (i < 0) break;
    const slot = slots[i];
    const end = slot.start + Math.min(wanted, slot.end - slot.start);
    out.push({ task, start: new Date(slot.start), end: new Date(end) });
    const rest = end + 10 * 60_000;
    if (rest < slot.end) slots[i] = { start: rest, end: slot.end };
    else slots.splice(i, 1);
  }
  return out;
}
