import { useEffect } from "react";
import type { CourseCode, IsoDate, TermId } from "~/core/schema";
import type { NotificationsReadInput } from "~/core/schema/notifications";
import { useAccount } from "~/features/auth/account-store";
import { syncBadge } from "./badge";

// Reading the thing itself reads its notifications (docs/V2.md §6.7): a
// course in Schedule reads its seat openings, Todo's day reads that day's
// "Due tomorrow" (Chat reads over its socket). The server marks them in one
// cheap update; the answer's unread count goes to the app badge. Signed in
// only, and the same place at most once a minute. Framework note: this is
// a side effect of showing a page, not state, so it's an effect rather
// than a loader (the course drill-in's term comes from app state).

/** When each place was last read, this page load. */
const readAt = new Map<string, number>();
const AGAIN_AFTER_MS = 60_000;

/** Test hook: every place unread again. */
export function forgetReads(): void {
  readAt.clear();
}

/** Reads `input`'s notifications unless the same was read in the last minute. */
export async function readOnce(
  input: NotificationsReadInput,
  now = Date.now(),
): Promise<void> {
  const key = JSON.stringify(input);
  const last = readAt.get(key);
  if (last !== undefined && now - last < AGAIN_AFTER_MS) return;
  readAt.set(key, now);
  try {
    // Loaded on first use, so Schedule's signed-out pages don't carry it.
    const { notificationsApi } = await import("~/server/fns/notifications");
    syncBadge((await notificationsApi.read(input)).unread);
  } catch {
    // Offline, or signed out meanwhile: the next visit reads it.
    readAt.delete(key);
  }
}

const useSignedIn = () => useAccount((s) => s.status === "signed-in");

/** A course's seat openings, read while its details are open. */
export function useReadCourseNotifications(
  termId: TermId | null,
  courseCode: CourseCode,
): void {
  const signedIn = useSignedIn();
  useEffect(() => {
    if (signedIn && termId) void readOnce({ course: { termId, courseCode } });
  }, [signedIn, termId, courseCode]);
}

/** A day's "Due tomorrow", read while Todo shows that day (`?day=`). */
export function useReadDayNotifications(day: IsoDate | undefined): void {
  const signedIn = useSignedIn();
  useEffect(() => {
    if (signedIn && day) void readOnce({ day });
  }, [signedIn, day]);
}
