// Rendering helpers for the kit's tests. Not used by the app.
import {
  type AnyRouter,
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { render } from "@testing-library/react";
import type { ReactNode } from "react";
import { TooltipProvider } from "./tooltip";

/**
 * Renders `node` as the only route of a memory router at `path`, for pieces
 * that draw router `Link`s. The router renders asynchronously: use `findBy…`
 * for the first query.
 */
export function renderInRouter(
  node: ReactNode,
  path = "/",
): ReturnType<typeof render> & { router: AnyRouter } {
  const router = createRouter({
    routeTree: createRootRoute({ component: () => node }),
    history: createMemoryHistory({ initialEntries: [path] }),
  });
  return {
    ...render(
      <TooltipProvider delayDuration={0}>
        <RouterProvider router={router} />
      </TooltipProvider>,
    ),
    router,
  };
}
