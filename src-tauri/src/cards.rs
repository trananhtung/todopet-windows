//! Pet-card signing (v0.6 "Friends"): this install's Ed25519 key, kept in Windows Credential Manager (`keyring`, service
//! `TodoPet`, user `card-key`) as its 32-byte seed and made on first use. Like the other secrets, the secret half never
//! crosses into JavaScript: the web view gets the public key, signatures, and a yes or no from `card_verify`.
//!
//! The commands are in the overlay window's capability alone (`capabilities/overlay.json`): the brain makes and reads cards.
//! The maths is in `todopet_core::card` (unit-tested without Windows).

use crate::{secrets, util};
use std::sync::Mutex;
use todopet_core::{card, CmdResult};

const SERVICE: &str = "TodoPet";
const USER: &str = "card-key";

/// Serializes reading, making and replacing the key, so two first uses never make two keys.
static KEY_LOCK: Mutex<()> = Mutex::new(());

fn entry() -> CmdResult<keyring::Entry> {
    keyring::Entry::new(SERVICE, USER).map_err(secrets::store_error)
}

/// The seed, made and stored when this PC has none yet. A stored value that is not 32 bytes is damaged: it is reported,
/// never replaced behind the user's back (that would change who the friends think you are); "Make a new card identity"
/// replaces it. The caller holds `KEY_LOCK`.
fn seed_blocking() -> CmdResult<[u8; card::SEED_BYTES]> {
    let entry = entry()?;
    match entry.get_secret() {
        Ok(bytes) => card::seed_from_secret(&bytes),
        Err(keyring::Error::NoEntry) => {
            let seed = card::generate_seed();
            entry.set_secret(&seed).map_err(secrets::store_error)?;
            Ok(seed)
        }
        Err(e) => Err(secrets::store_error(e)),
    }
}

/// This install's public key (base64url, 43 characters): its identity on friends' lists.
#[tauri::command]
pub async fn card_public_key() -> CmdResult<String> {
    util::blocking(|| {
        let _guard = util::lock(&KEY_LOCK);
        Ok(card::public_key(&seed_blocking()?))
    })
    .await
}

/// Signs a card's payload (its JSON text, at most 2 KB) with this install's key: the signature, base64url, 86 characters.
#[tauri::command]
pub async fn card_sign(payload: String) -> CmdResult<String> {
    util::blocking(move || {
        let _guard = util::lock(&KEY_LOCK);
        card::sign(&seed_blocking()?, &payload)
    })
    .await
}

/// Does `sig` (base64url) sign `payload` under the public key `pk` (base64url)? Needs no secret. Keys and signatures that
/// are not strict base64url of the right size are refused as invalid; a signature that merely doesn't match is `false`.
#[tauri::command]
pub async fn card_verify(pk: String, payload: String, sig: String) -> CmdResult<bool> {
    card::verify(&pk, &payload, &sig)
}

/// Replaces the key with a new one: cards made from now on carry a different public key, so friends see a new person.
/// The old key is overwritten (and gone) only once the new one is stored.
#[tauri::command]
pub async fn card_reset_key() -> CmdResult<()> {
    util::blocking(|| {
        let _guard = util::lock(&KEY_LOCK);
        entry()?.set_secret(&card::generate_seed()).map_err(secrets::store_error)
    })
    .await
}
