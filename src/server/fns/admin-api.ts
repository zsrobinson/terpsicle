// The owner's panel's client (docs/V2.md §10; admins only), apart from
// ./api so /schedule and the other pages never load its schemas: only
// src/features/admin imports it, and that loads with /admin.
import type { z } from "zod";
import {
  AdminHealthInputSchema,
  AdminHealthSchema,
  AdminSamplesInputSchema,
  AdminSamplesResultSchema,
  DecisionListInputSchema,
  DecisionListResultSchema,
} from "~/core/schema/admin";
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
} as const;
