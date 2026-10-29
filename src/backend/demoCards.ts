// DEMO ONLY: a stand-in for the card key, for the browser demo, `TodoPet.exe --demo` and tests.
//
// THIS IS NOT CRYPTOGRAPHY. A "signature" here is a deterministic scramble of the key's text and the payload, and anyone can
// make one for any key. It exists so that the demo's sample friends can be added through the very same path as a real card
// (parse, verify through the backend, add), and so that the code which checks cards can be tested without Windows. The
// real key pair is Ed25519, kept in Windows Credential Manager and used from Rust (src-tauri/src/cards.rs,
// crates/todopet-core/src/card.rs); nothing in this file ever runs in a release build outside `--demo`.
import { decodeBase64Url, encodeBase64Url, utf8Bytes } from "../core/b64";
import { cardPayload, encodeCard, type PetCard } from "../core/friends";
import { BackendError, type CardsApi } from "./types";

/** Same sizes as the real thing (see `todopet_core::card`). */
const KEY_CHARS = 43;
const SIGNATURE_CHARS = 86;
const MAX_PAYLOAD_BYTES = 2048;

/** xmur3: a string hash that changes completely with any character. */
function hashSeed(text: string): () => number {
  let h = 1779033703 ^ text.length;
  for (let i = 0; i < text.length; i++) {
    h = Math.imul(h ^ text.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return (h ^= h >>> 16) >>> 0;
  };
}

/** `length` bytes that depend on every character of `text`, the same every time. */
function scramble(text: string, length: number): Uint8Array {
  const next = hashSeed(text);
  const out = new Uint8Array(length);
  for (let i = 0; i < length; i++) out[i] = next() & 255;
  return out;
}

/** A public key (43 characters, the real shape) for a label: "me", "mai", "me-2"… Demo only. */
export const demoPublicKey = (label: string): string => encodeBase64Url(scramble(`demo-key:${label}`, 32));

/** What the demo calls the signature of `payload` under `pk` (86 characters, the real shape). Demo only: anyone can compute it. */
export const demoCardSignature = (pk: string, payload: string): string => encodeBase64Url(scramble(`demo-signature:${pk}\n${payload}`, 64));

/** A friend's card text for the demo and tests, "signed" by their demo key. */
export const demoSignedCard = (card: PetCard): string => {
  const payload = cardPayload(card);
  return encodeCard(card, demoCardSignature(card.pk, payload));
};

const invalid = (message: string) => new BackendError({ kind: "invalid", message });

function checkPayload(payload: string): void {
  const bytes = utf8Bytes(payload).length;
  if (bytes === 0) throw invalid("The card is empty");
  if (bytes > MAX_PAYLOAD_BYTES) throw invalid("The card is too long");
}

function checkText(text: string, chars: number, bytes: number, what: string): void {
  if (typeof text !== "string" || text.length !== chars) throw invalid(`The ${what} has the wrong length`);
  const decoded = decodeBase64Url(text);
  if (decoded === null || decoded.length !== bytes) throw invalid(`The ${what} is not base64url`);
}

/** A random seed for one demo load: 12 characters of a-z and 0-9 (from the browser's random source when it has one). Demo only. */
export function freshDemoSeed(): string {
  const bytes = new Uint8Array(12);
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") crypto.getRandomValues(bytes);
  else for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  return Array.from(bytes, (b) => "abcdefghijklmnopqrstuvwxyz0123456789"[b % 36]).join("");
}

export interface DemoCardsOptions {
  /** Which demo identity this is. Without one it is the plain "me" of the tests; every demo load gets a seed of its own (see `rememberedDemoCards`). */
  seed?: string;
  /** How many times the identity has been renewed already ("Make a new card identity"). */
  generation?: number;
  /** Told after each renewal with the new count, so that a page can keep it. */
  onReset?: (generation: number) => void;
}

export function createDemoCards(opts: DemoCardsOptions = {}): CardsApi {
  let generation = Math.max(0, Math.trunc(opts.generation ?? 0));
  const base = opts.seed ? `me-${opts.seed}` : "me";
  const key = () => demoPublicKey(generation === 0 ? base : `${base}-${generation}`);
  return {
    async publicKey() {
      return key();
    },
    async sign(payload) {
      checkPayload(payload);
      return demoCardSignature(key(), payload);
    },
    async verify(pk, payload, sig) {
      checkPayload(payload);
      checkText(pk, KEY_CHARS, 32, "public key");
      checkText(sig, SIGNATURE_CHARS, 64, "signature");
      return sig === demoCardSignature(pk, payload);
    },
    async resetKey() {
      generation += 1;
      opts.onReset?.(generation);
    },
  };
}

/** Where the demo page keeps which identity it is. */
const IDENTITY_KEY = "todopet:demo-card-id";

/** The seed and the renewals as stored, or null for anything that isn't exactly that. */
function readIdentity(raw: string | null): { seed: string; generation: number } | null {
  if (!raw) return null;
  try {
    const x: unknown = JSON.parse(raw);
    if (!x || typeof x !== "object" || Array.isArray(x)) return null;
    const { seed, generation } = x as Record<string, unknown>;
    if (typeof seed !== "string" || !/^[a-z0-9]{8,32}$/.test(seed)) return null;
    if (typeof generation !== "number" || !Number.isInteger(generation) || generation < 0 || generation > 100_000) return null;
    return { seed, generation };
  } catch {
    return null;
  }
}

/**
 * The demo's card key for a page: every fresh load (a browser with nothing stored) gets an identity of its own, from a random
 * seed, so a card copied in one load is a *friend's* card in another; a reload keeps its identity (the seed and the number of
 * renewals are kept in `storage`, which may be missing or refuse: then the identity lasts as long as the page). Demo only.
 */
export function rememberedDemoCards(storage: Pick<Storage, "getItem" | "setItem"> | null): CardsApi {
  let known: { seed: string; generation: number } | null = null;
  try {
    known = readIdentity(storage?.getItem(IDENTITY_KEY) ?? null);
  } catch {
    // Not allowed to read: a fresh identity for this page.
  }
  const seed = known?.seed ?? freshDemoSeed();
  const keep = (generation: number) => {
    try {
      storage?.setItem(IDENTITY_KEY, JSON.stringify({ seed, generation }));
    } catch {
      // Not allowed to write: the identity lasts as long as the page.
    }
  };
  if (!known) keep(0);
  return createDemoCards({ seed, generation: known?.generation ?? 0, onReset: keep });
}
