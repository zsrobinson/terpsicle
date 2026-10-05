import { InstructorSlugSchema } from "~/core/schema";
import {
  planetTerpReviewRecords,
  type ReviewKeeper,
} from "~/ingest/planetterp/reviews";
import {
  planetTerpReviewSets,
  replacePlanetTerpReviews,
} from "~/server/reviews/planetterp";

// PlanetTerp's reviews into D1 for Reviews' pages (V2 §7.6; owner,
// 2026-09-28: "let's actually display reviews from planetterp … should
// update still with new ones from there"). The nightly job already pages
// through PlanetTerp's professor list with every review attached, gently
// (3 at a time, PlanetTerp's pace), so keeping them current costs PlanetTerp
// nothing more. Here each instructor's reviews are hashed and compared with
// what's stored, and only the ones that changed are rewritten.

/**
 * Instructors rewritten per night. About 5,100 have reviews (48k in all),
 * so the first nights fill the table a share at a time and later nights
 * write only what changed.
 */
export const MAX_REVIEW_SETS = 1500;

/** Statements per D1 batch: an instructor's never split across two. */
const BATCH_STATEMENTS = 100;

export async function createPlanetTerpReviewSink(
  db: D1Database,
  now: Date,
  /**
   * Each course's newest this many, while our Reviews pages are off: all
   * Schedule's preview shows (docs/decisions.md, "Reviews link out to
   * PlanetTerp"). Omitted keeps every review, for our pages.
   */
  perCourse?: number,
): Promise<ReviewKeeper> {
  const stored = await planetTerpReviewSets(db);
  let queue: D1PreparedStatement[] = [];
  let written = 0;
  let kept = 0;
  const flush = async () => {
    if (queue.length === 0) return;
    const batch = queue;
    queue = [];
    await db.batch(batch);
  };
  return {
    async keep(professors) {
      for (const p of professors) {
        if (!InstructorSlugSchema.safeParse(p.slug).success) continue;
        const previous = stored.get(p.slug);
        const { records, hash } = await planetTerpReviewRecords(
          p.slug,
          p.reviews,
          perCourse,
        );
        // An empty list where there were reviews is PlanetTerp leaving
        // `reviews` out, not every review deleted: keep what's shown. A
        // shorter list is kept as it is (PlanetTerp took some down).
        if (records.length === 0) {
          if (previous) kept++;
          continue;
        }
        if (previous?.hash === hash || written >= MAX_REVIEW_SETS) continue;
        const statements = replacePlanetTerpReviews(
          db,
          p.slug,
          records,
          hash,
          now,
        );
        if (queue.length + statements.length > BATCH_STATEMENTS) await flush();
        queue.push(...statements);
        stored.set(p.slug, { hash, count: records.length });
        written++;
      }
      await flush();
    },
    async finish() {
      await flush();
      return { written, kept };
    },
  };
}
