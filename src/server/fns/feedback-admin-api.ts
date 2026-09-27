// The feedback inbox's client (docs/FEEDBACK.md; admins only), apart from
// ./admin-api so the queue and the decision log never load the feedback
// schemas: only /admin/feedback imports it.
import type { z } from "zod";
import {
  FeedbackDeleteInputSchema,
  FeedbackDeleteResultSchema,
  FeedbackGroupInputSchema,
  FeedbackGroupResultSchema,
  FeedbackListInputSchema,
  FeedbackListResultSchema,
  FeedbackUpdateInputSchema,
  FeedbackUpdateResultSchema,
} from "~/core/schema/feedback";
import { type ApiOptions, call } from "./api";

export const feedbackAdminApi = {
  /** The feedback inbox, newest first, a page at a time. */
  feedbackList: (
    input: z.input<typeof FeedbackListInputSchema>,
    options?: ApiOptions,
  ) =>
    call(
      "admin/feedback/list",
      FeedbackListInputSchema,
      FeedbackListResultSchema,
      input,
      options,
    ),
  /** Status, note or group; Fixed emails someone who asked for a reply. */
  feedbackUpdate: (
    input: z.input<typeof FeedbackUpdateInputSchema>,
    options?: ApiOptions,
  ) =>
    call(
      "admin/feedback/update",
      FeedbackUpdateInputSchema,
      FeedbackUpdateResultSchema,
      input,
      options,
    ),
  /** Deletes, undoably for 10 seconds (`restore: true`). */
  feedbackDelete: (
    input: z.input<typeof FeedbackDeleteInputSchema>,
    options?: ApiOptions,
  ) =>
    call(
      "admin/feedback/delete",
      FeedbackDeleteInputSchema,
      FeedbackDeleteResultSchema,
      input,
      options,
    ),
  /** Groups the open items again with Workers AI. */
  feedbackGroup: (options?: ApiOptions) =>
    call(
      "admin/feedback/group",
      FeedbackGroupInputSchema,
      FeedbackGroupResultSchema,
      {},
      options,
    ),
} as const;
