import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { createMemoryBlobStore } from "./blob-store";
import { contentHash } from "./hash";
import { createHttpClient, HttpError, mapLimit } from "./http";
import { ManifestConflictError, updatePointer, writeHashed } from "./publish";
import { parseClock, parseLongDate, parseSeatsStamp } from "./time";

const Counter = z.object({ n: z.number().int() });

describe("writeHashed", () => {
  it("writes under the content hash, and skips when the hash is unchanged", async () => {
    const store = createMemoryBlobStore();
    const first = await writeHashed(
      store,
      Counter,
      { n: 1 },
      (h) => `c.${h}.json`,
      "counter",
    );
    expect(first.written).toBe(true);
    expect(first.hash).toBe(await contentHash('{"n":1}'));
    const again = await writeHashed(
      store,
      Counter,
      { n: 1 },
      (h) => `c.${h}.json`,
      "counter",
      first.hash,
    );
    expect(again.written).toBe(false);
    expect(store.writes).toEqual([first.key]);
  });

  it("refuses invalid data with where it's wrong", async () => {
    const store = createMemoryBlobStore();
    await expect(
      writeHashed(store, Counter, { n: 1.5 }, (h) => `c.${h}.json`, "counter"),
    ).rejects.toThrow(/counter doesn't match its schema at n/);
    expect(store.writes).toEqual([]);
  });
});

describe("updatePointer", () => {
  it("retries when another writer got in first", async () => {
    const store = createMemoryBlobStore({ "m.json": '{"n":1}' });
    let calls = 0;
    const result = await updatePointer(store, "m.json", Counter, (current) => {
      calls++;
      // Simulate the other job writing between our read and our write, once.
      if (calls === 1) void store.put("m.json", '{"n":10}');
      return { n: (current?.n ?? 0) + 1 };
    });
    expect(calls).toBe(2);
    expect(result).toEqual({ n: 11 });
  });

  it("gives up after five conflicts", async () => {
    const store = createMemoryBlobStore({ "m.json": '{"n":1}' });
    await expect(
      updatePointer(store, "m.json", Counter, (current) => {
        void store.put("m.json", '{"n":0}');
        return { n: (current?.n ?? 0) + 1 };
      }),
    ).rejects.toBeInstanceOf(ManifestConflictError);
  });

  it("never writes a value that fails its schema", async () => {
    const store = createMemoryBlobStore();
    await expect(
      updatePointer(store, "m.json", Counter, () => ({ n: -0.5 })),
    ).rejects.toThrow(/Refusing to write m.json/);
    expect(await store.get("m.json")).toBeNull();
  });
});

describe("http client", () => {
  it("sends our User-Agent and retries 5xx with backoff", async () => {
    const sleep = vi.fn(async () => {});
    const fetch = vi
      .fn<
        (input: string | URL | Request, init?: RequestInit) => Promise<Response>
      >()
      .mockResolvedValueOnce(new Response("busy", { status: 503 }))
      .mockResolvedValueOnce(new Response("ok"));
    const http = createHttpClient({ fetch, sleep });
    expect(await http.text("https://example.test/a")).toBe("ok");
    expect(
      new Headers(fetch.mock.calls[0]?.[1]?.headers).get("User-Agent"),
    ).toBe("Terpsicle/2 (+https://terpsicle.com)");
    expect(sleep).toHaveBeenCalledWith(500);
    expect(http.stats).toEqual({ requests: 2, retries: 1 });
  });

  it("doesn't retry a 404 and says which URL failed", async () => {
    const fetch = vi.fn(async () => new Response("nope", { status: 404 }));
    const http = createHttpClient({ fetch, sleep: async () => {} });
    const error = await http
      .text("https://example.test/b")
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(HttpError);
    expect(String(error)).toContain(
      "https://example.test/b failed with HTTP 404",
    );
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("caps concurrency and keeps result order", async () => {
    let inFlight = 0;
    let peak = 0;
    const out = await mapLimit([5, 1, 4, 2, 3], 2, async (n) => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, n));
      inFlight--;
      return n * 10;
    });
    expect(out).toEqual([50, 10, 40, 20, 30]);
    expect(peak).toBe(2);
  });
});

describe("time", () => {
  it("reads Testudo's seats stamp as Eastern time", () => {
    expect(parseSeatsStamp("09/24/2026 at 10:30 PM")).toBe(
      "2026-09-25T02:30:00.000Z",
    );
    expect(parseSeatsStamp("01/15/2027 at 9:05 AM")).toBe(
      "2027-01-15T14:05:00.000Z",
    );
    expect(parseSeatsStamp("12/01/2026 at 12:00 AM")).toBe(
      "2026-12-01T05:00:00.000Z",
    );
    expect(parseSeatsStamp("sometime")).toBeNull();
  });

  it("reads clock times and long dates", () => {
    expect(parseClock("12:00pm")).toBe(720);
    expect(parseClock("12:30am")).toBe(30);
    expect(parseClock("6:30am")).toBe(390);
    expect(parseClock("TBA")).toBeNull();
    expect(parseLongDate("March 1, 2027")).toBe("2027-03-01");
    expect(parseLongDate("Smarch 1, 2027")).toBeNull();
  });
});
