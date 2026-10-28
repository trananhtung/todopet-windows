//! `store_load` / `store_save`: small JSON documents in `%APPDATA%\com.trananhtung.todopet`.

use crate::util;
use serde_json::Value;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};
use todopet_core::store::Store;
use todopet_core::{CmdError, CmdResult};

/// `%APPDATA%\com.trananhtung.todopet`.
pub fn data_dir(app: &AppHandle) -> CmdResult<PathBuf> {
    app.path().app_data_dir().map_err(|e| CmdError::internal(format!("No app data folder: {e}")))
}

#[tauri::command]
pub async fn store_load(app: AppHandle, key: String) -> CmdResult<Option<Value>> {
    let store = Store::new(data_dir(&app)?);
    util::blocking(move || store.load(&key)).await
}

#[tauri::command]
pub async fn store_save(app: AppHandle, key: String, value: Value) -> CmdResult<()> {
    let store = Store::new(data_dir(&app)?);
    util::blocking(move || store.save(&key, &value)).await
}
