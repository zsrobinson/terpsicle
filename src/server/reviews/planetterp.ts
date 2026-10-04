// PlanetTerp's reviews in D1 (migrations/0020_reviews_public.sql, V2 §7.6):
// written by the nightly PlanetTerp job, an instructor at a time, and read
// by Reviews' pages, newest first. Nothing here has an author: PlanetTerp
// publishes none.
import { createdMonth } from "~/core/reviews";
import {
  type CourseCode,
  CourseCodeSchema,
  type InstructorId,
  type PlanetTerpCursor,
  type PlanetTerpReview,
  type PlanetTerpReviewRow,
  PlanetTerpReviewRowSchema,
  ReviewGradeSchema,
  type ReviewSort,
} from "~/core/schema";
import type { PlanetTerpReviewRecord } from "~/ingest/planetterp/reviews";

// ---------- reading ----------

export interface PlanetTerpQuery {
  instructorId: InstructorId | null;
  course: CourseCode | null;
  cursor: PlanetTerpCursor | null;
  /** Absent: `latest`. */
  sort?: ReviewSort;
  limit: number;
}

/**
 * Each order's SQL: the ORDER BY and "after the cursor" (?3 rating, ?4
 * created_at, ?5 id). A rating order breaks ties newest first, as
 * `compareReviews` (~/core/reviews) does for ours.
 */
const ORDERS: Record<ReviewSort, { order: string; after: string }> = {
  latest: {
    order: "created_at DESC, id DESC",
    after: "(created_at, id) < (?4, ?5)",
  },
  oldest: {
    order: "created_at ASC, id ASC",
    after: "(created_at, id) > (?4, ?5)",
  },
  highest: {
    order: "rating DESC, created_at DESC, id DESC",
    after: "(rating < ?3 OR (rating = ?3 AND (created_at, id) < (?4, ?5)))",
  },
  lowest: {
    order: "rating ASC, created_at DESC, id DESC",
    after: "(rating > ?3 OR (rating = ?3 AND (created_at, id) < (?4, ?5)))",
  },
};

/** `[rating|]created|id`: where a page ends, in its order. */
function cursorOf(sort: ReviewSort, row: PlanetTerpReviewRow): string {
  const at = `${row.created_at}|${row.id}`;
  return sort === "highest" || sort === "lowest" ? `${row.rating}|${at}` : at;
}

function readCursor(
  cursor: PlanetTerpCursor | null,
): [number | null, string | null, string | null] {
  if (!cursor) return [null, null, null];
  const parts = cursor.split("|");
  const [created, id] = parts.slice(-2);
  const rating = parts.length === 3 ? Number(parts[0]) : null;
  return [rating, created ?? null, id ?? null];
}

function toShown(row: PlanetTerpReviewRow): PlanetTerpReview {
  const course = CourseCodeSchema.safeParse(row.course);
  const grade = ReviewGradeSchema.safeParse(row.expected_grade);
  return {
    id: row.id,
    instructorId: row.instructor_id,
    course: course.success ? course.data : null,
    rating: row.rating,
    expectedGrade: grade.success ? grade.data : null,
    body: row.body,
    createdMonth: createdMonth(row.created_at),
    // PlanetTerp's own day: public there, and nothing of ours.
    createdDate: row.created_at.slice(0, 10),
  };
}

/** A page of PlanetTerp's reviews in `query.sort`'s order, and where the next starts. */
export async function planetTerpReviews(
  db: D1Database,
  query: PlanetTerpQuery,
): Promise<{ reviews: PlanetTerpReview[]; next: PlanetTerpCursor | null }> {
  const sort = query.sort ?? "latest";
  const [rating, created, id] = readCursor(query.cursor);
  // A cursor from another order (no rating where one's needed) starts over.
  const from =
    created !== null &&
    (rating !== null || sort === "latest" || sort === "oldest");
  const { order, after } = ORDERS[sort];
  // One extra row says whether there's another page.
  const { results } = await db
    .prepare(
      `SELECT id, instructor_id, course, rating, expected_grade, body, created_at
       FROM planetterp_reviews
       WHERE (?1 IS NULL OR instructor_id = ?1)
         AND (?2 IS NULL OR course = ?2)
         AND (?6 = 0 OR ${after})
       ORDER BY ${order}
       LIMIT ?7`,
    )
    .bind(
      query.instructorId,
      query.course,
      rating,
      created,
      id,
      from ? 1 : 0,
      query.limit + 1,
    )
    .all();
  const rows = results.map((r) => PlanetTerpReviewRowSchema.parse(r));
  const page = rows.slice(0, query.limit);
  const last = page.at(-1);
  return {
    reviews: page.map(toShown),
    next: rows.length > query.limit && last ? cursorOf(sort, last) : null,
  };
}

/** The average and count of PlanetTerp's reviews of a course; null when there are none. */
export async function planetTerpCourseNumbers(
  db: D1Database,
  course: CourseCode,
): Promise<{ rating: number; reviewCount: number } | null> {
  const row = await db
    .prepare(
      `SELECT AVG(rating) AS rating, COUNT(*) AS count
       FROM planetterp_reviews WHERE course = ?1`,
    )
    .bind(course)
    .first<{ rating: number | null; count: number }>();
  return row && row.count > 0 && row.rating !== null
    ? { rating: row.rating, reviewCount: row.count }
    : null;
}

/** How many PlanetTerp reviews one instructor has in one course. */
export async function planetTerpReviewCount(
  db: D1Database,
  instructorId: InstructorId,
  course: CourseCode,
): Promise<number> {
  const row = await db
    .prepare(
      `SELECT COUNT(*) AS count FROM planetterp_reviews
       WHERE instructor_id = ?1 AND course = ?2`,
    )
    .bind(instructorId, course)
    .first<{ count: number }>();
  return row?.count ?? 0;
}

/**
 * The month of each page's newest PlanetTerp review, for the sitemap:
 * instructors by id, courses by code.
 */
export async function latestPlanetTerpByPage(db: D1Database): Promise<{
  instructors: Map<InstructorId, string>;
  courses: Map<string, string>;
}> {
  const [byInstructor, byCourse] = await db.batch<{
    key: string;
    latest: string;
  }>([
    db.prepare(
      `SELECT instructor_id AS key, MAX(created_at) AS latest
       FROM planetterp_reviews GROUP BY instructor_id`,
    ),
    db.prepare(
      `SELECT course AS key, MAX(created_at) AS latest
       FROM planetterp_reviews WHERE course IS NOT NULL GROUP BY course`,
    ),
  ]);
  return {
    instructors: new Map(
      (byInstructor?.results ?? []).map((r) => [r.key, r.latest]),
    ),
    courses: new Map((byCourse?.results ?? []).map((r) => [r.key, r.latest])),
  };
}

// ---------- writing (the nightly job) ----------

/** Each instructor's stored hash and count. */
export async function planetTerpReviewSets(
  db: D1Database,
): Promise<Map<InstructorId, { hash: string; count: number }>> {
  const { results } = await db
    .prepare("SELECT instructor_id, hash, count FROM planetterp_review_sets")
    .all<{ instructor_id: string; hash: string; count: number }>();
  return new Map(
    results.map((r) => [r.instructor_id, { hash: r.hash, count: r.count }]),
  );
}

/** D1 binds at most 100 parameters a statement: 7 columns × 14 rows. */
const ROWS_PER_INSERT = 14;

/**
 * The statements that replace an instructor's reviews with `records`, and
 * record the set's hash. Run them in one batch, which D1 runs as one
 * transaction: a page never sees an instructor half-replaced.
 */
export function replacePlanetTerpReviews(
  db: D1Database,
  instructorId: InstructorId,
  records: readonly PlanetTerpReviewRecord[],
  hash: string,
  now: Date,
): D1PreparedStatement[] {
  const statements = [
    db
      .prepare("DELETE FROM planetterp_reviews WHERE instructor_id = ?1")
      .bind(instructorId),
  ];
  for (let i = 0; i < records.length; i += ROWS_PER_INSERT) {
    const chunk = records.slice(i, i + ROWS_PER_INSERT);
    statements.push(
      db
        .prepare(
          `INSERT OR IGNORE INTO planetterp_reviews
             (id, instructor_id, course, rating, expected_grade, body, created_at)
           VALUES ${chunk.map(() => "(?, ?, ?, ?, ?, ?, ?)").join(", ")}`,
        )
        .bind(
          ...chunk.flatMap((r) => [
            r.id,
            instructorId,
            r.course,
            r.rating,
            r.expectedGrade,
            r.body,
            r.created,
          ]),
        ),
    );
  }
  statements.push(
    db
      .prepare(
        `INSERT INTO planetterp_review_sets (instructor_id, hash, count, updated_at)
         VALUES (?1, ?2, ?3, ?4)
         ON CONFLICT (instructor_id) DO UPDATE SET
           hash = excluded.hash, count = excluded.count, updated_at = excluded.updated_at`,
      )
      .bind(instructorId, hash, records.length, now.toISOString()),
  );
  return statements;
}
