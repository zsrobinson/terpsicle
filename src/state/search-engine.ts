import { useEffect, useSyncExternalStore } from "react";

// The course search engine (~/core/search/search, with MiniSearch) loads
// when a search box first opens, not with the page: Schedule's Search tab
// and Plan's Search view share it, and neither page's first load carries
// it (scripts/check-bundle.ts).

export type SearchEngine = typeof import("~/core/search/search");

let engine: SearchEngine | null = null;
let loading: Promise<SearchEngine> | null = null;
const listeners = new Set<() => void>();

/** Loads the engine once; a failed load can be tried again. */
export function loadSearchEngine(): Promise<SearchEngine> {
  loading ??= import("~/core/search/search").then(
    (m) => {
      engine = m;
      for (const listener of listeners) listener();
      return m;
    },
    (error: unknown) => {
      loading = null;
      throw error;
    },
  );
  return loading;
}

/** The engine once it's loaded; asks for it on mount. */
export function useSearchEngine(): SearchEngine | null {
  useEffect(() => {
    loadSearchEngine().catch((error: unknown) => console.error(error));
  }, []);
  return useSyncExternalStore(
    (onChange) => {
      listeners.add(onChange);
      return () => listeners.delete(onChange);
    },
    () => engine,
  );
}
