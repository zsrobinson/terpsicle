// What PlanetTerp's data holds in all (courses, professors, reviews and
// grades), for the numbers Reviews' front page counts up to (owner,
// 2026-09-29, "PlanetTerp-style"). The nightly job writes them into the
// index (`PlanetTerpIndex.totals`); an index from before that has none, so
// they're counted here from the department files instead, once an isolate
// per index, until the job's next run.
import { planetTerpTotals } from "~/core/reviews/planetterp-index";
import type { PublishedFiles } from "~/core/routing";
import {
  PLANETTERP_MANIFEST_KEY,
  type PlanetTerpDept,
  PlanetTerpDeptSchema,
  PlanetTerpIndexSchema,
  PlanetTerpManifestSchema,
  type PlanetTerpTotals,
  planetTerpDeptKey,
  planetTerpIndexKey,
} from "~/core/schema";

/** Department files read at once when counting. */
const READS_AT_ONCE = 12;

/** Totals counted from department files, by the index (or run) they're for. */
const counted = new Map<string, PlanetTerpTotals>();

/** PlanetTerp's totals, or null before anything's published. */
export async function planetTerpStats(
  published: PublishedFiles,
): Promise<PlanetTerpTotals | null> {
  const manifest = PlanetTerpManifestSchema.safeParse(
    await published.readJson(PLANETTERP_MANIFEST_KEY),
  );
  if (!manifest.success) return null;
  const hash = manifest.data.index?.hash;
  const key = hash ?? manifest.data.generatedAt;
  const known = counted.get(key);
  if (known) return known;
  if (hash) {
    const index = PlanetTerpIndexSchema.safeParse(
      await published.readJson(planetTerpIndexKey(hash)),
    );
    if (index.success && index.data.totals) return index.data.totals;
  }
  const depts: PlanetTerpDept[] = [];
  const all = manifest.data.departments;
  for (let i = 0; i < all.length; i += READS_AT_ONCE)
    for (const read of await Promise.all(
      all
        .slice(i, i + READS_AT_ONCE)
        .map(async (d) =>
          PlanetTerpDeptSchema.safeParse(
            await published.readJson(planetTerpDeptKey(d.code, d.hash)),
          ),
        ),
    ))
      if (read.success) depts.push(read.data);
  if (depts.length === 0) return null;
  const totals = planetTerpTotals(depts);
  // Only settled values are kept (as with the published files): the next
  // request reads this one's answer, never waits on it.
  counted.clear();
  counted.set(key, totals);
  return totals;
}
