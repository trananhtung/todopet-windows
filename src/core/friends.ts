// Friends (v0.6): pet cards, the friend list, the buddy streak, the weekly co-op boss and visits. Pure rules: no
// network, no DOM, no clock of its own. Friends swap short text cards over any chat app; nothing is hosted, and no
// data leaves the PC unless you send your own card yourself. A pasted card is untrusted input: it is parsed strictly
// (see `decodeCard`) and only ever shown as plain text.
import { weekKey as mondayOf } from "./chapters";
import { addDays, daysBetween, isDayKey, parseDate } from "./dates";
import { L } from "./l10n";
import { DAY_MARKS, HISTORY_DAYS, type DayMark } from "./life";
import { ACCESSORIES, ACCESSORY_SLOT, SPECIES_IDS, type Accessory, type AccessorySlot, type SpeciesId, type StageIndex } from "./types";

// ---------- Cards ----------

/** A card is this, a dot, and the card's JSON as base64url. The 1 is the format's version. */
export const CARD_PREFIX = "TODOPET1.";
/** Longest card text read (whitespace left out). A real card is about 400 characters. */
export const MAX_CARD_CHARS = 1500;
export const MAX_NAME_CHARS = 20;
export const MAX_CARD_ACCESSORIES = 3;
/** Streaks on a card are whole numbers up to this; more is a damaged card. */
export const MAX_STREAK = 9999;
/** Tasks finished in a week, on a card: up to this many. */
export const MAX_WEEK_DONE = 999;

const ID_RE = /^[A-Za-z0-9_-]{8,32}$/;
const HISTORY_RE = new RegExp(`^[GKR-]{${HISTORY_DAYS}}$`);
/** A card's date may be this many days ahead of today: a friend in another time zone is already tomorrow. */
const FUTURE_DAYS = 1;

/** What a card says about a pet and its owner's week. Nothing else: never task titles, times, app names or a user name. */
export interface PetCard {
  /** The random id of the install that made it (see `newInstallId`). */
  id: string;
  /** The pet's name, up to 20 characters of plain text. */
  name: string;
  species: SpeciesId;
  /** Up to 3 worn accessories, one per slot. */
  accessories: Accessory[];
  stage: StageIndex;
  streak: number;
  best: number;
  /** ISO week of `date`: "2026-W44". */
  week: string;
  /** Tasks finished in that week, as of the card's date. */
  weekDone: number;
  /** The last 28 days, oldest first, ending on `date`: `G` goal met, `K` kept, `R` rest, `-` nothing. */
  history: string;
  /** The day the card was made: "yyyy-MM-dd". */
  date: string;
}

export type CardError =
  | "empty"
  | "tooLong"
  | "prefix"
  | "encoding"
  | "json"
  | "shape"
  | "version"
  | "id"
  | "name"
  | "species"
  | "accessory"
  | "number"
  | "history"
  | "week"
  | "date"
  | "future";

export type CardResult = { ok: true; card: PetCard } | { ok: false; error: CardError; message: string };

/** The kind words for a card that couldn't be read; the reason is never shown raw. */
export function cardErrorText(error: CardError): string {
  switch (error) {
    case "empty":
      return L("Dán thẻ của bạn bè vào ô trên đã nhé.", "Paste your friend's card into the box first.");
    case "tooLong":
      return L("Đoạn này dài quá nên không phải thẻ thú cưng rồi (tối đa 1500 ký tự).", "That's too long to be a pet card (the most is 1500 characters).");
    case "prefix":
      return L("Đây chưa giống thẻ thú cưng. Thẻ bắt đầu bằng TODOPET1. — bạn chỉ dán đúng dòng đó thôi nhé.", "That doesn't look like a pet card. A card starts with TODOPET1. — paste just that one line.");
    case "version":
      return L("Thẻ này đến từ một phiên bản TodoPet khác nên mình chưa đọc được.", "This card is from a different version of TodoPet, so I can't read it yet.");
    case "species":
    case "accessory":
      return L("Thẻ có một bé thú hoặc món đồ mà bản này chưa biết. Có thể bạn của bạn đang dùng bản mới hơn?", "The card has a pet or an item this version doesn't know yet. Maybe your friend has a newer version?");
    case "name":
      return L("Tên thú cưng trong thẻ mình không hiển thị được (tối đa 20 ký tự thường).", "I can't show the pet's name on that card (up to 20 plain characters).");
    case "date":
      return L("Ngày trên thẻ này nghe chưa đúng. Bạn nhờ bạn ấy chép lại thẻ giúp nhé.", "The date on that card doesn't look right. Could your friend copy it again?");
    case "future":
      return L("Thẻ này đề ngày ở tương lai. Bạn kiểm tra giúp đồng hồ máy (của bạn hoặc của bạn ấy) nhé.", "That card is dated in the future. Could you check the clock (yours or your friend's)?");
    default:
      return L("Thẻ này có vẻ bị hỏng hoặc thiếu mất một đoạn. Bạn nhờ bạn ấy chép lại thẻ giúp nhé.", "That card looks damaged, or part of it is missing. Could your friend copy it again?");
  }
}

const fail = (error: CardError): CardResult => ({ ok: false, error, message: cardErrorText(error) });

function toBase64Url(text: string): string {
  let bin = "";
  for (const b of new TextEncoder().encode(text)) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** The UTF-8 text in a base64url string (no padding, no other alphabet), or null when it isn't one. */
function fromBase64Url(s: string): string | null {
  if (!/^[A-Za-z0-9_-]+$/.test(s) || s.length % 4 === 1) return null;
  try {
    const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/"));
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}

/** The card as text to send: `TODOPET1.` and the base64url of its JSON. */
export function encodeCard(card: PetCard): string {
  return (
    CARD_PREFIX +
    toBase64Url(
      JSON.stringify({
        v: 1,
        id: card.id,
        name: card.name,
        species: card.species,
        accessories: card.accessories,
        stage: card.stage,
        streak: card.streak,
        best: card.best,
        week: card.week,
        weekDone: card.weekDone,
        history: card.history,
        date: card.date,
      }),
    )
  );
}

const CARD_KEYS = ["v", "id", "name", "species", "accessories", "stage", "streak", "best", "week", "weekDone", "history", "date"] as const;

/**
 * Control, format (bidi marks, zero-width spaces), lone-surrogate and private-use characters, and line and paragraph
 * separators. The zero-width joiner stays: emoji sequences are built with it. (Unassigned characters are fine: a newer
 * emoji in a friend's pet's name is still just text, drawn as a box by an older system.)
 */
const FORBIDDEN_IN_NAME = /[\p{Cc}\p{Cs}\p{Co}\p{Zl}\p{Zp}]|(?!\u200d)\p{Cf}/u;
const VISIBLE_IN_NAME = /[\p{L}\p{N}\p{Extended_Pictographic}]/u;

const codePoints = (s: string) => Array.from(s).length;

/** A pet name a card can carry: non-empty, trimmed, at most 20 code points of plain text. */
export function isCardName(x: unknown): x is string {
  return typeof x === "string" && x !== "" && x === x.trim() && codePoints(x) <= MAX_NAME_CHARS && !FORBIDDEN_IN_NAME.test(x) && VISIBLE_IN_NAME.test(x);
}

const isInt = (x: unknown, max: number): x is number => typeof x === "number" && Number.isInteger(x) && x >= 0 && x <= max;

/** Does `x` hold up to three known accessories, each once, one per slot? */
function isAccessoryList(x: unknown): x is Accessory[] {
  if (!Array.isArray(x) || x.length > MAX_CARD_ACCESSORIES) return false;
  const slots = new Set<AccessorySlot>();
  for (const a of x) {
    if (typeof a !== "string" || !(ACCESSORIES as readonly string[]).includes(a)) return false;
    const slot = ACCESSORY_SLOT[a as Accessory];
    if (slots.has(slot)) return false;
    slots.add(slot);
  }
  return true;
}

const isSpecies = (x: unknown): x is SpeciesId => typeof x === "string" && (SPECIES_IDS as readonly string[]).includes(x);

/**
 * Checks the fields of a card, strictly: every field present with the right type, no others, known species and
 * accessories only, whole numbers in range, a 28-character record, a real date that is the day `week` is in. Only
 * `today` (a day key) makes a date too far ahead a fault; pass null to read a card already on disk.
 */
export function checkCard(o: Record<string, unknown>, today: string | null): CardResult {
  if (o.v !== 1) return fail("version");
  const keys = Object.keys(o);
  if (keys.length !== CARD_KEYS.length || !CARD_KEYS.every((k) => Object.hasOwn(o, k))) return fail("shape");
  if (typeof o.id !== "string" || !ID_RE.test(o.id)) return fail("id");
  if (!isCardName(o.name)) return fail("name");
  if (!isSpecies(o.species)) return fail("species");
  if (!isAccessoryList(o.accessories)) return fail("accessory");
  if (!isInt(o.stage, 4) || !isInt(o.streak, MAX_STREAK) || !isInt(o.best, MAX_STREAK) || !isInt(o.weekDone, MAX_WEEK_DONE)) return fail("number");
  if (typeof o.history !== "string" || !HISTORY_RE.test(o.history)) return fail("history");
  if (!isDayKey(o.date)) return fail("date");
  if (typeof o.week !== "string" || o.week !== isoWeekKey(o.date)) return fail("week");
  if (today !== null && daysBetween(today, o.date) > FUTURE_DAYS) return fail("future");
  return {
    ok: true,
    card: {
      id: o.id,
      name: o.name,
      species: o.species,
      accessories: [...o.accessories],
      stage: o.stage as StageIndex,
      streak: o.streak,
      // A best streak below the current one is a slip, not a fault.
      best: Math.max(o.best, o.streak),
      week: o.week,
      weekDone: o.weekDone,
      history: o.history,
      date: o.date,
    },
  };
}

/**
 * Reads a card someone sent. Strict, and it never throws: a size cap (1500 characters, whitespace left out), the
 * `TODOPET1.` prefix, base64url that is valid UTF-8, JSON that is a plain object, and then `checkCard`. Anything
 * wrong gives a kind message and no card.
 */
export function decodeCard(text: string, today: string): CardResult {
  if (typeof text !== "string") return fail("empty");
  // Cheap first: a megabyte of paste is not a card, and shouldn't be searched for whitespace.
  if (text.length > MAX_CARD_CHARS * 4) return fail("tooLong");
  const compact = text.replace(/\s+/g, "");
  if (compact === "") return fail("empty");
  if (compact.length > MAX_CARD_CHARS) return fail("tooLong");
  if (!compact.startsWith(CARD_PREFIX)) return fail("prefix");
  const json = fromBase64Url(compact.slice(CARD_PREFIX.length));
  if (json === null) return fail("encoding");
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return fail("json");
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return fail("shape");
  return checkCard(parsed as Record<string, unknown>, today);
}

// ---------- Weeks ----------

/** The ISO 8601 week of a day (or date), "2026-W44": weeks start on Monday, week 1 holds the year's first Thursday. */
export function isoWeekKey(day: string | Date): string {
  const d = typeof day === "string" ? parseDate(day) : day;
  if (!d || Number.isNaN(d.getTime())) return "";
  const thursday = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  thursday.setUTCDate(thursday.getUTCDate() + 3 - ((thursday.getUTCDay() + 6) % 7));
  const year = thursday.getUTCFullYear();
  const first = new Date(Date.UTC(year, 0, 4));
  first.setUTCDate(first.getUTCDate() + 3 - ((first.getUTCDay() + 6) % 7));
  const week = 1 + Math.round((thursday.getTime() - first.getTime()) / (7 * 86_400_000));
  return `${String(year).padStart(4, "0")}-W${String(week).padStart(2, "0")}`;
}

/** Tasks finished this week as the pet's week counts them: 0 while that week isn't `today`'s yet (Monday, before it turns). */
export function weekDoneOf(week: { key: string; done: number }, today: string): number {
  return week.key !== "" && week.key === mondayOf(today) ? Math.max(0, week.done) : 0;
}

// ---------- My own card ----------

/** Removes what a card's name can't hold, cuts it to 20 characters without splitting one, and never leaves it empty. */
export function cardName(petName: string): string {
  const clean = String(petName ?? "")
    .replace(new RegExp(FORBIDDEN_IN_NAME.source, "gu"), "")
    .trim();
  let out = "";
  let count = 0;
  for (const { segment } of new Intl.Segmenter("und", { granularity: "grapheme" }).segment(clean)) {
    const n = codePoints(segment);
    if (count + n > MAX_NAME_CHARS) break;
    out += segment;
    count += n;
  }
  out = out.trim();
  return isCardName(out) ? out : "Pet";
}

/** Up to three of the worn accessories, one per slot, in the order worn. */
export function cardAccessories(wearing: readonly Accessory[]): Accessory[] {
  const slots = new Set<AccessorySlot>();
  const out: Accessory[] = [];
  for (const a of wearing) {
    const slot = ACCESSORY_SLOT[a];
    if (!slot || slots.has(slot) || out.length >= MAX_CARD_ACCESSORIES) continue;
    slots.add(slot);
    out.push(a);
  }
  return out;
}

const whole = (x: number, max: number) => Math.min(max, Math.max(0, Math.trunc(Number.isFinite(x) ? x : 0)));

/** 28 characters of `G K R -`: shorter is padded in front with `-`, longer keeps its last 28, anything else is `-`. */
export function normalizeHistory(h: string): string {
  const marks = Array.from(String(h ?? ""), (c) => ("GKR-".includes(c) ? c : "-")).join("");
  return marks.padStart(HISTORY_DAYS, "-").slice(-HISTORY_DAYS);
}

export interface CardSource {
  installId: string;
  petName: string;
  species: SpeciesId;
  wearing: readonly Accessory[];
  stage: StageIndex;
  streak: number;
  bestStreak: number;
  /** Tasks finished this week. */
  weekDone: number;
  /** The last 28 days ending today (see `normalizeHistory`). */
  history: string;
  /** Today's day key. */
  today: string;
}

/** The card for the pet as it is `today`: always one that `decodeCard` reads back. */
export function buildCard(src: CardSource): PetCard {
  const streak = whole(src.streak, MAX_STREAK);
  return {
    id: src.installId,
    name: cardName(src.petName),
    species: src.species,
    accessories: cardAccessories(src.wearing),
    stage: src.stage,
    streak,
    best: Math.max(streak, whole(src.bestStreak, MAX_STREAK)),
    week: isoWeekKey(src.today),
    weekDone: whole(src.weekDone, MAX_WEEK_DONE),
    history: normalizeHistory(src.history),
    date: src.today,
  };
}

// ---------- The install id ----------

const ID_ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";
const ID_LENGTH = 20;

/** A random id for this install, made once and kept in the `friends` document: 20 characters of a–z and 0–9. */
export function newInstallId(random: () => number): string {
  let id = "";
  for (let i = 0; i < ID_LENGTH; i++) {
    const r = random();
    const n = Number.isFinite(r) ? Math.floor(r * ID_ALPHABET.length) : 0;
    id += ID_ALPHABET[Math.min(ID_ALPHABET.length - 1, Math.max(0, n))];
  }
  return id;
}

// ---------- The friend list ----------

/** The most friends the list holds. */
export const MAX_FRIENDS = 12;

/** A friend: their latest card, and when their pet last dropped by (epoch ms). */
export interface Friend extends PetCard {
  lastVisit: number | null;
}

export type AddOutcome =
  | { ok: true; friends: Friend[]; friend: Friend; replaced: boolean }
  | { ok: false; error: "self" | "older" | "full"; message: string };

/**
 * Adds a friend's card to the list (a new list: the one given is never changed). Your own card is refused. A card
 * from a friend you have replaces theirs in place when it is from the same day or later (the friend's last visit is
 * kept); an older one is refused kindly. A new friend past the 12th is refused.
 */
export function addFriend(list: readonly Friend[], card: PetCard, myId: string): AddOutcome {
  if (card.id === myId) {
    return { ok: false, error: "self", message: L("Đây là thẻ của chính bạn! Gửi nó cho một người bạn nhé 💌", "That's your own card! Send it to a friend instead 💌") };
  }
  const at = list.findIndex((f) => f.id === card.id);
  if (at >= 0) {
    const old = list[at];
    if (card.date < old.date) {
      return {
        ok: false,
        error: "older",
        message: L(`Mình đã có thẻ mới hơn của ${old.name} rồi, nên giữ nguyên nhé.`, `I already have a newer card from ${old.name}, so nothing changed.`),
      };
    }
    const friend: Friend = { ...card, accessories: [...card.accessories], lastVisit: old.lastVisit };
    return { ok: true, friends: list.map((f, i) => (i === at ? friend : f)), friend, replaced: true };
  }
  if (list.length >= MAX_FRIENDS) {
    return {
      ok: false,
      error: "full",
      message: L(`Danh sách đã đủ ${MAX_FRIENDS} bạn rồi. Xoá bớt một bạn rồi thêm tiếp nhé.`, `You already have ${MAX_FRIENDS} friends, the most the list holds. Remove one to add another.`),
    };
  }
  const friend: Friend = { ...card, accessories: [...card.accessories], lastVisit: null };
  return { ok: true, friends: [...list, friend], friend, replaced: false };
}

export const removeFriend = (list: readonly Friend[], id: string): Friend[] => list.filter((f) => f.id !== id);

// ---------- What is stored (the `friends` document, overlay window only) ----------

/** The visits made on `day`, and when the last one began. */
export interface VisitLog {
  day: string;
  count: number;
  lastAt: number | null;
}

export interface FriendsDoc {
  /** Random, made once on this PC: how a friend's newer card finds their older one. */
  installId: string;
  friends: Friend[];
  visits: VisitLog;
}

const noVisits = (): VisitLog => ({ day: "", count: 0, lastAt: null });

function visitsFromJson(x: unknown): VisitLog {
  if (!x || typeof x !== "object") return noVisits();
  const r = x as Record<string, unknown>;
  return {
    day: isDayKey(r.day) ? r.day : "",
    count: typeof r.count === "number" && Number.isFinite(r.count) ? Math.min(100, Math.max(0, Math.trunc(r.count))) : 0,
    lastAt: typeof r.lastAt === "number" && Number.isFinite(r.lastAt) ? r.lastAt : null,
  };
}

/** A stored friend: its card checked again as strictly as a pasted one (but never for being dated ahead), or null. */
function friendFromJson(x: unknown): Friend | null {
  if (!x || typeof x !== "object" || Array.isArray(x)) return null;
  const r = x as Record<string, unknown>;
  const fields = Object.fromEntries(CARD_KEYS.map((k) => [k, r[k]]));
  const checked = checkCard({ ...fields, v: 1 }, null);
  if (!checked.ok) return null;
  const visit = r.lastVisit;
  return { ...checked.card, lastVisit: typeof visit === "number" && Number.isFinite(visit) ? visit : null };
}

/**
 * Reads the stored document, tolerating anything: friends that no longer hold up are dropped, the same friend twice
 * keeps the newer card, ourselves is dropped and only the first 12 stay. `fresh` is true when there was no usable id
 * and `makeId` made one, so the caller saves it.
 */
export function docFromJson(raw: unknown, makeId: () => string): { doc: FriendsDoc; fresh: boolean } {
  const r = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const hadId = typeof r.installId === "string" && ID_RE.test(r.installId);
  const installId = hadId ? (r.installId as string) : makeId();
  const friends: Friend[] = [];
  for (const x of Array.isArray(r.friends) ? r.friends : []) {
    const f = friendFromJson(x);
    if (!f || f.id === installId) continue;
    const at = friends.findIndex((g) => g.id === f.id);
    if (at < 0) friends.push(f);
    else if (f.date > friends[at].date) friends[at] = f;
  }
  return { doc: { installId, friends: friends.slice(0, MAX_FRIENDS), visits: visitsFromJson(r.visits) }, fresh: !hadId };
}

/** The document as plain JSON for the `friends` storage key. */
export const docToJson = (doc: FriendsDoc): unknown => ({
  installId: doc.installId,
  friends: doc.friends.map((f) => ({ ...f, accessories: [...f.accessories] })),
  visits: { ...doc.visits },
});

// ---------- The record of days ----------

/** How today stands, live: the goal met (`G`), at least one task (`K`), a day off (`R`), or nothing yet (`-`). */
export function todayMark(completed: number, target: number, workday: boolean): DayMark {
  if (target > 0 && completed >= target) return "G";
  if (completed > 0) return "K";
  return workday ? "-" : "R";
}

/**
 * The 28 characters for a card made `today`, oldest first: the days the pet settled (`record`, from its life), and
 * for a day it never settled (the PC was off) `R` when it was a day off and `-` otherwise; today is `mark`, live.
 */
export function cardHistory(record: Readonly<Record<string, DayMark>>, today: string, mark: DayMark, isWorkday: (day: string) => boolean): string {
  let out = "";
  for (let i = 0; i < HISTORY_DAYS - 1; i++) {
    const day = addDays(today, i - (HISTORY_DAYS - 1));
    const known = record[day];
    out += known && DAY_MARKS.includes(known) ? known : isWorkday(day) ? "-" : "R";
  }
  return out + mark;
}

// ---------- The buddy streak ----------

/** What a card says about the days: its record and the day it ends on. */
export interface StreakSide {
  history: string;
  date: string;
}

const covers = (s: StreakSide) => typeof s.history === "string" && HISTORY_RE.test(s.history) && isDayKey(s.date);

/**
 * Days in a row you and a friend both reached your goal, counted back from the latest day both cards cover (the older
 * card's date), lined up by date. A day you both hit (`G`) adds 1; a day either rested (`R`) is skipped and neither
 * adds nor breaks; any other closed day ends it. The one day still open on a card, the day it was made (the pet may
 * not have had its day yet), never ends it: it counts only if both hit the goal. At most 28, what a card holds.
 */
export function buddyStreak(a: StreakSide, b: StreakSide): number {
  if (!covers(a) || !covers(b)) return 0;
  const end = a.date < b.date ? a.date : b.date;
  let n = 0;
  for (let k = 0; k < HISTORY_DAYS; k++) {
    const day = addDays(end, -k);
    const ia = HISTORY_DAYS - 1 - daysBetween(day, a.date);
    const ib = HISTORY_DAYS - 1 - daysBetween(day, b.date);
    if (ia < 0 || ib < 0) break;
    const ma = a.history[ia];
    const mb = b.history[ib];
    if (ma === "G" && mb === "G") {
      n++;
    } else if (ma === "R" || mb === "R") {
      continue;
    } else if ((ma !== "G" && day !== a.date) || (mb !== "G" && day !== b.date)) {
      break;
    }
  }
  return n;
}

// ---------- The weekly boss ----------

/** The Procrastination Blob 👾 has this many HP for each member. */
export const BOSS_HP_PER_MEMBER = 15;

export interface BossMember {
  /** A friend's install id; "me" for you. */
  id: string;
  name: string;
  /** Tasks finished this week. */
  done: number;
  me: boolean;
}

export interface Boss {
  /** The ISO week the blob lives in; it starts over every Monday. */
  week: string;
  /** You first, then the friends with a card from this week, the most tasks first. */
  members: BossMember[];
  maxHp: number;
  damage: number;
  /** What is left, never below 0. */
  hp: number;
  defeated: boolean;
  /** Friends whose latest card is from an earlier week: not counted until they send a fresh one. */
  waiting: number;
}

/**
 * This week's co-op boss: 15 HP per member (you, and each friend whose latest card is from this ISO week). The damage
 * is your tasks of the week, counted live, plus each friend's `weekDone` from their latest card. There is no losing and
 * no penalty: it is just beaten, or not yet.
 */
export function bossOf(input: { today: string; myDone: number; friends: readonly Friend[] }): Boss {
  const week = isoWeekKey(input.today);
  const mine: BossMember = { id: "me", name: L("Bạn", "You"), done: whole(input.myDone, Number.MAX_SAFE_INTEGER), me: true };
  const theirs = input.friends
    .filter((f) => f.week === week)
    .map((f): BossMember => ({ id: f.id, name: f.name, done: f.weekDone, me: false }))
    .sort((a, b) => b.done - a.done);
  const members = [mine, ...theirs];
  const maxHp = members.length * BOSS_HP_PER_MEMBER;
  const damage = members.reduce((sum, m) => sum + m.done, 0);
  return {
    week,
    members,
    maxHp,
    damage,
    hp: Math.max(0, maxHp - damage),
    defeated: damage >= maxHp,
    waiting: input.friends.length - theirs.length,
  };
}

// ---------- Visits ----------

/** A friend's pet may drop by this many times a day in all. */
export const MAX_VISITS_PER_DAY = 2;
/** Only a friend whose card is at most this many days old comes by. */
export const VISIT_MAX_CARD_AGE_DAYS = 7;
/** At least this long between two visits. */
export const VISIT_GAP_MS = 2 * 3_600_000;
/** A visit lasts about this long, walking in and out included. */
export const VISIT_SECONDS = 25;

/** Everything that makes a moment not calm enough for company; a visit needs all of them false. */
export interface CalmMoment {
  /** In the middle of typing, or in the zone. */
  typing: boolean;
  /** A focus session is running. */
  focusing: boolean;
  inMeeting: boolean;
  /** "Done for today": the pet sleeps until the next workday. */
  doneForToday: boolean;
  /** The pet is muted. */
  quiet: boolean;
  /** The pet is hidden, or a full-screen app is in front. */
  hidden: boolean;
  fullscreen: boolean;
  /** Nobody to see it: idle for 5 minutes. */
  away: boolean;
  sleeping: boolean;
  /** The pet is away on a trip. */
  onTrip: boolean;
  /** A bubble is waiting or showing. */
  bubble: boolean;
  /** The board is open. */
  boardOpen: boolean;
  /** A stunt (a parade, the table flip) is going on. */
  mischief: boolean;
}

/** A calm moment, with `patch` of what is not. */
export const calmMoment = (patch: Partial<CalmMoment> = {}): CalmMoment => ({
  typing: false,
  focusing: false,
  inMeeting: false,
  doneForToday: false,
  quiet: false,
  hidden: false,
  fullscreen: false,
  away: false,
  sleeping: false,
  onTrip: false,
  bubble: false,
  boardOpen: false,
  mischief: false,
  ...patch,
});

export const isCalm = (c: CalmMoment): boolean => !Object.values(c).some(Boolean);

/** Is this friend's card fresh enough for a visit (at most 7 days old; a card a time zone ahead counts)? */
export const canVisit = (f: Friend, today: string): boolean => daysBetween(f.date, today) <= VISIT_MAX_CARD_AGE_DAYS;

/**
 * Who drops by now, or nobody: only at a calm moment, at most twice a day, two hours apart, a friend whose card is at
 * most 7 days old, the one who visited longest ago (never before all others), a tie settled by `random`. A visit is
 * ambient, not a bubble: it never counts against the nudge budget.
 */
export function pickVisitor(input: { friends: readonly Friend[]; today: string; now: number; log: VisitLog; calm: CalmMoment }, random: () => number): Friend | null {
  const { friends, today, now, log, calm } = input;
  if (!isCalm(calm)) return null;
  if (log.day === today && log.count >= MAX_VISITS_PER_DAY) return null;
  if (log.lastAt !== null && now - log.lastAt < VISIT_GAP_MS) return null;
  const able = friends.filter((f) => canVisit(f, today));
  if (able.length === 0) return null;
  const longestAgo = Math.min(...able.map((f) => f.lastVisit ?? Number.NEGATIVE_INFINITY));
  const tied = able.filter((f) => (f.lastVisit ?? Number.NEGATIVE_INFINITY) === longestAgo);
  const r = random();
  return tied[Math.min(tied.length - 1, Math.max(0, Math.floor((Number.isFinite(r) ? r : 0) * tied.length)))];
}

/** The document after a visit began: today's count and the friend's last visit. */
export function recordVisit(doc: FriendsDoc, friendId: string, now: number, today: string): FriendsDoc {
  const count = doc.visits.day === today ? doc.visits.count + 1 : 1;
  return {
    ...doc,
    friends: doc.friends.map((f) => (f.id === friendId ? { ...f, lastVisit: now } : f)),
    visits: { day: today, count, lastAt: now },
  };
}

/** The first visit of a day waits this long at least… */
const VISIT_FIRST_MIN_MINUTES = 15;
/** …and up to this much more. */
const VISIT_FIRST_SPREAD_MINUTES = 60;

/**
 * How long a session or a day waits before its first visit: 15 minutes plus up to an hour more. It comes from the
 * install and the day (a hash, not a dice roll), so restarting the app doesn't draw again, and the game's own random
 * source is left alone.
 */
export function visitDelayMs(installId: string, day: string): number {
  let h = 0x811c9dc5;
  for (const c of `${installId}|${day}`) h = Math.imul(h ^ c.charCodeAt(0), 0x01000193) >>> 0;
  return (VISIT_FIRST_MIN_MINUTES + (h % (VISIT_FIRST_SPREAD_MINUTES * 60)) / 60) * 60_000;
}

/** The little label a visitor carries. */
export function visitLabel(name: string, streak: number): string {
  return streak > 0 ? L(`${name} ghé chơi! 🔥 chuỗi bạn ${streak} ngày`, `${name} dropped by! 🔥 buddy streak ${streak}`) : L(`${name} ghé chơi! 👋`, `${name} dropped by! 👋`);
}

/** A visit in progress: whose pet, their buddy streak with you, and when it walked in and will have left. */
export interface Visit {
  id: number;
  friend: Friend;
  streak: number;
  start: number;
  end: number;
}

/** Walking in takes this long, and so does walking out. */
export const VISIT_WALK_MS = 3500;

// ---------- The boss, in words ----------

export const bossName = () => L("Quái Vật Trì Hoãn", "The Procrastination Blob");

/** What the pet says when the blob is beaten: together with friends, or alone. */
export function bossWinText(together: boolean): string {
  return together
    ? L("👾 Cả nhóm đã hạ gục Quái Vật Trì Hoãn tuần này! Mọi người cùng thắng: +50 XP và một sticker 🏅.", "👾 You all beat the Procrastination Blob this week! Everyone wins: +50 XP and a 🏅 sticker.")
    : L("👾 Bạn đã hạ gục Quái Vật Trì Hoãn tuần này! +50 XP và một sticker 🏅.", "👾 You beat the Procrastination Blob this week! +50 XP and a 🏅 sticker.");
}

// ---------- Sample friends (the demo) ----------

/**
 * Two friends for the demo, made from sample data for `today`: Mai (a card from today, a buddy streak of 3 with
 * `demoLife`'s record) and Bin (a card from two days ago, a streak of 2). Real cards in every way: they are added by
 * the same path as a pasted one.
 */
export function sampleCards(today: string): PetCard[] {
  const make = (c: Omit<PetCard, "week" | "history" | "date"> & { ageDays: number; before: string; recent: string }): PetCard => {
    const date = addDays(today, -c.ageDays);
    const { ageDays: _age, before, recent, ...rest } = c;
    return { ...rest, week: isoWeekKey(date), history: normalizeHistory(before + recent), date };
  };
  return [
    make({ id: "sample-mai-000001", name: "Mai", species: "shiba", accessories: ["flowercrown", "scarf"], stage: 3, streak: 6, best: 12, weekDone: 9, ageDays: 0, before: "GGKGGGRRGGKGGG", recent: "GKGGRRGGGGGGGG" }),
    make({ id: "sample-bin-0000002", name: "Bin", species: "capybara", accessories: ["bandana"], stage: 1, streak: 2, best: 5, weekDone: 4, ageDays: 2, before: "GKGGRRGGKGGRGK", recent: "KGGRRGGGK-GKGG" }),
  ];
}
