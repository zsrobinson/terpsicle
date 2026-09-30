// What PlanetTerp's data holds in all (courses, professors, reviews and
// course grades), for the numbers Reviews' front page counts up to (owner,
// 2026-09-29, "PlanetTerp-style"). The nightly job counts them on PlanetTerp's
// basis and writes them into the index (`PlanetTerpIndex.totals`, DATA.md
// §4.1, "Totals"); only it sees the whole professor list, so nothing here
// recounts. An index from before the job's first run with totals has none:
// the front page then leaves its numbers out until the next run.
import type { PublishedFiles } from "~/core/routing";
import {
  PLANETTERP_MANIFEST_KEY,
  PlanetTerpIndexSchema,
  PlanetTerpManifestSchema,
  type PlanetTerpTotals,
  planetTerpIndexKey,
} from "~/core/schema";

/** PlanetTerp's totals, or null when no published index carries them yet. */
export async function planetTerpStats(
  published: PublishedFiles,
): Promise<PlanetTerpTotals | null> {
  const manifest = PlanetTerpManifestSchema.safeParse(
    await published.readJson(PLANETTERP_MANIFEST_KEY),
  );
  const hash = manifest.success ? manifest.data.index?.hash : undefined;
  if (!hash) return null;
  const index = PlanetTerpIndexSchema.safeParse(
    await published.readJson(planetTerpIndexKey(hash)),
  );
  return index.success ? (index.data.totals ?? null) : null;
}
