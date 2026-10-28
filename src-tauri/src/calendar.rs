//! Fetches ICS calendar links (Google "secret address", Outlook "Publish calendar", iCloud). Rust does the
//! download because the webview cannot (CSP, CORS); JS parses the text with ical.js.

use crate::{http, state::AppState};
use reqwest::header::ACCEPT;
use serde::Serialize;
use std::time::Duration;
use tauri::State;
use todopet_core::{validate, CmdResult};

const MAX_LINKS: usize = 10;
const MAX_BYTES: usize = 5 * 1024 * 1024;
const TIMEOUT: Duration = Duration::from_secs(20);

/// `IcsResult` on the TypeScript side. `url` is the link exactly as given, so the caller can match results.
#[derive(Debug, Clone, Serialize)]
pub struct IcsResult {
    url: String,
    ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    text: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
}

impl IcsResult {
    fn failed(url: String, error: impl Into<String>) -> Self {
        Self { url, ok: false, text: None, error: Some(error.into()) }
    }
}

/// Fetches every link concurrently. Never fails as a whole: each link reports its own result.
#[tauri::command]
pub async fn calendar_fetch(state: State<'_, AppState>, urls: Vec<String>) -> CmdResult<Vec<IcsResult>> {
    let mut tasks = Vec::new();
    for (i, url) in urls.into_iter().enumerate() {
        if i >= MAX_LINKS {
            tasks.push(Err(IcsResult::failed(url, "Only the first 10 calendar links are read")));
            continue;
        }
        let client = state.http.clone();
        let link = url.clone();
        let task = tauri::async_runtime::spawn(async move {
            match fetch(&client, &link).await {
                Ok(text) => IcsResult { url: link, ok: true, text: Some(text), error: None },
                Err(error) => IcsResult::failed(link, error),
            }
        });
        tasks.push(Ok((url, task)));
    }

    let mut results = Vec::with_capacity(tasks.len());
    for task in tasks {
        results.push(match task {
            Ok((url, handle)) => handle.await.unwrap_or_else(|e| IcsResult::failed(url, format!("Fetch failed: {e}"))),
            Err(skipped) => skipped,
        });
    }
    Ok(results)
}

async fn fetch(client: &reqwest::Client, raw_url: &str) -> Result<String, String> {
    let url = validate::ics_url(raw_url)?;
    let resp = client
        .get(&url)
        .timeout(TIMEOUT)
        .header(ACCEPT, "text/calendar, text/plain;q=0.9, */*;q=0.5")
        .send()
        .await
        .map_err(|e| http::network_error(e).message)?;
    let status = resp.status();
    if !status.is_success() {
        return Err(format!("HTTP {}", status.as_u16()));
    }
    if resp.content_length().is_some_and(|len| len > MAX_BYTES as u64) {
        return Err("The calendar is larger than 5 MB".into());
    }

    let mut resp = resp;
    let mut body: Vec<u8> = Vec::new();
    while let Some(chunk) = resp.chunk().await.map_err(|e| http::network_error(e).message)? {
        if body.len() + chunk.len() > MAX_BYTES {
            return Err("The calendar is larger than 5 MB".into());
        }
        body.extend_from_slice(&chunk);
    }
    let text = String::from_utf8_lossy(&body);
    Ok(text.strip_prefix('\u{feff}').unwrap_or(&text).to_owned())
}
