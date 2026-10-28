//! Todoist API v1 (<https://developer.todoist.com/api/v1/>): paths, query strings, request bodies and page
//! parsing. The HTTP calls themselves live in the app crate.

use crate::{validate, CmdError, CmdResult};
use percent_encoding::{utf8_percent_encode, AsciiSet, NON_ALPHANUMERIC};
use serde_json::{json, Map, Value};

pub const BASE_URL: &str = "https://api.todoist.com/api/v1/";
/// Page size for list endpoints (the API maximum).
pub const PAGE_LIMIT: u32 = 200;
/// Hard stop when following `next_cursor`: 2 000 tasks is far beyond what the pet shows.
pub const MAX_PAGES: usize = 10;
pub const STATS_PATH: &str = "tasks/completed/stats";
/// Cheap authenticated GET used to verify a token before storing it.
pub const VERIFY_PATH: &str = "projects?limit=1";

const MAX_CONTENT_CHARS: usize = 500;
const MAX_DUE_CHARS: usize = 200;
const MAX_QUICK_ADD_CHARS: usize = 1000;
const MAX_FILTER_CHARS: usize = 1024;

/// Everything except RFC 3986 unreserved characters is escaped, so `+` becomes `%2B` (a literal plus in a
/// query string would otherwise be read as a space) and `&`/`#` cannot break the query.
const QUERY_VALUE: &AsciiSet = &NON_ALPHANUMERIC.remove(b'-').remove(b'_').remove(b'.').remove(b'~');

pub fn encode(value: &str) -> String {
    utf8_percent_encode(value, QUERY_VALUE).to_string()
}

fn with_cursor(mut path: String, cursor: Option<&str>) -> String {
    if let Some(cursor) = cursor {
        path.push_str("&cursor=");
        path.push_str(&encode(cursor));
    }
    path
}

/// `tasks/filter?query=…&limit=200[&cursor=…]`
pub fn filter_path(query: &str, cursor: Option<&str>) -> CmdResult<String> {
    let query = validate::text(query, "Filter", MAX_FILTER_CHARS)?;
    Ok(with_cursor(format!("tasks/filter?query={}&limit={PAGE_LIMIT}", encode(&query)), cursor))
}

/// `tasks/completed/by_completion_date?since=…&until=…&limit=200[&cursor=…]`
pub fn completed_path(since: &str, until: &str, cursor: Option<&str>) -> CmdResult<String> {
    let since = validate::iso_datetime(since)?;
    let until = validate::iso_datetime(until)?;
    Ok(with_cursor(
        format!(
            "tasks/completed/by_completion_date?since={}&until={}&limit={PAGE_LIMIT}",
            encode(since),
            encode(until)
        ),
        cursor,
    ))
}

/// What can be done to a single task with a bodyless POST.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TaskAction {
    Close,
    Reopen,
}

/// `tasks/{id}`
pub fn task_path(id: &str) -> CmdResult<String> {
    Ok(format!("tasks/{}", validate::todoist_id(id)?))
}

/// `tasks/{id}/close` or `tasks/{id}/reopen`
pub fn task_action_path(id: &str, action: TaskAction) -> CmdResult<String> {
    let verb = match action {
        TaskAction::Close => "close",
        TaskAction::Reopen => "reopen",
    };
    Ok(format!("{}/{verb}", task_path(id)?))
}

/// One page of a list endpoint.
#[derive(Debug, Clone, PartialEq)]
pub struct Page {
    pub items: Vec<Value>,
    pub next_cursor: Option<String>,
}

/// Reads `results` (or `items`, used by the completed endpoint) and `next_cursor` from a page.
pub fn parse_page(body: Value) -> CmdResult<Page> {
    let Value::Object(mut obj) = body else {
        return Err(CmdError::http("Todoist returned an unexpected response"));
    };
    let items = match obj.remove("results").or_else(|| obj.remove("items")) {
        Some(Value::Array(items)) => items,
        _ => return Err(CmdError::http("Todoist returned an unexpected response")),
    };
    let next_cursor = match obj.remove("next_cursor") {
        Some(Value::String(c)) if !c.is_empty() => Some(c),
        _ => None,
    };
    Ok(Page { items, next_cursor })
}

/// Body of `POST tasks`. `priority` is the API value: 4 = P1 (urgent) … 1 = P4.
pub fn add_body(content: &str, due_string: Option<&str>, priority: u8, parent_id: Option<&str>) -> CmdResult<Value> {
    let content = validate::text(content, "Task", MAX_CONTENT_CHARS)?;
    if !(1..=4).contains(&priority) {
        return Err(CmdError::invalid("Priority must be between 1 and 4"));
    }
    let mut body = Map::new();
    body.insert("content".into(), json!(content));
    body.insert("priority".into(), json!(priority));
    if let Some(due) = due_string.map(str::trim).filter(|d| !d.is_empty()) {
        let due = validate::text(due, "Due date", MAX_DUE_CHARS)?;
        body.insert("due_string".into(), json!(due));
        body.insert("due_lang".into(), json!("en"));
    }
    if let Some(parent) = parent_id.filter(|p| !p.is_empty()) {
        body.insert("parent_id".into(), json!(validate::todoist_id(parent)?));
    }
    Ok(Value::Object(body))
}

/// Body of `POST tasks/{id}` that moves a task to a new due date.
pub fn reschedule_body(due_string: &str) -> CmdResult<Value> {
    let due = validate::text(due_string, "Due date", MAX_DUE_CHARS)?;
    Ok(json!({ "due_string": due, "due_lang": "en" }))
}

/// Body of `POST tasks/quick` (full quick-add syntax: `Call mom tomorrow 6pm #Family p1`).
pub fn quick_add_body(text: &str) -> CmdResult<Value> {
    let text = validate::text(text, "Task", MAX_QUICK_ADD_CHARS)?;
    Ok(json!({ "text": text }))
}

/// The created task from a `POST tasks` response, if it looks like one.
pub fn created_task(body: Value) -> Option<Value> {
    body.get("id").is_some_and(|id| id.is_string() || id.is_number()).then_some(body)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn encodes_plus_and_reserved_characters() {
        assert_eq!(encode("today | overdue"), "today%20%7C%20overdue");
        assert_eq!(encode("#Work & p1"), "%23Work%20%26%20p1");
        assert_eq!(encode("2026-10-28T00:00:00+07:00"), "2026-10-28T00%3A00%3A00%2B07%3A00");
        assert_eq!(encode("hôm nay"), "h%C3%B4m%20nay");
        assert_eq!(encode("a-b_c.d~e"), "a-b_c.d~e");
    }

    #[test]
    fn builds_paths() {
        assert_eq!(filter_path("today | overdue", None).unwrap(), "tasks/filter?query=today%20%7C%20overdue&limit=200");
        assert_eq!(
            filter_path("today", Some("abc+/=")).unwrap(),
            "tasks/filter?query=today&limit=200&cursor=abc%2B%2F%3D"
        );
        assert!(filter_path("   ", None).is_err());
        assert_eq!(
            completed_path("2026-10-27T17:00:00Z", "2026-10-28T17:00:00Z", None).unwrap(),
            "tasks/completed/by_completion_date?since=2026-10-27T17%3A00%3A00Z&until=2026-10-28T17%3A00%3A00Z&limit=200"
        );
        assert!(completed_path("yesterday", "2026-10-28T17:00:00Z", None).is_err());
        assert_eq!(task_path("6Xm5").unwrap(), "tasks/6Xm5");
        assert_eq!(task_action_path("6Xm5", TaskAction::Close).unwrap(), "tasks/6Xm5/close");
        assert_eq!(task_action_path("6Xm5", TaskAction::Reopen).unwrap(), "tasks/6Xm5/reopen");
        assert!(task_action_path("../projects", TaskAction::Close).is_err());
    }

    #[test]
    fn parses_pages() {
        let page = parse_page(json!({"results": [{"id": "1"}, {"id": "2"}], "next_cursor": "c2"})).unwrap();
        assert_eq!(page.items.len(), 2);
        assert_eq!(page.next_cursor.as_deref(), Some("c2"));

        let page = parse_page(json!({"items": [{"id": "1"}], "next_cursor": null})).unwrap();
        assert_eq!(page.items, vec![json!({"id": "1"})]);
        assert_eq!(page.next_cursor, None);

        assert_eq!(parse_page(json!({"results": [], "next_cursor": ""})).unwrap().next_cursor, None);
        assert!(parse_page(json!([{"id": "1"}])).is_err());
        assert!(parse_page(json!({"results": "nope"})).is_err());
    }

    #[test]
    fn add_bodies() {
        assert_eq!(
            add_body(" Write report ", Some("today at 14:00"), 4, None).unwrap(),
            json!({"content": "Write report", "priority": 4, "due_string": "today at 14:00", "due_lang": "en"})
        );
        assert_eq!(
            add_body("Step 1", None, 1, Some("6Xm5HVVRcX00")).unwrap(),
            json!({"content": "Step 1", "priority": 1, "parent_id": "6Xm5HVVRcX00"})
        );
        assert_eq!(add_body("No date", Some("  "), 2, Some("")).unwrap(), json!({"content": "No date", "priority": 2}));
        assert!(add_body("", None, 1, None).is_err());
        assert!(add_body("x", None, 0, None).is_err());
        assert!(add_body("x", None, 5, None).is_err());
        assert!(add_body("x", None, 1, Some("a/b")).is_err());
        assert!(add_body(&"x".repeat(501), None, 1, None).is_err());
    }

    #[test]
    fn other_bodies() {
        assert_eq!(reschedule_body("tomorrow").unwrap(), json!({"due_string": "tomorrow", "due_lang": "en"}));
        assert!(reschedule_body("").is_err());
        assert_eq!(quick_add_body("Call mom tomorrow p1").unwrap(), json!({"text": "Call mom tomorrow p1"}));
        assert!(quick_add_body(" ").is_err());
    }

    #[test]
    fn created_tasks() {
        assert!(created_task(json!({"id": "123", "content": "x"})).is_some());
        assert!(created_task(json!({})).is_none());
        assert!(created_task(Value::Null).is_none());
    }
}
