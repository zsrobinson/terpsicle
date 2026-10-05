import { z } from "zod";
import { type ReasonCode, ReasonCodeSchema } from "./moderation";
import { PlanetTerpTotalsSchema } from "./planetterp";
import {
  CourseCodeSchema,
  DeptCodeSchema,
  InstructorNameSchema,
  InstructorSlugSchema,
  IsoDateSchema,
  IsoDateTimeSchema,
  ReviewGradeSchema,
  TermIdSchema,
} from "./primitives";

// Terpsicle Reviews: the reviews/* API, and the D1 rows behind it
// (migrations/0008_reviews.sql, docs/V2.md §7). Reviews are anonymous to
// readers: nothing here that a reader, the admin or moderation receives has
// an author field (§7.5). Only src/server/reviews/store.ts reads author_id.

/**
 * An instructor we mint when PlanetTerp doesn't know the name: `t~` and 10
 * base32 characters (V2 §7.2). `InstructorSlugSchema` accepts these too, so
 * links key on either kind.
 */
export const MintedInstructorIdSchema = z
  .string()
  .regex(
    /^t~[a-z2-7]{10}$/,
    "Expected a minted instructor id like t~abcde23456",
  );

/** A review's instructor: a PlanetTerp slug, or a minted `t~` id. */
export const InstructorIdSchema = InstructorSlugSchema;
export type InstructorId = z.infer<typeof InstructorIdSchema>;

/**
 * 16 random bytes, base64url without padding. Also the review's moderation
 * `targetId` (a subset of ModerationTargetIdSchema).
 */
export const ReviewIdSchema = z
  .string()
  .regex(/^[A-Za-z0-9_-]{22}$/, "Expected a 22-char review id");
export type ReviewId = z.infer<typeof ReviewIdSchema>;

/**
 * A rating: 1 to 5 in half stars (owner, 2026-09-29: "users should be able
 * to rate professors by increments of half stars"). PlanetTerp's are whole.
 * D1's `rating INTEGER` column keeps 4.5 as a REAL (SQLite's type affinity
 * only converts a value that fits losslessly), and its CHECK is a range, so
 * halves need no migration; `store.test.ts` checks the round trip.
 */
export const ReviewRatingSchema = z.number().min(1).max(5).multipleOf(0.5);

/**
 * How a page's reviews are ordered (owner, 2026-09-29: "sortable, both by
 * rating highest/lowest and latest/oldest"). `latest` is the default; ties
 * in rating go newest first.
 */
export const REVIEW_SORTS = ["latest", "oldest", "highest", "lowest"] as const;
export const ReviewSortSchema = z.enum(REVIEW_SORTS);
export type ReviewSort = z.infer<typeof ReviewSortSchema>;

/**
 * The body as sent. The 40–2,000 character rule is stage 0's (`precheck`),
 * so a short or long review gets its specific words back instead of a bare
 * "invalid input"; this only caps what the Worker will read.
 */
export const ReviewBodyInputSchema = z.string().max(4_000);

export const ReviewStatusSchema = z.enum([
  "published",
  /** Waiting for a person (or an automatic retry); not shown. */
  "held",
  /** Removed by moderation. The author sees why; readers see nothing. */
  "rejected",
  /** Taken down by readers' reports until a person decides (V2 §9.3). */
  "hidden",
  "deleted",
]);
export type ReviewStatus = z.infer<typeof ReviewStatusSchema>;

/**
 * A reason the author reads for a held or rejected review, or an edit: the
 * moderation reason code that decided it (docs/MODERATION.md §3–5).
 */
export const ReviewReasonSchema = ReasonCodeSchema;

// ---------- POST /api/reviews/* ----------

const reviewFields = {
  termId: TermIdSchema.nullable(),
  rating: ReviewRatingSchema,
  grade: ReviewGradeSchema.nullable(),
  body: ReviewBodyInputSchema,
};

export const ReviewSubmitInputSchema = z.strictObject({
  /** The id the page knows (PlanetTerp's slug, or a minted one), if any. */
  instructorId: InstructorIdSchema.nullable(),
  /** The instructor's name as Testudo prints it on the page. */
  reviewedName: InstructorNameSchema,
  /** The department whose PlanetTerp names map knows this Testudo name. */
  dept: DeptCodeSchema,
  course: CourseCodeSchema,
  ...reviewFields,
});
export type ReviewSubmitInput = z.infer<typeof ReviewSubmitInputSchema>;

export const ReviewEditInputSchema = z.strictObject({
  reviewId: ReviewIdSchema,
  ...reviewFields,
});
export type ReviewEditInput = z.infer<typeof ReviewEditInputSchema>;

export const ReviewDeleteInputSchema = z.strictObject({
  reviewId: ReviewIdSchema,
});
export type ReviewDeleteInput = z.infer<typeof ReviewDeleteInputSchema>;

/** Reviews per page of reviews/list. */
export const REVIEWS_PAGE_MAX = 20;

export const ReviewListInputSchema = z.strictObject({
  instructorId: InstructorIdSchema,
  /** Only this course's reviews; null for every course. */
  course: CourseCodeSchema.nullable(),
  /** The last review id of the previous page (`next`); null for the first. */
  cursor: ReviewIdSchema.nullable(),
  limit: z
    .number()
    .int()
    .min(1)
    .max(REVIEWS_PAGE_MAX)
    .default(REVIEWS_PAGE_MAX),
});
export type ReviewListInput = z.infer<typeof ReviewListInputSchema>;

export const ReviewsMineInputSchema = z.strictObject({});

/**
 * A review as readers see it (V2 §7.5): no author field, no user-derived id,
 * and the date rounded to the month to blunt timing guesses. Strict, so a
 * stray field fails validation instead of reaching a reader.
 */
export const PublicReviewSchema = z.strictObject({
  id: ReviewIdSchema,
  course: CourseCodeSchema,
  termId: TermIdSchema.nullable(),
  rating: ReviewRatingSchema,
  grade: ReviewGradeSchema.nullable(),
  body: z.string(),
  /** YYYY-MM, America/New_York. */
  createdMonth: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
  edited: z.boolean(),
});
export type PublicReview = z.infer<typeof PublicReviewSchema>;

export const ReviewListResultSchema = z.strictObject({
  reviews: z.array(PublicReviewSchema),
  /** Pass as `cursor` for the next page; null on the last page. */
  next: ReviewIdSchema.nullable(),
});
export type ReviewListResult = z.infer<typeof ReviewListResultSchema>;

/** A stage-0 problem the author fixes before anything is stored (V2 §7.4). */
export const ReviewProblemCodeSchema = z.union([
  ReasonCodeSchema,
  /** The same words as a review of this instructor that's already up (V2 §7.6). */
  z.literal("duplicate"),
]);
export type ReviewProblemCode = ReasonCode | "duplicate";

export const ReviewProblemSchema = z.strictObject({
  code: ReviewProblemCodeSchema,
  /** Where in the body (UTF-16 offsets, end exclusive), to point at the words. */
  span: z.tuple([z.number().int().min(0), z.number().int().min(0)]).optional(),
});
export type ReviewProblem = z.infer<typeof ReviewProblemSchema>;

/**
 * What submit and edit answer. For an edit of a published review, `held`
 * and `rejected` are about the edit: the review stays up with its old words.
 */
export const ReviewWriteResultSchema = z.discriminatedUnion("status", [
  z.strictObject({ status: z.literal("published"), reviewId: ReviewIdSchema }),
  z.strictObject({
    status: z.literal("held"),
    reviewId: ReviewIdSchema,
    reason: ReviewReasonSchema,
  }),
  z.strictObject({
    status: z.literal("rejected"),
    reviewId: ReviewIdSchema,
    reason: ReviewReasonSchema,
  }),
  /** Stage 0 found something to fix. Nothing was stored. */
  z.strictObject({
    status: z.literal("invalid"),
    problems: z.array(ReviewProblemSchema).min(1),
  }),
  /** The owner stopped this account writing reviews until then. */
  z.strictObject({ status: z.literal("blocked"), until: IsoDateTimeSchema }),
  /** Too many new reviews this week (REVIEW_LIMITS.perWeek). */
  z.strictObject({
    status: z.literal("limit"),
    retryAfterSeconds: z.number().int().min(1),
  }),
  /** Edit: no review of yours with that id, or it was deleted or removed. */
  z.strictObject({ status: z.literal("not-found") }),
  /** Edit: readers reported it, and a person decides before it changes. */
  z.strictObject({ status: z.literal("under-review") }),
]);
export type ReviewWriteResult = z.infer<typeof ReviewWriteResultSchema>;

export const ReviewDeleteResultSchema = z.discriminatedUnion("status", [
  z.strictObject({ status: z.literal("deleted") }),
  z.strictObject({ status: z.literal("not-found") }),
]);
export type ReviewDeleteResult = z.infer<typeof ReviewDeleteResultSchema>;

/** An edit of a published review, waiting for a check or turned down. */
export const PendingEditStateSchema = z.enum(["waiting", "rejected"]);

export const MyPendingEditSchema = z.strictObject({
  termId: TermIdSchema.nullable(),
  rating: ReviewRatingSchema,
  grade: ReviewGradeSchema.nullable(),
  body: z.string(),
  state: PendingEditStateSchema,
  reason: ReviewReasonSchema.nullable(),
});
export type MyPendingEdit = z.infer<typeof MyPendingEditSchema>;

/** One of your own reviews (reviews/mine): what you wrote and where it stands. */
export const MyReviewSchema = z.strictObject({
  id: ReviewIdSchema,
  instructorId: InstructorIdSchema,
  /** The registry's display name. */
  instructorName: z.string(),
  /** The Testudo name you reviewed. */
  reviewedName: z.string(),
  course: CourseCodeSchema,
  termId: TermIdSchema.nullable(),
  rating: ReviewRatingSchema,
  grade: ReviewGradeSchema.nullable(),
  /** Empty once a rejected review's words are cleared, 30 days on. */
  body: z.string(),
  status: ReviewStatusSchema.exclude(["deleted"]),
  reason: ReviewReasonSchema.nullable(),
  pendingEdit: MyPendingEditSchema.nullable(),
  createdAt: IsoDateTimeSchema,
  publishedAt: IsoDateTimeSchema.nullable(),
  editedAt: IsoDateTimeSchema.nullable(),
});
export type MyReview = z.infer<typeof MyReviewSchema>;

export const ReviewsMineResultSchema = z.strictObject({
  reviews: z.array(MyReviewSchema),
});
export type ReviewsMineResult = z.infer<typeof ReviewsMineResultSchema>;

// ---------- D1 rows (migrations/0008_reviews.sql) ----------

export const InstructorRowSchema = z.object({
  id: InstructorIdSchema,
  name: z.string().min(1),
  planetterp_slug: InstructorSlugSchema.nullable(),
  created_at: IsoDateTimeSchema,
});
export type InstructorRow = z.infer<typeof InstructorRowSchema>;

/** How a Testudo name was tied to an instructor. */
export const InstructorNameRuleSchema = z.enum([
  "planetterp",
  "minted",
  /** The owner's correction; beats PlanetTerp's join. */
  "manual",
]);
export type InstructorNameRule = z.infer<typeof InstructorNameRuleSchema>;

export const InstructorNameRowSchema = z.object({
  name_key: z.string().min(1),
  dept: DeptCodeSchema,
  instructor_id: InstructorIdSchema,
  rule: InstructorNameRuleSchema,
  updated_at: IsoDateTimeSchema,
});
export type InstructorNameRow = z.infer<typeof InstructorNameRowSchema>;

/** `reviews.pending_edit`: an edit of a published review. */
export const PendingEditSchema = z.object({
  termId: TermIdSchema.nullable(),
  rating: ReviewRatingSchema,
  grade: ReviewGradeSchema.nullable(),
  body: z.string(),
  textHash: z.string().regex(/^[0-9a-f]{64}$/),
  state: PendingEditStateSchema,
  reason: ReviewReasonSchema.nullable(),
});
export type PendingEdit = z.infer<typeof PendingEditSchema>;

const pendingEditColumn = z.string().transform((s, ctx) => {
  try {
    const parsed = PendingEditSchema.safeParse(JSON.parse(s));
    if (parsed.success) return parsed.data;
  } catch {
    // Falls through to the issue below.
  }
  ctx.addIssue({ code: "custom", message: "Invalid pending_edit" });
  return z.NEVER;
});

/**
 * A `reviews` row without `author_id`: what the store hands everything but
 * its own ownership and limit checks. There's no author column to leak.
 */
export const ReviewRowSchema = z.object({
  id: ReviewIdSchema,
  instructor_id: InstructorIdSchema,
  reviewed_name: z.string(),
  course: CourseCodeSchema,
  term_id: TermIdSchema.nullable(),
  rating: ReviewRatingSchema,
  grade: ReviewGradeSchema.nullable(),
  body: z.string(),
  text_hash: z.string(),
  status: ReviewStatusSchema,
  reason: ReviewReasonSchema.nullable(),
  pending_edit: pendingEditColumn.nullable(),
  report_count: z.number().int().min(0),
  created_at: IsoDateTimeSchema,
  published_at: IsoDateTimeSchema.nullable(),
  edited_at: IsoDateTimeSchema.nullable(),
  updated_at: IsoDateTimeSchema,
});
export type ReviewRow = z.infer<typeof ReviewRowSchema>;

// ---------- a page's reviews: ours and PlanetTerp's (V2 §7.6) ----------

const MonthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);

/**
 * One of ours on a Reviews page, with who it's about: a course's page mixes
 * instructors. Still no author (§7.5); the instructor is the subject.
 */
export const PageReviewSchema = PublicReviewSchema.extend({
  instructorId: InstructorIdSchema,
});
export type PageReview = z.infer<typeof PageReviewSchema>;

/** A PlanetTerp review's id: 16 hex of the SHA-256 of its slug, date and words. */
export const PlanetTerpReviewIdSchema = z
  .string()
  .regex(/^[0-9a-f]{16}$/, "Expected a PlanetTerp review id");

/**
 * A PlanetTerp review as Reviews shows it, marked as PlanetTerp's (owner,
 * 2026-09-28). PlanetTerp publishes no author, and neither do we. The date
 * is a month, like ours, so the two read alike.
 */
export const PlanetTerpReviewSchema = z.strictObject({
  id: PlanetTerpReviewIdSchema,
  instructorId: InstructorIdSchema,
  /** Null when the reviewer didn't say, or wrote something that isn't a code. */
  course: CourseCodeSchema.nullable(),
  rating: ReviewRatingSchema,
  /** The grade they expected, when it's a real one ("95" and "d" aren't). */
  expectedGrade: ReviewGradeSchema.nullable(),
  body: z.string(),
  createdMonth: MonthSchema,
  /**
   * The day, as PlanetTerp publishes it (owner, 2026-09-30: "include the
   * date for reviews, not just month and year"). Ours keep only the month
   * (§7.5): a day beside a review of ours would help tell who wrote it.
   */
  createdDate: IsoDateSchema,
});
export type PlanetTerpReview = z.infer<typeof PlanetTerpReviewSchema>;

/** Where the next page of PlanetTerp reviews starts: `<created>|<id>`. */
export const PlanetTerpCursorSchema = z.string().regex(
  // `<rating>|` leads when the page is sorted by rating.
  /^(?:[1-5]\|)?\d{4}-\d{2}-\d{2}T[\d:.]+Z\|[0-9a-f]{16}$/,
  "Expected a PlanetTerp cursor",
);
export type PlanetTerpCursor = z.infer<typeof PlanetTerpCursorSchema>;

/** PlanetTerp reviews per page. */
export const PLANETTERP_PAGE_MAX = 20;

/**
 * PlanetTerp reviews Schedule's preview shows of one instructor in one
 * course, and so, while our Reviews pages are off, all the nightly job
 * keeps of theirs (docs/decisions.md, "Reviews link out to PlanetTerp").
 */
export const PREVIEW_REVIEWS = 3;

/** Our reviews a page reads at once: its rating counts them all. */
export const PAGE_REVIEWS_MAX = 200;

/** An instructor's page, a course's page, or one instructor in one course. */
const pageTarget = {
  instructorId: InstructorIdSchema.nullable(),
  course: CourseCodeSchema.nullable(),
};
const hasTarget = (t: { instructorId: unknown; course: unknown }) =>
  t.instructorId !== null || t.course !== null;

/** `reviews/page`: the first of a page's reviews, from both sources. */
export const ReviewsPageInputSchema = z
  .strictObject({
    ...pageTarget,
    /**
     * Ignored. Tabs opened before PlanetTerp's reviews came only from the
     * nightly crawl send it; the server no longer fetches from PlanetTerp
     * on a visit.
     */
    planetTerpName: z.string().min(1).max(120).optional(),
    /** Absent reads as `latest`. */
    sort: ReviewSortSchema.optional(),
  })
  .refine(hasTarget, "Name an instructor or a course");
export type ReviewsPageInput = z.infer<typeof ReviewsPageInputSchema>;

export const PageReviewsSchema = z.strictObject({
  /** Ours, newest first; null while REVIEWS_ENABLED is off. */
  terpsicle: z.array(PageReviewSchema).nullable(),
  /** PlanetTerp's first page, newest first. */
  planetTerp: z.array(PlanetTerpReviewSchema),
  /** Pass to `planetterp/reviews` for more; null when that's all. */
  next: PlanetTerpCursorSchema.nullable(),
  /**
   * A course's page only: the average and count of every PlanetTerp review
   * of the course, for its rating box. Null when there are none; absent on
   * an instructor's page, whose numbers are PlanetTerp's own.
   */
  planetTerpCourse: z
    .strictObject({
      rating: z.number().min(1).max(5),
      reviewCount: z.number().int().min(1),
    })
    .nullable()
    .optional(),
  /**
   * One instructor in one course: how many PlanetTerp reviews there are in
   * all (the page loads them a page at a time), for "Reviews in CMSC351 42".
   */
  planetTerpCount: z.number().int().min(0).optional(),
});
export type PageReviews = z.infer<typeof PageReviewsSchema>;

/** `planetterp/totals`: what PlanetTerp's data holds in all; takes nothing. */
export const PlanetTerpTotalsInputSchema = z.strictObject({});

/** `reviews/latest`: the newest reviews anywhere, for /reviews. */
export const ReviewsLatestInputSchema = z.strictObject({
  limit: z.number().int().min(1).max(PLANETTERP_PAGE_MAX),
});
export type ReviewsLatestInput = z.infer<typeof ReviewsLatestInputSchema>;

/** The newest of each source's; merge them for one list, newest first. */
export const LatestReviewsSchema = z.strictObject({
  /** Ours; null while REVIEWS_ENABLED is off. */
  terpsicle: z.array(PageReviewSchema).nullable(),
  planetTerp: z.array(PlanetTerpReviewSchema),
  /** Who ours are about, by id; PlanetTerp's index names theirs. */
  instructors: z.record(InstructorIdSchema, InstructorNameSchema),
});
export type LatestReviews = z.infer<typeof LatestReviewsSchema>;

/** `planetterp/totals`' answer. */
export const PlanetTerpTotalsResultSchema = z.strictObject({
  totals: PlanetTerpTotalsSchema.nullable(),
});

/** `planetterp/reviews`: the next page of PlanetTerp's. */
export const PlanetTerpReviewsInputSchema = z
  .strictObject({
    ...pageTarget,
    cursor: PlanetTerpCursorSchema.nullable(),
    /** The page's order; the cursor must come from the same one. */
    sort: ReviewSortSchema.optional(),
    limit: z
      .number()
      .int()
      .min(1)
      .max(PLANETTERP_PAGE_MAX)
      .default(PLANETTERP_PAGE_MAX),
  })
  .refine(hasTarget, "Name an instructor or a course");
export type PlanetTerpReviewsInput = z.infer<
  typeof PlanetTerpReviewsInputSchema
>;

export const PlanetTerpReviewsResultSchema = z.strictObject({
  reviews: z.array(PlanetTerpReviewSchema),
  next: PlanetTerpCursorSchema.nullable(),
});
export type PlanetTerpReviewsResult = z.infer<
  typeof PlanetTerpReviewsResultSchema
>;

/** A `planetterp_reviews` row (migrations/0020_reviews_public.sql). */
export const PlanetTerpReviewRowSchema = z.object({
  id: PlanetTerpReviewIdSchema,
  instructor_id: InstructorIdSchema,
  course: z.string().nullable(),
  rating: ReviewRatingSchema,
  expected_grade: z.string().nullable(),
  body: z.string(),
  created_at: IsoDateTimeSchema,
});
export type PlanetTerpReviewRow = z.infer<typeof PlanetTerpReviewRowSchema>;
