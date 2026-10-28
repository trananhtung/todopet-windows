//! Small helpers shared by the command modules.

use std::sync::{Mutex, MutexGuard, PoisonError};
use std::time::{SystemTime, UNIX_EPOCH};
use todopet_core::{CmdError, CmdResult};

/// Runs blocking work (file system, Credential Manager) off the async runtime's worker threads.
pub async fn blocking<T, F>(f: F) -> CmdResult<T>
where
    T: Send + 'static,
    F: FnOnce() -> CmdResult<T> + Send + 'static,
{
    tauri::async_runtime::spawn_blocking(f)
        .await
        .map_err(|e| CmdError::internal(format!("Background task failed: {e}")))?
}

/// Locks a mutex, recovering the data if a previous holder panicked (the state here is plain data that
/// stays consistent).
pub fn lock<T>(m: &Mutex<T>) -> MutexGuard<'_, T> {
    m.lock().unwrap_or_else(PoisonError::into_inner)
}

/// Milliseconds since the Unix epoch.
pub fn now_ms() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis() as u64).unwrap_or(0)
}

/// Maps a Tauri window/menu error to a command error.
pub fn tauri_err(e: tauri::Error) -> CmdError {
    CmdError::internal(e.to_string())
}
