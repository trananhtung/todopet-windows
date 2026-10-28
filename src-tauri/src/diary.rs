//! Diary commands: daily JSONL files in `%LOCALAPPDATA%\com.trananhtung.todopet\log`, 14 days kept. Local,
//! not roaming: the diary records what the user did on this PC and should not follow a roaming profile to
//! other machines. File handling and retention live in `todopet_core::diary`.

use crate::util;
use std::fs;
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Manager};
use todopet_core::diary::Diary;
use todopet_core::{CmdError, CmdResult};

const FOLDER: &str = "log";

fn local_dir(app: &AppHandle) -> CmdResult<PathBuf> {
    app.path().app_local_data_dir().map_err(|e| CmdError::internal(format!("No local app data folder: {e}")))
}

fn diary(app: &AppHandle) -> CmdResult<Diary> {
    Ok(Diary::new(local_dir(app)?.join(FOLDER)))
}

fn now_unix_secs() -> i64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| i64::try_from(d.as_secs()).unwrap_or(i64::MAX)).unwrap_or(0)
}

/// Appends one entry. The first entry of a day also prunes old days; a failed prune is logged and does not
/// fail the append that already succeeded.
#[tauri::command]
pub async fn diary_append(app: AppHandle, day: String, line: String) -> CmdResult<()> {
    let diary = diary(&app)?;
    util::blocking(move || {
        if diary.append(&day, &line)? {
            match diary.prune_for_new_day(&day, now_unix_secs()) {
                Ok(removed) if !removed.is_empty() => log::info!("Removed {} old diary day(s)", removed.len()),
                Ok(_) => {}
                Err(e) => log::warn!("Diary cleanup failed: {e}"),
            }
        }
        Ok(())
    })
    .await
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

/// Earlier versions kept the diary in the roaming folder; move it once to the local one.
fn migrate_from_roaming(app: &AppHandle) {
    let (Ok(roaming), Ok(local)) = (app.path().app_data_dir(), app.path().app_local_data_dir()) else { return };
    let (old, new) = (roaming.join(FOLDER), local.join(FOLDER));
    if old == new || !old.is_dir() || new.exists() {
        return;
    }
    let moved = fs::create_dir_all(&local).and_then(|()| fs::rename(&old, &new));
    match moved {
        Ok(()) => log::info!("Moved the diary to the local app data folder"),
        Err(e) => log::warn!("Could not move the diary to the local app data folder: {e}"),
    }
}

/// Moves a roaming diary over, then deletes diaries older than the retention window, off the startup path.
pub fn prune_in_background(app: AppHandle) {
    tauri::async_runtime::spawn_blocking(move || {
        migrate_from_roaming(&app);
        match diary(&app).and_then(|d| d.prune_at_startup(now_unix_secs())) {
            Ok(removed) if !removed.is_empty() => log::info!("Removed {} old diary day(s)", removed.len()),
            Ok(_) => {}
            Err(e) => log::warn!("Diary cleanup failed: {e}"),
        }
    });
}
