import type { ClientConfig } from "./config";

// Registers /sw.js (src/server/service-worker.ts) so a reload works offline.
// Production builds only: in dev and mock mode (e2e) a service worker would
// cache files the dev server changes under it.

export const SERVICE_WORKER_URL = "/sw.js";

export function registerServiceWorker(
  config: Pick<ClientConfig, "mode">,
  nav: Navigator = navigator,
): void {
  if (config.mode !== "production" || !("serviceWorker" in nav)) return;
  const register = () => {
    nav.serviceWorker
      .register(SERVICE_WORKER_URL, { scope: "/" })
      .catch((error: unknown) => {
        // Only offline reloads depend on it; the app works the same without.
        console.warn("Service worker not registered", error);
      });
  };
  // After load, so it never competes with the app's own first requests.
  if (document.readyState === "complete") register();
  else window.addEventListener("load", register, { once: true });
}
