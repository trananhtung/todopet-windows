// v0.5 "Game": seasons, chests, crafting, trips and weekly chapters (pure rules), plus their LifeState and Prefs fields.
import { beforeEach, describe, expect, it } from "vitest";
import * as chapters from "./chapters";
import * as chests from "./chests";
import * as craft from "./craft";
import type { DiaryEntry } from "./diary";
import { setLang } from "./l10n";
import * as life from "./life";
import { defaultPrefs, prefsFromJson } from "./prefs";
import { activeSeason, LUNAR_DATES, seasonName } from "./seasons";
import * as trips from "./trips";
import { DECOR_IDS, SEASONS, type Accessory } from "./types";

const MIN = 60_000;
const date = (y: number, m: number, d: number, h = 12, mi = 0) => new Date(y, m - 1, d, h, mi);
const ms = (y: number, m: number, d: number, h = 12, mi = 0) => date(y, m, d, h, mi).getTime();

beforeEach(() => setLang("en"));

describe("seasons", () => {
  it("knows Halloween from Oct 20 to Nov 1, with the days left counting today", () => {
    expect(activeSeason(date(2026, 10, 19, 23, 59))).toBeNull();
    const first = activeSeason(date(2026, 10, 20, 0, 0));
    expect(first?.season).toBe("halloween");
    expect(first?.start.getTime()).toBe(ms(2026, 10, 20, 0));
    expect(first?.end.getDate()).toBe(1);
    expect(first?.end.getMonth()).toBe(10);
    expect(first?.daysLeft).toBe(13);
    expect(activeSeason(date(2026, 10, 29))?.daysLeft).toBe(4);
    expect(activeSeason(date(2026, 11, 1, 23, 30))).toMatchObject({ season: "halloween", daysLeft: 1 });
    expect(activeSeason(date(2026, 11, 2, 0, 0))).toBeNull();
  });

  it("carries Christmas over New Year's Day", () => {
    expect(activeSeason(date(2026, 12, 14))).toBeNull();
    expect(activeSeason(date(2026, 12, 15, 0, 0))?.season).toBe("christmas");
    const nye = activeSeason(date(2027, 1, 1, 22));
    expect(nye).toMatchObject({ season: "christmas", daysLeft: 1 });
    expect(nye?.start.getFullYear()).toBe(2026);
    expect(activeSeason(date(2027, 1, 2))).toBeNull();
    // Christmas needs no table.
    expect(activeSeason(date(2025, 12, 20))?.season).toBe("christmas");
  });

  it("puts Tết a week either side of the lunar new year, and Trung Thu 3 days either side of the full moon", () => {
    // Tết 2026 is 17 February; Trung Thu 2026 is 25 September.
    expect(activeSeason(date(2026, 2, 9))).toBeNull();
    expect(activeSeason(date(2026, 2, 10, 0, 0))?.season).toBe("tet");
    expect(activeSeason(date(2026, 2, 17))).toMatchObject({ season: "tet", daysLeft: 8 });
    expect(activeSeason(date(2026, 2, 24, 23))).toMatchObject({ season: "tet", daysLeft: 1 });
    expect(activeSeason(date(2026, 2, 25))).toBeNull();
    expect(activeSeason(date(2026, 9, 21))).toBeNull();
    expect(activeSeason(date(2026, 9, 22))?.season).toBe("trungthu");
    expect(activeSeason(date(2026, 9, 28))).toMatchObject({ season: "trungthu", daysLeft: 1 });
    expect(activeSeason(date(2026, 9, 29))).toBeNull();
  });

  it("uses the 2026–2032 table and has no lunar seasons outside it", () => {
    expect(Object.keys(LUNAR_DATES).map(Number)).toEqual([2026, 2027, 2028, 2029, 2030, 2031, 2032]);
    expect(LUNAR_DATES[2028]).toEqual({ tet: "01-26", trungthu: "10-03" });
    for (const [year, d] of Object.entries(LUNAR_DATES)) {
      const [tm, td] = d.tet.split("-").map(Number);
      const [mm, md] = d.trungthu.split("-").map(Number);
      expect(activeSeason(date(Number(year), tm, td))?.season).toBe("tet");
      expect(activeSeason(date(Number(year), mm, md))?.season).toBe("trungthu");
    }
    // Tết 2033 falls on 31 January, but the table stops at 2032.
    expect(activeSeason(date(2033, 1, 31))).toBeNull();
    expect(activeSeason(date(2025, 1, 29))).toBeNull();
    expect(activeSeason(date(2033, 10, 25))?.season).toBe("halloween");
  });

  it("names every season in both languages", () => {
    for (const s of SEASONS) {
      setLang("vi");
      const vi = seasonName(s);
      setLang("en");
      expect(vi.length).toBeGreaterThan(0);
      expect(seasonName(s).length).toBeGreaterThan(0);
    }
    expect(seasonName("trungthu")).toContain("Mid-Autumn");
  });
});

describe("chests", () => {
  /** A pet with one chest to open, wearing a scarf. */
  const holder = (patch: Partial<life.LifeState> = {}): life.LifeState => ({ ...life.newLife(), chests: 1, snacks: 0, wearing: ["scarf"], unlocked: ["scarf"], ...patch });

  it("publishes odds that add up to 100%, and rolls tiers by them", () => {
    expect(chests.ODDS).toEqual({ common: 0.7, rare: 0.25, legendary: 0.05 });
    expect(chests.tierOf(0)).toBe("common");
    expect(chests.tierOf(0.6999)).toBe("common");
    expect(chests.tierOf(0.7)).toBe("rare");
    expect(chests.tierOf(0.9499)).toBe("rare");
    expect(chests.tierOf(0.95)).toBe("legendary");
    expect(chests.tierOf(0.9999)).toBe("legendary");
  });

  it("drops only regular accessories as rare finds (no milestones, no seasonal ones)", () => {
    expect(chests.CHEST_ACCESSORIES).toEqual(["beanie", "flowercrown", "partyhat", "nonla", "bandana", "heartglasses", "roundglasses", "starglasses"]);
    expect(chests.seasonalAccessories("christmas")).toEqual(["santahat", "bellcollar"]);
    expect(chests.seasonalAccessories("halloween")).toEqual(["witchhat"]);
  });

  it("counts only active work: work hours, input in the last minute, no distraction, no meeting", () => {
    const base = { inWork: true, idleSeconds: 10, distracted: false, inMeeting: false };
    expect(chests.isActiveWork(base)).toBe(true);
    expect(chests.isActiveWork({ ...base, inWork: false })).toBe(false);
    expect(chests.isActiveWork({ ...base, idleSeconds: 60 })).toBe(false);
    expect(chests.isActiveWork({ ...base, distracted: true })).toBe(false);
    expect(chests.isActiveWork({ ...base, inMeeting: true })).toBe(false);
  });

  it("earns a chest every 30 minutes of active work", () => {
    const s = life.newLife();
    const day = "2026-10-28";
    let earned = 0;
    for (let t = 0; t < chests.CHEST_EVERY_SEC; t += 15) if (chests.accrueWork(s, 15, day)) earned++;
    expect(earned).toBe(1);
    expect(s).toMatchObject({ chests: 1, chestsToday: 1, workSec: 0, chestDay: day });
  });

  it("stops at 3 a day and 3 held; a full stash waits with the next chest ready", () => {
    const s = life.newLife();
    const day = "2026-10-28";
    expect(chests.accrueWork(s, 3 * chests.CHEST_EVERY_SEC, day)).toBe(true);
    // One accrual earns at most one chest.
    expect(s.chests).toBe(1);
    expect(chests.accrueWork(s, chests.CHEST_EVERY_SEC, day)).toBe(true);
    expect(chests.accrueWork(s, chests.CHEST_EVERY_SEC, day)).toBe(true);
    expect(s).toMatchObject({ chests: 3, chestsToday: 3 });
    expect(chests.accrueWork(s, chests.CHEST_EVERY_SEC, day)).toBe(false);
    expect(s.chests).toBe(3);

    // A new day: the count starts over, but three held is the most.
    const t = { ...life.newLife(), chests: 3, chestsToday: 3, chestDay: day, workSec: 900 };
    expect(chests.accrueWork(t, 15, "2026-10-29")).toBe(false);
    expect(t).toMatchObject({ chestsToday: 0, workSec: 15, chestDay: "2026-10-29" });
    expect(chests.accrueWork(t, 2 * chests.CHEST_EVERY_SEC, "2026-10-29")).toBe(false);
    expect(t.workSec).toBe(chests.CHEST_EVERY_SEC);
    t.chests = 2; // one opened
    expect(chests.accrueWork(t, 15, "2026-10-29")).toBe(true);
    expect(t).toMatchObject({ chests: 3, chestsToday: 1, workSec: 15 });
  });

  it("opens commons as +20 XP, or a snack 1 in 4 times when the stash has room", () => {
    const s = holder({ xp: 5 });
    expect(chests.openChest(s, 0.1, 0.5, null)).toEqual({ tier: "common", reward: "xp", xp: 20 });
    expect(s).toMatchObject({ xp: 25, chests: 0 });
    const t = holder({ snacks: 1 });
    expect(chests.openChest(t, 0.1, 0.1, null)).toEqual({ tier: "common", reward: "snack", xp: 0 });
    expect(t.snacks).toBe(2);
    const full = holder({ snacks: life.MAX_SNACKS });
    expect(chests.openChest(full, 0.1, 0.1, null)).toEqual({ tier: "common", reward: "xp", xp: 20 });
    expect(full.snacks).toBe(life.MAX_SNACKS);
  });

  it("opens rares as a new accessory (worn if its slot is free), else +40 XP", () => {
    const s = holder();
    expect(chests.openChest(s, 0.8, 0, null)).toEqual({ tier: "rare", reward: "accessory", accessory: "beanie", xp: 0 });
    expect(s.unlocked).toContain("beanie");
    expect(s.wearing).toEqual(["scarf", "beanie"]);
    // The neck already has a scarf: the bandana goes in the wardrobe.
    const t = holder({ unlocked: ["scarf", "beanie", "flowercrown", "partyhat", "nonla"] });
    expect(chests.openChest(t, 0.8, 0, null)?.accessory).toBe("bandana");
    expect(t.wearing).toEqual(["scarf"]);
    // Picks among the ones you don't have.
    const u = holder();
    expect(chests.openChest(u, 0.8, 0.99, null)?.accessory).toBe("starglasses");
    const all = holder({ unlocked: [...chests.CHEST_ACCESSORIES] });
    expect(chests.openChest(all, 0.8, 0.5, null)).toEqual({ tier: "rare", reward: "xp", xp: 40 });
    expect(all.xp).toBe(40);
  });

  it("opens legendaries as a seasonal accessory in season, else a golden treat", () => {
    const s = holder();
    expect(chests.openChest(s, 0.97, 0.5, "halloween")).toEqual({ tier: "legendary", reward: "accessory", accessory: "witchhat", xp: 0 });
    expect(s.wearing).toContain("witchhat");
    const off = holder({ goldens: 2 });
    expect(chests.openChest(off, 0.97, 0.5, null)).toEqual({ tier: "legendary", reward: "golden", xp: 50 });
    expect(off).toMatchObject({ goldens: 3, xp: 50 });
    const owned = holder({ unlocked: ["scarf", "witchhat"] });
    expect(chests.openChest(owned, 0.97, 0.5, "halloween")?.reward).toBe("golden");
  });

  it("opens nothing when no chest is held", () => {
    const s = holder({ chests: 0, xp: 7 });
    expect(chests.openChest(s, 0.1, 0.5, null)).toBeNull();
    expect(s.xp).toBe(7);
  });

  it("describes every result in both languages", () => {
    const results: chests.ChestResult[] = [
      { tier: "common", reward: "xp", xp: 20 },
      { tier: "common", reward: "snack", xp: 0 },
      { tier: "rare", reward: "accessory", accessory: "nonla", xp: 0 },
      { tier: "rare", reward: "xp", xp: 40 },
      { tier: "legendary", reward: "accessory", accessory: "maicrown", xp: 0 },
      { tier: "legendary", reward: "golden", xp: 50 },
    ];
    for (const r of results) {
      expect(chests.chestText(r)).toMatch(/🎁|🌟/);
      setLang("vi");
      expect(chests.chestText(r).length).toBeGreaterThan(5);
      setLang("en");
    }
    expect(chests.chestText(results[2])).toContain("Nón lá");
  });
});

describe("crafting", () => {
  it("knits a share of the item per second of focus, up to 1", () => {
    const s = { ...life.newLife() };
    craft.knit(s, 750, 25);
    expect(s.craft).toBeCloseTo(0.5);
    craft.knit(s, 3000, 25);
    expect(s.craft).toBe(1);
  });

  it("drops a few stitches without ever going below zero", () => {
    const s = { ...life.newLife(), craft: 0.35 };
    expect(craft.dropStitches(s)).toBeCloseTo(0.1);
    expect(s.craft).toBeCloseTo(0.25);
    s.craft = 0.04;
    expect(craft.dropStitches(s)).toBeCloseTo(0.04);
    expect(s.craft).toBe(0);
    expect(craft.dropStitches(s)).toBe(0);
  });

  it("finishes a random decoration you don't have yet at 1, then starts over", () => {
    const s = { ...life.newLife(), craft: 0.6, decor: ["rug" as const] };
    expect(craft.finishCraft(s, 0)).toBeNull();
    craft.topUp(s);
    expect(s.craft).toBe(1);
    expect(craft.finishCraft(s, 0)).toEqual({ decor: "plant", xp: 0 });
    expect(s.decor).toEqual(["rug", "plant"]);
    expect(s.craft).toBe(0);
  });

  it("gives XP once every decoration is owned", () => {
    const s = { ...life.newLife(), craft: 1, decor: [...DECOR_IDS], xp: 10 };
    expect(craft.finishCraft(s, 0.3)).toEqual({ decor: null, xp: craft.CRAFT_DONE_XP });
    expect(s.xp).toBe(40);
    expect(s.craft).toBe(0);
  });

  it("puts the chosen decorations in the home corner, or the newest three", () => {
    expect(craft.homeDecor(["lamp", "mug"], ["rug", "lamp", "mug"])).toEqual(["lamp", "mug"]);
    // Only what you own, at most three.
    expect(craft.homeDecor(["lamp", "radio", "mug", "rug"], ["rug", "lamp", "mug", "plant"])).toEqual(["lamp", "mug", "rug"]);
    expect(craft.homeDecor([], ["rug", "lamp", "mug", "plant"])).toEqual(["lamp", "mug", "plant"]);
    expect(craft.homeDecor([], [])).toEqual([]);
  });

  it("names every decoration in both languages", () => {
    for (const id of DECOR_IDS) {
      expect(craft.decorName(id).length).toBeGreaterThan(1);
      expect(craft.decorEmoji(id).length).toBeGreaterThan(0);
      expect(craft.craftText({ decor: id, xp: 0 })).toContain(craft.decorName(id).toLowerCase());
    }
    setLang("vi");
    expect(craft.decorName("fishbowl")).toBe("Bể cá");
    expect(craft.craftText({ decor: null, xp: 30 })).toContain("+30 XP");
  });
});

describe("trips", () => {
  it("has 16 souvenirs with places, items and postcards in both languages", () => {
    expect(trips.SOUVENIRS).toHaveLength(16);
    expect(new Set(trips.SOUVENIRS.map((x) => x.id)).size).toBe(16);
    expect(new Set(trips.SOUVENIRS.map((x) => x.emoji)).size).toBe(16);
    for (const x of trips.SOUVENIRS) {
      for (const field of [x.place, x.item, x.postcard]) {
        expect(field.vi.length).toBeGreaterThan(1);
        expect(field.en.length).toBeGreaterThan(1);
      }
      expect(x.postcard.en).toContain(x.emoji);
      expect(x.postcard.vi).toContain(x.emoji);
    }
    expect(trips.souvenir("hoian")).toMatchObject({ emoji: "🏮" });
    setLang("vi");
    expect(trips.placeName("halong")).toBe("vịnh Hạ Long");
    expect(trips.itemName("dalat")).toBe("Dâu tây Đà Lạt");
  });

  it("offers a trip once today's plan is done, in work hours, an hour or more before work ends", () => {
    const now = ms(2026, 10, 28, 15);
    const ok: trips.TripOfferInput = { now, workEnd: ms(2026, 10, 28, 18), inWork: true, completed: 3, target: 3, left: 0, tripDay: "2026-10-27", away: false };
    expect(trips.canOfferTrip(ok)).toBe(true);
    expect(trips.canOfferTrip({ ...ok, completed: 2 })).toBe(false);
    expect(trips.canOfferTrip({ ...ok, left: 1 })).toBe(false);
    expect(trips.canOfferTrip({ ...ok, inWork: false })).toBe(false);
    expect(trips.canOfferTrip({ ...ok, now: ms(2026, 10, 28, 17, 1) })).toBe(false);
    expect(trips.canOfferTrip({ ...ok, now: ms(2026, 10, 28, 17) })).toBe(true);
    expect(trips.canOfferTrip({ ...ok, tripDay: "2026-10-28" })).toBe(false);
    expect(trips.canOfferTrip({ ...ok, away: true })).toBe(false);
  });

  it("goes somewhere new for 2 hours, or until work ends", () => {
    const s = { ...life.newLife(), souvenirs: ["hoian" as const] };
    const now = ms(2026, 10, 28, 15);
    const trip = trips.startTrip(s, now, ms(2026, 10, 28, 18), 0);
    expect(trip).toEqual({ start: now, back: now + 120 * MIN, place: "dalat" });
    expect(s.trip).toEqual(trip);
    expect(s.tripDay).toBe("2026-10-28");
    const late = trips.startTrip({ ...life.newLife() }, ms(2026, 10, 28, 16, 45), ms(2026, 10, 28, 18), 0.99);
    expect(late.back).toBe(ms(2026, 10, 28, 18));
    expect(late.place).toBe("swiss");
    // Somewhere already visited when every souvenir is on the shelf.
    const all = { ...life.newLife(), souvenirs: [...trips.SOUVENIR_IDS] };
    expect(trips.startTrip(all, now, ms(2026, 10, 28, 18), 0).place).toBe("hoian");
  });

  it("brings a souvenir back after 30 minutes or more, and counts the trip for the week", () => {
    const s = life.newLife();
    const start = ms(2026, 10, 28, 15);
    trips.startTrip(s, start, ms(2026, 10, 28, 18), 0);
    const r = trips.endTrip(s, start + 2 * 60 * MIN);
    expect(r).toEqual({ place: "hoian", minutes: 120, souvenir: "hoian", xp: 0 });
    expect(s.souvenirs).toEqual(["hoian"]);
    expect(s.trip).toBeNull();
    expect(s.week).toMatchObject({ key: "2026-10-26", trips: 1 });
    expect(trips.endTrip(s, start + 3 * 60 * MIN)).toBeNull();
  });

  it("comes back empty-handed from a short trip, and with XP from a place it already has", () => {
    const s = life.newLife();
    const start = ms(2026, 10, 28, 15);
    trips.startTrip(s, start, ms(2026, 10, 28, 18), 0);
    expect(trips.endTrip(s, start + 29 * MIN)).toEqual({ place: "hoian", minutes: 29, souvenir: null, xp: 0 });
    expect(s.souvenirs).toEqual([]);
    expect(s.week.trips).toBe(0);
    const t = { ...life.newLife(), souvenirs: [...trips.SOUVENIR_IDS], xp: 3 };
    trips.startTrip(t, start, ms(2026, 10, 28, 18), 0.5);
    expect(trips.endTrip(t, start + 45 * MIN)).toMatchObject({ souvenir: null, xp: trips.TRIP_XP });
    expect(t.xp).toBe(23);
    // Back long after the sign said (the PC slept): the trip still ends at its planned time.
    const u = life.newLife();
    trips.startTrip(u, start, ms(2026, 10, 28, 18), 0);
    expect(trips.endTrip(u, ms(2026, 10, 29, 9))?.minutes).toBe(120);
  });

  it("reads a saved trip tolerantly", () => {
    expect(trips.tripFromJson({ start: 1, back: 2, place: "kyoto" })).toEqual({ start: 1, back: 2, place: "kyoto" });
    expect(trips.tripFromJson({ start: 1, back: 2, place: "atlantis" })).toBeNull();
    expect(trips.tripFromJson({ start: "1", back: 2, place: "kyoto" })).toBeNull();
    expect(trips.tripFromJson({ start: 5, back: 2, place: "kyoto" })).toBeNull();
    expect(trips.tripFromJson(null)).toBeNull();
  });
});

describe("weekly chapters", () => {
  const week = (key: string, done = 0, stickers = 0, tripsCount = 0): chapters.WeekStats => ({ key, done, stickers, trips: tripsCount });

  it("keys a week by its Monday", () => {
    expect(chapters.weekKey(date(2026, 10, 26))).toBe("2026-10-26");
    expect(chapters.weekKey(date(2026, 10, 28))).toBe("2026-10-26");
    expect(chapters.weekKey(date(2026, 11, 1, 23, 59))).toBe("2026-10-26");
    expect(chapters.weekKey(date(2026, 11, 2, 0, 0))).toBe("2026-11-02");
    expect(chapters.weekKey("2027-01-01")).toBe("2026-12-28");
  });

  it("turns the page each Monday, keeping last week only when it's the one just before", () => {
    const s = { ...life.newLife(), week: week("2026-10-19", 9, 1, 1) };
    chapters.rollWeek(s, "2026-10-28");
    expect(s.lastWeek).toEqual(week("2026-10-19", 9, 1, 1));
    expect(s.week).toEqual(week("2026-10-26"));
    chapters.rollWeek(s, "2026-10-30");
    expect(s.lastWeek?.key).toBe("2026-10-19");
    // A week the app never saw: no recap to give.
    chapters.rollWeek(s, "2026-11-11");
    expect(s.week.key).toBe("2026-11-09");
    expect(s.lastWeek).toBeNull();
    // A pet saved before v0.5 starts counting without a last week.
    const fresh = life.newLife();
    chapters.rollWeek(fresh, "2026-10-28");
    expect(fresh.week).toEqual(week("2026-10-26"));
    expect(fresh.lastWeek).toBeNull();
  });

  it("counts into the right week, last week included", () => {
    const s = { ...life.newLife(), week: week("2026-10-26", 2) };
    chapters.countWeek(s, "2026-10-28", "done");
    expect(s.week.done).toBe(3);
    // Friday's sticker, settled on Monday morning.
    chapters.rollWeek(s, "2026-11-02");
    chapters.countWeek(s, "2026-10-30", "stickers");
    expect(s.lastWeek).toEqual(week("2026-10-26", 3, 1));
    chapters.countWeek(s, "2026-11-03", "trips");
    expect(s.week).toEqual(week("2026-11-02", 0, 0, 1));
    // Older weeks are gone.
    chapters.countWeek(s, "2026-10-14", "done");
    expect(s.lastWeek?.done).toBe(3);
  });

  it("says the fresh-start line once a week, from the second week on", () => {
    const s = life.newLife();
    // First week with the app: nothing to look back on.
    expect(chapters.takeFreshStart(s, "2026-10-28")).toBeNull();
    expect(s.weekGreeted).toBe("2026-10-26");
    expect(chapters.takeFreshStart(s, "2026-10-29")).toBeNull();
    s.week.done = 7;
    chapters.rollWeek(s, "2026-11-02");
    expect(chapters.takeFreshStart(s, "2026-11-02")).toEqual({ last: week("2026-10-26", 7) });
    expect(chapters.takeFreshStart(s, "2026-11-03")).toBeNull();
    // Back after a week away: a fresh start, with no recap.
    expect(chapters.takeFreshStart(s, "2026-11-18")).toEqual({ last: null });
  });

  it("sums a week up kindly, leaving out what's zero", () => {
    expect(chapters.weekRecap(week("2026-10-26", 12, 2, 1))).toBe("12 tasks · 2 stickers · 1 trip");
    expect(chapters.weekRecap(week("2026-10-26", 1))).toBe("1 task");
    expect(chapters.weekRecap(week("2026-10-26"))).toBe("");
    expect(chapters.weekRecap(null)).toBe("");
    setLang("vi");
    expect(chapters.weekRecap(week("2026-10-26", 12, 2, 1))).toBe("12 việc · 2 sticker · 1 chuyến đi");
  });

  it("groups diary entries into weeks, newest first, with a one-line recap", () => {
    const e = (at: number, extra: Partial<DiaryEntry> = {}): DiaryEntry => ({ at, kind: "life", text: "x", ...extra });
    const entries: DiaryEntry[] = [
      e(ms(2026, 10, 27, 9), { tag: "done" }),
      e(ms(2026, 10, 27, 10), { tag: "done", count: 2 }),
      e(ms(2026, 10, 27, 11), { tag: "undone" }),
      e(ms(2026, 10, 28, 15), { tag: "postcard" }),
      e(ms(2026, 10, 28, 16), { kind: "bubble" }),
      // Friday's sticker, written when the day was settled on Monday.
      e(ms(2026, 11, 2, 9), { tag: "sticker", day: "2026-10-30" }),
      e(ms(2026, 11, 2, 10), { kind: "focus" }),
    ];
    const ch = chapters.weekChapters(entries);
    expect(ch.map((c) => c.key)).toEqual(["2026-11-02", "2026-10-26"]);
    expect(ch[0]).toMatchObject({ end: "2026-11-08", done: 0, stickers: 0, trips: 0, recap: "A quiet week 🌿" });
    expect(ch[0].entries).toHaveLength(2);
    expect(ch[1]).toMatchObject({ end: "2026-11-01", done: 2, stickers: 1, trips: 1, recap: "2 tasks · 1 sticker · 1 trip" });
    expect(ch[1].entries).toHaveLength(5);
    expect(chapters.weekChapters([])).toEqual([]);
  });
});

describe("game state in the pet's life", () => {
  it("starts empty", () => {
    const s = life.newLife();
    expect(s).toMatchObject({ chests: 0, chestsToday: 0, chestDay: "", workSec: 0, craft: 0, decor: [], souvenirs: [], trip: null, tripDay: "", lastWeek: null, weekGreeted: "" });
    expect(s.week).toEqual({ key: "", done: 0, stickers: 0, trips: 0 });
  });

  it("keeps everything from an older save and fills in the game fields", () => {
    const s = life.lifeFromJson({ streak: 4, xp: 210, unlocked: ["bow"], dayKey: "2026-10-26" });
    expect(s).toMatchObject({ streak: 4, xp: 210, unlocked: ["bow"], chests: 0, craft: 0, decor: [], souvenirs: [], trip: null, lastWeek: null });
  });

  it("repairs broken game fields instead of dropping the save", () => {
    const s = life.lifeFromJson({
      chests: 9,
      chestsToday: -2,
      workSec: "x",
      craft: 1.7,
      decor: ["rug", "rug", "spaceship", 3, "lamp"],
      souvenirs: ["kyoto", "atlantis", "kyoto"],
      trip: { start: 1, back: 2, place: "nowhere" },
      tripDay: "yesterday",
      week: { key: "2026-10-26", done: 4, stickers: "2", trips: 1 },
      lastWeek: { key: "junk" },
      weekGreeted: 12,
    });
    expect(s).toMatchObject({ chests: life.MAX_HELD_CHESTS, chestsToday: 0, workSec: 0, craft: 1, decor: ["rug", "lamp"], souvenirs: ["kyoto"], trip: null, tripDay: "", lastWeek: null, weekGreeted: "" });
    expect(s.week).toEqual({ key: "2026-10-26", done: 4, stickers: 0, trips: 1 });
    expect(chests.MAX_HELD_CHESTS).toBe(life.MAX_HELD_CHESTS);
    const t = life.lifeFromJson({ trip: { start: 1, back: 2, place: "bali" }, tripDay: "2026-10-28", chestDay: "2026-10-28" });
    expect(t).toMatchObject({ trip: { start: 1, back: 2, place: "bali" }, tripDay: "2026-10-28", chestDay: "2026-10-28" });
  });

  it("counts finished tasks for the week, and takes back an undone one", () => {
    const s = life.newLife();
    life.feed(s, ms(2026, 10, 28, 10), 0.5, 0.5);
    life.feed(s, ms(2026, 10, 28, 11), 0.5, 0.5);
    expect(s.week).toMatchObject({ key: "2026-10-26", done: 2 });
    life.unfeed(s);
    expect(s.week.done).toBe(1);
  });

  it("starts each day's chest count over, turns the week, and files a sticker under its own week", () => {
    const s: life.LifeState = {
      ...life.newLife(),
      dayKey: "2026-10-30",
      dayCompleted: 3,
      dayPlanned: 3,
      dayTarget: 3,
      dayWorkday: true,
      daySeen: true,
      chestsToday: 3,
      chestDay: "2026-10-30",
      workSec: 1200,
      chests: 2,
      week: { key: "2026-10-26", done: 11, stickers: 0, trips: 1 },
    };
    const r = life.closeDay(s, "2026-11-02", () => true);
    expect(r.sticker).toBe(true);
    expect(s).toMatchObject({ chestsToday: 0, chestDay: "2026-11-02", workSec: 0, chests: 2 });
    expect(s.lastWeek).toEqual({ key: "2026-10-26", done: 11, stickers: 1, trips: 1 });
    expect(s.week).toEqual({ key: "2026-11-02", done: 0, stickers: 0, trips: 0 });
  });

  it("gives the demo pet something to show", () => {
    const s = life.demoLife();
    expect(s.chests).toBe(1);
    expect(s.craft).toBeGreaterThan(0);
    expect(s.craft).toBeLessThan(1);
    expect(s.decor).toHaveLength(3);
    expect(s.souvenirs).toHaveLength(4);
    expect(s.workSec).toBeLessThan(chests.CHEST_EVERY_SEC / 2);
  });
});

describe("home prefs", () => {
  it("shows the home corner by default, with no decorations picked", () => {
    expect(defaultPrefs()).toMatchObject({ showHome: true, homeItems: [] });
    expect(prefsFromJson({ showHome: false }).showHome).toBe(false);
    expect(prefsFromJson({ showHome: "no" }).showHome).toBe(true);
  });

  it("keeps up to 3 known decorations, once each", () => {
    expect(prefsFromJson({ homeItems: ["lamp", "lamp", "dragon", 4, "mug", "rug", "plant"] }).homeItems).toEqual(["lamp", "mug", "rug"]);
    expect(prefsFromJson({ homeItems: "lamp" }).homeItems).toEqual([]);
  });
});

// Keeps the chest catalog honest: every accessory is a milestone, a chest find or a seasonal one.
describe("accessory sources", () => {
  it("covers all 20 accessories exactly once", () => {
    const seasonal = Object.keys(life.SEASONAL_ACCESSORIES) as Accessory[];
    const all = [...life.MILESTONE_ACCESSORIES, ...chests.CHEST_ACCESSORIES, ...seasonal];
    expect(new Set(all).size).toBe(20);
  });
});
