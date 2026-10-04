import type { MutationKey, QueryClient } from "@tanstack/react-query";

// Optimistic changes (docs/decisions.md, "TanStack Query for server data")
// ask for the server's copy once the last change of a run has settled: an
// earlier change's answer would land over a later one still on its way.
// Here, beside the queries, so features and the data layer can both use it;
// a type import only, so it adds no Query code to a page's first load.

/** Per client, each run with a settled change waiting to be counted, and what it asks for then. */
const waiting = new WeakMap<QueryClient, Map<string, () => void>>();

/**
 * Once the last change under `mutationKey` has settled, `refetch`. Call it
 * from each change's `onSettled`. It counts on the next task, once this
 * change's own end is recorded: in `onSettled` a change is still pending,
 * so two that end in the same tick would each count the other, and neither
 * would ask. Changes that end together ask once, with the last one's
 * `refetch`.
 */
export function refetchWhenRunSettles(
  client: QueryClient,
  mutationKey: MutationKey,
  refetch: () => void,
): void {
  const runs = waiting.get(client) ?? new Map<string, () => void>();
  waiting.set(client, runs);
  const run = JSON.stringify(mutationKey);
  const counting = runs.has(run);
  runs.set(run, refetch);
  if (counting) return;
  setTimeout(() => {
    const last = runs.get(run);
    runs.delete(run);
    if (client.isMutating({ mutationKey }) === 0) last?.();
  }, 0);
}
