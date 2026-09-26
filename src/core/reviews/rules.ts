// The rules around writing a review (V2 §7.4): stage 0 before anything is
// stored, the per-author and per-instructor limits, and which moderation
// reason the author is told about. Pure; the Worker passes counts and time.
import type {
  ModerationAction,
  ModerationReason,
  ReasonCode,
  ReviewProblem,
} from "~/core/schema";
import { precheck } from "../moderation/precheck";

const DAY_MS = 86_400_000;

export const REVIEW_LIMITS = {
  /** New reviews per author in any 7 days. */
  perWeek: 10,
  weekMs: 7 * DAY_MS,
  /** A burst of new reviews for one instructor goes to the owner's queue. */
  burst: {
    /** More than this many in 24 hours… */
    perDay: 5,
    /** …and more than this times the daily average of the last 30 days. */
    averageFactor: 3,
    averageDays: 30,
  },
} as const;

/**
 * Stage 0 for a review body (MODERATION.md §3). Anything a rule would hold
 * or remove comes back to the author to fix, and nothing is stored: a review
 * has no reason to carry a link or a phone number, and asking beats a
 * days-long wait in the queue. Flags aren't problems; the models read them.
 */
export function stageZeroProblems(body: string): ReviewProblem[] {
  return precheck({ kind: "review", text: body })
    .filter((r) => r.action !== "flag")
    .map((r) => (r.span ? { code: r.code, span: r.span } : { code: r.code }));
}

/**
 * Seconds until the author may start another review, or null when they're
 * under the weekly limit. `recent` is when each of their reviews was created
 * in the last week (any status: deleting one doesn't give it back).
 */
export function weeklyLimitWait(
  recent: readonly string[],
  now: Date,
): number | null {
  const since = now.getTime() - REVIEW_LIMITS.weekMs;
  const inWindow = recent
    .map((iso) => Date.parse(iso))
    .filter((t) => t > since)
    .sort((a, b) => a - b);
  if (inWindow.length < REVIEW_LIMITS.perWeek) return null;
  // The oldest that has to age out before the count drops under the limit.
  const oldest = inWindow[inWindow.length - REVIEW_LIMITS.perWeek] ?? since;
  return Math.max(
    1,
    Math.ceil((oldest + REVIEW_LIMITS.weekMs - now.getTime()) / 1000),
  );
}

/**
 * Whether one more new review of an instructor is a burst. V2 §7.4 names two
 * triggers ("more than 5 in 24 h, or 3× the 30-day average"); read as either
 * alone, the second would hold a quiet instructor's first review of the
 * month, so the 24-hour count has to pass both: more than 5, and more than
 * 3× the usual day. A popular instructor at the start of term gets room.
 */
export function isBurst(counts: {
  lastDay: number;
  last30Days: number;
}): boolean {
  const { perDay, averageFactor, averageDays } = REVIEW_LIMITS.burst;
  const withThis = counts.lastDay + 1;
  const average = counts.last30Days / averageDays;
  return withThis > perDay && withThis > averageFactor * average;
}

const SOURCE_ORDER: Readonly<Record<ModerationReason["source"], number>> = {
  // What the author can act on first; "the check didn't finish" last.
  rules: 0,
  policy: 1,
  guard: 2,
  reports: 3,
  admin: 4,
  system: 5,
};

/**
 * The reason the author is told a review (or an edit) was held or removed:
 * the first reason with the deciding action, preferring the ones they can
 * do something about.
 */
export function mainReason(
  reasons: readonly ModerationReason[],
  action: Exclude<ModerationAction, "flag">,
): ReasonCode {
  const deciding = reasons
    .filter((r) => r.action === action)
    .sort((a, b) => SOURCE_ORDER[a.source] - SOURCE_ORDER[b.source]);
  return (
    deciding[0]?.code ?? (action === "remove" ? "admin" : "model-unavailable")
  );
}
