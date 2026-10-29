//! OS-independent logic of the TodoPet backend.
//!
//! Everything here is plain Rust with no Tauri or Win32 dependency, so it can be unit-tested on any host
//! (`cargo test -p todopet-core`). The app crate (`src-tauri/src`) does the I/O: HTTP, Credential Manager,
//! windows, and calls into this crate for validation, request building and response parsing.

pub mod calendar;
pub mod card;
pub mod claude;
pub mod diary;
pub mod error;
pub mod net;
pub mod ratelimit;
pub mod store;
pub mod system;
pub mod todoist;
pub mod validate;

pub use error::{CmdError, CmdResult, ErrorKind};
