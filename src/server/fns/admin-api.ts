// The owner's panel's client (docs/V2.md §10; admins only), apart from
// ./api so /schedule and the other pages never load its schemas: only
// src/features/admin imports it, and that loads with /admin.
import type { z } from "zod";
import {
  AdminChatRemoveInputSchema,
  AdminHealthInputSchema,
  AdminHealthSchema,
  AdminSamplesInputSchema,
  AdminSamplesResultSchema,
  DecisionListInputSchema,
  DecisionListResultSchema,
} from "~/core/schema/admin";
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
import {
  QueueListInputSchema,
  QueueListResultSchema,
  ResolveInputSchema,
  ResolveResultSchema,
  UndoInputSchema,
} from "~/core/schema/moderation";
import { type ApiOptions, call } from "./api";

export const adminApi = {
  /** Held items: open (urgent first, then oldest) or recently closed. */
  queue: (input: z.input<typeof QueueListInputSchema>, options?: ApiOptions) =>
    call(
      "admin/moderation/queue",
      QueueListInputSchema,
      QueueListResultSchema,
      input,
      options,
    ),
  /** Approves or removes a held item, at once; undo puts it back. */
  resolve: (input: z.input<typeof ResolveInputSchema>, options?: ApiOptions) =>
    call(
      "admin/moderation/resolve",
      ResolveInputSchema,
      ResolveResultSchema,
      input,
      options,
    ),
  /** Removes a chat message found outside the queue, as a decided queue item. */
  chatRemove: (
    input: z.input<typeof AdminChatRemoveInputSchema>,
    options?: ApiOptions,
  ) =>
    call(
      "admin/chat/remove",
      AdminChatRemoveInputSchema,
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
