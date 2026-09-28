import { useRouterState } from "@tanstack/react-router";
import { useEffect } from "react";
import { onApiFailure } from "~/server/fns/api";
import {
  logError,
  logEvent,
  logFailedRequest,
  logNavigation,
} from "./activity-log";
import { onTrack } from "./analytics";

// From the first import, so events tracked before the first render count.
if (typeof window !== "undefined") onTrack(logEvent);

/**
 * Keeps the feedback activity log (./activity-log.ts) on every page:
 * `track()` events, uncaught errors and failed API calls, and each route
 * change.
 */
export function ActivityLogBoot() {
  const href = useRouterState({ select: (s) => s.location.href });
  useEffect(() => {
    const onError = (event: ErrorEvent) =>
      logError(event.error ?? new Error(event.message));
    const onRejection = (event: PromiseRejectionEvent) =>
      logError(event.reason);
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    onApiFailure(({ route, status }) => logFailedRequest(route, status));
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
      onApiFailure(null);
    };
  }, []);
  useEffect(() => logNavigation(href), [href]);
  return null;
}
