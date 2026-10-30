// The only door between the app logic and the operating system.
// Implemented by src/backend/tauri.ts (Rust commands in src-tauri) and src/backend/demo.ts (browser, tests).

export type Unsubscribe = () => void;

export type BackendErrorKind = "no_token" | "unauthorized" | "rate_limited" | "http" | "network" | "invalid" | "internal";

/** Shape of every error a Rust command returns (serialized `CmdError`). */
export interface BackendErrorPayload {
  kind: BackendErrorKind;
  message: string;
  status?: number;
}

export class BackendError extends Error {
  readonly kind: BackendErrorKind;
  readonly status?: number;
  constructor(p: BackendErrorPayload) {
    super(p.message);
    this.name = "BackendError";
    this.kind = p.kind;
    this.status = p.status;
  }
}

// ---------- Todoist (API v1, https://developer.todoist.com/api/v1/) ----------

/** A task exactly as Todoist API v1 returns it (snake_case). `src/core/models.ts` converts it. */
export interface RawTask {
  id: string;
  content: string;
  description?: string | null;
  priority?: number | null;
  due?: {
    date: string;
    string?: string | null;
    is_recurring?: boolean | null;
    datetime?: string | null;
    timezone?: string | null;
  } | null;
  deadline?: { date: string } | null;
  duration?: { amount: number; unit: string } | null;
  project_id?: string | null;
  parent_id?: string | null;
  labels?: string[] | null;
  checked?: boolean | null;
  completed_at?: string | null;
  child_order?: number | null;
  day_order?: number | null;
}

/** GET tasks/completed/stats, as returned. */
export interface RawStats {
  completed_count?: number;
  days_items?: { date?: string; total_completed?: number }[];
  goals?: {
    daily_goal?: number;
    current_daily_streak?: { count?: number };
    max_daily_streak?: { count?: number };
  };
  karma?: number;
}

export interface AddTaskInput {
  content: string;
  /** "today", "tomorrow", "today at 14:00"… sent with due_lang "en". null = no date. */
  dueString: string | null;
  /** API priority: 4 = P1 (urgent) … 1 = P4. */
  priority: number;
  parentId: string | null;
}

export interface TodoistApi {
  /** GET tasks/filter?query=…, following next_cursor (limit 200, at most 10 pages). */
  tasks(filter: string): Promise<RawTask[]>;
  /** GET tasks/completed/by_completion_date?since=…&until=… (ISO 8601 UTC), paged the same way. */
  completed(sinceIso: string, untilIso: string): Promise<RawTask[]>;
  stats(): Promise<RawStats>;
  add(input: AddTaskInput): Promise<RawTask | null>;
  /** POST tasks/quick { text } — full Todoist quick-add syntax. */
  quickAdd(text: string): Promise<void>;
  close(id: string): Promise<void>;
  reopen(id: string): Promise<void>;
  /** POST tasks/{id} { due_string, due_lang: "en" }. */
  reschedule(id: string, dueString: string): Promise<void>;
  /** DELETE tasks/{id}. Permanent, sub-tasks go too. */
  remove(id: string): Promise<void>;
}

// ---------- Secrets (Windows Credential Manager; values never come back to JS) ----------

export interface SecretsStatus {
  todoist: boolean;
  anthropic: boolean;
  /** Hosts of the saved calendar links ("calendar.google.com"); the links themselves never come back. */
  calendarHosts: string[];
}

export interface SecretsApi {
  status(): Promise<SecretsStatus>;
  /** Verifies the token against Todoist first; rejects with kind "unauthorized" if Todoist refuses it. */
  setTodoistToken(token: string): Promise<void>;
  clearTodoistToken(): Promise<void>;
  /** null removes the key. */
  setAnthropicKey(key: string | null): Promise<void>;
  /**
   * Replaces the saved ICS links (https:// or webcal://, at most 10). Calendar "secret addresses" are bearer
   * secrets, so they live in Credential Manager like the tokens. An empty list removes them all.
   */
  setCalendarLinks(links: string[]): Promise<void>;
}

// ---------- Claude (optional, only when the user presses Ask Claude) ----------

export interface SplitInput {
  title: string;
  notes: string | null;
  lang: "en" | "vi";
  model: string;
}

export interface ClaudeApi {
  /** 3–6 short steps. Rejects with kind "no_token" without a key. */
  splitTask(input: SplitInput): Promise<string[]>;
}

// ---------- Calendar (ICS links) ----------

export interface IcsResult {
  /** Host of the link, never the full (secret) address. */
  host: string;
  ok: boolean;
  text?: string;
  error?: string;
}

export interface CalendarApi {
  /** Fetches every saved link (max 5 MB each, 20 s timeout). Never rejects: failures come back per link. */
  fetchIcs(): Promise<IcsResult[]>;
}

// ---------- System (Win32 watchers, overlay window, tray) ----------

export interface ForegroundApp {
  /** Friendly name ("Google Chrome", "Discord"), from the exe's version info when available. */
  name: string;
  /** Lower-case executable file name ("chrome.exe"). */
  exe: string;
  /** Window title. */
  title: string;
}

/** Emitted about once per second. */
export interface SystemSample {
  app: ForegroundApp | null;
  /** Address of the active browser tab when a browser is in front ("https://www.youtube.com/shorts/…"), else null. */
  url: string | null;
  /** Seconds since the last keyboard or mouse input (GetLastInputInfo). */
  idleSeconds: number;
  /** Seconds since the last key press (only the timestamp is recorded, never the key). */
  secondsSinceKey: number;
  /** A full-screen app (game, video, slideshow) is in front. */
  fullscreen: boolean;
  /** Epoch ms of the last change of foreground app. */
  appSwitchedAt: number;
}

/** Cursor position in CSS px relative to the overlay's client area (may be outside it). */
export interface CursorSample {
  x: number;
  y: number;
}

/** Commands coming from the tray menu, the global hotkey (Ctrl+Alt+T → "add") or a second launch ("board"). */
export type AppCommand = "board" | "add" | "focus" | "hide1h" | "quiet1h" | "show" | "update";

export type ExtraWindow = "settings" | "diary" | "gallery";

/** Labels for the tray menu, in the user's language. */
export interface TrayLabels {
  board: string;
  add: string;
  focus: string;
  hide: string;
  quiet: string;
  settings: string;
  diary: string;
  /** "Check for updates…", or "✨ Update to 0.7.1" while one is available. */
  updates: string;
  quit: string;
}

export interface SystemApi {
  onSample(cb: (s: SystemSample) => void): Unsubscribe;
  onCursor(cb: (c: CursorSample) => void): Unsubscribe;
  onCommand(cb: (c: AppCommand) => void): Unsubscribe;
  /** true = clicks pass through the overlay to the apps below. */
  setClickThrough(ignore: boolean): Promise<void>;
  /** Gives the overlay keyboard focus (board opened, add field). */
  focusOverlay(): Promise<void>;
  /** Makes the overlay unfocusable again (board closed), so it never keeps your keystrokes. */
  releaseOverlayFocus(): Promise<void>;
  /** Tray tooltip, e.g. "TodoPet — 😊 2/3" or "🍅 18:42". */
  setTrayStatus(tooltip: string): Promise<void>;
  setTrayLabels(labels: TrayLabels): Promise<void>;
  /** Opens http(s), msteams: or zoommtg: links in the default handler; anything else is refused. */
  openUrl(url: string): Promise<void>;
  openWindow(which: ExtraWindow): Promise<void>;
  getAutostart(): Promise<boolean>;
  setAutostart(on: boolean): Promise<void>;
  /** The UI language Windows is set to ("vi-VN", "en-US"). */
  systemLocale(): Promise<string>;
  quit(): Promise<void>;
}

// ---------- Storage (small JSON documents) ----------

/** Keys are lower-case words with dashes: "prefs", "life", "stuck". */
export interface StorageApi {
  load<T>(key: string): Promise<T | null>;
  save(key: string, value: unknown): Promise<void>;
}

// ---------- Diary (daily JSONL files, 14 days kept) ----------

export interface DiaryApi {
  /** `day` is "yyyy-MM-dd"; `line` is one JSON-encoded entry (no newlines). */
  append(day: string, line: string): Promise<void>;
  read(day: string): Promise<string[]>;
  /** Days that have a diary, newest first. */
  days(): Promise<string[]>;
}

// ---------- Pet cards (v0.6 "Friends"): the signing key lives in Rust, the overlay window alone may use it ----------

/**
 * This install's Ed25519 key for pet cards. The secret half is kept in Windows Credential Manager and never comes back
 * to JavaScript: only the public key, signatures and a yes or no do. Keys are base64url without padding (43
 * characters); signatures too (86). The payload is a card's JSON text (at most 2 KB); the signature covers its UTF-8 bytes.
 */
export interface CardsApi {
  /** This install's public key, made on first use. It is the identity friends know you by. */
  publicKey(): Promise<string>;
  /** Signs a card's payload with this install's key. */
  sign(payload: string): Promise<string>;
  /** Does `sig` sign `payload` under `pk`? Rejects with kind "invalid" for a key or signature that isn't the right size or isn't strict base64url. */
  verify(pk: string, payload: string, sig: string): Promise<boolean>;
  /** Replaces the key with a new one: cards made from now on carry a new public key, and friends see a new person. */
  resetKey(): Promise<void>;
}

// ---------- Updates (v0.7): discovery, check and install live in Rust; no URL ever comes from JS ----------

/** Why an available update can't be installed in one click; the download page is offered instead. */
export type UpdateManualReason =
  /** Installed from an MSI package (per-machine, needs an admin prompt). */
  | "msi"
  /** The release has no signed manifest (`latest.json`). */
  | "unsigned"
  /** A development build, not an installed app. */
  | "dev"
  /** The signed manifest could not be read or did not match the release. */
  | "check_failed";

export interface AvailableUpdate {
  /** "0.7.1" (no "v"). */
  version: string;
  /** The release notes as plain text (may be empty), at most 4000 characters. */
  notes: string;
  /** ISO 8601, or null when GitHub didn't say. */
  publishedAt: string | null;
  /** true: `install()` can update in one click. false: offer `openPage()` (see `manualReason`). */
  canInstall: boolean;
  manualReason: UpdateManualReason | null;
}

export interface UpdateStatus {
  /** The running version, "0.7.0". */
  current: string;
  /** Epoch ms of the last check that completed (successfully or not), null before the first. */
  checkedAt: number | null;
  /** A newer published release, or null when up to date (or never checked). */
  available: AvailableUpdate | null;
  /** The last check's failure, null when it succeeded. A failure keeps the previous `available`. */
  error: BackendErrorPayload | null;
}

export type UpdateProgress =
  | { phase: "downloading"; downloaded: number; total: number | null }
  | { phase: "installing" };

export interface UpdatesApi {
  /** The cached state, no network. */
  status(): Promise<UpdateStatus>;
  /**
   * Asks GitHub for a newer release. Not forced: reuses a result younger than 30 minutes. Forced ("Check now"): at
   * most every 20 seconds, otherwise the cached result. Network failures resolve with `error` set, they don't reject.
   */
  check(force: boolean): Promise<UpdateStatus>;
  /**
   * Downloads, verifies and installs the available update, reporting progress. On Windows the app exits while the
   * installer runs and comes back on the new version, so on success this never resolves in practice. Rejects when
   * nothing can be installed or any step fails; the caller then offers `openPage()`.
   */
  install(onProgress: (p: UpdateProgress) => void): Promise<void>;
  /** Opens the available release's page on GitHub (or the releases list when none is known). */
  openPage(): Promise<void>;
}

// ---------- Cross-window events ----------

export type BusEvent =
  | { type: "prefs-changed" }
  | { type: "life-changed" }
  | { type: "secrets-changed" }
  | { type: "diary-changed" }
  | { type: "species-changed" }
  // v0.7: the update state changed (re-read `updates.status()`); Settings asks the overlay (which owns the pet's state) to install; and the
  // overlay answers that it has taken the request (the install is under way, and the progress is in the pet's bubble).
  | { type: "update-changed" }
  | { type: "update-install" }
  | { type: "update-installing" };

export interface BusApi {
  emit(e: BusEvent): Promise<void>;
  on(cb: (e: BusEvent) => void): Unsubscribe;
}

export interface Backend {
  kind: "tauri" | "demo";
  todoist: TodoistApi;
  secrets: SecretsApi;
  claude: ClaudeApi;
  calendar: CalendarApi;
  system: SystemApi;
  storage: StorageApi;
  diary: DiaryApi;
  cards: CardsApi;
  updates: UpdatesApi;
  bus: BusApi;
}
