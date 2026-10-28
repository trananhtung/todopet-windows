//! Response handling shared by the Todoist and Anthropic clients.

use reqwest::Response;
use serde_json::Value;
use todopet_core::{CmdError, CmdResult};

/// A transport-level failure (DNS, TLS, connection reset, timeout). The URL is left out of the message.
pub fn network_error(e: reqwest::Error) -> CmdError {
    if e.is_timeout() {
        CmdError::network("The request timed out")
    } else {
        CmdError::network(e.without_url().to_string())
    }
}

/// Turns a non-success response into an error (401 → unauthorized, 429 → rate_limited, else http).
pub async fn check_status(resp: Response) -> CmdResult<Response> {
    let status = resp.status();
    if status.is_success() {
        return Ok(resp);
    }
    let body = resp.text().await.unwrap_or_default();
    Err(CmdError::from_status(status.as_u16(), &body))
}

/// The JSON body of a successful response; an empty body (204) is `null`.
pub async fn json_body(resp: Response) -> CmdResult<Value> {
    let resp = check_status(resp).await?;
    let bytes = resp.bytes().await.map_err(network_error)?;
    if bytes.iter().all(u8::is_ascii_whitespace) {
        return Ok(Value::Null);
    }
    serde_json::from_slice(&bytes).map_err(|_| CmdError::http("The server returned invalid JSON"))
}
