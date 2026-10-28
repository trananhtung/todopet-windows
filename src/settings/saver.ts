// Saves preferences as they change (no Save button): text and numbers after a short pause, switches at once.
// Saves run one after another, and each one tells the other windows what changed.
import type { BusEvent } from "../backend/types";
import type { Prefs } from "../core/prefs";
import { changedEvents } from "./model";

export type SaveState = "idle" | "pending" | "saving" | "saved" | "error";

export interface PrefsSaverDeps {
  save(prefs: Prefs): Promise<void>;
  emit(e: BusEvent): Promise<void>;
  onState?(state: SaveState): void;
  /** Debounce for text fields, in ms (default 300). */
  delay?: number;
}

const same = (a: Prefs, b: Prefs) => JSON.stringify(a) === JSON.stringify(b);

export class PrefsSaver {
  private saved: Prefs;
  private next: Prefs | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private running = 0;
  private chain: Promise<void> = Promise.resolve();

  constructor(
    initial: Prefs,
    private readonly deps: PrefsSaverDeps,
  ) {
    this.saved = initial;
  }

  /** The prefs as last written (or loaded). */
  get lastSaved(): Prefs {
    return this.saved;
  }

  /** A change is waiting for its debounce or still being written. */
  get busy(): boolean {
    return this.timer !== null || this.next !== null || this.running > 0;
  }

  /** Queues `prefs` to be saved, after the debounce or right away. */
  push(prefs: Prefs, debounce: boolean): void {
    this.next = prefs;
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
    if (!debounce) {
      void this.flush();
      return;
    }
    this.deps.onState?.("pending");
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.flush();
    }, this.deps.delay ?? 300);
  }

  /** Writes whatever is queued now; resolves when every save so far has finished. */
  flush(): Promise<void> {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
    const prefs = this.next;
    this.next = null;
    if (prefs) {
      this.running++;
      this.chain = this.chain.then(() => this.write(prefs)).finally(() => this.running--);
    }
    return this.chain;
  }

  /** Another window saved new prefs: adopt them as the saved state (only call when not busy). */
  reset(prefs: Prefs): void {
    this.saved = prefs;
  }

  private async write(prefs: Prefs): Promise<void> {
    const prev = this.saved;
    // Nothing newer waiting: the status can say "saved" once this write is done.
    const settled = () => this.timer === null && this.next === null;
    if (same(prev, prefs)) {
      if (settled()) this.deps.onState?.("saved");
      return;
    }
    this.deps.onState?.("saving");
    try {
      await this.deps.save(prefs);
      this.saved = prefs;
      for (const e of changedEvents(prev, prefs)) await this.deps.emit(e).catch(() => undefined);
      if (settled()) this.deps.onState?.("saved");
    } catch {
      this.deps.onState?.("error");
    }
  }
}
