import { describe, expect, it } from "vitest";
import {
  PLANETTERP_MANIFEST_KEY,
  type PlanetTerpTotals,
  planetTerpIndexKey,
} from "~/core/schema";
import { mockDataSource } from "~/fixtures/mock/data-source";
import { planetTerpStats } from "./stats";

const TOTALS: PlanetTerpTotals = {
  courses: 3,
  professors: 12,
  reviews: 40,
  grades: 25,
  counts: [5, 4, 3, 2, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
};

/** The mock bucket, with the index's totals swapped for `totals`. */
async function publishedWith(totals: PlanetTerpTotals | undefined) {
  const manifest = (await mockDataSource.json(PLANETTERP_MANIFEST_KEY)) as {
    index: { hash: string };
  };
  const key = planetTerpIndexKey(manifest.index.hash);
  const index = (await mockDataSource.json(key)) as Record<string, unknown>;
  const { totals: _, ...rest } = index;
  return {
    readJson: async (at: string) =>
      at === key
        ? { ...rest, ...(totals ? { totals } : {}) }
        : mockDataSource.json(at),
  };
}

describe("planetTerpStats", () => {
  it("reads the totals the nightly job wrote into the index", async () => {
    expect(await planetTerpStats(await publishedWith(TOTALS))).toEqual(TOTALS);
  });

  it("has none before the job's first run with totals, and counts nothing itself", async () => {
    const published = await publishedWith(undefined);
    const read: string[] = [];
    const stats = await planetTerpStats({
      readJson: (key) => {
        read.push(key);
        return published.readJson(key);
      },
    });
    expect(stats).toBeNull();
    // The manifest and the index; no department file.
    expect(read).toHaveLength(2);
  });

  it("has none before anything's published", async () => {
    expect(await planetTerpStats({ readJson: async () => null })).toBeNull();
  });
});
