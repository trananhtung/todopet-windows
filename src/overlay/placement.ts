// Where the task board opens. Pure, so it can be unit-tested and re-run on every resize.
//
// The pet stands on the taskbar, so a board stacked above it loses the pet's height (~150 px) of the
// screen. When there is room, the board opens beside the pet instead, bottom-aligned with the ground
// like a Windows 11 flyout: that keeps the pet in view and gives the task list the full height.

export interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export type BoardSide = "left" | "right" | "above";

export interface BoardPlacement extends Rect {
  side: BoardSide;
  /** Distance from the stage's bottom edge to the board's bottom edge: the board grows upward from here. */
  bottom: number;
}

export interface PlacementInput {
  /** Overlay size in CSS px; the ground (top of the taskbar) is at `stageHeight`. */
  stageWidth: number;
  stageHeight: number;
  /** Pet center x and rendered size. */
  petX: number;
  petSize: number;
  /** Highest point of the pet (head, or the focus badge above it), in stage px. */
  headTop: number;
  /** Things the board must not cover, such as the demo controls panel. */
  avoid?: Rect[];
  margin?: number;
  /** Room kept above a board that is as tall as the screen allows (more than `margin`: it should not sit flush to the top). */
  topMargin?: number;
  maxWidth?: number;
  minWidth?: number;
  maxHeight?: number;
  minHeight?: number;
}

const overlaps = (a: Rect, b: Rect) =>
  a.left < b.left + b.width && b.left < a.left + a.width && a.top < b.top + b.height && b.top < a.top + a.height;

/** Ways to move or shrink `c` off `a`, keeping its anchored edges (bottom for side boards). */
function dodge(c: BoardPlacement, a: Rect, i: Required<Omit<PlacementInput, "avoid">>): BoardPlacement[] {
  const m = i.margin;
  const out: BoardPlacement[] = [];
  const bottom = c.top + c.height;
  // Start below it.
  const top = a.top + a.height + m;
  if (top < bottom) out.push({ ...c, top, height: bottom - top });
  // Start right of it (keeping the right edge, so a side board never slides onto the pet).
  const left = a.left + a.width + m;
  const right = c.left + c.width;
  if (c.side === "above") {
    if (left + c.width <= i.stageWidth - m) out.push({ ...c, left });
    else if (right - left > 0) out.push({ ...c, left, width: right - left });
  } else if (right - left > 0) {
    out.push({ ...c, left, width: right - left });
  }
  // Or end left of it.
  const end = a.left - m;
  if (end - c.left > 0 && c.side !== "right") out.push({ ...c, width: Math.min(c.width, end - c.left) });
  return out;
}

export function placeBoard(input: PlacementInput): BoardPlacement {
  const i = {
    margin: 8,
    topMargin: 16,
    maxWidth: 404,
    minWidth: 372,
    maxHeight: 660,
    minHeight: 300,
    ...input,
  };
  const { stageWidth: W, stageHeight: H, petX, petSize, margin: m } = i;
  const ground = H - m;
  const half = petSize * 0.42;
  const tall = Math.max(0, Math.min(i.maxHeight, H - m - i.topMargin));

  const candidates: BoardPlacement[] = [];
  {
    const left = petX + half + m;
    const width = Math.min(i.maxWidth, W - m - left);
    candidates.push({ side: "right", left, top: ground - tall, width, height: tall, bottom: m });
  }
  {
    const right = petX - half - m;
    const width = Math.min(i.maxWidth, right - m);
    candidates.push({ side: "left", left: right - width, top: ground - tall, width, height: tall, bottom: m });
  }
  {
    const width = Math.min(i.maxWidth, W - 2 * m);
    const height = Math.min(i.maxHeight, i.headTop - 2 * m);
    const left = Math.min(Math.max(petX - width / 2, m), W - width - m);
    candidates.push({ side: "above", left, top: i.headTop - m - height, width, height, bottom: H - i.headTop + m });
  }

  // Dodge every rect to avoid; keep each candidate's best surviving variant.
  const fits = (c: BoardPlacement) => c.width >= i.minWidth && c.height >= i.minHeight;
  const area = (c: BoardPlacement) => c.width * 0.25 + c.height;
  let options = candidates;
  for (const a of i.avoid ?? []) {
    options = options.flatMap((c) => (overlaps(c, a) ? dodge(c, a, i) : [c]));
  }
  const usable = options.filter((c) => fits(c) && !(i.avoid ?? []).some((a) => overlaps(c, a)));

  if (usable.length === 0) {
    // Nothing fits (a tiny screen): the biggest board that stays on screen, above the pet.
    const width = Math.min(i.maxWidth, W - 2 * m);
    const height = Math.max(0, Math.min(i.maxHeight, H - 2 * m));
    const left = Math.min(Math.max(petX - width / 2, m), W - width - m);
    return { side: "above", left: Math.max(m, left), top: m, width, height, bottom: Math.max(0, H - m - height) };
  }
  // Tallest wins (that is what shows tasks); ties go to the side facing the middle of the screen.
  const towardCenter: BoardSide = petX > W / 2 ? "left" : "right";
  usable.sort((a, b) => {
    const d = area(b) - area(a);
    if (Math.abs(d) > 12) return d;
    return (a.side === towardCenter ? 0 : a.side === "above" ? 2 : 1) - (b.side === towardCenter ? 0 : b.side === "above" ? 2 : 1);
  });
  const best = usable[0];
  const top = Math.round(best.top);
  const height = Math.round(best.height);
  return { ...best, left: Math.round(best.left), top, width: Math.round(best.width), height, bottom: H - (top + height) };
}

/**
 * Where a popover goes next to `anchor`: below it, or above when there is more room there. `viewport.bounds` is the
 * board it was opened from (its left edge and width): the popover stays inside it when it can.
 */
export function placePopover(
  anchor: Rect,
  size: { width: number; height: number },
  viewport: { width: number; height: number; bounds?: { left: number; width: number } },
  gap = 4,
  margin = 8,
) {
  const below = viewport.height - (anchor.top + anchor.height) - gap - margin;
  const above = anchor.top - gap - margin;
  const up = size.height > below && above > below;
  let top = up ? anchor.top - gap - size.height : anchor.top + anchor.height + gap;
  top = Math.max(margin, Math.min(top, viewport.height - size.height - margin));
  const lo = Math.max(margin, (viewport.bounds?.left ?? 0) + margin);
  const hi = Math.min(viewport.width, viewport.bounds ? viewport.bounds.left + viewport.bounds.width : viewport.width) - size.width - margin;
  let left = anchor.left + anchor.width - size.width;
  // A board narrower than the popover can't hold it: keep it on screen at least.
  left = hi < lo ? Math.max(margin, Math.min(left, viewport.width - size.width - margin, lo)) : Math.max(lo, Math.min(left, hi));
  return { left: Math.round(left), top: Math.round(top), up };
}
