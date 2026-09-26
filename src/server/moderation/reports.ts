// POST /api/reports/create (V2 §9.3), shared by Reviews and Chat: one report
// per person per item. Every report puts the item in the owner's queue; 3
// different people, or 1 report of a threat, personal info or a named
// student, take it down until a person decides.
import { reportReasons, reportsAreUrgent, shouldHide } from "~/core/moderation";
import type {
  CourseCode,
  ModerationKind,
  ReportCreateInput,
  ReportCreateResult,
} from "~/core/schema";
import { apiError } from "../api/http";
import type { IdentityRouteContext } from "../auth/api";
import { reviewReportTarget } from "../reviews/report-target";
import { type ModerationEnv, queueForOwner } from "./service";
import { insertReport, openReports } from "./store";

/** How reports reach the item they're about. Chat adds its own when it lands. */
export interface ReportTarget {
  /** The item, if readers can see it (or just could). */
  find(
    db: D1Database,
    ref: string,
    reporterId: string,
  ): Promise<{
    /** The reporter wrote it: the only thing said about its author. */
    own: boolean;
    /** Up for readers now (not already taken down). */
    shown: boolean;
    /** What readers see: the queue snapshot. */
    text: string;
    course: CourseCode | null;
  } | null>;
  /** Counts a new report on the item. */
  counted(db: D1Database, ref: string, now: Date): Promise<void>;
  /** Takes the item down; false if it was already down. */
  hide(db: D1Database, ref: string, now: Date): Promise<boolean>;
}

export type ReportTargets = Partial<Record<ModerationKind, ReportTarget>>;

export const REPORT_TARGETS: ReportTargets = { review: reviewReportTarget };

export async function createReport(
  env: Pick<ModerationEnv, "DB">,
  input: ReportCreateInput,
  ctx: IdentityRouteContext,
  targets: ReportTargets = REPORT_TARGETS,
): Promise<ReportCreateResult | Response> {
  const user = ctx.session?.user;
  if (!user) return apiError("unauthorized");
  const { now } = ctx;
  const target = targets[input.surface];
  const item = await target?.find(env.DB, input.ref, user.id);
  if (!target || !item) return { status: "not-found" };
  if (item.own) return { status: "own" };

  const note = input.note?.trim() || null;
  const recorded = await insertReport(env.DB, {
    surface: input.surface,
    ref: input.ref,
    reporterId: user.id,
    reason: input.reason,
    note,
    now,
  });
  // One report per person per item: asking again changes nothing.
  if (!recorded) return { status: "reported" };
  await target.counted(env.DB, input.ref, now);

  const reports = await openReports(env.DB, input.surface, input.ref);
  const tookDown =
    item.shown && shouldHide(reports)
      ? await target.hide(env.DB, input.ref, now)
      : false;
  await queueForOwner(
    env,
    {
      kind: input.surface,
      targetId: input.ref,
      text: item.text,
      course: item.course,
      // Reasons only: who reported stays in `reports`, out of the queue.
      reasons: reportReasons(reports),
      urgent: reportsAreUrgent(reports),
    },
    tookDown
      ? { now, decision: { stage: "reports", verdict: "hide" } }
      : { now },
  );
  return { status: "reported" };
}
