import { useEffect } from "react";
import { InstallHost } from "~/features/pwa/install-host";
import { clientConfig } from "./config";
import { registerServiceWorker } from "./service-worker-registration";
import { showUpdateReady } from "./update-toast";

// What pwa.tsx loads once the page has: the service worker's registration
// (the "Update ready" toast with it, since a deploy that brings an update
// may have removed this version's chunks) and the install prompt's host.

export function PwaClient() {
  useEffect(() => {
    registerServiceWorker(clientConfig, showUpdateReady);
  }, []);
  return <InstallHost />;
}
