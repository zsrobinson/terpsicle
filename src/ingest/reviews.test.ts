import { describe, expect, it } from "vitest";
import { buildReviewsDepts } from "~/core/reviews";
import {
  REVIEWS_MANIFEST_KEY,
  type ReviewsDept,
  ReviewsDeptSchema,
  ReviewsManifestSchema,
  reviewsDeptKey,
} from "~/core/schema";
import {
  aReviewsDept,
  mockPublishedReviews,
  mockReviewNames,
} from "~/fixtures";
import { createMemoryBlobStore, type MemoryBlobStore } from "./blob-store";
import { ORPHAN_GRACE_MS, readJson, silentLogger } from "./publish";
import { publishReviews, REVIEWS_STATE_KEY } from "./reviews";

// The reviews-publish job's R2 side (V2 §7.6, DATA.md §4.6), over the mock
// reviews the dev server publishes, so the golden files are what
// `pnpm dev:mock` serves.

const T0 = new Date("2026-10-01T12:37:00.000Z");
const later = (ms: number) => new Date(T0.getTime() + ms);

const mockDepts = () =>
  buildReviewsDepts(mockPublishedReviews, mockReviewNames);

async function publish(
  store: MemoryBlobStore,
  depts: readonly ReviewsDept[],
  now = T0,
) {
  return publishReviews({ store, now, log: silentLogger, depts });
}

const manifestOf = async (store: MemoryBlobStore) => {
  const manifest = await readJson(
    store,
    REVIEWS_MANIFEST_KEY,
    ReviewsManifestSchema,
  );
  if (!manifest) throw new Error("no manifest");
  return manifest;
};

describe("publishReviews (golden)", () => {
  it("publishes the mock reviews' numbers", async () => {
    const store = createMemoryBlobStore();
    const result = await publish(store, mockDepts());
    const manifest = await manifestOf(store);
    expect(result).toMatchObject({
      departments: manifest.departments.length,
      written: manifest.departments.length,
      dropped: 0,
      deleted: 0,
      manifestChanged: true,
    });
    const files: Record<string, unknown> = {};
    for (const d of manifest.departments) {
      const key = reviewsDeptKey(d.code, d.hash);
      files[key] = await readJson(store, key, ReviewsDeptSchema);
      expect(store.contentTypeOf(key)).toBe("application/json; charset=utf-8");
    }
    await expect(
      `${JSON.stringify({ manifest, files }, null, 1)}\n`,
    ).toMatchFileSnapshot("./__fixtures__/golden/reviews.json");
    // Numbers only: no review text, author or exact time anywhere.
    const published = JSON.stringify(files);
    expect(published).not.toMatch(/body|author|text|publishedAt|T\d\d:/);
  });
});

describe("publishReviews", () => {
  it("writes nothing new when nothing changed", async () => {
    const store = createMemoryBlobStore();
    await publish(store, mockDepts());
    const before = await manifestOf(store);
    store.writes.length = 0;
    const result = await publish(store, mockDepts(), later(3_600_000));
    expect(result).toMatchObject({ written: 0, manifestChanged: false });
    expect(store.writes).toEqual([REVIEWS_STATE_KEY]);
    // generatedAt is when the numbers last changed.
    expect(await manifestOf(store)).toEqual(before);
  });

  it("rewrites only the department that changed, and keeps the old file for a day", async () => {
    const store = createMemoryBlobStore();
    const cmsc = aReviewsDept();
    const math = aReviewsDept({ dept: "MATH" });
    await publish(store, [cmsc, math]);
    const first = await manifestOf(store);
    const oldKey = reviewsDeptKey("CMSC", first.departments[0]?.hash ?? "");

    store.writes.length = 0;
    const changed = aReviewsDept({
      instructors: {
        brandt: { rating: 4.5, reviewCount: 14, latestReviewMonth: "2026-10" },
      },
    });
    const hour = later(3_600_000);
    const result = await publish(store, [math, changed], hour);
    expect(result).toMatchObject({ written: 1, manifestChanged: true });
    const second = await manifestOf(store);
    expect(second.generatedAt).toBe(hour.toISOString());
    expect(second.departments.map((d) => d.code)).toEqual(["CMSC", "MATH"]);
    expect(second.departments[1]).toEqual(first.departments[1]);
    const newKey = reviewsDeptKey("CMSC", second.departments[0]?.hash ?? "");
    // The new file lands before the manifest that points at it.
    expect(store.writes.indexOf(newKey)).toBeLessThan(
      store.writes.indexOf(REVIEWS_MANIFEST_KEY),
    );
    // A client mid-load still finds the old file for the grace period…
    expect(await store.get(oldKey)).not.toBeNull();
    await publish(store, [math, changed], later(ORPHAN_GRACE_MS));
    expect(await store.get(oldKey)).not.toBeNull();
    // …then it goes.
    const gone = await publish(
      store,
      [math, changed],
      later(ORPHAN_GRACE_MS + 3_600_000),
    );
    expect(gone.deleted).toBe(1);
    expect(await store.get(oldKey)).toBeNull();
    expect(await store.get(newKey)).not.toBeNull();
  });

  it("drops a department once nothing in it is published", async () => {
    const store = createMemoryBlobStore();
    await publish(store, [aReviewsDept(), aReviewsDept({ dept: "MATH" })]);
    const result = await publish(
      store,
      [aReviewsDept(), aReviewsDept({ dept: "MATH", instructors: {} })],
      later(3_600_000),
    );
    expect(result).toMatchObject({ departments: 1, dropped: 1 });
    expect((await manifestOf(store)).departments.map((d) => d.code)).toEqual([
      "CMSC",
    ]);
  });

  it("publishes an empty manifest when every review is gone, never an empty file", async () => {
    const store = createMemoryBlobStore();
    await publish(store, [aReviewsDept()]);
    await publish(store, [], later(3_600_000));
    expect((await manifestOf(store)).departments).toEqual([]);
    const files = (await store.list("reviews/dept/")).length;
    expect(files).toBe(1); // the old file, until its grace ends
  });

  it("never publishes a broken file, and leaves the manifest alone", async () => {
    const store = createMemoryBlobStore();
    await publish(store, [aReviewsDept()]);
    const before = await manifestOf(store);
    const broken = aReviewsDept({
      instructors: {
        brandt: { rating: 7, reviewCount: 1, latestReviewMonth: "2026-10" },
      },
    });
    await expect(publish(store, [broken], later(3_600_000))).rejects.toThrow(
      /reviews CMSC doesn't match its schema at instructors\.brandt\.rating/,
    );
    expect(await manifestOf(store)).toEqual(before);
  });

  it("republishes every department over an unreadable manifest", async () => {
    const store = createMemoryBlobStore({
      [REVIEWS_MANIFEST_KEY]: '{"schemaVersion":99}',
    });
    const result = await publish(store, [aReviewsDept()]);
    expect(result).toMatchObject({ written: 1, manifestChanged: true });
    expect((await manifestOf(store)).schemaVersion).toBe(1);
  });
});
