// What anyone may read of the reviews: a page's reviews, the newest
// anywhere, and the numbers on each instructor and course. Server renders
// get them through the page context (src/server/pages); the browser asks
// the API. Never an author (V2 §7.5).
import type { ReviewsServerData, TerpsicleNumbers } from "~/core/reviews";
import {
  FeatureVarsSchema,
  type LatestReviews,
  PAGE_REVIEWS_MAX,
  type PageReviews,
  PLANETTERP_PAGE_MAX,
  type PlanetTerpReviewsInput,
  type PlanetTerpReviewsResult,
  type ReviewsLatestInput,
  type ReviewsPageInput,
} from "~/core/schema";
import { toPublicReview } from "./api";
import {
  planetTerpCourseNumbers,
  planetTerpReviewCount,
  planetTerpReviews,
} from "./planetterp";
import { fillPlanetTerpReviews } from "./planetterp-live";
import {
  instructorNames,
  instructorWithDepts,
  listPublishedForPage,
  publishedNumbersByInstructor,
  publishedNumbersForCourse,
} from "./store";

/**
 * A Reviews page's first reviews (`reviews/page`, and the server's render):
 * all of ours about it, while REVIEWS_ENABLED lets anyone read them, and
 * PlanetTerp's newest page, which don't depend on it.
 */
export async function pageReviews(
  env: { DB: D1Database; REVIEWS_ENABLED?: string },
  input: ReviewsPageInput,
  fetcher: typeof fetch = fetch,
): Promise<PageReviews> {
  const off = FeatureVarsSchema.parse(env).REVIEWS_ENABLED === "off";
  // An instructor the nightly job hasn't reached yet (it stores a share of
  // PlanetTerp's 5,000 a night) would read as having no reviews: when the
  // page says who they are, fetch theirs from PlanetTerp once, first.
  if (input.instructorId !== null && input.planetTerpName)
    await fillPlanetTerpReviews(
      env.DB,
      fetcher,
      input.instructorId,
      input.planetTerpName,
      new Date(),
    ).catch(() => false);
  // A course's page rates the course from PlanetTerp's reviews of it; an
  // instructor's uses PlanetTerp's own numbers for them.
  const coursePage = input.instructorId === null ? input.course : null;
  const [ours, theirs, courseNumbers, count] = await Promise.all([
    off
      ? null
      : listPublishedForPage(env.DB, { ...input, limit: PAGE_REVIEWS_MAX }),
    planetTerpReviews(env.DB, {
      ...input,
      cursor: null,
      limit: PLANETTERP_PAGE_MAX,
    }),
    coursePage ? planetTerpCourseNumbers(env.DB, coursePage) : undefined,
    input.instructorId !== null && input.course !== null
      ? planetTerpReviewCount(env.DB, input.instructorId, input.course)
      : undefined,
  ]);
  return {
    terpsicle:
      ours?.map((row) => ({
        ...toPublicReview(row),
        instructorId: row.instructor_id,
      })) ?? null,
    planetTerp: theirs.reviews,
    next: theirs.next,
    ...(courseNumbers === undefined ? {} : { planetTerpCourse: courseNumbers }),
    ...(count === undefined ? {} : { planetTerpCount: count }),
  };
}

/** `reviews/latest`: the newest reviews anywhere, both sources. */
export async function latestReviews(
  env: { DB: D1Database; REVIEWS_ENABLED?: string },
  input: ReviewsLatestInput,
): Promise<LatestReviews> {
  const off = FeatureVarsSchema.parse(env).REVIEWS_ENABLED === "off";
  const all = { instructorId: null, course: null };
  const [ours, theirs] = await Promise.all([
    off ? null : listPublishedForPage(env.DB, { ...all, limit: input.limit }),
    planetTerpReviews(env.DB, { ...all, cursor: null, limit: input.limit }),
  ]);
  const terpsicle =
    ours
      ?.map((row) => ({
        ...toPublicReview(row),
        instructorId: row.instructor_id,
      }))
      // By month, then id: an order by the minute would say which review
      // went up a moment ago, which the month rounding hides (V2 §7.5).
      .sort(
        (a, b) =>
          b.createdMonth.localeCompare(a.createdMonth) ||
          (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
      ) ?? null;
  return {
    terpsicle,
    planetTerp: theirs.reviews,
    instructors: await instructorNames(env.DB, [
      ...new Set(terpsicle?.map((r) => r.instructorId) ?? []),
    ]),
  };
}

/** `planetterp/reviews`: the next page of PlanetTerp's. */
export function morePlanetTerpReviews(
  env: { DB: D1Database },
  input: PlanetTerpReviewsInput,
): Promise<PlanetTerpReviewsResult> {
  return planetTerpReviews(env.DB, input);
}

const numbers = (row: { rating: number; count: number }): TerpsicleNumbers => ({
  rating: row.rating,
  reviewCount: row.count,
});

export function reviewsServerData(db: D1Database): ReviewsServerData {
  return {
    async instructorNumbers(ids) {
      const rows = await publishedNumbersByInstructor(db, ids);
      return Object.fromEntries(rows.map((r) => [r.id, numbers(r)]));
    },
    async courseNumbers(code) {
      const row = await publishedNumbersForCourse(db, code);
      return row ? numbers(row) : null;
    },
    instructor: (id) => instructorWithDepts(db, id),
  };
}
