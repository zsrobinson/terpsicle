import { type ComponentType, lazy, Suspense, useEffect, useState } from "react";

// The installable app, on every page: one service worker for the whole site
// (/sw.js), and the install prompt's host (pwa-client.tsx). Head tags:
// pwa-head.ts.
//
// It loads once the page has, in a chunk of its own, so no page's first load
// carries it (scripts/check-bundle.ts). Chrome's install prompt can't be
// missed meanwhile: the head script keeps it (install-capture.ts).

const PwaClient = lazy<ComponentType>(() =>
  import("./pwa-client").then(
    (m) => ({ default: m.PwaClient }),
    // Offline, or a deploy removed the chunk: the next load tries again.
    () => ({ default: () => null }),
  ),
);

export function Pwa() {
  // Client only: nothing shows until something opens the install prompt.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;
  return (
    <Suspense fallback={null}>
      <PwaClient />
    </Suspense>
  );
}
