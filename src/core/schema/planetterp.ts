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

// PlanetTerp-derived data: ratings, grade distributions, review summaries.
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
  /** Newest review's `created`; drives summary regeneration. */
  latestReviewAt: IsoDateTimeSchema.nullable(),
});
export type Instructor = z.infer<typeof InstructorSchema>;

/**
 * `planetterp/dept/<DEPT>.<hash>.json`. Instructors are everyone who teaches a
 * section of this department in an active term or appears in its grade data,
 * so an instructor can appear in several department files.
 */
export const PlanetTerpDeptSchema = z.object({
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
});
export type PlanetTerpManifest = z.infer<typeof PlanetTerpManifestSchema>;

// ---------- review summaries (Workers AI) ----------

export const ReviewThemeSchema = z.object({
  /** Two or three words, lowercase: "clear lectures". */
  label: z.string().min(1).max(40),
  sentiment: z.enum(["positive", "negative", "neutral"]),
});
export type ReviewTheme = z.infer<typeof ReviewThemeSchema>;

/** `summaries/<slug>.json`. The only data shown with the sparkles icon. */
export const ReviewSummarySchema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSIONS.summaries),
  slug: InstructorSlugSchema,
  /** Two or three plain sentences. */
  summary: z.string().min(1).max(600),
  themes: z.array(ReviewThemeSchema).max(6),
  /** Regenerate when the instructor's reviewCount exceeds this. */
  basedOnReviewCount: z.number().int().min(1),
  latestReviewAt: IsoDateTimeSchema.nullable(),
  generatedAt: IsoDateTimeSchema,
  /** Workers AI model id used. */
  model: z.string().min(1).max(120),
});
export type ReviewSummary = z.infer<typeof ReviewSummarySchema>;
