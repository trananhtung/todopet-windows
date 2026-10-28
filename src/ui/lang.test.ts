import { describe, expect, it } from "vitest";
import { localeTag, resolveLang } from "./lang";

describe("resolveLang", () => {
  it("prefers the user's choice, then the Windows language", () => {
    expect(resolveLang("en", "vi-VN")).toBe("en");
    expect(resolveLang(null, "vi-VN")).toBe("vi");
    expect(resolveLang(undefined, "en-GB")).toBe("en");
    expect(resolveLang(null, null)).toBe("en");
  });

  it("maps languages to locale tags", () => {
    expect(localeTag("vi")).toBe("vi-VN");
    expect(localeTag("en")).toBe("en-US");
  });
});
