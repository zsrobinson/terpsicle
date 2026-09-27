// D1 access for Reviews (migrations/0008_reviews.sql). SQL lives here and
// nowhere else, and this is the only file that reads `reviews.author_id`
// (V2 §7.5): it leaves only as "is this yours" (a WHERE clause or a boolean)
// and as counts for limits. Every row read is validated, and ReviewRowSchema
// has no author column, so a row handed out can't carry one.
import { z } from "zod";
import type { PublishedReviewFact, ReviewNameFact } from "~/core/reviews";
import {
  type CourseCode,
  CourseCodeSchema,
  type DeptCode,
  type InstructorId,
  InstructorIdSchema,
  type InstructorNameRow,
  InstructorNameRowSchema,
  type InstructorNameRule,
  type InstructorRow,
  InstructorRowSchema,
  IsoDateTimeSchema,
  type PendingEdit,
  type ReasonCode,
  type ReviewGrade,
  type ReviewQueueContext,
  ReviewRatingSchema,
  type ReviewRow,
  ReviewRowSchema,
  type TermId,
} from "~/core/schema";
import { applyStopStatement } from "../auth/stops";

/** Rejected words are cleared this long after the decision (V2 §7.3). */
export const REJECTED_TEXT_DAYS = 30;
/** Deleted rows go this long after the delete (V2 §7.3). */
export const DELETED_ROW_DAYS = 30;

const DAY_MS = 86_400_000;
const iso = (d: Date) => d.toISOString();
const daysBefore = (now: Date, days: number) =>
  iso(new Date(now.getTime() - days * DAY_MS));

/** Every column but author_id. */
const COLUMN_NAMES = [
  "id",
  "instructor_id",
  "reviewed_name",
  "course",
  "term_id",
  "rating",
  "grade",
  "body",
  "text_hash",
  "status",
  "reason",
  "pending_edit",
  "report_count",
  "created_at",
  "published_at",
  "edited_at",
  "updated_at",
] as const;
const COLUMNS = COLUMN_NAMES.join(", ");

/** Statuses that count as "the one live review" per author, instructor and course. */
const LIVE = "('published', 'held', 'hidden')";

/**
 * A review may only become live again if its author has no other live
 * review of the same instructor and course (reviews_one_per_course).
 */
const notBlockedByAnother = `(status IN ${LIVE} OR NOT EXISTS (
  SELECT 1 FROM reviews other
  WHERE other.author_id = reviews.author_id AND other.instructor_id = reviews.instructor_id
    AND other.course = reviews.course AND other.status IN ${LIVE} AND other.id <> reviews.id))`;

const parseRow = (row: unknown): ReviewRow => ReviewRowSchema.parse(row);

// ---------- instructors ----------

export async function getInstructor(
  db: D1Database,
  id: InstructorId,
): Promise<InstructorRow | null> {
  const row = await db
    .prepare("SELECT * FROM instructors WHERE id = ?1")
    .bind(id)
    .first();
  return row ? InstructorRowSchema.parse(row) : null;
}

/** Adds a PlanetTerp instructor under their slug, if they're not there yet. */
export async function ensurePlanetTerpInstructor(
  db: D1Database,
  slug: string,
  name: string,
  now: Date,
): Promise<InstructorRow | null> {
  await db
    .prepare(
      `INSERT INTO instructors (id, name, planetterp_slug, created_at)
       VALUES (?1, ?2, ?1, ?3) ON CONFLICT DO NOTHING`,
    )
    .bind(slug, name, iso(now))
    .run();
  return getInstructor(db, slug);
}

export async function getInstructorName(
  db: D1Database,
  nameKey: string,
  dept: DeptCode,
): Promise<InstructorNameRow | null> {
  const row = await db
    .prepare("SELECT * FROM instructor_names WHERE name_key = ?1 AND dept = ?2")
    .bind(nameKey, dept)
    .first();
  return row ? InstructorNameRowSchema.parse(row) : null;
}

/** Records which instructor a Testudo name means. The owner's corrections stay. */
export async function setInstructorName(
  db: D1Database,
  entry: {
    nameKey: string;
    dept: DeptCode;
    instructorId: InstructorId;
    rule: InstructorNameRule;
    now: Date;
  },
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO instructor_names (name_key, dept, instructor_id, rule, updated_at)
       VALUES (?1, ?2, ?3, ?4, ?5)
       ON CONFLICT (name_key, dept) DO UPDATE SET
         instructor_id = excluded.instructor_id, rule = excluded.rule, updated_at = excluded.updated_at
       WHERE instructor_names.rule <> 'manual'`,
    )
    .bind(
      entry.nameKey,
      entry.dept,
      entry.instructorId,
      entry.rule,
      iso(entry.now),
    )
    .run();
}

/**
 * Mints an instructor for a name nobody knows yet. Two requests minting the
 * same name at once both insert an instructor, but only one name row wins;
 * the loser's instructor (with no reviews yet) is removed, and both get the
 * winner.
 */
export async function mintInstructor(
  db: D1Database,
  entry: {
    id: InstructorId;
    name: string;
    nameKey: string;
    dept: DeptCode;
    now: Date;
  },
): Promise<InstructorRow> {
  await db.batch([
    db
      .prepare(
        "INSERT INTO instructors (id, name, planetterp_slug, created_at) VALUES (?1, ?2, NULL, ?3)",
      )
      .bind(entry.id, entry.name, iso(entry.now)),
    db
      .prepare(
        `INSERT INTO instructor_names (name_key, dept, instructor_id, rule, updated_at)
         VALUES (?1, ?2, ?3, 'minted', ?4) ON CONFLICT DO NOTHING`,
      )
      .bind(entry.nameKey, entry.dept, entry.id, iso(entry.now)),
  ]);
  const winner = await getInstructorName(db, entry.nameKey, entry.dept);
  if (winner && winner.instructor_id !== entry.id) {
    await db
      .prepare("DELETE FROM instructors WHERE id = ?1")
      .bind(entry.id)
      .run();
    const found = await getInstructor(db, winner.instructor_id);
    if (found) return found;
  }
  const mine = await getInstructor(db, entry.id);
  if (!mine) throw new Error("minted instructor is missing");
  return mine;
}

// ---------- the author's own reviews ----------

/** Your review with this id, unless it's deleted. */
export async function getOwnReview(
  db: D1Database,
  authorId: string,
  reviewId: string,
): Promise<ReviewRow | null> {
  const row = await db
    .prepare(
      `SELECT ${COLUMNS} FROM reviews WHERE id = ?1 AND author_id = ?2 AND status <> 'deleted'`,
    )
    .bind(reviewId, authorId)
    .first();
  return row ? parseRow(row) : null;
}

/** Your one live review of this instructor for this course, if any. */
export async function getLiveReview(
  db: D1Database,
  authorId: string,
  instructorId: InstructorId,
  course: CourseCode,
): Promise<ReviewRow | null> {
  const row = await db
    .prepare(
      `SELECT ${COLUMNS} FROM reviews
       WHERE author_id = ?1 AND instructor_id = ?2 AND course = ?3 AND status IN ${LIVE}`,
    )
    .bind(authorId, instructorId, course)
    .first();
  return row ? parseRow(row) : null;
}

/** When each of your reviews in the last week was started (for the weekly limit). */
export async function recentCreatedAt(
  db: D1Database,
  authorId: string,
  since: Date,
): Promise<string[]> {
  const { results } = await db
    .prepare(
      "SELECT created_at FROM reviews WHERE author_id = ?1 AND created_at > ?2",
    )
    .bind(authorId, iso(since))
    .all<{ created_at: string }>();
  return results.map((r) => r.created_at);
}

/** Your reviews, newest first, with their instructors' names. Deleted ones are gone. */
export async function listOwnReviews(
  db: D1Database,
  authorId: string,
): Promise<{ review: ReviewRow; instructorName: string }[]> {
  const { results } = await db
    .prepare(
      `SELECT ${COLUMN_NAMES.map((c) => `r.${c}`).join(", ")}, i.name AS instructor_name
       FROM reviews r JOIN instructors i ON i.id = r.instructor_id
       WHERE r.author_id = ?1 AND r.status <> 'deleted'
       ORDER BY r.created_at DESC, r.id DESC`,
    )
    .bind(authorId)
    .all<Record<string, unknown>>();
  return results.map((row) => ({
    review: parseRow(row),
    instructorName: String(row.instructor_name),
  }));
}

/** Whether this person wrote this review: the one boolean that leaves the store. */
export async function isAuthor(
  db: D1Database,
  reviewId: string,
  userId: string,
): Promise<boolean> {
  const row = await db
    .prepare("SELECT 1 AS yes FROM reviews WHERE id = ?1 AND author_id = ?2")
    .bind(reviewId, userId)
    .first();
  return row !== null;
}

export interface NewReview {
  id: string;
  authorId: string;
  instructorId: InstructorId;
  reviewedName: string;
  course: CourseCode;
  termId: TermId | null;
  rating: number;
  grade: ReviewGrade | null;
  body: string;
  textHash: string;
  now: Date;
}

/**
 * Stores a new review, held while it's checked. "exists" when the author
 * already has a live review of this instructor for this course (a request
 * that raced another): the caller turns it into an edit.
 */
export async function insertReview(
  db: D1Database,
  r: NewReview,
): Promise<"ok" | "exists"> {
  const result = await db
    .prepare(
      `INSERT INTO reviews (id, author_id, instructor_id, reviewed_name, course, term_id,
         rating, grade, body, text_hash, status, created_at, updated_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, 'held', ?11, ?11)
       ON CONFLICT DO NOTHING`,
    )
    .bind(
      r.id,
      r.authorId,
      r.instructorId,
      r.reviewedName,
      r.course,
      r.termId,
      r.rating,
      r.grade,
      r.body,
      r.textHash,
      iso(r.now),
    )
    .run();
  return (result.meta.changes ?? 0) > 0 ? "ok" : "exists";
}

/** Removes a just-inserted review whose check never ran. */
export async function discardUnchecked(
  db: D1Database,
  id: string,
): Promise<void> {
  await db
    .prepare("DELETE FROM reviews WHERE id = ?1 AND status = 'held'")
    .bind(id)
    .run();
}

/** Deletes your review: its words go at once, the row after DELETED_ROW_DAYS. */
export async function deleteOwnReview(
  db: D1Database,
  authorId: string,
  reviewId: string,
  now: Date,
): Promise<boolean> {
  const result = await db
    .prepare(
      `UPDATE reviews SET status = 'deleted', body = '', text_hash = '', pending_edit = NULL,
         reason = NULL, updated_at = ?3
       WHERE id = ?1 AND author_id = ?2 AND status <> 'deleted'`,
    )
    .bind(reviewId, authorId, iso(now))
    .run();
  return (result.meta.changes ?? 0) > 0;
}

// ---------- reading without an author ----------

export async function getReview(
  db: D1Database,
  id: string,
): Promise<ReviewRow | null> {
  const row = await db
    .prepare(`SELECT ${COLUMNS} FROM reviews WHERE id = ?1`)
    .bind(id)
    .first();
  return row ? parseRow(row) : null;
}

const QueueContextRowSchema = ReviewRowSchema.pick({
  id: true,
  rating: true,
  term_id: true,
  grade: true,
  pending_edit: true,
}).extend({ instructor: z.string().min(1) });

/**
 * What the owner's queue shows about reviews besides their words (V2 §10):
 * the instructor, rating, term and grade, never the author. A waiting
 * edit's, when an edit is what was held. Reviews not found are left out.
 */
export async function reviewQueueContexts(
  db: D1Database,
  ids: readonly string[],
): Promise<Map<string, ReviewQueueContext>> {
  const out = new Map<string, ReviewQueueContext>();
  if (ids.length === 0) return out;
  const { results } = await db
    .prepare(
      `SELECT r.id, r.rating, r.term_id, r.grade, r.pending_edit, i.name AS instructor
       FROM reviews r JOIN instructors i ON i.id = r.instructor_id
       WHERE r.id IN (SELECT value FROM json_each(?1))`,
    )
    .bind(JSON.stringify([...new Set(ids)]))
    .all();
  for (const found of results) {
    const row = QueueContextRowSchema.parse(found);
    const edit =
      row.pending_edit?.state === "waiting" ? row.pending_edit : null;
    out.set(row.id, {
      instructor: row.instructor,
      rating: edit?.rating ?? row.rating,
      termId: edit ? edit.termId : row.term_id,
      grade: edit ? edit.grade : row.grade,
    });
  }
  return out;
}

// ---------- the owner's stop (V2 §7.5 rule 3) ----------

/**
 * "Stop this author writing reviews for 30 days", through the review: the
 * stop is recorded on its author and put in force (a later stop already
 * running stays). False, and nothing stored, when the review has no author
 * any more (a purged account) or doesn't exist. The author never leaves
 * this file: the insert reads `author_id` in SQL.
 */
export async function stopReviewAuthor(
  db: D1Database,
  reviewId: string,
  stop: { id: string; until: string },
  now: Date,
): Promise<boolean> {
  const [recorded] = await db.batch([
    db
      .prepare(
        `INSERT INTO author_stops (id, surface, user_id, until, created_at)
         SELECT ?1, 'review', author_id, ?3, ?4 FROM reviews
         WHERE id = ?2 AND author_id IS NOT NULL
         ON CONFLICT DO NOTHING`,
      )
      .bind(stop.id, reviewId, stop.until, iso(now)),
    applyStopStatement(db, "review", stop.id),
  ]);
  if ((recorded?.meta.changes ?? 0) > 0) return true;
  // Already recorded under this id (a retry): still in force.
  return (
    (await db
      .prepare("SELECT 1 AS found FROM author_stops WHERE id = ?1")
      .bind(stop.id)
      .first()) !== null
  );
}

/** New reviews of an instructor in the last day and the last 30 (the burst check). */
export async function instructorActivity(
  db: D1Database,
  instructorId: InstructorId,
  now: Date,
): Promise<{ lastDay: number; last30Days: number }> {
  const row = await db
    .prepare(
      `SELECT
         COUNT(*) FILTER (WHERE created_at > ?2) AS last_day,
         COUNT(*) AS last_30_days
       FROM reviews WHERE instructor_id = ?1 AND created_at > ?3`,
    )
    .bind(instructorId, daysBefore(now, 1), daysBefore(now, 30))
    .first<{ last_day: number; last_30_days: number }>();
  return { lastDay: row?.last_day ?? 0, last30Days: row?.last_30_days ?? 0 };
}

/** Whether these words are already up for this instructor (V2 §7.6, "Copies"). */
export async function hasPublishedCopy(
  db: D1Database,
  instructorId: InstructorId,
  textHash: string,
  exceptId: string | null,
): Promise<boolean> {
  const row = await db
    .prepare(
      `SELECT 1 AS yes FROM reviews
       WHERE instructor_id = ?1 AND text_hash = ?2 AND status = 'published' AND id IS NOT ?3`,
    )
    .bind(instructorId, textHash, exceptId)
    .first();
  return row !== null;
}

/**
 * One page of an instructor's published reviews, newest first. The cursor
 * is the previous page's last review id (never a timestamp: `published_at`
 * would undo the month rounding readers see).
 */
export async function listPublished(
  db: D1Database,
  query: {
    instructorId: InstructorId;
    course: CourseCode | null;
    cursor: string | null;
    limit: number;
  },
): Promise<ReviewRow[]> {
  const { results } = await db
    .prepare(
      `SELECT ${COLUMNS} FROM reviews
       WHERE instructor_id = ?1 AND status = 'published'
         AND (?2 IS NULL OR course = ?2)
         AND (?3 IS NULL OR (published_at, id) < (
           SELECT published_at, id FROM reviews WHERE id = ?3))
       ORDER BY published_at DESC, id DESC
       LIMIT ?4`,
    )
    .bind(query.instructorId, query.course, query.cursor, query.limit)
    .all();
  return results.map(parseRow);
}

const NumbersRowSchema = z.object({
  id: InstructorIdSchema,
  rating: z.number().min(1).max(5),
  count: z.number().int().min(1),
});

/** Published reviews summed per instructor (every course). */
export async function publishedNumbersByInstructor(
  db: D1Database,
  ids: readonly InstructorId[],
): Promise<{ id: InstructorId; rating: number; count: number }[]> {
  if (ids.length === 0) return [];
  const { results } = await db
    .prepare(
      `SELECT instructor_id AS id, AVG(rating) AS rating, COUNT(*) AS count
       FROM reviews
       WHERE status = 'published'
         AND instructor_id IN (SELECT value FROM json_each(?1))
       GROUP BY instructor_id`,
    )
    .bind(JSON.stringify(ids))
    .all();
  return z.array(NumbersRowSchema).parse(results);
}

/** Published reviews of a course summed (every instructor); null with none. */
export async function publishedNumbersForCourse(
  db: D1Database,
  course: CourseCode,
): Promise<{ rating: number; count: number } | null> {
  const row = await db
    .prepare(
      `SELECT AVG(rating) AS rating, COUNT(*) AS count
       FROM reviews WHERE course = ?1 AND status = 'published'`,
    )
    .bind(course)
    .first<{ rating: number | null; count: number }>();
  return row && row.count > 0 && row.rating !== null
    ? { rating: row.rating, count: row.count }
    : null;
}

/**
 * The registry's name for an instructor and the departments we know them
 * in: from Testudo names joined here and from their published reviews.
 */
export async function instructorWithDepts(
  db: D1Database,
  id: InstructorId,
): Promise<{ name: string; depts: DeptCode[] } | null> {
  const instructor = await getInstructor(db, id);
  if (!instructor) return null;
  const { results } = await db
    .prepare(
      `SELECT dept FROM instructor_names WHERE instructor_id = ?1
       UNION
       SELECT DISTINCT substr(course, 1, 4) FROM reviews
       WHERE instructor_id = ?1 AND status = 'published'
       ORDER BY 1`,
    )
    .bind(id)
    .all<{ dept: DeptCode }>();
  return { name: instructor.name, depts: results.map((r) => r.dept) };
}

/**
 * (course, instructor) pairs with a published review, newest publication
 * first, with how many reviews each has and its newest review's created_at.
 * Callers order what they show by month, never by this order (V2 §7.5).
 */
export async function reviewedPairs(
  db: D1Database,
  limit: number,
): Promise<
  {
    course: CourseCode;
    instructor_id: InstructorId;
    name: string;
    count: number;
    created_at: string;
  }[]
> {
  const { results } = await db
    .prepare(
      `SELECT r.course, r.instructor_id, i.name, COUNT(*) AS count,
         MAX(r.created_at) AS created_at
       FROM reviews r JOIN instructors i ON i.id = r.instructor_id
       WHERE r.status = 'published'
       GROUP BY r.course, r.instructor_id
       ORDER BY MAX(r.published_at) DESC
       LIMIT ?1`,
    )
    .bind(limit)
    .all();
  return z.array(ReviewedPairRowSchema).parse(results);
}

const ReviewedPairRowSchema = z.object({
  course: CourseCodeSchema,
  instructor_id: InstructorIdSchema,
  name: z.string().min(1),
  count: z.number().int().min(1),
  created_at: z.string(),
});

/** Instructors we minted ids for who have a published review (the sitemap). */
export async function mintedWithReviews(
  db: D1Database,
): Promise<InstructorId[]> {
  const { results } = await db
    .prepare(
      `SELECT DISTINCT instructor_id AS id FROM reviews
       WHERE status = 'published' AND instructor_id LIKE 't~%'
       ORDER BY 1`,
    )
    .all<{ id: InstructorId }>();
  return results.map((r) => r.id);
}

// ---------- changes of state ----------

export interface ReviewFields {
  termId: TermId | null;
  rating: number;
  grade: ReviewGrade | null;
  body: string;
  textHash: string;
}

/** Rewrites a review nobody has seen yet (held); it's checked again. */
export async function rewriteHeld(
  db: D1Database,
  id: string,
  f: ReviewFields,
  now: Date,
): Promise<void> {
  await db
    .prepare(
      `UPDATE reviews SET term_id = ?2, rating = ?3, grade = ?4, body = ?5, text_hash = ?6,
         status = 'held', reason = NULL, updated_at = ?7
       WHERE id = ?1`,
    )
    .bind(id, f.termId, f.rating, f.grade, f.body, f.textHash, iso(now))
    .run();
}

export async function setPendingEdit(
  db: D1Database,
  id: string,
  pending: PendingEdit | null,
  now: Date,
): Promise<void> {
  await db
    .prepare(
      "UPDATE reviews SET pending_edit = ?2, updated_at = ?3 WHERE id = ?1",
    )
    .bind(id, pending ? JSON.stringify(pending) : null, iso(now))
    .run();
}

/**
 * Publishes a review, with its waiting edit applied if it has one. A review
 * coming back from `rejected` only does if its author hasn't written
 * another live one for the same course since (one live review each).
 */
export async function publish(
  db: D1Database,
  review: ReviewRow,
  now: Date,
): Promise<void> {
  const edit =
    review.pending_edit?.state === "waiting" ? review.pending_edit : null;
  await db
    .prepare(
      `UPDATE reviews SET status = 'published', reason = NULL, pending_edit = NULL,
         published_at = COALESCE(published_at, ?2), updated_at = ?2,
         term_id = ?3, rating = ?4, grade = ?5, body = ?6, text_hash = ?7,
         edited_at = CASE WHEN ?8 THEN ?2 ELSE edited_at END
       WHERE id = ?1 AND status <> 'deleted' AND ${notBlockedByAnother}`,
    )
    .bind(
      review.id,
      iso(now),
      edit ? edit.termId : review.term_id,
      edit ? edit.rating : review.rating,
      edit ? edit.grade : review.grade,
      edit ? edit.body : review.body,
      edit ? edit.textHash : review.text_hash,
      // Only an edit of words readers already saw makes it "edited".
      edit !== null && review.published_at !== null ? 1 : 0,
    )
    .run();
}

/** Takes a review down (or keeps it down) until a person decides. */
export async function setWaiting(
  db: D1Database,
  id: string,
  status: "held" | "hidden",
  reason: ReasonCode | null,
  now: Date,
): Promise<boolean> {
  const result = await db
    .prepare(
      `UPDATE reviews SET status = ?2, reason = COALESCE(?3, reason), updated_at = ?4
       WHERE id = ?1 AND status <> 'deleted' AND ${notBlockedByAnother}`,
    )
    .bind(id, status, reason, iso(now))
    .run();
  return (result.meta.changes ?? 0) > 0;
}

/** Readers' reports took a published review down (V2 §9.3). */
export async function hidePublished(
  db: D1Database,
  id: string,
  now: Date,
): Promise<boolean> {
  const result = await db
    .prepare(
      "UPDATE reviews SET status = 'hidden', updated_at = ?2 WHERE id = ?1 AND status = 'published'",
    )
    .bind(id, iso(now))
    .run();
  return (result.meta.changes ?? 0) > 0;
}

/** Moderation removed the review; any waiting edit goes with it. */
export async function reject(
  db: D1Database,
  id: string,
  reason: ReasonCode,
  now: Date,
): Promise<void> {
  await db
    .prepare(
      `UPDATE reviews SET status = 'rejected', reason = ?2, pending_edit = NULL, updated_at = ?3
       WHERE id = ?1 AND status <> 'deleted'`,
    )
    .bind(id, reason, iso(now))
    .run();
}

export async function countReport(
  db: D1Database,
  id: string,
  now: Date,
): Promise<void> {
  await db
    .prepare(
      "UPDATE reviews SET report_count = report_count + 1, updated_at = ?2 WHERE id = ?1",
    )
    .bind(id, iso(now))
    .run();
}

// ---------- housekeeping (the daily job) ----------

/**
 * Clears rejected reviews' words 30 days after the decision, and removes
 * deleted reviews (and their reports) 30 days after the delete (V2 §7.3).
 */
export async function pruneReviews(
  db: D1Database,
  now: Date,
): Promise<{ blanked: number; removed: number }> {
  const [blanked, , removed] = await db.batch([
    db
      .prepare(
        `UPDATE reviews SET body = '', pending_edit = NULL
         WHERE status = 'rejected' AND updated_at < ?1 AND (body <> '' OR pending_edit IS NOT NULL)`,
      )
      .bind(daysBefore(now, REJECTED_TEXT_DAYS)),
    db
      .prepare(
        `DELETE FROM reports WHERE surface = 'review' AND ref IN (
           SELECT id FROM reviews WHERE status = 'deleted' AND updated_at < ?1)`,
      )
      .bind(daysBefore(now, DELETED_ROW_DAYS)),
    db
      .prepare(
        "DELETE FROM reviews WHERE status = 'deleted' AND updated_at < ?1",
      )
      .bind(daysBefore(now, DELETED_ROW_DAYS)),
  ]);
  return {
    blanked: blanked?.meta.changes ?? 0,
    removed: removed?.meta.changes ?? 0,
  };
}

/**
 * Account deletion (V2 §4.7): the person's reviews stay as they are, with
 * no author. Nothing else links a review to anyone. A statement for the
 * purge's batch, since this file is the only one that names `author_id`;
 * `onlyIf` is the purge's condition on `?1` (the user) and `?2` (`at`).
 */
export function forgetAuthorStatement(
  db: D1Database,
  userId: string,
  guard: { onlyIf: string; at: string },
): D1PreparedStatement {
  return db
    .prepare(
      `UPDATE reviews SET author_id = NULL WHERE author_id = ?1 AND ${guard.onlyIf}`,
    )
    .bind(userId, guard.at);
}

// ---------- published numbers (the reviews-publish job) and summaries ----------

const PublishedFactRowSchema = z.object({
  instructor_id: InstructorIdSchema,
  course: CourseCodeSchema,
  rating: ReviewRatingSchema,
  published_at: IsoDateTimeSchema,
});

/**
 * Every published review's instructor, course, rating and publish time: all
 * the hourly job needs for R2's numbers (V2 §7.6). No words, no author.
 */
export async function publishedReviewFacts(
  db: D1Database,
): Promise<PublishedReviewFact[]> {
  const { results } = await db
    .prepare(
      `SELECT instructor_id, course, rating, published_at FROM reviews
       WHERE status = 'published' AND published_at IS NOT NULL`,
    )
    .all();
  return results.map((row) => {
    const r = PublishedFactRowSchema.parse(row);
    return {
      instructorId: r.instructor_id,
      course: r.course,
      rating: r.rating,
      publishedAt: r.published_at,
    };
  });
}

/** The name rows R2 may carry: the owner's fixes and minted instructors'. */
export async function publishableNameFacts(
  db: D1Database,
): Promise<ReviewNameFact[]> {
  const { results } = await db
    .prepare(
      "SELECT * FROM instructor_names WHERE rule IN ('minted', 'manual')",
    )
    .all();
  return results.map((row) => {
    const r = InstructorNameRowSchema.parse(row);
    return {
      nameKey: r.name_key,
      dept: r.dept,
      instructorId: r.instructor_id,
      rule: r.rule,
    };
  });
}

const SummarySourceRowSchema = z.object({
  course: CourseCodeSchema,
  body: z.string(),
  rating: ReviewRatingSchema,
  created_at: IsoDateTimeSchema,
});

/** An instructor's published reviews for their summary, newest first. */
export async function publishedForSummary(
  db: D1Database,
  instructorId: InstructorId,
  limit: number,
): Promise<
  { course: string; body: string; rating: number; createdAt: string }[]
> {
  const { results } = await db
    .prepare(
      `SELECT course, body, rating, created_at FROM reviews
       WHERE instructor_id = ?1 AND status = 'published'
       ORDER BY published_at DESC, id DESC LIMIT ?2`,
    )
    .bind(instructorId, limit)
    .all();
  return results.map((row) => {
    const r = SummarySourceRowSchema.parse(row);
    return {
      course: r.course,
      body: r.body,
      rating: r.rating,
      createdAt: r.created_at,
    };
  });
}

/** How many published reviews an instructor has, and when the newest went up. */
export async function publishedStats(
  db: D1Database,
  instructorId: InstructorId,
): Promise<{ count: number; latestPublishedAt: string | null }> {
  const row = await db
    .prepare(
      `SELECT COUNT(*) AS count, MAX(published_at) AS latest FROM reviews
       WHERE instructor_id = ?1 AND status = 'published'`,
    )
    .bind(instructorId)
    .first<{ count: number; latest: string | null }>();
  return { count: row?.count ?? 0, latestPublishedAt: row?.latest ?? null };
}
