import { describe, expect, it } from "vitest";
import { FAST, FrameLoop, SLOW, WAKE_SEC, frameInterval, type CadenceInput } from "./cadence";

const input = (patch: Partial<CadenceInput> = {}): CadenceInput => ({
  unseen: false,
  hidden: false,
  saver: false,
  lively: false,
  moving: false,
  calm: false,
  woken: false,
  ...patch,
});

describe("frameInterval", () => {
  it("draws at full rate normally and slowly while asleep or calm", () => {
    expect(frameInterval(input())).toBe(FAST);
    expect(frameInterval(input({ calm: true }))).toBe(SLOW);
  });

  it("plays what the user asked for at full rate, even while calm", () => {
    expect(frameInterval(input({ calm: true, lively: true }))).toBe(FAST);
  });

  it("stops while the screen is locked or the display is off, whatever the pet is doing", () => {
    expect(frameInterval(input({ unseen: true }))).toBeNull();
    expect(frameInterval(input({ unseen: true, lively: true, moving: true }))).toBeNull();
  });

  it("stops while the pet is hidden, and wakes only to place what still shows (an urgent bubble, the trip sign)", () => {
    expect(frameInterval(input({ hidden: true }))).toBeNull();
    expect(frameInterval(input({ hidden: true, woken: true }))).toBe(SLOW);
  });

  it("still places a new bubble while the screen counts as unseen, in case Windows got that wrong", () => {
    expect(frameInterval(input({ unseen: true, woken: true }))).toBe(SLOW);
  });

  it("on battery saver, stands still once nothing moves", () => {
    expect(frameInterval(input({ saver: true }))).toBeNull();
    expect(frameInterval(input({ saver: true, calm: true }))).toBeNull();
  });

  it("on battery saver, finishes a walk, a fall or a celebration first", () => {
    expect(frameInterval(input({ saver: true, moving: true }))).toBe(FAST);
    expect(frameInterval(input({ saver: true, moving: true, calm: true }))).toBe(SLOW);
  });

  it("on battery saver, still answers the user: full rate for a drag or a petting, slow after a wake-up", () => {
    expect(frameInterval(input({ saver: true, lively: true }))).toBe(FAST);
    expect(frameInterval(input({ saver: true, woken: true }))).toBe(SLOW);
  });
});

/** A hand-driven requestAnimationFrame: `flush(now)` runs the frame that is waiting, if any. */
function fakeFrames() {
  let next: { id: number; cb: (now: number) => void } | null = null;
  let ids = 0;
  let requested = 0;
  return {
    raf: (cb: (now: number) => void) => {
      requested++;
      next = { id: ++ids, cb };
      return ids;
    },
    cancel: (id: number) => {
      if (next?.id === id) next = null;
    },
    get waiting() {
      return next !== null;
    },
    get requested() {
      return requested;
    },
    flush(now: number) {
      const f = next;
      next = null;
      f?.cb(now);
    },
  };
}

describe("FrameLoop", () => {
  it("asks for frame after frame while the frame wants more, and for none once it sleeps", () => {
    const f = fakeFrames();
    let awake = true;
    const loop = new FrameLoop(() => awake, f.raf, f.cancel);
    loop.wake(0);
    f.flush(0);
    f.flush(16);
    expect(f.waiting).toBe(true);
    awake = false;
    f.flush(32);
    expect(f.waiting).toBe(false);
    expect(loop.sleeping).toBe(true);
  });

  it("starts woken, so a first frame is drawn even when the pet would stand still", () => {
    const f = fakeFrames();
    const woken: boolean[] = [];
    const loop = new FrameLoop((_now, w) => (woken.push(w), w), f.raf, f.cancel);
    loop.wake(0);
    f.flush(0);
    f.flush(WAKE_SEC * 1000);
    expect(woken).toEqual([true, false]);
    expect(f.waiting).toBe(false);
  });

  it("comes back on a wake-up, and tells the frame it was woken for WAKE_SEC", () => {
    const f = fakeFrames();
    const woken: boolean[] = [];
    const loop = new FrameLoop((_now, w) => (woken.push(w), w), f.raf, f.cancel);
    loop.wake(0);
    f.flush(WAKE_SEC * 1000);
    expect(f.waiting).toBe(false);
    loop.wake(5000);
    expect(f.waiting).toBe(true);
    f.flush(5016);
    f.flush(5000 + WAKE_SEC * 1000 - 1);
    f.flush(5000 + WAKE_SEC * 1000);
    expect(woken).toEqual([false, true, true, false]);
    expect(f.waiting).toBe(false);
  });

  it("asks for no second frame when woken while it is running", () => {
    const f = fakeFrames();
    const loop = new FrameLoop(() => true, f.raf, f.cancel);
    loop.wake(0);
    loop.wake(5);
    expect(f.requested).toBe(1);
  });

  it("stays stopped: no frame after stop(), and wake-ups do nothing", () => {
    const f = fakeFrames();
    let frames = 0;
    const loop = new FrameLoop(() => (frames++, true), f.raf, f.cancel);
    loop.wake(0);
    loop.stop();
    expect(f.waiting).toBe(false);
    loop.wake(0);
    f.flush(16);
    expect(frames).toBe(0);
  });
});
