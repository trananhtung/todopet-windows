// What the pet does on top of its mood, moment to moment (docs/research-cute-pets.md §10–16): petting, click
// combos, the shake after being put down, the hello when you come back, idle fidgets, dozing off, rare clumsy
// moments and the curious head tilt.
//
// Pure and deterministic: the overlay feeds it a clock (seconds), the cursor and what the user is doing, and
// reads back `act` / `petting` / `drowsy` / `headTilt` for the pose. Randomness goes through the injected RNG.
import type { Mood } from "../core/types";
import { ACT_DURATION, type PetActKind } from "../pets";

/** Every number the scheduler uses (seconds and CSS px unless noted). */
export const INTERACT = {
  /** Petting: the cursor moves over the pet faster than this (px/s)… */
  petSpeed: 40,
  /** …for this long before it counts… */
  petAfter: 0.3,
  /** …and it stops this long after the strokes stop. */
  petGrace: 0.5,
  /** The squint and lean ease out over this long once petting stops. */
  petFade: 0.25,
  /** Window for measuring the cursor's speed. */
  speedWindow: 0.2,
  /** A gap in the strokes longer than this restarts the 0.3 s count. */
  strokeGap: 0.15,
  /** 3 clicks within 2 s: giggle. 6 within 4 s: dizzy, then a pout. */
  giggleClicks: 3,
  giggleWithin: 2,
  dizzyClicks: 6,
  dizzyWithin: 4,
  /** Rest after a click reaction before the same one can play again. */
  comboCooldown: 10,
  /** No input for this long, then input again: a hello. */
  awayAfter: 300,
  /** Away at least this long: a hop before the wave… */
  hopAfter: 30 * 60,
  /** …and from this long a few hops. */
  hopsAfter: 2 * 3600,
  /** A hello waits this long for the pet to wake up (the brain re-checks the mood every 15 s), then it is dropped. */
  greetWait: 30,
  /** Idle fidgets start after this long without interaction… */
  fidgetQuiet: 15,
  /** …then one every 8–30 s (start to start). */
  fidgetGapMin: 8,
  fidgetGapMax: 30,
  /** Drowsiness ramps from 0 at 3 min of no input to 1 at 5 min; the sleeping mood takes over at 10. */
  drowsyFrom: 180,
  drowsyFull: 300,
  /** While fully drowsy and still awake, another yawn this often. */
  yawnEvery: 120,
  /** Clumsy moments: at most one an hour, none in the first 5 min, about 20 min apart on average once allowed. */
  clumsyEvery: 3600,
  clumsyFirst: 300,
  clumsyMean: 1200,
  /** Head tilt: the cursor rests (moves < 6 px) within 0.9 × size of the head for 0.6 s → 10–15°. */
  tiltRest: 0.6,
  tiltNear: 0.9,
  tiltStill: 6,
  tiltMin: 10,
  tiltMax: 15,
  /** A smaller tilt while being petted or looking at you after a drop. */
  tiltSoft: 8,
  /** Easing time constant: ~95 % of the way in 0.5 s. */
  tiltEase: 0.16,
  /** "Half a beat" before celebrating. */
  ponder: 0.4,
  /** After the put-down shake the pet looks straight at you this long. */
  lookAtUser: 1.4,
  /** A drop that has not landed within this long gets no shake. */
  landWait: 3,
} as const;

/** The idle fidgets and how often each is picked. */
export const FIDGETS: readonly { kind: PetActKind; weight: number }[] = [
  { kind: "lookaround", weight: 0.35 },
  { kind: "sniff", weight: 0.25 },
  { kind: "scratch", weight: 0.2 },
  { kind: "stretch", weight: 0.2 },
];

const isFidget = (k: PetActKind): boolean => FIDGETS.some((f) => f.kind === k);

/** A weighted fidget for the roll `r` (0 ≤ r < 1), never `last` again. */
export function pickFidget(last: PetActKind | null, r: number): PetActKind {
  const pool = FIDGETS.filter((f) => f.kind !== last);
  const total = pool.reduce((a, f) => a + f.weight, 0);
  let x = Math.min(Math.max(r, 0), 0.999999) * total;
  for (const f of pool) {
    x -= f.weight;
    if (x < 0) return f.kind;
  }
  return pool[pool.length - 1].kind;
}

/** The hello for time away (seconds): a wave, a hop and a wave, or a few hops and a wave. Never a sulk. */
export function greetingFor(awaySec: number): PetActKind[] {
  if (awaySec < INTERACT.hopAfter) return ["wave"];
  if (awaySec < INTERACT.hopsAfter) return ["hop", "wave"];
  return ["hop", "hop", "hop", "wave"];
}

/** Where the pet stands: feet center x, ground-contact y, rendered size (the SVG is square). */
export interface PetBox {
  x: number;
  y: number;
  size: number;
}

export interface Point {
  x: number;
  y: number;
}

/** The cursor is over the pet's body (not just its square box). */
export const overPet = (c: Point, p: PetBox): boolean => Math.abs(c.x - p.x) < p.size * 0.34 && c.y > p.y - p.size * 0.8 && c.y < p.y + 4;

/** The cursor is near the pet's head (for the curious tilt). */
export const nearPet = (c: Point, p: PetBox): boolean => Math.hypot(c.x - p.x, c.y - (p.y - p.size * 0.5)) < p.size * INTERACT.tiltNear;

export interface InteractInput {
  /** Monotonic clock in seconds (performance.now() / 1000). */
  now: number;
  pet: PetBox;
  /** Cursor in overlay CSS px, or null when unknown. */
  cursor: Point | null;
  held: boolean;
  /** Feet on the ground (a dropped pet lands before it shakes). */
  grounded: boolean;
  walking: boolean;
  /** Seconds since the last keyboard or mouse input anywhere (GetLastInputInfo). */
  idleSec: number;
  /** A key was pressed recently. */
  typing: boolean;
  /** A focus session is running (not a break). */
  focus: boolean;
  meeting: boolean;
  /** The brain's mood (the scheduler holds nothing while it is "celebrating", except the ponder). */
  mood: Mood;
  /** Walking somewhere on purpose: chasing the cursor, a parade, a stunt. */
  busy: boolean;
  /** Hidden or away on a trip: nothing plays. */
  away: boolean;
}

export interface InteractOutput {
  /** The act for the pose, `t` = seconds since it began. */
  act: { kind: PetActKind; t: number } | null;
  /** Seconds of petting (0 = not petted). */
  petting: number;
  /** 0 … 1 sleepiness. */
  drowsy: number;
  /** Degrees, + toward where the pet faces. */
  headTilt: number;
  /** Look straight out at the user instead of at the cursor. */
  lookAtUser: boolean;
  /** An act is playing: the pet stands still for it. */
  acting: boolean;
  /** Holding the celebration back for the ponder: show the previous mood. */
  pondering: boolean;
  /** A hello is waiting for the pet to wake up. */
  greeting: boolean;
  /** The cursor rests near the pet: it stops to look (and tilts its head once standing). */
  curious: boolean;
}

type Priority = "idle" | "reply";
interface Playing {
  kind: PetActKind;
  start: number;
  end: number;
  priority: Priority;
  /** Look at the user once it ends (the put-down shake). */
  thenLook: boolean;
}

const NEVER = -1e9;
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const smooth = (v: number) => {
  const x = clamp01(v);
  return x * x * (3 - 2 * x);
};

export class PetLife {
  private last: number | null = null;
  private started: number | null = null;
  private ctx: InteractInput | null = null;

  // Cursor trail for the speed (the overlay may feed extra samples between frames).
  private trail: { t: number; x: number; y: number }[] = [];

  private strokeStart: number | null = null;
  private lastStroke = NEVER;
  private petSince: number | null = null;
  private petFadeLeft = 0;

  private clicks: number[] = [];
  private giggleReady = NEVER;
  private dizzyReady = NEVER;
  /** Clicks until then are part of a combo ("pokes"), not requests for the board. */
  private comboUntil = NEVER;

  private playing: Playing | null = null;
  private queue: { kind: PetActKind; priority: Priority; thenLook: boolean }[] = [];
  private ponderUntil = NEVER;

  private lastFidget: PetActKind | null = null;
  private nextFidgetAt = NEVER;
  private quietSince = 0;

  private shakePending: number | null = null;
  private lookUntil = NEVER;

  private awayPeak = 0;
  private greeting: { kinds: PetActKind[]; until: number } | null = null;

  private drowsy = 0;
  private lastYawn = NEVER;
  private lastClumsy = NEVER;

  private tilt = 0;
  private rest: { x: number; y: number; since: number } | null = null;
  private restTilt: number | null = null;

  constructor(private readonly random: () => number = Math.random) {}

  /** Extra cursor samples between frames (the overlay gets ~40 per second); optional. */
  pointer(x: number, y: number, now: number): void {
    const tr = this.trail;
    const prev = tr[tr.length - 1];
    if (prev && prev.x === x && prev.y === y) return;
    tr.push({ t: now, x, y });
    const keepFrom = now - INTERACT.speedWindow - 0.25;
    while (tr.length > 2 && tr[1].t < keepFrom) tr.shift();
    if (tr.length > 64) tr.shift();
  }

  /**
   * A click on the pet. Returns true when it is a "poke" (the third quick click or later, or during a combo's
   * reaction): the overlay then leaves the board alone instead of toggling it on every click.
   */
  click(now: number): boolean {
    const I = INTERACT;
    this.clicks = this.clicks.filter((c) => now - c < I.dizzyWithin);
    this.clicks.push(now);
    this.quietSince = now;
    const inGiggle = this.clicks.filter((c) => now - c < I.giggleWithin).length;
    let poke = inGiggle >= I.giggleClicks || now < this.comboUntil;
    if (!this.canReply()) return poke;
    if (this.clicks.length >= I.dizzyClicks && now >= this.dizzyReady) {
      this.reply(now, ["dizzy", "pout"]);
      const end = now + ACT_DURATION.dizzy + ACT_DURATION.pout;
      this.dizzyReady = this.giggleReady = end + I.comboCooldown;
      this.comboUntil = end;
      this.clicks = [];
      poke = true;
    } else if (inGiggle >= I.giggleClicks && now >= this.giggleReady) {
      this.reply(now, ["giggle"]);
      this.giggleReady = now + ACT_DURATION.giggle + I.comboCooldown;
      // More clicks right after can still turn the giggle into dizziness.
      this.comboUntil = now + I.dizzyWithin;
    }
    return poke;
  }

  /** Picked up: any act stops (the renderer shows the dangling stretch). */
  grab(now: number): void {
    this.playing = null;
    this.queue = [];
    this.shakePending = null;
    this.endPetting(true);
    this.quietSince = now;
  }

  /** Let go: it shakes itself off once it has landed, then looks at you. */
  drop(now: number): void {
    this.shakePending = now;
    this.quietSince = now;
  }

  /** A celebration begins: a 0.4 s ponder first. Returns how long the celebration is held back (0 when skipped). */
  celebrate(now: number): number {
    const c = this.ctx;
    if (c && (c.held || c.away)) return 0;
    this.queue = [];
    this.playing = { kind: "ponder", start: now, end: now + INTERACT.ponder, priority: "reply", thenLook: false };
    this.ponderUntil = now + INTERACT.ponder;
    return INTERACT.ponder;
  }

  step(i: InteractInput): InteractOutput {
    const I = INTERACT;
    const now = i.now;
    const dt = this.last === null ? 0 : Math.min(Math.max(now - this.last, 0), 1);
    this.last = now;
    if (this.started === null) {
      this.started = now;
      this.quietSince = now;
    }
    this.ctx = i;
    if (i.cursor) this.pointer(i.cursor.x, i.cursor.y, now);

    this.trackReturn(i, now);

    if (i.away) {
      this.playing = null;
      this.queue = [];
      this.greeting = null;
      this.shakePending = null;
      this.endPetting(true);
      this.drowsy = 0;
      this.tilt = 0;
      this.rest = null;
      this.quietSince = now;
      return this.output(now);
    }

    const celebrating = i.mood === "celebrating";
    const pondering = now < this.ponderUntil;
    if (i.held || (celebrating && !pondering)) {
      // Nothing plays on top of a dangling or partying pet (the renderer would ignore it anyway).
      this.playing = null;
      this.queue = [];
    }

    // ---- Petting (rule 11) ----
    const over = i.cursor !== null && overPet(i.cursor, i.pet);
    const near = i.cursor !== null && nearPet(i.cursor, i.pet);
    if (over && !i.held && this.speed(now) > I.petSpeed) {
      if (this.strokeStart === null || now - this.lastStroke > I.strokeGap) this.strokeStart = now;
      this.lastStroke = now;
      if (this.petSince === null && now - this.strokeStart >= I.petAfter) {
        this.petSince = now;
        this.petFadeLeft = 0;
      }
    }
    if (this.petSince !== null && (i.held || now - this.lastStroke > I.petGrace)) this.endPetting(i.held);
    this.petFadeLeft = Math.max(0, this.petFadeLeft - dt * (0.4 / I.petFade));

    // ---- Interaction and the never-interrupt rule (rule 16) ----
    const interacting = near || over || i.held || this.petSince !== null;
    const blocked = i.typing || i.focus || i.meeting || celebrating || i.held || i.busy;
    if (interacting || blocked) this.quietSince = now;

    // ---- Act queue ----
    if (this.playing && now >= this.playing.end) {
      const ended = this.playing;
      this.playing = null;
      if (ended.thenLook) this.lookUntil = ended.end + I.lookAtUser;
      const next = this.queue.shift();
      if (next) this.playing = { ...next, start: ended.end, end: ended.end + ACT_DURATION[next.kind] };
      // A breather after a hello, a yawn or a reaction before the next fidget.
      else if (!isFidget(ended.kind)) this.nextFidgetAt = Math.max(this.nextFidgetAt, ended.end + I.fidgetGapMin);
    }

    // ---- Put down (rule 13): shake once landed ----
    if (this.shakePending !== null) {
      if (now - this.shakePending > I.landWait || celebrating) this.shakePending = null;
      else if (i.grounded && !i.held) {
        this.shakePending = null;
        this.play(now, [{ kind: "shake", priority: "reply", thenLook: true }]);
      }
    }

    // ---- Hello (rule 14) ----
    if (this.greeting) {
      if (now > this.greeting.until) this.greeting = null;
      else if (!i.held && !celebrating && !pondering && i.mood !== "sleeping" && this.playing?.priority !== "reply") {
        this.reply(now, this.greeting.kinds);
        this.greeting = null;
      }
    }

    // ---- Drowsiness (rule 15) ----
    const want = i.focus || i.held || celebrating ? 0 : smooth((i.idleSec - I.drowsyFrom) / (I.drowsyFull - I.drowsyFrom));
    this.drowsy = want >= this.drowsy ? want : this.drowsy + (want - this.drowsy) * (1 - Math.exp(-dt / 0.25));
    if (this.drowsy < 0.002) this.drowsy = 0;

    const free = !blocked && !interacting && this.playing === null && i.mood !== "sleeping";
    if (free && this.drowsy >= 0.98 && now - this.lastYawn >= I.yawnEvery) {
      this.lastYawn = now;
      this.play(now, [{ kind: "yawn", priority: "idle", thenLook: false }]);
    }

    // ---- Clumsy moments (rule 16) ----
    if (
      free &&
      this.playing === null &&
      this.drowsy < 0.3 &&
      now - this.started >= I.clumsyFirst &&
      now - this.lastClumsy >= I.clumsyEvery &&
      dt > 0 &&
      this.random() < Math.min(1, dt / I.clumsyMean)
    ) {
      this.lastClumsy = now;
      // A trip fits a walk, a sneeze a pause; now and then the other way round.
      const r = this.random();
      const kind: PetActKind = i.walking ? (r < 0.7 ? "trip" : "sneeze") : r < 0.7 ? "sneeze" : "trip";
      this.play(now, [{ kind, priority: "idle", thenLook: false }]);
    }

    // ---- Idle fidgets (rule 15) ----
    if (free && this.playing === null && !i.walking && this.drowsy < 0.5 && now - this.quietSince >= I.fidgetQuiet && now >= this.nextFidgetAt) {
      const kind = pickFidget(this.lastFidget, this.random());
      this.lastFidget = kind;
      this.nextFidgetAt = now + I.fidgetGapMin + this.random() * (I.fidgetGapMax - I.fidgetGapMin);
      this.play(now, [{ kind, priority: "idle", thenLook: false }]);
    }

    // ---- Head tilt (rule 10): the pet stops for a resting cursor, then tilts its head once it stands ----
    if (!near || i.held || !i.cursor) {
      this.rest = null;
      this.restTilt = null;
    } else if (!this.rest || Math.hypot(i.cursor.x - this.rest.x, i.cursor.y - this.rest.y) > I.tiltStill) {
      this.rest = { x: i.cursor.x, y: i.cursor.y, since: now };
      this.restTilt = null;
    }
    const resting = this.rest !== null && now - this.rest.since >= I.tiltRest;
    if (resting && this.restTilt === null) this.restTilt = I.tiltMin + this.random() * (I.tiltMax - I.tiltMin);
    const target =
      i.held || i.walking || celebrating || i.mood === "sleeping"
        ? 0
        : resting
          ? (this.restTilt ?? I.tiltMin)
          : this.petSince !== null || now < this.lookUntil
            ? I.tiltSoft
            : 0;
    this.tilt += (target - this.tilt) * (1 - Math.exp(-dt / I.tiltEase));
    if (Math.abs(this.tilt) < 0.01) this.tilt = 0;

    return this.output(now);
  }

  private output(now: number): InteractOutput {
    const p = this.playing;
    const act = p && now >= p.start ? { kind: p.kind, t: now - p.start } : null;
    return {
      act,
      petting: this.petSince !== null ? now - this.petSince : this.petFadeLeft,
      drowsy: this.drowsy,
      headTilt: this.tilt,
      lookAtUser: now < this.lookUntil && !this.ctx?.held,
      acting: p !== null,
      pondering: now < this.ponderUntil,
      greeting: this.greeting !== null,
      curious: this.rest !== null && now - this.rest.since >= INTERACT.tiltRest,
    };
  }

  /** Time away: a long stretch without input, then input again, queues a hello sized to the absence. */
  private trackReturn(i: InteractInput, now: number): void {
    if (i.idleSec >= INTERACT.awayAfter) {
      this.awayPeak = Math.max(this.awayPeak, i.idleSec);
    } else if (this.awayPeak > 0) {
      if (!i.away) this.greeting = { kinds: greetingFor(this.awayPeak), until: now + INTERACT.greetWait };
      this.awayPeak = 0;
      this.lastYawn = NEVER;
    }
  }

  /** Cursor speed over the last `speedWindow` seconds (path length / window), px/s. */
  private speed(now: number): number {
    const W = INTERACT.speedWindow;
    const tr = this.trail;
    let path = 0;
    for (let k = tr.length - 1; k > 0; k--) {
      if (tr[k].t < now - W) break;
      path += Math.hypot(tr[k].x - tr[k - 1].x, tr[k].y - tr[k - 1].y);
    }
    return path / W;
  }

  private endPetting(hard: boolean): void {
    if (this.petSince !== null && !hard && this.last !== null) this.petFadeLeft = Math.min(this.last - this.petSince, 0.4);
    else if (hard) this.petFadeLeft = 0;
    this.petSince = null;
    this.strokeStart = null;
  }

  /** Reactions to the user may play now (not while held, partying or pondering). */
  private canReply(): boolean {
    const c = this.ctx;
    if (!c) return true;
    const now = this.last ?? 0;
    return !c.held && !c.away && c.mood !== "celebrating" && now >= this.ponderUntil;
  }

  private reply(now: number, kinds: PetActKind[]): void {
    this.play(
      now,
      kinds.map((kind) => ({ kind, priority: "reply" as const, thenLook: false })),
    );
  }

  /** Starts a sequence now, replacing whatever was playing (and anything queued). */
  private play(now: number, seq: { kind: PetActKind; priority: Priority; thenLook: boolean }[]): void {
    const [first, ...rest] = seq;
    this.playing = { ...first, start: now, end: now + ACT_DURATION[first.kind] };
    this.queue = rest;
  }
}
