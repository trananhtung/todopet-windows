import { beforeAll, describe, expect, it } from "vitest";

// Read the stylesheet from disk (Vitest stubs CSS imports, `?raw` included). The project has no Node
// typings, so the module is typed by hand.
let css = "";
let petLifeCss = "";
beforeAll(async () => {
  const fs = (await import(/* @vite-ignore */ `node:${"fs"}`)) as { readFileSync(path: URL, encoding: "utf8"): string };
  css = fs.readFileSync(new URL("./overlay.css", import.meta.url), "utf8");
  petLifeCss = fs.readFileSync(new URL("./pet-life.css", import.meta.url), "utf8");
});

/** The declarations of the first rule whose selector is exactly `selector` (in `source`, the overlay's stylesheet unless told otherwise). */
function rule(selector: string, source: () => string = () => css): Record<string, string> {
  const re = new RegExp(`(^|\\n)${selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\{([^}]*)\\}`);
  const m = source().match(re);
  if (!m) throw new Error(`no rule for ${selector}`);
  return Object.fromEntries(
    m[2]
      .split(";")
      .map((d) => d.trim())
      .filter(Boolean)
      .map((d) => [d.slice(0, d.indexOf(":")).trim(), d.slice(d.indexOf(":") + 1).trim()]),
  );
}

describe("overlay.css", () => {
  // Regression (iteration 1): `.sign` had `bottom: 18px` while the frame loop sets `top` from its
  // measured height every frame; with both set the box stretched by ~8 px per frame into a giant slab.
  it("lets the frame loop own the parade sign's vertical position", () => {
    const sign = rule(".sign");
    expect(sign.position).toBe("absolute");
    expect(sign.bottom ?? "auto").toBe("auto");
    expect(sign.height ?? "auto").toBe("auto");
  });

  // Regression (v0.4 evaluation, issue 14): the pet's box reaches 9 px below the stage, so focusing it by clicking scrolled
  // the stage (`overflow: hidden` can still be scrolled by focus) and lifted the board 9 px: its top corners were cut.
  it("never lets the stage scroll, whatever takes the focus", () => {
    const stage = rule(".stage");
    expect(stage.overflow).toBe("clip");
    expect(css).toMatch(/\.stage \{[^}]*overflow: hidden;[^}]*overflow: clip;/);
  });

  it("keeps popovers out of the board's scroll area", () => {
    expect(rule(".popover").position).toBe("fixed");
  });

  // Regression (v0.4): a long meeting title in the "Start when…" menu pushed the text past the popover and squeezed
  // the first item's icon to nothing. The popover is portaled to <body>, so `.board .icon { flex: none }` does not
  // reach it: the menu has to keep its own icons from shrinking, and let the label give way with an ellipsis.
  it("lets a long menu label end in an ellipsis and keeps the menu's icons from shrinking", () => {
    const label = rule(".popover.menu .menu-label");
    expect(label.overflow).toBe("hidden");
    expect(label["text-overflow"]).toBe("ellipsis");
    expect(label["white-space"]).toBe("nowrap");
    expect(label["min-width"]).toBe("0");
    expect(rule(".popover.menu .icon").flex).toBe("none");
    expect(rule(".popover.menu button")["min-width"]).toBe("0");
  });

  // v0.4 evaluation round 2, issue 7: the five hover icons were drawn over the plan chip and cut a title in two ("Plan the next s").
  it("fades a row's title and chips out before the hover icons start, and doesn't reserve their width", () => {
    const body = rule(".t-body");
    expect(body["mask-image"]).toContain("var(--under-actions)");
    expect(body["--under-actions"]).toBe("0px");
    // At rest nothing is masked: both lengths are 0, so the gradient is black to the edge of the box.
    expect(body["--under-fade"]).toBe("0px");
    expect(body["mask-image"]).toContain("#000 calc(100% - var(--under-actions) - var(--under-fade))");
    // The icons are five 28 px buttons 4 px from the edge of a row with 10 px of padding: 134 px of the body are under them.
    expect(css).toMatch(/\.task:hover \.t-body,[^{]*\{\s*--under-actions: 134px;\s*--under-fade: 24px;/);
    // Nothing moves on hover, so a title never re-wraps under the pointer.
    expect(rule(".t-actions").position).toBe("absolute");
  });

  // v0.4 evaluation round 2, issue 8: a banner, the timeline and the lighten band left one task row on a 1024x700 screen.
  it("folds the timeline away while the day is lightened", () => {
    expect(rule(".daystrip.is-lighten .ds-fold")["grid-template-rows"]).toBe("0fr");
    expect(rule(".daystrip.is-lighten .ds-fold").visibility).toBe("hidden");
    expect(rule(".ds-body").overflow).toBe("hidden");
  });

  // v0.6 review: at 1366 x 768 in English the demo panel's right column of buttons stuck out of the panel by 8 px. Two
  // `1fr` columns cannot be narrower than their widest button ("Meeting soon", "Next morning"), so the grid has to
  // let the columns shrink, the buttons wrap instead of overflowing, and the panel be wide enough for most labels in one line.
  it("keeps the demo panel's buttons inside the panel: shrinkable columns, wrapping labels", () => {
    expect(rule(".demo-panel .grid")["grid-template-columns"]).toBe("repeat(2, minmax(0, 1fr))");
    const btn = rule(".demo-panel .btn");
    expect(btn["white-space"]).toBe("normal");
    expect(btn["min-width"]).toBe("0");
    expect(btn["overflow-wrap"]).toBe("anywhere");
    expect(parseInt(rule(".demo-panel").width, 10)).toBeGreaterThanOrEqual(252);
  });

  // v0.6 evaluation, issue 2: the visitor's label was one line with `overflow: hidden; text-overflow: ellipsis` over all of it, so a name of 12
  // characters or more pushed "dropped by! 🔥 buddy streak 3" out of sight. Only the name may give way now.
  it("lets only the visitor's name give way, never its streak", () => {
    const label = rule(".visitor-label", () => petLifeCss);
    expect(label.overflow ?? "visible").toBe("visible");
    expect(label["text-overflow"]).toBeUndefined();
    expect(label.display).toBe("flex");
    expect(label["flex-direction"]).toBe("column");
    expect(parseInt(label["max-width"], 10)).toBeLessThanOrEqual(280);
    const name = rule(".visitor-label .vl-who bdi", () => petLifeCss);
    expect(name.overflow).toBe("hidden");
    expect(name["text-overflow"]).toBe("ellipsis");
    expect(name["white-space"]).toBe("nowrap");
    expect(name["min-width"]).toBe("0");
    const tail = rule(".visitor-label .vl-tail", () => petLifeCss);
    expect(tail.flex).toBe("none");
    expect(tail["white-space"]).toBe("nowrap");
    expect(tail.overflow ?? "visible").toBe("visible");
    // The tag and the look-alike species keep their place beside a name that is cut.
    const marks = rule(".visitor-label .vl-who .friend-lookalike,\n.visitor-label .vl-who .friend-tag", () => petLifeCss);
    expect(marks.flex).toBe("none");
  });
});
