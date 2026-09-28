// The context the Worker hands TanStack Start for each page
// (`PageRequestContext`, read by route loaders as `serverContext`): published
// files straight from R2, and Terpsicle's review numbers from D1 while
// REVIEWS_ENABLED allows reading. A server render never fetches /data.
import type { PageRequestContext, PublishedFiles } from "~/core/routing";
import { FeatureVarsSchema } from "~/core/schema";
import { r2Json } from "../published";
import { pageReviews, reviewsServerData } from "../reviews/public";

/**
 * Content-hashed files never change, so an isolate keeps the newest few,
 * parsed: a render that misses the edge cache still skips re-reading and
 * re-parsing PlanetTerp's index (hundreds of KB) and the department files.
 * Only settled values are kept; a read in flight belongs to its request,
 * and workerd won't let another request wait on it.
 */
const HASHED = /\.[0-9a-f]{16}\.json$/;
const KEPT_FILES = 32;
const kept = new Map<string, unknown>();

export function r2PublishedFiles(bucket: R2Bucket): PublishedFiles {
  const readR2Json = r2Json(bucket);
  return {
    async readJson(key) {
      if (!HASHED.test(key)) return readR2Json(key);
      if (kept.has(key)) {
        const hit = kept.get(key);
        // Newest last: a Map keeps insertion order.
        kept.delete(key);
        kept.set(key, hit);
        return hit;
      }
      const value = await readR2Json(key);
      if (value === null) return null;
      kept.set(key, value);
      for (const oldest of kept.keys()) {
        if (kept.size <= KEPT_FILES) break;
        kept.delete(oldest);
      }
      return value;
    },
  };
}

export function pageContext(
  env: Pick<Env, "DATA" | "DB" | "REVIEWS_ENABLED">,
): PageRequestContext {
  const reviews = FeatureVarsSchema.parse(env).REVIEWS_ENABLED;
  return {
    published: r2PublishedFiles(env.DATA),
    reviews: reviews === "off" ? null : reviewsServerData(env.DB),
    pageReviews: (input) => pageReviews(env, input),
  };
}
