import { z } from "zod";
import {
  CourseCodeSchema,
  DaySchema,
  LocalIdSchema,
  MinutesSchema,
  SectionKeySchema,
} from "./primitives";

// Problems (SPEC §3.6) and fit labels (SPEC §3.4), as core computes them for the UI.

export const SeveritySchema = z.enum(["error", "warning", "info"]);
export type Severity = z.infer<typeof SeveritySchema>;

export const ProblemKindSchema = z.enum([
  "not-enough-time",
  "cancelled",
  "changed",
  "overlap",
  "tight-connection",
  "full",
  "few-seats",
  "restricted",
  "no-set-times",
  "instructor-tba",
]);
export type ProblemKind = z.infer<typeof ProblemKindSchema>;

/** Fixed by the spec; Problems sorts by this, then by the order core emits. */
export const PROBLEM_SEVERITY = {
  "not-enough-time": "error",
  cancelled: "error",
  changed: "error",
  overlap: "warning",
  "tight-connection": "warning",
  full: "warning",
  "few-seats": "warning",
  restricted: "warning",
  "no-set-times": "info",
  "instructor-tba": "info",
} as const satisfies Record<ProblemKind, Severity>;

export const SEVERITY_ORDER = [
  "error",
  "warning",
  "info",
] as const satisfies readonly Severity[];

/** What a problem is about. The first subject is what clicking the problem opens. */
export const SubjectSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("course"), courseCode: CourseCodeSchema }),
  z.object({ kind: z.literal("section"), sectionKey: SectionKeySchema }),
  z.object({ kind: z.literal("connection"), connectionId: z.string().min(1) }),
  z.object({ kind: z.literal("block"), blockId: LocalIdSchema }),
]);
export type Subject = z.infer<typeof SubjectSchema>;

/**
 * Structured text so the UI can set codes and times in mono and make them
 * clickable, without parsing strings. Core picks the words; UI renders them.
 */
export const MessagePartSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("text"), text: z.string() }),
  z.object({ kind: z.literal("course"), courseCode: CourseCodeSchema }),
  z.object({ kind: z.literal("section"), sectionKey: SectionKeySchema }),
  z.object({
    kind: z.literal("block"),
    blockId: LocalIdSchema,
    label: z.string(),
  }),
  z.object({ kind: z.literal("day"), day: DaySchema }),
  /** A clock time. */
  z.object({ kind: z.literal("time"), minutes: MinutesSchema }),
  /** A length of time: "18 min". */
  z.object({ kind: z.literal("duration"), minutes: z.number().int().min(0) }),
]);
export type MessagePart = z.infer<typeof MessagePartSchema>;
export const MessageSchema = z.array(MessagePartSchema);
export type Message = z.infer<typeof MessageSchema>;

export const ProblemFixSchema = z.discriminatedUnion("kind", [
  /** Offered only when switching creates no new problem ("Switch to 0205"). */
  z.object({
    kind: z.literal("switch"),
    sectionKey: SectionKeySchema,
    label: z.string().min(1),
  }),
  /** For "changed": take the new meeting times into the plan's snapshot ("Keep new times"). */
  z.object({
    kind: z.literal("accept-change"),
    sectionKey: SectionKeySchema,
    label: z.string().min(1),
  }),
]);
export type ProblemFix = z.infer<typeof ProblemFixSchema>;

export const ProblemSchema = z
  .object({
    /** Stable across recomputes while the cause persists: `${kind}:${subject ids}`. */
    id: z.string().min(1),
    severity: SeveritySchema,
    kind: ProblemKindSchema,
    subjects: z.array(SubjectSchema).min(1),
    title: MessageSchema,
    detail: MessageSchema,
    fix: ProblemFixSchema.nullable(),
  })
  .refine((p) => PROBLEM_SEVERITY[p.kind] === p.severity, {
    message: "severity doesn't match kind",
    path: ["severity"],
  });
export type Problem = z.infer<typeof ProblemSchema>;

// ---------- fit label ----------

export const OverlapTargetSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("course"), courseCode: CourseCodeSchema }),
  z.object({
    kind: z.literal("block"),
    blockId: LocalIdSchema,
    label: z.string(),
  }),
]);
export type OverlapTarget = z.infer<typeof OverlapTargetSchema>;

/**
 * How a section relates to the current plan, in words:
 * Fits · Overlaps ENGL393 · Not enough time after CMSC330 · In your plan · No set times.
 * "after X": X comes first and there isn't time to get from X to this section.
 */
export const FitLabelSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("fits") }),
  z.object({ kind: z.literal("overlaps"), with: OverlapTargetSchema }),
  z.object({
    kind: z.literal("not-enough-time"),
    direction: z.enum(["after", "before"]),
    courseCode: CourseCodeSchema,
  }),
  z.object({ kind: z.literal("in-plan") }),
  z.object({ kind: z.literal("no-set-times") }),
]);
export type FitLabel = z.infer<typeof FitLabelSchema>;
