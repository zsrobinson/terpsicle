// What readers' reports do (V2 §9.3), shared by Reviews and Chat. Every report
// puts the item in the owner's queue; some take it down at once.
import type { ModerationReason, ReportReason } from "~/core/schema";

/** Different people whose reports hide an item until a person decides. */
export const HIDE_AT_REPORTERS = 3;

/** Report reasons that hide an item on the first report: harm comes fast. */
export const HIDE_AT_ONCE: ReadonlySet<ReportReason> = new Set([
  "threat",
  "personal-info",
  "names-a-student",
]);

export interface ReportLike {
  reporterId: string;
  reason: ReportReason;
}

/**
 * Whether these reports (the ones since a person last approved the item)
 * take it down. All reporters weigh the same; there are no trust tiers.
 */
export function shouldHide(reports: readonly ReportLike[]): boolean {
  const reporters = new Set(reports.map((r) => r.reporterId));
  return (
    reporters.size >= HIDE_AT_REPORTERS ||
    reports.some((r) => HIDE_AT_ONCE.has(r.reason))
  );
}

/**
 * The queue labels for these reports: one per reason, in first-reported
 * order. They hold when the reports hid the item, else only flag it.
 */
export function reportReasons(
  reports: readonly ReportLike[],
): ModerationReason[] {
  const action = shouldHide(reports) ? "hold" : "flag";
  const seen = new Set<ReportReason>();
  const reasons: ModerationReason[] = [];
  for (const { reason } of reports) {
    if (seen.has(reason)) continue;
    seen.add(reason);
    reasons.push({
      code: "reported",
      source: "reports",
      action,
      report: reason,
    });
  }
  return reasons;
}

/** A reported threat goes to the top of the owner's queue. */
export const reportsAreUrgent = (reports: readonly ReportLike[]): boolean =>
  reports.some((r) => r.reason === "threat");
