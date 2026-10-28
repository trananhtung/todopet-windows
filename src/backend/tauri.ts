// The real backend: Tauri commands implemented in Rust (src-tauri/src). Command names are snake_case;
// arguments are camelCase here and arrive as snake_case parameters in Rust (Tauri's convention).
import { invoke } from "@tauri-apps/api/core";
import { emit, listen, type UnlistenFn } from "@tauri-apps/api/event";
import type {
  AppCommand,
  Backend,
  BackendErrorKind,
  BusEvent,
  CursorSample,
  ExtraWindow,
  IcsResult,
  RawStats,
  RawTask,
  SecretsStatus,
  SystemSample,
  TrayLabels,
  Unsubscribe,
} from "./types";
import { BackendError } from "./types";

const ERROR_KINDS: ReadonlySet<string> = new Set<BackendErrorKind>([
  "no_token",
  "unauthorized",
  "rate_limited",
  "http",
  "network",
  "invalid",
  "internal",
]);

const BUS_TYPES: ReadonlySet<string> = new Set<BusEvent["type"]>([
  "prefs-changed",
  "life-changed",
  "secrets-changed",
  "diary-changed",
  "species-changed",
]);

/** Rust commands reject with a serialized `CmdError`; Tauri itself rejects with a plain string (unknown
 * command, arguments that do not deserialize). Both become a `BackendError`. */
function toBackendError(e: unknown): BackendError {
  if (e instanceof BackendError) return e;
  if (typeof e === "object" && e !== null) {
    const { kind, message, status } = e as Record<string, unknown>;
    if (typeof kind === "string" && ERROR_KINDS.has(kind) && typeof message === "string") {
      return new BackendError({
        kind: kind as BackendErrorKind,
        message,
        status: typeof status === "number" ? status : undefined,
      });
    }
  }
  const message = typeof e === "string" ? e : e instanceof Error ? e.message : String(e);
  return new BackendError({ kind: "internal", message });
}

async function call<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  try {
    return await invoke<T>(cmd, args);
  } catch (e) {
    throw toBackendError(e);
  }
}

/** `listen` resolves asynchronously; this returns a synchronous unsubscribe that also works if called
 * before the listener is registered. */
function subscribe<T>(event: string, cb: (payload: T) => void): Unsubscribe {
  let active = true;
  let unlisten: UnlistenFn | null = null;
  listen<T>(event, (e) => {
    if (active) cb(e.payload);
  })
    .then((fn) => {
      if (active) unlisten = fn;
      else fn();
    })
    .catch((err: unknown) => console.error(`[todopet] cannot listen to "${event}"`, err));
  return () => {
    active = false;
    unlisten?.();
    unlisten = null;
  };
}

function isBusEvent(p: unknown): p is BusEvent {
  return typeof p === "object" && p !== null && typeof (p as { type?: unknown }).type === "string" && BUS_TYPES.has((p as { type: string }).type);
}

export function createTauriBackend(): Backend {
  return {
    kind: "tauri",

    todoist: {
      tasks: (filter) => call<RawTask[]>("todoist_tasks", { filter }),
      completed: (sinceIso, untilIso) => call<RawTask[]>("todoist_completed", { since: sinceIso, until: untilIso }),
      stats: () => call<RawStats>("todoist_stats"),
      add: (input) =>
        call<RawTask | null>("todoist_add", {
          content: input.content,
          dueString: input.dueString,
          priority: input.priority,
          parentId: input.parentId,
        }),
      quickAdd: (text) => call<void>("todoist_quick_add", { text }),
      close: (id) => call<void>("todoist_close", { id }),
      reopen: (id) => call<void>("todoist_reopen", { id }),
      reschedule: (id, dueString) => call<void>("todoist_reschedule", { id, dueString }),
      remove: (id) => call<void>("todoist_delete", { id }),
    },

    secrets: {
      status: () => call<SecretsStatus>("secrets_status"),
      setTodoistToken: (token) => call<void>("todoist_set_token", { token }),
      clearTodoistToken: () => call<void>("todoist_clear_token"),
      setAnthropicKey: (key) => call<void>("anthropic_set_key", { key }),
      setCalendarLinks: (links) => call<void>("calendar_set_links", { links }),
    },

    claude: {
      splitTask: (input) =>
        call<string[]>("claude_split", { title: input.title, notes: input.notes, lang: input.lang, model: input.model }),
    },

    calendar: {
      // Never rejects. Rust reads the saved links itself; if the command fails as a whole (Credential
      // Manager unreadable) the links are unknown, so a single result without a host reports it.
      fetchIcs: async () => {
        try {
          return await call<IcsResult[]>("calendar_fetch");
        } catch (e) {
          return [{ host: "", ok: false, error: toBackendError(e).message }];
        }
      },
    },

    system: {
      onSample: (cb) => subscribe<SystemSample>("system-sample", cb),
      onCursor: (cb) => subscribe<CursorSample>("cursor", cb),
      onCommand: (cb) => subscribe<AppCommand>("app-command", cb),
      setClickThrough: (ignore) => call<void>("set_click_through", { ignore }),
      focusOverlay: () => call<void>("focus_overlay"),
      releaseOverlayFocus: () => call<void>("release_overlay_focus"),
      setTrayStatus: (tooltip) => call<void>("set_tray_status", { tooltip }),
      setTrayLabels: (labels: TrayLabels) => call<void>("set_tray_labels", { labels }),
      openUrl: (url) => call<void>("open_url", { url }),
      openWindow: (which: ExtraWindow) => call<void>("open_window", { which }),
      getAutostart: () => call<boolean>("get_autostart"),
      setAutostart: (on) => call<void>("set_autostart", { on }),
      systemLocale: () => call<string>("system_locale"),
      quit: () => call<void>("quit_app"),
    },

    storage: {
      load: <T>(key: string) => call<T | null>("store_load", { key }),
      // `undefined` would drop the argument entirely; store it as null instead.
      save: (key, value) => call<void>("store_save", { key, value: value === undefined ? null : value }),
    },

    diary: {
      append: (day, line) => call<void>("diary_append", { day, line }),
      read: (day) => call<string[]>("diary_read", { day }),
      days: () => call<string[]>("diary_days"),
    },

    // A JS-side event broadcast to every window (the sender receives it too).
    bus: {
      emit: async (e) => {
        try {
          await emit("bus", e);
        } catch (err) {
          throw toBackendError(err);
        }
      },
      on: (cb) =>
        subscribe<unknown>("bus", (payload) => {
          if (isBusEvent(payload)) cb(payload);
        }),
    },
  };
}
