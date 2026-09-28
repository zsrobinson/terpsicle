// Test helpers for the query cache. Not used by the app.
import { QueryClient } from "@tanstack/react-query";

/**
 * A fresh client for one test: no retries (a failure shows at once) and no
 * garbage collection mid-test. Never share one between tests.
 */
export function createTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Number.POSITIVE_INFINITY },
    },
  });
}
