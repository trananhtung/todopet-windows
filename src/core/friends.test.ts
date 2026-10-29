// v0.6 "Friends": pet cards, the friend list, the buddy streak, the weekly boss and visits (pure rules).
import { describe, expect, it } from "vitest";
import {
  CARD_PREFIX,
  MAX_CARD_CHARS,
  MAX_FRIENDS,
  BOSS_HP_PER_MEMBER,
  MAX_VISITS_PER_DAY,
  VISIT_GAP_MS,
  addFriend,
  bossOf,
  buddyStreak,
  buildCard,
  calmMoment,
  canVisit,
  cardHistory,
  decodeCard,
  docFromJson,
  docToJson,
  encodeCard,
  isoWeekKey,
  newInstallId,
  pickVisitor,
  recordVisit,
  sampleCards,
  visitDelayMs,
  removeFriend,
  todayMark,
  visitLabel,
  weekDoneOf,
  bossWinText,
  type Friend,
  type PetCard,
} from "./friends";
import { weekKey as mondayOf } from "./chapters";
import { addDays } from "./dates";
import { setLang } from "./l10n";

const TODAY = "2026-10-29"; // a Thursday, ISO week 44

/** 28 characters, oldest first, ending on the card's date. */
const HISTORY = "GGKR--GGGKRRGGKKGGGRRGKGGGGK".slice(0, 28);

function card(patch: Partial<PetCard> = {}): PetCard {
  return {
    id: "friend-mai-0001",
    name: "Mai",
    species: "shiba",
    accessories: ["flowercrown", "scarf"],
    stage: 2,
    streak: 6,
    best: 12,
    week: "2026-W44",
    weekDone: 9,
    history: HISTORY,
    date: TODAY,
    ...patch,
  };
}

const b64url = (s: string) => {
  const bytes = new TextEncoder().encode(s);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};
/** A card text from any JSON, for the malformed ones. */
const raw = (json: unknown) => CARD_PREFIX + b64url(typeof json === "string" ? json : JSON.stringify(json));
/** The fields of a good card as the wire has them, changed by `patch`. */
const wire = (patch: Record<string, unknown> = {}) => ({
  v: 1,
  id: "friend-mai-0001",
  name: "Mai",
  species: "shiba",
  accessories: ["flowercrown", "scarf"],
  stage: 2,
  streak: 6,
  best: 12,
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

describe("pet cards: encoding", () => {
  it("round-trips a card through its text", () => {
    const c = card();
    const text = encodeCard(c);
    expect(text.startsWith("TODOPET1.")).toBe(true);
    expect(text.length).toBeLessThanOrEqual(MAX_CARD_CHARS);
    expect(decodeCard(text, TODAY)).toEqual({ ok: true, card: c });
  });

  it("is URL-safe text: letters, digits, dash and underscore after the prefix, no padding", () => {
    const text = encodeCard(card({ name: "Bánh Bao 🐼" }));
    expect(text.slice(CARD_PREFIX.length)).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("keeps Vietnamese and emoji names intact", () => {
    for (const name of ["Mèo Mướp", "Đậu Phộng", "Bánh Bao 🐼", "かわいい"]) {
      const out = decodeCard(encodeCard(card({ name })), TODAY);
      expect(out).toMatchObject({ ok: true, card: { name } });
    }
  });

  it("keeps an emoji built with the zero-width joiner (the one invisible character a name may hold)", () => {
    const technologist = String.fromCodePoint(0x1f469, 0x200d, 0x1f4bb);
    expect(technologist).toHaveLength(5);
    expect(decodeCard(encodeCard(card({ name: `Mai ${technologist}` })), TODAY)).toMatchObject({ ok: true, card: { name: `Mai ${technologist}` } });
    // My own pet's name keeps it too, and the joiner on its own is nothing.
    expect(buildCard({ ...{ installId: "my-install-id-0001", species: "mochi", wearing: [], stage: 1, streak: 0, bestStreak: 0, weekDone: 0, history: "", today: TODAY }, petName: technologist }).name).toBe(technologist);
    expect(buildCard({ installId: "my-install-id-0001", species: "mochi", wearing: [], stage: 1, streak: 0, bestStreak: 0, weekDone: 0, history: "", today: TODAY, petName: String.fromCodePoint(0x200d) }).name).toBe("Pet");
  });

  it("round-trips the extremes: no accessories, three accessories, every stage", () => {
    expect(decodeCard(encodeCard(card({ accessories: [] })), TODAY)).toMatchObject({ ok: true });
    expect(decodeCard(encodeCard(card({ accessories: ["bow", "heartglasses", "scarf"] })), TODAY)).toMatchObject({ ok: true });
    for (const stage of [0, 1, 2, 3, 4] as const) expect(decodeCard(encodeCard(card({ stage })), TODAY)).toMatchObject({ ok: true, card: { stage } });
  });

  it("stays far under the size cap even with the longest name", () => {
    const longest = card({ name: "😀".repeat(20), accessories: ["bow", "heartglasses", "scarf"], streak: 9999, best: 9999, weekDone: 999 });
    expect(encodeCard(longest).length).toBeLessThan(MAX_CARD_CHARS);
    expect(decodeCard(encodeCard(longest), TODAY)).toMatchObject({ ok: true });
  });

  it("carries nothing but the card's fields (no task titles, times, app names or user name)", () => {
    const json = atob(encodeCard(card()).slice(CARD_PREFIX.length).replace(/-/g, "+").replace(/_/g, "/"));
    expect(Object.keys(JSON.parse(json) as object).sort()).toEqual(
      ["accessories", "best", "date", "history", "id", "name", "species", "stage", "streak", "v", "week", "weekDone"].sort(),
    );
  });

  it("forgives whitespace around the text and inside it (a chat app may wrap a long line)", () => {
    const text = encodeCard(card());
    expect(decodeCard(`  \n${text}\n `, TODAY)).toMatchObject({ ok: true });
    expect(decodeCard(`${text.slice(0, 40)}\n${text.slice(40)}`, TODAY)).toMatchObject({ ok: true });
  });
});

describe("pet cards: every way a pasted card can be wrong gets a kind error and nothing else", () => {
  const fails = (text: string, error: string, today = TODAY) => {
    setLang("en");
    const out = decodeCard(text, today);
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
    expect((decodeCard(atCap, TODAY) as { error: string }).error).not.toBe("tooLong");
  });

  it("prefix: not a card at all, a wrong version, a wrong case", () => {
    fails("hello there", "prefix");
    fails("TODOPET2." + b64url(JSON.stringify(wire())), "prefix");
    fails("todopet1." + b64url(JSON.stringify(wire())), "prefix");
    fails(b64url(JSON.stringify(wire())), "prefix");
    fails("Here is my card: " + encodeCard(card()), "prefix");
  });

  it("bad base64", () => {
    fails(CARD_PREFIX, "encoding");
    fails(CARD_PREFIX + "!!!!", "encoding");
    fails(CARD_PREFIX + "ab cd$", "encoding");
    // Padding and the standard alphabet are not what a card is made of.
    fails(CARD_PREFIX + b64url("{}") + "==", "encoding");
    fails(CARD_PREFIX + btoa(">>>???").replace(/=+$/, ""), "encoding");
    // One character too many for a whole number of bytes.
    fails(CARD_PREFIX + "A", "encoding");
    // Bytes that are not UTF-8.
    fails(CARD_PREFIX + btoa("\xff\xfe\xfd").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""), "encoding");
  });

  it("bad JSON, and JSON that is not an object", () => {
    fails(raw("{not json"), "json");
    fails(raw(" "), "json");
    fails(raw("[]"), "shape");
    fails(raw("null"), "shape");
    fails(raw("42"), "shape");
    fails(raw('"TODOPET1"'), "shape");
  });

  it("a missing field, an extra field, a wrong type, a wrong version", () => {
    for (const key of Object.keys(wire())) fails(raw(without(key)), key === "v" ? "version" : "shape");
    fails(raw(wire({ extra: "task title: pay the rent" })), "shape");
    fails(raw(wire({ v: 2 })), "version");
    fails(raw(wire({ v: "1" })), "version");
    fails(raw(wire({ name: 5 })), "name");
    fails(raw(wire({ accessories: "bow" })), "accessory");
    fails(raw(wire({ history: ["G"] })), "history");
  });

  it("an install id of the wrong shape", () => {
    for (const id of ["", "short", "has space in it", "x".repeat(33), "bad/id/slash", 7, null]) fails(raw(wire({ id })), "id");
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
    fails(raw(wire({ name: "\u202eiaM" })), "name"); // right-to-left override
    fails(raw(wire({ name: "Ma\u200bi" })), "name"); // zero-width space
    fails(raw(wire({ name: "Ma\u2028i" })), "name");
    fails(raw(wire({ name: "\u200d" })), "name");
    // Exactly 20 is fine.
    expect(decodeCard(raw(wire({ name: "x".repeat(20) })), TODAY)).toMatchObject({ ok: true });
  });

  it("is plain text: markup in a name is kept as text, never read", () => {
    const out = decodeCard(raw(wire({ name: "<b>Mai</b>" })), TODAY);
    expect(out).toMatchObject({ ok: true, card: { name: "<b>Mai</b>" } });
  });

  it("numbers out of range or not whole", () => {
    for (const patch of [
      { stage: -1 },
      { stage: 5 },
      { stage: 1.5 },
      { stage: "3" },
      { streak: -1 },
      { streak: 10_000 },
      { streak: 1.2 },
      { streak: null },
      { best: -3 },
      { best: 1e9 },
      { weekDone: -1 },
      { weekDone: 1000 },
      { weekDone: 1e15 },
      { weekDone: Number.MAX_SAFE_INTEGER },
    ]) {
      fails(raw(wire(patch)), "number");
    }
    // NaN and Infinity cannot even be written in JSON; they arrive as null.
    fails(raw(JSON.stringify(wire()).replace('"streak":6', '"streak":null')), "number");
    fails(raw(JSON.stringify(wire()).replace('"streak":6', '"streak":1e999')), "number");
  });

  it("raises a best streak that is lower than the current one instead of refusing the card", () => {
    expect(decodeCard(raw(wire({ streak: 8, best: 3 })), TODAY)).toMatchObject({ ok: true, card: { streak: 8, best: 8 } });
  });

  it("a malformed history", () => {
    for (const history of [
      "",
      "G".repeat(27),
      "G".repeat(29),
      "G".repeat(27) + "X",
      "g".repeat(28),
      "G".repeat(27) + " ",
      "G".repeat(27) + "\n",
      "G".repeat(27) + "😀",
      "G".repeat(14) + "!" + "G".repeat(13),
    ]) {
      fails(raw(wire({ history })), "history");
    }
    expect(decodeCard(raw(wire({ history: "-".repeat(28) })), TODAY)).toMatchObject({ ok: true });
    expect(decodeCard(raw(wire({ history: "GKR-".repeat(7) })), TODAY)).toMatchObject({ ok: true });
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
    expect(decodeCard(raw(wire({ date: "2026-10-30" })), TODAY)).toMatchObject({ ok: true });
    fails(raw(wire({ date: "2026-10-31" })), "future");
    fails(raw(wire({ date: "2027-01-01", week: "2026-W53" })), "future");
    fails(raw(wire({ date: "2099-01-01", week: "2099-W01" })), "future");
  });

  it("gives the same kind answer in Vietnamese", () => {
    setLang("vi");
    const out = decodeCard("hello", TODAY);
    setLang("en");
    expect(out).toMatchObject({ ok: false, error: "prefix" });
    if (!out.ok) expect(out.message).toMatch(/thẻ/i);
  });

  it("never throws, whatever it is given", () => {
    const junk: unknown[] = [undefined, null, 0, {}, [], "\u0000", "TODOPET1.\u0000", CARD_PREFIX + "%%%", "𝒳".repeat(2000), "TODOPET1." + "_".repeat(1400)];
    for (const j of junk) expect(() => decodeCard(j as string, TODAY)).not.toThrow();
    for (const j of junk) expect(decodeCard(j as string, TODAY).ok).toBe(false);
  });
});

describe("building my own card", () => {
  const base = {
    installId: "my-install-id-0001",
    petName: "Mochi",
    species: "mochi",
    wearing: ["bow"],
    stage: 3,
    streak: 4,
    bestStreak: 9,
    weekDone: 7,
    history: "GKGK" + "-".repeat(24),
    today: TODAY,
  } as const;

  it("makes a card that reads back as itself", () => {
    const c = buildCard({ ...base, wearing: [...base.wearing] });
    expect(c).toMatchObject({ id: "my-install-id-0001", name: "Mochi", species: "mochi", accessories: ["bow"], stage: 3, streak: 4, best: 9, week: "2026-W44", weekDone: 7, date: TODAY });
    expect(decodeCard(encodeCard(c), TODAY)).toEqual({ ok: true, card: c });
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
    for (const n of ["", "x".repeat(40), "\u202eabc", "Mo\u200bchi", "😀".repeat(30)]) {
      expect(decodeCard(encodeCard(buildCard({ ...base, wearing: [], petName: n })), TODAY).ok).toBe(true);
    }
  });

  it("wears at most three accessories, one per slot, and none that a card can't carry", () => {
    const worn = buildCard({ ...base, wearing: ["bow", "crown", "scarf", "sunglasses", "tophat"] }).accessories;
    expect(worn).toEqual(["bow", "scarf", "sunglasses"]);
  });

  it("keeps the numbers inside what a card allows", () => {
    const c = buildCard({ ...base, wearing: [], streak: 50_000, bestStreak: 20, weekDone: 5000 });
    expect(c).toMatchObject({ streak: 9999, best: 9999, weekDone: 999 });
    expect(decodeCard(encodeCard(c), TODAY).ok).toBe(true);
    expect(buildCard({ ...base, wearing: [], streak: -3, weekDone: -1, bestStreak: -1 })).toMatchObject({ streak: 0, best: 0, weekDone: 0 });
  });
});

describe("the install id", () => {
  it("is 20 characters a card accepts, made from the injected random source", () => {
    const id = newInstallId(() => 0.5);
    expect(id).toHaveLength(20);
    expect(decodeCard(encodeCard(card({ id })), TODAY).ok).toBe(true);
    let n = 0;
    const counting = () => ((n++ * 7) % 36) / 36;
    expect(newInstallId(counting)).toMatch(/^[a-z0-9]{20}$/);
  });

  it("differs from one install to the next", () => {
    const ids = new Set(Array.from({ length: 200 }, () => newInstallId(Math.random)));
    expect(ids.size).toBe(200);
  });

  it("stays in range even when the source gives 0 or just under 1", () => {
    expect(newInstallId(() => 0)).toMatch(/^a{20}$/);
    expect(newInstallId(() => 0.9999999999)).toMatch(/^9{20}$/);
    expect(newInstallId(() => 1)).toMatch(/^[a-z0-9]{20}$/);
    expect(newInstallId(() => -3)).toMatch(/^[a-z0-9]{20}$/);
    expect(newInstallId(() => Number.NaN)).toMatch(/^[a-z0-9]{20}$/);
  });
});

describe("the friend list", () => {
  const ME = "my-install-id-0001";
  const friend = (patch: Partial<Friend> = {}): Friend => ({ ...card(), lastVisit: null, ...patch });
  const ids = (list: readonly Friend[]) => list.map((f) => f.id);

  it("adds a new friend at the end, with no visit yet", () => {
    const out = addFriend([friend({ id: "friend-a-000001" })], card({ id: "friend-b-000002", name: "Bin" }), ME);
    expect(out).toMatchObject({ ok: true, replaced: false });
    if (!out.ok) return;
    expect(ids(out.friends)).toEqual(["friend-a-000001", "friend-b-000002"]);
    expect(out.friend).toMatchObject({ id: "friend-b-000002", name: "Bin", lastVisit: null });
  });

  it("refuses your own card, and changes nothing", () => {
    setLang("en");
    const list = [friend()];
    const out = addFriend(list, card({ id: ME }), ME);
    expect(out).toMatchObject({ ok: false, error: "self" });
    if (!out.ok) expect(out.message).toMatch(/your own/i);
    expect(list).toHaveLength(1);
  });

  it("lets a newer card from the same friend replace the older one, in place, keeping the last visit", () => {
    const list = [friend({ id: "friend-a-000001", date: "2026-10-26", week: "2026-W44", weekDone: 2, lastVisit: 12345 }), friend({ id: "friend-b-000002" })];
    const out = addFriend(list, card({ id: "friend-a-000001", date: TODAY, weekDone: 9, name: "Mai ✨" }), ME);
    expect(out).toMatchObject({ ok: true, replaced: true });
    if (!out.ok) return;
    expect(ids(out.friends)).toEqual(["friend-a-000001", "friend-b-000002"]);
    expect(out.friends[0]).toMatchObject({ name: "Mai ✨", date: TODAY, weekDone: 9, lastVisit: 12345 });
  });

  it("takes a card from the same day too (the last one pasted is the freshest we can tell)", () => {
    const list = [friend({ weekDone: 3 })];
    const out = addFriend(list, card({ weekDone: 8 }), ME);
    expect(out).toMatchObject({ ok: true, replaced: true });
    if (out.ok) expect(out.friends[0].weekDone).toBe(8);
  });

  it("keeps the newer card when an older one is pasted, and says so kindly", () => {
    setLang("en");
    const list = [friend({ date: TODAY })];
    const out = addFriend(list, card({ date: "2026-10-25", week: "2026-W43", name: "Mai" }), ME);
    expect(out).toMatchObject({ ok: false, error: "older" });
    if (!out.ok) expect(out.message).toContain("Mai");
  });

  it("holds 12 friends and no more", () => {
    setLang("en");
    const twelve = Array.from({ length: MAX_FRIENDS }, (_, i) => friend({ id: `friend-${String(i).padStart(8, "0")}` }));
    expect(twelve).toHaveLength(12);
    const out = addFriend(twelve, card({ id: "friend-extra-0001" }), ME);
    expect(out).toMatchObject({ ok: false, error: "full" });
    if (!out.ok) expect(out.message).toMatch(/12/);
    // A friend you already have can still send a newer card when the list is full.
    const again = addFriend(twelve, card({ id: "friend-00000003", weekDone: 40 }), ME);
    expect(again).toMatchObject({ ok: true, replaced: true });
    if (again.ok) expect(again.friends).toHaveLength(12);
    // Room again after a removal.
    expect(addFriend(removeFriend(twelve, "friend-00000003"), card({ id: "friend-extra-0001" }), ME)).toMatchObject({ ok: true });
  });

  it("never changes the list it was given", () => {
    const list = Object.freeze([Object.freeze(friend())]);
    expect(() => addFriend(list, card({ id: "friend-b-000002" }), ME)).not.toThrow();
    expect(() => removeFriend(list, list[0].id)).not.toThrow();
    expect(list).toHaveLength(1);
  });

  it("removes a friend by id, and leaves the others alone", () => {
    const list = [friend({ id: "friend-a-000001" }), friend({ id: "friend-b-000002" })];
    expect(ids(removeFriend(list, "friend-a-000001"))).toEqual(["friend-b-000002"]);
    expect(ids(removeFriend(list, "nobody-here-0001"))).toEqual(ids(list));
  });
});

describe("the stored friends document", () => {
  const friend = (patch: Partial<Friend> = {}): Friend => ({ ...card(), lastVisit: null, ...patch });
  const fixed = () => "freshly-made-id-001";

  it("makes an id when there is nothing yet, and says it did", () => {
    for (const nothing of [null, undefined, "x", 5, [], {}]) {
      const { doc, fresh } = docFromJson(nothing, fixed);
      expect(fresh).toBe(true);
      expect(doc).toEqual({ installId: "freshly-made-id-001", friends: [], visits: { day: "", count: 0, lastAt: null } });
    }
  });

  it("round-trips what it saved, and keeps the id it was given", () => {
    const doc = { installId: "my-install-id-0001", friends: [friend({ lastVisit: 99 }), friend({ id: "friend-b-000002", name: "Bin" })], visits: { day: TODAY, count: 1, lastAt: 1234 } };
    const back = docFromJson(JSON.parse(JSON.stringify(docToJson(doc))), fixed);
    expect(back.fresh).toBe(false);
    expect(back.doc).toEqual(doc);
  });

  it("makes a new id when the stored one is no good, but keeps the friends", () => {
    const { doc, fresh } = docFromJson({ installId: "no", friends: [friend()] }, fixed);
    expect(fresh).toBe(true);
    expect(doc.installId).toBe("freshly-made-id-001");
    expect(doc.friends).toHaveLength(1);
  });

  it("drops stored friends that no longer hold up: damaged, repeated, ourselves, or past the 12", () => {
    const mine = "my-install-id-0001";
    const many = Array.from({ length: 15 }, (_, i) => friend({ id: `friend-${String(i).padStart(8, "0")}` }));
    const stored = {
      installId: mine,
      friends: [
        ...many,
        { ...friend({ id: "friend-broken-001" }), species: "dinosaur" },
        { ...friend({ id: "friend-broken-002" }), history: "nope" },
        friend({ id: mine }),
        "not an object",
        null,
      ],
    };
    const { doc } = docFromJson(stored, fixed);
    expect(doc.friends.map((f) => f.id)).toEqual(many.slice(0, 12).map((f) => f.id));
    // The same friend twice: the newer card stays.
    const twice = docFromJson({ installId: mine, friends: [friend({ id: "friend-a-000001", date: "2026-10-20", week: "2026-W43" }), friend({ id: "friend-a-000001", date: TODAY })] }, fixed);
    expect(twice.doc.friends).toHaveLength(1);
    expect(twice.doc.friends[0].date).toBe(TODAY);
  });

  it("does not lose a friend whose card is dated ahead of a clock that was set back", () => {
    const { doc } = docFromJson({ installId: "my-install-id-0001", friends: [friend({ date: "2026-12-30", week: "2026-W53" })] }, fixed);
    expect(doc.friends).toHaveLength(1);
  });

  it("reads a friend without a last visit as never visited, and ignores nonsense there", () => {
    const f = { ...friend() } as Record<string, unknown>;
    delete f.lastVisit;
    expect(docFromJson({ installId: "my-install-id-0001", friends: [f] }, fixed).doc.friends[0].lastVisit).toBeNull();
    expect(docFromJson({ installId: "my-install-id-0001", friends: [{ ...f, lastVisit: "yesterday" }] }, fixed).doc.friends[0].lastVisit).toBeNull();
    expect(docFromJson({ installId: "my-install-id-0001", friends: [{ ...f, lastVisit: Number.POSITIVE_INFINITY }] }, fixed).doc.friends[0].lastVisit).toBeNull();
  });

  it("reads a damaged visit log as no visits today", () => {
    for (const visits of [null, 5, { day: "someday", count: 9, lastAt: "x" }, { day: TODAY, count: -4, lastAt: null }, { day: TODAY, count: 1e9 }]) {
      const { doc } = docFromJson({ installId: "my-install-id-0001", friends: [], visits }, fixed);
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
    const h = cardHistory({}, TODAY, "K", weekend);
    expect(h).toHaveLength(28);
    expect(h.endsWith("K")).toBe(true);
    // The 24th and 25th are a Saturday and a Sunday: 5 and 4 days before Thursday the 29th.
    expect(h[27 - 5]).toBe("R");
    expect(h[27 - 4]).toBe("R");
    expect(h[27 - 1]).toBe("-");
  });

  it("uses what was settled over the default, and leaves out days older than 28", () => {
    const h = cardHistory({ "2026-10-28": "G", "2026-10-27": "K", "2026-10-26": "R", "2026-10-01": "G", "2026-09-30": "G", "2026-09-01": "G" }, TODAY, "-", always);
    expect(h.slice(-4)).toBe("RKG-");
    expect(h).toHaveLength(28);
    // 28 days ending 29 Oct start on 2 Oct: the 1st is just outside.
    expect(h[0]).toBe("-");
    expect(cardHistory({ "2026-10-02": "G" }, TODAY, "-", always)[0]).toBe("G");
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
    expect(buddyStreak(side("KKKK"), side("KKKK"))).toBe(0);
    expect(buddyStreak(side("GGGG"), side("KKKK"))).toBe(0);
    expect(buddyStreak(side("----"), side("GGGG"))).toBe(0);
  });

  it("does not count a day one of you hit the goal and the other only kept", () => {
    // Today is still open, so the K does not end it; yesterday (closed) does.
    expect(buddyStreak(side("GGGG"), side("GGKG"))).toBe(1);
  });

  it("skips a day either of you rested, without breaking and without adding", () => {
    expect(buddyStreak(side("GGRGG"), side("GGGGG"))).toBe(4);
    expect(buddyStreak(side("GGGGG"), side("GGRGG"))).toBe(4);
    expect(buddyStreak(side("GRRRRG"), side("GRGRRG"))).toBe(2);
    // Both resting is a rest too.
    expect(buddyStreak(side("GRRG"), side("GRRG"))).toBe(2);
  });

  it("ends at a closed day when either of you missed the goal or did nothing", () => {
    expect(buddyStreak(side("GGKGG"), side("GGGGG"))).toBe(2);
    expect(buddyStreak(side("GG-GG"), side("GGGGG"))).toBe(2);
    expect(buddyStreak(side("GGGGG"), side("GG-GG"))).toBe(2);
    // The break stays a break however far back the good days go.
    expect(buddyStreak(side("GGGGGGGKGG"), side("GGGGGGGGGG"))).toBe(2);
  });

  it("does not let today end it while today is still open, nor count it unless both hit the goal", () => {
    expect(buddyStreak(side("GGGK"), side("GGG-"))).toBe(3);
    expect(buddyStreak(side("GGG-"), side("GGGK"))).toBe(3);
    expect(buddyStreak(side("GGGG"), side("GGG-"))).toBe(3);
  });

  it("starts from the latest day both cards cover when their dates differ, and ignores the days after", () => {
    // Mine is today; the friend's card is two days old: the days since are not in it.
    expect(buddyStreak(side("GGGGGG"), side("GGGG", addDays(TODAY, -2)))).toBe(4);
    // And the same the other way round.
    expect(buddyStreak(side("GGGG", addDays(TODAY, -2)), side("GGGGGG"))).toBe(4);
  });

  it("lines the days up by date, not by position", () => {
    // Friend (two days old) G G G on the 25th..27th; me: K on the 25th, G on the 26th and 27th, then more.
    const mine = side("KGGGG"); // 25 K, 26 G, 27 G, 28 G, 29 G
    const theirs = side("GGG", addDays(TODAY, -2)); // 25 G, 26 G, 27 G
    expect(buddyStreak(mine, theirs)).toBe(2);
  });

  it("treats the older card's own last day as still open, but a closed day of the other card is final", () => {
    // The friend's card was made in the morning of the 27th with nothing done yet ('-'); I had the goal that day.
    expect(buddyStreak(side("GGGGGG"), side("GGG-", addDays(TODAY, -2)))).toBe(3);
    // I had not (closed, K): that day ends it whatever the friend did later.
    expect(buddyStreak(side("GGKGG"), side("GGGG", addDays(TODAY, -2)))).toBe(0);
  });

  it("is the same from either side", () => {
    const pairs: [string, string, number][] = [
      ["GGRGKGG", "GGGGKGG", 2],
      ["GKGG", "GGGG", 2],
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
    expect(boss(0, [friend(), friend({ id: "friend-b-000002" }), friend({ id: "friend-c-000003" })]).maxHp).toBe(60);
  });

  it("counts only friends whose latest card is from this ISO week", () => {
    const lastWeek = friend({ id: "friend-old-00001", date: "2026-10-25", week: "2026-W43", weekDone: 40 });
    const thisWeek = friend({ id: "friend-new-00001", date: "2026-10-26", week: "2026-W44", weekDone: 5 });
    const b = boss(2, [lastWeek, thisWeek]);
    expect(b.members.map((m) => m.id)).toEqual(["me", "friend-new-00001"]);
    expect(b.maxHp).toBe(30);
    expect(b.damage).toBe(7); // 2 mine + 5, not the 40 from last week's card
    expect(b.waiting).toBe(1);
  });

  it("takes your own tasks live and each friend's tasks from their latest card", () => {
    const b = boss(4, [friend({ weekDone: 9 }), friend({ id: "friend-b-000002", weekDone: 3 })]);
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
    const b = boss(1, [friend({ id: "friend-a-000001", name: "A", weekDone: 2 }), friend({ id: "friend-b-000002", name: "B", weekDone: 8 })]);
    expect(b.members.map((m) => m.name === "A" || m.name === "B" ? m.name : "me")).toEqual(["me", "B", "A"]);
  });

  it("is beaten when the damage reaches the HP, together, and never goes below 0", () => {
    // Two members: 30 HP.
    expect(boss(10, [friend({ weekDone: 19 })]).defeated).toBe(false);
    expect(boss(10, [friend({ weekDone: 19 })]).hp).toBe(1);
    const won = boss(10, [friend({ weekDone: 20 })]);
    expect(won).toMatchObject({ hp: 0, defeated: true, damage: 30 });
    const over = boss(40, [friend({ weekDone: 100 })]);
    expect(over).toMatchObject({ hp: 0, defeated: true });
    expect(over.damage).toBe(140);
    // Alone it is 15.
    expect(boss(15, []).defeated).toBe(true);
    expect(boss(14, []).defeated).toBe(false);
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
    expect(boss(0, friends, "2026-11-01")).toMatchObject({ week: "2026-W44", maxHp: 30, damage: 30, hp: 0, defeated: true });
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
    expect(pick({ log: { day: TODAY, count: 1, lastAt: NOW + 60_000 } })).toBeNull(); // the clock went back
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
    ] as const;
    for (const what of notCalm) expect(pick({ calm: calmMoment({ [what]: true }) }), what).toBeNull();
    expect(pick({ calm: calmMoment({ typing: true, quiet: true }) })).toBeNull();
  });

  it("picks the friend who visited longest ago, a friend who never has first", () => {
    const a = friend({ id: "friend-a-000001", lastVisit: NOW - 3 * 86_400_000 });
    const b = friend({ id: "friend-b-000002", lastVisit: NOW - 86_400_000 });
    const c = friend({ id: "friend-c-000003", lastVisit: null });
    expect(pick({ friends: [a, b] })?.id).toBe("friend-a-000001");
    expect(pick({ friends: [b, a] })?.id).toBe("friend-a-000001");
    expect(pick({ friends: [a, b, c] })?.id).toBe("friend-c-000003");
  });

  it("breaks a tie with the injected random source, and only among eligible friends", () => {
    const a = friend({ id: "friend-a-000001" });
    const b = friend({ id: "friend-b-000002" });
    const old = friend({ id: "friend-old-00001", date: addDays(TODAY, -30) });
    expect(pick({ friends: [a, b, old] }, () => 0)?.id).toBe("friend-a-000001");
    expect(pick({ friends: [a, b, old] }, () => 0.99)?.id).toBe("friend-b-000002");
    expect(pick({ friends: [old] })).toBeNull();
    expect(pick({ friends: [] })).toBeNull();
  });

  it("is a visit that counts for today and remembers who came", () => {
    const doc = { installId: "my-install-id-0001", friends: [friend({ id: "friend-a-000001" }), friend({ id: "friend-b-000002" })], visits: { day: "", count: 0, lastAt: null } };
    const one = recordVisit(doc, "friend-b-000002", NOW, TODAY);
    expect(one.visits).toEqual({ day: TODAY, count: 1, lastAt: NOW });
    expect(one.friends.map((f) => f.lastVisit)).toEqual([null, NOW]);
    const two = recordVisit(one, "friend-a-000001", NOW + VISIT_GAP_MS, TODAY);
    expect(two.visits).toEqual({ day: TODAY, count: 2, lastAt: NOW + VISIT_GAP_MS });
    // A new day starts the count again.
    expect(recordVisit(two, "friend-a-000001", NOW + 86_400_000, addDays(TODAY, 1)).visits.count).toBe(1);
    // The document it was given is not changed.
    expect(doc.visits.count).toBe(0);
  });

  it("starts a day quietly: the first visit waits 15 to 75 minutes, the same for an install on the same day", () => {
    const delays = new Set<number>();
    for (let i = 0; i < 200; i++) {
      const d = visitDelayMs(`install-${i}-abcdefgh`, addDays(TODAY, i % 7));
      expect(d).toBeGreaterThanOrEqual(15 * 60_000);
      expect(d).toBeLessThan(75 * 60_000);
      delays.add(d);
    }
    // Spread out, not one number.
    expect(delays.size).toBeGreaterThan(30);
    // Restarting the app doesn't draw a new one.
    expect(visitDelayMs("my-install-id-00001", TODAY)).toBe(visitDelayMs("my-install-id-00001", TODAY));
    expect(visitDelayMs("my-install-id-00001", TODAY)).not.toBe(visitDelayMs("my-install-id-00001", addDays(TODAY, 1)));
  });

  it("labels the visit with the friend's name and the buddy streak, in both languages", () => {
    setLang("en");
    expect(visitLabel("Mai", 4)).toBe("Mai dropped by! 🔥 buddy streak 4");
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
      expect(new Set(cards.map((c) => c.id)).size).toBe(2);
      for (const c of cards) expect(decodeCard(encodeCard(c), today)).toEqual({ ok: true, card: c });
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
