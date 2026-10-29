// v0.6 "Friends" in the brain: the friends document, my card, adding and removing friends, the buddy streaks, the weekly
// boss and its one reward, and visits at calm moments (ambient: never a bubble, never counted).
import { describe, expect, it, vi } from "vitest";
import { createDemoBackend, sampleTasks, type DemoBackend } from "../backend/demo";
import type { SystemSample } from "../backend/types";
import { Brain, type Bubble } from "./brain";
import { dayKey } from "./dates";
import {
  MAX_FRIENDS,
  VISIT_GAP_MS,
  VISIT_SECONDS,
  decodeCard,
  docFromJson,
  encodeCard,
  isoWeekKey,
  type PetCard,
} from "./friends";
import { setLang } from "./l10n";
import { demoHistory, demoLife, type LifeState } from "./life";
import { defaultPrefs, type Prefs } from "./prefs";

const MIN = 60_000;
const at = (month: number, day: number, h: number, m = 0) => new Date(2026, month - 1, day, h, m).getTime();
const NEVER_TYPING = 999;

const h28 = (tail: string) => tail.padStart(28, "-");

/** A friend's card on the rig's days (Wednesday 28 October 2026 unless `date` says otherwise). */
function friendCard(patch: Partial<PetCard> = {}): PetCard {
  const date = patch.date ?? "2026-10-28";
  return {
    id: "friend-mai-0001",
    name: "Mai",
    species: "shiba",
    accessories: ["flowercrown"],
    stage: 2,
    streak: 6,
    best: 12,
    week: isoWeekKey(date),
    weekDone: 9,
    history: h28("GGGGGG"),
    date,
    ...patch,
  };
}
const text = (patch: Partial<PetCard> = {}) => encodeCard(friendCard(patch));

interface Rig {
  start?: number;
  life?: Partial<LifeState>;
  prefs?: Partial<Prefs>;
  random?: () => number;
  setup?: (b: DemoBackend) => Promise<void> | void;
  backend?: DemoBackend;
  clock?: { t: number };
}

/** The demo on Wednesday 28 October 2026 at 9:00, with `life` (for today) and `prefs` saved first. */
async function rig(opts: Rig = {}) {
  const clock = opts.clock ?? { t: opts.start ?? at(10, 28, 9) };
  const backend = opts.backend ?? createDemoBackend({ now: () => clock.t, persist: false });
  await opts.setup?.(backend);
  if (opts.life) await backend.storage.save("life", { ...demoLife(), dayKey: dayKey(new Date(clock.t)), ...opts.life });
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

const stored = async (backend: DemoBackend) => docFromJson(await backend.storage.load("friends"), () => "unused-for-this-test-id").doc;

describe("the friends document", () => {
  it("makes this install's id once, saves it, and keeps it across restarts", async () => {
    const r = await rig();
    const doc = await stored(r.backend);
    expect(doc.installId).toMatch(/^[a-z0-9]{20}$/);
    const card = decodeCard(r.brain.myCard(), dayKey(new Date(r.clock.t)));
    expect(card).toMatchObject({ ok: true, card: { id: doc.installId } });
    r.brain.stop();
    const again = await rig({ backend: r.backend, clock: r.clock });
    expect((await stored(r.backend)).installId).toBe(doc.installId);
    expect(decodeCard(again.brain.myCard(), "2026-10-28")).toMatchObject({ ok: true, card: { id: doc.installId } });
    again.brain.stop();
  });

  it("gives two installs two different ids", async () => {
    const a = await rig();
    const b = await rig();
    expect((await stored(a.backend)).installId).not.toBe((await stored(b.backend)).installId);
    a.brain.stop();
    b.brain.stop();
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
    // It works with an id of its own for this session…
    expect(r.brain.addFriendCard(text())).toMatchObject({ ok: true });
    expect(r.s().friends).toHaveLength(1);
    // …but writes nothing over what is on disk.
    expect(save).not.toHaveBeenCalledWith("friends", expect.anything());
    r.brain.stop();
  }, 10_000);
});

describe("my card", () => {
  it("is built live from the pet and the settings, and reads back", async () => {
    const r = await rig({
      life: { xp: 320, streak: 4, bestStreak: 9, wearing: ["scarf"], unlocked: ["scarf"], week: { key: "2026-10-26", done: 5, stickers: 0, trips: 0 } },
      prefs: { petName: "Bánh Bao", species: "panda" },
    });
    const out = decodeCard(r.brain.myCard(), "2026-10-28");
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.card).toMatchObject({ name: "Bánh Bao", species: "panda", accessories: ["scarf"], stage: 2, streak: 4, best: 9, week: "2026-W44", weekDone: 5, date: "2026-10-28" });
    expect(out.card.history).toHaveLength(28);
    r.brain.stop();
  });

  it("follows the pet: a new name, a task finished, a new day", async () => {
    const r = await rig({ life: { week: { key: "2026-10-26", done: 5, stickers: 0, trips: 0 } }, prefs: { petName: "Mochi" } });
    const read = () => {
      const out = decodeCard(r.brain.myCard(), dayKey(new Date(r.clock.t)));
      if (!out.ok) throw new Error("my own card should read");
      return out.card;
    };
    expect(read().name).toBe("Mochi");
    await r.brain.updatePrefs({ petName: "Kem" });
    expect(read().name).toBe("Kem");
    const before = read();
    await r.brain.complete(r.s().next!);
    expect(read().weekDone).toBe(before.weekDone + 1);
    expect(read().history.endsWith("K")).toBe(true);
    r.brain.stop();
  });

  it("marks today with the goal met once the daily target is done", async () => {
    const r = await rig({ prefs: { dailyTarget: 1 } });
    // One task is already done today in the demo.
    const out = decodeCard(r.brain.myCard(), "2026-10-28");
    expect(out).toMatchObject({ ok: true });
    if (out.ok) expect(out.card.history.endsWith("G")).toBe(true);
    r.brain.stop();
  });

  it("carries the days the pet settled over the ones it didn't, today live", async () => {
    // The demo treats every day as a workday unless you took it off, so a day nobody settled is `-`.
    const r = await rig({ life: { history: { "2026-10-27": "G", "2026-10-26": "K", "2026-10-25": "R" } } });
    const out = decodeCard(r.brain.myCard(), "2026-10-28");
    if (!out.ok) throw new Error("should read");
    // Oldest first: Sat 24th `-` (nobody settled it), Sun 25th R, Mon 26th K, Tue 27th G, and today: one task of three, K.
    expect(out.card.history.slice(-5)).toBe("-RKGK");
    r.brain.stop();
  });

  it("holds no task title, time, app name or user name", async () => {
    const r = await rig();
    const json = JSON.stringify(decodeCard(r.brain.myCard(), "2026-10-28"));
    for (const secret of ["weekly report", "Call client", "Plan the next sprint", "boss", "Visual Studio Code", "brain.ts", "demo.todopet", "Team sync"]) expect(json).not.toContain(secret);
    r.brain.stop();
  });
});

describe("adding and removing friends", () => {
  it("adds a friend from a card, shows them, and saves them", async () => {
    const r = await rig();
    const out = r.brain.addFriendCard(text());
    expect(out).toMatchObject({ ok: true, replaced: false });
    expect(r.s().friends.map((f) => [f.id, f.name, f.species])).toEqual([["friend-mai-0001", "Mai", "shiba"]]);
    await vi.waitFor(async () => expect((await stored(r.backend)).friends).toHaveLength(1));
    r.brain.stop();
  });

  it("answers a bad card kindly, changes nothing and saves nothing", async () => {
    const r = await rig();
    const save = vi.spyOn(r.backend.storage, "save");
    const out = r.brain.addFriendCard("TODOPET1.not-a-card");
    expect(out).toMatchObject({ ok: false, error: "encoding" });
    if (!out.ok) expect(out.message).toMatch(/card/i);
    expect(r.brain.addFriendCard("")).toMatchObject({ ok: false, error: "empty" });
    expect(r.brain.addFriendCard("hello")).toMatchObject({ ok: false, error: "prefix" });
    expect(r.s().friends).toEqual([]);
    expect(save).not.toHaveBeenCalledWith("friends", expect.anything());
    r.brain.stop();
  });

  it("refuses its own card", async () => {
    const r = await rig();
    const out = r.brain.addFriendCard(r.brain.myCard());
    expect(out).toMatchObject({ ok: false, error: "self" });
    expect(r.s().friends).toEqual([]);
    r.brain.stop();
  });

  it("replaces a friend with their newer card and refuses an older one", async () => {
    const r = await rig();
    r.brain.addFriendCard(text({ date: "2026-10-26", weekDone: 2 }));
    expect(r.brain.addFriendCard(text({ date: "2026-10-28", weekDone: 9, name: "Mai ✨" }))).toMatchObject({ ok: true, replaced: true });
    expect(r.s().friends).toHaveLength(1);
    expect(r.s().friends[0]).toMatchObject({ name: "Mai ✨", weekDone: 9, date: "2026-10-28" });
    expect(r.brain.addFriendCard(text({ date: "2026-10-27", weekDone: 4 }))).toMatchObject({ ok: false, error: "older" });
    expect(r.s().friends[0].weekDone).toBe(9);
    r.brain.stop();
  });

  it("holds 12 friends", async () => {
    const r = await rig();
    for (let i = 0; i < MAX_FRIENDS; i++) expect(r.brain.addFriendCard(text({ id: `friend-${String(i).padStart(8, "0")}`, name: `F${i}` }))).toMatchObject({ ok: true });
    expect(r.brain.addFriendCard(text({ id: "friend-thirteen-001" }))).toMatchObject({ ok: false, error: "full" });
    expect(r.s().friends).toHaveLength(12);
    r.brain.stop();
  });

  it("removes a friend and saves", async () => {
    const r = await rig();
    r.brain.addFriendCard(text());
    r.brain.addFriendCard(text({ id: "friend-bin-0002", name: "Bin" }));
    expect(r.brain.removeFriend("friend-mai-0001")).toBe(true);
    expect(r.s().friends.map((f) => f.name)).toEqual(["Bin"]);
    expect(r.brain.removeFriend("friend-mai-0001")).toBe(false);
    await vi.waitFor(async () => expect((await stored(r.backend)).friends.map((f) => f.name)).toEqual(["Bin"]));
    r.brain.stop();
  });

  it("remembers friends across restarts", async () => {
    const r = await rig();
    r.brain.addFriendCard(text());
    await vi.waitFor(async () => expect((await stored(r.backend)).friends).toHaveLength(1));
    r.brain.stop();
    const again = await rig({ backend: r.backend, clock: r.clock });
    expect(again.s().friends.map((f) => f.name)).toEqual(["Mai"]);
    again.brain.stop();
  });

  it("tells the diary a friend was added, without the friend's name", async () => {
    const r = await rig();
    const diary = vi.spyOn(r.brain.diary, "add");
    r.brain.addFriendCard(text({ name: "Secretname" }));
    const lines = diary.mock.calls.map((c) => String(c[1]));
    expect(lines.some((l) => /friend/i.test(l))).toBe(true);
    expect(lines.join("\n")).not.toContain("Secretname");
    r.brain.stop();
  });
});

describe("buddy streaks in the state", () => {
  it("counts back from the latest day both cards cover, against my card as it stands now", async () => {
    // Mine, oldest first: Fri 23 G, Sat 24 R, Sun 25 R, Mon 26 G, Tue 27 G, and today (one task of three: K).
    const r = await rig({ life: { history: { "2026-10-22": "K", "2026-10-23": "G", "2026-10-24": "R", "2026-10-25": "R", "2026-10-26": "G", "2026-10-27": "G" } } });
    r.brain.addFriendCard(text({ history: h28("GGGGGGG") }));
    // Today is open for both: it doesn't count. 27th, 26th: +2. 25th, 24th: rests. 23rd: +1. 22nd: my K ends it.
    expect(r.s().buddyStreaks["friend-mai-0001"]).toBe(3);
    r.brain.stop();
  });

  it("is 0 for a friend with no goal days in common, and has no entry for a friend that was removed", async () => {
    const r = await rig({ life: { history: {} } });
    r.brain.addFriendCard(text({ history: h28("KKKK") }));
    expect(r.s().buddyStreaks["friend-mai-0001"]).toBe(0);
    r.brain.removeFriend("friend-mai-0001");
    expect(r.s().buddyStreaks).toEqual({});
    r.brain.stop();
  });

  it("lines cards of different dates up by day", async () => {
    const r = await rig({ life: { history: { "2026-10-24": "G", "2026-10-25": "G", "2026-10-26": "G", "2026-10-27": "G" } } });
    r.brain.addFriendCard(text({ date: "2026-10-26", history: h28("GGG") }));
    // Her card ends on the 26th: 26th, 25th, 24th are all goal days for us both.
    expect(r.s().buddyStreaks["friend-mai-0001"]).toBe(3);
    r.brain.stop();
  });
});

describe("the weekly boss", () => {
  const myWeek = (done: number) => ({ week: { key: "2026-10-26", done, stickers: 0, trips: 0 } });

  it("has 15 HP for you and each friend with a card from this week", async () => {
    const r = await rig({ life: myWeek(2) });
    expect(r.s().boss).toMatchObject({ week: "2026-W44", maxHp: 15, damage: 2, hp: 13, defeated: false });
    r.brain.addFriendCard(text({ weekDone: 4 }));
    expect(r.s().boss).toMatchObject({ maxHp: 30, damage: 6, hp: 24 });
    r.brain.stop();
  });

  it("does not count a friend whose card is from an earlier week", async () => {
    const r = await rig({ life: myWeek(2) });
    r.brain.addFriendCard(text({ date: "2026-10-23", weekDone: 40 }));
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
    const r = await rig({ life: { ...myWeek(5), xp: 200, pageFilled: 4, pageMedals: 0 } });
    r.brain.addFriendCard(text({ weekDone: 10 }));
    expect(r.s().boss.defeated).toBe(false);
    r.brain.addFriendCard(text({ weekDone: 25 }));
    expect(r.s().boss).toMatchObject({ defeated: true, hp: 0 });
    expect(r.s().life).toMatchObject({ xp: 250, bossWins: ["2026-W44"], pageFilled: 5, pageMedals: 1 });
    // More damage, more friends, another card: still the one reward.
    r.brain.addFriendCard(text({ id: "friend-bin-0002", name: "Bin", weekDone: 30 }));
    r.brain.addFriendCard(text({ weekDone: 60 }));
    expect(r.s().life).toMatchObject({ xp: 250, bossWins: ["2026-W44"], pageMedals: 1 });
    r.brain.stop();
  });

  it("is saved with the pet's life", async () => {
    const r = await rig({ life: myWeek(14) });
    r.brain.addFriendCard(text({ weekDone: 16 }));
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
    const r = await rig({ life: myWeek(5) });
    const chime = vi.fn();
    r.brain.effects.chime = chime;
    r.brain.addFriendCard(text({ weekDone: 40 }));
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
    // Sunday 1 November.
    const r = await rig({ start: at(11, 1, 9), life: { week: { key: "2026-10-26", done: 3, stickers: 0, trips: 0 } } });
    r.brain.addFriendCard(text({ date: "2026-11-01", weekDone: 30 }));
    expect(r.s().boss).toMatchObject({ week: "2026-W44", defeated: true });
    expect(r.s().life.bossWins).toEqual(["2026-W44"]);
    // Monday 2 November.
    r.clock.t = at(11, 2, 9);
    r.tick();
    expect(r.s().boss).toMatchObject({ week: "2026-W45", maxHp: 15, damage: 0, hp: 15, defeated: false, waiting: 1 });
    r.brain.addFriendCard(text({ date: "2026-11-02", weekDone: 40 }));
    expect(r.s().boss).toMatchObject({ week: "2026-W45", defeated: true });
    expect(r.s().life.bossWins).toEqual(["2026-W44", "2026-W45"]);
    expect(r.s().life.pageMedals).toBe(2);
    r.brain.stop();
  });
});

describe("visits", () => {
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
          installId: "my-install-id-00001",
          friends: friends.map(({ lastVisit, ...c }) => ({ ...friendCard(c), lastVisit: lastVisit ?? null })),
          visits: { day: "", count: 0, lastAt: null },
        };
        await b.storage.save("friends", JSON.parse(JSON.stringify(doc)));
      },
    });
  const withFriend = (patch: Partial<PetCard> = {}, rigOpts: Rig = {}) => withFriends([patch], rigOpts);

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
    expect(v).toMatchObject({ friend: { id: "friend-mai-0001", name: "Mai" } });
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
    expect(r.s().visitor?.streak).toBe(r.s().buddyStreaks["friend-mai-0001"]);
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
      r.settle();
      expect(r.s().visitor).not.toBeNull();
      r.brain.stop();
    });

    it("not while a bubble is waiting", async () => {
      const r = await withFriend();
      r.brain.say({ text: "Waiting for an answer", actions: [{ title: "OK", run: () => undefined }], seconds: 6000, urgent: true });
      for (let i = 0; i < 6; i++) {
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
      r.brain.removeFriend("friend-mai-0001");
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
      { id: "friend-a-000001", name: "A", lastVisit: at(10, 27, 9) },
      { id: "friend-b-000002", name: "B", lastVisit: at(10, 20, 9) },
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
    expect(r.brain.demoAddFriends()).toBe(2);
    expect(r.s().friends).toHaveLength(2);
    expect(r.s().friends.map((f) => f.name)).toEqual(["Mai", "Bin"]);
    expect(r.s().buddyStreaks).toEqual({ "sample-mai-000001": 3, "sample-bin-0000002": 2 });
    expect(r.s().boss.members.length).toBeGreaterThanOrEqual(2);
    // Again: nothing new, nothing broken.
    expect(r.brain.demoAddFriends()).toBe(0);
    expect(r.s().friends).toHaveLength(2);
    r.brain.stop();
  });

  it("clears a plain bubble that is in the way (the demo's hello), so the visitor's label shows", async () => {
    const r = await rig();
    r.brain.demoAddFriends();
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
    r.brain.demoAddFriends();
    expect(r.brain.demoVisit()).toBe(true);
    expect(r.s().visitor).not.toBeNull();
    expect(r.s().bubble).toBeNull();
    expect(r.s().life.dayNudges).toBe(0);
    expect((await stored(r.backend)).visits.count).toBe(0);
    r.brain.stop();
  });
});
