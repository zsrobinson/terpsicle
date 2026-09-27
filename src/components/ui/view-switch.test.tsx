import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { TooltipProvider } from "./tooltip";
import { type View, ViewSwitch } from "./view-switch";

// Every view is a URL: the switch links to its route's search params, the
// route's `validateSearch` owns them, and Back undoes a switch.

const VIEWS: readonly View[] = [
  { id: "day", label: "By day", hint: "What's due each day", to: "/todo" },
  {
    id: "course",
    label: "By course",
    to: "/todo",
    search: { view: "course" },
  },
  { id: "week", label: "Week", to: "/todo", search: { view: "week" } },
];

function renderTodo(path: string) {
  const root = createRootRoute();
  const todo = createRoute({
    getParentRoute: () => root,
    path: "todo",
    validateSearch: z.object({
      view: z.enum(["course", "week"]).optional().catch(undefined),
    }),
    component: function Todo() {
      const { view } = todo.useSearch();
      return (
        <ViewSwitch label="Todo views" views={VIEWS} current={view ?? "day"} />
      );
    },
  });
  const history = createMemoryHistory({ initialEntries: [path] });
  const router = createRouter({
    routeTree: root.addChildren([todo]),
    history,
  });
  render(
    <TooltipProvider delayDuration={0}>
      <RouterProvider router={router} />
    </TooltipProvider>,
  );
  return { router, history };
}

const current = () =>
  screen
    .getAllByRole("link")
    .filter((link) => link.getAttribute("aria-current") === "page")
    .map((link) => link.textContent);

describe("ViewSwitch", () => {
  it("is a named navigation of links, one per view's URL", async () => {
    renderTodo("/todo");
    const nav = await screen.findByRole("navigation", { name: "Todo views" });
    expect(nav).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "By day" })).toHaveAttribute(
      "href",
      "/todo",
    );
    expect(screen.getByRole("link", { name: "By course" })).toHaveAttribute(
      "href",
      "/todo?view=course",
    );
    expect(screen.getByRole("link", { name: "Week" })).toHaveAttribute(
      "href",
      "/todo?view=week",
    );
    expect(current()).toEqual(["By day"]);
  });

  it("marks only the current view, even where a URL with no search would match", async () => {
    renderTodo("/todo?view=course");
    await screen.findByRole("navigation", { name: "Todo views" });
    expect(current()).toEqual(["By course"]);
    expect(screen.getByRole("link", { name: "By day" })).not.toHaveAttribute(
      "aria-current",
    );
  });

  it("switches by changing the URL, and Back switches back", async () => {
    const { router, history } = renderTodo("/todo");
    const user = userEvent.setup();
    await user.click(await screen.findByRole("link", { name: "Week" }));
    await waitFor(() => expect(current()).toEqual(["Week"]));
    expect(router.state.location.search).toEqual({ view: "week" });
    history.back();
    await waitFor(() => expect(current()).toEqual(["By day"]));
  });

  it("gets 44px targets on phones and 28px on a desktop", async () => {
    renderTodo("/todo");
    const nav = await screen.findByRole("navigation", { name: "Todo views" });
    expect(nav).toHaveClass("h-11", "md:h-7");
  });

  it("shows a view's hint as its tooltip", async () => {
    renderTodo("/todo");
    const user = userEvent.setup();
    await user.hover(await screen.findByRole("link", { name: "By day" }));
    expect(
      await screen.findByRole("tooltip", { name: "What's due each day" }),
    ).toBeInTheDocument();
  });
});
