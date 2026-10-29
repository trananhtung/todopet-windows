// The browser demo's own clock and task list (v0.4 evaluation, issue 11): the next morning, and a Friday.
import { describe, expect, it } from "vitest";
import { createDemoBackend } from "./demo";

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
