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

export function createDemoCards(): CardsApi {
  let generation = 0;
  const key = () => demoPublicKey(generation === 0 ? "me" : `me-${generation}`);
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
    },
  };
}
