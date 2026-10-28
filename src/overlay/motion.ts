// Where the pet is and what its body is doing, frame by frame (the walking part of PetWindow.swift).
// Pure: the overlay feeds it the elapsed time and the situation; it returns positions.
import type { Gait, Mood } from "../core/types";

export interface MotionInput {
  /** Overlay size in CSS px; the ground (top of the taskbar) is at `height`. */
  width: number;
  height: number;
  /** Rendered pet size in CSS px (the SVG is square). */
  size: number;
  mood: Mood;
  gait: Gait;
  /** Keep still: typing, in the zone, in a meeting. */
  calm: boolean;
  hovered: boolean;
  cursor: { x: number; y: number } | null;
  chase: boolean;
  /** Sit in the corner during a focus session (not during breaks). */
  focusing: boolean;
  antic: "grumble" | "parade" | "block" | null;
}

export interface MotionState {
  /** Feet position: center x, ground-contact y. */
  x: number;
  y: number;
  facing: 1 | -1;
  walking: boolean;
  walkPhase: number;
  held: boolean;
  /** Extra scale for the table-flip stunt. */
  scale: number;
  /** Set once a parade has crossed the screen; the overlay then ends the antic. */
  paradeDone: boolean;
}

const SPEED: Record<Gait, number> = { bounce: 42, hop: 48, waddle: 30, float: 36, scurry: 72 };
/** Pixels per step: one step advances walkPhase by π. */
const STEP: Record<Gait, number> = { bounce: 26, hop: 34, waddle: 16, float: 30, scurry: 14 };
const GRAVITY = 2600;

export class PetMotion {
  readonly s: MotionState;
  private target: number | null = null;
  private pauseLeft = 2;
  private vy = 0;
  private dragOffset = { x: 0, y: 0 };
  private paradeDir: 1 | -1 = 1;
  private lastAntic: MotionInput["antic"] = null;
  private homeBeforeBlock: number | null = null;

  constructor(
    x: number,
    ground: number,
    private readonly random: () => number = Math.random,
  ) {
    this.s = { x, y: ground, facing: 1, walking: false, walkPhase: 0, held: false, scale: 1, paradeDone: false };
  }

  grab(cursorX: number, cursorY: number): void {
    this.s.held = true;
    this.s.walking = false;
    this.target = null;
    this.dragOffset = { x: this.s.x - cursorX, y: this.s.y - cursorY };
  }

  drag(cursorX: number, cursorY: number): void {
    if (!this.s.held) return;
    this.s.x = cursorX + this.dragOffset.x;
    this.s.y = cursorY + this.dragOffset.y;
  }

  release(): void {
    this.s.held = false;
    this.vy = 0;
    this.pauseLeft = 1.5;
  }

  /** Advances the simulation by `dt` seconds. */
  step(dt: number, i: MotionInput): void {
    const s = this.s;
    const ground = i.height;
    const margin = i.size * 0.4;
    dt = Math.min(dt, 0.1);

    if (i.antic !== this.lastAntic) this.onAnticChange(i);
    this.lastAntic = i.antic;

    s.x = Math.min(Math.max(s.x, margin), i.width - margin);
    if (s.held) {
      s.walking = false;
      return;
    }

    // The table flip: leap into the middle of the screen, big.
    if (i.antic === "block") {
      const tx = i.width / 2;
      const ty = i.height * 0.62;
      s.x += (tx - s.x) * Math.min(1, dt * 5);
      s.y += (ty - s.y) * Math.min(1, dt * 5);
      s.scale += (2.2 - s.scale) * Math.min(1, dt * 4);
      s.walking = false;
      s.facing = 1;
      return;
    }
    if (s.scale > 1.001) s.scale += (1 - s.scale) * Math.min(1, dt * 6);
    else s.scale = 1;

    // Falling back to the taskbar after a drag or a stunt.
    if (s.y < ground - 0.5) {
      this.vy += GRAVITY * dt;
      s.y = Math.min(ground, s.y + this.vy * dt);
      s.walking = false;
      if (s.y >= ground) this.vy = 0;
      return;
    }
    s.y = ground;

    if (i.antic === "parade") {
      const edge = this.paradeDir > 0 ? i.width - margin : margin;
      this.walkToward(edge, SPEED[i.gait] * 2.1, dt, i.gait);
      if (Math.abs(edge - s.x) < 4) s.paradeDone = true;
      return;
    }
    if (i.antic === "grumble" || i.hovered || i.mood === "celebrating" || i.mood === "sleeping") {
      s.walking = false;
      return;
    }
    if (i.focusing) {
      this.walkToward(i.width - margin - 30, SPEED[i.gait] * 1.5, dt, i.gait);
      return;
    }
    if (i.calm) {
      s.walking = false;
      return;
    }
    if (i.mood === "angry" && i.chase && i.cursor) {
      const tx = Math.min(Math.max(i.cursor.x, margin), i.width - margin);
      if (Math.abs(tx - s.x) > i.size * 0.35) {
        this.walkToward(tx, SPEED[i.gait] * 2, dt, i.gait);
        return;
      }
      s.walking = false;
      if (Math.abs(i.cursor.x - s.x) > 6) s.facing = i.cursor.x > s.x ? 1 : -1;
      return;
    }

    // Wander: walk somewhere, pause, repeat. Happy pets wander more, annoyed ones mope.
    if (this.target === null) {
      s.walking = false;
      this.pauseLeft -= dt;
      if (this.pauseLeft <= 0) {
        const span = 120 + this.random() * 380;
        const dir = this.random() < 0.5 ? -1 : 1;
        let t = s.x + dir * span;
        if (t < margin || t > i.width - margin) t = s.x - dir * span;
        this.target = Math.min(Math.max(t, margin), i.width - margin);
      }
      return;
    }
    const speed = SPEED[i.gait] * (i.mood === "happy" ? 1.15 : i.mood === "annoyed" ? 0.7 : 1);
    if (this.walkToward(this.target, speed, dt, i.gait)) {
      this.target = null;
      const [lo, hi] = i.mood === "happy" ? [2, 7] : i.mood === "annoyed" ? [8, 20] : [4, 13];
      this.pauseLeft = lo + this.random() * (hi - lo);
    }
  }

  /** Moves toward `tx`; returns true on arrival. */
  private walkToward(tx: number, speed: number, dt: number, gait: Gait): boolean {
    const s = this.s;
    const d = tx - s.x;
    if (Math.abs(d) < 2) {
      s.walking = false;
      return true;
    }
    const dir = d > 0 ? 1 : -1;
    const move = Math.min(Math.abs(d), speed * dt);
    s.x += dir * move;
    s.facing = dir;
    s.walking = true;
    s.walkPhase += (move / STEP[gait]) * Math.PI;
    return false;
  }

  private onAnticChange(i: MotionInput): void {
    const s = this.s;
    s.paradeDone = false;
    if (i.antic === "parade") {
      // March away from the nearer edge so the sign crosses most of the screen.
      this.paradeDir = s.x < i.width / 2 ? 1 : -1;
    }
    if (i.antic === "block") this.homeBeforeBlock = s.x;
    if (this.lastAntic === "block" && i.antic !== "block") {
      this.vy = -300;
      if (this.homeBeforeBlock !== null) this.target = this.homeBeforeBlock;
    }
    this.target = i.antic ? null : this.target;
  }
}
