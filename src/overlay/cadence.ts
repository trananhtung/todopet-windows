// How often the overlay draws the pet: at full rate, slowly, or not at all until something wakes it.
// Pure, so the rules can be unit-tested; the frame loop in App.tsx asks it on every frame.

/** Seconds between frames: ~30 fps normally, ~10 fps while asleep or calm. */
export const FAST = 1 / 32;
export const SLOW = 1 / 10;
/** Frames keep coming this long (s) after a wake-up: a change in the brain, the cursor near the pet, a click. */
export const WAKE_SEC = 1;

export interface CadenceInput {
  /** The screen is locked or the display is off: nobody can see the pet. */
  unseen: boolean;
  /** The pet is not drawn: hidden (by the user or a full-screen app) or away on a trip. */
  hidden: boolean;
  /** Windows' battery saver is on. */
  saver: boolean;
  /** Held, a stunt, an act or petting: the user is watching it, so it plays at full rate. */
  lively: boolean;
  /** Walking, falling or celebrating: on battery saver it finishes before the pet stands still. */
  moving: boolean;
  /** Asleep, or calm (typing, in the zone, in a meeting). */
  calm: boolean;
  /** A wake-up asked for frames (see `WAKE_SEC`). */
  woken: boolean;
}

/** Seconds between frames, or null when the loop should stop until something wakes it. */
export function frameInterval(i: CadenceInput): number | null {
  // Nothing of the pet shows, but an urgent bubble or the trip sign may still need placing (and if Windows wrongly
  // says nobody is at the screen, the reminders still show).
  if (i.unseen || i.hidden) return i.woken ? SLOW : null;
  if (i.saver && !i.lively && !i.moving) return i.woken ? SLOW : null;
  return i.lively ? FAST : i.calm ? SLOW : FAST;
}

/**
 * Animation frames for the overlay: one after another while `frame` returns true, none once it returns false
 * (the loop sleeps and costs nothing), and again after `wake()`. `frame` gets the frame time (ms) and whether a
 * wake-up from the last `WAKE_SEC` asked for it. The first `wake()` starts it, so its first frames are always drawn.
 */
export class FrameLoop {
  private id: number | null = null;
  private wokenUntil = -Infinity;
  private stopped = false;

  constructor(
    private readonly frame: (now: number, woken: boolean) => boolean,
    private readonly raf: (cb: (now: number) => void) => number = (cb) => requestAnimationFrame(cb),
    private readonly cancel: (id: number) => void = (id) => cancelAnimationFrame(id),
  ) {}

  /** Something changed: frames for at least `WAKE_SEC` from `now` (ms, the frame clock). */
  wake(now: number): void {
    this.wokenUntil = Math.max(this.wokenUntil, now + WAKE_SEC * 1000);
    this.request();
  }

  stop(): void {
    this.stopped = true;
    if (this.id !== null) this.cancel(this.id);
    this.id = null;
  }

  get sleeping(): boolean {
    return this.id === null;
  }

  private request(): void {
    if (this.id === null && !this.stopped) this.id = this.raf(this.run);
  }

  private readonly run = (now: number): void => {
    this.id = null;
    if (this.frame(now, now < this.wokenUntil)) this.request();
  };
}
