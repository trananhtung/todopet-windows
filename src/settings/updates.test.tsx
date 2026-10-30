// @vitest-environment jsdom
// Settings → Updates (v0.7): the running version, where things stand, "Check now", "Update & restart" (which asks the overlay,
// the window that owns the pet's state, to do it) or the download page, the release notes as text, the automatic-check switch.
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createDemoBackend, type DemoBackend } from "../backend/demo";
import { BackendError, type AvailableUpdate, type BusEvent, type UpdateManualReason, type UpdateStatus } from "../backend/types";
import { setLang } from "../core/l10n";
import { defaultPrefs, type Prefs } from "../core/prefs";
import { newLife } from "../core/life";
import { type SettingsApi, SettingsContext } from "./context";
import { SECTION_IDS, sectionFromHash } from "./model";
import { UpdatesSection } from "./sections/Updates";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const NOW = new Date(2026, 9, 28, 9).getTime();
let container: HTMLDivElement;
let root: Root;
let backend: DemoBackend;
let update: ReturnType<typeof vi.fn>;
let emitted: BusEvent[];
/** What the mocked backend says from now on (Rust's cached answer: what a check found is what the status says afterwards). */
let served: UpdateStatus | null = null;
/** A check that finds `st`, as the real backend does: the status says the same from then on. */
const finds = (st: UpdateStatus) => async () => (served = st);

const available = (patch: Partial<AvailableUpdate> = {}): AvailableUpdate => ({
  version: "0.7.1",
  notes: "## What's new\n\n- Faster board\n- Fixed the timer",
  publishedAt: "2026-10-26T10:00:00Z",
  canInstall: true,
  manualReason: null,
  ...patch,
});
const status = (patch: Partial<UpdateStatus> = {}): UpdateStatus => ({ current: "0.7.0", checkedAt: null, available: null, error: null, ...patch });

async function mount(opts: { prefs?: Partial<Prefs>; status?: UpdateStatus; lang?: "en" | "vi"; setup?: (b: DemoBackend) => void } = {}) {
  backend = createDemoBackend({ persist: false, now: () => NOW, fastUpdates: true });
  served = opts.status ?? null;
  if (served) backend.updates.status = async () => served!;
  opts.setup?.(backend);
  emitted = [];
  const realEmit = backend.bus.emit.bind(backend.bus);
  backend.bus.emit = async (e) => {
    emitted.push(e);
    await realEmit(e);
  };
  update = vi.fn();
  const lang = opts.lang ?? "en";
  setLang(lang);
  const api: SettingsApi = {
    backend,
    prefs: { ...defaultPrefs(NOW), ...opts.prefs },
    update: update as unknown as SettingsApi["update"],
    flush: () => undefined,
    life: newLife(),
    secrets: { todoist: true, anthropic: false, calendarHosts: [] },
    refreshSecrets: async () => undefined,
    lang,
    systemLang: lang,
  };
  await act(async () => void root.render(<SettingsContext value={api}><UpdatesSection /></SettingsContext>));
  await act(async () => void (await new Promise((r) => setTimeout(r, 5))));
}

const click = (el: Element) => act(async () => void el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, detail: 1 })));
const settle = () => act(async () => void (await new Promise((r) => setTimeout(r, 30))));
const button = (text: string) => [...container.querySelectorAll<HTMLButtonElement>("button")].find((b) => b.textContent?.trim() === text);
const text = () => container.textContent ?? "";

beforeEach(() => {
  document.body.replaceChildren();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  setLang("en");
});

describe("Settings → Updates: where things stand", () => {
  it("is a section of its own, found by #updates, just before About", () => {
    expect(SECTION_IDS).toContain("updates");
    expect(SECTION_IDS.indexOf("updates")).toBe(SECTION_IDS.indexOf("about") - 1);
    expect(sectionFromHash("#updates")).toBe("updates");
  });

  it("shows the running version and that nothing was checked yet, with only 'Check now' to press", async () => {
    await mount({ status: status({ current: "0.7.0" }) });
    expect(container.querySelector("h1")!.textContent).toBe("Updates");
    expect(text()).toContain("0.7.0");
    expect(text()).toContain("Not checked yet");
    expect(button("Check now")).toBeDefined();
    expect(button("Update & restart")).toBeUndefined();
    expect(button("Open download page")).toBeUndefined();
  });

  it("says you are on the newest version and when it checked", async () => {
    await mount({ status: status({ checkedAt: NOW - 5 * 60_000 }) });
    // (The clock here is the real one, so only the shape of the sentence is certain.)
    expect(text()).toContain("You're on the newest version");
    expect(text()).toMatch(/Checked .* ago/);
  });

  it("shows a version found earlier (by the pet's own check) without asking again", async () => {
    const check = vi.fn();
    await mount({ status: status({ checkedAt: NOW, available: available() }), setup: (b) => void (b.updates.check = check) });
    expect(check).not.toHaveBeenCalled();
    expect(text()).toContain("Version 0.7.1 is ready");
    expect(button("Update & restart")).toBeDefined();
  });

  it("says kindly that it could not check", async () => {
    await mount({ status: status({ checkedAt: NOW, error: { kind: "network", message: "offline" } }) });
    expect(text()).toContain("Couldn't check for updates just now");
    expect(text()).not.toContain("offline");
  });

  it("keeps showing a version it found before when a later check failed", async () => {
    await mount({ status: status({ checkedAt: NOW, available: available(), error: { kind: "network", message: "offline" } }) });
    expect(text()).toContain("Version 0.7.1 is ready");
  });
});

describe("Settings → Updates: Check now", () => {
  it("asks the backend with force, shows 'Checking…' meanwhile, then what it found, and tells the pet", async () => {
    await mount();
    let finish: (s: UpdateStatus) => void = () => undefined;
    const check = vi.fn(() => new Promise<UpdateStatus>((r) => (finish = r)));
    backend.updates.check = check;
    await click(button("Check now")!);
    expect(check).toHaveBeenCalledWith(true);
    expect(text()).toContain("Checking…");
    expect(button("Check now")!.getAttribute("aria-disabled")).toBe("true");
    backend.updates.status = async () => served!;
    await act(async () => finish((served = status({ checkedAt: NOW, available: available() }))));
    expect(text()).toContain("Version 0.7.1 is ready");
    expect(button("Check now")!.getAttribute("aria-disabled")).toBe("false");
    expect(emitted).toContainEqual({ type: "update-changed" });
  });

  it("finds the demo's 0.7.1 for real", async () => {
    await mount();
    await click(button("Check now")!);
    await settle();
    expect(text()).toContain("Version 0.7.1 is ready");
    expect(button("Update & restart")).toBeDefined();
  });

  it("says kindly that it could not check when the backend says so", async () => {
    await mount();
    backend.updates.check = finds(status({ checkedAt: NOW, error: { kind: "network", message: "dns error" } }));
    backend.updates.status = async () => served!;
    await click(button("Check now")!);
    expect(text()).toContain("Couldn't check for updates just now");
    expect(text()).not.toContain("dns error");
  });

  it("says the same, and doesn't fall over, when the check itself throws", async () => {
    await mount({ status: status() });
    backend.updates.check = async () => {
      throw new BackendError({ kind: "internal", message: "x" });
    };
    await click(button("Check now")!);
    expect(text()).toContain("Couldn't check for updates just now");
    expect(button("Check now")!.getAttribute("aria-disabled")).toBe("false");
  });

  it("keeps the version found before on offer when a check throws, and says the check failed", async () => {
    await mount({ status: status({ checkedAt: NOW - 3_600_000, available: available() }) });
    backend.updates.check = async () => {
      throw new BackendError({ kind: "internal", message: "x" });
    };
    await click(button("Check now")!);
    expect(text()).toContain("Version 0.7.1 is ready");
    expect(text()).toContain("Couldn't check for updates just now. This is what I found earlier.");
    expect(button("Update & restart")).toBeDefined();
  });

  it("answers a failed press even when a version is already known: the failure is said under it, and the Update button stays", async () => {
    await mount({ status: status({ checkedAt: NOW - 3_600_000, available: available() }) });
    backend.updates.check = finds(status({ checkedAt: NOW, available: available(), error: { kind: "network", message: "offline" } }));
    backend.updates.status = async () => served!;
    await click(button("Check now")!);
    expect(text()).toContain("Version 0.7.1 is ready");
    expect(text()).toContain("Last tried");
    expect(text()).toContain("Couldn't check for updates just now. This is what I found earlier.");
    expect(text()).not.toContain("offline");
    expect(button("Update & restart")).toBeDefined();
  });

  it("shows no such failure when the check worked", async () => {
    await mount({ status: status({ checkedAt: NOW, available: available() }) });
    expect(text()).not.toContain("This is what I found earlier");
  });

  it("keeps the keyboard where it was: Check now stays the same button, aria-disabled (never disabled) while it checks", async () => {
    await mount();
    let finish: (s: UpdateStatus) => void = () => undefined;
    backend.updates.check = () => new Promise<UpdateStatus>((r) => (finish = r));
    const el = button("Check now")!;
    el.focus();
    await click(el);
    expect(button("Check now")).toBe(el);
    expect(document.activeElement).toBe(el);
    expect(el.hasAttribute("disabled")).toBe(false);
    expect(el.getAttribute("aria-disabled")).toBe("true");
    expect(el.getAttribute("aria-busy")).toBe("true");
    // A second press while it checks does nothing.
    const check = vi.fn(async () => status());
    backend.updates.check = check;
    await click(el);
    expect(check).not.toHaveBeenCalled();
    await act(async () => finish((served = status({ checkedAt: NOW, available: available() }))));
    backend.updates.status = async () => served!;
    expect(button("Check now")).toBe(el);
    expect(document.activeElement).toBe(el);
    expect(el.getAttribute("aria-disabled")).toBe("false");
  });
});

describe("Settings → Updates: getting the new version", () => {
  const UPDATING = "Updating… I'll restart in a moment.";
  const UNHEARD = "I couldn't start the update just now. Try again, or open the download page.";

  it("asks the overlay to install (it owns the pet's state and saves it first), rather than installing from here", async () => {
    await mount({ status: status({ checkedAt: NOW, available: available() }) });
    const install = vi.spyOn(backend.updates, "install");
    await click(button("Update & restart")!);
    expect(emitted).toContainEqual({ type: "update-install" });
    expect(install).not.toHaveBeenCalled();
    expect(button("Check now")!.getAttribute("aria-disabled")).toBe("true");
  });

  it("keeps the keyboard where it was: Update & restart stays the same button, aria-disabled, with the notice below the buttons", async () => {
    await mount({ status: status({ checkedAt: NOW, available: available() }) });
    const el = button("Update & restart")!;
    el.focus();
    await click(el);
    expect(button("Update & restart")).toBe(el);
    expect(document.activeElement).toBe(el);
    expect(el.hasAttribute("disabled")).toBe(false);
    expect(el.getAttribute("aria-disabled")).toBe("true");
    // (A second press while it waits does nothing.)
    const before = emitted.length;
    await click(el);
    expect(emitted.length).toBe(before);
    // The notice comes after the buttons, so that nothing under the keyboard's focus moves when it appears.
    const notice = container.querySelector(".update-after")!;
    expect(notice.textContent).toContain(UPDATING);
    const actions = container.querySelector(".update-actions")!;
    expect(actions.compareDocumentPosition(notice) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("says it is updating once the pet has taken the request, and goes on saying so for as long as it takes (a download can take minutes)", async () => {
    await mount({ status: status({ checkedAt: NOW, available: available() }) });
    vi.useFakeTimers();
    try {
      await click(button("Update & restart")!);
      await act(async () => backend.bus.emit({ type: "update-installing" }));
      expect(text()).toContain(UPDATING);
      await act(async () => void (await vi.advanceTimersByTimeAsync(10 * 60_000)));
      expect(text()).toContain(UPDATING);
      expect(text()).not.toContain(UNHEARD);
      expect(button("Update & restart")!.getAttribute("aria-disabled")).toBe("true");
    } finally {
      vi.useRealTimers();
    }
  });

  it("stops waiting when the pet says the update didn't go through (it sends update-changed)", async () => {
    await mount({ status: status({ checkedAt: NOW, available: available() }) });
    await click(button("Update & restart")!);
    await act(async () => backend.bus.emit({ type: "update-installing" }));
    expect(text()).toContain(UPDATING);
    await act(async () => backend.bus.emit({ type: "update-changed" }));
    await settle();
    expect(text()).not.toContain(UPDATING);
    expect(button("Update & restart")!.getAttribute("aria-disabled")).toBe("false");
  });

  it("stops waiting if the pet turned out to have nothing to install, without a word about a restart", async () => {
    await mount({ status: status({ checkedAt: NOW, available: available() }) });
    await click(button("Update & restart")!);
    expect(text()).toContain(UPDATING);
    await act(async () => backend.bus.emit({ type: "update-changed" }));
    await settle();
    expect(text()).not.toContain(UPDATING);
    expect(text()).not.toContain(UNHEARD);
  });

  it("says so, kindly, if the pet never takes the request, and offers to try again or to open the page", async () => {
    await mount({ status: status({ checkedAt: NOW, available: available() }) });
    vi.useFakeTimers();
    try {
      await click(button("Update & restart")!);
      await act(async () => void (await vi.advanceTimersByTimeAsync(7_000)));
      expect(text()).toContain(UPDATING);
      expect(text()).not.toContain(UNHEARD);
      await act(async () => void (await vi.advanceTimersByTimeAsync(2_000)));
      expect(text()).toContain(UNHEARD);
      expect(text()).not.toContain(UPDATING);
      expect(button("Update & restart")!.getAttribute("aria-disabled")).toBe("false");
      expect(button("Open download page")).toBeDefined();
      // Trying again asks again.
      const asks = () => emitted.filter((e) => e.type === "update-install").length;
      const before = asks();
      await click(button("Update & restart")!);
      expect(asks()).toBe(before + 1);
      expect(text()).toContain(UPDATING);
      expect(text()).not.toContain(UNHEARD);
    } finally {
      vi.useRealTimers();
    }
  });

  it("says it in Vietnamese", async () => {
    await mount({ lang: "vi", status: status({ checkedAt: NOW, available: available() }) });
    vi.useFakeTimers();
    try {
      await click(button("Cập nhật & khởi động lại")!);
      expect(text()).toContain("Đang cập nhật… mình sẽ khởi động lại trong giây lát.");
      await act(async () => void (await vi.advanceTimersByTimeAsync(9_000)));
      expect(text()).toContain("Mình chưa bắt đầu cập nhật được. Bạn thử lại, hoặc mở trang tải về nhé.");
    } finally {
      vi.useRealTimers();
    }
  });

  it("offers the download page instead when one click is off, and opens it through the backend", async () => {
    await mount({ status: status({ checkedAt: NOW, available: available({ canInstall: false, manualReason: "msi" }) }) });
    expect(button("Update & restart")).toBeUndefined();
    const page = vi.spyOn(backend.updates, "openPage");
    await click(button("Open download page")!);
    expect(page).toHaveBeenCalledTimes(1);
    expect(emitted.filter((e) => e.type === "update-install")).toHaveLength(0);
  });

  it("says kindly if the page could not be opened", async () => {
    await mount({ status: status({ checkedAt: NOW, available: available({ canInstall: false, manualReason: "dev" }) }) });
    backend.updates.openPage = async () => {
      throw new BackendError({ kind: "internal", message: "no browser" });
    };
    await click(button("Open download page")!);
    expect(text()).toContain("couldn't open the download page");
  });

  it.each<[UpdateManualReason, RegExp]>([
    ["msi", /MSI/],
    ["unsigned", /signed update file/],
    ["dev", /development build/],
    ["check_failed", /couldn't verify/],
  ])("explains kindly why one click is off for %s, and points at the download page", async (reason, pattern) => {
    await mount({ status: status({ checkedAt: NOW, available: available({ canInstall: false, manualReason: reason }) }) });
    expect(text()).toMatch(pattern);
    expect(text()).toMatch(/download page/i);
  });

  it("explains in general words for a reason it doesn't know, or none at all", async () => {
    await mount({ status: status({ checkedAt: NOW, available: available({ canInstall: false, manualReason: "from_the_future" as UpdateManualReason }) }) });
    expect(container.querySelector(".update-why")!.textContent).toMatch(/One click isn't available for this install/);
    await act(async () => root.unmount());
    root = createRoot(container);
    await mount({ status: status({ checkedAt: NOW, available: available({ canInstall: false, manualReason: null }) }) });
    expect(container.querySelector(".update-why")!.textContent).toMatch(/One click isn't available for this install/);
  });

  it("says nothing about why when one click works", async () => {
    await mount({ status: status({ checkedAt: NOW, available: available() }) });
    expect(container.querySelector(".update-why")).toBeNull();
  });
});

describe("Settings → Updates: the release notes", () => {
  const lines = () => [...container.querySelectorAll<HTMLElement>(".update-notes .note-line")].map((e) => e.textContent);

  it("shows them as plain text, a block to a line, under the version's name (and without a first line that only repeats it)", async () => {
    await mount({ status: status({ checkedAt: NOW, available: available() }) });
    expect(lines()).toEqual(["• Faster board", "• Fixed the timer"]);
    expect(text()).toContain("What's new in 0.7.1");
  });

  it("hangs a bullet's second line under its words: bullets are marked, plain lines and blank ones are not", async () => {
    await mount({ status: status({ checkedAt: NOW, available: available({ notes: "## Big news\n\n- A bullet\nA plain line" }) }) });
    const rows = [...container.querySelectorAll<HTMLElement>(".update-notes > *")];
    expect(rows.map((r) => r.className)).toEqual(["note-line", "note-gap", "note-line bullet", "note-line"]);
    expect(rows.map((r) => r.textContent)).toEqual(["Big news", "", "• A bullet", "A plain line"]);
  });

  it("shows the section for the language of the app when the notes are written in two", async () => {
    const both = "### English\n- Faster board\n\n### Tiếng Việt\n- Bảng nhanh hơn";
    await mount({ status: status({ checkedAt: NOW, available: available({ notes: both }) }) });
    expect(lines()).toEqual(["• Faster board"]);
    await act(async () => root.unmount());
    root = createRoot(container);
    await mount({ lang: "vi", status: status({ checkedAt: NOW, available: available({ notes: both }) }) });
    expect(lines()).toEqual(["• Bảng nhanh hơn"]);
  });

  it("never turns the notes into markup", async () => {
    await mount({ status: status({ checkedAt: NOW, available: available({ notes: "- <img src=x onerror=alert(1)>\n- <script>alert(2)</script>\n- [click](javascript:alert(3))" }) }) });
    const notes = container.querySelector<HTMLElement>(".update-notes")!;
    expect(notes.querySelector("img, script, a")).toBeNull();
    expect(notes.textContent).toContain("<img src=x onerror=alert(1)>");
    expect(notes.textContent).toContain("<script>alert(2)</script>");
    // A link in the notes is only its words.
    expect(notes.textContent).toContain("• click");
  });

  it("has no section for empty notes", async () => {
    await mount({ status: status({ checkedAt: NOW, available: available({ notes: "" }) }) });
    expect(container.querySelector(".update-notes")).toBeNull();
  });

  it("is not there when there is nothing to update to", async () => {
    await mount({ status: status({ checkedAt: NOW }) });
    expect(container.querySelector(".update-notes")).toBeNull();
  });
});

describe("Settings → Updates: automatic checks and privacy", () => {
  it("has a switch, on by default, that turns the automatic checks off and on", async () => {
    await mount();
    const sw = container.querySelector<HTMLInputElement>("input[role=switch]")!;
    expect(sw.checked).toBe(true);
    await click(sw);
    expect(update).toHaveBeenCalledWith({ autoUpdateCheck: false });
  });

  it("shows the switch off when it is off", async () => {
    await mount({ prefs: { autoUpdateCheck: false } });
    expect(container.querySelector<HTMLInputElement>("input[role=switch]")!.checked).toBe(false);
  });

  it("says what it asks and what it sends", async () => {
    await mount();
    expect(text()).toContain("Asks GitHub about every 6 hours; sends nothing about you.");
  });
});

describe("Settings → Updates: Vietnamese", () => {
  it("speaks Vietnamese", async () => {
    await mount({ lang: "vi", status: status({ checkedAt: NOW, available: available({ canInstall: false, manualReason: "msi" }) }) });
    expect(container.querySelector("h1")!.textContent).toBe("Cập nhật");
    expect(button("Kiểm tra ngay")).toBeDefined();
    expect(button("Mở trang tải về")).toBeDefined();
    expect(text()).toContain("Đã có bản 0.7.1");
    expect(text()).toContain("Hỏi GitHub khoảng 6 giờ một lần; không gửi gì về bạn.");
    expect(text()).toMatch(/MSI/);
  });

  it("has its buttons in Vietnamese when one click works", async () => {
    await mount({ lang: "vi", status: status({ checkedAt: NOW, available: available() }) });
    expect(button("Cập nhật & khởi động lại")).toBeDefined();
  });
});
