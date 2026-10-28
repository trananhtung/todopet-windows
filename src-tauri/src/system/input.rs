//! Idle time (`GetLastInputInfo`) and time since the last key press.
//!
//! The key press time comes from a low-level keyboard hook that records **only a timestamp**: it never
//! looks at which key was pressed (`lParam` is not read) and stores nothing else.

use std::sync::atomic::{AtomicU64, Ordering};

/// `GetTickCount64` value of the last key-down (or of app start, before the first key).
static LAST_KEY_TICK: AtomicU64 = AtomicU64::new(0);

#[cfg(windows)]
mod imp {
    use super::LAST_KEY_TICK;
    use std::sync::atomic::Ordering;
    use windows::Win32::Foundation::{HINSTANCE, LPARAM, LRESULT, WPARAM};
    use windows::Win32::System::LibraryLoader::GetModuleHandleW;
    use windows::Win32::System::SystemInformation::{GetTickCount, GetTickCount64};
    use windows::Win32::UI::Input::KeyboardAndMouse::{GetLastInputInfo, LASTINPUTINFO};
    use windows::Win32::UI::WindowsAndMessaging::{
        CallNextHookEx, DispatchMessageW, GetMessageW, SetWindowsHookExW, TranslateMessage, UnhookWindowsHookEx,
        HC_ACTION, MSG, WH_KEYBOARD_LL, WM_KEYDOWN, WM_SYSKEYDOWN,
    };

    pub fn tick_ms() -> u64 {
        // SAFETY: no arguments, cannot fail.
        unsafe { GetTickCount64() }
    }

    /// Runs on the hook thread for every key event system-wide; must return quickly.
    unsafe extern "system" fn keyboard_proc(code: i32, wparam: WPARAM, lparam: LPARAM) -> LRESULT {
        if code == HC_ACTION as i32 && (wparam.0 == WM_KEYDOWN as usize || wparam.0 == WM_SYSKEYDOWN as usize) {
            LAST_KEY_TICK.store(tick_ms(), Ordering::Relaxed);
        }
        // SAFETY: forwarding the unchanged arguments, as the hook contract requires.
        unsafe { CallNextHookEx(None, code, wparam, lparam) }
    }

    pub fn start_keyboard_hook() {
        let spawned = std::thread::Builder::new().name("keyboard-hook".into()).spawn(|| {
            // SAFETY: plain Win32 calls; the hook procedure above has the required signature, and this thread
            // pumps messages for as long as the hook is installed (low-level hooks are called through the
            // installing thread's message loop).
            unsafe {
                let module = GetModuleHandleW(None).ok().map(HINSTANCE::from);
                let hook = match SetWindowsHookExW(WH_KEYBOARD_LL, Some(keyboard_proc), module, 0) {
                    Ok(hook) => hook,
                    Err(e) => {
                        log::warn!("Keyboard hook unavailable, typing detection is off: {e}");
                        return;
                    }
                };
                let mut msg = MSG::default();
                while GetMessageW(&mut msg, None, 0, 0).0 > 0 {
                    let _ = TranslateMessage(&msg);
                    DispatchMessageW(&msg);
                }
                let _ = UnhookWindowsHookEx(hook);
            }
        });
        if let Err(e) = spawned {
            log::warn!("Could not start the keyboard hook thread: {e}");
        }
    }

    pub fn idle_seconds() -> f64 {
        let mut info = LASTINPUTINFO { cbSize: std::mem::size_of::<LASTINPUTINFO>() as u32, dwTime: 0 };
        // SAFETY: `info` is a properly sized LASTINPUTINFO.
        if unsafe { GetLastInputInfo(&mut info) }.as_bool() {
            // Both are 32-bit tick counts that wrap every 49.7 days; wrapping_sub keeps the difference right.
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

    pub fn start_keyboard_hook() {}

    pub fn idle_seconds() -> f64 {
        0.0
    }
}

/// Installs the keyboard hook on its own thread (Windows only).
pub fn start_keyboard_hook() {
    LAST_KEY_TICK.store(imp::tick_ms(), Ordering::Relaxed);
    imp::start_keyboard_hook();
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
