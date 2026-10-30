//! Pure helpers for the system sampler and windows: exe names, browser detection, address-bar text to
//! URL, full-screen geometry, cursor coordinate conversion, window sizes.

/// Browser families whose address bar we read with UI Automation.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Browser {
    Chromium,
    Firefox,
}

/// The browser family of a lower-case exe file name.
pub fn browser_of(exe: &str) -> Option<Browser> {
    match exe {
        "chrome.exe" | "msedge.exe" | "brave.exe" | "vivaldi.exe" | "opera.exe" | "arc.exe" => Some(Browser::Chromium),
        "firefox.exe" => Some(Browser::Firefox),
        _ => None,
    }
}

/// Lower-case file name of an executable path (`C:\Program Files\Google\Chrome\Application\chrome.exe` →
/// `chrome.exe`). Accepts both separators.
pub fn exe_file_name(path: &str) -> String {
    path.rsplit(['\\', '/']).next().unwrap_or(path).to_lowercase()
}

/// Fallback display name when the exe has no FileDescription: the stem, title-cased
/// (`code.exe` → `Code`, `obs64.exe` → `Obs64`, `my_app-x.exe` → `My App X`).
pub fn friendly_name_from_exe(exe: &str) -> String {
    let stem = exe.rsplit_once('.').map_or(exe, |(stem, _)| stem);
    let words: Vec<String> = stem
        .split(['_', '-', ' '])
        .filter(|w| !w.is_empty())
        .map(|w| {
            let mut chars = w.chars();
            match chars.next() {
                Some(first) => first.to_uppercase().chain(chars.flat_map(char::to_lowercase)).collect(),
                None => String::new(),
            }
        })
        .collect();
    if words.is_empty() {
        exe.to_owned()
    } else {
        words.join(" ")
    }
}

/// Browser-internal pages that keep their own scheme instead of getting `https://`.
const INTERNAL_SCHEMES: [&str; 9] =
    ["about:", "chrome:", "edge:", "brave:", "vivaldi:", "opera:", "arc:", "view-source:", "file:"];

/// Turns the address bar's text into a URL, or `None` when it is not one (empty, or the user is typing a
/// search). Chromium and Firefox hide `https://` in the bar, so it is added back when missing.
pub fn normalize_address(raw: &str) -> Option<String> {
    let text = raw.trim();
    if text.is_empty() || text.chars().any(char::is_whitespace) {
        return None;
    }
    let lower = text.to_ascii_lowercase();
    if lower.contains("://") || INTERNAL_SCHEMES.iter().any(|s| lower.starts_with(s)) {
        return Some(text.to_owned());
    }
    let host_end = text.find(['/', '?', '#']).unwrap_or(text.len());
    let host = &text[..host_end];
    let looks_like_host = host.contains('.') || lower.starts_with("localhost");
    looks_like_host.then(|| format!("https://{text}"))
}

/// Window classes of the desktop and taskbar: never "a full-screen app".
pub fn is_shell_class(class: &str) -> bool {
    matches!(class, "Progman" | "WorkerW" | "Shell_TrayWnd" | "Shell_SecondaryTrayWnd")
}

/// A rectangle in physical screen pixels (Win32 `RECT` layout: right/bottom exclusive).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Rect {
    pub left: i32,
    pub top: i32,
    pub right: i32,
    pub bottom: i32,
}

/// True when `window` covers all of `monitor` (borderless full-screen games, F11 browsers, slideshows).
/// A maximized window stops at the taskbar and so does not count.
pub fn covers(window: Rect, monitor: Rect) -> bool {
    monitor.right > monitor.left
        && monitor.bottom > monitor.top
        && window.left <= monitor.left
        && window.top <= monitor.top
        && window.right >= monitor.right
        && window.bottom >= monitor.bottom
}

/// What is known about the foreground window when deciding whether a full-screen app is in front.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct WindowFacts<'a> {
    pub class: &'a str,
    /// The window belongs to TodoPet itself.
    pub own: bool,
    /// The desktop or shell window (`GetShellWindow` / `GetDesktopWindow`).
    pub shell: bool,
    pub minimized: bool,
    /// Maximized (`IsZoomed`). With an auto-hiding taskbar a maximized window covers the monitor too, but
    /// it is an ordinary window, not a game or a slideshow.
    pub maximized: bool,
    pub rect: Rect,
    pub monitor: Rect,
}

/// The `fullscreen` flag of a system sample.
pub fn is_fullscreen(w: &WindowFacts<'_>) -> bool {
    !w.own && !w.shell && !w.minimized && !w.maximized && !is_shell_class(w.class) && covers(w.rect, w.monitor)
}

/// Windows truncates tray tooltips to 127 UTF-16 units; cut on a character boundary ourselves so an emoji
/// is never split in half. Line breaks are kept (tooltips can be multi-line), other control characters go.
pub fn tray_tooltip(text: &str) -> String {
    const MAX_UNITS: usize = 127;
    let mut units = 0;
    let mut out = String::new();
    for c in text.chars().filter(|&c| c == '\n' || !c.is_control()) {
        units += c.len_utf16();
        if units > MAX_UNITS {
            break;
        }
        out.push(c);
    }
    out
}

/// Room left around a decorated window on small screens (title bar, a little air), in logical px.
const SCREEN_MARGIN: f64 = 40.0;
const MIN_WINDOW: (f64, f64) = (480.0, 480.0);
/// Smallest size a window is ever shrunk to, however small the screen.
const FLOOR: f64 = 320.0;

/// The initial size and minimum size of a Settings/Diary/Gallery window: the designed `wanted` size,
/// shrunk to fit the primary monitor's `work_area` (logical px) minus a margin, so a window never opens
/// taller than a small or heavily scaled screen. The minimum never exceeds the size.
pub fn fit_window_size(wanted: (f64, f64), work_area: Option<(f64, f64)>) -> ((f64, f64), (f64, f64)) {
    let (mut width, mut height) = wanted;
    if let Some((area_w, area_h)) = work_area {
        width = width.min((area_w - SCREEN_MARGIN).max(FLOOR));
        height = height.min((area_h - SCREEN_MARGIN).max(FLOOR));
    }
    ((width, height), (width.min(MIN_WINDOW.0), height.min(MIN_WINDOW.1)))
}

/// Converts a global physical cursor position into CSS pixels relative to the overlay's client area.
pub fn cursor_to_css(cursor: (f64, f64), inner_origin: (i32, i32), scale_factor: f64) -> (f64, f64) {
    let scale = if scale_factor.is_finite() && scale_factor > 0.0 { scale_factor } else { 1.0 };
    ((cursor.0 - f64::from(inner_origin.0)) / scale, (cursor.1 - f64::from(inner_origin.1)) / scale)
}

/// Reads a `GUID_SESSION_DISPLAY_STATUS` notification's data (a little-endian `u32`: 0 off, 1 on, 2 dimmed):
/// whether the display is off. A dimmed display is still on screen. `None` for anything else.
pub fn display_off(data: &[u8]) -> Option<bool> {
    let bytes: [u8; 4] = data.get(..4)?.try_into().ok()?;
    match u32::from_le_bytes(bytes) {
        0 => Some(true),
        1 | 2 => Some(false),
        _ => None,
    }
}

/// Reads `WTSINFOEX_LEVEL1`'s `SessionFlags` and `SessionState`: nobody can see the session, because it is locked
/// (`WTS_SESSIONSTATE_LOCK` = 0) or it is a Remote Desktop session whose client went away (`WTSDisconnected` = 4).
/// An unknown lock state counts as unlocked.
pub fn session_unseen(flags: i32, state: i32) -> bool {
    const WTS_SESSIONSTATE_LOCK: i32 = 0;
    const WTS_DISCONNECTED: i32 = 4;
    flags == WTS_SESSIONSTATE_LOCK || state == WTS_DISCONNECTED
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn browsers() {
        assert_eq!(browser_of("chrome.exe"), Some(Browser::Chromium));
        assert_eq!(browser_of("msedge.exe"), Some(Browser::Chromium));
        assert_eq!(browser_of("firefox.exe"), Some(Browser::Firefox));
        assert_eq!(browser_of("code.exe"), None);
    }

    #[test]
    fn exe_names() {
        assert_eq!(exe_file_name(r"C:\Program Files\Google\Chrome\Application\Chrome.EXE"), "chrome.exe");
        assert_eq!(exe_file_name("/usr/bin/firefox"), "firefox");
        assert_eq!(exe_file_name("discord.exe"), "discord.exe");
    }

    #[test]
    fn friendly_names() {
        assert_eq!(friendly_name_from_exe("code.exe"), "Code");
        assert_eq!(friendly_name_from_exe("obs64.exe"), "Obs64");
        assert_eq!(friendly_name_from_exe("my_app-x.exe"), "My App X");
        assert_eq!(friendly_name_from_exe("WINWORD.EXE"), "Winword");
        assert_eq!(friendly_name_from_exe(".exe"), ".exe");
    }

    #[test]
    fn addresses() {
        assert_eq!(normalize_address("youtube.com/shorts/abc").as_deref(), Some("https://youtube.com/shorts/abc"));
        assert_eq!(normalize_address("https://www.youtube.com/").as_deref(), Some("https://www.youtube.com/"));
        assert_eq!(normalize_address("http://localhost:3000").as_deref(), Some("http://localhost:3000"));
        assert_eq!(normalize_address("localhost:5173/app").as_deref(), Some("https://localhost:5173/app"));
        assert_eq!(normalize_address("chrome://newtab/").as_deref(), Some("chrome://newtab/"));
        assert_eq!(normalize_address("about:blank").as_deref(), Some("about:blank"));
        assert_eq!(normalize_address(" news.ycombinator.com ").as_deref(), Some("https://news.ycombinator.com"));
        assert_eq!(normalize_address(""), None);
        assert_eq!(normalize_address("how to cook rice"), None);
        assert_eq!(normalize_address("youtube"), None);
        assert_eq!(normalize_address("search?q=a.b"), None);
    }

    #[test]
    fn shell_classes() {
        assert!(is_shell_class("Progman"));
        assert!(is_shell_class("WorkerW"));
        assert!(is_shell_class("Shell_TrayWnd"));
        assert!(!is_shell_class("Chrome_WidgetWin_1"));
    }

    #[test]
    fn fullscreen_geometry() {
        let monitor = Rect { left: 0, top: 0, right: 1920, bottom: 1080 };
        assert!(covers(monitor, monitor));
        assert!(covers(Rect { left: -8, top: -8, right: 1928, bottom: 1088 }, monitor));
        // Maximized: stops at the taskbar.
        assert!(!covers(Rect { left: -8, top: -8, right: 1928, bottom: 1040 }, monitor));
        // Second monitor to the right.
        let second = Rect { left: 1920, top: 0, right: 4480, bottom: 1440 };
        assert!(covers(second, second));
        assert!(!covers(monitor, second));
        assert!(!covers(monitor, Rect { left: 0, top: 0, right: 0, bottom: 0 }));
    }

    #[test]
    fn fullscreen_rules() {
        let monitor = Rect { left: 0, top: 0, right: 1920, bottom: 1080 };
        let game = WindowFacts {
            class: "UnityWndClass",
            own: false,
            shell: false,
            minimized: false,
            maximized: false,
            rect: monitor,
            monitor,
        };
        assert!(is_fullscreen(&game));
        assert!(!is_fullscreen(&WindowFacts { own: true, ..game }));
        assert!(!is_fullscreen(&WindowFacts { shell: true, ..game }));
        assert!(!is_fullscreen(&WindowFacts { minimized: true, ..game }));
        assert!(!is_fullscreen(&WindowFacts { maximized: true, ..game }));
        assert!(!is_fullscreen(&WindowFacts { class: "WorkerW", ..game }));
        assert!(!is_fullscreen(&WindowFacts { rect: Rect { bottom: 1040, ..monitor }, ..game }));
    }

    #[test]
    fn tooltips() {
        assert_eq!(tray_tooltip("TodoPet — 😊 2/3"), "TodoPet — 😊 2/3");
        assert_eq!(tray_tooltip("a\nb"), "a\nb");
        assert_eq!(tray_tooltip("a\u{7}b"), "ab");
        let long = "😊".repeat(100);
        let cut = tray_tooltip(&long);
        assert_eq!(cut.chars().count(), 63);
        assert!(cut.encode_utf16().count() <= 127);
        assert_eq!(tray_tooltip(&"x".repeat(200)).len(), 127);
    }

    #[test]
    fn window_sizes_fit_the_work_area() {
        // Plenty of room: as designed.
        assert_eq!(fit_window_size((600.0, 760.0), Some((1920.0, 1040.0))), ((600.0, 760.0), (480.0, 480.0)));
        // 1366x768 at 125 %: about 1093x582 logical px of work area.
        assert_eq!(fit_window_size((600.0, 760.0), Some((1092.8, 582.4))), ((600.0, 542.4), (480.0, 480.0)));
        let ((w, h), (min_w, min_h)) = fit_window_size((1100.0, 800.0), Some((1024.0, 500.0)));
        assert_eq!((w, h), (984.0, 460.0));
        assert_eq!((min_w, min_h), (480.0, 460.0), "minimum never exceeds the size");
        // Absurdly small screens still get a usable window.
        assert_eq!(fit_window_size((600.0, 760.0), Some((200.0, 200.0))).0, (320.0, 320.0));
        // Unknown monitor: as designed.
        assert_eq!(fit_window_size((760.0, 720.0), None), ((760.0, 720.0), (480.0, 480.0)));
    }

    #[test]
    fn display_states() {
        assert_eq!(display_off(&0u32.to_le_bytes()), Some(true));
        assert_eq!(display_off(&1u32.to_le_bytes()), Some(false));
        // Dimmed: still on screen.
        assert_eq!(display_off(&2u32.to_le_bytes()), Some(false));
        assert_eq!(display_off(&7u32.to_le_bytes()), None, "unknown values change nothing");
        assert_eq!(display_off(&[0, 0]), None, "too short");
        assert_eq!(display_off(&[]), None);
    }

    #[test]
    fn unseen_sessions() {
        const ACTIVE: i32 = 0;
        const DISCONNECTED: i32 = 4;
        assert!(session_unseen(0, ACTIVE), "locked");
        assert!(!session_unseen(1, ACTIVE), "unlocked");
        assert!(!session_unseen(-1, ACTIVE), "WTS_SESSIONSTATE_UNKNOWN keeps the pet drawn");
        // A Remote Desktop session whose client went away runs on with no screen at all.
        assert!(session_unseen(1, DISCONNECTED));
        assert!(session_unseen(-1, DISCONNECTED));
    }

    #[test]
    fn cursor_conversion() {
        assert_eq!(cursor_to_css((300.0, 150.0), (100, 50), 2.0), (100.0, 50.0));
        assert_eq!(cursor_to_css((-10.0, 0.0), (0, 0), 1.25), (-8.0, 0.0));
        assert_eq!(cursor_to_css((10.0, 10.0), (0, 0), 0.0), (10.0, 10.0));
    }
}
