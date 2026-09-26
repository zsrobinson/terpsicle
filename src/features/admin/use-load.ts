import { useCallback, useEffect, useRef, useState } from "react";
import { ApiCallError } from "~/server/fns/api";

// The panel's one data hook: load on mount and whenever `key` changes,
// cancel what's in flight, and reload on demand. A reload keeps showing the
// old data while it loads; a new key doesn't, since that data answers a
// different question (another filter's rows under this filter's name). The
// panel is small enough that a cache would be more code than it saves.

export type Loaded<T> =
  | { state: "loading"; data: T | null }
  | { state: "ready"; data: T }
  | { state: "failed"; data: T | null; message: string };

export function useLoad<T>(
  load: (signal: AbortSignal) => Promise<T>,
  key: string,
): Loaded<T> & { reload: () => void } {
  const [loaded, setLoaded] = useState<Loaded<T>>({
    state: "loading",
    data: null,
  });
  const [round, setRound] = useState(0);
  // The latest loader, without making every render a new request.
  const loader = useRef(load);
  loader.current = load;
  // The key the data on screen was loaded for.
  const shown = useRef(key);

  // biome-ignore lint/correctness/useExhaustiveDependencies: `key` and `round` are what trigger a reload
  useEffect(() => {
    const controller = new AbortController();
    const same = shown.current === key;
    setLoaded((prev) => ({ state: "loading", data: same ? prev.data : null }));
    loader.current(controller.signal).then(
      (data) => {
        if (controller.signal.aborted) return;
        shown.current = key;
        setLoaded({ state: "ready", data });
      },
      (error: unknown) => {
        if (controller.signal.aborted) return;
        setLoaded((prev) => ({
          state: "failed",
          data: same ? prev.data : null,
          message: failureWords(error),
        }));
      },
    );
    return () => controller.abort();
  }, [key, round]);

  const reload = useCallback(() => setRound((n) => n + 1), []);
  return { ...loaded, reload };
}

/** What went wrong, specifically (SPEC §3.13). */
export function failureWords(error: unknown): string {
  if (!(error instanceof ApiCallError))
    return "Something went wrong. Try again.";
  switch (error.reason) {
    case "network":
      return "Couldn't reach Terpsicle. Check your connection and try again.";
    case "unauthorized":
      return "You've been signed out. Sign in again to keep going.";
    case "forbidden":
      return "This account can't use the admin panel.";
    case "rate-limited":
      return "That's a lot of requests. Wait a minute, then try again.";
    default:
      return "Terpsicle didn't answer the way it should. Try again.";
  }
}
