// No console window in release builds.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

//! TodoPet for Windows: the Rust side of the Tauri app. See `docs/SPEC.md` for the architecture and
//! `src/backend/types.ts` for the contract the commands implement.

mod calendar;
mod claude;
mod diary;
mod events;
mod http;
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
use tauri::{Manager, RunEvent};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};

fn main() {
    let demo = std::env::args().skip(1).any(|arg| arg == "--demo");
    let state = match state::AppState::new(demo) {
        Ok(state) => state,
        Err(e) => {
            eprintln!("TodoPet could not start: {e}");
            std::process::exit(1);
        }
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
            claude::claude_split,
            calendar::calendar_fetch,
            overlay::set_click_through,
            overlay::focus_overlay,
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
        ])
        .setup(|app| {
            let handle = app.handle().clone();
            let demo = app.state::<state::AppState>().demo;

            overlay::create(&handle, demo)?;
            overlay::spawn_refit(handle.clone());
            overlay::spawn_cursor_poller(handle.clone());
            tray::install(&handle)?;
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
        Err(e) => {
            eprintln!("TodoPet could not start: {e}");
            std::process::exit(1);
        }
    };

    app.run(|_app, event| {
        // The overlay is never closed, but Settings/Diary are; closing them must not end the app.
        // `code` is Some only for an explicit `exit()` (tray Quit, `quit_app`).
        if let RunEvent::ExitRequested { api, code: None, .. } = event {
            api.prevent_exit();
        }
    });
}
