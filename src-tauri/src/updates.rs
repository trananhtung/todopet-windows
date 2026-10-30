//! Update notice and one-click updates (v0.7): the network half. What can be decided without I/O (reading the
//! tag, picking the release, the addresses, the rate limits, the shapes the page reads) is in
//! `todopet_core::update` and tested there.
//!
//! The page never supplies an address. Discovery asks GitHub's releases API through the shared `api` client (HTTPS
//! only, no redirects); the signed manifest of the newest release is fetched by the updater plugin from an
//! address built here out of the validated tag; and the installer it names must sit in that release's download
//! folder. The plugin's own JavaScript API is not granted to any window (see `capabilities/`), so these four
//! commands are the only way in.

use crate::{http, shell, state::AppState, tray, util};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::time::{Duration, Instant};
use tauri::ipc::Channel;
use tauri::{AppHandle, State, Url};
use tauri_plugin_updater::{Update, UpdaterExt};
use todopet_core::update::{
    self, AvailableUpdate, Candidate, InstallKind, ManualReason, ProgressThrottle, Release, Tracker, UpdateProgress,
    UpdateStatus, Version,
};
use todopet_core::{CmdError, CmdResult};

/// GitHub's API and the manifest each get this long, redirects and body included.
const TIMEOUT: Duration = Duration::from_secs(20);
/// The whole installer download (about 10 MB). The plugin sets no timeout of its own, and a stalled connection
/// would keep the "installing" flag set until the app is restarted.
const DOWNLOAD_TIMEOUT: Duration = Duration::from_secs(15 * 60);
/// No bytes for this long ends the request, so a stalled download fails after half a minute and not after
/// [`DOWNLOAD_TIMEOUT`], with "Downloading 45%" frozen on screen. Applies to the manifest and the installer.
const READ_TIMEOUT: Duration = Duration::from_secs(30);

/// The running version, from the version Cargo builds the exe with. The bundle's version (`tauri.conf.json`), which
/// the plugin compares the manifest with, must be the same number; a test in `todopet_core::update` holds them to it.
fn current_version() -> Option<Version> {
    Version::parse(env!("CARGO_PKG_VERSION"))
}

/// How this exe was installed, from the bundle type Tauri patches into it when it builds the installers.
fn install_kind() -> InstallKind {
    use tauri::utils::config::BundleType;
    match tauri::utils::platform::bundle_type() {
        Some(BundleType::Nsis) => InstallKind::Nsis,
        Some(BundleType::Msi) => InstallKind::Msi,
        _ => InstallKind::Other,
    }
}

/// What the last check left behind, plus the plugin's `Update` (needed to install) when the update can be installed.
#[derive(Default)]
struct Inner {
    tracker: Tracker,
    update: Option<Update>,
}

pub struct UpdateState {
    /// One check at a time: a second caller waits here and then finds the first one's result (and, if it is forced
    /// and the first finished less than 20 s ago, the rate limit answers with it instead of asking GitHub again).
    gate: tauri::async_runtime::Mutex<()>,
    inner: Mutex<Inner>,
    /// An install is running. Set for the whole download and install, reset when it fails (when it works, the
    /// installer starts and the process exits).
    installing: AtomicBool,
}

impl UpdateState {
    pub fn new() -> Self {
        Self {
            gate: tauri::async_runtime::Mutex::new(()),
            inner: Mutex::new(Inner::default()),
            installing: AtomicBool::new(false),
        }
    }

    fn status(&self) -> UpdateStatus {
        util::lock(&self.inner).tracker.status(current_version().unwrap_or_default())
    }

    fn page_url(&self) -> String {
        util::lock(&self.inner).tracker.page_url()
    }

    /// The tag and plugin `Update` of the available release, if it can be installed in one click.
    fn installable(&self) -> CmdResult<(String, Update)> {
        let inner = util::lock(&self.inner);
        let tag = inner.tracker.available_tag().ok_or_else(|| CmdError::invalid("There is no update to install"))?;
        let update =
            inner.update.clone().ok_or_else(|| CmdError::invalid("This update can't be installed in one click"))?;
        Ok((tag.to_owned(), update))
    }

    /// Takes the right to install, or fails when an install is already running.
    fn claim_install(&self) -> CmdResult<InstallClaim<'_>> {
        if self.installing.swap(true, Ordering::SeqCst) {
            return Err(CmdError::invalid("An update is already being installed"));
        }
        Ok(InstallClaim(&self.installing))
    }
}

/// Gives the install flag back when it goes out of scope, whichever way the command ends.
struct InstallClaim<'a>(&'a AtomicBool);

impl Drop for InstallClaim<'_> {
    fn drop(&mut self) {
        self.0.store(false, Ordering::SeqCst);
    }
}

/// What one check found.
struct Found {
    available: Option<(String, AvailableUpdate)>,
    update: Option<Update>,
}

/// What the plugin runs just before it starts the installer and ends the process. Its own default hook is
/// `cleanup_before_exit`, which hides every window: if the installer then fails to start (AppLocker, antivirus),
/// `install` returns an error but the overlay stays hidden, and the "download page" fallback bubble could not be
/// seen. This hook only takes the tray icon away (see [`tray::set_visible`]) and flushes the log; the windows go
/// when the process does. A failed install shows the icon again ([`update_install`]).
fn before_exit(app: &AppHandle) -> impl Fn() + Send + Sync + 'static {
    let app = app.clone();
    move || {
        tray::set_visible(&app, false);
        log::logger().flush();
    }
}

// ---------- discovery ----------

/// Reads at most `cap` bytes of the body; more is an error (a releases list is a few KB).
async fn read_capped(resp: &mut reqwest::Response, cap: u64) -> CmdResult<Vec<u8>> {
    let too_large = || CmdError::http("GitHub's answer is too large");
    if resp.content_length().is_some_and(|len| len > cap) {
        return Err(too_large());
    }
    let mut body = Vec::new();
    while let Some(chunk) = resp.chunk().await.map_err(http::network_error)? {
        if (body.len() + chunk.len()) as u64 > cap {
            return Err(too_large());
        }
        body.extend_from_slice(&chunk);
    }
    Ok(body)
}

async fn fetch_releases(client: &reqwest::Client) -> CmdResult<Vec<Release>> {
    let mut resp = client
        .get(update::RELEASES_API)
        .header(reqwest::header::ACCEPT, update::API_ACCEPT)
        .header("X-GitHub-Api-Version", update::API_VERSION)
        .timeout(TIMEOUT)
        .send()
        .await
        .map_err(http::network_error)?;
    let status = resp.status();
    if !status.is_success() {
        // Only for the explanation; a body that is too big or breaks off just means no explanation.
        let body = read_capped(&mut resp, update::MAX_ERROR_BODY_BYTES).await.unwrap_or_default();
        return Err(update::api_error(status.as_u16(), &String::from_utf8_lossy(&body)));
    }
    let body = read_capped(&mut resp, update::MAX_RESPONSE_BYTES).await?;
    update::parse_releases(&body)
}

/// Why the signed manifest gave no one-click update.
enum ManifestProblem {
    /// Reading it failed on the way (timeout, connection reset, the CDN erroring, no answer at all). That says nothing
    /// about the release, so the whole check fails: the last good answer stays and the next check tries again. If this
    /// became `check_failed` instead, a hiccup would turn the one-time "Update now" announcement into a "Download
    /// page" one and cache it for 30 minutes.
    Unreachable(String),
    /// It was read and does not fit the release (wrong version, installer address, target, signature or JSON), or
    /// this install can't use the updater at all. Final for this release: offer the download page.
    Unusable(String),
}

/// Sorts a plugin failure. Only what happens on the wire is `Unreachable`; a body that does not parse as JSON, a
/// request that could not even be built and everything the plugin concludes from the manifest are `Unusable`.
fn classify(step: &str, e: tauri_plugin_updater::Error) -> ManifestProblem {
    use tauri_plugin_updater::Error;
    let why = format!("{step}: {e}");
    match e {
        Error::Reqwest(e) if !(e.is_builder() || e.is_decode()) => ManifestProblem::Unreachable(why),
        Error::Network(_) | Error::ReleaseNotFound => ManifestProblem::Unreachable(why),
        _ => ManifestProblem::Unusable(why),
    }
}

/// The signed side: has the updater plugin read the release's manifest, and accepts the result only if it names the
/// release's own version and the installer of that release. `Err` carries the reason, for the log and for deciding
/// between "try again later" and `check_failed` (see [`ManifestProblem`]).
async fn signed_update(app: &AppHandle, candidate: &Candidate) -> Result<Update, ManifestProblem> {
    let unusable = |why: String| ManifestProblem::Unusable(why);
    let endpoint =
        Url::parse(&update::manifest_url(&candidate.tag)).map_err(|e| unusable(format!("manifest address: {e}")))?;
    let updater = app
        .updater_builder()
        .endpoints(vec![endpoint])
        .map_err(|e| classify("manifest endpoint", e))?
        .timeout(TIMEOUT)
        .on_before_exit(before_exit(app))
        // Release downloads redirect to GitHub's CDN, which the plugin follows; never to plain HTTP.
        .configure_client(|client| client.https_only(true).read_timeout(READ_TIMEOUT))
        .build()
        .map_err(|e| classify("updater", e))?;
    let mut found = updater
        .check()
        .await
        .map_err(|e| classify("manifest", e))?
        .ok_or_else(|| unusable("the manifest offers no version above the running one".to_owned()))?;
    if found.version != candidate.version.to_string() {
        return Err(unusable(format!("the manifest announces {} for release {}", found.version, candidate.tag)));
    }
    if !update::installer_url_ok(found.download_url.as_str(), &candidate.tag) {
        return Err(unusable(format!(
            "the installer address is not release {}'s setup: {}",
            candidate.tag, found.download_url
        )));
    }
    found.timeout = Some(DOWNLOAD_TIMEOUT);
    Ok(found)
}

async fn check(app: &AppHandle, client: &reqwest::Client) -> CmdResult<Found> {
    let current =
        current_version().ok_or_else(|| CmdError::internal("This build of TodoPet has no X.Y.Z version number"))?;
    let releases = fetch_releases(client).await?;
    let Some(candidate) = update::pick_newer(&releases, current) else {
        return Ok(Found { available: None, update: None });
    };
    let (reason, update) = match update::manual_reason_before_check(install_kind(), candidate.has_manifest) {
        Some(reason) => (Some(reason), None),
        None => match signed_update(app, &candidate).await {
            Ok(update) => (None, Some(update)),
            Err(ManifestProblem::Unreachable(why)) => {
                log::warn!("Update {} found, but its manifest could not be read: {why}", candidate.tag);
                return Err(CmdError::network(format!("The update's manifest could not be read ({why})")));
            }
            Err(ManifestProblem::Unusable(why)) => {
                log::warn!("Update {} found, but no one-click install: {why} (running {current})", candidate.tag);
                (Some(ManualReason::CheckFailed), None)
            }
        },
    };
    let available = AvailableUpdate::from_candidate(&candidate, reason);
    Ok(Found { available: Some((candidate.tag, available)), update })
}

// ---------- commands ----------

/// The cached state; no network.
#[tauri::command]
pub async fn update_status(updates: State<'_, UpdateState>) -> CmdResult<UpdateStatus> {
    Ok(updates.status())
}

/// Asks GitHub for a newer release. Not forced: reuses a result younger than 30 minutes. Forced ("Check now"): at
/// most every 20 s, otherwise the cached result. Never fails: a failure is reported in `error` and the previous
/// `available` stays. While an install runs, only the cached state is returned.
#[tauri::command]
pub async fn update_check(
    app: AppHandle,
    state: State<'_, AppState>,
    updates: State<'_, UpdateState>,
    force: bool,
) -> CmdResult<UpdateStatus> {
    if updates.installing.load(Ordering::SeqCst) {
        return Ok(updates.status());
    }
    let _one_at_a_time = updates.gate.lock().await;
    if !util::lock(&updates.inner).tracker.due(state.uptime_ms(), force) {
        return Ok(updates.status());
    }
    let outcome = check(&app, &state.api).await;
    let (wall_ms, mono_ms) = (util::now_ms(), state.uptime_ms());
    {
        let mut inner = util::lock(&updates.inner);
        match outcome {
            Ok(found) => {
                inner.update = found.update;
                inner.tracker.record_ok(wall_ms, mono_ms, found.available);
            }
            Err(e) => {
                log::warn!("Update check failed: {e}");
                inner.tracker.record_err(wall_ms, mono_ms, e);
            }
        }
    }
    Ok(updates.status())
}

fn send_progress(channel: &Channel<UpdateProgress>, progress: UpdateProgress) {
    if let Err(e) = channel.send(progress) {
        log::debug!("Could not send the update progress: {e}");
    }
}

/// A plugin failure as a command error (the details go to the log; the page offers the download page).
fn plugin_error(step: &str, e: tauri_plugin_updater::Error) -> CmdError {
    log::error!("Update not {step}: {e}");
    match e {
        tauri_plugin_updater::Error::Reqwest(e) => {
            CmdError::network(format!("The update could not be {step}: {}", http::network_error(e).message))
        }
        tauri_plugin_updater::Error::Network(message) => {
            CmdError::network(format!("The update could not be {step}: {message}"))
        }
        other => CmdError::internal(format!("The update could not be {step}: {other}")),
    }
}

/// Downloads the available update, checks its signature, and runs the installer, which replaces the app and starts
/// it again: on Windows this process exits during the call, so success is never seen in practice. One at a time.
/// Streams `downloading` progress (at most about ten messages a second) and then `installing`. Fails with
/// `invalid` when nothing is ready or another install runs, `network` when the download breaks, `internal` for
/// everything else; a failure frees the next attempt.
#[tauri::command]
pub async fn update_install(
    app: AppHandle,
    updates: State<'_, UpdateState>,
    on_progress: Channel<UpdateProgress>,
) -> CmdResult<()> {
    let _claim = updates.claim_install()?;
    let (tag, update) = updates.installable()?;
    // The cached update was checked when it was found; checked again here so that this command's safety does not
    // depend on how the cache was filled.
    if format!("v{}", update.version) != tag || !update::installer_url_ok(update.download_url.as_str(), &tag) {
        return Err(CmdError::internal("The update does not match its release"));
    }

    log::info!("Installing {tag}");
    send_progress(&on_progress, UpdateProgress::downloading(0, None));
    let started = Instant::now();
    let mut throttle = ProgressThrottle::new();
    let mut downloaded = 0u64;
    let bytes = update
        .download(
            |chunk, total| {
                downloaded = downloaded.saturating_add(chunk as u64);
                let now_ms = u64::try_from(started.elapsed().as_millis()).unwrap_or(u64::MAX);
                if throttle.should_send(now_ms, downloaded, total) {
                    send_progress(&on_progress, UpdateProgress::downloading(downloaded, total));
                }
            },
            || {},
        )
        .await
        .map_err(|e| plugin_error("downloaded", e))?;

    send_progress(&on_progress, UpdateProgress::Installing);
    // Writes the setup to a temp folder, starts it and exits the process, so it runs off the async workers. Just
    // before it starts the installer it hides the tray icon (`before_exit`); when the installer could not be
    // started (AppLocker, antivirus) the app carries on, windows and all, and the icon must come back.
    let result = util::blocking(move || update.install(&bytes).map_err(|e| plugin_error("installed", e))).await;
    if result.is_err() {
        tray::set_visible(&app, true);
    }
    result
}

/// Opens the available release's page on GitHub, or the releases list when none is known.
#[tauri::command]
pub async fn update_open_page(app: AppHandle, updates: State<'_, UpdateState>) -> CmdResult<()> {
    shell::open_url(app, updates.page_url()).await
}

// ---------- update e2e (never in a release build) ----------

#[cfg(all(feature = "e2e-update", not(debug_assertions)))]
compile_error!(
    "the `e2e-update` feature installs whatever a manifest on disk offers and is for the update e2e only: build it \
     with `--debug` (as update-e2e.yml does), never into a release"
);

/// With `TODOPET_E2E_MANIFEST` set, installs whatever that manifest offers a few seconds after start, logging every
/// step. Skips discovery and the address checks on purpose: the Windows update e2e serves its own manifest on
/// localhost, signed with a throwaway key. Compiled only with `--features e2e-update`.
#[cfg(feature = "e2e-update")]
pub fn spawn_e2e(app: AppHandle) {
    let Some(manifest) = std::env::var("TODOPET_E2E_MANIFEST").ok().filter(|value| !value.trim().is_empty()) else {
        return;
    };
    tauri::async_runtime::spawn(async move {
        if let Err(e) = run_e2e(&app, manifest.trim()).await {
            log::error!("e2e-update: {e}");
        }
    });
}

#[cfg(feature = "e2e-update")]
async fn run_e2e(app: &AppHandle, manifest: &str) -> Result<(), String> {
    log::info!("e2e-update: manifest {manifest}, waiting 5 s for the app to settle");
    tauri::async_runtime::spawn_blocking(|| std::thread::sleep(Duration::from_secs(5)))
        .await
        .map_err(|e| format!("wait: {e}"))?;

    let endpoint = Url::parse(manifest).map_err(|e| format!("bad manifest address: {e}"))?;
    let updater = app
        .updater_builder()
        .endpoints(vec![endpoint])
        .map_err(|e| format!("endpoint: {e}"))?
        .timeout(Duration::from_secs(30))
        .on_before_exit(before_exit(app))
        .build()
        .map_err(|e| format!("updater: {e}"))?;
    log::info!("e2e-update: checking");
    let Some(update) = updater.check().await.map_err(|e| format!("check: {e}"))? else {
        log::info!("e2e-update: the manifest offers nothing newer than {}", env!("CARGO_PKG_VERSION"));
        return Ok(());
    };
    log::info!("e2e-update: found {} at {}", update.version, update.download_url);

    let (mut downloaded, mut quarter) = (0u64, 0u64);
    let bytes = update
        .download(
            |chunk, total| {
                downloaded = downloaded.saturating_add(chunk as u64);
                if let Some(total) = total.filter(|total| *total > 0) {
                    let now = (downloaded.saturating_mul(4) / total).min(4);
                    if now > quarter {
                        quarter = now;
                        log::info!("e2e-update: downloaded {downloaded} of {total} bytes");
                    }
                }
            },
            || log::info!("e2e-update: download finished"),
        )
        .await
        .map_err(|e| format!("download: {e}"))?;
    log::info!("e2e-update: {} bytes downloaded, signature verified, starting the installer", bytes.len());
    // The installer is started and this process exits inside `install`, after `before_exit` hid the tray icon and
    // flushed the log.
    if let Err(e) = update.install(&bytes) {
        tray::set_visible(app, true);
        return Err(format!("install: {e}"));
    }
    log::info!("e2e-update: install returned");
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use tauri_plugin_updater::Error;

    fn worth_another_try(e: Error) -> bool {
        matches!(classify("manifest", e), ManifestProblem::Unreachable(_))
    }

    #[test]
    fn what_goes_wrong_on_the_wire_is_worth_another_try() {
        assert!(worth_another_try(Error::ReleaseNotFound), "every endpoint answered with an error status");
        assert!(worth_another_try(Error::Network("Download request failed with status: 503".into())));
    }

    #[test]
    fn what_the_manifest_or_this_install_says_is_final_for_the_release() {
        let not_json = serde_json::from_str::<u8>("<html>").unwrap_err();
        let final_ones = [
            Error::TargetNotFound("windows-x86_64-nsis".into()),
            Error::TargetsNotFound(vec!["windows-x86_64-nsis".into(), "windows-x86_64".into()]),
            Error::Serialization(not_json),
            Error::UnsupportedArch,
            Error::UnsupportedOs,
            Error::EmptyEndpoints,
            Error::Io(std::io::Error::other("no executable path")),
        ];
        for (i, e) in final_ones.into_iter().enumerate() {
            assert!(!worth_another_try(e), "case {i}");
        }
    }

    #[test]
    fn the_reason_names_the_step_and_the_plugins_words() {
        match classify("manifest", Error::ReleaseNotFound) {
            ManifestProblem::Unreachable(why) => assert!(why.starts_with("manifest: "), "{why}"),
            ManifestProblem::Unusable(why) => panic!("{why}"),
        }
    }
}
