// An instructor's PlanetTerp reviews, fetched live when the nightly job
// hasn't stored them yet. The job writes a share of PlanetTerp's ~5,000
// reviewed instructors a night (src/jobs/planetterp-reviews.ts), so until it
// has been through them all (and always on a preview, where crons don't
// run) an instructor's page could say "No reviews yet" beside PlanetTerp's
// 441 (Magdalene Ngeve, 2026-09-29). The page knows their PlanetTerp name;
// the first visit fetches their reviews from PlanetTerp, as the job would,
// and stores them the same way, so every later visit reads D1.
import { z } from "zod";
import type { InstructorId } from "~/core/schema";
import {
  planetTerpReviewRecords,
  ReviewApiSchema,
} from "~/ingest/planetterp/reviews";
import { replacePlanetTerpReviews } from "./planetterp";

const PLANETTERP = "https://planetterp.com/api/v1";
const USER_AGENT = "Terpsicle/2 (+https://terpsicle.com)";
const FETCH_TIMEOUT_MS = 4_000;

/** PlanetTerp's `professor?reviews=true` answer, what we read of it. */
const ProfessorSchema = z.object({
  slug: z.string(),
  reviews: z.array(ReviewApiSchema).catch([]),
});

/**
 * Stores PlanetTerp's reviews of `instructorId` when none are stored yet.
 * True when it stored some; false when there was nothing to do (they're
 * stored already, PlanetTerp doesn't know the name, the name is someone
 * else's, or they have none). Throws on network or D1 errors.
 */
export async function fillPlanetTerpReviews(
  db: D1Database,
  fetcher: typeof fetch,
  instructorId: InstructorId,
  planetTerpName: string,
  now: Date,
): Promise<boolean> {
  const stored = await db
    .prepare("SELECT 1 FROM planetterp_review_sets WHERE instructor_id = ?1")
    .bind(instructorId)
    .first();
  if (stored) return false;
  const response = await fetcher(
    `${PLANETTERP}/professor?name=${encodeURIComponent(planetTerpName)}&reviews=true`,
    {
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
      // A page waits on this: past a few seconds, it shows what's stored.
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    },
  );
  if (response.status === 400 || response.status === 404) return false;
  if (!response.ok) throw new Error(`PlanetTerp answered ${response.status}`);
  const professor = ProfessorSchema.safeParse(await response.json());
  // Only the instructor the page is about: a name can be another's slug.
  if (!professor.success || professor.data.slug !== instructorId) return false;
  const { records, hash } = await planetTerpReviewRecords(
    instructorId,
    professor.data.reviews,
  );
  if (records.length === 0) return false;
  // One batch, one transaction: a page never sees them half-stored. The
  // job's next run finds the same hash and leaves them be.
  await db.batch(
    replacePlanetTerpReviews(db, instructorId, records, hash, now),
  );
  return true;
}
