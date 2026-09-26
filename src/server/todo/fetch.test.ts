// The fetcher (docs/V3.md §3.5): redirects only on ELMS, a size cap, a
// timeout, conditional GETs, and error codes instead of messages.
import { describe, expect, it } from "vitest";
import { fetchFeed } from "./fetch";
import { ELMS_FEED, FEED_URL } from "./testing";

type Handler = (
  url: string,
  init: RequestInit | undefined,
) => Response | Promise<Response>;

function fake(handler: Handler) {
  const seen: { url: string; init: RequestInit | undefined }[] = [];
  const fetcher: typeof fetch = async (input, init) => {
    const url = input instanceof Request ? input.url : String(input);
    seen.push({ url, init });
    return handler(url, init);
  };
  return { fetch: fetcher, seen };
}

const redirect = (location: string, status = 302) =>
  new Response(null, { status, headers: { Location: location } });

describe("fetchFeed", () => {
  it("gets the body, its validators and a short hash", async () => {
    const { fetch, seen } = fake(
      () =>
        new Response(ELMS_FEED, {
          headers: {
            ETag: '"abc"',
            "Last-Modified": "Sat, 26 Sep 2026 12:00:00 GMT",
          },
        }),
    );
    const result = await fetchFeed(FEED_URL, { fetch });
    expect(result).toMatchObject({
      ok: true,
      notModified: false,
      text: ELMS_FEED,
      etag: '"abc"',
      lastModified: "Sat, 26 Sep 2026 12:00:00 GMT",
    });
    expect(result.ok && !result.notModified && result.hash).toMatch(
      /^[0-9a-f]{16}$/,
    );
    expect(seen[0]?.init?.redirect).toBe("manual");
  });

  it("sends validators and reads a 304", async () => {
    const { fetch, seen } = fake(() => new Response(null, { status: 304 }));
    expect(
      await fetchFeed(FEED_URL, {
        fetch,
        etag: '"abc"',
        lastModified: "Sat, 26 Sep 2026 12:00:00 GMT",
      }),
    ).toEqual({ ok: true, notModified: true });
    const headers = new Headers(seen[0]?.init?.headers);
    expect(headers.get("If-None-Match")).toBe('"abc"');
    expect(headers.get("If-Modified-Since")).toBe(
      "Sat, 26 Sep 2026 12:00:00 GMT",
    );
  });

  it("turns HTTP errors into codes", async () => {
    for (const status of [404, 410, 500, 503]) {
      const { fetch } = fake(() => new Response("nope", { status }));
      expect(await fetchFeed(FEED_URL, { fetch })).toEqual({
        ok: false,
        code: `http-${status}`,
      });
    }
  });

  it("follows up to two redirects that stay on ELMS", async () => {
    const hops = [
      "https://umd.instructure.com/feeds/calendars/user_x.ics",
      "/feeds/calendars/user_y.ics",
    ];
    const { fetch, seen } = fake(() => {
      const i = seen.length - 1;
      return i < hops.length
        ? redirect(hops[i] ?? "")
        : new Response(ELMS_FEED);
    });
    expect((await fetchFeed(FEED_URL, { fetch })).ok).toBe(true);
    expect(seen.map((s) => s.url)).toEqual([
      FEED_URL,
      "https://umd.instructure.com/feeds/calendars/user_x.ics",
      "https://umd.instructure.com/feeds/calendars/user_y.ics",
    ]);
  });

  it("refuses a third redirect, one off ELMS, or one without a Location", async () => {
    const always = fake(() => redirect("https://elms.umd.edu/next.ics", 301));
    expect(await fetchFeed(FEED_URL, { fetch: always.fetch })).toEqual({
      ok: false,
      code: "bad-redirect",
    });
    expect(always.seen).toHaveLength(3);
    for (const location of [
      "https://evil.example/feed.ics",
      "http://elms.umd.edu/feed.ics",
      "https://elms.umd.edu:8443/feed.ics",
      "https://user:pw@elms.umd.edu/feed.ics",
      "http://169.254.169.254/latest/meta-data",
    ]) {
      const { fetch, seen } = fake(() => redirect(location, 307));
      expect(await fetchFeed(FEED_URL, { fetch })).toEqual({
        ok: false,
        code: "bad-redirect",
      });
      expect(seen).toHaveLength(1);
    }
    const bare = fake(() => new Response(null, { status: 302 }));
    expect(await fetchFeed(FEED_URL, { fetch: bare.fetch })).toEqual({
      ok: false,
      code: "bad-redirect",
    });
  });

  it("cuts off a body over the limit", async () => {
    const big = fake(() => new Response("x".repeat(2_000)));
    expect(
      await fetchFeed(FEED_URL, { fetch: big.fetch, maxBytes: 1_000 }),
    ).toEqual({
      ok: false,
      code: "too-large",
    });
    const declared = fake(
      () =>
        new Response("small", { headers: { "Content-Length": "999999999" } }),
    );
    expect(await fetchFeed(FEED_URL, { fetch: declared.fetch })).toEqual({
      ok: false,
      code: "too-large",
    });
  });

  it("times out, and keeps nothing of a thrown error", async () => {
    const hang = fake(
      (_url, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () =>
            reject(new Error(`aborted fetching ${FEED_URL}`)),
          );
        }),
    );
    expect(
      await fetchFeed(FEED_URL, { fetch: hang.fetch, timeoutMs: 20 }),
    ).toEqual({
      ok: false,
      code: "timeout",
    });
    const broken = fake(() => {
      throw new TypeError(`network connection lost: ${FEED_URL}`);
    });
    expect(await fetchFeed(FEED_URL, { fetch: broken.fetch })).toEqual({
      ok: false,
      code: "network",
    });
  });
});
