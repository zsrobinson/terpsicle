import { z } from "zod";
import {
  InstructorSlugSchema,
  JOBS_PREFIX,
  planetTerpReviewsKey,
  type Review,
  ReviewGradeSchema,
  ReviewSchema,
  StoredReviewsSchema,
} from "~/core/schema";
import type { BlobStore } from "../blob-store";
import { contentHash, JSON_TYPE, toJsonBytes } from "../hash";
import { mapLimit } from "../http";
import { type Logger, readJsonOrNull, writeJson } from "../publish";

// The review text the nightly list pull already downloads, kept privately in
// `_jobs/planetterp/reviews/<slug>.json` (DATA.md §2.6) so summaries can be
// regenerated if PlanetTerp goes away. Never served or republished.

export const REVIEWS_INDEX_KEY = `${JOBS_PREFIX}planetterp/reviews-index.json`;

/**
 * Review files written per run. About 5,100 instructors have reviews, so the
 * first run would otherwise add that many R2 writes to ~1,000 other
 * subrequests; capping it stays well inside the Worker's 10,000 per
 * invocation, and the rest land on the next nights. Later runs only write
 * what changed.
 */
export const MAX_REVIEW_WRITES = 3000;
const WRITE_CONCURRENCY = 6;

/** A review as the list endpoint gives it, tolerant of junk in free-text fields. */
export const ReviewApiSchema = z.object({
  course: z.string().nullable().catch(null),
  review: z.string().catch(""),
  rating: z.number().nullable().catch(null),
  expected_grade: z.string().nullable().catch(null),
  created: z.string(),
});
export type ReviewApi = z.infer<typeof ReviewApiSchema>;

const IndexSchema = z.object({
  slugs: z.record(
    z.string(),
    z.object({ hash: z.string(), count: z.number().int().min(0) }),
  ),
});

/** Reviews that fit `ReviewSchema`, oldest first, so unchanged reviews hash the same. */
export function normalizeReviews(raw: readonly ReviewApi[]): Review[] {
  const out: Review[] = [];
  for (const r of raw) {
    const created = Date.parse(r.created);
    const course = r.course?.trim() ?? "";
    const review = ReviewSchema.safeParse({
      course: course.length >= 1 && course.length <= 12 ? course : null,
      text: r.review,
      rating: r.rating,
      expectedGrade: (r.expected_grade ?? "").slice(0, 40),
      created: Number.isFinite(created)
        ? new Date(created).toISOString()
        : r.created,
    });
    if (review.success) out.push(review.data);
  }
  return out.sort((a, b) =>
    a.created < b.created
      ? -1
      : a.created > b.created
        ? 1
        : a.text < b.text
          ? -1
          : a.text > b.text
            ? 1
            : 0,
  );
}

/** A review as `planetterp_reviews` stores it (migrations/0020). */
export interface PlanetTerpReviewRecord {
  id: string;
  course: string | null;
  rating: number;
  expectedGrade: string | null;
  body: string;
  created: string;
}

/**
 * An instructor's reviews as Reviews shows them (V2 §7.6), with the hash of
 * the whole set, so a night only rewrites instructors whose reviews changed.
 * Only what a page shows: the course, rating, the expected grade when it's
 * a real one, the words and the date. Each id hashes the slug, date and
 * words (PlanetTerp's reviews have none); an exact repeat is dropped.
 */
export async function planetTerpReviewRecords(
  slug: string,
  raw: readonly ReviewApi[],
): Promise<{ records: PlanetTerpReviewRecord[]; hash: string }> {
  const records: PlanetTerpReviewRecord[] = [];
  const ids = new Set<string>();
  for (const r of normalizeReviews(raw)) {
    const id = await contentHash(`${slug}\n${r.created}\n${r.text}`);
    if (ids.has(id)) continue;
    ids.add(id);
    const grade = ReviewGradeSchema.safeParse(
      r.expectedGrade.trim().toUpperCase(),
    );
    records.push({
      id,
      course: r.course ? r.course.toUpperCase() : null,
      rating: r.rating,
      expectedGrade: grade.success ? grade.data : null,
      body: r.text,
      created: r.created,
    });
  }
  return { records, hash: await contentHash(toJsonBytes(records)) };
}

export interface ReviewKeeper {
  /** Stores each professor's reviews when they changed. */
  keep(
    professors: readonly {
      slug: string;
      name: string;
      reviews: readonly ReviewApi[];
    }[],
  ): Promise<void>;
  /** Saves the index; call once, even after a failure. */
  finish(): Promise<{ written: number; kept: number }>;
}

/**
 * Writes review files, never replacing stored reviews with fewer: an empty or
 * shortened list is PlanetTerp failing, not reviews vanishing, so the stored
 * text stays (a review PlanetTerp deletes stays too, until the file is).
 */
export async function createReviewKeeper(
  store: BlobStore,
  log: Logger,
): Promise<ReviewKeeper> {
  const index = (await readJsonOrNull(
    store,
    REVIEWS_INDEX_KEY,
    IndexSchema,
    log,
  )) ?? { slugs: {} };
  let written = 0;
  let kept = 0;
  let changed = false;
  return {
    async keep(professors) {
      await mapLimit(professors, WRITE_CONCURRENCY, async (p) => {
        if (!InstructorSlugSchema.safeParse(p.slug).success) return;
        const reviews = normalizeReviews(p.reviews);
        const previous = index.slugs[p.slug];
        if (reviews.length === 0 || reviews.length < (previous?.count ?? 0)) {
          if (previous) kept++;
          return;
        }
        const file = StoredReviewsSchema.safeParse({
          slug: p.slug,
          name: p.name,
          reviews,
        });
        if (!file.success) return;
        const bytes = toJsonBytes(file.data);
        const hash = await contentHash(bytes);
        if (previous?.hash === hash || written >= MAX_REVIEW_WRITES) return;
        written++;
        await store.put(planetTerpReviewsKey(p.slug), bytes, {
          contentType: JSON_TYPE,
        });
        index.slugs[p.slug] = { hash, count: reviews.length };
        changed = true;
      });
    },
    async finish() {
      if (changed) await writeJson(store, REVIEWS_INDEX_KEY, index);
      return { written, kept };
    },
  };
}
