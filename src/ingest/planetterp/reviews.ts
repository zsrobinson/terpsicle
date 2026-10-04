import { z } from "zod";
import { type Review, ReviewGradeSchema, ReviewSchema } from "~/core/schema";
import { contentHash, toJsonBytes } from "../hash";

// The reviews the nightly list pull already downloads, normalized for
// Reviews' pages (D1's `planetterp_reviews`, src/jobs/planetterp-reviews.ts).

/** A review as the list endpoint gives it, tolerant of junk in free-text fields. */
export const ReviewApiSchema = z.object({
  course: z.string().nullable().catch(null),
  review: z.string().catch(""),
  rating: z.number().nullable().catch(null),
  expected_grade: z.string().nullable().catch(null),
  created: z.string(),
});
export type ReviewApi = z.infer<typeof ReviewApiSchema>;

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
