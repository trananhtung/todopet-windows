// @vitest-environment jsdom
// The board's menus, the pin dialog and the add field, in a real (jsdom) DOM with the demo brain.
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createDemoBackend, type DemoBackend } from "../backend/demo";
import { Brain } from "../core/brain";
import { dayKey } from "../core/dates";
import { encodeCard, isoWeekKey, type PetCard } from "../core/friends";
import { setLang } from "../core/l10n";
import type { BoardRequest } from "./App";
import { Board } from "./Board";
import type { BoardPlacement } from "./placement";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const placement: BoardPlacement = { side: "right", left: 0, top: 0, bottom: 0, width: 360, height: 600 };
const request = (patch: Partial<BoardRequest> = {}): BoardRequest => ({ seq: 1, focusAdd: false, split: null, fromKeyboard: false, prefill: null, wrapUp: false, focusTaskId: null, lighten: false, ...patch });

let container: HTMLDivElement;
let root: Root;
let brain: Brain;
let backend: DemoBackend;

interface MountOptions {
  /** A fixed clock (epoch ms) and a real (non-demo) day, for what depends on the date. */
  now?: number;
  setup?: (b: DemoBackend) => void;
  /** Where the board is (a short one, above the pet, is "compact"). */
  placement?: Partial<BoardPlacement>;
}

let placementNow: BoardPlacement = placement;

async function mount(req: BoardRequest = request(), opts: MountOptions = {}) {
  placementNow = { ...placement, ...opts.placement };
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
    root.render(<Board brain={brain} backend={backend} request={req} placement={placementNow} onClose={() => undefined} />);
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
const frogSelect = () => document.querySelector<HTMLSelectElement>(".wrap-tomorrow select")!;
const pickFrog = (value: string) =>
  act(async () => {
    const select = frogSelect();
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")!.set!.call(select, value);
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
const rowOf = (title: string) => [...sheet().querySelectorAll<HTMLElement>("li.wrap-row")].find((li) => li.textContent?.includes(title))!;
const radiosIn = (el: ParentNode) => [...el.querySelectorAll<HTMLButtonElement>('[role="radio"]')];

describe("the Wrap up sheet", () => {
  it("keeps the draft when the board closes and opens again", async () => {
    await mount(wrapRequest());
    await type(noteField(), "Call mum first");
    const other = [...frogSelect().options].find((o) => o.value !== "" && o.value !== frogSelect().value && !o.disabled)!;
    await pickFrog(other.value);
    const frog = brain.getSnapshot().wrapDraft!.frogId;
    expect(frog).toBe(other.value);
    // The board goes away (blur, Escape, a click outside) and comes back.
    await act(async () => root.unmount());
    root = createRoot(container);
    await render(wrapRequest());
    expect(noteField().value).toBe("Call mum first");
    expect(brain.wrapDraft().frogId).toBe(frog);
    expect(frogSelect().value).toBe(frog);
  });

  it("puts focus on the heading, and labels the frog choice and each task's choices", async () => {
    await mount(wrapRequest());
    expect(document.activeElement?.tagName).toBe("H2");
    expect(document.activeElement?.textContent).toContain("Wrap up the day");
    const label = document.querySelector(`label[for="${frogSelect().id}"]`)!;
    expect(label.textContent).toMatch(/first tomorrow/i);
    const groups = [...sheet().querySelectorAll('[role="radiogroup"]')];
    expect(groups.length).toBe(brain.getSnapshot().day.today.length + brain.getSnapshot().day.overdue.length);
    for (const g of groups) expect(g.getAttribute("aria-label")).toMatch(/what to do with/i);
  });

  // v0.4 evaluation, issue 10: "🐸 First tomorrow" was repeated on every row (4 to 10 times).
  it("says it once: one first-task choice up top, and a frog only in the row it is on", async () => {
    await mount(wrapRequest());
    // (The row with the frog says it to a screen reader only.)
    const visible = (el: Element) => {
      const copy = el.cloneNode(true) as Element;
      copy.querySelectorAll(".sr-only").forEach((e) => e.remove());
      return copy.textContent!;
    };
    expect(visible(sheet()).match(/First tomorrow/g)).toHaveLength(1);
    expect(sheet().querySelectorAll('input[type="radio"]')).toHaveLength(0);
    expect(sheet().querySelectorAll(".wrap-frog-mark")).toHaveLength(1);
    expect(sheet().querySelector(".wrap-row.is-frog")).not.toBeNull();
  });

  it("puts tomorrow's first task and the note above the list of tasks", async () => {
    await mount(wrapRequest());
    const position = (el: Element, other: Element) => el.compareDocumentPosition(other);
    expect(position(noteField(), sheet().querySelector(".wrap-tasks")!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(position(frogSelect(), sheet().querySelector(".wrap-tasks")!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("can't pick a task moved off the plan as the first task", async () => {
    await mount(wrapRequest());
    const call = rowOf("Call client ABC");
    await click(radiosIn(call).find((r) => r.textContent === "No date")!);
    const option = [...frogSelect().options].find((o) => o.textContent === "Call client ABC")!;
    expect(option.disabled).toBe(true);
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
    const call = [...frogSelect().options].find((o) => o.textContent === "Call client ABC")!;
    await pickFrog(call.value);
    expect(frogSelect().value).toBe(call.value);
    await backend.todoist.close("2");
    await act(async () => brain.refresh());
    expect(frogSelect().value).toBe("");
    expect(sheet().textContent).toContain("“Call client ABC” is already done");
  });

  it("gives the reason a repeating task can't move to a screen reader, and lists overdue ones", async () => {
    await mount(wrapRequest(), {
      setup: (b) => {
        const tasks = b.todoist.tasks.bind(b.todoist);
        b.todoist.tasks = async (f) => (await tasks(f)).map((t) => (t.id === "4" ? { ...t, due: { ...t.due!, string: "every day", is_recurring: true } } : t));
      },
    });
    const row = rowOf("Plan the next sprint");
    const group = row.querySelector('[role="radiogroup"]')!;
    const reason = document.getElementById(group.getAttribute("aria-describedby") ?? "none");
    expect(reason?.textContent).toMatch(/repeating task keeps its own schedule/i);
    expect(radiosIn(group).filter((b) => b.disabled)).toHaveLength(2);
    // Overdue tasks are on the sheet too.
    const overdue = rowOf("Reply to the boss");
    expect(overdue.textContent).toContain("overdue");
  });

  it("names the next workday on the buttons when it isn't tomorrow", async () => {
    await mount(wrapRequest(), { now: FRIDAY_4PM });
    expect(sheet().textContent).toContain("Monday");
    expect(sheetButton("All to Monday")).toBeTruthy();
    expect(sheet().textContent).toContain("First on Monday");
    expect(sheet().textContent).not.toContain("First tomorrow");
  });

  // v0.4 evaluation round 2, issue 3: "Where do I start tomorrow?" stayed next to "First on Monday".
  it("says Monday in every label of the sheet on a Friday, not 'tomorrow'", async () => {
    await mount(wrapRequest(), { now: FRIDAY_4PM, setup: (b) => { b.todoist.completed = async () => []; } });
    const visible = (el: Element) => {
      const copy = el.cloneNode(true) as Element;
      copy.querySelectorAll(".sr-only").forEach((e) => e.remove());
      return copy.textContent!;
    };
    const label = document.querySelector(`label[for="wrap-note"]`)!;
    expect(label.textContent).toBe("Where do I start on Monday?");
    expect(visible(sheet())).not.toMatch(/tomorrow/i);
    expect(sheet().querySelector(".wrap-tomorrow")?.getAttribute("aria-label")).toBe("For Monday");
    expect([...frogSelect().options][0].textContent).toBe("I'll decide on Monday");
    expect(sheet().querySelector(".wrap-intro")?.textContent).toContain("a tidy desk for Monday");
    expect(sheet().querySelector(".wrap-empty")?.textContent).toContain("Monday is a fresh page");
  });

  it("says it the same way in Vietnamese: Thứ Hai", async () => {
    await mount(wrapRequest(), { now: FRIDAY_4PM, setup: (b) => { b.todoist.completed = async () => []; } });
    setLang("vi");
    await render(request({ seq: 2, wrapUp: true }));
    expect(document.querySelector(`label[for="wrap-note"]`)?.textContent).toBe("Thứ Hai mình bắt đầu từ đâu?");
    expect(sheet().textContent).not.toMatch(/\bmai\b|ngày mai/i);
    expect(sheetButton("Tất cả sang Thứ Hai")).toBeTruthy();
    expect(sheet().querySelector(".wrap-tomorrow")?.getAttribute("aria-label")).toBe("Cho Thứ Hai");
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

// v0.4 evaluation, issue 9: three buttons per task meant 34 Tab presses to reach "Done for today" with ten tasks.
describe("the Wrap up sheet's keyboard", () => {
  const checked = (row: HTMLElement) => radiosIn(row).find((r) => r.getAttribute("aria-checked") === "true")!;

  it("makes each task's choices one tab stop, with the checked one in the tab order", async () => {
    await mount(wrapRequest());
    for (const g of sheet().querySelectorAll('[role="radiogroup"]')) {
      const stops = radiosIn(g).filter((r) => r.tabIndex === 0);
      expect(stops).toHaveLength(1);
      expect(stops[0].getAttribute("aria-checked")).toBe("true");
    }
    // Back, the first task, the note, All to tomorrow, one stop per task, and the two buttons: about 10 Tab presses at most.
    const stops = [...sheet().querySelectorAll<HTMLElement>("button, input, select")].filter((e) => !(e as HTMLButtonElement).disabled && e.tabIndex >= 0);
    expect(stops.length).toBeLessThanOrEqual(brain.getSnapshot().day.today.length + brain.getSnapshot().day.overdue.length + 8);
  });

  it("moves between the choices with the arrow keys, Home and End, as a native radio group does", async () => {
    await mount(wrapRequest());
    const row = rowOf("Call client ABC");
    const group = row.querySelector<HTMLElement>('[role="radiogroup"]')!;
    const [tomorrow, none, keep] = radiosIn(group);
    expect(checked(row)).toBe(keep);
    keep.focus();
    await key(keep, "ArrowLeft");
    expect(checked(row)).toBe(none);
    expect(document.activeElement).toBe(none);
    expect(brain.wrapDraft().moves["2"]).toBe("none");
    await key(none, "Home");
    expect(checked(row)).toBe(tomorrow);
    expect(brain.wrapDraft().moves["2"]).toBe("tomorrow");
    await key(tomorrow, "ArrowLeft");
    expect(checked(row)).toBe(keep); // wraps round
    await key(keep, "End");
    expect(checked(row)).toBe(keep);
    await key(keep, "ArrowDown");
    expect(checked(row)).toBe(tomorrow);
  });

  it("skips the choices a repeating task can't have", async () => {
    await mount(wrapRequest(), {
      setup: (b) => {
        const tasks = b.todoist.tasks.bind(b.todoist);
        b.todoist.tasks = async (f) => (await tasks(f)).map((t) => (t.id === "4" ? { ...t, due: { ...t.due!, string: "every day", is_recurring: true } } : t));
      },
    });
    const row = rowOf("Plan the next sprint");
    const keep = radiosIn(row).find((r) => r.textContent === "Keep")!;
    keep.focus();
    await key(keep, "ArrowRight");
    expect(checked(row)).toBe(keep);
    expect(brain.wrapDraft().moves["4"] ?? "keep").toBe("keep");
  });

  it("goes back to the list with Escape instead of closing the board, and the draft stays", async () => {
    await mount(wrapRequest());
    await type(noteField(), "Start with the intro");
    const esc = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
    await act(async () => void noteField().dispatchEvent(esc));
    // Taken by the sheet (the overlay only closes the board on an Escape nobody took).
    expect(esc.defaultPrevented).toBe(true);
    expect(document.querySelector(".sheet.wrap")).toBeNull();
    expect(document.querySelector("#add-task")).not.toBeNull();
    expect(brain.wrapDraft().note).toBe("Start with the intro");
    // From the list itself, Escape is left alone.
    const again = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
    await act(async () => void document.querySelector("#add-task")!.dispatchEvent(again));
    expect(again.defaultPrevented).toBe(false);
  });

  it("keeps its Escape while it is sending (the sheet can't be left meanwhile)", async () => {
    await mount(wrapRequest());
    vi.spyOn(brain, "wrapUp").mockImplementation(() => new Promise(() => undefined));
    await click(sheetButton("Done for today"));
    const esc = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
    await act(async () => void sheet().dispatchEvent(esc));
    expect(document.querySelector(".sheet.wrap")).not.toBeNull();
  });
});

const WED_9AM = new Date(2026, 9, 28, 9).getTime();
const WED_10AM = new Date(2026, 9, 28, 10).getTime();

/** Today's meetings, as an ICS the demo calendar serves (local times on Wednesday 28 October). */
function meetingsOn(...events: [uid: string, title: string, from: [number, number], to: [number, number]][]) {
  const day = ([h, m]: [number, number]) => {
    const p = (n: number) => String(n).padStart(2, "0");
    return `20261028T${p(h)}${p(m)}00`;
  };
  const ev = (uid: string, title: string, a: [number, number], z: [number, number]) => `BEGIN:VEVENT\r\nUID:${uid}\r\nDTSTART:${day(a)}\r\nDTEND:${day(z)}\r\nSUMMARY:${title}\r\nEND:VEVENT`;
  return (b: DemoBackend) => {
    b.calendar.fetchIcs = async () => [{ host: "demo.todopet", ok: true, text: `BEGIN:VCALENDAR\r\nVERSION:2.0\r\n${events.map((e) => ev(...e)).join("\r\n")}\r\nEND:VCALENDAR` }];
  };
}

describe("the day strip", () => {
  const busyDay = meetingsOn(["a", "Design review", [11, 0], [12, 0]], ["b", "Budget call", [11, 30], [12, 30]], ["c", "Quarterly planning", [14, 0], [17, 0]]);
  const track = () => document.querySelector<HTMLElement>(".ds-track")!;
  const segs = () => [...track().querySelectorAll<HTMLElement>(".ds-seg")];

  it("lists the meetings and timed tasks with their times for a screen reader, and stacks blocks that overlap", async () => {
    await mount(request(), { now: WED_10AM, setup: busyDay });
    expect(track().getAttribute("role")).toBe("group");
    expect(track().getAttribute("aria-label")).toContain("3 meetings");
    const labels = segs().map((e) => e.getAttribute("aria-label"));
    expect(labels).toContain("Meeting: Design review, 11:00 to 12:00");
    expect(labels).toContain("Meeting: Budget call, 11:30 to 12:30");
    expect(labels).toContain("Timed task: Call client ABC, 11:00 to 11:30");
    const tops = segs().map((e) => e.style.top);
    expect(new Set(tops).size).toBe(2);
  });

  // v0.4 evaluation, issue 7: 8 px unlabeled bars, mouse-only, orange under 3:1 on the light track.
  it("draws 14 px bars, and names the blocks that are wide enough", async () => {
    await mount(request(), { now: WED_10AM, setup: busyDay });
    for (const seg of segs()) expect(seg.style.height).toBe("14px");
    const labelled = segs().filter((e) => e.querySelector(".ds-label"));
    expect(labelled.map((e) => e.textContent)).toEqual(["Quarterly planning"]);
  });

  // v0.4 evaluation round 2, minor: the caption announced itself on every hover; focus already reads each bar's label.
  it("doesn't announce its caption on every hover", async () => {
    await mount(request(), { now: WED_10AM, setup: busyDay });
    expect(document.querySelector(".ds-caption")?.getAttribute("aria-live")).toBeNull();
    expect(segs()[0].getAttribute("aria-label")).toContain("Design review");
  });

  it("marks the hours every 2 hours", async () => {
    await mount(request(), { now: WED_10AM, setup: busyDay });
    const axis = [...document.querySelectorAll(".ds-axis span")].map((e) => e.textContent);
    expect(axis).toEqual(["08", "10", "12", "14", "16", "18"]);
    expect(track().querySelectorAll(".ds-tick")).toHaveLength(4);
  });

  it("is reachable by keyboard: one tab stop, arrow keys between the blocks, and a caption that says what each is", async () => {
    await mount(request(), { now: WED_10AM, setup: busyDay });
    const stops = segs().filter((e) => e.tabIndex === 0);
    expect(stops).toHaveLength(1);
    const caption = () => document.querySelector(".ds-caption")!.textContent;
    expect(caption()).toContain("Now 10:00");
    expect(caption()).toContain("next: ");
    await act(async () => stops[0].focus());
    expect(caption()).toContain(segs()[0].getAttribute("title")!);
    await key(stops[0], "ArrowRight");
    expect(document.activeElement).toBe(segs()[1]);
    expect(segs()[1].tabIndex).toBe(0);
    expect(segs()[0].tabIndex).toBe(-1);
    expect(caption()).toContain(segs()[1].getAttribute("title")!);
    await key(segs()[1], "End");
    expect(document.activeElement).toBe(segs()[segs().length - 1]);
    await key(document.activeElement!, "Home");
    expect(document.activeElement).toBe(segs()[0]);
    await act(async () => segs()[0].blur());
    expect(caption()).toContain("Now 10:00");
  });

  it("names the day's hours: 09:00 to 18:00 ends at 18, and the tick one hour from it gives way", async () => {
    await mount(request(), { now: WED_10AM, setup: busyDay });
    const { axisHours } = await import("./DayStrip");
    expect(axisHours(8, 18)).toEqual([8, 10, 12, 14, 16, 18]);
    expect(axisHours(9, 18)).toEqual([9, 11, 13, 15, 18]);
    expect(axisHours(8, 17)).toEqual([8, 10, 12, 14, 17]);
    expect(axisHours(9, 17)).toEqual([9, 11, 13, 15, 17]);
    expect(axisHours(8, 24)).toEqual([8, 10, 12, 14, 16, 18, 20, 22, 24]);
  });

  it("says how far over the day is in plain words, and it is the way into lightening it", async () => {
    await mount(request(), { now: WED_9AM, setup: (b) => b.demo.setHeavyDay(true) });
    const over = document.querySelector<HTMLButtonElement>(".ds-over")!;
    expect(over.textContent).toMatch(/^~\d+h\d* over$|^~\d+h over$/);
    expect(over.getAttribute("aria-pressed")).toBe("false");
    expect(document.querySelector(".lighten-banner")).toBeNull();
    await click(over);
    expect(document.querySelector(".lighten-banner")).not.toBeNull();
    // The banner has the words now: the chip steps aside so it is said once.
    expect(document.querySelector(".ds-over")).toBeNull();
    expect(document.querySelector(".lighten-banner")?.textContent).toContain(over.textContent);
  });

  it("has no over text when the day fits", async () => {
    await mount(request(), { now: WED_9AM });
    expect(document.querySelector(".ds-over")).toBeNull();
    expect(document.querySelector(".ds-meter")).not.toBeNull();
  });
});

describe("lightening an overbooked day (v0.4 evaluation, issue 3)", () => {
  const heavy = (b: DemoBackend) => b.demo.setHeavyDay(true);
  const rows = () => [...document.querySelectorAll<HTMLElement>(".task.lightening")];
  const rowFor = (title: string) => rows().find((r) => r.textContent?.includes(title))!;
  const banner = () => document.querySelector<HTMLElement>(".lighten-banner");

  it("opens with how far over the day is, and a close button", async () => {
    await mount(request({ lighten: true }), { now: WED_9AM, setup: heavy });
    expect(banner()?.textContent).toMatch(/~2h45 over/);
    expect(banner()?.textContent).toContain("Move a few to tomorrow");
    expect(banner()?.getAttribute("role")).toBe("status");
    await click(banner()!.querySelector("button")!);
    expect(banner()).toBeNull();
    expect(rows()).toHaveLength(0);
  });

  it("puts each open row's estimate on it: its Todoist duration, or the default estimate", async () => {
    await mount(request({ lighten: true }), { now: WED_9AM, setup: heavy });
    expect(rows()).toHaveLength(brain.getSnapshot().day.today.length);
    const chip = (title: string) => rowFor(title).querySelector<HTMLElement>(".chip.est")!;
    expect(chip("Write the weekly report").textContent).toContain("4h");
    expect(chip("Call client ABC").textContent).toContain("3h");
    expect(chip("Plan the next sprint").textContent).toContain("4h");
    expect(chip("Call client ABC").classList.contains("dflt")).toBe(false);
    expect(chip("Call client ABC").title).toBe("180 min, from Todoist");
  });

  it("shows the default estimate lighter, and says so", async () => {
    await mount(request({ lighten: true }), { now: WED_9AM, setup: (b) => { heavy(b); const t = b.todoist.tasks.bind(b.todoist); b.todoist.tasks = async (f) => (await t(f)).map((x) => (x.id === "2" ? { ...x, duration: null } : x)); } });
    const chip = rowFor("Call client ABC").querySelector<HTMLElement>(".chip.est")!;
    expect(chip.textContent).toContain("30'");
    expect(chip.classList.contains("dflt")).toBe(true);
    expect(chip.title).toBe("30 min: your default estimate");
  });

  it("has no estimates and no move buttons until you ask for them", async () => {
    await mount(request(), { now: WED_9AM, setup: heavy });
    expect(document.querySelector(".chip.est, .lighten-go")).toBeNull();
  });

  it("moves a task to tomorrow in one tap, and the banner follows until the day fits", async () => {
    await mount(request({ lighten: true }), { now: WED_9AM, setup: heavy });
    const before = banner()!.textContent;
    await click(rowFor("Call client ABC").querySelector(".lighten-go")!);
    await vi_waitFor(() => !brain.getSnapshot().day.today.some((t) => t.id === "2"));
    await act(async () => undefined);
    expect(rows().map((r) => r.textContent).join()).not.toContain("Call client ABC");
    // 2h45 over, less the 2 hours of it that are not in a meeting: still over, by 45 minutes.
    expect(banner()?.textContent).toMatch(/~45 min over/);
    expect(banner()?.textContent).not.toBe(before);
    // The 3 h call overlaps the 11:00 meeting by an hour, which was counted once: it frees 2 h, and the note says so.
    expect(document.body.textContent).toContain("Moved “Call client ABC” to tomorrow ✓ (frees 2h)");
    await click(rowFor("Plan the next sprint").querySelector(".lighten-go")!);
    await vi_waitFor(() => !banner());
    await act(async () => undefined);
    // It fits now: the banner, the estimates and the buttons are gone, with a word about it.
    expect(banner()).toBeNull();
    expect(document.querySelector(".chip.est, .lighten-go")).toBeNull();
    expect(document.body.textContent).toContain("Moved “Plan the next sprint” to tomorrow ✓ (frees 4h) Nice, today fits now ✓");
    expect(document.querySelector(".ds-over")).toBeNull();
  });

  it("moves to Monday on a Friday, and says so on the button", async () => {
    await mount(request({ lighten: true }), { now: FRIDAY_4PM, setup: (b) => { heavy(b); } });
    const go = rows()[0].querySelector<HTMLButtonElement>(".lighten-go");
    // On Friday after 16:00 there is little of the day left: it is over, so the state is open.
    expect(go?.textContent).toContain("Monday");
    expect(go?.getAttribute("aria-label")).toContain("to Monday");
  });

  it("can't move a repeating task: its button is off, with the reason", async () => {
    await mount(request({ lighten: true }), {
      now: WED_9AM,
      setup: (b) => {
        heavy(b);
        const tasks = b.todoist.tasks.bind(b.todoist);
        b.todoist.tasks = async (f) => (await tasks(f)).map((t) => (t.id === "4" ? { ...t, due: { ...t.due!, string: "every day", is_recurring: true } } : t));
      },
    });
    const go = rowFor("Plan the next sprint").querySelector<HTMLButtonElement>(".lighten-go")!;
    expect(go.disabled).toBe(true);
    expect(go.title).toMatch(/repeating task keeps its own schedule/i);
  });

  it("keeps the keyboard in the list after a move", async () => {
    await mount(request({ lighten: true }), { now: WED_9AM, setup: heavy });
    const go = rowFor("Call client ABC").querySelector<HTMLButtonElement>(".lighten-go")!;
    go.focus();
    await click(go);
    await vi_waitFor(() => !brain.getSnapshot().day.today.some((t) => t.id === "2"));
    await act(async () => undefined);
    expect(document.activeElement?.closest(".board")).not.toBeNull();
    expect(document.activeElement).not.toBe(document.body);
  });

  it("asks to open ready from a request that arrives while the board is already open", async () => {
    await mount(request(), { now: WED_9AM, setup: heavy });
    expect(banner()).toBeNull();
    await render(request({ seq: 2, lighten: true }));
    expect(banner()).not.toBeNull();
  });
});

describe("a bubble over the open board (v0.4 evaluation, issues 1 and 8)", () => {
  const banner = () => document.querySelector<HTMLElement>(".bubble.banner");
  const say = (b: Parameters<Brain["say"]>[0], why?: string) => act(async () => void (why ? brain.say(b, { why }) : brain.say(b)));

  it("shows an urgent reminder in the board with its text and buttons, which work", async () => {
    await mount();
    const run = vi.fn();
    await say({ text: "📅 Meeting in 4 min: “Client ABC renewal” (10:04)\nRelated: “Call client ABC”", seconds: 90, urgent: true, actions: [{ title: "OK", run }] }, "a meeting");
    const b = banner()!;
    expect(b).not.toBeNull();
    expect(b.closest(".board")).not.toBeNull();
    expect(b.textContent).toContain("Meeting in 4 min");
    expect(b.getAttribute("role")).toBe("status");
    expect(b.getAttribute("aria-live")).toBe("assertive");
    await click([...b.querySelectorAll("button")].find((x) => x.textContent === "OK")!);
    expect(run).toHaveBeenCalledOnce();
    expect(banner()).toBeNull();
  });

  it("can be closed from the board", async () => {
    await mount();
    await say({ text: "⏰ In 8 min: “Call client ABC”", seconds: 40, urgent: true, actions: [] }, "task due");
    await click(banner()!.querySelector(".bubble-close")!);
    expect(banner()).toBeNull();
    expect(brain.getSnapshot().bubble).toBeNull();
  });

  it("leaves the quiet replies to the board's own note, and the rest waits for the board to close", async () => {
    await mount();
    await say({ text: "Added “Buy milk” ✔︎", seconds: 4, urgent: true });
    expect(banner()).toBeNull();
    brain.dismissBubble(brain.getSnapshot().bubble!.id, "closed");
    await say({ text: "Still there?", seconds: 30, actions: [{ title: "Yes", run: () => undefined }] }, "a nudge");
    expect(banner()).toBeNull();
  });

  // v0.4 evaluation round 2, minor: Esc on a banner's button closed the whole board, losing it for a one-key dismiss.
  it("closes only the banner with Escape from its buttons, and leaves the board open with the keyboard in it", async () => {
    await mount();
    await say({ text: "⏰ In 8 min: “Call client ABC”", seconds: 40, urgent: true, actions: [{ title: "OK", run: () => undefined }] }, "task due");
    const ok = [...banner()!.querySelectorAll<HTMLButtonElement>("button")].find((x) => x.textContent === "OK")!;
    ok.focus();
    const esc = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
    await act(async () => void ok.dispatchEvent(esc));
    // Taken: the overlay closes the board only on an Escape nobody took.
    expect(esc.defaultPrevented).toBe(true);
    expect(banner()).toBeNull();
    expect(document.activeElement?.closest(".board")).not.toBeNull();
    expect(document.activeElement).not.toBe(document.body);
    // With nothing in front, Escape is left to the overlay (it closes the board).
    const again = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
    await act(async () => void document.querySelector("#add-task")!.dispatchEvent(again));
    expect(again.defaultPrevented).toBe(false);
  });

  it("drops a banner that went stale before anyone read it", async () => {
    await mount();
    await say({ text: "⏰ In 8 min: “x”", seconds: 40, urgent: true, actions: [{ title: "OK", run: () => undefined }], validUntil: Date.now() - 1 }, "task due");
    await act(async () => void brain.pruneBubble());
    expect(banner()).toBeNull();
  });
});

describe("Back to work, double-clicked (v0.4 evaluation, issue 4)", () => {
  const wrapped = async () => {
    await mount(request(), { now: FRIDAY_4PM });
    await act(async () => void (await brain.wrapUp()));
  };
  const strip = () => document.querySelector<HTMLElement>(".daystrip")!;
  const button = (text: string) => [...strip().querySelectorAll<HTMLButtonElement>("button")].find((b) => b.textContent?.includes(text));

  it("wakes the pet once, and the second click lands on nothing, not on Wrap up", async () => {
    await wrapped();
    expect(strip().textContent).toContain("Done for today");
    await click(button("Back to work")!);
    expect(brain.getSnapshot().doneUntil).toBeNull();
    // The same spot is now the Wrap up button: a second click of the double-click.
    const wrap = button("Wrap up")!;
    expect(wrap).toBeTruthy();
    await click(wrap);
    expect(document.querySelector(".sheet.wrap")).toBeNull();
    // A moment later it is a button like any other.
    await act(async () => void (await new Promise((r) => setTimeout(r, 650))));
    await click(button("Wrap up")!);
    expect(document.querySelector(".sheet.wrap")).not.toBeNull();
  });

  it("wakes it only once however fast the clicks come", async () => {
    await wrapped();
    const wake = vi.spyOn(brain, "resumeDay");
    const back = button("Back to work")!;
    await click(back);
    await click(back);
    expect(wake.mock.calls.length).toBeLessThanOrEqual(2);
    expect(document.querySelector(".sheet.wrap")).toBeNull();
  });
});

describe("Try 2 minutes while a focus session runs (v0.4 evaluation, issue 5)", () => {
  async function openTry() {
    const more = byLabel(MORE);
    await click(more);
    await click(menuItem(popover("menu")!, "Try 2 minutes"));
    return more;
  }

  it("starts at once when nothing is running", async () => {
    await mount();
    await openTry();
    expect(popover("alertdialog")).toBeNull();
    expect(brain.getSnapshot().focus?.starter).toBe(true);
  });

  it("asks before replacing a running session, and keeping it changes nothing", async () => {
    await mount();
    const other = brain.getSnapshot().day.today[0];
    brain.startFocus(other, 25);
    const start = brain.getSnapshot().focus!.start;
    const more = await openTry();
    const dialog = popover("alertdialog")!;
    expect(dialog.textContent).toMatch(/focus session\. Switch to 2 minutes\?/);
    expect(brain.getSnapshot().focus).toMatchObject({ minutes: 25, start });
    // The safe answer has the focus.
    expect(document.activeElement?.textContent).toBe("Keep going");
    await click(document.activeElement!);
    expect(popover("alertdialog")).toBeNull();
    expect(brain.getSnapshot().focus).toMatchObject({ minutes: 25, start });
    expect(document.activeElement).toBe(more);
  });

  it("switches when you say so, and says how long you had been at it", async () => {
    await mount();
    brain.startFocus(brain.getSnapshot().day.today[0], 25);
    await openTry();
    const dialog = popover("alertdialog")!;
    await click([...dialog.querySelectorAll("button")].find((b) => b.textContent?.includes("Switch to 2 minutes"))!);
    expect(popover("alertdialog")).toBeNull();
    expect(brain.getSnapshot().focus).toMatchObject({ minutes: 2, starter: true });
  });

  it("closes the question with Escape, to the More button", async () => {
    await mount();
    brain.startFocus(brain.getSnapshot().day.today[0], 25);
    const more = await openTry();
    await key(document.activeElement!, "Escape");
    expect(popover("alertdialog")).toBeNull();
    expect(document.activeElement).toBe(more);
    expect(brain.getSnapshot().focus?.minutes).toBe(25);
  });

  it("doesn't ask about a break (nothing is lost)", async () => {
    await mount();
    brain.startBreak(5);
    await openTry();
    expect(popover("alertdialog")).toBeNull();
    expect(brain.getSnapshot().focus?.starter).toBe(true);
  });
});

describe("Another app… (v0.4 evaluation, issue 2)", () => {
  const FIGMA = { name: "Figma", exe: "figma.exe", title: "Landing page" };
  const sample = (app: typeof FIGMA | null) => ({ app, url: null, idleSeconds: 0, secondsSinceKey: 999, fullscreen: false, appSwitchedAt: Date.now() });
  async function openDialog() {
    await click(byLabel(MORE));
    await click(menuItem(popover("menu")!, "Start when…"));
    await click(menuItem(popover("menu")!, "Another app"));
    return popover("dialog")!;
  }
  const matchLine = (d: HTMLElement) => d.querySelector(".app-match")!.textContent;

  it("says which app lately in front a typed name matches, as you type", async () => {
    await mount();
    brain.onSample(sample(FIGMA));
    brain.onSample(sample(null));
    const dialog = await openDialog();
    const input = dialog.querySelector("input")!;
    expect(matchLine(dialog)).toBe("");
    await type(input, "fi");
    expect(matchLine(dialog)).toBe("");
    await type(input, "fig");
    expect(matchLine(dialog)).toBe("Matches Figma, which you used lately ✓");
    await type(input, "Figma.exe");
    expect(matchLine(dialog)).toBe("Matches Figma, which you used lately ✓");
  });

  it("explains what it takes in the hint, without promising what it can't match", async () => {
    await mount();
    const dialog = await openDialog();
    const hint = dialog.querySelector(".hint")!.textContent!;
    expect(hint).toMatch(/start of the name is enough/i);
    expect(hint).toContain("chrome.exe");
  });

  it("sets the plan without the .exe, and says so kindly when it matches no app seen yet", async () => {
    await mount();
    const dialog = await openDialog();
    expect(matchLine(dialog)).toBe("");
    await type(dialog.querySelector("input")!, "Photoshop.exe");
    expect(matchLine(dialog)).toBe("I haven't seen an app called that yet; I'll watch for it 👀");
    await click([...dialog.querySelectorAll("button")].find((b) => b.textContent?.includes("Set"))!);
    expect(brain.getSnapshot().triggers).toMatchObject([{ trigger: { kind: "appOpen", app: "Photoshop" } }]);
    expect(document.body.textContent).toContain("When I open Photoshop. I haven't seen an app called that yet; I'll watch for it");
    // The chip says what the plan matches.
    expect(document.querySelector(".chip.plan")?.textContent).toBe("⏱ when I open Photoshop");
  });

  it("doesn't add the 'haven't seen' line when the app was seen", async () => {
    await mount();
    brain.onSample(sample(FIGMA));
    brain.onSample(sample(null));
    const dialog = await openDialog();
    await type(dialog.querySelector("input")!, "fig");
    await click([...dialog.querySelectorAll("button")].find((b) => b.textContent?.includes("Set"))!);
    expect(document.body.textContent).not.toContain("haven't seen");
    expect(brain.getSnapshot().triggers).toMatchObject([{ trigger: { kind: "appOpen", app: "fig" } }]);
  });
});

describe("opening a task from a bubble (v0.4 evaluation, issue 13)", () => {
  it("scrolls to the task, gives it the keyboard focus and flashes it", async () => {
    await mount();
    await render(request({ seq: 2, focusTaskId: "2" }));
    const row = document.querySelector<HTMLElement>('.task[data-task-id="2"]')!;
    expect(row.textContent).toContain("Call client ABC");
    expect(document.activeElement).toBe(row);
    expect(row.classList.contains("flash")).toBe(true);
  });

  it("leaves the flash after a moment, and does nothing for a task that is not there", async () => {
    await mount();
    await render(request({ seq: 2, focusTaskId: "nope" }));
    expect(document.querySelector(".task.flash")).toBeNull();
    await render(request({ seq: 3, focusTaskId: "4" }));
    expect(document.querySelector(".task.flash")).not.toBeNull();
    await act(async () => void (await new Promise((r) => setTimeout(r, 2500))));
    expect(document.querySelector(".task.flash")).toBeNull();
  });

  it("comes back to the list from a sheet", async () => {
    await mount(wrapRequest());
    await render(request({ seq: 2, focusTaskId: "2" }));
    expect(document.querySelector(".sheet.wrap")).toBeNull();
    expect(document.activeElement?.getAttribute("data-task-id")).toBe("2");
  });
});

describe("'Move some?' over the open board (v0.4 evaluation round 2, issue 2)", () => {
  const heavy = (b: DemoBackend) => b.demo.setHeavyDay(true);
  const banner = () => document.querySelector<HTMLElement>(".bubble.banner");

  it("shows as a banner with its two buttons, and 'Pick tasks to move' opens the lighten view", async () => {
    await mount(request(), { now: WED_9AM, setup: heavy });
    await act(async () => brain.demoOverbooked());
    const b = banner()!;
    expect(b).not.toBeNull();
    expect(b.textContent).toContain("Today looks overbooked");
    const titles = [...b.querySelectorAll(".bubble-actions button")].map((x) => x.textContent);
    expect(titles).toEqual(["Pick tasks to move", "It's fine"]);
    await click(b.querySelector(".bubble-actions button")!);
    expect(banner()).toBeNull();
  });

  it("is not shown over the pet when the board closes, since it was read there", async () => {
    await mount(request(), { now: WED_9AM, setup: heavy });
    await act(async () => brain.demoOverbooked());
    expect(banner()).not.toBeNull();
    await act(async () => root.unmount());
    expect(brain.getSnapshot().bubble).toBeNull();
    // (The harness unmounts once more in afterEach.)
    root = createRoot(container);
  });

  it("is dropped when the lighten view is opened from the strip's chip", async () => {
    await mount(request(), { now: WED_9AM, setup: heavy });
    await act(async () => brain.demoOverbooked());
    expect(banner()).not.toBeNull();
    await click(document.querySelector(".ds-over")!);
    expect(document.querySelector(".lighten-banner")).not.toBeNull();
    expect(banner()).toBeNull();
    expect(brain.getSnapshot().bubble).toBeNull();
  });

  it("is dropped when the board opens already lightening", async () => {
    await mount(request({ lighten: true }), { now: WED_9AM, setup: heavy });
    await act(async () => brain.demoOverbooked());
    await act(async () => undefined);
    expect(banner()).toBeNull();
  });
});

describe("Escape in the split sheet and the wardrobe (v0.4 evaluation round 2, issue 5)", () => {
  const rowFor = (title: string) => [...document.querySelectorAll<HTMLElement>(".board li.task")].find((r) => r.textContent?.includes(title))!;
  const splitButton = (title: string) => rowFor(title).querySelector<HTMLButtonElement>('button[aria-label="Split"]')!;
  const escape = async (el: Element) => {
    const e = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
    await act(async () => void el.dispatchEvent(e));
    return e;
  };

  it("takes the keyboard to its heading when it opens (a mouse click leaves the focus nowhere otherwise)", async () => {
    await mount();
    const split = splitButton("Plan the next sprint");
    split.focus();
    await click(split);
    expect(document.querySelector(".sheet h2")?.textContent).toContain("Split the task");
    expect(document.activeElement?.tagName).toBe("H2");
    expect(document.activeElement?.closest(".board")).not.toBeNull();
  });

  it("goes back to the list with Escape, to the button that opened it, instead of closing the board", async () => {
    await mount();
    const split = splitButton("Plan the next sprint");
    split.focus();
    await click(split);
    const e = await escape(document.activeElement!);
    // Taken by the board (the overlay closes the board only on an Escape nobody took).
    expect(e.defaultPrevented).toBe(true);
    expect(document.querySelector(".sheet")).toBeNull();
    expect(document.activeElement).toBe(splitButton("Plan the next sprint"));
  });

  it("does the same when a bubble opened it (the stuck task's Split it)", async () => {
    await mount(request({ seq: 2, split: null }));
    const task = brain.getSnapshot().day.overdue[0];
    await render(request({ seq: 3, split: task }));
    expect(document.activeElement?.tagName).toBe("H2");
    const e = await escape(document.activeElement!);
    expect(e.defaultPrevented).toBe(true);
    expect(document.querySelector(".sheet")).toBeNull();
    expect(document.activeElement?.closest(".board")).not.toBeNull();
    expect(document.activeElement).not.toBe(document.body);
  });

  it("focuses the wardrobe's heading too, and Escape goes back to the button that opened it", async () => {
    await mount();
    const wardrobeButton = () => document.querySelector<HTMLButtonElement>(".board-head button[data-wardrobe]")!;
    const open = wardrobeButton();
    open.focus();
    await click(open);
    expect(document.querySelector(".sheet h2")).not.toBeNull();
    expect(document.activeElement?.tagName).toBe("H2");
    const e = await escape(document.activeElement!);
    expect(e.defaultPrevented).toBe(true);
    expect(document.querySelector(".sheet")).toBeNull();
    expect(document.activeElement).toBe(wardrobeButton());
  });
});

describe("the lighten view's keyboard (v0.4 evaluation round 2, issue 6)", () => {
  const heavy = (b: DemoBackend) => b.demo.setHeavyDay(true);
  const rows = () => [...document.querySelectorAll<HTMLElement>(".board li.task.lightening")];
  const rowFor = (title: string) => rows().find((r) => r.textContent?.includes(title))!;
  const goOf = (title: string) => rowFor(title).querySelector<HTMLButtonElement>(".lighten-go")!;
  const settle = async (gone: string) => {
    await vi_waitFor(() => !brain.getSnapshot().day.today.some((t) => t.id === gone));
    await act(async () => undefined);
  };

  it("hands the keyboard to the first '→ Tomorrow' when the chip opens the view", async () => {
    await mount(request(), { now: WED_9AM, setup: heavy });
    const chip = document.querySelector<HTMLButtonElement>(".ds-over")!;
    chip.focus();
    await click(chip);
    expect(rows().length).toBeGreaterThan(0);
    expect(document.activeElement).toBe(rows()[0].querySelector(".lighten-go"));
  });

  it("does the same when the board opens ready to lighten (from the bubble's button)", async () => {
    await mount(request({ lighten: true }), { now: WED_9AM, setup: heavy });
    expect(document.activeElement).toBe(rows()[0].querySelector(".lighten-go"));
  });

  it("has no hover icons in the rows while lightening (they cut the title and were 5 more Tab stops each)", async () => {
    await mount(request({ lighten: true }), { now: WED_9AM, setup: heavy });
    expect(document.querySelector(".task.lightening .t-actions")).toBeNull();
    // Each row is two stops: tick it off, or move it.
    const stops = rows().flatMap((r) => [...r.querySelectorAll<HTMLElement>("button")].filter((b) => !(b as HTMLButtonElement).disabled && b.tabIndex >= 0));
    expect(stops).toHaveLength(rows().length * 2);
    // They are back once the view closes.
    await click(document.querySelector<HTMLElement>(".lighten-banner button")!);
    expect(document.querySelector(".task .t-actions")).not.toBeNull();
  });

  it("goes down and up the '→ Tomorrow' buttons with the arrow keys", async () => {
    await mount(request({ lighten: true }), { now: WED_9AM, setup: heavy });
    const gos = rows().map((r) => r.querySelector<HTMLButtonElement>(".lighten-go")!);
    await key(gos[0], "ArrowDown");
    expect(document.activeElement).toBe(gos[1]);
    await key(gos[1], "ArrowDown");
    expect(document.activeElement).toBe(gos[2]);
    await key(gos[2], "ArrowDown");
    expect(document.activeElement).toBe(gos[2]);
    await key(gos[2], "ArrowUp");
    expect(document.activeElement).toBe(gos[1]);
    await key(gos[1], "Home");
    expect(document.activeElement).toBe(gos[0]);
    await key(gos[0], "End");
    expect(document.activeElement).toBe(gos[2]);
  });

  it("moves on to the next row's '→ Tomorrow' after a move, never to the page", async () => {
    await mount(request({ lighten: true }), { now: WED_9AM, setup: heavy });
    expect(rows().map((r) => r.querySelector(".t-title")?.textContent)).toEqual(["Write the weekly report", "Call client ABC", "Plan the next sprint"]);
    const go = goOf("Call client ABC");
    go.focus();
    await click(go);
    await settle("2");
    // Still over (by 45 minutes): the one that took its place.
    expect(document.querySelector(".lighten-banner")).not.toBeNull();
    expect(document.activeElement).toBe(goOf("Plan the next sprint"));
  });

  it("goes back to the row before when the last one moved", async () => {
    // The last row is the light one, so moving it leaves the day over.
    await mount(request({ lighten: true }), {
      now: WED_9AM,
      setup: (b) => {
        const minutes: Record<string, number> = { "1": 360, "2": 180, "4": 30 };
        const t = b.todoist.tasks.bind(b.todoist);
        b.todoist.tasks = async (f) => (await t(f)).map((x) => (minutes[x.id] ? { ...x, duration: { amount: minutes[x.id], unit: "minute" } } : x));
      },
    });
    const go = goOf("Plan the next sprint");
    go.focus();
    await click(go);
    await settle("4");
    expect(document.querySelector(".lighten-banner")).not.toBeNull();
    expect(document.activeElement).toBe(goOf("Call client ABC"));
  });

  it("lands on the add field when that move made the day fit and the view closed (a second Enter must not finish a task)", async () => {
    await mount(request({ lighten: true }), { now: WED_9AM, setup: heavy });
    const go = goOf("Write the weekly report");
    go.focus();
    await click(go);
    await settle("1");
    await vi_waitFor(() => !document.querySelector(".lighten-banner"));
    await act(async () => undefined);
    expect(document.querySelector(".lighten-banner")).toBeNull();
    expect(document.activeElement).toBe(document.querySelector("#add-task"));
    // Its note says what happened.
    expect(document.body.textContent).toContain("today fits now");
  });

  it("hands the keyboard to the chip when the view's close button ends it", async () => {
    await mount(request({ lighten: true }), { now: WED_9AM, setup: heavy });
    const close = document.querySelector<HTMLButtonElement>(".lighten-banner button")!;
    close.focus();
    await click(close);
    expect(document.querySelector(".lighten-banner")).toBeNull();
    expect(document.activeElement).toBe(document.querySelector(".ds-over"));
  });
});

describe("the lighten view makes room for the rows (v0.4 evaluation round 2, issue 8)", () => {
  const heavy = (b: DemoBackend) => b.demo.setHeavyDay(true);
  const fold = () => document.querySelector<HTMLElement>(".ds-fold")!;

  it("folds the timeline away while lightening, keeping the strip's header, and brings it back", async () => {
    await mount(request(), { now: WED_9AM, setup: heavy });
    expect(fold().hasAttribute("inert")).toBe(false);
    await click(document.querySelector(".ds-over")!);
    expect(document.querySelector(".daystrip")?.classList.contains("is-lighten")).toBe(true);
    // Folded away from the keyboard and screen readers as well (its bars are a tab stop).
    expect(fold().hasAttribute("inert")).toBe(true);
    expect(document.querySelector(".daystrip .ds-head")?.textContent).toContain("left");
    await click(document.querySelector(".lighten-banner button")!);
    expect(fold().hasAttribute("inert")).toBe(false);
    expect(document.querySelector(".daystrip")?.classList.contains("is-lighten")).toBe(false);
    expect(document.querySelector(".ds-over")).not.toBeNull();
  });

  it("says how far over the day is once: in the banner, not also in the strip", async () => {
    await mount(request({ lighten: true }), { now: WED_9AM, setup: heavy });
    const over = /~\d+h\d* over|~\d+ min over/g;
    const board = document.querySelector(".board")!.cloneNode(true) as HTMLElement;
    board.querySelectorAll(".sr-only, [title]").forEach((e) => e.removeAttribute("title"));
    expect(board.textContent!.match(over)).toHaveLength(1);
    expect(document.querySelector(".lighten-banner")?.textContent).toMatch(over);
  });
});

describe("a short board (v0.4 evaluation round 2, issue 4)", () => {
  it("gives the Wrap up sheet its compact layout when it opened above the pet, and not on a tall board", async () => {
    await mount(wrapRequest(), { placement: { side: "above", top: 16, height: 505 } });
    expect(document.querySelector(".board")?.classList.contains("compact")).toBe(true);
    expect(sheet().classList.contains("compact")).toBe(true);
    // Back and the title share one wrapper, the one-line wins show one win.
    expect(sheet().querySelector(".wrap-top > .btn + h2")).not.toBeNull();
    await act(async () => root.unmount());
    root = createRoot(container);
    await mount(wrapRequest(), { placement: { height: 628 } });
    expect(document.querySelector(".board")?.classList.contains("compact")).toBe(false);
    expect(sheet().classList.contains("compact")).toBe(false);
  });

  it("shows one win and 'and N more' on a short board, three on a tall one", async () => {
    const done = (b: DemoBackend) => {
      const completed = b.todoist.completed.bind(b.todoist);
      b.todoist.completed = async (a, z) => [
        ...(await completed(a, z)),
        ...["Pay the invoice", "Water the plants", "Send the minutes"].map((content, i) => ({ id: `w${i}`, content, checked: true, completed_at: new Date().toISOString() })),
      ];
    };
    await mount(wrapRequest(), { placement: { height: 505 }, setup: done });
    const shown = () => [...sheet().querySelectorAll(".wrap-wins li:not(.more)")];
    expect(shown().length).toBe(1);
    expect(sheet().querySelector(".wrap-wins li.more")?.textContent).toMatch(/and \d+ more/);
  });
});

describe("the wardrobe and its Home sheet (v0.5)", () => {
  const esc = (from: Element) => key(from, "Escape");
  const navButton = (text: string) => [...document.querySelectorAll<HTMLButtonElement>(".sheet-nav button")].find((b) => b.textContent?.includes(text))!;

  it("goes back one step at a time with Escape: Home → wardrobe → list, the keyboard following", async () => {
    await mount();
    await click(document.querySelector("[data-wardrobe]")!);
    expect(document.activeElement?.textContent).toContain("Wardrobe");
    await click(navButton("Home"));
    const home = document.activeElement!;
    expect(home.tagName).toBe("H2");
    expect(home.textContent).toContain("Home");
    await esc(home);
    // Back in the wardrobe, as its Back button would take you, with the keyboard on its heading.
    expect(document.activeElement?.tagName).toBe("H2");
    expect(document.activeElement?.textContent).toContain("Wardrobe");
    await esc(document.activeElement!);
    expect(document.querySelector("#add-task")).not.toBeNull();
    expect(document.activeElement?.hasAttribute("data-wardrobe")).toBe(true);
  });
});

describe("the Friends sheet (v0.6)", () => {
  const friendsButton = () => document.querySelector<HTMLButtonElement>(".board-head button[data-friends]")!;
  const sheetButton = (text: string) => [...document.querySelectorAll<HTMLButtonElement>(".sheet button")].find((b) => b.textContent?.trim() === text)!;
  const areaOf = (selector: string) => document.querySelector<HTMLTextAreaElement>(selector)!;
  const typeInto = (area: HTMLTextAreaElement, value: string) =>
    act(async () => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(area, value);
      area.dispatchEvent(new Event("input", { bubbles: true }));
    });
  /** A friend's card text for today (the real day: the board runs on the real clock). */
  const cardText = (patch: Partial<PetCard> = {}) => {
    const today = dayKey(new Date(brain.clockNow()));
    return encodeCard({
      id: "friend-mai-0001",
      name: "Mai",
      species: "shiba",
      accessories: ["flowercrown"],
      stage: 2,
      streak: 6,
      best: 12,
      week: isoWeekKey(today),
      weekDone: 9,
      history: "G".repeat(28),
      date: today,
      ...patch,
    });
  };
  const addBox = () => document.querySelector<HTMLTextAreaElement>("textarea[placeholder^='TODOPET1']")!;
  const addButton = () => sheetButton("Add");
  const openFriends = async () => {
    friendsButton().focus();
    await click(friendsButton());
  };
  const setClipboard = (clipboard: unknown) => Object.defineProperty(navigator, "clipboard", { value: clipboard, configurable: true });
  afterEach(() => {
    setClipboard(undefined);
  });

  it("has its button in the header next to the wardrobe, and opens with the keyboard on its heading", async () => {
    await mount();
    const buttons = [...document.querySelectorAll(".board-head .head-tools button")].map((b) => b.getAttribute("aria-label"));
    expect(buttons.indexOf("Friends")).toBe(buttons.indexOf("Wardrobe & achievements") + 1);
    await openFriends();
    expect(document.querySelector(".sheet h2")?.textContent).toContain("Friends");
    expect(document.activeElement?.tagName).toBe("H2");
  });

  it("goes back to the list with Escape, to the button that opened it, instead of closing the board", async () => {
    await mount();
    await openFriends();
    const e = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
    await act(async () => void document.activeElement!.dispatchEvent(e));
    expect(e.defaultPrevented).toBe(true);
    expect(document.querySelector(".sheet")).toBeNull();
    expect(document.activeElement).toBe(friendsButton());
  });

  it("opens straight onto the sheet when a visiting friend is clicked", async () => {
    await mount(request({ friends: true }));
    expect(document.querySelector(".sheet h2")?.textContent).toContain("Friends");
    expect(document.activeElement?.tagName).toBe("H2");
  });

  it("shows my card as read-only text, the one the brain would copy", async () => {
    await mount();
    await openFriends();
    const mine = areaOf("textarea[readonly]");
    expect(mine.value).toBe(brain.myCard());
    expect(mine.value.startsWith("TODOPET1.")).toBe(true);
    expect(mine.getAttribute("aria-label")).toMatch(/My pet card/);
  });

  it("copies my card with the clipboard, and says so", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    setClipboard({ writeText });
    await mount();
    await openFriends();
    await click(sheetButton("Copy my card"));
    expect(writeText).toHaveBeenCalledWith(brain.myCard());
    expect(document.querySelector(".friends-mine [role=status]")?.textContent).toMatch(/Copied/);
  });

  it("selects the text instead when there is no clipboard", async () => {
    setClipboard(undefined);
    await mount();
    await openFriends();
    await click(sheetButton("Copy my card"));
    const mine = areaOf("textarea[readonly]");
    expect(document.activeElement).toBe(mine);
    expect(mine.selectionStart).toBe(0);
    expect(mine.selectionEnd).toBe(mine.value.length);
    expect(document.querySelector(".friends-mine [role=status]")?.textContent).toMatch(/Ctrl\+C/);
  });

  it("selects the text instead when the clipboard refuses", async () => {
    setClipboard({ writeText: vi.fn().mockRejectedValue(new Error("denied")) });
    await mount();
    await openFriends();
    await click(sheetButton("Copy my card"));
    const mine = areaOf("textarea[readonly]");
    expect(document.activeElement).toBe(mine);
    expect(mine.selectionEnd).toBe(mine.value.length);
    expect(document.querySelector(".friends-mine [role=status]")?.textContent).toMatch(/Ctrl\+C/);
  });

  it("adds a friend: Add waits for text, then shows their pet, buddy streak and card date, and clears the box", async () => {
    await mount();
    await openFriends();
    expect(addButton().disabled).toBe(true);
    expect(document.querySelector(".friends-empty")?.textContent).toMatch(/No friends yet/);
    await typeInto(addBox(), cardText());
    expect(addButton().disabled).toBe(false);
    await click(addButton());
    expect(brain.getSnapshot().friends.map((f) => f.name)).toEqual(["Mai"]);
    const row = document.querySelector(".friend-list .friend")!;
    expect(row.querySelector(".friend-name")?.textContent).toBe("Mai");
    expect(row.querySelector("svg")).not.toBeNull();
    expect(row.querySelector(".friend-streak")?.textContent).toMatch(/Buddy streak|No buddy streak/);
    expect(row.querySelector(".friend-date")?.textContent).toBe("Card from today");
    expect(addBox().value).toBe("");
    expect(document.querySelector(".friends-add [role=status]")?.textContent).toContain("Added Mai");
    expect(document.querySelector(".friends .w-group-head .count")?.textContent).toBeTruthy();
  });

  it("says what is wrong with a card in kind words, keeps the text, and adds nobody", async () => {
    await mount();
    await openFriends();
    await typeInto(addBox(), "hello there");
    await click(addButton());
    const alert = document.querySelector<HTMLElement>(".friends-error[role=alert]")!;
    expect(alert.textContent).toMatch(/doesn't look like a pet card/);
    expect(alert.textContent).not.toMatch(/undefined|Error|prefix/);
    expect(addBox().value).toBe("hello there");
    expect(addBox().getAttribute("aria-invalid")).toBe("true");
    expect(addBox().getAttribute("aria-describedby")).toBe(alert.id);
    expect(brain.getSnapshot().friends).toEqual([]);
    expect(document.querySelector(".friend-list")).toBeNull();
    // Typing again clears the complaint.
    await typeInto(addBox(), "hello");
    expect(document.querySelector(".friends-error")).toBeNull();
  });

  it("refuses its own card, and a damaged one, kindly", async () => {
    await mount();
    await openFriends();
    await typeInto(addBox(), brain.myCard());
    await click(addButton());
    expect(document.querySelector(".friends-error")?.textContent).toMatch(/your own card/);
    await typeInto(addBox(), cardText().slice(0, 60));
    await click(addButton());
    expect(document.querySelector(".friends-error")?.textContent).toMatch(/damaged|missing/);
    expect(brain.getSnapshot().friends).toEqual([]);
  });

  it("adds with Ctrl+Enter too", async () => {
    await mount();
    await openFriends();
    await typeInto(addBox(), cardText());
    await key(addBox(), "Enter", { ctrlKey: true });
    expect(brain.getSnapshot().friends).toHaveLength(1);
  });

  it("shows a name as plain text, never as markup", async () => {
    await mount();
    await openFriends();
    await typeInto(addBox(), cardText({ name: "<img src=x>" }));
    await click(addButton());
    const row = document.querySelector(".friend-list .friend")!;
    expect(row.querySelector(".friend-name")?.textContent).toBe("<img src=x>");
    expect(row.querySelector("img")).toBeNull();
    expect(document.querySelector(".friends img")).toBeNull();
  });

  it("removes a friend only after a confirmation, and puts the keyboard somewhere sensible", async () => {
    await mount();
    await openFriends();
    await typeInto(addBox(), cardText());
    await click(addButton());
    const remove = document.querySelector<HTMLButtonElement>("[data-friend-remove]")!;
    expect(remove.getAttribute("aria-label")).toBe("Remove Mai");
    await click(remove);
    const confirm = popover("alertdialog")!;
    expect(confirm.textContent).toContain("Remove Mai?");
    // Cancel keeps her, and the focus goes back to the button.
    await click([...confirm.querySelectorAll("button")].find((b) => b.textContent?.trim() === "Cancel")!);
    expect(popover("alertdialog")).toBeNull();
    expect(brain.getSnapshot().friends).toHaveLength(1);
    expect(document.activeElement).toBe(remove);
    // Escape closes the question, not the sheet.
    await click(remove);
    await key(document.activeElement!, "Escape");
    expect(popover("alertdialog")).toBeNull();
    expect(document.querySelector(".sheet h2")?.textContent).toContain("Friends");
    // Remove does.
    await click(remove);
    await click([...popover("alertdialog")!.querySelectorAll("button")].find((b) => b.textContent?.includes("Remove"))!);
    expect(brain.getSnapshot().friends).toEqual([]);
    expect(document.querySelector(".friend-list")).toBeNull();
    expect(document.querySelector(".friends-empty")).not.toBeNull();
    expect(document.activeElement).toBe(addBox());
    expect(document.body.textContent).toContain("Removed Mai.");
  });

  it("lists several friends, each with its own Remove", async () => {
    await mount();
    await openFriends();
    for (const [id, name] of [
      ["friend-a-000001", "Ann"],
      ["friend-b-000002", "Bao"],
    ]) {
      await typeInto(addBox(), cardText({ id, name }));
      await click(addButton());
    }
    expect([...document.querySelectorAll(".friend-name")].map((e) => e.textContent)).toEqual(["Ann", "Bao"]);
    expect([...document.querySelectorAll("[data-friend-remove]")].map((b) => b.getAttribute("aria-label"))).toEqual(["Remove Ann", "Remove Bao"]);
    await click(document.querySelector("[data-friend-remove]")!);
    await click([...popover("alertdialog")!.querySelectorAll("button")].find((b) => b.textContent?.includes("Remove"))!);
    // The keyboard lands on the next friend's Remove.
    expect(document.activeElement?.getAttribute("aria-label")).toBe("Remove Bao");
  });

  it("shows this week's boss: an HP bar a screen reader can read, and who has helped", async () => {
    await mount();
    await openFriends();
    await typeInto(addBox(), cardText({ weekDone: 4 }));
    await click(addButton());
    const bar = document.querySelector<HTMLElement>(".boss-bar[role=progressbar]")!;
    const boss = brain.getSnapshot().boss;
    expect(boss.maxHp).toBe(30);
    expect(bar.getAttribute("aria-valuemax")).toBe("30");
    expect(bar.getAttribute("aria-valuenow")).toBe(String(boss.hp));
    expect(bar.getAttribute("aria-valuetext")).toMatch(/HP left/);
    expect(bar.getAttribute("aria-label")).toMatch(/health/);
    expect(document.querySelector(".boss-hp")?.textContent).toBe(`HP ${boss.hp}/30`);
    const who = [...document.querySelectorAll(".boss-who li")].map((li) => li.textContent);
    expect(who[0]).toMatch(/^You/);
    expect(who[1]).toMatch(/^Mai/);
    expect(document.querySelector(".friends-boss")?.textContent).toContain("Procrastination Blob");
  });

  it("says the blob is beaten, and the sticker page gets the 🏅", async () => {
    await mount();
    await openFriends();
    await typeInto(addBox(), cardText({ weekDone: 60 }));
    await click(addButton());
    expect(document.querySelector(".boss.beaten")).not.toBeNull();
    expect(document.querySelector(".friends-boss")?.textContent).toMatch(/Beaten!/);
    expect(brain.getSnapshot().life.pageMedals).toBe(1);
    await click(document.querySelector<HTMLButtonElement>(".sheet-nav button")!);
    await click(document.querySelector("[data-wardrobe]")!);
    expect(document.querySelectorAll(".sticker-page .slot.medal")).toHaveLength(1);
    expect(document.querySelector(".sticker-page .slot.medal")?.textContent).toBe("🏅");
  });

  it("states what a card holds, and that it never holds titles, times, app names or your name", async () => {
    await mount();
    await openFriends();
    const note = document.querySelector(".friends-privacy")!.textContent!;
    expect(note).toMatch(/pet's name, species, accessories and stage/);
    expect(note).toMatch(/Never task titles, times, app names or your name/);
  });
});
