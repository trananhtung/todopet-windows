// The demo's stand-in for the card key (see demoCards.ts). It is NOT cryptography; these tests only pin down that it
// behaves like the real thing as far as the app can tell: same sizes, same refusals, same yes or no.
import { describe, expect, it } from "vitest";
import { createDemoCards, demoCardSignature, demoPublicKey, freshDemoSeed, rememberedDemoCards } from "./demoCards";
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

// v0.6 evaluation, issue 10: two fresh demo loads shared one identity, so "paste My card from another load" said "That's your own card!".
describe("the demo's identity", () => {
  /** A bit of storage, like `localStorage`. */
  const fakeStorage = () => {
    const map = new Map<string, string>();
    return {
      map,
      getItem: (k: string) => map.get(k) ?? null,
      setItem: (k: string, v: string) => void map.set(k, v),
    };
  };

  it("gives a seed of its own to each load: a different key every time", async () => {
    const seeds = new Set(Array.from({ length: 50 }, () => freshDemoSeed()));
    expect(seeds.size).toBe(50);
    for (const seed of seeds) expect(seed).toMatch(/^[a-z0-9]{10,}$/);
    const a = createDemoCards({ seed: "load-a" });
    const b = createDemoCards({ seed: "load-b" });
    expect(await a.publicKey()).toMatch(KEY);
    expect(await a.publicKey()).not.toBe(await b.publicKey());
    // Neither is the plain "me" of the tests, and a seed always gives the same key.
    expect(await a.publicKey()).not.toBe(await createDemoCards().publicKey());
    expect(await a.publicKey()).toBe(await createDemoCards({ seed: "load-a" }).publicKey());
  });

  it("makes a card from one load a friend's card in another: it checks out, and it is not mine", async () => {
    const a = createDemoCards({ seed: "load-a" });
    const b = createDemoCards({ seed: "load-b" });
    const sig = await a.sign("payload");
    expect(await b.verify(await a.publicKey(), "payload", sig)).toBe(true);
    expect(await a.publicKey()).not.toBe(await b.publicKey());
  });

  it("goes on from the identity it was told it had reached, and says when it makes a new one", async () => {
    const reached: number[] = [];
    const a = createDemoCards({ seed: "load-a", onReset: (g) => reached.push(g) });
    const first = await a.publicKey();
    await a.resetKey();
    await a.resetKey();
    expect(reached).toEqual([1, 2]);
    const third = await a.publicKey();
    expect(third).not.toBe(first);
    expect(await createDemoCards({ seed: "load-a", generation: 2 }).publicKey()).toBe(third);
    expect(await createDemoCards({ seed: "load-a", generation: 1 }).publicKey()).not.toBe(third);
  });

  it("is remembered by the page: the same identity after a reload, a new one in a fresh browser", async () => {
    const store = fakeStorage();
    const first = await rememberedDemoCards(store).publicKey();
    expect(store.map.size).toBe(1);
    expect(await rememberedDemoCards(store).publicKey()).toBe(first);
    // A new identity (and the one after a reload) is kept too.
    const again = rememberedDemoCards(store);
    await again.resetKey();
    const second = await again.publicKey();
    expect(second).not.toBe(first);
    expect(await rememberedDemoCards(store).publicKey()).toBe(second);
    // Another browser has its own.
    expect(await rememberedDemoCards(fakeStorage()).publicKey()).not.toBe(first);
  });

  it("still has an identity when the page can't store one, or what it stored is rubbish", async () => {
    const none = rememberedDemoCards(null);
    expect(await none.publicKey()).toMatch(KEY);
    const broken = {
      getItem: () => {
        throw new Error("denied");
      },
      setItem: () => {
        throw new Error("denied");
      },
    };
    const k = rememberedDemoCards(broken);
    expect(await k.publicKey()).toMatch(KEY);
    await k.resetKey();
    expect(await k.publicKey()).toMatch(KEY);
    for (const junk of ["", "x", "{}", '{"seed":5}', '{"seed":"a b","generation":1}', '{"seed":"abcdefghijkl","generation":-3}', '{"seed":"abcdefghijkl","generation":1e99}', "[1,2]", "null"]) {
      const store = fakeStorage();
      store.map.set("todopet:demo-card-id", junk);
      expect(await rememberedDemoCards(store).publicKey(), junk).toMatch(KEY);
    }
  });
});
