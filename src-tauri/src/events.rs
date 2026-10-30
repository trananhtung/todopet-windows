//! Events Rust sends to the overlay webview. Names and payloads match `SystemApi` in
//! `src/backend/types.ts`.

use serde::Serialize;
use tauri::{AppHandle, Emitter};

pub const CURSOR: &str = "cursor";
pub const SYSTEM_SAMPLE: &str = "system-sample";
pub const APP_COMMAND: &str = "app-command";

/// `AppCommand` on the TypeScript side.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
pub enum AppCommand {
    #[serde(rename = "board")]
    Board,
    #[serde(rename = "add")]
    Add,
    #[serde(rename = "focus")]
    Focus,
    #[serde(rename = "hide1h")]
    Hide1h,
    #[serde(rename = "quiet1h")]
    Quiet1h,
    /// The tray's "Check for updates…" / "✨ Update to 0.7.1": the overlay installs if an update is ready,
    /// otherwise checks now and answers.
    #[serde(rename = "update")]
    Update,
}

impl AppCommand {
    /// The tray menu item id that triggers this command (ids equal the wire names).
    pub fn from_menu_id(id: &str) -> Option<Self> {
        match id {
            "board" => Some(Self::Board),
            "add" => Some(Self::Add),
            "focus" => Some(Self::Focus),
            "hide1h" => Some(Self::Hide1h),
            "quiet1h" => Some(Self::Quiet1h),
            "update" => Some(Self::Update),
            _ => None,
        }
    }
}

/// Sends `payload` to the overlay only. Failures are logged: there is nobody to report them to.
pub fn emit_to_overlay<S: Serialize + Clone>(app: &AppHandle, event: &str, payload: S) {
    if let Err(e) = app.emit_to(crate::overlay::LABEL, event, payload) {
        log::warn!("Could not send {event} to the overlay: {e}");
    }
}

pub fn emit_command(app: &AppHandle, command: AppCommand) {
    emit_to_overlay(app, APP_COMMAND, command);
}
