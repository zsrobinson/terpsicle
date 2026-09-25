import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SCHEMA_VERSIONS } from "~/core/schema";
import { archivedFixtureTermId, fixtureTermId } from "~/fixtures";
import {
  type CacheFile,
  createDexieCache,
  createMemoryCache,
  type DataCache,
  SCHEMA_VERSIONS_KEY,
  versionedCache,
} from "./data-cache";
import { TerpsicleDb } from "./db";

const AT = "2026-09-25T12:00:00.000Z";
const file = (key: string, over: Partial<CacheFile> = {}): CacheFile => ({
  key,
  family: "catalog",
  termId: fixtureTermId,
  data: { key },
  ...over,
});

let db: TerpsicleDb;
let dbCount = 0;

beforeEach(() => {
  db = new TerpsicleDb(`data-cache-test-${dbCount++}`);
});

afterEach(async () => {
  await db.delete();
});

describe("the Dexie cache", () => {
  it("stores pointers and files, and returns only the files it has", async () => {
    const cache = createDexieCache(db);
    await cache.putPointer("catalog/terms.json", { terms: [] }, AT);
    await cache.putFiles([file("a"), file("b")]);

    expect(await cache.getPointer("catalog/terms.json")).toEqual({
      data: { terms: [] },
      checkedAt: AT,
    });
    const found = await cache.getFiles(["a", "c", "b"]);
    expect([...found.keys()]).toEqual(["a", "b"]);
  });

  it("commits a manifest and evicts only that term's files it no longer lists", async () => {
    const cache = createDexieCache(db);
    await cache.putFiles([
      file("old"),
      file("kept"),
      file("other-term", { termId: archivedFixtureTermId }),
      file("geo", { family: "geo", termId: null }),
    ]);
    await cache.commit(
      { key: "manifest", data: { v: 2 }, checkedAt: AT },
      [file("new")],
      {
        termId: fixtureTermId,
        family: "catalog",
        keep: new Set(["kept", "new"]),
      },
    );

    const found = await cache.getFiles([
      "old",
      "kept",
      "new",
      "other-term",
      "geo",
    ]);
    expect([...found.keys()].sort()).toEqual([
      "geo",
      "kept",
      "new",
      "other-term",
    ]);
    expect((await cache.getPointer("manifest"))?.data).toEqual({ v: 2 });
  });

  it("keeps mock and live data apart", async () => {
    const live = createDexieCache(db);
    const mock = createDexieCache(db, "mock:");
    await live.putFiles([file("a", { data: "live" })]);
    await mock.putFiles([file("a", { data: "mock" })]);
    await mock.commit({ key: "m", data: 1, checkedAt: AT }, [], {
      termId: fixtureTermId,
      family: "catalog",
      keep: new Set(),
    });

    expect((await live.getFiles(["a"])).get("a")).toBe("live");
    expect((await mock.getFiles(["a"])).size).toBe(0);
  });

  it("clears one family, pointers included", async () => {
    const cache = createDexieCache(db);
    await cache.putFiles([
      file("a"),
      file("g", { family: "geo", termId: null }),
    ]);
    await cache.putPointer("catalog/202701/manifest.json", {}, AT);
    await cache.putPointer("geo/manifest.json", {}, AT);
    await cache.clearFamily("catalog");

    expect([...(await cache.getFiles(["a", "g"])).keys()]).toEqual(["g"]);
    expect(await cache.getPointer("catalog/202701/manifest.json")).toBeNull();
    expect(await cache.getPointer("geo/manifest.json")).not.toBeNull();
  });

  it("never fails a load: storage errors read as a miss", async () => {
    const onError = vi.fn();
    const cache = createDexieCache(db, "", onError);
    db.close();
    expect(await cache.getFiles(["a"])).toEqual(new Map());
    expect(await cache.getPointer("x")).toBeNull();
    await cache.putFiles([file("a")]);
    expect(onError).toHaveBeenCalled();
  });
});

describe("versionedCache", () => {
  const filled = async (versions: Record<string, number>) => {
    const inner = createMemoryCache();
    await inner.putFiles([
      file("c"),
      file("g", { family: "geo", termId: null }),
    ]);
    await inner.putPointer(SCHEMA_VERSIONS_KEY, versions, AT);
    return inner;
  };

  it("keeps everything when the versions match", async () => {
    const inner = await filled(SCHEMA_VERSIONS);
    const cache: DataCache = versionedCache(inner, SCHEMA_VERSIONS);
    expect((await cache.getFiles(["c", "g"])).size).toBe(2);
  });

  it("drops only the bumped family, once", async () => {
    const inner = await filled({ ...SCHEMA_VERSIONS, geo: 0 });
    const cache = versionedCache(inner, SCHEMA_VERSIONS);
    expect([...(await cache.getFiles(["c", "g"])).keys()]).toEqual(["c"]);
    await cache.putFiles([file("g", { family: "geo", termId: null })]);
    expect((await cache.getFiles(["g"])).size).toBe(1);
    expect(inner.pointers.get(SCHEMA_VERSIONS_KEY)?.data).toEqual(
      SCHEMA_VERSIONS,
    );
  });
});
