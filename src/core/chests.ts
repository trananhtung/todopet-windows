// Chests (v0.5): earned with active work, opened by finishing a task, with published odds. Rewards are cosmetic or
// XP, never sold. Pure rules; the brain accrues work in its heartbeat and opens a chest in the task's celebration.
import { L } from "./l10n";
import { accessoryEmoji, accessoryName, accessorySlot, MAX_HELD_CHESTS, MAX_SNACKS, MILESTONE_ACCESSORIES, SEASONAL_ACCESSORIES, type LifeState } from "./life";
import type { Accessory, Season } from "./types";
import { ACCESSORIES } from "./types";

export { MAX_HELD_CHESTS };
/** A chest for every 30 minutes of active work… */
export const CHEST_EVERY_SEC = 1800;
/** …at most 3 a day. */
export const MAX_CHESTS_PER_DAY = 3;
/** Input within this many seconds counts as being at work. */
export const ACTIVE_INPUT_SEC = 60;

export type ChestTier = "common" | "rare" | "legendary";
/** The published odds (shown in the wardrobe). */
export const ODDS: Readonly<Record<ChestTier, number>> = { common: 0.7, rare: 0.25, legendary: 0.05 };
export const COMMON_XP = 20;
export const RARE_XP = 40;
export const GOLDEN_XP = 50;
/** One common in this many is a 🍪, when the stash has room. */
const SNACK_SHARE = 0.25;

export type ChestReward = "xp" | "snack" | "accessory" | "golden";

export interface ChestResult {
  tier: ChestTier;
  reward: ChestReward;
  accessory?: Accessory;
  /** XP it gave (0 for a snack or an accessory). */
  xp: number;
}

/** The accessories a rare chest can hold: neither milestone rewards nor seasonal ones. */
export const CHEST_ACCESSORIES: readonly Accessory[] = ACCESSORIES.filter((a) => !MILESTONE_ACCESSORIES.includes(a) && SEASONAL_ACCESSORIES[a] === undefined);

export const seasonalAccessories = (season: Season): Accessory[] => ACCESSORIES.filter((a) => SEASONAL_ACCESSORIES[a] === season);

export function tierOf(roll: number): ChestTier {
  if (roll < ODDS.common) return "common";
  if (roll < ODDS.common + ODDS.rare) return "rare";
  return "legendary";
}

/** Active work: in work hours, input within the last minute, not on a distracting app or site, not in a meeting. */
export function isActiveWork(x: { inWork: boolean; idleSeconds: number; distracted: boolean; inMeeting: boolean }): boolean {
  return x.inWork && x.idleSeconds < ACTIVE_INPUT_SEC && !x.distracted && !x.inMeeting;
}

type ChestLife = Pick<LifeState, "chests" | "chestsToday" | "chestDay" | "workSec">;

/** A new day starts the daily count and the progress over. */
export function resetChestDay(s: ChestLife, day: string): void {
  if (s.chestDay === day) return;
  s.chestDay = day;
  s.chestsToday = 0;
  s.workSec = 0;
}

/**
 * Adds `seconds` of active work on `day`; returns whether a chest was earned (at most one per call). After 3 today
 * nothing accrues; with 3 held the progress waits, full, so the next chest comes as soon as one is opened.
 */
export function accrueWork(s: ChestLife, seconds: number, day: string): boolean {
  resetChestDay(s, day);
  if (s.chestsToday >= MAX_CHESTS_PER_DAY || seconds <= 0) return false;
  s.workSec += seconds;
  if (s.workSec < CHEST_EVERY_SEC) return false;
  if (s.chests >= MAX_HELD_CHESTS) {
    s.workSec = CHEST_EVERY_SEC;
    return false;
  }
  s.workSec = Math.min(s.workSec - CHEST_EVERY_SEC, CHEST_EVERY_SEC - 1);
  s.chests += 1;
  s.chestsToday += 1;
  return true;
}

const choose = <T>(xs: readonly T[], pick: number): T => xs[Math.min(Math.floor(pick * xs.length), xs.length - 1)];

/** Unlocks an accessory and puts it on if nothing is in its slot, as `checkUnlocks` does. */
function give(s: LifeState, a: Accessory): void {
  s.unlocked.push(a);
  if (!s.wearing.some((w) => accessorySlot(w) === accessorySlot(a))) s.wearing.push(a);
}

/**
 * Opens one held chest: `roll` picks the tier by `ODDS`, `pick` the reward inside it. Common: +20 XP, or a 🍪
 * (1 in 4, if the stash has room). Rare: a chest accessory you don't own, else +40 XP. Legendary: an unowned
 * accessory of the active `season`, else a golden treat (+50 XP). Null when no chest is held.
 */
export function openChest(s: LifeState, roll: number, pick: number, season: Season | null): ChestResult | null {
  if (s.chests <= 0) return null;
  s.chests -= 1;
  const tier = tierOf(roll);
  if (tier === "common") {
    if (pick < SNACK_SHARE && s.snacks < MAX_SNACKS) {
      s.snacks += 1;
      return { tier, reward: "snack", xp: 0 };
    }
    s.xp += COMMON_XP;
    return { tier, reward: "xp", xp: COMMON_XP };
  }
  const pool = (tier === "rare" ? CHEST_ACCESSORIES : season ? seasonalAccessories(season) : []).filter((a) => !s.unlocked.includes(a));
  if (pool.length > 0) {
    const accessory = choose(pool, pick);
    give(s, accessory);
    return { tier, reward: "accessory", accessory, xp: 0 };
  }
  if (tier === "rare") {
    s.xp += RARE_XP;
    return { tier, reward: "xp", xp: RARE_XP };
  }
  s.goldens += 1;
  s.xp += GOLDEN_XP;
  return { tier, reward: "golden", xp: GOLDEN_XP };
}

/**
 * Puts an opened chest back (the task it was opened for couldn't be closed in Todoist): it is held again and its
 * XP, snack or golden treat is taken back. An accessory stays, as a gift.
 */
export function restoreChest(s: LifeState, r: ChestResult): void {
  s.chests = Math.min(MAX_HELD_CHESTS, s.chests + 1);
  s.xp = Math.max(0, s.xp - r.xp);
  if (r.reward === "snack") s.snacks = Math.max(0, s.snacks - 1);
  if (r.reward === "golden") s.goldens = Math.max(0, s.goldens - 1);
}

/** The quiet note when a chest is earned (a reply: never counted against the budget). */
export const chestEarnedText = (): string => L("🎁 Mình kiếm được một rương! Xong việc tiếp theo là mở", "🎁 I found a chest! Finish your next task to open it");

/** One line for the celebration bubble. */
export function chestText(r: ChestResult): string {
  const a = r.accessory ? `${accessoryEmoji(r.accessory)} ${accessoryName(r.accessory)}` : "";
  switch (r.reward) {
    case "snack":
      return L("🎁 Mở rương: được một 🍪 cho túi!", "🎁 Opened a chest: a 🍪 for the stash!");
    case "xp":
      return r.tier === "rare"
        ? L(`🎁 Rương hiếm! Đồ trong đó mình có đủ rồi, nên lấy +${r.xp} XP nha`, `🎁 Rare chest! I already have everything in it, so +${r.xp} XP`)
        : L(`🎁 Mở rương: +${r.xp} XP ✨`, `🎁 Opened a chest: +${r.xp} XP ✨`);
    case "accessory":
      return r.tier === "legendary"
        ? L(`🌟 Rương HUYỀN THOẠI! ${a}, chỉ có trong mùa lễ này thôi!`, `🌟 LEGENDARY chest! ${a}, only this season!`)
        : L(`🎁 Rương hiếm! Mình có ${a} mới nè!`, `🎁 Rare chest! A new ${a} for me!`);
    case "golden":
      return L(`🌟 Rương HUYỀN THOẠI! Bánh vàng 🍰 +${r.xp} XP`, `🌟 LEGENDARY chest! A golden treat 🍰 +${r.xp} XP`);
  }
}
