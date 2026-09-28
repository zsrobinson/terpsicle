import { z } from "zod";
import {
  FourYearCourseDetailsSchema,
  FourYearTermSchema,
} from "./four-year";
import {
  CourseCodeSchema,
  GenEdCodeSchema,
  TermIdSchema,
} from "./primitives";
import { TranscriptViaSchema } from "./transcript";
import { WildcardSchema } from "./wildcard";

// A four-year share link's payload (`/plan/shared?plan=1.<…>`, DATA.md §8.2).
// Each version of the link has its own wire schema here, which never
// changes once shipped: a later version adds a schema and an upgrade to the
// newest, so a link made today still opens. The codec is
// ~/core/share/four-year-share. Not in the `~/core/schema` barrel: only
// Plan's pages load it.
//
// No ids, timestamps or grades: an entry's id is made fresh when the link is
// opened, and grades never leave the person's own doc (docs/V3.md §2.5).

const CreditsSchema = z.number().min(0).max(40);

/** Where an entry came from, when it isn't typed: `x` transcript, `p` sample plan. */
const SourceV1Schema = z.enum(["x", "p"]);

/** A course: `{c: "CMSC131"}` plus only what differs from the defaults. */
const CourseV1Schema = z.object({
  c: CourseCodeSchema,
  /** Credits, only when the doc sets them (variable credits, unknown codes). */
  cr: CreditsSchema.optional(),
  /** The option picked where Testudo says "or", by GenEd group index. */
  g: z.record(z.string().regex(/^\d{1,2}$/), GenEdCodeSchema).optional(),
  /** Course info for a code Testudo doesn't list anymore. */
  d: FourYearCourseDetailsSchema.optional(),
  /** The transcript's own title and kind (never its grade). */
  x: z
    .object({
      t: z.string().min(1).max(120),
      v: TranscriptViaSchema,
    })
    .optional(),
  s: SourceV1Schema.optional(),
});

/** A placeholder: `{w: {kind: "pattern", pattern: "CMSC4XX"}, cr: 3}`. */
const WildcardV1Schema = z.object({
  w: WildcardSchema,
  cr: CreditsSchema,
  s: z.literal("p").optional(),
});

/** AP or transfer credit with no UMD course, before UMD: `{a: "CHEM 1XX", cr: 4, g: []}`. */
const CreditV1Schema = z.object({
  a: z.string().min(1).max(120),
  cr: CreditsSchema,
  g: z.array(GenEdCodeSchema).max(8),
});

export const FourYearShareEntryV1Schema = z.union([
  CourseV1Schema,
  WildcardV1Schema,
  CreditV1Schema,
]);
export type FourYearShareEntryV1 = z.infer<typeof FourYearShareEntryV1Schema>;

/** The most entries a link carries: a doc's own limit. */
export const FOUR_YEAR_SHARE_MAX_ENTRIES = 150;

/** Version 1: the doc's name, first term, sample plan credit, and each term's entries in order. */
export const FourYearShareV1Schema = z
  .object({
    n: z.string().min(1).max(60),
    f: TermIdSchema,
    /** The sample plan it started from, for its credit line. */
    p: z
      .object({
        id: z.string().min(1).max(60),
        department: z.string().min(1).max(120),
        year: z.string().min(1).max(20),
      })
      .optional(),
    /** Entries by term (a term id, or "before"), in column order. */
    t: z.record(FourYearTermSchema, z.array(FourYearShareEntryV1Schema)),
  })
  .refine(
    (p) =>
      Object.values(p.t).reduce((n, list) => n + list.length, 0) <=
      FOUR_YEAR_SHARE_MAX_ENTRIES,
    { message: "Too many entries", path: ["t"] },
  )
  .refine(
    (p) =>
      Object.entries(p.t).every(
        ([term, list]) => term === "before" || list.every((e) => !("a" in e)),
      ),
    { message: "Credit entries are before UMD only", path: ["t"] },
  );
export type FourYearShareV1 = z.infer<typeof FourYearShareV1Schema>;
