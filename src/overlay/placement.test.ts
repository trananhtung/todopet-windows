import { describe, expect, it } from "vitest";
import { placeBoard, placePopover, type Rect } from "./placement";

const PET = 150;
// Head top of a 150 px pet standing on the ground (feet at 150/160, head ~12% down the box).
const head = (H: number) => H - PET * (150 / 160) + PET * 0.12;
const inside = (r: Rect, W: number, H: number) => r.left >= 8 && r.top >= 8 && r.left + r.width <= W - 8 && r.top + r.height <= H - 8;
const overlaps = (a: Rect, b: Rect) =>
  a.left < b.left + b.width && b.left < a.left + a.width && a.top < b.top + b.height && b.top < a.top + a.height;
const petBox = (x: number, H: number): Rect => ({ left: x - PET * 0.42, top: H - PET * 0.82, width: PET * 0.84, height: PET * 0.82 });

describe("placeBoard", () => {
  // v0.4 evaluation, issue 14: at 1024x700 the board sat flush to the top edge (its header 10 px from it).
  it("leaves room above the board on a short screen, so it doesn't sit flush to the top", () => {
    const W = 1024;
    const H = 700 - 48; // the demo's fake taskbar
    const p = placeBoard({ stageWidth: W, stageHeight: H, petX: 800, petSize: PET, headTop: head(H) });
    expect(p.side).not.toBe("above");
    expect(p.top).toBeGreaterThanOrEqual(16);
    expect(p.top + p.height).toBe(H - 8);
    expect(p.height).toBeGreaterThanOrEqual(300);
  });

  it("opens beside the pet at full height on a laptop screen", () => {
    const W = 1366;
    const H = 720;
    const p = placeBoard({ stageWidth: W, stageHeight: H, petX: 900, petSize: PET, headTop: head(H) });
    expect(p.side).toBe("left");
    expect(p.height).toBe(660);
    expect(p.top + p.height).toBe(H - 8);
    expect(inside(p, W, H)).toBe(true);
    expect(overlaps(p, petBox(900, H))).toBe(false);
  });

  it("uses the right side when the pet is near the left edge", () => {
    const p = placeBoard({ stageWidth: 1024, stageHeight: 652, petX: 120, petSize: PET, headTop: head(652) });
    expect(p.side).toBe("right");
    expect(inside(p, 1024, 652)).toBe(true);
    expect(overlaps(p, petBox(120, 652))).toBe(false);
  });

  it("never covers the demo panel, even when that costs height", () => {
    const panel = { left: 14, top: 14, width: 238, height: 236 };
    for (const petX of [80, 300, 520, 700, 940]) {
      const p = placeBoard({ stageWidth: 1024, stageHeight: 652, petX, petSize: PET, headTop: head(652), avoid: [panel] });
      expect(overlaps(p, panel), `petX ${petX}`).toBe(false);
      expect(inside(p, 1024, 652), `petX ${petX}`).toBe(true);
      expect(p.height, `petX ${petX}`).toBeGreaterThanOrEqual(300);
    }
  });

  it("stays above the pet's head (and its focus badge) when it opens above", () => {
    // A narrow screen: no room beside the pet.
    const W = 700;
    const H = 652;
    const headTop = H - PET * (150 / 160) - 8;
    const p = placeBoard({ stageWidth: W, stageHeight: H, petX: 350, petSize: PET, headTop });
    expect(p.side).toBe("above");
    expect(p.top + p.height).toBeLessThanOrEqual(headTop - 8);
    expect(inside(p, W, H)).toBe(true);
  });

  it("re-anchors to the new screen size", () => {
    const a = placeBoard({ stageWidth: 1366, stageHeight: 720, petX: 900, petSize: PET, headTop: head(720) });
    const b = placeBoard({ stageWidth: 1024, stageHeight: 652, petX: 900, petSize: PET, headTop: head(652) });
    expect(inside(a, 1366, 720)).toBe(true);
    expect(inside(b, 1024, 652)).toBe(true);
    expect(b.top + b.height).toBe(652 - 8);
  });
});

describe("placePopover", () => {
  const vp = { width: 1024, height: 700 };
  it("drops below the button when there is room", () => {
    const p = placePopover({ left: 600, top: 200, width: 26, height: 26 }, { width: 180, height: 110 }, vp);
    expect(p.up).toBe(false);
    expect(p.top).toBe(230);
    expect(p.left + 180).toBe(626);
  });
  it("flips above the button near the bottom of the screen", () => {
    const p = placePopover({ left: 600, top: 620, width: 26, height: 26 }, { width: 180, height: 110 }, vp);
    expect(p.up).toBe(true);
    expect(p.top + 110).toBeLessThanOrEqual(616);
  });
  it("stays on screen horizontally", () => {
    const p = placePopover({ left: 2, top: 100, width: 26, height: 26 }, { width: 180, height: 110 }, vp);
    expect(p.left).toBe(8);
  });
  // v0.4 evaluation, issue 14: a 288 px pin dialog under a button near the board's left edge hung 28 px out of the board,
  // over the pet's head. Opened from the board it stays inside it.
  it("stays inside the board it was opened from, when it is given one", () => {
    const board = { left: 497, width: 402 };
    const p = placePopover({ left: 636, top: 380, width: 121, height: 26 }, { width: 288, height: 150 }, { ...vp, bounds: board });
    expect(p.left).toBeGreaterThanOrEqual(board.left + 8);
    expect(p.left + 288).toBeLessThanOrEqual(board.left + board.width - 8);
    // Without it, the same dialog hangs out of the board (and the viewport has room for that).
    expect(placePopover({ left: 636, top: 380, width: 121, height: 26 }, { width: 288, height: 150 }, vp).left).toBeLessThan(board.left + 8);
  });
  it("is the same as before when the board is as wide as the screen, and gives up when the board is narrower than the popover", () => {
    const p = placePopover({ left: 600, top: 200, width: 26, height: 26 }, { width: 180, height: 110 }, { ...vp, bounds: { left: 0, width: 1024 } });
    expect(p.left + 180).toBe(626);
    const tight = placePopover({ left: 300, top: 200, width: 26, height: 26 }, { width: 288, height: 110 }, { ...vp, bounds: { left: 280, width: 200 } });
    expect(tight.left).toBe(38); // where it would have gone without a board
  });
});
