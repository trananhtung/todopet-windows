//! "Ask Claude" task splitting: the Messages API request body and response parsing.
//!
//! Rust has no official Anthropic SDK, so the app sends this body over raw HTTP. Structured outputs
//! (`output_config.format`) make the reply a JSON object `{ "steps": [...] }`; server-side `fallbacks`
//! re-run a request the model's safety classifiers decline on another model instead of failing.

use crate::{validate, CmdError, CmdResult};
use serde::Deserialize;
use serde_json::{json, Value};

pub const API_URL: &str = "https://api.anthropic.com/v1/messages";
pub const API_VERSION: &str = "2023-06-01";
/// Beta header that enables `"fallbacks": "default"`.
pub const BETA: &str = "server-side-fallback-2026-07-01";
pub const DEFAULT_MODEL: &str = "claude-opus-5-5";
pub const MAX_TOKENS: u32 = 4000;
/// Claude is asked for 3–5 steps; a few more are tolerated, the rest dropped.
pub const MAX_STEPS: usize = 6;

const MAX_TITLE_CHARS: usize = 500;
const MAX_NOTES_CHARS: usize = 4000;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Lang {
    En,
    Vi,
}

impl Lang {
    /// `"vi"` (or `"vi-VN"`) → Vietnamese, anything else → English.
    pub fn from_code(code: &str) -> Self {
        if code.trim().to_ascii_lowercase().starts_with("vi") {
            Lang::Vi
        } else {
            Lang::En
        }
    }
}

pub fn system_prompt(lang: Lang) -> &'static str {
    match lang {
        Lang::En => "You help someone start a task they keep postponing. Split it into 3–5 concrete steps, each doable in 15–30 minutes, starting with a verb, under 70 characters. The first step must be the easiest one to start right away. Write in English.",
        Lang::Vi => "Bạn giúp người dùng bắt đầu một việc họ cứ trì hoãn. Chia việc thành 3–5 bước cụ thể, mỗi bước làm xong trong 15–30 phút, bắt đầu bằng động từ, dưới 70 ký tự. Bước đầu tiên phải là bước dễ nhất để bắt tay vào ngay. Viết bằng tiếng Việt.",
    }
}

/// `Task: <title>\nNotes: <notes>` (Vietnamese labels for Vietnamese). The notes line is left out when
/// there are no notes.
pub fn user_message(lang: Lang, title: &str, notes: Option<&str>) -> String {
    let (task_label, notes_label) = match lang {
        Lang::En => ("Task", "Notes"),
        Lang::Vi => ("Việc", "Ghi chú"),
    };
    match notes.map(str::trim).filter(|n| !n.is_empty()) {
        Some(notes) => format!("{task_label}: {title}\n{notes_label}: {notes}"),
        None => format!("{task_label}: {title}"),
    }
}

/// The model to use: the given id, or [`DEFAULT_MODEL`] when absent/blank. Ids are restricted to the
/// characters model names use.
pub fn model_or_default(model: Option<&str>) -> CmdResult<String> {
    let model = model.map(str::trim).filter(|m| !m.is_empty()).unwrap_or(DEFAULT_MODEL);
    let ok = model.len() <= 100
        && model.bytes().all(|b| b.is_ascii_alphanumeric() || matches!(b, b'-' | b'.' | b'_' | b':' | b'@'));
    if ok {
        Ok(model.to_owned())
    } else {
        Err(CmdError::invalid("Invalid model name"))
    }
}

/// Validated inputs of one split request.
#[derive(Debug, Clone, PartialEq)]
pub struct SplitRequest {
    pub model: String,
    pub lang: Lang,
    pub title: String,
    pub notes: Option<String>,
}

impl SplitRequest {
    pub fn new(title: &str, notes: Option<&str>, lang: &str, model: Option<&str>) -> CmdResult<Self> {
        let title = validate::text(title, "Task", MAX_TITLE_CHARS)?;
        let notes = match notes.map(str::trim).filter(|n| !n.is_empty()) {
            Some(n) => Some(validate::text(n, "Notes", MAX_NOTES_CHARS)?),
            None => None,
        };
        Ok(Self { model: model_or_default(model)?, lang: Lang::from_code(lang), title, notes })
    }

    /// The Messages API request body.
    pub fn body(&self) -> Value {
        json!({
            "model": self.model,
            "max_tokens": MAX_TOKENS,
            "fallbacks": "default",
            "output_config": {
                "effort": "low",
                "format": {
                    "type": "json_schema",
                    "schema": {
                        "type": "object",
                        "properties": { "steps": { "type": "array", "items": { "type": "string" } } },
                        "required": ["steps"],
                        "additionalProperties": false
                    }
                }
            },
            "system": system_prompt(self.lang),
            "messages": [
                { "role": "user", "content": user_message(self.lang, &self.title, self.notes.as_deref()) }
            ]
        })
    }
}

#[derive(Deserialize)]
struct Steps {
    steps: Vec<String>,
}

/// Extracts the steps from a Messages API response.
///
/// A refusal (`stop_reason: "refusal"`, possibly after every fallback declined too) is an `invalid` error.
/// Otherwise the first `text` block is the JSON answer; `thinking` and `fallback` marker blocks are skipped.
pub fn parse_steps(response: &Value) -> CmdResult<Vec<String>> {
    if response.get("stop_reason").and_then(Value::as_str) == Some("refusal") {
        return Err(CmdError::invalid("Claude declined this request"));
    }
    let text = response
        .get("content")
        .and_then(Value::as_array)
        .and_then(|blocks| {
            blocks
                .iter()
                .find(|b| b.get("type").and_then(Value::as_str) == Some("text"))
                .and_then(|b| b.get("text").and_then(Value::as_str))
        })
        .ok_or_else(|| CmdError::http("Claude returned no answer"))?;

    let parsed: Steps = serde_json::from_str(text.trim())
        .or_else(|_| {
            // Tolerate stray text around the object (should not happen with structured outputs).
            let start = text.find('{').ok_or(())?;
            let end = text.rfind('}').ok_or(())?;
            serde_json::from_str(text.get(start..=end).ok_or(())?).map_err(|_| ())
        })
        .map_err(|_| CmdError::http("Claude's answer was not in the expected format"))?;

    let steps: Vec<String> =
        parsed.steps.into_iter().map(|s| s.trim().to_owned()).filter(|s| !s.is_empty()).take(MAX_STEPS).collect();
    if steps.is_empty() {
        return Err(CmdError::http("Claude returned no steps"));
    }
    Ok(steps)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ErrorKind;

    #[test]
    fn languages() {
        assert_eq!(Lang::from_code("vi"), Lang::Vi);
        assert_eq!(Lang::from_code("vi-VN"), Lang::Vi);
        assert_eq!(Lang::from_code("en"), Lang::En);
        assert_eq!(Lang::from_code(""), Lang::En);
    }

    #[test]
    fn user_messages() {
        assert_eq!(
            user_message(Lang::En, "Tax return", Some("Need receipts")),
            "Task: Tax return\nNotes: Need receipts"
        );
        assert_eq!(user_message(Lang::Vi, "Khai thuế", Some("Cần hóa đơn")), "Việc: Khai thuế\nGhi chú: Cần hóa đơn");
        assert_eq!(user_message(Lang::En, "Tax return", Some("  ")), "Task: Tax return");
        assert_eq!(user_message(Lang::En, "Tax return", None), "Task: Tax return");
    }

    #[test]
    fn models() {
        assert_eq!(model_or_default(None).unwrap(), DEFAULT_MODEL);
        assert_eq!(model_or_default(Some(" ")).unwrap(), DEFAULT_MODEL);
        assert_eq!(model_or_default(Some("claude-sonnet-5-5")).unwrap(), "claude-sonnet-5-5");
        assert!(model_or_default(Some("x\"}")).is_err());
    }

    #[test]
    fn request_body() {
        let req = SplitRequest::new(" Tax return ", Some("receipts"), "en", Some("")).unwrap();
        let body = req.body();
        assert_eq!(body["model"], "claude-opus-5-5");
        assert_eq!(body["max_tokens"], 4000);
        assert_eq!(body["fallbacks"], "default");
        assert_eq!(body["output_config"]["effort"], "low");
        assert_eq!(body["output_config"]["format"]["type"], "json_schema");
        assert_eq!(body["output_config"]["format"]["schema"]["required"], json!(["steps"]));
        assert_eq!(body["output_config"]["format"]["schema"]["additionalProperties"], false);
        assert_eq!(body["system"], system_prompt(Lang::En));
        assert_eq!(body["messages"], json!([{"role": "user", "content": "Task: Tax return\nNotes: receipts"}]));
        assert!(body.get("thinking").is_none() && body.get("temperature").is_none());

        let vi = SplitRequest::new("Khai thuế", None, "vi", None).unwrap();
        assert_eq!(vi.body()["system"], system_prompt(Lang::Vi));
        assert!(SplitRequest::new("  ", None, "en", None).is_err());
    }

    #[test]
    fn parses_steps() {
        let resp = json!({
            "stop_reason": "end_turn",
            "content": [
                {"type": "thinking", "thinking": ""},
                {"type": "text", "text": "{\"steps\": [\" Open the tax portal \", \"\", \"Download last year's form\", \"Sort receipts\"]}"}
            ]
        });
        assert_eq!(
            parse_steps(&resp).unwrap(),
            vec!["Open the tax portal", "Download last year's form", "Sort receipts"]
        );
    }

    #[test]
    fn skips_fallback_markers_and_caps_steps() {
        let steps: Vec<String> = (1..=9).map(|i| format!("Step {i}")).collect();
        let resp = json!({
            "stop_reason": "end_turn",
            "content": [
                {"type": "fallback", "from": {"model": "claude-opus-5-5"}, "to": {"model": "claude-opus-4-8"}},
                {"type": "text", "text": json!({"steps": steps}).to_string()}
            ]
        });
        assert_eq!(parse_steps(&resp).unwrap().len(), MAX_STEPS);
    }

    #[test]
    fn refusals_and_bad_answers() {
        let refusal =
            json!({"stop_reason": "refusal", "content": [], "stop_details": {"type": "refusal", "category": null}});
        let err = parse_steps(&refusal).unwrap_err();
        assert_eq!(err.kind, ErrorKind::Invalid);
        assert_eq!(err.message, "Claude declined this request");

        assert!(parse_steps(&json!({"stop_reason": "end_turn", "content": []})).is_err());
        assert!(parse_steps(&json!({"content": [{"type": "text", "text": "not json"}]})).is_err());
        assert!(parse_steps(&json!({"content": [{"type": "text", "text": "{\"steps\": [\"  \"]}"}]})).is_err());
        assert_eq!(
            parse_steps(&json!({"content": [{"type": "text", "text": "Here: {\"steps\": [\"A\"]} done"}]})).unwrap(),
            vec!["A"]
        );
    }
}
