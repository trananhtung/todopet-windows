import { describe, expect, it } from "vitest";
import { decodeBase64Url, encodeBase64Url, utf8Bytes } from "./b64";

describe("base64url without padding", () => {
  it("round-trips bytes of every length, in the URL alphabet only", () => {
    for (let len = 0; len < 70; len++) {
      const bytes = Uint8Array.from({ length: len }, (_, i) => (i * 37 + len * 11) % 256);
      const text = encodeBase64Url(bytes);
      expect(text).toMatch(/^[A-Za-z0-9_-]*$/);
      expect(decodeBase64Url(text)).toEqual(bytes);
    }
    expect(encodeBase64Url(Uint8Array.from([0xfb, 0xff, 0xfe]))).toBe("-__-");
  });

  it("matches the RFC 4648 vectors (without the padding)", () => {
    const enc = (s: string) => encodeBase64Url(utf8Bytes(s));
    expect([enc(""), enc("f"), enc("fo"), enc("foo"), enc("foob"), enc("fooba"), enc("foobar")]).toEqual(["", "Zg", "Zm8", "Zm9v", "Zm9vYg", "Zm9vYmE", "Zm9vYmFy"]);
  });

  it("refuses padding, the standard alphabet, spaces, a lone leftover character and non-ASCII", () => {
    for (const bad of ["Zg==", "Zm8=", "+/+/", "ab/c", "ab cd", "ab\ncd", "A", "AAAAA", "é", "ＡＢＣＤ", "AB.C"]) expect(decodeBase64Url(bad), bad).toBeNull();
  });

  it("refuses the same bytes written another way (non-zero leftover bits)", () => {
    // "Zg" is 0x66; "Zh", "Zi"… carry leftover bits that a canonical encoder never sets.
    expect(decodeBase64Url("Zg")).toEqual(Uint8Array.from([0x66]));
    for (const alt of ["Zh", "Zi", "Zj", "Zk"]) expect(decodeBase64Url(alt), alt).toBeNull();
    expect(decodeBase64Url("Zm9")).toBeNull();
    expect(decodeBase64Url("Zm8")).toEqual(Uint8Array.from([0x66, 0x6f]));
  });

  it("encodes text as UTF-8, whole characters and emoji included", () => {
    expect(Array.from(utf8Bytes("Bạn 🐱"))).toEqual([66, 225, 186, 161, 110, 32, 240, 159, 144, 177]);
  });
});
