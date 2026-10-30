// v0.7 "Always fresh" in the brain (SPEC v0.7 §2): the check schedule, the once-per-version notice at a calm moment (free of the
// nudge budget), the install flow with its progress and its fallback, the first start of a newer version, and the tray command.
import { describe, expect, it, vi } from "vitest";
import { createDemoBackend, sampleTasks, type DemoBackend } from "../backend/demo";
import { BackendError, type AvailableUpdate, type AppCommand, type SystemSample, type UpdateProgress, type UpdateStatus } from "../backend/types";
import { Brain, showsOverBoard, type Bubble } from "./brain";
import { dayKey } from "./dates";
import { setLang } from "./l10n";
import { demoLife, type LifeState } from "./life";
import { defaultPrefs, type Prefs } from "./prefs";

const MIN = 60_000;
const HOUR = 60 * MIN;
const at = (month: number, day: number, h: number, m = 0) => new Date(2026, month - 1, day, h, m).getTime();
const flush = () => new Promise((r) => setTimeout(r, 25));

const NOTES = "## What's new\n\n- Faster board when your task list is long\n- Fixed the focus timer drifting after sleep\n- Kinder wording when Todoist can't be reached";

interface Rig {
  start?: number;
  life?: Partial<LifeState>;
  prefs?: Partial<Prefs>;
  /** What the backend says about the update (the demo's own: 0.7.0, finds 0.7.1). */
  status?: Partial<UpdateStatus>;
  /** The version the app runs (the demo's is 0.7.0). */
  current?: string;
  setup?: (b: DemoBackend) => void;
  backend?: DemoBackend;
  clock?: { t: number };
  greetingToCome?: boolean;
  /** The language the pet speaks (English unless asked: Brain.create takes it from the saved prefs, and the rig puts it back). */
  lang?: "en" | "vi";
}

/** The demo on Wednesday 28 October 2026 at 9:00. The nudge budget is spent and the gap between bubbles is 0, so only the update speaks. */
async function rig(opts: Rig = {}) {
  const clock = opts.clock ?? { t: opts.start ?? at(10, 28, 9) };
  const backend = opts.backend ?? createDemoBackend({ now: () => clock.t, persist: false, fastUpdates: true });
  opts.setup?.(backend);
  // No timed task to remind of in the next hour, and no calendar of the demo's own.
  backend.todoist.tasks = async () => sampleTasks(new Date(clock.t)).map((t) => (t.id === "2" ? { ...t, due: { date: dayKey(new Date(clock.t)), string: "today" } } : t));
  if (opts.current || opts.status) {
    const real = backend.updates.status.bind(backend.updates);
    const patched = async (): Promise<UpdateStatus> => ({ ...(await real()), ...(opts.current ? { current: opts.current } : {}), ...opts.status });
    backend.updates.status = patched;
  }
  const today = dayKey(new Date(clock.t));
  const told = opts.greetingToCome ? {} : { dayFired: { [`morning-${today}`]: clock.t } };
  if (!opts.backend) await backend.storage.save("life", { ...demoLife(), dayKey: today, ...told, ...opts.life });
  await backend.storage.save("prefs", { ...defaultPrefs(clock.t), useCalendar: false, nudgeBudget: 0, bubbleGap: 0, ...opts.prefs });
  let front: Partial<SystemSample> = {};
  const sample = (): SystemSample => ({
    app: { name: "Visual Studio Code", exe: "code.exe", title: "work" },
    url: null,
    idleSeconds: 0,
    secondsSinceKey: 999,
    fullscreen: false,
    appSwitchedAt: clock.t - 60 * MIN,
    ...front,
  });
  const brain = await Brain.create(backend, { demo: true, now: () => clock.t, random: () => 0.5 });
  setLang(opts.lang ?? "en");
  /** Every bubble that was put up, in order. */
  const shown: Bubble[] = [];
  brain.subscribe(() => {
    const b = brain.getSnapshot().bubble;
    if (b && !shown.some((x) => x.id === b.id)) shown.push(b);
  });
  await brain.start();
  const s = () => brain.getSnapshot();
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
  const tick = (seconds = 15) => {
    clock.t += seconds * 1000;
    brain.onSample(sample());
    brain.tick();
  };
  /** Beats until the first check has been made and what it found has been told (or not). */
  const settle = async () => {
    tick(125);
    await flush();
    tick(15);
    await flush();
  };
  const notice = () => shown.filter((b) => b.text.includes("new version of me"));
  return { clock, backend, brain, show, tick, settle, hush, s, shown, notice, sample };
}

/** An install the test steers: progress by hand, then it succeeds or fails when told. */
function steered(backend: DemoBackend) {
  let report: (p: UpdateProgress) => void = () => undefined;
  let done: { resolve: () => void; reject: (e: unknown) => void } = { resolve: () => undefined, reject: () => undefined };
  /** The progress callback each attempt was given, oldest first (a channel can deliver a message after its attempt is over). */
  const reporters: ((p: UpdateProgress) => void)[] = [];
  const install = vi.fn((onProgress: (p: UpdateProgress) => void) => {
    report = onProgress;
    reporters.push(onProgress);
    return new Promise<void>((resolve, reject) => (done = { resolve, reject }));
  });
  backend.updates.install = install;
  return { install, reporters, progress: (p: UpdateProgress) => report(p), succeed: () => done.resolve(), fail: (e: unknown = new BackendError({ kind: "internal", message: "boom" })) => done.reject(e) };
}

const found = (patch: Partial<AvailableUpdate> = {}): UpdateStatus => ({
  current: "0.7.0",
  checkedAt: at(10, 28, 9),
  available: { version: "0.7.1", notes: NOTES, publishedAt: null, canInstall: true, manualReason: null, ...patch },
  error: null,
});
/** The app already knows about 0.7.1 (a check was made before: the cached status). */
const knowing = (patch: Partial<AvailableUpdate> = {}): Rig => ({ status: found(patch) });

describe("the check schedule", () => {
  it("makes the first check 2 minutes after the start, not before", async () => {
    const r = await rig();
    const check = vi.spyOn(r.backend.updates, "check");
    r.tick(105);
    await flush();
    expect(check).not.toHaveBeenCalled();
    r.tick(15);
    await flush();
    expect(check).toHaveBeenCalledTimes(1);
    expect(check).toHaveBeenCalledWith(false);
    r.brain.stop();
  });

  it("checks again 6 hours after, not before, and one at a time", async () => {
    const r = await rig();
    const check = vi.spyOn(r.backend.updates, "check");
    await r.settle();
    expect(check).toHaveBeenCalledTimes(1);
    r.hush();
    r.tick(5 * 60 * 60 + 59 * 60);
    await flush();
    expect(check).toHaveBeenCalledTimes(1);
    r.tick(2 * 60);
    r.tick(15);
    await flush();
    expect(check).toHaveBeenCalledTimes(2);
    r.brain.stop();
  });

  it("never asks on its own when automatic checks are off", async () => {
    const r = await rig({ prefs: { autoUpdateCheck: false } });
    const check = vi.spyOn(r.backend.updates, "check");
    r.tick(8 * 3600);
    await flush();
    r.tick(15);
    await flush();
    expect(check).not.toHaveBeenCalled();
    r.brain.stop();
  });

  it("starts asking once automatic checks are turned on", async () => {
    const r = await rig({ prefs: { autoUpdateCheck: false } });
    const check = vi.spyOn(r.backend.updates, "check");
    r.tick(600);
    await flush();
    expect(check).not.toHaveBeenCalled();
    await r.brain.updatePrefs({ autoUpdateCheck: true });
    r.tick(15);
    await flush();
    expect(check).toHaveBeenCalledTimes(1);
    r.brain.stop();
  });

  it("tries again 30 minutes after a check that failed, quietly", async () => {
    const r = await rig();
    const check = vi.spyOn(r.backend.updates, "check").mockResolvedValue({ current: "0.7.0", checkedAt: r.clock.t, available: null, error: { kind: "network", message: "offline" } });
    await r.settle();
    expect(check).toHaveBeenCalledTimes(1);
    // A failure says nothing to you.
    expect(r.shown.filter((b) => /update|version/i.test(b.text))).toHaveLength(0);
    r.tick(29 * 60);
    await flush();
    expect(check).toHaveBeenCalledTimes(1);
    r.tick(2 * 60);
    await flush();
    expect(check).toHaveBeenCalledTimes(2);
    r.brain.stop();
  });

  it("treats a check that throws like one that failed: no bubble, a try again later", async () => {
    const r = await rig();
    const check = vi.spyOn(r.backend.updates, "check").mockRejectedValue(new BackendError({ kind: "internal", message: "nope" }));
    await r.settle();
    expect(check).toHaveBeenCalledTimes(1);
    expect(r.shown.filter((b) => /update|version/i.test(b.text))).toHaveLength(0);
    r.tick(31 * 60);
    await flush();
    expect(check).toHaveBeenCalledTimes(2);
    r.brain.stop();
  });

  it("puts what the check found on the snapshot, and keeps the running version there", async () => {
    const r = await rig();
    expect(r.s().version).toBe("0.7.0");
    expect(r.s().update).toBeNull();
    await r.settle();
    expect(r.s().update).toMatchObject({ version: "0.7.1", canInstall: true });
    expect(r.s().installing).toBeNull();
    r.brain.stop();
  });
});

describe("the notice: once per version, at a calm moment, and free", () => {
  it("says it once the first check has found a new version, with the first highlights and two buttons", async () => {
    const r = await rig();
    await r.settle();
    const [b] = r.notice();
    expect(b.text).toBe("There's a new version of me: 0.7.1 ✨");
    expect(b.detail).toBe("What's new:\n• Faster board when your task list is long\n• Fixed the focus timer drifting after the PC wakes from sleep\n• Kinder wording when Todoist can't be reached");
    expect(b.actions.map((a) => a.title)).toEqual(["Update now", "Later"]);
    expect(b.actions[0].primary).toBe(true);
    expect(b.actions[1].neutral).toBe(true);
    expect(b.urgent).toBe(false);
    r.brain.stop();
  });

  it("offers the download page instead of Update now when one click is off", async () => {
    const r = await rig(knowing({ canInstall: false, manualReason: "msi" }));
    r.tick(15);
    await flush();
    r.tick(15);
    const [b] = r.notice();
    expect(b.actions.map((a) => a.title)).toEqual(["Download page", "Later"]);
    r.brain.stop();
  });

  it("is not counted: the nudge budget stays where it was (here it is spent already), and it has no kind", async () => {
    const r = await rig();
    expect(r.s().nudgesLeft).toBe(0);
    await r.settle();
    expect(r.notice()).toHaveLength(1);
    expect(r.notice()[0].kind).toBeUndefined();
    expect(r.s().life.dayNudges).toBe(demoLife().dayNudges);
    expect(r.s().nudgesLeft).toBe(0);
    r.brain.stop();
  });

  it("is told once, and recorded in the pet's life and in storage", async () => {
    const r = await rig();
    await r.settle();
    expect(r.s().life.updateAnnounced).toBe("0.7.1");
    await vi.waitFor(async () => expect(((await r.backend.storage.load("life")) as LifeState).updateAnnounced).toBe("0.7.1"));
    r.hush();
    for (let i = 0; i < 12; i++) {
      r.tick(HOUR / 1000);
      await flush();
      r.hush();
    }
    expect(r.notice()).toHaveLength(1);
    r.brain.stop();
  });

  it("is not told again after a restart", async () => {
    const r = await rig();
    await r.settle();
    r.brain.stop();
    await flush();
    const again = await rig({ backend: r.backend, clock: r.clock });
    await again.settle();
    expect(again.notice()).toHaveLength(0);
    again.brain.stop();
  });

  it("is told again for a newer version", async () => {
    const r = await rig();
    await r.settle();
    r.hush();
    // (What the backend says after a check is what its status says from then on.)
    const newer = found({ version: "0.7.2" });
    r.backend.updates.check = async () => newer;
    r.backend.updates.status = async () => newer;
    r.tick(6 * 3600 + 60);
    await flush();
    r.tick(15);
    expect(r.notice().map((b) => b.text)).toEqual(["There's a new version of me: 0.7.1 ✨", "There's a new version of me: 0.7.2 ✨"]);
    expect(r.s().life.updateAnnounced).toBe("0.7.2");
    r.brain.stop();
  });

  it("is not told when automatic checks are off: a manual check's result stays on the chip and the tray, where you looked for it", async () => {
    const r = await rig({ ...knowing(), prefs: { autoUpdateCheck: false } });
    expect(r.s().update?.version).toBe("0.7.1");
    r.tick(30);
    r.tick(3600);
    r.tick(15);
    expect(r.notice()).toHaveLength(0);
    expect(r.s().update?.version).toBe("0.7.1");
    r.brain.stop();
  });

  it("goes quietly when the update is gone by the time it would speak", async () => {
    const r = await rig(knowing());
    r.show({ secondsSinceKey: 2 });
    r.tick(30);
    expect(r.notice()).toHaveLength(0);
    r.backend.updates.status = async () => ({ current: "0.7.0", checkedAt: r.clock.t, available: null, error: null });
    await r.backend.bus.emit({ type: "update-changed" });
    await flush();
    r.show({});
    r.tick(30);
    expect(r.notice()).toHaveLength(0);
    expect(r.s().update).toBeNull();
    r.brain.stop();
  });

  it("drops the bubble unseen if the update disappears while it waits for an answer", async () => {
    const r = await rig(knowing());
    r.tick(30);
    expect(r.s().bubble?.text).toContain("new version of me");
    r.backend.updates.status = async () => ({ current: "0.7.0", checkedAt: r.clock.t, available: null, error: null });
    await r.backend.bus.emit({ type: "update-changed" });
    await flush();
    expect(r.s().bubble).toBeNull();
    r.brain.stop();
  });

  describe("waits for a calm moment (the same one a friend's visit waits for)", () => {
    it("not while you are typing", async () => {
      const r = await rig(knowing());
      r.show({ secondsSinceKey: 2 });
      r.tick(60);
      expect(r.notice()).toHaveLength(0);
      r.show({});
      r.tick(15);
      expect(r.notice()).toHaveLength(1);
      r.brain.stop();
    });

    it("not in the zone (10 minutes of steady typing), and the moment it ends", async () => {
      const r = await rig(knowing());
      for (let i = 0; i < 50; i++) {
        r.show({ secondsSinceKey: 1 });
        r.tick(15);
      }
      expect(r.s().flow).toBe(true);
      expect(r.notice()).toHaveLength(0);
      r.show({});
      r.tick(200);
      r.tick(15);
      expect(r.s().flow).toBe(false);
      expect(r.notice()).toHaveLength(1);
      r.brain.stop();
    });

    it("not while focusing", async () => {
      const r = await rig(knowing());
      r.brain.startFocus(null, 25);
      r.hush();
      r.tick(60);
      expect(r.notice()).toHaveLength(0);
      r.brain.stopFocus();
      r.hush();
      r.tick(15);
      expect(r.notice()).toHaveLength(1);
      r.brain.stop();
    });

    it("not in a meeting", async () => {
      const ics = ["BEGIN:VCALENDAR", "VERSION:2.0", "BEGIN:VEVENT", "UID:long", "DTSTAMP:20261028T080000", "DTSTART:20261028T090000", "DTEND:20261028T100000", "SUMMARY:Planning", "END:VEVENT", "END:VCALENDAR"].join("\r\n");
      const r = await rig({ ...knowing(), prefs: { useCalendar: true }, setup: (b) => void (b.calendar.fetchIcs = async () => [{ host: "demo.todopet", ok: true, text: ics }]) });
      expect(r.s().events).toHaveLength(1);
      r.tick(30);
      expect(r.notice()).toHaveLength(0);
      r.tick(3600);
      r.hush();
      r.tick(15);
      expect(r.notice()).toHaveLength(1);
      r.brain.stop();
    });

    it("not while someone is sharing the screen on a call", async () => {
      const r = await rig(knowing());
      r.show({ app: { name: "Zoom", exe: "Zoom.exe", title: "Zoom Meeting" } });
      r.tick(60);
      expect(r.notice()).toHaveLength(0);
      r.show({});
      r.tick(15);
      expect(r.notice()).toHaveLength(1);
      r.brain.stop();
    });

    it("not with a full-screen app in front", async () => {
      const r = await rig(knowing());
      r.show({ fullscreen: true });
      r.tick(60);
      expect(r.notice()).toHaveLength(0);
      r.show({});
      r.tick(15);
      expect(r.notice()).toHaveLength(1);
      r.brain.stop();
    });

    it("not when muted, hidden or done for today", async () => {
      const r = await rig(knowing());
      r.brain.quiet(120);
      r.tick(60);
      expect(r.notice()).toHaveLength(0);
      r.brain.quiet(null);
      r.brain.hide(120);
      r.hush();
      r.tick(60);
      expect(r.notice()).toHaveLength(0);
      r.brain.hide(null);
      r.hush();
      r.tick(15);
      expect(r.notice()).toHaveLength(1);
      r.brain.stop();
      const done = await rig({ ...knowing(), setup: (b) => void b.storage.save("plan", { plans: [], doneUntil: at(10, 29, 8) }) });
      done.tick(60);
      expect(done.s().doneUntil).not.toBeNull();
      expect(done.notice()).toHaveLength(0);
      done.brain.stop();
    });

    it("not with the board open", async () => {
      const r = await rig(knowing());
      r.brain.boardOpened();
      r.tick(60);
      expect(r.notice()).toHaveLength(0);
      r.brain.boardClosed();
      r.tick(15);
      expect(r.notice()).toHaveLength(1);
      r.brain.stop();
    });

    it("not while another bubble is waiting for an answer, and not on top of it", async () => {
      const r = await rig(knowing());
      r.brain.say({ text: "A question", actions: [{ title: "OK", run: () => undefined }], seconds: 6000, urgent: true });
      r.tick(60);
      expect(r.s().bubble?.text).toBe("A question");
      expect(r.notice()).toHaveLength(0);
      r.hush();
      r.tick(15);
      expect(r.notice()).toHaveLength(1);
      r.brain.stop();
    });

    it("keeps the gap between bubbles: not within bubbleGap minutes of the last one", async () => {
      const r = await rig({ ...knowing(), prefs: { bubbleGap: 15 } });
      r.brain.say({ text: "Hi", seconds: 5 });
      r.hush();
      r.tick(5 * 60);
      expect(r.notice()).toHaveLength(0);
      r.tick(9 * 60);
      expect(r.notice()).toHaveLength(0);
      r.tick(2 * 60);
      expect(r.notice()).toHaveLength(1);
      r.brain.stop();
    });

    it("waits while reminders are held after three were dismissed in a row", async () => {
      const r = await rig({ ...knowing(), life: { nudgeHoldUntil: at(10, 28, 10) } });
      r.tick(60);
      expect(r.notice()).toHaveLength(0);
      r.tick(HOUR / 1000);
      r.tick(15);
      expect(r.notice()).toHaveLength(1);
      r.brain.stop();
    });

    it("does not take the morning greeting's place: it comes after it", async () => {
      const r = await rig({ ...knowing(), greetingToCome: true });
      r.tick(30);
      const greeting = r.shown.find((b) => /Good morning|Good day/.test(b.text));
      expect(greeting).toBeDefined();
      expect(r.notice()).toHaveLength(0);
      r.hush();
      r.tick(30);
      expect(r.notice()).toHaveLength(1);
      r.brain.stop();
    });
  });

  it("answers Later with nothing more: the notice is not repeated and the chip and the tray stay", async () => {
    const r = await rig(knowing());
    r.tick(30);
    const b = r.s().bubble!;
    r.brain.pickAction(b.id, 1);
    expect(r.s().bubble).toBeNull();
    expect(r.s().update?.version).toBe("0.7.1");
    expect(r.s().installing).toBeNull();
    r.tick(3600);
    expect(r.notice()).toHaveLength(1);
    r.brain.stop();
  });

  it("opens the download page from its button, without installing", async () => {
    const r = await rig(knowing({ canInstall: false, manualReason: "unsigned" }));
    const install = vi.spyOn(r.backend.updates, "install");
    const page = vi.spyOn(r.backend.updates, "openPage");
    r.tick(30);
    r.brain.pickAction(r.s().bubble!.id, 0);
    await flush();
    expect(page).toHaveBeenCalledTimes(1);
    expect(install).not.toHaveBeenCalled();
    r.brain.stop();
  });

  it("writes why it spoke in the diary", async () => {
    const r = await rig(knowing());
    const append = vi.spyOn(r.backend.diary, "append");
    r.tick(30);
    await flush();
    expect(append.mock.calls.map((c) => c[1]).some((l) => /0\.7\.1/.test(l) && /because/.test(l))).toBe(true);
    r.brain.stop();
  });
});

describe("installing", () => {
  async function ready(extra: Rig = {}) {
    const r = await rig({ ...knowing(), ...extra });
    const run = steered(r.backend);
    r.tick(30);
    expect(r.s().bubble?.text).toContain("new version of me");
    return { r, run };
  }
  const press = (r: Awaited<ReturnType<typeof rig>>, title: string) => {
    const b = r.s().bubble!;
    r.brain.pickAction(b.id, b.actions.findIndex((a) => a.title === title));
  };

  it("saves the pet's life with the notes first, then installs, and shows the download as it goes", async () => {
    const r = await rig(knowing());
    let savedWhenInstalling: LifeState | null = null;
    let report: (p: UpdateProgress) => void = () => undefined;
    r.backend.updates.install = vi.fn((onProgress) => {
      report = onProgress;
      return new Promise<void>((resolve) => {
        void r.backend.storage.load<LifeState>("life").then((l) => {
          savedWhenInstalling = l;
          resolve();
        });
      });
    });
    r.tick(30);
    press(r, "Update now");
    await flush();
    // (The install call came after the save finished: the notes were in storage by then.)
    expect(savedWhenInstalling).not.toBeNull();
    expect(savedWhenInstalling!.pendingNotes).toEqual({ version: "0.7.1", notes: NOTES });
    expect(savedWhenInstalling!.updateAnnounced).toBe("0.7.1");
    expect(report).toBeTypeOf("function");
    r.brain.stop();
  });

  it("shows 'Downloading…', then the percent, then the last step, in one bubble that is not replaced", async () => {
    const { r, run } = await ready();
    press(r, "Update now");
    await flush();
    expect(run.install).toHaveBeenCalledTimes(1);
    expect(r.s().installing).toEqual({ phase: "downloading", percent: null });
    const bubble = r.s().bubble!;
    expect(bubble.text).toBe("Downloading…");
    expect(bubble.actions).toEqual([]);
    expect(bubble.progress).toEqual({ percent: null, spoken: "Downloading…" });
    run.progress({ phase: "downloading", downloaded: 450, total: 1000 });
    expect(r.s().installing).toEqual({ phase: "downloading", percent: 45 });
    expect(r.s().bubble).toMatchObject({ id: bubble.id, text: "Downloading… 45%", progress: { percent: 45, spoken: "Downloading…" } });
    run.progress({ phase: "downloading", downloaded: 1000, total: 1000 });
    expect(r.s().bubble?.text).toBe("Downloading… 100%");
    run.progress({ phase: "installing" });
    expect(r.s().installing).toEqual({ phase: "installing" });
    expect(r.s().bubble).toMatchObject({ id: bubble.id, text: "Installing, see you in a moment!", progress: { percent: 100, spoken: "Installing, see you in a moment!" } });
    r.brain.stop();
  });

  it("says it in Vietnamese too", async () => {
    const { r, run } = await ready();
    setLang("vi");
    press(r, "Update now");
    await flush();
    run.progress({ phase: "downloading", downloaded: 450, total: 1000 });
    expect(r.s().bubble?.text).toBe("Đang tải… 45%");
    run.progress({ phase: "installing" });
    expect(r.s().bubble?.text).toBe("Đang cài, chút nữa gặp lại nhé!");
    r.brain.stop();
  });

  it("keeps other bubbles from covering the progress, and does not install twice", async () => {
    const { r, run } = await ready();
    press(r, "Update now");
    await flush();
    const id = r.s().bubble!.id;
    expect(r.brain.say({ text: "Chatter", seconds: 5 })).toBe(false);
    expect(r.s().bubble?.id).toBe(id);
    void r.brain.startUpdate();
    await flush();
    expect(run.install).toHaveBeenCalledTimes(1);
    r.brain.stop();
  });

  it("does not bring the progress back after you closed its bubble, but tells you if it fails", async () => {
    const { r, run } = await ready();
    press(r, "Update now");
    await flush();
    r.brain.dismissBubble(r.s().bubble!.id, "closed");
    run.progress({ phase: "downloading", downloaded: 500, total: 1000 });
    expect(r.s().bubble).toBeNull();
    expect(r.s().installing).toEqual({ phase: "downloading", percent: 50 });
    run.fail();
    await flush();
    expect(r.s().bubble?.text).toBe("I couldn't update myself. Grab it from the download page?");
    r.brain.stop();
  });

  it("falls back to the download page when the install fails, kindly and with the button", async () => {
    const { r, run } = await ready();
    const page = vi.spyOn(r.backend.updates, "openPage");
    press(r, "Update now");
    await flush();
    run.progress({ phase: "downloading", downloaded: 100, total: 1000 });
    run.fail();
    await flush();
    expect(r.s().installing).toBeNull();
    const b = r.s().bubble!;
    expect(b.text).toBe("I couldn't update myself. Grab it from the download page?");
    expect(b.actions.map((a) => a.title)).toEqual(["Download page", "Later"]);
    expect(b.urgent).toBe(true);
    // Still on offer: the chip and the tray keep it.
    expect(r.s().update?.version).toBe("0.7.1");
    r.brain.pickAction(b.id, 0);
    await flush();
    expect(page).toHaveBeenCalledTimes(1);
    r.brain.stop();
  });

  it("allows another try after a failure", async () => {
    const { r, run } = await ready();
    press(r, "Update now");
    await flush();
    run.fail();
    await flush();
    void r.brain.startUpdate();
    await flush();
    expect(run.install).toHaveBeenCalledTimes(2);
    r.brain.stop();
  });

  it("writes a failure in the diary, with the reason, for whoever helps you", async () => {
    const { r, run } = await ready();
    const append = vi.spyOn(r.backend.diary, "append");
    press(r, "Update now");
    await flush();
    run.fail(new BackendError({ kind: "network", message: "connection reset" }));
    await flush();
    expect(append.mock.calls.map((c) => c[1]).some((l) => /connection reset/.test(l))).toBe(true);
    r.brain.stop();
  });

  it("tells other windows (Settings) when an install fails, so they stop waiting", async () => {
    const { r, run } = await ready();
    const heard: string[] = [];
    r.backend.bus.on((e) => heard.push(e.type));
    press(r, "Update now");
    await flush();
    run.fail();
    await flush();
    expect(heard).toContain("update-changed");
    r.brain.stop();
  });

  it("when the install comes back as the new version (the demo restarts in place), celebrates it with the saved highlights", async () => {
    const r = await rig();
    await r.settle();
    r.hush();
    expect(r.s().update?.version).toBe("0.7.1");
    await r.brain.startUpdate();
    await flush();
    expect(r.s().installing).toBeNull();
    expect(r.s().version).toBe("0.7.1");
    expect(r.s().update).toBeNull();
    // The brain tells it at the next calm beat.
    r.tick(15);
    const cheer = r.shown.find((b) => b.text === "Now I'm on 0.7.1! ✨");
    expect(cheer).toBeDefined();
    expect(cheer!.detail).toContain("• Faster board when your task list is long");
    expect(r.s().life.lastVersion).toBe("0.7.1");
    expect(r.s().life.pendingNotes).toBeNull();
    r.brain.stop();
  });
});

describe("the first start of a newer version", () => {
  const restarted = (patch: Partial<LifeState>, current = "0.7.1", extra: Rig = {}) => rig({ current, life: patch, ...extra });

  it("only records the version on the very first run: nothing to say", async () => {
    const r = await restarted({}, "0.7.0");
    r.tick(60);
    expect(r.shown.filter((b) => /Now I'm on|vừa lên/.test(b.text))).toHaveLength(0);
    expect(r.s().life.lastVersion).toBe("0.7.0");
    await vi.waitFor(async () => expect(((await r.backend.storage.load("life")) as LifeState).lastVersion).toBe("0.7.0"));
    r.brain.stop();
  });

  it("celebrates once with the notes saved before the install, and a happy pet", async () => {
    const r = await restarted({ lastVersion: "0.7.0", pendingNotes: { version: "0.7.1", notes: NOTES } });
    expect(r.s().celebration).toBeNull();
    r.tick(15);
    const cheer = r.shown.find((b) => b.text === "Now I'm on 0.7.1! ✨")!;
    expect(cheer).toBeDefined();
    expect(cheer.detail).toBe("What's new:\n• Faster board when your task list is long\n• Fixed the focus timer drifting after sleep\n• Kinder wording when Todoist can't be reached");
    expect(cheer.reminder).toBe(false);
    expect(cheer.kind).toBeUndefined();
    expect(r.s().celebration).toMatchObject({ kind: "dance" });
    expect(r.s().life.lastVersion).toBe("0.7.1");
    expect(r.s().life.pendingNotes).toBeNull();
    expect(r.s().life.dayNudges).toBe(demoLife().dayNudges);
    r.brain.stop();
  });

  it("celebrates in Vietnamese when the pet speaks Vietnamese", async () => {
    const r = await restarted({ lastVersion: "0.7.0", pendingNotes: { version: "0.7.1", notes: NOTES } }, "0.7.1", { prefs: { lang: "vi" }, lang: "vi" });
    r.tick(15);
    expect(r.shown.map((b) => b.text)).toContain("Mình vừa lên bản 0.7.1! ✨");
    r.brain.stop();
  });

  it("says it only once: not on the next start", async () => {
    const r = await restarted({ lastVersion: "0.7.0", pendingNotes: { version: "0.7.1", notes: NOTES } });
    r.tick(15);
    await flush();
    r.brain.stop();
    await flush();
    const again = await rig({ backend: r.backend, clock: r.clock, current: "0.7.1" });
    again.tick(30);
    expect(again.shown.filter((b) => /Now I'm on/.test(b.text))).toHaveLength(0);
    again.brain.stop();
  });

  it("celebrates without highlights when it has no notes (installed by hand)", async () => {
    const r = await restarted({ lastVersion: "0.7.0" });
    r.tick(15);
    const cheer = r.shown.find((b) => b.text === "Now I'm on 0.7.1! ✨")!;
    expect(cheer).toBeDefined();
    expect(cheer.detail).toBeUndefined();
    r.brain.stop();
  });

  it("ignores notes saved for another version, and clears them", async () => {
    const r = await restarted({ lastVersion: "0.7.0", pendingNotes: { version: "0.7.5", notes: NOTES } });
    r.tick(15);
    const cheer = r.shown.find((b) => b.text === "Now I'm on 0.7.1! ✨")!;
    expect(cheer.detail).toBeUndefined();
    // (0.7.5 is still ahead of us: those notes are kept for when it comes.)
    expect(r.s().life.pendingNotes).toEqual({ version: "0.7.5", notes: NOTES });
    r.brain.stop();
  });

  it("clears notes for a version that is behind us", async () => {
    const r = await restarted({ lastVersion: "0.7.1", pendingNotes: { version: "0.7.0", notes: NOTES } });
    r.tick(15);
    expect(r.s().life.pendingNotes).toBeNull();
    r.brain.stop();
  });

  it("is quiet on a step back, and records the older version", async () => {
    const r = await restarted({ lastVersion: "0.7.1" }, "0.7.0");
    r.tick(60);
    expect(r.shown.filter((b) => /Now I'm on/.test(b.text))).toHaveLength(0);
    expect(r.s().life.lastVersion).toBe("0.7.0");
    r.brain.stop();
  });

  it("waits for a calm moment and does not lose the celebration meanwhile", async () => {
    const r = await restarted({ lastVersion: "0.7.0", pendingNotes: { version: "0.7.1", notes: NOTES } });
    r.show({ secondsSinceKey: 2 });
    r.tick(60);
    expect(r.shown.filter((b) => /Now I'm on/.test(b.text))).toHaveLength(0);
    // Not recorded as told yet.
    expect(r.s().life.lastVersion).toBe("0.7.0");
    r.show({});
    r.tick(15);
    expect(r.shown.filter((b) => /Now I'm on/.test(b.text))).toHaveLength(1);
    expect(r.s().life.lastVersion).toBe("0.7.1");
    r.brain.stop();
  });

  it("does not take the morning greeting's place", async () => {
    const r = await restarted({ lastVersion: "0.7.0", pendingNotes: { version: "0.7.1", notes: NOTES } }, "0.7.1", { greetingToCome: true });
    r.tick(30);
    expect(r.shown.some((b) => /Good morning|Good day/.test(b.text))).toBe(true);
    expect(r.shown.filter((b) => /Now I'm on/.test(b.text))).toHaveLength(0);
    r.hush();
    r.tick(30);
    expect(r.shown.filter((b) => /Now I'm on/.test(b.text))).toHaveLength(1);
    r.brain.stop();
  });

  it("does nothing if the backend can't say which version is running", async () => {
    const r = await rig({
      setup: (b) => {
        b.updates.status = async () => {
          throw new BackendError({ kind: "internal", message: "no" });
        };
      },
      life: { lastVersion: "0.7.0", pendingNotes: { version: "0.7.1", notes: NOTES } },
    });
    r.tick(60);
    expect(r.s().version).toBeNull();
    expect(r.shown.filter((b) => /Now I'm on/.test(b.text))).toHaveLength(0);
    expect(r.s().life.lastVersion).toBe("0.7.0");
    r.brain.stop();
  });
});

describe("the tray command", () => {
  const send = (r: Awaited<ReturnType<typeof rig>>, c: AppCommand = "update") => r.backend.demo.command(c);

  it("installs when an update is ready to install", async () => {
    const r = await rig(knowing());
    const run = steered(r.backend);
    send(r);
    await flush();
    expect(run.install).toHaveBeenCalledTimes(1);
    expect(r.s().bubble?.text).toBe("Downloading…");
    r.brain.stop();
  });

  it("opens the download page when one is known but can't be installed in one click", async () => {
    const r = await rig(knowing({ canInstall: false, manualReason: "msi" }));
    const install = vi.spyOn(r.backend.updates, "install");
    const page = vi.spyOn(r.backend.updates, "openPage");
    send(r);
    await flush();
    expect(page).toHaveBeenCalledTimes(1);
    expect(install).not.toHaveBeenCalled();
    r.brain.stop();
  });

  it("says the page could not be opened, kindly", async () => {
    const r = await rig(knowing({ canInstall: false, manualReason: "msi" }));
    r.backend.updates.openPage = async () => {
      throw new BackendError({ kind: "internal", message: "no browser" });
    };
    send(r);
    await flush();
    expect(r.s().bubble?.text).toBe("I couldn't open the download page just now. Please try again in a little while 🌿");
    r.brain.stop();
  });

  it("checks right now (forced) when nothing is known, and says you are up to date", async () => {
    const r = await rig({ setup: (b) => void (b.updates.check = vi.fn(async (): Promise<UpdateStatus> => ({ current: "0.7.0", checkedAt: at(10, 28, 9), available: null, error: null }))) });
    send(r);
    await flush();
    expect(r.backend.updates.check).toHaveBeenCalledWith(true);
    expect(r.s().bubble?.text).toBe("You're on the newest version 👍");
    expect(r.s().bubble?.urgent).toBe(true);
    r.brain.stop();
  });

  it("answers even when the pet is hidden or muted: you asked", async () => {
    const r = await rig({ setup: (b) => void (b.updates.check = async () => ({ current: "0.7.0", checkedAt: at(10, 28, 9), available: null, error: null })) });
    r.brain.hide(60);
    r.hush();
    r.brain.quiet(60);
    send(r);
    await flush();
    expect(r.s().bubble?.text).toBe("You're on the newest version 👍");
    r.brain.stop();
  });

  it("tells you what it found when the check turns up a new version, with the buttons, and counts it as told", async () => {
    const r = await rig();
    send(r);
    await flush();
    const b = r.s().bubble!;
    expect(b.text).toBe("There's a new version of me: 0.7.1 ✨");
    expect(b.actions.map((a) => a.title)).toEqual(["Update now", "Later"]);
    expect(b.urgent).toBe(true);
    expect(r.s().life.updateAnnounced).toBe("0.7.1");
    expect(r.s().update?.version).toBe("0.7.1");
    // The schedule doesn't say it again.
    r.hush();
    await r.settle();
    expect(r.notice()).toHaveLength(1);
    r.brain.stop();
  });

  it("says kindly that it could not check, with no raw error", async () => {
    const r = await rig({ setup: (b) => void (b.updates.check = async () => ({ current: "0.7.0", checkedAt: at(10, 28, 9), available: null, error: { kind: "network", message: "dns error: lookup api.github.com" } })) });
    send(r);
    await flush();
    expect(r.s().bubble?.text).toBe("I couldn't check for updates just now. Please try again in a little while 🌿");
    expect(r.s().bubble?.text).not.toMatch(/dns|github/i);
    r.brain.stop();
  });

  it("says the same when the check itself throws", async () => {
    const r = await rig({ setup: (b) => void (b.updates.check = async () => { throw new BackendError({ kind: "internal", message: "x" }); }) });
    send(r);
    await flush();
    expect(r.s().bubble?.text).toBe("I couldn't check for updates just now. Please try again in a little while 🌿");
    r.brain.stop();
  });

  it("does not start a second install, and brings the progress back if you had closed it", async () => {
    const r = await rig(knowing());
    const run = steered(r.backend);
    send(r);
    await flush();
    r.brain.dismissBubble(r.s().bubble!.id, "closed");
    run.progress({ phase: "downloading", downloaded: 300, total: 1000 });
    expect(r.s().bubble).toBeNull();
    send(r);
    await flush();
    expect(run.install).toHaveBeenCalledTimes(1);
    expect(r.s().bubble).toMatchObject({ text: "Downloading… 30%", progress: { percent: 30 } });
    r.brain.stop();
  });

  it("installs when Settings asks about an update it hasn't heard of yet (it asks the backend first)", async () => {
    const r = await rig();
    expect(r.s().update).toBeNull();
    r.backend.updates.status = async () => found();
    const run = steered(r.backend);
    await r.backend.bus.emit({ type: "update-install" });
    await flush();
    expect(run.install).toHaveBeenCalledTimes(1);
    r.brain.stop();
  });

  it("tells Settings to stop waiting when there turns out to be nothing to install", async () => {
    const r = await rig();
    const run = steered(r.backend);
    const heard: string[] = [];
    r.backend.bus.on((e) => heard.push(e.type));
    await r.backend.bus.emit({ type: "update-install" });
    await flush();
    expect(run.install).not.toHaveBeenCalled();
    expect(heard).toContain("update-changed");
    r.brain.stop();
  });

  it("keeps working when Settings is the one asking, over the bus", async () => {
    const r = await rig(knowing());
    const run = steered(r.backend);
    await r.backend.bus.emit({ type: "update-install" });
    await flush();
    expect(run.install).toHaveBeenCalledTimes(1);
    r.brain.stop();
  });
});

describe("the tray label", () => {
  it("is pushed at the start, and again when a version turns up", async () => {
    const r = await rig();
    const labels = vi.spyOn(r.backend.system, "setTrayLabels");
    await r.settle();
    const updates = labels.mock.calls.map((c) => c[0].updates);
    expect(updates).toContain("✨ Update to 0.7.1");
    r.brain.stop();
  });

  it("starts as 'Check for updates…' and follows the language", async () => {
    const calls: string[] = [];
    const r = await rig({ prefs: { lang: "vi" }, lang: "vi", setup: (b) => void (b.system.setTrayLabels = async (l) => void calls.push(l.updates)) });
    expect(calls[0]).toBe("Kiểm tra cập nhật…");
    await r.settle();
    expect(calls).toContain("✨ Cập nhật lên 0.7.1");
    r.brain.stop();
  });

  it("goes back to 'Check for updates…' once the update is gone", async () => {
    const r = await rig(knowing());
    const labels = vi.spyOn(r.backend.system, "setTrayLabels");
    r.backend.updates.status = async () => ({ current: "0.7.1", checkedAt: r.clock.t, available: null, error: null });
    await r.backend.bus.emit({ type: "update-changed" });
    await flush();
    expect(labels.mock.calls.at(-1)?.[0].updates).toBe("Check for updates…");
    r.brain.stop();
  });

  it("refreshes from Settings' own check, over the bus", async () => {
    const r = await rig();
    expect(r.s().update).toBeNull();
    r.backend.updates.status = async () => found();
    await r.backend.bus.emit({ type: "update-changed" });
    await flush();
    expect(r.s().update?.version).toBe("0.7.1");
    r.brain.stop();
  });
});

describe("a progress message that arrives late", () => {
  async function failed() {
    const r = await rig(knowing());
    const run = steered(r.backend);
    r.tick(30);
    r.brain.pickAction(r.s().bubble!.id, 0);
    await flush();
    run.fail();
    await flush();
    expect(r.s().installing).toBeNull();
    return { r, run };
  }

  it("is ignored once the attempt failed: nothing is left 'installing', and no bubble comes back", async () => {
    const { r, run } = await failed();
    r.hush();
    run.reporters[0]({ phase: "downloading", downloaded: 900, total: 1000 });
    run.reporters[0]({ phase: "installing" });
    expect(r.s().installing).toBeNull();
    expect(r.s().bubble).toBeNull();
    r.brain.stop();
  });

  it("does not stop a retry from starting", async () => {
    const { r, run } = await failed();
    run.reporters[0]({ phase: "installing" });
    void r.brain.startUpdate();
    await flush();
    expect(run.install).toHaveBeenCalledTimes(2);
    expect(r.s().installing).toEqual({ phase: "downloading", percent: null });
    r.brain.stop();
  });

  it("is ignored by the retry too: only the attempt that is running moves the progress", async () => {
    const { r, run } = await failed();
    void r.brain.startUpdate();
    await flush();
    run.reporters[0]({ phase: "installing" });
    expect(r.s().installing).toEqual({ phase: "downloading", percent: null });
    run.reporters[1]({ phase: "downloading", downloaded: 250, total: 1000 });
    expect(r.s().installing).toEqual({ phase: "downloading", percent: 25 });
    r.brain.stop();
  });

  it("is ignored once the attempt came back (the demo restarts in place)", async () => {
    const r = await rig(knowing());
    const run = steered(r.backend);
    await r.backend.bus.emit({ type: "update-install" });
    await flush();
    run.succeed();
    await flush();
    expect(r.s().installing).toBeNull();
    run.reporters[0]({ phase: "installing" });
    expect(r.s().installing).toBeNull();
    r.brain.stop();
  });
});

describe("the schedule and an install under way", () => {
  it("does not make its automatic check while an update installs", async () => {
    const r = await rig(knowing());
    const run = steered(r.backend);
    const check = vi.spyOn(r.backend.updates, "check");
    await r.backend.bus.emit({ type: "update-install" });
    await flush();
    expect(run.install).toHaveBeenCalledTimes(1);
    r.tick(7 * 3600);
    await flush();
    r.tick(15);
    await flush();
    expect(check).not.toHaveBeenCalled();
    // After a failure the schedule goes on (it is due: nothing was asked meanwhile).
    run.fail();
    await flush();
    r.tick(15);
    await flush();
    expect(check).toHaveBeenCalledTimes(1);
    r.brain.stop();
  });

  it("counts a check Settings made: the first automatic check waits for 6 hours after it", async () => {
    const r = await rig();
    const check = vi.spyOn(r.backend.updates, "check");
    // Settings checked a minute ago (the backend's status says so; the bus told the pet).
    r.backend.updates.status = async () => ({ current: "0.7.0", checkedAt: r.clock.t, available: null, error: null });
    await r.backend.bus.emit({ type: "update-changed" });
    await flush();
    r.tick(125);
    await flush();
    expect(check).not.toHaveBeenCalled();
    r.tick(5 * 3600 + 50 * 60);
    await flush();
    expect(check).not.toHaveBeenCalled();
    r.tick(11 * 60);
    await flush();
    expect(check).toHaveBeenCalledTimes(1);
    r.brain.stop();
  });

  it("counts a check made before the app looked, too (the status it starts with)", async () => {
    const r = await rig({ status: { checkedAt: at(10, 28, 8, 59) } });
    const check = vi.spyOn(r.backend.updates, "check");
    r.tick(125);
    await flush();
    expect(check).not.toHaveBeenCalled();
    r.brain.stop();
  });

  it("brings a retry forward when the check Settings made had failed, and does not let an older check push the schedule back", async () => {
    const r = await rig();
    const check = vi.spyOn(r.backend.updates, "check");
    r.backend.updates.status = async () => ({ current: "0.7.0", checkedAt: r.clock.t, available: null, error: { kind: "network", message: "offline" } });
    await r.backend.bus.emit({ type: "update-changed" });
    await flush();
    r.tick(125);
    await flush();
    expect(check).not.toHaveBeenCalled();
    r.tick(30 * 60);
    await flush();
    expect(check).toHaveBeenCalledTimes(1);
    r.brain.stop();
  });

  it("does not tell other windows about a check's answer while an update installs (Settings would stop waiting)", async () => {
    // (A version is known but nothing was checked yet, so the first automatic check is due at 2 minutes.)
    const r = await rig({ status: { ...found(), checkedAt: null } });
    const heard: string[] = [];
    r.backend.bus.on((e) => heard.push(e.type));
    let answer: (s: UpdateStatus) => void = () => undefined;
    const check = vi.fn(() => new Promise<UpdateStatus>((res) => (answer = res)));
    r.backend.updates.check = check;
    r.tick(125);
    await flush();
    expect(check).toHaveBeenCalledTimes(1);
    const run = steered(r.backend);
    await r.backend.bus.emit({ type: "update-install" });
    await flush();
    expect(run.install).toHaveBeenCalledTimes(1);
    heard.length = 0;
    answer(found({ version: "0.7.2" }));
    await flush();
    expect(heard).not.toContain("update-changed");
    run.fail();
    await flush();
    expect(heard).toContain("update-changed");
    r.brain.stop();
  });
});

describe("saving before the install", () => {
  const nuke = (b: DemoBackend) => {
    const real = b.storage.save.bind(b.storage);
    b.storage.save = (key, value) => (key === "life" && stuck ? stuck(key, value) : real(key, value));
  };
  let stuck: ((key: string, value: unknown) => Promise<void>) | null = null;
  const diaryLines = (r: Awaited<ReturnType<typeof rig>>) => vi.spyOn(r.backend.diary, "append");

  it("goes on after 5 seconds if the save hasn't finished, and says so in the diary", async () => {
    const r = await rig({ ...knowing(), setup: nuke });
    stuck = () => new Promise(() => undefined);
    const run = steered(r.backend);
    const lines = diaryLines(r);
    r.tick(30);
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    try {
      r.brain.pickAction(r.s().bubble!.id, 0);
      await vi.advanceTimersByTimeAsync(4900);
      expect(run.install).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(200);
      expect(run.install).toHaveBeenCalledTimes(1);
      expect(lines.mock.calls.map((c) => c[1]).some((l) => /saving/i.test(l))).toBe(true);
    } finally {
      vi.useRealTimers();
      stuck = null;
      r.brain.stop();
    }
  });

  it("goes on at once when the save fails, and says so in the diary", async () => {
    const r = await rig({ ...knowing(), setup: nuke });
    stuck = async () => {
      throw new Error("disk full");
    };
    const run = steered(r.backend);
    const lines = diaryLines(r);
    r.tick(30);
    r.brain.pickAction(r.s().bubble!.id, 0);
    await flush();
    stuck = null;
    expect(run.install).toHaveBeenCalledTimes(1);
    expect(lines.mock.calls.map((c) => c[1]).some((l) => /saving/i.test(l))).toBe(true);
    r.brain.stop();
  });

  it("says nothing about saving when it went well, and doesn't wait the 5 seconds", async () => {
    const r = await rig(knowing());
    const run = steered(r.backend);
    const lines = diaryLines(r);
    r.tick(30);
    const started = Date.now();
    r.brain.pickAction(r.s().bubble!.id, 0);
    await vi.waitFor(() => expect(run.install).toHaveBeenCalledTimes(1));
    expect(Date.now() - started).toBeLessThan(2000);
    expect(lines.mock.calls.map((c) => c[1]).some((l) => /saving/i.test(l))).toBe(false);
    r.brain.stop();
  });
});

describe("replies that are seen while the board is open", () => {
  const send = (r: Awaited<ReturnType<typeof rig>>) => r.backend.demo.command("update");

  it("shows 'you're on the newest version' as a banner in the open board", async () => {
    const r = await rig({ setup: (b) => void (b.updates.check = async () => ({ current: "0.7.0", checkedAt: at(10, 28, 9), available: null, error: null })) });
    r.brain.boardOpened();
    send(r);
    await flush();
    const b = r.s().bubble!;
    expect(b.text).toBe("You're on the newest version 👍");
    expect(showsOverBoard(b)).toBe(true);
    r.brain.stop();
  });

  it("shows 'I couldn't check' and 'I couldn't open the page' the same way", async () => {
    const r = await rig({ setup: (b) => void (b.updates.check = async () => ({ current: "0.7.0", checkedAt: at(10, 28, 9), available: null, error: { kind: "network", message: "x" } })) });
    r.brain.boardOpened();
    send(r);
    await flush();
    expect(r.s().bubble?.text).toMatch(/couldn't check/);
    expect(showsOverBoard(r.s().bubble!)).toBe(true);
    r.brain.stop();
    const p = await rig({ ...knowing({ canInstall: false, manualReason: "msi" }), setup: (b) => void (b.updates.openPage = async () => { throw new BackendError({ kind: "internal", message: "x" }); }) });
    p.brain.boardOpened();
    send(p);
    await flush();
    expect(p.s().bubble?.text).toMatch(/couldn't open the download page/);
    expect(showsOverBoard(p.s().bubble!)).toBe(true);
    p.brain.stop();
  });

  it("is only for those replies: the notice and the progress still wait for the board to close, as before", async () => {
    const base: Bubble = { id: 1, text: "x", actions: [], seconds: 5, urgent: false, reminder: false };
    expect(showsOverBoard({ ...base, urgent: true })).toBe(false);
    expect(showsOverBoard({ ...base, urgent: true, inBoard: true })).toBe(true);
    const r = await rig(knowing());
    const run = steered(r.backend);
    send(r);
    await flush();
    expect(run.install).toHaveBeenCalledTimes(1);
    expect(showsOverBoard(r.s().bubble!)).toBe(false);
    r.brain.stop();
  });
});

describe("a check the pet is asked for takes a while", () => {
  it("says 'Let me look…' when it is still going after a moment, then gives the answer in its place", async () => {
    const r = await rig();
    let answer: (s: UpdateStatus) => void = () => undefined;
    r.backend.updates.check = () => new Promise<UpdateStatus>((res) => (answer = res));
    r.backend.demo.command("update");
    await flush();
    expect(r.s().bubble).toBeNull();
    await new Promise((res) => setTimeout(res, 800));
    expect(r.s().bubble?.text).toBe("Let me look… 🔎");
    expect(r.s().bubble?.urgent).toBe(true);
    expect(showsOverBoard(r.s().bubble!)).toBe(true);
    answer({ current: "0.7.0", checkedAt: at(10, 28, 9), available: null, error: null });
    await flush();
    expect(r.s().bubble?.text).toBe("You're on the newest version 👍");
    r.brain.stop();
  });

  it("says nothing extra when the answer comes quickly", async () => {
    const r = await rig();
    r.backend.demo.command("update");
    await flush();
    await new Promise((res) => setTimeout(res, 800));
    expect(r.shown.map((b) => b.text)).not.toContain("Let me look… 🔎");
    r.brain.stop();
  });

  it("does not leave 'Let me look…' behind if the pet goes quiet before the answer", async () => {
    const r = await rig();
    let answer: (s: UpdateStatus) => void = () => undefined;
    r.backend.updates.check = () => new Promise<UpdateStatus>((res) => (answer = res));
    r.backend.demo.command("update");
    await new Promise((res) => setTimeout(res, 800));
    expect(r.s().bubble?.text).toBe("Let me look… 🔎");
    answer({ current: "0.7.0", checkedAt: at(10, 28, 9), available: null, error: null });
    await flush();
    expect(r.s().bubble?.text).not.toBe("Let me look… 🔎");
    r.brain.stop();
  });
});

describe("telling Settings", () => {
  it("answers a request to install with 'update-installing' as soon as it has taken it", async () => {
    const r = await rig(knowing());
    steered(r.backend);
    const heard: string[] = [];
    r.backend.bus.on((e) => heard.push(e.type));
    await r.backend.bus.emit({ type: "update-install" });
    await flush();
    expect(heard).toContain("update-installing");
    r.brain.stop();
  });

  it("says 'update-changed', not 'update-installing', when the request is for a page (one click is off)", async () => {
    const r = await rig(knowing({ canInstall: false, manualReason: "msi" }));
    const page = vi.spyOn(r.backend.updates, "openPage");
    const heard: string[] = [];
    r.backend.bus.on((e) => heard.push(e.type));
    await r.backend.bus.emit({ type: "update-install" });
    await flush();
    expect(page).toHaveBeenCalledTimes(1);
    expect(heard).toContain("update-changed");
    expect(heard).not.toContain("update-installing");
    r.brain.stop();
  });

  it("does not say 'update-installing' for the chip or the tray when there was nothing to install", async () => {
    const r = await rig();
    const heard: string[] = [];
    r.backend.bus.on((e) => heard.push(e.type));
    await r.brain.startUpdate();
    await flush();
    expect(heard).not.toContain("update-installing");
    r.brain.stop();
  });
});

describe("release notes in two languages", () => {
  const BOTH = "### English\n- Faster board\n- Fixed the timer\n- Kinder wording\n\n### Tiếng Việt\n- Bảng nhanh hơn\n- Sửa lỗi hẹn giờ\n- Lời lẽ dịu dàng hơn";

  it("puts the highlights of the app's language in the notice", async () => {
    const en = await rig(knowing({ notes: BOTH }));
    en.tick(30);
    expect(en.s().bubble?.detail).toBe("What's new:\n• Faster board\n• Fixed the timer\n• Kinder wording");
    en.brain.stop();
    const vi = await rig({ ...knowing({ notes: BOTH }), lang: "vi" });
    vi.tick(30);
    expect(vi.s().bubble?.text).toBe("Mình có bản mới 0.7.1 nè ✨");
    expect(vi.s().bubble?.detail).toBe("Có gì mới:\n• Bảng nhanh hơn\n• Sửa lỗi hẹn giờ\n• Lời lẽ dịu dàng hơn");
    vi.brain.stop();
  });

  it("keeps both languages in the notes saved for after the restart, even when they must be cut", async () => {
    const long = `### English\n${"- An English line that is quite long\n".repeat(60)}\n### Tiếng Việt\n${"- Một dòng tiếng Việt khá dài\n".repeat(60)}`;
    const r = await rig(knowing({ notes: long }));
    steered(r.backend);
    r.tick(30);
    r.brain.pickAction(r.s().bubble!.id, 0);
    await flush();
    const saved = r.s().life.pendingNotes!;
    expect(saved.notes.length).toBeLessThanOrEqual(1200);
    expect(saved.notes).toMatch(/An English line/);
    expect(saved.notes).toMatch(/Một dòng tiếng Việt/);
    r.brain.stop();
  });

  it("celebrates with the highlights in the language of the app after the restart", async () => {
    const vi = await rig({ current: "0.7.1", lang: "vi", life: { lastVersion: "0.7.0", pendingNotes: { version: "0.7.1", notes: BOTH } } });
    vi.tick(15);
    const cheer = vi.shown.find((b) => b.text === "Mình vừa lên bản 0.7.1! ✨")!;
    expect(cheer.detail).toBe("Có gì mới:\n• Bảng nhanh hơn\n• Sửa lỗi hẹn giờ\n• Lời lẽ dịu dàng hơn");
    vi.brain.stop();
    const en = await rig({ current: "0.7.1", life: { lastVersion: "0.7.0", pendingNotes: { version: "0.7.1", notes: BOTH } } });
    en.tick(15);
    expect(en.shown.find((b) => b.text === "Now I'm on 0.7.1! ✨")!.detail).toBe("What's new:\n• Faster board\n• Fixed the timer\n• Kinder wording");
    en.brain.stop();
  });
});
