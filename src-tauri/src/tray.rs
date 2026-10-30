//! Tray icon: tooltip with mood/progress, quick menu. Labels start in English and are replaced by the
//! page (`set_tray_labels`) once it knows the user's language.

use crate::events::{self, AppCommand};
use crate::util;
use crate::windows::{self, ExtraWindow};
use serde::Deserialize;
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIcon, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Manager, Wry};
use todopet_core::system::tray_tooltip;
use todopet_core::{validate, CmdResult};

const MAX_LABEL_CHARS: usize = 64;

/// Handles kept to update the tooltip and relabel the menu.
pub struct Tray {
    icon: TrayIcon<Wry>,
    items: Items,
}

struct Items {
    board: MenuItem<Wry>,
    add: MenuItem<Wry>,
    focus: MenuItem<Wry>,
    hide: MenuItem<Wry>,
    quiet: MenuItem<Wry>,
    settings: MenuItem<Wry>,
    diary: MenuItem<Wry>,
    update: MenuItem<Wry>,
    quit: MenuItem<Wry>,
}

/// `TrayLabels` on the TypeScript side.
#[derive(Debug, Deserialize)]
pub struct TrayLabels {
    board: String,
    add: String,
    focus: String,
    hide: String,
    quiet: String,
    settings: String,
    diary: String,
    /// "Check for updates…", or "✨ Update to 0.7.1" while one is available.
    updates: String,
    quit: String,
}

fn on_menu(app: &AppHandle, id: &str) {
    if let Some(command) = AppCommand::from_menu_id(id) {
        events::emit_command(app, command);
        return;
    }
    let window = match id {
        "settings" => ExtraWindow::Settings,
        "diary" => ExtraWindow::Diary,
        "quit" => return app.exit(0),
        _ => return,
    };
    // Menu events arrive on the main thread inside the event loop; building a webview from there
    // deadlocks on Windows, so the window is opened from the async runtime instead.
    windows::open_in_background(app, window);
}

/// Builds the tray icon and keeps its handles in managed state.
pub fn install(app: &AppHandle) -> tauri::Result<()> {
    let item = |id: &str, text: &str| MenuItem::with_id(app, id, text, true, None::<&str>);
    let items = Items {
        board: item("board", "Open board")?,
        add: item("add", "Add task…")?,
        focus: item("focus", "Focus")?,
        hide: item("hide1h", "Hide for 1 hour")?,
        quiet: item("quiet1h", "Quiet for 1 hour")?,
        settings: item("settings", "Settings…")?,
        diary: item("diary", "Diary")?,
        update: item("update", "Check for updates…")?,
        quit: item("quit", "Quit TodoPet")?,
    };
    let menu = Menu::with_items(
        app,
        &[
            &items.board,
            &items.add,
            &items.focus,
            &items.hide,
            &items.quiet,
            &PredefinedMenuItem::separator(app)?,
            &items.settings,
            &items.diary,
            &items.update,
            &PredefinedMenuItem::separator(app)?,
            &items.quit,
        ],
    )?;

    let mut builder = TrayIconBuilder::with_id("main")
        .tooltip("TodoPet")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| on_menu(app, event.id().as_ref()))
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = event {
                events::emit_command(tray.app_handle(), AppCommand::Board);
            }
        });
    if let Some(icon) = app.default_window_icon() {
        builder = builder.icon(icon.clone());
    }
    let icon = builder.build(app)?;
    app.manage(Tray { icon, items });
    Ok(())
}

/// Shows or hides the tray icon; a no-op without one. The icon lives in managed state, so nothing removes it when
/// the process ends with `process::exit` (the updater's way out): Windows would keep a dead icon in the tray until the
/// mouse passes over it. The update path hides it just before, and shows it again if the installer did not start.
pub fn set_visible(app: &AppHandle, visible: bool) {
    let Some(tray) = app.try_state::<Tray>() else { return };
    if let Err(e) = tray.icon.set_visible(visible) {
        log::warn!("Could not {} the tray icon: {e}", if visible { "show" } else { "hide" });
    }
}

/// Tooltip such as "TodoPet — 😊 2/3" or "🍅 18:42" (cut to Windows' 127-character limit). A no-op when
/// the tray icon could not be created at startup.
#[tauri::command]
pub async fn set_tray_status(app: AppHandle, tooltip: String) -> CmdResult<()> {
    let Some(tray) = app.try_state::<Tray>() else { return Ok(()) };
    tray.icon.set_tooltip(Some(tray_tooltip(&tooltip))).map_err(util::tauri_err)
}

/// Relabels the menu in the user's language. A no-op without a tray icon (labels are still validated).
#[tauri::command]
pub async fn set_tray_labels(app: AppHandle, labels: TrayLabels) -> CmdResult<()> {
    let texts = [
        &labels.board,
        &labels.add,
        &labels.focus,
        &labels.hide,
        &labels.quiet,
        &labels.settings,
        &labels.diary,
        &labels.updates,
        &labels.quit,
    ]
    .iter()
    .map(|text| validate::text(text, "Menu label", MAX_LABEL_CHARS))
    .collect::<CmdResult<Vec<_>>>()?;
    let Some(tray) = app.try_state::<Tray>() else { return Ok(()) };
    let items = &tray.items;
    // Same order as `texts`, all validated first so a bad label never leaves the menu half translated.
    let menu_items = [
        &items.board,
        &items.add,
        &items.focus,
        &items.hide,
        &items.quiet,
        &items.settings,
        &items.diary,
        &items.update,
        &items.quit,
    ];
    for (item, text) in menu_items.into_iter().zip(texts) {
        item.set_text(text).map_err(util::tauri_err)?;
    }
    Ok(())
}
