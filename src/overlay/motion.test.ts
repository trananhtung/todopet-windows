import { describe, expect, it } from "vitest";
import { PetMotion, type MotionInput } from "./motion";

const input = (patch: Partial<MotionInput> = {}): MotionInput => ({
  width: 1200,
  height: 700,
  size: 150,
  mood: "normal",
  gait: "bounce",
  calm: false,
  hovered: false,
  cursor: null,
  chase: true,
  focusing: false,
  antic: null,
  ...patch,
});

const run = (m: PetMotion, seconds: number, i: MotionInput) => {
  for (let t = 0; t < seconds; t += 1 / 30) m.step(1 / 30, i);
};

describe("PetMotion", () => {
  it("wanders along the ground and stays on screen", () => {
    let r = 0;
    const m = new PetMotion(600, 700, () => ((r = (r + 0.37) % 1), r));
    const xs = new Set<number>();
    for (let i = 0; i < 60 * 30; i++) {
      m.step(1 / 30, input());
      xs.add(Math.round(m.s.x));
      expect(m.s.y).toBe(700);
      expect(m.s.x).toBeGreaterThanOrEqual(60);
      expect(m.s.x).toBeLessThanOrEqual(1140);
    }
    expect(xs.size).toBeGreaterThan(50);
  });

  it("keeps still while calm, hovered or sleeping", () => {
    const m = new PetMotion(600, 700, () => 0);
    for (const patch of [{ calm: true }, { hovered: true }, { mood: "sleeping" as const }]) {
      run(m, 20, input(patch));
      expect(m.s.walking).toBe(false);
      expect(m.s.x).toBe(600);
    }
  });

  it("falls back down after a drag", () => {
    const m = new PetMotion(600, 700);
    m.grab(600, 650);
    m.drag(300, 200);
    m.step(1 / 30, input());
    expect(m.s.held).toBe(true);
    expect(m.s.y).toBe(250);
    m.release();
    run(m, 2, input({ calm: true }));
    expect(m.s.y).toBe(700);
    expect(m.s.x).toBe(300);
  });

  it("marches to the cursor when grumpy and to the corner when focusing", () => {
    const m = new PetMotion(600, 700);
    run(m, 15, input({ mood: "angry", cursor: { x: 200, y: 300 } }));
    expect(Math.abs(m.s.x - 200)).toBeLessThan(60);
    expect(m.s.facing).toBe(-1);
    run(m, 40, input({ focusing: true }));
    expect(m.s.x).toBeGreaterThan(1050);
  });

  it("parades to the far edge and leaps into the middle for a table flip", () => {
    const m = new PetMotion(300, 700);
    run(m, 30, input({ antic: "parade" }));
    expect(m.s.paradeDone).toBe(true);
    expect(m.s.x).toBeGreaterThan(1100);
    run(m, 3, input({ antic: "block" }));
    expect(Math.abs(m.s.x - 600)).toBeLessThan(5);
    expect(m.s.scale).toBeGreaterThan(2);
    run(m, 3, input({ antic: null, calm: true }));
    expect(m.s.y).toBe(700);
    expect(m.s.scale).toBe(1);
  });
});
