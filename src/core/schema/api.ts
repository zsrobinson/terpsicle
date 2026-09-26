import { z } from "zod";
import { ReviewSummarySchema } from "./planetterp";
import { CourseCodeSchema, InstructorSlugSchema } from "./primitives";

// The JSON API under /api/* (inputs, results, errors). Inputs are strict:
// they come from the network. Flow and SQL: docs/DATA.md §7.

/** 32 random bytes, base64url without padding. Only its SHA-256 is stored. */
export const TokenSchema = z
  .string()
  .regex(/^[A-Za-z0-9_-]{43}$/, "Expected a 43-char token");
export type Token = z.infer<typeof TokenSchema>;

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
