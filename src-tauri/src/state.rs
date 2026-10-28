//! App-wide state shared by the commands.

use std::time::Duration;

pub struct AppState {
    /// One HTTP client (connection pool, TLS config) for Todoist, Anthropic and calendar links.
    pub http: reqwest::Client,
    /// Launched with `--demo`: pages load with `?demo` and use the in-memory demo backend.
    pub demo: bool,
}

impl AppState {
    pub fn new(demo: bool) -> Result<Self, reqwest::Error> {
        let http = reqwest::Client::builder()
            .user_agent(concat!("TodoPet/", env!("CARGO_PKG_VERSION"), " (Windows)"))
            .connect_timeout(Duration::from_secs(10))
            // Never follow a redirect off HTTPS: tokens and calendar secrets must not go out in clear text.
            .redirect(reqwest::redirect::Policy::custom(|attempt| {
                if attempt.url().scheme() != "https" {
                    attempt.error("refused a redirect to a non-HTTPS address")
                } else if attempt.previous().len() >= 5 {
                    attempt.error("too many redirects")
                } else {
                    attempt.follow()
                }
            }))
            .build()?;
        Ok(Self { http, demo })
    }
}
