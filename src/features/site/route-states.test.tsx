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
import { afterEach, describe, expect, it, vi } from "vitest";
import { ChunkLoadError } from "~/app/panel-load-boundary";
import { TooltipProvider } from "~/ui/tooltip";
import { RouteError, RoutePending } from "./route-states";

/** Resolves when the test says so: a loader that's still loading. */
function gate() {
  let open = () => {};
  const wait = new Promise<void>((resolve) => {
    open = resolve;
  });
  return { wait, open };
}

/**
 * A root with pages that fail once, fail with a missing chunk, wait (with
 * each kind of pending), and a page nested in a layout.
 */
function renderRoutes(path: string) {
  let loads = 0;
  const slow = gate();
  const root = createRootRoute({ component: () => <Outlet /> });
  const page = (at: string, options: object) =>
    createRoute({
      getParentRoute: () => root,
      path: at,
      component: () => <p>Loaded {at}</p>,
      ...options,
    });
  const layout = page("/settings", {
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
    routeTree: root.addChildren([
      page("/flaky", {
        loader: () => {
          loads += 1;
          if (loads === 1) throw new Error("The feed didn't answer");
        },
      }),
      page("/chunk", {
        loader: () => {
          throw new ChunkLoadError(new Error("gone"));
        },
      }),
      page("/bar", { loader: () => slow.wait }),
      page("/reading", {
        loader: () => slow.wait,
        staticData: { pending: "reading" },
      }),
      page("/own", {
        loader: () => slow.wait,
        staticData: { pending: "none" },
      }),
      layout.addChildren([nested]),
    ]),
    history: createMemoryHistory({ initialEntries: [path] }),
    defaultPendingComponent: RoutePending,
    defaultErrorComponent: RouteError,
    defaultPendingMs: 0,
    defaultPendingMinMs: 0,
  });
  const { container } = render(
    <TooltipProvider delayDuration={0}>
      <RouterProvider router={router} />
    </TooltipProvider>,
  );
  return { open: slow.open, container };
}

const bar = () => screen.queryByRole("navigation", { name: "Products" });
/** The bar drawn while a page loads: seen, but not pressed or read. */
const placeholder = () =>
  document.querySelector<HTMLElement>('[data-slot="bar-placeholder"]');
const skeleton = () => document.querySelector('[data-slot="page-skeleton"]');

afterEach(() => {
  vi.restoreAllMocks();
});

describe("RouteError", () => {
  it("keeps the bar, says what happened, and Try again loads the page", async () => {
    renderRoutes("/flaky");
    expect(
      await screen.findByRole("heading", { name: "This page didn't load" }),
    ).toBeInTheDocument();
    expect(bar()).toBeInTheDocument();
    expect(
      screen.getByText(/^Something went wrong on our side/),
    ).toBeInTheDocument();
    // Never the error's own text: it's for us, not the person.
    expect(screen.queryByText(/feed didn't answer/)).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Loaded /flaky")).toBeInTheDocument();
  });

  it("says so when you're offline", async () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    renderRoutes("/flaky");
    expect(
      await screen.findByText(
        "You're offline. Try again once you're connected.",
      ),
    ).toBeInTheDocument();
  });

  it("reloads for a chunk that didn't arrive, since a failed import stays failed", async () => {
    const reload = vi.fn();
    vi.spyOn(window, "location", "get").mockReturnValue({
      ...window.location,
      reload,
    });
    renderRoutes("/chunk");
    expect(
      await screen.findByText(/a new version just went out/),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(reload).toHaveBeenCalledOnce();
  });

  it("sits in place inside another page, without a second bar", async () => {
    renderRoutes("/settings/inner");
    expect(
      await screen.findByText(/^Something went wrong on our side/),
    ).toBeInTheDocument();
    expect(screen.getByText("Settings layout")).toBeInTheDocument();
    expect(bar()).toBeNull();
  });
});

describe("RoutePending", () => {
  it("shows the bar alone by default, as a placeholder, until the page is ready", async () => {
    const { open } = renderRoutes("/bar");
    expect(await screen.findByRole("status")).toHaveTextContent("Loading");
    // Drawn, but inert: the page brings the bar you can use.
    expect(placeholder()).toHaveAttribute("inert");
    expect(placeholder()).toHaveAttribute("aria-hidden", "true");
    expect(bar()).toBeNull();
    expect(skeleton()).toBeNull();
    open();
    expect(await screen.findByText("Loaded /bar")).toBeInTheDocument();
    expect(placeholder()).toBeNull();
  });

  it("adds a reading skeleton where the route asks for one", async () => {
    const { open } = renderRoutes("/reading");
    expect(await screen.findByRole("status")).toHaveTextContent("Loading");
    expect(placeholder()).not.toBeNull();
    expect(skeleton()).not.toBeNull();
    open();
    expect(await screen.findByText("Loaded /reading")).toBeInTheDocument();
    expect(skeleton()).toBeNull();
  });

  it("shows nothing for a page with a frame of its own", async () => {
    const { open, container } = renderRoutes("/own");
    // Give the router a turn to render its pending state.
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(placeholder()).toBeNull();
    expect(container.textContent).toBe("");
    open();
    expect(await screen.findByText("Loaded /own")).toBeInTheDocument();
  });
});
