import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SCHEMA_VERSIONS } from "~/core/schema";
import {
  createDexieQueryStorage,
  createMemoryQueryStorage,
  preloadPublished,
  prunePublished,
  publishedPersister,
  queryStorageForTests,
  savedPublishedKeys,
  setQueryStorage,
} from "./persister";
import { publishedKey } from "./published";

// The query cache on disk: the IndexedDB storage, and the rows a family's
// pointer no longer lists.

describe("createDexieQueryStorage", () => {
  it("keeps objects as they are, lists keys by prefix and forgets", async () => {
    const storage = createDexieQueryStorage(`test-${Math.random()}`);
    const row = { big: { nested: [1, 2, 3] } };
    await storage.setItem("published:reviews-a", row);
    await storage.setItem("published:catalog-b", 2);
    expect(await storage.getItem("published:reviews-a")).toEqual(row);
    expect(await storage.keys("published:reviews-")).toEqual([
      "published:reviews-a",
    ]);
    await storage.removeItem("published:reviews-a");
    expect(await storage.getItem("published:reviews-a")).toBeNull();
    expect(await storage.entries?.()).toEqual([["published:catalog-b", 2]]);
    expect(await storage.rowsFrom("published:catalog-")).toEqual([
      ["published:catalog-b", 2],
    ]);
  });

  it("never fails a read when IndexedDB does", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const storage = createDexieQueryStorage(`test-${Math.random()}`);
    const broken = vi
      .spyOn(IDBObjectStore.prototype, "get")
      .mockImplementation(() => {
        throw new Error("disk full");
      });
    expect(await storage.getItem("anything")).toBeNull();
    broken.mockRestore();
    vi.restoreAllMocks();
  });
});

describe("prunePublished", () => {
  let storage: ReturnType<typeof createMemoryQueryStorage>;
  const rowKey = (kind: "live" | "mock", key: string) =>
    `published:reviews-${JSON.stringify(publishedKey(kind, key))}`;

  beforeEach(() => {
    storage = createMemoryQueryStorage();
    setQueryStorage(storage);
  });
  afterEach(() => setQueryStorage(null));

  it("drops the family's files the pointer doesn't list, in this mode only", async () => {
    for (const key of [
      rowKey("live", "reviews/manifest.json"),
      rowKey("live", "reviews/dept/CMSC.1.json"),
      rowKey("live", "reviews/dept/CMSC.2.json"),
      rowKey("mock", "reviews/dept/CMSC.1.json"),
      "published:reviews-not json",
      "published:catalog-x",
    ])
      storage.rows.set(key, {});
    await prunePublished(
      "reviews",
      "live",
      new Set(["reviews/manifest.json", "reviews/dept/CMSC.2.json"]),
    );
    expect([...storage.rows.keys()].sort()).toEqual(
      [
        rowKey("live", "reviews/manifest.json"),
        rowKey("live", "reviews/dept/CMSC.2.json"),
        rowKey("mock", "reviews/dept/CMSC.1.json"),
        "published:catalog-x",
      ].sort(),
    );
  });
});

describe("one term's rows", () => {
  let storage: ReturnType<typeof createMemoryQueryStorage>;
  const rowKey = (key: string) =>
    `published:catalog-${JSON.stringify(publishedKey("live", key))}`;
  const TERM_A = "catalog/202701/";
  const TERM_B = "catalog/202608/";

  beforeEach(() => {
    storage = createMemoryQueryStorage();
    for (const key of [
      `${TERM_A}manifest.json`,
      `${TERM_A}dept/CMSC.1.json`,
      `${TERM_A}dept/MATH.2.json`,
      `${TERM_B}dept/CMSC.3.json`,
      "catalog/terms.json",
    ])
      storage.rows.set(rowKey(key), { key });
    setQueryStorage(storage);
  });
  afterEach(() => setQueryStorage(null));

  it("are read in one go, each handed out once, and never over a newer write", async () => {
    const rowsFrom = vi.spyOn(storage, "rowsFrom");
    const getItem = vi.spyOn(storage, "getItem");
    // The persister wraps the storage it's given: give it the spied one.
    setQueryStorage(storage);
    await preloadPublished("catalog", "live", TERM_A);
    expect(rowsFrom).toHaveBeenCalledTimes(1);

    const persister = publishedPersister("catalog");
    const read = (key: string) =>
      persister.retrieveQuery(JSON.stringify(publishedKey("live", key)));
    // From what was read ahead: no read of its own.
    getItem.mockClear();
    await read(`${TERM_A}dept/CMSC.1.json`).catch(() => undefined);
    expect(getItem).not.toHaveBeenCalled();
    // Handed out once: the next read goes to the storage.
    await read(`${TERM_A}dept/CMSC.1.json`).catch(() => undefined);
    expect(getItem).toHaveBeenCalledTimes(1);
    // Another term's rows weren't read ahead.
    getItem.mockClear();
    await read(`${TERM_B}dept/CMSC.3.json`).catch(() => undefined);
    expect(getItem).toHaveBeenCalledTimes(1);
  });

  it("drops a row read ahead once it's written, so the newer one is read", async () => {
    await preloadPublished("catalog", "live", TERM_A);
    const tracked = queryStorageForTests();
    await tracked?.setItem(rowKey(`${TERM_A}dept/MATH.2.json`), {
      newer: true,
    });
    expect(await tracked?.getItem(rowKey(`${TERM_A}dept/MATH.2.json`))).toEqual(
      { newer: true },
    );
  });

  it("are the only keys a term's pointer lists or prunes", async () => {
    const keys = vi.spyOn(storage, "keys");
    // The persister wraps the storage it's given: give it the spied one.
    setQueryStorage(storage);
    expect(await savedPublishedKeys("catalog", "live", TERM_A)).toEqual([
      `${TERM_A}manifest.json`,
      `${TERM_A}dept/CMSC.1.json`,
      `${TERM_A}dept/MATH.2.json`,
    ]);
    await prunePublished(
      "catalog",
      "live",
      new Set([`${TERM_A}manifest.json`]),
      TERM_A,
    );
    // Each asked the storage for this term's keys, not the family's.
    for (const [prefix] of keys.mock.calls)
      expect(prefix).toBe(`published:catalog-["published","live","${TERM_A}`);
    expect([...storage.rows.keys()].sort()).toEqual(
      [
        rowKey(`${TERM_A}manifest.json`),
        rowKey(`${TERM_B}dept/CMSC.3.json`),
        rowKey("catalog/terms.json"),
      ].sort(),
    );
  });
});

describe("publishedPersister", () => {
  afterEach(() => setQueryStorage(null));

  it("busts a family's rows with its schema version", async () => {
    const storage = createMemoryQueryStorage();
    setQueryStorage(storage);
    const persister = publishedPersister("reviews");
    const queryHash = JSON.stringify(publishedKey("live", "k"));
    const row = (buster: string) => ({
      buster,
      queryHash,
      queryKey: publishedKey("live", "k"),
      state: { data: 1, dataUpdatedAt: Date.now(), errorUpdatedAt: 0 },
    });
    const key = `published:reviews-${queryHash}`;

    storage.rows.set(key, row(`reviews@${SCHEMA_VERSIONS.reviews}`));
    expect(await persister.retrieveQuery(queryHash)).toBe(1);

    storage.rows.set(key, row("reviews@0"));
    expect(await persister.retrieveQuery(queryHash)).toBeUndefined();
    expect(storage.rows.has(key)).toBe(false);
  });

  it("does nothing where there's no IndexedDB", async () => {
    setQueryStorage(null);
    expect(
      await publishedPersister("reviews").retrieveQuery("x"),
    ).toBeUndefined();
  });
});
