import { z } from "zod";
import {
  AdminReasonSchema,
  DecidedBySchema,
  DecisionStageSchema,
  ModerationIdSchema,
  ModerationKindSchema,
  ModerationReasonSchema,
  ModerationTargetIdSchema,
  QueueItemSchema,
  StoredVerdictSchema,
} from "./moderation";
import { IsoDateSchema, IsoDateTimeSchema } from "./primitives";

// The owner's admin panel (docs/V2.md §10): the decision log, the health
// header, and test mode's sample items. The queue's own routes are in
// ./moderation (admin/moderation/*). Nothing here carries an author: the
// moderation tables never store one.

// ---------- /api/admin/decisions ----------

/**
 * Where the next page starts: the last row's `created_at` and id. Opaque to
 * the browser, checked here so a bad one is `invalid-input`, not a D1 error.
 */
export const DecisionCursorSchema = z
  .string()
  .regex(
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z~[A-Za-z0-9_-]{22}$/,
    "Expected a decision cursor",
  );
export type DecisionCursor = z.infer<typeof DecisionCursorSchema>;

export const DecisionListInputSchema = z.strictObject({
  surface: ModerationKindSchema.optional(),
  stage: DecisionStageSchema.optional(),
  verdict: StoredVerdictSchema.optional(),
  cursor: DecisionCursorSchema.optional(),
  limit: z.number().int().min(1).max(100).default(50),
});
export type DecisionListInput = z.infer<typeof DecisionListInputSchema>;

/** One row of the decision log, as the owner sees it: text-free, author-free. */
export const DecisionEntrySchema = z.object({
  id: ModerationIdSchema,
  kind: ModerationKindSchema,
  targetId: ModerationTargetIdSchema,
  stage: DecisionStageSchema,
  verdict: StoredVerdictSchema,
  decidedBy: DecidedBySchema,
  reasons: z.array(ModerationReasonSchema),
  /** The owner's reason, for their own decisions. */
  reason: AdminReasonSchema.nullable(),
  latencyMs: z.number().int().min(0).nullable(),
  createdAt: IsoDateTimeSchema,
});
export type DecisionEntry = z.infer<typeof DecisionEntrySchema>;

/** Automatic decisions on one UTC day, for the held share (V2 §9.2's 5% target). */
export const DecisionDaySchema = z.object({
  day: IsoDateSchema,
  allowed: z.number().int().min(0),
  held: z.number().int().min(0),
  rejected: z.number().int().min(0),
});
export type DecisionDay = z.infer<typeof DecisionDaySchema>;

export const DecisionListResultSchema = z.object({
  decisions: z.array(DecisionEntrySchema),
  /** Pass it back for the next page; null on the last one. */
  cursor: DecisionCursorSchema.nullable(),
  /** The last DECISION_DAYS days, newest first, for the surface filter only. */
  days: z.array(DecisionDaySchema),
});
export type DecisionListResult = z.infer<typeof DecisionListResultSchema>;

// ---------- /api/admin/health ----------

export const AdminHealthInputSchema = z.strictObject({});

/** The queue page's header (V2 §10). Counts only, never text. */
export const AdminHealthSchema = z.object({
  /** Model calls this UTC day (hedges and retries included) against MODERATION_DAILY_CAP. */
  aiCalls: z.object({
    today: z.number().int().min(0),
    cap: z.number().int().min(0),
  }),
  /** Held only because a check couldn't run; the cron screens these again. */
  retry: z.object({
    waiting: z.number().int().min(0),
    oldestAt: IsoDateTimeSchema.nullable(),
  }),
  /** Waiting for the owner. */
  queue: z.object({
    open: z.number().int().min(0),
    urgent: z.number().int().min(0),
    oldestAt: IsoDateTimeSchema.nullable(),
  }),
});
export type AdminHealth = z.infer<typeof AdminHealthSchema>;

// ---------- /api/admin/samples (test mode only) ----------

export const AdminSamplesInputSchema = z.strictObject({});

export const AdminSamplesResultSchema = z.object({
  items: z.array(QueueItemSchema),
});
export type AdminSamplesResult = z.infer<typeof AdminSamplesResultSchema>;
