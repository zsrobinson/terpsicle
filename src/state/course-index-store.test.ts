import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  COURSE_INDEX_MANIFEST_KEY,
  courseIndexDeptKey,
  courseSearchKey,
} from "~/core/schema";
import {
  aCourseIndexDept,
  aCourseIndexEntry,
  aCourseIndexManifest,
  aCourseSearchFile,
  archivedFixtureTermId,
  fixtureTermId,
  mockDataSource,
} from "~/fixtures";
import {
  courseIndexEntry,
  INITIAL_COURSE_INDEX_STATE,
  useCourseIndex,
} from "./course-index-store";
import { createMemoryCache } from "./data-cache";
import {
  createBucketDataSource,
  DataError,
  type DataSource,
} from "./data-source";

// The course-index store against the mock bucket, and against a fake server
// with an in-memory cache: what it fetches, what it keeps (DATA.md §5.2).

const hash = (n: number) => n.toString(16).padStart(16, "0");

/** A fake /data holding one index: CMSC in `cmscHash`, the search file in `searchHash`. */
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
  const publish = (n: number, title = "Algorithms") => {
    files.set(
      COURSE_INDEX_MANIFEST_KEY,
      aCourseIndexManifest({
        search: { hash: hash(n) },
        departments: [{ code: "CMSC", hash: hash(n) }],
      }),
    );
    files.set(
      courseSearchKey(hash(n)),
      aCourseSearchFile({ courses: [["CMSC351", title, 3, 3, []]] }),
    );
    files.set(
      courseIndexDeptKey("CMSC", hash(n)),
      aCourseIndexDept({ courses: [aCourseIndexEntry({ title })] }),
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
    /** The keys read since the last call. */
    take: () => reads.splice(0),
  };
}

const store = () => useCourseIndex.getState();

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  useCourseIndex.setState(INITIAL_COURSE_INDEX_STATE);
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("the course index in mock mode", () => {
  it("serves every mock course, with the terms each was offered in", async () => {
    store().connect(createBucketDataSource(mockDataSource));
    await store().ensureSearch();
    expect(store().search?.some((r) => r[0] === "CMSC131")).toBe(true);

    await store().ensureDepts(["CMSC", "ZZZZ"]);
    expect(courseIndexEntry(store(), "CMSC131")?.offered).toEqual([
      fixtureTermId,
      archivedFixtureTermId,
    ]);
    // A department the index has never seen: loaded, and the code is unknown.
    expect(courseIndexEntry(store(), "ZZZZ101")).toBeNull();
    // Not asked for yet.
    expect(courseIndexEntry(store(), "GEOL100")).toBeUndefined();
  });
});

describe("the course index with a cache", () => {
  it("loads from the cache next time, revalidating only the manifest", async () => {
    const server = aServer();
    const cache = createMemoryCache();
    store().connect(server.source, { cache });
    await store().ensureSearch();
    await store().ensureDepts(["CMSC"]);
    expect(server.take().sort()).toEqual(
      [
        COURSE_INDEX_MANIFEST_KEY,
        courseIndexDeptKey("CMSC", hash(1)),
        courseSearchKey(hash(1)),
      ].sort(),
    );

    // A new session: the saved index, and one manifest check.
    useCourseIndex.setState(INITIAL_COURSE_INDEX_STATE);
    store().connect(server.source, { cache });
    await store().ensureSearch();
    await store().ensureDepts(["CMSC"]);
    expect(courseIndexEntry(store(), "CMSC351")?.title).toBe("Algorithms");
    await store().refresh();
    // The background check and this one may share a request or not.
    expect(new Set(server.take())).toEqual(
      new Set([COURSE_INDEX_MANIFEST_KEY]),
    );
  });

  it("refetches only the loaded files that changed, and forgets the old ones", async () => {
    const server = aServer();
    const cache = createMemoryCache();
    store().connect(server.source, { cache });
    await store().ensureDepts(["CMSC"]);
    await store().refresh();
    server.take();

    server.publish(2, "Design and Analysis of Algorithms");
    await store().refresh();
    // The search file wasn't loaded, so it isn't fetched.
    expect(server.take().sort()).toEqual(
      [COURSE_INDEX_MANIFEST_KEY, courseIndexDeptKey("CMSC", hash(2))].sort(),
    );
    expect(courseIndexEntry(store(), "CMSC351")?.title).toBe(
      "Design and Analysis of Algorithms",
    );
    expect([...cache.files.keys()]).toEqual([
      courseIndexDeptKey("CMSC", hash(2)),
    ]);
    expect(cache.pointers.get(COURSE_INDEX_MANIFEST_KEY)?.data).toEqual(
      server.files.get(COURSE_INDEX_MANIFEST_KEY),
    );
  });

  it("follows the server when a saved manifest names a file it no longer keeps", async () => {
    const server = aServer();
    const cache = createMemoryCache();
    store().connect(server.source, { cache });
    await store().ensureSearch();

    // Days later: the server has moved on and deleted the old files.
    server.publish(2, "Algorithms (new)");
    server.files.delete(courseIndexDeptKey("CMSC", hash(1)));
    server.files.delete(courseSearchKey(hash(1)));
    useCourseIndex.setState(INITIAL_COURSE_INDEX_STATE);
    store().connect(server.source, { cache });
    await store().ensureDepts(["CMSC"]);
    expect(store().deptsState.CMSC).toBe("ready");
    expect(courseIndexEntry(store(), "CMSC351")?.title).toBe(
      "Algorithms (new)",
    );
  });

  it("says it couldn't load when the server is away and nothing is saved", async () => {
    const server = aServer();
    server.setOffline(true);
    store().connect(server.source, { cache: createMemoryCache() });
    await store().ensureSearch();
    await store().ensureDepts(["CMSC"]);
    expect(store().manifestState).toBe("error");
    expect(store().searchState).toBe("error");
    expect(store().deptsState.CMSC).toBe("error");

    // Back online: the next ask tries again.
    server.setOffline(false);
    await store().ensureSearch();
    expect(store().searchState).toBe("ready");
  });

  it("marks the tab stale when the server publishes a newer format", async () => {
    const server = aServer();
    server.files.set(COURSE_INDEX_MANIFEST_KEY, {
      ...aCourseIndexManifest(),
      schemaVersion: 99,
    });
    store().connect(server.source);
    await store().ensureSearch();
    expect(store().appStale).toBe(true);
    expect(store().searchState).toBe("error");
  });
});
