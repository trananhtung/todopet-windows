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

  // v0.4 evaluation round 2, issue 4: the 16 px top gap applied to the side boards but not to the one above the pet (8 px).
  it("leaves the same room above a board that opens above the pet", () => {
    const panel = { left: 14, top: 14, width: 238, height: 236 };
    // The pet in the middle of a 1024 px screen: the demo panel takes the left side and there is no room on the right.
    const p = placeBoard({ stageWidth: 1024, stageHeight: 652, petX: 620, petSize: PET, headTop: head(652), avoid: [panel] });
    expect(p.side).toBe("above");
    expect(p.top).toBeGreaterThanOrEqual(16);
    expect(p.top + p.height).toBeLessThanOrEqual(head(652) - 8);
    expect(p.bottom).toBe(652 - (p.top + p.height));
    expect(p.height).toBeGreaterThanOrEqual(300);
    expect(overlaps(p, petBox(620, 652))).toBe(false);
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
  // v0.6 evaluation, issue 8: in the "above" placement the board ends at y=521 on a 700 px screen, and the question under the lowest
  // button hung out over the footer and the pet's head, because only the stage's edge was the limit.
  describe("inside the board it was opened from, from top to bottom (v0.6 evaluation, issue 8)", () => {
    const board = { left: 497, width: 402, top: 16, height: 505 };
    const size = { width: 264, height: 181 };
    const inBoard = (p: { top: number }) => {
      expect(p.top).toBeGreaterThanOrEqual(board.top + 8);
      expect(p.top + size.height).toBeLessThanOrEqual(board.top + board.height - 8);
    };

    it("goes above a button near the bottom of the board, not below it over the footer", () => {
      const p = placePopover({ left: 636, top: 440, width: 160, height: 26 }, size, { ...vp, bounds: board });
      expect(p.up).toBe(true);
      inBoard(p);
      // The old limit was the screen: there was room for it below the board.
      const old = placePopover({ left: 636, top: 440, width: 160, height: 26 }, size, { ...vp, bounds: { left: board.left, width: board.width } });
      expect(old.up).toBe(false);
      expect(old.top + size.height).toBeGreaterThan(board.top + board.height);
    });

    it("drops below a button near the top of the board, and below one with room", () => {
      const high = placePopover({ left: 636, top: 60, width: 160, height: 26 }, size, { ...vp, bounds: board });
      expect(high.up).toBe(false);
      inBoard(high);
      expect(high.top).toBe(90);
    });

    it("stays inside even when the button has scrolled out of the board, or the board is shorter than the popover", () => {
      inBoard(placePopover({ left: 636, top: 5, width: 160, height: 26 }, size, { ...vp, bounds: board }));
      inBoard(placePopover({ left: 636, top: 900, width: 160, height: 26 }, size, { ...vp, bounds: board }));
      const short = placePopover({ left: 636, top: 100, width: 160, height: 26 }, size, { ...vp, bounds: { ...board, height: 120 } });
      expect(short.top).toBe(board.top + 8);
    });

    it("is the same as before for a board with no vertical size given", () => {
      const a = placePopover({ left: 636, top: 200, width: 160, height: 26 }, size, { ...vp, bounds: { left: board.left, width: board.width } });
      const b = placePopover({ left: 636, top: 200, width: 160, height: 26 }, size, vp);
      expect(a.top).toBe(b.top);
    });
  });
});
