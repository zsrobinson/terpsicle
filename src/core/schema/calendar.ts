import { z } from "zod";
import { IsoDateSchema, IsoDateTimeSchema, TermIdSchema } from "./primitives";
import { SCHEMA_VERSIONS } from "./versions";

// Academic calendar per term, from provost.umd.edu/calendar.md. Used for .ics export.

/** A break or holiday: days with no classes. */
export const NoClassesSchema = z
  .object({
    /** The provost's wording: "Thanksgiving Break", "Labor Day". */
    name: z.string().min(1).max(120),
    /** Inclusive America/New_York dates; a one-day holiday has start === end. */
    start: IsoDateSchema,
    end: IsoDateSchema,
  })
  .refine((r) => r.end >= r.start, {
    message: "end before start",
    path: ["end"],
  });
export type NoClasses = z.infer<typeof NoClassesSchema>;

const calendarBase = {
  schemaVersion: z.literal(SCHEMA_VERSIONS.calendar),
  termId: TermIdSchema,
  /** URL we read. */
  source: z.url(),
  fetchedAt: IsoDateTimeSchema,
};

/**
 * `calendar/<term>.json`. "not-published" is a real state: .ics export then
 * says the term's dates aren't published yet (SPEC §3.0).
 */
export const AcademicCalendarSchema = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("published"),
    ...calendarBase,
    /** First day of classes. */
    classesStart: IsoDateSchema,
    /** Last day of classes (not the exam period). */
    classesEnd: IsoDateSchema,
    /** Sorted by start. */
    noClasses: z.array(NoClassesSchema),
  }),
  z.object({
    status: z.literal("not-published"),
    ...calendarBase,
  }),
]);
export type AcademicCalendar = z.infer<typeof AcademicCalendarSchema>;
export type PublishedCalendar = Extract<
  AcademicCalendar,
  { status: "published" }
>;
