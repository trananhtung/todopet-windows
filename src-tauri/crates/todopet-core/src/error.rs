//! The one error type every command returns. Serializes to `BackendErrorPayload` in `src/backend/types.ts`:
//! `{ kind, message, status? }`.

use serde::Serialize;
use std::fmt;

/// Mirrors `BackendErrorKind` on the TypeScript side.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum ErrorKind {
    /// The Todoist token or Anthropic key is not set.
    NoToken,
    /// HTTP 401: the token/key was refused.
    Unauthorized,
    /// HTTP 429.
    RateLimited,
    /// Any other non-success HTTP status, or a response we could not use.
    Http,
    /// Connection, DNS, TLS or timeout failure.
    Network,
    /// The input was refused before anything was sent.
    Invalid,
    /// Something on our side failed (file system, credential store, window).
    Internal,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct CmdError {
    pub kind: ErrorKind,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub status: Option<u16>,
}

pub type CmdResult<T> = Result<T, CmdError>;

impl CmdError {
    pub fn new(kind: ErrorKind, message: impl Into<String>) -> Self {
        Self { kind, message: message.into(), status: None }
    }

    pub fn no_token(message: impl Into<String>) -> Self {
        Self::new(ErrorKind::NoToken, message)
    }

    pub fn invalid(message: impl Into<String>) -> Self {
        Self::new(ErrorKind::Invalid, message)
    }

    pub fn internal(message: impl Into<String>) -> Self {
        Self::new(ErrorKind::Internal, message)
    }

    pub fn network(message: impl Into<String>) -> Self {
        Self::new(ErrorKind::Network, message)
    }

    pub fn http(message: impl Into<String>) -> Self {
        Self::new(ErrorKind::Http, message)
    }

    /// Maps a non-success HTTP response to an error: 401 → `unauthorized`, 429 → `rate_limited`, else `http`.
    /// The message carries the server's own explanation when the body has one.
    pub fn from_status(status: u16, body: &str) -> Self {
        let kind = match status {
            401 => ErrorKind::Unauthorized,
            429 => ErrorKind::RateLimited,
            _ => ErrorKind::Http,
        };
        let detail = error_detail(body);
        let message = if detail.is_empty() { format!("HTTP {status}") } else { format!("HTTP {status}: {detail}") };
        Self { kind, message, status: Some(status) }
    }
}

impl fmt::Display for CmdError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{:?}: {}", self.kind, self.message)
    }
}

impl std::error::Error for CmdError {}

const MAX_DETAIL_CHARS: usize = 300;

/// Pulls a human-readable reason out of an error body. Understands Todoist (`{"error": "..."}`),
/// Anthropic (`{"error": {"message": "..."}}`) and generic (`{"message": "..."}`) shapes; otherwise
/// returns the trimmed body. Capped at 300 characters.
pub fn error_detail(body: &str) -> String {
    let parsed = serde_json::from_str::<serde_json::Value>(body).ok();
    let from_json = parsed.as_ref().and_then(|v| {
        v.get("error")
            .and_then(|e| e.as_str().or_else(|| e.get("message").and_then(|m| m.as_str())))
            .or_else(|| v.get("message").and_then(|m| m.as_str()))
            .map(str::to_owned)
    });
    let text = from_json.unwrap_or_else(|| body.trim().to_owned());
    truncate_chars(text.trim(), MAX_DETAIL_CHARS)
}

/// Cuts `s` to at most `max` characters (never in the middle of a UTF-8 sequence).
pub fn truncate_chars(s: &str, max: usize) -> String {
    match s.char_indices().nth(max) {
        Some((idx, _)) => format!("{}…", &s[..idx]),
        None => s.to_owned(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn serializes_like_the_ts_payload() {
        let e = CmdError::from_status(429, "");
        let json = serde_json::to_value(&e).unwrap();
        assert_eq!(json, serde_json::json!({"kind": "rate_limited", "message": "HTTP 429", "status": 429}));

        let e = CmdError::no_token("Todoist token is not set");
        let json = serde_json::to_value(&e).unwrap();
        assert_eq!(json, serde_json::json!({"kind": "no_token", "message": "Todoist token is not set"}));
    }

    #[test]
    fn maps_statuses() {
        assert_eq!(CmdError::from_status(401, "").kind, ErrorKind::Unauthorized);
        assert_eq!(CmdError::from_status(429, "").kind, ErrorKind::RateLimited);
        assert_eq!(CmdError::from_status(500, "").kind, ErrorKind::Http);
        assert_eq!(CmdError::from_status(404, "").status, Some(404));
    }

    #[test]
    fn extracts_error_details() {
        assert_eq!(error_detail(r#"{"error":"Task not found","error_tag":"NOT_FOUND"}"#), "Task not found");
        assert_eq!(
            error_detail(r#"{"type":"error","error":{"type":"overloaded_error","message":"Overloaded"}}"#),
            "Overloaded"
        );
        assert_eq!(error_detail(r#"{"message":"nope"}"#), "nope");
        assert_eq!(error_detail("  plain text \n"), "plain text");
        assert_eq!(error_detail(""), "");
        let long = "x".repeat(1000);
        assert_eq!(error_detail(&long).chars().count(), MAX_DETAIL_CHARS + 1);
    }

    #[test]
    fn truncates_on_char_boundaries() {
        assert_eq!(truncate_chars("Việc cần làm", 4), "Việc…");
        assert_eq!(truncate_chars("abc", 3), "abc");
    }
}
