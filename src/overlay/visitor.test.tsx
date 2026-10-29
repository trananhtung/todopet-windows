// @vitest-environment jsdom
// A friend's pet dropping by (Visitor.tsx): its frame loop, its label, the end of a visit. The loop is driven by hand
// (a fake requestAnimationFrame), so it is the component's own throttling that is measured, not the machine's.
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { demoPublicKey } from "../backend/demoCards";
import type { Brain } from "../core/brain";
import type { Friend, Visit } from "../core/friends";
import { VISIT_WALK_MS } from "../core/friends";
import { setLang } from "../core/l10n";
import { Visitor, type PetAnchor } from "./Visitor";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const friend = (patch: Partial<Friend> = {}): Friend => ({
  pk: demoPublicKey("mai"),
  name: "Mai",
  species: "shiba",
  accessories: ["flowercrown"],
  stage: 2,
  week: "2026-W44",
  weekDone: 9,
  history: "G".repeat(28),
  date: "2026-10-28",
  lastVisit: null,
  ...patch,
});
const visit = (patch: Partial<Visit> = {}): Visit => ({ id: 1, friend: friend(), streak: 3, start: 0, end: 25_000, ...patch });

let container: HTMLDivElement;
let root: Root;
let clock = 0;
let clockReads = 0;
let layoutReads = 0;
const brain = { clockNow: () => (clockReads++, clock) } as unknown as Brain;
const anchor = { current: { x: 400, top: 300, feetY: 400, size: 100 } as PetAnchor };

// requestAnimationFrame, by hand.
let nextId = 1;
const queue = new Map<number, FrameRequestCallback>();
const cancelled: number[] = [];
/** Runs the frame callbacks that are waiting, as one display frame at `t` ms. */
const frame = (t: number) => {
  const waiting = [...queue.entries()];
  queue.clear();
  for (const [, cb] of waiting) cb(t);
};
/** Display frames at 60 Hz from `from` for `ms`, each at the visit clock it would have (the clock follows the frame). */
const run = (from: number, ms: number, startClock = from) => {
  for (let t = from; t < from + ms; t += 1000 / 60) {
    clock = startClock + (t - from);
    frame(t);
  }
};

interface Props {
  visit?: Visit;
  hideLabel?: boolean;
  petName?: string;
  tag?: string | null;
  onOpen?: () => void;
}
const render = (p: Props = {}) =>
  act(async () => {
    root.render(<Visitor key={(p.visit ?? visit()).id} brain={brain} visit={p.visit ?? visit()} anchor={anchor} hideLabel={p.hideLabel ?? false} petName={p.petName ?? "Mochi"} tag={p.tag ?? null} onOpen={p.onOpen ?? (() => undefined)} />);
  });

const wrap = () => container.querySelector<HTMLElement>(".visitor")!;
const label = () => container.querySelector<HTMLElement>(".visitor-label");

beforeEach(() => {
  setLang("en");
  document.body.replaceChildren();
  // The component's parent is the overlay's stage; here it is this element.
  container = document.createElement("div");
  Object.defineProperty(container, "clientWidth", {
    get() {
      layoutReads++;
      return 800;
    },
  });
  document.body.append(container);
  root = createRoot(container);
  clock = 0;
  clockReads = 0;
  layoutReads = 0;
  nextId = 1;
  queue.clear();
  cancelled.length = 0;
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
    const id = nextId++;
    queue.set(id, cb);
    return id;
  });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => {
    cancelled.push(id);
    queue.delete(id);
  });
  vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener: () => undefined, removeEventListener: () => undefined }));
  Object.defineProperty(HTMLElement.prototype, "offsetWidth", {
    configurable: true,
    get() {
      layoutReads++;
      return 120;
    },
  });
});
afterEach(async () => {
  await act(async () => root.unmount());
  vi.unstubAllGlobals();
  Reflect.deleteProperty(HTMLElement.prototype, "offsetWidth");
});

describe("the visitor's label", () => {
  it("is placed by the frame loop, and again when it comes back after a bubble hid it (review MEDIUM 3)", async () => {
    await render();
    run(0, 200);
    const first = label()!;
    expect(first.style.left).not.toBe("");
    // A bubble shows over your pet: the label goes. It comes back as a new element.
    await render({ hideLabel: true });
    expect(label()).toBeNull();
    await render({ hideLabel: false });
    const second = label()!;
    expect(second).not.toBe(first);
    expect(second.style.left).toBe("");
    run(300, 200, 300);
    // The loop placed the one on screen now, not the one that was there when it started.
    expect(second.style.left).not.toBe("");
  });

  it("reads the label on every frame: one that has not been there since the visit began is placed too", async () => {
    await render({ hideLabel: true });
    run(0, 200);
    expect(label()).toBeNull();
    await render({ hideLabel: false });
    run(300, 200, 300);
    expect(label()!.style.left).not.toBe("");
  });

  it("shows the name isolated in a <bdi>, and the buddy streak, and opens Friends when it is clicked", async () => {
    const onOpen = vi.fn();
    await render({ visit: visit({ friend: friend({ name: "דניאל" }), streak: 4 }), onOpen });
    const tag = label()!;
    expect(tag.querySelector("bdi")?.textContent).toBe("דניאל");
    expect(tag.textContent).toBe("דניאל dropped by! 🔥 buddy streak 4");
    expect(tag.getAttribute("aria-label")).toMatch(/Open Friends/);
    await act(async () => void tag.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it("shows the friend's species beside a name that could pass for mine", async () => {
    await render({ visit: visit({ friend: friend({ name: "MOCHI", species: "fox" }) }), petName: "Mochi" });
    expect(label()!.querySelector(".friend-lookalike")?.textContent).toMatch(/Fox/);
    expect(label()!.getAttribute("aria-label")).toMatch(/MOCHI \(.*Fox\)/);
    await render({ visit: visit({ friend: friend({ name: "Mai" }) }), petName: "Mochi" });
    expect(label()!.querySelector(".friend-lookalike")).toBeNull();
    // A pet that kept the name of its species doesn't say it twice.
    await render({ visit: visit({ friend: friend({ name: "Mochi", species: "mochi" }) }), petName: "Mochi" });
    expect(label()!.querySelector(".friend-lookalike")?.textContent).toBe(" (🍡)");
    expect(label()!.getAttribute("aria-label")).toMatch(/^Mochi \(🍡\) dropped by!/);
  });
});

// v0.6 evaluation, issue 2: the label was one nowrap line cut with an ellipsis, so "Sir Fluffington dropped by! 🔥 buddy stre…" lost the
// streak it exists to show. Now the name is on one line (it alone gives way) and "dropped by! 🔥 buddy streak N" on the next, never cut.
describe("the visitor's label keeps the streak (v0.6 evaluation, issue 2)", () => {
  const NAMES = ["Bánh Bao Nhỏ", "Sir Fluffington", "Cục Bông Nhỏ Xíu", "Captain Whiskers III", "Princess Marshmallow", "WWWWWWWWWWWWWWWWWWWW"];

  it("puts the name and the streak in parts of their own, whatever the name: only the name can be cut", async () => {
    for (const lang of ["en", "vi"] as const) {
      setLang(lang);
      for (const name of NAMES) {
        await render({ visit: visit({ friend: friend({ name }), streak: 3 }) });
        const tag = label()!;
        const who = tag.querySelector(".vl-who")!;
        const tail = tag.querySelector(".vl-tail")!;
        expect(who.querySelector("bdi")?.textContent, name).toBe(name);
        expect(who.textContent, name).toBe(name);
        // The streak is whole, in its own part, with none of the name in it.
        expect(tail.textContent, name).toBe(lang === "en" ? " dropped by! 🔥 buddy streak 3" : " ghé chơi! 🔥 chuỗi bạn 3 ngày");
        expect(tail.querySelector("bdi")).toBeNull();
        // And the whole thing still reads as one sentence.
        expect(tag.textContent, name).toBe(name + tail.textContent);
        expect(tag.getAttribute("aria-label")).toContain(name);
      }
    }
    setLang("en");
  });

  it("has a tail with no streak to show for a friend with none, and still never cuts it", async () => {
    await render({ visit: visit({ streak: 0 }) });
    expect(label()!.querySelector(".vl-tail")?.textContent).toBe(" dropped by! 👋");
  });

  it("tells two friends of one name apart in the label, the tooltip and the screen reader's name", async () => {
    await render({ visit: visit({ friend: friend({ name: "Mai" }), streak: 2 }), tag: "#a3f" });
    const tag = label()!;
    expect(tag.querySelector(".vl-who")?.textContent).toBe("Mai · #a3f");
    expect(tag.querySelector(".vl-who .friend-tag")?.textContent).toBe(" · #a3f");
    expect(tag.querySelector(".vl-tail")?.textContent).toBe(" dropped by! 🔥 buddy streak 2");
    expect(tag.getAttribute("title")).toBe("Mai · #a3f dropped by! 🔥 buddy streak 2");
    expect(tag.getAttribute("aria-label")).toBe("Mai · #a3f dropped by! 🔥 buddy streak 2. Open Friends");
    // A name that is alone has no tag.
    await render({ visit: visit({ friend: friend({ name: "Mai" }), streak: 2 }), tag: null });
    expect(label()!.querySelector(".friend-tag")).toBeNull();
    expect(label()!.getAttribute("title")).toBe("Mai dropped by! 🔥 buddy streak 2");
  });

  it("keeps the tag and the look-alike species beside a name that is cut", async () => {
    await render({ visit: visit({ friend: friend({ name: "MOCHI", species: "fox" }) }), petName: "Mochi", tag: "#0b2" });
    const marks = [...label()!.querySelectorAll(".vl-who > span")].map((e) => e.textContent);
    expect(marks[0]).toMatch(/Fox/);
    expect(marks[1]).toBe(" · #0b2");
  });
});

describe("the frame loop", () => {
  it("draws the pet and fades it in as it walks in", async () => {
    await render();
    clock = 0;
    frame(0);
    expect(wrap().querySelector(".visitor-art svg")).not.toBeNull();
    clock = 300;
    run(300, 100, 300);
    expect(Number(wrap().style.opacity)).toBeGreaterThan(0);
    expect(wrap().style.transform).toMatch(/translate/);
  });

  it("is about 12 frames a second while it walks, not one for every frame the display makes (review LOW 7)", async () => {
    await render();
    run(0, 1000, 0); // 60 display frames, all inside the walk in
    // Everything the loop does reads the layout; so the layout reads count the work it did.
    expect(layoutReads).toBeLessThanOrEqual(2 * 14);
    expect(layoutReads).toBeGreaterThanOrEqual(2 * 9);
    // And the clock, the other thing every body of the loop reads.
    expect(clockReads).toBeLessThanOrEqual(14);
  });

  it("is about 4 frames a second while it just stands there", async () => {
    await render();
    run(0, 6000, 0); // through the walk in
    layoutReads = 0;
    clockReads = 0;
    run(6000, 1000, 6000); // standing, with 60 display frames
    expect(clockReads).toBeLessThanOrEqual(6);
    expect(clockReads).toBeGreaterThanOrEqual(3);
    expect(layoutReads).toBeLessThanOrEqual(2 * 6);
  });

  it("writes nothing that has not changed while it stands", async () => {
    await render();
    run(0, 6000, 0);
    const el = wrap();
    const writes: string[] = [];
    for (const prop of ["opacity", "width", "height", "transform"] as const) {
      let v = el.style[prop];
      Object.defineProperty(el.style, prop, {
        get: () => v,
        set: (x: string) => {
          writes.push(prop);
          v = x;
        },
      });
    }
    run(6000, 1000, 6000);
    // Standing still, in the same place, at full opacity: nothing to move.
    expect(writes).toEqual([]);
  });

  it("is hidden when its time is up, and does no more drawing or layout until it is taken away", async () => {
    await render();
    run(0, 1000, 0);
    clock = 25_100;
    frame(2000);
    expect(wrap().style.opacity).toBe("0");
    const art = wrap().querySelector<HTMLElement>(".visitor-art")!;
    const html = art.innerHTML;
    layoutReads = 0;
    run(3000, 1000, 25_200);
    expect(art.innerHTML).toBe(html);
    expect(wrap().style.opacity).toBe("0");
    expect(layoutReads).toBeLessThanOrEqual(2 * 6);
  });

  it("walks out at the end: the brain may shorten the visit and the loop follows", async () => {
    await render();
    run(0, 8000, 0);
    // The board opened: the visit now ends in the walk-out time.
    await render({ visit: visit({ id: 1, end: 8000 + VISIT_WALK_MS }) });
    clock = 8000 + VISIT_WALK_MS - 200;
    run(9000, 200, clock);
    expect(Number(wrap().style.opacity)).toBeLessThan(0.6);
  });

  it("stops when the component goes away: the frame it asked for is cancelled, and nothing runs after", async () => {
    await render();
    run(0, 200, 0);
    expect(queue.size).toBe(1);
    const pending = [...queue.keys()][0];
    await act(async () => root.unmount());
    expect(cancelled).toContain(pending);
    expect(queue.size).toBe(0);
    const reads = clockReads;
    run(300, 500, 300);
    expect(clockReads).toBe(reads);
    // (afterEach unmounts again: a second root is made so there is something for it to unmount.)
    root = createRoot(container);
  });

  it("starts its loop over for the next visit, and cancels the one before", async () => {
    await render({ visit: visit({ id: 1 }) });
    run(0, 200, 0);
    const before = [...queue.keys()][0];
    await render({ visit: visit({ id: 2, friend: friend({ name: "Bin" }) }) });
    expect(cancelled).toContain(before);
    expect(queue.size).toBe(1);
    expect(label()!.textContent).toContain("Bin");
  });

  it("with reduced motion it stays where it stands and does not walk", async () => {
    vi.stubGlobal("matchMedia", (q: string) => ({ matches: q.includes("reduce"), addEventListener: () => undefined, removeEventListener: () => undefined }));
    await render();
    clock = 0;
    frame(0);
    const at = wrap().style.transform;
    run(100, 800, 100);
    expect(wrap().style.transform).toBe(at);
  });
});
