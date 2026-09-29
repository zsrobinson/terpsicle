import { z } from "zod";
import { CreditsSchema } from "./catalog";
import {
  ContentHashSchema,
  CourseCodeSchema,
  DeptCodeSchema,
  InstructorNameSchema,
  IsoDateTimeSchema,
  SectionCodeSchema,
  TermIdSchema,
} from "./primitives";
import { SCHEMA_VERSIONS } from "./versions";

// Instructor history (R2 family `history/`, docs/DATA.md §3.5): our own
// permanent record of who taught which course in each term. Testudo shows
// only the last few terms, so the history job copies each term's sections
// out of the catalog while it can, and a one-off script backfilled older
// terms from PlanetTerp's grade data. Outside the `~/core/schema` barrel
// (import `~/core/schema/history`): only Reviews and Plan read it.

const historyVersion = z.literal(SCHEMA_VERSIONS.history);

function sortedUnique(values: readonly string[]): boolean {
  for (let i = 1; i < values.length; i++) {
    const prev = values[i - 1];
    const cur = values[i];
    if (prev === undefined || cur === undefined || prev >= cur) return false;
  }
  return true;
}

function newestFirstUnique(values: readonly string[]): boolean {
  for (let i = 1; i < values.length; i++) {
    const prev = values[i - 1];
    const cur = values[i];
    if (prev === undefined || cur === undefined || prev <= cur) return false;
  }
  return true;
}

/**
 * Where a course's record for a term came from. `terpsicle`: our own copy of
 * Testudo's Schedule of Classes. `planetterp`: PlanetTerp's grade data (the
 * backfill), which only knows sections that reported grades. Ours wins where
 * both exist.
 */
export const HistorySourceSchema = z.enum(["terpsicle", "planetterp"]);
export type HistorySource = z.infer<typeof HistorySourceSchema>;

/** Names as the source spells them, sorted and unique. Empty means TBA. */
const InstructorNamesSchema = z
  .array(InstructorNameSchema)
  .refine(sortedUnique, { message: "instructors must be sorted and unique" });

export const HistorySectionSchema = z.object({
  code: SectionCodeSchema,
  instructors: InstructorNamesSchema,
});
export type HistorySection = z.infer<typeof HistorySectionSchema>;

/** One course in one term. */
export const HistoryCourseSchema = z.object({
  code: CourseCodeSchema,
  /** Null when the source didn't say (a PlanetTerp course it has no page for). */
  title: z.string().min(1).max(200).nullable(),
  credits: CreditsSchema.nullable(),
  source: HistorySourceSchema,
  /**
   * Everyone who taught it that term: every section's names, plus PlanetTerp
   * names whose section number couldn't be read.
   */
  instructors: InstructorNamesSchema,
  /** Sorted by code, unique. */
  sections: z
    .array(HistorySectionSchema)
    .refine((s) => sortedUnique(s.map((x) => x.code)), {
      message: "sections must be sorted by code and unique",
    }),
});
export type HistoryCourse = z.infer<typeof HistoryCourseSchema>;

/**
 * `history/term/<term>.<hash>.json`: the permanent record of one term.
 * Append-only by course: a course, once recorded, is never dropped.
 */
export const HistoryTermSchema = z
  .object({
    schemaVersion: historyVersion,
    termId: TermIdSchema,
    /** Sorted by code, unique. */
    courses: z.array(HistoryCourseSchema),
  })
  .refine((t) => sortedUnique(t.courses.map((c) => c.code)), {
    message: "courses must be sorted by code and unique",
  });
export type HistoryTerm = z.infer<typeof HistoryTermSchema>;

/** One term of a course in a department file. */
export const HistoryOfferingSchema = z.object({
  termId: TermIdSchema,
  source: HistorySourceSchema,
  instructors: InstructorNamesSchema,
  sections: z.array(HistorySectionSchema),
});
export type HistoryOffering = z.infer<typeof HistoryOfferingSchema>;

export const HistoryDeptCourseSchema = z.object({
  code: CourseCodeSchema,
  /** From the newest term that names it; null when none does. */
  title: z.string().min(1).max(200).nullable(),
  /** Newest term first, unique. */
  offerings: z
    .array(HistoryOfferingSchema)
    .min(1)
    .refine((o) => newestFirstUnique(o.map((x) => x.termId)), {
      message: "offerings must be unique and newest first",
    }),
});
export type HistoryDeptCourse = z.infer<typeof HistoryDeptCourseSchema>;

/**
 * `history/dept/<DEPT>.<hash>.json`: the read path. Every term of every
 * course in a department, so "who taught CMSC351" and "what did this
 * instructor teach in CMSC" are one file each.
 */
export const HistoryDeptSchema = z
  .object({
    schemaVersion: historyVersion,
    dept: DeptCodeSchema,
    /** Sorted by code. Every code starts with `dept`. */
    courses: z.array(HistoryDeptCourseSchema),
  })
  .refine(
    (d) =>
      sortedUnique(d.courses.map((c) => c.code)) &&
      d.courses.every((c) => c.code.startsWith(d.dept)),
    { message: "courses must be sorted, unique and in the department" },
  );
export type HistoryDept = z.infer<typeof HistoryDeptSchema>;

const count = z.number().int().min(0);

export const HistoryManifestTermSchema = z.object({
  termId: TermIdSchema,
  hash: ContentHashSchema,
  /** Courses recorded from each source. */
  courses: z.object({ terpsicle: count, planetterp: count }),
});
export type HistoryManifestTerm = z.infer<typeof HistoryManifestTermSchema>;

/** `history/manifest.json`: the index of the family, the one fixed-name file. */
export const HistoryManifestSchema = z.object({
  schemaVersion: historyVersion,
  /** When the history last changed. */
  generatedAt: IsoDateTimeSchema,
  /** Newest term first. */
  terms: z
    .array(HistoryManifestTermSchema)
    .refine((t) => newestFirstUnique(t.map((x) => x.termId)), {
      message: "terms must be unique and newest first",
    }),
  /** Sorted by code. */
  departments: z.array(
    z.object({ code: DeptCodeSchema, hash: ContentHashSchema }),
  ),
});
export type HistoryManifest = z.infer<typeof HistoryManifestSchema>;
