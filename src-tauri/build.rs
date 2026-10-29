/// Every command in `tauri::generate_handler!` (src/main.rs). Tauri generates an `allow-<command>`
/// permission for each, and a command is callable only from windows whose capability file
/// (`capabilities/*.json`) lists that permission. Keep this list and the handler list in sync: a command
/// missing here cannot be granted, and a capability naming an unknown permission fails the build.
const COMMANDS: &[&str] = &[
    "todoist_tasks",
    "todoist_completed",
    "todoist_stats",
    "todoist_add",
    "todoist_quick_add",
    "todoist_close",
    "todoist_reopen",
    "todoist_reschedule",
    "todoist_delete",
    "secrets_status",
    "todoist_set_token",
    "todoist_clear_token",
    "anthropic_set_key",
    "calendar_set_links",
    "claude_split",
    "calendar_fetch",
    "set_click_through",
    "focus_overlay",
    "release_overlay_focus",
    "set_tray_status",
    "set_tray_labels",
    "open_url",
    "get_autostart",
    "set_autostart",
    "system_locale",
    "quit_app",
    "open_window",
    "store_load",
    "store_save",
    "diary_append",
    "diary_read",
    "diary_days",
    "card_public_key",
    "card_sign",
    "card_verify",
    "card_reset_key",
];

fn main() {
    // Escape hatch for type-checking the Windows target from a Linux/macOS host
    // (`TODOPET_SKIP_WINRES=1 cargo check --target x86_64-pc-windows-msvc --no-default-features`):
    // such hosts have no resource compiler (`rc.exe` / `llvm-rc`), so tauri-build is told it is building for
    // the host and skips embedding the icon and manifest. Never set this for a real build.
    println!("cargo:rerun-if-env-changed=TODOPET_SKIP_WINRES");
    if std::env::var("TODOPET_SKIP_WINRES").is_ok_and(|v| v == "1") && cfg!(not(windows)) {
        if let Ok(host) = std::env::var("HOST") {
            std::env::set_var("TARGET", host);
        }
    }
    let attributes = tauri_build::Attributes::new().app_manifest(tauri_build::AppManifest::new().commands(COMMANDS));
    if let Err(e) = tauri_build::try_build(attributes) {
        panic!("tauri-build failed: {e:#}");
    }
}
