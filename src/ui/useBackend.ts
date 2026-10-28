// React glue for the Settings and Diary windows: they never run the Brain, only the Backend.
import { useEffect, useEffectEvent, useState } from "react";
import { getBackend } from "../backend";
import type { Backend, BusEvent } from "../backend/types";

/** The backend once it is ready (Tauri or the browser demo), or the error that stopped it. */
export function useBackend(): { backend: Backend | null; error: unknown } {
  const [state, setState] = useState<{ backend: Backend | null; error: unknown }>({ backend: null, error: null });
  useEffect(() => {
    let alive = true;
    getBackend().then(
      (backend) => alive && setState({ backend, error: null }),
      (error: unknown) => alive && setState({ backend: null, error }),
    );
    return () => {
      alive = false;
    };
  }, []);
  return state;
}

/** Subscribes to cross-window events; the latest `handler` is always the one called. */
export function useBus(backend: Backend | null, handler: (e: BusEvent) => void): void {
  const onEvent = useEffectEvent(handler);
  useEffect(() => {
    if (!backend) return;
    return backend.bus.on((e) => onEvent(e));
  }, [backend]);
}

/** Calls `fn` whenever the window comes back into view (another window may have changed shared state). */
export function useWindowFocus(fn: () => void): void {
  const onFocus = useEffectEvent(fn);
  useEffect(() => {
    const focus = () => onFocus();
    const visible = () => {
      if (document.visibilityState === "visible") onFocus();
    };
    window.addEventListener("focus", focus);
    document.addEventListener("visibilitychange", visible);
    return () => {
      window.removeEventListener("focus", focus);
      document.removeEventListener("visibilitychange", visible);
    };
  }, []);
}
