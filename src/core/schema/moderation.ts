import { z } from "zod";
import { CourseCodeSchema, IsoDateTimeSchema } from "./primitives";

// Moderation for Reviews and Chat: what moderate() returns, the D1 rows that
// record it, and the admin API. Flow: docs/MODERATION.md.

export const ModerationKindSchema = z.enum(["review", "chat"]);
export type ModerationKind = z.infer<typeof ModerationKindSchema>;

export const ModerationDecisionSchema = z.enum(["publish", "hold", "remove"]);
export type ModerationDecision = z.infer<typeof ModerationDecisionSchema>;

/**
 * What one reason asks for. "flag" is a soft signal: it never holds anything
 * by itself, it only asks the policy model to look (docs/MODERATION.md §2).
 */
export const ModerationActionSchema = z.enum(["flag", "hold", "remove"]);
export type ModerationAction = z.infer<typeof ModerationActionSchema>;

export const ReasonSourceSchema = z.enum([
  "rules",
  "guard",
  "policy",
  "system",
  "admin",
  "reports",
]);
export type ReasonSource = z.infer<typeof ReasonSourceSchema>;

/** Llama Guard 3's hazard categories, S1–S14. */
export const GuardCategorySchema = z.enum([
  "S1",
  "S2",
  "S3",
  "S4",
  "S5",
  "S6",
  "S7",
  "S8",
  "S9",
  "S10",
  "S11",
  "S12",
  "S13",
  "S14",
]);
export type GuardCategory = z.infer<typeof GuardCategorySchema>;

/** Labels the policy model scores from 0 to 1. */
export const PolicyLabelSchema = z.enum([
  "academic-integrity",
  "targets-person",
  "personal-info",
  "misconduct-claim",
  "spam",
  "off-topic",
]);
export type PolicyLabel = z.infer<typeof PolicyLabelSchema>;

export const ReasonCodeSchema = z.enum([
  // rules (src/core/moderation)
  "empty",
  "too-short",
  "too-long",
  "link",
  "cheating-site",
  "email",
  "phone",
  "address",
  "uid",
  "asks-for-answers",
  "shares-answers",
  "code-paste",
  "slur",
  "blocked-word",
  "insult",
  // Llama Guard, one per category
  "violence",
  "crime",
  "sex-crime",
  "child-safety",
  "defamation",
  "specialized-advice",
  "privacy",
  "intellectual-property",
  "weapons",
  "hate",
  "self-harm",
  "sexual",
  "elections",
  "code-abuse",
  /** Llama Guard said unsafe but named no category we know. */
  "unsafe",
  // the policy model (PolicyLabel)
  ...PolicyLabelSchema.options,
  // system
  "model-unavailable",
  "daily-cap",
  /** Reviews: more new reviews of one instructor in a day than usual (V2 §7.4). */
  "burst",
  // reports (V2 §9.3)
  "reported",
  // admin
  "admin",
  "undo",
]);
export type ReasonCode = z.infer<typeof ReasonCodeSchema>;

/** Why the owner approved or removed something. */
export const AdminReasonSchema = z.enum([
  "fine",
  "personal-info",
  "targets-person",
  "hate",
  "threat",
  "sexual",
  "academic-integrity",
  "misconduct-claim",
  "spam",
  "off-topic",
  "other",
]);
export type AdminReason = z.infer<typeof AdminReasonSchema>;

/** Why a reader reported something (V2 §9.3). */
export const ReportReasonSchema = z.enum([
  "personal-info",
  "names-a-student",
  "hate",
  "threat",
  "sexual",
  "misconduct-claim",
  "graded-work",
  "off-topic",
  "other",
]);
export type ReportReason = z.infer<typeof ReportReasonSchema>;

export const ModerationReasonSchema = z.object({
  code: ReasonCodeSchema,
  source: ReasonSourceSchema,
  action: ModerationActionSchema,
  /** Where in the text (UTF-16 offsets, end exclusive), for rules that match text. */
  span: z.tuple([z.number().int().min(0), z.number().int().min(0)]).optional(),
  /** Llama Guard's category, for guard reasons. */
  category: GuardCategorySchema.optional(),
  /** The policy model's score, for policy reasons. */
  score: z.number().min(0).max(1).optional(),
  /** The owner's reason, for admin removals. */
  adminReason: AdminReasonSchema.optional(),
  /** What readers said, for `reported` reasons: one reason per report reason. */
  report: ReportReasonSchema.optional(),
});
export type ModerationReason = z.infer<typeof ModerationReasonSchema>;

/** The model ids that took part in a decision; null when that stage didn't run. */
export const ModerationModelsSchema = z.object({
  guard: z.string().nullable(),
  policy: z.string().nullable(),
});
export type ModerationModels = z.infer<typeof ModerationModelsSchema>;

export const ModerationScoresSchema = z.partialRecord(
  PolicyLabelSchema,
  z.number().min(0).max(1),
);
export type ModerationScores = z.infer<typeof ModerationScoresSchema>;

export const ModerationResultSchema = z.object({
  decision: ModerationDecisionSchema,
  reasons: z.array(ModerationReasonSchema),
  model: ModerationModelsSchema,
  scores: ModerationScoresSchema,
});
export type ModerationResult = z.infer<typeof ModerationResultSchema>;

/** A review id, a chat message id: whatever the caller stores the item under. */
export const ModerationTargetIdSchema = z
  .string()
  .regex(/^[A-Za-z0-9_~:.-]{1,128}$/, "Expected an opaque id");

export const ModerationContextSchema = z.object({
  /** The item being moderated. The only link back to it that moderation keeps. */
  targetId: ModerationTargetIdSchema,
  course: CourseCodeSchema.optional(),
  /**
   * The course has graded work open right now, so pasted code is more likely
   * to be a solution. Callers that can't tell leave it unset (treated as no).
   */
  activeAssignments: z.boolean().optional(),
});
export type ModerationContext = z.infer<typeof ModerationContextSchema>;

export const ModerationInputSchema = z.object({
  kind: ModerationKindSchema,
  text: z.string(),
  context: ModerationContextSchema,
});
export type ModerationInput = z.infer<typeof ModerationInputSchema>;

/**
 * MODERATION_CONFIG (an optional JSON var) overrides the defaults in
 * src/core/moderation/decide.ts and src/server/moderation/models.ts without a
 * code change. Anything invalid is ignored as a whole.
 */
export const ModerationConfigOverridesSchema = z.strictObject({
  guardModel: z.string().startsWith("@cf/").optional(),
  /** Both kinds' policy model; `policyModels` wins per kind. */
  policyModel: z.string().startsWith("@cf/").optional(),
  policyModels: z
    .partialRecord(ModerationKindSchema, z.string().startsWith("@cf/"))
    .optional(),
  timeoutMs: z.number().int().min(500).max(30_000).optional(),
  hedgeAfterMs: z.number().int().min(100).max(30_000).optional(),
  /** "always": the policy model reads every chat message; "flagged": only flagged ones. */
  chatPolicy: z.enum(["always", "flagged"]).optional(),
  guardActions: z
    .partialRecord(GuardCategorySchema, ModerationActionSchema)
    .optional(),
  policyThresholds: z
    .partialRecord(
      PolicyLabelSchema,
      z.strictObject({
        hold: z.number().min(0).max(1),
        remove: z.number().min(0).max(1).optional(),
      }),
    )
    .optional(),
});
export type ModerationConfigOverrides = z.infer<
  typeof ModerationConfigOverridesSchema
>;

// ---------- D1 rows (migrations/0004_moderation.sql, V2 §9.4) ----------
// The tables use V2's vocabulary (surface, ref, verdict); the service maps
// moderate()'s kind, targetId and decision onto them.

/** 16 random bytes, base64url without padding. */
export const ModerationIdSchema = z
  .string()
  .regex(/^[A-Za-z0-9_-]{22}$/, "Expected a 22-char id");

const jsonColumn = <S extends z.ZodType>(schema: S) =>
  z.string().transform((s, ctx) => {
    try {
      const parsed = schema.safeParse(JSON.parse(s));
      if (parsed.success) return parsed.data as z.infer<S>;
    } catch {
      // Falls through to the issue below.
    }
    ctx.addIssue({ code: "custom", message: "Invalid JSON column" });
    return z.NEVER;
  });

export const DecisionStageSchema = z.enum([
  "rules",
  "model",
  "human",
  "reports",
]);
export type DecisionStage = z.infer<typeof DecisionStageSchema>;

/** V2's verdicts. `restore` and `hide` are for reports (Reviews, Chat). */
export const StoredVerdictSchema = z.enum([
  "allow",
  "hold",
  "reject",
  "remove",
  "restore",
  "hide",
]);
export type StoredVerdict = z.infer<typeof StoredVerdictSchema>;

export const DecidedBySchema = z.enum(["system", "admin"]);
export type DecidedBy = z.infer<typeof DecidedBySchema>;

/** Llama Guard's answer, as stored. */
export const GuardAnswerSchema = z.object({
  safe: z.boolean(),
  categories: z.array(GuardCategorySchema),
});
export type GuardAnswer = z.infer<typeof GuardAnswerSchema>;

export const ModerationDecisionRowSchema = z.object({
  id: ModerationIdSchema,
  surface: ModerationKindSchema,
  ref: ModerationTargetIdSchema,
  stage: DecisionStageSchema,
  verdict: StoredVerdictSchema,
  labels: jsonColumn(z.array(ModerationReasonSchema)),
  guard: jsonColumn(GuardAnswerSchema).nullable(),
  policy: jsonColumn(ModerationScoresSchema).nullable(),
  models: jsonColumn(ModerationModelsSchema).nullable(),
  latency_ms: z.number().int().min(0).nullable(),
  decided_by: DecidedBySchema,
  reason: AdminReasonSchema.nullable(),
  created_at: IsoDateTimeSchema,
});
export type ModerationDecisionRow = z.infer<typeof ModerationDecisionRowSchema>;

/**
 * `retry`: held only because a model failed or the cap was spent; the cron
 * screens it again before the owner sees it. `open`: waiting for the owner.
 */
export const QueueRowStatusSchema = z.enum(["retry", "open", "closed"]);
export type QueueRowStatus = z.infer<typeof QueueRowStatusSchema>;

/** What the owner sees, and what a retry screens again. Blanked 30 days after close. */
export const QueueSnapshotSchema = z.object({
  text: z.string(),
  course: CourseCodeSchema.nullable(),
  activeAssignments: z.boolean(),
  scores: ModerationScoresSchema,
  /** Automatic re-screens so far (status `retry`). */
  retries: z.number().int().min(0),
});
export type QueueSnapshot = z.infer<typeof QueueSnapshotSchema>;

export const ModerationQueueRowSchema = z.object({
  id: ModerationIdSchema,
  surface: ModerationKindSchema,
  ref: ModerationTargetIdSchema,
  snapshot: jsonColumn(QueueSnapshotSchema).nullable(),
  labels: jsonColumn(z.array(ModerationReasonSchema)),
  urgent: z.union([z.literal(0), z.literal(1)]).transform((v) => v === 1),
  status: QueueRowStatusSchema,
  created_at: IsoDateTimeSchema,
  closed_at: IsoDateTimeSchema.nullable(),
});
export type ModerationQueueRow = z.infer<typeof ModerationQueueRowSchema>;

// ---------- /api/admin/moderation/* ----------

/** The owner's queue shows open and closed items; `retry` never reaches it. */
export const QueueStatusSchema = z.enum(["open", "closed"]);
export type QueueStatus = z.infer<typeof QueueStatusSchema>;

/** A held item as the owner sees it. There is no author: moderation never stores one. */
export const QueueItemSchema = z.object({
  id: ModerationIdSchema,
  kind: ModerationKindSchema,
  targetId: ModerationTargetIdSchema,
  course: CourseCodeSchema.nullable(),
  /** Null once blanked, 30 days after the item closed. */
  text: z.string().nullable(),
  reasons: z.array(ModerationReasonSchema),
  scores: ModerationScoresSchema,
  urgent: z.boolean(),
  status: QueueStatusSchema,
  createdAt: IsoDateTimeSchema,
  closedAt: IsoDateTimeSchema.nullable(),
  /** The owner's decision, for closed items. */
  resolution: z
    .object({
      decision: z.enum(["publish", "remove"]),
      reason: AdminReasonSchema.nullable(),
    })
    .nullable(),
});
export type QueueItem = z.infer<typeof QueueItemSchema>;

export const QueueListInputSchema = z.strictObject({
  status: QueueStatusSchema.default("open"),
  limit: z.number().int().min(1).max(100).default(50),
});
export type QueueListInput = z.infer<typeof QueueListInputSchema>;

export const QueueListResultSchema = z.object({
  items: z.array(QueueItemSchema),
  /** Open items in total, for the admin badge. */
  open: z.number().int().min(0),
});
export type QueueListResult = z.infer<typeof QueueListResultSchema>;

export const ResolveInputSchema = z.strictObject({
  id: ModerationIdSchema,
  action: z.enum(["approve", "remove"]),
  reason: AdminReasonSchema,
});
export type ResolveInput = z.infer<typeof ResolveInputSchema>;

export const UndoInputSchema = z.strictObject({ id: ModerationIdSchema });
export type UndoInput = z.infer<typeof UndoInputSchema>;

export const ResolveResultSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("ok"), item: QueueItemSchema }),
  z.object({ status: z.literal("not-found") }),
  /** Undo on an item that's still open, or whose ref was held again since. */
  z.object({ status: z.literal("nothing-to-undo") }),
]);
export type ResolveResult = z.infer<typeof ResolveResultSchema>;

// ---------- /api/reports/create (V2 §9.3; Reviews now, Chat later) ----------

/** Characters in a report's optional note. */
export const REPORT_NOTE_MAX = 300;

export const ReportCreateInputSchema = z.strictObject({
  surface: ModerationKindSchema,
  /** The review id, or a chat message's ref. */
  ref: ModerationTargetIdSchema,
  reason: ReportReasonSchema,
  note: z.string().trim().max(REPORT_NOTE_MAX).nullable(),
});
export type ReportCreateInput = z.infer<typeof ReportCreateInputSchema>;

export const ReportCreateResultSchema = z.discriminatedUnion("status", [
  /** Recorded, or already recorded: one report per person per item. */
  z.object({ status: z.literal("reported") }),
  /** Nothing readers can see has that ref, or its surface takes no reports yet. */
  z.object({ status: z.literal("not-found") }),
  /** The reporter wrote it; they can edit or delete it instead. */
  z.object({ status: z.literal("own") }),
]);
export type ReportCreateResult = z.infer<typeof ReportCreateResultSchema>;

/** A `reports` row. `reporter_id` is read only to count distinct people. */
export const ReportRowSchema = z.object({
  surface: ModerationKindSchema,
  ref: ModerationTargetIdSchema,
  reporter_id: z.string().min(1),
  reason: ReportReasonSchema,
  note: z.string().nullable(),
  created_at: IsoDateTimeSchema,
});
export type ReportRow = z.infer<typeof ReportRowSchema>;
