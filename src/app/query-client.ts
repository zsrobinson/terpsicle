import { QueryClient } from "@tanstack/react-query";

// The app's one TanStack Query client (docs/decisions.md, "TanStack Query
// for server data"). `getRouter` makes one per server render and one per
// page in the browser, and hands it to every route as router context;
// `@tanstack/react-router-ssr-query` streams what a server render fetched
// into the page and puts it in `QueryClientProvider`. What each kind of
// data sets (stale times, retries, persistence) lives with its query
// factories, not here: src/state/query/ for published files.

/** What every route's `beforeLoad` and `loader` get as `context`. */
export interface RouterContext {
  queryClient: QueryClient;
}

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // Data a server render sent isn't asked for again the moment the
        // page hydrates; each factory sets its own time on top.
        staleTime: 30_000,
      },
    },
  });
}
