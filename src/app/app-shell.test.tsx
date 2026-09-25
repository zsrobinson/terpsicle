import { screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useUi } from "~/state/ui-store";
import { useFocusRequest } from "./panel";
import { definePanels } from "./registry";
import { renderShell } from "./test-utils";

vi.mock("./analytics", () => ({ track: vi.fn() }));

const rail = () => screen.getByRole("navigation", { name: "Sidebar tabs" });
const railTab = (name: string) => within(rail()).getByRole("button", { name });

/** A stand-in Search panel: a field, a long list, and a way to drill in. */
function FakeSearch() {
  const ref = useFocusRequest<HTMLInputElement>("search");
  return (
    <div>
      <h2>Search</h2>
      <input ref={ref} aria-label="Search courses" />
      <div data-testid="results" style={{ height: 100, overflow: "auto" }}>
        <button
          type="button"
          onClick={() =>
            useUi.getState().drill({ kind: "course", courseCode: "CMSC351" })
          }
        >
          CMSC351
        </button>
      </div>
    </div>
  );
}

const fakePanels = definePanels({
  tabs: { search: FakeSearch },
  drills: {
    course: {
      component: ({ entry }) => <p>Details for {entry.courseCode}</p>,
      crumb: (entry) => entry.courseCode,
      monoCrumb: true,
    },
  },
});

describe("AppShell", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("labels every rail tab, in spec order", async () => {
    await renderShell();
    expect(
      within(rail())
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

  it("shows a neutral skeleton for tabs without a panel yet", async () => {
    await renderShell();
    expect(screen.getByRole("heading", { name: "Courses" })).toBeVisible();
    expect(screen.getByTestId("panel-skeleton")).toBeVisible();
    expect(screen.queryByText(/coming soon/i)).toBeNull();
  });

  it("switches tabs by click and by number key", async () => {
    const { user } = await renderShell();
    await user.click(railTab("Search"));
    expect(screen.getByRole("heading", { name: "Search" })).toBeVisible();

    await user.keyboard("7");
    expect(screen.getByRole("heading", { name: "Export" })).toBeVisible();
    expect(screen.queryByRole("heading", { name: "Search" })).toBeNull();
  });

  it("collapses the sidebar when the open tab is clicked again", async () => {
    const { user } = await renderShell();
    const courses = railTab("Courses");
    expect(courses).toHaveAttribute("aria-pressed", "true");
    await user.click(courses);
    expect(
      screen.getByRole("complementary", { hidden: true }),
    ).not.toBeVisible();
    expect(courses).toHaveAttribute("aria-pressed", "false");

    await user.click(railTab("Blocks"));
    expect(screen.getByRole("heading", { name: "Blocks" })).toBeVisible();
    expect(screen.getByRole("complementary")).toBeVisible();
  });

  it("shows the shortcut in a rail tab's tooltip", async () => {
    const { user } = await renderShell();
    await user.hover(railTab("Travel"));
    const tooltip = await screen.findByRole("tooltip");
    expect(tooltip).toHaveTextContent("Travel4");
  });

  it("drills in with a breadcrumb, and Esc returns to exactly where you were", async () => {
    const { user } = await renderShell({ panels: [fakePanels] });
    await user.click(railTab("Search"));
    const field = screen.getByRole("textbox", { name: "Search courses" });
    await user.type(field, "algo");
    const results = screen.getByTestId("results");
    results.scrollTop = 40;

    await user.click(screen.getByRole("button", { name: "CMSC351" }));
    const crumbs = screen.getByRole("navigation", { name: "Breadcrumb" });
    expect(crumbs).toHaveTextContent("SearchCMSC351");
    expect(screen.getByText("Details for CMSC351")).toBeVisible();
    expect(
      screen.queryByRole("textbox", { name: "Search courses" }),
    ).toBeNull();

    await user.keyboard("{Escape}");
    expect(screen.queryByText("Details for CMSC351")).toBeNull();
    // The same panel, not a fresh one: text and scroll position survive.
    expect(screen.getByRole("textbox", { name: "Search courses" })).toBe(field);
    expect(field).toHaveValue("algo");
    expect(screen.getByTestId("results")).toBe(results);
    expect(results.scrollTop).toBe(40);
  });

  it("the breadcrumb's first level goes back to the tab", async () => {
    const { user } = await renderShell({ panels: [fakePanels] });
    await user.click(railTab("Search"));
    await user.click(screen.getByRole("button", { name: "CMSC351" }));
    const crumbs = screen.getByRole("navigation", { name: "Breadcrumb" });
    await user.click(within(crumbs).getByRole("button", { name: "Search" }));
    expect(screen.getByRole("heading", { name: "Search" })).toBeVisible();
  });

  it("clicking the open tab while drilled in goes back before collapsing", async () => {
    const { user } = await renderShell({ panels: [fakePanels] });
    await user.click(railTab("Search"));
    await user.click(screen.getByRole("button", { name: "CMSC351" }));
    await user.click(railTab("Search"));
    expect(screen.getByRole("heading", { name: "Search" })).toBeVisible();
    await user.click(railTab("Search"));
    expect(useUi.getState().sidebarOpen).toBe(false);
  });

  it("`/` opens Search and focuses its field", async () => {
    const { user } = await renderShell({ panels: [fakePanels] });
    await user.keyboard("/");
    await waitFor(() =>
      expect(
        screen.getByRole("textbox", { name: "Search courses" }),
      ).toHaveFocus(),
    );
  });

  it("shortcuts don't fire while typing in a field", async () => {
    const { user } = await renderShell({ panels: [fakePanels] });
    await user.click(railTab("Search"));
    const field = screen.getByRole("textbox", { name: "Search courses" });
    await user.type(field, "3/7");
    expect(field).toHaveValue("3/7");
    expect(useUi.getState().tab).toBe("search");

    // Esc leaves the field first, then shortcuts work again.
    await user.keyboard("{Escape}");
    expect(field).not.toHaveFocus();
    await user.keyboard("3");
    expect(useUi.getState().tab).toBe("problems");
  });

  it("the problem count opens Problems", async () => {
    const { user } = await renderShell();
    await user.click(screen.getByRole("button", { name: "No problems" }));
    expect(screen.getByRole("heading", { name: "Problems" })).toBeVisible();
  });
});
