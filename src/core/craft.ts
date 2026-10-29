// Crafting while you focus (v0.5): the pet knits a home decoration during focus sessions. Pure rules; the brain
// calls them from the heartbeat and at the end of a session.
import { L } from "./l10n";
import type { LifeState } from "./life";
import { MAX_HOME_ITEMS } from "./prefs";
import type { DecorId } from "./types";
import { DECOR_IDS } from "./types";

/** This long on a distracting app or site during focus drops a few stitches… */
export const DROP_AFTER_SEC = 30;
/** …this much of the item, once per distraction episode. */
export const DROP_COST = 0.1;
/** A finished item once every decoration is owned. */
export const CRAFT_DONE_XP = 30;

type CraftLife = Pick<LifeState, "craft" | "decor" | "xp">;

/** Knits for `seconds` of a focus session: a whole session of `focusMinutes` makes one item. Stops at 1. */
export function knit(s: Pick<LifeState, "craft">, seconds: number, focusMinutes: number): void {
  if (seconds <= 0 || focusMinutes <= 0) return;
  s.craft = Math.min(1, s.craft + seconds / (focusMinutes * 60));
}

/** A completed session finishes the item it was on. */
export function topUp(s: Pick<LifeState, "craft">): void {
  s.craft = 1;
}

/** Drops a few stitches (never below 0, never a finished item). Returns how much was lost. */
export function dropStitches(s: Pick<LifeState, "craft">): number {
  const lost = Math.min(DROP_COST, s.craft);
  s.craft = Math.max(0, s.craft - lost);
  return lost;
}

export interface CraftResult {
  /** The new decoration, or null when every one is owned already (then `xp`). */
  decor: DecorId | null;
  xp: number;
}

/** At 1: adds a decoration not owned yet (`pick` chooses), or +30 XP once all are, and starts a new item. */
export function finishCraft(s: CraftLife, pick: number): CraftResult | null {
  if (s.craft < 1) return null;
  s.craft = 0;
  const fresh = DECOR_IDS.filter((d) => !s.decor.includes(d));
  if (fresh.length === 0) {
    s.xp += CRAFT_DONE_XP;
    return { decor: null, xp: CRAFT_DONE_XP };
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
  if (!r.decor) {
    return L(`🧶 Đan xong thêm một món nhỏ! Nhà mình đủ đồ rồi, nên mình lấy +${r.xp} XP nhé ✨`, `🧶 Finished another little something! Our home has everything now, so that's +${r.xp} XP ✨`);
  }
  const name = decorName(r.decor).toLowerCase();
  return L(`🧶 Đan xong rồi! Góc nhà mình có thêm ${name} ${decorEmoji(r.decor)} nè ✨`, `🧶 All done! A ${name} ${decorEmoji(r.decor)} for our little corner ✨`);
}

/** When stitches drop: the pet's clumsiness, never your fault. */
export const droppedText = () =>
  L("Ối, mình lỡ tuột mấy mũi đan 🧶 Mình cùng quay lại việc nhé?", "Oops, I dropped a few stitches 🧶 Back to it together?");
