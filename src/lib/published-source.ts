import { createDataSource, type DataSource } from "~/state/data-source";
import { connectPublished, usePublishedSource } from "~/state/query/published";
import { clientConfig } from "./config";

// The published data a page's queries read (~/state/query), for products
// that don't boot the scheduler's stores: Home and Chat. The scheduler
// connects its own source when it boots; a page that opened somewhere else
// connects one here, once, for the rest of the page. Imported only by
// modules loaded on first use, since it brings the data layer
// (scripts/check-bundle.ts keeps src/state out of their first loads).

let opening: Promise<DataSource> | null = null;

/**
 * The page's published data: the source another product already
 * connected, else one of its own, connected for the rest of the page.
 */
export function pageSource(): Promise<DataSource> {
  const connected = usePublishedSource.getState().source;
  if (connected) return Promise.resolve(connected);
  opening ??= createDataSource(clientConfig).then(
    (source) => {
      if (!usePublishedSource.getState().source) connectPublished(source);
      return usePublishedSource.getState().source ?? source;
    },
    (error: unknown) => {
      // The next read tries again.
      opening = null;
      throw error;
    },
  );
  return opening;
}

/** Forgets the page's own source (tests). */
export function resetPageSource(): void {
  opening = null;
}
