// Test helpers for the query cache. Not used by the app.
import { QueryClient } from "@tanstack/react-query";

/**
 * A fresh client for one test, with no garbage collection mid-test. No
 * retries by default, and none that wait: a factory that sets its own
 * `retry` (published files do) still retries, at once. Never share one
 * between tests.
 */
export function createTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        retryDelay: 0,
        gcTime: Number.POSITIVE_INFINITY,
      },
    },
  });
}
