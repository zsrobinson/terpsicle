import { act, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { track } from "~/app/analytics";
import { panels as detailsPanels } from "~/features/course-details/panels";
import { renderPlanTab } from "~/features/courses/testing";
import { useCatalog } from "~/state/catalog-store";
import { TEST_TERM_ID } from "~/state/testing";
import { useUi } from "~/state/ui-store";
import { panels } from "./panels";
import { useSearchStore } from "./search-store";

vi.mock("~/app/analytics", () => ({ track: vi.fn() }));
// Opening a course asks for review summaries; there's no server here.
vi.mock("~/server/fns/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("~/server/fns/api")>();
  return {
    ...actual,
    api: {
      ...actual.api,
      reviewSummary: vi.fn(async () => ({
        status: "unavailable",
        reason: "failed",
      })),
    },
  };
});

/** The rows on screen (the list is windowed, so not every match). */
const results = () =>
  screen
    .queryAllByRole("option")
    .map((row) => row.getAttribute("data-course-result"));

/** Every match, from the list's label ("34 courses"). */
const matchCount = () =>
  Number(screen.getByRole("listbox").getAttribute("aria-label")?.split(" ")[0]);

async function renderSearch() {
  const view = await renderPlanTab([panels, detailsPanels], "search");
  const box = await screen.findByRole("combobox", { name: "Search courses" });
  return { ...view, box };
}

describe("Search tab", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.mocked(track).mockClear();
    useSearchStore.setState({ byTerm: {} });
  });

  it("starts with example queries, and one runs a search", async () => {
    const { user } = await renderSearch();
    expect(
      screen.getByText("Search by course code, title or instructor."),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "cmsc 351" }));
    expect(results()[0]).toBe("CMSC351");
  });

  it("lists courses with credits, title and how many sections fit", async () => {
    const { user, box } = await renderSearch();
    await user.type(box, "cmsc 351");
    const row = await screen.findByRole("option", { name: /^CMSC351/ });
    expect(row).toHaveTextContent("3 cr");
    expect(row).toHaveTextContent("Algorithms");
    expect(row).toHaveTextContent("In plan");
    expect(row).toHaveTextContent(/4 sections · 1 fits your plan/);
  });

  it("hovering a result shows its sections; leaving hides them", async () => {
    const { user, box } = await renderSearch();
    await user.type(box, "cmsc 351");
    const row = await screen.findByRole("option", { name: /^CMSC351/ });
    await user.hover(row);
    expect(useUi.getState().hoverCourse).toBe("CMSC351");
    await user.unhover(row);
    expect(useUi.getState().hoverCourse).toBeNull();
  });

  it("drops a hovered result's ghosts when typing takes the result away", async () => {
    const { user, box } = await renderSearch();
    await user.type(box, "cmsc");
    const row = await screen.findByRole("option", { name: /^CMSC351/ });
    // The pointer rests on the row while the person keeps typing: the row
    // goes away without a pointerleave.
    await user.hover(row);
    expect(useUi.getState().hoverCourse).toBe("CMSC351");
    await user.type(box, "330", { skipClick: true });
    await waitFor(() => expect(results()).not.toContain("CMSC351"));
    expect(useUi.getState().hoverCourse).toBeNull();
  });

  it("doesn't spell-check course codes", async () => {
    const { box } = await renderSearch();
    expect(box).toHaveAttribute("spellcheck", "false");
  });

  it("↓ moves through results with ghosts, and ↵ opens one", async () => {
    const { user, box } = await renderSearch();
    await user.type(box, "cmsc");
    const first = results()[0];
    const second = results()[1];
    await user.keyboard("{ArrowDown}{ArrowDown}");
    expect(useUi.getState().hoverCourse).toBe(second);
    await user.keyboard("{ArrowUp}");
    expect(useUi.getState().hoverCourse).toBe(first);
    await user.keyboard("{Enter}");
    expect(useUi.getState().stack.at(-1)).toEqual({
      kind: "course",
      courseCode: first,
    });
    expect(useUi.getState().hoverCourse).toBeNull();
    expect(track).toHaveBeenCalledWith("search_result_opened", {
      position: 0,
    });
  });

  it("clicking a result opens its details", async () => {
    const { user, box } = await renderSearch();
    await user.type(box, "algorithms");
    await user.click(await screen.findByRole("option", { name: /^CMSC351/ }));
    expect(useUi.getState().stack.at(-1)).toEqual({
      kind: "course",
      courseCode: "CMSC351",
    });
  });

  it("filter chips narrow the results, fill in, and clear", async () => {
    const { user, box } = await renderSearch();
    await user.type(box, "cmsc");
    const all = matchCount();
    const openSeats = screen.getByRole("button", { name: "Open seats" });
    expect(openSeats).toHaveAttribute("aria-pressed", "false");

    await user.click(screen.getByRole("button", { name: "Level" }));
    await user.click(
      await screen.findByRole("menuitemcheckbox", { name: "400-level" }),
    );
    await user.keyboard("{Escape}");
    const level = screen.getByRole("button", { name: "Level: 400" });
    expect(level).toHaveTextContent("400");
    const narrowed = matchCount();
    expect(narrowed).toBeGreaterThan(0);
    expect(narrowed).toBeLessThan(all);
    expect(results().every((code) => code?.startsWith("CMSC4"))).toBe(true);
    expect(track).toHaveBeenCalledWith("search_filter_changed", {
      filter: "level",
    });

    await user.click(openSeats);
    expect(openSeats).toHaveAttribute("aria-pressed", "true");
    expect(matchCount()).toBeLessThanOrEqual(narrowed);
    expect(
      screen.getByText(new RegExp(`^${matchCount()} courses? match$`)),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(matchCount()).toBe(all);
    expect(screen.getByRole("button", { name: "Level" })).toBeInTheDocument();
  });

  it("Fits my plan keeps only courses with a section that fits", async () => {
    const { user, box } = await renderSearch();
    await user.type(box, "cmsc");
    await user.click(screen.getByRole("button", { name: "Fits my plan" }));
    for (const row of screen.getAllByRole("option"))
      expect(row).toHaveTextContent(/fits? your plan/);
    expect(screen.getAllByRole("option").length).toBeGreaterThan(0);
    for (const row of screen.getAllByRole("option"))
      expect(row).not.toHaveTextContent("none fit your plan");
  });

  it("a gen-ed filter alone browses every course that counts", async () => {
    const { user } = await renderSearch();
    await user.click(screen.getByRole("button", { name: "Gen-eds" }));
    await user.click(
      await screen.findByRole("menuitemcheckbox", { name: /^DSSP/ }),
    );
    await user.keyboard("{Escape}");
    const found = results();
    expect(found.length).toBeGreaterThan(0);
    const index = useCatalog.getState().byTerm[TEST_TERM_ID]?.index;
    for (const code of found) {
      const course = code ? index?.courses.get(code) : undefined;
      expect(
        course?.genEds.some((group) => group.some((o) => o.code === "DSSP")),
      ).toBe(true);
    }
  });

  it("says what to change when nothing matches", async () => {
    const { user, box } = await renderSearch();
    await user.click(screen.getByRole("button", { name: "Fits my plan" }));
    await user.type(box, "zzqx");
    const status = await screen.findByRole("status");
    expect(status).toHaveTextContent(
      'No courses match "zzqx" with Fits my plan on.',
    );
    await user.click(
      within(status).getByRole("button", { name: "Turn it off" }),
    );
    expect(
      screen.getByRole("button", { name: "Fits my plan" }),
    ).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("status")).toHaveTextContent(
      "Check the spelling, or try the course code",
    );
  });

  it("remembers the query and filters per term", async () => {
    const { user, box } = await renderSearch();
    await user.type(box, "stat");
    await user.click(screen.getByRole("button", { name: "Open seats" }));
    act(() => useUi.getState().openTab("courses"));
    act(() => useUi.getState().openTab("search"));
    await waitFor(() =>
      expect(
        screen.getByRole("combobox", { name: "Search courses" }),
      ).toHaveValue("stat"),
    );
    expect(screen.getByRole("button", { name: "Open seats" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("reports a settled search by its length only", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const { user, box } = await renderSearch();
      await user.type(box, "cmsc");
      await act(async () => {
        vi.advanceTimersByTime(1000);
      });
      const calls = vi
        .mocked(track)
        .mock.calls.filter(([name]) => name === "search_performed");
      expect(calls).toHaveLength(1);
      expect(calls[0]?.[1]).toEqual({
        queryLength: 4,
        results: expect.any(Number),
        filtered: false,
      });
    } finally {
      vi.useRealTimers();
    }
  });
});
