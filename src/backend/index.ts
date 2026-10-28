// Picks the backend: Tauri inside the app, the in-memory demo in a plain browser or with `?demo`.
import { createDemoBackend } from "./demo";
import type { Backend } from "./types";

export const isTauri = (): boolean => typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

export const isDemo = (): boolean => !isTauri() || new URLSearchParams(window.location.search).has("demo");

let cached: Promise<Backend> | null = null;

export function getBackend(): Promise<Backend> {
  cached ??= (async () => {
    if (!isTauri()) return createDemoBackend();
    const { createTauriBackend } = await import("./tauri");
    const real = createTauriBackend();
    if (!isDemo()) return real;
    // `TodoPet.exe --demo`: real windows, tray and OS watchers, but sample data that never touches
    // the user's Todoist, secrets or saved settings.
    const fake = createDemoBackend({ persist: false });
    return { ...real, todoist: fake.todoist, secrets: fake.secrets, claude: fake.claude, calendar: fake.calendar, storage: fake.storage, diary: fake.diary };
  })();
  return cached;
}
