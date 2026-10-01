import { z } from "zod";
import {
  ContentHashSchema,
  CourseCodeSchema,
  DeptCodeSchema,
  InstructorSlugSchema,
  IsoDateTimeSchema,
  TermIdSchema,
} from "./primitives";
import { SCHEMA_VERSIONS } from "./versions";

// PlanetTerp-derived data: ratings, grade distributions and reviews.
// Published per department so opening a course loads one small file (docs/DATA.md §4.1).

const planetterpVersion = z.literal(SCHEMA_VERSIONS.planetterp);
const count = z.number().int().min(0);

/** Order of `GradeCounts`. PlanetTerp's buckets, rendered as A, B, C, D, F, W, Other bars. */
export const GRADE_KEYS = [
  "A+",
  "A",
  "A-",
  "B+",
  "B",
  "B-",
  "C+",
  "C",
  "C-",
  "D+",
  "D",
  "D-",
  "F",
  "W",
  "Other",
] as const;
export const GradeKeySchema = z.enum(GRADE_KEYS);
export type GradeKey = z.infer<typeof GradeKeySchema>;

/**
 * Grade points per key; W and Other don't count toward GPA or the % A/B
 * denominator. Matches PlanetTerp's average_gpa.
 */
export const GRADE_POINTS = {
  "A+": 4.0,
  A: 4.0,
  "A-": 3.7,
  "B+": 3.3,
  B: 3.0,
  "B-": 2.7,
  "C+": 2.3,
  C: 2.0,
  "C-": 1.7,
  "D+": 1.3,
  D: 1.0,
  "D-": 0.7,
  F: 0.0,
  W: null,
  Other: null,
} as const satisfies Record<GradeKey, number | null>;

/** Student counts in `GRADE_KEYS` order. */
export const GradeCountsSchema = z.tuple([
  count,
  count,
  count,
  count,
  count,
  count,
  count,
  count,
  count,
  count,
  count,
  count,
  count,
  count,
  count,
]);
export type GradeCounts = z.infer<typeof GradeCountsSchema>;

/** Grades summed over every semester PlanetTerp has. Average GPA and % A/B are computed in core. */
export const GradeRecordSchema = z.object({
  counts: GradeCountsSchema,
  /** How many semesters contributed. */
  semesters: z.number().int().min(1),
  /** Newest semester included. */
  latestTermId: TermIdSchema,
});
export type GradeRecord = z.infer<typeof GradeRecordSchema>;

export const CourseGradesSchema = z.object({
  /** Everyone who taught it; null when PlanetTerp has no grades for the course. */
  all: GradeRecordSchema.nullable(),
  byInstructor: z.record(InstructorSlugSchema, GradeRecordSchema),
});
export type CourseGrades = z.infer<typeof CourseGradesSchema>;

export const InstructorSchema = z.object({
  slug: InstructorSlugSchema,
  /** PlanetTerp's name. */
  name: z.string().min(1).max(120),
  type: z.enum(["professor", "ta"]),
  /** Average review rating, 1–5; null with no reviews. */
  rating: z.number().min(1).max(5).nullable(),
  reviewCount: count,
  /** Newest review's `created`. */
  latestReviewAt: IsoDateTimeSchema.nullable(),
});
export type Instructor = z.infer<typeof InstructorSchema>;

/**
 * One PlanetTerp review, normalized, as the nightly job stores it for
 * Reviews' pages. Reviews have no id; (slug, created) identifies one. Treat
 * `text` as untrusted.
 */
export const ReviewSchema = z.object({
  /** Course the review is about; null when the reviewer didn't say. */
  course: z.string().min(1).max(12).nullable(),
  text: z.string(),
  rating: z.number().int().min(1).max(5),
  /** Free text as typed ("A-", "P", "95", ""); never parsed as a grade. */
  expectedGrade: z.string().max(40),
  created: IsoDateTimeSchema,
});
export type Review = z.infer<typeof ReviewSchema>;

/**
 * `planetterp/dept/<DEPT>.<hash>.json`. Instructors are everyone who teaches a
 * section of this department in an active term or appears in its grade data,
 * so an instructor can appear in several department files.
 */
export const PlanetTerpDeptSchema = z.object({
  // Keyed by slug, never name: PlanetTerp names collide (two "Douglas Hamilton"s).
  schemaVersion: planetterpVersion,
  dept: DeptCodeSchema,
  instructors: z.record(InstructorSlugSchema, InstructorSchema),
  /**
   * Testudo instructor name (as `instructorNameKey()` normalizes it) → slug.
   * The join is done in ingest; names with no PlanetTerp match are absent.
   */
  names: z.record(z.string().min(1), InstructorSlugSchema),
  courses: z.record(CourseCodeSchema, CourseGradesSchema),
});
export type PlanetTerpDept = z.infer<typeof PlanetTerpDeptSchema>;

/**
 * How PlanetTerp itself is doing, so the UI can say how current its numbers
 * are (DATA.md §4.1). `stale`: the last run found PlanetTerp broken or
 * emptied and kept the previous files, or PlanetTerp has published no new
 * review in weeks. `gone`: no good run for weeks.
 */
export const PlanetTerpSourceStatusSchema = z.enum(["ok", "stale", "gone"]);
export type PlanetTerpSourceStatus = z.infer<
  typeof PlanetTerpSourceStatusSchema
>;

export const PlanetTerpSourceSchema = z.object({
  status: PlanetTerpSourceStatusSchema,
  /** The last run that passed the sanity checks and published; null before one has. */
  lastSuccessAt: IsoDateTimeSchema.nullable(),
  /** Newest semester in PlanetTerp's grade data; null if none. */
  gradesThrough: TermIdSchema.nullable(),
  /** Newest review PlanetTerp had published, as of the last good run. */
  latestReviewAt: IsoDateTimeSchema.nullable(),
});
export type PlanetTerpSource = z.infer<typeof PlanetTerpSourceSchema>;

/** `planetterp/manifest.json`. */
export const PlanetTerpManifestSchema = z.object({
  schemaVersion: planetterpVersion,
  generatedAt: IsoDateTimeSchema,
  /** Newest semester in PlanetTerp's grade data; null if none. */
  gradesThrough: TermIdSchema.nullable(),
  /** Sorted by code. */
  departments: z.array(
    z.object({ code: DeptCodeSchema, hash: ContentHashSchema }),
  ),
  /**
   * Added without a version bump (DATA.md §2.3): older clients strip it, and
   * manifests written before it read as "unknown", never as a problem.
   */
  source: PlanetTerpSourceSchema.optional(),
  /**
   * The index file (`PlanetTerpIndexSchema`). Added without a version bump,
   * like `source`: manifests from before it have none, and readers fall back.
   */
  index: z.object({ hash: ContentHashSchema }).optional(),
});
export type PlanetTerpManifest = z.infer<typeof PlanetTerpManifestSchema>;

/**
 * What Reviews holds in all, for its front page (`PlanetTerpIndex.totals`),
 * counted the way PlanetTerp's own front page counts where our data allows
 * (DATA.md §4.1, "Totals").
 */
export const PlanetTerpTotalsSchema = z.object({
  /** Courses in the department files: offered in an active term, or taught since Spring 2012. */
  courses: count,
  /** Everyone PlanetTerp lists, professors and TAs, as its front page counts them. */
  professors: count,
  /** PlanetTerp's reviews, summed over everyone it lists. */
  reviews: count,
  /**
   * PlanetTerp's "course grades": its grade rows (one per section, term and
   * professor) since Spring 2012. Older rows aren't in its API.
   */
  grades: count,
  /** Every course's grades, summed: the distribution across Reviews. */
  counts: GradeCountsSchema,
});
export type PlanetTerpTotals = z.infer<typeof PlanetTerpTotalsSchema>;

/** How many courses `mostTaken` keeps. */
export const MOST_TAKEN_MAX = 40;
/** Instructors the PlanetTerp index lists as most reviewed. */
export const MOST_REVIEWED_MAX = 24;

/**
 * `planetterp/index.<hash>.json`: what the department files hold, across
 * departments. An instructor page with no course (`/reviews/instructors/
 * kruskal`) finds its departments here, the sitemap lists every instructor,
 * and a mistyped slug gets "Did you mean…". `mostTaken`: courses in an
 * active term, most students first by PlanetTerp's grade data.
 */
export const PlanetTerpIndexSchema = z.object({
  schemaVersion: planetterpVersion,
  /**
   * Slug → [PlanetTerp's name, the departments whose files list them,
   * sorted, and their PlanetTerp review count]. The count was added later
   * without a version bump: an older index's entries have two items.
   */
  instructors: z.record(
    InstructorSlugSchema,
    z.union([
      z.tuple([z.string().min(1).max(120), z.array(DeptCodeSchema).min(1)]),
      z.tuple([
        z.string().min(1).max(120),
        z.array(DeptCodeSchema).min(1),
        count,
      ]),
    ]),
  ),
  /** [course, its title, students], most students first. */
  mostTaken: z
    .array(z.tuple([CourseCodeSchema, z.string().min(1).max(200), count]))
    .max(MOST_TAKEN_MAX),
  /**
   * [slug, name, reviews, rating], the professors with the most PlanetTerp
   * reviews: Reviews' front page lists them beside the most-taken courses,
   * as equals. Added later, so an older index reads as none.
   */
  mostReviewed: z
    .array(
      z.tuple([
        InstructorSlugSchema,
        z.string().min(1).max(120),
        count,
        z.number().min(1).max(5).nullable(),
      ]),
    )
    .max(MOST_REVIEWED_MAX)
    .default([]),
  /**
   * What Reviews holds in all. Added later without a version bump: an
   * older index has none.
   */
  totals: PlanetTerpTotalsSchema.optional(),
});
export type PlanetTerpIndex = z.infer<typeof PlanetTerpIndexSchema>;
