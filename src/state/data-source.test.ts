import { describe, expect, it, vi } from "vitest";
import { createFetchDataSource, DataError } from "./data-source";

// The live data source's reads: what it asks `fetch` for, and what a read
// stopped by a pointer's deadline throws.

describe("createFetchDataSource", () => {
  it("passes the fetch priority and the signal on", async () => {
    const fetchImpl = vi.fn(async () => Response.json({ ok: true }));
    const source = createFetchDataSource(
      "https://example.test/data/",
      fetchImpl,
    );
    const controller = new AbortController();
    await source.readJson("catalog/terms.json", {
      priority: "low",
      signal: controller.signal,
    });
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://example.test/data/catalog/terms.json",
      { priority: "low", signal: controller.signal },
    );
  });

  it("throws the deadline's own error when a deadline stops the read, not a network one", async () => {
    const fetchImpl = vi.fn(
      (_url: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((_, reject) => {
          init?.signal?.addEventListener("abort", () =>
            reject(new DOMException("Aborted", "AbortError")),
          );
        }),
    );
    const source = createFetchDataSource(
      "https://example.test/data",
      fetchImpl,
    );
    const controller = new AbortController();
    const read = source
      .readJson("catalog/202701/manifest.json", { signal: controller.signal })
      .catch((error: unknown) => error);
    const late = new DataError("catalog/manifest.json", "timeout", "too slow");
    controller.abort(late);
    expect(await read).toBe(late);
  });

  it("still calls a dropped connection a network failure", async () => {
    const source = createFetchDataSource("https://example.test/data", () =>
      Promise.reject(new TypeError("Failed to fetch")),
    );
    const error = await source
      .readJson("catalog/terms.json")
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(DataError);
    expect((error as DataError).reason).toBe("network");
  });
});
