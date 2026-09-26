import { z } from "zod";
import {
  IsoDateTimeSchema,
  JOBS_PREFIX,
  type PlanetTerpSourceStatus,
  PlanetTerpSourceStatusSchema,
  TermIdSchema,
} from "~/core/schema";

// Whether PlanetTerp's answer can be trusted, and how current it is. The job
// must never replace good data with an empty or truncated list that happens
// to parse (DATA.md §4.1), and the UI says how old the numbers are.

export const SOURCE_STATE_KEY = `${JOBS_PREFIX}planetterp/state.json`;

/**
 * Sanity floors, as a share of the last good run. PlanetTerp only ever adds
 * professors (people who stop teaching stay listed) and almost never deletes
 * reviews. So a run with over 10% fewer of either isn't news: it's PlanetTerp
 * failing in a way that still parses (an empty or short page, `reviews`
 * dropped from list items), and publishing it would erase ratings for whole
 * departments. The 10% slack covers PlanetTerp merging duplicate slugs or
 * removing a batch of spam reviews.
 */
export const MIN_PROFESSOR_SHARE = 0.9;
export const MIN_REVIEW_SHARE = 0.9;

/**
 * PlanetTerp published reviews every week even in summer (132–318 a month in
 * Jun–Sep 2025, RESEARCH.md §5.5), so six weeks without one means it has
 * stopped approving them and its ratings are frozen.
 */
export const REVIEWS_STALE_AFTER_DAYS = 42;

/** With no good run for this long, PlanetTerp is gone rather than late. */
export const GONE_AFTER_DAYS = 30;

const DAY_MS = 86_400_000;

/** `_jobs/planetterp/state.json`: the last run's verdict and the last good run's counts. */
export const SourceStateSchema = z.object({
  status: PlanetTerpSourceStatusSchema,
  /** Why the status isn't `ok`; null when it is. */
  reason: z.string().nullable(),
  lastRunAt: IsoDateTimeSchema,
  lastSuccessAt: IsoDateTimeSchema.nullable(),
  /** The last good run's totals: the baseline for the floors. */
  professors: z.number().int().min(0),
  reviews: z.number().int().min(0),
  latestReviewAt: IsoDateTimeSchema.nullable(),
  gradesThrough: TermIdSchema.nullable(),
});
export type SourceState = z.infer<typeof SourceStateSchema>;

export interface RunTotals {
  professors: number;
  reviews: number;
}

/** Why this run's professor list can't be published, or null when it looks right. */
export function implausibleReason(
  run: RunTotals,
  last: RunTotals | null,
): string | null {
  if (run.professors === 0) return "PlanetTerp listed no professors";
  if (!last) return null;
  const professorFloor = Math.ceil(last.professors * MIN_PROFESSOR_SHARE);
  if (run.professors < professorFloor)
    return `PlanetTerp listed ${run.professors} professors, down from ${last.professors} last time (the floor is ${professorFloor})`;
  const reviewFloor = Math.ceil(last.reviews * MIN_REVIEW_SHARE);
  if (run.reviews < reviewFloor)
    return `PlanetTerp listed ${run.reviews} reviews, down from ${last.reviews} last time (the floor is ${reviewFloor})`;
  return null;
}

/** After a good run: `ok`, or `stale` when PlanetTerp has stopped publishing reviews. */
export function statusAfterSuccess(
  latestReviewAt: string | null,
  now: Date,
): { status: PlanetTerpSourceStatus; reason: string | null } {
  if (latestReviewAt === null) return { status: "ok", reason: null };
  const days = (now.getTime() - Date.parse(latestReviewAt)) / DAY_MS;
  return days > REVIEWS_STALE_AFTER_DAYS
    ? {
        status: "stale",
        reason: `No new PlanetTerp review since ${latestReviewAt.slice(0, 10)}`,
      }
    : { status: "ok", reason: null };
}

/** After a failed run: `stale`, or `gone` once there's been no good run for weeks. */
export function statusAfterFailure(
  lastSuccessAt: string | null,
  now: Date,
): PlanetTerpSourceStatus {
  if (lastSuccessAt === null) return "stale";
  const days = (now.getTime() - Date.parse(lastSuccessAt)) / DAY_MS;
  return days > GONE_AFTER_DAYS ? "gone" : "stale";
}
