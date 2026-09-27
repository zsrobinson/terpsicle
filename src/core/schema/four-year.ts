import { z } from "zod";
import {
  CourseCodeSchema,
  GenEdCodeSchema,
  IsoDateTimeSchema,
  LocalIdSchema,
  TermIdSchema,
} from "./primitives";
import { MessageSchema, SeveritySchema } from "./problems";
import { GradeSchema, TranscriptTermSchema } from "./transcript";
import { WildcardSchema } from "./wildcard";

// Terpsicle Plan's four-year doc (docs/V3.md §2.3). `FourYear` in code, since
// the scheduler already has plans; "Plan" only in copy and the route. The doc
// is saved whole (IndexedDB, and sync's `four-year` kind), so everything a
// person can change lives here and everything derived (term status, credits,
// GenEd progress, problems) is computed in `src/core/four-year`.

/** A column: a term, or "before" for AP and transfer credit. The transcript's own term shape. */
export const FourYearTermSchema = TranscriptTermSchema;
export type FourYearTerm = z.infer<typeof FourYearTermSchema>;

/**
 * What a person says about a course Testudo doesn't list anymore (an honors
 * seminar that rotated out, an old topics course), so Plan can count it: its
 * title and the GenEds it was meant to cover, each of which applies.
 */
export const FourYearCourseDetailsSchema = z.object({
  title: z.string().min(1).max(120).nullable(),
  genEds: z
    .array(GenEdCodeSchema)
    .max(8)
    .refine((codes) => new Set(codes).size === codes.length, {
      message: "GenEd codes must be unique",
    }),
});
export type FourYearCourseDetails = z.infer<typeof FourYearCourseDetailsSchema>;

/** Placeholder credits (§2.9): 3 unless the person changes it, 1–6. */
export const WILDCARD_CREDITS = { default: 3, min: 1, max: 6 } as const;

export const FourYearCourseEntrySchema = z.object({
  kind: z.literal("course"),
  id: LocalIdSchema,
  term: FourYearTermSchema,
  code: CourseCodeSchema,
  /** Only for variable-credit courses (and codes the index doesn't know); otherwise the index's credits. */
  credits: z.number().min(0).max(20).nullable(),
  /** The option picked where Testudo says "or", keyed by the GenEd group's index ("0", "1", …). */
  genEdChoices: z.record(z.string().regex(/^\d{1,2}$/), GenEdCodeSchema),
  source: z.enum(["typed", "transcript", "template"]),
  /** The transcript's own title and kind, shown under the catalog title. */
  transcript: z
    .object({
      title: z.string().min(1).max(120),
      via: z.enum(["umd", "ap", "transfer"]),
    })
    .nullable(),
  /** Only for a code the index doesn't know; used only while it doesn't. Absent in older docs. */
  details: FourYearCourseDetailsSchema.nullable().optional(),
});
export type FourYearCourseEntry = z.infer<typeof FourYearCourseEntrySchema>;

/** A placeholder block: `CMSC4XX`, "Any DSHS course". */
export const FourYearWildcardEntrySchema = z.object({
  kind: z.literal("wildcard"),
  id: LocalIdSchema,
  term: FourYearTermSchema,
  wildcard: WildcardSchema,
  credits: z.number().min(0).max(20),
  source: z.enum(["typed", "template"]),
});
export type FourYearWildcardEntry = z.infer<typeof FourYearWildcardEntrySchema>;

/** AP or transfer credit with no UMD equivalent ("CHEM 1XX, 4 credits"). Always "Before UMD". */
export const FourYearCreditEntrySchema = z.object({
  kind: z.literal("credit"),
  id: LocalIdSchema,
  term: z.literal("before"),
  title: z.string().min(1).max(120),
  credits: z.number().min(0).max(40),
  genEds: z.array(GenEdCodeSchema),
  source: z.literal("transcript"),
});
export type FourYearCreditEntry = z.infer<typeof FourYearCreditEntrySchema>;

export const FourYearEntrySchema = z.discriminatedUnion("kind", [
  FourYearCourseEntrySchema,
  FourYearWildcardEntrySchema,
  FourYearCreditEntrySchema,
]);
export type FourYearEntry = z.infer<typeof FourYearEntrySchema>;

/** The most entries a doc holds: eight full semesters with room for summers and AP. */
export const FOUR_YEAR_MAX_ENTRIES = 150;

function uniqueIds(entries: readonly { id: string }[]): boolean {
  return new Set(entries.map((e) => e.id)).size === entries.length;
}

export const FourYearDocSchema = z.object({
  id: LocalIdSchema,
  /** "My plan"; copies follow the scheduler's plan names ("Copy of My plan"). */
  name: z.string().min(1).max(60),
  /** The first semester shown: a fall, or a spring for someone who started in spring. */
  firstTermId: TermIdSchema,
  /** Entries in column order: term, then position. Ids are unique within the doc. */
  entries: z
    .array(FourYearEntrySchema)
    .max(FOUR_YEAR_MAX_ENTRIES)
    .refine(uniqueIds, { message: "entry ids must be unique" }),
  /** Private (§2.5). Keyed by entry id; only course entries have one. */
  grades: z.record(LocalIdSchema, GradeSchema),
  /** Where a template came from, for its credit line. */
  template: z
    .object({
      id: z.string().min(1).max(60),
      department: z.string().min(1).max(120),
      year: z.string().min(1).max(20),
    })
    .nullable(),
  createdAt: IsoDateTimeSchema,
  updatedAt: IsoDateTimeSchema,
});
export type FourYearDoc = z.infer<typeof FourYearDocSchema>;

// ---------- sample plans (§2.11) ----------

/** A sample plan's block: a course, or a placeholder with its credits. Ids and terms come when it's added. */
export const FourYearTemplateEntrySchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("course"), code: CourseCodeSchema }),
  z.object({
    kind: z.literal("wildcard"),
    wildcard: WildcardSchema,
    credits: z
      .number()
      .int()
      .min(WILDCARD_CREDITS.min)
      .max(WILDCARD_CREDITS.max),
  }),
]);
export type FourYearTemplateEntry = z.infer<typeof FourYearTemplateEntrySchema>;

export const FourYearTemplateSemesterSchema = z.object({
  /** Counted from the plan's first semester: 0 is its first fall (or spring), 7 its last. */
  index: z.number().int().min(0).max(7),
  /** What the source says the semester adds up to; the template test checks it. */
  credits: z.number().int().min(1).max(20),
  entries: z.array(FourYearTemplateEntrySchema).min(1).max(10),
});
export type FourYearTemplateSemester = z.infer<
  typeof FourYearTemplateSemesterSchema
>;

/**
 * A hand-curated sample plan (`src/features/four-year/templates/<id>.json`),
 * never scraped. `credit` is the line shown with it, linking `sourceUrl`.
 */
export const FourYearTemplateSchema = z.object({
  id: z.string().regex(/^[a-z]{2,10}-\d{4}$/, "Expected an id like cmsc-2026"),
  /** The major, as people say it: "Computer Science". */
  name: z.string().min(1).max(60),
  /** Whose plan it is: "Department of Computer Science". */
  department: z.string().min(1).max(120),
  college: z.string().min(1).max(120),
  /** The catalog year it follows: "2026–27". */
  year: z.string().min(1).max(20),
  /** One line on what it covers and leaves to you. */
  summary: z.string().min(1).max(200),
  /** "From the Department of Computer Science's …": where it comes from, in words. */
  credit: z.string().min(1).max(200),
  sourceUrl: z.url({ protocol: /^https$/ }),
  semesters: z
    .array(FourYearTemplateSemesterSchema)
    .min(1)
    .max(8)
    .refine((s) => new Set(s.map((x) => x.index)).size === s.length, {
      message: "each semester index appears once",
    }),
});
export type FourYearTemplate = z.infer<typeof FourYearTemplateSchema>;

/** Derived, never stored (§2.3): from the academic calendar and today's date. */
export const FourYearTermStatusSchema = z.enum([
  "done",
  "in-progress",
  "planned",
]);
export type FourYearTermStatus = z.infer<typeof FourYearTermStatusSchema>;

// ---------- problems (§2.8) ----------

export const FourYearProblemKindSchema = z.enum([
  "prereq-order",
  "light-semester",
  "repeated-course",
  "unknown-course",
  "not-offered-lately",
]);
export type FourYearProblemKind = z.infer<typeof FourYearProblemKindSchema>;

/** Fixed by V3.md §2.8. Only a code Testudo doesn't know is more than information. */
export const FOUR_YEAR_PROBLEM_SEVERITY = {
  "prereq-order": "info",
  "light-semester": "info",
  "repeated-course": "info",
  "unknown-course": "warning",
  "not-offered-lately": "info",
} as const satisfies Record<
  FourYearProblemKind,
  z.infer<typeof SeveritySchema>
>;

/** What a problem is about; the first subject is what clicking it opens. */
export const FourYearSubjectSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("entry"), entryId: LocalIdSchema }),
  z.object({ kind: z.literal("term"), term: FourYearTermSchema }),
]);
export type FourYearSubject = z.infer<typeof FourYearSubjectSchema>;

/** Offered only when applying it creates no new problem, like the scheduler's fixes. */
export const FourYearFixSchema = z.discriminatedUnion("kind", [
  /** "Move CMSC351 to Spring 2027". */
  z.object({
    kind: z.literal("move"),
    entryId: LocalIdSchema,
    term: FourYearTermSchema,
    label: z.string().min(1),
  }),
  /** "Count it as MATH241": an honors code Testudo dropped takes its base course's details. */
  z.object({
    kind: z.literal("details"),
    code: CourseCodeSchema,
    details: FourYearCourseDetailsSchema,
    credits: z.number().min(0).max(20).nullable(),
    label: z.string().min(1),
  }),
  /** "Remove the later one". */
  z.object({
    kind: z.literal("remove"),
    entryId: LocalIdSchema,
    label: z.string().min(1),
  }),
]);
export type FourYearFix = z.infer<typeof FourYearFixSchema>;

export const FourYearProblemSchema = z
  .object({
    /** Stable while the cause lasts: `${kind}:${subject ids}`. */
    id: z.string().min(1),
    severity: SeveritySchema,
    kind: FourYearProblemKindSchema,
    subjects: z.array(FourYearSubjectSchema).min(1),
    title: MessageSchema,
    detail: MessageSchema,
    fix: FourYearFixSchema.nullable(),
  })
  .refine((p) => FOUR_YEAR_PROBLEM_SEVERITY[p.kind] === p.severity, {
    message: "severity doesn't match kind",
    path: ["severity"],
  });
export type FourYearProblem = z.infer<typeof FourYearProblemSchema>;
