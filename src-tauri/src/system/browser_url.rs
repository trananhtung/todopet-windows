//! The active tab's address in Chromium browsers and Firefox, read from the address bar with UI
//! Automation. Addresses stay in memory: they are only passed to the overlay for the distraction rules.
//!
//! UI Automation calls cross into the browser process and can take tens of milliseconds, so results are
//! cached per (window, title): the title changes on almost every navigation, and the cache also expires
//! after a few seconds for pages that keep their title.

use std::time::{Duration, Instant};
use todopet_core::system::{normalize_address, Browser};

const MAX_AGE: Duration = Duration::from_secs(10);

struct Cached {
    hwnd: isize,
    title: String,
    url: Option<String>,
    at: Instant,
}

/// Lives on the sampler thread (the UI Automation client is a COM object bound to it).
#[derive(Default)]
pub struct Reader {
    cache: Option<Cached>,
    uia: imp::Client,
}

impl Reader {
    /// The normalized address of `hwnd`'s active tab, or `None` when it cannot be read or the user is
    /// typing a search in the address bar.
    pub fn read(&mut self, hwnd: isize, title: &str, browser: Browser) -> Option<String> {
        if let Some(c) = &self.cache {
            if c.hwnd == hwnd && c.title == title && c.at.elapsed() < MAX_AGE {
                return c.url.clone();
            }
        }
        let url = self.uia.address_bar_text(hwnd, browser).and_then(|text| normalize_address(&text));
        self.cache = Some(Cached { hwnd, title: title.to_owned(), url: url.clone(), at: Instant::now() });
        url
    }
}

#[cfg(windows)]
mod imp {
    use todopet_core::system::Browser;
    use windows::core::Interface;
    use windows::Win32::Foundation::HWND;
    use windows::Win32::System::Com::{CoCreateInstance, CoInitializeEx, CLSCTX_INPROC_SERVER, COINIT_MULTITHREADED};
    use windows::Win32::System::Variant::VARIANT;
    use windows::Win32::UI::Accessibility::{
        CUIAutomation, IUIAutomation, IUIAutomation2, IUIAutomationCondition, IUIAutomationElement,
        IUIAutomationValuePattern, TreeScope_Descendants, UIA_AutomationIdPropertyId, UIA_ControlTypePropertyId,
        UIA_EditControlTypeId, UIA_ValuePatternId,
    };

    /// Firefox's address bar has a stable automation id in every language.
    const FIREFOX_URLBAR_ID: &str = "urlbar-input";
    /// Upper bound for one cross-process UI Automation call, so a hung browser cannot stall the sampler.
    const UIA_TIMEOUT_MS: u32 = 1500;

    #[derive(Default)]
    pub struct Client {
        automation: Option<IUIAutomation>,
        failed: bool,
    }

    impl Client {
        fn automation(&mut self) -> Option<&IUIAutomation> {
            if self.automation.is_none() && !self.failed {
                // SAFETY: COM initialization for this (sampler) thread, then creating the in-process UIA client.
                let created = unsafe {
                    // S_FALSE (already initialized) and RPC_E_CHANGED_MODE are fine: COM is usable either way.
                    let _ = CoInitializeEx(None, COINIT_MULTITHREADED);
                    CoCreateInstance::<_, IUIAutomation>(&CUIAutomation, None, CLSCTX_INPROC_SERVER)
                };
                match created {
                    Ok(automation) => {
                        if let Ok(automation2) = automation.cast::<IUIAutomation2>() {
                            // SAFETY: plain setters on a live COM object.
                            unsafe {
                                let _ = automation2.SetConnectionTimeout(UIA_TIMEOUT_MS);
                                let _ = automation2.SetTransactionTimeout(UIA_TIMEOUT_MS);
                            }
                        }
                        self.automation = Some(automation);
                    }
                    Err(e) => {
                        log::warn!("UI Automation unavailable, browser addresses are off: {e}");
                        self.failed = true;
                    }
                }
            }
            self.automation.as_ref()
        }

        pub fn address_bar_text(&mut self, hwnd: isize, browser: Browser) -> Option<String> {
            let automation = self.automation()?.clone();
            // SAFETY: COM calls on live interfaces; the HWND may be stale, in which case UIA returns an error.
            unsafe {
                let root = automation.ElementFromHandle(HWND(hwnd as *mut _)).ok()?;
                let edit = automation
                    .CreatePropertyCondition(UIA_ControlTypePropertyId, &VARIANT::from(UIA_EditControlTypeId.0))
                    .ok()?;
                let field = match browser {
                    Browser::Firefox => {
                        let by_id = automation
                            .CreatePropertyCondition(UIA_AutomationIdPropertyId, &VARIANT::from(FIREFOX_URLBAR_ID))
                            .ok()?;
                        let both = automation.CreateAndCondition(&edit, &by_id).ok()?;
                        first(&root, &both).or_else(|| first(&root, &edit))
                    }
                    // The omnibox is the first Edit in Chromium's tree: the toolbar comes before page content.
                    Browser::Chromium => first(&root, &edit),
                }?;
                let value: IUIAutomationValuePattern = field.GetCurrentPatternAs(UIA_ValuePatternId).ok()?;
                Some(value.CurrentValue().ok()?.to_string())
            }
        }
    }

    unsafe fn first(root: &IUIAutomationElement, condition: &IUIAutomationCondition) -> Option<IUIAutomationElement> {
        // SAFETY: COM call on live interfaces.
        unsafe { root.FindFirst(TreeScope_Descendants, condition) }.ok()
    }
}

#[cfg(not(windows))]
mod imp {
    use todopet_core::system::Browser;

    #[derive(Default)]
    pub struct Client;

    impl Client {
        pub fn address_bar_text(&mut self, _hwnd: isize, _browser: Browser) -> Option<String> {
            None
        }
    }
}
