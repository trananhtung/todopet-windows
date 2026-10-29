// Pure helpers behind the board's v0.5 "Game" pieces: wardrobe groups, the chest strip and its odds, seasons,
// the home corner picker, the knitting indicator and the trip banner. Unit-tested in boardGame.test.ts.
import { CHEST_ACCESSORIES, CHEST_EVERY_SEC, COMMON_XP, GOLDEN_XP, MAX_CHESTS_PER_DAY, MAX_HELD_CHESTS, ODDS, RARE_XP, type ChestTier } from "../core/chests";
import { homeDecor } from "../core/craft";
import { timeString } from "../core/dates";
import { L, plural } from "../core/l10n";
import { MILESTONE_ACCESSORIES, SEASONAL_ACCESSORIES } from "../core/life";
import { MAX_HOME_ITEMS } from "../core/prefs";
import { activeSeason, seasonEmoji, seasonName, type ActiveSeason } from "../core/seasons";
import { placeName, SOUVENIR_AFTER_MS, type Trip } from "../core/trips";
import { ACCESSORIES, type Accessory, type DecorId, type Season } from "../core/types";

export type WardrobeGroupId = "milestone" | "chest" | "seasonal";

/** The 20 accessories in the wardrobe's order: milestone rewards, chest finds, then the seasonal sets. */
export const WARDROBE_GROUPS: readonly { id: WardrobeGroupId; items: readonly Accessory[] }[] = [
  { id: "milestone", items: MILESTONE_ACCESSORIES },
  { id: "chest", items: CHEST_ACCESSORIES },
  { id: "seasonal", items: ACCESSORIES.filter((a) => SEASONAL_ACCESSORIES[a] !== undefined) },
];

export function groupTitle(id: WardrobeGroupId): string {
  switch (id) {
    case "milestone":
      return L("Thành tích", "Milestones");
    case "chest":
      return L("Đồ trong rương", "Chest finds");
    case "seasonal":
      return L("Theo mùa", "Seasonal");
  }
}

/** "🎃 Halloween": a season with its emoji. */
export const seasonLabel = (s: Season): string => `${seasonEmoji(s)} ${seasonName(s)}`;

/** "4 days left", or a nudge on the last day. */
export function daysLeftText(daysLeft: number): string {
  if (daysLeft <= 1) return L("ngày cuối rồi!", "last day!");
  return L(`còn ${daysLeft} ngày`, `${plural(daysLeft, "", "day", "days").trim()} left`);
}

/** The next season to begin after `now` (searched day by day, a year ahead), or null outside the lunar table. */
export function nextSeason(now: Date): { season: Season; start: Date } | null {
  const current = activeSeason(now)?.season ?? null;
  for (let i = 1; i <= 400; i++) {
    const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i, 12);
    const s = activeSeason(day);
    if (s && s.season !== current) return { season: s.season, start: s.start };
  }
  return null;
}

/** "🎃 Halloween · 4 days left", or when the next one starts. */
export function seasonLine(active: ActiveSeason | null, now: Date, locale: string): string {
  if (active) return `${seasonLabel(active.season)} · ${daysLeftText(active.daysLeft)}`;
  const next = nextSeason(now);
  if (!next) return L("Chưa có mùa lễ nào", "No season right now");
  const when = next.start.toLocaleDateString(locale, { day: "numeric", month: "short" });
  return L(`Mùa tới: ${seasonLabel(next.season)} từ ${when}`, `Next: ${seasonLabel(next.season)} from ${when}`);
}

/** Percent for a tier, as published: 70, 25, 5. */
export const oddsPercent = (t: ChestTier): number => Math.round(ODDS[t] * 100);

export const TIERS: readonly ChestTier[] = ["common", "rare", "legendary"];

export function tierName(t: ChestTier): string {
  switch (t) {
    case "common":
      return L("Thường", "Common");
    case "rare":
      return L("Hiếm", "Rare");
    case "legendary":
      return L("Huyền thoại", "Legendary");
  }
}

/** What a tier gives, in the words of `openChest`; the legendary line names the season in progress. */
export function tierGives(t: ChestTier, season: Season | null): string {
  switch (t) {
    case "common":
      return L(`+${COMMON_XP} XP, hoặc một 🍪 nếu túi bánh còn chỗ`, `+${COMMON_XP} XP, or a 🍪 if the snack stash has room`);
    case "rare":
      return L(`một món đồ trong rương mà pet chưa có (đủ cả rồi thì +${RARE_XP} XP)`, `a chest accessory the pet doesn't have yet (+${RARE_XP} XP once it has them all)`);
    case "legendary":
      return season
        ? L(`một món đồ mùa ${seasonLabel(season)}, hoặc bánh vàng 🍰 +${GOLDEN_XP} XP`, `a ${seasonLabel(season)} accessory, or a golden treat 🍰 +${GOLDEN_XP} XP`)
        : L(`đồ theo mùa khi đang có mùa lễ, không thì bánh vàng 🍰 +${GOLDEN_XP} XP`, `a seasonal accessory during a season, else a golden treat 🍰 +${GOLDEN_XP} XP`);
  }
}

/** Minutes of active work toward the next chest, out of 30. */
export const chestMinutes = (next: number): number => Math.floor((Math.max(0, Math.min(1, next)) * CHEST_EVERY_SEC) / 60);
export const CHEST_MINUTES = CHEST_EVERY_SEC / 60;

/** The chest strip's progress line: minutes toward the next chest, or why none is coming right now. */
export function chestProgress(c: { held: number; today: number; next: number }): { text: string; meter: number | null } {
  if (c.today >= MAX_CHESTS_PER_DAY) return { text: L("Đủ 3 rương hôm nay rồi, mai tiếp nha", "That's today's 3. More tomorrow!"), meter: null };
  if (c.held >= MAX_HELD_CHESTS) return { text: L("Túi đầy: xong một việc để mở bớt", "Bag's full: finish a task to open one"), meter: 1 };
  return { text: L(`Rương tới: ${chestMinutes(c.next)}/${CHEST_MINUTES} phút`, `Next chest: ${chestMinutes(c.next)}/${CHEST_MINUTES} min`), meter: Math.max(0, Math.min(1, c.next)) };
}

/**
 * Taps a decoration in the Home sheet: puts it out or away among those the corner shows now (an empty choice
 * shows the 3 newest, so the first tap starts from those). Null when it can't be done: not owned, or the corner
 * is full. Taking the last one away gives [], which shows the 3 newest again.
 */
export function toggleHomeItem(chosen: readonly DecorId[], owned: readonly DecorId[], id: DecorId): DecorId[] | null {
  if (!owned.includes(id)) return null;
  const shown = homeDecor(chosen, owned);
  if (shown.includes(id)) return shown.filter((d) => d !== id);
  if (shown.length >= MAX_HOME_ITEMS) return null;
  return [...shown, id];
}

/** The knitting indicator's percent and tooltip. */
export function yarnText(craft: number): { pct: number; title: string } {
  const pct = Math.round(Math.max(0, Math.min(1, craft)) * 100);
  return {
    pct,
    title: L(
      `Pet đang đan một món cho góc nhà: ${pct}%. Mỗi phút bạn tập trung là thêm vài mũi, trọn một phiên từ 25 phút trở lên là xong một món 🧶`,
      `Knitting a little something for home: ${pct}%. Every focused minute adds a few stitches, and a whole session of 25 minutes or more makes one 🧶`,
    ),
  };
}

/** The trip banner: where, when it's back, and whether calling it back now would come home empty-handed. */
export function tripBanner(trip: Trip, now: number): { title: string; back: string; early: boolean; hint: string } {
  const early = now - trip.start < SOUVENIR_AFTER_MS;
  return {
    title: L(`Đang đi chơi ${placeName(trip.place)}`, `On a trip to ${placeName(trip.place)}`),
    back: L(`về lúc ${timeString(new Date(trip.back))}`, `back at ${timeString(new Date(trip.back))}`),
    early,
    hint: early
      ? L("Đi chưa đủ 30 phút thì chưa kịp mua quà đâu nha", "Under 30 minutes away means no souvenir yet")
      : L("Gọi về bây giờ thì pet vẫn mang quà về cho bạn", "Call it home now and it still brings a souvenir"),
  };
}

/**
 * The trip sign's tooltip and accessible name, in the pet's voice: where it is, and in its first 30 minutes that
 * coming back now brings no souvenir (it doesn't cost the day's trip, though).
 */
export function tripSignText(trip: Trip, now: number): { title: string; label: string; early: boolean } {
  const back = timeString(new Date(trip.back));
  const place = placeName(trip.place);
  const early = now - trip.start < SOUVENIR_AFTER_MS;
  const call = early ? L("Gọi về sớm thì chưa có quà đâu.", "Call me back early and there's no souvenir yet.") : L("Bấm để gọi mình về sớm.", "Click to call me back early.");
  return {
    title: L(`Mình đang ở ${place}. ${call}`, `In ${place}. ${call}`),
    label: L(`Mình đang ở ${place}, về lúc ${back}. ${call}`, `I'm in ${place}, back at ${back}. ${call}`),
    early,
  };
}

/**
 * The wardrobe preview's viewBox: a square around the top `share` of the pet (head and neck, where every accessory
 * sits), centered, with a little room. `b` is the pet's bounds in its 160 × 160 view.
 */
export function previewViewBox(b: { minX: number; maxX: number; minY: number; maxY: number }, share = 0.8, pad = 4): string {
  const side = Math.max(b.maxX - b.minX, (b.maxY - b.minY) * share) + 2 * pad;
  const x = (b.minX + b.maxX) / 2 - side / 2;
  const y = b.minY - pad;
  const r = (v: number) => Math.round(v * 10) / 10;
  return `${r(x)} ${r(y)} ${r(side)} ${r(side)}`;
}
