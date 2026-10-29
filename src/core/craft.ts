// Crafting while you focus (v0.5): the pet knits a home decoration during focus sessions. Pure rules; the brain
// calls them from the heartbeat and at the end of a session.
import { ACTIVE_INPUT_SEC } from "./chests";
import { L } from "./l10n";
import type { LifeState } from "./life";
import { MAX_HOME_ITEMS } from "./prefs";
import type { DecorId } from "./types";
import { DECOR_IDS } from "./types";

/** This long on a distracting app or site during focus drops a few stitches… */
export const DROP_AFTER_SEC = 30;
/** …this much of the item, once per distraction episode. */
export const DROP_COST = 0.1;
/** A finished item once every decoration is owned… */
export const CRAFT_DONE_XP = 30;
/** …and at most this much knitting XP a day. */
export const CRAFT_XP_PER_DAY = 90;
/** An item takes at least this many minutes of active focus: a whole session of the usual 25 makes one. */
export const ITEM_MINUTES = 25;
/** Float sums of many small steps land a hair under 1: this close counts as finished. */
const DONE_EPS = 1e-6;

type CraftLife = Pick<LifeState, "craft" | "decor" | "xp" | "craftXpDay" | "craftXpToday">;

/** The item on the needles is complete (0.9999999 counts). */
export const isFinished = (craft: number): boolean => craft >= 1 - DONE_EPS;

/** Knitting needs you there, as chests do: input within the last minute, and not on a distracting app or site. */
export function isKnitting(x: { idleSeconds: number; distracted: boolean }): boolean {
  return x.idleSeconds < ACTIVE_INPUT_SEC && !x.distracted;
}

/**
 * Knits for `seconds` of active focus in a session of `sessionMinutes` (the running session's own length): a whole
 * session makes one item, but never faster than one per `ITEM_MINUTES`, so short sessions make part of one. Stops at 1.
 */
export function knit(s: Pick<LifeState, "craft">, seconds: number, sessionMinutes: number): void {
  if (!(seconds > 0) || !(sessionMinutes > 0)) return;
  const next = s.craft + seconds / (Math.max(sessionMinutes, ITEM_MINUTES) * 60);
  s.craft = isFinished(next) ? 1 : next;
}

/** Drops a few stitches (never below 0, never from a finished item). Returns how much was lost. */
export function dropStitches(s: Pick<LifeState, "craft">): number {
  if (isFinished(s.craft)) return 0;
  const lost = Math.min(DROP_COST, s.craft);
  s.craft = Math.max(0, s.craft - lost);
  return lost;
}

export interface CraftResult {
  /** The new decoration, or null when every one is owned already (then `xp`, 0 once today's 90 are given). */
  decor: DecorId | null;
  xp: number;
}

/**
 * At 1: adds a decoration not owned yet (`pick` chooses), or +30 XP once all are (at most 90 a day, counted on
 * `day`), and starts a new item. Null while the item isn't finished.
 */
export function finishCraft(s: CraftLife, pick: number, day: string): CraftResult | null {
  if (!isFinished(s.craft)) return null;
  s.craft = 0;
  const fresh = DECOR_IDS.filter((d) => !s.decor.includes(d));
  if (fresh.length === 0) {
    if (s.craftXpDay !== day) {
      s.craftXpDay = day;
      s.craftXpToday = 0;
    }
    const xp = Math.max(0, Math.min(CRAFT_DONE_XP, CRAFT_XP_PER_DAY - s.craftXpToday));
    s.xp += xp;
    s.craftXpToday += xp;
    return { decor: null, xp };
  }
  const decor = fresh[Math.min(Math.floor(pick * fresh.length), fresh.length - 1)];
  s.decor.push(decor);
  return { decor, xp: 0 };
}

/** What the home corner shows: the chosen decorations you own (at most 3), or the 3 newest when none are chosen. */
export function homeDecor(chosen: readonly DecorId[], owned: readonly DecorId[]): DecorId[] {
  const picked = chosen.filter((d) => owned.includes(d)).slice(0, MAX_HOME_ITEMS);
  return chosen.length > 0 ? picked : owned.slice(-MAX_HOME_ITEMS);
}

export const isDecorId = (x: unknown): x is DecorId => typeof x === "string" && (DECOR_IDS as readonly string[]).includes(x);

export function decorName(d: DecorId): string {
  switch (d) {
    case "rug":
      return L("Thảm len", "Rug");
    case "plant":
      return L("Chậu cây", "Potted plant");
    case "lamp":
      return L("Đèn ngủ", "Lamp");
    case "cushion":
      return L("Gối ôm", "Cushion");
    case "bookshelf":
      return L("Kệ sách", "Bookshelf");
    case "mug":
      return L("Cốc trà", "Mug");
    case "poster":
      return L("Tranh treo tường", "Poster");
    case "garland":
      return L("Dây cờ", "Garland");
    case "fishbowl":
      return L("Bể cá", "Fish bowl");
    case "radio":
      return L("Radio", "Radio");
    case "blanket":
      return L("Chăn len", "Blanket");
    case "lantern":
      return L("Đèn lồng", "Lantern");
  }
}

const EMOJI: Readonly<Record<DecorId, string>> = {
  rug: "🧶",
  plant: "🪴",
  lamp: "💡",
  cushion: "🛋️",
  bookshelf: "📚",
  mug: "☕",
  poster: "🖼️",
  garland: "🎏",
  fishbowl: "🐠",
  radio: "📻",
  blanket: "🛏️",
  lantern: "🏮",
};

export const decorEmoji = (d: DecorId): string => EMOJI[d];

/** The reveal line for a finished item (a reply, in the focus-end bubble). */
export function craftText(r: CraftResult): string {
  if (!r.decor && r.xp > 0) {
    return L(`🧶 Đan xong thêm một món nhỏ! Nhà mình đủ đồ rồi, nên mình lấy +${r.xp} XP nhé ✨`, `🧶 Finished another little something! Our home has everything now, so that's +${r.xp} XP ✨`);
  }
  if (!r.decor) {
    return L("🧶 Đan xong thêm một món nhỏ! Hôm nay đủ XP đan len rồi, món này mình cất làm kỷ niệm nha ✨", "🧶 Finished another little something! That's all the knitting XP for today, so I'll keep this one as a keepsake ✨");
  }
  const name = decorName(r.decor).toLowerCase();
  return L(`🧶 Đan xong rồi! Góc nhà mình có thêm ${name} ${decorEmoji(r.decor)} nè ✨`, `🧶 All done! A ${name} ${decorEmoji(r.decor)} for our little corner ✨`);
}

/** When stitches drop: the pet's clumsiness, never your fault. */
export const droppedText = () =>
  L("Ối, mình lỡ tuột mấy mũi đan 🧶 Mình cùng quay lại việc nhé?", "Oops, I dropped a few stitches 🧶 Back to it together?");
