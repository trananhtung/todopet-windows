import { beforeAll, describe, expect, it } from "vitest";

// Read the stylesheet from disk (Vitest stubs CSS imports). The project has no Node typings, so the module is typed by hand.
let css = "";
beforeAll(async () => {
  const fs = (await import(/* @vite-ignore */ `node:${"fs"}`)) as { readFileSync(path: URL, encoding: "utf8"): string };
  css = fs.readFileSync(new URL("./settings.css", import.meta.url), "utf8");
});

describe("settings.css", () => {
  // v0.7: the release notes are plain text from outside; their line breaks matter and a long word must not widen the page.
  it("keeps the release notes' line breaks, wraps long words and scrolls rather than growing the page", () => {
    const rule = css.match(/\n\.update-notes \{([^}]*)\}/)?.[1] ?? "";
    expect(rule).toMatch(/white-space:\s*pre-wrap/);
    expect(rule).toMatch(/overflow-wrap:\s*anywhere/);
    expect(rule).toMatch(/max-height:\s*\d+px/);
    expect(rule).toMatch(/overflow:\s*auto/);
  });

  it("hangs a bullet's second line under its words, and keeps notices that appear after a press below the buttons in plain weight", () => {
    const bullet = css.match(/\n\.update-notes \.note-line\.bullet \{([^}]*)\}/)?.[1] ?? "";
    expect(bullet).toMatch(/padding-left:\s*1\.1em/);
    expect(bullet).toMatch(/text-indent:\s*-1\.1em/);
    expect(css).toMatch(/\.update-after \.notice,\s*\.update-problem \.notice \{[^}]*font-weight:\s*400/);
    expect(css).toMatch(/\.update-actions \.btn\[aria-disabled="true"\]/);
  });
});
