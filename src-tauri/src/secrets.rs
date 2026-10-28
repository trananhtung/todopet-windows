//! Todoist token, Anthropic key and calendar links in Windows Credential Manager (`keyring`, service
//! `TodoPet`).
//!
//! Secret values never cross back into JavaScript: the webview can set, clear and ask *whether* a secret
//! is present (for calendar links: their hosts); only Rust reads them, to make the requests itself.
//!
//! Each calendar link is its own credential (`calendar-0` … `calendar-9`) stored as UTF-8 bytes: one
//! credential blob holds at most 2 560 bytes, too little for ten links joined together.

use crate::{http, state::AppState, util};
use serde::Serialize;
use std::sync::Mutex;
use tauri::State;
use todopet_core::calendar::{self, MAX_LINKS};
use todopet_core::{todoist, validate, CmdError, CmdResult};

const SERVICE: &str = "TodoPet";

/// Serializes calendar link rewrites so two saves never interleave their slot writes.
static CALENDAR_WRITE: Mutex<()> = Mutex::new(());

#[derive(Debug, Clone, Copy)]
pub enum Account {
    Todoist,
    Anthropic,
}

impl Account {
    fn user(self) -> &'static str {
        match self {
            Account::Todoist => "todoist",
            Account::Anthropic => "anthropic",
        }
    }
}

fn store_error(e: keyring::Error) -> CmdError {
    CmdError::internal(format!("Windows Credential Manager: {e}"))
}

fn entry(user: &str) -> CmdResult<keyring::Entry> {
    keyring::Entry::new(SERVICE, user).map_err(store_error)
}

fn read_blocking(account: Account) -> CmdResult<Option<String>> {
    match entry(account.user())?.get_password() {
        Ok(secret) => Ok(Some(secret)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(store_error(e)),
    }
}

fn write_blocking(account: Account, secret: &str) -> CmdResult<()> {
    entry(account.user())?.set_password(secret).map_err(store_error)
}

fn delete_user(user: &str) -> CmdResult<()> {
    match entry(user)?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(store_error(e)),
    }
}

/// The stored secret, if any.
pub async fn read(account: Account) -> CmdResult<Option<String>> {
    util::blocking(move || read_blocking(account)).await
}

async fn write(account: Account, secret: String) -> CmdResult<()> {
    util::blocking(move || write_blocking(account, &secret)).await
}

async fn delete(account: Account) -> CmdResult<()> {
    util::blocking(move || delete_user(account.user())).await
}

/// The saved calendar links, in slot order. A slot that cannot be read or decoded is skipped (and
/// logged) rather than failing every calendar.
fn read_calendar_links_blocking() -> CmdResult<Vec<String>> {
    let mut links = Vec::new();
    for slot in 0..MAX_LINKS {
        match entry(&calendar::slot_user(slot))?.get_secret() {
            Ok(bytes) => match String::from_utf8(bytes) {
                Ok(link) => links.push(link),
                Err(_) => log::warn!("Calendar link {} in Credential Manager is not valid text", slot + 1),
            },
            Err(keyring::Error::NoEntry) => {}
            Err(e) => log::warn!("Could not read calendar link {}: {e}", slot + 1),
        }
    }
    Ok(links)
}

/// Writes `links` to slots 0..n and deletes the slots after them.
fn write_calendar_links_blocking(links: &[String]) -> CmdResult<()> {
    let _guard = util::lock(&CALENDAR_WRITE);
    for (slot, link) in links.iter().enumerate() {
        entry(&calendar::slot_user(slot))?.set_secret(link.as_bytes()).map_err(store_error)?;
    }
    for slot in links.len()..MAX_LINKS {
        delete_user(&calendar::slot_user(slot))?;
    }
    Ok(())
}

/// The saved calendar links (normalized `https://` addresses).
pub async fn calendar_links() -> CmdResult<Vec<String>> {
    util::blocking(read_calendar_links_blocking).await
}

/// `SecretsStatus` on the TypeScript side.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SecretsStatus {
    todoist: bool,
    anthropic: bool,
    /// Hosts of the saved calendar links, never the links.
    calendar_hosts: Vec<String>,
}

#[tauri::command]
pub async fn secrets_status() -> CmdResult<SecretsStatus> {
    let links = calendar_links().await?;
    Ok(SecretsStatus {
        todoist: read(Account::Todoist).await?.is_some(),
        anthropic: read(Account::Anthropic).await?.is_some(),
        calendar_hosts: links.iter().filter_map(|link| calendar::link_host(link)).collect(),
    })
}

/// Checks the token with a cheap authenticated request before storing it, so a typo is reported right away
/// (`unauthorized`) instead of on the next sync.
#[tauri::command]
pub async fn todoist_set_token(state: State<'_, AppState>, token: String) -> CmdResult<()> {
    let token = validate::secret(&token)?;
    let resp = state
        .api
        .get(format!("{}{}", todoist::BASE_URL, todoist::VERIFY_PATH))
        .bearer_auth(&token) // reqwest marks the Authorization value sensitive
        .timeout(crate::todoist::TIMEOUT)
        .send()
        .await
        .map_err(http::network_error)?;
    http::check_status(resp).await?;
    write(Account::Todoist, token).await
}

#[tauri::command]
pub async fn todoist_clear_token() -> CmdResult<()> {
    delete(Account::Todoist).await
}

/// `None` removes the key.
#[tauri::command]
pub async fn anthropic_set_key(key: Option<String>) -> CmdResult<()> {
    match key {
        Some(key) => write(Account::Anthropic, validate::secret(&key)?).await,
        None => delete(Account::Anthropic).await,
    }
}

/// Replaces the saved calendar links (https:// or webcal://, at most 10, see
/// `todopet_core::calendar::normalize_links`). An empty list removes them all.
#[tauri::command]
pub async fn calendar_set_links(links: Vec<String>) -> CmdResult<()> {
    let links = calendar::normalize_links(&links)?;
    util::blocking(move || write_calendar_links_blocking(&links)).await
}
