import { cacheControlFor } from "~/core/catalog/cache-policy";

export const DATA_PREFIX = "/data/";

// R2 objects written without httpMetadata still need a usable type.
const CONTENT_TYPES: Record<string, string> = {
  json: "application/json; charset=utf-8",
  bin: "application/octet-stream",
  pmtiles: "application/octet-stream",
};

/**
 * `GET|HEAD /data/<key>` → R2 object `<key>` from the DATA bucket.
 *
 * Responses go through the Cache API (keyed on the path, ignoring the query
 * string, so cache-busting params can't bypass it) and carry the R2 ETag, so
 * clients revalidate with If-None-Match and get a bodyless 304.
 */
export async function serveData(
  request: Request,
  env: Pick<Env, "DATA">,
  ctx: Pick<ExecutionContext, "waitUntil">,
  cache: Cache = caches.default,
): Promise<Response> {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return new Response(`${request.method} isn't supported on /data.`, {
      status: 405,
      headers: { Allow: "GET, HEAD", "Content-Type": "text/plain" },
    });
  }

  const url = new URL(request.url);
  const key = decodeURIComponent(url.pathname.slice(DATA_PREFIX.length));
  if (key === "" || key.endsWith("/")) return notFound(key);

  const cacheKey = new Request(`${url.origin}${url.pathname}`);
  let response = await cache.match(cacheKey);
  if (!response) {
    const object = await env.DATA.get(key);
    if (!object) return notFound(key);

    const headers = new Headers();
    object.writeHttpMetadata(headers);
    if (!headers.has("Content-Type")) {
      const ext = key.slice(key.lastIndexOf(".") + 1);
      headers.set(
        "Content-Type",
        CONTENT_TYPES[ext] ?? "application/octet-stream",
      );
    }
    headers.set("ETag", object.httpEtag);
    headers.set("Cache-Control", cacheControlFor(key));
    // Public data. Lets `pnpm dev` read production data from localhost.
    headers.set("Access-Control-Allow-Origin", "*");

    response = new Response(object.body, { headers });
    ctx.waitUntil(cache.put(cacheKey, response.clone()));
  }

  const etag = response.headers.get("ETag");
  if (etag && etagMatches(request.headers.get("If-None-Match"), etag)) {
    const headers = new Headers();
    for (const name of ["ETag", "Cache-Control", "Access-Control-Allow-Origin"])
      copyHeader(response.headers, headers, name);
    return new Response(null, { status: 304, headers });
  }
  if (request.method === "HEAD") {
    return new Response(null, { headers: response.headers });
  }
  return response;
}

/** Weak comparison (RFC 9110 §13.1.2): `W/"x"` matches `"x"`. */
export function etagMatches(ifNoneMatch: string | null, etag: string): boolean {
  if (!ifNoneMatch) return false;
  if (ifNoneMatch.trim() === "*") return true;
  const strip = (tag: string) => tag.trim().replace(/^W\//, "");
  const target = strip(etag);
  return ifNoneMatch.split(",").some((tag) => strip(tag) === target);
}

function notFound(key: string): Response {
  return new Response(`No data file at /data/${key}.`, {
    status: 404,
    headers: { "Content-Type": "text/plain", "Cache-Control": "no-store" },
  });
}

function copyHeader(from: Headers, to: Headers, name: string) {
  const value = from.get(name);
  if (value !== null) to.set(name, value);
}
