import { describe, expect, it } from "vitest";
import type { DiaryApi } from "../backend/types";
import { setLang } from "../core/l10n";
import { demoDiary, withDemoDiary } from "./demo";
import { chaptersByWeek, postcardParts } from "./model";

const TODAY = "2026-10-29";

describe("demo diary", () => {
  it("fills the ten workdays before today, never today or a weekend", () => {
    const days = [...demoDiary(TODAY).keys()].sort();
    expect(days).toHaveLength(10);
    expect(days[0]).toBe("2026-10-15");
    expect(days.at(-1)).toBe("2026-10-28");
    expect(days).not.toContain("2026-10-24");
  });

  it("has postcards that read as postcards, and weeks with a recap", () => {
    setLang("en");
    const seed = demoDiary(TODAY);
    const cards = [...seed.values()].flat().filter((e) => e.tag === "postcard");
    expect(cards.map((e) => postcardParts(e.text)?.souvenir?.id).sort()).toEqual(["dalat", "hoian", "kyoto", "paris"]);
    const chapters = chaptersByWeek(seed);
    expect(chapters.get("2026-10-26")?.recap).toBe("9 tasks · 1 sticker · 2 trips");
    expect(chapters.get("2026-10-19")?.stickers).toBeGreaterThan(0);
  });

  it("merges the sample into past days only", async () => {
    const real: DiaryApi = {
      append: async () => {},
      read: async (day) => (day === TODAY ? ['{"at":1,"kind":"system","text":"hi"}'] : []),
      days: async () => [TODAY],
    };
    const api = withDemoDiary(real, () => TODAY);
    expect(await api.read(TODAY)).toEqual(['{"at":1,"kind":"system","text":"hi"}']);
    expect((await api.read("2026-10-28")).length).toBeGreaterThan(3);
    const days = await api.days();
    expect(days[0]).toBe(TODAY);
    expect(days).toHaveLength(11);
  });
});
