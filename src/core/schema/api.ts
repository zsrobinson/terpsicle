import { z } from "zod";

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
