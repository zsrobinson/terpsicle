import { onlineManager, type QueryClient } from "@tanstack/react-query";
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
  createBucketDataSource,
  DataError,
  type DataSource,
} from "../data-source";
import { ensureCourseSearch, ensureIndexDepts } from "./course-index";
import {
  createMemoryQueryStorage,
  flushQueryStorage,
  setQueryStorage,
} from "./persister";
import { createTestQueryClient } from "./testing";

// The course index through the query cache (DATA.md §5.2), outside React:
// against the mock bucket, and a fake server with the persister writing to
// memory. What it fetches, what it keeps, and what it does offline.

const hash = (n: number) => n.toString(16).padStart(16, "0");

/** A fake /data holding one index: CMSC and the search file at hash `n`. */
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
    /** The keys read since the last call, sorted. */
    take: () => reads.splice(0).sort(),
  };
}

let storage: ReturnType<typeof createMemoryQueryStorage>;
let pages: QueryClient[] = [];
/** A page: a fresh client over the same saved rows, as a reload would be. */
function aPage(): QueryClient {
  const client = createTestQueryClient();
  pages.push(client);
  return client;
}

/** The R2 keys saved now, sorted. */
const savedKeys = () =>
  [...storage.rows.keys()]
    .map((k) => JSON.parse(k.slice(k.indexOf("-") + 1))[2] as string)
    .sort();

/** Lets a restored manifest's background check, and its saves, finish. */
async function settled(client: QueryClient) {
  await vi.waitFor(() => expect(client.isFetching()).toBe(0));
  await new Promise((resolve) => setTimeout(resolve, 0));
  await flushQueryStorage();
}

const title = async (client: QueryClient, source: DataSource) =>
  (await ensureIndexDepts(client, source, ["CMSC"])).loaded.get("CMSC")
    ?.courses[0]?.title;

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  storage = createMemoryQueryStorage();
  setQueryStorage(storage);
});
afterEach(async () => {
  // A page's last saves land in its own test's storage, not the next one's.
  for (const client of pages) await settled(client);
  pages = [];
  setQueryStorage(null);
  vi.restoreAllMocks();
});

describe("the course index in mock mode", () => {
  it("serves every mock course, with the terms each was offered in", async () => {
    const source = createBucketDataSource(mockDataSource);
    const client = aPage();
    const search = await ensureCourseSearch(client, source);
    expect(search.some((r) => r[0] === "CMSC131")).toBe(true);

    const { loaded: depts } = await ensureIndexDepts(client, source, [
      "CMSC",
      "ZZZZ",
    ]);
    expect(
      depts.get("CMSC")?.courses.find((c) => c.code === "CMSC131")?.offered,
    ).toEqual([fixtureTermId, archivedFixtureTermId]);
    // A department the index has never seen: loaded, and empty.
    expect(depts.get("ZZZZ")).toBeNull();
  });
});

describe("the course index with the persister", () => {
  it("loads from disk next time, checking only the manifest", async () => {
    const server = aServer();
    const first = aPage();
    await ensureCourseSearch(first, server.source);
    expect(await title(first, server.source)).toBe("Algorithms");
    expect(server.take()).toEqual(
      [
        COURSE_INDEX_MANIFEST_KEY,
        courseIndexDeptKey("CMSC", hash(1)),
        courseSearchKey(hash(1)),
      ].sort(),
    );
    await settled(first);

    // A new page: the saved index at once, and one manifest check.
    const next = aPage();
    expect(await title(next, server.source)).toBe("Algorithms");
    await ensureCourseSearch(next, server.source);
    await settled(next);
    expect(server.take()).toEqual([COURSE_INDEX_MANIFEST_KEY]);
  });

  it("brings the saved files' new versions with a changed manifest, and forgets the old ones", async () => {
    const server = aServer();
    const first = aPage();
    expect(await title(first, server.source)).toBe("Algorithms");
    await settled(first);
    server.take();

    server.publish(2, "Design and Analysis of Algorithms");
    const next = aPage();
    await title(next, server.source);
    await settled(next);
    // The search file was never loaded, so it isn't fetched.
    expect(server.take()).toEqual(
      [COURSE_INDEX_MANIFEST_KEY, courseIndexDeptKey("CMSC", hash(2))].sort(),
    );
    expect(await title(next, server.source)).toBe(
      "Design and Analysis of Algorithms",
    );
    await settled(next);
    expect(savedKeys()).toEqual(
      [COURSE_INDEX_MANIFEST_KEY, courseIndexDeptKey("CMSC", hash(2))].sort(),
    );
  });

  it("follows the server when a saved manifest names a file it no longer keeps", async () => {
    const server = aServer();
    const first = aPage();
    await ensureCourseSearch(first, server.source);
    await settled(first);

    // Days later: the server has moved on and deleted the old files.
    server.publish(2, "Algorithms (new)");
    server.files.delete(courseIndexDeptKey("CMSC", hash(1)));
    server.files.delete(courseSearchKey(hash(1)));
    expect(await title(aPage(), server.source)).toBe("Algorithms (new)");
  });

  it("works offline from what's saved", async () => {
    const server = aServer();
    const first = aPage();
    await ensureCourseSearch(first, server.source);
    await title(first, server.source);
    await settled(first);

    server.setOffline(true);
    const next = aPage();
    expect(await title(next, server.source)).toBe("Algorithms");
    expect(
      (await ensureCourseSearch(next, server.source)).map((r) => r[0]),
    ).toEqual(["CMSC351"]);
    await settled(next);
    // The failed check left the saved index as it was.
    expect(savedKeys()).toHaveLength(3);
  });

  it("fails with nothing saved and the server away, and loads on the next ask", async () => {
    const server = aServer();
    server.setOffline(true);
    const client = aPage();
    await expect(ensureCourseSearch(client, server.source)).rejects.toThrow(
      /offline/,
    );
    server.setOffline(false);
    expect(
      (await ensureCourseSearch(client, server.source)).map((r) => r[0]),
    ).toEqual(["CMSC351"]);
  });

  it("loads each department on its own: one that fails leaves the rest", async () => {
    const server = aServer();
    server.files.set(
      COURSE_INDEX_MANIFEST_KEY,
      aCourseIndexManifest({
        search: { hash: hash(1) },
        departments: [
          { code: "CMSC", hash: hash(1) },
          { code: "MATH", hash: hash(1) },
        ],
      }),
    );
    // MATH's file is listed but broken.
    server.files.set(courseIndexDeptKey("MATH", hash(1)), { junk: true });
    const { loaded, failed } = await ensureIndexDepts(aPage(), server.source, [
      "CMSC",
      "MATH",
      "ZZZZ",
    ]);
    expect([...loaded.keys()].sort()).toEqual(["CMSC", "ZZZZ"]);
    expect(loaded.get("CMSC")?.courses[0]?.title).toBe("Algorithms");
    expect([...failed.keys()]).toEqual(["MATH"]);
  });

  it("fails at once offline with nothing saved, rather than waiting for the connection", async () => {
    const server = aServer();
    server.setOffline(true);
    onlineManager.setOnline(false);
    try {
      // The factories' own retry policy: no waiting while offline.
      await expect(ensureCourseSearch(aPage(), server.source)).rejects.toThrow(
        /offline/,
      );
      expect(server.take()).toEqual([COURSE_INDEX_MANIFEST_KEY]);
    } finally {
      onlineManager.setOnline(true);
    }
  });

  it("doesn't retry an index in a newer format", async () => {
    const server = aServer();
    server.files.set(COURSE_INDEX_MANIFEST_KEY, {
      ...aCourseIndexManifest(),
      schemaVersion: 99,
    });
    await expect(ensureCourseSearch(aPage(), server.source)).rejects.toThrow(
      /schema version 99/,
    );
    expect(server.take()).toEqual([COURSE_INDEX_MANIFEST_KEY]);
  });
});
