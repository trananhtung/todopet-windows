// Seasonal sets (v0.5): Tết, Trung Thu, Halloween and Christmas. Seasonal accessories drop from chests only inside
// their window, and the wardrobe shows how many days are left. Pure, local time.
import { dayKey, daysBetween } from "./dates";
import { L } from "./l10n";
import type { Season } from "./types";

/**
 * Tết (1st of the 1st lunar month) and Trung Thu (15th of the 8th), as "MM-DD", from Hồ Ngọc Đức's Vietnamese
 * calendar algorithm (UTC+7). Outside these years there are no lunar seasons.
 */
export const LUNAR_DATES: Readonly<Record<number, { tet: string; trungthu: string }>> = {
  2026: { tet: "02-17", trungthu: "09-25" },
  2027: { tet: "02-06", trungthu: "09-15" },
  2028: { tet: "01-26", trungthu: "10-03" },
  2029: { tet: "02-13", trungthu: "09-22" },
  2030: { tet: "02-02", trungthu: "09-12" },
  2031: { tet: "01-23", trungthu: "10-01" },
  2032: { tet: "02-11", trungthu: "09-19" },
};

export interface ActiveSeason {
  season: Season;
  /** 00:00 on the first day of the window. */
  start: Date;
  /** 23:59:59.999 on the last day (the window is inclusive). */
  end: Date;
  /** Days left, today included: 1 on the last day. */
  daysLeft: number;
}

type Window = Omit<ActiveSeason, "daysLeft">;

/** From the start of `first` to the end of `last`, both local calendar days ([year, month 1–12, day], days may overflow). */
const span = (season: Season, first: [number, number, number], last: [number, number, number]): Window => ({
  season,
  start: new Date(first[0], first[1] - 1, first[2]),
  end: new Date(last[0], last[1] - 1, last[2], 23, 59, 59, 999),
});

function aroundLunar(season: Season, year: number, mmdd: string, days: number): Window {
  const [m, d] = mmdd.split("-").map(Number);
  return span(season, [year, m, d - days], [year, m, d + days]);
}

/** Every window that touches `year`: its own four, and last year's Christmas running into 1 January. */
function windows(year: number): Window[] {
  const out: Window[] = [span("christmas", [year - 1, 12, 15], [year, 1, 1])];
  const lunar = LUNAR_DATES[year];
  if (lunar) out.push(aroundLunar("tet", year, lunar.tet, 7), aroundLunar("trungthu", year, lunar.trungthu, 3));
  out.push(span("halloween", [year, 10, 20], [year, 11, 1]), span("christmas", [year, 12, 15], [year + 1, 1, 1]));
  return out;
}

/** The season `date` falls in, or null. */
export function activeSeason(date: Date): ActiveSeason | null {
  const t = date.getTime();
  const w = windows(date.getFullYear()).find((x) => x.start.getTime() <= t && t <= x.end.getTime());
  return w ? { ...w, daysLeft: daysBetween(dayKey(date), dayKey(w.end)) + 1 } : null;
}

export function seasonName(s: Season): string {
  switch (s) {
    case "tet":
      return L("Tết Nguyên Đán", "Tết (Lunar New Year)");
    case "trungthu":
      return L("Tết Trung Thu", "Trung Thu (Mid-Autumn)");
    case "halloween":
      return L("Halloween", "Halloween");
    case "christmas":
      return L("Giáng sinh", "Christmas");
  }
}

export function seasonEmoji(s: Season): string {
  return { tet: "🧧", trungthu: "🥮", halloween: "🎃", christmas: "🎄" }[s];
}
