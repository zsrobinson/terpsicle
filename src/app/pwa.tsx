import { useEffect } from "react";
import { InstallHost } from "~/features/pwa/install-host";
import { clientConfig } from "./config";
import { registerServiceWorker } from "./service-worker-registration";
import { showUpdateReady } from "./update-toast";

// The installable app, on every page: one service worker for the whole site
// (/sw.js), and the install prompt's host. Head tags: pwa-head.ts.

export function Pwa() {
  useEffect(() => {
    registerServiceWorker(clientConfig, showUpdateReady);
  }, []);
  return <InstallHost />;
}
