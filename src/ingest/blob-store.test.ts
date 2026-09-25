import { describe, expect, it } from "vitest";
import { createMemoryBlobStore } from "./blob-store";

const decode = (bytes: Uint8Array | null) =>
  bytes === null ? null : new TextDecoder().decode(bytes);

describe("createMemoryBlobStore", () => {
  it("round-trips strings and bytes", async () => {
    const store = createMemoryBlobStore();
    await store.put("a/manifest.json", '{"v":1}', {
      contentType: "application/json",
    });
    await store.put("a/routes.bin", new Uint8Array([1, 2, 3]));

    expect(decode(await store.get("a/manifest.json"))).toBe('{"v":1}');
    expect(await store.get("a/routes.bin")).toEqual(new Uint8Array([1, 2, 3]));
    expect(store.contentTypeOf("a/manifest.json")).toBe("application/json");
  });

  it("returns null for missing keys and after delete", async () => {
    const store = createMemoryBlobStore({ "x.json": "{}" });
    expect(await store.get("missing.json")).toBeNull();
    await store.delete("x.json");
    expect(await store.get("x.json")).toBeNull();
  });

  it("lists keys under a prefix in order", async () => {
    const store = createMemoryBlobStore({
      "catalog/b.json": "",
      "catalog/a.json": "",
      "geo/tiles.pmtiles": "",
    });
    expect(await store.list("catalog/")).toEqual([
      "catalog/a.json",
      "catalog/b.json",
    ]);
  });

  it("writes conditionally on the etag it handed out", async () => {
    const store = createMemoryBlobStore();
    expect(await store.putIfMatch("m.json", "1", null)).toBe(true);
    expect(await store.putIfMatch("m.json", "x", null)).toBe(false);

    const first = await store.getVersioned("m.json");
    expect(decode(first?.body ?? null)).toBe("1");
    await store.put("m.json", "2");
    // Someone else wrote in between: the stale etag no longer matches.
    expect(await store.putIfMatch("m.json", "3", first?.etag ?? "")).toBe(
      false,
    );
    const second = await store.getVersioned("m.json");
    expect(await store.putIfMatch("m.json", "3", second?.etag ?? "")).toBe(
      true,
    );
    expect(decode(await store.get("m.json"))).toBe("3");
    expect(store.writes).toEqual(["m.json", "m.json", "m.json"]);
  });

  it("isolates stored bytes from caller mutation", async () => {
    const bytes = new Uint8Array([1]);
    const store = createMemoryBlobStore();
    await store.put("k", bytes);
    bytes[0] = 9;
    const read = await store.get("k");
    expect(read).toEqual(new Uint8Array([1]));
  });
});
