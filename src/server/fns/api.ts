// The browser's typed client for /api/* (the one server module UI code may
// import). Inputs are checked before sending and answers are validated with
// the same schemas the Worker uses, so a mismatch fails loudly here instead
// of rendering something half-right.
import type { z } from "zod";
import {
  AccountDeleteInputSchema,
  AccountDeleteResultSchema,
  AdminHealthInputSchema,
  AdminHealthSchema,
  AdminSamplesInputSchema,
  AdminSamplesResultSchema,
  type ApiError,
  ApiErrorSchema,
  ConfirmInputSchema,
  ConfirmResultSchema,
  DecisionListInputSchema,
  DecisionListResultSchema,
  LookupResultSchema,
  ManageInputSchema,
  MeInputSchema,
  MeResultSchema,
  QueueListInputSchema,
  QueueListResultSchema,
  ReportCreateInputSchema,
  ReportCreateResultSchema,
  ResolveInputSchema,
  ResolveResultSchema,
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
  ReviewWriteResultSchema,
  SignOutInputSchema,
  SignOutResultSchema,
  StatusInputSchema,
  StatusResultSchema,
  SubscribeInputSchema,
  SubscribeResultSchema,
  SyncPullInputSchema,
  SyncPullResultSchema,
  SyncPushInputSchema,
  SyncPushResultSchema,
  TestSignInInputSchema,
  TestSignInResultSchema,
  UndoInputSchema,
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
  /** The owner's panel (docs/V2.md §10); admins only. */
  admin: {
    /** Held items: open (urgent first, then oldest) or recently closed. */
    queue: (
      input: z.input<typeof QueueListInputSchema>,
      options?: ApiOptions,
    ) =>
      call(
        "admin/moderation/queue",
        QueueListInputSchema,
        QueueListResultSchema,
        input,
        options,
      ),
    /** Approves or removes a held item, at once; undo puts it back. */
    resolve: (
      input: z.input<typeof ResolveInputSchema>,
      options?: ApiOptions,
    ) =>
      call(
        "admin/moderation/resolve",
        ResolveInputSchema,
        ResolveResultSchema,
        input,
        options,
      ),
    undo: (input: z.input<typeof UndoInputSchema>, options?: ApiOptions) =>
      call(
        "admin/moderation/undo",
        UndoInputSchema,
        ResolveResultSchema,
        input,
        options,
      ),
    /** The decision log, a page at a time, with each day's counts. */
    decisions: (
      input: z.input<typeof DecisionListInputSchema>,
      options?: ApiOptions,
    ) =>
      call(
        "admin/decisions",
        DecisionListInputSchema,
        DecisionListResultSchema,
        input,
        options,
      ),
    /** The numbers on the queue page's header. */
    health: (options?: ApiOptions) =>
      call(
        "admin/health",
        AdminHealthInputSchema,
        AdminHealthSchema,
        {},
        options,
      ),
    /** Test mode only: made-up held items to try the panel on. */
    samples: (options?: ApiOptions) =>
      call(
        "admin/samples",
        AdminSamplesInputSchema,
        AdminSamplesResultSchema,
        {},
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
