import { runPlanetTerp } from "~/ingest/planetterp/planetterp";
import { type Job, jobHttp, jobLog, runJob } from "./job";
import { createR2BlobStore } from "./r2-blob-store";

/**
 * Grade requests per nightly run: about 4 minutes of wall time at PlanetTerp's
 * pace, so the whole catalog's grades refresh roughly weekly.
 */
export const NIGHTLY_GRADE_REQUESTS = 700;

/**
 * Whether the job keeps PlanetTerp's review text privately for summaries.
 * Off unless `PLANETTERP_KEEP_REVIEW_TEXT` is "true": it's PlanetTerp's
 * reviewers' writing, and keeping it waits on the owner's call (and
 * PlanetTerp's OK). Summaries fetch it live meanwhile.
 */
export function keepsReviewText(
  env: Env | { PLANETTERP_KEEP_REVIEW_TEXT?: string },
): boolean {
  // Not a wrangler var (so not on `Env`) until someone turns it on.
  return (
    "PLANETTERP_KEEP_REVIEW_TEXT" in env &&
    env.PLANETTERP_KEEP_REVIEW_TEXT === "true"
  );
}

/**
 * PlanetTerp ratings, review metadata and grade distributions (daily). When
 * PlanetTerp answers with an empty or truncated list, `runPlanetTerp` keeps
 * the last good files, marks the source stale and throws a
 * `SourceFailureError`, which `runJob` reports as `cron_job_failed`.
 */
export const runPlanetTerpJob: Job = async (context) => {
  await runJob("planetterp", context, async () => {
    const {
      errors,
      latestReviewAt: _,
      source,
      matchedBy,
      ...totals
    } = await runPlanetTerp({
      http: jobHttp(context),
      store: createR2BlobStore(context.env.DATA),
      now: context.now,
      log: jobLog,
      gradeRequests: NIGHTLY_GRADE_REQUESTS,
      keepReviewText: keepsReviewText(context.env),
    });
    const counts: Record<string, number> = {
      ...totals,
      // 1 while PlanetTerp has stopped publishing reviews (DATA.md §4.1).
      sourceStale: source.status === "ok" ? 0 : 1,
    };
    for (const [rule, n] of Object.entries(matchedBy))
      counts[`matchedBy.${rule}`] = n;
    return { counts, errors };
  });
};
