import { planetTerpTwin } from "~/core/reviews/planetterp-twin";
import {
  FeatureVarsSchema,
  PLANETTERP_MANIFEST_KEY,
  PlanetTerpIndexSchema,
  PlanetTerpManifestSchema,
  planetTerpIndexKey,
} from "~/core/schema";
import { r2PublishedFiles } from "../pages/context";

// While our Reviews pages are off (REVIEWS_PAGES_ENABLED; docs/decisions.md,
// "Reviews link out to PlanetTerp"), every one of their addresses answers a
// 302 to its PlanetTerp twin (~/core/reviews/planetterp-twin). A 302, not a
// 301: browsers keep a 301 for good, and turning the pages back on has to
// work at once. The Worker answers before the app renders, so a search
// engine's or a bookmark's visit costs one read of PlanetTerp's index (kept
// in the isolate) and none of the page's data; in the app, nothing links to
// these pages while they're off.

export interface ReviewsLinkOutEnv {
  DATA: R2Bucket;
  REVIEWS_PAGES_ENABLED?: string;
}

/** The redirect for a Reviews page while ours are off, else null. */
export async function reviewsLinkOut(
  request: Request,
  env: ReviewsLinkOutEnv,
): Promise<Response | null> {
  if (!["GET", "HEAD"].includes(request.method)) return null;
  if (FeatureVarsSchema.parse(env).REVIEWS_PAGES_ENABLED) return null;
  const url = new URL(request.url);
  if (!/^\/reviews(\/|$)/.test(url.pathname)) return null;
  // Only an instructor's address asks the index: try without it first.
  let asked = false;
  let to = planetTerpTwin(url.pathname, url.searchParams, () => {
    asked = true;
    return false;
  });
  if (asked) {
    const ids = await instructorIds(env.DATA);
    to = planetTerpTwin(
      url.pathname,
      url.searchParams,
      ids ? (id) => ids.has(id) : null,
    );
  }
  if (!to) return null;
  return new Response(null, {
    status: 302,
    headers: { Location: to, "Cache-Control": "no-store" },
  });
}

/** The last index's ids, by its hash: it changes nightly at most. */
let kept: { hash: string; ids: Set<string> } | null = null;

/** PlanetTerp's instructor ids, from the published index; null without it. */
async function instructorIds(bucket: R2Bucket): Promise<Set<string> | null> {
  try {
    const files = r2PublishedFiles(bucket);
    const manifest = PlanetTerpManifestSchema.safeParse(
      await files.readJson(PLANETTERP_MANIFEST_KEY),
    );
    if (!manifest.success || !manifest.data.index) return null;
    const { hash } = manifest.data.index;
    if (kept?.hash === hash) return kept.ids;
    const index = PlanetTerpIndexSchema.safeParse(
      await files.readJson(planetTerpIndexKey(hash)),
    );
    if (!index.success) return null;
    kept = { hash, ids: new Set(Object.keys(index.data.instructors)) };
    return kept.ids;
  } catch {
    return null;
  }
}
