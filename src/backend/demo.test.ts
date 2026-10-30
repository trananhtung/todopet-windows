// The browser demo's own clock and task list (v0.4 evaluation, issue 11): the next morning, and a Friday.
import { afterEach, describe, expect, it, vi } from "vitest";
import { highlights } from "../core/updates";
import { createDemoBackend, sampleDone, sampleTasks } from "./demo";
import { BackendError, type UpdateProgress } from "./types";

const at = (day: number, h: number, m = 0) => new Date(2026, 9, day, h, m).getTime();

describe("demo backend: the clock", () => {
  it("runs on the real time until the panel moves it, then keeps ticking from there", () => {
    const b = createDemoBackend({ persist: false });
    expect(b.demo.clockMoved()).toBe(false);
    expect(Math.abs(b.demo.now() - Date.now())).toBeLessThan(50);
    const target = at(30, 16, 30);
    b.demo.setClock(target);
    expect(b.demo.clockMoved()).toBe(true);
    expect(b.demo.now() - target).toBeGreaterThanOrEqual(0);
    expect(b.demo.now() - target).toBeLessThan(200);
    b.demo.setClock(null);
    expect(b.demo.clockMoved()).toBe(false);
    expect(Math.abs(b.demo.now() - Date.now())).toBeLessThan(50);
  });

  it("leaves a clock that a test supplied alone", () => {
    const b = createDemoBackend({ persist: false, now: () => at(28, 9) });
    b.demo.setClock(at(30, 16));
    expect(b.demo.now()).toBe(at(28, 9));
    expect(b.demo.clockMoved()).toBe(false);
  });
});

describe("demo backend: tasks moved to a later day", () => {
  it("comes back as today's task once that day is here, and what was left becomes overdue", async () => {
    const clock = { t: at(28, 16, 30) };
    const b = createDemoBackend({ persist: false, now: () => clock.t });
    expect((await b.todoist.tasks("today | overdue")).map((t) => t.id)).toContain("4");
    await b.todoist.reschedule("4", "2026-10-29");
    expect((await b.todoist.tasks("today | overdue")).map((t) => t.id)).not.toContain("4");
    clock.t = at(29, 8, 20);
    const next = await b.todoist.tasks("today | overdue");
    expect(next.map((t) => t.id)).toContain("4");
    // Due today, not overdue; the ones left undone yesterday are overdue now.
    expect(next.find((t) => t.id === "4")?.due?.date.slice(0, 10)).toBe("2026-10-29");
    expect(next.find((t) => t.id === "1")?.due?.date.slice(0, 10)).toBe("2026-10-28");
  });

  it("keeps a task with no date off the list, and one moved to Monday off it until Monday", async () => {
    const clock = { t: at(30, 16, 30) };
    const b = createDemoBackend({ persist: false, now: () => clock.t });
    await b.todoist.reschedule("4", "no date");
    await b.todoist.reschedule("1", "2026-11-02");
    clock.t = at(31, 8, 20);
    expect((await b.todoist.tasks("today | overdue")).map((t) => t.id)).not.toContain("1");
    clock.t = new Date(2026, 10, 2, 8, 20).getTime();
    const monday = (await b.todoist.tasks("today | overdue")).map((t) => t.id);
    expect(monday).toContain("1");
    expect(monday).not.toContain("4");
  });
});

describe("demo backend: the sample day", () => {
  const local = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

  it("keeps today's tasks on today late in the evening and just after midnight", () => {
    for (const [h, m] of [
      [9, 0],
      [22, 40],
      [23, 8],
      [23, 59],
      [0, 20],
    ]) {
      const now = new Date(2026, 9, 29, h, m);
      const call = sampleTasks(now).find((t) => t.id === "2")!;
      expect(call.due!.date.slice(0, 10), `${h}:${m}`).toBe("2026-10-29");
      const done = sampleDone(now)[0];
      expect(local(new Date(done.completed_at!)), `${h}:${m}`).toBe("2026-10-29");
    }
  });
});

describe("demo backend: the card identity (v0.6 evaluation, issue 10)", () => {
  it("gives each load of the demo an identity of its own, so one load's card is a friend's card in another", async () => {
    const a = createDemoBackend();
    const b = createDemoBackend();
    expect(await a.cards.publicKey()).not.toBe(await b.cards.publicKey());
    const sig = await a.cards.sign("payload");
    expect(await b.cards.verify(await a.cards.publicKey(), "payload", sig)).toBe(true);
  });

  it("keeps the fixed one for tests that don't ask for more, and takes a seed", async () => {
    const x = await createDemoBackend({ persist: false }).cards.publicKey();
    expect(await createDemoBackend({ persist: false }).cards.publicKey()).toBe(x);
    const seeded = await createDemoBackend({ persist: false, cardSeed: "launch-1" }).cards.publicKey();
    expect(seeded).not.toBe(x);
    expect(await createDemoBackend({ persist: false, cardSeed: "launch-1" }).cards.publicKey()).toBe(seeded);
    expect(await createDemoBackend({ persist: false, cardSeed: "launch-2" }).cards.publicKey()).not.toBe(seeded);
  });
});

describe("demo backend: updates (v0.7)", () => {
  afterEach(() => vi.useRealTimers());

  it("runs 0.7.0 and has not looked for anything yet", async () => {
    const b = createDemoBackend({ persist: false, now: () => at(30, 9) });
    expect(await b.updates.status()).toEqual({ current: "0.7.0", checkedAt: null, available: null, error: null });
  });

  it("finds 0.7.1 when it checks, with short notes whose highlights are worth reading", async () => {
    const b = createDemoBackend({ persist: false, now: () => at(30, 9) });
    const st = await b.updates.check(false);
    expect(st).toMatchObject({ current: "0.7.0", checkedAt: at(30, 9), error: null });
    expect(st.available).toMatchObject({ version: "0.7.1", canInstall: true, manualReason: null });
    expect(st.available!.publishedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(st.available!.notes.length).toBeLessThan(400);
    expect(highlights(st.available!.notes)).toHaveLength(3);
    // What was found is what `status` says from then on, and a forced check finds the same.
    expect((await b.updates.status()).available?.version).toBe("0.7.1");
    expect((await b.updates.check(true)).available?.version).toBe("0.7.1");
  });

  it("hands out its own copy of the status, so what a caller does to it changes nothing", async () => {
    const b = createDemoBackend({ persist: false });
    const st = await b.updates.check(false);
    st.available!.version = "9.9.9";
    expect((await b.updates.status()).available?.version).toBe("0.7.1");
  });

  it("installs by streaming the download over about two seconds, then the last step, and comes back as 0.7.1 with nothing to update", async () => {
    vi.useFakeTimers();
    const b = createDemoBackend({ persist: false });
    const checking = b.updates.check(false);
    await vi.advanceTimersByTimeAsync(1000);
    await checking;
    const seen: UpdateProgress[] = [];
    let done = false;
    const run = b.updates.install((p) => seen.push(p)).then(() => (done = true));
    await vi.advanceTimersByTimeAsync(1000);
    expect(done).toBe(false);
    expect(seen.length).toBeGreaterThan(2);
    await vi.advanceTimersByTimeAsync(2000);
    await run;
    const downloads = seen.filter((p): p is Extract<UpdateProgress, { phase: "downloading" }> => p.phase === "downloading");
    expect(downloads.length).toBeGreaterThanOrEqual(5);
    expect(downloads.every((p, i) => i === 0 || p.downloaded >= downloads[i - 1].downloaded)).toBe(true);
    expect(downloads.at(-1)).toMatchObject({ downloaded: downloads.at(-1)!.total });
    expect(seen.at(-1)).toEqual({ phase: "installing" });
    const after = await b.updates.status();
    expect(after).toMatchObject({ current: "0.7.1", available: null, error: null });
    // Up to date now: a check finds nothing.
    const again = b.updates.check(true);
    await vi.advanceTimersByTimeAsync(1000);
    expect((await again).available).toBeNull();
  });

  it("refuses to install when nothing is waiting, and a second install while one runs", async () => {
    vi.useFakeTimers();
    const b = createDemoBackend({ persist: false });
    const none = b.updates.install(() => undefined);
    await expect(none).rejects.toBeInstanceOf(BackendError);
    const found = b.updates.check(false);
    await vi.advanceTimersByTimeAsync(1000);
    await found;
    const first = b.updates.install(() => undefined);
    await expect(b.updates.install(() => undefined)).rejects.toMatchObject({ kind: "invalid" });
    await vi.advanceTimersByTimeAsync(4000);
    await first;
  });

  it("opens the page without a fuss", async () => {
    const b = createDemoBackend({ persist: false });
    await expect(b.updates.openPage()).resolves.toBeUndefined();
  });
});
