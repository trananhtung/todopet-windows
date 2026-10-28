//! Fetches the saved ICS calendar links (Google "secret address", Outlook "Publish calendar", iCloud).
//! Rust reads the links from Credential Manager and downloads them because the webview cannot (CSP, CORS)
//! and must not see the links; JS parses the text with ical.js.
//!
//! Results name only the link's host, and errors never contain the link, its path or its query.

use crate::{net, secrets, state::AppState};
use reqwest::header::ACCEPT;
use serde::Serialize;
use std::time::Duration;
use tauri::State;
use todopet_core::calendar::link_host;
use todopet_core::net::check_target;
use todopet_core::CmdResult;

const MAX_BYTES: usize = 5 * 1024 * 1024;
const TIMEOUT: Duration = Duration::from_secs(20);

/// `IcsResult` on the TypeScript side.
#[derive(Debug, Clone, Serialize)]
pub struct IcsResult {
    host: String,
    ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    text: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
}

impl IcsResult {
    fn failed(host: String, error: impl Into<String>) -> Self {
        Self { host, ok: false, text: None, error: Some(error.into()) }
    }
}

/// Fetches every saved link concurrently. Fails as a whole only when the links cannot be read from
/// Credential Manager; otherwise each link reports its own result.
#[tauri::command]
pub async fn calendar_fetch(state: State<'_, AppState>) -> CmdResult<Vec<IcsResult>> {
    let links = secrets::calendar_links().await?;
    let tasks: Vec<_> = links
        .into_iter()
        .map(|link| {
            let host = link_host(&link).unwrap_or_default();
            let client = state.ics.clone();
            let task_host = host.clone();
            let task = tauri::async_runtime::spawn(async move {
                match fetch(&client, &link).await {
                    Ok(text) => IcsResult { host: task_host, ok: true, text: Some(text), error: None },
                    Err(error) => IcsResult::failed(task_host, error),
                }
            });
            (host, task)
        })
        .collect();

    let mut results = Vec::with_capacity(tasks.len());
    for (host, task) in tasks {
        results.push(task.await.unwrap_or_else(|_| IcsResult::failed(host, "The download stopped unexpectedly")));
    }
    Ok(results)
}

async fn fetch(client: &reqwest::Client, link: &str) -> Result<String, String> {
    // Links were validated when saved; check again in case Credential Manager was edited by hand.
    let url = reqwest::Url::parse(link).map_err(|_| "The saved link is not a valid address".to_owned())?;
    check_target(&url).map_err(|refused| refused.message().to_owned())?;
    let mut resp = client
        .get(url)
        .timeout(TIMEOUT)
        .header(ACCEPT, "text/calendar, text/plain;q=0.9, */*;q=0.5")
        .send()
        .await
        .map_err(|e| net::describe_ics_error(&e))?;
    let status = resp.status();
    if !status.is_success() {
        return Err(format!("HTTP {}", status.as_u16()));
    }
    if resp.content_length().is_some_and(|len| len > MAX_BYTES as u64) {
        return Err("The calendar is larger than 5 MB".into());
    }

    let mut body: Vec<u8> = Vec::new();
    while let Some(chunk) = resp.chunk().await.map_err(|e| net::describe_ics_error(&e))? {
        if body.len() + chunk.len() > MAX_BYTES {
            return Err("The calendar is larger than 5 MB".into());
        }
        body.extend_from_slice(&chunk);
    }
    let text = String::from_utf8_lossy(&body);
    Ok(text.strip_prefix('\u{feff}').unwrap_or(&text).to_owned())
}
