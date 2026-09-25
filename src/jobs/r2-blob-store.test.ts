import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { createR2BlobStore } from "./r2-blob-store";

describe("createR2BlobStore", () => {
  it("round-trips through the R2 binding", async () => {
    const store = createR2BlobStore(env.DATA);
    await store.put("blob-test/a.json", '{"a":1}', {
      contentType: "application/json",
    });
    await store.put("blob-test/b.bin", new Uint8Array([1, 2]));

    const a = await store.get("blob-test/a.json");
    expect(new TextDecoder().decode(a ?? undefined)).toBe('{"a":1}');
    expect((await env.DATA.head("blob-test/a.json"))?.httpMetadata).toEqual({
      contentType: "application/json",
    });
    expect(await store.list("blob-test/")).toEqual([
      "blob-test/a.json",
      "blob-test/b.bin",
    ]);

    await store.delete("blob-test/a.json");
    expect(await store.get("blob-test/a.json")).toBeNull();
  });

  it("writes conditionally on etags", async () => {
    const store = createR2BlobStore(env.DATA);
    expect(await store.putIfMatch("cond/m.json", "1", null)).toBe(true);
    expect(await store.putIfMatch("cond/m.json", "x", null)).toBe(false);

    const first = await store.getVersioned("cond/m.json");
    await store.put("cond/m.json", "2");
    expect(await store.putIfMatch("cond/m.json", "3", first?.etag ?? "")).toBe(
      false,
    );
    const second = await store.getVersioned("cond/m.json");
    expect(await store.putIfMatch("cond/m.json", "3", second?.etag ?? "")).toBe(
      true,
    );
    expect(
      new TextDecoder().decode((await store.get("cond/m.json")) ?? undefined),
    ).toBe("3");
  });
});
