//! Tray icon: tooltip with mood/progress, quick menu. Labels start in English and are replaced by the
//! page (`set_tray_labels`) once it knows the user's language.

use crate::events::{self, AppCommand};
use crate::util;
use crate::windows::{self, ExtraWindow};
use serde::Deserialize;
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIcon, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Manager, State, Wry};
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
    if let Err(e) = windows::open(app, window) {
        log::warn!("Could not open {}: {e}", window.label());
    }
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

/// Tooltip such as "TodoPet — 😊 2/3" or "🍅 18:42" (cut to Windows' 127-character limit).
#[tauri::command]
pub async fn set_tray_status(tray: State<'_, Tray>, tooltip: String) -> CmdResult<()> {
    tray.icon.set_tooltip(Some(tray_tooltip(&tooltip))).map_err(util::tauri_err)
}

#[tauri::command]
pub async fn set_tray_labels(tray: State<'_, Tray>, labels: TrayLabels) -> CmdResult<()> {
    let items = &tray.items;
    let pairs = [
        (&items.board, &labels.board),
        (&items.add, &labels.add),
        (&items.focus, &labels.focus),
        (&items.hide, &labels.hide),
        (&items.quiet, &labels.quiet),
        (&items.settings, &labels.settings),
        (&items.diary, &labels.diary),
        (&items.quit, &labels.quit),
    ];
    // Validate all first so a bad label never leaves the menu half translated.
    let texts = pairs
        .iter()
        .map(|(_, text)| validate::text(text, "Menu label", MAX_LABEL_CHARS))
        .collect::<CmdResult<Vec<_>>>()?;
    for ((item, _), text) in pairs.iter().zip(texts) {
        item.set_text(text).map_err(util::tauri_err)?;
    }
    Ok(())
}
