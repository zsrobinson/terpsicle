import { buildReviewsDepts } from "~/core/reviews";
import { publishReviews } from "~/ingest/reviews";
import {
  publishableNameFacts,
  publishedReviewFacts,
} from "~/server/reviews/store";
import { type Job, jobLog, runJob } from "./job";
import { createR2BlobStore } from "./r2-blob-store";

/**
 * Terpsicle reviews' numbers to R2 (V2 §7.6, `37 * * * *`): per department,
 * each instructor's rating, count and newest month from published reviews,
 * and the names PlanetTerp's join doesn't cover. Only departments whose
 * numbers changed are written; the manifest last. Never review text: that
 * comes only from reviews/list, so taking a review down is instant.
 */
export const runReviewsPublishJob: Job = async (context) => {
  await runJob("reviews-publish", context, async () => {
    const { env, now } = context;
    // Both reads finish before anything is written: a D1 error leaves R2 as it was.
    const [reviews, names] = await Promise.all([
      publishedReviewFacts(env.DB),
      publishableNameFacts(env.DB),
    ]);
    const result = await publishReviews({
      store: createR2BlobStore(env.DATA),
      now,
      log: jobLog,
      depts: buildReviewsDepts(reviews, names),
    });
    return {
      counts: {
        reviews: reviews.length,
        departments: result.departments,
        instructors: result.instructors,
        written: result.written,
        dropped: result.dropped,
        deleted: result.deleted,
        manifestChanged: result.manifestChanged ? 1 : 0,
      },
      errors: [],
    };
  });
};
