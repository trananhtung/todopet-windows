// @vitest-environment jsdom
// v0.7 "Always fresh" in the overlay: the bubble that shows the download as it goes (and the notice's buttons and highlights), and
// the small chip on the board that says a version is ready.
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AvailableUpdate } from "../backend/types";
import type { Brain, BrainState, Bubble } from "../core/brain";
import { setLang } from "../core/l10n";
import type { Installing } from "../core/updates";
import { BubbleView } from "./Bubble";
import { UpdateChip } from "./UpdateChip";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  setLang("en");
  document.body.replaceChildren();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
});

const click = (el: Element) => act(async () => void el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, detail: 1 })));

describe("the bubble", () => {
  const bubble = (patch: Partial<Bubble> = {}): Bubble => ({ id: 7, text: "Hello", actions: [], seconds: 30, urgent: false, reminder: false, ...patch });
  const fake = () => ({ pickAction: vi.fn(), dismissBubble: vi.fn() }) as unknown as Brain & { pickAction: ReturnType<typeof vi.fn>; dismissBubble: ReturnType<typeof vi.fn> };
  const render = (b: Bubble, brain: Brain = fake()) => act(async () => void root.render(<BubbleView key={b.id} bubble={b} brain={brain} />));

  it("shows the download as a bar with its share, and no countdown", async () => {
    await render(bubble({ text: "Downloading… 45%", urgent: true, progress: { percent: 45, spoken: "Downloading…" } }));
    const bar = container.querySelector<HTMLElement>("[role=progressbar]")!;
    expect(bar).not.toBeNull();
    expect(bar.getAttribute("aria-valuenow")).toBe("45");
    expect(bar.getAttribute("aria-valuemin")).toBe("0");
    expect(bar.getAttribute("aria-valuemax")).toBe("100");
    expect(bar.getAttribute("aria-valuetext")).toBe("Downloading… 45%");
    expect(bar.querySelector<HTMLElement>("i")!.style.width).toBe("45%");
    expect(container.querySelector(".bubble-timer")).toBeNull();
    expect(container.querySelector(".bubble-text")!.textContent).toBe("Downloading… 45%");
  });

  it("is an unfilled, moving bar while the size is not known, with no value to read out", async () => {
    await render(bubble({ text: "Downloading…", progress: { percent: null, spoken: "Downloading…" } }));
    const bar = container.querySelector<HTMLElement>("[role=progressbar]")!;
    expect(bar.hasAttribute("aria-valuenow")).toBe(false);
    expect(bar.querySelector("i")!.classList.contains("indeterminate")).toBe(true);
  });

  it("changes in place as the download goes: the same bubble, not a new one", async () => {
    const first = bubble({ text: "Downloading… 10%", progress: { percent: 10, spoken: "Downloading…" } });
    await render(first);
    const el = container.querySelector(".bubble");
    await render({ ...first, text: "Downloading… 60%", progress: { percent: 60, spoken: "Downloading… 50%" } });
    expect(container.querySelector(".bubble")).toBe(el);
    expect(container.querySelector(".bubble-text")!.textContent).toBe("Downloading… 60%");
    expect(container.querySelector<HTMLElement>("[role=progressbar] i")!.style.width).toBe("60%");
  });

  it("does not read every percent out loud: the bubble is not a live region while it downloads, a small one speaks at three points", async () => {
    const at = (percent: number | null, spoken: string, text: string) => render(bubble({ text, urgent: true, progress: { percent, spoken } }));
    await at(10, "Downloading…", "Downloading… 10%");
    expect(container.querySelector(".bubble")!.getAttribute("aria-live")).toBe("off");
    const live = container.querySelector<HTMLElement>(".bubble [aria-live=polite]")!;
    expect(live.textContent).toBe("Downloading…");
    expect(live.classList.contains("sr-only")).toBe(true);
    // Ten percent more: the visible words move, what is spoken doesn't (the same text node is left alone).
    const node = live.firstChild;
    await at(20, "Downloading…", "Downloading… 20%");
    expect(container.querySelector(".bubble [aria-live=polite]")!.firstChild).toBe(node);
    await at(60, "Downloading… 50%", "Downloading… 60%");
    expect(container.querySelector(".bubble [aria-live=polite]")!.textContent).toBe("Downloading… 50%");
    await at(100, "Installing, see you in a moment!", "Installing, see you in a moment!");
    expect(container.querySelector(".bubble [aria-live=polite]")!.textContent).toBe("Installing, see you in a moment!");
    await render(bubble({ id: 8, text: "Question", urgent: true }));
    expect(container.querySelector(".bubble")!.getAttribute("aria-live")).toBe("assertive");
    expect(container.querySelector(".bubble [aria-live=polite]")).toBeNull();
  });

  it("keeps the countdown and has no bar on a bubble without progress", async () => {
    await render(bubble());
    expect(container.querySelector("[role=progressbar]")).toBeNull();
    expect(container.querySelector(".bubble-timer")).not.toBeNull();
  });

  it("shows the notice with its highlights as lines and its buttons, and a click goes to the brain", async () => {
    const brain = fake();
    const notice = bubble({
      text: "There's a new version of me: 0.7.1 ✨",
      detail: "What's new:\n• Faster board\n• Fixed the timer",
      actions: [
        { title: "Update now", primary: true, run: () => undefined },
        { title: "Later", neutral: true, run: () => undefined },
      ],
    });
    await render(notice, brain);
    // One block to a line, so a long bullet wraps under its own words (a hanging indent) and not under the dot.
    const lines = [...container.querySelectorAll<HTMLElement>(".bubble-detail > div")];
    expect(lines.map((l) => l.textContent)).toEqual(["What's new:", "• Faster board", "• Fixed the timer"]);
    expect(lines.map((l) => l.classList.contains("bullet"))).toEqual([false, true, true]);
    const buttons = [...container.querySelectorAll<HTMLButtonElement>(".bubble-actions button")];
    expect(buttons.map((b) => b.textContent)).toEqual(["Update now", "Later"]);
    expect(buttons[0].classList.contains("primary")).toBe(true);
    await click(buttons[0]);
    expect(brain.pickAction).toHaveBeenCalledWith(7, 0);
    await click(buttons[1]);
    expect(brain.pickAction).toHaveBeenLastCalledWith(7, 1);
  });

  it("renders text from the release only as text, never as markup", async () => {
    await render(bubble({ text: "x", detail: "What's new:\n• <img src=x onerror=alert(1)> <b>bold</b>" }));
    expect(container.querySelector(".bubble-detail img")).toBeNull();
    expect(container.querySelector(".bubble-detail b")).toBeNull();
    expect(container.querySelector(".bubble-detail")!.textContent).toContain("<img src=x onerror=alert(1)> <b>bold</b>");
  });
});

describe("the board's chip", () => {
  const update = (patch: Partial<AvailableUpdate> = {}): AvailableUpdate => ({ version: "0.7.1", notes: "", publishedAt: null, canInstall: true, manualReason: null, ...patch });
  const state = (update: AvailableUpdate | null, installing: Installing | null = null) => ({ update, installing }) as BrainState;
  const brain = () => ({ startUpdate: vi.fn(async () => undefined) }) as unknown as Brain & { startUpdate: ReturnType<typeof vi.fn> };
  const render = (s: BrainState, b: Brain) => act(async () => void root.render(<UpdateChip s={s} brain={b} />));
  const chip = () => container.querySelector<HTMLButtonElement>("button.update-chip");

  it("is not there while nothing is on offer", async () => {
    await render(state(null), brain());
    expect(chip()).toBeNull();
    expect(container.textContent).toBe("");
  });

  it("says the version is ready, and a click starts the same flow as the notice", async () => {
    const b = brain();
    await render(state(update()), b);
    expect(chip()!.textContent).toContain("✨ 0.7.1 is ready");
    expect(chip()!.getAttribute("title")).toBe("Update and restart");
    await click(chip()!);
    expect(b.startUpdate).toHaveBeenCalledTimes(1);
  });

  it("says it opens the download page when one click is off", async () => {
    const b = brain();
    await render(state(update({ canInstall: false, manualReason: "msi" })), b);
    expect(chip()!.getAttribute("title")).toBe("Open the download page");
    // ("Ready" would promise more than a web page: it says it is out, and that it goes to the download.)
    expect(chip()!.textContent).toContain("✨ 0.7.1 is out · download");
    await click(chip()!);
    expect(b.startUpdate).toHaveBeenCalledTimes(1);
  });

  it("shows the progress in its place while installing, and can't be pressed again", async () => {
    const b = brain();
    await render(state(update(), { phase: "downloading", percent: 45 }), b);
    expect(chip()!.textContent).toContain("Downloading… 45%");
    expect(chip()!.getAttribute("aria-busy")).toBe("true");
    await click(chip()!);
    expect(b.startUpdate).not.toHaveBeenCalled();
    await render(state(update(), { phase: "installing" }), b);
    expect(chip()!.textContent).toContain("Installing, see you in a moment!");
  });

  it("stays a button the keyboard can stay on: not 'disabled' (which drops the focus to the page), but aria-disabled", async () => {
    const b = brain();
    await render(state(update()), b);
    const el = chip()!;
    el.focus();
    expect(document.activeElement).toBe(el);
    expect(el.hasAttribute("disabled")).toBe(false);
    expect(el.getAttribute("aria-disabled")).toBe("false");
    await click(el);
    // The press started the install; the chip is the same element, still focused, now busy.
    await render(state(update(), { phase: "downloading", percent: 10 }), b);
    expect(chip()).toBe(el);
    expect(document.activeElement).toBe(el);
    expect(el.hasAttribute("disabled")).toBe(false);
    expect(el.getAttribute("aria-disabled")).toBe("true");
  });

  it("tells a screen reader about the download at the start, halfway and the last step only", async () => {
    const b = brain();
    const spoken = () => container.querySelector<HTMLElement>("[aria-live=polite]")!;
    await render(state(update()), b);
    expect(spoken().textContent).toBe("");
    await render(state(update(), { phase: "downloading", percent: 10 }), b);
    expect(spoken().textContent).toBe("Downloading…");
    const node = spoken().firstChild;
    await render(state(update(), { phase: "downloading", percent: 30 }), b);
    expect(spoken().firstChild).toBe(node);
    await render(state(update(), { phase: "downloading", percent: 70 }), b);
    expect(spoken().textContent).toBe("Downloading… 50%");
    await render(state(update(), { phase: "installing" }), b);
    expect(spoken().textContent).toBe("Installing, see you in a moment!");
  });

  it("slides into its own row instead of pushing the board down in one jump: it opens a moment after it appears", async () => {
    await render(state(update()), brain());
    const row = container.querySelector<HTMLElement>(".update-chip-row")!;
    expect(row).not.toBeNull();
    expect(row.classList.contains("open")).toBe(true);
    expect(row.querySelector(".update-chip")).not.toBeNull();
  });

  it("speaks Vietnamese", async () => {
    setLang("vi");
    await render(state(update()), brain());
    expect(chip()!.textContent).toContain("✨ Có bản 0.7.1");
    expect(chip()!.getAttribute("title")).toBe("Cập nhật và khởi động lại");
  });

  it("puts a version it was told about as text: nothing in it can become markup", async () => {
    await render(state(update({ version: "<b>9</b>" })), brain());
    expect(chip()!.querySelector("b")).toBeNull();
    expect(chip()!.textContent).toContain("<b>9</b>");
  });
});

describe("the demo panel's update button", () => {
  it("does what the tray item does: checks, then tells what it found, with the buttons", async () => {
    const { createDemoBackend } = await import("../backend/demo");
    const { Brain } = await import("../core/brain");
    const { DemoPanel } = await import("./Demo");
    const { demoLife } = await import("../core/life");
    const backend = createDemoBackend({ persist: false, fastUpdates: true });
    await backend.storage.save("life", demoLife());
    const brain = await Brain.create(backend, { demo: true });
    setLang("en");
    await brain.start();
    brain.dismissBubble(brain.getSnapshot().bubble?.id ?? -1, "closed");
    try {
      await act(async () => void root.render(<DemoPanel brain={brain} backend={backend} />));
      const press = [...container.querySelectorAll<HTMLButtonElement>("button")].find((b) => b.textContent?.includes("Check update"))!;
      expect(press).toBeDefined();
      await click(press);
      await vi.waitFor(() => expect(brain.getSnapshot().bubble?.text).toBe("There's a new version of me: 0.7.1 ✨"));
      expect(brain.getSnapshot().bubble?.actions.map((a) => a.title)).toEqual(["Update now", "Later"]);
      // Once one is known the button says what it does next.
      await act(async () => void 0);
      expect([...container.querySelectorAll("button")].some((b) => b.textContent?.includes("Update") && !b.textContent.includes("Check"))).toBe(true);
    } finally {
      brain.stop();
    }
  });
});
