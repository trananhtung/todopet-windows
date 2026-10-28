//! Diary commands: daily JSONL files in `<app data>\log`, 14 days kept. File handling and retention live
//! in `todopet_core::diary`.

use crate::{storage, util};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::AppHandle;
use todopet_core::diary::Diary;
use todopet_core::CmdResult;

fn diary(app: &AppHandle) -> CmdResult<Diary> {
    Ok(Diary::new(storage::data_dir(app)?.join("log")))
}

#[tauri::command]
pub async fn diary_append(app: AppHandle, day: String, line: String) -> CmdResult<()> {
    let diary = diary(&app)?;
    util::blocking(move || diary.append(&day, &line)).await
}

#[tauri::command]
pub async fn diary_read(app: AppHandle, day: String) -> CmdResult<Vec<String>> {
    let diary = diary(&app)?;
    util::blocking(move || diary.read(&day)).await
}

/// Days with a diary, newest first.
#[tauri::command]
pub async fn diary_days(app: AppHandle) -> CmdResult<Vec<String>> {
    let diary = diary(&app)?;
    util::blocking(move || diary.days()).await
}

/// Deletes diaries older than the retention window, off the startup path.
pub fn prune_in_background(app: AppHandle) {
    tauri::async_runtime::spawn_blocking(move || {
        let now = SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_secs() as i64).unwrap_or(0);
        match diary(&app).and_then(|d| d.prune_at_startup(now)) {
            Ok(removed) if !removed.is_empty() => log::info!("Removed {} old diary day(s)", removed.len()),
            Ok(_) => {}
            Err(e) => log::warn!("Diary cleanup failed: {e}"),
        }
    });
}
