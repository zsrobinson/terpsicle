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
 * Testudo's Schedule of Classes. `umdio`: umd.io's copy of the same schedule
 * (a backfill), every section, back to Fall 2017, winter and summer too.
 * `planetterp`: PlanetTerp's grade data (a backfill), which only knows
 * sections that reported grades. Where two exist, ours wins, then umd.io's.
 * `umdio` was added without a version bump: no client read the history yet.
 */
export const HistorySourceSchema = z.enum(["terpsicle", "umdio", "planetterp"]);
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
  courses: z.object({
    terpsicle: count,
    /** Added with the umd.io source; a manifest from before reads as 0. */
    umdio: count.default(0),
    planetterp: count,
  }),
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

// ---------- offered (docs/DATA.md §3.5, "Offered") ----------

/** Hex digits only, little end first: digit `i` holds terms `4i` to `4i + 3`. */
const TermBitsSchema = z.string().regex(/^[0-9a-f]*$/);

/**
 * One course in `offered/courses.<hash>.json`:
 * `[code, title, creditsMin, creditsMax, ran]`. `ran` sets bit `i` for every
 * `terms[i]` the course ran in, its cross-listings not merged (the job reads
 * only the history). Title and credits are the newest term's that names them.
 */
export const HistoryOfferedCourseSchema = z.tuple([
  CourseCodeSchema,
  z.string().min(1).max(200).nullable(),
  z.number().min(0).max(30).nullable(),
  z.number().min(0).max(30).nullable(),
  TermBitsSchema,
]);
export type HistoryOfferedCourse = z.infer<typeof HistoryOfferedCourseSchema>;

/**
 * `offered/courses.<hash>.json`: every course that ran in a term on record
 * over the offering window, with the terms it ran in, so a search can say
 * when a course the term doesn't have is offered. Raw facts, not verdicts:
 * the client reads the pattern with `offeringSummary` and today's terms.
 */
export const HistoryOfferedSchema = z
  .object({
    schemaVersion: historyVersion,
    /** Every term on record in the window, oldest first: what `ran` indexes. */
    terms: z.array(TermIdSchema).refine(sortedUnique, {
      message: "terms must be sorted and unique",
    }),
    /** Sorted by code, unique. */
    courses: z.array(HistoryOfferedCourseSchema),
  })
  .refine((f) => sortedUnique(f.courses.map((c) => c[0])), {
    message: "courses must be sorted by code and unique",
  });
export type HistoryOffered = z.infer<typeof HistoryOfferedSchema>;

/**
 * `offered/manifest.json`: names the offered file, and which version of
 * each term's record it was built from, so a run reads only changed terms.
 * Its own family of keys (`offered/`), apart from `history/`, so the history
 * job of a build that doesn't know it leaves it alone.
 */
export const HistoryOfferedManifestSchema = z.object({
  schemaVersion: historyVersion,
  generatedAt: IsoDateTimeSchema,
  hash: ContentHashSchema,
  /** Term → the hash of its `history/term` file the offered file reflects. */
  built: z.record(TermIdSchema, ContentHashSchema),
});
export type HistoryOfferedManifest = z.infer<
  typeof HistoryOfferedManifestSchema
>;
