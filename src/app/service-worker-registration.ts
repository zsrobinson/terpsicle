import { SW_SKIP_WAITING_MESSAGE } from "~/core/schema";
import type { ClientConfig } from "./config";

// Registers /sw.js (src/server/service-worker.ts) for the whole site: the
// installed app, offline loads and push (V2 §3.2). Only in production builds
// on terpsicle.com: PR previews don't get one, and in dev and mock mode (e2e)
// it would cache files the dev server changes under it. `VITE_SW_DEV=1`
// registers it on localhost too, for push work.
//
// A new version waits (the service worker never skips waiting on its own);
// `onUpdateReady` gets a function that swaps it in and reloads.

export const SERVICE_WORKER_URL = "/sw.js";
/** The one host with a service worker in production builds. */
export const SERVICE_WORKER_HOST = "terpsicle.com";
/** A long-open tab asks for a new version when it comes back, at most this often. */
export const UPDATE_CHECK_MS = 30 * 60_000;

export function shouldRegisterServiceWorker(
  config: Pick<ClientConfig, "mode" | "swDev">,
  hostname: string,
): boolean {
  if (config.swDev && hostname === "localhost") return true;
  return config.mode === "production" && hostname === SERVICE_WORKER_HOST;
}

export function registerServiceWorker(
  config: Pick<ClientConfig, "mode" | "swDev">,
  onUpdateReady: (apply: () => void) => void,
  nav: Navigator = navigator,
  hostname: string = window.location.hostname,
): void {
  if (!("serviceWorker" in nav)) return;
  if (!shouldRegisterServiceWorker(config, hostname)) return;
  const register = () => {
    nav.serviceWorker
      .register(SERVICE_WORKER_URL, { scope: "/" })
      .then((registration) =>
        watchForUpdates(registration, nav.serviceWorker, onUpdateReady),
      )
      .catch((error: unknown) => {
        // The app works the same without it, just not offline or installed.
        console.warn("Service worker not registered", error);
      });
  };
  // After load, so it never competes with the app's own first requests.
  if (document.readyState === "complete") register();
  else window.addEventListener("load", register, { once: true });
}

/**
 * Calls `onUpdateReady` when a new version is installed and waiting behind
 * the one running this page. Its argument asks the new one to take over,
 * then reloads once it has. A first install (nothing controlling the page
 * yet) takes over on its own and isn't an update.
 */
export function watchForUpdates(
  registration: ServiceWorkerRegistration,
  container: ServiceWorkerContainer,
  onUpdateReady: (apply: () => void) => void,
  { now = () => Date.now() }: { now?: () => number } = {},
): void {
  let offered: ServiceWorker | null = null;
  const offer = (worker: ServiceWorker) => {
    if (!container.controller || offered === worker) return;
    offered = worker;
    onUpdateReady(() => {
      let reloading = false;
      container.addEventListener("controllerchange", () => {
        if (reloading) return;
        reloading = true;
        window.location.reload();
      });
      worker.postMessage({ type: SW_SKIP_WAITING_MESSAGE });
    });
  };
  if (registration.waiting) offer(registration.waiting);
  registration.addEventListener("updatefound", () => {
    const next = registration.installing;
    next?.addEventListener("statechange", () => {
      if (next.state === "installed") offer(next);
    });
  });
  // Browsers check for a new /sw.js on navigation, which a single-page app
  // rarely does; so check when the tab comes back into view.
  let checkedAt = now();
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible") return;
    if (now() - checkedAt < UPDATE_CHECK_MS) return;
    checkedAt = now();
    registration.update().catch(() => {
      // Offline: try again next time.
    });
  });
}
