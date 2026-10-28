//! The foreground window: its process, exe, title (browsers only), and whether it is a full-screen app.
//!
//! Window titles can carry private text (document names, chat partners, e-mail subjects), so a title is
//! read only when the window is a browser, where the page title is a fallback for the address.

use std::collections::HashMap;
use todopet_core::system::friendly_name_from_exe;

/// One look at the foreground window.
#[derive(Debug, Clone)]
pub struct Foreground {
    /// Raw `HWND` value, used only as a cache key.
    pub hwnd: isize,
    /// Lower-case exe file name, empty when the process could not be inspected.
    pub exe: String,
    pub exe_path: String,
    /// The window title for browsers, empty for every other app.
    pub title: String,
    /// The window belongs to TodoPet.
    pub own: bool,
    pub fullscreen: bool,
}

/// Display names per exe path ("Google Chrome" from chrome.exe's version info), cached because reading
/// version resources costs a few file reads.
#[derive(Default)]
pub struct Names {
    cache: HashMap<String, String>,
}

impl Names {
    pub fn friendly(&mut self, exe_path: &str, exe: &str) -> String {
        if let Some(name) = self.cache.get(exe_path) {
            return name.clone();
        }
        let name = imp::file_description(exe_path).unwrap_or_else(|| friendly_name_from_exe(exe));
        self.cache.insert(exe_path.to_owned(), name.clone());
        name
    }
}

pub fn current() -> Option<Foreground> {
    imp::current()
}

#[cfg(windows)]
mod imp {
    use super::Foreground;
    use std::ffi::c_void;
    use todopet_core::system::{browser_of, exe_file_name, is_fullscreen, Rect, WindowFacts};
    use windows::core::{PCWSTR, PWSTR};
    use windows::Win32::Foundation::{CloseHandle, HWND, RECT};
    use windows::Win32::Graphics::Gdi::{GetMonitorInfoW, MonitorFromWindow, MONITORINFO, MONITOR_DEFAULTTONEAREST};
    use windows::Win32::Storage::FileSystem::{GetFileVersionInfoSizeW, GetFileVersionInfoW, VerQueryValueW};
    use windows::Win32::System::Threading::{
        GetCurrentProcessId, OpenProcess, QueryFullProcessImageNameW, PROCESS_NAME_WIN32,
        PROCESS_QUERY_LIMITED_INFORMATION,
    };
    use windows::Win32::UI::WindowsAndMessaging::{
        GetClassNameW, GetDesktopWindow, GetForegroundWindow, GetShellWindow, GetWindowRect, GetWindowTextW,
        GetWindowThreadProcessId, IsIconic, IsZoomed,
    };

    fn wide(s: &str) -> Vec<u16> {
        s.encode_utf16().chain(std::iter::once(0)).collect()
    }

    fn to_rect(r: RECT) -> Rect {
        Rect { left: r.left, top: r.top, right: r.right, bottom: r.bottom }
    }

    /// SAFETY (all helpers below): `hwnd` may be stale by the time we use it; every API used here
    /// tolerates invalid handles by failing, and buffers are passed with their lengths.
    unsafe fn window_text(hwnd: HWND) -> String {
        let mut buf = [0u16; 512];
        let len = unsafe { GetWindowTextW(hwnd, &mut buf) };
        String::from_utf16_lossy(&buf[..len.clamp(0, 512) as usize])
    }

    unsafe fn class_name(hwnd: HWND) -> String {
        let mut buf = [0u16; 256];
        let len = unsafe { GetClassNameW(hwnd, &mut buf) };
        String::from_utf16_lossy(&buf[..len.clamp(0, 256) as usize])
    }

    unsafe fn process_path(pid: u32) -> Option<String> {
        let process = unsafe { OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid) }.ok()?;
        let mut buf = [0u16; 1024];
        let mut len = buf.len() as u32;
        let result =
            unsafe { QueryFullProcessImageNameW(process, PROCESS_NAME_WIN32, PWSTR(buf.as_mut_ptr()), &mut len) };
        let _ = unsafe { CloseHandle(process) };
        result.ok()?;
        Some(String::from_utf16_lossy(&buf[..(len as usize).min(buf.len())]))
    }

    unsafe fn window_rect(hwnd: HWND) -> Option<Rect> {
        let mut rect = RECT::default();
        unsafe { GetWindowRect(hwnd, &mut rect) }.ok()?;
        Some(to_rect(rect))
    }

    unsafe fn monitor_rect(hwnd: HWND) -> Option<Rect> {
        let monitor = unsafe { MonitorFromWindow(hwnd, MONITOR_DEFAULTTONEAREST) };
        let mut info = MONITORINFO { cbSize: std::mem::size_of::<MONITORINFO>() as u32, ..Default::default() };
        unsafe { GetMonitorInfoW(monitor, &mut info) }.as_bool().then(|| to_rect(info.rcMonitor))
    }

    pub fn current() -> Option<Foreground> {
        // SAFETY: see the helpers above; nothing here dereferences raw pointers.
        unsafe {
            let hwnd = GetForegroundWindow();
            if hwnd.0.is_null() {
                return None;
            }
            let mut pid = 0u32;
            GetWindowThreadProcessId(hwnd, Some(&mut pid));
            if pid == GetCurrentProcessId() {
                // One of TodoPet's own windows: the sampler ignores it, so nothing else is looked up.
                return Some(Foreground {
                    hwnd: hwnd.0 as isize,
                    exe: String::new(),
                    exe_path: String::new(),
                    title: String::new(),
                    own: true,
                    fullscreen: false,
                });
            }
            let exe_path = process_path(pid).unwrap_or_default();
            let exe = if exe_path.is_empty() { String::new() } else { exe_file_name(&exe_path) };
            let title = if browser_of(&exe).is_some() { window_text(hwnd) } else { String::new() };

            let class = class_name(hwnd);
            let fullscreen = match (window_rect(hwnd), monitor_rect(hwnd)) {
                (Some(rect), Some(monitor)) => is_fullscreen(&WindowFacts {
                    class: &class,
                    own: false,
                    shell: hwnd == GetShellWindow() || hwnd == GetDesktopWindow(),
                    minimized: IsIconic(hwnd).as_bool(),
                    maximized: IsZoomed(hwnd).as_bool(),
                    rect,
                    monitor,
                }),
                _ => false,
            };

            Some(Foreground { hwnd: hwnd.0 as isize, exe, exe_path, title, own: false, fullscreen })
        }
    }

    /// The `FileDescription` from the exe's version resource ("Google Chrome", "Discord").
    pub fn file_description(path: &str) -> Option<String> {
        if path.is_empty() {
            return None;
        }
        let path = wide(path);
        // SAFETY: `data` holds at least `size` bytes as reported by GetFileVersionInfoSizeW, in u32s so every
        // pointer VerQueryValueW returns into it is aligned for the u16 reads below; those pointers point
        // inside `data` (which outlives them) and are read with the length it reports.
        unsafe {
            let size = GetFileVersionInfoSizeW(PCWSTR(path.as_ptr()), None);
            if size == 0 {
                return None;
            }
            let mut data = vec![0u32; (size as usize).div_ceil(4)];
            GetFileVersionInfoW(PCWSTR(path.as_ptr()), None, size, data.as_mut_ptr().cast()).ok()?;

            let query = |sub_block: &str| -> Option<(*const c_void, u32)> {
                let sub_block = wide(sub_block);
                let mut ptr: *mut c_void = std::ptr::null_mut();
                let mut len = 0u32;
                let found =
                    VerQueryValueW(data.as_ptr().cast(), PCWSTR(sub_block.as_ptr()), &mut ptr, &mut len).as_bool();
                (found && !ptr.is_null() && len > 0).then_some((ptr.cast_const(), len))
            };

            // Language/code page pairs the resource declares, then the common US-English fallbacks.
            let mut translations: Vec<(u16, u16)> = Vec::new();
            if let Some((ptr, len)) = query("\\VarFileInfo\\Translation") {
                let words = std::slice::from_raw_parts(ptr.cast::<u16>(), (len / 2) as usize);
                translations.extend(words.as_chunks::<2>().0.iter().map(|&[lang, codepage]| (lang, codepage)));
            }
            translations.extend([(0x0409, 0x04b0), (0x0409, 0x04e4)]);

            translations.into_iter().find_map(|(lang, codepage)| {
                let (ptr, len) = query(&format!("\\StringFileInfo\\{lang:04x}{codepage:04x}\\FileDescription"))?;
                let chars = std::slice::from_raw_parts(ptr.cast::<u16>(), len as usize);
                let text = String::from_utf16_lossy(chars);
                let text = text.trim_end_matches('\0').trim();
                (!text.is_empty()).then(|| text.to_owned())
            })
        }
    }
}

#[cfg(not(windows))]
mod imp {
    use super::Foreground;

    pub fn current() -> Option<Foreground> {
        None
    }

    pub fn file_description(_path: &str) -> Option<String> {
        None
    }
}
