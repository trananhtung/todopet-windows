//! "Ask Claude" for a postponed task: raw HTTP to the Anthropic Messages API (Rust has no official SDK).
//! The request body and response parsing live in `todopet_core::claude`.

use crate::{http, secrets, state::AppState};
use std::time::Duration;
use tauri::State;
use todopet_core::claude::{self, SplitRequest};
use todopet_core::{CmdError, CmdResult};

const TIMEOUT: Duration = Duration::from_secs(90);

/// Splits a task into 3–6 short steps. Fails with `no_token` when no Anthropic key is stored and with
/// `invalid` when Claude declines the request.
#[tauri::command]
pub async fn claude_split(
    state: State<'_, AppState>,
    title: String,
    notes: Option<String>,
    lang: String,
    model: Option<String>,
) -> CmdResult<Vec<String>> {
    let request = SplitRequest::new(&title, notes.as_deref(), &lang, model.as_deref())?;
    let key = secrets::read(secrets::Account::Anthropic)
        .await?
        .ok_or_else(|| CmdError::no_token("Add an Anthropic API key in Settings first"))?;

    let resp = state
        .http
        .post(claude::API_URL)
        .timeout(TIMEOUT)
        .header("x-api-key", key)
        .header("anthropic-version", claude::API_VERSION)
        .header("anthropic-beta", claude::BETA)
        .json(&request.body())
        .send()
        .await
        .map_err(http::network_error)?;
    let body = http::json_body(resp).await?;
    claude::parse_steps(&body)
}
