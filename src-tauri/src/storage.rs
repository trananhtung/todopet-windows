//! `store_load` / `store_save`: small JSON documents in `%APPDATA%\com.trananhtung.todopet`.

use crate::util;
use serde_json::Value;
use std::path::PathBuf;
use tauri::{AppHandle, Manager, WebviewWindow};
use todopet_core::store::Store;
use todopet_core::{validate, CmdError, CmdResult};

/// `%APPDATA%\com.trananhtung.todopet`.
pub fn data_dir(app: &AppHandle) -> CmdResult<PathBuf> {
    app.path().app_data_dir().map_err(|e| CmdError::internal(format!("No app data folder: {e}")))
}

/// Reads a document. Which keys a window may read depends on its label (`validate::store_key_allowed`): the page
/// can ask for anything, Rust decides.
#[tauri::command]
pub async fn store_load(app: AppHandle, window: WebviewWindow, key: String) -> CmdResult<Option<Value>> {
    let key = validate::window_store_key(window.label(), &key, false)?.to_owned();
    let store = Store::new(data_dir(&app)?);
    util::blocking(move || store.load(&key)).await
}

#[tauri::command]
pub async fn store_save(app: AppHandle, window: WebviewWindow, key: String, value: Value) -> CmdResult<()> {
    let key = validate::window_store_key(window.label(), &key, true)?.to_owned();
    let store = Store::new(data_dir(&app)?);
    util::blocking(move || store.save(&key, &value)).await
}
