import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { REVIEWS_MANIFEST_KEY, reviewsDeptKey } from "~/core/schema";
import {
  aPlanetTerpDept,
  aReviewsDept,
  aReviewsManifest,
  mockDataSource,
  mockMintedNames,
} from "~/fixtures";
import { createMemoryCache } from "./data-cache";
import {
  createBucketDataSource,
  DataError,
  type DataSource,
} from "./data-source";
import {
  INITIAL_REVIEW_NUMBERS_STATE,
  terpsicleInstructor,
  useReviewNumbers,
} from "./reviews-store";

// Terpsicle reviews' numbers in the browser (DATA.md §5.4): against the mock
// bucket, and a fake server with an in-memory cache.

const hash = (n: number) => n.toString(16).padStart(16, "0");
const numbers = (reviewCount: number) => ({
  rating: 4.5,
  reviewCount,
  latestReviewMonth: "2026-09",
});

function aServer() {
  const files = new Map<string, unknown>();
  const reads: string[] = [];
  let offline = false;
  const source: DataSource = {
    kind: "live",
    async readJson(key) {
      reads.push(key);
      if (offline) throw new DataError(key, "network", "offline");
      if (!files.has(key)) throw new DataError(key, "missing", "missing");
      return structuredClone(files.get(key));
    },
    async readBinary(key) {
      throw new DataError(key, "missing", "missing");
    },
  };
  const publish = (n: number) => {
    files.set(
      REVIEWS_MANIFEST_KEY,
      aReviewsManifest({ departments: [{ code: "CMSC", hash: hash(n) }] }),
    );
    files.set(
      reviewsDeptKey("CMSC", hash(n)),
      aReviewsDept({ instructors: { brandt: numbers(n) } }),
    );
  };
  publish(1);
  return {
    files,
    source,
    publish,
    setOffline: (value: boolean) => {
      offline = value;
    },
    take: () => reads.splice(0),
  };
}

const store = () => useReviewNumbers.getState();

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  useReviewNumbers.setState(INITIAL_REVIEW_NUMBERS_STATE);
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("review numbers in mock mode", () => {
  it("serves the mock bucket's numbers, minted instructors included", async () => {
    store().connect(createBucketDataSource(mockDataSource));
    await store().ensureDepts(["CMSC", "ZZZZ"]);
    const cmsc = store().depts.CMSC;
    expect(Object.keys(cmsc?.instructors ?? {}).length).toBeGreaterThan(0);
    // Nothing published for it: ready, and empty.
    expect(store().deptsState.ZZZZ).toBe("ready");
    expect(store().depts.ZZZZ).toBeUndefined();

    const minted = mockMintedNames.find((name) =>
      Object.values(store().depts).some((d) =>
        terpsicleInstructor(d ?? null, null, name),
      ),
    );
    expect(minted).toBeDefined();
  });
});

describe("review numbers with a cache", () => {
  it("loads from the cache next time, revalidating only the manifest", async () => {
    const server = aServer();
    const cache = createMemoryCache();
    store().connect(server.source, { cache });
    await store().ensureDepts(["CMSC"]);
    expect(server.take().sort()).toEqual(
      [REVIEWS_MANIFEST_KEY, reviewsDeptKey("CMSC", hash(1))].sort(),
    );

    useReviewNumbers.setState(INITIAL_REVIEW_NUMBERS_STATE);
    store().connect(server.source, { cache });
    await store().ensureDepts(["CMSC"]);
    expect(store().depts.CMSC?.instructors.brandt?.reviewCount).toBe(1);
    await store().refresh();
    expect(new Set(server.take())).toEqual(new Set([REVIEWS_MANIFEST_KEY]));
  });

  it("refetches a loaded department that changed, and forgets the old file", async () => {
    const server = aServer();
    const cache = createMemoryCache();
    store().connect(server.source, { cache });
    await store().ensureDepts(["CMSC"]);
    await store().refresh();
    server.take();

    server.publish(2);
    await store().refresh();
    expect(server.take().sort()).toEqual(
      [REVIEWS_MANIFEST_KEY, reviewsDeptKey("CMSC", hash(2))].sort(),
    );
    expect(store().depts.CMSC?.instructors.brandt?.reviewCount).toBe(2);
    expect([...cache.files.keys()]).toEqual([reviewsDeptKey("CMSC", hash(2))]);
  });

  it("follows the server when a saved manifest names a file it deleted", async () => {
    const server = aServer();
    const cache = createMemoryCache();
    store().connect(server.source, { cache });
    await store().ensureDepts(["MATH"]);
    await store().refresh();

    server.publish(2);
    server.files.delete(reviewsDeptKey("CMSC", hash(1)));
    useReviewNumbers.setState(INITIAL_REVIEW_NUMBERS_STATE);
    store().connect(server.source, { cache });
    await store().ensureDepts(["CMSC"]);
    expect(store().depts.CMSC?.instructors.brandt?.reviewCount).toBe(2);
  });

  it("says it couldn't load while offline, and tries again later", async () => {
    const server = aServer();
    server.setOffline(true);
    store().connect(server.source, { cache: createMemoryCache() });
    await store().ensureDepts(["CMSC"]);
    expect(store().deptsState.CMSC).toBe("error");

    server.setOffline(false);
    await store().ensureDepts(["CMSC"]);
    expect(store().deptsState.CMSC).toBe("ready");
  });

  it("marks the tab stale when the server publishes a newer format", async () => {
    const server = aServer();
    server.files.set(REVIEWS_MANIFEST_KEY, {
      ...aReviewsManifest(),
      schemaVersion: 99,
    });
    store().connect(server.source);
    await store().ensureDepts(["CMSC"]);
    expect(store().appStale).toBe(true);
    expect(store().deptsState.CMSC).toBe("error");
  });
});

describe("terpsicleInstructor", () => {
  const planetTerp = aPlanetTerpDept({ names: { "ada brandt": "brandt" } });

  it("joins through PlanetTerp's names", () => {
    expect(
      terpsicleInstructor(aReviewsDept(), planetTerp, "Ada Brandt"),
    ).toEqual({ id: "brandt", numbers: aReviewsDept().instructors.brandt });
  });

  it("uses a minted instructor only for names PlanetTerp doesn't know", () => {
    const ours = aReviewsDept({
      instructors: { "t~abcde23456": numbers(2) },
      names: { "pat quill": "t~abcde23456", "ada brandt": "t~zzzzz23456" },
    });
    expect(terpsicleInstructor(ours, planetTerp, "Pat Quill")).toEqual({
      id: "t~abcde23456",
      numbers: numbers(2),
    });
    expect(terpsicleInstructor(ours, planetTerp, "Ada Brandt")?.id).toBe(
      "brandt",
    );
  });

  it("lets the owner's fix beat PlanetTerp's join", () => {
    const ours = aReviewsDept({ names: { "ada brandt": "brandt_ada" } });
    expect(terpsicleInstructor(ours, planetTerp, "Ada Brandt")).toEqual({
      id: "brandt_ada",
      numbers: null,
    });
  });

  it("is null for a name nobody knows", () => {
    expect(terpsicleInstructor(null, null, "Nobody")).toBeNull();
  });
});
