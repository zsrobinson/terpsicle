import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { TooltipProvider } from "~/ui/tooltip";
import { AppShell } from "./app-shell";

function renderShell() {
  render(
    <TooltipProvider>
      <AppShell />
    </TooltipProvider>,
  );
  const rail = screen.getByRole("navigation", { name: "Sidebar tabs" });
  return { rail, user: userEvent.setup() };
}

describe("AppShell", () => {
  it("labels every rail tab, in spec order", () => {
    const { rail } = renderShell();
    expect(
      within(rail)
        .getAllByRole("button")
        .map((button) => button.textContent),
    ).toEqual([
      "Courses",
      "Search",
      "Problems",
      "Travel",
      "Blocks",
      "Generate",
      "Export",
    ]);
  });

  it("switches tabs by click and by number key", async () => {
    const { rail, user } = renderShell();
    await user.click(within(rail).getByRole("button", { name: "Search" }));
    expect(screen.getByRole("heading", { name: "Search" })).toBeInTheDocument();

    await user.keyboard("7");
    expect(screen.getByRole("heading", { name: "Export" })).toBeInTheDocument();
  });

  it("collapses the sidebar when the active tab is clicked again", async () => {
    const { rail, user } = renderShell();
    const courses = within(rail).getByRole("button", { name: "Courses" });
    await user.click(courses);
    expect(screen.queryByRole("heading", { name: "Courses" })).toBeNull();
    expect(courses).toHaveAttribute("aria-pressed", "false");

    await user.click(courses);
    expect(
      screen.getByRole("heading", { name: "Courses" }),
    ).toBeInTheDocument();
  });

  it("shows the shortcut in the tab's tooltip", async () => {
    const { rail, user } = renderShell();
    await user.hover(within(rail).getByRole("button", { name: "Travel" }));
    const tooltip = await screen.findByRole("tooltip");
    expect(tooltip).toHaveTextContent("Travel4");
  });
});
