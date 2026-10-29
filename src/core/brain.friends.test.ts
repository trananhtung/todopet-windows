// v0.6 "Friends" in the brain: the friends document, my card, adding and removing friends, the buddy streaks, the weekly
// boss and its one reward, and visits at calm moments (ambient: never a bubble, never counted).
import { describe, expect, it, vi } from "vitest";
import { createDemoBackend, sampleTasks, type DemoBackend } from "../backend/demo";
import { demoCardSignature, demoPublicKey, demoSignedCard } from "../backend/demoCards";
import { BackendError, type SystemSample } from "../backend/types";
import { Brain, type Bubble } from "./brain";
import * as fr from "./friends";
import { dayKey } from "./dates";
import {
  MAX_FRIENDS,
  VISIT_GAP_MS,
  VISIT_SECONDS,
  VISIT_WALK_MS,
  cardPayload,
  docFromJson,
  isoWeekKey,
  parseCard,
  sampleCards,
  type PetCard,
} from "./friends";
import { setLang } from "./l10n";
import { demoHistory, demoLife, type LifeState } from "./life";
import { defaultPrefs, type Prefs } from "./prefs";

const MIN = 60_000;
const at = (month: number, day: number, h: number, m = 0) => new Date(2026, month - 1, day, h, m).getTime();
const NEVER_TYPING = 999;

const h28 = (tail: string) => tail.padStart(28, "-");

const MAI = demoPublicKey("mai");
const BIN = demoPublicKey("bin");
const keyOf = (n: number | string) => demoPublicKey(`friend-${n}`);

/** A friend's card on the rig's days (Wednesday 28 October 2026 unless `date` says otherwise). */
function friendCard(patch: Partial<PetCard> = {}): PetCard {
  const date = patch.date ?? "2026-10-28";
  return {
    pk: MAI,
    name: "Mai",
    species: "shiba",
    accessories: ["flowercrown"],
    stage: 2,
    week: isoWeekKey(date),
    weekDone: 9,
    history: h28("GGGGGG"),
    date,
    ...patch,
  };
}
/** The card as the friend would send it: signed by their key (the demo's stand-in, which the demo backend checks). */
const text = (patch: Partial<PetCard> = {}) => demoSignedCard(friendCard(patch));

interface Rig {
  start?: number;
  life?: Partial<LifeState>;
  prefs?: Partial<Prefs>;
  random?: () => number;
  setup?: (b: DemoBackend) => Promise<void> | void;
  backend?: DemoBackend;
  clock?: { t: number };
  /** Runs after the brain is made and before it starts. */
  beforeStart?: (brain: Brain) => void;
  /** Is the start day's morning greeting still to come? By default it has been told: these tests are about what comes after it. */
  greetingToCome?: boolean;
  /** The visit log stored with the friends (`withFriends`). */
  visits?: { day: string; count: number; lastAt: number | null };
}

/** The demo on Wednesday 28 October 2026 at 9:00, with `life` (for today) and `prefs` saved first. */
async function rig(opts: Rig = {}) {
  const clock = opts.clock ?? { t: opts.start ?? at(10, 28, 9) };
  const backend = opts.backend ?? createDemoBackend({ now: () => clock.t, persist: false });
  await opts.setup?.(backend);
  const today = dayKey(new Date(clock.t));
  // The morning greeting is the day's first thing (a visit waits for it); it has been told, unless a test says it hasn't.
  const told = opts.greetingToCome ? {} : { dayFired: { [`morning-${today}`]: clock.t } };
  // (A restart on the same storage keeps what is there.)
  if (!opts.backend && (opts.life || !opts.greetingToCome)) await backend.storage.save("life", { ...demoLife(), dayKey: today, ...told, ...opts.life });
  else if (opts.life) await backend.storage.save("life", { ...demoLife(), dayKey: today, ...opts.life });
  if (opts.prefs) await backend.storage.save("prefs", { ...defaultPrefs(clock.t), ...opts.prefs });
  let front: Partial<SystemSample> = {};
  const sample = (): SystemSample => ({
    app: { name: "Visual Studio Code", exe: "code.exe", title: "work" },
    url: null,
    idleSeconds: 0,
    secondsSinceKey: NEVER_TYPING,
    fullscreen: false,
    appSwitchedAt: clock.t - 60 * MIN,
    ...front,
  });
  const brain = await Brain.create(backend, { demo: true, now: () => clock.t, random: opts.random ?? (() => 0.5) });
  setLang("en");
  opts.beforeStart?.(brain);
  await brain.start();
  const s = () => brain.getSnapshot();
  /** Nothing in the way: the greeting and the like are read and gone. */
  const hush = () => {
    const b = s().bubble;
    if (b) brain.dismissBubble(b.id, "seen");
  };
  hush();
  brain.onSample(sample());
  const show = (patch: Partial<SystemSample>) => {
    front = patch;
    brain.onSample(sample());
  };
  /** The heartbeat `seconds` later, bubbles that the rules put up cleared (a visit needs a calm moment). */
  const tick = (seconds = 15) => {
    clock.t += seconds * 1000;
    brain.onSample(sample());
    brain.tick();
    hush();
  };
  /** Beats up to three times, as far as a visit starting: a bubble put up on one beat is cleared before the next. */
  const settle = () => {
    for (let i = 0; i < 3 && !s().visitor; i++) tick(15);
  };
  /** Jumps `minutes` ahead and beats (see `settle`). */
  const wait = (minutes: number) => {
    clock.t += minutes * MIN - 45_000;
    settle();
  };
  return { clock, backend, brain, show, tick, wait, settle, hush, s, sample };
}

const stored = async (backend: DemoBackend) => docFromJson(await backend.storage.load("friends"), null, Number.MAX_SAFE_INTEGER);

type StoredFriend = Partial<PetCard> & { lastVisit?: number | null };
/** After this the day's first visit is due, whatever the install and the day make of the delay (15 to 75 minutes). */
const FIRST = 80;
const withFriends = (friends: StoredFriend[], rigOpts: Rig = {}) =>
  rig({
    ...rigOpts,
    // These are about the friends: no meeting an hour ahead (the demo's own calendar) and no timed task to remind of.
    prefs: { useCalendar: false, ...rigOpts.prefs },
    setup: async (b) => {
      await rigOpts.setup?.(b);
      const today = (): string => dayKey(new Date(b.demo.now()));
      b.todoist.tasks = async () => sampleTasks(new Date(b.demo.now())).map((t) => (t.id === "2" ? { ...t, due: { date: today(), string: "today" } } : t));
      const doc = {
        friends: friends.map(({ lastVisit, ...c }) => ({ ...friendCard(c), lastVisit: lastVisit ?? null })),
        visits: rigOpts.visits ?? { day: "", count: 0, lastAt: null },
      };
      await b.storage.save("friends", JSON.parse(JSON.stringify(doc)));
    },
  });
const withFriend = (patch: Partial<PetCard> = {}, rigOpts: Rig = {}) => withFriends([patch], rigOpts);

describe("the friends document and my key", () => {
  it("takes my identity from the backend's public key, and my card carries it", async () => {
    const r = await rig();
    const pk = await r.backend.cards.publicKey();
    expect(r.s().myKey).toBe(pk);
    expect(parseCard(await r.brain.myCard(), dayKey(new Date(r.clock.t)))).toMatchObject({ ok: true, card: { pk } });
    r.brain.stop();
  });

  it("keeps the key out of the friends document: no id, no key, only the friends and the visits", async () => {
    const r = await rig();
    await r.brain.addFriendCard(text());
    await vi.waitFor(async () => expect((await r.backend.storage.load("friends")) as object).toHaveProperty("friends"));
    const saved = (await r.backend.storage.load("friends")) as Record<string, unknown>;
    expect(Object.keys(saved).sort()).toEqual(["friends", "oldKeys", "visits"]);
    expect(JSON.stringify(saved)).not.toContain(await r.backend.cards.publicKey());
    r.brain.stop();
  });

  it("keeps the same identity across a restart", async () => {
    const r = await rig();
    const pk = r.s().myKey;
    expect(pk).not.toBeNull();
    r.brain.stop();
    const again = await rig({ backend: r.backend, clock: r.clock });
    expect(again.s().myKey).toBe(pk);
    again.brain.stop();
  });

  it("signs my card through the backend, and the backend says it checks out", async () => {
    const r = await rig();
    const sign = vi.spyOn(r.backend.cards, "sign");
    const out = parseCard(await r.brain.myCard(), "2026-10-28");
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(sign).toHaveBeenCalledWith(out.payload);
    expect(await r.backend.cards.verify(out.card.pk, out.payload, out.signature)).toBe(true);
    r.brain.stop();
  });

  it("never overwrites friends it could not read", async () => {
    const clock = { t: at(10, 28, 9) };
    const backend = createDemoBackend({ now: () => clock.t, persist: false });
    const load = backend.storage.load.bind(backend.storage);
    backend.storage.load = async (key) => {
      if (key === "friends") throw new Error("locked");
      return load(key);
    };
    const save = vi.spyOn(backend.storage, "save");
    const r = await rig({ backend, clock });
    // It works for this session…
    expect(await r.brain.addFriendCard(text())).toMatchObject({ ok: true });
    expect(r.s().friends).toHaveLength(1);
    // …but writes nothing over what is on disk.
    expect(save).not.toHaveBeenCalledWith("friends", expect.anything());
    r.brain.stop();
  }, 10_000);
});

describe("my card", () => {
  const read = async (r: Awaited<ReturnType<typeof rig>>) => {
    const out = parseCard(await r.brain.myCard(), dayKey(new Date(r.clock.t)));
    if (!out.ok) throw new Error(`my own card should read: ${out.error}`);
    return out.card;
  };

  it("is built live from the pet and the settings, and reads back; no streak on it", async () => {
    const r = await rig({
      life: { xp: 320, streak: 4, bestStreak: 9, wearing: ["scarf"], unlocked: ["scarf"], week: { key: "2026-10-26", done: 5, stickers: 0, trips: 0 } },
      prefs: { petName: "Bánh Bao", species: "panda" },
    });
    const card = await read(r);
    expect(card).toMatchObject({ name: "Bánh Bao", species: "panda", accessories: ["scarf"], stage: 2, week: "2026-W44", weekDone: 5, date: "2026-10-28" });
    expect(card).not.toHaveProperty("streak");
    expect(card).not.toHaveProperty("best");
    expect(card.history).toHaveLength(28);
    r.brain.stop();
  });

  it("follows the pet: a new name, a task finished, a new day", async () => {
    const r = await rig({ life: { week: { key: "2026-10-26", done: 5, stickers: 0, trips: 0 } }, prefs: { petName: "Mochi" } });
    expect((await read(r)).name).toBe("Mochi");
    await r.brain.updatePrefs({ petName: "Kem" });
    expect((await read(r)).name).toBe("Kem");
    const before = await read(r);
    await r.brain.complete(r.s().next!);
    expect((await read(r)).weekDone).toBe(before.weekDone + 1);
    r.brain.stop();
  });

  it("marks today with the goal met once the daily target is done, and a kept day as nothing", async () => {
    const r = await rig({ prefs: { dailyTarget: 1 } });
    // One task is already done today in the demo.
    expect((await read(r)).history.endsWith("G")).toBe(true);
    r.brain.stop();
    const kept = await rig();
    // One task of three: the pet calls that a kept day (K); a card says nothing about it.
    expect((await read(kept)).history.endsWith("-")).toBe(true);
    expect((await read(kept)).history).toMatch(/^[GR-]{28}$/);
    kept.brain.stop();
  });

  it("carries the days the pet settled over the ones it didn't, today live, and publishes kept days as nothing", async () => {
    // The demo treats every day as a workday unless you took it off, so a day nobody settled is `-`.
    const r = await rig({ life: { history: { "2026-10-27": "G", "2026-10-26": "K", "2026-10-25": "R" } } });
    // Oldest first: Sat 24th `-` (nobody settled it), Sun 25th R, Mon 26th K (as `-`), Tue 27th G, and today: one task of three, K (as `-`).
    expect((await read(r)).history.slice(-5)).toBe("-R-G-");
    r.brain.stop();
  });

  it("holds no task title, time, app name or user name", async () => {
    const r = await rig();
    const json = JSON.stringify(parseCard(await r.brain.myCard(), "2026-10-28"));
    for (const secret of ["weekly report", "Call client", "Plan the next sprint", "boss", "Visual Studio Code", "brain.ts", "demo.todopet", "Team sync"]) expect(json).not.toContain(secret);
    r.brain.stop();
  });

  it("says why when this PC's key can't be read, and the board keeps working", async () => {
    const clock = { t: at(10, 28, 9) };
    const backend = createDemoBackend({ now: () => clock.t, persist: false });
    backend.cards.publicKey = async () => {
      throw new BackendError({ kind: "internal", message: "Windows Credential Manager: locked" });
    };
    const r = await rig({ backend, clock });
    expect(r.s().myKey).toBeNull();
    expect(r.brain.myCardPayload()).toBeNull();
    await expect(r.brain.myCard()).rejects.toThrow(/key/i);
    // Friends can still be added (checking a card needs no key of mine), and the buddy streaks still work.
    expect(await r.brain.addFriendCard(text())).toMatchObject({ ok: true });
    expect(r.s().buddyStreaks[MAI]).toBeGreaterThanOrEqual(0);
    r.brain.stop();
  });

  it("gets the key later if it could not be read at the start", async () => {
    const clock = { t: at(10, 28, 9) };
    const backend = createDemoBackend({ now: () => clock.t, persist: false });
    const real = backend.cards.publicKey.bind(backend.cards);
    let locked = true;
    backend.cards.publicKey = async () => {
      if (locked) throw new BackendError({ kind: "internal", message: "locked" });
      return real();
    };
    const r = await rig({ backend, clock });
    expect(r.s().myKey).toBeNull();
    locked = false;
    expect(parseCard(await r.brain.myCard(), "2026-10-28")).toMatchObject({ ok: true });
    expect(r.s().myKey).toBe(await real());
    r.brain.stop();
  });
});

describe("adding and removing friends", () => {
  it("adds a friend from a card, shows them, and saves them", async () => {
    const r = await rig();
    const out = await r.brain.addFriendCard(text());
    expect(out).toMatchObject({ ok: true, replaced: false });
    expect(r.s().friends.map((f) => [f.pk, f.name, f.species])).toEqual([[MAI, "Mai", "shiba"]]);
    await vi.waitFor(async () => expect((await stored(r.backend)).friends).toHaveLength(1));
    r.brain.stop();
  });

  it("answers a bad card kindly, changes nothing and saves nothing", async () => {
    const r = await rig();
    const save = vi.spyOn(r.backend.storage, "save");
    const out = await r.brain.addFriendCard("TODOPET1.not-a-card");
    expect(out).toMatchObject({ ok: false, error: "encoding" });
    if (!out.ok) expect(out.message).toMatch(/card/i);
    expect(await r.brain.addFriendCard("")).toMatchObject({ ok: false, error: "empty" });
    expect(await r.brain.addFriendCard("hello")).toMatchObject({ ok: false, error: "prefix" });
    expect(r.s().friends).toEqual([]);
    expect(save).not.toHaveBeenCalledWith("friends", expect.anything());
    r.brain.stop();
  });

  it("refuses its own card", async () => {
    const r = await rig();
    const out = await r.brain.addFriendCard(await r.brain.myCard());
    expect(out).toMatchObject({ ok: false, error: "self" });
    expect(r.s().friends).toEqual([]);
    r.brain.stop();
  });

  it("replaces a friend with their newer card and refuses an older one", async () => {
    const r = await rig();
    await r.brain.addFriendCard(text({ date: "2026-10-26", weekDone: 2 }));
    expect(await r.brain.addFriendCard(text({ date: "2026-10-28", weekDone: 9, name: "Mai ✨" }))).toMatchObject({ ok: true, replaced: true });
    expect(r.s().friends).toHaveLength(1);
    expect(r.s().friends[0]).toMatchObject({ name: "Mai ✨", weekDone: 9, date: "2026-10-28" });
    expect(await r.brain.addFriendCard(text({ date: "2026-10-27", weekDone: 4 }))).toMatchObject({ ok: false, error: "older" });
    expect(r.s().friends[0].weekDone).toBe(9);
    r.brain.stop();
  });

  it("holds 12 friends", async () => {
    const r = await rig();
    for (let i = 0; i < MAX_FRIENDS; i++) expect(await r.brain.addFriendCard(text({ pk: keyOf(i), name: `F${i}` }))).toMatchObject({ ok: true });
    expect(await r.brain.addFriendCard(text({ pk: keyOf("thirteen") }))).toMatchObject({ ok: false, error: "full" });
    expect(r.s().friends).toHaveLength(12);
    r.brain.stop();
  });

  it("removes a friend and saves", async () => {
    const r = await rig();
    await r.brain.addFriendCard(text());
    await r.brain.addFriendCard(text({ pk: BIN, name: "Bin" }));
    expect(r.brain.removeFriend(MAI)).toBe(true);
    expect(r.s().friends.map((f) => f.name)).toEqual(["Bin"]);
    expect(r.brain.removeFriend(MAI)).toBe(false);
    await vi.waitFor(async () => expect((await stored(r.backend)).friends.map((f) => f.name)).toEqual(["Bin"]));
    r.brain.stop();
  });

  it("remembers friends across restarts", async () => {
    const r = await rig();
    await r.brain.addFriendCard(text());
    await vi.waitFor(async () => expect((await stored(r.backend)).friends).toHaveLength(1));
    r.brain.stop();
    const again = await rig({ backend: r.backend, clock: r.clock });
    expect(again.s().friends.map((f) => f.name)).toEqual(["Mai"]);
    again.brain.stop();
  });

  it("tells the diary a friend was added, without the friend's name", async () => {
    const r = await rig();
    const diary = vi.spyOn(r.brain.diary, "add");
    await r.brain.addFriendCard(text({ name: "Secretname" }));
    const lines = diary.mock.calls.map((c) => String(c[1]));
    expect(lines.some((l) => /friend/i.test(l))).toBe(true);
    expect(lines.join("\n")).not.toContain("Secretname");
    r.brain.stop();
  });
});

describe("a card has to check out before it is added (SECURITY M1, M2)", () => {
  /** The card text of `patch`, then the payload part changed by `change` while the rest stays (a tampered card). */
  const tampered = (patch: Partial<PetCard>, change: (c: PetCard) => PetCard) => {
    const good = friendCard(patch);
    const sig = demoCardSignature(good.pk, cardPayload(good));
    return demoSignedCard(good).replace(/\.[^.]+$/, `.${sig}`).replace(/^TODOPET1\.[^.]+/, `TODOPET1.${(demoSignedCard(change(good)).split(".")[1])}`);
  };

  it("verifies through the backend with the key, the exact payload and the signature of the card", async () => {
    const r = await rig();
    const verify = vi.spyOn(r.backend.cards, "verify");
    const card = friendCard();
    expect(await r.brain.addFriendCard(text())).toMatchObject({ ok: true });
    expect(verify).toHaveBeenCalledTimes(1);
    expect(verify).toHaveBeenCalledWith(MAI, cardPayload(card), demoCardSignature(MAI, cardPayload(card)));
    r.brain.stop();
  });

  it("refuses a card whose payload was changed, kindly, without its name, and adds and saves nothing", async () => {
    const r = await rig();
    const save = vi.spyOn(r.backend.storage, "save");
    const forged = tampered({ name: "Mai" }, (c) => ({ ...c, name: "Obviously Forged", weekDone: 900 }));
    expect(parseCard(forged, "2026-10-28")).toMatchObject({ ok: true });
    const out = await r.brain.addFriendCard(forged);
    expect(out).toMatchObject({ ok: false, error: "signature" });
    if (!out.ok) {
      expect(out.message).toBe("This card doesn't check out; ask your friend to copy it again.");
      expect(out.message).not.toMatch(/Forged|Mai/);
    }
    expect(r.s().friends).toEqual([]);
    expect(save).not.toHaveBeenCalledWith("friends", expect.anything());
    r.brain.stop();
  });

  it("refuses a card signed by someone else's key, or with no real signature at all", async () => {
    const r = await rig();
    const card = friendCard();
    const byOther = demoSignedCard(card).replace(/\.[^.]+$/, `.${demoCardSignature(BIN, cardPayload(card))}`);
    expect(await r.brain.addFriendCard(byOther)).toMatchObject({ ok: false, error: "signature" });
    const nosig = demoSignedCard(card).replace(/\.[^.]+$/, `.${"A".repeat(86)}`);
    expect(await r.brain.addFriendCard(nosig)).toMatchObject({ ok: false, error: "signature" });
    expect(r.s().friends).toEqual([]);
    r.brain.stop();
  });

  it("cannot be taken over: a card with a friend's key but not their signature never replaces them", async () => {
    const r = await rig();
    await r.brain.addFriendCard(text({ name: "Mai", weekDone: 3 }));
    const takeover = tampered({ name: "Mai" }, (c) => ({ ...c, name: "Not Mai", date: "2026-10-29", week: isoWeekKey("2026-10-29") }));
    expect(await r.brain.addFriendCard(takeover)).toMatchObject({ ok: false, error: "signature" });
    expect(r.s().friends.map((f) => f.name)).toEqual(["Mai"]);
    r.brain.stop();
  });

  it("says it could not check when the backend fails, which is not the same as a bad card", async () => {
    const r = await rig();
    vi.spyOn(r.backend.cards, "verify").mockRejectedValueOnce(new BackendError({ kind: "internal", message: "IPC closed" }));
    const out = await r.brain.addFriendCard(text());
    expect(out).toMatchObject({ ok: false, error: "unchecked" });
    if (!out.ok) expect(out.message).toMatch(/try again/i);
    expect(r.s().friends).toEqual([]);
    // The next try works.
    expect(await r.brain.addFriendCard(text())).toMatchObject({ ok: true });
    r.brain.stop();
  });

  it("treats a key or signature the backend finds malformed as a card that doesn't check out", async () => {
    const r = await rig();
    vi.spyOn(r.backend.cards, "verify").mockRejectedValueOnce(new BackendError({ kind: "invalid", message: "The signature is not base64url" }));
    expect(await r.brain.addFriendCard(text())).toMatchObject({ ok: false, error: "signature" });
    r.brain.stop();
  });

  it("does not ask the backend about a card it can already tell is damaged", async () => {
    const r = await rig();
    const verify = vi.spyOn(r.backend.cards, "verify");
    await r.brain.addFriendCard("TODOPET1.nope");
    await r.brain.addFriendCard("");
    expect(verify).not.toHaveBeenCalled();
    r.brain.stop();
  });

  it("a newer card from the same key replaces the old one quietly; the same name with another key is another friend", async () => {
    const r = await rig();
    await r.brain.addFriendCard(text({ date: "2026-10-26", weekDone: 2 }));
    const diary = vi.spyOn(r.brain.diary, "add");
    expect(await r.brain.addFriendCard(text({ date: "2026-10-28", weekDone: 9 }))).toMatchObject({ ok: true, replaced: true });
    expect(r.s().friends).toHaveLength(1);
    expect(r.s().friends[0].weekDone).toBe(9);
    expect(String(diary.mock.calls[0]?.[1])).toMatch(/Updated a friend's card/);
    expect(await r.brain.addFriendCard(text({ pk: BIN, name: "Mai" }))).toMatchObject({ ok: true, replaced: false });
    expect(r.s().friends.map((f) => f.name)).toEqual(["Mai", "Mai"]);
    r.brain.stop();
  });

  it("holds when two cards are added at once: both land, and the same friend twice is one", async () => {
    const r = await rig();
    const [a, b, c] = await Promise.all([r.brain.addFriendCard(text()), r.brain.addFriendCard(text({ pk: BIN, name: "Bin" })), r.brain.addFriendCard(text({ weekDone: 11 }))]);
    expect([a.ok, b.ok, c.ok]).toEqual([true, true, true]);
    expect(r.s().friends.map((f) => f.name).sort()).toEqual(["Bin", "Mai"]);
    expect(r.s().friends.find((f) => f.pk === MAI)?.weekDone).toBe(11);
    r.brain.stop();
  });
});

describe("a new card identity (SECURITY M2)", () => {
  it("makes a new key, so my next card is from a new person, and keeps the friends", async () => {
    const r = await rig();
    await r.brain.addFriendCard(text());
    const before = r.s().myKey!;
    const oldCard = await r.brain.myCard();
    const out = await r.brain.resetCardKey();
    expect(out).toEqual({ ok: true });
    const after = r.s().myKey;
    expect(after).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(after).not.toBe(before);
    expect(parseCard(await r.brain.myCard(), "2026-10-28")).toMatchObject({ ok: true, card: { pk: after } });
    expect(r.s().friends.map((f) => f.name)).toEqual(["Mai"]);
    // The old card is still mine (v0.6 evaluation, issue 5): it is refused, kindly, and it is not a person in the blob.
    const boss = r.s().boss;
    const refused = await r.brain.addFriendCard(oldCard);
    expect(refused).toMatchObject({ ok: false, error: "former" });
    if (!refused.ok) expect(refused.message).toContain("That's one of your own older cards");
    expect(r.s().friends.map((f) => f.name)).toEqual(["Mai"]);
    expect(r.s().boss.maxHp).toBe(boss.maxHp);
    r.brain.stop();
  });

  it("remembers the keys of earlier identities, in the friends document and across a restart (v0.6 evaluation, issue 5)", async () => {
    const r = await rig();
    const first = r.s().myKey!;
    const firstCard = await r.brain.myCard();
    await r.brain.resetCardKey();
    const second = r.s().myKey!;
    const secondCard = await r.brain.myCard();
    await r.brain.resetCardKey();
    const third = r.s().myKey!;
    await vi.waitFor(async () => expect((await stored(r.backend)).oldKeys).toEqual([first, second]));
    // The current key is not an old one, and nothing secret is kept: only public keys.
    expect((await stored(r.backend)).oldKeys).not.toContain(third);
    r.brain.stop();
    const again = await rig({ backend: r.backend, clock: r.clock });
    expect(again.s().myKey).toBe(third);
    expect(await again.brain.addFriendCard(firstCard)).toMatchObject({ ok: false, error: "former" });
    expect(await again.brain.addFriendCard(secondCard)).toMatchObject({ ok: false, error: "former" });
    expect(await again.brain.addFriendCard(await again.brain.myCard())).toMatchObject({ ok: false, error: "self" });
    expect(again.s().friends).toEqual([]);
    again.brain.stop();
  });

  it("remembers the last 10 identities and no more", async () => {
    const r = await rig();
    const keys = [r.s().myKey!];
    const cards = [await r.brain.myCard()];
    for (let i = 0; i < 11; i++) {
      await r.brain.resetCardKey();
      keys.push(r.s().myKey!);
      cards.push(await r.brain.myCard());
    }
    await vi.waitFor(async () => expect((await stored(r.backend)).oldKeys).toEqual(keys.slice(1, 11)));
    expect((await stored(r.backend)).oldKeys).toHaveLength(fr.MAX_OLD_KEYS);
    // The nine newest older cards are refused; the very oldest has been forgotten and reads as anyone's.
    expect(await r.brain.addFriendCard(cards[10])).toMatchObject({ ok: false, error: "former" });
    expect(await r.brain.addFriendCard(cards[1])).toMatchObject({ ok: false, error: "former" });
    expect(await r.brain.addFriendCard(cards[0])).toMatchObject({ ok: true });
    r.brain.stop();
  });

  it("remembers nothing when the new key could not be made", async () => {
    const r = await rig();
    const mine = r.s().myKey!;
    vi.spyOn(r.backend.cards, "resetKey").mockRejectedValueOnce(new BackendError({ kind: "internal", message: "locked" }));
    expect(await r.brain.resetCardKey()).toMatchObject({ ok: false });
    expect(r.s().myKey).toBe(mine);
    await new Promise((res) => setTimeout(res, 10));
    expect((await stored(r.backend)).oldKeys).toEqual([]);
    // Still mine, and still "your own card" rather than an old one.
    expect(await r.brain.addFriendCard(await r.brain.myCard())).toMatchObject({ ok: false, error: "self" });
    r.brain.stop();
  });

  it("starts the first visit's wait again", async () => {
    const r = await withFriend();
    r.brain.quiet(600);
    r.wait(70);
    expect(r.s().visitor).toBeNull();
    await r.brain.resetCardKey();
    r.brain.quiet(null);
    r.wait(10);
    expect(r.s().visitor).toBeNull();
    r.wait(FIRST);
    expect(r.s().visitor).not.toBeNull();
    r.brain.stop();
  });

  it("tells the diary without any key, and changes nothing when the backend refuses", async () => {
    const r = await rig();
    const diary = vi.spyOn(r.brain.diary, "add");
    const key = r.s().myKey;
    await r.brain.resetCardKey();
    const lines = diary.mock.calls.map((c) => String(c[1])).join("\n");
    expect(lines).toMatch(/card identity/i);
    expect(lines).not.toContain(key!);
    expect(lines).not.toContain(r.s().myKey!);
    vi.spyOn(r.backend.cards, "resetKey").mockRejectedValueOnce(new BackendError({ kind: "internal", message: "Windows Credential Manager: access denied" }));
    const mine = r.s().myKey;
    const out = await r.brain.resetCardKey();
    expect(out).toMatchObject({ ok: false });
    if (!out.ok) {
      expect(out.message).toMatch(/try again/i);
      expect(out.message).not.toMatch(/Credential|denied/);
    }
    expect(r.s().myKey).toBe(mine);
    r.brain.stop();
  });
});

describe("buddy streaks in the state", () => {
  it("counts back from the latest day both cards cover, against my card as it stands now", async () => {
    // Mine, oldest first: Fri 23 G, Sat 24 R, Sun 25 R, Mon 26 G, Tue 27 G, and today (one task of three: K).
    const r = await rig({ life: { history: { "2026-10-22": "K", "2026-10-23": "G", "2026-10-24": "R", "2026-10-25": "R", "2026-10-26": "G", "2026-10-27": "G" } } });
    await r.brain.addFriendCard(text({ history: h28("GGGGGGG") }));
    // Today is open for both: it doesn't count. 27th, 26th: +2. 25th, 24th: rests. 23rd: +1. 22nd: my K ends it.
    expect(r.s().buddyStreaks[MAI]).toBe(3);
    r.brain.stop();
  });

  it("is 0 for a friend with no goal days in common, and has no entry for a friend that was removed", async () => {
    const r = await rig({ life: { history: {} } });
    await r.brain.addFriendCard(text({ history: h28("----") }));
    expect(r.s().buddyStreaks[MAI]).toBe(0);
    r.brain.removeFriend(MAI);
    expect(r.s().buddyStreaks).toEqual({});
    r.brain.stop();
  });

  it("lines cards of different dates up by day", async () => {
    const r = await rig({ life: { history: { "2026-10-24": "G", "2026-10-25": "G", "2026-10-26": "G", "2026-10-27": "G" } } });
    await r.brain.addFriendCard(text({ date: "2026-10-26", history: h28("GGG") }));
    // Her card ends on the 26th: 26th, 25th, 24th are all goal days for us both.
    expect(r.s().buddyStreaks[MAI]).toBe(3);
    r.brain.stop();
  });
});

describe("the weekly boss", () => {
  const myWeek = (done: number) => ({ week: { key: "2026-10-26", done, stickers: 0, trips: 0 } });

  it("has 15 HP for you and each friend with a card from this week", async () => {
    const r = await rig({ life: myWeek(2) });
    expect(r.s().boss).toMatchObject({ week: "2026-W44", maxHp: 15, damage: 2, hp: 13, defeated: false });
    await r.brain.addFriendCard(text({ weekDone: 4 }));
    expect(r.s().boss).toMatchObject({ maxHp: 30, damage: 6, hp: 24 });
    r.brain.stop();
  });

  it("does not count a friend whose card is from an earlier week", async () => {
    const r = await rig({ life: myWeek(2) });
    await r.brain.addFriendCard(text({ date: "2026-10-23", weekDone: 40 }));
    expect(r.s().boss).toMatchObject({ maxHp: 15, damage: 2, waiting: 1 });
    expect(r.s().life.bossWins).toEqual([]);
    r.brain.stop();
  });

  it("takes your own tasks live", async () => {
    const r = await rig({ life: myWeek(2) });
    const before = r.s().boss.damage;
    await r.brain.complete(r.s().next!);
    expect(r.s().boss.damage).toBe(before + 1);
    r.brain.stop();
  });

  it("is beaten together: +50 XP and a 🏅, once", async () => {
    // I have done my 15; Mai has done 10 of hers (25 of 30).
    const r = await withFriend({ weekDone: 10 }, { life: { ...myWeek(15), xp: 200, pageFilled: 4, pageMedals: 0 } });
    expect(r.s().boss).toMatchObject({ maxHp: 30, damage: 25, defeated: false });
    expect(r.s().life.bossWins).toEqual([]);
    await r.brain.addFriendCard(text({ weekDone: 25 }));
    expect(r.s().boss).toMatchObject({ defeated: true, hp: 0, damage: 30 });
    expect(r.s().life).toMatchObject({ xp: 250, bossWins: ["2026-W44"], pageFilled: 5, pageMedals: 1 });
    // More damage, more friends, another card: still the one reward.
    await r.brain.addFriendCard(text({ pk: BIN, name: "Bin", weekDone: 30 }));
    await r.brain.addFriendCard(text({ weekDone: 60 }));
    expect(r.s().life).toMatchObject({ xp: 250, bossWins: ["2026-W44"], pageMedals: 1 });
    r.brain.stop();
  });

  // v0.6 evaluation, issue 4: a card that says 999 beat the blob on its own and paid +50 XP and a 🏅 to someone else.
  it("is not beaten by one friend's card that says 999 tasks, and pays nothing for it (v0.6 evaluation, issue 4)", async () => {
    const r = await rig({ life: { ...myWeek(2), xp: 200, pageFilled: 4, pageMedals: 0 } });
    await r.brain.addFriendCard(text({ weekDone: 999 }));
    expect(r.s().boss).toMatchObject({ maxHp: 30, damage: 17, hp: 13, defeated: false });
    expect(r.s().life).toMatchObject({ xp: 200, bossWins: [], pageFilled: 4, pageMedals: 0 });
    // The real number is still there to read.
    expect(r.s().boss.members.map((m) => [m.done, m.counted])).toEqual([
      [2, 2],
      [999, 15],
    ]);
    // Everyone has to bring their share: a second friend with nothing makes it harder, not easier.
    await r.brain.addFriendCard(text({ pk: BIN, name: "Bin", weekDone: 0 }));
    expect(r.s().boss).toMatchObject({ maxHp: 45, damage: 17, defeated: false });
    expect(r.s().life.bossWins).toEqual([]);
    r.brain.stop();
  });

  it("counts my own tasks up to 15 as well: 40 done don't beat a blob that a friend has not hurt", async () => {
    const r = await withFriend({ weekDone: 0 }, { life: { ...myWeek(40), xp: 200, pageFilled: 4, pageMedals: 0 } });
    expect(r.s().boss).toMatchObject({ maxHp: 30, damage: 15, hp: 15, defeated: false });
    expect(r.s().life).toMatchObject({ xp: 200, bossWins: [], pageMedals: 0 });
    r.brain.stop();
  });

  it("is saved with the pet's life", async () => {
    const r = await withFriend({ weekDone: 14 }, { life: myWeek(15) });
    expect(r.s().life.bossWins).toEqual([]);
    await r.brain.addFriendCard(text({ weekDone: 16 }));
    await vi.waitFor(async () => expect(((await r.backend.storage.load("life")) as LifeState).bossWins).toEqual(["2026-W44"]));
    r.brain.stop();
  });

  it("can be beaten alone, with 15 tasks", async () => {
    const r = await rig({ life: myWeek(15) });
    expect(r.s().boss).toMatchObject({ maxHp: 15, defeated: true });
    expect(r.s().life.bossWins).toEqual(["2026-W44"]);
    r.brain.stop();
  });

  it("says it once, in a bubble that is a reply and not a reminder", async () => {
    const r = await withFriend({ weekDone: 1 }, { life: myWeek(15) });
    const chime = vi.fn();
    r.brain.effects.chime = chime;
    await r.brain.addFriendCard(text({ weekDone: 40 }));
    const nudges = r.s().life.dayNudges;
    // Told at the next beat when nothing else is showing.
    const seen: Bubble[] = [];
    for (let i = 0; i < 6; i++) {
      r.clock.t += 15_000;
      r.brain.onSample(r.sample());
      r.brain.tick();
      const b = r.s().bubble;
      if (b?.text.includes("Blob")) {
        seen.push(b);
        r.brain.dismissBubble(b.id, "seen");
      } else r.hush();
    }
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({ reminder: false });
    expect(seen[0].kind).toBeUndefined();
    expect(seen[0].text).toContain("+50 XP");
    expect(seen[0].text).toContain("🏅");
    expect(r.s().life.dayNudges).toBe(nudges);
    r.brain.stop();
  });

  it("is not paid out for a task that Todoist then refused to close", async () => {
    // 14 of 15 alone: the next task would win.
    const r = await rig({ life: myWeek(14) });
    expect(r.s().boss.defeated).toBe(false);
    vi.spyOn(r.backend.todoist, "close").mockRejectedValueOnce(new Error("offline"));
    await r.brain.complete(r.s().next!);
    await new Promise((res) => setTimeout(res, 600));
    expect(r.s().life.week.done).toBe(14);
    expect(r.s().boss.defeated).toBe(false);
    expect(r.s().life.bossWins).toEqual([]);
    expect(r.s().life.pageMedals).toBe(0);
    r.brain.stop();
  });

  it("is paid out once the task that beat it is really closed", async () => {
    const r = await rig({ life: myWeek(14) });
    await r.brain.complete(r.s().next!);
    await vi.waitFor(() => expect(r.s().life.bossWins).toEqual(["2026-W44"]));
    expect(r.s().life.pageMedals).toBe(1);
    r.brain.stop();
  });

  it("starts over on Monday: last week's cards and tasks no longer count, and the next week can be won too", async () => {
    // Sunday 1 November: I have done my 15, Mai's card says 30 (15 count).
    const r = await withFriend({ date: "2026-11-01", weekDone: 14 }, { start: at(11, 1, 9), life: { week: { key: "2026-10-26", done: 15, stickers: 0, trips: 0 } } });
    expect(r.s().life.bossWins).toEqual([]);
    await r.brain.addFriendCard(text({ date: "2026-11-01", weekDone: 30 }));
    expect(r.s().boss).toMatchObject({ week: "2026-W44", defeated: true, damage: 30 });
    expect(r.s().life.bossWins).toEqual(["2026-W44"]);
    await vi.waitFor(async () => expect(((await r.backend.storage.load("life")) as LifeState).bossWins).toEqual(["2026-W44"]));
    // Monday 2 November.
    r.clock.t = at(11, 2, 9);
    r.tick();
    expect(r.s().boss).toMatchObject({ week: "2026-W45", maxHp: 15, damage: 0, hp: 15, defeated: false, waiting: 1 });
    r.brain.stop();
    // I did 14 on Monday (and the week turned in my pet's life): a fresh card from Mai, who says 40, is her 15 and makes 29 of 30.
    const life = (await r.backend.storage.load("life")) as LifeState;
    await r.backend.storage.save("life", { ...life, week: { key: "2026-11-02", done: 14, stickers: 0, trips: 0 } });
    const next = await rig({ backend: r.backend, clock: r.clock, prefs: { useCalendar: false } });
    await next.brain.addFriendCard(text({ date: "2026-11-02", weekDone: 40 }));
    expect(next.s().boss).toMatchObject({ week: "2026-W45", maxHp: 30, damage: 29, defeated: false });
    expect(next.s().life.bossWins).toEqual(["2026-W44"]);
    // My 15th task is the one that beats it.
    await next.brain.complete(next.s().next!);
    await vi.waitFor(() => expect(next.s().life.bossWins).toEqual(["2026-W44", "2026-W45"]));
    expect(next.s().life.pageMedals).toBe(2);
    next.brain.stop();
  });
});

describe("visits", () => {
  it("drops by at a calm moment, not at once, and is ambient: no bubble, no sound, no reminder counted", async () => {
    const r = await withFriend();
    r.wait(10);
    expect(r.s().visitor).toBeNull();
    const chime = vi.fn();
    r.brain.effects.chime = chime;
    const left = r.s().nudgesLeft;
    const nudges = r.s().life.dayNudges;
    r.wait(FIRST - 10);
    const v = r.s().visitor;
    expect(v).toMatchObject({ friend: { pk: MAI, name: "Mai" } });
    expect(v!.end - v!.start).toBe(VISIT_SECONDS * 1000);
    expect(r.s().bubble).toBeNull();
    expect(r.s().nudgesLeft).toBe(left);
    expect(r.s().life.dayNudges).toBe(nudges);
    // Whatever else made a sound meanwhile, the visit itself didn't: no chime came with it.
    const calls = chime.mock.calls.length;
    r.tick(5);
    expect(chime.mock.calls.length).toBe(calls);
    r.brain.stop();
  });

  it("carries the buddy streak for the label", async () => {
    const r = await withFriend({ history: h28("GGGGGGG") }, { life: { history: { "2026-10-26": "G", "2026-10-27": "G" } } });
    r.wait(FIRST);
    expect(r.s().visitor?.streak).toBe(r.s().buddyStreaks[MAI]);
    expect(r.s().visitor?.streak).toBeGreaterThanOrEqual(2);
    r.brain.stop();
  });

  it("leaves after about 25 seconds", async () => {
    const r = await withFriend();
    r.wait(FIRST);
    const v = r.s().visitor!;
    expect(v).not.toBeNull();
    r.clock.t = v.end - 5000;
    r.tick(1);
    expect(r.s().visitor).not.toBeNull();
    r.clock.t = v.end + 1000;
    r.tick(1);
    expect(r.s().visitor).toBeNull();
    r.brain.stop();
  });

  it("only comes from a friend whose card is at most 7 days old", async () => {
    const old = await withFriend({ date: "2026-10-20", week: isoWeekKey("2026-10-20") });
    old.wait(FIRST + 60);
    expect(old.s().visitor).toBeNull();
    old.brain.stop();
    const edge = await withFriend({ date: "2026-10-21", week: isoWeekKey("2026-10-21") });
    edge.wait(FIRST + 60);
    expect(edge.s().visitor).not.toBeNull();
    edge.brain.stop();
  });

  /** Lets the visit in progress run out. */
  const finish = (r: Awaited<ReturnType<typeof withFriend>>) => {
    r.clock.t = r.s().visitor!.end + 1000;
    r.tick(1);
    expect(r.s().visitor).toBeNull();
  };

  it("is at most two a day, two hours apart", async () => {
    const r = await withFriend();
    r.wait(FIRST);
    const first = r.s().visitor!;
    expect(first).not.toBeNull();
    finish(r);
    // An hour on: too soon for another.
    r.wait(FIRST);
    expect(r.s().visitor).toBeNull();
    // Two hours after the first began it comes again.
    r.clock.t = first.start + VISIT_GAP_MS + MIN;
    r.tick(1);
    r.tick(1);
    expect(r.s().visitor).not.toBeNull();
    finish(r);
    // And that was the day's second: no third however long it waits.
    r.wait(180);
    expect(r.s().visitor).toBeNull();
    r.wait(180);
    expect(r.s().visitor).toBeNull();
    expect((await stored(r.backend)).visits).toMatchObject({ day: "2026-10-28", count: 2 });
    r.brain.stop();
  });

  it("keeps the day's count across a restart", async () => {
    const r = await withFriend();
    r.wait(FIRST);
    const first = r.s().visitor!;
    expect(first).not.toBeNull();
    await vi.waitFor(async () => expect((await stored(r.backend)).visits.count).toBe(1));
    r.brain.stop();
    r.clock.t = first.end + 5 * MIN;
    const again = await rig({ backend: r.backend, clock: r.clock });
    again.wait(60);
    // One visit today and the gap isn't over (about an hour has gone by).
    expect(again.s().visitor).toBeNull();
    again.clock.t = first.start + VISIT_GAP_MS + 5 * MIN;
    again.tick(1);
    again.tick(1);
    expect(again.s().visitor).not.toBeNull();
    again.brain.stop();
  });

  describe("waits for a calm moment", () => {
    it("not while you are typing", async () => {
      const r = await withFriend();
      r.show({ secondsSinceKey: 2 });
      r.wait(FIRST);
      expect(r.s().visitor).toBeNull();
      r.show({});
      r.settle();
      expect(r.s().visitor).not.toBeNull();
      r.brain.stop();
    });

    it("not while focusing", async () => {
      const r = await withFriend();
      r.brain.startFocus(null, 240);
      r.wait(FIRST);
      expect(r.s().visitor).toBeNull();
      r.brain.stopFocus();
      r.hush();
      r.settle();
      expect(r.s().visitor).not.toBeNull();
      r.brain.stop();
    });

    it("not in a meeting", async () => {
      // One long meeting, 10:00 to 12:00 whatever hour it is asked.
      const ics = ["BEGIN:VCALENDAR", "VERSION:2.0", "BEGIN:VEVENT", "UID:long", "DTSTAMP:20261028T080000", "DTSTART:20261028T100000", "DTEND:20261028T120000", "SUMMARY:Planning", "END:VEVENT", "END:VCALENDAR"].join("\r\n");
      const r = await withFriend({}, { start: at(10, 28, 10, 20), prefs: { useCalendar: true }, setup: (b) => void (b.calendar.fetchIcs = async () => [{ host: "demo.todopet", ok: true, text: ics }]) });
      expect(r.s().events).toHaveLength(1);
      r.wait(50);
      expect(r.s().events).toHaveLength(1);
      expect(r.s().visitor).toBeNull();
      // The meeting is over at 12:00.
      r.wait(FIRST);
      expect(r.s().visitor).not.toBeNull();
      r.brain.stop();
    });

    it("not when done for today", async () => {
      const r = await withFriend({}, { setup: (b) => b.storage.save("plan", { plans: [], doneUntil: at(10, 29, 8) }) });
      expect(r.s().doneUntil).not.toBeNull();
      r.wait(120);
      expect(r.s().visitor).toBeNull();
      r.brain.stop();
    });

    it("not when quiet", async () => {
      const r = await withFriend();
      r.brain.quiet(180);
      r.wait(FIRST);
      expect(r.s().visitor).toBeNull();
      r.brain.quiet(null);
      r.settle();
      expect(r.s().visitor).not.toBeNull();
      r.brain.stop();
    });

    it("not when hidden, or with a full-screen app in front", async () => {
      const r = await withFriend();
      r.brain.hide(180);
      r.hush();
      r.wait(FIRST);
      expect(r.s().visitor).toBeNull();
      r.brain.hide(null);
      r.show({ fullscreen: true });
      r.wait(5);
      expect(r.s().visitor).toBeNull();
      r.show({});
      r.settle();
      expect(r.s().visitor).not.toBeNull();
      r.brain.stop();
    });

    it("not when you are away, nor while the pet is asleep, on a trip, or in the middle of a stunt", async () => {
      const r = await withFriend();
      r.show({ idleSeconds: 700 });
      r.wait(FIRST);
      expect(r.s().mood).toBe("sleeping");
      expect(r.s().visitor).toBeNull();
      r.show({});
      r.brain.goOnTrip();
      r.hush();
      r.wait(5);
      expect(r.s().visitor).toBeNull();
      r.brain.callBack();
      r.hush();
      r.brain.demoAntic("grumble");
      r.hush();
      r.tick(1);
      expect(r.s().antic).not.toBeNull();
      expect(r.s().visitor).toBeNull();
      r.brain.endAntic();
      // (Being away for a long time starts the wait for the first visit again: see "when the first one comes".)
      r.wait(FIRST);
      expect(r.s().visitor).not.toBeNull();
      r.brain.stop();
    });

    it("not while a bubble is waiting", async () => {
      const r = await withFriend();
      r.brain.say({ text: "Waiting for an answer", actions: [{ title: "OK", run: () => undefined }], seconds: 6000, urgent: true });
      for (let i = 0; i < 9; i++) {
        r.clock.t += 10 * MIN;
        r.brain.onSample(r.sample());
        r.brain.tick();
      }
      expect(r.s().bubble).not.toBeNull();
      expect(r.s().visitor).toBeNull();
      r.hush();
      r.settle();
      expect(r.s().visitor).not.toBeNull();
      r.brain.stop();
    });

    it("not with the board open", async () => {
      const r = await withFriend();
      r.brain.boardOpened();
      r.wait(FIRST);
      expect(r.s().visitor).toBeNull();
      r.brain.boardClosed();
      r.settle();
      expect(r.s().visitor).not.toBeNull();
      r.brain.stop();
    });
  });

  describe("goes when the moment stops being calm", () => {
    const visiting = async () => {
      const r = await withFriend();
      r.wait(FIRST);
      expect(r.s().visitor).not.toBeNull();
      // Past the walk in, so it can leave properly.
      r.clock.t += 6000;
      return r;
    };

    it("when the pet is hidden", async () => {
      const r = await visiting();
      r.brain.hide(60);
      r.tick(1);
      expect(r.s().visitor === null || r.s().visitor!.end - r.clock.t <= 4000).toBe(true);
      r.brain.stop();
    });

    it("when the pet is muted", async () => {
      const r = await visiting();
      r.brain.quiet(60);
      r.tick(1);
      expect(r.s().visitor === null || r.s().visitor!.end - r.clock.t <= 4000).toBe(true);
      r.brain.stop();
    });

    it("when a focus session starts", async () => {
      const r = await visiting();
      r.brain.startFocus(null, 25);
      r.hush();
      r.tick(1);
      expect(r.s().visitor === null || r.s().visitor!.end - r.clock.t <= 4000).toBe(true);
      r.brain.stop();
    });

    it("when the board opens (the visitor makes way, or was clicked)", async () => {
      const r = await visiting();
      r.brain.boardOpened();
      expect(r.s().visitor === null || r.s().visitor!.end - r.clock.t <= 4000).toBe(true);
      r.brain.stop();
    });

    it("but typing doesn't send it away: it just keeps still", async () => {
      const r = await visiting();
      r.show({ secondsSinceKey: 1 });
      r.tick(1);
      expect(r.s().visitor).not.toBeNull();
      r.brain.stop();
    });

    it("at once when it was only just walking in", async () => {
      const r = await withFriend();
      r.wait(FIRST);
      expect(r.s().visitor).not.toBeNull();
      r.brain.hide(60);
      expect(r.s().visitor).toBeNull();
      r.brain.stop();
    });

    it("when the friend is removed", async () => {
      const r = await withFriend();
      r.wait(FIRST);
      expect(r.s().visitor).not.toBeNull();
      r.brain.removeFriend(MAI);
      expect(r.s().visitor).toBeNull();
      r.brain.stop();
    });
  });

  it("is not a reminder: the diary says it once, and the budget is untouched", async () => {
    const r = await withFriend();
    const diary = vi.spyOn(r.brain.diary, "add");
    r.wait(FIRST);
    const visits = diary.mock.calls.filter((c) => /dropped by/i.test(String(c[1])));
    expect(visits).toHaveLength(1);
    expect(String(visits[0][1])).not.toContain("Mai");
    expect(r.s().life.dayNudges).toBe(0);
    r.brain.stop();
  });

  it("sends the friend who visited longest ago", async () => {
    const r = await withFriends([
      { pk: keyOf("a"), name: "A", lastVisit: at(10, 27, 9) },
      { pk: keyOf("b"), name: "B", lastVisit: at(10, 20, 9) },
    ]);
    r.wait(FIRST);
    expect(r.s().visitor?.friend.name).toBe("B");
    r.brain.stop();
  });

  it("uses VISIT_GAP_MS as the gap between two visits", () => {
    expect(VISIT_GAP_MS).toBe(2 * 60 * MIN);
  });
});

describe("the demo", () => {
  it("adds two sample friends whose cards read, with buddy streaks to show and a boss to fight", async () => {
    // The demo pet's record as `demoLife` makes it for the (moved) clock's today.
    const r = await rig({ life: { history: demoHistory("2026-10-28") } });
    expect(await r.brain.demoAddFriends()).toBe(2);
    expect(r.s().friends).toHaveLength(2);
    expect(r.s().friends.map((f) => f.name)).toEqual(["Mai", "Bin"]);
    const [mai, bin] = sampleCards("2026-10-28");
    expect(r.s().buddyStreaks).toEqual({ [mai.pk]: 3, [bin.pk]: 2 });
    expect(r.s().boss.members.length).toBeGreaterThanOrEqual(2);
    // Again: nothing new, nothing broken.
    expect(await r.brain.demoAddFriends()).toBe(0);
    expect(r.s().friends).toHaveLength(2);
    r.brain.stop();
  });

  it("clears a plain bubble that is in the way (the demo's hello), so the visitor's label shows", async () => {
    const r = await rig();
    await r.brain.demoAddFriends();
    r.brain.say({ text: "Demo mode with sample tasks", seconds: 60, urgent: true });
    expect(r.s().bubble).not.toBeNull();
    expect(r.brain.demoVisit()).toBe(true);
    expect(r.s().bubble).toBeNull();
    // A question waiting for an answer is not thrown away.
    r.brain.say({ text: "Focus now?", actions: [{ title: "Yes", run: () => undefined }], seconds: 60, urgent: true });
    expect(r.brain.demoVisit()).toBe(true);
    expect(r.s().bubble?.text).toBe("Focus now?");
    r.brain.stop();
  });

  it("shows a visit right now, without using up the day's visits", async () => {
    const r = await rig();
    expect(r.brain.demoVisit()).toBe(false); // nobody to visit yet
    await r.brain.demoAddFriends();
    expect(r.brain.demoVisit()).toBe(true);
    expect(r.s().visitor).not.toBeNull();
    expect(r.s().bubble).toBeNull();
    expect(r.s().life.dayNudges).toBe(0);
    expect((await stored(r.backend)).visits.count).toBe(0);
    r.brain.stop();
  });
});

/** Beats of 15 seconds, each one's bubble written down and dismissed: what was said, in order. */
async function said(r: Awaited<ReturnType<typeof rig>>, beats: number): Promise<string[]> {
  const out: string[] = [];
  for (let i = 0; i < beats; i++) {
    r.clock.t += 15_000;
    r.brain.onSample(r.sample());
    r.brain.tick();
    await new Promise((res) => setTimeout(res, 4));
    const b = r.s().bubble;
    if (b) {
      out.push(b.text);
      r.brain.dismissBubble(b.id, "seen");
    }
  }
  return out;
}

/** Beats of 15 seconds (each one given a moment for the sync and the like to finish, a bubble put away) until `done`, at most `max` of them; the beats it took. */
async function until(r: Awaited<ReturnType<typeof rig>>, done: () => boolean, max = 400): Promise<number> {
  for (let i = 0; i < max; i++) {
    if (done()) return i;
    r.clock.t += 15_000;
    r.brain.onSample(r.sample());
    r.brain.tick();
    await new Promise((res) => setTimeout(res, 3));
    if (!done()) r.hush();
  }
  return max;
}

const week = (key: string, done: number) => ({ week: { key, done, stickers: 0, trips: 0 } });
const BLOB = /Procrastination Blob/;

describe("the notice that the blob is beaten (review HIGH 1)", () => {
  it("is not told once its week is over: a win on a Friday that was 'done for today' is not news on Monday", async () => {
    const r = await rig({
      start: at(10, 30, 10),
      prefs: { useCalendar: false },
      life: week("2026-10-26", 14),
      setup: (b) => b.storage.save("plan", { plans: [], doneUntil: at(11, 2, 9) }),
    });
    await r.brain.complete(r.s().next!);
    await vi.waitFor(() => expect(r.s().life.bossWins).toEqual(["2026-W44"]));
    // The rest of Friday and the weekend: done for today holds everything back.
    expect((await said(r, 6)).filter((t) => BLOB.test(t))).toEqual([]);
    // Monday morning: a new week, a new blob. Last week's news is not told ("this week" would be wrong).
    r.clock.t = at(11, 2, 9, 1);
    const monday = await said(r, 100);
    expect(monday.filter((t) => BLOB.test(t))).toEqual([]);
    // The medal and the record stay.
    expect(r.s().life).toMatchObject({ bossWins: ["2026-W44"], pageMedals: 1 });
    r.brain.stop();
  }, 30_000);

  it("waits for the morning greeting instead of taking its place, and is told right after it (same week)", async () => {
    // Won on Tuesday evening while done for today until Wednesday 9:00: the same ISO week.
    const r = await rig({
      start: at(10, 27, 17),
      prefs: { useCalendar: false },
      life: week("2026-10-26", 14),
      setup: (b) => b.storage.save("plan", { plans: [], doneUntil: at(10, 28, 9) }),
    });
    await r.brain.complete(r.s().next!);
    await vi.waitFor(() => expect(r.s().life.bossWins).toEqual(["2026-W44"]));
    await said(r, 4);
    r.clock.t = at(10, 28, 9, 1);
    const told = await said(r, 100);
    const blob = told.findIndex((t) => BLOB.test(t));
    expect(blob).toBeGreaterThan(0);
    expect(told[0]).not.toMatch(BLOB);
    expect(told[0]).toMatch(/morning/i);
    expect(told[blob]).toMatch(/\+50 XP/);
    // Said once.
    expect(told.filter((t) => BLOB.test(t))).toHaveLength(1);
    r.brain.stop();
  }, 30_000);

  it("is told on the beat when nothing waits for it, as before", async () => {
    const r = await rig({ life: week("2026-10-26", 14) });
    await r.brain.complete(r.s().next!);
    await vi.waitFor(() => expect(r.s().life.bossWins).toEqual(["2026-W44"]));
    r.hush();
    const told = await said(r, 8);
    expect(told.filter((t) => BLOB.test(t))).toHaveLength(1);
    r.brain.stop();
  });

  it("is dropped cleanly by a restart: the medal and the diary keep the record, and nothing is paid twice", async () => {
    const r = await rig({ life: week("2026-10-26", 14), prefs: { useCalendar: false } });
    const diary = vi.spyOn(r.brain.diary, "add");
    await r.brain.complete(r.s().next!);
    await vi.waitFor(() => expect(r.s().life.bossWins).toEqual(["2026-W44"]));
    expect(diary.mock.calls.some((c) => /Procrastination Blob/.test(String(c[1])))).toBe(true);
    const xp = r.s().life.xp;
    await new Promise((res) => setTimeout(res, 300));
    r.brain.stop();
    const again = await rig({ backend: r.backend, clock: r.clock, prefs: { useCalendar: false } });
    expect((await said(again, 12)).filter((t) => BLOB.test(t))).toEqual([]);
    expect(again.s().life).toMatchObject({ bossWins: ["2026-W44"], xp, pageMedals: 1 });
    again.brain.stop();
  });
});

describe("a win while a close is in flight (review MEDIUM 4)", () => {
  /** A local time in January 2027 (2026-W53 ends on Sunday the 3rd, 2027-W01 starts on Monday the 4th). */
  const jan = (day: number, h: number, m = 0, s = 0) => new Date(2027, 0, day, h, m, s).getTime();
  const gated = (r: Awaited<ReturnType<typeof rig>>) => {
    let release!: () => void;
    let fail!: () => void;
    const gate = new Promise<void>((res, rej) => {
      release = res;
      fail = () => rej(new Error("Todoist said no"));
    });
    vi.spyOn(r.backend.todoist, "close").mockImplementation(() => gate);
    return { release, fail };
  };

  it("pays the week it was beaten in, when the close lands after Sunday midnight (2026-W53 into 2027-W01)", async () => {
    const r = await rig({ start: jan(3, 23, 59, 30), prefs: { useCalendar: false }, life: week("2026-12-28", 14) });
    expect(r.s().boss).toMatchObject({ week: "2026-W53", maxHp: 15, defeated: false });
    const { release } = gated(r);
    const xp = r.s().life.xp;
    const closing = r.brain.complete(r.s().next!);
    expect(r.s().boss).toMatchObject({ week: "2026-W53", defeated: true });
    expect(r.s().life.bossWins).toEqual([]); // not while the close is in flight
    // Midnight passes while Todoist is slow.
    r.clock.t = jan(4, 0, 0, 20);
    r.tick(0);
    expect(r.s().boss).toMatchObject({ week: "2027-W01", defeated: false, damage: 0 });
    release();
    await closing;
    expect(r.s().life.bossWins).toEqual(["2026-W53"]);
    expect(r.s().life.pageMedals).toBe(1);
    expect(r.s().life.xp).toBeGreaterThanOrEqual(xp + 50);
    // The new week's blob is a blob of its own: still there to fight, and a friend's card alone does not win it.
    expect(r.s().boss).toMatchObject({ week: "2027-W01", maxHp: 15, hp: 15, defeated: false });
    await r.brain.addFriendCard(text({ date: "2027-01-04", week: "2027-W01", weekDone: 40 }));
    expect(r.s().boss).toMatchObject({ week: "2027-W01", maxHp: 30, damage: 15, defeated: false });
    expect(r.s().life.bossWins).toEqual(["2026-W53"]);
    expect(r.s().life.pageMedals).toBe(1);
    r.brain.stop();
  }, 30_000);

  it("pays the same week as soon as the close lands, without waiting for the next beat", async () => {
    const r = await rig({ life: week("2026-10-26", 14), prefs: { useCalendar: false } });
    const { release } = gated(r);
    const closing = r.brain.complete(r.s().next!);
    expect(r.s().life.bossWins).toEqual([]);
    release();
    await closing;
    expect(r.s().life.bossWins).toEqual(["2026-W44"]);
    r.brain.stop();
  });

  it("pays nothing when Todoist refuses the close, even across midnight", async () => {
    const r = await rig({ start: jan(3, 23, 59, 30), prefs: { useCalendar: false }, life: week("2026-12-28", 14) });
    const { fail } = gated(r);
    const closing = r.brain.complete(r.s().next!);
    expect(r.s().boss.defeated).toBe(true);
    r.clock.t = jan(4, 0, 0, 20);
    r.tick(0);
    fail();
    await closing;
    await said(r, 6);
    expect(r.s().life.bossWins).toEqual([]);
    expect(r.s().life.pageMedals).toBe(0);
    r.brain.stop();
  }, 30_000);

  it("pays once when two closes are in flight and the second lands last", async () => {
    const r = await rig({ life: week("2026-10-26", 13), prefs: { useCalendar: false } });
    const { release } = gated(r);
    const tasks = r.s().day.today.filter((t) => !t.checked);
    const a = r.brain.complete(tasks[0]);
    const b = r.brain.complete(tasks[1]);
    expect(r.s().boss.defeated).toBe(true);
    release();
    await Promise.all([a, b]);
    expect(r.s().life.bossWins).toEqual(["2026-W44"]);
    expect(r.s().life.pageMedals).toBe(1);
    r.brain.stop();
  });
});

describe("undoing the task that beat the blob (review LOW 5)", () => {
  /** Finishes a task, undoes it, finishes the next: the XP after each step, and the medals. */
  async function run(done: number) {
    const r = await rig({ life: week("2026-10-26", done), prefs: { useCalendar: false } });
    const xp = [r.s().life.xp];
    const task = r.s().next!;
    await r.brain.complete(task);
    await new Promise((res) => setTimeout(res, 300));
    xp.push(r.s().life.xp);
    await r.brain.undoComplete(task);
    xp.push(r.s().life.xp);
    const after = { wins: [...r.s().life.bossWins], medals: r.s().life.pageMedals, defeated: r.s().boss.defeated };
    await r.brain.complete(r.s().next!);
    await new Promise((res) => setTimeout(res, 300));
    xp.push(r.s().life.xp);
    const end = { wins: [...r.s().life.bossWins], medals: r.s().life.pageMedals };
    r.brain.stop();
    return { xp, after, end };
  }

  it("keeps the reward: the week was beaten, and a medal is not taken back by a changed mind", async () => {
    const control = await run(5); // an ordinary task, undone: nothing to win
    const win = await run(14); // the 15th, undone
    expect(control.after).toEqual({ wins: [], medals: 0, defeated: false });
    // The blob has 1 HP again, but the 🏅 stays and so do its 50 XP: undoing takes back only what the task itself gave.
    expect(win.after).toEqual({ wins: ["2026-W44"], medals: 1, defeated: false });
    expect(win.xp[2] - win.xp[0]).toBe(control.xp[2] - control.xp[0] + 50);
    // Finishing the next one beats it again, and pays nothing more: one reward per week.
    expect(win.end).toEqual({ wins: ["2026-W44"], medals: 1 });
    expect(win.xp[3] - win.xp[2]).toBe(control.xp[3] - control.xp[2]);
  }, 30_000);
});

describe("visits: when the first one comes (review MEDIUM 2)", () => {
  const delay = (r: Awaited<ReturnType<typeof rig>>, day: string) => fr.visitDelayMs(r.s().myKey!, day);
  const BEAT = 15_000;

  it("comes at its time after a short break: a coffee doesn't start the wait again", async () => {
    const r = await withFriend();
    const due = r.clock.t + delay(r, "2026-10-28");
    // Idle for a quarter of an hour in all (under the 30 minutes that count as being away for long).
    r.show({ idleSeconds: 400 });
    r.clock.t += 10 * MIN;
    r.tick(0);
    r.show({});
    expect(await until(r, () => r.clock.t >= due - BEAT)).toBeLessThan(400);
    expect(r.s().visitor).toBeNull();
    await until(r, () => r.s().visitor !== null, 10);
    expect(r.s().visitor).not.toBeNull();
    expect(r.clock.t).toBeLessThan(due + 3 * MIN);
    r.brain.stop();
  }, 30_000);

  it("starts the wait again when you come back after a long time away, even if its time has long passed", async () => {
    const r = await withFriend({}, { start: at(10, 28, 11) });
    // Away from 11:05 to 14:00: the friend's time passed meanwhile.
    r.show({ idleSeconds: 4000 });
    r.clock.t = at(10, 28, 14, 0);
    r.tick(0);
    expect(r.s().visitor).toBeNull();
    // Back at the keyboard at 14:00: not at once, but its wait from now.
    r.show({ idleSeconds: 0 });
    const due = r.clock.t + delay(r, "2026-10-28");
    await until(r, () => r.clock.t >= due - BEAT);
    expect(r.s().visitor).toBeNull();
    await until(r, () => r.s().visitor !== null, 10);
    expect(r.s().visitor).not.toBeNull();
    r.brain.stop();
  }, 30_000);

  it("waits overnight too: an always-on PC does not greet you with a visitor the moment you sit down", async () => {
    const r = await withFriend({}, { start: at(10, 28, 23, 50) });
    r.show({ idleSeconds: 3600 });
    for (let t = at(10, 29, 0, 5); t <= at(10, 29, 8, 59); t += 15 * MIN) {
      r.clock.t = t;
      r.tick(0);
    }
    expect(r.s().visitor).toBeNull();
    r.clock.t = at(10, 29, 9, 0);
    r.show({ idleSeconds: 0 });
    const due = r.clock.t + delay(r, "2026-10-29");
    await until(r, () => r.clock.t >= due - BEAT);
    expect(r.s().visitor).toBeNull();
    await until(r, () => r.s().visitor !== null, 20);
    expect(r.s().visitor).not.toBeNull();
    expect(r.clock.t).toBeLessThan(due + 5 * MIN);
    r.brain.stop();
  }, 30_000);

  it("does not start it again once the day's first visit has been, however long you are away", async () => {
    const r = await withFriend();
    await until(r, () => r.s().visitor !== null);
    const first = r.s().visitor!;
    expect(first).not.toBeNull();
    r.clock.t = first.end + 1000;
    r.tick(1);
    // Away for three hours, back: the day's second visit is due (two hours after the first), not a delay later.
    r.show({ idleSeconds: 3 * 3600 });
    r.clock.t = first.start + 3 * 3_600_000;
    r.tick(0);
    r.show({ idleSeconds: 0 });
    await until(r, () => r.s().visitor !== null, 12);
    expect(r.s().visitor).not.toBeNull();
    r.brain.stop();
  }, 30_000);

  it("never comes before the morning greeting has been told", async () => {
    // The greeting is held back for two hours by the gap between bubbles; a visit isn't, and is due within 75 minutes.
    const r = await withFriend(
      {},
      {
        greetingToCome: true,
        prefs: { bubbleGap: 120 },
        beforeStart: (b) => {
          b.say({ text: "Something said just now", seconds: 5, urgent: true });
        },
      },
    );
    const log: string[] = [];
    const stop = r.brain.subscribe(() => {
      const st = r.s();
      if (st.bubble && /^Good (morning|day|afternoon|evening)/.test(st.bubble.text) && log.at(-1) !== "greeting") log.push("greeting");
      if (st.visitor && log.at(-1) !== "visitor") log.push("visitor");
    });
    await until(r, () => log.includes("visitor"), 4 * 60 * 4);
    stop();
    expect(log[0]).toBe("greeting");
    expect(log).toContain("visitor");
    // Told after the 2 hours, a visit's own 15 to 75 minutes would have been over long before.
    r.brain.stop();
  }, 60_000);
});

describe("visits: other calls", () => {
  it("not while a call is in front, and it goes when one starts (SECURITY L3)", async () => {
    const zoom = { name: "Zoom", exe: "Zoom.exe", title: "Zoom Meeting" };
    const r = await withFriend();
    r.show({ app: zoom });
    r.wait(FIRST);
    expect(r.s().visitor).toBeNull();
    r.show({});
    r.settle();
    expect(r.s().visitor).not.toBeNull();
    // A call tab in a browser counts too.
    r.clock.t += 6000;
    r.show({ app: { name: "Google Chrome", exe: "chrome.exe", title: "Meet" }, url: "https://meet.google.com/abc-defg-hij" });
    r.tick(1);
    expect(r.s().visitor === null || r.s().visitor!.end - r.clock.t <= 4000).toBe(true);
    r.brain.stop();
  });

  it("starts from a file with an impossible last visit: it counts as just now, and the next one comes two hours later", async () => {
    const r = await withFriends([{ lastVisit: 1e15 }], { visits: { day: "2026-10-28", count: 1, lastAt: 1e15 } });
    const start = r.clock.t;
    await until(r, () => r.s().visitor !== null || r.clock.t >= start + 100 * MIN);
    expect(r.s().visitor).toBeNull();
    await until(r, () => r.s().visitor !== null, 4 * 60);
    expect(r.s().visitor).not.toBeNull();
    expect(r.clock.t - start).toBeGreaterThanOrEqual(2 * 3_600_000 - MIN);
    r.brain.stop();
  }, 30_000);

  it("makes a visitor that leaves go at the end of its walk without waiting for the next beat (review LOW 6)", async () => {
    const r = await withFriend();
    r.wait(FIRST);
    const v = r.s().visitor!;
    expect(v).not.toBeNull();
    // Past the walk in, so it can walk out.
    r.clock.t = v.start + 8000;
    vi.useFakeTimers();
    try {
      r.brain.boardOpened();
      expect(r.s().visitor).not.toBeNull();
      const leaving = r.s().visitor!;
      expect(leaving.end - r.clock.t).toBe(VISIT_WALK_MS);
      // No beat comes. The walk takes its 3.5 seconds, and it is gone.
      r.clock.t += VISIT_WALK_MS + 100;
      vi.advanceTimersByTime(VISIT_WALK_MS + 200);
      expect(r.s().visitor).toBeNull();
    } finally {
      vi.useRealTimers();
    }
    r.brain.stop();
  });
});
