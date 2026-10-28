// Pure helpers behind the Diary window: filter groups, day labels. Unit-tested in model.test.ts.
import { dayKey, nextDayKey, parseDate } from "../core/dates";
import type { DiaryEntry, DiaryKind } from "../core/diary";
import { L } from "../core/l10n";
import type { Lang } from "../core/types";
import { localeTag } from "../ui/lang";

export const FILTER_IDS = ["reminders", "responses", "held", "focus", "mood", "distraction", "life", "meetings", "system"] as const;
export type FilterId = (typeof FILTER_IDS)[number];

/** Which diary kinds each filter chip shows. Every kind belongs to exactly one chip. */
export const FILTER_KINDS: Readonly<Record<FilterId, readonly DiaryKind[]>> = {
  reminders: ["bubble", "antic"],
  responses: ["response"],
  held: ["hold"],
  focus: ["focus", "flow"],
  mood: ["mood"],
  distraction: ["distraction"],
  life: ["life"],
  meetings: ["meeting"],
  system: ["sync", "system"],
};

export function filterLabel(id: FilterId): string {
  switch (id) {
    case "reminders":
      return L("Lời nhắc", "Reminders");
    case "responses":
      return L("Phản hồi", "Responses");
    case "held":
      return L("Giữ lại", "Held back");
    case "focus":
      return L("Tập trung", "Focus");
    case "mood":
      return L("Tâm trạng", "Mood");
    case "distraction":
      return L("Xao nhãng", "Distractions");
    case "life":
      return L("Ăn uống & lớn lên", "Pet life");
    case "meetings":
      return L("Cuộc họp", "Meetings");
    case "system":
      return L("Hệ thống", "System");
  }
}

export function filterOf(kind: DiaryKind): FilterId {
  for (const id of FILTER_IDS) if (FILTER_KINDS[id].includes(kind)) return id;
  return "system";
}

/** Entries whose kind is in one of the active filters; no active filter = everything. */
export function filterEntries(entries: readonly DiaryEntry[], active: ReadonlySet<FilterId>): DiaryEntry[] {
  if (active.size === 0) return [...entries];
  return entries.filter((e) => active.has(filterOf(e.kind)));
}

export function countByFilter(entries: readonly DiaryEntry[]): Record<FilterId, number> {
  const counts = Object.fromEntries(FILTER_IDS.map((id) => [id, 0])) as Record<FilterId, number>;
  for (const e of entries) counts[filterOf(e.kind)]++;
  return counts;
}

/** The days to list, newest first, always starting with today (so today's empty diary is reachable). */
export function withToday(days: readonly string[], today: string): string[] {
  const set = new Set(days.filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)));
  set.add(today);
  return [...set].sort().reverse();
}

/** Title and subtitle for a day: "Today" / "Yesterday" / weekday, and the date. */
export function dayLabel(day: string, today: string, lang: Lang): { title: string; date: string } {
  const date = parseDate(day);
  if (!date) return { title: day, date: "" };
  const tag = localeTag(lang);
  const short = date.toLocaleDateString(tag, { day: "numeric", month: "short" });
  if (day === today) return { title: L("Hôm nay", "Today"), date: short };
  if (nextDayKey(day) === today) return { title: L("Hôm qua", "Yesterday"), date: short };
  const weekday = date.toLocaleDateString(tag, { weekday: "long" });
  return { title: weekday.charAt(0).toUpperCase() + weekday.slice(1), date: short };
}

/** "Wednesday, October 28, 2026" for the page header; without the weekday when the title already shows it. */
export function longDate(day: string, lang: Lang, weekday = true): string {
  const date = parseDate(day);
  if (!date) return day;
  return date.toLocaleDateString(localeTag(lang), { ...(weekday ? { weekday: "long" as const } : {}), day: "numeric", month: "long", year: "numeric" });
}

export const todayKey = (now = new Date()) => dayKey(now);

export function kindName(kind: DiaryKind): string {
  switch (kind) {
    case "bubble":
      return L("Lời nhắc", "Reminder");
    case "antic":
      return L("Trò nghịch", "Mischief");
    case "response":
      return L("Phản hồi", "Response");
    case "hold":
      return L("Giữ lại", "Held back");
    case "focus":
      return L("Tập trung", "Focus");
    case "flow":
      return L("Vào guồng", "In the zone");
    case "mood":
      return L("Tâm trạng", "Mood");
    case "distraction":
      return L("Xao nhãng", "Distraction");
    case "life":
      return L("Cuộc sống", "Pet life");
    case "meeting":
      return L("Cuộc họp", "Meeting");
    case "sync":
      return L("Đồng bộ", "Sync");
    case "system":
      return L("Hệ thống", "System");
  }
}
