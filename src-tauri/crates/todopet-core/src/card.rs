//! Pet-card signatures (v0.6 "Friends"). Every install has an Ed25519 key pair; a card is `TODOPET1.<payload>.<signature>`
//! and the payload carries the public key, which is the friend's identity. The signature covers the exact payload bytes
//! (the UTF-8 of the card's JSON), so a card can't be forged or changed on its way, and a newer card from the same key can
//! only come from the same install.
//!
//! Pure functions only: the app crate keeps the 32-byte secret seed in Windows Credential Manager and calls these. Keys
//! and signatures cross the JS boundary as base64url without padding (43 and 86 characters); the seed never does.

use crate::{CmdError, CmdResult};
use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use base64::Engine;
use ed25519_dalek::{Signature, Signer, SigningKey, VerifyingKey};
use rand_core::OsRng;

/// The secret half: a 32-byte seed.
pub const SEED_BYTES: usize = 32;
pub const PUBLIC_KEY_BYTES: usize = 32;
pub const SIGNATURE_BYTES: usize = 64;
/// A public key as text (base64url, no padding).
pub const PUBLIC_KEY_CHARS: usize = 43;
/// A signature as text (base64url, no padding).
pub const SIGNATURE_CHARS: usize = 86;
/// Longest payload signed or verified. A real card's JSON is about 350 bytes; anything bigger is a bug or an attack.
pub const MAX_PAYLOAD_BYTES: usize = 2048;

/// A fresh secret seed from the operating system's secure random source.
pub fn generate_seed() -> [u8; SEED_BYTES] {
    SigningKey::generate(&mut OsRng).to_bytes()
}

/// The seed in `bytes` (what Credential Manager holds), or an error when it isn't exactly 32 bytes.
pub fn seed_from_secret(bytes: &[u8]) -> CmdResult<[u8; SEED_BYTES]> {
    bytes.try_into().map_err(|_| CmdError::internal("The card key on this PC is damaged"))
}

/// The public key of a seed, as base64url.
pub fn public_key(seed: &[u8; SEED_BYTES]) -> String {
    URL_SAFE_NO_PAD.encode(SigningKey::from_bytes(seed).verifying_key().to_bytes())
}

fn check_payload(payload: &str) -> CmdResult<&[u8]> {
    let bytes = payload.as_bytes();
    if bytes.is_empty() {
        return Err(CmdError::invalid("The card is empty"));
    }
    if bytes.len() > MAX_PAYLOAD_BYTES {
        return Err(CmdError::invalid("The card is too long"));
    }
    Ok(bytes)
}

/// Signs the exact UTF-8 bytes of `payload` and returns the signature as base64url. Ed25519 signatures are
/// deterministic: the same payload always gives the same signature.
pub fn sign(seed: &[u8; SEED_BYTES], payload: &str) -> CmdResult<String> {
    let bytes = check_payload(payload)?;
    let sig = SigningKey::from_bytes(seed).sign(bytes);
    Ok(URL_SAFE_NO_PAD.encode(sig.to_bytes()))
}

/// Strict base64url (no padding, no other alphabet, canonical) of exactly `len` bytes.
fn decode_fixed<const N: usize>(text: &str, chars: usize, what: &str) -> CmdResult<[u8; N]> {
    if text.len() != chars {
        return Err(CmdError::invalid(format!("The {what} has the wrong length")));
    }
    let bytes = URL_SAFE_NO_PAD.decode(text).map_err(|_| CmdError::invalid(format!("The {what} is not base64url")))?;
    bytes.try_into().map_err(|_| CmdError::invalid(format!("The {what} has the wrong length")))
}

/// Does `signature` (base64url) sign the exact bytes of `payload` under `public_key` (base64url)? A key or signature that
/// isn't the right size or isn't strict base64url is an error; a well-formed signature that doesn't match is `Ok(false)`.
/// Weak keys (small-order points) are refused by the strict check, which also refuses the malleable signature forms.
pub fn verify(public_key: &str, payload: &str, signature: &str) -> CmdResult<bool> {
    let bytes = check_payload(payload)?;
    let pk: [u8; PUBLIC_KEY_BYTES] = decode_fixed(public_key, PUBLIC_KEY_CHARS, "public key")?;
    let sig: [u8; SIGNATURE_BYTES] = decode_fixed(signature, SIGNATURE_CHARS, "signature")?;
    // A 32-byte string that isn't a point on the curve is a key that signs nothing.
    let Ok(key) = VerifyingKey::from_bytes(&pk) else { return Ok(false) };
    Ok(key.verify_strict(bytes, &Signature::from_bytes(&sig)).is_ok())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ErrorKind;

    fn hex(s: &str) -> Vec<u8> {
        (0..s.len()).step_by(2).map(|i| u8::from_str_radix(&s[i..i + 2], 16).unwrap()).collect()
    }

    /// RFC 8032 section 7.1, TEST 2: the message is the single byte 0x72, `r`.
    const RFC_SEED: &str = "4ccd089b28ff96da9db6c346ec114e0f5b8a319f35aba624da8cf6ed4fb8a6fb";
    const RFC_PUBLIC: &str = "3d4017c3e843895a92b70aa74d1b7ebc9c982ccf2ec4968cc0cd55f12af4660c";
    const RFC_SIGNATURE: &str = "92a009a9f0d4cab8720e820b5f642540a2b27b5416503f8fb3762223ebdb69da085ac1e43e15996e458f3613d0f11d8c387b2eaeb4302aeeb00d291612bb0c00";

    fn rfc_seed() -> [u8; SEED_BYTES] {
        hex(RFC_SEED).try_into().unwrap()
    }

    #[test]
    fn seeds_are_32_random_bytes() {
        let a = generate_seed();
        let b = generate_seed();
        assert_eq!(a.len(), SEED_BYTES);
        assert_ne!(a, b);
        assert_ne!(a, [0u8; SEED_BYTES]);
    }

    #[test]
    fn a_stored_secret_must_be_exactly_a_seed() {
        let seed = generate_seed();
        assert_eq!(seed_from_secret(&seed).unwrap(), seed);
        for len in [0, 1, 31, 33, 64] {
            let err = seed_from_secret(&vec![7u8; len]).unwrap_err();
            assert_eq!(err.kind, ErrorKind::Internal, "{len} bytes");
        }
    }

    #[test]
    fn the_public_key_and_signature_match_the_rfc_8032_vector() {
        let seed = rfc_seed();
        assert_eq!(public_key(&seed), URL_SAFE_NO_PAD.encode(hex(RFC_PUBLIC)));
        assert_eq!(sign(&seed, "r").unwrap(), URL_SAFE_NO_PAD.encode(hex(RFC_SIGNATURE)));
    }

    #[test]
    fn keys_and_signatures_are_unpadded_base64url_of_the_documented_length() {
        let seed = generate_seed();
        let pk = public_key(&seed);
        let sig = sign(&seed, "{\"v\":1}").unwrap();
        assert_eq!(pk.len(), PUBLIC_KEY_CHARS);
        assert_eq!(sig.len(), SIGNATURE_CHARS);
        for text in [&pk, &sig] {
            assert!(text.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_'), "{text}");
        }
    }

    #[test]
    fn signing_is_deterministic() {
        let seed = generate_seed();
        assert_eq!(sign(&seed, "same card").unwrap(), sign(&seed, "same card").unwrap());
        assert_ne!(sign(&seed, "one card").unwrap(), sign(&seed, "another card").unwrap());
    }

    #[test]
    fn a_signature_verifies_for_its_own_key_and_exact_payload() {
        let seed = generate_seed();
        let payload = "{\"v\":1,\"name\":\"Mochi 🐱 Bạn\"}";
        let sig = sign(&seed, payload).unwrap();
        assert!(verify(&public_key(&seed), payload, &sig).unwrap());
    }

    #[test]
    fn the_rfc_vector_verifies() {
        let pk = URL_SAFE_NO_PAD.encode(hex(RFC_PUBLIC));
        let sig = URL_SAFE_NO_PAD.encode(hex(RFC_SIGNATURE));
        assert!(verify(&pk, "r", &sig).unwrap());
        assert!(!verify(&pk, "s", &sig).unwrap());
    }

    #[test]
    fn a_changed_payload_does_not_verify() {
        let seed = generate_seed();
        let pk = public_key(&seed);
        let sig = sign(&seed, "{\"weekDone\":3}").unwrap();
        for changed in
            ["{\"weekDone\":9}", "{\"weekDone\":3} ", " {\"weekDone\":3}", "{\"weekDone\":3}\n", "{\"weekDone\":3", "x"]
        {
            assert!(!verify(&pk, changed, &sig).unwrap(), "{changed:?}");
        }
    }

    #[test]
    fn a_signature_from_another_key_does_not_verify() {
        let (mine, theirs) = (generate_seed(), generate_seed());
        let sig = sign(&theirs, "card").unwrap();
        assert!(!verify(&public_key(&mine), "card", &sig).unwrap());
        assert!(verify(&public_key(&theirs), "card", &sig).unwrap());
    }

    #[test]
    fn a_flipped_signature_bit_does_not_verify() {
        let seed = generate_seed();
        let pk = public_key(&seed);
        let raw = URL_SAFE_NO_PAD.decode(sign(&seed, "card").unwrap()).unwrap();
        for index in [0, 31, 32, 63] {
            let mut bad = raw.clone();
            bad[index] ^= 1;
            assert!(!verify(&pk, "card", &URL_SAFE_NO_PAD.encode(bad)).unwrap(), "byte {index}");
        }
    }

    #[test]
    fn a_weak_key_signs_nothing() {
        // The identity point with the all-zero signature (R = identity, S = 0) satisfies the plain verification equation
        // for every message; the strict check must refuse it.
        let mut identity = [0u8; PUBLIC_KEY_BYTES];
        identity[0] = 1;
        let mut sig = [0u8; SIGNATURE_BYTES];
        sig[0] = 1;
        let (pk, sig) = (URL_SAFE_NO_PAD.encode(identity), URL_SAFE_NO_PAD.encode(sig));
        assert!(!verify(&pk, "anything at all", &sig).unwrap());
    }

    #[test]
    fn a_key_that_is_not_a_curve_point_signs_nothing() {
        // y = 2 has no x on the curve.
        let mut not_a_point = [0u8; PUBLIC_KEY_BYTES];
        not_a_point[0] = 2;
        let seed = generate_seed();
        let sig = sign(&seed, "card").unwrap();
        assert!(!verify(&URL_SAFE_NO_PAD.encode(not_a_point), "card", &sig).unwrap());
    }

    #[test]
    fn verify_refuses_a_key_or_signature_that_is_not_strict_base64url_of_the_right_size() {
        let seed = generate_seed();
        let pk = public_key(&seed);
        let sig = sign(&seed, "card").unwrap();
        assert!(verify(&pk, "card", &sig).unwrap());
        let std_alphabet = |s: &str| s.replace('-', "+").replace('_', "/");
        let flip_last = |s: &str| {
            // The last character of a 43- or 86-character key only holds 4 or 2 bits: a different character with the same
            // leading bits is the same bytes written another way (non-canonical).
            let alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
            let last = s.chars().last().unwrap();
            let at = alphabet.find(last).unwrap();
            let other = alphabet.as_bytes()[at ^ 1] as char;
            format!("{}{}", &s[..s.len() - 1], other)
        };
        let bad_keys = [
            String::new(),
            pk[..42].to_owned(),
            format!("{pk}A"),
            format!("{pk}="),
            format!(" {pk}"),
            format!("{pk}\n"),
            pk.replace(|c: char| c.is_ascii_alphabetic(), "é"),
            flip_last(&pk),
            "A".repeat(44),
        ];
        for bad in &bad_keys {
            assert_eq!(verify(bad, "card", &sig).unwrap_err().kind, ErrorKind::Invalid, "key {bad:?}");
        }
        let bad_sigs = [
            String::new(),
            sig[..85].to_owned(),
            format!("{sig}A"),
            format!("{sig}=="),
            format!("{sig}\n"),
            sig.replace(|c: char| c.is_ascii_alphabetic(), "+"),
            flip_last(&sig),
        ];
        for bad in &bad_sigs {
            assert_eq!(verify(&pk, "card", bad).unwrap_err().kind, ErrorKind::Invalid, "signature {bad:?}");
        }
        // The standard alphabet (+ and /) is not base64url. A key or signature without those characters is the same text in both.
        let (std_pk, std_sig) = (std_alphabet(&pk), std_alphabet(&sig));
        if std_pk != pk {
            assert_eq!(verify(&std_pk, "card", &sig).unwrap_err().kind, ErrorKind::Invalid);
        }
        if std_sig != sig {
            assert_eq!(verify(&pk, "card", &std_sig).unwrap_err().kind, ErrorKind::Invalid);
        }
    }

    #[test]
    fn the_standard_alphabet_is_refused_whatever_the_key() {
        // 0xfb 0xff… encodes with + and / in the standard alphabet, - and _ in base64url.
        let bytes = [0xfbu8; PUBLIC_KEY_BYTES];
        let url = URL_SAFE_NO_PAD.encode(bytes);
        assert!(url.contains('-') || url.contains('_'));
        let standard = url.replace('-', "+").replace('_', "/");
        let sig = URL_SAFE_NO_PAD.encode([0u8; SIGNATURE_BYTES]);
        assert_eq!(verify(&standard, "card", &sig).unwrap_err().kind, ErrorKind::Invalid);
    }

    #[test]
    fn the_payload_must_be_there_and_no_bigger_than_the_cap() {
        let seed = generate_seed();
        let pk = public_key(&seed);
        let sig = sign(&seed, "card").unwrap();
        assert_eq!(sign(&seed, "").unwrap_err().kind, ErrorKind::Invalid);
        assert_eq!(verify(&pk, "", &sig).unwrap_err().kind, ErrorKind::Invalid);
        let biggest = "x".repeat(MAX_PAYLOAD_BYTES);
        let sig = sign(&seed, &biggest).unwrap();
        assert!(verify(&pk, &biggest, &sig).unwrap());
        let too_big = "x".repeat(MAX_PAYLOAD_BYTES + 1);
        assert_eq!(sign(&seed, &too_big).unwrap_err().kind, ErrorKind::Invalid);
        assert_eq!(verify(&pk, &too_big, &sig).unwrap_err().kind, ErrorKind::Invalid);
        // The cap counts bytes, not characters.
        let wide = "é".repeat(MAX_PAYLOAD_BYTES / 2 + 1);
        assert_eq!(sign(&seed, &wide).unwrap_err().kind, ErrorKind::Invalid);
    }
}
