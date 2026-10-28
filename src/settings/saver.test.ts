import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BusEvent } from "../backend/types";
import { type Prefs, defaultPrefs } from "../core/prefs";
import { PrefsSaver, type SaveState } from "./saver";

function setup() {
  const saves: Prefs[] = [];
  const events: BusEvent[] = [];
  const states: SaveState[] = [];
  const saver = new PrefsSaver(defaultPrefs(0), {
    save: async (p) => {
      saves.push(p);
    },
    emit: async (e) => {
      events.push(e);
    },
    onState: (s) => states.push(s),
  });
  return { saver, saves, events, states, base: defaultPrefs(0) };
}

describe("PrefsSaver", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("coalesces typing into one save after the debounce", async () => {
    const { saver, saves, events, base } = setup();
    saver.push({ ...base, petName: "M" }, true);
    saver.push({ ...base, petName: "Mo" }, true);
    saver.push({ ...base, petName: "Momo" }, true);
    expect(saver.busy).toBe(true);
    await vi.advanceTimersByTimeAsync(299);
    expect(saves).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(1);
    await saver.flush();
    expect(saves.map((p) => p.petName)).toEqual(["Momo"]);
    expect(events).toEqual([{ type: "prefs-changed" }]);
    expect(saver.busy).toBe(false);
    expect(saver.lastSaved.petName).toBe("Momo");
  });

  it("saves switches at once and announces a species change", async () => {
    const { saver, saves, events, base } = setup();
    saver.push({ ...base, species: "panda" }, false);
    await saver.flush();
    expect(saves).toHaveLength(1);
    expect(events).toEqual([{ type: "species-changed" }]);
  });

  it("an immediate change also writes the pending text", async () => {
    const { saver, saves, base } = setup();
    saver.push({ ...base, petName: "Bun" }, true);
    saver.push({ ...base, petName: "Bun", voiceOn: true }, false);
    await saver.flush();
    expect(saves).toHaveLength(1);
    expect(saves[0]).toMatchObject({ petName: "Bun", voiceOn: true });
    await vi.advanceTimersByTimeAsync(1000);
    expect(saves).toHaveLength(1);
  });

  it("skips writes that change nothing", async () => {
    const { saver, saves, events, states, base } = setup();
    saver.push({ ...base }, false);
    await saver.flush();
    expect(saves).toHaveLength(0);
    expect(events).toHaveLength(0);
    expect(states.at(-1)).toBe("saved");
  });

  it("reports a failed save and retries the diff next time", async () => {
    const states: SaveState[] = [];
    let fail = true;
    const saves: Prefs[] = [];
    const base = defaultPrefs(0);
    const saver = new PrefsSaver(base, {
      save: async (p) => {
        if (fail) throw new Error("disk full");
        saves.push(p);
      },
      emit: async () => undefined,
      onState: (s) => states.push(s),
    });
    saver.push({ ...base, antics: false }, false);
    await saver.flush();
    expect(states.at(-1)).toBe("error");
    expect(saver.lastSaved.antics).toBe(true);
    fail = false;
    saver.push({ ...base, antics: false }, false);
    await saver.flush();
    expect(saves).toHaveLength(1);
    expect(states.at(-1)).toBe("saved");
  });

  it("adopts prefs saved by another window", async () => {
    const { saver, saves, base } = setup();
    saver.reset({ ...base, dailyTarget: 5 });
    saver.push({ ...base, dailyTarget: 5 }, false);
    await saver.flush();
    expect(saves).toHaveLength(0);
  });
});
