//! Todoist API v1 commands. Paths, bodies and page parsing come from `todopet_core::todoist`; this module
//! adds the token, the HTTP calls and cursor paging.

use crate::{http, secrets, state::AppState};
use reqwest::Method;
use serde_json::Value;
use std::time::Duration;
use tauri::State;
use todopet_core::todoist::{self, TaskAction, BASE_URL, MAX_PAGES};
use todopet_core::{CmdError, CmdResult};

pub const TIMEOUT: Duration = Duration::from_secs(20);

async fn token() -> CmdResult<String> {
    secrets::read(secrets::Account::Todoist)
        .await?
        .ok_or_else(|| CmdError::no_token("Connect Todoist in Settings first"))
}

/// One authenticated request. Non-GET requests carry a fresh `X-Request-Id` so Todoist can drop
/// duplicates if a retry repeats a write.
async fn send(
    client: &reqwest::Client,
    token: &str,
    method: Method,
    path: &str,
    body: Option<&Value>,
) -> CmdResult<Value> {
    // bearer_auth marks the Authorization value sensitive (kept out of Debug output and HPACK tables).
    let mut req = client.request(method.clone(), format!("{BASE_URL}{path}")).bearer_auth(token).timeout(TIMEOUT);
    if method != Method::GET {
        req = req.header("X-Request-Id", uuid::Uuid::new_v4().to_string());
    }
    if let Some(body) = body {
        req = req.json(body);
    }
    let resp = req.send().await.map_err(http::network_error)?;
    http::json_body(resp).await
}

/// Follows `next_cursor` (at most [`MAX_PAGES`] pages) and returns all items.
async fn get_all(
    client: &reqwest::Client,
    token: &str,
    path_for: impl Fn(Option<&str>) -> CmdResult<String>,
) -> CmdResult<Vec<Value>> {
    let mut items = Vec::new();
    let mut cursor: Option<String> = None;
    for _ in 0..MAX_PAGES {
        let path = path_for(cursor.as_deref())?;
        let page = todoist::parse_page(send(client, token, Method::GET, &path, None).await?)?;
        items.extend(page.items);
        match page.next_cursor {
            Some(next) => cursor = Some(next),
            None => return Ok(items),
        }
    }
    log::warn!("Todoist paging stopped after {MAX_PAGES} pages");
    Ok(items)
}

#[tauri::command]
pub async fn todoist_tasks(state: State<'_, AppState>, filter: String) -> CmdResult<Vec<Value>> {
    todoist::filter_path(&filter, None)?;
    let token = token().await?;
    get_all(&state.api, &token, |cursor| todoist::filter_path(&filter, cursor)).await
}

#[tauri::command]
pub async fn todoist_completed(state: State<'_, AppState>, since: String, until: String) -> CmdResult<Vec<Value>> {
    todoist::completed_path(&since, &until, None)?;
    let token = token().await?;
    get_all(&state.api, &token, |cursor| todoist::completed_path(&since, &until, cursor)).await
}

#[tauri::command]
pub async fn todoist_stats(state: State<'_, AppState>) -> CmdResult<Value> {
    let token = token().await?;
    send(&state.api, &token, Method::GET, todoist::STATS_PATH, None).await
}

/// Returns the created task, or `null` if Todoist's answer did not contain one.
#[tauri::command]
pub async fn todoist_add(
    state: State<'_, AppState>,
    content: String,
    due_string: Option<String>,
    priority: u8,
    parent_id: Option<String>,
) -> CmdResult<Option<Value>> {
    let body = todoist::add_body(&content, due_string.as_deref(), priority, parent_id.as_deref())?;
    let token = token().await?;
    let created = send(&state.api, &token, Method::POST, "tasks", Some(&body)).await?;
    Ok(todoist::created_task(created))
}

#[tauri::command]
pub async fn todoist_quick_add(state: State<'_, AppState>, text: String) -> CmdResult<()> {
    let body = todoist::quick_add_body(&text)?;
    let token = token().await?;
    send(&state.api, &token, Method::POST, "tasks/quick", Some(&body)).await.map(drop)
}

async fn task_action(state: &AppState, id: &str, action: TaskAction) -> CmdResult<()> {
    let path = todoist::task_action_path(id, action)?;
    let token = token().await?;
    send(&state.api, &token, Method::POST, &path, None).await.map(drop)
}

#[tauri::command]
pub async fn todoist_close(state: State<'_, AppState>, id: String) -> CmdResult<()> {
    task_action(&state, &id, TaskAction::Close).await
}

#[tauri::command]
pub async fn todoist_reopen(state: State<'_, AppState>, id: String) -> CmdResult<()> {
    task_action(&state, &id, TaskAction::Reopen).await
}

#[tauri::command]
pub async fn todoist_reschedule(state: State<'_, AppState>, id: String, due_string: String) -> CmdResult<()> {
    let path = todoist::task_path(&id)?;
    let body = todoist::reschedule_body(&due_string)?;
    let token = token().await?;
    send(&state.api, &token, Method::POST, &path, Some(&body)).await.map(drop)
}

/// Permanent: sub-tasks are deleted too.
#[tauri::command]
pub async fn todoist_delete(state: State<'_, AppState>, id: String) -> CmdResult<()> {
    let path = todoist::task_path(&id)?;
    let token = token().await?;
    send(&state.api, &token, Method::DELETE, &path, None).await.map(drop)
}
