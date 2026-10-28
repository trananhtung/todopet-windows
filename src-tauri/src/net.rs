//! The calendar HTTP client: only public internet addresses are reachable.
//!
//! Calendar links come from the user (or from whatever pasted text ends up in Settings), and the request
//! runs with the app's network access, so a link must not reach `localhost`, the router or another
//! machine on the LAN. Three layers enforce `todopet_core::net`'s address rules:
//!
//! - the link and every redirect target are checked before connecting (scheme, `localhost`, literal IPs,
//!   which never go through DNS);
//! - a DNS resolver drops every private address from the answer, so the connection can only use the
//!   addresses that passed (no gap for DNS rebinding between check and connect);
//! - no proxy: through a proxy the target would be resolved by the proxy, out of reach of the check.

use reqwest::dns::{Addrs, Name, Resolve, Resolving};
use reqwest::redirect::{Attempt, Policy};
use std::error::Error as StdError;
use std::fmt;
use std::net::{SocketAddr, ToSocketAddrs};
use std::sync::Arc;
use std::time::Duration;
use todopet_core::net::{check_target, is_public_ip, Refused};

/// Redirects followed per calendar request.
pub const MAX_REDIRECTS: usize = 5;

type BoxError = Box<dyn StdError + Send + Sync>;

/// The calendar's host resolved only to private addresses.
#[derive(Debug)]
struct BlockedByResolver;

impl fmt::Display for BlockedByResolver {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(Refused::PrivateAddress.message())
    }
}

impl StdError for BlockedByResolver {}

/// System DNS (`getaddrinfo`, like reqwest's default), keeping only public addresses.
struct PublicOnlyResolver;

impl Resolve for PublicOnlyResolver {
    fn resolve(&self, name: Name) -> Resolving {
        let host = name.as_str().to_owned();
        Box::pin(async move {
            let found = tauri::async_runtime::spawn_blocking(move || {
                (host.as_str(), 0).to_socket_addrs().map(Iterator::collect::<Vec<SocketAddr>>)
            })
            .await
            .map_err(|e| -> BoxError { Box::new(e) })?
            .map_err(|e| -> BoxError { Box::new(e) })?;
            let public: Vec<SocketAddr> = found.into_iter().filter(|addr| is_public_ip(addr.ip())).collect();
            if public.is_empty() {
                return Err(Box::new(BlockedByResolver) as BoxError);
            }
            Ok(Box::new(public.into_iter()) as Addrs)
        })
    }
}

/// HTTPS only, at most [`MAX_REDIRECTS`] hops, every hop checked like the link itself.
fn redirect_policy(attempt: Attempt<'_>) -> reqwest::redirect::Action {
    if attempt.previous().len() > MAX_REDIRECTS {
        return attempt.error("The calendar redirected too many times");
    }
    match check_target(attempt.url()) {
        Ok(()) => attempt.follow(),
        Err(refused) => attempt.error(refused),
    }
}

pub fn ics_client(user_agent: &str) -> Result<reqwest::Client, reqwest::Error> {
    reqwest::Client::builder()
        .user_agent(user_agent)
        .connect_timeout(Duration::from_secs(10))
        .https_only(true)
        .no_proxy()
        .dns_resolver(Arc::new(PublicOnlyResolver))
        .redirect(Policy::custom(redirect_policy))
        .build()
}

/// A calendar fetch failure in words, without the link: reqwest's own messages can contain the URL, and
/// for a calendar the URL is the secret.
pub fn describe_ics_error(e: &reqwest::Error) -> String {
    if e.is_timeout() {
        return "The request timed out".into();
    }
    let mut source: Option<&(dyn StdError + 'static)> = e.source();
    while let Some(err) = source {
        if let Some(refused) = err.downcast_ref::<Refused>() {
            return refused.message().into();
        }
        if err.is::<BlockedByResolver>() {
            return Refused::PrivateAddress.message().into();
        }
        source = err.source();
    }
    if e.is_redirect() {
        "The calendar redirected too many times".into()
    } else if e.is_connect() {
        "Could not connect to the calendar server".into()
    } else if e.is_body() || e.is_decode() {
        "The download was interrupted".into()
    } else {
        "Network error".into()
    }
}
