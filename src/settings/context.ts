import { createContext, useContext } from "react";
import type { Backend, SecretsStatus } from "../backend/types";
import type { LifeState } from "../core/life";
import type { Prefs } from "../core/prefs";
import type { Lang } from "../core/types";

export interface SettingsApi {
  backend: Backend;
  prefs: Prefs;
  /** Changes prefs and saves them: right away, or after a short pause while typing (`debounce`). */
  update(patch: Partial<Prefs>, debounce?: boolean): void;
  /** Writes a pending debounced change now (when a text field loses focus). */
  flush(): void;
  life: LifeState;
  secrets: SecretsStatus;
  refreshSecrets(): Promise<void>;
  /** The language shown now, and the one Windows would pick. */
  lang: Lang;
  systemLang: Lang;
}

export const SettingsContext = createContext<SettingsApi | null>(null);

export function useSettings(): SettingsApi {
  const api = useContext(SettingsContext);
  if (!api) throw new Error("useSettings outside <SettingsContext>");
  return api;
}
