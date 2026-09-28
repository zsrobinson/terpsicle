// Puts the mock bucket (src/fixtures/mock/data-source.ts) into local R2, so
// the Worker in `pnpm dev:mock` reads the same catalog the app does: Chat's
// CourseChat objects derive their rooms from it (V2.md §8.1). The app itself
// reads the fixtures from memory in mock mode. Also puts the mock PlanetTerp
// reviews into local D1's `planetterp_reviews`, as the nightly job would
// (V2.md §7.7), so Reviews' pages show some. Run by `pnpm dev:mock`, after
// the local D1 migrations; wrangler's default local state, which the Vite
// plugin uses too.
import { getPlatformProxy } from "wrangler";
import { buildMockDataFiles, mockPlanetTerpReviews } from "~/fixtures";
import { planetTerpReviewRecords } from "~/ingest/planetterp/reviews";
import { isMain } from "./lib/source-files";

/** The bit of D1 this needs (Worker types aren't in the scripts' program). */
interface Statement {
  bind(...values: unknown[]): Statement;
}
interface LocalD1 {
  prepare(sql: string): Statement;
  batch(statements: Statement[]): Promise<unknown>;
}

/** When the mock reviews were "stored": the fixtures' clock. */
const SEEDED_AT = "2026-09-26T05:17:00.000Z";

/** Replaces each mock instructor's reviews, as src/jobs/planetterp-reviews.ts does. */
async function seedPlanetTerpReviews(db: LocalD1): Promise<void> {
  for (const p of mockPlanetTerpReviews) {
    const { records, hash } = await planetTerpReviewRecords(p.slug, p.reviews);
    await db.batch([
      db
        .prepare("DELETE FROM planetterp_reviews WHERE instructor_id = ?1")
        .bind(p.slug),
      ...records.map((r) =>
        db
          .prepare(
            `INSERT OR IGNORE INTO planetterp_reviews
               (id, instructor_id, course, rating, expected_grade, body, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)`,
          )
          .bind(
            r.id,
            p.slug,
            r.course,
            r.rating,
            r.expectedGrade,
            r.body,
            r.created,
          ),
      ),
      db
        .prepare(
          `INSERT OR REPLACE INTO planetterp_review_sets
             (instructor_id, hash, count, updated_at) VALUES (?1, ?2, ?3, ?4)`,
        )
        .bind(p.slug, hash, records.length, SEEDED_AT),
    ]);
  }
}

export async function seedMockData(): Promise<number> {
  const files = await buildMockDataFiles();
  const proxy = await getPlatformProxy<{
    DATA: { put(key: string, value: Uint8Array): Promise<unknown> };
    DB: LocalD1;
  }>({
    configPath: "wrangler.jsonc",
    persist: true,
    // Offline: Workers AI is a remote binding, and nothing here needs it.
    remoteBindings: false,
  });
  try {
    await Promise.all(
      [...files].map(([key, bytes]) => proxy.env.DATA.put(key, bytes)),
    );
    await seedPlanetTerpReviews(proxy.env.DB);
  } finally {
    await proxy.dispose();
  }
  return files.size;
}

if (isMain(import.meta.url)) {
  const count = await seedMockData();
  console.log(
    `seed-mock-data: ${count} files in local R2, ${mockPlanetTerpReviews.length} instructors' PlanetTerp reviews in local D1`,
  );
}
