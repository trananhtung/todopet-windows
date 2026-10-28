//! The active tab's address in Chromium browsers and Firefox, read from the address bar with UI
//! Automation. Addresses stay in memory: they are only passed to the overlay for the distraction rules.
//!
//! UI Automation calls cross into the browser process and can take tens of milliseconds, or much longer
//! when the browser hangs. They run on a worker thread of their own, so the 1 Hz sampler never blocks on
//! them: it waits a short deadline for a fresh answer and otherwise goes on with the last one, which keeps
//! idle time, full-screen state and the foreground app current even while a browser is stuck.
//!
//! Results are cached per (window, title): the title changes on almost every navigation, and the cache
//! also expires after a few seconds for pages that keep their title.

use std::sync::mpsc::{self, Receiver, RecvTimeoutError, SyncSender, TryRecvError, TrySendError};
use std::time::{Duration, Instant};
use todopet_core::system::{normalize_address, Browser};

const MAX_AGE: Duration = Duration::from_secs(10);
/// How long the sampler waits for the worker before using what it has.
const WAIT_FOR_WORKER: Duration = Duration::from_millis(150);
/// A request older than this when the worker gets to it is dropped unanswered.
const STALE_REQUEST: Duration = Duration::from_secs(3);
/// A request outstanding this long means the worker is stuck in a hung browser; logged once.
const STUCK_AFTER: Duration = Duration::from_secs(15);

#[derive(Debug, Clone, PartialEq, Eq)]
struct Key {
    hwnd: isize,
    title: String,
}

struct Job {
    key: Key,
    browser: Browser,
    issued: Instant,
}

struct Answer {
    key: Key,
    url: Option<String>,
    /// False when the request was too old and the browser was not asked; nothing to cache then.
    read: bool,
}

struct Cached {
    key: Key,
    url: Option<String>,
    at: Instant,
}

/// Lives on the sampler thread; the UI Automation client lives on the worker thread it starts.
pub struct Reader {
    jobs: Option<SyncSender<Job>>,
    answers: Option<Receiver<Answer>>,
    cache: Option<Cached>,
    /// The request the worker is busy with, and when it was sent.
    pending: Option<(Key, Instant)>,
    warned_stuck: bool,
}

impl Default for Reader {
    fn default() -> Self {
        let (jobs, job_rx) = mpsc::sync_channel::<Job>(1);
        let (answer_tx, answers) = mpsc::channel::<Answer>();
        let spawned =
            std::thread::Builder::new().name("browser-address".into()).spawn(move || worker(job_rx, answer_tx));
        match spawned {
            Ok(_) => Self { jobs: Some(jobs), answers: Some(answers), cache: None, pending: None, warned_stuck: false },
            Err(e) => {
                log::warn!("Could not start the browser address reader, addresses are off: {e}");
                Self { jobs: None, answers: None, cache: None, pending: None, warned_stuck: false }
            }
        }
    }
}

impl Reader {
    /// The normalized address of `hwnd`'s active tab, or `None` when it cannot be read (yet), or the user
    /// is typing a search in the address bar.
    pub fn read(&mut self, hwnd: isize, title: &str, browser: Browser) -> Option<String> {
        self.collect_answers();
        let key = Key { hwnd, title: title.to_owned() };
        if let Some(c) = self.cache.as_ref().filter(|c| c.key == key && c.at.elapsed() < MAX_AGE) {
            return c.url.clone();
        }

        if self.pending.is_none() {
            let job = Job { key: key.clone(), browser, issued: Instant::now() };
            match self.jobs.as_ref().map(|jobs| jobs.try_send(job)) {
                Some(Ok(())) => self.pending = Some((key.clone(), Instant::now())),
                Some(Err(TrySendError::Full(_))) | None => {}
                Some(Err(TrySendError::Disconnected(_))) => {
                    log::warn!("The browser address reader stopped, addresses are off");
                    self.jobs = None;
                }
            }
        }
        if self.pending.as_ref().is_some_and(|(k, _)| *k == key) {
            self.wait_for_answer();
        }
        if let Some((_, since)) = &self.pending {
            if since.elapsed() > STUCK_AFTER && !self.warned_stuck {
                log::warn!("Reading the browser address is taking very long (the browser may be hung)");
                self.warned_stuck = true;
            }
        }

        // Fresh answer for this tab, or the last one for it while a new read is on its way.
        self.cache.as_ref().filter(|c| c.key == key).and_then(|c| c.url.clone())
    }

    fn store(&mut self, answer: Answer) {
        if self.pending.as_ref().is_some_and(|(k, _)| *k == answer.key) {
            self.pending = None;
            self.warned_stuck = false;
        }
        if answer.read {
            self.cache = Some(Cached { key: answer.key, url: answer.url, at: Instant::now() });
        }
    }

    fn collect_answers(&mut self) {
        let Some(answers) = self.answers.as_ref() else { return };
        let mut received = Vec::new();
        loop {
            match answers.try_recv() {
                Ok(answer) => received.push(answer),
                Err(TryRecvError::Empty) => break,
                Err(TryRecvError::Disconnected) => {
                    self.answers = None;
                    self.pending = None;
                    break;
                }
            }
        }
        for answer in received {
            self.store(answer);
        }
    }

    fn wait_for_answer(&mut self) {
        let Some(answers) = self.answers.as_ref() else { return };
        match answers.recv_timeout(WAIT_FOR_WORKER) {
            Ok(answer) => self.store(answer),
            Err(RecvTimeoutError::Timeout) => {}
            Err(RecvTimeoutError::Disconnected) => {
                self.answers = None;
                self.pending = None;
            }
        }
    }
}

/// The worker loop: one UI Automation client (COM, initialized on this thread), one request at a time.
/// Stale requests are answered with `None` without touching the browser.
fn worker(jobs: Receiver<Job>, answers: mpsc::Sender<Answer>) {
    let mut client = imp::Client::new();
    for job in jobs {
        let answer = if job.issued.elapsed() > STALE_REQUEST {
            Answer { key: job.key, url: None, read: false }
        } else {
            let url = client.address_bar_text(job.key.hwnd, job.browser).and_then(|text| normalize_address(&text));
            Answer { key: job.key, url, read: true }
        };
        if answers.send(answer).is_err() {
            return;
        }
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
        CUIAutomation8, IUIAutomation, IUIAutomation2, IUIAutomationCondition, IUIAutomationElement,
        IUIAutomationValuePattern, TreeScope_Descendants, UIA_AutomationIdPropertyId, UIA_ClassNamePropertyId,
        UIA_ControlTypePropertyId, UIA_EditControlTypeId, UIA_ToolBarControlTypeId, UIA_ValuePatternId,
        UIA_PROPERTY_ID,
    };

    /// Chromium's address bar (Chrome, Edge, Brave, Vivaldi, Opera, Arc): the views class of the omnibox.
    const CHROMIUM_OMNIBOX_CLASS: &str = "OmniboxViewViews";
    /// Firefox's navigation toolbar and the address field inside it; ids are the same in every language.
    const FIREFOX_NAV_BAR_ID: &str = "nav-bar";
    const FIREFOX_URLBAR_ID: &str = "urlbar-input";
    /// Upper bound for one cross-process UI Automation call, so a hung browser frees the worker.
    const UIA_TIMEOUT_MS: u32 = 1500;

    pub struct Client {
        automation: Option<IUIAutomation>,
    }

    impl Client {
        /// Initializes COM for the worker thread and creates the UI Automation client.
        pub fn new() -> Self {
            // SAFETY: COM initialization for this (worker) thread, then creating the in-process UIA client.
            let created = unsafe {
                // S_FALSE (already initialized) and RPC_E_CHANGED_MODE are fine: COM is usable either way.
                let _ = CoInitializeEx(None, COINIT_MULTITHREADED);
                // CUIAutomation8 (Windows 8+) implements IUIAutomation2, whose timeouts we need.
                CoCreateInstance::<_, IUIAutomation>(&CUIAutomation8, None, CLSCTX_INPROC_SERVER)
            };
            let automation = match created {
                Ok(automation) => automation,
                Err(e) => {
                    log::warn!("UI Automation unavailable, browser addresses are off: {e}");
                    return Self { automation: None };
                }
            };
            match automation.cast::<IUIAutomation2>() {
                // SAFETY: plain setters on a live COM object.
                Ok(automation2) => unsafe {
                    if let Err(e) = automation2.SetConnectionTimeout(UIA_TIMEOUT_MS) {
                        log::warn!("Could not set the UI Automation connection timeout: {e}");
                    }
                    if let Err(e) = automation2.SetTransactionTimeout(UIA_TIMEOUT_MS) {
                        log::warn!("Could not set the UI Automation transaction timeout: {e}");
                    }
                },
                Err(e) => log::warn!("UI Automation has no timeouts (IUIAutomation2 unavailable): {e}"),
            }
            Self { automation: Some(automation) }
        }

        pub fn address_bar_text(&mut self, hwnd: isize, browser: Browser) -> Option<String> {
            let automation = self.automation.as_ref()?;
            // SAFETY: COM calls on live interfaces; the HWND may be stale, in which case UIA returns an error.
            unsafe {
                let root = automation.ElementFromHandle(HWND(hwnd as *mut _)).ok()?;
                let field = match browser {
                    // Matched by class, never "the first Edit": page content comes after the toolbar in the
                    // tree but a window without a toolbar (app windows, kiosk) would otherwise fall through
                    // to text fields of the page.
                    Browser::Chromium => {
                        let edit =
                            condition(automation, UIA_ControlTypePropertyId, VARIANT::from(UIA_EditControlTypeId.0))?;
                        let omnibox =
                            condition(automation, UIA_ClassNamePropertyId, VARIANT::from(CHROMIUM_OMNIBOX_CLASS))?;
                        first(&root, &automation.CreateAndCondition(&edit, &omnibox).ok()?)?
                    }
                    // Only inside the navigation toolbar: a page can give an element any id it likes.
                    Browser::Firefox => {
                        let toolbar = condition(
                            automation,
                            UIA_ControlTypePropertyId,
                            VARIANT::from(UIA_ToolBarControlTypeId.0),
                        )?;
                        let nav_id =
                            condition(automation, UIA_AutomationIdPropertyId, VARIANT::from(FIREFOX_NAV_BAR_ID))?;
                        let nav_bar = first(&root, &automation.CreateAndCondition(&toolbar, &nav_id).ok()?)?;
                        let edit =
                            condition(automation, UIA_ControlTypePropertyId, VARIANT::from(UIA_EditControlTypeId.0))?;
                        let url_id =
                            condition(automation, UIA_AutomationIdPropertyId, VARIANT::from(FIREFOX_URLBAR_ID))?;
                        first(&nav_bar, &automation.CreateAndCondition(&edit, &url_id).ok()?)
                            .or_else(|| first(&nav_bar, &edit))?
                    }
                };
                let value: IUIAutomationValuePattern = field.GetCurrentPatternAs(UIA_ValuePatternId).ok()?;
                Some(value.CurrentValue().ok()?.to_string())
            }
        }
    }

    unsafe fn condition(
        automation: &IUIAutomation,
        property: UIA_PROPERTY_ID,
        value: VARIANT,
    ) -> Option<IUIAutomationCondition> {
        // SAFETY: COM call on a live interface.
        unsafe { automation.CreatePropertyCondition(property, &value) }.ok()
    }

    unsafe fn first(root: &IUIAutomationElement, condition: &IUIAutomationCondition) -> Option<IUIAutomationElement> {
        // SAFETY: COM call on live interfaces.
        unsafe { root.FindFirst(TreeScope_Descendants, condition) }.ok()
    }
}

#[cfg(not(windows))]
mod imp {
    use todopet_core::system::Browser;

    pub struct Client;

    impl Client {
        pub fn new() -> Self {
            Self
        }

        pub fn address_bar_text(&mut self, _hwnd: isize, _browser: Browser) -> Option<String> {
            None
        }
    }
}
