// Terpsicle Todo's routes (docs/V3.md §3.8), signed in only. Apart from
// ~/server/fns/api so the scheduler's bundle never carries Todo's schemas.
import type { z } from "zod";
import {
  TodoConnectInputSchema,
  TodoConnectResultSchema,
  TodoDisconnectInputSchema,
  TodoDisconnectResultSchema,
  TodoDoneInputSchema,
  TodoDoneResultSchema,
  TodoImportFileInputSchema,
  TodoImportFileResultSchema,
  TodoListInputSchema,
  TodoListResultSchema,
  TodoRefreshInputSchema,
  TodoRefreshResultSchema,
} from "~/core/schema";
import { type ApiOptions, call } from "./api";

export const todoApi = {
  /** The feed link goes here and nowhere else; clear it after the answer. */
  connect: (
    input: z.input<typeof TodoConnectInputSchema>,
    options?: ApiOptions,
  ) =>
    call(
      "todo/connect",
      TodoConnectInputSchema,
      TodoConnectResultSchema,
      input,
      options,
    ),
  /** Call after the Undo toast is gone: it deletes the link and its items. */
  disconnect: (options?: ApiOptions) =>
    call(
      "todo/disconnect",
      TodoDisconnectInputSchema,
      TodoDisconnectResultSchema,
      {},
      options,
    ),
  list: (input: z.input<typeof TodoListInputSchema>, options?: ApiOptions) =>
    call(
      "todo/list",
      TodoListInputSchema,
      TodoListResultSchema,
      input,
      options,
    ),
  done: (input: z.input<typeof TodoDoneInputSchema>, options?: ApiOptions) =>
    call(
      "todo/done",
      TodoDoneInputSchema,
      TodoDoneResultSchema,
      input,
      options,
    ),
  /** At most once per 5 minutes; `too-soon` otherwise. */
  refresh: (options?: ApiOptions) =>
    call(
      "todo/refresh",
      TodoRefreshInputSchema,
      TodoRefreshResultSchema,
      {},
      options,
    ),
  /** Only the structured items: never the file's text. */
  importFile: (
    input: z.input<typeof TodoImportFileInputSchema>,
    options?: ApiOptions,
  ) =>
    call(
      "todo/import-file",
      TodoImportFileInputSchema,
      TodoImportFileResultSchema,
      input,
      options,
    ),
} as const;
