import {
  MutationObserver,
  mutationOptions,
  type QueryClient,
  queryOptions,
} from "@tanstack/react-query";
import type { z } from "zod";
import type {
  FeedbackPinInputSchema,
  FeedbackPinResult,
  FeedbackUndoResult,
  Pin,
} from "~/core/schema/feedback";
import { retryApi } from "~/server/fns/api";
import { feedbackApi } from "~/server/fns/feedback-api";

// The admin's pinned notes on a route (docs/FEEDBACK.md "Pinned notes") as
// TanStack Query (docs/decisions.md "TanStack Query for server data and its
// caching"): one query per pathname, asked for on each visit. Pinning and
// taking a pin back (Undo) are optimistic mutations over it: the dot comes
// or goes at once, a failure puts the list back, and once either settles
// the route's pins are asked for again (the server numbers them). Only
// admins load this (./admin-layer, lazily); nothing is persisted.

export const pinKeys = {
  all: ["feedback-pins"] as const,
  route: (pathname: string) => ["feedback-pins", "route", pathname] as const,
  pin: ["feedback-pins", "pin"] as const,
  unpin: ["feedback-pins", "unpin"] as const,
};

/** The notes pinned on `pathname` (no search), in the order they were left. */
export function pinsQuery(pathname: string) {
  return queryOptions({
    queryKey: pinKeys.route(pathname),
    queryFn: async ({ signal }): Promise<readonly Pin[]> =>
      (await feedbackApi.pins({ pathname }, { signal })).pins,
    // Each visit asks again: another tab or device may have pinned since.
    staleTime: 0,
    retry: retryApi,
    networkMode: "always",
  });
}

/** Where a pending pin's id starts: the server's ids never do. */
const PENDING = "pending:";
let pendingCount = 0;

/** Whether a pin is still on its way to the server. */
export function isPendingPin(pin: Pin): boolean {
  return pin.id.startsWith(PENDING);
}

/** The number the next pin on a route gets: one past the highest shown. */
export function nextPinNumber(pins: readonly Pin[]): number {
  return pins.reduce((top, p) => Math.max(top, p.number), 0) + 1;
}

export interface PinNote {
  /** The route whose pins it joins (`pinsQuery`). */
  pathname: string;
  input: z.input<typeof FeedbackPinInputSchema>;
  /** When it was pinned, for the dot shown until the server answers. */
  at: Date;
}

/**
 * Pinning a note: its dot shows at once, numbered after the route's last,
 * and goes again if the server didn't take it. Offline, it fails at once,
 * as it always has, so the note box can say so.
 */
export function pinMutation() {
  return mutationOptions({
    mutationKey: pinKeys.pin,
    networkMode: "always",
    mutationFn: ({ input }: PinNote): Promise<FeedbackPinResult> =>
      feedbackApi.pin(input),
    onMutate: ({ pathname, input, at }, { client }) => {
      const key = pinKeys.route(pathname);
      // An answer on its way would land over the new dot.
      void client.cancelQueries({ queryKey: key });
      pendingCount += 1;
      const shown = client.getQueryData<readonly Pin[]>(key) ?? [];
      const pending: Pin = {
        id: `${PENDING}${pendingCount}`,
        number: nextPinNumber(shown),
        text: input.text.trim(),
        status: "new",
        element: input.element,
        createdAt: at.toISOString(),
      };
      client.setQueryData<readonly Pin[]>(key, [...shown, pending]);
      return { pendingId: pending.id };
    },
    onSuccess: (result, { pathname }, context, { client }) => {
      // The server's id, until the route's pins come back.
      client.setQueryData<readonly Pin[]>(pinKeys.route(pathname), (pins) =>
        pins?.map((p) =>
          p.id === context.pendingId ? { ...p, id: result.id } : p,
        ),
      );
    },
    onError: (_error, { pathname }, context, { client }) => {
      if (!context) return;
      client.setQueryData<readonly Pin[]>(pinKeys.route(pathname), (pins) =>
        pins?.filter((p) => p.id !== context.pendingId),
      );
    },
    onSettled: (_data, _error, { pathname }, _context, { client }) =>
      client.invalidateQueries({ queryKey: pinKeys.route(pathname) }),
  });
}

export interface Unpin {
  pathname: string;
  id: string;
  undoToken: string;
}

/**
 * Taking a pin back (the toast's Undo): its dot goes at once, and comes
 * back if the server didn't take it back (too late, or a failure). The
 * caller says which.
 */
export function unpinMutation() {
  return mutationOptions({
    mutationKey: pinKeys.unpin,
    networkMode: "always",
    mutationFn: ({ id, undoToken }: Unpin): Promise<FeedbackUndoResult> =>
      feedbackApi.undo({ id, undoToken }),
    onMutate: ({ pathname, id }, { client }) => {
      const key = pinKeys.route(pathname);
      void client.cancelQueries({ queryKey: key });
      const before = client.getQueryData<readonly Pin[]>(key);
      if (before)
        client.setQueryData<readonly Pin[]>(
          key,
          before.filter((p) => p.id !== id),
        );
      return { before, shown: client.getQueryData<readonly Pin[]>(key) };
    },
    onSuccess: ({ status }, { pathname }, context, { client }) => {
      if (status !== "undone") putBack(client, pathname, context);
    },
    onError: (_error, { pathname }, context, { client }) =>
      putBack(client, pathname, context),
    onSettled: (_data, _error, { pathname }, _context, { client }) =>
      client.invalidateQueries({ queryKey: pinKeys.route(pathname) }),
  });
}

/** The pins as they were, while nothing newer shows. */
function putBack(
  client: QueryClient,
  pathname: string,
  context: { before: readonly Pin[] | undefined; shown: unknown } | undefined,
): void {
  const key = pinKeys.route(pathname);
  if (context?.before && client.getQueryData(key) === context.shown)
    client.setQueryData(key, context.before);
}

/**
 * Takes a pin back, outside any component: the toast's Undo outlives the
 * note box that pinned it.
 */
export function unpin(
  client: QueryClient,
  variables: Unpin,
): Promise<FeedbackUndoResult> {
  return new MutationObserver(client, unpinMutation()).mutate(variables);
}
