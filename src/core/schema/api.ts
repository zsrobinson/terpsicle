import { z } from "zod";
import { ReviewSummarySchema } from "./planetterp";
import {
  CourseCodeSchema,
  EmailSchema,
  InstructorSlugSchema,
  IsoDateTimeSchema,
  SectionKeySchema,
  TermIdSchema,
} from "./primitives";

// The JSON API under /api/* (inputs, results, errors) and the D1 rows behind
// it. Inputs are strict: they come from the network. Flow and SQL:
// docs/DATA.md §7.

/** 32 random bytes, base64url without padding. Only its SHA-256 is stored. */
export const TokenSchema = z
  .string()
  .regex(/^[A-Za-z0-9_-]{43}$/, "Expected a 43-char token");
export type Token = z.infer<typeof TokenSchema>;

/** 16 random bytes, base64url without padding. */
export const SubscriptionIdSchema = z
  .string()
  .regex(/^[A-Za-z0-9_-]{22}$/, "Expected a 22-char id");
export type SubscriptionId = z.infer<typeof SubscriptionIdSchema>;

export const SubscriptionStatusSchema = z.enum([
  "pending",
  "active",
  "unsubscribed",
]);
export type SubscriptionStatus = z.infer<typeof SubscriptionStatusSchema>;

/**
 * Any non-2xx answer from /api/*. Endpoints report expected outcomes in their
 * result (200); this is for bad input, rate limits and the feature flag.
 */
export const ApiErrorSchema = z.object({
  error: z.enum([
    "invalid-input",
    "rate-limited",
    "unavailable",
    "not-found",
    "method-not-allowed",
    /** No session, or it expired: sign in again. */
    "unauthorized",
    /** Signed in, but not allowed (an admin-only route). */
    "forbidden",
  ]),
  /** Set with "rate-limited". */
  retryAfterSeconds: z.number().int().min(1).optional(),
});
export type ApiError = z.infer<typeof ApiErrorSchema>;

// ---------- POST /api/alerts/subscribe ----------

export const SubscribeInputSchema = z.strictObject({
  /** Trimmed and lowercased, so one person has one address. */
  email: z.string().trim().toLowerCase().pipe(EmailSchema),
  termId: TermIdSchema,
  sectionKey: SectionKeySchema,
});
export type SubscribeInput = z.infer<typeof SubscribeInputSchema>;

/**
 * The same answer whether the address is new, pending, already watching or
 * unsubscribed, so the API never reveals who watches what. The email says
 * which: a confirmation link, or "You're already watching this".
 */
export const SubscribeResultSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("check-email") }),
  /** Too many requests from this network. */
  z.object({
    status: z.literal("rate-limited"),
    retryAfterSeconds: z.number().int().min(1),
  }),
  /** Not a section in that term, or the term is archived. */
  z.object({ status: z.literal("unknown-section") }),
  /** Seat alerts are off (flag) or email isn't configured here. */
  z.object({ status: z.literal("unavailable") }),
]);
export type SubscribeResult = z.infer<typeof SubscribeResultSchema>;

// ---------- POST /api/alerts/confirm ----------

export const ConfirmInputSchema = z.strictObject({ token: TokenSchema });
export type ConfirmInput = z.infer<typeof ConfirmInputSchema>;

export const ConfirmResultSchema = z.discriminatedUnion("status", [
  /**
   * Now active ("Watching"). The manage token goes to the browser that
   * followed the link (holding the emailed token proves the address), which
   * keeps it for `status` and in-app unsubscribe.
   */
  z.object({
    status: z.literal("confirmed"),
    termId: TermIdSchema,
    sectionKey: SectionKeySchema,
    subscriptionId: SubscriptionIdSchema,
    manageToken: TokenSchema,
  }),
  /** The link was used before; the watch is active. */
  z.object({
    status: z.literal("already-confirmed"),
    termId: TermIdSchema,
    sectionKey: SectionKeySchema,
  }),
  /** Unknown or expired. */
  z.object({ status: z.literal("invalid-token") }),
]);
export type ConfirmResult = z.infer<typeof ConfirmResultSchema>;

// ---------- POST /api/alerts/lookup + /api/alerts/unsubscribe ----------
// Two steps: unsubscribing asks first (SPEC §3.12).

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
  z.object({
    status: z.literal("unsubscribed"),
    termId: TermIdSchema,
    sectionKey: SectionKeySchema,
  }),
  z.object({ status: z.literal("invalid-token") }),
]);
export type UnsubscribeResult = z.infer<typeof UnsubscribeResultSchema>;

// ---------- POST /api/alerts/status (refresh this browser's list) ----------

export const StatusInputSchema = z.strictObject({
  items: z
    .array(
      z.strictObject({
        subscriptionId: SubscriptionIdSchema,
        manageToken: TokenSchema,
      }),
    )
    .max(50),
});
export type StatusInput = z.infer<typeof StatusInputSchema>;

/**
 * The app asks on every load, so "seat alerts are off" is an answer here, not
 * an error: a 503 would log a console error on every visit while the flag is off.
 */
export const StatusResultSchema = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("ok"),
    /** Same order as the input. "unknown": no watch matches that id and token. */
    items: z.array(
      z.object({
        subscriptionId: SubscriptionIdSchema,
        status: z.union([SubscriptionStatusSchema, z.literal("unknown")]),
      }),
    ),
  }),
  z.object({ status: z.literal("unavailable") }),
]);
export type StatusResult = z.infer<typeof StatusResultSchema>;

// ---------- POST /api/review-summary ----------

export const ReviewSummaryInputSchema = z.strictObject({
  slug: InstructorSlugSchema,
  /**
   * The course being viewed. Its department's PlanetTerp file holds the
   * instructor's review count, which decides whether a cached summary is
   * stale. The summary itself covers every course.
   */
  course: CourseCodeSchema,
});
export type ReviewSummaryInput = z.infer<typeof ReviewSummaryInputSchema>;

/** On "unavailable" the UI hides the summary entirely (SPEC §4). */
export const ReviewSummaryResultSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("ok"), summary: ReviewSummarySchema }),
  z.object({
    status: z.literal("unavailable"),
    reason: z.enum([
      /** The instructor has no reviews. */
      "no-reviews",
      /** Not in the department's PlanetTerp data (or it isn't published yet). */
      "unknown-instructor",
      /** Today's generation cap is spent. */
      "daily-limit",
      /** Another request is generating it; ask again in a few seconds. */
      "busy",
      /** The model or PlanetTerp failed, or the output didn't validate twice. */
      "failed",
    ]),
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
  created_at: IsoDateTimeSchema,
  confirmed_at: nullableTime,
  unsubscribed_at: nullableTime,
  last_open: nullableCount,
  last_checked_at: nullableTime,
  last_notified_at: nullableTime,
  last_notified_open: nullableCount,
});
export type AlertSubscriptionRow = z.infer<typeof AlertSubscriptionRowSchema>;

export const AlertTokenPurposeSchema = z.enum(["confirm", "manage"]);
export type AlertTokenPurpose = z.infer<typeof AlertTokenPurposeSchema>;

/** A row of `alert_tokens`: one per token handed out, hash only. */
export const AlertTokenRowSchema = z.object({
  token_hash: z.string().regex(/^[0-9a-f]{64}$/),
  subscription_id: SubscriptionIdSchema,
  purpose: AlertTokenPurposeSchema,
  created_at: IsoDateTimeSchema,
  /** Confirm tokens expire; manage tokens don't. */
  expires_at: nullableTime,
  /** Set when a confirm token is used. */
  used_at: nullableTime,
});
export type AlertTokenRow = z.infer<typeof AlertTokenRowSchema>;

export const EmailKindSchema = z.enum([
  "confirm",
  "already-watching",
  "seat-open",
]);
export type EmailKind = z.infer<typeof EmailKindSchema>;

/** A row of `email_sends`. */
export const EmailSendRowSchema = z.object({
  id: z.number().int(),
  email: EmailSchema,
  subscription_id: SubscriptionIdSchema.nullable(),
  kind: EmailKindSchema,
  dedupe_key: z.string(),
  status: z.enum(["sent", "failed"]),
  provider_id: z.string().nullable(),
  sent_at: IsoDateTimeSchema,
});
export type EmailSendRow = z.infer<typeof EmailSendRowSchema>;
