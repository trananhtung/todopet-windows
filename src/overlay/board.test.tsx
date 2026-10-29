// @vitest-environment jsdom
// The board's menus, the pin dialog and the add field, in a real (jsdom) DOM with the demo brain.
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createDemoBackend, type DemoBackend } from "../backend/demo";
import { Brain } from "../core/brain";
import { setLang } from "../core/l10n";
import type { BoardRequest } from "./App";
import { Board } from "./Board";
import type { BoardPlacement } from "./placement";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const placement: BoardPlacement = { side: "right", left: 0, top: 0, bottom: 0, width: 360, height: 600 };
const request = (patch: Partial<BoardRequest> = {}): BoardRequest => ({ seq: 1, focusAdd: false, split: null, fromKeyboard: false, prefill: null, wrapUp: false, ...patch });

let container: HTMLDivElement;
let root: Root;
let brain: Brain;
let backend: DemoBackend;

interface MountOptions {
  /** A fixed clock (epoch ms) and a real (non-demo) day, for what depends on the date. */
  now?: number;
  setup?: (b: DemoBackend) => void;
}

async function mount(req: BoardRequest = request(), opts: MountOptions = {}) {
  backend = createDemoBackend({ persist: false, ...(opts.now ? { now: () => opts.now! } : {}) });
  opts.setup?.(backend);
  brain = await Brain.create(backend, { demo: opts.now === undefined, ...(opts.now ? { now: () => opts.now! } : {}) });
  setLang("en");
  await brain.start();
  brain.dismissBubble(brain.getSnapshot().bubble?.id ?? -1, "closed");
  await vi_waitFor(() => brain.getSnapshot().day.today.length > 0);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await render(req);
}

const render = (req: BoardRequest) =>
  act(async () => {
    root.render(<Board brain={brain} backend={backend} request={req} placement={placement} onClose={() => undefined} />);
  });

async function vi_waitFor(cond: () => boolean) {
  for (let i = 0; i < 100 && !cond(); i++) await new Promise((r) => setTimeout(r, 20));
}

const click = (el: Element) => act(async () => void el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, detail: 1 })));
const key = (el: Element, k: string, init: KeyboardEventInit = {}) =>
  act(async () => void el.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true, ...init })));
const type = (input: HTMLInputElement, value: string) =>
  act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
const byLabel = (label: string) => document.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!;
const menuItem = (menu: ParentNode, text: string) => [...menu.querySelectorAll<HTMLElement>('[role="menuitem"]')].find((e) => e.textContent?.includes(text))!;
const popover = (role: string) => document.querySelector<HTMLElement>(`.popover[role="${role}"]`);

beforeEach(() => {
  document.body.replaceChildren();
});
afterEach(async () => {
  await act(async () => root.unmount());
  brain.stop();
});

const MORE = "More: try 2 minutes, start when…";

describe("Start when… (item 4)", () => {
  async function openWhen() {
    const more = byLabel(MORE);
    await click(more);
    await click(menuItem(popover("menu")!, "Start when…"));
    return more;
  }

  it("has 'Another app…' as a menu item, and no form inside the menu", async () => {
    await mount();
    await openWhen();
    const menu = popover("menu")!;
    expect(menu.querySelector("form, input")).toBeNull();
    const another = menuItem(menu, "Another app");
    expect(another.getAttribute("aria-haspopup")).toBe("dialog");
    // Arrow keys reach it: it is the last item when no plan is set.
    await key(menu.querySelector("[role=menuitem]")!, "End");
    expect(document.activeElement).toBe(another);
  });

  it("opens its own dialog with the field focused, and sets the plan from it", async () => {
    await mount();
    const more = await openWhen();
    await click(menuItem(popover("menu")!, "Another app"));
    expect(popover("menu")).toBeNull();
    const dialog = popover("dialog")!;
    const input = dialog.querySelector("input")!;
    expect(document.activeElement).toBe(input);
    expect(dialog.querySelector("label")?.textContent).toMatch(/app/i);
    const set = [...dialog.querySelectorAll("button")].find((b) => b.textContent?.includes("Set"))!;
    expect(set.disabled).toBe(true);
    await type(input, "Figma");
    expect(set.disabled).toBe(false);
    await click(set);
    expect(brain.getSnapshot().triggers).toMatchObject([{ trigger: { kind: "appOpen", app: "Figma" } }]);
    expect(popover("dialog")).toBeNull();
    expect(document.activeElement).toBe(more);
  });

  it("keeps Tab inside the dialog, input included, and Escape closes it to the More button", async () => {
    await mount();
    const more = await openWhen();
    await click(menuItem(popover("menu")!, "Another app"));
    const dialog = popover("dialog")!;
    const input = dialog.querySelector("input")!;
    const buttons = [...dialog.querySelectorAll("button")];
    await key(input, "Tab");
    expect(buttons).toContain(document.activeElement);
    await key(document.activeElement!, "Tab");
    expect(document.activeElement).toBe(input); // wraps round to the input
    await key(input, "Tab", { shiftKey: true });
    expect(buttons).toContain(document.activeElement);
    await key(input, "Escape");
    expect(popover("dialog")).toBeNull();
    expect(document.activeElement).toBe(more);
  });
});

describe("focus after a menu action (item 13)", () => {
  it("returns to the Move button after a choice", async () => {
    await mount();
    const move = byLabel("Move");
    await click(move);
    await click(menuItem(popover("menu")!, "Tomorrow"));
    expect(popover("menu")).toBeNull();
    expect(document.activeElement).toBe(move);
  });

  it("returns to the More button after 'Try 2 minutes'", async () => {
    await mount();
    const more = byLabel(MORE);
    await click(more);
    await click(menuItem(popover("menu")!, "Try 2 minutes"));
    expect(brain.getSnapshot().focus?.starter).toBe(true);
    expect(document.activeElement).toBe(more);
  });
});

describe("Pin my place (item 13)", () => {
  const pin = () => document.querySelector<HTMLButtonElement>("button.pin")!;

  it("is described by its explanation instead of a long label", async () => {
    await mount();
    const b = pin();
    expect(b.getAttribute("aria-label") ?? "").not.toMatch(/memory/i);
    expect((b.getAttribute("aria-label") ?? b.textContent ?? "").length).toBeLessThan(30);
    const described = document.getElementById(b.getAttribute("aria-describedby") ?? "none");
    expect(described?.textContent).toMatch(/memory only/i);
  });

  it("takes focus back after pinning, and pre-fills the previous note when pinning again", async () => {
    await mount();
    await click(pin());
    let input = popover("dialog")!.querySelector("input")!;
    expect(input.value).toBe("");
    await type(input, "Fix the retry loop");
    await click([...popover("dialog")!.querySelectorAll("button")].find((b) => b.textContent?.includes("Pin"))!);
    expect(popover("dialog")).toBeNull();
    expect(document.activeElement).toBe(pin());
    await click(pin());
    input = popover("dialog")!.querySelector("input")!;
    expect(input.value).toBe("Fix the retry loop");
  });

  it("keeps Tab inside the dialog, input included", async () => {
    await mount();
    await click(pin());
    const dialog = popover("dialog")!;
    const input = dialog.querySelector("input")!;
    expect(document.activeElement).toBe(input);
    await key(input, "Tab");
    expect(document.activeElement?.tagName).toBe("BUTTON");
    await key(document.activeElement!, "Tab");
    expect(document.activeElement).toBe(input);
    await key(input, "Tab", { shiftKey: true });
    expect(document.activeElement?.tagName).toBe("BUTTON");
  });
});

describe("the add field's prefill (item 13)", () => {
  const field = () => document.querySelector<HTMLInputElement>("#add-task")!;

  it("fills an empty field", async () => {
    await mount();
    await render(request({ seq: 2, focusAdd: true, prefill: "Team sync: " }));
    expect(field().value).toBe("Team sync: ");
  });

  it("never overwrites a draft", async () => {
    await mount();
    await type(field(), "Buy milk");
    await render(request({ seq: 2, focusAdd: true, prefill: "Team sync: " }));
    expect(field().value).toBe("Buy milk");
  });
});

// ---------- The Wrap up sheet ----------

const FRIDAY_4PM = new Date(2026, 9, 30, 16).getTime();
const sheet = () => document.querySelector<HTMLElement>(".sheet.wrap")!;
const sheetButton = (text: string) => [...sheet().querySelectorAll<HTMLButtonElement>("button")].find((b) => (b.getAttribute("aria-label") ?? b.textContent ?? "").includes(text))!;
const noteField = () => document.querySelector<HTMLInputElement>("#wrap-note")!;
const wrapRequest = () => request({ wrapUp: true });

describe("the Wrap up sheet", () => {
  it("keeps the draft when the board closes and opens again", async () => {
    await mount(wrapRequest());
    await type(noteField(), "Call mum first");
    await click(sheet().querySelector<HTMLInputElement>('input[type="radio"]:not(:checked)')!);
    const frog = brain.getSnapshot().wrapDraft!.frogId;
    // The board goes away (blur, Escape, a click outside) and comes back.
    await act(async () => root.unmount());
    root = createRoot(container);
    await render(wrapRequest());
    expect(noteField().value).toBe("Call mum first");
    expect(brain.wrapDraft().frogId).toBe(frog);
    expect(sheet().querySelector<HTMLInputElement>('input[type="radio"]:checked')).not.toBeNull();
  });

  it("puts focus on the heading, and groups the frog choices with a label", async () => {
    await mount(wrapRequest());
    expect(document.activeElement?.tagName).toBe("H2");
    expect(document.activeElement?.textContent).toContain("Wrap up the day");
    const group = sheet().querySelector('[role="radiogroup"]')!;
    expect(group.getAttribute("aria-label")).toMatch(/frog/i);
    expect(group.querySelectorAll('input[type="radio"]').length).toBeGreaterThan(1);
  });

  it("shows a busy state that keeps its name, and can't be left meanwhile", async () => {
    await mount(wrapRequest());
    vi.spyOn(brain, "wrapUp").mockImplementation(() => new Promise(() => undefined));
    const done = sheetButton("Done for today");
    await click(done);
    expect(done.disabled).toBe(true);
    expect(done.getAttribute("aria-busy")).toBe("true");
    expect(done.getAttribute("aria-label")).toBe("Done for today");
    expect(sheetButton("Back").disabled).toBe(true);
    expect(sheetButton("Not yet").disabled).toBe(true);
  });

  it("says what moved and what didn't, in an alert, and the pet is still awake", async () => {
    await mount(wrapRequest());
    vi.spyOn(brain, "wrapUp").mockResolvedValue({ ok: false, moved: 1, offPlan: 0, failed: 2, error: "offline" });
    await click(sheetButton("Done for today"));
    const alert = sheet().querySelector('[role="alert"]')!;
    expect(alert.textContent).toContain("Moved 1");
    expect(alert.textContent).toContain("2 couldn't move");
    expect(alert.textContent).toContain("offline");
    expect(alert.textContent).toContain("still awake");
    expect(sheetButton("Done for today").disabled).toBe(false);
  });

  it("sends the sheet with Enter in the note, once", async () => {
    await mount(wrapRequest());
    const wrapUp = vi.spyOn(brain, "wrapUp").mockImplementation(() => new Promise(() => undefined));
    await key(noteField(), "Enter");
    await key(noteField(), "Enter");
    expect(wrapUp).toHaveBeenCalledTimes(1);
  });

  it("moves the frog to 'decide tomorrow' with a word about it when it is finished elsewhere", async () => {
    await mount(wrapRequest());
    const radios = () => [...sheet().querySelectorAll<HTMLInputElement>('input[type="radio"]')];
    const call = radios().find((r) => r.closest("li")?.textContent?.includes("Call client ABC"))!;
    await click(call);
    expect(call.checked).toBe(true);
    await backend.todoist.close("2");
    await act(async () => brain.refresh());
    const decide = radios().find((r) => r.closest("li")?.classList.contains("nofrog"))!;
    expect(decide.checked).toBe(true);
    expect(sheet().textContent).toContain("“Call client ABC” is already done");
  });

  it("gives the reason a repeating task can't move to a screen reader, and lists overdue ones", async () => {
    await mount(wrapRequest(), {
      setup: (b) => {
        const tasks = b.todoist.tasks.bind(b.todoist);
        b.todoist.tasks = async (f) => (await tasks(f)).map((t) => (t.id === "4" ? { ...t, due: { ...t.due!, string: "every day", is_recurring: true } } : t));
      },
    });
    const row = [...sheet().querySelectorAll("li.wrap-row")].find((li) => li.textContent?.includes("Plan the next sprint"))!;
    const group = row.querySelector('[role="group"]')!;
    const reason = document.getElementById(group.getAttribute("aria-describedby") ?? "none");
    expect(reason?.textContent).toMatch(/repeating task keeps its own schedule/i);
    expect([...group.querySelectorAll("button")].filter((b) => b.disabled)).toHaveLength(2);
    // Overdue tasks are on the sheet too.
    const overdue = [...sheet().querySelectorAll("li.wrap-row")].find((li) => li.textContent?.includes("Reply to the boss"))!;
    expect(overdue.textContent).toContain("overdue");
  });

  it("names the next workday on the buttons when it isn't tomorrow", async () => {
    await mount(wrapRequest(), { now: FRIDAY_4PM });
    expect(sheet().textContent).toContain("Monday");
    expect(sheetButton("All to Monday")).toBeTruthy();
    expect(sheet().textContent).toContain("First on Monday");
    expect(sheet().textContent).not.toContain("First tomorrow");
  });

  it("says kindly that nothing was ticked off, without 'showed up' or 'yet'", async () => {
    await mount(wrapRequest(), {
      setup: (b) => {
        b.todoist.completed = async () => [];
      },
    });
    const empty = sheet().querySelector(".wrap-empty")!.textContent!;
    expect(empty).toContain("Nothing ticked off today, and that's okay. Tomorrow is a fresh page");
    expect(empty).not.toMatch(/showed up|yet/i);
  });

  it("returns focus to the Wrap up button when it closes", async () => {
    await mount(wrapRequest(), { now: FRIDAY_4PM });
    await click(sheetButton("Back"));
    expect(document.querySelector(".sheet.wrap")).toBeNull();
    expect(document.activeElement).toBe(document.querySelector("[data-wrap-up]"));
  });
});

describe("the day strip", () => {
  it("lists the meetings and timed tasks with their times for a screen reader, and stacks blocks that overlap", async () => {
    await mount(request(), {
      now: new Date(2026, 9, 28, 10).getTime(),
      setup: (b) => {
        const day = (h: number, m = 0) => {
          const d = new Date(2026, 9, 28, h, m);
          const p = (n: number) => String(n).padStart(2, "0");
          return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}T${p(d.getHours())}${p(d.getMinutes())}00`;
        };
        const ev = (uid: string, title: string, a: string, z: string) => `BEGIN:VEVENT\r\nUID:${uid}\r\nDTSTART:${a}\r\nDTEND:${z}\r\nSUMMARY:${title}\r\nEND:VEVENT`;
        b.calendar.fetchIcs = async () => [
          { host: "demo.todopet", ok: true, text: `BEGIN:VCALENDAR\r\nVERSION:2.0\r\n${ev("a", "Design review", day(11), day(12))}\r\n${ev("b", "Budget call", day(11, 30), day(12, 30))}\r\nEND:VCALENDAR` },
        ];
      },
    });
    const track = document.querySelector<HTMLElement>(".ds-track")!;
    const label = track.getAttribute("aria-label")!;
    expect(label).toContain("Design review 11:00–12:00");
    expect(label).toContain("Budget call 11:30–12:30");
    const tops = [...track.querySelectorAll<HTMLElement>(".ds-seg")].map((e) => e.style.top);
    expect(new Set(tops).size).toBe(2);
  });
});
