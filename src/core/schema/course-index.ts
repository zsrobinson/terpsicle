import { z } from "zod";
import { CreditsSchema, GenEdGroupSchema } from "./catalog";
import {
  ContentHashSchema,
  CourseCodeSchema,
  DeptCodeSchema,
  GenEdCodeSchema,
  IsoDateTimeSchema,
  TermIdSchema,
} from "./primitives";
import { SCHEMA_VERSIONS } from "./versions";

// The course index (R2 family `courses/`, docs/DATA.md §3.4): every course
// the catalog job has seen in any term, so the four-year planner can find
// courses that aren't offered this term. Built from the per-term department
// chunks already in R2; nothing is crawled for it.

const coursesVersion = z.literal(SCHEMA_VERSIONS.courses);

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
 * `parsePrerequisite`'s reading of Testudo's prerequisite sentence
 * (`src/core/catalog/prereqs.ts`). Every group applies; within a group, one
 * course is enough. `complete` is false when the sentence says anything the
 * groups don't capture (permission, "or equivalent", scores, programs,
 * "must have completed"), so the UI shows Testudo's words next to any check.
 */
export const PrereqsSchema = z.object({
  groups: z.array(z.array(CourseCodeSchema).min(1)),
  complete: z.boolean(),
});
export type Prereqs = z.infer<typeof PrereqsSchema>;

/**
 * One course in a department file. The text fields and `genEds` come from the
 * newest term that lists the course (active terms before archived ones);
 * `offered` from every term that lists it.
 */
export const CourseIndexEntrySchema = z.object({
  code: CourseCodeSchema,
  title: z.string().min(1).max(200),
  credits: CreditsSchema,
  /** The catalog's shape (DATA.md §3.2): groups that all apply, options with `condition`. */
  genEds: z.array(GenEdGroupSchema),
  prerequisite: z.string().min(1).nullable(),
  corequisite: z.string().min(1).nullable(),
  restriction: z.string().min(1).nullable(),
  crossListings: z.array(CourseCodeSchema),
  /** `parsePrerequisite(prerequisite)`, computed in ingest so every client agrees. */
  prereqs: PrereqsSchema,
  /** Every term id that listed the course, newest first. */
  offered: z.array(TermIdSchema).min(1).refine(newestFirstUnique, {
    message: "offered must be unique and newest first",
  }),
});
export type CourseIndexEntry = z.infer<typeof CourseIndexEntrySchema>;

/** `courses/dept/<DEPT>.<hash>.json`. No timestamps, so the hash moves only with the courses. */
export const CourseIndexDeptSchema = z
  .object({
    schemaVersion: coursesVersion,
    dept: DeptCodeSchema,
    /** Sorted by code. Every code starts with `dept`. */
    courses: z.array(CourseIndexEntrySchema),
  })
  .refine(
    (d) =>
      sortedUnique(d.courses.map((c) => c.code)) &&
      d.courses.every((c) => c.code.startsWith(d.dept)),
    { message: "courses must be sorted, unique and in the department" },
  );
export type CourseIndexDept = z.infer<typeof CourseIndexDeptSchema>;

/**
 * One search row: `[code, title, creditsMin, creditsMax, genEdCodes]`.
 * `genEdCodes` flattens `genEds` (every option's code, once, in order); the
 * department file has the groups and conditions.
 */
export const CourseSearchRowSchema = z.tuple([
  CourseCodeSchema,
  z.string().min(1).max(200),
  z.number().min(0).max(30),
  z.number().min(0).max(30),
  z.array(GenEdCodeSchema),
]);
export type CourseSearchRow = z.infer<typeof CourseSearchRowSchema>;

/** `courses/search.<hash>.json`: every course in the index, sorted by code. */
export const CourseSearchFileSchema = z.object({
  schemaVersion: coursesVersion,
  courses: z
    .array(CourseSearchRowSchema)
    .refine((rows) => sortedUnique(rows.map((r) => r[0])), {
      message: "search rows must be sorted by code and unique",
    }),
});
export type CourseSearchFile = z.infer<typeof CourseSearchFileSchema>;

export const CourseIndexManifestDepartmentSchema = z.object({
  code: DeptCodeSchema,
  hash: ContentHashSchema,
});
export type CourseIndexManifestDepartment = z.infer<
  typeof CourseIndexManifestDepartmentSchema
>;

/** `courses/manifest.json`: the one fixed-name file of the family. */
export const CourseIndexManifestSchema = z.object({
  schemaVersion: coursesVersion,
  /** When the index last changed. */
  generatedAt: IsoDateTimeSchema,
  search: z.object({ hash: ContentHashSchema }),
  /** Sorted by code. */
  departments: z.array(CourseIndexManifestDepartmentSchema),
});
export type CourseIndexManifest = z.infer<typeof CourseIndexManifestSchema>;
