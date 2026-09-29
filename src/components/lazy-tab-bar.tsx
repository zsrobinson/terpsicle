import { useRouterState } from "@tanstack/react-router";
import { lazy, Suspense } from "react";
import { tabBarAt } from "~/core/routing/tab-bar";

// The phone's tab bar (./tab-bar), in its own chunk, asked for only on a
// page that has one: `/` (the marketing page), sign-in and admin never load
// it (scripts/check-bundle.ts). The server renders it into the page, and
// the browser keeps that HTML while the chunk arrives, so it never flashes
// in.

const TabBar = lazy(() =>
  import("./tab-bar").then((m) => ({ default: m.TabBar })),
);

export function LazyTabBar() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  if (!tabBarAt(pathname)) return null;
  return (
    <Suspense fallback={null}>
      <TabBar />
    </Suspense>
  );
}
