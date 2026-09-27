// The only code that fetches a feed (docs/V3.md §3.5). It gets the link from
// `todo/connect`'s body or from crypto.ts, and gives back the body or an
// error code: never a message, since `fetch()` errors and responses can
// carry the URL. Nothing here logs.

import type { TodoFetchFailure } from "~/core/schema";
import { isElmsUrl } from "~/core/todo";
import { sha256Hex } from "../crypto";
import {
  type FeedKeys,
  type FeedOwner,
  openFeedLink,
  sealedKeyId,
  sealFeedLink,
} from "./crypto";

/**
 * Who's asking, as the ingest jobs say it (`src/ingest/http.ts`). ELMS's
 * firewall answers a request with no User-Agent (a Worker's fetch sends
 * none) with 403 "Not Authorized", so without it no feed ever loads.
 */
export const FEED_USER_AGENT = "Terpsicle/2 (+https://terpsicle.com)";
/** A cron or refresh fetch: nobody's waiting on it, and it runs 8 at a time. */
export const FEED_TIMEOUT_MS = 10_000;
/**
 * Connecting, while the person waits. Canvas builds a feed as it's asked,
 * across every course, and a real student's can take several seconds, so
 * the first fetch gets longer than the cron's. The Worker's wall time isn't
 * a limit here (waiting on a subrequest isn't CPU), nor is the app's client,
 * which sets no timeout of its own.
 */
export const CONNECT_TIMEOUT_MS = 25_000;
export const FEED_MAX_BYTES = 5 * 1_048_576;
export const FEED_MAX_REDIRECTS = 2;

export interface FeedFetchOptions {
  fetch: typeof fetch;
  /** Sent as If-None-Match / If-Modified-Since when we have them. */
  etag?: string | null;
  lastModified?: string | null;
  timeoutMs?: number;
  maxBytes?: number;
}

export type FeedFetch =
  | { ok: true; notModified: true }
  | {
      ok: true;
      notModified: false;
      text: string;
      etag: string | null;
      lastModified: string | null;
      /** 16 hex of SHA-256 of the body. */
      hash: string;
    }
  | { ok: false; code: TodoFetchFailure };

const REDIRECTS = new Set([301, 302, 303, 307, 308]);

class TooLarge extends Error {}

async function readCapped(
  response: Response,
  maxBytes: number,
): Promise<string> {
  const declared = Number(response.headers.get("Content-Length") ?? "0");
  if (declared > maxBytes) {
    await response.body?.cancel();
    throw new TooLarge();
  }
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel();
      throw new TooLarge();
    }
    chunks.push(value);
  }
  const body = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(body);
}

/**
 * GETs a feed link, following at most two redirects, each of which must stay
 * on an ELMS host. 10 seconds for the whole thing unless `timeoutMs` says
 * otherwise; a body over 5 MB is `too-large`.
 */
export async function fetchFeed(
  url: string,
  options: FeedFetchOptions,
): Promise<FeedFetch> {
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(),
    options.timeoutMs ?? FEED_TIMEOUT_MS,
  );
  // Called on its own, never as `options.fetch(…)`: the Workers runtime
  // throws "Illegal invocation" when its fetch runs with another `this`, and
  // the catch below would read that as ELMS not answering.
  const send = options.fetch;
  try {
    let current = url;
    for (let hop = 0; ; hop++) {
      const headers = new Headers({
        Accept: "text/calendar, */*;q=0.5",
        "User-Agent": FEED_USER_AGENT,
      });
      if (options.etag) headers.set("If-None-Match", options.etag);
      if (options.lastModified)
        headers.set("If-Modified-Since", options.lastModified);
      const response = await send(current, {
        method: "GET",
        redirect: "manual",
        headers,
        signal: controller.signal,
      });
      if (REDIRECTS.has(response.status)) {
        await response.body?.cancel();
        const location = response.headers.get("Location");
        if (!location || hop >= FEED_MAX_REDIRECTS)
          return { ok: false, code: "bad-redirect" };
        let next: string;
        try {
          next = new URL(location, current).href;
        } catch {
          return { ok: false, code: "bad-redirect" };
        }
        if (!isElmsUrl(next)) return { ok: false, code: "bad-redirect" };
        current = next;
        continue;
      }
      if (response.status === 304) {
        await response.body?.cancel();
        return { ok: true, notModified: true };
      }
      if (response.status < 200 || response.status > 299) {
        await response.body?.cancel();
        const status = Math.min(Math.max(response.status, 100), 599);
        return { ok: false, code: `http-${status}` };
      }
      const text = await readCapped(
        response,
        options.maxBytes ?? FEED_MAX_BYTES,
      );
      return {
        ok: true,
        notModified: false,
        text,
        etag: response.headers.get("ETag"),
        lastModified: response.headers.get("Last-Modified"),
        hash: (await sha256Hex(text)).slice(0, 16),
      };
    }
  } catch (error) {
    // Whatever was thrown is dropped here: only the code leaves.
    if (error instanceof TooLarge) return { ok: false, code: "too-large" };
    return {
      ok: false,
      code: controller.signal.aborted ? "timeout" : "network",
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Fetches a stored feed: opens its sealed link and fetches it. When the link
 * was sealed under a previous key, `resealed` is it sealed under the current
 * one, for the caller to write (the rotation in V3 §3.3).
 */
export async function fetchSealedFeed(
  keys: FeedKeys,
  owner: FeedOwner,
  sealed: string,
  options: FeedFetchOptions,
): Promise<{
  result: FeedFetch | { ok: false; code: "key" };
  resealed: string | null;
}> {
  const url = await openFeedLink(keys, owner, sealed);
  if (url === null)
    return { result: { ok: false, code: "key" }, resealed: null };
  const resealed =
    sealedKeyId(sealed) === keys.current.id
      ? null
      : await sealFeedLink(keys, owner, url);
  return { result: await fetchFeed(url, options), resealed };
}
