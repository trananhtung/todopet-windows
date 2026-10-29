// Feeding, hunger, dirt, growth, combos, accessories and day settlement (PetLife.swift). Pure rules.
import { addDays, dayKey, isDayKey, parseDate } from "./dates";
import { L } from "./l10n";
import type { Accessory, AccessorySlot, CelebrationKind, StageIndex } from "./types";
import { ACCESSORIES } from "./types";

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

export function accessorySlot(a: Accessory): AccessorySlot {
  return a === "sunglasses" ? "face" : a === "scarf" ? "neck" : "head";
}

export function accessoryEmoji(a: Accessory): string {
  return { bow: "🎀", scarf: "🧣", sunglasses: "🕶️", tophat: "🎩", crown: "👑", gradcap: "🎓" }[a];
}

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
  }
}

/** At most this many 🍪 in the stash; each one saves a missed day. */
export const MAX_SNACKS = 2;
/** A broken streak comes back after this many tasks on the next workday… */
export const REPAIR_TASKS = 2;
/** …if that day comes within this many days of the break. */
export const REPAIR_DAYS = 14;
export const PAGE_SIZE = 10;
/** Every sticker page starts with this many gift stickers 🎁. */
export const PAGE_GIFTS = 2;

/** "Finish 2 tasks on your next workday and your old streak comes back." */
export interface RepairQuest {
  /** The streak that broke. */
  streak: number;
  /** The last day ("yyyy-MM-dd") it can be done on. */
  until: string;
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
});

const isAccessory = (x: unknown): x is Accessory => typeof x === "string" && (ACCESSORIES as readonly string[]).includes(x);
const num = (x: unknown, d: number) => (typeof x === "number" && Number.isFinite(x) ? x : d);
const clampInt = (x: unknown, lo: number, hi: number, d: number) => Math.min(hi, Math.max(lo, Math.trunc(num(x, d))));

function repairFromJson(x: unknown): RepairQuest | null {
  if (!x || typeof x !== "object") return null;
  const r = x as Record<string, unknown>;
  return typeof r.streak === "number" && r.streak >= 1 && isDayKey(r.until) ? { streak: Math.trunc(r.streak), until: r.until } : null;
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
    pageFilled: clampInt(r.pageFilled, 0, PAGE_SIZE, PAGE_GIFTS + (perfectDays.length % 8)),
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
  };
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
    }
  })();
  return { have: Math.min(Math.max(0, Math.floor(have)), need), need };
}

export function isEarned(a: Accessory, s: LifeState): boolean {
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
  return { food, combo: s.combo, golden, kind, unlocked, levelUp: after !== before ? after : null, cleaned };
}

/** Reverses one feed (when you undo a completion), taking back the XP and golden treat it gave when known. */
export function unfeed(s: LifeState, gained: { xp: number; golden: boolean } = { xp: 10, golden: false }): void {
  s.totalDone = Math.max(0, s.totalDone - 1);
  s.xp = Math.max(0, s.xp - gained.xp);
  s.satiety = Math.max(0, s.satiety - 25);
  s.combo = Math.max(0, s.combo - 1);
  if (gained.golden) s.goldens = Math.max(0, s.goldens - 1);
}

/** Hunger grows during work hours only (at most one hour per step, so sleep or lunch doesn't starve the pet). */
export function decay(s: LifeState, now: number, working: boolean): void {
  const last = s.lastDecayAt;
  s.lastDecayAt = now;
  if (!working || last === null || now <= last) return;
  s.satiety = Math.max(0, s.satiety - (HUNGER_PER_HOUR * Math.min(now - last, 3_600_000)) / 3_600_000);
}

/** Records today as the app sees it after a Todoist sync (which also makes it a day the app saw). */
export function syncDay(s: LifeState, completed: number, plannedCount: number, target: number, workday: boolean, busy = false): void {
  s.dayCompleted = completed;
  s.dayPlanned = plannedCount;
  s.dayTarget = target;
  s.dayWorkday = workday;
  s.dayBusy = busy;
  s.daySeen = true;
}

/** The repair quest that today can finish: a workday no later than 14 days after the break. */
export function activeRepair(s: LifeState): RepairQuest | null {
  return s.repair && s.dayWorkday && s.dayKey <= s.repair.until ? s.repair : null;
}

/** Brings the old streak back once today's repair quest is done. Returns the restored streak, or 0. */
export function checkRepair(s: LifeState): number {
  const quest = activeRepair(s);
  if (!quest || s.dayCompleted < REPAIR_TASKS) return 0;
  s.streak = Math.max(s.streak, quest.streak);
  s.bestStreak = Math.max(s.bestStreak, s.streak);
  s.repair = null;
  return s.streak;
}

function addSnack(s: LifeState): boolean {
  if (s.snacks >= MAX_SNACKS) return false;
  s.snacks += 1;
  return true;
}

/** Sticks a perfect day's sticker on the page. A full page gives +50 XP and a snack, and a new page starts with its gifts. */
function addSticker(s: LifeState): { pageDone: boolean; snack: boolean } {
  s.pageFilled += 1;
  if (s.pageFilled < PAGE_SIZE) return { pageDone: false, snack: false };
  s.xp += 50;
  s.stickerPage += 1;
  s.pageFilled = PAGE_GIFTS;
  return { pageDone: true, snack: addSnack(s) };
}

export function addDistraction(s: LifeState, label: string, seconds: number): void {
  s.distraction[label] = (s.distraction[label] ?? 0) + seconds;
}

/**
 * How a settled workday went: `kept` (a task done), `excused` (packed calendar, nothing done), `frozen` (missed,
 * a snack saved it), `broken` (missed, no snack) or `none` (rest day, weekend, or a day the app never saw).
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
  unlocked: Accessory[];
}

/**
 * Settles the stored day once the date changed. A workday with one finished task keeps the streak; a goal day
 * adds a snack, a perfect day a sticker. A missed day eats a snack, or breaks the streak (dirt, and a repair quest
 * for streaks of 2+). Days the app never saw (PC off), rest days and busy days with nothing done change nothing.
 */
export function closeDay(s: LifeState, today: string, isWorkday: (key: string) => boolean): DayClose {
  const r: DayClose = { day: "", outcome: "none", lost: 0, snackEarned: false, sticker: false, pageDone: false, repairOffered: false, repairExpired: false, unlocked: [] };
  if (!s.dayKey || s.dayKey >= today) {
    if (!s.dayKey) s.dayKey = today;
    return r;
  }
  r.day = s.dayKey;
  const counts = s.daySeen && s.dayWorkday;
  const quest = counts ? activeRepair(s) : null;
  // Done during the day without the brain noticing: it still counts.
  if (quest) checkRepair(s);
  if (counts && s.dayCompleted > 0) {
    r.outcome = "kept";
    s.streak += 1;
    s.bestStreak = Math.max(s.bestStreak, s.streak);
    if (s.dayTarget > 0 && s.dayCompleted >= s.dayTarget) {
      r.snackEarned = addSnack(s);
      if (s.dayCompleted >= s.dayPlanned) {
        r.sticker = true;
        s.perfectDays.push(s.dayKey);
        s.xp += 30;
        const page = addSticker(s);
        r.pageDone = page.pageDone;
        r.snackEarned ||= page.snack;
      }
    }
  } else if (counts && s.dayBusy) {
    r.outcome = "excused";
  } else if (counts && s.snacks > 0) {
    r.outcome = "frozen";
    s.snacks -= 1;
  } else if (counts) {
    r.outcome = "broken";
    r.lost = s.streak;
    s.dirt = Math.min(3, s.dirt + 1);
    if (s.streak >= 2) {
      s.repair = { streak: s.streak, until: addDays(s.dayKey, REPAIR_DAYS) };
      r.repairOffered = true;
    }
    s.streak = 0;
  }
  // An unfinished quest ends with its day (a busy day doesn't use it up), and 14 days after the break at the latest.
  if ((quest && s.repair === quest && r.outcome !== "excused") || (s.repair && today > s.repair.until)) {
    s.repair = null;
    r.repairExpired = true;
  }
  s.dayKey = today;
  s.dayCompleted = 0;
  s.dayPlanned = 0;
  s.dayWorkday = isWorkday(today);
  s.dayBusy = false;
  s.daySeen = false;
  s.combo = 0;
  s.distraction = {};
  s.perfectDays = s.perfectDays.slice(-60);
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
