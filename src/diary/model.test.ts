import { describe, expect, it } from "vitest";
import type { DiaryEntry, DiaryKind } from "../core/diary";
import { kindIcon } from "../core/diary";
import { setLang } from "../core/l10n";
import { FILTER_IDS, FILTER_KINDS, chaptersByWeek, countByFilter, dayLabel, filterEntries, filterOf, longDate, postcardParts, weekTitle, withToday, withWeekHeads } from "./model";

const entry = (kind: DiaryKind, at = 0): DiaryEntry => ({ at, kind, text: kind });

describe("filters", () => {
  it("put every diary kind in exactly one chip", () => {
    const kinds = Object.keys(kindIcon) as DiaryKind[];
    const placed = FILTER_IDS.flatMap((id) => FILTER_KINDS[id]);
    expect([...placed].sort()).toEqual([...kinds].sort());
  });

  it("maps kinds to their chip", () => {
    expect(filterOf("bubble")).toBe("reminders");
    expect(filterOf("antic")).toBe("reminders");
    expect(filterOf("flow")).toBe("focus");
    expect(filterOf("sync")).toBe("system");
    expect(filterOf("meeting")).toBe("meetings");
  });

  it("shows everything with no active filter, else only the chosen groups", () => {
    const all = [entry("bubble"), entry("response"), entry("hold"), entry("flow"), entry("meeting")];
    expect(filterEntries(all, new Set())).toHaveLength(5);
    expect(filterEntries(all, new Set(["reminders", "focus"] as const)).map((e) => e.kind)).toEqual(["bubble", "flow"]);
  });

  it("counts entries per chip", () => {
    const counts = countByFilter([entry("bubble"), entry("antic"), entry("system"), entry("sync")]);
    expect(counts.reminders).toBe(2);
    expect(counts.system).toBe(2);
    expect(counts.mood).toBe(0);
  });
});

describe("withToday", () => {
  it("adds today, drops junk keys and sorts newest first", () => {
    expect(withToday(["2026-10-26", "2026-10-27", "junk"], "2026-10-28")).toEqual(["2026-10-28", "2026-10-27", "2026-10-26"]);
    expect(withToday(["2026-10-28", "2026-10-20"], "2026-10-28")).toEqual(["2026-10-28", "2026-10-20"]);
  });
});

describe("dayLabel", () => {
  it("names today and yesterday", () => {
    setLang("en");
    expect(dayLabel("2026-10-28", "2026-10-28", "en").title).toBe("Today");
    expect(dayLabel("2026-10-27", "2026-10-28", "en").title).toBe("Yesterday");
    setLang("vi");
    expect(dayLabel("2026-10-28", "2026-10-28", "vi").title).toBe("Hôm nay");
    setLang("en");
  });

  it("uses the weekday for older days, with a short date", () => {
    const { title, date } = dayLabel("2026-10-26", "2026-10-28", "en");
    expect(title).toBe("Monday");
    expect(date).toMatch(/26/);
    expect(date).toMatch(/Oct/);
  });

  it("handles month boundaries for yesterday", () => {
    setLang("en");
    expect(dayLabel("2026-10-31", "2026-11-01", "en").title).toBe("Yesterday");
  });

  it("passes unparseable keys through", () => {
    expect(dayLabel("nope", "2026-10-28", "en")).toEqual({ title: "nope", date: "" });
  });
});

describe("longDate", () => {
  it("includes the weekday unless asked not to", () => {
    expect(longDate("2026-10-25", "en")).toBe("Sunday, October 25, 2026");
    expect(longDate("2026-10-25", "en", false)).toBe("October 25, 2026");
  });
});

describe("week chapters", () => {
  const at = (day: string, h = 10) => new Date(`${day}T${String(h).padStart(2, "0")}:00:00`).getTime();

  it("titles a week by its Monday", () => {
    setLang("en");
    expect(weekTitle("2026-10-26", "en")).toBe("Week of Oct 26");
    setLang("vi");
    expect(weekTitle("2026-10-26", "vi")).toBe("Tuần từ 26 thg 10");
    setLang("en");
  });

  it("puts a heading before the first day of each week", () => {
    const rows = withWeekHeads(["2026-10-29", "2026-10-26", "2026-10-25", "2026-10-19", "2026-10-16"]);
    expect(rows.filter((r) => r.first).map((r) => r.day)).toEqual(["2026-10-29", "2026-10-25", "2026-10-16"]);
    expect(rows[2].week).toBe("2026-10-19");
  });

  it("recaps each week from every day's entries", () => {
    setLang("en");
    const byDay = new Map<string, DiaryEntry[]>([
      ["2026-10-27", [{ at: at("2026-10-27"), kind: "life", text: "", tag: "done", count: 2 }, { at: at("2026-10-27", 17), kind: "life", text: "", tag: "postcard" }]],
      ["2026-10-26", [{ at: at("2026-10-26"), kind: "life", text: "", tag: "sticker", day: "2026-10-23" }]],
      ["2026-10-23", [{ at: at("2026-10-23"), kind: "life", text: "", tag: "done" }]],
    ]);
    const chapters = chaptersByWeek(byDay);
    expect(chapters.get("2026-10-26")?.recap).toBe("2 tasks · 1 trip");
    // The sticker is for Friday 23 October, so it counts for the week before.
    expect(chapters.get("2026-10-19")?.recap).toBe("1 task · 1 sticker");
  });
});

describe("postcards", () => {
  it("splits the heading from the message and finds the stamp", () => {
    const p = postcardParts("💌 A postcard from Hội An: Hội An's old town glows at night! Brought you a lantern 🏮");
    expect(p?.head).toBe("A postcard from Hội An");
    expect(p?.body).toMatch(/^Hội An's old town/);
    expect(p?.souvenir?.id).toBe("hoian");
    expect(postcardParts("💌 Bưu thiếp từ Thuỵ Sĩ: Núi Alps…")?.souvenir?.id).toBe("swiss");
    expect(postcardParts("💌 A postcard from the Swiss Alps: cheese!")?.souvenir?.id).toBe("swiss");
  });

  it("keeps unknown places and ignores other entries", () => {
    expect(postcardParts("💌 A postcard from Atlantis: blub")).toEqual({ head: "A postcard from Atlantis", body: "blub", souvenir: null });
    expect(postcardParts("Done “Write the report” → 80% full")).toBeNull();
  });
});
