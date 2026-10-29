// The demo's stand-in for the card key (see demoCards.ts). It is NOT cryptography; these tests only pin down that it
// behaves like the real thing as far as the app can tell: same sizes, same refusals, same yes or no.
import { describe, expect, it } from "vitest";
import { createDemoCards, demoCardSignature, demoPublicKey } from "./demoCards";
import { BackendError } from "./types";

const KEY = /^[A-Za-z0-9_-]{43}$/;
const SIG = /^[A-Za-z0-9_-]{86}$/;

const rejects = async (p: Promise<unknown>) => {
  const err = await p.then(
    () => null,
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(BackendError);
  expect((err as BackendError).kind).toBe("invalid");
};

describe("the demo's card key", () => {
  it("makes keys and signatures of the real sizes, the same every time", async () => {
    const cards = createDemoCards();
    const pk = await cards.publicKey();
    expect(pk).toMatch(KEY);
    expect(await cards.publicKey()).toBe(pk);
    const sig = await cards.sign('{"v":1}');
    expect(sig).toMatch(SIG);
    expect(await cards.sign('{"v":1}')).toBe(sig);
    expect(await cards.sign('{"v":2}')).not.toBe(sig);
  });

  it("verifies its own signature, and nothing that was changed", async () => {
    const cards = createDemoCards();
    const pk = await cards.publicKey();
    const sig = await cards.sign("payload");
    expect(await cards.verify(pk, "payload", sig)).toBe(true);
    expect(await cards.verify(pk, "payload ", sig)).toBe(false);
    expect(await cards.verify(pk, "payloaD", sig)).toBe(false);
    expect(await cards.verify(demoPublicKey("someone else"), "payload", sig)).toBe(false);
    const flipped = (sig[0] === "A" ? "B" : "A") + sig.slice(1);
    expect(await cards.verify(pk, "payload", flipped)).toBe(false);
  });

  it("verifies a friend's signature made with their key", async () => {
    const cards = createDemoCards();
    const mai = demoPublicKey("mai");
    expect(mai).toMatch(KEY);
    expect(mai).not.toBe(await cards.publicKey());
    expect(await cards.verify(mai, "card", demoCardSignature(mai, "card"))).toBe(true);
    expect(await cards.verify(mai, "card!", demoCardSignature(mai, "card"))).toBe(false);
  });

  it("refuses what the real one refuses: sizes, base64url, an empty or huge payload", async () => {
    const cards = createDemoCards();
    const pk = await cards.publicKey();
    const sig = await cards.sign("payload");
    await rejects(cards.verify(pk.slice(1), "payload", sig));
    await rejects(cards.verify(`${pk}=`, "payload", sig));
    await rejects(cards.verify(pk.replace(/.$/, "!"), "payload", sig));
    await rejects(cards.verify(pk, "payload", sig.slice(1)));
    await rejects(cards.verify(pk, "payload", `${sig}A`));
    await rejects(cards.verify(pk, "", sig));
    await rejects(cards.verify(pk, "x".repeat(2049), sig));
    await rejects(cards.sign(""));
    await rejects(cards.sign("x".repeat(2049)));
    // The cap counts bytes: 1025 two-byte characters are 2050.
    await rejects(cards.sign("é".repeat(1025)));
    expect(await cards.sign("x".repeat(2048))).toMatch(SIG);
  });

  it("makes a new identity on reset: a different key, and the old signatures are no longer its own", async () => {
    const cards = createDemoCards();
    const before = await cards.publicKey();
    const sig = await cards.sign("payload");
    await cards.resetKey();
    const after = await cards.publicKey();
    expect(after).toMatch(KEY);
    expect(after).not.toBe(before);
    expect(await cards.sign("payload")).not.toBe(sig);
    // Anyone can still check the old card against the old key.
    expect(await cards.verify(before, "payload", sig)).toBe(true);
    await cards.resetKey();
    expect(await cards.publicKey()).not.toBe(after);
  });

  it("gives every label its own key", () => {
    const keys = new Set(["me", "mai", "bin", "a", "b", "c", "d"].map(demoPublicKey));
    expect(keys.size).toBe(7);
    for (const k of keys) expect(k).toMatch(KEY);
  });
});
