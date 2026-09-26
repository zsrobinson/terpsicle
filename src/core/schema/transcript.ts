import { z } from "zod";
import { GenEdGroupSchema } from "./catalog";
import {
  CourseCodeSchema,
  SectionCodeSchema,
  TermIdSchema,
} from "./primitives";

// What `parseTranscript` reads from a pasted UMD unofficial transcript
// (docs/V3.md §2.10). Nothing from the transcript's header (name, UID, birth
// date, address, email) has a field here, so it can't leave the parser.

/**
 * A grade a four-year plan keeps. W, NC and dropped lines aren't grades we
 * import (they're `TranscriptSkipped` reasons). XF is UMD's F for academic
 * dishonesty: a real, permanent grade, so it's kept like F.
 */
export const GRADES = [
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
  "XF",
  "P",
  "S",
  "I",
  "NG",
  "AUD",
] as const;
export const GradeSchema = z.enum(GRADES);
export type Grade = z.infer<typeof GradeSchema>;

/** A four-year plan's column: a term, or "before" for AP and transfer credit. */
export const TranscriptTermSchema = z.union([
  TermIdSchema,
  z.literal("before"),
]);
export type TranscriptTerm = z.infer<typeof TranscriptTermSchema>;

export const TranscriptViaSchema = z.enum(["umd", "ap", "transfer"]);
export type TranscriptVia = z.infer<typeof TranscriptViaSchema>;

export const TranscriptLineSchema = z.object({
  term: TranscriptTermSchema,
  /**
   * The UMD course this line counts as: the line's own code for a UMD
   * course, the equivalent for AP and transfer credit, or null when the
   * credit has no UMD course (a `credit` entry in the plan).
   */
  code: CourseCodeSchema.nullable(),
  /** The transcript's own title, as printed: "OBJECT-ORIENTED PROG I", "AP CALCULUS AB". */
  title: z.string().min(1).max(120),
  /** Null while a course is in progress. */
  grade: GradeSchema.nullable(),
  /** Credits attempted (for AP and transfer, credits granted). */
  credits: z.number().min(0).max(40),
  /** Credits earned; null while in progress. */
  earned: z.number().min(0).max(40).nullable(),
  /** Quality points; null while in progress, and for AP and transfer. */
  qualityPoints: z.number().min(0).max(200).nullable(),
  /** The catalog's shape: groups that all apply, options ("or") within a group. */
  genEds: z.array(GenEdGroupSchema),
  via: TranscriptViaSchema,
  /** For AP and transfer lines, the UMD equivalent the transcript names. */
  equivalentOf: CourseCodeSchema.nullable(),
  /** A generic equivalent that isn't one course ("CHEM1XX"); the import maps it. */
  equivalentPattern: z
    .string()
    .regex(/^[A-Z]{4}[0-9X]{3}$/)
    .nullable(),
  /** In-progress terms print the section. */
  sectionCode: SectionCodeSchema.nullable(),
  inProgress: z.boolean(),
});
export type TranscriptLine = z.infer<typeof TranscriptLineSchema>;

export const TranscriptSkipReasonSchema = z.enum([
  "withdrawn",
  "dropped",
  "no-credit",
  "unreadable",
]);
export type TranscriptSkipReason = z.infer<typeof TranscriptSkipReasonSchema>;

export const TranscriptSkippedSchema = z.object({
  /** The line as pasted, with its spacing collapsed. Only course lines are ever reported, never header lines. */
  raw: z.string().min(1).max(300),
  reason: TranscriptSkipReasonSchema,
  /**
   * What the line would import as, so the check step can tick it back in.
   * Null for an unreadable line.
   */
  line: TranscriptLineSchema.nullable(),
});
export type TranscriptSkipped = z.infer<typeof TranscriptSkippedSchema>;

export const TranscriptParseSchema = z.object({
  /** What we read, in transcript order. */
  lines: z.array(TranscriptLineSchema),
  /** Course lines we left out, and why, in transcript order. */
  skipped: z.array(TranscriptSkippedSchema),
  /** False when this doesn't look like a UMD unofficial transcript. */
  recognized: z.boolean(),
});
export type TranscriptParse = z.infer<typeof TranscriptParseSchema>;
