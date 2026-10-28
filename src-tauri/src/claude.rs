//! "Ask Claude" for a postponed task: raw HTTP to the Anthropic Messages API (Rust has no official SDK).
//! The request body and response parsing live in `todopet_core::claude`.

use crate::{http, secrets, state::AppState, util};
use reqwest::header::HeaderValue;
use std::time::Duration;
use tauri::State;
use todopet_core::claude::{self, SplitRequest};
use todopet_core::ratelimit::describe_wait;
use todopet_core::{CmdError, CmdResult, ErrorKind};

const TIMEOUT: Duration = Duration::from_secs(90);

/// Splits a task into 3–6 short steps. Fails with `no_token` when no Anthropic key is stored, with
/// `rate_limited` when asked again within 5 s or more than 20 times in an hour, and with `invalid` when
/// Claude declines the request.
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
    let mut key = HeaderValue::from_str(&key).map_err(|_| CmdError::invalid("The Anthropic key is not valid"))?;
    key.set_sensitive(true);

    // Counted only once the request is about to go out: a refused input or a missing key costs nothing.
    let now = state.uptime_ms();
    if let Err(wait) = util::lock(&state.claude_limiter).try_acquire(now) {
        return Err(CmdError::new(
            ErrorKind::RateLimited,
            format!("Claude was asked too often; try again in {}", describe_wait(wait)),
        ));
    }

    let resp = state
        .api
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
