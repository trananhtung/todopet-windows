//! Update notices and one-click updates (v0.7), the OS-independent half.
//!
//! The app asks GitHub which releases exist, picks the newest strict `vX.Y.Z` tag above the running version, and
//! (for an NSIS install whose release carries a signed manifest) lets the updater plugin install it. Everything
//! that can be decided without I/O lives here so it is unit-tested on any host: reading the tag, picking the
//! release, building the addresses from the tag, checking the installer address, cleaning the release notes, the
//! rate limits, what the last check left behind, and the shapes the page reads (`UpdateStatus`, `UpdateProgress`
//! in `src/backend/types.ts`).
//!
//! No address ever comes from the page or from a release's own text: every URL is built from a validated tag, and
//! the only address taken from a response (the installer's, out of the signed manifest) must sit under that
//! tag's download folder.

use crate::{CmdError, CmdResult, ErrorKind};
use serde::{Deserialize, Serialize};
use std::fmt;
use url::Url;

const OWNER: &str = "trananhtung";
const REPO: &str = "todopet-windows";

/// The releases list on GitHub, the fallback of "Open download page".
pub const RELEASES_PAGE: &str = "https://github.com/trananhtung/todopet-windows/releases";
/// Where new versions are discovered. Not `/releases/latest`: every release is a pre-release and that endpoint
/// skips them. Drafts are invisible to an unauthenticated caller, so a release joins the channel when a person
/// publishes it, never on a tag push.
pub const RELEASES_API: &str = "https://api.github.com/repos/trananhtung/todopet-windows/releases?per_page=20";
/// `Accept` and `X-GitHub-Api-Version` for [`RELEASES_API`].
pub const API_ACCEPT: &str = "application/vnd.github+json";
pub const API_VERSION: &str = "2022-11-28";
/// The signed update manifest the release workflow attaches (Tauri updater format).
pub const MANIFEST_ASSET: &str = "latest.json";
/// The releases list is a few KB for 20 releases; anything near a megabyte is not GitHub talking.
pub const MAX_RESPONSE_BYTES: u64 = 1024 * 1024;
/// Error answers are read only for their message.
pub const MAX_ERROR_BODY_BYTES: u64 = 16 * 1024;
/// A normal check reuses a result younger than this (the page asks every 6 hours; this absorbs restarts and
/// two windows asking at once, and keeps an anonymous caller far below GitHub's 60 requests an hour).
pub const CACHE_MS: u64 = 30 * 60 * 1000;
/// "Check now" works at most this often.
pub const FORCE_GAP_MS: u64 = 20 * 1000;
/// Release notes shown in the page: plain text, at most this many lines and characters.
pub const MAX_NOTES_LINES: usize = 60;
pub const MAX_NOTES_CHARS: usize = 4000;
/// Progress goes to the page at most ten times a second.
pub const PROGRESS_MIN_GAP_MS: u64 = 100;
/// `published_at` is passed on only if it is short and shaped like a date.
const MAX_TIMESTAMP_LEN: usize = 40;

// ---------- tags and versions ----------

/// A version `X.Y.Z`. Plain numbers only (no pre-release or build suffix), each at most 9999: a tag is attacker-
/// influenced text that ends up in URLs and in the page, so what is accepted is kept as small as the project's
/// own tags.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct Version {
    pub major: u16,
    pub minor: u16,
    pub patch: u16,
}

impl Version {
    pub const MAX_PART: u16 = 9999;

    /// `"0.7.1"` (no `v`): exactly three dot-separated numbers of ASCII digits, no sign, no spaces, no leading
    /// zeros (`"01"` is refused, `"0"` is fine), each at most [`Self::MAX_PART`]. For the running version.
    pub fn parse(s: &str) -> Option<Self> {
        let mut parts = s.split('.');
        let major = part(parts.next()?)?;
        let minor = part(parts.next()?)?;
        let patch = part(parts.next()?)?;
        if parts.next().is_some() {
            return None;
        }
        Some(Self { major, minor, patch })
    }

    /// `"v0.7.1"`. Because parsing refuses leading zeros, this is the one spelling of the version a tag can have.
    pub fn tag(&self) -> String {
        format!("v{self}")
    }
}

impl fmt::Display for Version {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}.{}.{}", self.major, self.minor, self.patch)
    }
}

fn part(s: &str) -> Option<u16> {
    // At most four digits is the same as at most 9999 once leading zeros are refused.
    let ok =
        !s.is_empty() && s.len() <= 4 && s.bytes().all(|b| b.is_ascii_digit()) && (s == "0" || !s.starts_with('0'));
    if ok {
        s.parse().ok()
    } else {
        None
    }
}

/// A release tag: `v` and exactly [`Version::parse`]'s three numbers, nothing else (`V0.7.1`, `v0.7.1-rc1`,
/// `v0.7.1+x`, ` v0.7.1`, `v01.2.3` and `v0.7` are all refused).
pub fn parse_tag(tag: &str) -> Option<Version> {
    Version::parse(tag.strip_prefix('v')?)
}

// ---------- the releases list ----------

/// One entry of GitHub's releases list, only the fields we read (the rest is ignored).
#[derive(Debug, Clone, Deserialize)]
pub struct Release {
    pub tag_name: String,
    #[serde(default)]
    pub draft: bool,
    #[serde(default)]
    pub prerelease: bool,
    #[serde(default)]
    pub body: Option<String>,
    #[serde(default)]
    pub published_at: Option<String>,
    #[serde(default)]
    pub assets: Vec<Asset>,
}

#[derive(Debug, Clone, Default, Deserialize)]
pub struct Asset {
    #[serde(default)]
    pub name: String,
    #[serde(default)]
    pub browser_download_url: String,
}

/// Reads the answer of [`RELEASES_API`]. The answer must be a JSON list; an entry that does not read (no `tag_name`,
/// wrong types) is skipped rather than failing the whole list, so one odd release cannot block everybody's updates.
pub fn parse_releases(body: &[u8]) -> CmdResult<Vec<Release>> {
    let entries: Vec<serde_json::Value> = serde_json::from_slice(body)
        .map_err(|_| CmdError::http("GitHub answered with something the app can't read"))?;
    Ok(entries.into_iter().filter_map(|entry| serde_json::from_value(entry).ok()).collect())
}

/// The newest release above the running version.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Candidate {
    pub version: Version,
    /// Equal to `version.tag()`; the only text the URL builders are given.
    pub tag: String,
    /// Release notes as plain text ([`clean_notes`]).
    pub notes: String,
    /// Only when it looks like an ISO 8601 timestamp.
    pub published_at: Option<String>,
    /// The release carries an asset named exactly `latest.json` whose address is exactly the one we would build.
    pub has_manifest: bool,
}

/// The release to announce: among the published (not draft) releases with a strict `vX.Y.Z` tag above `current`,
/// the highest one **that carries a valid signed manifest**; only when none of them does, the highest of all (which
/// can then only be offered by hand). Without that preference one stray published `v9999.0.0` would hide every
/// later legitimate release. Tags that do not parse are skipped, pre-releases count.
pub fn pick_newer(releases: &[Release], current: Version) -> Option<Candidate> {
    let (has_manifest, version, release) = releases
        .iter()
        .filter(|release| !release.draft)
        .filter_map(|release| Some((parse_tag(&release.tag_name)?, release)))
        .filter(|(version, _)| *version > current)
        .map(|(version, release)| (carries_manifest(release, &version.tag()), version, release))
        .max_by_key(|(has_manifest, version, _)| (*has_manifest, *version))?;
    Some(Candidate {
        version,
        tag: version.tag(),
        notes: clean_notes(release.body.as_deref().unwrap_or_default()),
        published_at: release.published_at.clone().filter(|at| valid_timestamp(at)),
        has_manifest,
    })
}

/// An asset named exactly `latest.json` whose address is exactly the one we would build for `tag`.
fn carries_manifest(release: &Release, tag: &str) -> bool {
    let manifest = manifest_url(tag);
    release.assets.iter().any(|asset| asset.name == MANIFEST_ASSET && asset.browser_download_url == manifest)
}

/// `2026-10-30` or `2026-10-30T12:34[:56[.789]][Z|±hh:mm]`, at most 40 characters: a shape check (with sane month,
/// day, hour and minute ranges), not a calendar.
fn valid_timestamp(s: &str) -> bool {
    if !s.is_ascii() || s.len() < 10 || s.len() > MAX_TIMESTAMP_LEN {
        return false;
    }
    let number = |range: std::ops::Range<usize>| -> Option<u32> {
        let digits = &s[range];
        digits.bytes().all(|b| b.is_ascii_digit()).then(|| digits.parse().ok()).flatten()
    };
    let date_ok = s.as_bytes()[4] == b'-'
        && s.as_bytes()[7] == b'-'
        && number(0..4).is_some()
        && number(5..7).is_some_and(|month| (1..=12).contains(&month))
        && number(8..10).is_some_and(|day| (1..=31).contains(&day));
    if !date_ok {
        return false;
    }
    if s.len() == 10 {
        return true;
    }
    let Some(time) = s[10..].strip_prefix('T') else { return false };
    time.len() >= 5
        && time.as_bytes()[2] == b':'
        && number(11..13).is_some_and(|hour| hour < 24)
        && number(14..16).is_some_and(|minute| minute < 60)
        && time.bytes().all(|b| b.is_ascii_digit() || matches!(b, b':' | b'.' | b'+' | b'-' | b'Z'))
}

// ---------- addresses ----------

/// The release's page on GitHub. `tag` must be a validated one ([`Candidate::tag`]): it is put in the path as is.
pub fn release_page_url(tag: &str) -> String {
    format!("{RELEASES_PAGE}/tag/{tag}")
}

/// The signed manifest of a release. `tag` must be a validated one ([`Candidate::tag`]).
pub fn manifest_url(tag: &str) -> String {
    format!("{RELEASES_PAGE}/download/{tag}/{MANIFEST_ASSET}")
}

/// The file name of the NSIS setup the release workflow publishes: `TodoPet_<version>_x64-setup.exe`.
pub fn installer_file_name(version: Version) -> String {
    format!("TodoPet_{version}_x64-setup.exe")
}

/// Is `url` the setup of release `tag`, `https://github.com/trananhtung/todopet-windows/releases/download/<tag>/
/// TodoPet_<version>_x64-setup.exe`? The manifest is signed in content but not in its addresses' origin, so the
/// installer's address is held to this: HTTPS, the host `github.com` itself, no user name, port, query or fragment,
/// that folder, and that exact file name (nothing else a release may carry, not even another file of the same
/// release, and no encoded variant of the name). The address must also be in its parsed, canonical form (see below),
/// so dot segments (`..`, `%2e%2e`) can't be present when the path is compared.
pub fn installer_url_ok(url: &str, tag: &str) -> bool {
    let Some(version) = parse_tag(tag) else { return false };
    let Ok(parsed) = Url::parse(url) else { return false };
    // The parser forgives (strips spaces at the ends and tabs and newlines inside, lower-cases the host, drops `:443`
    // and resolves dot segments). What was checked must be the very text that would be used, so anything the parser
    // had to rewrite is refused. The updater plugin hands over an already parsed address, which never differs.
    if parsed.as_str() != url {
        return false;
    }
    let url = parsed;
    let plain = url.scheme() == "https"
        && url.host_str() == Some("github.com")
        && url.username().is_empty()
        && url.password().is_none()
        && url.port().is_none()
        && url.query().is_none()
        && url.fragment().is_none();
    if !plain {
        return false;
    }
    let Some(segments) = url.path_segments() else { return false };
    let segments: Vec<&str> = segments.collect();
    let [owner, repo, "releases", "download", found_tag, file] = segments.as_slice() else { return false };
    *owner == OWNER && *repo == REPO && *found_tag == tag && *file == installer_file_name(version)
}

// ---------- release notes ----------

/// Release notes as plain text for a speech bubble: control characters are dropped (tab and newline stay, `\r` goes,
/// the Unicode line and paragraph separators become newlines), and so is everything else that draws nothing and
/// could hide or reorder text ([`is_invisible`]; the zero-width joiner stays, emoji need it); trailing spaces are trimmed
/// from every line, any run of blank lines becomes one, the whole is trimmed, and it is cut to [`MAX_NOTES_LINES`]
/// lines and [`MAX_NOTES_CHARS`] characters in total (on a character boundary) with a `…` where it was cut.
pub fn clean_notes(raw: &str) -> String {
    let mut text = String::with_capacity(raw.len());
    for c in raw.chars() {
        match c {
            '\r' => {}
            '\n' | '\t' => text.push(c),
            '\u{2028}' | '\u{2029}' => text.push('\n'),
            c if c.is_control() || is_invisible(c) => {}
            c => text.push(c),
        }
    }

    let mut lines: Vec<&str> = Vec::new();
    for line in text.split('\n').map(str::trim_end) {
        if line.is_empty() && lines.last().is_some_and(|last| last.is_empty()) {
            continue;
        }
        lines.push(line);
    }
    let joined = lines.join("\n");
    let all: Vec<&str> = joined.trim().split('\n').collect();

    let too_many_lines = all.len() > MAX_NOTES_LINES;
    let kept = if too_many_lines { &all[..MAX_NOTES_LINES] } else { &all[..] };
    let notes = kept.join("\n");
    if !too_many_lines && notes.chars().count() <= MAX_NOTES_CHARS {
        return notes;
    }
    let head: String = notes.chars().take(MAX_NOTES_CHARS - 1).collect();
    format!("{}…", head.trim_end())
}

/// Characters that draw nothing, so a release could use them to hide text from the reader or to reorder it: the
/// Unicode format characters (category Cf: soft hyphen, Arabic and Syriac marks, zero-width space/non-joiner, direction
/// marks, embeddings, overrides and isolates, invisible operators, BOM, interlinear annotations, the Kaithi,
/// hieroglyph, shorthand and musical format controls, and the tag characters U+E0000..) and the blank "fillers" (Hangul
/// and halfwidth Hangul fillers). Std has no character categories, so these are the ranges. U+200D (zero-width joiner)
/// is kept on purpose: emoji sequences (family, profession) are built with it. Variation selectors, regional
/// indicators and combining marks are not listed either, so flags, `❤️` and accented letters survive.
fn is_invisible(c: char) -> bool {
    matches!(c,
        '\u{AD}'
        | '\u{600}'..='\u{605}'
        | '\u{61C}'
        | '\u{6DD}'
        | '\u{70F}'
        | '\u{890}'..='\u{891}'
        | '\u{8E2}'
        | '\u{180E}'
        | '\u{200B}'..='\u{200C}'
        | '\u{200E}'..='\u{200F}'
        | '\u{202A}'..='\u{202E}'
        | '\u{2060}'..='\u{206F}'
        | '\u{FEFF}'
        | '\u{FFF9}'..='\u{FFFB}'
        | '\u{110BD}'
        | '\u{110CD}'
        | '\u{13430}'..='\u{1343F}'
        | '\u{1BCA0}'..='\u{1BCA3}'
        | '\u{1D173}'..='\u{1D17A}'
        | '\u{E0001}'
        | '\u{E0020}'..='\u{E007F}'
        // Fillers (category Lo) that render as blanks.
        | '\u{115F}'
        | '\u{1160}'
        | '\u{3164}'
        | '\u{FFA0}')
}

// ---------- one click or the download page ----------

/// How the running app was installed (from the bundle type Tauri patches into the exe).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum InstallKind {
    /// The setup.exe: per user, no admin prompt, the only kind that updates itself.
    Nsis,
    /// The MSI: per machine, the installer needs an admin prompt.
    Msi,
    /// A development build, or anything that was not installed by one of our installers.
    Other,
}

/// Mirrors `UpdateManualReason` on the TypeScript side.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum ManualReason {
    Msi,
    Unsigned,
    Dev,
    CheckFailed,
}

/// Why an update can't be installed in one click before even looking at the manifest, or `None` when the manifest
/// is worth trying. The kind of install comes first (it is the more useful thing to tell an MSI user, whatever
/// the release carries).
pub fn manual_reason_before_check(kind: InstallKind, has_manifest: bool) -> Option<ManualReason> {
    match (kind, has_manifest) {
        (InstallKind::Msi, _) => Some(ManualReason::Msi),
        (InstallKind::Other, _) => Some(ManualReason::Dev),
        (InstallKind::Nsis, false) => Some(ManualReason::Unsigned),
        (InstallKind::Nsis, true) => None,
    }
}

// ---------- what the page reads ----------

/// `AvailableUpdate` on the TypeScript side.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AvailableUpdate {
    /// `"0.7.1"` (no `v`).
    pub version: String,
    pub notes: String,
    pub published_at: Option<String>,
    /// Exactly when `manual_reason` is `None`.
    pub can_install: bool,
    pub manual_reason: Option<ManualReason>,
}

impl AvailableUpdate {
    /// `manual_reason` `None` means the update can be installed in one click.
    pub fn from_candidate(candidate: &Candidate, manual_reason: Option<ManualReason>) -> Self {
        Self {
            version: candidate.version.to_string(),
            notes: candidate.notes.clone(),
            published_at: candidate.published_at.clone(),
            can_install: manual_reason.is_none(),
            manual_reason,
        }
    }
}

/// `UpdateStatus` on the TypeScript side.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateStatus {
    /// The running version, `"0.7.0"`.
    pub current: String,
    /// Epoch ms of the last check that completed, successfully or not.
    pub checked_at: Option<u64>,
    pub available: Option<AvailableUpdate>,
    /// The last check's failure; the previous `available` is kept.
    pub error: Option<CmdError>,
}

/// `UpdateProgress` on the TypeScript side.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(tag = "phase", rename_all = "lowercase")]
pub enum UpdateProgress {
    Downloading { downloaded: u64, total: Option<u64> },
    Installing,
}

impl UpdateProgress {
    /// A download of unknown size (no `Content-Length`, or a bogus 0) has no total: the page can't divide by it.
    pub fn downloading(downloaded: u64, total: Option<u64>) -> Self {
        Self::Downloading { downloaded, total: total.filter(|total| *total > 0) }
    }
}

// ---------- what the last check left behind ----------

/// Remembers the last check: when it ran, what it found and how it failed; and decides when the next one may run.
/// Times are in two clocks that the caller supplies: wall-clock epoch ms for `checkedAt` (shown to people) and a
/// monotonic ms for the limits (so a changed system clock can't lock the checks or open them wide).
#[derive(Debug, Default)]
pub struct Tracker {
    checked_at: Option<u64>,
    checked_mono: Option<u64>,
    /// The tag of the available release and what the page is told about it.
    available: Option<(String, AvailableUpdate)>,
    error: Option<CmdError>,
}

impl Tracker {
    pub fn new() -> Self {
        Self::default()
    }

    /// May a check go to the network now? A normal one only when the last result is [`CACHE_MS`] old (or none
    /// exists), a forced one ("Check now") when it is [`FORCE_GAP_MS`] old. A failed check counts as a check, so a
    /// dead network is not asked again every few seconds.
    pub fn due(&self, now_mono_ms: u64, force: bool) -> bool {
        let gap = if force { FORCE_GAP_MS } else { CACHE_MS };
        self.checked_mono.is_none_or(|at| now_mono_ms.saturating_sub(at) >= gap)
    }

    /// A check completed: `available` replaces the old answer (`None`: up to date) and the error is cleared.
    pub fn record_ok(&mut self, wall_ms: u64, mono_ms: u64, available: Option<(String, AvailableUpdate)>) {
        self.checked_at = Some(wall_ms);
        self.checked_mono = Some(mono_ms);
        self.available = available;
        self.error = None;
    }

    /// A check failed: the error is reported and the previous `available` stays, so a flaky connection does not
    /// make an announced update vanish.
    pub fn record_err(&mut self, wall_ms: u64, mono_ms: u64, error: CmdError) {
        self.checked_at = Some(wall_ms);
        self.checked_mono = Some(mono_ms);
        self.error = Some(error);
    }

    pub fn status(&self, current: Version) -> UpdateStatus {
        UpdateStatus {
            current: current.to_string(),
            checked_at: self.checked_at,
            available: self.available.as_ref().map(|(_, available)| available.clone()),
            error: self.error.clone(),
        }
    }

    /// The tag of the available release.
    pub fn available_tag(&self) -> Option<&str> {
        self.available.as_ref().map(|(tag, _)| tag.as_str())
    }

    /// The release's page, or the releases list when none is known.
    pub fn page_url(&self) -> String {
        self.available_tag().map_or_else(|| RELEASES_PAGE.to_owned(), release_page_url)
    }
}

/// A non-success answer of [`RELEASES_API`]. GitHub says 403 for an exhausted hourly quota and 429 for its
/// abuse limits; both mean "later", so both are `rate_limited`. The message does not repeat GitHub's, which names
/// the caller's address.
pub fn api_error(status: u16, body: &str) -> CmdError {
    match status {
        403 | 429 => CmdError {
            kind: ErrorKind::RateLimited,
            message: "GitHub is limiting requests from this network; try again later".into(),
            status: Some(status),
        },
        _ => CmdError::from_status(status, body),
    }
}

// ---------- download progress ----------

/// Decides which download chunks are worth a message to the page: the first, then at most every
/// [`PROGRESS_MIN_GAP_MS`] and, when the size is known, only when the percentage moved; the end always goes out
/// (once). A 10 MB setup in 16 KB chunks would otherwise be hundreds of IPC messages.
#[derive(Debug, Default)]
pub struct ProgressThrottle {
    last_sent_ms: Option<u64>,
    last_percent: Option<u8>,
}

impl ProgressThrottle {
    pub fn new() -> Self {
        Self::default()
    }

    /// `now_ms` is a monotonic clock. Records the message when it says yes.
    pub fn should_send(&mut self, now_ms: u64, downloaded: u64, total: Option<u64>) -> bool {
        let percent = total
            .filter(|total| *total > 0)
            .map(|total| (u128::from(downloaded) * 100 / u128::from(total)).min(100) as u8);
        let send = match self.last_sent_ms {
            None => true,
            Some(_) if percent == Some(100) && self.last_percent != Some(100) => true,
            Some(last) if now_ms.saturating_sub(last) < PROGRESS_MIN_GAP_MS => false,
            Some(_) => match (percent, self.last_percent) {
                (Some(now), Some(before)) => now > before,
                _ => true,
            },
        };
        if send {
            self.last_sent_ms = Some(now_ms);
            self.last_percent = percent;
        }
        send
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::{json, Value};

    const TAG_URL_BASE: &str = "https://github.com/trananhtung/todopet-windows/releases/download";

    fn v(major: u16, minor: u16, patch: u16) -> Version {
        Version { major, minor, patch }
    }

    // ---------- tags and versions ----------

    #[test]
    fn parses_strict_tags() {
        assert_eq!(parse_tag("v0.7.1"), Some(v(0, 7, 1)));
        assert_eq!(parse_tag("v0.0.0"), Some(v(0, 0, 0)));
        assert_eq!(parse_tag("v10.20.30"), Some(v(10, 20, 30)));
        assert_eq!(parse_tag("v9999.9999.9999"), Some(v(9999, 9999, 9999)));
    }

    #[test]
    fn refuses_everything_that_is_not_exactly_v_and_three_numbers() {
        let bad = [
            "",
            "v",
            "0.7.1",
            "V0.7.1",
            "vv0.7.1",
            "v0.7",
            "v0",
            "v0.7.1.2",
            "v0.7.1-rc1",
            "v0.7.1-rc.1",
            "v0.7.1+build5",
            "v0.7.1 ",
            " v0.7.1",
            "v0.7.1\n",
            "v+0.7.1",
            "v0.+7.1",
            "v-1.2.3",
            "v01.2.3",
            "v1.02.3",
            "v1.2.03",
            "v00.0.0",
            "v10000.0.0",
            "v0.10000.0",
            "v0.0.10000",
            "v99999999999999999999.0.0",
            "v1..3",
            "v1.2.",
            "v.1.2",
            "v...",
            "v1.2.3.",
            "v0x1.2.3",
            "v1_0.2.3",
            "v１.2.3",
            "v٣.2.3",
            "v1.2.3\u{0}",
            "latest",
            "nightly",
        ];
        for tag in bad {
            assert_eq!(parse_tag(tag), None, "{tag:?} must be refused");
        }
    }

    #[test]
    fn parses_the_running_version_without_v() {
        assert_eq!(Version::parse("0.7.1"), Some(v(0, 7, 1)));
        assert_eq!(Version::parse("v0.7.1"), None);
        assert_eq!(Version::parse("0.7.1-beta.1"), None);
        assert_eq!(Version::parse(""), None);
    }

    #[test]
    fn versions_order_numerically_and_print_without_v() {
        assert!(v(0, 7, 10) > v(0, 7, 9));
        assert!(v(0, 10, 0) > v(0, 9, 99));
        assert!(v(1, 0, 0) > v(0, 99, 99));
        assert!(v(0, 7, 1) == v(0, 7, 1));
        assert_eq!(v(0, 7, 1).to_string(), "0.7.1");
        assert_eq!(v(0, 7, 1).tag(), "v0.7.1");
        assert_eq!(parse_tag(&v(12, 0, 3).tag()), Some(v(12, 0, 3)));
    }

    #[test]
    fn every_canonical_tag_round_trips_and_no_padded_spelling_does() {
        let edges = [0u16, 1, 9, 10, 99, 100, 999, 1000, 9999];
        for &major in &edges {
            for &minor in &edges {
                for &patch in &edges {
                    let version = v(major, minor, patch);
                    assert_eq!(parse_tag(&version.tag()), Some(version));
                    assert_eq!(Version::parse(&version.to_string()), Some(version));
                    // The same numbers with a leading zero are a different spelling and are refused.
                    assert_eq!(parse_tag(&format!("v0{major}.{minor}.{patch}")), None);
                    assert_eq!(parse_tag(&format!("v{major}.{minor}.{patch}0000")), None);
                }
            }
        }
    }

    // ---------- the releases list ----------

    /// A release as the GitHub API sends it, with plenty of fields we do not read.
    fn release(tag: &str, draft: bool, prerelease: bool, assets: Value) -> Value {
        json!({
            "url": "https://api.github.com/repos/trananhtung/todopet-windows/releases/1",
            "id": 1,
            "author": { "login": "someone", "id": 7, "type": "User" },
            "tag_name": tag,
            "target_commitish": "main",
            "name": format!("TodoPet {tag}"),
            "draft": draft,
            "prerelease": prerelease,
            "created_at": "2026-10-01T10:00:00Z",
            "published_at": "2026-10-01T10:05:00Z",
            "assets": assets,
            "body": "- one\n- two",
            "reactions": { "total_count": 3 },
        })
    }

    fn manifest_asset(tag: &str) -> Value {
        json!({ "name": "latest.json", "size": 900, "browser_download_url": manifest_url(tag) })
    }

    fn parse(list: Value) -> Vec<Release> {
        parse_releases(list.to_string().as_bytes()).unwrap()
    }

    #[test]
    fn reads_the_api_list_and_ignores_unknown_fields() {
        let releases = parse(json!([release("v0.7.1", false, true, json!([manifest_asset("v0.7.1")]))]));
        assert_eq!(releases.len(), 1);
        assert_eq!(releases[0].tag_name, "v0.7.1");
        assert!(releases[0].prerelease);
        assert!(!releases[0].draft);
        assert_eq!(releases[0].assets[0].name, "latest.json");
        assert_eq!(releases[0].body.as_deref(), Some("- one\n- two"));
    }

    #[test]
    fn a_release_with_null_fields_still_reads() {
        let releases = parse(json!([{ "tag_name": "v0.7.1", "body": null, "published_at": null, "assets": [] }]));
        assert_eq!(releases.len(), 1);
        assert_eq!(releases[0].body, None);
        assert_eq!(releases[0].published_at, None);
        assert!(!releases[0].draft);
    }

    #[test]
    fn one_odd_entry_does_not_hide_the_rest() {
        let releases = parse(json!([
            { "id": 5, "name": "no tag at all" },
            "a string",
            null,
            { "tag_name": 7 },
            release("v0.7.1", false, false, json!([])),
        ]));
        assert_eq!(releases.len(), 1);
        assert_eq!(releases[0].tag_name, "v0.7.1");
    }

    #[test]
    fn refuses_answers_that_are_not_a_list() {
        for body in ["", "not json", "{}", r#"{"message":"Not Found"}"#, "null", "42", "\"x\""] {
            let e = parse_releases(body.as_bytes()).unwrap_err();
            assert_eq!(e.kind, ErrorKind::Http, "{body:?}");
        }
        assert!(parse_releases(b"[]").unwrap().is_empty());
        assert!(parse_releases(&[0xff, 0xfe, b'[']).is_err());
    }

    // ---------- picking the newest ----------

    #[test]
    fn picks_the_highest_tag_above_the_current_version() {
        let list = parse(json!([
            release("v0.7.0", false, true, json!([])),
            release("v0.7.10", false, true, json!([])),
            release("v0.7.9", false, true, json!([])),
            release("v0.6.0", false, true, json!([])),
        ]));
        let c = pick_newer(&list, v(0, 6, 0)).unwrap();
        assert_eq!(c.version, v(0, 7, 10));
        assert_eq!(c.tag, "v0.7.10");
    }

    #[test]
    fn a_release_with_a_manifest_wins_over_a_higher_one_without() {
        // One stray published v9999.0.0 (or any manual-only release) must not hide the releases that can update in
        // one click.
        let list = parse(json!([
            release("v9999.0.0", false, true, json!([])),
            release("v0.8.0", false, true, json!([manifest_asset("v0.8.0")])),
            release("v0.7.1", false, true, json!([manifest_asset("v0.7.1")])),
            release("v0.9.0", false, true, json!([])),
        ]));
        let c = pick_newer(&list, v(0, 7, 0)).unwrap();
        assert_eq!((c.tag.as_str(), c.has_manifest), ("v0.8.0", true));
    }

    #[test]
    fn without_any_manifest_above_the_current_version_the_highest_release_is_offered_by_hand() {
        let list = parse(json!([
            release("v0.9.0", false, true, json!([])),
            release("v9999.0.0", false, true, json!([])),
            release("v0.8.0", false, true, json!([])),
            // A manifest, but not above the running version, and one from a draft: neither makes a release preferred.
            release("v0.6.0", false, true, json!([manifest_asset("v0.6.0")])),
            release("v10.0.0", true, true, json!([manifest_asset("v10.0.0")])),
        ]));
        let c = pick_newer(&list, v(0, 7, 0)).unwrap();
        assert_eq!((c.tag.as_str(), c.has_manifest), ("v9999.0.0", false));
    }

    #[test]
    fn a_manifest_that_is_not_the_releases_own_does_not_make_it_preferred() {
        let list = parse(json!([
            release("v0.8.0", false, true, json!([manifest_asset("v0.7.5")])),
            release("v0.7.1", false, true, json!([manifest_asset("v0.7.1")])),
        ]));
        assert_eq!(pick_newer(&list, v(0, 7, 0)).unwrap().tag, "v0.7.1");
    }

    #[test]
    fn nothing_when_the_current_version_is_the_newest_or_newer() {
        let list = parse(json!([release("v0.7.0", false, true, json!([])), release("v0.6.0", false, true, json!([]))]));
        assert_eq!(pick_newer(&list, v(0, 7, 0)), None);
        assert_eq!(pick_newer(&list, v(0, 8, 0)), None);
        assert_eq!(pick_newer(&[], v(0, 1, 0)), None);
    }

    #[test]
    fn drafts_are_invisible_even_when_they_are_the_highest() {
        let list = parse(json!([
            release("v0.9.0", true, true, json!([manifest_asset("v0.9.0")])),
            release("v0.7.1", false, true, json!([])),
        ]));
        assert_eq!(pick_newer(&list, v(0, 7, 0)).unwrap().tag, "v0.7.1");
        let only_draft = parse(json!([release("v0.9.0", true, false, json!([]))]));
        assert_eq!(pick_newer(&only_draft, v(0, 7, 0)), None);
    }

    #[test]
    fn pre_releases_count() {
        let list = parse(json!([release("v0.7.1", false, true, json!([]))]));
        assert_eq!(pick_newer(&list, v(0, 7, 0)).unwrap().tag, "v0.7.1");
    }

    #[test]
    fn tags_that_are_not_strict_are_skipped_even_when_they_look_higher() {
        let list = parse(json!([
            release("v1.0.0-rc1", false, true, json!([])),
            release("v2.0", false, true, json!([])),
            release("v09.0.0", false, true, json!([])),
            release("nightly", false, true, json!([])),
            release("", false, true, json!([])),
            release("v0.7.1", false, true, json!([])),
        ]));
        assert_eq!(pick_newer(&list, v(0, 7, 0)).unwrap().tag, "v0.7.1");
    }

    #[test]
    fn the_manifest_counts_only_with_the_exact_name_and_address() {
        let tag = "v0.7.1";
        let pick = |assets: Value| {
            let list = parse(json!([release(tag, false, true, assets)]));
            pick_newer(&list, v(0, 7, 0)).unwrap().has_manifest
        };
        assert!(pick(json!([manifest_asset(tag)])));
        assert!(pick(json!([
            { "name": "TodoPet_0.7.1_x64-setup.exe", "browser_download_url": format!("{TAG_URL_BASE}/{tag}/TodoPet_0.7.1_x64-setup.exe") },
            manifest_asset(tag),
        ])));
        assert!(!pick(json!([])));
        // Another release's manifest, another host, another name.
        assert!(!pick(json!([{ "name": "latest.json", "browser_download_url": manifest_url("v0.7.0") }])));
        assert!(!pick(json!([{ "name": "latest.json", "browser_download_url": "https://evil.example/latest.json" }])));
        assert!(!pick(
            json!([{ "name": "latest.json", "browser_download_url": format!("{}?x=1", manifest_url(tag)) }])
        ));
        assert!(!pick(json!([{ "name": "Latest.json", "browser_download_url": manifest_url(tag) }])));
        assert!(!pick(json!([{ "name": "latest.json.sig", "browser_download_url": manifest_url(tag) }])));
        assert!(!pick(json!([{ "name": "latest.json" }])));
        assert!(!pick(json!([{}])));
    }

    #[test]
    fn publication_dates_must_look_like_iso_timestamps() {
        for ok in [
            "2026-10-30",
            "2026-10-30T12:34:56Z",
            "2026-10-30T12:34:56.789Z",
            "2026-10-30T12:34:56+07:00",
            "2026-10-30T12:34Z",
        ] {
            assert!(valid_timestamp(ok), "{ok:?} should pass");
        }
        let long = format!("2026-10-30T12:34:56{}", "0".repeat(40));
        for bad in [
            "",
            "yesterday",
            "2026-1-30",
            "2026-13-01",
            "2026-00-10",
            "2026-10-32",
            "2026-10-00",
            "2026-10-30 12:34:56",
            "2026-10-30T",
            "2026-10-30T12",
            "2026-10-30T12:34:56 <b>",
            "2026-10-30T12:34:56Z\n",
            "2026-10-30T12:34:56Z; DROP",
            "２０２６-10-30",
            &long,
        ] {
            assert!(!valid_timestamp(bad), "{bad:?} should fail");
        }

        let with = |published: Value| {
            let mut r = release("v0.7.1", false, true, json!([]));
            r["published_at"] = published;
            pick_newer(&parse(json!([r])), v(0, 7, 0)).unwrap().published_at
        };
        assert_eq!(with(json!("2026-10-30T12:34:56Z")).as_deref(), Some("2026-10-30T12:34:56Z"));
        assert_eq!(with(json!("soon")), None);
        assert_eq!(with(Value::Null), None);
    }

    #[test]
    fn the_candidate_carries_cleaned_notes() {
        let mut r = release("v0.7.1", false, true, json!([]));
        r["body"] = json!("Hello\r\n\u{7}world\r\n\r\n\r\n\r\nbye  \n");
        let c = pick_newer(&parse(json!([r])), v(0, 7, 0)).unwrap();
        assert_eq!(c.notes, "Hello\nworld\n\nbye");
        let mut none = release("v0.7.1", false, true, json!([]));
        none["body"] = Value::Null;
        assert_eq!(pick_newer(&parse(json!([none])), v(0, 7, 0)).unwrap().notes, "");
    }

    // ---------- addresses ----------

    #[test]
    fn builds_addresses_from_the_tag() {
        assert_eq!(release_page_url("v0.7.1"), "https://github.com/trananhtung/todopet-windows/releases/tag/v0.7.1");
        assert_eq!(
            manifest_url("v0.7.1"),
            "https://github.com/trananhtung/todopet-windows/releases/download/v0.7.1/latest.json"
        );
        assert_eq!(RELEASES_PAGE, "https://github.com/trananhtung/todopet-windows/releases");
        assert_eq!(RELEASES_API, "https://api.github.com/repos/trananhtung/todopet-windows/releases?per_page=20");
        for url in [RELEASES_PAGE, RELEASES_API, &release_page_url("v1.2.3"), &manifest_url("v1.2.3")] {
            assert!(crate::validate::open_url(url).is_ok(), "{url}");
        }
    }

    fn installer(tag: &str, file: &str) -> String {
        format!("{TAG_URL_BASE}/{tag}/{file}")
    }

    #[test]
    fn accepts_the_installer_under_the_release_download_prefix() {
        let url = installer("v0.7.1", "TodoPet_0.7.1_x64-setup.exe");
        assert!(installer_url_ok(&url, "v0.7.1"));
        assert!(installer_url_ok(&installer("v12.0.3", "TodoPet_12.0.3_x64-setup.exe"), "v12.0.3"));
    }

    #[test]
    fn accepts_only_the_setup_of_that_very_version() {
        let t = "v0.7.1";
        for file in [
            "setup.exe",
            "installer.exe",
            "TodoPet_0.7.0_x64-setup.exe",
            "TodoPet_0.7.10_x64-setup.exe",
            "TodoPet_0.7_x64-setup.exe",
            "TodoPet_v0.7.1_x64-setup.exe",
            "todopet_0.7.1_x64-setup.exe",
            "TodoPet_0.7.1_x64-setup.EXE",
            "TodoPet_0.7.1_x64-setup.exe.sig",
            "TodoPet_0.7.1_x64-setup.exe ",
            "TodoPet_0.7.1_x64-setup.exe.zip",
            "TodoPet_0.7.1_x86-setup.exe",
            "TodoPet_0.7.1_x64.msi",
            "TodoPet_0.7.1_x64%2Dsetup.exe",
            "latest.json",
            "TodoPet_0.7.1_x64-setup.exe%00",
        ] {
            assert!(!installer_url_ok(&installer(t, file), t), "{file}");
        }
    }

    #[test]
    fn refuses_installers_from_anywhere_else() {
        let good = "TodoPet_0.7.1_x64-setup.exe";
        let t = "v0.7.1";
        let cases: Vec<(String, &str)> = vec![
            (installer(t, good).replace("https:", "http:"), "plain http"),
            (installer(t, good).replace("github.com", "github.com.evil.example"), "host suffix"),
            (installer(t, good).replace("github.com", "evil.example"), "other host"),
            (installer(t, good).replace("github.com", "objects.githubusercontent.com"), "CDN host"),
            (installer(t, good).replace("https://", "https://user@"), "user name"),
            (installer(t, good).replace("https://", "https://user:pw@"), "user and password"),
            (
                "https://github.com@evil.example/trananhtung/todopet-windows/releases/download/v0.7.1/x.exe".into(),
                "userinfo trick",
            ),
            (installer(t, good).replace("github.com", "github.com:8443"), "port"),
            (installer(t, good).replace("github.com", "github.com:443"), "default port spelled out"),
            (installer(t, good).replace("github.com", "GitHub.com"), "host in other case"),
            (format!(" {}", installer(t, good)), "leading space"),
            (format!("{} ", installer(t, good)), "trailing space"),
            (format!("{}\n", installer(t, good)), "trailing newline"),
            (installer(t, good).replace("todopet-windows", "todopet-win\tdows"), "tab inside (the parser drops it)"),
            (installer(t, good).replace("releases", "rel\neases"), "newline inside (the parser drops it)"),
            (format!("{}?raw=1", installer(t, good)), "query"),
            (format!("{}?", installer(t, good)), "empty query"),
            (format!("{}#frag", installer(t, good)), "fragment"),
            (format!("{}#", installer(t, good)), "empty fragment"),
            (installer("v0.7.0", good), "other tag"),
            (installer("v0.7.10", good), "tag prefix"),
            (installer("v0.7.1", good).replace("trananhtung", "someone-else"), "other owner"),
            (installer("v0.7.1", good).replace("todopet-windows", "todopet"), "other repo"),
            (installer("v0.7.1", good).replace("trananhtung", "TranAnhTung"), "owner in other case"),
            (installer("v0.7.1", good).replace("/releases/download/", "/raw/"), "not a release download"),
            (format!("{TAG_URL_BASE}/{t}/"), "no file"),
            (format!("{TAG_URL_BASE}/{t}"), "no file, no slash"),
            (format!("{TAG_URL_BASE}/{t}/a/{good}"), "two segments"),
            (format!("{TAG_URL_BASE}/{t}//{good}"), "empty segment"),
            (format!("{TAG_URL_BASE}/{t}/{good}/"), "trailing slash"),
            (format!("{TAG_URL_BASE}/{t}/../v0.6.0/{good}"), "dot dot to another tag"),
            (format!("{TAG_URL_BASE}/{t}/%2e%2e/{good}"), "encoded dot dot"),
            (format!("{TAG_URL_BASE}/{t}/%2E%2E/{good}"), "encoded dot dot, upper case"),
            (format!("{TAG_URL_BASE}/{t}/.."), "dot dot as the file"),
            (format!("{TAG_URL_BASE}/{t}/."), "dot as the file"),
            (format!("{TAG_URL_BASE}/{t}/a%2Fb.exe"), "encoded slash"),
            (format!("{TAG_URL_BASE}/{t}/a%2fb.exe"), "encoded slash, lower case"),
            (format!("{TAG_URL_BASE}/{t}/a%5Cb.exe"), "encoded backslash"),
            (format!("{TAG_URL_BASE}/{t}/a%5cb.exe"), "encoded backslash, lower case"),
            (format!("{TAG_URL_BASE}/{t}/a%00.exe"), "encoded NUL"),
            ("".into(), "empty"),
            ("not a url".into(), "not a url"),
            ("/trananhtung/todopet-windows/releases/download/v0.7.1/x.exe".into(), "no host"),
            ("file:///C:/setup.exe".into(), "file scheme"),
            ("javascript:alert(1)".into(), "javascript scheme"),
        ];
        for (url, why) in cases {
            assert!(!installer_url_ok(&url, t), "{why}: {url}");
        }
    }

    #[test]
    fn a_bad_tag_matches_nothing() {
        for tag in ["", "0.7.1", "v0.7", "v0.7.1/../v0.6.0", "v0.7.1/", "v0.7.1-rc1", "v01.0.0"] {
            assert!(!installer_url_ok(&format!("{TAG_URL_BASE}/{tag}/setup.exe"), tag), "{tag:?}");
        }
    }

    // ---------- release notes ----------

    #[test]
    fn notes_lose_control_characters_but_keep_newlines_and_tabs() {
        assert_eq!(clean_notes("a\r\nb\rc"), "a\nbc");
        assert_eq!(clean_notes("a\u{0}b\u{7}c\u{8}d\u{1b}[31me\u{7f}f\u{85}g\u{9f}h"), "abcd[31mefgh");
        assert_eq!(clean_notes("- item\n\t- sub item"), "- item\n\t- sub item");
        // Unicode line and paragraph separators would start a new line in some renderers: say so plainly.
        assert_eq!(clean_notes("a\u{2028}b\u{2029}c"), "a\nb\nc");
    }

    #[test]
    fn notes_lose_text_direction_overrides_but_keep_emoji_joiners() {
        assert_eq!(clean_notes("a\u{202E}b\u{202A}c\u{2066}d\u{2069}e\u{200E}f\u{200F}g\u{061C}h"), "abcdefgh");
        assert_eq!(clean_notes("👨\u{200D}👩\u{200D}👧 ✨"), "👨\u{200D}👩\u{200D}👧 ✨");
    }

    #[test]
    fn notes_lose_invisible_format_characters() {
        // Unicode category Cf, by sample from each block: they draw nothing, so they could hide or reorder text.
        let invisible = [
            '\u{AD}',
            '\u{600}',
            '\u{605}',
            '\u{61C}',
            '\u{6DD}',
            '\u{70F}',
            '\u{890}',
            '\u{8E2}',
            '\u{180E}',
            '\u{200B}',
            '\u{200C}',
            '\u{200E}',
            '\u{200F}',
            '\u{202A}',
            '\u{202E}',
            '\u{2060}',
            '\u{2061}',
            '\u{2064}',
            '\u{2066}',
            '\u{2069}',
            '\u{206A}',
            '\u{206F}',
            '\u{FEFF}',
            '\u{FFF9}',
            '\u{FFFB}',
            '\u{110BD}',
            '\u{110CD}',
            '\u{13430}',
            '\u{1343F}',
            '\u{1BCA0}',
            '\u{1BCA3}',
            '\u{1D173}',
            '\u{1D17A}',
            '\u{E0001}',
            '\u{E0020}',
            '\u{E0041}',
            '\u{E007F}',
        ];
        for c in invisible {
            assert_eq!(clean_notes(&format!("a{c}b")), "ab", "U+{:04X}", c as u32);
        }
        // A tag sequence spelling out text is gone entirely.
        let tags: String = "ignore previous".chars().map(|c| char::from_u32(0xE0000 + c as u32).unwrap()).collect();
        assert_eq!(clean_notes(&format!("fine{tags}!")), "fine!");
    }

    #[test]
    fn notes_lose_blank_filler_characters() {
        for c in ['\u{115F}', '\u{1160}', '\u{3164}', '\u{FFA0}'] {
            assert_eq!(clean_notes(&format!("a{c}b")), "ab", "U+{:04X}", c as u32);
            assert_eq!(clean_notes(&format!("{c}{c}")), "", "U+{:04X}", c as u32);
        }
    }

    #[test]
    fn notes_keep_what_emoji_and_real_scripts_need() {
        for kept in [
            "👨\u{200D}👩\u{200D}👧",
            "❤\u{FE0F}",
            "1\u{FE0F}\u{20E3}",
            "🇻🇳",
            "👍🏽",
            "한국어 \u{1100}\u{1161} \u{D55C}",
            "Việt Nam 日本語 مرحبا שלום",
            "a\u{0301} e\u{0323}",
        ] {
            assert_eq!(clean_notes(kept), kept);
        }
    }

    #[test]
    fn notes_collapse_long_runs_of_blank_lines_and_are_trimmed() {
        assert_eq!(clean_notes("a\n\n\n\nb"), "a\n\nb");
        assert_eq!(clean_notes("a\n\n\nb"), "a\n\nb");
        assert_eq!(clean_notes("a\n\nb"), "a\n\nb");
        assert_eq!(clean_notes("a\nb"), "a\nb");
        assert_eq!(clean_notes("a\n  \n \t \n\n\nb"), "a\n\nb");
        assert_eq!(clean_notes("\n\n  hello  \n\n"), "hello");
        assert_eq!(clean_notes("line  \nnext\t"), "line\nnext");
        assert_eq!(clean_notes(""), "");
        assert_eq!(clean_notes(" \n\t\r\n "), "");
    }

    #[test]
    fn notes_are_cut_to_sixty_lines() {
        let lines = |n: usize| (1..=n).map(|i| format!("line {i}")).collect::<Vec<_>>().join("\n");
        assert_eq!(clean_notes(&lines(60)), lines(60));
        let cut = clean_notes(&lines(61));
        assert_eq!(cut, format!("{}…", lines(60)));
        let way_over = clean_notes(&lines(500));
        assert_eq!(way_over.split('\n').count(), 60);
        assert!(way_over.ends_with("line 60…"));
    }

    #[test]
    fn notes_are_cut_to_four_thousand_characters_on_a_character_boundary() {
        let exact = "x".repeat(4000);
        assert_eq!(clean_notes(&exact), exact);
        let over = clean_notes(&"x".repeat(4001));
        assert_eq!(over.chars().count(), 4000);
        assert!(over.ends_with('…'));
        assert!(over.starts_with(&"x".repeat(3999)));

        for unit in ["ệ", "日", "😀", "e\u{301}"] {
            let cut = clean_notes(&unit.repeat(5000));
            assert!(cut.chars().count() <= 4000, "{unit:?}");
            assert!(cut.ends_with('…'), "{unit:?}");
        }
        assert_eq!(clean_notes(&"😀".repeat(4000)), "😀".repeat(4000));
    }

    #[test]
    fn notes_never_exceed_either_limit() {
        let wide_lines = (0..80).map(|i| format!("{i} {}", "y".repeat(100))).collect::<Vec<_>>().join("\n");
        for raw in
            [wide_lines, "z\n".repeat(10_000), "w".repeat(1_000_000), "\n".repeat(100_000), "a\n\n\n".repeat(5000)]
        {
            let out = clean_notes(&raw);
            assert!(out.chars().count() <= MAX_NOTES_CHARS);
            assert!(out.split('\n').count() <= MAX_NOTES_LINES);
            assert_eq!(out, out.trim());
        }
    }

    #[test]
    fn a_cut_note_does_not_end_on_a_dangling_space_before_the_ellipsis() {
        let raw = format!("{} tail", "x".repeat(3998));
        let out = clean_notes(&raw);
        assert!(out.ends_with("x…"), "{out:?}");
    }

    // ---------- one click or the download page ----------

    #[test]
    fn decides_whether_to_try_the_signed_manifest() {
        let reason = manual_reason_before_check;
        assert_eq!(reason(InstallKind::Msi, true), Some(ManualReason::Msi));
        assert_eq!(reason(InstallKind::Msi, false), Some(ManualReason::Msi));
        assert_eq!(reason(InstallKind::Other, true), Some(ManualReason::Dev));
        assert_eq!(reason(InstallKind::Other, false), Some(ManualReason::Dev));
        assert_eq!(reason(InstallKind::Nsis, false), Some(ManualReason::Unsigned));
        assert_eq!(reason(InstallKind::Nsis, true), None);
    }

    fn candidate(minor: u16, has_manifest: bool) -> Candidate {
        let version = v(0, minor, 1);
        Candidate {
            version,
            tag: version.tag(),
            notes: "What is new".into(),
            published_at: Some("2026-10-30T12:00:00Z".into()),
            has_manifest,
        }
    }

    fn available(minor: u16, reason: Option<ManualReason>) -> (String, AvailableUpdate) {
        let c = candidate(minor, true);
        (c.tag.clone(), AvailableUpdate::from_candidate(&c, reason))
    }

    #[test]
    fn can_install_exactly_when_there_is_no_manual_reason() {
        let one_click = AvailableUpdate::from_candidate(&candidate(8, true), None);
        assert!(one_click.can_install);
        assert_eq!(one_click.manual_reason, None);
        assert_eq!(one_click.version, "0.8.1");
        assert_eq!(one_click.notes, "What is new");
        assert_eq!(one_click.published_at.as_deref(), Some("2026-10-30T12:00:00Z"));
        for reason in [ManualReason::Msi, ManualReason::Unsigned, ManualReason::Dev, ManualReason::CheckFailed] {
            let manual = AvailableUpdate::from_candidate(&candidate(8, true), Some(reason));
            assert!(!manual.can_install);
            assert_eq!(manual.manual_reason, Some(reason));
        }
    }

    // ---------- the shape the page reads ----------

    #[test]
    fn serializes_the_status_like_the_ts_contract() {
        let mut t = Tracker::new();
        assert_eq!(
            serde_json::to_value(t.status(v(0, 7, 0))).unwrap(),
            json!({ "current": "0.7.0", "checkedAt": null, "available": null, "error": null })
        );

        t.record_ok(1_700_000_000_000, 5, Some(available(8, None)));
        assert_eq!(
            serde_json::to_value(t.status(v(0, 7, 0))).unwrap(),
            json!({
                "current": "0.7.0",
                "checkedAt": 1_700_000_000_000u64,
                "available": {
                    "version": "0.8.1",
                    "notes": "What is new",
                    "publishedAt": "2026-10-30T12:00:00Z",
                    "canInstall": true,
                    "manualReason": null
                },
                "error": null
            })
        );

        t.record_err(1_700_000_001_000, 9, api_error(429, ""));
        let json = serde_json::to_value(t.status(v(0, 7, 0))).unwrap();
        assert_eq!(
            json["error"],
            json!({ "kind": "rate_limited", "message": json["error"]["message"], "status": 429 })
        );
        assert_eq!(json["available"]["version"], "0.8.1");
    }

    #[test]
    fn serializes_the_manual_reasons_like_the_ts_union() {
        let names: Vec<Value> =
            [ManualReason::Msi, ManualReason::Unsigned, ManualReason::Dev, ManualReason::CheckFailed]
                .iter()
                .map(|r| serde_json::to_value(r).unwrap())
                .collect();
        assert_eq!(names, vec![json!("msi"), json!("unsigned"), json!("dev"), json!("check_failed")]);

        let manual = AvailableUpdate::from_candidate(
            &Candidate { published_at: None, ..candidate(8, false) },
            Some(ManualReason::Unsigned),
        );
        let json = serde_json::to_value(manual).unwrap();
        assert_eq!(json["canInstall"], false);
        assert_eq!(json["manualReason"], "unsigned");
        assert_eq!(json["publishedAt"], Value::Null);
    }

    #[test]
    fn serializes_progress_like_the_ts_union() {
        assert_eq!(
            serde_json::to_value(UpdateProgress::Downloading { downloaded: 1024, total: Some(4096) }).unwrap(),
            json!({ "phase": "downloading", "downloaded": 1024, "total": 4096 })
        );
        assert_eq!(
            serde_json::to_value(UpdateProgress::Downloading { downloaded: 0, total: None }).unwrap(),
            json!({ "phase": "downloading", "downloaded": 0, "total": null })
        );
        assert_eq!(serde_json::to_value(UpdateProgress::Installing).unwrap(), json!({ "phase": "installing" }));
    }

    #[test]
    fn a_download_of_no_known_size_has_no_total_for_the_page_to_divide_by() {
        assert_eq!(UpdateProgress::downloading(5, Some(0)), UpdateProgress::Downloading { downloaded: 5, total: None });
        assert_eq!(UpdateProgress::downloading(5, None), UpdateProgress::Downloading { downloaded: 5, total: None });
        assert_eq!(
            UpdateProgress::downloading(5, Some(9)),
            UpdateProgress::Downloading { downloaded: 5, total: Some(9) }
        );
    }

    // ---------- when to ask GitHub, and what to remember ----------

    const MIN: u64 = 60_000;

    #[test]
    fn a_new_tracker_is_always_due() {
        let t = Tracker::new();
        assert!(t.due(0, false));
        assert!(t.due(0, true));
        let s = t.status(v(0, 7, 0));
        assert_eq!((s.checked_at, s.available, s.error), (None, None, None));
    }

    #[test]
    fn a_normal_check_reuses_a_result_younger_than_thirty_minutes() {
        let mut t = Tracker::new();
        t.record_ok(1_000, 10 * MIN, None);
        assert!(!t.due(10 * MIN, false));
        assert!(!t.due(10 * MIN + 29 * MIN + 59_999, false));
        assert!(t.due(10 * MIN + 30 * MIN, false));
        assert!(t.due(10 * MIN + 31 * MIN, false));
    }

    #[test]
    fn a_forced_check_waits_twenty_seconds() {
        let mut t = Tracker::new();
        t.record_ok(1_000, 500_000, None);
        assert!(!t.due(500_000, true));
        assert!(!t.due(500_000 + 19_999, true));
        assert!(t.due(500_000 + 20_000, true));
        assert!(t.due(500_000 + 5 * MIN, true));
    }

    #[test]
    fn a_failure_counts_as_a_check_so_a_dead_network_is_not_hammered() {
        let mut t = Tracker::new();
        t.record_err(1_000, 100, CmdError::network("offline"));
        assert!(!t.due(100 + 5 * MIN, false));
        assert!(!t.due(100 + 5_000, true));
        assert!(t.due(100 + 20_000, true));
        assert_eq!(t.status(v(0, 7, 0)).checked_at, Some(1_000));
    }

    #[test]
    fn a_clock_that_goes_backwards_does_not_lock_the_checks() {
        let mut t = Tracker::new();
        t.record_ok(1_000, 900_000, None);
        assert!(!t.due(100, true));
        assert!(!t.due(0, false));
    }

    #[test]
    fn a_failure_keeps_the_last_good_answer_and_a_success_replaces_it() {
        let mut t = Tracker::new();
        t.record_ok(1_000, 0, Some(available(8, None)));
        t.record_err(2_000, 1, CmdError::network("offline"));
        let s = t.status(v(0, 7, 0));
        assert_eq!(s.available.as_ref().map(|a| a.version.as_str()), Some("0.8.1"));
        assert_eq!(s.error.as_ref().map(|e| e.kind), Some(ErrorKind::Network));
        assert_eq!(s.checked_at, Some(2_000));
        assert_eq!(t.available_tag(), Some("v0.8.1"));

        t.record_ok(3_000, 2, Some(available(9, Some(ManualReason::Unsigned))));
        let s = t.status(v(0, 7, 0));
        assert_eq!(s.available.as_ref().map(|a| a.version.as_str()), Some("0.9.1"));
        assert_eq!(s.error, None);
        assert_eq!(t.available_tag(), Some("v0.9.1"));

        t.record_ok(4_000, 3, None);
        let s = t.status(v(0, 7, 0));
        assert_eq!((s.available, s.error), (None, None));
        assert_eq!(t.available_tag(), None);
    }

    #[test]
    fn the_page_is_the_releases_tag_or_the_list() {
        let mut t = Tracker::new();
        assert_eq!(t.page_url(), RELEASES_PAGE);
        t.record_ok(1, 1, Some(available(8, None)));
        assert_eq!(t.page_url(), "https://github.com/trananhtung/todopet-windows/releases/tag/v0.8.1");
        t.record_err(2, 2, CmdError::network("offline"));
        assert_eq!(t.page_url(), "https://github.com/trananhtung/todopet-windows/releases/tag/v0.8.1");
        t.record_ok(3, 3, None);
        assert_eq!(t.page_url(), RELEASES_PAGE);
    }

    // ---------- GitHub's error answers ----------

    #[test]
    fn github_limits_come_back_as_rate_limited() {
        for status in [403u16, 429] {
            let e = api_error(status, r#"{"message":"API rate limit exceeded for 1.2.3.4."}"#);
            assert_eq!(e.kind, ErrorKind::RateLimited, "{status}");
            assert_eq!(e.status, Some(status));
            assert!(!e.message.contains("1.2.3.4"), "no address of the user in the message");
            assert!(e.message.to_lowercase().contains("github"));
        }
    }

    #[test]
    fn other_github_failures_are_plain_http_errors() {
        let e = api_error(404, r#"{"message":"Not Found"}"#);
        assert_eq!((e.kind, e.status), (ErrorKind::Http, Some(404)));
        assert_eq!(e.message, "HTTP 404: Not Found");
        let e = api_error(500, "");
        assert_eq!((e.kind, e.message.as_str()), (ErrorKind::Http, "HTTP 500"));
        assert_eq!(api_error(301, "").kind, ErrorKind::Http);
        assert_eq!(api_error(401, "").kind, ErrorKind::Unauthorized);
    }

    // ---------- progress messages ----------

    #[test]
    fn progress_starts_at_once_and_is_limited_to_ten_a_second() {
        let mut p = ProgressThrottle::new();
        assert!(p.should_send(1_000, 1, None), "the first chunk is reported");
        assert!(!p.should_send(1_050, 2, None));
        assert!(!p.should_send(1_099, 3, None));
        assert!(p.should_send(1_100, 4, None));
        assert!(!p.should_send(1_150, 5, None));
        let sent = (0..1_000u64).filter(|i| p.should_send(1_200 + i, 10 + i, None)).count();
        assert_eq!(sent, 10, "one second of chunks makes ten messages");
    }

    #[test]
    fn progress_with_a_known_size_moves_by_whole_percents() {
        let mut p = ProgressThrottle::new();
        let total = Some(10_000u64);
        assert!(p.should_send(0, 10, total), "first chunk");
        // Plenty of time passes but the percentage has not moved.
        assert!(!p.should_send(500, 50, total));
        assert!(!p.should_send(900, 99, total));
        assert!(p.should_send(1_000, 100, total), "1%");
        assert!(!p.should_send(2_000, 150, total), "still 1%");
        // A percent moved, but too soon after the last message.
        assert!(!p.should_send(1_050, 300, total));
        assert!(p.should_send(1_100, 301, total), "3%");
    }

    #[test]
    fn the_end_of_the_download_is_always_reported_once() {
        let mut p = ProgressThrottle::new();
        let total = Some(1_000u64);
        assert!(p.should_send(0, 100, total));
        assert!(p.should_send(1, 1_000, total), "100% goes out at once, whatever the gap");
        assert!(!p.should_send(2, 1_000, total), "but not twice");
        assert!(!p.should_send(1_000, 1_200, total), "bytes past the announced size change nothing");
    }

    #[test]
    fn progress_survives_odd_sizes() {
        // A size of 0 is as good as no size: the same rules as an unknown total.
        let mut p = ProgressThrottle::new();
        assert!(p.should_send(0, 0, Some(0)));
        assert!(!p.should_send(50, 5, Some(0)));
        assert!(p.should_send(100, 5, Some(0)));
        let mut q = ProgressThrottle::new();
        assert!(q.should_send(0, u64::MAX, Some(u64::MAX)));
        let mut r = ProgressThrottle::new();
        assert!(r.should_send(0, u64::MAX / 2, Some(u64::MAX)));
        assert!(!r.should_send(1_000, u64::MAX / 2, Some(u64::MAX)));
    }

    // ---------- the committed configuration ----------
    //
    // These read files of the app crate so that CI (which only tests this crate) notices a change that would
    // weaken the update path: the key, the version check, the endpoints, the permissions.

    const TAURI_CONF: &str = include_str!("../../../tauri.conf.json");
    const CARGO_TOML: &str = include_str!("../../../Cargo.toml");
    const CAPABILITIES: [(&str, &str); 4] = [
        ("overlay", include_str!("../../../capabilities/overlay.json")),
        ("settings", include_str!("../../../capabilities/settings.json")),
        ("diary", include_str!("../../../capabilities/diary.json")),
        ("gallery", include_str!("../../../capabilities/gallery.json")),
    ];

    fn conf() -> Value {
        serde_json::from_str(TAURI_CONF).unwrap()
    }

    #[test]
    fn the_updater_config_trusts_our_key_and_requires_the_signed_version() {
        let conf = conf();
        let updater = &conf["plugins"]["updater"];
        assert_eq!(updater["requireSignedVersion"], json!(true));
        assert_eq!(updater["windows"]["installMode"], json!("passive"));
        // The page and Rust never take an address from the config: the endpoint is built from a tag.
        assert!(updater.get("endpoints").is_none(), "endpoints belong in code, built from the tag");
        for key in [
            "dangerousInsecureTransportProtocol",
            "dangerousAcceptInvalidCerts",
            "dangerousAcceptInvalidHostnames",
            "allowDowngrades",
        ] {
            assert!(updater.get(key).is_none(), "{key} must not be committed");
        }
        // The key is the base64 of a minisign public key file, which has a comment line and the key line.
        use base64::Engine;
        let pubkey = updater["pubkey"].as_str().expect("a pubkey");
        let decoded = base64::engine::general_purpose::STANDARD.decode(pubkey).expect("base64");
        let text = String::from_utf8(decoded).expect("utf-8");
        let mut lines = text.lines();
        assert!(lines.next().is_some_and(|l| l.starts_with("untrusted comment: minisign public key")), "{text}");
        let key_line = lines.next().expect("a key line");
        let key = base64::engine::general_purpose::STANDARD.decode(key_line).expect("key base64");
        assert_eq!(key.len(), 42, "2 bytes of algorithm, 8 of key id, 32 of key");
        assert_eq!(&key[..2], b"Ed");
    }

    #[test]
    fn the_app_and_the_bundle_report_the_same_version() {
        // The plugin compares the manifest with the bundle's version (tauri.conf.json), we compare releases with
        // Cargo's: they must be the same number, and one we can read.
        let cargo: toml_lite::Package = toml_lite::package(CARGO_TOML);
        let conf_version = conf()["version"].as_str().unwrap().to_owned();
        assert_eq!(cargo.version, conf_version);
        assert!(Version::parse(&conf_version).is_some(), "{conf_version} must be X.Y.Z for update checks");
    }

    #[test]
    fn the_plugin_stays_off_the_pages() {
        for (name, text) in CAPABILITIES {
            let capability: Value = serde_json::from_str(text).unwrap();
            for permission in capability["permissions"].as_array().unwrap() {
                let id = permission.as_str().or_else(|| permission["identifier"].as_str()).unwrap();
                assert!(!id.starts_with("updater"), "{name} grants {id}");
                assert!(!id.starts_with("core:default"), "{name} grants {id}, which would hide what a window can do");
            }
        }
    }

    #[test]
    fn only_the_windows_that_need_updates_can_call_them() {
        let allowed = |name: &str| -> Vec<String> {
            let text = CAPABILITIES.iter().find(|(n, _)| *n == name).unwrap().1;
            let capability: Value = serde_json::from_str(text).unwrap();
            capability["permissions"]
                .as_array()
                .unwrap()
                .iter()
                .filter_map(|p| p.as_str())
                .filter(|p| p.starts_with("allow-update-"))
                .map(str::to_owned)
                .collect()
        };
        let all = ["allow-update-status", "allow-update-check", "allow-update-install", "allow-update-open-page"];
        assert_eq!(allowed("overlay"), all);
        // Settings asks the overlay (over the bus) to install, so that the overlay can save its state first.
        assert_eq!(allowed("settings"), ["allow-update-status", "allow-update-check", "allow-update-open-page"]);
        assert!(allowed("diary").is_empty());
        assert!(allowed("gallery").is_empty());
    }

    #[test]
    fn windows_that_only_listen_cannot_emit_on_the_bus() {
        let granted = |name: &str| -> Vec<String> {
            let text = CAPABILITIES.iter().find(|(n, _)| *n == name).unwrap().1;
            let capability: Value = serde_json::from_str(text).unwrap();
            capability["permissions"].as_array().unwrap().iter().filter_map(|p| p.as_str()).map(str::to_owned).collect()
        };
        // The overlay and Settings talk on the bus (core:event:default includes emit).
        for name in ["overlay", "settings"] {
            assert!(granted(name).contains(&"core:event:default".to_owned()), "{name}");
        }
        // Diary and gallery only listen: a compromised page there must not be able to send `update-install`.
        for name in ["diary", "gallery"] {
            let permissions = granted(name);
            for needed in ["core:event:allow-listen", "core:event:allow-unlisten"] {
                assert!(permissions.contains(&needed.to_owned()), "{name} lacks {needed}");
            }
            for forbidden in ["core:event:default", "core:event:allow-emit", "core:event:allow-emit-to"] {
                assert!(!permissions.contains(&forbidden.to_owned()), "{name} grants {forbidden}");
            }
        }
    }

    /// Just enough TOML to read `[package] version`, so this crate needs no TOML parser for one test.
    mod toml_lite {
        pub struct Package {
            pub version: String,
        }

        pub fn package(text: &str) -> Package {
            let mut in_package = false;
            for line in text.lines() {
                let line = line.trim();
                if line.starts_with('[') {
                    in_package = line == "[package]";
                } else if in_package {
                    if let Some(rest) = line.strip_prefix("version") {
                        let value = rest.trim_start().strip_prefix('=').expect("version =").trim();
                        return Package { version: value.trim_matches('"').to_owned() };
                    }
                }
            }
            panic!("no [package] version");
        }
    }
}
