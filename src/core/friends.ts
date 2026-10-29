// Friends (v0.6): pet cards, the friend list, the buddy streak, the weekly co-op boss and visits. Pure rules: no
// network, no DOM, no clock of its own. Friends swap short text cards over any chat app; nothing is hosted, and no
// data leaves the PC unless you send your own card yourself. A pasted card is untrusted input: it is parsed strictly
// (see `parseCard`), its signature is checked by the backend (the Ed25519 key lives in Rust, never here) and it is
// only ever shown as plain text.
import { decodeBase64Url, encodeBase64Url, utf8Bytes } from "./b64";
import { weekKey as mondayOf } from "./chapters";
import { addDays, daysBetween, isDayKey, parseDate } from "./dates";
import { L } from "./l10n";
import { DAY_MARKS, HISTORY_DAYS, type DayMark } from "./life";
import { ACCESSORIES, ACCESSORY_SLOT, SPECIES_IDS, type Accessory, type AccessorySlot, type SpeciesId, type StageIndex } from "./types";

// ---------- Cards ----------

/** A card is this, the card's JSON as base64url, a dot and the signature of that JSON as base64url. The 1 is the format's version. */
export const CARD_PREFIX = "TODOPET1.";
/** Longest card text read (whitespace left out): 1500 for the payload as before, and room for the public key (43) and the signature (86). A real card is about 550 characters. */
export const MAX_CARD_CHARS = 1630;
export const MAX_NAME_CHARS = 20;
/** At most this many combining marks in a row in a name (Vietnamese needs 2: a shape mark and a tone). */
export const MAX_NAME_MARKS = 2;
export const MAX_CARD_ACCESSORIES = 3;
/** Tasks finished in a week, on a card: up to this many. */
export const MAX_WEEK_DONE = 999;

/** An Ed25519 public key as text: 32 bytes, base64url, no padding. */
export const PUBLIC_KEY_CHARS = 43;
/** An Ed25519 signature as text: 64 bytes, base64url, no padding. */
export const SIGNATURE_CHARS = 86;

/** The mark of a day on a card: the goal met, a day off, or nothing. A pet also remembers a kept day (`K`), but a card doesn't say it. */
export type CardMark = "G" | "R" | "-";
const HISTORY_RE = new RegExp(`^[GR-]{${HISTORY_DAYS}}$`);
/** A card's date may be this many days ahead of today: a friend in another time zone is already tomorrow. */
const FUTURE_DAYS = 1;

/** What a card says about a pet and its owner's week. Nothing else: never task titles, times, app names or a user name. */
export interface PetCard {
  /** The public key of the install that made it (base64url, 43 characters): the friend's identity, and what the signature is checked with. */
  pk: string;
  /** The pet's name, up to 20 characters of plain text. */
  name: string;
  species: SpeciesId;
  /** Up to 3 worn accessories, one per slot. */
  accessories: Accessory[];
  stage: StageIndex;
  /** ISO week of `date`: "2026-W44". */
  week: string;
  /** Tasks finished in that week, as of the card's date. */
  weekDone: number;
  /** The last 28 days, oldest first, ending on `date`: `G` goal met, `R` rest (a day off, or a day too full to count), `-` nothing. */
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
  | "key"
  | "name"
  | "species"
  | "accessory"
  | "number"
  | "history"
  | "week"
  | "date"
  | "future"
  /** The signature doesn't match the card: it was changed, or isn't from the key it says. */
  | "signature"
  /** The backend couldn't check the signature (not that it was wrong). */
  | "unchecked";

export type CardFailure = { ok: false; error: CardError; message: string };
export type CardResult = { ok: true; card: PetCard } | CardFailure;
/** A card whose structure is fine: the card, the exact payload text that was signed, and the signature. Not yet checked with the backend. */
export type ParsedCard = { ok: true; card: PetCard; payload: string; signature: string } | CardFailure;

/** The kind words for a card that couldn't be read; the reason is never shown raw, and nothing the card says is ever repeated. */
export function cardErrorText(error: CardError): string {
  switch (error) {
    case "empty":
      return L("Dán thẻ của bạn bè vào ô trên đã nhé.", "Paste your friend's card into the box first.");
    case "tooLong":
      return L(`Đoạn này dài quá nên không phải thẻ thú cưng rồi (tối đa ${MAX_CARD_CHARS} ký tự).`, `That's too long to be a pet card (the most is ${MAX_CARD_CHARS} characters).`);
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
      return L("Ngày trên thẻ này nghe chưa đúng. Bạn nhờ bạn ấy chép lại thẻ giúp nhé.", "The date on that card doesn't look right. Could your friend copy it once more?");
    case "future":
      return L("Thẻ này đề ngày ở tương lai. Bạn kiểm tra giúp đồng hồ máy (của bạn hoặc của bạn ấy) nhé.", "That card is dated in the future. Could you check the clock (yours or your friend's)?");
    case "signature":
      return L("Thẻ này không khớp chữ ký nên mình chưa tin được. Bạn nhờ bạn ấy chép lại thẻ giúp nhé.", "This card doesn't check out; ask your friend to copy it again.");
    case "unchecked":
      return L("Mình chưa kiểm tra được thẻ này lúc này. Bạn thử lại sau một chút nhé.", "I couldn't check that card just now. Please try again in a moment.");
    default:
      return L("Thẻ này có vẻ bị hỏng hoặc thiếu mất một đoạn. Bạn nhờ bạn ấy chép lại thẻ giúp nhé.", "That card looks damaged, or part of it is missing. Could your friend copy it once more?");
  }
}

const fail = (error: CardError): CardFailure => ({ ok: false, error, message: cardErrorText(error) });

/** The bytes of a base64url string decoded as UTF-8, or null for anything that isn't strictly that. */
function utf8FromBase64Url(s: string): string | null {
  const bytes = decodeBase64Url(s);
  if (bytes === null) return null;
  try {
    // `ignoreBOM: true` keeps a byte order mark in the text, where JSON refuses it; the decoder would drop it otherwise.
    return new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);
  } catch {
    return null;
  }
}

/** Is `x` a public key: 43 characters of strict base64url that make 32 bytes? */
export function isPublicKey(x: unknown): x is string {
  return typeof x === "string" && x.length === PUBLIC_KEY_CHARS && decodeBase64Url(x)?.length === 32;
}

/** Is `x` the text of a signature: 86 characters of strict base64url that make 64 bytes? (Whether it is the right one is the backend's to say.) */
const isSignatureText = (x: string) => x.length === SIGNATURE_CHARS && decodeBase64Url(x)?.length === 64;

const CARD_KEYS = ["v", "pk", "name", "species", "accessories", "stage", "week", "weekDone", "history", "date"] as const;

/** The exact text that gets signed and sent: the card's JSON, keys in this order. */
export function cardPayload(card: PetCard): string {
  return JSON.stringify({
    v: 1,
    pk: card.pk,
    name: card.name,
    species: card.species,
    accessories: card.accessories,
    stage: card.stage,
    week: card.week,
    weekDone: card.weekDone,
    history: card.history,
    date: card.date,
  });
}

/** The card as text to send: `TODOPET1.`, the base64url of its payload, a dot and the signature (see `cardPayload`; sign that exact text). */
export function encodeCard(card: PetCard, signature: string): string {
  return `${CARD_PREFIX}${encodeBase64Url(utf8Bytes(cardPayload(card)))}.${signature}`;
}

/**
 * Control, format (bidi marks, zero-width spaces), lone-surrogate and private-use characters, and line and paragraph
 * separators. The zero-width joiner stays: emoji sequences are built with it. (Unassigned characters are fine: a newer
 * emoji in a friend's pet's name is still just text, drawn as a box by an older system.)
 */
const FORBIDDEN_IN_NAME = /[\p{Cc}\p{Cs}\p{Co}\p{Zl}\p{Zp}]|(?!‍)\p{Cf}/u;
/**
 * Characters that draw nothing but pass for letters or marks: the Hangul fillers (U+115F, U+1160, U+3164, U+FFA0), the
 * blank braille pattern (U+2800) and the combining grapheme joiner (U+034F). They don't count as something to see.
 */
const FILLERS = /[ᅟᅠㅤﾠ⠀͏]/gu;
const VISIBLE_IN_NAME = /[\p{L}\p{N}\p{Extended_Pictographic}]/u;
/** More than `MAX_NAME_MARKS` combining marks in a row. */
const TOO_MANY_MARKS = new RegExp(`\\p{M}{${MAX_NAME_MARKS + 1},}`, "u");

const codePoints = (s: string) => Array.from(s).length;

/** A pet name a card can carry: trimmed, at most 20 code points of plain text with something to see in it, and no pile of combining marks. */
export function isCardName(x: unknown): x is string {
  return (
    typeof x === "string" &&
    x !== "" &&
    x === x.trim() &&
    codePoints(x) <= MAX_NAME_CHARS &&
    !FORBIDDEN_IN_NAME.test(x) &&
    !TOO_MANY_MARKS.test(x) &&
    VISIBLE_IN_NAME.test(x.replace(FILLERS, ""))
  );
}

/** Folds a name the way a reader compares: NFKC (fullwidth to plain, ligatures apart), no combining marks or joiners, one case. */
export const foldName = (s: string) => s.normalize("NFKD").replace(/[\p{M}‍]/gu, "").normalize("NFKC").toUpperCase().toLowerCase().trim();

/**
 * Does a friend's name pass for mine? The same as my pet's name, or "You" or "Bạn" (what the Friends sheet calls me), once
 * folded (case, fullwidth letters, accents and joiners aside). The app shows such a friend's species beside the name
 * everywhere, so a card can't pose as me, or as the sheet's own words.
 */
export function looksLikeMe(friendName: string, myPetName: string): boolean {
  const theirs = foldName(friendName);
  if (theirs === "") return false;
  return [myPetName, "You", "Bạn"].some((mine) => foldName(mine) === theirs);
}

// ---------- Friends who share a name ----------

/** 16 hex characters from a public key, spread over every character of it (FNV-1a twice, with two seeds). Not secret, not a security check: it only tells two names apart on screen. */
function pkDigest(pk: string): string {
  let a = 0x811c9dc5;
  let b = 0x01000193 ^ pk.length;
  for (let i = 0; i < pk.length; i++) {
    const c = pk.charCodeAt(i);
    a = Math.imul(a ^ c, 0x01000193) >>> 0;
    b = Math.imul(b ^ (c + i), 0x85ebca6b) >>> 0;
    b ^= b >>> 13;
  }
  return a.toString(16).padStart(8, "0") + (b >>> 0).toString(16).padStart(8, "0");
}

/** The short tag of a friend's public key, "#a3f": `length` hex characters of a hash of it (3 by default; the same every time). */
export const pkTag = (pk: string, length = 3): string => `#${pkDigest(pk).slice(0, Math.min(16, Math.max(1, length)))}`;

/** "Mai · #a3f", or just the name when it has no tag. */
export const withTag = (name: string, tag: string | null | undefined): string => (tag ? `${name} · ${tag}` : name);

/**
 * A short tag for every friend whose name another friend shares (folded the way "passes for mine" folds: case, fullwidth
 * letters, accents and joiners aside), keyed by public key, so that two "Mai" can be told apart in the list, the boss's
 * helpers, Remove and the visitor's label. A friend with a name of their own has none. The tag comes from the key, so it
 * is the same wherever it shows and whoever else is in the list; only if two tags of one name would be equal does that
 * name's group get longer tags.
 */
export function sameNameTags(friends: readonly Pick<Friend, "pk" | "name">[]): Record<string, string> {
  const groups = new Map<string, string[]>();
  for (const f of friends) {
    const folded = foldName(f.name);
    if (folded === "") continue;
    groups.set(folded, [...(groups.get(folded) ?? []), f.pk]);
  }
  const out: Record<string, string> = {};
  for (const keys of groups.values()) {
    if (new Set(keys).size < 2) continue;
    let length = 3;
    while (length < 16 && new Set(keys.map((k) => pkTag(k, length))).size < new Set(keys).size) length++;
    for (const k of keys) out[k] = pkTag(k, length);
  }
  return out;
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
 * Checks the fields of a card, strictly: every field present with the right type, no others, a real public key, known
 * species and accessories only, whole numbers in range, a 28-character record, a real date that is the day `week` is
 * in. Only `today` (a day key) makes a date too far ahead a fault; pass null to read a card already on disk. The
 * signature is not part of this: it covers the payload text, which the backend checks.
 */
export function checkCard(o: Record<string, unknown>, today: string | null): CardResult {
  if (o.v !== 1) return fail("version");
  const keys = Object.keys(o);
  if (keys.length !== CARD_KEYS.length || !CARD_KEYS.every((k) => Object.hasOwn(o, k))) return fail("shape");
  if (!isPublicKey(o.pk)) return fail("key");
  if (!isCardName(o.name)) return fail("name");
  if (!isSpecies(o.species)) return fail("species");
  if (!isAccessoryList(o.accessories)) return fail("accessory");
  if (!isInt(o.stage, 4) || !isInt(o.weekDone, MAX_WEEK_DONE)) return fail("number");
  if (typeof o.history !== "string" || !HISTORY_RE.test(o.history)) return fail("history");
  if (!isDayKey(o.date)) return fail("date");
  if (typeof o.week !== "string" || o.week !== isoWeekKey(o.date)) return fail("week");
  if (today !== null && daysBetween(today, o.date) > FUTURE_DAYS) return fail("future");
  return {
    ok: true,
    card: {
      pk: o.pk,
      name: o.name,
      species: o.species,
      accessories: [...o.accessories],
      stage: o.stage as StageIndex,
      week: o.week,
      weekDone: o.weekDone,
      history: o.history,
      date: o.date,
    },
  };
}

/**
 * Reads the structure of a card someone sent. Strict, and it never throws: a size cap (1630 characters, whitespace left
 * out), the `TODOPET1.` prefix, a payload and a signature as strict base64url, a payload that is valid UTF-8 and JSON
 * that is a plain object, and then `checkCard`. Anything wrong gives a kind message and no card. It returns the payload
 * text exactly as signed and the signature; **the signature is not checked here**: the backend does that (`addFriendCard`),
 * and a card is only ever accepted after it has.
 */
export function parseCard(text: string, today: string): ParsedCard {
  if (typeof text !== "string") return fail("empty");
  // Cheap first: a megabyte of paste is not a card, and shouldn't be searched for whitespace.
  if (text.length > MAX_CARD_CHARS * 4) return fail("tooLong");
  const compact = text.replace(/\s+/g, "");
  if (compact === "") return fail("empty");
  if (compact.length > MAX_CARD_CHARS) return fail("tooLong");
  if (!compact.startsWith(CARD_PREFIX)) return fail("prefix");
  const parts = compact.slice(CARD_PREFIX.length).split(".");
  if (parts.length > 2) return fail("encoding");
  const payload = parts[0] === "" ? null : utf8FromBase64Url(parts[0]);
  if (payload === null) return fail("encoding");
  // A card without its signature is a card with a piece missing.
  if (parts.length < 2) return fail("shape");
  if (!isSignatureText(parts[1])) return fail("encoding");
  let parsed: unknown;
  try {
    parsed = JSON.parse(payload);
  } catch {
    return fail("json");
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return fail("shape");
  const checked = checkCard(parsed as Record<string, unknown>, today);
  return checked.ok ? { ok: true, card: checked.card, payload, signature: parts[1] } : checked;
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
    .replace(FILLERS, "")
    // A pile of combining marks keeps its first two.
    .replace(new RegExp(`(\\p{M}{${MAX_NAME_MARKS}})\\p{M}+`, "gu"), "$1")
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

/**
 * 28 characters of `G R -`: shorter is padded in front with `-`, longer keeps its last 28. A kept day (`K`) and anything
 * else is `-`: a card says the goal was met, the day was a rest, or nothing; it doesn't say how many tasks you did.
 */
export function normalizeHistory(h: string): string {
  const marks = Array.from(String(h ?? ""), (c) => ("GR".includes(c) ? c : "-")).join("");
  return marks.padStart(HISTORY_DAYS, "-").slice(-HISTORY_DAYS);
}

export interface CardSource {
  /** This install's public key (see `CardsApi.publicKey`). */
  pk: string;
  petName: string;
  species: SpeciesId;
  wearing: readonly Accessory[];
  stage: StageIndex;
  /** Tasks finished this week. */
  weekDone: number;
  /** The last 28 days ending today (see `normalizeHistory`). */
  history: string;
  /** Today's day key. */
  today: string;
}

/** The card for the pet as it is `today`: always one that `parseCard` reads back. */
export function buildCard(src: CardSource): PetCard {
  return {
    pk: src.pk,
    name: cardName(src.petName),
    species: src.species,
    accessories: cardAccessories(src.wearing),
    stage: src.stage,
    week: isoWeekKey(src.today),
    weekDone: whole(src.weekDone, MAX_WEEK_DONE),
    history: normalizeHistory(src.history),
    date: src.today,
  };
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
  | { ok: false; error: "self" | "former" | "older" | "full"; message: string };

/**
 * Adds a friend's card, already checked with the backend, to the list (a new list: the one given is never changed). A friend
 * is their public key, so a card with a key you have can only be from the same install: it replaces theirs in place when
 * it is from the same day or later (the friend's last visit is kept), and an older one is refused kindly. Your own card
 * (`myPk`; null when this PC's key can't be read) is refused, and so is one of your own older cards, made before a new
 * card identity (`formerKeys`). A new friend past the 12th is refused. No message repeats a name.
 */
export function addFriend(list: readonly Friend[], card: PetCard, myPk: string | null, formerKeys: readonly string[] = []): AddOutcome {
  if (myPk !== null && card.pk === myPk) {
    return { ok: false, error: "self", message: L("Đây là thẻ của chính bạn! Gửi nó cho một người bạn nhé 💌", "That's your own card! Send it to a friend instead 💌") };
  }
  if (formerKeys.includes(card.pk)) {
    return {
      ok: false,
      error: "former",
      message: L("Đây là một thẻ cũ của chính bạn, từ trước khi đổi danh tính thẻ. Gửi thẻ hiện tại cho một người bạn nhé 💌", "That's one of your own older cards. Send your current card to a friend instead 💌"),
    };
  }
  const at = list.findIndex((f) => f.pk === card.pk);
  if (at >= 0) {
    const old = list[at];
    if (card.date < old.date) {
      return {
        ok: false,
        error: "older",
        message: L("Mình đã có thẻ mới hơn của bạn ấy rồi, nên giữ nguyên nhé.", "I already have a newer card from this friend, so nothing changed."),
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

export const removeFriend = (list: readonly Friend[], pk: string): Friend[] => list.filter((f) => f.pk !== pk);

// ---------- What is stored (the `friends` document, overlay window only) ----------

/** The visits made on `day`, and when the last one began. */
export interface VisitLog {
  day: string;
  count: number;
  lastAt: number | null;
}

/** How many of my older card identities are remembered (see `retireKey`). */
export const MAX_OLD_KEYS = 10;

/**
 * The friends and the day's visits, and the public keys of my earlier card identities (so that an old card of mine,
 * pasted back from a chat, is not taken for a friend). The key that signs my cards is not here: it lives in Credential Manager.
 */
export interface FriendsDoc {
  friends: Friend[];
  visits: VisitLog;
  /** Public keys I used before a "new card identity", oldest first, at most `MAX_OLD_KEYS`. Only public keys: nothing that can sign. */
  oldKeys: string[];
}

const noVisits = (): VisitLog => ({ day: "", count: 0, lastAt: null });

/** My earlier public keys as stored: real keys only, each once (the later place wins), the newest `MAX_OLD_KEYS`. */
function oldKeysFromJson(x: unknown): string[] {
  const keys: string[] = [];
  for (const k of Array.isArray(x) ? x.slice(-MAX_OLD_KEYS * 4) : []) {
    if (!isPublicKey(k)) continue;
    const at = keys.indexOf(k);
    if (at >= 0) keys.splice(at, 1);
    keys.push(k);
  }
  return keys.slice(-MAX_OLD_KEYS);
}

/** The document after I made a new card identity: `pk`, the key I had, is remembered (newest last, no repeats, at most 10). Something that isn't a public key changes nothing. */
export function retireKey(doc: FriendsDoc, pk: string): FriendsDoc {
  if (!isPublicKey(pk)) return doc;
  return { ...doc, oldKeys: oldKeysFromJson([...doc.oldKeys, pk]) };
}

/** A stored time: a finite number, never later than `now` (a clock set back, or a hand-edited file, can't lock visits out) and never below 0. */
const timeNotAfter = (x: unknown, now: number): number | null => (typeof x === "number" && Number.isFinite(x) ? Math.min(Math.max(0, x), now) : null);

function visitsFromJson(x: unknown, now: number): VisitLog {
  if (!x || typeof x !== "object") return noVisits();
  const r = x as Record<string, unknown>;
  return {
    day: isDayKey(r.day) ? r.day : "",
    count: typeof r.count === "number" && Number.isFinite(r.count) ? Math.min(100, Math.max(0, Math.trunc(r.count))) : 0,
    lastAt: timeNotAfter(r.lastAt, now),
  };
}

/** A stored friend: its card checked again as strictly as a pasted one (but never for being dated ahead), or null. */
function friendFromJson(x: unknown, now: number): Friend | null {
  if (!x || typeof x !== "object" || Array.isArray(x)) return null;
  const r = x as Record<string, unknown>;
  const fields = Object.fromEntries(CARD_KEYS.map((k) => [k, r[k]]));
  const checked = checkCard({ ...fields, v: 1 }, null);
  if (!checked.ok) return null;
  return { ...checked.card, lastVisit: timeNotAfter(r.lastVisit, now) };
}

/**
 * Reads the stored document, tolerating anything: only its first 12 entries are looked at, friends that no longer hold
 * up are dropped (a card from an older format has no `pk`), the same friend twice keeps the newer card, and ourselves
 * (`myPk`) is dropped. Times after `now` are brought back to it. Stored cards were verified when they were added, so
 * their structure is all that is checked again.
 */
export function docFromJson(raw: unknown, myPk: string | null, now: number): FriendsDoc {
  const r = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const friends: Friend[] = [];
  const oldKeys = oldKeysFromJson(r.oldKeys);
  for (const x of (Array.isArray(r.friends) ? r.friends : []).slice(0, MAX_FRIENDS)) {
    const f = friendFromJson(x, now);
    if (!f || (myPk !== null && f.pk === myPk) || oldKeys.includes(f.pk)) continue;
    const at = friends.findIndex((g) => g.pk === f.pk);
    if (at < 0) friends.push(f);
    else if (f.date > friends[at].date) friends[at] = f;
  }
  return { friends, visits: visitsFromJson(r.visits, now), oldKeys };
}

/** The document as plain JSON for the `friends` storage key. */
export const docToJson = (doc: FriendsDoc): unknown => ({
  friends: doc.friends.map((f) => ({ ...f, accessories: [...f.accessories] })),
  visits: { ...doc.visits },
  oldKeys: [...doc.oldKeys],
});

// ---------- The record of days ----------

/** How today stands, live, as the pet remembers a day: the goal met (`G`), at least one task (`K`), a day off (`R`), or nothing yet (`-`). A card publishes `K` as `-`. */
export function todayMark(completed: number, target: number, workday: boolean): DayMark {
  if (target > 0 && completed >= target) return "G";
  if (completed > 0) return "K";
  return workday ? "-" : "R";
}

/**
 * The 28 characters for a card made `today`, oldest first: the days the pet settled (`record`, from its life), and
 * for a day it never settled (the PC was off) `R` when it was a day off and `-` otherwise; today is `mark`, live. A kept
 * day (`K`) is published as `-`: a card says goal, rest or nothing (see `normalizeHistory`).
 */
export function cardHistory(record: Readonly<Record<string, DayMark>>, today: string, mark: DayMark, isWorkday: (day: string) => boolean): string {
  let out = "";
  for (let i = 0; i < HISTORY_DAYS - 1; i++) {
    const day = addDays(today, i - (HISTORY_DAYS - 1));
    const known = record[day];
    out += known && DAY_MARKS.includes(known) ? known : isWorkday(day) ? "-" : "R";
  }
  return normalizeHistory(out + mark);
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
  /** A friend's public key; "me" for you. */
  id: string;
  name: string;
  /** The friend's species (shown beside a name that could pass for mine); null for you. */
  species: SpeciesId | null;
  /** The tag that tells this friend from another with the same name ("#a3f"), or null (see `sameNameTags`). */
  tag: string | null;
  /** Tasks finished this week, as they are (a card can say up to 999). */
  done: number;
  /** What those tasks do to the blob: `done`, up to a share (15). */
  counted: number;
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
  /** Friends whose latest card is not from this week (an earlier week, or a time zone ahead): not counted until they send a fresh one. */
  waiting: number;
}

/**
 * This week's co-op boss: 15 HP per member (you, and each friend whose latest card is from this ISO week). The damage
 * is your tasks of the week, counted live, plus each friend's `weekDone` from their latest card, **each person up to
 * their share (15)**: the blob needs everyone, and one card that says 999 can't win it alone. There is no losing and
 * no penalty: it is just beaten, or not yet.
 */
export function bossOf(input: { today: string; myDone: number; friends: readonly Friend[] }): Boss {
  const week = isoWeekKey(input.today);
  const share = (done: number) => Math.min(BOSS_HP_PER_MEMBER, done);
  const done = whole(input.myDone, Number.MAX_SAFE_INTEGER);
  const mine: BossMember = { id: "me", name: L("Bạn", "You"), species: null, tag: null, done, counted: share(done), me: true };
  // Tags are for the whole list, a waiting friend included: the same name looks the same on every screen.
  const tags = sameNameTags(input.friends);
  const theirs = input.friends
    .filter((f) => f.week === week)
    .map((f): BossMember => ({ id: f.pk, name: f.name, species: f.species, tag: tags[f.pk] ?? null, done: f.weekDone, counted: share(f.weekDone), me: false }))
    .sort((a, b) => b.done - a.done);
  const members = [mine, ...theirs];
  const maxHp = members.length * BOSS_HP_PER_MEMBER;
  const damage = members.reduce((sum, m) => sum + m.counted, 0);
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
  /** A call app or a call tab (Zoom, Teams, Meet…) is in front. */
  inCall: boolean;
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
  inCall: false,
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
  // A last visit in the future (the clock was set back) is long enough ago: it can't lock visits out.
  if (log.lastAt !== null && log.lastAt <= now && now - log.lastAt < VISIT_GAP_MS) return null;
  const able = friends.filter((f) => canVisit(f, today));
  if (able.length === 0) return null;
  // The same for a friend's last visit: never later than now.
  const since = (f: Friend) => (f.lastVisit === null ? Number.NEGATIVE_INFINITY : Math.min(f.lastVisit, now));
  const longestAgo = Math.min(...able.map(since));
  const tied = able.filter((f) => since(f) === longestAgo);
  const r = random();
  return tied[Math.min(tied.length - 1, Math.max(0, Math.floor((Number.isFinite(r) ? r : 0) * tied.length)))];
}

/** The document after a visit began: today's count and the friend's last visit. */
export function recordVisit(doc: FriendsDoc, friendPk: string, now: number, today: string): FriendsDoc {
  const count = doc.visits.day === today ? doc.visits.count + 1 : 1;
  return {
    ...doc,
    friends: doc.friends.map((f) => (f.pk === friendPk ? { ...f, lastVisit: now } : f)),
    visits: { day: today, count, lastAt: now },
  };
}

/** The first visit of a day waits this long at least… */
const VISIT_FIRST_MIN_MINUTES = 15;
/** …and up to this much more. */
const VISIT_FIRST_SPREAD_MINUTES = 60;

/**
 * How long a session or a day waits before its first visit: 15 minutes plus up to an hour more. It comes from the
 * install's public key and the day (a hash, not a dice roll), so restarting the app doesn't draw again, and the game's
 * own random source is left alone.
 */
export function visitDelayMs(pk: string, day: string): number {
  let h = 0x811c9dc5;
  for (const c of `${pk}|${day}`) h = Math.imul(h ^ c.charCodeAt(0), 0x01000193) >>> 0;
  return (VISIT_FIRST_MIN_MINUTES + (h % (VISIT_FIRST_SPREAD_MINUTES * 60)) / 60) * 60_000;
}

/** What the visitor's label says after the friend's name: " dropped by! 🔥 buddy streak 4". */
export function visitTail(streak: number): string {
  return streak > 0 ? L(` ghé chơi! 🔥 chuỗi bạn ${streak} ngày`, ` dropped by! 🔥 buddy streak ${streak}`) : L(" ghé chơi! 👋", " dropped by! 👋");
}

/** The little label a visitor carries, as one string (for the tooltip and the screen reader). */
export const visitLabel = (name: string, streak: number): string => name + visitTail(streak);

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

/** The line under the blob while it is not beaten: every task hurts it, up to a share each, and nothing is lost. */
export const bossHelpText = (): string =>
  L(
    `Mỗi việc bạn và bạn bè xong trong tuần đều làm nó đau (mỗi người tính tối đa ${BOSS_HP_PER_MEMBER} việc). Không thua, không phạt; thứ Hai nó lại hồi sinh.`,
    `Every task you and your friends finish this week hurts it (each person counts up to ${BOSS_HP_PER_MEMBER}). No losing, no penalties; it's back on Monday.`,
  );

/** The line for a blob you face alone: its size, and that a friend makes it a team effort. */
export const bossAloneText = (): string =>
  L(
    `Một mình thì nó có ${BOSS_HP_PER_MEMBER} HP; mỗi bạn thêm vào, nó thêm ${BOSS_HP_PER_MEMBER} HP và cả nhóm cùng đánh.`,
    `Alone it has ${BOSS_HP_PER_MEMBER} HP; each friend adds ${BOSS_HP_PER_MEMBER} more, and you fight it together.`,
  );

/** What the pet says when the blob is beaten: together with friends, or alone. */
export function bossWinText(together: boolean): string {
  return together
    ? L("👾 Cả nhóm đã hạ gục Quái Vật Trì Hoãn tuần này! Mọi người cùng thắng: +50 XP và một sticker 🏅.", "👾 You all beat the Procrastination Blob this week! Everyone wins: +50 XP and a 🏅 sticker.")
    : L("👾 Bạn đã hạ gục Quái Vật Trì Hoãn tuần này! +50 XP và một sticker 🏅.", "👾 You beat the Procrastination Blob this week! +50 XP and a 🏅 sticker.");
}

// ---------- Sample friends (the demo) ----------

/** The sample friends' public keys: 32 bytes of plain text each, not any real key (they belong to the demo, whose "signatures" aren't cryptography). */
const sampleKey = (label: string) => encodeBase64Url(utf8Bytes(label.padEnd(32, ".").slice(0, 32)));

/**
 * Two friends for the demo, made from sample data for `today`: Mai (a card from today, a buddy streak of 3 with
 * `demoLife`'s record) and Bin (a card from two days ago, a streak of 2). Real cards in every way: the demo signs them
 * with its stand-in key (see `demoSignedCard`) and they are added by the same path as a pasted one.
 */
export function sampleCards(today: string): PetCard[] {
  const make = (c: Omit<PetCard, "week" | "history" | "date"> & { ageDays: number; before: string; recent: string }): PetCard => {
    const date = addDays(today, -c.ageDays);
    const { ageDays: _age, before, recent, ...rest } = c;
    return { ...rest, week: isoWeekKey(date), history: normalizeHistory(before + recent), date };
  };
  return [
    make({ pk: sampleKey("TodoPet demo friend: Mai"), name: "Mai", species: "shiba", accessories: ["flowercrown", "scarf"], stage: 3, weekDone: 9, ageDays: 0, before: "GGKGGGRRGGKGGG", recent: "GKGGRRGGGGGGGG" }),
    make({ pk: sampleKey("TodoPet demo friend: Bin"), name: "Bin", species: "capybara", accessories: ["bandana"], stage: 1, weekDone: 4, ageDays: 2, before: "GKGGRRGGKGGRGK", recent: "KGGRRGGGK-GKGG" }),
  ];
}
