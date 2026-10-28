//! Idle time (`GetLastInputInfo`) and time since the last key press.
//!
//! The key press time comes from Raw Input: a hidden message-only window registers for keyboard input
//! with `RIDEV_INPUTSINK` (delivered while other apps are in front) and records **only the time of the
//! last key-down**. It reads nothing but the key-up flag of each event: never which key, never a key
//! code, and stores nothing else. Unlike a low-level keyboard hook, Raw Input sits in no other process's
//! input path, cannot slow down or swallow keystrokes, and is not silently removed by Windows when the
//! app is busy.

use std::sync::atomic::{AtomicU64, Ordering};

/// `GetTickCount64` value of the last key-down (or of app start, before the first key).
static LAST_KEY_TICK: AtomicU64 = AtomicU64::new(0);

#[cfg(windows)]
mod imp {
    use super::LAST_KEY_TICK;
    use std::sync::atomic::Ordering;
    use windows::core::{w, PCWSTR};
    use windows::Win32::Foundation::{HINSTANCE, HWND, LPARAM, LRESULT, WPARAM};
    use windows::Win32::System::LibraryLoader::GetModuleHandleW;
    use windows::Win32::System::SystemInformation::{GetTickCount, GetTickCount64};
    use windows::Win32::UI::Input::KeyboardAndMouse::{GetLastInputInfo, LASTINPUTINFO};
    use windows::Win32::UI::Input::{
        GetRawInputData, RegisterRawInputDevices, HRAWINPUT, RAWINPUT, RAWINPUTDEVICE, RAWINPUTHEADER, RIDEV_INPUTSINK,
        RID_INPUT, RIM_TYPEKEYBOARD,
    };
    use windows::Win32::UI::WindowsAndMessaging::{
        CreateWindowExW, DefWindowProcW, DispatchMessageW, GetMessageW, RegisterClassW, HWND_MESSAGE, MSG,
        RI_KEY_BREAK, WINDOW_EX_STYLE, WINDOW_STYLE, WM_INPUT, WNDCLASSW,
    };

    /// HID usage page "Generic Desktop" and usage "Keyboard".
    const USAGE_PAGE_GENERIC: u16 = 0x01;
    const USAGE_KEYBOARD: u16 = 0x06;
    const CLASS_NAME: PCWSTR = w!("TodoPetKeyboardActivity");

    pub fn tick_ms() -> u64 {
        // SAFETY: no arguments, cannot fail.
        unsafe { GetTickCount64() }
    }

    /// True when the raw input behind `lparam` is a key going down. Only the event type and the key-up
    /// flag are looked at.
    unsafe fn is_key_down(lparam: LPARAM) -> bool {
        let mut input = RAWINPUT::default();
        let mut size = std::mem::size_of::<RAWINPUT>() as u32;
        // SAFETY: `input` is a writable RAWINPUT of `size` bytes; a keyboard event always fits in one.
        let copied = unsafe {
            GetRawInputData(
                HRAWINPUT(lparam.0 as *mut _),
                RID_INPUT,
                Some((&raw mut input).cast()),
                &mut size,
                std::mem::size_of::<RAWINPUTHEADER>() as u32,
            )
        };
        if copied == u32::MAX || copied == 0 || input.header.dwType != RIM_TYPEKEYBOARD.0 {
            return false;
        }
        // SAFETY: the header says this is keyboard input, so `keyboard` is the initialized union member.
        let flags = unsafe { input.data.keyboard.Flags };
        u32::from(flags) & RI_KEY_BREAK == 0
    }

    unsafe extern "system" fn window_proc(hwnd: HWND, msg: u32, wparam: WPARAM, lparam: LPARAM) -> LRESULT {
        if msg == WM_INPUT && unsafe { is_key_down(lparam) } {
            LAST_KEY_TICK.store(tick_ms(), Ordering::Relaxed);
        }
        // WM_INPUT must reach DefWindowProc so the system can free the input data.
        // SAFETY: forwarding the unchanged arguments.
        unsafe { DefWindowProcW(hwnd, msg, wparam, lparam) }
    }

    pub fn start_key_watcher() {
        let spawned = std::thread::Builder::new().name("keyboard-activity".into()).spawn(|| {
            // SAFETY: plain Win32 calls with valid arguments; the window procedure above has the required
            // signature, and this thread pumps the message-only window's messages for the app's lifetime.
            unsafe {
                let instance: Option<HINSTANCE> = GetModuleHandleW(None).ok().map(HINSTANCE::from);
                let class = WNDCLASSW {
                    lpfnWndProc: Some(window_proc),
                    hInstance: instance.unwrap_or_default(),
                    lpszClassName: CLASS_NAME,
                    ..Default::default()
                };
                if RegisterClassW(&class) == 0 {
                    log::warn!("Typing detection is off: could not register its window class");
                    return;
                }
                let hwnd = match CreateWindowExW(
                    WINDOW_EX_STYLE(0),
                    CLASS_NAME,
                    PCWSTR::null(),
                    WINDOW_STYLE(0),
                    0,
                    0,
                    0,
                    0,
                    Some(HWND_MESSAGE),
                    None,
                    instance,
                    None,
                ) {
                    Ok(hwnd) => hwnd,
                    Err(e) => {
                        log::warn!("Typing detection is off: {e}");
                        return;
                    }
                };
                let device = RAWINPUTDEVICE {
                    usUsagePage: USAGE_PAGE_GENERIC,
                    usUsage: USAGE_KEYBOARD,
                    dwFlags: RIDEV_INPUTSINK,
                    hwndTarget: hwnd,
                };
                if let Err(e) = RegisterRawInputDevices(&[device], std::mem::size_of::<RAWINPUTDEVICE>() as u32) {
                    log::warn!("Typing detection is off: {e}");
                    return;
                }
                let mut msg = MSG::default();
                while GetMessageW(&mut msg, None, 0, 0).0 > 0 {
                    DispatchMessageW(&msg);
                }
            }
        });
        if let Err(e) = spawned {
            log::warn!("Could not start the typing detection thread: {e}");
        }
    }

    pub fn idle_seconds() -> f64 {
        let mut info = LASTINPUTINFO { cbSize: std::mem::size_of::<LASTINPUTINFO>() as u32, dwTime: 0 };
        // SAFETY: `info` is a properly sized LASTINPUTINFO.
        if unsafe { GetLastInputInfo(&mut info) }.as_bool() {
            // Both are 32-bit tick counts that wrap every 49.7 days; wrapping_sub keeps the difference right.
            // SAFETY: no arguments, cannot fail.
            let now = unsafe { GetTickCount() };
            f64::from(now.wrapping_sub(info.dwTime)) / 1000.0
        } else {
            0.0
        }
    }
}

#[cfg(not(windows))]
mod imp {
    use std::sync::OnceLock;
    use std::time::Instant;

    pub fn tick_ms() -> u64 {
        static START: OnceLock<Instant> = OnceLock::new();
        START.get_or_init(Instant::now).elapsed().as_millis() as u64
    }

    pub fn start_key_watcher() {}

    pub fn idle_seconds() -> f64 {
        0.0
    }
}

/// Starts watching for key presses on its own thread (Windows only).
pub fn start_key_watcher() {
    LAST_KEY_TICK.store(imp::tick_ms(), Ordering::Relaxed);
    imp::start_key_watcher();
}

/// Seconds since the last keyboard or mouse input.
pub fn idle_seconds() -> f64 {
    imp::idle_seconds()
}

/// Seconds since the last key press (since app start if none yet).
pub fn seconds_since_key() -> f64 {
    let elapsed = imp::tick_ms().saturating_sub(LAST_KEY_TICK.load(Ordering::Relaxed));
    elapsed as f64 / 1000.0
}
