import { describe, expect, it } from "vitest";
import type { DiaryEntry, DiaryKind } from "../core/diary";
import { kindIcon } from "../core/diary";
import { setLang } from "../core/l10n";
import { FILTER_IDS, FILTER_KINDS, countByFilter, dayLabel, filterEntries, filterOf, longDate, withToday } from "./model";

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
