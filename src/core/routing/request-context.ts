import type { ReviewsServerData } from "../reviews/pages";

// What the Worker hands TanStack Start for each page it renders
// (`app.fetch(request, { context })`); route loaders read it as
// `serverContext`, and it's undefined in the browser. It keeps Worker
// bindings out of the app: the app sees these functions, never R2 or D1.

/** Published files by DATA.md key, from the Worker's R2 bucket. */
export interface PublishedFiles {
  /** The parsed JSON at `key`; null when there's no such file. */
  readJson(key: string): Promise<unknown>;
}

export interface PageRequestContext {
  published: PublishedFiles;
  /** Null while REVIEWS_ENABLED is off. */
  reviews: ReviewsServerData | null;
}
