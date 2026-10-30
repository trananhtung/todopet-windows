//! Whether anyone can see the pet, and whether Windows asks apps to save power: the session being locked or a
//! Remote Desktop session being disconnected (`WTSQuerySessionInformationW`, read with every sample), the session's
//! display being off (a `GUID_SESSION_DISPLAY_STATUS` notification, kept in an atomic) and battery saver
//! (`GetSystemPowerStatus`). The overlay stops drawing while nobody can see the screen, and keeps the pet still on
//! battery saver.
//!
//! The Win32 parts are `#[cfg(windows)]`; on other targets everything reads "no".

use std::sync::atomic::{AtomicBool, Ordering};

/// Set by the display-state notification. Windows sends the current state as soon as it is registered.
static DISPLAY_OFF: AtomicBool = AtomicBool::new(false);

#[cfg(windows)]
mod imp {
    use super::DISPLAY_OFF;
    use std::ffi::c_void;
    use std::sync::atomic::Ordering;
    use todopet_core::system as rules;
    use windows::core::PWSTR;
    use windows::Win32::Foundation::HANDLE;
    use windows::Win32::System::Power::{
        GetSystemPowerStatus, PowerSettingRegisterNotification, DEVICE_NOTIFY_SUBSCRIBE_PARAMETERS,
        POWERBROADCAST_SETTING, SYSTEM_POWER_STATUS,
    };
    use windows::Win32::System::RemoteDesktop::{
        WTSFreeMemory, WTSQuerySessionInformationW, WTSSessionInfoEx, WTSINFOEXW, WTS_CURRENT_SESSION,
    };
    use windows::Win32::System::SystemServices::GUID_SESSION_DISPLAY_STATUS;
    use windows::Win32::UI::WindowsAndMessaging::{DEVICE_NOTIFY_CALLBACK, PBT_POWERSETTINGCHANGE};

    /// Called by Windows, on a thread of its own, with each change of this session's display state (the console's
    /// display, or the Remote Desktop client's).
    unsafe extern "system" fn on_power_setting(_context: *const c_void, kind: u32, setting: *const c_void) -> u32 {
        if kind == PBT_POWERSETTINGCHANGE && !setting.is_null() {
            let p = setting.cast::<POWERBROADCAST_SETTING>();
            // SAFETY: for PBT_POWERSETTINGCHANGE `setting` points to a POWERBROADCAST_SETTING whose `Data` runs on for
            // `DataLength` bytes. Raw pointers only (no reference to the 1-byte `Data` array), and at most the 4 bytes
            // a display state has are read.
            unsafe {
                if (*p).PowerSetting == GUID_SESSION_DISPLAY_STATUS {
                    let len = ((*p).DataLength as usize).min(4);
                    let data = std::slice::from_raw_parts((&raw const (*p).Data).cast::<u8>(), len);
                    if let Some(off) = rules::display_off(data) {
                        DISPLAY_OFF.store(off, Ordering::Relaxed);
                        // Rare (at registration, then each time the display goes off or on): the log shows the
                        // notification really arrives.
                        log::info!("Display {}", if off { "off" } else { "on" });
                    }
                }
            }
        }
        0
    }

    pub fn start() {
        // Registered for the app's lifetime, so the parameters are too (Windows may keep the pointer).
        let params = Box::leak(Box::new(DEVICE_NOTIFY_SUBSCRIBE_PARAMETERS {
            Callback: Some(on_power_setting),
            Context: std::ptr::null_mut(),
        }));
        let mut registration: *mut c_void = std::ptr::null_mut();
        // SAFETY: with DEVICE_NOTIFY_CALLBACK the recipient is a DEVICE_NOTIFY_SUBSCRIBE_PARAMETERS that lives forever
        // (leaked above), and the callback has the signature Windows expects.
        let result = unsafe {
            PowerSettingRegisterNotification(
                &GUID_SESSION_DISPLAY_STATUS,
                DEVICE_NOTIFY_CALLBACK,
                HANDLE(std::ptr::from_mut(params).cast()),
                &mut registration,
            )
        };
        if let Err(e) = result.ok() {
            log::warn!("Display on/off detection is off: {e}");
        }
    }

    /// The session is locked, or it is a Remote Desktop session with no client. Unknown (or the query failing) counts
    /// as seen, so the pet keeps being drawn. (Windows 7 reports the lock flags the wrong way round; TodoPet needs
    /// Windows 10 or 11.)
    pub fn locked() -> bool {
        let mut buffer = PWSTR::null();
        let mut bytes = 0u32;
        // SAFETY: on success Windows allocates `buffer` (a WTSINFOEXW for WTSSessionInfoEx) and it is freed below;
        // its size is checked before it is read.
        unsafe {
            if WTSQuerySessionInformationW(None, WTS_CURRENT_SESSION, WTSSessionInfoEx, &mut buffer, &mut bytes)
                .is_err()
                || buffer.is_null()
            {
                return false;
            }
            let mut unseen = false;
            if bytes as usize >= std::mem::size_of::<WTSINFOEXW>() {
                let info = &*buffer.0.cast::<WTSINFOEXW>();
                if info.Level == 1 {
                    let level1 = &info.Data.WTSInfoExLevel1;
                    unseen = rules::session_unseen(level1.SessionFlags, level1.SessionState.0);
                }
            }
            WTSFreeMemory(buffer.0.cast());
            unseen
        }
    }

    /// Battery saver is on. Microsoft documents `SystemStatusFlag` for battery saver only; whether Windows 11's
    /// energy saver sets it too is checked by hand (docs/checklist-frame-loop-windows.md).
    pub fn battery_saver() -> bool {
        let mut status = SYSTEM_POWER_STATUS::default();
        // SAFETY: `status` is a writable SYSTEM_POWER_STATUS.
        unsafe { GetSystemPowerStatus(&mut status) }.is_ok() && status.SystemStatusFlag == 1
    }
}

#[cfg(not(windows))]
mod imp {
    pub fn start() {}

    pub fn locked() -> bool {
        false
    }

    pub fn battery_saver() -> bool {
        false
    }
}

/// Starts listening for the display going off and on (Windows only).
pub fn start() {
    imp::start();
}

/// The session is locked (or a disconnected Remote Desktop session).
pub fn locked() -> bool {
    imp::locked()
}

/// The session's display is off (dimmed still counts as on).
pub fn display_off() -> bool {
    DISPLAY_OFF.load(Ordering::Relaxed)
}

/// Windows' battery saver is on.
pub fn battery_saver() -> bool {
    imp::battery_saver()
}
