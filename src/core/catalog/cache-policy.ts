// Published data files come in two kinds (BUILD.md §2): content-hashed files,
// whose bytes never change under a given name, and a few small pointer files
// (manifest.json, terms.json, seats.json, …) that are rewritten in place.

/** `name.<hex hash, 8+ chars>.json|bin`, e.g. `catalog/cmsc.3f9a1c0b.json`. */
const CONTENT_HASHED = /\.[0-9a-f]{8,}\.(?:json|bin)$/;

/** Seconds a pointer file may be reused before revalidating: one seat poll. */
export const POINTER_MAX_AGE_SECONDS = 60;

const ONE_YEAR_SECONDS = 31_536_000;

export function isContentHashedKey(key: string): boolean {
  return CONTENT_HASHED.test(key);
}

/**
 * `Cache-Control` for a data file. Hashed files are immutable. Everything else
 * gets a short max-age, so an unhashed file can never be stuck in a cache for
 * longer than a seat-poll interval.
 */
export function cacheControlFor(key: string): string {
  return isContentHashedKey(key)
    ? `public, max-age=${ONE_YEAR_SECONDS}, immutable`
    : `public, max-age=${POINTER_MAX_AGE_SECONDS}`;
}
