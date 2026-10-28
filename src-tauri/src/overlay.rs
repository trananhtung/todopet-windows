//! The overlay: one transparent, click-through, always-on-top window covering the primary monitor's work
//! area. The pet walks inside it with CSS; Rust keeps it fitted to the work area and streams the cursor
//! position so the page can toggle click-through when the cursor is over something interactive.

use crate::events::{self, CURSOR};
use crate::{util, windows};
use serde::Serialize;
use std::sync::Mutex;
use std::thread;
use std::time::Duration;
use tauri::{
    AppHandle, Manager, PhysicalPosition, PhysicalSize, WebviewUrl, WebviewWindow, WebviewWindowBuilder, WindowEvent,
};
use todopet_core::system::cursor_to_css;
use todopet_core::CmdResult;

pub const LABEL: &str = "overlay";
const REFIT_EVERY: Duration = Duration::from_secs(5);
const CURSOR_EVERY: Duration = Duration::from_millis(25);

/// Where the overlay's client area is, for converting the global cursor position. Updated whenever the
/// overlay is fitted, read by the cursor poller.
#[derive(Debug, Clone, Copy, PartialEq)]
struct Geometry {
    origin: (i32, i32),
    scale: f64,
}

#[derive(Default)]
struct OverlayGeometry(Mutex<Option<Geometry>>);

/// The primary monitor's work area (screen minus taskbar) and scale factor.
#[derive(Debug, Clone, Copy, PartialEq)]
struct Fit {
    position: PhysicalPosition<i32>,
    size: PhysicalSize<u32>,
    scale: f64,
}

fn work_area(app: &AppHandle) -> Option<Fit> {
    let monitor = app.primary_monitor().ok().flatten()?;
    let area = monitor.work_area();
    Some(Fit { position: area.position, size: area.size, scale: monitor.scale_factor() })
}

fn apply(win: &WebviewWindow, fit: Fit) -> tauri::Result<()> {
    win.set_position(fit.position)?;
    win.set_size(fit.size)
}

fn store_geometry(app: &AppHandle, win: &WebviewWindow) {
    let Some(state) = app.try_state::<OverlayGeometry>() else { return };
    if let (Ok(pos), Ok(scale)) = (win.inner_position(), win.scale_factor()) {
        *util::lock(&state.0) = Some(Geometry { origin: (pos.x, pos.y), scale });
    }
}

/// Creates the overlay hidden, fits it to the work area, makes it click-through, then shows it.
pub fn create(app: &AppHandle, demo: bool) -> tauri::Result<WebviewWindow> {
    app.manage(OverlayGeometry::default());
    let win = WebviewWindowBuilder::new(app, LABEL, WebviewUrl::App(windows::page_url("overlay", demo).into()))
        .title("TodoPet")
        .transparent(true)
        .decorations(false)
        .shadow(false)
        .always_on_top(true)
        .skip_taskbar(true)
        .resizable(false)
        .focused(false)
        .visible(false)
        .build()?;

    // Alt+F4 while the overlay has focus must not kill the pet; Quit is in the tray menu.
    win.on_window_event(|event| {
        if let WindowEvent::CloseRequested { api, .. } = event {
            api.prevent_close();
        }
    });

    if let Some(fit) = work_area(app) {
        apply(&win, fit)?;
    }
    win.set_ignore_cursor_events(true)?;
    win.show()?;
    store_geometry(app, &win);
    Ok(win)
}

/// Re-fits the overlay every 5 s when the work area or scale changed (taskbar moved, resolution or
/// display scaling changed, primary monitor switched).
pub fn spawn_refit(app: AppHandle) {
    let spawned = thread::Builder::new().name("overlay-refit".into()).spawn(move || {
        let mut last = work_area(&app);
        loop {
            thread::sleep(REFIT_EVERY);
            let Some(win) = app.get_webview_window(LABEL) else { continue };
            let current = work_area(&app);
            if let Some(fit) = current.filter(|fit| Some(*fit) != last) {
                match apply(&win, fit) {
                    Ok(()) => last = current,
                    Err(e) => log::warn!("Could not fit the overlay: {e}"),
                }
            }
            store_geometry(&app, &win);
        }
    });
    if let Err(e) = spawned {
        log::error!("Could not start the overlay refit thread: {e}");
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Serialize)]
struct CursorSample {
    x: f64,
    y: f64,
}

/// Polls the cursor (~40 Hz) and sends `cursor` events in CSS px relative to the overlay, only on change.
pub fn spawn_cursor_poller(app: AppHandle) {
    let spawned = thread::Builder::new().name("cursor-poller".into()).spawn(move || {
        let mut last: Option<CursorSample> = None;
        loop {
            thread::sleep(CURSOR_EVERY);
            let Ok(cursor) = app.cursor_position() else { continue };
            let Some(state) = app.try_state::<OverlayGeometry>() else { continue };
            let Some(geometry) = *util::lock(&state.0) else { continue };
            let (x, y) = cursor_to_css((cursor.x, cursor.y), geometry.origin, geometry.scale);
            // Half-pixel precision is plenty and keeps sub-pixel jitter from producing events.
            let sample = CursorSample { x: (x * 2.0).round() / 2.0, y: (y * 2.0).round() / 2.0 };
            if last != Some(sample) {
                last = Some(sample);
                events::emit_to_overlay(&app, CURSOR, sample);
            }
        }
    });
    if let Err(e) = spawned {
        log::error!("Could not start the cursor poller: {e}");
    }
}

fn overlay(app: &AppHandle) -> CmdResult<WebviewWindow> {
    app.get_webview_window(LABEL).ok_or_else(|| todopet_core::CmdError::internal("The overlay window is gone"))
}

/// `true`: clicks pass through to the apps below. The page flips this when the cursor enters or leaves an
/// interactive element.
#[tauri::command]
pub async fn set_click_through(app: AppHandle, ignore: bool) -> CmdResult<()> {
    overlay(&app)?.set_ignore_cursor_events(ignore).map_err(util::tauri_err)
}

/// Gives the overlay keyboard focus (board opened, add field).
#[tauri::command]
pub async fn focus_overlay(app: AppHandle) -> CmdResult<()> {
    overlay(&app)?.set_focus().map_err(util::tauri_err)
}
