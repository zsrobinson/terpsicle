import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { TooltipProvider } from "~/ui/tooltip";
import { RouteError, RoutePending, routeErrorLine } from "./route-states";

/** A root with a page that fails once, a page that waits, and a nested one. */
function renderRoutes(path: string) {
  let loads = 0;
  let release = () => {};
  const waiting = new Promise<void>((resolve) => {
    release = resolve;
  });
  const root = createRootRoute({ component: () => <Outlet /> });
  const flaky = createRoute({
    getParentRoute: () => root,
    path: "/todo",
    loader: () => {
      loads += 1;
      if (loads === 1) throw new Error("The feed didn't answer");
    },
    component: () => <p>Your deadlines</p>,
  });
  const slow = createRoute({
    getParentRoute: () => root,
    path: "/reviews",
    loader: () => waiting,
    component: () => <p>Reviews home</p>,
  });
  const layout = createRoute({
    getParentRoute: () => root,
    path: "/settings",
    component: () => (
      <div>
        <p>Settings layout</p>
        <Outlet />
      </div>
    ),
  });
  const nested = createRoute({
    getParentRoute: () => layout,
    path: "/inner",
    loader: () => {
      throw new Error("Nope");
    },
    component: () => <p>Inner</p>,
  });
  const router = createRouter({
    routeTree: root.addChildren([flaky, slow, layout.addChildren([nested])]),
    history: createMemoryHistory({ initialEntries: [path] }),
    defaultPendingComponent: RoutePending,
    defaultErrorComponent: RouteError,
    defaultPendingMs: 0,
  });
  render(
    <TooltipProvider delayDuration={0}>
      <RouterProvider router={router} />
    </TooltipProvider>,
  );
  return { release };
}

describe("RouteError", () => {
  it("keeps the bar, says what happened, and Try again loads the page", async () => {
    renderRoutes("/todo");
    expect(
      await screen.findByRole("heading", { name: "This page didn't load" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("navigation", { name: "Products" }),
    ).toBeInTheDocument();
    // Never the error's own text: it's for us, not the person.
    expect(screen.queryByText(/feed didn't answer/)).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Your deadlines")).toBeInTheDocument();
  });

  it("sits in place inside another page, without a second bar", async () => {
    renderRoutes("/settings/inner");
    expect(await screen.findByText(/This didn't load/)).toBeInTheDocument();
    expect(screen.getByText("Settings layout")).toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: "Products" })).toBeNull();
  });

  it("says offline when it is", () => {
    expect(routeErrorLine(false)).toBe(
      "You're offline. Try again once you're connected.",
    );
    expect(routeErrorLine(true)).toMatch(/^Something went wrong on our side/);
  });
});

describe("RoutePending", () => {
  it("shows the bar and a skeleton until the page is ready", async () => {
    const { release } = renderRoutes("/reviews");
    expect(
      await screen.findByRole("navigation", { name: "Products" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("status", { name: "Loading" })).toBeInTheDocument();
    release();
    expect(await screen.findByText("Reviews home")).toBeInTheDocument();
    expect(screen.queryByRole("status", { name: "Loading" })).toBeNull();
  });
});
