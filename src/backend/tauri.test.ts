// The Tauri backend's update commands (v0.7): the names and arguments Rust expects, the progress channel, and errors as BackendError.
import { beforeEach, describe, expect, it, vi } from "vitest";

const invoke = vi.fn();
class FakeChannel<T> {
  onmessage: (m: T) => void = () => undefined;
}
vi.mock("@tauri-apps/api/core", () => ({ invoke: (...a: unknown[]) => invoke(...a), Channel: FakeChannel }));
const listeners = new Map<string, (e: { payload: unknown }) => void>();
vi.mock("@tauri-apps/api/event", () => ({
  emit: vi.fn(),
  listen: (name: string, cb: (e: { payload: unknown }) => void) => {
    listeners.set(name, cb);
    return Promise.resolve(() => undefined);
  },
}));

const { createTauriBackend } = await import("./tauri");
const { BackendError } = await import("./types");

const status = { current: "0.7.0", checkedAt: 5, available: null, error: null };

// (Not `() => invoke.mockReset()`: a function returned from beforeEach is called as a cleanup.)
beforeEach(() => {
  invoke.mockReset();
});

describe("tauri backend: updates", () => {
  it("asks for the cached status with no arguments", async () => {
    invoke.mockResolvedValue(status);
    expect(await createTauriBackend().updates.status()).toEqual(status);
    expect(invoke).toHaveBeenCalledWith("update_status", undefined);
  });

  it("passes whether the check is forced, and nothing else (no URL ever comes from JavaScript)", async () => {
    invoke.mockResolvedValue(status);
    const b = createTauriBackend();
    await b.updates.check(true);
    expect(invoke).toHaveBeenLastCalledWith("update_check", { force: true });
    await b.updates.check(false);
    expect(invoke).toHaveBeenLastCalledWith("update_check", { force: false });
  });

  it("opens the page with no arguments", async () => {
    invoke.mockResolvedValue(undefined);
    await createTauriBackend().updates.openPage();
    expect(invoke).toHaveBeenCalledWith("update_open_page", undefined);
  });

  it("installs through a channel that carries the progress to the caller", async () => {
    const seen: unknown[] = [];
    invoke.mockImplementation(async (_cmd: string, args: { onProgress: FakeChannel<unknown> }) => {
      args.onProgress.onmessage({ phase: "downloading", downloaded: 10, total: 100 });
      args.onProgress.onmessage({ phase: "installing" });
    });
    await createTauriBackend().updates.install((p) => seen.push(p));
    expect(invoke).toHaveBeenCalledWith("update_install", { onProgress: expect.any(FakeChannel) });
    expect(seen).toEqual([{ phase: "downloading", downloaded: 10, total: 100 }, { phase: "installing" }]);
  });

  it("ignores a progress message that is not one of the two shapes", async () => {
    const seen: unknown[] = [];
    invoke.mockImplementation(async (_cmd: string, args: { onProgress: FakeChannel<unknown> }) => {
      for (const junk of [null, 5, "x", {}, { phase: "other" }, { phase: "downloading" }, { phase: "downloading", downloaded: "1", total: 2 }]) args.onProgress.onmessage(junk);
      args.onProgress.onmessage({ phase: "downloading", downloaded: 1, total: null });
    });
    await createTauriBackend().updates.install((p) => seen.push(p));
    expect(seen).toEqual([{ phase: "downloading", downloaded: 1, total: null }]);
  });

  it("turns Rust's error into a BackendError, and a plain string from Tauri too", async () => {
    const b = createTauriBackend();
    invoke.mockRejectedValueOnce({ kind: "network", message: "offline" });
    await expect(b.updates.check(false)).rejects.toMatchObject({ name: "BackendError", kind: "network", message: "offline" });
    invoke.mockRejectedValueOnce("command update_install not found");
    const err = await b.updates.install(() => undefined).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(BackendError);
    expect(err).toMatchObject({ kind: "internal", message: "command update_install not found" });
  });
});

describe("tauri backend: the bus carries the update events", () => {
  it("passes the three update events through, and drops what it doesn't know", async () => {
    const heard: unknown[] = [];
    const off = createTauriBackend().bus.on((e) => heard.push(e));
    await Promise.resolve();
    const send = listeners.get("bus")!;
    for (const type of ["update-changed", "update-install", "update-installing", "nonsense"]) send({ payload: { type } });
    send({ payload: null });
    send({ payload: "update-changed" });
    off();
    expect(heard).toEqual([{ type: "update-changed" }, { type: "update-install" }, { type: "update-installing" }]);
  });
});
