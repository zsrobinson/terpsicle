import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SCHEMA_VERSIONS } from "~/core/schema";
import {
  createDexieQueryStorage,
  createMemoryQueryStorage,
  prunePublished,
  publishedPersister,
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
