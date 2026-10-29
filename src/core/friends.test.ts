// v0.6 "Friends": pet cards, the friend list, the buddy streak, the weekly boss and visits (pure rules).
import { describe, expect, it } from "vitest";
import { demoCardSignature, demoPublicKey } from "../backend/demoCards";
import { decodeBase64Url, encodeBase64Url, utf8Bytes } from "./b64";
import {
  CARD_PREFIX,
  MAX_CARD_CHARS,
  MAX_FRIENDS,
  MAX_NAME_MARKS,
  MAX_OLD_KEYS,
  BOSS_HP_PER_MEMBER,
  MAX_VISITS_PER_DAY,
  VISIT_GAP_MS,
  addFriend,
  bossOf,
  buddyStreak,
  buildCard,
  calmMoment,
  canVisit,
  cardErrorText,
  cardHistory,
  cardName,
  cardPayload,
  docFromJson,
  docToJson,
  encodeCard,
  isCardName,
  isPublicKey,
  isoWeekKey,
  looksLikeMe,
  normalizeHistory,
  parseCard,
  pickVisitor,
  pkTag,
  recordVisit,
  retireKey,
  sameNameTags,
  withTag,
  sampleCards,
  visitDelayMs,
  removeFriend,
  todayMark,
  visitLabel,
  visitTail,
  weekDoneOf,
  bossWinText,
  type CardError,
  type Friend,
  type PetCard,
} from "./friends";
import { weekKey as mondayOf } from "./chapters";
import { addDays } from "./dates";
import { setLang } from "./l10n";

const TODAY = "2026-10-29"; // a Thursday, ISO week 44

/** 28 characters, oldest first, ending on the card's date: goal days, rest days and nothing (a card has no "kept"). */
const HISTORY = "GG-R--GGG-RRGG--GGGRRG-GGGG-";

/** Public keys for the tests: 32 bytes each, in the real shape (the demo's stand-in makes them). */
const MAI = demoPublicKey("mai");
const ME = demoPublicKey("me");
const keyOf = (n: number | string) => demoPublicKey(`friend-${n}`);

function card(patch: Partial<PetCard> = {}): PetCard {
  return {
    pk: MAI,
    name: "Mai",
    species: "shiba",
    accessories: ["flowercrown", "scarf"],
    stage: 2,
    week: "2026-W44",
    weekDone: 9,
    history: HISTORY,
    date: TODAY,
    ...patch,
  };
}

/** The card as the wire has it, signed by the card's own key (the demo's stand-in: the backend checks real ones). */
const textOf = (c: PetCard) => encodeCard(c, demoCardSignature(c.pk, cardPayload(c)));
/** A signature-shaped string that signs nothing: structure checks never look at it. */
const NOSIG = encodeBase64Url(new Uint8Array(64));

const b64url = (s: string) => encodeBase64Url(utf8Bytes(s));
/** A card text from any JSON, for the malformed ones. */
const raw = (json: unknown) => `${CARD_PREFIX}${b64url(typeof json === "string" ? json : JSON.stringify(json))}.${NOSIG}`;
/** The fields of a good card as the wire has them, changed by `patch`. */
const wire = (patch: Record<string, unknown> = {}) => ({
  v: 1,
  pk: MAI,
  name: "Mai",
  species: "shiba",
  accessories: ["flowercrown", "scarf"],
  stage: 2,
  week: "2026-W44",
  weekDone: 9,
  history: HISTORY,
  date: TODAY,
  ...patch,
});
const without = (key: string) => {
  const w: Record<string, unknown> = wire();
  delete w[key];
  return w;
};

describe("pet cards: the text", () => {
  it("is TODOPET1., the payload and its signature, as base64url, and reads back as itself", () => {
    const c = card();
    const text = textOf(c);
    const [prefix, payload, signature, ...more] = text.split(".");
    expect(`${prefix}.`).toBe(CARD_PREFIX);
    expect(more).toEqual([]);
    expect(payload).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(signature).toMatch(/^[A-Za-z0-9_-]{86}$/);
    expect(text.length).toBeLessThanOrEqual(MAX_CARD_CHARS);
    expect(parseCard(text, TODAY)).toEqual({ ok: true, card: c, payload: cardPayload(c), signature: demoCardSignature(MAI, cardPayload(c)) });
  });

  it("signs the exact payload bytes: the payload part decodes to the JSON text that is signed", () => {
    const c = card({ name: "Bánh Bao 🐼" });
    const payload = textOf(c).slice(CARD_PREFIX.length).split(".")[0];
    expect(new TextDecoder().decode(decodeBase64Url(payload)!)).toBe(cardPayload(c));
  });

  it("carries a public key instead of an id, and nothing but the card's fields (no streak, no best, no task titles, times, app names or user name)", () => {
    const json = JSON.parse(cardPayload(card())) as Record<string, unknown>;
    expect(Object.keys(json)).toEqual(["v", "pk", "name", "species", "accessories", "stage", "week", "weekDone", "history", "date"]);
    expect(json.pk).toBe(MAI);
    expect(json).not.toHaveProperty("id");
    expect(json).not.toHaveProperty("streak");
    expect(json).not.toHaveProperty("best");
  });

  it("is a public key of 43 characters that is 32 bytes, strictly", () => {
    expect(isPublicKey(MAI)).toBe(true);
    for (const bad of ["", MAI.slice(1), `${MAI}A`, `${MAI}=`, MAI.replace(/.$/, "!"), 5, null, undefined, "a".repeat(43) + "\n"]) expect(isPublicKey(bad), String(bad)).toBe(false);
    // The last character of 32 bytes only carries 4 bits: another spelling of the same key is no key.
    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
    const other = alphabet[alphabet.indexOf(MAI.at(-1)!) ^ 1];
    expect(isPublicKey(MAI.slice(0, -1) + other)).toBe(false);
  });

  it("keeps Vietnamese and emoji names intact", () => {
    for (const name of ["Mèo Mướp", "Đậu Phộng", "Bánh Bao 🐼", "かわいい"]) {
      expect(parseCard(textOf(card({ name })), TODAY)).toMatchObject({ ok: true, card: { name } });
    }
  });

  it("keeps an emoji built with the zero-width joiner (the one invisible character a name may hold)", () => {
    const technologist = String.fromCodePoint(0x1f469, 0x200d, 0x1f4bb);
    expect(technologist).toHaveLength(5);
    expect(parseCard(textOf(card({ name: `Mai ${technologist}` })), TODAY)).toMatchObject({ ok: true, card: { name: `Mai ${technologist}` } });
    const src = { pk: ME, species: "mochi", wearing: [], stage: 1, weekDone: 0, history: "", today: TODAY } as const;
    expect(buildCard({ ...src, petName: technologist }).name).toBe(technologist);
    expect(buildCard({ ...src, petName: String.fromCodePoint(0x200d) }).name).toBe("Pet");
  });

  it("round-trips the extremes: no accessories, three accessories, every stage", () => {
    expect(parseCard(textOf(card({ accessories: [] })), TODAY)).toMatchObject({ ok: true });
    expect(parseCard(textOf(card({ accessories: ["bow", "heartglasses", "scarf"] })), TODAY)).toMatchObject({ ok: true });
    for (const stage of [0, 1, 2, 3, 4] as const) expect(parseCard(textOf(card({ stage })), TODAY)).toMatchObject({ ok: true, card: { stage } });
  });

  it("allows for the longest card and stays under the cap (1500 for the payload and about 130 more for the key and signature)", () => {
    expect(MAX_CARD_CHARS).toBe(1630);
    const longest = card({ name: "😀".repeat(20), accessories: ["bow", "heartglasses", "scarf"], weekDone: 999 });
    const text = textOf(longest);
    expect(text.length).toBeLessThan(700);
    expect(text.length).toBeLessThan(MAX_CARD_CHARS);
    expect(parseCard(text, TODAY)).toMatchObject({ ok: true });
  });

  it("forgives whitespace around the text and inside it (a chat app may wrap a long line)", () => {
    const text = textOf(card());
    expect(parseCard(`  \n${text}\n `, TODAY)).toMatchObject({ ok: true });
    expect(parseCard(`${text.slice(0, 40)}\n${text.slice(40)}`, TODAY)).toMatchObject({ ok: true });
    // Whitespace anywhere is left out before anything is measured or read.
    expect(parseCard(text.split("").join(" \n"), TODAY)).toMatchObject({ ok: true });
  });

  it("does not look at the signature itself: the backend does (structure only)", () => {
    const c = card();
    const forged = `${CARD_PREFIX}${b64url(cardPayload(c))}.${NOSIG}`;
    expect(parseCard(forged, TODAY)).toMatchObject({ ok: true, card: c, signature: NOSIG });
  });
});

describe("pet cards: every way a pasted card can be wrong gets a kind error and nothing else", () => {
  const fails = (text: string, error: string, today = TODAY) => {
    setLang("en");
    const out = parseCard(text, today);
    expect(out).toMatchObject({ ok: false, error });
    if (!out.ok) {
      expect(out.message.length).toBeGreaterThan(10);
      // Kind, in both languages: never the raw reason or a stack.
      expect(out.message).not.toMatch(/undefined|NaN|SyntaxError|\[object/);
    }
  };

  it("size: empty, and over the cap", () => {
    fails("", "empty");
    fails("   \n ", "empty");
    fails(CARD_PREFIX + "A".repeat(MAX_CARD_CHARS), "tooLong");
    fails("x".repeat(100_000), "tooLong");
    // Exactly at the cap is read (and then found to be nonsense, which is a different error).
    const atCap = CARD_PREFIX + "A".repeat(MAX_CARD_CHARS - CARD_PREFIX.length);
    expect((parseCard(atCap, TODAY) as { error: string }).error).not.toBe("tooLong");
  });

  it("prefix: not a card at all, a wrong version, a wrong case", () => {
    fails("hello there", "prefix");
    fails("TODOPET2." + b64url(JSON.stringify(wire())) + "." + NOSIG, "prefix");
    fails("todopet1." + b64url(JSON.stringify(wire())) + "." + NOSIG, "prefix");
    fails(b64url(JSON.stringify(wire())) + "." + NOSIG, "prefix");
    fails("Here is my card: " + textOf(card()), "prefix");
  });

  it("a card without its signature (or with one too many parts) is damaged", () => {
    const payload = b64url(JSON.stringify(wire()));
    fails(`${CARD_PREFIX}${payload}`, "shape");
    fails(`${CARD_PREFIX}${payload}.`, "encoding");
    fails(`${CARD_PREFIX}${payload}.${NOSIG}.${NOSIG}`, "encoding");
    fails(`${CARD_PREFIX}.${NOSIG}`, "encoding");
    fails(`${CARD_PREFIX}..`, "encoding");
  });

  it("a signature of the wrong size or alphabet, or spelled another way", () => {
    const payload = b64url(JSON.stringify(wire()));
    for (const sig of [NOSIG.slice(1), `${NOSIG}A`, NOSIG.slice(0, 85) + "=", NOSIG.slice(0, 85) + "!", NOSIG.slice(0, 85) + "+"]) fails(`${CARD_PREFIX}${payload}.${sig}`, "encoding");
    // 86 characters hold 64 bytes and 4 spare bits; a spelling with them set is not what a signer writes.
    fails(`${CARD_PREFIX}${payload}.${NOSIG.slice(0, 85)}B`, "encoding");
  });

  it("bad base64 in the payload", () => {
    fails(CARD_PREFIX, "encoding");
    fails(CARD_PREFIX + "!!!!." + NOSIG, "encoding");
    fails(CARD_PREFIX + "ab cd$." + NOSIG, "encoding");
    // Padding and the standard alphabet are not what a card is made of.
    fails(CARD_PREFIX + b64url("{}") + "==." + NOSIG, "encoding");
    fails(CARD_PREFIX + btoa(">>>???").replace(/=+$/, "") + "." + NOSIG, "encoding");
    // One character too many for a whole number of bytes.
    fails(CARD_PREFIX + "A." + NOSIG, "encoding");
    // Bytes that are not UTF-8.
    fails(CARD_PREFIX + encodeBase64Url(Uint8Array.from([0xff, 0xfe, 0xfd])) + "." + NOSIG, "encoding");
    // The same payload spelled with spare bits set.
    const good = b64url(JSON.stringify(wire()));
    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
    if (good.length % 4 !== 0) fails(`${CARD_PREFIX}${good.slice(0, -1)}${alphabet[alphabet.indexOf(good.at(-1)!) ^ 1]}.${NOSIG}`, "encoding");
  });

  it("bad JSON, and JSON that is not an object", () => {
    fails(raw("{not json"), "json");
    fails(raw(" "), "json");
    fails(raw("[]"), "shape");
    fails(raw("null"), "shape");
    fails(raw("42"), "shape");
    fails(raw('"TODOPET1"'), "shape");
    // A byte order mark is not JSON.
    fails(`${CARD_PREFIX}${encodeBase64Url(Uint8Array.from([0xef, 0xbb, 0xbf, ...utf8Bytes(JSON.stringify(wire()))]))}.${NOSIG}`, "json");
  });

  it("a missing field, an extra field, a wrong type, a wrong version", () => {
    for (const key of Object.keys(wire())) fails(raw(without(key)), key === "v" ? "version" : "shape");
    fails(raw(wire({ extra: "task title: pay the rent" })), "shape");
    // The fields the format dropped are extra now.
    fails(raw(wire({ streak: 6 })), "shape");
    fails(raw(wire({ best: 12 })), "shape");
    fails(raw(wire({ id: "friend-mai-0001" })), "shape");
    fails(raw(wire({ v: 2 })), "version");
    fails(raw(wire({ v: "1" })), "version");
    fails(raw(wire({ name: 5 })), "name");
    fails(raw(wire({ accessories: "bow" })), "accessory");
    fails(raw(wire({ history: ["G"] })), "history");
  });

  it("a public key of the wrong shape", () => {
    for (const pk of ["", "short", "has space in it", MAI + "A", MAI.slice(1), `${MAI.slice(0, 42)}!`, 7, null, "__proto__", MAI.slice(0, -1) + "B"]) fails(raw(wire({ pk })), "key");
  });

  it("an unknown species or accessory", () => {
    fails(raw(wire({ species: "dinosaur" })), "species");
    fails(raw(wire({ species: "" })), "species");
    fails(raw(wire({ species: "__proto__" })), "species");
    fails(raw(wire({ species: ["cat"] })), "species");
    fails(raw(wire({ accessories: ["bow", "jetpack"] })), "accessory");
    fails(raw(wire({ accessories: [5] })), "accessory");
    // More than three, the same one twice, two in one slot.
    fails(raw(wire({ accessories: ["bow", "scarf", "sunglasses", "tophat"] })), "accessory");
    fails(raw(wire({ accessories: ["bow", "bow"] })), "accessory");
    fails(raw(wire({ accessories: ["bow", "crown"] })), "accessory");
  });

  it("a name that is empty, too long, or has control characters", () => {
    fails(raw(wire({ name: "" })), "name");
    fails(raw(wire({ name: "   " })), "name");
    fails(raw(wire({ name: " Mai" })), "name");
    fails(raw(wire({ name: "Mai " })), "name");
    fails(raw(wire({ name: "x".repeat(21) })), "name");
    fails(raw(wire({ name: "😀".repeat(21) })), "name");
    fails(raw(wire({ name: "Ma\ni" })), "name");
    fails(raw(wire({ name: "Ma\u0000i" })), "name");
    fails(raw(wire({ name: "Ma\u0007i" })), "name");
    fails(raw(wire({ name: "Ma\u001bi" })), "name");
    fails(raw(wire({ name: "‮iaM" })), "name"); // right-to-left override
    fails(raw(wire({ name: "Ma​i" })), "name"); // zero-width space
    fails(raw(wire({ name: "Ma i" })), "name");
    fails(raw(wire({ name: "‍" })), "name");
    // Exactly 20 is fine.
    expect(parseCard(raw(wire({ name: "x".repeat(20) })), TODAY)).toMatchObject({ ok: true });
  });

  it("is plain text: markup in a name is kept as text, never read", () => {
    const out = parseCard(raw(wire({ name: "<b>Mai</b>" })), TODAY);
    expect(out).toMatchObject({ ok: true, card: { name: "<b>Mai</b>" } });
  });

  it("numbers out of range or not whole", () => {
    for (const patch of [{ stage: -1 }, { stage: 5 }, { stage: 1.5 }, { stage: "3" }, { weekDone: -1 }, { weekDone: 1000 }, { weekDone: 1e15 }, { weekDone: Number.MAX_SAFE_INTEGER }, { weekDone: null }]) {
      fails(raw(wire(patch)), "number");
    }
    // NaN and Infinity cannot even be written in JSON; they arrive as null.
    fails(raw(JSON.stringify(wire()).replace('"weekDone":9', '"weekDone":null')), "number");
    fails(raw(JSON.stringify(wire()).replace('"weekDone":9', '"weekDone":1e999')), "number");
  });

  it("a malformed history: 28 characters of G, R and - only (a card has no 'kept')", () => {
    for (const history of [
      "",
      "G".repeat(27),
      "G".repeat(29),
      "G".repeat(27) + "X",
      "G".repeat(27) + "K",
      "g".repeat(28),
      "G".repeat(27) + " ",
      "G".repeat(27) + "\n",
      "G".repeat(27) + "😀",
      "G".repeat(14) + "!" + "G".repeat(13),
    ]) {
      fails(raw(wire({ history })), "history");
    }
    expect(parseCard(raw(wire({ history: "-".repeat(28) })), TODAY)).toMatchObject({ ok: true });
    expect(parseCard(raw(wire({ history: "GR-".repeat(9) + "G" })), TODAY)).toMatchObject({ ok: true });
  });

  it("a week key that is malformed, or not the week of the card's date", () => {
    for (const week of ["", "2026-44", "2026-W4", "2026-W54", "2026-W00", "26-W44", "2026-w44", "2026-W44x", 44]) fails(raw(wire({ week })), "week");
    fails(raw(wire({ week: "2026-W43" })), "week");
    fails(raw(wire({ week: "2025-W44" })), "week");
  });

  it("a date that is not a real day", () => {
    for (const date of ["", "2026-02-30", "2026-13-01", "2026-10-9", "29/10/2026", "2026-10-29T10:00:00", "yesterday", 20261029, null]) {
      fails(raw(wire({ date, week: "2026-W44" })), "date");
    }
  });

  it("a date in the future", () => {
    // A day ahead is a friend whose clock is in another time zone; more than that is not.
    expect(parseCard(raw(wire({ date: "2026-10-30" })), TODAY)).toMatchObject({ ok: true });
    fails(raw(wire({ date: "2026-10-31" })), "future");
    fails(raw(wire({ date: "2027-01-01", week: "2026-W53" })), "future");
    fails(raw(wire({ date: "2099-01-01", week: "2099-W01" })), "future");
  });

  it("gives the same kind answer in Vietnamese", () => {
    setLang("vi");
    const out = parseCard("hello", TODAY);
    setLang("en");
    expect(out).toMatchObject({ ok: false, error: "prefix" });
    if (!out.ok) expect(out.message).toMatch(/thẻ/i);
  });

  it("never throws, whatever it is given", () => {
    const junk: unknown[] = [undefined, null, 0, {}, [], "\u0000", "TODOPET1.\u0000", CARD_PREFIX + "%%%", "𝒳".repeat(2000), "TODOPET1." + "_".repeat(1400), `${CARD_PREFIX}.`, `${CARD_PREFIX}....`];
    for (const j of junk) expect(() => parseCard(j as string, TODAY)).not.toThrow();
    for (const j of junk) expect(parseCard(j as string, TODAY).ok).toBe(false);
  });

  it("says a card doesn't check out kindly, in both languages, without the card's own name", () => {
    setLang("en");
    expect(cardErrorText("signature")).toBe("This card doesn't check out; ask your friend to copy it again.");
    setLang("vi");
    expect(cardErrorText("signature")).toMatch(/thẻ/i);
    setLang("en");
    expect(cardErrorText("unchecked")).toMatch(/try again/i);
  });

  it("never puts what the card says into an error: no kind of error repeats the card's name", () => {
    const errors: CardError[] = ["empty", "tooLong", "prefix", "encoding", "json", "shape", "version", "key", "name", "species", "accessory", "number", "history", "week", "date", "future", "signature", "unchecked"];
    for (const lang of ["en", "vi"] as const) {
      setLang(lang);
      for (const e of errors) expect(cardErrorText(e), e).not.toMatch(/Mai|ZZ|<|>/);
    }
    setLang("en");
    const out = parseCard(raw(wire({ name: "ZZ-Not-A-Real-Species", species: "dinosaur" })), TODAY);
    expect(out.ok ? "" : out.message).not.toContain("ZZ");
  });
});

describe("what a name has to be (SECURITY L1)", () => {
  const fillers: [string, string][] = [
    ["the Hangul filler", "ㅤ"],
    ["the choseong filler", "ᅟ"],
    ["the jungseong filler", "ᅠ"],
    ["the halfwidth Hangul filler", "ﾠ"],
    ["the blank braille pattern", "⠀"],
    ["the combining grapheme joiner", "͏"],
    ["a no-break space", " "],
  ];

  it("needs a visible character: a name of fillers or blanks is no name", () => {
    for (const [what, ch] of fillers) {
      expect(isCardName(ch), what).toBe(false);
      expect(isCardName(ch.repeat(20)), `${what} x20`).toBe(false);
      expect(isCardName(`${ch}${ch}${ch}`), `${what} x3`).toBe(false);
    }
    expect(isCardName("ㅤᅟᅠﾠ⠀͏")).toBe(false);
    expect(isCardName("⠀ㅤ‍ㅤ")).toBe(false);
    expect(isCardName("́́")).toBe(false);
    expect(isCardName("️")).toBe(false);
  });

  it("still takes a name that has a visible character next to a filler", () => {
    expect(isCardName("aㅤ")).toBe(true);
    expect(isCardName("⠀a")).toBe(true);
    expect(isCardName("한글")).toBe(true);
    expect(isCardName("🐱ㅤ")).toBe(true);
  });

  it("caps a run of combining marks at 2", () => {
    expect(MAX_NAME_MARKS).toBe(2);
    const mark = "́";
    expect(isCardName(`e${mark}`)).toBe(true);
    expect(isCardName(`e${mark}${mark}`)).toBe(true);
    expect(isCardName(`e${mark.repeat(3)}`)).toBe(false);
    expect(isCardName(`e${mark.repeat(19)}`)).toBe(false);
    expect(isCardName(`a${mark.repeat(2)}b${mark.repeat(2)}c`)).toBe(true);
    // Real writing stays: Vietnamese with its tone and shape marks, even decomposed.
    for (const name of ["Mèo Mướp", "Đậu Phộng", "Bạn", "Ệ"]) expect(isCardName(name.normalize("NFD")), name).toBe(true);
    // Keycaps and flags are fine.
    expect(isCardName("1️⃣")).toBe(true);
  });

  it("refuses these in a pasted card, and my own pet's name is cleaned to something that passes", () => {
    for (const name of ["ㅤ", "á́́́", "  "]) {
      expect(parseCard(raw(wire({ name })), TODAY), name).toMatchObject({ ok: false, error: "name" });
    }
    const src = { pk: ME, species: "mochi", wearing: [], stage: 1, weekDone: 0, history: "", today: TODAY } as const;
    expect(cardName("ㅤㅤ")).toBe("Pet");
    expect(cardName("⠀")).toBe("Pet");
    expect(cardName("Moㅤchi")).toBe("Mochi");
    expect(cardName(`Mo${"́".repeat(9)}chi`)).toBe(`Mo${"́".repeat(2)}chi`);
    for (const petName of ["ㅤ", "́́́", `a${"́".repeat(30)}`, " ", "x".repeat(40)]) {
      const c = buildCard({ ...src, petName });
      expect(parseCard(textOf(c), TODAY).ok, petName).toBe(true);
    }
  });

  it("compares a friend's name with mine, and with You and Bạn, the way a reader would (NFKC, case)", () => {
    expect(looksLikeMe("Mochi", "Mochi")).toBe(true);
    expect(looksLikeMe("mochi", "MOCHI")).toBe(true);
    expect(looksLikeMe("Ｍｏｃｈｉ", "Mochi")).toBe(true); // fullwidth
    expect(looksLikeMe("Mochi‍", "Mochi")).toBe(true);
    expect(looksLikeMe("Móchi", "Mochi")).toBe(true);
    expect(looksLikeMe("Ꮇochi", "Mochi")).toBe(false); // not folded: other scripts are not guessed
    expect(looksLikeMe("You", "Mochi")).toBe(true);
    expect(looksLikeMe("YOU", "Mochi")).toBe(true);
    expect(looksLikeMe("Ｙｏｕ", "Mochi")).toBe(true);
    expect(looksLikeMe("Bạn", "Mochi")).toBe(true);
    expect(looksLikeMe("BẠN", "Mochi")).toBe(true);
    expect(looksLikeMe("Bạn".normalize("NFD"), "Mochi")).toBe(true);
    expect(looksLikeMe("Mai", "Mochi")).toBe(false);
    expect(looksLikeMe("Mai", "")).toBe(false);
    expect(looksLikeMe("", "")).toBe(false);
    expect(looksLikeMe("Mochi 2", "Mochi")).toBe(false);
  });
});

describe("building my own card", () => {
  const base = {
    pk: ME,
    petName: "Mochi",
    species: "mochi",
    wearing: ["bow"],
    stage: 3,
    weekDone: 7,
    history: "GRGR" + "-".repeat(24),
    today: TODAY,
  } as const;

  it("makes a card that reads back as itself, with my public key and no streaks", () => {
    const c = buildCard({ ...base, wearing: [...base.wearing] });
    expect(c).toEqual({ pk: ME, name: "Mochi", species: "mochi", accessories: ["bow"], stage: 3, week: "2026-W44", weekDone: 7, history: "GRGR" + "-".repeat(24), date: TODAY });
    expect(parseCard(textOf(c), TODAY)).toMatchObject({ ok: true, card: c });
  });

  it("makes a name a card can carry: trimmed, cleaned, cut to 20 and never empty", () => {
    const name = (petName: string) => buildCard({ ...base, wearing: [], petName }).name;
    expect(name("  Mochi  ")).toBe("Mochi");
    expect(name("Mo\nchi\u0007")).toBe("Mochi");
    expect(name("A very long pet name indeed")).toHaveLength(20);
    expect(name("😀".repeat(30))).toBe("😀".repeat(20));
    expect(name("")).not.toBe("");
    expect(name("\n\n")).not.toBe("");
    expect(name("Mèo Mướp")).toBe("Mèo Mướp");
    for (const n of ["", "x".repeat(40), "‮abc", "Mo​chi", "😀".repeat(30)]) {
      expect(parseCard(textOf(buildCard({ ...base, wearing: [], petName: n })), TODAY).ok).toBe(true);
    }
  });

  it("wears at most three accessories, one per slot, and none that a card can't carry", () => {
    const worn = buildCard({ ...base, wearing: ["bow", "crown", "scarf", "sunglasses", "tophat"] }).accessories;
    expect(worn).toEqual(["bow", "scarf", "sunglasses"]);
  });

  it("keeps the numbers inside what a card allows", () => {
    expect(buildCard({ ...base, wearing: [], weekDone: 5000 }).weekDone).toBe(999);
    expect(buildCard({ ...base, wearing: [], weekDone: -1 }).weekDone).toBe(0);
    expect(buildCard({ ...base, wearing: [], weekDone: Number.NaN }).weekDone).toBe(0);
  });

  it("publishes 'kept' days as nothing: a card says goal (G), rest (R) or nothing (-)", () => {
    expect(normalizeHistory("GKR-")).toBe("-".repeat(24) + "G-R-");
    expect(normalizeHistory("K".repeat(28))).toBe("-".repeat(28));
    expect(normalizeHistory("GxZ")).toBe("-".repeat(25) + "G--");
    expect(normalizeHistory("G".repeat(40))).toBe("G".repeat(28));
    const c = buildCard({ ...base, wearing: [], history: "K".repeat(10) + "G".repeat(18) });
    expect(c.history).toBe("-".repeat(10) + "G".repeat(18));
    expect(c.history).not.toContain("K");
  });
});

describe("the friend list", () => {
  const friend = (patch: Partial<Friend> = {}): Friend => ({ ...card(), lastVisit: null, ...patch });
  const keys = (list: readonly Friend[]) => list.map((f) => f.pk);
  const [A, B] = [keyOf("a"), keyOf("b")];

  it("adds a new friend at the end, with no visit yet", () => {
    const out = addFriend([friend({ pk: A })], card({ pk: B, name: "Bin" }), ME);
    expect(out).toMatchObject({ ok: true, replaced: false });
    if (!out.ok) return;
    expect(keys(out.friends)).toEqual([A, B]);
    expect(out.friend).toMatchObject({ pk: B, name: "Bin", lastVisit: null });
  });

  it("refuses your own card, and changes nothing", () => {
    setLang("en");
    const list = [friend()];
    const out = addFriend(list, card({ pk: ME }), ME);
    expect(out).toMatchObject({ ok: false, error: "self" });
    if (!out.ok) expect(out.message).toMatch(/your own/i);
    expect(list).toHaveLength(1);
    // Without a key of my own to compare with, nothing is "mine".
    expect(addFriend(list, card({ pk: ME }), null)).toMatchObject({ ok: true });
  });

  it("is the key that makes a friend, not the name: the same name with another key is another friend", () => {
    const out = addFriend([friend({ pk: A, name: "Mai" })], card({ pk: B, name: "Mai" }), ME);
    expect(out).toMatchObject({ ok: true, replaced: false });
    if (out.ok) expect(out.friends).toHaveLength(2);
  });

  it("lets a newer card from the same key replace the older one, in place, keeping the last visit", () => {
    const list = [friend({ pk: A, date: "2026-10-26", week: "2026-W44", weekDone: 2, lastVisit: 12345 }), friend({ pk: B })];
    const out = addFriend(list, card({ pk: A, date: TODAY, weekDone: 9, name: "Mai ✨" }), ME);
    expect(out).toMatchObject({ ok: true, replaced: true });
    if (!out.ok) return;
    expect(keys(out.friends)).toEqual([A, B]);
    expect(out.friends[0]).toMatchObject({ name: "Mai ✨", date: TODAY, weekDone: 9, lastVisit: 12345 });
  });

  it("takes a card from the same day too (the last one pasted is the freshest we can tell)", () => {
    const list = [friend({ weekDone: 3 })];
    const out = addFriend(list, card({ weekDone: 8 }), ME);
    expect(out).toMatchObject({ ok: true, replaced: true });
    if (out.ok) expect(out.friends[0].weekDone).toBe(8);
  });

  it("keeps the newer card when an older one is pasted, and says so kindly, without repeating a name", () => {
    setLang("en");
    const list = [friend({ date: TODAY })];
    const out = addFriend(list, card({ date: "2026-10-25", week: "2026-W43", name: "Mai" }), ME);
    expect(out).toMatchObject({ ok: false, error: "older" });
    if (!out.ok) {
      expect(out.message).toMatch(/newer card/);
      expect(out.message).not.toContain("Mai");
    }
  });

  it("holds 12 friends and no more", () => {
    setLang("en");
    const twelve = Array.from({ length: MAX_FRIENDS }, (_, i) => friend({ pk: keyOf(i) }));
    expect(twelve).toHaveLength(12);
    const out = addFriend(twelve, card({ pk: keyOf("extra") }), ME);
    expect(out).toMatchObject({ ok: false, error: "full" });
    if (!out.ok) expect(out.message).toMatch(/12/);
    // A friend you already have can still send a newer card when the list is full.
    const again = addFriend(twelve, card({ pk: keyOf(3), weekDone: 40 }), ME);
    expect(again).toMatchObject({ ok: true, replaced: true });
    if (again.ok) expect(again.friends).toHaveLength(12);
    // Room again after a removal.
    expect(addFriend(removeFriend(twelve, keyOf(3)), card({ pk: keyOf("extra") }), ME)).toMatchObject({ ok: true });
  });

  it("refuses one of my own older cards, from before a new card identity, kindly (v0.6 evaluation, issue 5)", () => {
    setLang("en");
    const OLD = keyOf("my-old-key");
    const list = [friend({ pk: A })];
    const out = addFriend(list, card({ pk: OLD, name: "Mochi" }), ME, [OLD]);
    expect(out).toMatchObject({ ok: false, error: "former" });
    if (!out.ok) {
      expect(out.message).toContain("That's one of your own older cards");
      expect(out.message).not.toContain("Mochi");
    }
    expect(list).toHaveLength(1);
    setLang("vi");
    const vi = addFriend(list, card({ pk: OLD }), ME, [OLD]);
    setLang("en");
    expect(vi.ok ? "" : vi.message).toMatch(/thẻ cũ/);
    // Anyone else is still a friend, and with no older keys nothing is refused.
    expect(addFriend(list, card({ pk: B }), ME, [OLD])).toMatchObject({ ok: true });
    expect(addFriend(list, card({ pk: OLD }), ME, [])).toMatchObject({ ok: true });
    expect(addFriend(list, card({ pk: OLD }), ME)).toMatchObject({ ok: true });
    // It is refused even when this PC's current key can't be read.
    expect(addFriend(list, card({ pk: OLD }), null, [OLD])).toMatchObject({ ok: false, error: "former" });
    // My current key is still "your own card".
    expect(addFriend(list, card({ pk: ME }), ME, [OLD])).toMatchObject({ ok: false, error: "self" });
  });

  it("never changes the list it was given", () => {
    const list = Object.freeze([Object.freeze(friend())]);
    expect(() => addFriend(list, card({ pk: B }), ME)).not.toThrow();
    expect(() => removeFriend(list, list[0].pk)).not.toThrow();
    expect(list).toHaveLength(1);
  });

  it("removes a friend by key, and leaves the others alone", () => {
    const list = [friend({ pk: A }), friend({ pk: B })];
    expect(keys(removeFriend(list, A))).toEqual([B]);
    expect(keys(removeFriend(list, keyOf("nobody")))).toEqual(keys(list));
  });
});

describe("the stored friends document", () => {
  const friend = (patch: Partial<Friend> = {}): Friend => ({ ...card(), lastVisit: null, ...patch });
  const NOW = new Date(2026, 9, 29, 10, 0).getTime();
  const read = (raw: unknown, mine: string | null = ME, now = NOW) => docFromJson(raw, mine, now);

  it("starts empty when there is nothing, or nothing usable", () => {
    for (const nothing of [null, undefined, "x", 5, [], {}]) {
      expect(read(nothing)).toEqual({ friends: [], visits: { day: "", count: 0, lastAt: null }, oldKeys: [] });
    }
  });

  it("has no install id any more: the key from the backend is the identity", () => {
    const doc = read({ installId: "my-install-id-0001", friends: [friend()] });
    expect(doc).not.toHaveProperty("installId");
    expect(docToJson(doc)).not.toHaveProperty("installId");
  });

  it("round-trips what it saved", () => {
    const doc = { friends: [friend({ lastVisit: 99 }), friend({ pk: keyOf("b"), name: "Bin" })], visits: { day: TODAY, count: 1, lastAt: 1234 }, oldKeys: [keyOf("old-1"), keyOf("old-2")] };
    expect(read(JSON.parse(JSON.stringify(docToJson(doc))))).toEqual(doc);
  });

  it("remembers my older card identities, at most 10, newest last, and only real keys (v0.6 evaluation, issue 5)", () => {
    const OLDER = Array.from({ length: 14 }, (_, i) => keyOf(`old-${i}`));
    expect(MAX_OLD_KEYS).toBe(10);
    // Read back: junk and repeats are dropped, and the newest 10 stay.
    const doc = read({ friends: [], oldKeys: [...OLDER, OLDER[13], "short", 5, null, { pk: OLDER[0] }] });
    expect(doc.oldKeys).toEqual(OLDER.slice(4));
    expect(doc.oldKeys).toHaveLength(10);
    expect(read({ friends: [], oldKeys: "nope" }).oldKeys).toEqual([]);
    expect(read({ friends: [] }).oldKeys).toEqual([]);
    // Written out as plain JSON.
    expect(docToJson(doc)).toMatchObject({ oldKeys: OLDER.slice(4) });
    expect(read(JSON.parse(JSON.stringify(docToJson(doc))))).toEqual(doc);
  });

  it("retires a key into the document: newest last, no repeats, never more than 10, the document it was given untouched", () => {
    let doc = read({ friends: [] });
    const first = doc;
    for (let i = 0; i < 12; i++) doc = retireKey(doc, keyOf(`k-${i}`));
    expect(doc.oldKeys).toEqual(Array.from({ length: 10 }, (_, i) => keyOf(`k-${i + 2}`)));
    expect(first.oldKeys).toEqual([]);
    // The same key again moves to the end instead of repeating.
    expect(retireKey(doc, keyOf("k-5")).oldKeys.at(-1)).toBe(keyOf("k-5"));
    expect(retireKey(doc, keyOf("k-5")).oldKeys).toHaveLength(10);
    // Something that isn't a key is not remembered.
    expect(retireKey(doc, "nope")).toBe(doc);
  });

  it("drops a stored friend whose key is one of my older ones", () => {
    const OLD = keyOf("my-old");
    const doc = read({ friends: [friend({ pk: OLD, name: "Mochi" }), friend({ pk: keyOf("b"), name: "Bin" })], oldKeys: [OLD] });
    expect(doc.friends.map((f) => f.name)).toEqual(["Bin"]);
  });

  it("drops stored friends that no longer hold up: damaged, repeated or ourselves", () => {
    const many = Array.from({ length: 8 }, (_, i) => friend({ pk: keyOf(i) }));
    const stored = {
      friends: [
        ...many,
        { ...friend({ pk: keyOf("broken-1") }), species: "dinosaur" },
        { ...friend({ pk: keyOf("broken-2") }), history: "nope" },
        // A friend stored by the format before signatures: an id, streaks, and no key.
        { ...friend(), pk: undefined, id: "friend-mai-0001", streak: 3, best: 5 },
        friend({ pk: ME }),
        "not an object",
        null,
      ],
    };
    expect(read(stored).friends.map((f) => f.pk)).toEqual(many.map((f) => f.pk));
    // The same friend twice: the newer card stays.
    const twice = read({ friends: [friend({ pk: keyOf("a"), date: "2026-10-20", week: "2026-W43" }), friend({ pk: keyOf("a"), date: TODAY })] });
    expect(twice.friends).toHaveLength(1);
    expect(twice.friends[0].date).toBe(TODAY);
    // Without a key of my own there is no "ourselves" to drop.
    expect(read({ friends: [friend({ pk: ME })] }, null).friends).toHaveLength(1);
  });

  it("looks only at the first 12 entries, however many the file has (a huge file costs nothing)", () => {
    const many = Array.from({ length: 5000 }, (_, i) => friend({ pk: keyOf(i) }));
    const t0 = performance.now();
    const doc = read({ friends: many });
    expect(performance.now() - t0).toBeLessThan(500);
    expect(doc.friends.map((f) => f.pk)).toEqual(many.slice(0, MAX_FRIENDS).map((f) => f.pk));
    // Entries past the 12th are never read, even when the first are bad: the list is whatever the first 12 hold.
    const mixed = [...Array.from({ length: 12 }, () => "junk"), friend({ pk: keyOf("late") })];
    expect(read({ friends: mixed }).friends).toEqual([]);
    // A friend with a toxic getter beyond the 12th is never touched.
    const trap = Object.defineProperty({}, "pk", {
      get() {
        throw new Error("read past the 12th");
      },
      enumerable: true,
    });
    expect(() => read({ friends: [...Array.from({ length: 12 }, () => null), trap] })).not.toThrow();
  });

  it("does not lose a friend whose card is dated ahead of a clock that was set back", () => {
    const doc = read({ friends: [friend({ date: "2026-12-30", week: "2026-W53" })] });
    expect(doc.friends).toHaveLength(1);
  });

  it("reads a friend without a last visit as never visited, and ignores nonsense there", () => {
    const f = { ...friend() } as Record<string, unknown>;
    delete f.lastVisit;
    expect(read({ friends: [f] }).friends[0].lastVisit).toBeNull();
    expect(read({ friends: [{ ...f, lastVisit: "yesterday" }] }).friends[0].lastVisit).toBeNull();
    expect(read({ friends: [{ ...f, lastVisit: Number.POSITIVE_INFINITY }] }).friends[0].lastVisit).toBeNull();
  });

  it("never believes a time in the future: a last visit or last visit-time past now is brought back to now", () => {
    const future = NOW + 90 * 86_400_000;
    const doc = read({ friends: [friend({ lastVisit: future }), friend({ pk: keyOf("b"), lastVisit: NOW - 5000 })], visits: { day: TODAY, count: 1, lastAt: future } });
    expect(doc.friends.map((f) => f.lastVisit)).toEqual([NOW, NOW - 5000]);
    expect(doc.visits.lastAt).toBe(NOW);
    expect(read({ friends: [], visits: { day: TODAY, count: 1, lastAt: 1e300 } }).visits.lastAt).toBe(NOW);
    expect(read({ friends: [friend({ lastVisit: -50 })] }).friends[0].lastVisit).toBe(0);
  });

  it("reads a damaged visit log as no visits today", () => {
    for (const visits of [null, 5, { day: "someday", count: 9, lastAt: "x" }, { day: TODAY, count: -4, lastAt: null }, { day: TODAY, count: 1e9 }]) {
      const doc = read({ friends: [], visits });
      expect(doc.visits.count).toBeGreaterThanOrEqual(0);
      expect(doc.visits.count).toBeLessThanOrEqual(100);
      expect(doc.visits.lastAt === null || Number.isFinite(doc.visits.lastAt)).toBe(true);
      if (!visits || typeof visits !== "object" || (visits as { day?: string }).day === "someday") expect(doc.visits.day).toBe("");
    }
  });
});

describe("the ISO week", () => {
  it("numbers weeks from Monday, as the card says", () => {
    expect(isoWeekKey("2026-10-29")).toBe("2026-W44");
    expect(isoWeekKey("2026-10-26")).toBe("2026-W44"); // Monday
    expect(isoWeekKey("2026-11-01")).toBe("2026-W44"); // Sunday
    expect(isoWeekKey("2026-11-02")).toBe("2026-W45"); // the next Monday
    expect(isoWeekKey(new Date(2026, 9, 29, 23, 59))).toBe("2026-W44");
  });

  it("gets the year ends right: week 1 holds the year's first Thursday", () => {
    expect(isoWeekKey("2026-01-01")).toBe("2026-W01");
    expect(isoWeekKey("2025-12-29")).toBe("2026-W01");
    expect(isoWeekKey("2025-12-28")).toBe("2025-W52");
    expect(isoWeekKey("2026-12-31")).toBe("2026-W53");
    expect(isoWeekKey("2027-01-01")).toBe("2026-W53");
    expect(isoWeekKey("2027-01-03")).toBe("2026-W53");
    expect(isoWeekKey("2027-01-04")).toBe("2027-W01");
    expect(isoWeekKey("2024-12-30")).toBe("2025-W01");
    expect(isoWeekKey("2021-01-03")).toBe("2020-W53");
    expect(isoWeekKey("2016-01-03")).toBe("2015-W53");
  });

  it("changes exactly when the pet's own weeks (Monday to Sunday) turn", () => {
    let day = "2025-12-01";
    for (let i = 0; i < 800; i++) {
      const next = addDays(day, 1);
      expect(isoWeekKey(next) !== isoWeekKey(day)).toBe(mondayOf(next) !== mondayOf(day));
      day = next;
    }
  });

  it("is empty for something that is not a day", () => {
    expect(isoWeekKey("")).toBe("");
    expect(isoWeekKey("2026-02-30")).toBe("");
    expect(isoWeekKey(new Date(Number.NaN))).toBe("");
  });

  it("counts this week's finished tasks only while the pet's week is this one", () => {
    expect(weekDoneOf({ key: "2026-10-26", done: 7 }, "2026-10-29")).toBe(7);
    expect(weekDoneOf({ key: "2026-10-26", done: 7 }, "2026-11-01")).toBe(7); // Sunday
    expect(weekDoneOf({ key: "2026-10-26", done: 7 }, "2026-11-02")).toBe(0); // Monday: a new week, not yet turned in the pet's life
    expect(weekDoneOf({ key: "", done: 3 }, "2026-10-29")).toBe(0);
  });
});

describe("the day record on a card", () => {
  const always = () => true;
  it("marks today live, and fills the days the app didn't settle: a workday is '-', a day off is 'R'", () => {
    const weekend = (d: string) => ![0, 6].includes(new Date(`${d}T12:00:00`).getDay());
    const h = cardHistory({}, TODAY, "G", weekend);
    expect(h).toHaveLength(28);
    expect(h.endsWith("G")).toBe(true);
    // The 24th and 25th are a Saturday and a Sunday: 5 and 4 days before Thursday the 29th.
    expect(h[27 - 5]).toBe("R");
    expect(h[27 - 4]).toBe("R");
    expect(h[27 - 1]).toBe("-");
  });

  it("uses what was settled over the default, and leaves out days older than 28", () => {
    const h = cardHistory({ "2026-10-28": "G", "2026-10-27": "K", "2026-10-26": "R", "2026-10-01": "G", "2026-09-30": "G", "2026-09-01": "G" }, TODAY, "-", always);
    // The pet remembers a kept day ('K'); the card says nothing about it ('-').
    expect(h.slice(-4)).toBe("R-G-");
    expect(h).toHaveLength(28);
    // 28 days ending 29 Oct start on 2 Oct: the 1st is just outside.
    expect(h[0]).toBe("-");
    expect(cardHistory({ "2026-10-02": "G" }, TODAY, "-", always)[0]).toBe("G");
  });

  it("publishes a kept day, and a kept today, as '-': a card only says goal, rest or nothing", () => {
    const h = cardHistory({ "2026-10-28": "K", "2026-10-27": "K", "2026-10-26": "G" }, TODAY, "K", always);
    expect(h.slice(-4)).toBe("G--" + "-");
    expect(h).not.toMatch(/K/);
    expect(h).toMatch(/^[GR-]{28}$/);
  });

  it("ignores marks it doesn't know", () => {
    const h = cardHistory({ "2026-10-28": "X" as never }, TODAY, "-", always);
    expect(h[26]).toBe("-");
  });

  it("marks today from the count: the goal met, kept, a day off, or nothing yet", () => {
    expect(todayMark(3, 3, true)).toBe("G");
    expect(todayMark(5, 3, true)).toBe("G");
    expect(todayMark(2, 3, true)).toBe("K");
    expect(todayMark(1, 3, false)).toBe("K");
    expect(todayMark(0, 3, false)).toBe("R");
    expect(todayMark(0, 3, true)).toBe("-");
    // No target: a finished task still keeps the day, and is not a "goal".
    expect(todayMark(2, 0, true)).toBe("K");
  });
});

describe("the buddy streak", () => {
  /** A 28-day record that ends with `tail` (oldest first) and is '-' before it. */
  const h = (tail: string) => tail.padStart(28, "-");
  const side = (tail: string, date = TODAY) => ({ history: h(tail), date });

  it("counts the days both reached their goal, back from the latest day both cover", () => {
    expect(buddyStreak(side("GGGG"), side("GGGG"))).toBe(4);
    expect(buddyStreak(side("GG"), side("GG"))).toBe(2);
  });

  it("is zero with no goal days in common", () => {
    expect(buddyStreak(side("RRRR"), side("RRRR"))).toBe(0);
    expect(buddyStreak(side("GGGG"), side("----"))).toBe(0);
    expect(buddyStreak(side("----"), side("GGGG"))).toBe(0);
  });

  it("does not count a day one of you hit the goal and the other did less", () => {
    // Today is still open, so the '-' does not end it; yesterday (closed) does.
    expect(buddyStreak(side("GGGG"), side("GG-G"))).toBe(1);
  });

  it("skips a day either of you rested, without breaking and without adding", () => {
    expect(buddyStreak(side("GGRGG"), side("GGGGG"))).toBe(4);
    expect(buddyStreak(side("GGGGG"), side("GGRGG"))).toBe(4);
    expect(buddyStreak(side("GRRRRG"), side("GRGRRG"))).toBe(2);
    // Both resting is a rest too.
    expect(buddyStreak(side("GRRG"), side("GRRG"))).toBe(2);
  });

  it("ends at a closed day when either of you missed the goal or did nothing", () => {
    expect(buddyStreak(side("GG-GG"), side("GGGGG"))).toBe(2);
    expect(buddyStreak(side("GG-GG"), side("GGGGG"))).toBe(2);
    expect(buddyStreak(side("GGGGG"), side("GG-GG"))).toBe(2);
    // The break stays a break however far back the good days go.
    expect(buddyStreak(side("GGGGGGG-GG"), side("GGGGGGGGGG"))).toBe(2);
  });

  it("does not let today end it while today is still open, nor count it unless both hit the goal", () => {
    expect(buddyStreak(side("GGG-"), side("GGG-"))).toBe(3);
    expect(buddyStreak(side("GGGR"), side("GGG-"))).toBe(3);
    expect(buddyStreak(side("GGGG"), side("GGG-"))).toBe(3);
  });

  it("starts from the latest day both cards cover when their dates differ, and ignores the days after", () => {
    // Mine is today; the friend's card is two days old: the days since are not in it.
    expect(buddyStreak(side("GGGGGG"), side("GGGG", addDays(TODAY, -2)))).toBe(4);
    // And the same the other way round.
    expect(buddyStreak(side("GGGG", addDays(TODAY, -2)), side("GGGGGG"))).toBe(4);
  });

  it("lines the days up by date, not by position", () => {
    // Friend (two days old) G G G on the 25th..27th; me: nothing on the 25th, G on the 26th and 27th, then more.
    const mine = side("-GGGG"); // 25 -, 26 G, 27 G, 28 G, 29 G
    const theirs = side("GGG", addDays(TODAY, -2)); // 25 G, 26 G, 27 G
    expect(buddyStreak(mine, theirs)).toBe(2);
  });

  it("treats the older card's own last day as still open, but a closed day of the other card is final", () => {
    // The friend's card was made in the morning of the 27th with nothing done yet ('-'); I had the goal that day.
    expect(buddyStreak(side("GGGGGG"), side("GGG-", addDays(TODAY, -2)))).toBe(3);
    // I had not (closed, "-"): that day ends it whatever the friend did later.
    expect(buddyStreak(side("GG-GG"), side("GGGG", addDays(TODAY, -2)))).toBe(0);
  });

  it("is the same from either side", () => {
    const pairs: [string, string, number][] = [
      ["GGRG-GG", "GGGG-GG", 2],
      ["G-GG", "GGGG", 2],
      ["RRRG", "GGGG", 1],
    ];
    for (const [x, y, shift] of pairs) {
      const a = side(x);
      const b = side(y, addDays(TODAY, -shift));
      expect(buddyStreak(a, b)).toBe(buddyStreak(b, a));
    }
  });

  it("can reach the 28 days a card holds, and no more", () => {
    expect(buddyStreak(side("G".repeat(28)), side("G".repeat(28)))).toBe(28);
  });

  it("has nothing in common with a card made a month ago or more", () => {
    expect(buddyStreak(side("G".repeat(28)), side("G".repeat(28), addDays(TODAY, -28)))).toBe(0);
    expect(buddyStreak(side("G".repeat(28)), side("G".repeat(28), addDays(TODAY, -60)))).toBe(0);
    // 27 days apart they share exactly one day.
    expect(buddyStreak(side("G".repeat(28)), side("G".repeat(28), addDays(TODAY, -27)))).toBe(1);
  });

  it("is 0, and never throws, for a record or date that isn't one", () => {
    expect(buddyStreak({ history: "GGG", date: TODAY }, side("GGGG"))).toBe(0);
    expect(buddyStreak(side("GGGG"), { history: h("GGGG"), date: "soon" })).toBe(0);
    expect(buddyStreak({ history: undefined as never, date: TODAY }, side("GGGG"))).toBe(0);
  });
});

describe("the weekly boss", () => {
  const friend = (patch: Partial<Friend> = {}): Friend => ({ ...card(), lastVisit: null, ...patch });
  const boss = (myDone: number, friends: Friend[], today = TODAY) => bossOf({ today, myDone, friends });

  it("has 15 HP for each member: you, and every friend with a card from this week", () => {
    expect(BOSS_HP_PER_MEMBER).toBe(15);
    expect(boss(0, []).maxHp).toBe(15);
    expect(boss(0, [friend()]).maxHp).toBe(30);
    expect(boss(0, [friend(), friend({ pk: keyOf("b") }), friend({ pk: keyOf("c") })]).maxHp).toBe(60);
  });

  it("counts only friends whose latest card is from this ISO week", () => {
    const lastWeek = friend({ pk: keyOf("old"), date: "2026-10-25", week: "2026-W43", weekDone: 40 });
    const thisWeek = friend({ pk: keyOf("new"), date: "2026-10-26", week: "2026-W44", weekDone: 5 });
    const b = boss(2, [lastWeek, thisWeek]);
    expect(b.members.map((m) => m.id)).toEqual(["me", keyOf("new")]);
    expect(b.maxHp).toBe(30);
    expect(b.damage).toBe(7); // 2 mine + 5, not the 40 from last week's card
    expect(b.waiting).toBe(1);
  });

  it("takes your own tasks live and each friend's tasks from their latest card", () => {
    const b = boss(4, [friend({ weekDone: 9 }), friend({ pk: keyOf("b"), weekDone: 3 })]);
    expect(b.damage).toBe(16);
    expect(b.hp).toBe(45 - 16);
    expect(b.defeated).toBe(false);
    expect(b.members.map((m) => [m.me, m.done])).toEqual([
      [true, 4],
      [false, 9],
      [false, 3],
    ]);
  });

  it("lists you first, then the friends who did the most", () => {
    const b = boss(1, [friend({ pk: keyOf("a"), name: "A", weekDone: 2 }), friend({ pk: keyOf("b"), name: "B", weekDone: 8 })]);
    expect(b.members.map((m) => m.name === "A" || m.name === "B" ? m.name : "me")).toEqual(["me", "B", "A"]);
  });

  it("is beaten when the damage reaches the HP, together, and never goes below 0", () => {
    // Two members: 30 HP, 15 each at most.
    expect(boss(14, [friend({ weekDone: 15 })]).defeated).toBe(false);
    expect(boss(14, [friend({ weekDone: 15 })]).hp).toBe(1);
    const won = boss(15, [friend({ weekDone: 15 })]);
    expect(won).toMatchObject({ hp: 0, defeated: true, damage: 30 });
    const over = boss(40, [friend({ weekDone: 100 })]);
    expect(over).toMatchObject({ hp: 0, defeated: true, damage: 30 });
    // Alone it is 15.
    expect(boss(15, []).defeated).toBe(true);
    expect(boss(14, []).defeated).toBe(false);
  });

  // v0.6 evaluation, issue 4: a card that says 999 tasks beat the blob on its own and paid the receiver +50 XP and a 🏅.
  it("counts each person for their share at most, 15: one big number can't win alone (v0.6 evaluation, issue 4)", () => {
    expect(boss(0, [friend({ weekDone: 999 })])).toMatchObject({ damage: 15, hp: 15, maxHp: 30, defeated: false });
    // Three members, one huge card: 15 of 45.
    const three = boss(0, [friend({ weekDone: 999 }), friend({ pk: keyOf("b"), weekDone: 0 })]);
    expect(three).toMatchObject({ damage: 15, hp: 30, defeated: false });
    // Everyone has to bring their share.
    expect(boss(15, [friend({ weekDone: 999 }), friend({ pk: keyOf("b"), weekDone: 14 })]).defeated).toBe(false);
    expect(boss(15, [friend({ weekDone: 999 }), friend({ pk: keyOf("b"), weekDone: 15 })])).toMatchObject({ defeated: true, hp: 0, damage: 45 });
    // Your own live count is capped the same way: 99 of your own tasks don't pay for a friend who did nothing.
    expect(boss(99, [friend({ weekDone: 0 })])).toMatchObject({ damage: 15, hp: 15, defeated: false });
    expect(boss(99, [])).toMatchObject({ damage: 15, hp: 0, defeated: true });
  });

  it("still shows the real count of each person, and what it counted for", () => {
    const b = boss(40, [friend({ weekDone: 999 }), friend({ pk: keyOf("b"), weekDone: 3 })]);
    expect(b.members.map((m) => [m.done, m.counted])).toEqual([
      [40, 15],
      [999, 15],
      [3, 3],
    ]);
  });

  it("gets bigger when a friend joins, and a friend leaving takes their share with them", () => {
    const mine = 14;
    expect(boss(mine, []).defeated).toBe(false);
    expect(boss(mine + 1, []).defeated).toBe(true);
    // A friend with 0 tasks makes it 30 HP: harder; the win has to be reached together.
    expect(boss(mine + 1, [friend({ weekDone: 0 })]).defeated).toBe(false);
  });

  it("starts over on Monday: last week's cards and tasks don't count", () => {
    const monday = "2026-11-02";
    const friends = [friend({ date: "2026-11-01", week: "2026-W44", weekDone: 30 })];
    // On Sunday it is still W44, on Monday it is a new blob.
    expect(boss(0, friends, "2026-11-01")).toMatchObject({ week: "2026-W44", maxHp: 30, damage: 15, hp: 15, defeated: false });
    expect(boss(15, friends, "2026-11-01")).toMatchObject({ week: "2026-W44", maxHp: 30, damage: 30, hp: 0, defeated: true });
    expect(boss(0, friends, monday)).toMatchObject({ week: "2026-W45", maxHp: 15, damage: 0, hp: 15, defeated: false, waiting: 1 });
  });

  it("takes a friend's new card on Monday as the new week's first damage", () => {
    const fresh = friend({ date: "2026-11-02", week: "2026-W45", weekDone: 2 });
    expect(boss(1, [fresh], "2026-11-02")).toMatchObject({ maxHp: 30, damage: 3 });
  });

  it("names you in the language of the app", () => {
    setLang("vi");
    const vi = boss(1, []).members[0].name;
    setLang("en");
    expect(vi).toBe("Bạn");
    expect(boss(1, []).members[0].name).toBe("You");
  });
});


describe("friends who share a name (v0.6 evaluation, issue 3)", () => {
  const f = (pk: string, name: string): Pick<Friend, "pk" | "name"> => ({ pk, name });

  it("gives a short tag from the public key: '#' and 3 letters or digits, the same every time", () => {
    expect(pkTag(MAI)).toMatch(/^#[0-9a-f]{3}$/);
    expect(pkTag(MAI)).toBe(pkTag(MAI));
    expect(pkTag(MAI, 5)).toMatch(/^#[0-9a-f]{5}$/);
    expect(pkTag(MAI, 5).startsWith(pkTag(MAI))).toBe(true);
    // Spread out, not one value.
    expect(new Set(Array.from({ length: 200 }, (_, i) => pkTag(keyOf(i)))).size).toBeGreaterThan(150);
  });

  it("tags nobody whose name is the only one", () => {
    expect(sameNameTags([])).toEqual({});
    expect(sameNameTags([f(keyOf(1), "Mai")])).toEqual({});
    expect(sameNameTags([f(keyOf(1), "Mai"), f(keyOf(2), "Bin"), f(keyOf(3), "Cát")])).toEqual({});
  });

  it("tags every friend of a name that two or more share, each differently, and no one else", () => {
    const tags = sameNameTags([f(keyOf(1), "Mai"), f(keyOf(2), "Bin"), f(keyOf(3), "Mai"), f(keyOf(4), "Mai")]);
    expect(Object.keys(tags).sort()).toEqual([keyOf(1), keyOf(3), keyOf(4)].sort());
    expect(tags[keyOf(1)]).toBe(pkTag(keyOf(1)));
    expect(new Set(Object.values(tags)).size).toBe(3);
    expect(tags[keyOf(2)]).toBeUndefined();
  });

  it("is stable: the same friend keeps the tag in any order, and whoever else joins a different name", () => {
    const a = sameNameTags([f(keyOf(1), "Mai"), f(keyOf(2), "Mai")]);
    const b = sameNameTags([f(keyOf(2), "Mai"), f(keyOf(9), "Zed"), f(keyOf(1), "Mai")]);
    expect(b).toEqual(a);
    expect(sameNameTags([f(keyOf(1), "Mai"), f(keyOf(2), "Mai"), f(keyOf(5), "Mai")])[keyOf(1)]).toBe(a[keyOf(1)]);
  });

  it("compares names the way 'passes for mine' does: case, fullwidth letters, accents and joiners aside", () => {
    expect(looksLikeMe("Ｍａｉ", "mai")).toBe(true);
    const tags = sameNameTags([f(keyOf(1), "Mai"), f(keyOf(2), "MAI"), f(keyOf(3), "Ｍａｉ"), f(keyOf(4), "Mài"), f(keyOf(5), "Bin")]);
    expect(Object.keys(tags)).toHaveLength(4);
    expect(tags[keyOf(5)]).toBeUndefined();
    // A name that folds to nothing is not "the same" as another that does.
    expect(sameNameTags([f(keyOf(1), "\u0301"), f(keyOf(2), "\u0301\u0302")])).toEqual({});
  });

  it("tells apart two tags that would be equal by making them longer, for that name only", () => {
    const seen = new Map<string, string>();
    let pair: [string, string] | null = null;
    for (let i = 0; i < 20_000 && !pair; i++) {
      const pk = keyOf(`c-${i}`);
      const tag = pkTag(pk);
      const other = seen.get(tag);
      if (other) pair = [other, pk];
      else seen.set(tag, pk);
    }
    expect(pair).not.toBeNull();
    const [p, q] = pair!;
    const tags = sameNameTags([f(p, "Mai"), f(q, "Mai"), f(keyOf(1), "Bin"), f(keyOf(2), "Bin")]);
    expect(tags[p]).not.toBe(tags[q]);
    expect(tags[p].length).toBeGreaterThan(4);
    expect(tags[p]).toBe(pkTag(p, tags[p].length - 1));
    // The other name keeps its short tags.
    expect(tags[keyOf(1)]).toHaveLength(4);
  });

  it("writes the name with its tag: 'Mai · #a3f'", () => {
    expect(withTag("Mai", pkTag(MAI))).toBe(`Mai · ${pkTag(MAI)}`);
    expect(withTag("Mai", undefined)).toBe("Mai");
    expect(withTag("Mai", null)).toBe("Mai");
  });

  it("puts the tag on the boss's helpers too, for friends who share a name, even one whose card is waiting", () => {
    const g = (pk: string, patch: Partial<Friend> = {}): Friend => ({ ...card(), pk, lastVisit: null, ...patch });
    const waiting = g(keyOf("w"), { date: "2026-10-10", week: "2026-W42" });
    const b = bossOf({ today: TODAY, myDone: 1, friends: [g(keyOf("x"), { weekDone: 3 }), g(keyOf("y"), { weekDone: 7 }), waiting, g(keyOf("z"), { name: "Bin", weekDone: 1 })] });
    expect(b.members.map((m) => [m.name, m.tag])).toEqual([
      ["You", null],
      ["Mai", pkTag(keyOf("y"))],
      ["Mai", pkTag(keyOf("x"))],
      ["Bin", null],
    ]);
  });
});

describe("visits", () => {
  const friend = (patch: Partial<Friend> = {}): Friend => ({ ...card(), lastVisit: null, ...patch });
  const NOW = new Date(2026, 9, 29, 10, 0).getTime();
  const noLog = { day: "", count: 0, lastAt: null };
  const pick = (patch: Partial<Parameters<typeof pickVisitor>[0]> = {}, random = () => 0.5) =>
    pickVisitor({ friends: [friend()], today: TODAY, now: NOW, log: noLog, calm: calmMoment(), ...patch }, random);

  it("comes from a friend whose card is at most 7 days old", () => {
    expect(canVisit(friend({ date: TODAY }), TODAY)).toBe(true);
    expect(canVisit(friend({ date: addDays(TODAY, -7) }), TODAY)).toBe(true);
    expect(canVisit(friend({ date: addDays(TODAY, -8) }), TODAY)).toBe(false);
    expect(canVisit(friend({ date: addDays(TODAY, -60) }), TODAY)).toBe(false);
    // A card from a friend a time zone ahead.
    expect(canVisit(friend({ date: addDays(TODAY, 1) }), TODAY)).toBe(true);
    expect(pick({ friends: [friend({ date: addDays(TODAY, -8) })] })).toBeNull();
    expect(pick({ friends: [friend({ date: addDays(TODAY, -7) })] })).not.toBeNull();
  });

  it("is at most 2 a day, whoever comes", () => {
    expect(MAX_VISITS_PER_DAY).toBe(2);
    expect(pick({ log: { day: TODAY, count: 1, lastAt: NOW - VISIT_GAP_MS - 1 } })).not.toBeNull();
    expect(pick({ log: { day: TODAY, count: 2, lastAt: NOW - 10 * VISIT_GAP_MS } })).toBeNull();
    expect(pick({ log: { day: TODAY, count: 7, lastAt: NOW - 10 * VISIT_GAP_MS } })).toBeNull();
    // Yesterday's visits are not today's.
    expect(pick({ log: { day: addDays(TODAY, -1), count: 2, lastAt: NOW - 20 * 3_600_000 } })).not.toBeNull();
  });

  it("leaves a gap between two visits", () => {
    expect(pick({ log: { day: TODAY, count: 1, lastAt: NOW - VISIT_GAP_MS + 1 } })).toBeNull();
    expect(pick({ log: { day: TODAY, count: 1, lastAt: NOW - VISIT_GAP_MS } })).not.toBeNull();
    // A clock that went back leaves a last visit in the future: that is long enough ago, not a visit that never ends.
    expect(pick({ log: { day: TODAY, count: 1, lastAt: NOW + 60_000 } })).not.toBeNull();
    expect(pick({ log: { day: TODAY, count: 1, lastAt: NOW + 30 * 86_400_000 } })).not.toBeNull();
    expect(pick({ log: { day: TODAY, count: 1, lastAt: 1e300 } })).not.toBeNull();
    // The day's two visits are still the day's two.
    expect(pick({ log: { day: TODAY, count: 2, lastAt: NOW + 60_000 } })).toBeNull();
  });

  it("needs a calm moment: each thing that is not calm stops it", () => {
    expect(pick()).not.toBeNull();
    const notCalm = [
      "typing",
      "focusing",
      "inMeeting",
      "doneForToday",
      "quiet",
      "hidden",
      "fullscreen",
      "away",
      "sleeping",
      "onTrip",
      "bubble",
      "boardOpen",
      "mischief",
      "inCall",
    ] as const;
    for (const what of notCalm) expect(pick({ calm: calmMoment({ [what]: true }) }), what).toBeNull();
    expect(pick({ calm: calmMoment({ typing: true, quiet: true }) })).toBeNull();
  });

  it("picks the friend who visited longest ago, a friend who never has first", () => {
    const a = friend({ pk: keyOf("a"), lastVisit: NOW - 3 * 86_400_000 });
    const b = friend({ pk: keyOf("b"), lastVisit: NOW - 86_400_000 });
    const c = friend({ pk: keyOf("c"), lastVisit: null });
    expect(pick({ friends: [a, b] })?.pk).toBe(keyOf("a"));
    expect(pick({ friends: [b, a] })?.pk).toBe(keyOf("a"));
    expect(pick({ friends: [a, b, c] })?.pk).toBe(keyOf("c"));
  });

  it("does not let a last visit in the future (a clock set back) shut a friend out for good", () => {
    const stuck = friend({ pk: keyOf("a"), lastVisit: NOW + 90 * 86_400_000 });
    const other = friend({ pk: keyOf("b"), lastVisit: NOW - 86_400_000 });
    // Treated as just now: the friend who really visited longest ago comes first, and the stuck one is not stuck.
    expect(pick({ friends: [stuck, other] })?.pk).toBe(keyOf("b"));
    expect(pick({ friends: [stuck] })?.pk).toBe(keyOf("a"));
    expect(pick({ friends: [friend({ pk: keyOf("a"), lastVisit: 1e300 }), other] })?.pk).toBe(keyOf("b"));
  });

  it("breaks a tie with the injected random source, and only among eligible friends", () => {
    const a = friend({ pk: keyOf("a") });
    const b = friend({ pk: keyOf("b") });
    const old = friend({ pk: keyOf("old"), date: addDays(TODAY, -30) });
    expect(pick({ friends: [a, b, old] }, () => 0)?.pk).toBe(keyOf("a"));
    expect(pick({ friends: [a, b, old] }, () => 0.99)?.pk).toBe(keyOf("b"));
    expect(pick({ friends: [old] })).toBeNull();
    expect(pick({ friends: [] })).toBeNull();
  });

  it("is a visit that counts for today and remembers who came", () => {
    const doc = { friends: [friend({ pk: keyOf("a") }), friend({ pk: keyOf("b") })], visits: { day: "", count: 0, lastAt: null }, oldKeys: [] };
    const one = recordVisit(doc, keyOf("b"), NOW, TODAY);
    expect(one.visits).toEqual({ day: TODAY, count: 1, lastAt: NOW });
    expect(one.friends.map((f) => f.lastVisit)).toEqual([null, NOW]);
    const two = recordVisit(one, keyOf("a"), NOW + VISIT_GAP_MS, TODAY);
    expect(two.visits).toEqual({ day: TODAY, count: 2, lastAt: NOW + VISIT_GAP_MS });
    // A new day starts the count again.
    expect(recordVisit(two, keyOf("a"), NOW + 86_400_000, addDays(TODAY, 1)).visits.count).toBe(1);
    // The document it was given is not changed.
    expect(doc.visits.count).toBe(0);
  });

  it("starts a day quietly: the first visit waits 15 to 75 minutes, the same for an install on the same day", () => {
    const delays = new Set<number>();
    for (let i = 0; i < 200; i++) {
      const d = visitDelayMs(keyOf(i), addDays(TODAY, i % 7));
      expect(d).toBeGreaterThanOrEqual(15 * 60_000);
      expect(d).toBeLessThan(75 * 60_000);
      delays.add(d);
    }
    // Spread out, not one number.
    expect(delays.size).toBeGreaterThan(30);
    // Restarting the app doesn't draw a new one.
    expect(visitDelayMs(ME, TODAY)).toBe(visitDelayMs(ME, TODAY));
    expect(visitDelayMs(ME, TODAY)).not.toBe(visitDelayMs(ME, addDays(TODAY, 1)));
  });

  it("labels the visit with the friend's name and the buddy streak, in both languages", () => {
    setLang("en");
    expect(visitLabel("Mai", 4)).toBe("Mai dropped by! 🔥 buddy streak 4");
    expect(visitTail(4)).toBe(" dropped by! 🔥 buddy streak 4");
    expect(visitLabel("Mai", 0)).toBe("Mai dropped by! 👋");
    setLang("vi");
    expect(visitLabel("Mai", 4)).toBe("Mai ghé chơi! 🔥 chuỗi bạn 4 ngày");
    expect(visitLabel("Mai", 0)).toBe("Mai ghé chơi! 👋");
    setLang("en");
  });
});

describe("the boss in words", () => {
  it("says the win kindly, with friends or alone, in both languages", () => {
    setLang("en");
    expect(bossWinText(true)).toMatch(/Everyone wins.*\+50 XP.*🏅/);
    expect(bossWinText(false)).toMatch(/You beat.*\+50 XP.*🏅/);
    setLang("vi");
    expect(bossWinText(true)).toMatch(/\+50 XP.*🏅/);
    expect(bossWinText(false)).toMatch(/\+50 XP.*🏅/);
    setLang("en");
  });
});

describe("the demo's sample friends", () => {
  it("are real cards for any day: they read back, are distinct, and are not from the future", () => {
    for (const today of ["2026-10-29", "2026-11-02", "2027-01-01", "2028-02-29", "2026-03-01"]) {
      const cards = sampleCards(today);
      expect(cards).toHaveLength(2);
      expect(new Set(cards.map((c) => c.pk)).size).toBe(2);
      for (const c of cards) {
        expect(isPublicKey(c.pk)).toBe(true);
        expect(parseCard(textOf(c), today)).toMatchObject({ ok: true, card: c });
      }
    }
  });

  it("have buddy streaks to show against the demo pet's record", () => {
    const mine = { history: cardHistory({ ...demoRecord() }, TODAY, "K", () => true), date: TODAY };
    const [mai, bin] = sampleCards(TODAY);
    expect(buddyStreak(mine, mai)).toBe(3);
    expect(buddyStreak(mine, bin)).toBe(2);
  });
});

/** The demo pet's record as `demoLife` makes it for TODAY. */
function demoRecord(): Record<string, "G" | "K" | "R" | "-"> {
  const marks = ["K", "G", "K", "G", "G", "R", "R", "G", "G", "-", "K", "G", "G", "G"] as const;
  return Object.fromEntries(marks.map((m, i) => [addDays(TODAY, i - marks.length), m]));
}
