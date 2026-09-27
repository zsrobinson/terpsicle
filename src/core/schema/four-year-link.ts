import { z } from "zod";
// Only primitives and the wildcard: the scheduler's Courses tab loads this,
// and mustn't carry the whole four-year schema (transcripts, problems).
import {
  CourseCodeSchema,
  IsoDateTimeSchema,
  LocalIdSchema,
  TermIdSchema,
} from "./primitives";
import { WildcardSchema } from "./wildcard";

// What the scheduler reads of a four-year doc in IndexedDB (docs/V3.md
// §2.12): which doc it is, and each course's or placeholder's term. Grades
// and the rest never leave Plan, so they aren't parsed here. Each field is
// the same as `FourYearDocSchema`'s (four-year-link.test.ts checks it).

/** A four-year doc row, with its entries left to `FourYearLinkEntrySchema` one by one. */
export const FourYearLinkDocSchema = z.object({
  id: LocalIdSchema,
  createdAt: IsoDateTimeSchema,
  entries: z.array(z.unknown()),
});

const LinkTermSchema = z.union([TermIdSchema, z.literal("before")]);

/** A course or placeholder entry, as the handoff reads it; any other kind doesn't parse. */
export const FourYearLinkEntrySchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("course"),
    term: LinkTermSchema,
    code: CourseCodeSchema,
  }),
  z.object({
    kind: z.literal("wildcard"),
    term: LinkTermSchema,
    wildcard: WildcardSchema,
  }),
]);
export type FourYearLinkEntry = z.infer<typeof FourYearLinkEntrySchema>;
