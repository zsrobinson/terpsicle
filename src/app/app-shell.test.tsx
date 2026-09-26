import { act, screen, waitFor, within } from "@testing-library/react";
import type { ComponentType } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useUi } from "~/state/ui-store";
import { lazyModule, lazyPanel } from "./lazy-panel";
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
      name: (entry) => entry.courseCode,
      monoName: true,
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

  it("drills in under one Back, and Esc returns to exactly where you were", async () => {
    const { user } = await renderShell({ panels: [fakePanels] });
    await user.click(railTab("Search"));
    const field = screen.getByRole("textbox", { name: "Search courses" });
    await user.type(field, "algo");
    const results = screen.getByTestId("results");
    results.scrollTop = 40;

    await user.click(screen.getByRole("button", { name: "CMSC351" }));
    expect(
      screen.getByRole("button", { name: "Back to Search" }),
    ).toBeVisible();
    expect(
      screen.getByText("CMSC351", { selector: "[aria-current=page]" }),
    ).toBeVisible();
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

  it("Back returns to the tab", async () => {
    const { user } = await renderShell({ panels: [fakePanels] });
    await user.click(railTab("Search"));
    await user.click(screen.getByRole("button", { name: "CMSC351" }));
    await user.click(screen.getByRole("button", { name: "Back to Search" }));
    expect(screen.getByRole("heading", { name: "Search" })).toBeVisible();
  });

  it("course to course shows one Back, to the course before, never a trail", async () => {
    const { user } = await renderShell({ panels: [fakePanels] });
    await user.click(railTab("Search"));
    await user.click(screen.getByRole("button", { name: "CMSC351" }));
    act(() => {
      useUi.getState().drill({ kind: "course", courseCode: "CMSC330" });
    });
    expect(screen.getByText("Details for CMSC330")).toBeVisible();
    const back = screen.getByRole("button", { name: "Back to CMSC351" });
    expect(screen.queryByRole("button", { name: "Back to Search" })).toBeNull();
    await user.click(back);
    expect(screen.getByText("Details for CMSC351")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Back to Search" }));
    expect(screen.getByRole("heading", { name: "Search" })).toBeVisible();
  });

  it("labels Back with the view history returns to, when there's one", async () => {
    const { user } = await renderShell({ panels: [fakePanels] });
    await user.click(railTab("Search"));
    act(() => {
      useUi.getState().drill({ kind: "course", courseCode: "CMSC351" });
      useUi.setState({ historyBack: { label: "Courses", mono: false } });
    });
    expect(
      screen.getByRole("button", { name: "Back to Courses" }),
    ).toBeVisible();
    // Back to the same view (another plan's CMSC351) just says Back.
    act(() => {
      useUi.setState({ historyBack: { label: "CMSC351", mono: true } });
    });
    await user.hover(screen.getByRole("button", { name: "Back" }));
    expect(await screen.findByRole("tooltip")).toHaveTextContent("BackEsc");
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

describe("Panels that load on first use", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  type ExportModule = { Panel: ComponentType };

  it("starts loading on hover and shows the skeleton until the panel arrives", async () => {
    let arrive: (m: ExportModule) => void = () => {};
    const importer = vi.fn(
      () => new Promise<ExportModule>((resolve) => (arrive = resolve)),
    );
    const panels = definePanels({
      tabs: { export: lazyPanel(lazyModule(importer), (m) => m.Panel) },
    });
    const { user } = await renderShell({ panels: [panels], preload: false });
    expect(importer).not.toHaveBeenCalled();

    await user.hover(railTab("Export"));
    expect(importer).toHaveBeenCalledTimes(1);
    await user.click(railTab("Export"));
    // The skeleton, under the tab's name.
    const skeleton = screen.getByRole("heading", { name: "Export" });
    expect(skeleton.closest("[data-testid=panel-skeleton]")).toBeVisible();

    await act(async () => arrive({ Panel: () => <h2>Export panel</h2> }));
    expect(
      await screen.findByRole("heading", { name: "Export panel" }),
    ).toBeVisible();
    expect(screen.queryByRole("heading", { name: "Export" })).toBeNull();
    expect(importer).toHaveBeenCalledTimes(1);
  });

  it("says so in the panel, not the whole page, when one can't load", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const panels = definePanels({
      tabs: {
        export: lazyPanel(
          lazyModule<ExportModule>(() =>
            Promise.reject(new Error("Failed to fetch")),
          ),
          (m) => m.Panel,
        ),
      },
    });
    const { user } = await renderShell({ panels: [panels], preload: false });
    await user.click(railTab("Export"));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Couldn't load Export. Check your connection, then reload. Your plans are saved.",
    );
    expect(screen.getByRole("button", { name: "Reload" })).toBeVisible();
    expect(rail()).toBeVisible();
    error.mockRestore();
  });
});
