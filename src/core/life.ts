// Feeding, hunger, dirt, growth, combos, accessories and day settlement (PetLife.swift). Pure rules.
import { countWeek, emptyWeek, rollWeek, weekFromJson, weekKey, type WeekStats } from "./chapters";
import { addDays, dayKey, isDayKey, parseDate } from "./dates";
import { L } from "./l10n";
import { isSouvenirId, tripFromJson, type SouvenirId, type Trip } from "./trips";
import type { Accessory, AccessorySlot, CelebrationKind, DecorId, ReminderKind, Season, StageIndex } from "./types";
import { ACCESSORIES, ACCESSORY_SLOT, DECOR_IDS, EVERY_KINDS } from "./types";

export const STAGE_THRESHOLDS = [0, 100, 300, 700, 1500] as const;

export function stageOf(xp: number): StageIndex {
  let s: StageIndex = 0;
  for (let i = 0; i < STAGE_THRESHOLDS.length; i++) if (xp >= STAGE_THRESHOLDS[i]) s = i as StageIndex;
  return s;
}

export function stageName(s: StageIndex): string {
  return [
    L("Em bé", "Baby"),
    L("Nhóc", "Kid"),
    L("Thiếu niên", "Teen"),
    L("Trưởng thành", "Grown-up"),
    L("Cao thủ", "Master"),
  ][s];
}

/** XP needed for the next stage, or null at Master. */
export const nextStageXp = (s: StageIndex): number | null => STAGE_THRESHOLDS[s + 1] ?? null;

export const accessorySlot = (a: Accessory): AccessorySlot => ACCESSORY_SLOT[a];

/** Earned with milestones; every other accessory comes out of a chest. */
export const MILESTONE_ACCESSORIES: readonly Accessory[] = ["bow", "scarf", "sunglasses", "tophat", "crown", "gradcap"];

/** Accessories that only drop during their season. */
export const SEASONAL_ACCESSORIES: Readonly<Partial<Record<Accessory, Season>>> = {
  maicrown: "tet",
  tetscarf: "tet",
  bunnyband: "trungthu",
  witchhat: "halloween",
  santahat: "christmas",
  bellcollar: "christmas",
};

const EMOJI: Readonly<Record<Accessory, string>> = {
  bow: "🎀",
  scarf: "🧣",
  sunglasses: "🕶️",
  tophat: "🎩",
  crown: "👑",
  gradcap: "🎓",
  beanie: "🧶",
  flowercrown: "🌸",
  partyhat: "🎉",
  nonla: "👒",
  bandana: "🧡",
  heartglasses: "💖",
  roundglasses: "👓",
  starglasses: "🌟",
  maicrown: "🌼",
  tetscarf: "🧧",
  bunnyband: "🐰",
  witchhat: "🧙",
  santahat: "🎅",
  bellcollar: "🔔",
};

export const accessoryEmoji = (a: Accessory): string => EMOJI[a];

export function accessoryName(a: Accessory): string {
  switch (a) {
    case "bow":
      return L("Nơ xinh", "Bow");
    case "scarf":
      return L("Khăn quàng", "Scarf");
    case "sunglasses":
      return L("Kính râm ngầu", "Cool shades");
    case "tophat":
      return L("Mũ quý ông", "Top hat");
    case "crown":
      return L("Vương miện", "Crown");
    case "gradcap":
      return L("Mũ tốt nghiệp", "Grad cap");
    case "beanie":
      return L("Mũ len", "Beanie");
    case "flowercrown":
      return L("Vòng hoa", "Flower crown");
    case "partyhat":
      return L("Mũ tiệc", "Party hat");
    case "nonla":
      return L("Nón lá", "Nón lá");
    case "bandana":
      return L("Khăn bandana", "Bandana");
    case "heartglasses":
      return L("Kính trái tim", "Heart glasses");
    case "roundglasses":
      return L("Kính tròn", "Round glasses");
    case "starglasses":
      return L("Kính ngôi sao", "Star glasses");
    case "maicrown":
      return L("Vòng hoa mai", "Apricot blossom crown");
    case "tetscarf":
      return L("Khăn đỏ ngày Tết", "Red Tết scarf");
    case "bunnyband":
      return L("Bờm thỏ Trung Thu", "Moon rabbit ears");
    case "witchhat":
      return L("Mũ phù thuỷ", "Witch hat");
    case "santahat":
      return L("Mũ ông già Noel", "Santa hat");
    case "bellcollar":
      return L("Vòng chuông", "Bell collar");
  }
}

export function accessoryRequirement(a: Accessory): string {
  switch (a) {
    case "bow":
      return L("Xong việc đầu tiên", "Finish your first task");
    case "scarf":
      return L("Giữ chuỗi 3 ngày", "Keep a 3-day streak");
    case "sunglasses":
      return L("Xong 3 việc, mỗi việc cách nhau dưới 30 phút", "Finish 3 tasks, each within 30 minutes of the last");
    case "tophat":
      return L("Xong 25 việc", "Finish 25 tasks");
    case "crown":
      return L("Giữ chuỗi 7 ngày", "Keep a 7-day streak");
    case "gradcap":
      return L("Lớn tới giai đoạn Trưởng thành", "Reach the Grown-up stage");
    default:
      switch (SEASONAL_ACCESSORIES[a]) {
        case "tet":
          return L("Có trong rương dịp Tết", "In chests around Tết");
        case "trungthu":
          return L("Có trong rương dịp Trung Thu", "In chests around Mid-Autumn");
        case "halloween":
          return L("Có trong rương dịp Halloween", "In chests around Halloween");
        case "christmas":
          return L("Có trong rương dịp Giáng sinh", "In chests around Christmas");
        default:
          return L("Có trong rương quà", "Found in chests");
      }
  }
}

/** At most this many 🍪 in the stash; each one saves a missed day. */
export const MAX_SNACKS = 2;
/** A broken streak comes back after this many tasks on the next workday… */
export const REPAIR_TASKS = 2;
/** …if that day comes within this many days of the break. */
export const REPAIR_DAYS = 14;
export const PAGE_SIZE = 10;
/** The most chests held at once (v0.5; the chest rules live in chests.ts). */
export const MAX_HELD_CHESTS = 3;
/** Every sticker page starts with this many gift stickers 🎁. */
export const PAGE_GIFTS = 2;
/**
 * How the pet remembers a settled day (v0.6, for the pet card's record): `G` goal met, `K` kept (at least one task),
 * `R` a rest day, weekend or excused busy day, `-` nothing. The card carries the last `HISTORY_DAYS` of them.
 */
export type DayMark = "G" | "K" | "R" | "-";
export const DAY_MARKS: readonly DayMark[] = ["G", "K", "R", "-"];
export const HISTORY_DAYS = 28;
/** Each dismissal of a repeating reminder doubles its interval, up to this many times the usual. */
export const MAX_BACKOFF = 8;

/** "Finish 2 tasks on your next workday and your old streak comes back." */
export interface RepairQuest {
  /** The streak that broke. */
  streak: number;
  /** The last day ("yyyy-MM-dd") it can be done on. */
  until: string;
  /**
   * Set while today's finished tasks have brought the old streak back: the streak it replaced, to fall back to if
   * the count drops again (a failed close, an Undo). Only final once the day closes.
   */
  restored?: { from: number };
}

/** Everything the pet remembers across days. */
export interface LifeState {
  satiety: number;
  dirt: number;
  xp: number;
  totalDone: number;
  /** Workdays in a row with at least one finished task. */
  streak: number;
  bestStreak: number;
  /** 🍪 in the stash (0–2). */
  snacks: number;
  repair: RepairQuest | null;
  /** The sticker page being filled (1-based) and how many of its 10 slots are taken, gifts included. */
  stickerPage: number;
  pageFilled: number;
  combo: number;
  bestCombo: number;
  goldens: number;
  /** Epoch ms. */
  lastDoneAt: number | null;
  lastDecayAt: number | null;
  perfectDays: string[];
  unlocked: Accessory[];
  wearing: Accessory[];
  // The day in progress, settled when the date changes.
  dayKey: string;
  dayCompleted: number;
  dayPlanned: number;
  dayTarget: number;
  dayWorkday: boolean;
  /** Fewer than 60 free minutes in work hours (calendar on). */
  dayBusy: boolean;
  /** The app reached Todoist today; a day it never saw changes nothing. */
  daySeen: boolean;
  /** Seconds spent today in each distracting app or site. */
  distraction: Record<string, number>;
  /** Unsolicited reminders shown today (the nudge budget), kept across restarts. */
  dayNudges: number;
  /**
   * Today's reminder gates, kept across restarts so they don't fire again: when each reminder kind's timer, "Later",
   * and each once-a-day key of a counted bubble or check-in (`morning-<day>`, `stuck-<id>-<day>`…) last fired (epoch ms).
   */
  dayFired: Record<string, number>;
  /** Today's back-off per repeating reminder kind (2, 4 or 8 times its interval). */
  dayBackoff: Partial<Record<ReminderKind, number>>;
  /** Reminders closed or ignored in a row today. */
  dismissedInRow: number;
  /** After three dismissed in a row, non-urgent reminders wait until then (epoch ms); it runs out on its own. */
  nudgeHoldUntil: number | null;
  // v0.5 "Game".
  /** Chests held (0–3), earned with active work and opened by finishing a task. */
  chests: number;
  /** Chests earned on `chestDay` (at most 3 a day). */
  chestsToday: number;
  chestDay: string;
  /** Seconds of active work toward the next chest. */
  workSec: number;
  /** The item being knitted during focus (0–1). */
  craft: number;
  /** Knitting XP given on `craftXpDay` once every decoration is owned (at most 90 a day). */
  craftXpToday: number;
  craftXpDay: string;
  /** Home decorations owned, in the order they were made. */
  decor: DecorId[];
  /** Souvenirs on the shelf, in the order they came home. */
  souvenirs: SouvenirId[];
  /** Set while the pet is away on a trip. */
  trip: Trip | null;
  /** The day of the last trip (one a day). */
  tripDay: string;
  /** The day you said "Stay" to the trip offer: not offered again that day, even after a restart. */
  tripDeclined: string;
  /** This week's tasks, stickers and trips, and last week's for the Monday fresh start. */
  week: WeekStats;
  lastWeek: WeekStats | null;
  /** The week whose fresh-start line the pet already said. */
  weekGreeted: string;
  // v0.6 "Friends".
  /** The last `HISTORY_DAYS` settled days, by day key: what the pet card's record is made of (see `DayMark`). */
  history: Record<string, DayMark>;
  /** The ISO weeks whose Procrastination Blob was beaten (a 🏅 sticker and 50 XP each), newest last. */
  bossWins: string[];
  /** How many of the stickers on the current page are 🏅 medals rather than perfect-day 🌟. */
  pageMedals: number;
}

export const newLife = (): LifeState => ({
  satiety: 70,
  dirt: 0,
  xp: 0,
  totalDone: 0,
  streak: 0,
  bestStreak: 0,
  snacks: 1,
  repair: null,
  stickerPage: 1,
  pageFilled: PAGE_GIFTS,
  combo: 0,
  bestCombo: 0,
  goldens: 0,
  lastDoneAt: null,
  lastDecayAt: null,
  perfectDays: [],
  unlocked: [],
  wearing: [],
  dayKey: "",
  dayCompleted: 0,
  dayPlanned: 0,
  dayTarget: 3,
  dayWorkday: true,
  dayBusy: false,
  daySeen: false,
  distraction: {},
  dayNudges: 0,
  dayFired: {},
  dayBackoff: {},
  dismissedInRow: 0,
  nudgeHoldUntil: null,
  chests: 0,
  chestsToday: 0,
  chestDay: "",
  workSec: 0,
  craft: 0,
  craftXpToday: 0,
  craftXpDay: "",
  decor: [],
  souvenirs: [],
  trip: null,
  tripDay: "",
  tripDeclined: "",
  week: emptyWeek(),
  lastWeek: null,
  weekGreeted: "",
  history: {},
  bossWins: [],
  pageMedals: 0,
});

const isAccessory = (x: unknown): x is Accessory => typeof x === "string" && (ACCESSORIES as readonly string[]).includes(x);
const num = (x: unknown, d: number) => (typeof x === "number" && Number.isFinite(x) ? x : d);
const clampInt = (x: unknown, lo: number, hi: number, d: number) => Math.min(hi, Math.max(lo, Math.trunc(num(x, d))));

/** How many weeks of boss wins are kept. */
const MAX_BOSS_WINS = 60;
/** The 🏅 the weekly boss gives, plus its XP. */
export const BOSS_XP = 50;

const isDayMark = (x: unknown): x is DayMark => typeof x === "string" && (DAY_MARKS as readonly string[]).includes(x);

/** A saved record of days: real days with a known mark, the newest 28. Pets from before v0.6 get their perfect days as goal days. */
function historyFromJson(x: unknown, perfectDays: readonly string[]): Record<string, DayMark> {
  const out: Record<string, DayMark> = {};
  if (x && typeof x === "object" && !Array.isArray(x)) {
    for (const [day, mark] of Object.entries(x)) if (isDayKey(day) && isDayMark(mark)) out[day] = mark;
  }
  for (const day of perfectDays) if (isDayKey(day) && !(day in out)) out[day] = "G";
  return Object.fromEntries(
    Object.keys(out)
      .sort()
      .slice(-HISTORY_DAYS)
      .map((day) => [day, out[day]]),
  );
}

function repairFromJson(x: unknown): RepairQuest | null {
  if (!x || typeof x !== "object") return null;
  const r = x as Record<string, unknown>;
  if (typeof r.streak !== "number" || r.streak < 1 || !isDayKey(r.until)) return null;
  const quest: RepairQuest = { streak: Math.trunc(r.streak), until: r.until };
  const from = r.restored && typeof r.restored === "object" ? (r.restored as Record<string, unknown>).from : undefined;
  if (typeof from === "number" && Number.isFinite(from) && from >= 0) quest.restored = { from: Math.trunc(from) };
  return quest;
}

/** Tolerates missing or broken fields, so adding fields later never wipes the pet's progress. */
export function lifeFromJson(raw: unknown): LifeState {
  const d = newLife();
  if (!raw || typeof raw !== "object") return d;
  const r = raw as Record<string, unknown>;
  const strings = (x: unknown) => (Array.isArray(x) ? x.filter((s): s is string => typeof s === "string") : []);
  const distraction: Record<string, number> = {};
  if (r.distraction && typeof r.distraction === "object") {
    for (const [k, v] of Object.entries(r.distraction as Record<string, unknown>)) if (typeof v === "number") distraction[k] = v;
  }
  const perfectDays = strings(r.perfectDays);
  const dayFired: Record<string, number> = {};
  if (r.dayFired && typeof r.dayFired === "object") {
    for (const [k, v] of Object.entries(r.dayFired as Record<string, unknown>)) if (typeof v === "number" && Number.isFinite(v)) dayFired[k] = v;
  }
  const dayBackoff: Partial<Record<ReminderKind, number>> = {};
  if (r.dayBackoff && typeof r.dayBackoff === "object") {
    const raw = r.dayBackoff as Record<string, unknown>;
    for (const k of EVERY_KINDS) {
      const v = raw[k];
      if (typeof v === "number" && v >= 2) dayBackoff[k] = Math.min(MAX_BACKOFF, Math.trunc(v));
    }
  }
  const pageFilled = clampInt(r.pageFilled, 0, PAGE_SIZE, PAGE_GIFTS + (perfectDays.length % 8));
  return {
    satiety: Math.min(100, Math.max(0, num(r.satiety, d.satiety))),
    dirt: Math.min(3, Math.max(0, Math.trunc(num(r.dirt, d.dirt)))),
    xp: num(r.xp, d.xp),
    totalDone: num(r.totalDone, d.totalDone),
    streak: num(r.streak, d.streak),
    bestStreak: num(r.bestStreak, d.bestStreak),
    snacks: clampInt(r.snacks, 0, MAX_SNACKS, d.snacks),
    repair: repairFromJson(r.repair),
    // Older versions had no pages: 8 perfect days per page, after the 2 gifts.
    stickerPage: clampInt(r.stickerPage, 1, Number.MAX_SAFE_INTEGER, 1 + Math.floor(perfectDays.length / 8)),
    pageFilled,
    combo: num(r.combo, d.combo),
    bestCombo: num(r.bestCombo, d.bestCombo),
    goldens: num(r.goldens, d.goldens),
    lastDoneAt: typeof r.lastDoneAt === "number" ? r.lastDoneAt : null,
    lastDecayAt: typeof r.lastDecayAt === "number" ? r.lastDecayAt : null,
    perfectDays,
    unlocked: (Array.isArray(r.unlocked) ? r.unlocked : []).filter(isAccessory),
    wearing: (Array.isArray(r.wearing) ? r.wearing : []).filter(isAccessory),
    dayKey: typeof r.dayKey === "string" ? r.dayKey : d.dayKey,
    dayCompleted: num(r.dayCompleted, d.dayCompleted),
    dayPlanned: num(r.dayPlanned, d.dayPlanned),
    dayTarget: num(r.dayTarget, d.dayTarget),
    dayWorkday: typeof r.dayWorkday === "boolean" ? r.dayWorkday : d.dayWorkday,
    dayBusy: r.dayBusy === true,
    // Saved by an older version, the stored day was one it saw.
    daySeen: typeof r.daySeen === "boolean" ? r.daySeen : true,
    distraction,
    dayNudges: clampInt(r.dayNudges, 0, 1000, 0),
    dayFired,
    dayBackoff,
    dismissedInRow: clampInt(r.dismissedInRow, 0, 1000, 0),
    nudgeHoldUntil: typeof r.nudgeHoldUntil === "number" && Number.isFinite(r.nudgeHoldUntil) ? r.nudgeHoldUntil : null,
    chests: clampInt(r.chests, 0, MAX_HELD_CHESTS, 0),
    chestsToday: clampInt(r.chestsToday, 0, 1000, 0),
    chestDay: isDayKey(r.chestDay) ? r.chestDay : "",
    workSec: Math.max(0, num(r.workSec, 0)),
    craft: Math.min(1, Math.max(0, num(r.craft, 0))),
    craftXpToday: clampInt(r.craftXpToday, 0, 1000, 0),
    craftXpDay: isDayKey(r.craftXpDay) ? r.craftXpDay : "",
    decor: [...new Set((Array.isArray(r.decor) ? r.decor : []).filter((x): x is DecorId => (DECOR_IDS as readonly unknown[]).includes(x)))],
    souvenirs: [...new Set((Array.isArray(r.souvenirs) ? r.souvenirs : []).filter(isSouvenirId))],
    trip: tripFromJson(r.trip),
    tripDay: isDayKey(r.tripDay) ? r.tripDay : "",
    tripDeclined: isDayKey(r.tripDeclined) ? r.tripDeclined : "",
    week: weekFromJson(r.week) ?? emptyWeek(),
    lastWeek: weekFromJson(r.lastWeek),
    weekGreeted: typeof r.weekGreeted === "string" ? r.weekGreeted : "",
    history: historyFromJson(r.history, perfectDays),
    bossWins: [...new Set(strings(r.bossWins).filter((w) => w !== ""))].slice(-MAX_BOSS_WINS),
    // At most as many medals as the page has stickers of its own (after the gifts).
    pageMedals: Math.min(Math.max(0, pageFilled - PAGE_GIFTS), clampInt(r.pageMedals, 0, PAGE_SIZE, 0)),
  };
}

/** A pet with some history, for the demo and screenshots. */
export function demoLife(): LifeState {
  return {
    ...newLife(),
    satiety: 55,
    xp: 320,
    totalDone: 31,
    streak: 4,
    bestStreak: 4,
    bestCombo: 2,
    goldens: 1,
    unlocked: ["bow", "scarf", "tophat"],
    wearing: ["scarf"],
    perfectDays: ["2026-10-16", "2026-10-20", "2026-10-21", "2026-10-23"],
    // One snack in the stash and a page with 2 gifts + 4 stickers: "6/10 · 4 more perfect days for a gift".
    snacks: 1,
    pageFilled: PAGE_GIFTS + 4,
    distraction: { "youtube.com": 720, "facebook.com": 300 },
    // A chest to open with the next task, a decoration half knitted, a home corner and a souvenir shelf.
    chests: 1,
    chestsToday: 1,
    chestDay: dayKey(new Date()),
    workSec: 600,
    craft: 0.4,
    decor: ["rug", "plant", "mug"],
    souvenirs: ["hoian", "dalat", "kyoto", "paris"],
    history: demoHistory(dayKey(new Date())),
    // A few tasks already finished this week, so the weekly boss has something of yours on it.
    week: { key: weekKey(new Date()), done: 3, stickers: 0, trips: 0 },
  };
}

/** The demo pet's last two weeks, ending yesterday: a 4-day streak, a weekend off, and good days before it. */
export function demoHistory(today: string): Record<string, DayMark> {
  // Oldest first, the last one is yesterday: the streak of 4 is K G G G, after a missed day.
  const marks: DayMark[] = ["K", "G", "K", "G", "G", "R", "R", "G", "G", "-", "K", "G", "G", "G"];
  const out: Record<string, DayMark> = {};
  marks.forEach((m, i) => (out[addDays(today, i - marks.length)] = m));
  return out;
}

export const isHungry = (s: LifeState) => s.satiety < 30;
export const distractionTotal = (s: LifeState) => Object.values(s.distraction).reduce((a, b) => a + b, 0);

/** How far along an accessory is ("12/25"); `have` stops at `need`. */
export function accessoryProgress(a: Accessory, s: LifeState): { have: number; need: number } {
  const [have, need] = (() => {
    switch (a) {
      case "bow":
        return [s.totalDone, 1];
      case "scarf":
        return [s.bestStreak, 3];
      case "sunglasses":
        return [s.bestCombo, 3];
      case "tophat":
        return [s.totalDone, 25];
      case "crown":
        return [s.bestStreak, 7];
      case "gradcap":
        return [s.xp, STAGE_THRESHOLDS[3]];
      default:
        // Chest items: you either found it or you didn't.
        return [s.unlocked.includes(a) ? 1 : 0, 1];
    }
  })();
  return { have: Math.min(Math.max(0, Math.floor(have)), need), need };
}

export function isEarned(a: Accessory, s: LifeState): boolean {
  if (!MILESTONE_ACCESSORIES.includes(a)) return false;
  const p = accessoryProgress(a, s);
  return p.have >= p.need;
}

/** Locked species (bee, dragon, unicorn) open with a streak or a number of finished tasks. */
export function meetsUnlock(unlock: { kind: "streak" | "tasks"; value: number } | undefined, s: LifeState): boolean {
  if (!unlock) return true;
  return unlock.kind === "streak" ? s.bestStreak >= unlock.value : s.totalDone >= unlock.value;
}

export interface FeedResult {
  food: string;
  combo: number;
  golden: boolean;
  kind: CelebrationKind;
  unlocked: Accessory[];
  levelUp: StageIndex | null;
  cleaned: boolean;
}

export const COMBO_WINDOW_MS = 30 * 60_000;
export const FOODS = ["🍙", "🍡", "🐟", "🧁", "🍓", "🍪", "🥟", "🍩"] as const;
export const HUNGER_PER_HOUR = 7;

/** Puts newly earned accessories on right away if nothing else is in that slot. */
export function checkUnlocks(s: LifeState): Accessory[] {
  const fresh: Accessory[] = [];
  for (const a of ACCESSORIES) {
    if (s.unlocked.includes(a) || !isEarned(a, s)) continue;
    s.unlocked.push(a);
    fresh.push(a);
    if (!s.wearing.some((w) => accessorySlot(w) === accessorySlot(a))) s.wearing.push(a);
  }
  return fresh;
}

/** Feeds the pet for one finished task. `roll` decides a rare golden treat (10%), `pick` the food and the dance. */
export function feed(s: LifeState, now: number, roll: number, pick: number): FeedResult {
  const before = stageOf(s.xp);
  s.combo = s.lastDoneAt !== null && now - s.lastDoneAt <= COMBO_WINDOW_MS ? s.combo + 1 : 1;
  s.lastDoneAt = now;
  s.bestCombo = Math.max(s.bestCombo, s.combo);
  s.totalDone += 1;
  const golden = roll < 0.1;
  if (golden) s.goldens += 1;
  s.xp += 10 + 5 * Math.min(Math.max(s.combo - 1, 0), 4) + (golden ? 20 : 0);
  s.satiety = Math.min(100, s.satiety + 25);
  const cleaned = s.dirt > 0;
  if (cleaned) s.dirt -= 1;
  const dances: CelebrationKind[] = ["jump", "spin", "flip", "dance"];
  const i = Math.min(Math.floor(pick * dances.length), dances.length - 1);
  const kind: CelebrationKind = golden || s.combo >= 3 ? "fireworks" : dances[i];
  const food = golden ? "🍰" : FOODS[Math.min(Math.floor(pick * FOODS.length * 7) % FOODS.length, FOODS.length - 1)];
  const unlocked = checkUnlocks(s);
  const after = stageOf(s.xp);
  countWeek(s, dayOf(now), "done");
  return { food, combo: s.combo, golden, kind, unlocked, levelUp: after !== before ? after : null, cleaned };
}

/** Reverses one feed (when you undo a completion), taking back the XP and golden treat it gave when known. */
export function unfeed(s: LifeState, gained: { xp: number; golden: boolean } = { xp: 10, golden: false }): void {
  s.totalDone = Math.max(0, s.totalDone - 1);
  s.xp = Math.max(0, s.xp - gained.xp);
  s.satiety = Math.max(0, s.satiety - 25);
  s.combo = Math.max(0, s.combo - 1);
  if (gained.golden) s.goldens = Math.max(0, s.goldens - 1);
  s.week.done = Math.max(0, s.week.done - 1);
}

/** Hunger grows during work hours only (at most one hour per step, so sleep or lunch doesn't starve the pet). */
export function decay(s: LifeState, now: number, working: boolean): void {
  const last = s.lastDecayAt;
  s.lastDecayAt = now;
  if (!working || last === null || now <= last) return;
  s.satiety = Math.max(0, s.satiety - (HUNGER_PER_HOUR * Math.min(now - last, 3_600_000)) / 3_600_000);
}

/**
 * Records today as the app sees it after a Todoist sync. `verified`: Todoist confirmed today's finished tasks
 * (the completed-tasks fetch worked), which makes it a day the app saw. A packed calendar stays packed for the day,
 * even if a later calendar fetch fails.
 */
export function syncDay(s: LifeState, completed: number, plannedCount: number, target: number, workday: boolean, busy = false, verified = true): void {
  s.dayCompleted = completed;
  s.dayPlanned = plannedCount;
  s.dayTarget = target;
  s.dayWorkday = workday;
  s.dayBusy ||= busy;
  s.daySeen ||= verified;
}

/** The repair quest that today can finish: a workday no later than 14 days after the break. */
export function activeRepair(s: LifeState): RepairQuest | null {
  return s.repair && s.dayWorkday && s.dayKey <= s.repair.until ? s.repair : null;
}

/**
 * Re-evaluates today's repair quest after a sync: the old streak is back while today has `REPAIR_TASKS` finished
 * tasks, and goes back to what it was when the count drops again (a failed close, an Undo). Idempotent; `closeDay`
 * makes it final. Returns what changed.
 */
export function checkRepair(s: LifeState): "restored" | "reverted" | null {
  const quest = s.repair;
  if (!quest) return null;
  const done = activeRepair(s) !== null && s.dayCompleted >= REPAIR_TASKS;
  if (done && !quest.restored) {
    s.repair = { ...quest, restored: { from: s.streak } };
    s.streak = Math.max(s.streak, quest.streak);
    return "restored";
  }
  if (!done && quest.restored) {
    s.streak = quest.restored.from;
    s.repair = { streak: quest.streak, until: quest.until };
    return "reverted";
  }
  return null;
}

function addSnack(s: LifeState): boolean {
  if (s.snacks >= MAX_SNACKS) return false;
  s.snacks += 1;
  return true;
}

/** Sticks a perfect day's sticker on the page. A full page gives +50 XP and a snack, and a new page starts with its gifts. */
function addSticker(s: LifeState, kind: "star" | "medal" = "star"): { pageDone: boolean; snack: boolean } {
  s.pageFilled += 1;
  if (kind === "medal") s.pageMedals += 1;
  if (s.pageFilled < PAGE_SIZE) return { pageDone: false, snack: false };
  s.xp += 50;
  s.stickerPage += 1;
  s.pageFilled = PAGE_GIFTS;
  s.pageMedals = 0;
  return { pageDone: true, snack: addSnack(s) };
}

/** What the weekly boss's win gave (v0.6). `xp` includes the page's +50 when the medal filled it. */
export interface BossReward {
  xp: number;
  pageDone: boolean;
  snack: boolean;
  levelUp: StageIndex | null;
  unlocked: Accessory[];
}

/**
 * The Procrastination Blob of ISO `week` was beaten (on `day`): +50 XP and a 🏅 on the sticker page, once a week.
 * Returns what it gave, or null when this week's reward was already given (or the week has no name).
 */
export function winBoss(s: LifeState, week: string, day: string): BossReward | null {
  if (week === "" || s.bossWins.includes(week)) return null;
  const stageBefore = stageOf(s.xp);
  const xpBefore = s.xp;
  s.bossWins = [...s.bossWins, week].slice(-MAX_BOSS_WINS);
  s.xp += BOSS_XP;
  countWeek(s, day, "stickers");
  const page = addSticker(s, "medal");
  const unlocked = checkUnlocks(s);
  const stageAfter = stageOf(s.xp);
  return { xp: s.xp - xpBefore, pageDone: page.pageDone, snack: page.snack, levelUp: stageAfter !== stageBefore ? stageAfter : null, unlocked };
}

export function addDistraction(s: LifeState, label: string, seconds: number): void {
  s.distraction[label] = (s.distraction[label] ?? 0) + seconds;
}

/**
 * How a settled day went: `kept` (a task done, on any day the app saw), `excused` (a workday with a packed calendar
 * and nothing done), `frozen` (a missed workday, a snack saved the streak), `broken` (a missed workday, no snack or
 * no streak to save) or `none` (a rest day or weekend with nothing done, or a day the app never saw).
 */
export type DayOutcome = "kept" | "excused" | "frozen" | "broken" | "none";

export interface DayClose {
  /** The day that was settled; "" when nothing was. */
  day: string;
  outcome: DayOutcome;
  /** The streak a broken day ended. */
  lost: number;
  snackEarned: boolean;
  sticker: boolean;
  pageDone: boolean;
  repairOffered: boolean;
  /** A repair quest ran out: its day closed unfinished, or 14 days went by. */
  repairExpired: boolean;
  /** The growth stage the day's XP (sticker, full page) reached, if it crossed one. */
  levelUp: StageIndex | null;
  unlocked: Accessory[];
}

/** How the day being settled goes in the record: the goal met (even on a day off), a task, a day off, or nothing. */
function dayMarkOf(s: LifeState, outcome: DayOutcome): DayMark {
  if (outcome === "kept") return s.dayTarget > 0 && s.dayCompleted >= s.dayTarget ? "G" : "K";
  if (outcome === "excused" || (outcome === "none" && !s.dayWorkday)) return "R";
  return "-";
}

/**
 * Settles the stored day once the date changed. On any day the app saw, one finished task keeps the streak; a goal
 * day adds a snack, a perfect day a sticker. A missed workday eats a snack if there is a streak to save, or breaks
 * it (dirt, and a repair quest for streaks of 2+ while its 14 days haven't gone by). Days the app never saw (PC off,
 * no word from Todoist), rest days and weekends with nothing done, and busy days with nothing done change nothing.
 * Today's repair quest is decided here, by the day's final count.
 */
export function closeDay(s: LifeState, today: string, isWorkday: (key: string) => boolean): DayClose {
  const r: DayClose = {
    day: "",
    outcome: "none",
    lost: 0,
    snackEarned: false,
    sticker: false,
    pageDone: false,
    repairOffered: false,
    repairExpired: false,
    levelUp: null,
    unlocked: [],
  };
  if (!s.dayKey || s.dayKey >= today) {
    if (!s.dayKey) s.dayKey = today;
    return r;
  }
  r.day = s.dayKey;
  const stageBefore = stageOf(s.xp);
  const seen = s.daySeen;
  const missed = seen && s.dayWorkday && s.dayCompleted === 0;
  // The quest's day is over: with 2 tasks done the old streak stays back, otherwise it goes back to what it was.
  const quest = seen ? activeRepair(s) : null;
  if (s.repair) {
    const base = s.repair.restored?.from ?? s.streak;
    if (quest && s.dayCompleted >= REPAIR_TASKS) {
      s.streak = Math.max(base, s.repair.streak);
      s.repair = null;
    } else {
      s.streak = base;
      s.repair = { streak: s.repair.streak, until: s.repair.until };
    }
  }
  let broke = 0;
  if (seen && s.dayCompleted > 0) {
    r.outcome = "kept";
    s.streak += 1;
    s.bestStreak = Math.max(s.bestStreak, s.streak);
    if (s.dayTarget > 0 && s.dayCompleted >= s.dayTarget) {
      r.snackEarned = addSnack(s);
      if (s.dayCompleted >= s.dayPlanned) {
        r.sticker = true;
        s.perfectDays.push(s.dayKey);
        countWeek(s, s.dayKey, "stickers");
        s.xp += 30;
        const page = addSticker(s);
        r.pageDone = page.pageDone;
        r.snackEarned ||= page.snack;
      }
    }
  } else if (missed && s.dayBusy) {
    r.outcome = "excused";
  } else if (missed && s.streak > 0 && s.snacks > 0) {
    r.outcome = "frozen";
    s.snacks -= 1;
  } else if (missed) {
    // With no streak to save, the snack stays in the stash; the day still counts as missed (dirt).
    r.outcome = "broken";
    r.lost = s.streak;
    broke = s.streak;
    s.dirt = Math.min(3, s.dirt + 1);
    s.streak = 0;
  }
  s.history[r.day] = dayMarkOf(s, r.outcome);
  // An unfinished quest ends with its day (a busy day doesn't use it up), and 14 days after the break at the latest.
  if (s.repair && ((quest && r.outcome !== "excused") || today > s.repair.until)) {
    s.repair = null;
    r.repairExpired = true;
  }
  // A broken streak of 2+ can come back, unless its 14 days have gone by already (the PC was off since).
  const until = addDays(r.day, REPAIR_DAYS);
  if (broke >= 2 && until >= today) {
    s.repair = { streak: broke, until };
    r.repairOffered = true;
  }
  s.dayKey = today;
  s.dayCompleted = 0;
  s.dayPlanned = 0;
  s.dayWorkday = isWorkday(today);
  s.dayBusy = false;
  s.daySeen = false;
  s.combo = 0;
  s.distraction = {};
  s.dayNudges = 0;
  s.chestsToday = 0;
  s.chestDay = today;
  s.workSec = 0;
  rollWeek(s, today);
  s.dayFired = {};
  s.dayBackoff = {};
  s.dismissedInRow = 0;
  s.perfectDays = s.perfectDays.slice(-60);
  // The record keeps the 28 days ending today (the card's window).
  const oldest = addDays(today, 1 - HISTORY_DAYS);
  for (const key of Object.keys(s.history)) if (key < oldest) delete s.history[key];
  const stageAfter = stageOf(s.xp);
  r.levelUp = stageAfter !== stageBefore ? stageAfter : null;
  r.unlocked = checkUnlocks(s);
  return r;
}

/** Wears an unlocked accessory (replacing whatever is in the same slot) or takes it off. */
export function toggleAccessory(s: LifeState, a: Accessory): void {
  if (!s.unlocked.includes(a)) return;
  if (s.wearing.includes(a)) {
    s.wearing = s.wearing.filter((w) => w !== a);
  } else {
    s.wearing = [...s.wearing.filter((w) => accessorySlot(w) !== accessorySlot(a)), a];
  }
}

/** Day key of an epoch-ms timestamp, for diary entries. */
export const dayOf = (ms: number) => dayKey(new Date(ms));
export const parseDay = parseDate;
