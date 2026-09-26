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

// ---------- D1 rows (migrations/0003_moderation.sql) ----------

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

export const ModerationActorSchema = z.enum(["auto", "admin"]);
export type ModerationActor = z.infer<typeof ModerationActorSchema>;

export const ModerationDecisionRowSchema = z.object({
  id: ModerationIdSchema,
  kind: ModerationKindSchema,
  target_id: ModerationTargetIdSchema,
  decision: ModerationDecisionSchema,
  actor: ModerationActorSchema,
  reasons: jsonColumn(z.array(ModerationReasonSchema)),
  models: jsonColumn(ModerationModelsSchema),
  scores: jsonColumn(ModerationScoresSchema),
  created_at: IsoDateTimeSchema,
});
export type ModerationDecisionRow = z.infer<typeof ModerationDecisionRowSchema>;

export const QueueStatusSchema = z.enum(["pending", "approved", "removed"]);
export type QueueStatus = z.infer<typeof QueueStatusSchema>;

export const ModerationQueueRowSchema = z.object({
  id: ModerationIdSchema,
  kind: ModerationKindSchema,
  target_id: ModerationTargetIdSchema,
  course: CourseCodeSchema.nullable(),
  text: z.string(),
  reasons: jsonColumn(z.array(ModerationReasonSchema)),
  scores: jsonColumn(ModerationScoresSchema),
  urgent: z.union([z.literal(0), z.literal(1)]).transform((v) => v === 1),
  status: QueueStatusSchema,
  created_at: IsoDateTimeSchema,
  resolved_at: IsoDateTimeSchema.nullable(),
  resolution_reason: AdminReasonSchema.nullable(),
  resolution_note: z.string().nullable(),
});
export type ModerationQueueRow = z.infer<typeof ModerationQueueRowSchema>;

// ---------- /api/admin/moderation/* ----------

/** A held item as the owner sees it. There is no author: moderation never stores one. */
export const QueueItemSchema = z.object({
  id: ModerationIdSchema,
  kind: ModerationKindSchema,
  targetId: ModerationTargetIdSchema,
  course: CourseCodeSchema.nullable(),
  text: z.string(),
  reasons: z.array(ModerationReasonSchema),
  scores: ModerationScoresSchema,
  urgent: z.boolean(),
  status: QueueStatusSchema,
  createdAt: IsoDateTimeSchema,
  resolvedAt: IsoDateTimeSchema.nullable(),
  resolutionReason: AdminReasonSchema.nullable(),
  resolutionNote: z.string().nullable(),
});
export type QueueItem = z.infer<typeof QueueItemSchema>;

export const QueueListInputSchema = z.strictObject({
  status: QueueStatusSchema.default("pending"),
  limit: z.number().int().min(1).max(100).default(50),
});
export type QueueListInput = z.infer<typeof QueueListInputSchema>;

export const QueueListResultSchema = z.object({
  items: z.array(QueueItemSchema),
  /** Pending items in total, for the admin badge. */
  pending: z.number().int().min(0),
});
export type QueueListResult = z.infer<typeof QueueListResultSchema>;

export const ResolveInputSchema = z.strictObject({
  id: ModerationIdSchema,
  action: z.enum(["approve", "remove"]),
  reason: AdminReasonSchema,
  note: z.string().trim().max(300).optional(),
});
export type ResolveInput = z.infer<typeof ResolveInputSchema>;

export const UndoInputSchema = z.strictObject({ id: ModerationIdSchema });
export type UndoInput = z.infer<typeof UndoInputSchema>;

export const ResolveResultSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("ok"), item: QueueItemSchema }),
  z.object({ status: z.literal("not-found") }),
  /** Undo on an item that has nothing to undo (still pending). */
  z.object({ status: z.literal("nothing-to-undo") }),
]);
export type ResolveResult = z.infer<typeof ResolveResultSchema>;
