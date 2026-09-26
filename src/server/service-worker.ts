// The service worker (served at /sw.js by the Worker): lets a reload work
// offline. Plans and the catalog already live in IndexedDB; what an offline
// reload lacked was the page itself and its scripts.
//
// - Pages are network-first: online, every load gets the current deploy's
//   HTML (and a copy is kept); only when the network fails is the last copy
//   used. So a new deploy is always picked up on the next online load, and
//   there's no "stuck on an old version" state to escape.
// - Hashed build files (/assets/*) never change, so they're cache-first,
//   kept as they're fetched (lazy chunks too), oldest dropped past a cap.
// - Everything else (/data, /api, analytics) passes straight through.
//
// To retire it, serve a /sw.js whose activate handler calls
// `self.registration.unregister()`; browsers check /sw.js on every
// navigation (it's served no-cache), so it spreads on the next visit.

/** Bump to drop every cache the previous service worker kept. */
export const SERVICE_WORKER_VERSION = 1;
/** Build files kept at most; a deploy has a few dozen. */
export const MAX_CACHED_ASSETS = 400;

// The parts of the service worker scope this uses, so tests can fake them.
interface SwEvent {
  waitUntil(promise: Promise<unknown>): void;
}
interface SwFetchEvent extends SwEvent {
  /** `mode` is "navigate" for page loads (browsers only; Workers types lack it). */
  request: Request & { readonly mode?: string };
  respondWith(response: Promise<Response>): void;
}
export interface SwScope {
  location: { origin: string };
  addEventListener(
    type: "install" | "activate",
    listener: (event: SwEvent) => void,
  ): void;
  addEventListener(
    type: "fetch",
    listener: (event: SwFetchEvent) => void,
  ): void;
  skipWaiting(): Promise<void>;
  clients: { claim(): Promise<void> };
}
export interface SwCache {
  match(request: Request | string): Promise<Response | undefined>;
  put(request: Request | string, response: Response): Promise<void>;
  keys(): Promise<readonly Request[]>;
  delete(request: Request | string): Promise<boolean>;
}
export interface SwCaches {
  open(name: string): Promise<SwCache>;
  keys(): Promise<string[]>;
  delete(name: string): Promise<boolean>;
}

// Stringified into /sw.js, so it must be self-contained: no imports, no
// references to anything else in this module.
export function installServiceWorker(
  sw: SwScope,
  cacheStorage: SwCaches,
  doFetch: (request: Request) => Promise<Response>,
  version: number,
  maxAssets: number,
) {
  const PAGES = `terpsicle-pages-v${version}`;
  const ASSETS = `terpsicle-assets-v${version}`;

  sw.addEventListener("install", () => {
    // Nothing to precache: pages and files are kept as they're used.
    void sw.skipWaiting();
  });

  sw.addEventListener("activate", (event) => {
    event.waitUntil(
      (async () => {
        for (const name of await cacheStorage.keys())
          if (
            name.startsWith("terpsicle-") &&
            name !== PAGES &&
            name !== ASSETS
          )
            await cacheStorage.delete(name);
        await sw.clients.claim();
      })(),
    );
  });

  const page = async (request: Request, key: string): Promise<Response> => {
    const cache = await cacheStorage.open(PAGES);
    try {
      const response = await doFetch(request);
      const type = response.headers.get("Content-Type") ?? "";
      if (response.ok && type.startsWith("text/html"))
        await cache.put(key, response.clone());
      return response;
    } catch (error) {
      // Offline: the last copy of this page, or of the scheduler's
      // (`SCHEDULE_PATH` in ~/core/routing; this function can't import it).
      const saved =
        (await cache.match(key)) ??
        (await cache.match(`${sw.location.origin}/schedule`));
      if (saved) return saved;
      throw error;
    }
  };

  const asset = async (request: Request): Promise<Response> => {
    const cache = await cacheStorage.open(ASSETS);
    const saved = await cache.match(request);
    if (saved) return saved;
    const response = await doFetch(request);
    if (response.ok) {
      await cache.put(request, response.clone());
      const keys = await cache.keys();
      // Oldest first (insertion order).
      for (const old of keys.slice(0, Math.max(0, keys.length - maxAssets)))
        await cache.delete(old);
    }
    return response;
  };

  sw.addEventListener("fetch", (event) => {
    const request = event.request;
    if (request.method !== "GET") return;
    const url = new URL(request.url);
    if (url.origin !== sw.location.origin) return;
    if (request.mode === "navigate") {
      // The query (?plan=…) doesn't change the page, only what it shows.
      event.respondWith(page(request, `${url.origin}${url.pathname}`));
      return;
    }
    if (url.pathname.startsWith("/assets/")) event.respondWith(asset(request));
  });
}

/** The body of /sw.js. */
export const SERVICE_WORKER_JS = `(${installServiceWorker.toString()})(self, caches, (request) => fetch(request), ${SERVICE_WORKER_VERSION}, ${MAX_CACHED_ASSETS});\n`;
