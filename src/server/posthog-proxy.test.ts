import { describe, expect, it, vi } from "vitest";
import { proxyPostHog } from "./posthog-proxy";

function fakeUpstream(response = new Response("ok")) {
  return vi.fn<typeof fetch>(async () => response);
}

function upstreamCall(fetcher: ReturnType<typeof fakeUpstream>) {
  const [url, init] = fetcher.mock.calls[0] ?? [];
  return { url: String(url), init: init ?? {} };
}

describe("proxyPostHog", () => {
  it("sends /ingest/static/* to the asset CDN", async () => {
    const fetcher = fakeUpstream();
    await proxyPostHog(
      new Request("https://terpsicle.com/ingest/static/array.js?v=1"),
      fetcher,
    );
    expect(upstreamCall(fetcher).url).toBe(
      "https://us-assets.i.posthog.com/static/array.js?v=1",
    );
  });

  it("forwards API calls with method, query, body and content type", async () => {
    const fetcher = fakeUpstream();
    await proxyPostHog(
      new Request("https://terpsicle.com/ingest/decide/?v=3", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: "ph_session=secret",
          "CF-Connecting-IP": "203.0.113.9",
        },
        body: '{"token":"t"}',
      }),
      fetcher,
    );

    const { url, init } = upstreamCall(fetcher);
    const headers = new Headers(init.headers);
    expect(url).toBe("https://us.i.posthog.com/decide/?v=3");
    expect(init.method).toBe("POST");
    expect(await new Response(init.body).text()).toBe('{"token":"t"}');
    expect(headers.get("Content-Type")).toBe("application/json");
    expect(headers.has("Cookie")).toBe(false);
    expect(headers.has("CF-Connecting-IP")).toBe(false);
    // fetch derives Host from the upstream URL.
    expect(headers.has("Host")).toBe(false);
  });

  it("strips Set-Cookie from the response", async () => {
    const fetcher = fakeUpstream(
      new Response("{}", {
        status: 200,
        headers: { "Set-Cookie": "a=b", "Content-Type": "application/json" },
      }),
    );
    const response = await proxyPostHog(
      new Request("https://terpsicle.com/ingest/e/"),
      fetcher,
    );
    expect(response.headers.has("Set-Cookie")).toBe(false);
    expect(response.headers.get("Content-Type")).toBe("application/json");
  });
});
