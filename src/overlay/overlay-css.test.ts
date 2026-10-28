import { beforeAll, describe, expect, it } from "vitest";

// Read the stylesheet from disk (Vitest stubs CSS imports, `?raw` included). The project has no Node
// typings, so the module is typed by hand.
let css = "";
beforeAll(async () => {
  const fs = (await import(/* @vite-ignore */ `node:${"fs"}`)) as { readFileSync(path: URL, encoding: "utf8"): string };
  css = fs.readFileSync(new URL("./overlay.css", import.meta.url), "utf8");
});

/** The declarations of the first rule whose selector is exactly `selector`. */
function rule(selector: string): Record<string, string> {
  const re = new RegExp(`(^|\\n)${selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\{([^}]*)\\}`);
  const m = css.match(re);
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

  it("keeps popovers out of the board's scroll area", () => {
    expect(rule(".popover").position).toBe("fixed");
  });
});
