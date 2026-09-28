// The browser's typed client for /api/* (with ./admin-api, the only server
// modules UI code may import). Inputs are checked before sending and answers are validated with
// the same schemas the Worker uses, so a mismatch fails loudly here instead
// of rendering something half-right.
import type { z } from "zod";
import {
  AccountDeleteInputSchema,
  AccountDeleteResultSchema,
  type ApiError,
  ApiErrorSchema,
  MeInputSchema,
  MeResultSchema,
  PageReviewsSchema,
  PlanetTerpReviewsInputSchema,
  PlanetTerpReviewsResultSchema,
  ReportCreateInputSchema,
  ReportCreateResultSchema,
  ReviewDeleteInputSchema,
  ReviewDeleteResultSchema,
  ReviewEditInputSchema,
  ReviewListInputSchema,
  ReviewListResultSchema,
  ReviewSubmitInputSchema,
  ReviewSummaryInputSchema,
  ReviewSummaryResultSchema,
  ReviewsMineInputSchema,
  ReviewsMineResultSchema,
  ReviewsPageInputSchema,
  ReviewsRecentInputSchema,
  ReviewsRecentResultSchema,
  ReviewWriteResultSchema,
  SeatUnwatchResultSchema,
  SeatWatchInputSchema,
  SeatWatchListInputSchema,
  SeatWatchListResultSchema,
  SeatWatchResultSchema,
  SignOutInputSchema,
  SignOutResultSchema,
  SyncPullInputSchema,
  SyncPullResultSchema,
  SyncPushInputSchema,
  SyncPushResultSchema,
  TestSignInInputSchema,
  TestSignInResultSchema,
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

/** A call that failed: its route and status (0 without a network), never a body. */
export interface ApiFailure {
  route: string;
  status: number;
}

let failureListener: ((failure: ApiFailure) => void) | undefined;

/**
 * Hears every failed call, for the feedback activity log
 * (src/app/activity-log.ts). One listener; null removes it.
 */
export function onApiFailure(
  listener: ((failure: ApiFailure) => void) | null,
): void {
  failureListener = listener ?? undefined;
}

export interface ApiOptions {
  /** Defaults to the page's origin. */
  baseUrl?: string;
  fetcher?: typeof fetch;
  signal?: AbortSignal;
}

/** One typed POST to /api/<path>; ./admin-api and ./todo share it. */
export async function call<I extends z.ZodType, O extends z.ZodType>(
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
    if (!options.signal?.aborted)
      failureListener?.({ route: `/api/${path}`, status: 0 });
    throw new ApiCallError("network");
  }
  if (!response.ok)
    failureListener?.({ route: `/api/${path}`, status: response.status });
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
  /** Who's signed in, and what's on (docs/AUTH.md). Called on every app load. */
  me: (options?: ApiOptions) =>
    call("me", MeInputSchema, MeResultSchema, {}, options),
  auth: {
    /** Ends this device's session; plans stay on the device. */
    signOut: (
      input: z.input<typeof SignOutInputSchema>,
      options?: ApiOptions,
    ) =>
      call(
        "auth/sign-out",
        SignOutInputSchema,
        SignOutResultSchema,
        input,
        options,
      ),
    /** Test mode only: sign in as one of TEST_USERS. */
    testSignIn: (
      input: z.input<typeof TestSignInInputSchema>,
      options?: ApiOptions,
    ) =>
      call(
        "auth/test-sign-in",
        TestSignInInputSchema,
        TestSignInResultSchema,
        input,
        options,
      ),
  },
  account: {
    /** Signs out everywhere; the account goes after a week unless they sign in. */
    delete: (options?: ApiOptions) =>
      call(
        "account/delete",
        AccountDeleteInputSchema,
        AccountDeleteResultSchema,
        {},
        options,
      ),
  },
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
  /** Seat watches (V2.md §6.5); signed in only. */
  alerts: {
    /** Idempotent: "watching" whether it was on already or not. */
    watch: (
      input: z.input<typeof SeatWatchInputSchema>,
      options?: ApiOptions,
    ) =>
      call(
        "alerts/watch",
        SeatWatchInputSchema,
        SeatWatchResultSchema,
        input,
        options,
      ),
    /** Idempotent: "stopped" whether it was on or not. */
    unwatch: (
      input: z.input<typeof SeatWatchInputSchema>,
      options?: ApiOptions,
    ) =>
      call(
        "alerts/unwatch",
        SeatWatchInputSchema,
        SeatUnwatchResultSchema,
        input,
        options,
      ),
    /** Every watch, newest first; "unavailable" while seat alerts are off. */
    list: (
      input: z.input<typeof SeatWatchListInputSchema> = {},
      options?: ApiOptions,
    ) =>
      call(
        "alerts/list",
        SeatWatchListInputSchema,
        SeatWatchListResultSchema,
        input,
        options,
      ),
  },
  /** Plan sync (docs/V2.md §5.3); signed in only. */
  sync: {
    /** Saves docs, each only if the server's rev is still its `baseRev`. */
    push: (input: z.input<typeof SyncPushInputSchema>, options?: ApiOptions) =>
      call(
        "sync/push",
        SyncPushInputSchema,
        SyncPushResultSchema,
        input,
        options,
      ),
    /** One page of docs saved since `since`; pull again while `more`. */
    pull: (input: z.input<typeof SyncPullInputSchema>, options?: ApiOptions) =>
      call(
        "sync/pull",
        SyncPullInputSchema,
        SyncPullResultSchema,
        input,
        options,
      ),
  },
  /** Terpsicle Reviews (docs/V2.md §7.4). Reading needs no sign-in. */
  reviews: {
    /** A page of an instructor's published reviews, newest first. */
    list: (
      input: z.input<typeof ReviewListInputSchema>,
      options?: ApiOptions,
    ) =>
      call(
        "reviews/list",
        ReviewListInputSchema,
        ReviewListResultSchema,
        input,
        options,
      ),
    /** A page's first reviews: all of ours and PlanetTerp's newest. */
    page: (
      input: z.input<typeof ReviewsPageInputSchema>,
      options?: ApiOptions,
    ) =>
      call(
        "reviews/page",
        ReviewsPageInputSchema,
        PageReviewsSchema,
        input,
        options,
      ),
    /** More of PlanetTerp's reviews, after `cursor`. */
    planetTerp: (
      input: z.input<typeof PlanetTerpReviewsInputSchema>,
      options?: ApiOptions,
    ) =>
      call(
        "planetterp/reviews",
        PlanetTerpReviewsInputSchema,
        PlanetTerpReviewsResultSchema,
        input,
        options,
      ),
    /** The newest reviewed courses and instructors, for /reviews. */
    recent: (
      input: z.input<typeof ReviewsRecentInputSchema>,
      options?: ApiOptions,
    ) =>
      call(
        "reviews/recent",
        ReviewsRecentInputSchema,
        ReviewsRecentResultSchema,
        input,
        options,
      ),
    /** Checked as it's sent (a few seconds): show "Checking…". */
    submit: (
      input: z.input<typeof ReviewSubmitInputSchema>,
      options?: ApiOptions,
    ) =>
      call(
        "reviews/submit",
        ReviewSubmitInputSchema,
        ReviewWriteResultSchema,
        input,
        options,
      ),
    edit: (
      input: z.input<typeof ReviewEditInputSchema>,
      options?: ApiOptions,
    ) =>
      call(
        "reviews/edit",
        ReviewEditInputSchema,
        ReviewWriteResultSchema,
        input,
        options,
      ),
    /** Call after the Undo toast is gone: a delete is final. */
    delete: (
      input: z.input<typeof ReviewDeleteInputSchema>,
      options?: ApiOptions,
    ) =>
      call(
        "reviews/delete",
        ReviewDeleteInputSchema,
        ReviewDeleteResultSchema,
        input,
        options,
      ),
    mine: (options?: ApiOptions) =>
      call(
        "reviews/mine",
        ReviewsMineInputSchema,
        ReviewsMineResultSchema,
        {},
        options,
      ),
  },
  reports: {
    /** One report per person per item (V2 §9.3). */
    create: (
      input: z.input<typeof ReportCreateInputSchema>,
      options?: ApiOptions,
    ) =>
      call(
        "reports/create",
        ReportCreateInputSchema,
        ReportCreateResultSchema,
        input,
        options,
      ),
  },
} as const;
