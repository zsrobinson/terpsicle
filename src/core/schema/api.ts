import { z } from "zod";
import { ReviewSummarySchema } from "./planetterp";
import { EmailSchema, InstructorSlugSchema, IsoDateTimeSchema, SectionKeySchema, TermIdSchema } from "./primitives";

// Server function inputs and outputs, and D1 rows. Inputs are strict: they come
// from the network. Flow and SQL: docs/DATA.md §7.

/** 32 random bytes, base64url without padding. Only its SHA-256 is stored. */
export const TokenSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/, "Expected a 43-char token");
export type Token = z.infer<typeof TokenSchema>;

/** 16 random bytes, base64url without padding. */
export const SubscriptionIdSchema = z.string().regex(/^[A-Za-z0-9_-]{22}$/, "Expected a 22-char id");
export type SubscriptionId = z.infer<typeof SubscriptionIdSchema>;

export const SubscriptionStatusSchema = z.enum(["pending", "active", "unsubscribed"]);
export type SubscriptionStatus = z.infer<typeof SubscriptionStatusSchema>;

// ---------- alerts.subscribe ----------

export const SubscribeInputSchema = z.strictObject({
  email: EmailSchema,
  termId: TermIdSchema,
  sectionKey: SectionKeySchema,
});
export type SubscribeInput = z.infer<typeof SubscribeInputSchema>;

export const SubscribeResultSchema = z.discriminatedUnion("status", [
  /** New (or previously unsubscribed) watch; confirmation email sent. Only this reveals the manage token. */
  z.object({ status: z.literal("confirmation-sent"), subscriptionId: SubscriptionIdSchema, manageToken: TokenSchema }),
  /** A pending watch already existed; the confirmation email was sent again. */
  z.object({ status: z.literal("confirmation-resent") }),
  /** "You're already watching this". */
  z.object({ status: z.literal("already-watching") }),
  z.object({ status: z.literal("rate-limited"), retryAfterSeconds: z.number().int().min(1) }),
  /** Not a section in that term, or the term is archived. */
  z.object({ status: z.literal("unknown-section") }),
  /** Feature flag off or email not configured. */
  z.object({ status: z.literal("unavailable") }),
]);
export type SubscribeResult = z.infer<typeof SubscribeResultSchema>;

// ---------- alerts.confirm ----------

export const ConfirmInputSchema = z.strictObject({ token: TokenSchema });
export type ConfirmInput = z.infer<typeof ConfirmInputSchema>;

export const ConfirmResultSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("confirmed"), termId: TermIdSchema, sectionKey: SectionKeySchema }),
  z.object({ status: z.literal("already-confirmed"), termId: TermIdSchema, sectionKey: SectionKeySchema }),
  /** Unknown, used up, or expired. */
  z.object({ status: z.literal("invalid-token") }),
]);
export type ConfirmResult = z.infer<typeof ConfirmResultSchema>;

// ---------- alerts.lookup + alerts.unsubscribe (two steps: unsubscribing asks first) ----------

export const ManageInputSchema = z.strictObject({ token: TokenSchema });
export type ManageInput = z.infer<typeof ManageInputSchema>;

/** Step 1: what the unsubscribe page shows before the person confirms. */
export const LookupResultSchema = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("found"),
    termId: TermIdSchema,
    sectionKey: SectionKeySchema,
    subscriptionStatus: SubscriptionStatusSchema,
  }),
  z.object({ status: z.literal("invalid-token") }),
]);
export type LookupResult = z.infer<typeof LookupResultSchema>;

/** Step 2, after the person confirms. Idempotent. */
export const UnsubscribeResultSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("unsubscribed"), termId: TermIdSchema, sectionKey: SectionKeySchema }),
  z.object({ status: z.literal("invalid-token") }),
]);
export type UnsubscribeResult = z.infer<typeof UnsubscribeResultSchema>;

// ---------- alerts.status (refresh this browser's list) ----------

export const StatusInputSchema = z.strictObject({
  items: z.array(z.strictObject({ subscriptionId: SubscriptionIdSchema, manageToken: TokenSchema })).max(50),
});
export type StatusInput = z.infer<typeof StatusInputSchema>;

export const StatusResultSchema = z.object({
  /** Same order as the input. "unknown": no row matches that id and token. */
  items: z.array(
    z.object({
      subscriptionId: SubscriptionIdSchema,
      status: z.union([SubscriptionStatusSchema, z.literal("unknown")]),
    }),
  ),
});
export type StatusResult = z.infer<typeof StatusResultSchema>;

// ---------- reviewSummary ----------

export const ReviewSummaryInputSchema = z.strictObject({ slug: InstructorSlugSchema });
export type ReviewSummaryInput = z.infer<typeof ReviewSummaryInputSchema>;

/** On "unavailable" the UI hides the summary entirely (SPEC §4). */
export const ReviewSummaryResultSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("ok"), summary: ReviewSummarySchema }),
  z.object({
    status: z.literal("unavailable"),
    reason: z.enum(["no-reviews", "unknown-instructor", "daily-limit", "failed"]),
  }),
]);
export type ReviewSummaryResult = z.infer<typeof ReviewSummaryResultSchema>;

// ---------- D1 rows (validate on read) ----------

const nullableTime = IsoDateTimeSchema.nullable();
const nullableCount = z.number().int().min(0).nullable();

/** A row of `alert_subscriptions`. */
export const AlertSubscriptionRowSchema = z.object({
  id: SubscriptionIdSchema,
  email: EmailSchema,
  term_id: TermIdSchema,
  section_key: SectionKeySchema,
  status: SubscriptionStatusSchema,
  confirm_token_hash: z.string().nullable(),
  confirm_expires_at: nullableTime,
  manage_token_hash: z.string(),
  created_at: IsoDateTimeSchema,
  confirmed_at: nullableTime,
  unsubscribed_at: nullableTime,
  last_open: nullableCount,
  last_checked_at: nullableTime,
  last_notified_at: nullableTime,
  last_notified_open: nullableCount,
});
export type AlertSubscriptionRow = z.infer<typeof AlertSubscriptionRowSchema>;

/** A row of `email_sends`. */
export const EmailSendRowSchema = z.object({
  id: z.number().int(),
  email: EmailSchema,
  subscription_id: SubscriptionIdSchema.nullable(),
  kind: z.enum(["confirm", "seat-open"]),
  dedupe_key: z.string(),
  status: z.enum(["sent", "failed"]),
  provider_id: z.string().nullable(),
  sent_at: IsoDateTimeSchema,
});
export type EmailSendRow = z.infer<typeof EmailSendRowSchema>;
