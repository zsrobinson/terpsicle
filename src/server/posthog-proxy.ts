// A first-party path for PostHog so ad blockers don't drop anonymous
// analytics (docs/ANALYTICS.md). The client uses `api_host: "/ingest"`.

export const POSTHOG_PROXY_PREFIX = "/ingest";

const API_HOST = "us.i.posthog.com";
const ASSET_HOST = "us-assets.i.posthog.com";

// Never forwarded upstream: identity (cookies, auth), and headers that would
// hand PostHog the visitor's IP. PostHog sees Cloudflare's address instead.
const STRIPPED_REQUEST_HEADERS = [
  "cookie",
  "authorization",
  "host",
  "cf-connecting-ip",
  "cf-connecting-ipv6",
  "true-client-ip",
  "x-forwarded-for",
  "x-real-ip",
];

/**
 * `/ingest/static/*` → PostHog's asset CDN, everything else under `/ingest/*`
 * → the ingestion API. Method, body, query and content type pass through.
 */
export async function proxyPostHog(
  request: Request,
  fetcher: typeof fetch = fetch,
): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname.slice(POSTHOG_PROXY_PREFIX.length) || "/";
  const host = path.startsWith("/static/") ? ASSET_HOST : API_HOST;
  const upstream = new URL(`${path}${url.search}`, `https://${host}`);

  const headers = new Headers(request.headers);
  for (const name of STRIPPED_REQUEST_HEADERS) headers.delete(name);

  const hasBody = request.method !== "GET" && request.method !== "HEAD";
  const response = await fetcher(upstream, {
    method: request.method,
    headers,
    ...(hasBody ? { body: request.body } : {}),
    redirect: "manual",
  });

  const proxied = new Response(response.body, response);
  proxied.headers.delete("set-cookie");
  return proxied;
}
