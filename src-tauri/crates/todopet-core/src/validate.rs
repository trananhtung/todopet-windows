//! Input checks for everything that crosses the JS → Rust boundary. The webview is trusted code, but these
//! keep a bug (or injected content) from turning into a path traversal, a request to an arbitrary host, or
//! a malformed API call.

use crate::{diary, CmdError, CmdResult};

/// Longest secret we accept. Todoist tokens are 40 hex chars, Anthropic keys ~110 chars.
pub const MAX_SECRET_LEN: usize = 512;
/// Diary lines are one JSON entry each; anything bigger is a bug on the JS side.
pub const MAX_DIARY_LINE_BYTES: usize = 8 * 1024;
/// URL schemes `open_url` hands to the OS.
pub const OPEN_URL_SCHEMES: [&str; 4] = ["http", "https", "msteams", "zoommtg"];
const MAX_URL_LEN: usize = 4096;

/// Todoist ids: `[A-Za-z0-9_-]{1,64}`. They go into URL paths, so nothing else is allowed.
pub fn todoist_id(id: &str) -> CmdResult<&str> {
    let ok =
        !id.is_empty() && id.len() <= 64 && id.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'_' || b == b'-');
    if ok {
        Ok(id)
    } else {
        Err(CmdError::invalid("Invalid task id"))
    }
}

/// Storage keys: `^[a-z][a-z0-9-]{0,31}$`. They become file names.
pub fn store_key(key: &str) -> CmdResult<&str> {
    let bytes = key.as_bytes();
    let ok = matches!(bytes.first(), Some(b) if b.is_ascii_lowercase())
        && bytes.len() <= 32
        && bytes.iter().all(|&b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'-');
    if ok {
        Ok(key)
    } else {
        Err(CmdError::invalid("Invalid storage key"))
    }
}

/// Diary days: `^\d{4}-\d{2}-\d{2}$` and a real calendar date. They become file names.
pub fn diary_day(day: &str) -> CmdResult<&str> {
    if diary::parse_day(day).is_some() {
        Ok(day)
    } else {
        Err(CmdError::invalid("Invalid day, expected yyyy-MM-dd"))
    }
}

/// One JSONL line: no line breaks, at most 8 KB, not blank.
pub fn diary_line(line: &str) -> CmdResult<&str> {
    if line.trim().is_empty() {
        return Err(CmdError::invalid("Empty diary line"));
    }
    if line.contains(['\n', '\r']) {
        return Err(CmdError::invalid("Diary lines cannot contain line breaks"));
    }
    if line.len() > MAX_DIARY_LINE_BYTES {
        return Err(CmdError::invalid("Diary line is longer than 8 KB"));
    }
    Ok(line)
}

/// Trims a token/key and rejects empty, over-long, or values with whitespace/control characters inside
/// (a pasted secret never legitimately contains them).
pub fn secret(raw: &str) -> CmdResult<String> {
    let s = raw.trim();
    if s.is_empty() {
        return Err(CmdError::invalid("The key is empty"));
    }
    if s.len() > MAX_SECRET_LEN {
        return Err(CmdError::invalid("The key is too long"));
    }
    if s.chars().any(|c| c.is_whitespace() || c.is_control()) {
        return Err(CmdError::invalid("The key contains spaces or invisible characters"));
    }
    Ok(s.to_owned())
}

/// Trimmed, non-empty text of at most `max_chars` characters. `what` names the field in the error.
pub fn text(raw: &str, what: &str, max_chars: usize) -> CmdResult<String> {
    let s = raw.trim();
    if s.is_empty() {
        return Err(CmdError::invalid(format!("{what} is empty")));
    }
    if s.chars().count() > max_chars {
        return Err(CmdError::invalid(format!("{what} is longer than {max_chars} characters")));
    }
    Ok(s.to_owned())
}

/// The lower-cased scheme of `url` (`"https"` for `"HTTPS://x"`), if it starts with a valid one.
pub fn scheme_of(url: &str) -> Option<String> {
    let (scheme, _) = url.split_once(':')?;
    let mut chars = scheme.chars();
    let first_ok = chars.next().is_some_and(|c| c.is_ascii_alphabetic());
    let rest_ok = chars.all(|c| c.is_ascii_alphanumeric() || matches!(c, '+' | '-' | '.'));
    (first_ok && rest_ok).then(|| scheme.to_ascii_lowercase())
}

fn has_space_or_control(s: &str) -> bool {
    s.chars().any(|c| c.is_whitespace() || c.is_control())
}

/// Links `open_url` may hand to the default handler: http(s) web pages and Teams/Zoom meeting links.
/// Anything else (`file:`, `ms-settings:`, custom protocol handlers…) is refused.
pub fn open_url(raw: &str) -> CmdResult<String> {
    let url = raw.trim();
    if url.is_empty() || url.len() > MAX_URL_LEN || has_space_or_control(url) {
        return Err(CmdError::invalid("Invalid link"));
    }
    let scheme = scheme_of(url).ok_or_else(|| CmdError::invalid("Invalid link"))?;
    if !OPEN_URL_SCHEMES.contains(&scheme.as_str()) {
        return Err(CmdError::invalid(format!("Links starting with {scheme}: are not opened")));
    }
    if (scheme == "http" || scheme == "https") && host_of(&url[scheme.len() + 1..]).is_none() {
        return Err(CmdError::invalid("Invalid link"));
    }
    Ok(url.to_owned())
}

/// The host part of `//host/path…` (after the scheme's colon), if present and non-empty.
fn host_of(after_scheme: &str) -> Option<&str> {
    let rest = after_scheme.strip_prefix("//")?;
    let end = rest.find(['/', '?', '#']).unwrap_or(rest.len());
    let authority = &rest[..end];
    // Drop credentials (`user:pass@host`) when locating the host.
    let host = authority.rsplit('@').next().unwrap_or(authority);
    (!host.is_empty()).then_some(host)
}

/// Calendar links: `https://…` as is, `webcal://…` rewritten to `https://…`. Nothing else.
pub fn ics_url(raw: &str) -> Result<String, String> {
    let url = raw.trim();
    if url.is_empty() || url.len() > MAX_URL_LEN || has_space_or_control(url) {
        return Err("Invalid link".into());
    }
    let rest = match scheme_of(url).as_deref() {
        Some("https") => &url["https:".len()..],
        Some("webcal") => &url["webcal:".len()..],
        _ => return Err("Only https:// and webcal:// calendar links are supported".into()),
    };
    if host_of(rest).is_none() {
        return Err("Invalid link".into());
    }
    Ok(format!("https:{rest}"))
}

/// An ISO 8601 timestamp as the Todoist API expects (`2026-10-28T00:00:00Z`). Only shape-checked: the
/// value is percent-encoded into a query string and Todoist reports anything it cannot parse.
pub fn iso_datetime(raw: &str) -> CmdResult<&str> {
    let ok = (10..=40).contains(&raw.len())
        && raw.bytes().all(|b| b.is_ascii_alphanumeric() || matches!(b, b':' | b'.' | b'+' | b'-'));
    if ok {
        Ok(raw)
    } else {
        Err(CmdError::invalid("Invalid date/time"))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ErrorKind;

    #[test]
    fn todoist_ids() {
        assert!(todoist_id("6Xm5HVVRcX00").is_ok());
        assert!(todoist_id("123_abc-DEF").is_ok());
        assert!(todoist_id(&"a".repeat(64)).is_ok());
        for bad in ["", "../etc", "a/b", "a b", "a?b", "é", &"a".repeat(65)] {
            assert_eq!(todoist_id(bad).unwrap_err().kind, ErrorKind::Invalid, "{bad}");
        }
    }

    #[test]
    fn store_keys() {
        for good in ["prefs", "life", "stuck", "a", "pet-2", &format!("a{}", "b".repeat(31))] {
            assert!(store_key(good).is_ok(), "{good}");
        }
        for bad in ["", "Prefs", "1abc", "-a", "a_b", "a.json", "../x", "a/b", &format!("a{}", "b".repeat(32))] {
            assert!(store_key(bad).is_err(), "{bad}");
        }
    }

    #[test]
    fn diary_days_and_lines() {
        assert!(diary_day("2026-10-28").is_ok());
        assert!(diary_day("2024-02-29").is_ok());
        for bad in ["2026-1-28", "2026-13-01", "2026-02-30", "2025-02-29", "../2026-10-28", "2026-10-28.jsonl", ""] {
            assert!(diary_day(bad).is_err(), "{bad}");
        }
        assert!(diary_line(r#"{"t":"bubble"}"#).is_ok());
        assert!(diary_line("a\nb").is_err());
        assert!(diary_line("a\rb").is_err());
        assert!(diary_line("   ").is_err());
        assert!(diary_line(&"x".repeat(MAX_DIARY_LINE_BYTES)).is_ok());
        assert!(diary_line(&"x".repeat(MAX_DIARY_LINE_BYTES + 1)).is_err());
    }

    #[test]
    fn secrets() {
        assert_eq!(secret("  abc123  \n").unwrap(), "abc123");
        assert!(secret("").is_err());
        assert!(secret("   ").is_err());
        assert!(secret("abc def").is_err());
        assert!(secret("abc\u{7}def").is_err());
        assert!(secret(&"k".repeat(MAX_SECRET_LEN)).is_ok());
        assert!(secret(&"k".repeat(MAX_SECRET_LEN + 1)).is_err());
    }

    #[test]
    fn texts() {
        assert_eq!(text("  Buy milk ", "Task", 10).unwrap(), "Buy milk");
        assert!(text("  ", "Task", 10).is_err());
        assert!(text("Việc cần làm", "Task", 12).is_ok(), "counts characters, not bytes");
        assert!(text("Việc cần làm!", "Task", 12).is_err());
    }

    #[test]
    fn schemes() {
        assert_eq!(scheme_of("HTTPS://x").as_deref(), Some("https"));
        assert_eq!(scheme_of("msteams:/l/meetup-join/1").as_deref(), Some("msteams"));
        assert_eq!(scheme_of("view-source:http://x").as_deref(), Some("view-source"));
        assert_eq!(scheme_of("no scheme"), None);
        assert_eq!(scheme_of("1http://x"), None);
        assert_eq!(scheme_of(":x"), None);
    }

    #[test]
    fn open_urls() {
        for good in [
            "https://todoist.com/app/today",
            "http://localhost:3000/x",
            "HTTPS://Example.com",
            "msteams:/l/meetup-join/19%3ameeting",
            "zoommtg://zoom.us/join?confno=123",
        ] {
            assert!(open_url(good).is_ok(), "{good}");
        }
        for bad in [
            "file:///C:/Windows/System32/calc.exe",
            "ms-settings:privacy",
            "javascript:alert(1)",
            "https://",
            "https:example.com",
            "https://exa mple.com",
            "",
            "todoist.com",
        ] {
            assert!(open_url(bad).is_err(), "{bad}");
        }
    }

    #[test]
    fn ics_urls() {
        assert_eq!(
            ics_url("webcal://p01-caldav.icloud.com/published/2/abc").unwrap(),
            "https://p01-caldav.icloud.com/published/2/abc"
        );
        assert_eq!(
            ics_url(" https://calendar.google.com/calendar/ical/x/private-y/basic.ics ").unwrap(),
            "https://calendar.google.com/calendar/ical/x/private-y/basic.ics"
        );
        assert_eq!(ics_url("WEBCAL://host/a.ics").unwrap(), "https://host/a.ics");
        for bad in ["http://host/a.ics", "file:///a.ics", "https://", "webcal:host", "ftp://x/a.ics", ""] {
            assert!(ics_url(bad).is_err(), "{bad}");
        }
    }

    #[test]
    fn iso_datetimes() {
        assert!(iso_datetime("2026-10-28T00:00:00Z").is_ok());
        assert!(iso_datetime("2026-10-28T00:00:00.000+07:00").is_ok());
        assert!(iso_datetime("2026-10-28").is_ok());
        assert!(iso_datetime("2026-10-28T00:00:00Z&x=1").is_err());
        assert!(iso_datetime("short").is_err());
    }
}
