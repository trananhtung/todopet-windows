//! The decorated extra windows (Settings, Diary, Gallery), created on demand.

use crate::{state::AppState, util};
use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};
use todopet_core::system::fit_window_size;
use todopet_core::{CmdError, CmdResult};

/// `ExtraWindow` on the TypeScript side. The label doubles as the page name.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ExtraWindow {
    Settings,
    Diary,
    Gallery,
}

impl ExtraWindow {
    pub fn parse(name: &str) -> CmdResult<Self> {
        match name {
            "settings" => Ok(Self::Settings),
            "diary" => Ok(Self::Diary),
            "gallery" => Ok(Self::Gallery),
            _ => Err(CmdError::invalid(format!("Unknown window: {name}"))),
        }
    }

    pub fn label(self) -> &'static str {
        match self {
            Self::Settings => "settings",
            Self::Diary => "diary",
            Self::Gallery => "gallery",
        }
    }

    fn title(self) -> &'static str {
        match self {
            Self::Settings => "TodoPet — Settings",
            Self::Diary => "TodoPet — Diary",
            Self::Gallery => "TodoPet — Gallery",
        }
    }

    /// Initial inner size in logical pixels.
    fn size(self) -> (f64, f64) {
        match self {
            Self::Settings => (600.0, 760.0),
            Self::Diary => (760.0, 720.0),
            Self::Gallery => (1100.0, 800.0),
        }
    }
}

/// `page.html`, or `page.html?demo` when the app runs with `--demo`.
pub fn page_url(page: &str, demo: bool) -> String {
    if demo {
        format!("{page}.html?demo")
    } else {
        format!("{page}.html")
    }
}

/// The primary monitor's work area in logical pixels.
fn work_area_logical(app: &AppHandle) -> Option<(f64, f64)> {
    let monitor = app.primary_monitor().ok().flatten()?;
    let scale = monitor.scale_factor();
    let size = monitor.work_area().size;
    (scale.is_finite() && scale > 0.0).then(|| (f64::from(size.width) / scale, f64::from(size.height) / scale))
}

/// Shows and focuses the window, creating it if it is not open. Builds a webview, so it must not run on
/// the main thread inside a synchronous event handler (it deadlocks on Windows); see
/// [`open_in_background`].
pub fn open(app: &AppHandle, which: ExtraWindow) -> tauri::Result<()> {
    if let Some(win) = app.get_webview_window(which.label()) {
        win.unminimize()?;
        win.show()?;
        return win.set_focus();
    }
    let demo = app.state::<AppState>().demo;
    let ((width, height), (min_width, min_height)) = fit_window_size(which.size(), work_area_logical(app));
    WebviewWindowBuilder::new(app, which.label(), WebviewUrl::App(page_url(which.label(), demo).into()))
        .title(which.title())
        .inner_size(width, height)
        .min_inner_size(min_width, min_height)
        .center()
        .resizable(true)
        .decorations(true)
        .focused(true)
        .build()?;
    Ok(())
}

/// [`open`] from the async runtime, for synchronous callers on the main thread (tray menu, single-instance
/// callback). Failures are logged.
pub fn open_in_background(app: &AppHandle, which: ExtraWindow) {
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        if let Err(e) = open(&app, which) {
            log::warn!("Could not open {}: {e}", which.label());
        }
    });
}

/// Async so the window is built off the main thread: building a webview from a synchronous command
/// deadlocks on Windows.
#[tauri::command]
pub async fn open_window(app: AppHandle, which: String) -> CmdResult<()> {
    open(&app, ExtraWindow::parse(&which)?).map_err(util::tauri_err)
}
