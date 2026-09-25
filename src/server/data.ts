import { type DataCachePolicy, dataCachePolicy } from "~/core/schema";

export const DATA_PREFIX = "/data/";

/** By extension, so every file is labeled the same however it was uploaded. */
const CONTENT_TYPES: Record<string, string> = {
  json: "application/json; charset=utf-8",
  bin: "application/octet-stream",
  pmtiles: "application/vnd.pmtiles",
};

/**
 * `GET|HEAD /data/<key>` → R2 object `<key>` from the DATA bucket
 * (DATA.md §2.5).
 *
 * - Which keys are served, and how long browsers and the edge keep them, is
 *   `dataCachePolicy` in `~/core/schema`: one source of truth. Everything
 *   else (`_jobs/`, `summaries/`) is a 404.
 * - Whole-file responses go through the Cache API (keyed on the path,
 *   ignoring the query string, so cache-busting params can't bypass it) and
 *   carry the R2 ETag, so clients revalidate with If-None-Match and get a
 *   bodyless 304.
 * - `Range` requests (MapLibre reading `geo/tiles.pmtiles`) go straight to
 *   R2 and answer 206 with `Content-Range`, or 416.
 * - `Access-Control-Allow-Origin: *`: the data is public, and `pnpm dev`
 *   reads production data from localhost.
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
  let key: string;
  try {
    key = decodeURIComponent(url.pathname.slice(DATA_PREFIX.length));
  } catch {
    return notFound(url.pathname.slice(DATA_PREFIX.length));
  }
  const policy = key === "" || key.endsWith("/") ? null : dataCachePolicy(key);
  if (!policy) return notFound(key);

  const range = request.headers.get("Range");
  if (range) {
    const partial = await serveRange(request, env, key, policy, range);
    if (partial) return partial;
  }

  const cacheKey = new Request(`${url.origin}${url.pathname}`);
  let cached = await cache.match(cacheKey);
  if (!cached) {
    const object = await env.DATA.get(key);
    if (!object) return notFound(key);
    const headers = baseHeaders(key, object.httpEtag, policy);
    headers.set("Content-Length", String(object.size));
    // The edge copy lives for the policy's edge TTL; browsers get their own
    // Cache-Control below.
    headers.set("Cache-Control", `public, max-age=${policy.edgeTtlSeconds}`);
    cached = new Response(object.body, { headers });
    ctx.waitUntil(cache.put(cacheKey, cached.clone()));
  }

  const headers = new Headers(cached.headers);
  headers.set("Cache-Control", policy.cacheControl);
  const etag = headers.get("ETag");
  if (etag && etagMatches(request.headers.get("If-None-Match"), etag)) {
    const notModified = new Headers();
    for (const name of [
      "ETag",
      "Cache-Control",
      "Access-Control-Allow-Origin",
      "Accept-Ranges",
    ])
      copyHeader(headers, notModified, name);
    return new Response(null, { status: 304, headers: notModified });
  }
  if (request.method === "HEAD") {
    return new Response(null, { headers });
  }
  return new Response(cached.body, { headers });
}

function baseHeaders(
  key: string,
  etag: string,
  policy: DataCachePolicy,
): Headers {
  const ext = key.slice(key.lastIndexOf(".") + 1);
  return new Headers({
    "Content-Type": CONTENT_TYPES[ext] ?? "application/octet-stream",
    ETag: etag,
    "Cache-Control": policy.cacheControl,
    "Accept-Ranges": "bytes",
    "Access-Control-Allow-Origin": "*",
  });
}

/** One byte range, as R2 takes it. */
export type ByteRange =
  | { offset: number; length?: number }
  | { suffix: number };

/**
 * `bytes=a-b`, `bytes=a-` or `bytes=-n`. Returns null for anything else
 * (another unit, several ranges), which is then served whole, as RFC 9110
 * allows.
 */
export function parseRange(header: string): ByteRange | "invalid" | null {
  const m = /^bytes=\s*(\d*)\s*-\s*(\d*)\s*$/i.exec(header.trim());
  if (!m) return null;
  const [, a = "", b = ""] = m;
  if (a === "" && b === "") return "invalid";
  if (a === "") {
    const suffix = Number(b);
    return suffix > 0 ? { suffix } : "invalid";
  }
  const offset = Number(a);
  if (b === "") return { offset };
  const end = Number(b);
  if (end < offset) return "invalid";
  return { offset, length: end - offset + 1 };
}

/** 206 with the requested bytes, 416 when they're past the end; null to serve the whole file. */
async function serveRange(
  request: Request,
  env: Pick<Env, "DATA">,
  key: string,
  policy: DataCachePolicy,
  header: string,
): Promise<Response | null> {
  const parsed = parseRange(header);
  if (parsed === null) return null;
  const head = await env.DATA.head(key);
  if (!head) return notFound(key);
  // If-Range with a different validator: the file changed, send it whole.
  const ifRange = request.headers.get("If-Range");
  if (ifRange && ifRange.trim() !== head.httpEtag) return null;

  const size = head.size;
  const unsatisfiable =
    parsed === "invalid" || ("offset" in parsed && parsed.offset >= size);
  if (unsatisfiable) {
    const headers = baseHeaders(key, head.httpEtag, policy);
    headers.set("Content-Range", `bytes */${size}`);
    headers.set("Content-Type", "text/plain");
    return new Response(`That range is outside /data/${key} (${size} bytes).`, {
      status: 416,
      headers,
    });
  }
  // Clamped to the file, as absolute start and length.
  const start =
    "suffix" in parsed ? size - Math.min(parsed.suffix, size) : parsed.offset;
  const length =
    "suffix" in parsed
      ? size - start
      : Math.min(parsed.length ?? size - start, size - start);
  const object = await env.DATA.get(key, { range: { offset: start, length } });
  if (!object) return notFound(key);
  const headers = baseHeaders(key, object.httpEtag, policy);
  headers.set("Content-Range", `bytes ${start}-${start + length - 1}/${size}`);
  headers.set("Content-Length", String(length));
  return new Response(request.method === "HEAD" ? null : object.body, {
    status: 206,
    headers,
  });
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
