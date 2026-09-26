import { z } from "zod";
import {
  CourseCodeSchema,
  IsoDateSchema,
  IsoDateTimeSchema,
  SectionCodeSchema,
} from "./primitives";

// What `parseIcs` reads from an ELMS calendar feed or a dropped .ics file
// (docs/V3.md §3.6, §3.7). Descriptions are read only for the Gradescope flag
// and never kept.

export const FeedSourceSchema = z.enum(["elms", "file"]);
export type FeedSource = z.infer<typeof FeedSourceSchema>;

export const FeedItemKindSchema = z.enum(["assignment", "event"]);
export type FeedItemKind = z.infer<typeof FeedItemKindSchema>;

export const FeedItemSchema = z.object({
  /** The ICS UID; items are deduped and done marks keyed on it. */
  uid: z.string().min(1).max(200),
  source: FeedSourceSchema,
  /** SUMMARY without the course bracket. */
  title: z.string().min(1).max(300),
  /** The bracket's text: "CMSC216-0103: Introduction to Computer Systems". */
  courseLabel: z.string().min(1).max(300).nullable(),
  /** Every course code in the label, in order (merged sections, cross-listings). */
  courseCodes: z.array(CourseCodeSchema),
  /** The first code's section, when the label gives one. */
  sectionCode: SectionCodeSchema.nullable(),
  kind: FeedItemKindSchema,
  /**
   * How `kind` was decided: `uid` is Canvas saying so (`event-assignment-…`);
   * `title` is a guess from words in the title, for files that don't.
   */
  kindFrom: z.enum(["uid", "title"]),
  /** The title reads like an exam or quiz. Always a guess from keywords: a display hint only. */
  looksLikeExam: z.boolean(),
  /** The item's URL or description mentions gradescope.com. */
  gradescope: z.boolean(),
  /** When it's due (DTSTART); null for an all-day item. */
  dueAt: IsoDateTimeSchema.nullable(),
  /** The America/New_York date of `dueAt`, or the all-day date. */
  dueDate: IsoDateSchema,
  /** DTEND, for a timed event that has one. */
  endAt: IsoDateTimeSchema.nullable(),
  /** The item's ELMS URL; null for any other host. */
  link: z.url().nullable(),
});
export type FeedItem = z.infer<typeof FeedItemSchema>;

export const IcsParseSchema = z.object({
  /** False when the text has no `BEGIN:VCALENDAR`. */
  recognized: z.boolean(),
  /** One per UID, in feed order. */
  items: z.array(FeedItemSchema),
  /** Events we couldn't read (no UID, no title, or a date we can't place). */
  skipped: z.number().int().min(0),
});
export type IcsParse = z.infer<typeof IcsParseSchema>;
