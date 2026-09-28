import { z } from "zod";

// The query cache's rows in IndexedDB (docs/DATA.md §5.5): one per persisted
// query, as TanStack Query's per-query persister writes it. Read back
// before the persister trusts it; a row that doesn't read is dropped and
// the query fetches again.

/** A persisted query: the parts the persister reads, the rest kept as is. */
export const PersistedQueryRowSchema = z.looseObject({
  buster: z.string(),
  queryHash: z.string(),
  queryKey: z.array(z.unknown()),
  state: z.looseObject({
    data: z.unknown(),
    dataUpdatedAt: z.number(),
    errorUpdatedAt: z.number(),
  }),
});
export type PersistedQueryRow = z.infer<typeof PersistedQueryRowSchema>;

/** The query cache's own database, apart from the plans in `terpsicle`. */
export const QUERY_CACHE_DB_NAME = "terpsicle-query";
export const QUERY_CACHE_DB_VERSION = 1;
