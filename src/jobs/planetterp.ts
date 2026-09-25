import { runPlanetTerp } from "~/ingest/planetterp";
import { type Job, jobHttp, jobLog, runJob } from "./job";
import { createR2BlobStore } from "./r2-blob-store";

/**
 * Grade requests per nightly run: about 4 minutes of wall time at PlanetTerp's
 * pace, so the whole catalog's grades refresh roughly weekly.
 */
export const NIGHTLY_GRADE_REQUESTS = 700;

/** PlanetTerp ratings, review metadata and grade distributions (daily). */
export const runPlanetTerpJob: Job = async (context) => {
  await runJob("planetterp", context, async () => {
    const {
      errors,
      latestReviewAt: _,
      ...counts
    } = await runPlanetTerp({
      http: jobHttp(context),
      store: createR2BlobStore(context.env.DATA),
      now: context.now,
      log: jobLog,
      gradeRequests: NIGHTLY_GRADE_REQUESTS,
    });
    return { counts, errors };
  });
};
