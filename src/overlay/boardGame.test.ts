import { afterEach, describe, expect, it } from "vitest";
import { setLang } from "../core/l10n";
import { activeSeason } from "../core/seasons";
import { ACCESSORIES } from "../core/types";
import {
  chestMinutes,
  chestProgress,
  daysLeftText,
  nextSeason,
  oddsPercent,
  previewViewBox,
  seasonLine,
  TIERS,
  tierGives,
  toggleHomeItem,
  tripBanner,
  tripSignText,
  WARDROBE_GROUPS,
  yarnText,
} from "./boardGame";

afterEach(() => setLang("en"));

describe("wardrobe groups", () => {
  it("hold all 20 accessories once: 6 milestones, 8 chest finds, 6 seasonal", () => {
    const all = WARDROBE_GROUPS.flatMap((g) => g.items);
    expect([...all].sort()).toEqual([...ACCESSORIES].sort());
    expect(WARDROBE_GROUPS.map((g) => [g.id, g.items.length])).toEqual([
      ["milestone", 6],
      ["chest", 8],
      ["seasonal", 6],
    ]);
  });
});

describe("chest odds", () => {
  it("publish 70 / 25 / 5 and add up to 100", () => {
    expect(TIERS.map(oddsPercent)).toEqual([70, 25, 5]);
    expect(TIERS.map(oddsPercent).reduce((a, b) => a + b, 0)).toBe(100);
  });

  it("name the season in progress for legendary chests", () => {
    expect(tierGives("legendary", "halloween")).toContain("Halloween");
    expect(tierGives("legendary", null)).toContain("golden treat");
    setLang("vi");
    expect(tierGives("common", null)).toContain("🍪");
  });
});

describe("chest progress", () => {
  it("counts minutes toward the next chest", () => {
    expect(chestMinutes(1 / 3)).toBe(10);
    expect(chestMinutes(2)).toBe(30);
    expect(chestProgress({ held: 1, today: 1, next: 0.5 })).toEqual({ text: "Next chest: 15/30 min", meter: 0.5 });
  });

  it("says when nothing more comes today, or the bag is full", () => {
    expect(chestProgress({ held: 0, today: 3, next: 0 }).meter).toBeNull();
    expect(chestProgress({ held: 3, today: 2, next: 1 }).text).toMatch(/full/);
  });
});

describe("seasons", () => {
  it("counts the days left, with a nudge on the last one", () => {
    expect(daysLeftText(4)).toBe("4 days left");
    expect(daysLeftText(1)).toBe("last day!");
    setLang("vi");
    expect(daysLeftText(4)).toBe("còn 4 ngày");
  });

  it("finds the next season after a quiet day", () => {
    const n = nextSeason(new Date(2026, 10, 5));
    expect(n?.season).toBe("christmas");
    expect(n?.start.getMonth()).toBe(11);
    expect(n?.start.getDate()).toBe(15);
    // Christmas runs into 1 January; the next one after it is Tết (7 days before 17 Feb 2026).
    const t = nextSeason(new Date(2026, 0, 1));
    expect(t?.season).toBe("tet");
    expect(t?.start.getDate()).toBe(10);
  });

  it("shows the active season with its days left, else the next one", () => {
    const now = new Date(2026, 9, 29, 10);
    expect(seasonLine(activeSeason(now), now, "en-GB")).toBe("🎃 Halloween · 4 days left");
    const quiet = new Date(2026, 10, 5, 10);
    expect(seasonLine(null, quiet, "en-GB")).toBe("Next: 🎄 Christmas from 15 Dec");
  });
});

describe("home corner picker", () => {
  const owned = ["rug", "plant", "mug", "lamp"] as const;

  it("starts from the 3 newest when nothing is chosen", () => {
    expect(toggleHomeItem([], owned, "mug")).toEqual(["plant", "lamp"]);
  });

  it("adds while there's room and refuses when full", () => {
    expect(toggleHomeItem(["rug"], owned, "lamp")).toEqual(["rug", "lamp"]);
    expect(toggleHomeItem(["rug", "plant", "mug"], owned, "lamp")).toBeNull();
  });

  it("takes one away, and never picks what isn't owned", () => {
    expect(toggleHomeItem(["rug", "plant"], owned, "rug")).toEqual(["plant"]);
    expect(toggleHomeItem(["rug"], owned, "radio")).toBeNull();
  });
});

describe("knitting and trips", () => {
  it("rounds the yarn progress", () => {
    expect(yarnText(0.4).pct).toBe(40);
    expect(yarnText(1.2).pct).toBe(100);
    expect(yarnText(0.4).title).toContain("40%");
  });

  it("warns that an early call-back brings no souvenir", () => {
    const start = new Date(2026, 9, 29, 14, 0).getTime();
    const trip = { start, back: start + 2 * 3_600_000, place: "hoian" as const };
    const b = tripBanner(trip, start + 10 * 60_000);
    expect(b.title).toBe("On a trip to Hội An");
    expect(b.back).toBe("back at 16:00");
    expect(b.early).toBe(true);
    expect(tripBanner(trip, start + 45 * 60_000).early).toBe(false);
  });

  it("frames the wardrobe preview as a square around the pet's upper body, hat included", () => {
    const vb = previewViewBox({ minX: 30, maxX: 130, minY: 20, maxY: 152 }).split(" ").map(Number);
    const [x, y, w, h] = vb;
    expect(w).toBe(h);
    expect(x + w / 2).toBeCloseTo(80);
    expect(y).toBeLessThan(20);
    expect(x).toBeLessThan(30);
    expect(x + w).toBeGreaterThan(130);
    // Tall and thin: the square follows the height.
    const [, , tall] = previewViewBox({ minX: 60, maxX: 100, minY: 0, maxY: 150 }).split(" ").map(Number);
    expect(tall).toBeGreaterThan(120);
  });

  it("says on the sign, for the first 30 minutes, that calling it back early brings no souvenir", () => {
    const start = new Date(2026, 9, 29, 14, 0).getTime();
    const trip = { start, back: start + 2 * 3600_000, place: "hoian" as const };
    const early = tripSignText(trip, start + 10 * 60_000);
    expect(early.early).toBe(true);
    expect(early.title).toContain("Call me back early and there's no souvenir yet");
    expect(early.label).toContain("Call me back early and there's no souvenir yet");
    expect(early.label).toContain("back at 16:00");
    const later = tripSignText(trip, start + 30 * 60_000);
    expect(later.title).toBe("In Hội An. Click to call me back early.");
    expect(later.label).not.toContain("no souvenir");
    setLang("vi");
    expect(tripSignText(trip, start).title).toContain("Gọi về sớm thì chưa có quà đâu");
    expect(tripSignText(trip, start).label).toContain("Gọi về sớm thì chưa có quà đâu");
  });
});
