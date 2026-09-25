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
});
