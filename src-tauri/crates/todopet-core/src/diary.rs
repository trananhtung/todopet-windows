//! Daily diary files (`<dir>/<yyyy-MM-dd>.jsonl`, one JSON entry per line) and the 14-day retention.
//!
//! Day names come from the JS side in the user's local time zone. Rust only knows UTC without extra
//! dependencies, so pruning at startup uses a reference day one day behind UTC (the earliest local day it
//! can be anywhere): it may keep a day too many, never deletes one too early. Appending the first entry of
//! a new day prunes again with that exact local day.

use crate::{validate, CmdError, CmdResult};
use std::fs::{self, OpenOptions};
use std::io::{self, Write};
use std::path::{Path, PathBuf};

/// Days of diary kept, today included.
pub const KEEP_DAYS: i64 = 14;
const EXT: &str = "jsonl";

/// Days since 1970-01-01 for a proleptic Gregorian date (H. Hinnant's `days_from_civil`).
pub fn days_from_civil(y: i64, m: u32, d: u32) -> i64 {
    let y = if m <= 2 { y - 1 } else { y };
    let era = y.div_euclid(400);
    let yoe = y - era * 400;
    let m = i64::from(m);
    let mp = if m > 2 { m - 3 } else { m + 9 };
    let doy = (153 * mp + 2) / 5 + i64::from(d) - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    era * 146_097 + doe - 719_468
}

/// Inverse of [`days_from_civil`].
pub fn civil_from_days(z: i64) -> (i64, u32, u32) {
    let z = z + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z - era * 146_097;
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = yoe + era * 400 + i64::from(m <= 2);
    // d is 1..=31 and m is 1..=12 by construction.
    (y, m as u32, d as u32)
}

fn is_leap(y: i64) -> bool {
    (y % 4 == 0 && y % 100 != 0) || y % 400 == 0
}

fn days_in_month(y: i64, m: u32) -> u32 {
    match m {
        1 | 3 | 5 | 7 | 8 | 10 | 12 => 31,
        4 | 6 | 9 | 11 => 30,
        2 if is_leap(y) => 29,
        _ => 28,
    }
}

/// Parses `yyyy-MM-dd` (exactly that shape, a real date) into days since the epoch.
pub fn parse_day(s: &str) -> Option<i64> {
    let b = s.as_bytes();
    if b.len() != 10 || b[4] != b'-' || b[7] != b'-' {
        return None;
    }
    let digits = |r: std::ops::Range<usize>| -> Option<u32> {
        b[r].iter().try_fold(0u32, |acc, &c| c.is_ascii_digit().then(|| acc * 10 + u32::from(c - b'0')))
    };
    let (y, m, d) = (i64::from(digits(0..4)?), digits(5..7)?, digits(8..10)?);
    if !(1..=12).contains(&m) || d == 0 || d > days_in_month(y, m) {
        return None;
    }
    Some(days_from_civil(y, m, d))
}

/// Formats days since the epoch as `yyyy-MM-dd`.
pub fn format_day(days: i64) -> String {
    let (y, m, d) = civil_from_days(days);
    format!("{y:04}-{m:02}-{d:02}")
}

/// The UTC day number of a Unix timestamp in seconds.
pub fn day_from_unix_secs(secs: i64) -> i64 {
    secs.div_euclid(86_400)
}

/// Days among `days` that fall before the `keep`-day window ending at `reference` (inclusive).
/// Entries that are not valid day names are ignored.
pub fn days_to_prune(days: &[String], reference: i64, keep: i64) -> Vec<&str> {
    let cutoff = reference - (keep - 1);
    days.iter().map(String::as_str).filter(|d| parse_day(d).is_some_and(|n| n < cutoff)).collect()
}

/// The diary folder.
#[derive(Debug, Clone)]
pub struct Diary {
    dir: PathBuf,
}

fn io_err(what: &str, e: io::Error) -> CmdError {
    CmdError::internal(format!("{what}: {e}"))
}

impl Diary {
    pub fn new(dir: impl Into<PathBuf>) -> Self {
        Self { dir: dir.into() }
    }

    pub fn dir(&self) -> &Path {
        &self.dir
    }

    fn file(&self, day: &str) -> PathBuf {
        self.dir.join(format!("{day}.{EXT}"))
    }

    /// Appends one line to `day`'s file. When this creates the file (first entry of a new day), days older
    /// than the retention window relative to `day` are deleted.
    pub fn append(&self, day: &str, line: &str) -> CmdResult<()> {
        let day = validate::diary_day(day)?;
        let line = validate::diary_line(line)?;
        fs::create_dir_all(&self.dir).map_err(|e| io_err("Could not create the diary folder", e))?;
        let path = self.file(day);
        let is_new = !path.exists();
        let mut f = OpenOptions::new()
            .create(true)
            .append(true)
            .open(&path)
            .map_err(|e| io_err("Could not open the diary", e))?;
        // One write call per line so concurrent appends from two windows never interleave mid-line.
        f.write_all(format!("{line}\n").as_bytes()).map_err(|e| io_err("Could not write the diary", e))?;
        if is_new {
            if let Some(reference) = parse_day(day) {
                self.prune(reference, KEEP_DAYS)?;
            }
        }
        Ok(())
    }

    /// The lines of `day`'s file, blank lines skipped. A missing file is an empty diary.
    pub fn read(&self, day: &str) -> CmdResult<Vec<String>> {
        let day = validate::diary_day(day)?;
        match fs::read_to_string(self.file(day)) {
            Ok(text) => Ok(text.lines().filter(|l| !l.trim().is_empty()).map(str::to_owned).collect()),
            Err(e) if e.kind() == io::ErrorKind::NotFound => Ok(Vec::new()),
            Err(e) => Err(io_err("Could not read the diary", e)),
        }
    }

    /// Days that have a diary file, newest first.
    pub fn days(&self) -> CmdResult<Vec<String>> {
        let entries = match fs::read_dir(&self.dir) {
            Ok(entries) => entries,
            Err(e) if e.kind() == io::ErrorKind::NotFound => return Ok(Vec::new()),
            Err(e) => return Err(io_err("Could not list the diary", e)),
        };
        let mut days: Vec<String> = entries
            .filter_map(Result::ok)
            .filter_map(|entry| {
                let name = entry.file_name().into_string().ok()?;
                let day = name.strip_suffix(&format!(".{EXT}"))?;
                parse_day(day).map(|_| day.to_owned())
            })
            .collect();
        // yyyy-MM-dd sorts chronologically as text.
        days.sort_unstable_by(|a, b| b.cmp(a));
        Ok(days)
    }

    /// Deletes day files before the `keep`-day window ending at `reference`. Returns the deleted days.
    pub fn prune(&self, reference: i64, keep: i64) -> CmdResult<Vec<String>> {
        let days = self.days()?;
        let mut removed = Vec::new();
        for day in days_to_prune(&days, reference, keep) {
            match fs::remove_file(self.file(day)) {
                Ok(()) => removed.push(day.to_owned()),
                Err(e) if e.kind() == io::ErrorKind::NotFound => {}
                Err(e) => return Err(io_err("Could not delete an old diary", e)),
            }
        }
        Ok(removed)
    }

    /// Startup pruning, given the current Unix time. See the module docs for why the reference is a day
    /// behind UTC.
    pub fn prune_at_startup(&self, now_unix_secs: i64) -> CmdResult<Vec<String>> {
        self.prune(day_from_unix_secs(now_unix_secs) - 1, KEEP_DAYS)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::store::test_dir;

    #[test]
    fn civil_round_trip() {
        assert_eq!(days_from_civil(1970, 1, 1), 0);
        assert_eq!(days_from_civil(2000, 3, 1), 11_017);
        assert_eq!(civil_from_days(0), (1970, 1, 1));
        assert_eq!(civil_from_days(-1), (1969, 12, 31));
        for z in (-800_000..800_000).step_by(997) {
            let (y, m, d) = civil_from_days(z);
            assert_eq!(days_from_civil(y, m, d), z);
        }
    }

    #[test]
    fn parses_and_formats_days() {
        let n = parse_day("2026-10-28").unwrap();
        assert_eq!(format_day(n), "2026-10-28");
        assert_eq!(parse_day("2026-03-01").unwrap() - parse_day("2026-02-28").unwrap(), 1);
        assert_eq!(parse_day("2024-03-01").unwrap() - parse_day("2024-02-28").unwrap(), 2);
        assert!(parse_day("2026-00-10").is_none());
        assert!(parse_day("2026-04-31").is_none());
        assert!(parse_day("2026/10/28").is_none());
        assert!(parse_day("2026-10-2x").is_none());
        assert!(parse_day("+026-10-28").is_none());
    }

    #[test]
    fn utc_day_from_timestamp() {
        // 2026-10-28T23:59:59Z and 2026-10-29T00:00:00Z
        assert_eq!(format_day(day_from_unix_secs(1_793_231_999)), "2026-10-28");
        assert_eq!(format_day(day_from_unix_secs(1_793_232_000)), "2026-10-29");
        assert_eq!(format_day(day_from_unix_secs(-1)), "1969-12-31");
    }

    #[test]
    fn prune_window_keeps_fourteen_days() {
        let reference = parse_day("2026-10-28").unwrap();
        let days: Vec<String> =
            ["2026-10-28", "2026-10-15", "2026-10-14", "2026-09-30", "junk"].iter().map(|s| s.to_string()).collect();
        assert_eq!(days_to_prune(&days, reference, KEEP_DAYS), vec!["2026-10-14", "2026-09-30"]);
    }

    #[test]
    fn append_read_list_and_prune_files() {
        let dir = test_dir("diary");
        let diary = Diary::new(dir.join("log"));
        assert_eq!(diary.days().unwrap(), Vec::<String>::new());
        assert_eq!(diary.read("2026-10-01").unwrap(), Vec::<String>::new());

        diary.append("2026-10-01", r#"{"a":1}"#).unwrap();
        diary.append("2026-10-01", r#"{"a":2}"#).unwrap();
        diary.append("2026-10-10", r#"{"b":1}"#).unwrap();
        fs::write(diary.dir().join("notes.txt"), "ignored").unwrap();
        assert_eq!(diary.read("2026-10-01").unwrap(), vec![r#"{"a":1}"#, r#"{"a":2}"#]);
        assert_eq!(diary.days().unwrap(), vec!["2026-10-10", "2026-10-01"]);

        // First entry of 2026-10-20: 2026-10-01 is outside the 14-day window and goes.
        diary.append("2026-10-20", r#"{"c":1}"#).unwrap();
        assert_eq!(diary.days().unwrap(), vec!["2026-10-20", "2026-10-10"]);

        // Startup on 2026-11-05 UTC (reference 11-04, window 10-22..11-04) removes the rest.
        let now = (parse_day("2026-11-05").unwrap() * 86_400) + 3600;
        assert_eq!(diary.prune_at_startup(now).unwrap(), vec!["2026-10-20", "2026-10-10"]);
        assert!(diary.dir().join("notes.txt").exists());

        assert!(diary.append("../evil", "x").is_err());
        assert!(diary.append("2026-10-20", "a\nb").is_err());
        assert!(diary.read("2026-10-20.jsonl").is_err());
        fs::remove_dir_all(dir).unwrap();
    }
}
