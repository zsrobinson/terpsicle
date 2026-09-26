import { PWA_START_URL, SW_SKIP_WAITING_MESSAGE } from "~/core/schema";

// The service worker (served at /sw.js by the Worker): makes Terpsicle an
// installable app that opens offline, and shows web push notifications.
// Plans and the catalog already live in IndexedDB; what an offline load
// lacked was the page itself and its scripts.
//
// - Pages are network-first: online, every load gets the current deploy's
//   HTML (and a copy is kept); only when the network fails is the last copy
//   used. So a new deploy is always picked up on the next online load, and
//   there's no "stuck on an old version" state to escape.
// - The app shell's hashed build files are precached when a new version
//   installs (the list comes from the client build: scripts/pwa-precache.ts).
//   Other build files (/assets/*) never change either, so they're
//   cache-first, kept as they're fetched (lazy chunks too), oldest dropped
//   past a cap.
// - /api is never cached. /data isn't either: IndexedDB already keeps it, and
//   the manifests are `no-cache` so the app's 60-second poll sees a new
//   catalog at once; a stale-while-revalidate copy would hide it for a poll
//   (docs/DATA.md §2.5, §5.1). Analytics pass straight through too.
// - A new version waits until the app asks it to take over ("Update ready"
//   → Reload, src/app/service-worker-registration.ts) or every tab closes.
// - Push: shows the payload (`PushPayloadSchema`); a click focuses a tab
//   already on its URL or opens one.
//
// To retire it, serve a /sw.js whose activate handler calls
// `self.registration.unregister()`; browsers check /sw.js on every
// navigation (it's served no-cache), so it spreads on the next visit.

/** Bump to drop every cache the previous service worker kept. */
export const SERVICE_WORKER_VERSION = 1;
/** Build files kept at most; a deploy has a few dozen. */
export const MAX_CACHED_ASSETS = 400;
/** Shown with every notification. */
export const NOTIFICATION_ICON = "/icons/icon-192.png";

// The parts of the service worker scope this uses, so tests can fake them.
interface SwEvent {
  waitUntil(promise: Promise<unknown>): void;
}
interface SwFetchEvent extends SwEvent {
  /** `mode` is "navigate" for page loads (browsers only; Workers types lack it). */
  request: Request & { readonly mode?: string };
  respondWith(response: Promise<Response>): void;
}
interface SwMessageEvent extends SwEvent {
  data: unknown;
}
interface SwPushEvent extends SwEvent {
  data: { json(): unknown } | null;
}
interface SwNotificationClickEvent extends SwEvent {
  notification: { data: unknown; close(): void };
}
export interface SwWindowClient {
  url: string;
  focus(): Promise<unknown>;
  /** Resolves null (or rejects) when the page isn't one this worker controls. */
  navigate(url: string): Promise<unknown>;
}
export interface SwNotificationOptions {
  body: string;
  tag?: string;
  icon: string;
  data: { url: string };
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
  addEventListener(
    type: "message",
    listener: (event: SwMessageEvent) => void,
  ): void;
  addEventListener(type: "push", listener: (event: SwPushEvent) => void): void;
  addEventListener(
    type: "notificationclick",
    listener: (event: SwNotificationClickEvent) => void,
  ): void;
  skipWaiting(): Promise<void>;
  registration: {
    showNotification(
      title: string,
      options: SwNotificationOptions,
    ): Promise<void>;
  };
  clients: {
    claim(): Promise<void>;
    matchAll(options: {
      type: "window";
      includeUncontrolled: boolean;
    }): Promise<readonly SwWindowClient[]>;
    openWindow(url: string): Promise<unknown>;
  };
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

export interface ServiceWorkerConfig {
  version: number;
  maxAssets: number;
  /** Names this build's precache; changes whenever the list does. */
  build: string;
  /** Root-relative URLs of the app shell's build files. */
  precache: readonly string[];
  startUrl: string;
  icon: string;
  skipWaitingMessage: string;
}

export interface ShownPush {
  title: string;
  body: string;
  url: string;
  tag?: string;
}

// Stringified into /sw.js (the service worker can't load zod), so it must
// be self-contained. The same checks as `PushPayloadSchema` in
// ~/core/schema; service-worker.test.ts holds the two together.
/** A push payload as sent, or null when it isn't one. */
export function readPushPayload(raw: unknown): ShownPush | null {
  if (typeof raw !== "object" || raw === null) return null;
  const { title, body, url, tag } = raw as Record<string, unknown>;
  if (typeof title !== "string") return null;
  const cleanTitle = title.trim();
  if (cleanTitle.length < 1 || cleanTitle.length > 120) return null;
  if (typeof body !== "string" || body.length > 400) return null;
  if (typeof url !== "string" || url.length > 2048 || !/^\/(?!\/)/.test(url))
    return null;
  if (tag === undefined) return { title: cleanTitle, body, url };
  if (typeof tag !== "string" || tag.length < 1 || tag.length > 64) return null;
  return { title: cleanTitle, body, url, tag };
}

// Stringified into /sw.js, so it must be self-contained: no imports, no
// references to anything else in this module.
export function installServiceWorker(
  sw: SwScope,
  cacheStorage: SwCaches,
  doFetch: (request: Request) => Promise<Response>,
  readPush: (raw: unknown) => ShownPush | null,
  config: ServiceWorkerConfig,
) {
  const PAGES = `terpsicle-pages-v${config.version}`;
  const ASSETS = `terpsicle-assets-v${config.version}`;
  const SHELL = `terpsicle-shell-v${config.version}-${config.build}`;
  const origin = sw.location.origin;

  sw.addEventListener("install", (event) => {
    // Precache the shell. Best effort: a file that fails (a deploy switching
    // over) is fetched and kept on first use instead, and a half-filled
    // shell never blocks the update. No skipWaiting: a new version waits
    // for the app's "Update ready" → Reload, or for every tab to close.
    event.waitUntil(
      (async () => {
        const shell = await cacheStorage.open(SHELL);
        await Promise.allSettled(
          config.precache.map(async (path) => {
            const url = `${origin}${path}`;
            if (await shell.match(url)) return;
            const response = await doFetch(new Request(url));
            if (response.ok) await shell.put(url, response);
          }),
        );
      })(),
    );
  });

  sw.addEventListener("message", (event) => {
    const data = event.data as { type?: unknown } | null;
    if (data && data.type === config.skipWaitingMessage) void sw.skipWaiting();
  });

  sw.addEventListener("activate", (event) => {
    event.waitUntil(
      (async () => {
        for (const name of await cacheStorage.keys())
          if (
            name.startsWith("terpsicle-") &&
            name !== PAGES &&
            name !== ASSETS &&
            name !== SHELL
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
      // Offline: the last copy of this page, else of the app itself.
      const saved =
        (await cache.match(key)) ??
        (await cache.match(`${origin}${config.startUrl}`)) ??
        (await cache.match(`${origin}/`));
      if (saved) return saved;
      throw error;
    }
  };

  const asset = async (request: Request): Promise<Response> => {
    const shell = await cacheStorage.open(SHELL);
    const precached = await shell.match(request);
    if (precached) return precached;
    const cache = await cacheStorage.open(ASSETS);
    const saved = await cache.match(request);
    if (saved) return saved;
    const response = await doFetch(request);
    if (response.ok) {
      await cache.put(request, response.clone());
      const keys = await cache.keys();
      // Oldest first (insertion order).
      for (const old of keys.slice(
        0,
        Math.max(0, keys.length - config.maxAssets),
      ))
        await cache.delete(old);
    }
    return response;
  };

  sw.addEventListener("fetch", (event) => {
    const request = event.request;
    if (request.method !== "GET") return;
    const url = new URL(request.url);
    if (url.origin !== origin) return;
    // Never cached: answers must be current, and some are private.
    if (url.pathname.startsWith("/api/")) return;
    // IndexedDB keeps it, and its manifests must revalidate (see above).
    if (url.pathname.startsWith("/data/")) return;
    if (request.mode === "navigate") {
      // The query (?plan=…) doesn't change the page, only what it shows.
      event.respondWith(page(request, `${url.origin}${url.pathname}`));
      return;
    }
    if (url.pathname.startsWith("/assets/")) event.respondWith(asset(request));
  });

  sw.addEventListener("push", (event) => {
    let raw: unknown = null;
    try {
      raw = event.data ? event.data.json() : null;
    } catch {
      raw = null;
    }
    // Every push must show something (browsers require it), so a payload we
    // can't read still says where to look.
    const push = readPush(raw) ?? {
      title: "Terpsicle",
      body: "Open Terpsicle to see what's new.",
      url: config.startUrl,
    };
    event.waitUntil(
      sw.registration.showNotification(push.title, {
        body: push.body,
        icon: config.icon,
        data: { url: push.url },
        ...(push.tag ? { tag: push.tag } : {}),
      }),
    );
  });

  sw.addEventListener("notificationclick", (event) => {
    event.notification.close();
    const data = event.notification.data as { url?: unknown } | null;
    const path =
      data && typeof data.url === "string" && /^\/(?!\/)/.test(data.url)
        ? data.url
        : config.startUrl;
    const target = new URL(path, origin).href;
    event.waitUntil(
      (async () => {
        const windows = await sw.clients.matchAll({
          type: "window",
          includeUncontrolled: true,
        });
        const there = windows.find((w) => w.url === target);
        if (there) {
          await there.focus();
          return;
        }
        // Reuse an open Terpsicle window rather than stacking up new ones.
        const open = windows[0];
        if (open) {
          try {
            await open.focus();
            if (await open.navigate(target)) return;
          } catch {
            // Not one this worker controls: open a new window instead.
          }
        }
        await sw.clients.openWindow(target);
      })(),
    );
  });
}

/** A short, stable name for a precache list (djb2), so each build gets its own cache. */
export function precacheBuildId(precache: readonly string[]): string {
  let hash = 5381;
  for (const char of precache.join("\n"))
    hash = ((hash * 33) ^ char.charCodeAt(0)) >>> 0;
  return hash.toString(36);
}

/** The body of /sw.js for a build's precache list (empty in dev). */
export function serviceWorkerScript(precache: readonly string[]): string {
  const config: ServiceWorkerConfig = {
    version: SERVICE_WORKER_VERSION,
    maxAssets: MAX_CACHED_ASSETS,
    build: precacheBuildId(precache),
    precache,
    startUrl: PWA_START_URL,
    icon: NOTIFICATION_ICON,
    skipWaitingMessage: SW_SKIP_WAITING_MESSAGE,
  };
  return `(${installServiceWorker.toString()})(self, caches, (request) => fetch(request), ${readPushPayload.toString()}, ${JSON.stringify(config)});\n`;
}
