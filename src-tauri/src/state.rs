//! App-wide state shared by the commands.

use crate::net;
use std::sync::Mutex;
use std::time::{Duration, Instant};
use todopet_core::ratelimit::RateLimiter;

const USER_AGENT: &str = concat!("TodoPet/", env!("CARGO_PKG_VERSION"), " (Windows)");

pub struct AppState {
    /// Todoist and Anthropic: fixed HTTPS hosts that never need a redirect, so none is followed (a
    /// redirect could only carry the token somewhere it should not go).
    pub api: reqwest::Client,
    /// Calendar links: user-supplied addresses, so only public addresses are reachable (DNS answers,
    /// literal IPs and redirect targets are all checked) and redirects stay on HTTPS.
    pub ics: reqwest::Client,
    /// "Ask Claude" spends the user's credit: at most one request per 5 s and 20 per hour.
    pub claude_limiter: Mutex<RateLimiter>,
    /// Monotonic origin for the rate limiter.
    pub started: Instant,
    /// Launched with `--demo`: pages load with `?demo` and use the in-memory demo backend.
    pub demo: bool,
}

impl AppState {
    pub fn new(demo: bool) -> Result<Self, reqwest::Error> {
        let api = reqwest::Client::builder()
            .user_agent(USER_AGENT)
            .connect_timeout(Duration::from_secs(10))
            .https_only(true)
            .redirect(reqwest::redirect::Policy::none())
            .build()?;
        let ics = net::ics_client(USER_AGENT)?;
        Ok(Self { api, ics, claude_limiter: Mutex::new(RateLimiter::claude()), started: Instant::now(), demo })
    }

    /// Milliseconds since the app started (monotonic), for the rate limiter.
    pub fn uptime_ms(&self) -> u64 {
        u64::try_from(self.started.elapsed().as_millis()).unwrap_or(u64::MAX)
    }
}
