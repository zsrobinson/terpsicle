import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { TooltipProvider } from "~/ui/tooltip";
import { KitPage, type KitView } from "./kit-page";

// /admin/kit: every piece of the page kit, so it can be reviewed in both
// themes. The pieces have their own tests in src/components/ui; this checks
// the page shows each part and that its theme switch doesn't stick.

function renderKit(view: KitView) {
  const router = createRouter({
    routeTree: createRootRoute({ component: () => <KitPage view={view} /> }),
    history: createMemoryHistory({ initialEntries: ["/admin/kit"] }),
  });
  render(
    <TooltipProvider delayDuration={0}>
      <RouterProvider router={router} />
    </TooltipProvider>,
  );
}

afterEach(() => document.documentElement.classList.remove("dark"));

describe("KitPage", () => {
  it("shows every part, under one page header with its parts as views", async () => {
    renderKit("all");
    expect(
      await screen.findByRole("heading", { level: 1, name: "Page kit" }),
    ).toBeInTheDocument();
    const views = screen.getByRole("navigation", { name: "Parts of the kit" });
    expect(
      within(views).getByRole("link", { name: "Everything" }),
    ).toHaveAttribute("aria-current", "page");
    expect(within(views).getByRole("link", { name: "Lists" })).toHaveAttribute(
      "href",
      "/admin/kit?view=lists",
    );
    for (const part of [
      "Page header",
      "Panel header",
      "Widths",
      "First visit and empty",
      "Footer",
      "List row",
      "Card and section",
      "Loading and error",
      "Fields",
      "Switch",
      "Segmented control",
      "Select and buttons",
      "Menus",
      "Popover and dialog",
      "Tooltips",
    ])
      expect(
        screen.getByRole("heading", { level: 2, name: part }),
      ).toBeInTheDocument();
  });

  it("shows one part at a time", async () => {
    renderKit("controls");
    await screen.findByRole("heading", { level: 2, name: "Fields" });
    expect(
      screen.queryByRole("heading", { level: 2, name: "List row" }),
    ).toBeNull();
    expect(
      within(
        screen.getByRole("navigation", { name: "Parts of the kit" }),
      ).getByRole("link", { name: "Controls" }),
    ).toHaveAttribute("aria-current", "page");
  });

  it("shows the kit dark while asked, without keeping it", async () => {
    renderKit("lists");
    const user = userEvent.setup();
    const theme = await screen.findByRole("radiogroup", { name: "Theme" });
    await user.click(within(theme).getByRole("radio", { name: "Dark" }));
    expect(document.documentElement).toHaveClass("dark");
    await user.click(within(theme).getByRole("radio", { name: "Light" }));
    expect(document.documentElement).not.toHaveClass("dark");
    await user.click(within(theme).getByRole("radio", { name: "Dark" }));
    await user.click(within(theme).getByRole("radio", { name: "System" }));
    // Back to what the page opened with (light, in this test).
    expect(document.documentElement).not.toHaveClass("dark");
  });
});
