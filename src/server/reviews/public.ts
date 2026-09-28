// What anyone may know about Terpsicle's reviews without reading one: the
// numbers on each instructor and course, and which were reviewed lately.
// Server renders get it through the page context (src/server/pages); the
// browser asks reviews/recent. No review ids, text or authors (V2 §7.5).
import {
  createdMonth,
  type RecentReview,
  type ReviewsServerData,
  type TerpsicleNumbers,
} from "~/core/reviews";
import {
  FeatureVarsSchema,
  PAGE_REVIEWS_MAX,
  type PageReviews,
  PLANETTERP_PAGE_MAX,
  type PlanetTerpReviewsInput,
  type PlanetTerpReviewsResult,
  type ReviewsPageInput,
  type ReviewsRecentInput,
  type ReviewsRecentResult,
} from "~/core/schema";
import { toPublicReview } from "./api";
import { planetTerpReviews } from "./planetterp";
import {
  instructorWithDepts,
  listPublishedForPage,
  publishedNumbersByInstructor,
  publishedNumbersForCourse,
  reviewedPairs,
} from "./store";

/** Pairs read to choose the newest `limit` from. */
const CANDIDATES = 60;

/**
 * The newest reviewed pairs, ordered as readers see dates: by month, then
 * by how many reviews, then by course. Ordering by the minute would say
 * when a review went up, which the month rounding hides (V2 §7.5).
 */
export async function recentReviews(
  db: D1Database,
  limit: number,
): Promise<RecentReview[]> {
  const rows = (await reviewedPairs(db, CANDIDATES)).map((r) => ({
    course: r.course,
    instructorId: r.instructor_id,
    instructorName: r.name,
    month: createdMonth(r.created_at),
    count: r.count,
  }));
  return rows
    .sort(
      (a, b) =>
        b.month.localeCompare(a.month) ||
        b.count - a.count ||
        a.course.localeCompare(b.course) ||
        a.instructorName.localeCompare(b.instructorName),
    )
    .slice(0, limit)
    .map(({ count: _, ...pair }) => pair);
}

/** `reviews/recent`. */
export async function listRecent(
  env: { DB: D1Database },
  input: ReviewsRecentInput,
): Promise<ReviewsRecentResult> {
  return { reviews: await recentReviews(env.DB, input.limit) };
}

/**
 * A Reviews page's first reviews (`reviews/page`, and the server's render):
 * all of ours about it, while REVIEWS_ENABLED lets anyone read them, and
 * PlanetTerp's newest page, which don't depend on it.
 */
export async function pageReviews(
  env: { DB: D1Database; REVIEWS_ENABLED?: string },
  input: ReviewsPageInput,
): Promise<PageReviews> {
  const off = FeatureVarsSchema.parse(env).REVIEWS_ENABLED === "off";
  const [ours, theirs] = await Promise.all([
    off
      ? null
      : listPublishedForPage(env.DB, { ...input, limit: PAGE_REVIEWS_MAX }),
    planetTerpReviews(env.DB, {
      ...input,
      cursor: null,
      limit: PLANETTERP_PAGE_MAX,
    }),
  ]);
  return {
    terpsicle:
      ours?.map((row) => ({
        ...toPublicReview(row),
        instructorId: row.instructor_id,
      })) ?? null,
    planetTerp: theirs.reviews,
    next: theirs.next,
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
    recent: (limit) => recentReviews(db, limit),
  };
}
