// The browser's typed client for /api/* (the one server module UI code may
// import). Inputs are checked before sending and answers are validated with
// the same schemas the Worker uses, so a mismatch fails loudly here instead
// of rendering something half-right.
import type { z } from "zod";
import {
  type ApiError,
  ApiErrorSchema,
  ConfirmInputSchema,
  ConfirmResultSchema,
  LookupResultSchema,
  ManageInputSchema,
  ReviewSummaryInputSchema,
  ReviewSummaryResultSchema,
  StatusInputSchema,
  StatusResultSchema,
  SubscribeInputSchema,
  SubscribeResultSchema,
  UnsubscribeResultSchema,
} from "~/core/schema";

/** Why a call failed: an API error, no network, or an answer we don't understand. */
export class ApiCallError extends Error {
  constructor(
    readonly reason: ApiError["error"] | "network" | "bad-response",
    readonly retryAfterSeconds?: number,
  ) {
    super(`API call failed: ${reason}`);
    this.name = "ApiCallError";
  }
}

export interface ApiOptions {
  /** Defaults to the page's origin. */
  baseUrl?: string;
  fetcher?: typeof fetch;
  signal?: AbortSignal;
}

async function call<I extends z.ZodType, O extends z.ZodType>(
  path: string,
  inputSchema: I,
  outputSchema: O,
  input: z.input<I>,
  options: ApiOptions = {},
): Promise<z.infer<O>> {
  const body = inputSchema.safeParse(input);
  if (!body.success) throw new ApiCallError("invalid-input");
  const fetcher = options.fetcher ?? fetch;
  let response: Response;
  try {
    response = await fetcher(`${options.baseUrl ?? ""}/api/${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body.data),
      signal: options.signal,
    });
  } catch {
    throw new ApiCallError("network");
  }
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new ApiCallError("bad-response");
  }
  if (!response.ok) {
    const error = ApiErrorSchema.safeParse(payload);
    throw error.success
      ? new ApiCallError(error.data.error, error.data.retryAfterSeconds)
      : new ApiCallError("bad-response");
  }
  const result = outputSchema.safeParse(payload);
  if (!result.success) throw new ApiCallError("bad-response");
  return result.data;
}

export const api = {
  /** The instructor's review summary, or why there isn't one (hide it then). */
  reviewSummary: (
    input: z.input<typeof ReviewSummaryInputSchema>,
    options?: ApiOptions,
  ) =>
    call(
      "review-summary",
      ReviewSummaryInputSchema,
      ReviewSummaryResultSchema,
      input,
      options,
    ),
  alerts: {
    /** Always "check-email" on success; the email says what happened. */
    subscribe: (
      input: z.input<typeof SubscribeInputSchema>,
      options?: ApiOptions,
    ) =>
      call(
        "alerts/subscribe",
        SubscribeInputSchema,
        SubscribeResultSchema,
        input,
        options,
      ),
    /** From /alerts/confirm?token=…; "confirmed" carries this browser's manage token. */
    confirm: (
      input: z.input<typeof ConfirmInputSchema>,
      options?: ApiOptions,
    ) =>
      call(
        "alerts/confirm",
        ConfirmInputSchema,
        ConfirmResultSchema,
        input,
        options,
      ),
    /** Step 1 of unsubscribing: what would stop. */
    lookup: (input: z.input<typeof ManageInputSchema>, options?: ApiOptions) =>
      call(
        "alerts/lookup",
        ManageInputSchema,
        LookupResultSchema,
        input,
        options,
      ),
    /** Step 2, after the person confirms. */
    unsubscribe: (
      input: z.input<typeof ManageInputSchema>,
      options?: ApiOptions,
    ) =>
      call(
        "alerts/unsubscribe",
        ManageInputSchema,
        UnsubscribeResultSchema,
        input,
        options,
      ),
    /** Refreshes this browser's local list of watches. */
    status: (input: z.input<typeof StatusInputSchema>, options?: ApiOptions) =>
      call(
        "alerts/status",
        StatusInputSchema,
        StatusResultSchema,
        input,
        options,
      ),
  },
} as const;
