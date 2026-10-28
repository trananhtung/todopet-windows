//! Calendar ICS links ("secret addresses"): validation and normalization before they are stored in
//! Credential Manager, the host shown in Settings, and the credential slots they are stored in.
//!
//! A secret address works without a password, so it is a bearer secret: it never goes back to the
//! webview, and no error message repeats it (or its path or query).

use crate::{net, validate, CmdError, CmdResult};
use url::Url;

/// Most links that can be saved.
pub const MAX_LINKS: usize = 10;
/// Longest link accepted, before and after normalization. Each link is its own credential, stored as
/// UTF-8 (normalized links are ASCII), well under Windows' 2 560-byte credential blob limit.
pub const MAX_LINK_CHARS: usize = 2048;
/// Lists longer than this are refused outright instead of being validated entry by entry.
const MAX_INPUT_ENTRIES: usize = 100;

/// Credential Manager user name of the link in `slot` (`calendar-0` … `calendar-9`).
pub fn slot_user(slot: usize) -> String {
    format!("calendar-{slot}")
}

/// Validates one link and returns it normalized: `webcal://` becomes `https://`, host lower-cased and
/// punycoded, path percent-encoded (the form reqwest would send anyway). Refuses anything but https and
/// webcal, links without a host, and links whose host is `localhost` or a literal private address.
pub fn normalize_link(raw: &str) -> CmdResult<String> {
    let link = raw.trim();
    if link.is_empty() {
        return Err(CmdError::invalid("The link is empty"));
    }
    if link.chars().count() > MAX_LINK_CHARS {
        return Err(CmdError::invalid(format!("The link is longer than {MAX_LINK_CHARS} characters")));
    }
    if link.chars().any(|c| c.is_whitespace() || c.is_control()) {
        return Err(CmdError::invalid("The link contains spaces or invisible characters"));
    }
    let rest = match validate::scheme_of(link).as_deref() {
        Some("https") => &link["https:".len()..],
        Some("webcal") => &link["webcal:".len()..],
        _ => return Err(CmdError::invalid("Only https:// and webcal:// calendar links are supported")),
    };
    // `https:host/x` would be accepted by the URL parser; a calendar link always has the `//`.
    if !rest.starts_with("//") || validate::host_of(rest).is_none() {
        return Err(CmdError::invalid("The link has no host"));
    }
    let url = Url::parse(&format!("https:{rest}")).map_err(|_| CmdError::invalid("The link is not a valid address"))?;
    net::check_target(&url).map_err(|refused| CmdError::invalid(refused.message()))?;
    let normalized = String::from(url);
    if normalized.len() > MAX_LINK_CHARS {
        return Err(CmdError::invalid(format!("The link is longer than {MAX_LINK_CHARS} characters")));
    }
    Ok(normalized)
}

/// Validates the list the user saves: blank entries skipped, each link normalized, duplicates (after
/// normalization) dropped keeping the first, at most [`MAX_LINKS`] left. Errors name the link by its
/// position, never by its text.
pub fn normalize_links(raw: &[String]) -> CmdResult<Vec<String>> {
    if raw.len() > MAX_INPUT_ENTRIES {
        return Err(CmdError::invalid(format!("At most {MAX_LINKS} calendar links can be saved")));
    }
    let mut links: Vec<String> = Vec::new();
    for (i, entry) in raw.iter().enumerate() {
        if entry.trim().is_empty() {
            continue;
        }
        let link =
            normalize_link(entry).map_err(|e| CmdError::invalid(format!("Calendar link {}: {}", i + 1, e.message)))?;
        if !links.contains(&link) {
            links.push(link);
        }
    }
    if links.len() > MAX_LINKS {
        return Err(CmdError::invalid(format!("At most {MAX_LINKS} calendar links can be saved")));
    }
    Ok(links)
}

/// The host of a (normalized) link, for display: `calendar.google.com`, `[2606:4700::1]`. No port, user
/// info, path or query.
pub fn link_host(link: &str) -> Option<String> {
    let url = Url::parse(link).ok()?;
    url.host_str().filter(|h| !h.is_empty()).map(str::to_owned)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ErrorKind;

    fn strings(items: &[&str]) -> Vec<String> {
        items.iter().map(|s| s.to_string()).collect()
    }

    #[test]
    fn slot_users() {
        assert_eq!(slot_user(0), "calendar-0");
        assert_eq!(slot_user(MAX_LINKS - 1), "calendar-9");
    }

    #[test]
    fn normalizes_links() {
        assert_eq!(
            normalize_link("webcal://p01-caldav.icloud.com/published/2/abc").unwrap(),
            "https://p01-caldav.icloud.com/published/2/abc"
        );
        assert_eq!(
            normalize_link(" https://calendar.google.com/calendar/ical/x/private-y/basic.ics ").unwrap(),
            "https://calendar.google.com/calendar/ical/x/private-y/basic.ics"
        );
        assert_eq!(normalize_link("WEBCAL://Host.Example.com/a.ics").unwrap(), "https://host.example.com/a.ics");
        assert_eq!(normalize_link("https://example.com").unwrap(), "https://example.com/");
        assert_eq!(normalize_link("https://lịch.vn/a.ics").unwrap(), "https://xn--lch-llz.vn/a.ics");
        assert_eq!(
            normalize_link("https://outlook.office365.com/owa/calendar/a@b.com/x/calendar.ics?x=1").unwrap(),
            "https://outlook.office365.com/owa/calendar/a@b.com/x/calendar.ics?x=1"
        );
    }

    #[test]
    fn refuses_bad_links() {
        for bad in [
            "",
            "   ",
            "http://host/a.ics",
            "file:///a.ics",
            "ftp://x/a.ics",
            "https://",
            "https:host/a.ics",
            "webcal:host",
            "https://exa mple.com/a.ics",
            "https://example.com/a\u{7}.ics",
            "https://localhost/a.ics",
            "https://127.0.0.1/a.ics",
            "webcal://192.168.1.10/cal.ics",
            "https://[::1]/a.ics",
            "https://2130706433/a.ics",
        ] {
            assert_eq!(normalize_link(bad).unwrap_err().kind, ErrorKind::Invalid, "{bad:?}");
        }
    }

    #[test]
    fn length_limits() {
        let base = "https://example.com/";
        let ok = format!("{base}{}", "a".repeat(MAX_LINK_CHARS - base.len()));
        assert_eq!(normalize_link(&ok).unwrap().len(), MAX_LINK_CHARS);
        let too_long = format!("{ok}a");
        assert!(normalize_link(&too_long).is_err());
        // Short enough as typed, too long once the non-ASCII path is percent-encoded.
        let grows = format!("{base}{}", "é".repeat(MAX_LINK_CHARS - base.len()));
        assert!(normalize_link(&grows).is_err());
    }

    #[test]
    fn errors_never_echo_the_link() {
        let secret = "https://127.0.0.1/private-SECRET123/basic.ics";
        let e = normalize_link(secret).unwrap_err();
        assert!(!e.message.contains("SECRET123") && !e.message.contains("127.0.0.1"), "{}", e.message);
        let e = normalize_links(&strings(&["https://a.example/x.ics", "ftp://host/SECRET123"])).unwrap_err();
        assert_eq!(e.message, "Calendar link 2: Only https:// and webcal:// calendar links are supported");
    }

    #[test]
    fn list_is_trimmed_deduplicated_and_capped() {
        let links = normalize_links(&strings(&[
            " https://a.example/x.ics ",
            "",
            "webcal://a.example/x.ics",
            "https://A.EXAMPLE/x.ics",
            "https://b.example/y.ics",
            "  ",
        ]))
        .unwrap();
        assert_eq!(links, vec!["https://a.example/x.ics", "https://b.example/y.ics"]);
        assert_eq!(normalize_links(&[]).unwrap(), Vec::<String>::new());
        assert_eq!(normalize_links(&strings(&["", " "])).unwrap(), Vec::<String>::new());

        let ten: Vec<String> = (0..MAX_LINKS).map(|i| format!("https://h{i}.example/c.ics")).collect();
        assert_eq!(normalize_links(&ten).unwrap().len(), MAX_LINKS);
        let mut eleven = ten.clone();
        eleven.push("https://h10.example/c.ics".into());
        assert!(normalize_links(&eleven).is_err());
        // Duplicates do not count towards the limit.
        let mut with_dupes = ten.clone();
        with_dupes.extend(ten.iter().cloned());
        assert_eq!(normalize_links(&with_dupes).unwrap().len(), MAX_LINKS);
        assert!(normalize_links(&vec![String::new(); MAX_INPUT_ENTRIES + 1]).is_err());
    }

    #[test]
    fn hosts() {
        assert_eq!(
            link_host("https://calendar.google.com/calendar/ical/x/basic.ics").as_deref(),
            Some("calendar.google.com")
        );
        assert_eq!(link_host("https://user:pw@cal.example.com:8443/a.ics?token=1").as_deref(), Some("cal.example.com"));
        assert_eq!(link_host("https://[2606:4700:4700::1111]/a.ics").as_deref(), Some("[2606:4700:4700::1111]"));
        assert_eq!(link_host("not a url"), None);
    }
}
