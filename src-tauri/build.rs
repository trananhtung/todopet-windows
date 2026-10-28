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
    tauri_build::build()
}
