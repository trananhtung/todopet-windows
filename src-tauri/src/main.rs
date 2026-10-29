// No console window in release builds.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

//! TodoPet for Windows: the Rust side of the Tauri app. See `docs/SPEC.md` for the architecture and
//! `src/backend/types.ts` for the contract the commands implement.

mod calendar;
mod cards;
mod claude;
mod diary;
mod events;
mod http;
mod net;
mod overlay;
mod secrets;
mod shell;
mod state;
mod storage;
mod system;
mod todoist;
mod tray;
mod util;
mod windows;

use events::AppCommand;
use std::io::Write;
use tauri::{Manager, RunEvent};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};

/// `%LOCALAPPDATA%\com.trananhtung.todopet\logs\TodoPet.log`, where tauri-plugin-log writes. Used for
/// errors that may happen before (or instead of) the logger being set up.
fn log_file_path() -> Option<std::path::PathBuf> {
    let base = std::env::var_os("LOCALAPPDATA")?;
    Some(std::path::Path::new(&base).join("com.trananhtung.todopet").join("logs").join("TodoPet.log"))
}

/// Reports an error that stops the app, then exits. Release builds have no console (windows subsystem),
/// so the message goes to the log file and to a message box as well as stderr.
fn fatal(message: &str) -> ! {
    let line = format!("TodoPet could not start: {message}");
    eprintln!("{line}");
    if log::max_level() >= log::LevelFilter::Error {
        log::error!("{line}");
        log::logger().flush();
    } else if let Some(path) = log_file_path() {
        let written = path.parent().map(std::fs::create_dir_all).transpose().and_then(|_| {
            let mut f = std::fs::OpenOptions::new().create(true).append(true).open(&path)?;
            writeln!(f, "[{}][fatal] {line}", util::now_ms())
        });
        if let Err(e) = written {
            eprintln!("Could not write the log: {e}");
        }
    }
    show_error_box(&line);
    std::process::exit(1);
}

#[cfg(windows)]
fn show_error_box(text: &str) {
    use ::windows::core::PCWSTR;
    use ::windows::Win32::UI::WindowsAndMessaging::{MessageBoxW, MB_ICONERROR, MB_OK, MB_SETFOREGROUND};
    let wide = |s: &str| s.encode_utf16().chain(std::iter::once(0)).collect::<Vec<u16>>();
    let (text, caption) = (wide(text), wide("TodoPet"));
    // SAFETY: both strings are NUL-terminated UTF-16 buffers that outlive the (modal) call.
    unsafe {
        MessageBoxW(None, PCWSTR(text.as_ptr()), PCWSTR(caption.as_ptr()), MB_OK | MB_ICONERROR | MB_SETFOREGROUND);
    }
}

#[cfg(not(windows))]
fn show_error_box(_text: &str) {}

fn main() {
    let demo = std::env::args().skip(1).any(|arg| arg == "--demo");
    let state = match state::AppState::new(demo) {
        Ok(state) => state,
        Err(e) => fatal(&format!("the network client could not be set up ({e})")),
    };

    let app = tauri::Builder::default()
        // Must be first: a second launch exits here and tells the running instance to open the board.
        .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            events::emit_command(app, AppCommand::Board);
        }))
        .plugin(
            tauri_plugin_log::Builder::new()
                .level(log::LevelFilter::Info)
                .max_file_size(1_000_000)
                .rotation_strategy(tauri_plugin_log::RotationStrategy::KeepOne)
                .build(),
        )
        .plugin(tauri_plugin_autostart::Builder::new().build())
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, shortcut, event| {
                    if event.state == ShortcutState::Pressed && *shortcut == shell::add_task_shortcut() {
                        events::emit_command(app, AppCommand::Add);
                    }
                })
                .build(),
        )
        // We open links from Rust only (`open_url`); no injected click handler in the webviews.
        .plugin(tauri_plugin_opener::Builder::new().open_js_links_on_click(false).build())
        .manage(state)
        .invoke_handler(tauri::generate_handler![
            todoist::todoist_tasks,
            todoist::todoist_completed,
            todoist::todoist_stats,
            todoist::todoist_add,
            todoist::todoist_quick_add,
            todoist::todoist_close,
            todoist::todoist_reopen,
            todoist::todoist_reschedule,
            todoist::todoist_delete,
            secrets::secrets_status,
            secrets::todoist_set_token,
            secrets::todoist_clear_token,
            secrets::anthropic_set_key,
            secrets::calendar_set_links,
            claude::claude_split,
            calendar::calendar_fetch,
            overlay::set_click_through,
            overlay::focus_overlay,
            overlay::release_overlay_focus,
            tray::set_tray_status,
            tray::set_tray_labels,
            shell::open_url,
            shell::get_autostart,
            shell::set_autostart,
            shell::system_locale,
            shell::quit_app,
            windows::open_window,
            storage::store_load,
            storage::store_save,
            diary::diary_append,
            diary::diary_read,
            diary::diary_days,
            cards::card_public_key,
            cards::card_sign,
            cards::card_verify,
            cards::card_reset_key,
        ])
        .setup(|app| {
            let handle = app.handle().clone();
            let demo = app.state::<state::AppState>().demo;

            overlay::create(&handle, demo)?;
            overlay::spawn_refit(handle.clone());
            overlay::spawn_cursor_poller(handle.clone());
            // The pet works without a tray icon (the overlay, the hotkey and a second launch still open
            // the board), so a failure here is not fatal.
            if let Err(e) = tray::install(&handle) {
                log::warn!("No tray icon: {e}");
            }
            system::start(handle.clone());
            diary::prune_in_background(handle.clone());

            // Registered here rather than in the plugin builder: if another app already owns Ctrl+Alt+T the
            // plugin would fail to initialize and take the whole app down with it.
            if let Err(e) = handle.global_shortcut().register(shell::add_task_shortcut()) {
                log::warn!("Ctrl+Alt+T is not available: {e}");
            }
            Ok(())
        })
        .build(tauri::generate_context!());

    let app = match app {
        Ok(app) => app,
        Err(e) => fatal(&e.to_string()),
    };

    app.run(|_app, event| {
        // The overlay is never closed, but Settings/Diary are; closing them must not end the app.
        // `code` is Some only for an explicit `exit()` (tray Quit, `quit_app`).
        if let RunEvent::ExitRequested { api, code: None, .. } = event {
            api.prevent_exit();
        }
    });
}
