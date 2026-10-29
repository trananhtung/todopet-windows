//! Small JSON documents (`<dir>/<key>.json`): prefs, pet life, postponed-task log, the day's "start when…" plans,
//! the wrap-up plan (tomorrow's frog and note), the friends' pet cards.
//!
//! Writes go to a temporary file in the same folder and are renamed over the target, so a crash or power
//! loss leaves either the old or the new document, never a truncated one.

use crate::{validate, CmdError, CmdResult};
use serde_json::Value;
use std::fs::{self, File};
use std::io::{self, Write};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{SystemTime, UNIX_EPOCH};

/// Largest document we write. Prefs and pet life are a few KB; this only stops runaway growth.
pub const MAX_DOC_BYTES: usize = 4 * 1024 * 1024;

static TMP_COUNTER: AtomicU64 = AtomicU64::new(0);

/// Writes `bytes` to `path` atomically (temp file in the same folder, fsync, rename).
pub fn write_atomic(path: &Path, bytes: &[u8]) -> io::Result<()> {
    let dir = path.parent().ok_or_else(|| io::Error::new(io::ErrorKind::InvalidInput, "path has no parent"))?;
    let name = path
        .file_name()
        .and_then(|n| n.to_str())
        .ok_or_else(|| io::Error::new(io::ErrorKind::InvalidInput, "path has no file name"))?;
    fs::create_dir_all(dir)?;
    let nanos = SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.subsec_nanos()).unwrap_or(0);
    let unique = format!("{}-{}-{}", std::process::id(), nanos, TMP_COUNTER.fetch_add(1, Ordering::Relaxed));
    let tmp = dir.join(format!(".{name}.{unique}.tmp"));

    let result = (|| {
        let mut f = File::create(&tmp)?;
        f.write_all(bytes)?;
        f.sync_all()?;
        drop(f);
        // On Windows an antivirus scanner can hold the target open for a moment; one retry covers it.
        fs::rename(&tmp, path).or_else(|_| {
            std::thread::sleep(std::time::Duration::from_millis(50));
            fs::rename(&tmp, path)
        })
    })();
    if result.is_err() {
        let _ = fs::remove_file(&tmp);
    }
    result
}

/// The JSON document folder.
#[derive(Debug, Clone)]
pub struct Store {
    dir: PathBuf,
}

impl Store {
    pub fn new(dir: impl Into<PathBuf>) -> Self {
        Self { dir: dir.into() }
    }

    fn file(&self, key: &str) -> PathBuf {
        self.dir.join(format!("{key}.json"))
    }

    /// The document stored under `key`, or `None` if there is none.
    ///
    /// A document that is not valid JSON (edited by hand, disk error) is renamed to `<key>.json.bad` and
    /// reported as missing, so the app starts with defaults instead of failing on every launch; the bad
    /// copy stays on disk for recovery. A file over the key's size cap (see `validate::max_doc_bytes`) is
    /// treated the same way, without being read.
    pub fn load(&self, key: &str) -> CmdResult<Option<Value>> {
        let key = validate::store_key(key)?;
        let path = self.file(key);
        // A file bigger than the key's cap was never written by the app: set it aside unread, like a damaged one.
        let limit = validate::max_doc_bytes(key);
        if fs::metadata(&path).is_ok_and(|m| m.len() > limit as u64) {
            let _ = fs::rename(&path, self.dir.join(format!("{key}.json.bad")));
            return Ok(None);
        }
        let text = match fs::read_to_string(&path) {
            Ok(text) => text,
            Err(e) if e.kind() == io::ErrorKind::NotFound => return Ok(None),
            Err(e) => return Err(CmdError::internal(format!("Could not read {key}: {e}"))),
        };
        match serde_json::from_str(&text) {
            Ok(value) => Ok(Some(value)),
            Err(_) => {
                let _ = fs::rename(&path, self.dir.join(format!("{key}.json.bad")));
                Ok(None)
            }
        }
    }

    pub fn save(&self, key: &str, value: &Value) -> CmdResult<()> {
        let key = validate::store_key(key)?;
        let bytes = serde_json::to_vec_pretty(value).map_err(|e| CmdError::internal(e.to_string()))?;
        let limit = validate::max_doc_bytes(key);
        if bytes.len() > limit {
            let size = if limit >= 1024 * 1024 {
                format!("{} MB", limit / (1024 * 1024))
            } else {
                format!("{} KB", limit / 1024)
            };
            return Err(CmdError::invalid(format!("{key} is larger than {size}")));
        }
        write_atomic(&self.file(key), &bytes).map_err(|e| CmdError::internal(format!("Could not save {key}: {e}")))
    }
}

/// A fresh, empty folder under the system temp dir for file-system tests.
#[cfg(test)]
pub(crate) fn test_dir(tag: &str) -> PathBuf {
    let nanos = SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_nanos()).unwrap_or(0);
    let dir = std::env::temp_dir().join(format!(
        "todopet-core-{tag}-{}-{nanos}-{}",
        std::process::id(),
        TMP_COUNTER.fetch_add(1, Ordering::Relaxed)
    ));
    fs::create_dir_all(&dir).expect("create test dir");
    dir
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn save_then_load() {
        let dir = test_dir("store");
        let store = Store::new(dir.join("nested"));
        assert_eq!(store.load("prefs").unwrap(), None);
        store.save("prefs", &json!({"lang": "vi", "target": 3})).unwrap();
        assert_eq!(store.load("prefs").unwrap(), Some(json!({"lang": "vi", "target": 3})));
        store.save("prefs", &json!({"lang": "en"})).unwrap();
        assert_eq!(store.load("prefs").unwrap(), Some(json!({"lang": "en"})));
        // No temp files left behind.
        let leftovers: Vec<_> = fs::read_dir(dir.join("nested"))
            .unwrap()
            .filter_map(Result::ok)
            .filter(|e| e.file_name().to_string_lossy().ends_with(".tmp"))
            .collect();
        assert!(leftovers.is_empty());
        fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn rejects_bad_keys() {
        let dir = test_dir("store-keys");
        let store = Store::new(&dir);
        assert!(store.save("../escape", &json!(1)).is_err());
        assert!(store.load("Prefs").is_err());
        assert!(!dir.parent().unwrap().join("escape.json").exists());
        fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn corrupt_documents_are_quarantined() {
        let dir = test_dir("store-bad");
        let store = Store::new(&dir);
        fs::write(dir.join("life.json"), "{not json").unwrap();
        assert_eq!(store.load("life").unwrap(), None);
        assert!(dir.join("life.json.bad").exists());
        assert!(!dir.join("life.json").exists());
        fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn refuses_huge_documents() {
        let dir = test_dir("store-big");
        let store = Store::new(&dir);
        let big = Value::String("x".repeat(MAX_DOC_BYTES + 1));
        assert!(store.save("prefs", &big).is_err());
        assert!(!dir.join("prefs.json").exists());
        fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn friends_is_capped_at_64_kb_when_written() {
        let dir = test_dir("store-friends-big");
        let store = Store::new(&dir);
        // Twelve friends are about 10 KB; 64 KB is generous, and a bigger document is a bug or tampering.
        assert_eq!(validate::max_doc_bytes("friends"), 64 * 1024);
        let small = json!({"friends": "x".repeat(60 * 1024)});
        store.save("friends", &small).unwrap();
        let big = json!({"friends": "x".repeat(64 * 1024)});
        let err = store.save("friends", &big).unwrap_err();
        assert!(err.message.contains("64 KB"), "{}", err.message);
        // The document that was there stays.
        assert_eq!(store.load("friends").unwrap(), Some(small));
        // Other keys keep the general 4 MB cap.
        assert_eq!(validate::max_doc_bytes("prefs"), MAX_DOC_BYTES);
        store.save("prefs", &json!({"x": "y".repeat(100 * 1024)})).unwrap();
        fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn a_friends_file_over_64_kb_is_quarantined_and_read_as_missing() {
        let dir = test_dir("store-friends-read");
        let store = Store::new(&dir);
        let text = serde_json::to_string(&json!({"friends": "x".repeat(70 * 1024)})).unwrap();
        fs::write(dir.join("friends.json"), text).unwrap();
        assert_eq!(store.load("friends").unwrap(), None);
        assert!(dir.join("friends.json.bad").exists());
        assert!(!dir.join("friends.json").exists());
        // A file at the cap is read.
        let ok = json!({"friends": []});
        store.save("friends", &ok).unwrap();
        assert_eq!(store.load("friends").unwrap(), Some(ok));
        fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn a_file_over_the_general_cap_is_quarantined_without_being_read_whole() {
        let dir = test_dir("store-prefs-read");
        let store = Store::new(&dir);
        let f = fs::File::create(dir.join("prefs.json")).unwrap();
        f.set_len(MAX_DOC_BYTES as u64 + 1).unwrap(); // a sparse file: nothing is allocated for it
        drop(f);
        assert_eq!(store.load("prefs").unwrap(), None);
        assert!(dir.join("prefs.json.bad").exists());
        fs::remove_dir_all(dir).unwrap();
    }
}
