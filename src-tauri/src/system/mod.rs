//! The system sampler: once a second, what app is in front (and which page if it is a browser), how long
//! the user has been idle or not typing, and whether a full-screen app is showing. Sent to the overlay as
//! `system-sample` (`SystemSample` in `src/backend/types.ts`).
//!
//! The Win32 parts are `#[cfg(windows)]`; on other targets they are no-op stubs so the crate type-checks.

mod browser_url;
mod foreground;
mod input;

use crate::events::{self, SYSTEM_SAMPLE};
use crate::util::now_ms;
use serde::Serialize;
use std::thread;
use std::time::Duration;
use tauri::AppHandle;
use todopet_core::system::browser_of;

const SAMPLE_EVERY: Duration = Duration::from_secs(1);

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ForegroundApp {
    name: String,
    exe: String,
    title: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SystemSample {
    app: Option<ForegroundApp>,
    url: Option<String>,
    idle_seconds: f64,
    seconds_since_key: f64,
    fullscreen: bool,
    app_switched_at: u64,
}

/// State carried between samples.
struct Sampler {
    names: foreground::Names,
    urls: browser_url::Reader,
    app: Option<ForegroundApp>,
    url: Option<String>,
    /// Exe of the last foreign foreground window, for detecting app switches.
    exe: Option<String>,
    switched_at: u64,
}

impl Sampler {
    fn new() -> Self {
        Self {
            names: foreground::Names::default(),
            urls: browser_url::Reader::default(),
            app: None,
            url: None,
            exe: None,
            switched_at: now_ms(),
        }
    }

    fn sample(&mut self) -> SystemSample {
        let mut fullscreen = false;
        // TodoPet's own windows (overlay clicks, Settings) and moments with no foreground window keep the
        // previous app, so they never count as switching away from it.
        if let Some(fg) = foreground::current().filter(|fg| !fg.own) {
            if self.exe.as_deref() != Some(fg.exe.as_str()) {
                if self.exe.is_some() {
                    self.switched_at = now_ms();
                }
                self.exe = Some(fg.exe.clone());
            }
            fullscreen = fg.fullscreen;
            if fg.exe.is_empty() {
                // Protected process we may not inspect.
                self.app = None;
                self.url = None;
            } else {
                self.url = browser_of(&fg.exe).and_then(|browser| self.urls.read(fg.hwnd, &fg.title, browser));
                self.app = Some(ForegroundApp {
                    name: self.names.friendly(&fg.exe_path, &fg.exe),
                    exe: fg.exe,
                    title: fg.title,
                });
            }
        }
        SystemSample {
            app: self.app.clone(),
            url: self.url.clone(),
            idle_seconds: input::idle_seconds(),
            seconds_since_key: input::seconds_since_key(),
            fullscreen,
            app_switched_at: self.switched_at,
        }
    }
}

/// Starts the keyboard hook and the 1 Hz sampler thread.
pub fn start(app: AppHandle) {
    input::start_keyboard_hook();
    let spawned = thread::Builder::new().name("system-sampler".into()).spawn(move || {
        // Created on this thread: the UI Automation client is a COM object bound to it.
        let mut sampler = Sampler::new();
        loop {
            events::emit_to_overlay(&app, SYSTEM_SAMPLE, sampler.sample());
            thread::sleep(SAMPLE_EVERY);
        }
    });
    if let Err(e) = spawned {
        log::error!("Could not start the system sampler: {e}");
    }
}
