//! OS integration commands: links, start with Windows, UI language, quit; and the global hotkey.

use tauri::AppHandle;
use tauri_plugin_autostart::ManagerExt;
use tauri_plugin_global_shortcut::{Code, Modifiers, Shortcut};
use tauri_plugin_opener::OpenerExt;
use todopet_core::{validate, CmdError, CmdResult};

/// Ctrl+Alt+T: open the board with the add field focused.
pub fn add_task_shortcut() -> Shortcut {
    Shortcut::new(Some(Modifiers::CONTROL | Modifiers::ALT), Code::KeyT)
}

/// Opens http(s), `msteams:` and `zoommtg:` links with the default handler; anything else is refused.
#[tauri::command]
pub async fn open_url(app: AppHandle, url: String) -> CmdResult<()> {
    let url = validate::open_url(&url)?;
    app.opener().open_url(url, None::<&str>).map_err(|e| CmdError::internal(format!("Could not open the link: {e}")))
}

#[tauri::command]
pub async fn get_autostart(app: AppHandle) -> CmdResult<bool> {
    app.autolaunch().is_enabled().map_err(|e| CmdError::internal(format!("Start with Windows: {e}")))
}

#[tauri::command]
pub async fn set_autostart(app: AppHandle, on: bool) -> CmdResult<()> {
    let manager = app.autolaunch();
    let result = if on { manager.enable() } else { manager.disable() };
    result.map_err(|e| CmdError::internal(format!("Start with Windows: {e}")))
}

/// The Windows display language as a BCP 47 tag ("vi-VN", "en-US").
#[tauri::command]
pub async fn system_locale() -> CmdResult<String> {
    Ok(sys_locale::get_locale().unwrap_or_else(|| "en-US".to_owned()))
}

#[tauri::command]
pub async fn quit_app(app: AppHandle) -> CmdResult<()> {
    app.exit(0);
    Ok(())
}
