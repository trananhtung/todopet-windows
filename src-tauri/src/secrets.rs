//! Todoist token and Anthropic key in Windows Credential Manager (`keyring`, service `TodoPet`).
//!
//! Secret values never cross back into JavaScript: the webview can set, clear and ask *whether* a secret
//! is present; only Rust reads them, to make the API calls itself.

use crate::{http, state::AppState, util};
use serde::Serialize;
use tauri::State;
use todopet_core::{todoist, validate, CmdError, CmdResult};

const SERVICE: &str = "TodoPet";

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

fn entry(account: Account) -> CmdResult<keyring::Entry> {
    keyring::Entry::new(SERVICE, account.user()).map_err(store_error)
}

fn read_blocking(account: Account) -> CmdResult<Option<String>> {
    match entry(account)?.get_password() {
        Ok(secret) => Ok(Some(secret)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(store_error(e)),
    }
}

fn write_blocking(account: Account, secret: &str) -> CmdResult<()> {
    entry(account)?.set_password(secret).map_err(store_error)
}

fn delete_blocking(account: Account) -> CmdResult<()> {
    match entry(account)?.delete_credential() {
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
    util::blocking(move || delete_blocking(account)).await
}

#[derive(Debug, Serialize)]
pub struct SecretsStatus {
    todoist: bool,
    anthropic: bool,
}

#[tauri::command]
pub async fn secrets_status() -> CmdResult<SecretsStatus> {
    Ok(SecretsStatus {
        todoist: read(Account::Todoist).await?.is_some(),
        anthropic: read(Account::Anthropic).await?.is_some(),
    })
}

/// Checks the token with a cheap authenticated request before storing it, so a typo is reported right away
/// (`unauthorized`) instead of on the next sync.
#[tauri::command]
pub async fn todoist_set_token(state: State<'_, AppState>, token: String) -> CmdResult<()> {
    let token = validate::secret(&token)?;
    let resp = state
        .http
        .get(format!("{}{}", todoist::BASE_URL, todoist::VERIFY_PATH))
        .bearer_auth(&token)
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
