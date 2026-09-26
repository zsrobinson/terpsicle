import {
  createExecutionContext,
  waitOnExecutionContext,
} from "cloudflare:test";
import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { planetTerpReviewsKey } from "~/core/schema";
import { parseRange, serveData } from "./data";

// /data/* (DATA.md §2.5): policy from dataCachePolicy, ETags, Range for tiles.

const ORIGIN = "https://terpsicle.com";

async function get(path: string, init?: RequestInit) {
  const ctx = createExecutionContext();
  const response = await serveData(
    new Request(`${ORIGIN}${path}`, init),
    env,
    ctx,
  );
  await waitOnExecutionContext(ctx);
  return response;
}

const TILES = Uint8Array.from({ length: 1000 }, (_, i) => i % 256);

describe("cache policy", () => {
  it("revalidates manifests every time (no-cache) and sends an ETag", async () => {
    await env.DATA.put("catalog/202701/manifest.json", '{"schemaVersion":1}');
    const response = await get("/data/catalog/202701/manifest.json");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ schemaVersion: 1 });
    expect(response.headers.get("Content-Type")).toBe(
      "application/json; charset=utf-8",
    );
    expect(response.headers.get("Cache-Control")).toBe("public, no-cache");
    expect(response.headers.get("ETag")).toMatch(/^"/);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
  });

  it("keeps the browser's policy on a copy served from the edge cache", async () => {
    await env.DATA.put("catalog/terms.json", '{"terms":[]}');
    await (await get("/data/catalog/terms.json")).text();
    const again = await get("/data/catalog/terms.json");
    expect(again.headers.get("Cache-Control")).toBe("public, no-cache");
    expect(await again.json()).toEqual({ terms: [] });
  });

  it("marks content-hashed files immutable, with the right types", async () => {
    await env.DATA.put("geo/routes.0123456789abcdef.bin", new Uint8Array([7]));
    const bin = await get("/data/geo/routes.0123456789abcdef.bin");
    expect(bin.headers.get("Cache-Control")).toBe(
      "public, max-age=31536000, immutable",
    );
    expect(bin.headers.get("Content-Type")).toBe("application/octet-stream");
    expect(new Uint8Array(await bin.arrayBuffer())).toEqual(
      new Uint8Array([7]),
    );
  });

  it("gives calendars and route geometry their own lifetimes", async () => {
    await env.DATA.put("calendar/202608.json", "{}");
    await env.DATA.put("geo/route/IRB-CSI-standard.json", "{}");
    expect(
      (await get("/data/calendar/202608.json")).headers.get("Cache-Control"),
    ).toBe("public, max-age=3600");
    expect(
      (await get("/data/geo/route/IRB-CSI-standard.json")).headers.get(
        "Cache-Control",
      ),
    ).toBe("public, max-age=86400");
  });

  it("never serves job state or summaries, even when they exist", async () => {
    await env.DATA.put("_jobs/seats/202701/baseline.json", "{}");
    await env.DATA.put("summaries/kruskal.json", "{}");
    // PlanetTerp review text is a private cache for summaries, not republished.
    await env.DATA.put(planetTerpReviewsKey("kruskal"), "{}");
    for (const key of [
      "_jobs/seats/202701/baseline.json",
      "summaries/kruskal.json",
      planetTerpReviewsKey("kruskal"),
    ]) {
      const response = await get(`/data/${key}`);
      expect(response.status).toBe(404);
      expect(await response.text()).toBe(`No data file at /data/${key}.`);
    }
    // Percent-encoding the prefix doesn't get around it.
    expect(
      (await get("/data/%5Fjobs/planetterp/reviews/kruskal.json")).status,
    ).toBe(404);
  });

  it("404s in plain text when the object is missing", async () => {
    const response = await get("/data/catalog/202701/manifest-missing.json");
    expect(response.status).toBe(404);
    expect(response.headers.get("Content-Type")).toBe("text/plain");
  });

  it("rejects writes", async () => {
    const response = await get("/data/catalog/terms.json", {
      method: "PUT",
      body: "{}",
    });
    expect(response.status).toBe(405);
    expect(response.headers.get("Allow")).toBe("GET, HEAD");
  });
});

describe("ETags", () => {
  it("answers a matching If-None-Match (weak too) with a bodyless 304", async () => {
    await env.DATA.put("calendar/202612.json", '{"a":1}');
    const first = await get("/data/calendar/202612.json");
    const etag = first.headers.get("ETag") ?? "";
    await first.arrayBuffer();

    const second = await get("/data/calendar/202612.json", {
      headers: { "If-None-Match": `W/${etag}` },
    });
    expect(second.status).toBe(304);
    expect(second.headers.get("ETag")).toBe(etag);
    expect(second.headers.get("Cache-Control")).toBe("public, max-age=3600");
    expect(await second.text()).toBe("");

    const stale = await get("/data/calendar/202612.json", {
      headers: { "If-None-Match": '"something-else"' },
    });
    expect(stale.status).toBe(200);
  });

  it("answers HEAD with headers only", async () => {
    await env.DATA.put("calendar/202605.json", '{"a":1}');
    const response = await get("/data/calendar/202605.json", {
      method: "HEAD",
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Length")).toBe("7");
    expect(await response.text()).toBe("");
  });
});

describe("Range (PMTiles)", () => {
  it("serves a byte range with 206 and Content-Range", async () => {
    await env.DATA.put("geo/tiles.pmtiles", TILES);
    const response = await get("/data/geo/tiles.pmtiles", {
      headers: { Range: "bytes=0-126" },
    });
    expect(response.status).toBe(206);
    expect(response.headers.get("Content-Range")).toBe("bytes 0-126/1000");
    expect(response.headers.get("Content-Length")).toBe("127");
    expect(response.headers.get("Content-Type")).toBe(
      "application/vnd.pmtiles",
    );
    expect(response.headers.get("Accept-Ranges")).toBe("bytes");
    expect(response.headers.get("Cache-Control")).toBe(
      "public, max-age=604800",
    );
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(
      TILES.slice(0, 127),
    );
  });

  it("handles open-ended and suffix ranges, clamped to the file", async () => {
    await env.DATA.put("geo/tiles.pmtiles", TILES);
    const tail = await get("/data/geo/tiles.pmtiles", {
      headers: { Range: "bytes=990-" },
    });
    expect(tail.headers.get("Content-Range")).toBe("bytes 990-999/1000");
    expect(new Uint8Array(await tail.arrayBuffer())).toEqual(TILES.slice(990));

    const suffix = await get("/data/geo/tiles.pmtiles", {
      headers: { Range: "bytes=-5000" },
    });
    expect(suffix.headers.get("Content-Range")).toBe("bytes 0-999/1000");
    expect((await suffix.arrayBuffer()).byteLength).toBe(1000);

    const past = await get("/data/geo/tiles.pmtiles", {
      headers: { Range: "bytes=900-2000" },
    });
    expect(past.headers.get("Content-Range")).toBe("bytes 900-999/1000");
    await past.arrayBuffer();
  });

  it("answers 416 for a range past the end", async () => {
    await env.DATA.put("geo/tiles.pmtiles", TILES);
    const response = await get("/data/geo/tiles.pmtiles", {
      headers: { Range: "bytes=5000-6000" },
    });
    expect(response.status).toBe(416);
    expect(response.headers.get("Content-Range")).toBe("bytes */1000");
    await response.text();
  });

  it("sends the whole file when If-Range names an old version", async () => {
    await env.DATA.put("geo/tiles.pmtiles", TILES);
    const response = await get("/data/geo/tiles.pmtiles", {
      headers: { Range: "bytes=0-9", "If-Range": '"old"' },
    });
    expect(response.status).toBe(200);
    expect((await response.arrayBuffer()).byteLength).toBe(1000);
  });

  it("parses the range forms it supports", () => {
    expect(parseRange("bytes=0-99")).toEqual({ offset: 0, length: 100 });
    expect(parseRange("bytes=100-")).toEqual({ offset: 100 });
    expect(parseRange("bytes=-10")).toEqual({ suffix: 10 });
    expect(parseRange("bytes=9-1")).toBe("invalid");
    expect(parseRange("bytes=0-1,5-6")).toBeNull();
    expect(parseRange("items=0-1")).toBeNull();
  });
});
