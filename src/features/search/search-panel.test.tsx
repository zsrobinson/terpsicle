import {
  act,
  fireEvent,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CourseDetails } from "~/features/course-details/course-details";
import { renderPlanTab } from "~/features/courses/testing";
import { currentView, goTo } from "~/features/schedule/schedule-nav";
import type { ShellRoutes } from "~/features/schedule/test-utils";
import { track } from "~/lib/analytics";
import { useCatalog } from "~/state/catalog-store";
import { TEST_TERM_ID } from "~/state/testing";
import { useUi } from "~/state/ui-store";
import { SearchPanel } from "./search-panel";
import { useSearchStore } from "./search-store";

const panels: ShellRoutes = { tabs: { search: SearchPanel } };
const detailsPanels: ShellRoutes = { drills: { course: CourseDetails } };

vi.mock("~/lib/analytics", () => ({ track: vi.fn() }));

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
      screen.getByText(/^Search by course code, title or instructor/),
    ).toBeInTheDocument();
    // Hover previews with a mouse; a finger's tap opens the course (#48).
    expect(screen.getByTestId("search-hint-hover")).toHaveClass(
      "pointer-coarse:hidden",
    );
    expect(screen.getByTestId("search-hint-tap")).toHaveTextContent(
      "Tap a result to open it and see its sections.",
    );
    expect(screen.getByTestId("search-hint-tap")).toHaveClass(
      "hidden",
      "pointer-coarse:inline",
    );
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
    expect(row).toHaveTextContent(/4 sections · 1 fit(?!s)/);
  });

  it("shows a one-section course's meeting time and fit, not a count", async () => {
    const { user, box } = await renderSearch();
    await user.type(box, "cmsc425");
    const row = await screen.findByRole("option", { name: /^CMSC425/ });
    expect(row).toHaveTextContent(
      /TuTh 2pm–3:15pm · (Fits|Overlaps|Not enough time)/,
    );
    expect(row).not.toHaveTextContent(/1 section/);
  });

  it("always says how many courses match", async () => {
    const { user, box } = await renderSearch();
    await user.type(box, "cmsc");
    // And how many more it knows that the term doesn't have.
    expect(
      await screen.findByText(
        new RegExp(
          `^${matchCount()} courses · \\d not offered in Spring 2027$`,
        ),
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Clear filters" })).toBeNull();
  });

  it("shows a course the term doesn't have, greyed, with when it runs", async () => {
    // The owner's flow: a fall-only course, while building a spring.
    const { user, box } = await renderSearch();
    await user.type(box, "cmsc473");
    const row = await screen.findByRole("option", { name: /^CMSC473/ });
    expect(row).toHaveAttribute("data-not-offered", "CMSC473");
    expect(row).toHaveClass("text-muted");
    expect(row).toHaveTextContent("Capstone in Machine Learning");
    // "Not offered" beside the code, when it runs on the third line.
    expect(row).toHaveTextContent("Not offered in Spring 2027");
    expect(row).toHaveTextContent("Usually fall only · Next likely Fall 2027");
    expect(row).toHaveAccessibleName(
      "CMSC473 Capstone in Machine Learning. Not offered in Spring 2027 · Usually fall only · Next likely Fall 2027",
    );
    // Nothing to add: it isn't a result of this term.
    expect(within(row).queryByRole("button")).toBeNull();
    expect(screen.getByRole("listbox")).toHaveAccessibleName(
      "0 courses, 1 not offered this term",
    );
    // And a screen reader hears it, not silence.
    expect(
      await screen.findByText("0 courses, 1 not offered this term"),
    ).toHaveAttribute("aria-live", "polite");
    // Opening it says what it is and when it's offered.
    await user.click(row);
    expect(
      await screen.findByText(/isn't offered in Spring 2027/),
    ).toBeInTheDocument();
    expect(await screen.findByTestId("usually-offered")).toHaveTextContent(
      "Usually offered Fall only · Next likely Fall 2027",
    );
  });

  it("lists the term's own results first, then the ones it doesn't have", async () => {
    const { user, box } = await renderSearch();
    await user.type(box, "cmsc47");
    await screen.findByRole("option", { name: /^CMSC473/ });
    const rows = screen.getAllByRole("option").map((row) => ({
      code:
        row.getAttribute("data-course-result") ??
        row.getAttribute("data-not-offered"),
      greyed: row.hasAttribute("data-not-offered"),
      top: Number.parseFloat(row.style.top),
    }));
    const ordered = [...rows].sort((a, b) => a.top - b.top);
    const firstGrey = ordered.findIndex((r) => r.greyed);
    expect(firstGrey).toBeGreaterThan(0);
    expect(ordered.slice(firstGrey).every((r) => r.greyed)).toBe(true);
    expect(ordered.filter((r) => r.greyed).map((r) => r.code)).toEqual([
      "CMSC471",
      "CMSC473",
      "CMSC474",
    ]);
  });

  it("shows none with a filter on: the file knows no sections", async () => {
    const { user, box } = await renderSearch();
    await user.type(box, "cmsc473");
    await screen.findByRole("option", { name: /^CMSC473/ });
    await user.click(screen.getByRole("button", { name: /Open seats/ }));
    await waitFor(() =>
      expect(
        screen.queryByRole("option", { name: /^CMSC473/ }),
      ).not.toBeInTheDocument(),
    );
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

  it("a result appearing under a resting pointer doesn't take the cursor", async () => {
    // Results render where "Search for a course" was clicked: the browser
    // fires pointerenter, but the mouse never moved (QA2).
    const { user, box } = await renderSearch();
    await user.type(box, "cmsc 351");
    const row = await screen.findByRole("option", { name: /^CMSC351/ });
    fireEvent.pointerEnter(row, { pointerType: "mouse" });
    expect(useUi.getState().hoverCourse).toBeNull();
    expect(row).toHaveAttribute("aria-selected", "false");
  });

  it("a finger on a result doesn't preview it", async () => {
    // iOS Safari drops a tap's click when content appears as it lands.
    const { user, box } = await renderSearch();
    await user.type(box, "cmsc 351");
    const row = await screen.findByRole("option", { name: /^CMSC351/ });
    await user.pointer({ keys: "[TouchA>]", target: row });
    expect(useUi.getState().hoverCourse).toBeNull();
    await user.pointer({ keys: "[/TouchA]", target: row });
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
    expect(currentView().drill).toEqual({
      kind: "course",
      courseCode: first,
    });
    expect(useUi.getState().hoverCourse).toBeNull();
    expect(track).toHaveBeenCalledWith("search_result_opened", {
      position: 0,
    });
  });

  it("↓ reaches a greyed row too, with no ghosts, and ↵ opens it", async () => {
    const { user, box } = await renderSearch();
    await user.type(box, "cmsc473");
    const row = await screen.findByRole("option", { name: /^CMSC473/ });
    await user.keyboard("{ArrowDown}");
    expect(box).toHaveAttribute("aria-activedescendant", row.id);
    expect(row).toHaveAttribute("aria-selected", "true");
    // Nothing of it is on the calendar: the term has no sections of it.
    expect(useUi.getState().hoverCourse).toBeNull();
    await user.keyboard("{Enter}");
    expect(currentView().drill).toEqual({
      kind: "course",
      courseCode: "CMSC473",
    });
  });

  it("clicking a result opens its details", async () => {
    const { user, box } = await renderSearch();
    await user.type(box, "algorithms");
    await user.click(await screen.findByRole("option", { name: /^CMSC351/ }));
    expect(currentView().drill).toEqual({
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
      via: "chip",
    });

    await user.click(openSeats);
    expect(openSeats).toHaveAttribute("aria-pressed", "true");
    expect(matchCount()).toBeLessThanOrEqual(narrowed);
    expect(
      screen.getByText(new RegExp(`^${matchCount()} courses?$`)),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(matchCount()).toBe(all);
    expect(screen.getByRole("button", { name: "Level" })).toBeInTheDocument();
  });

  it("Fits my plan keeps only courses with a section that fits", async () => {
    const { user, box } = await renderSearch();
    await user.type(box, "cmsc");
    await user.click(screen.getByRole("button", { name: "Fits my plan" }));
    // "4 sections · 2 fit", or a one-section course's "… · Fits".
    for (const row of screen.getAllByRole("option"))
      expect(row).toHaveTextContent(/ · ([1-9]\d* fit|Fits)/);
    expect(screen.getAllByRole("option").length).toBeGreaterThan(0);
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

  it("a GenEd typed in the box becomes its chip, and Backspace takes it off", async () => {
    const { user, box } = await renderSearch();
    await user.type(box, "dshu");
    // Before it's a chip, it already filters.
    const typed = results();
    expect(typed.length).toBeGreaterThan(0);
    await user.type(box, " ");
    expect(box).toHaveValue("");
    expect(
      screen.getByRole("button", { name: "Gen-eds: DSHU" }),
    ).toBeInTheDocument();
    expect(results()).toEqual(typed);
    expect(track).toHaveBeenCalledWith("search_filter_changed", {
      filter: "gen-eds",
      via: "typed",
    });
    const index = useCatalog.getState().byTerm[TEST_TERM_ID]?.index;
    for (const code of results()) {
      const course = code ? index?.courses.get(code) : undefined;
      expect(
        course?.genEds.some((group) => group.some((o) => o.code === "DSHU")),
      ).toBe(true);
    }
    await user.keyboard("{Backspace}");
    expect(screen.getByRole("button", { name: "Gen-eds" })).toBeInTheDocument();
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("Enter turns a level into its chip rather than opening a course", async () => {
    const { user, box } = await renderSearch();
    await user.type(box, "cmsc 400s{Enter}");
    expect(box).toHaveValue("cmsc ");
    expect(
      screen.getByRole("button", { name: "Level: 400" }),
    ).toBeInTheDocument();
    expect(results().every((code) => code?.startsWith("CMSC4"))).toBe(true);
    expect(currentView().drill).toBeNull();
  });

  it("x after the department is a digit: cmsc4xx and cmsc4x", async () => {
    const { user, box } = await renderSearch();
    await user.type(box, "cmsc4xx");
    const all = matchCount();
    expect(all).toBeGreaterThan(0);
    expect(results().every((code) => code?.startsWith("CMSC4"))).toBe(true);
    await user.clear(box);
    await user.type(box, "CMSC4X");
    expect(matchCount()).toBe(all);
  });

  it("Esc clears the box before it leaves it", async () => {
    const { user, box } = await renderSearch();
    await user.type(box, "cmsc");
    await user.keyboard("{Escape}");
    expect(box).toHaveValue("");
    expect(box).toHaveFocus();
  });

  it("sorts by course code, and says so", async () => {
    const { user, box } = await renderSearch();
    await user.type(box, "algorithms");
    await user.click(screen.getByRole("button", { name: "Sort: Best match" }));
    await user.click(
      await screen.findByRole("menuitemradio", { name: /^Course code/ }),
    );
    const codes = results();
    expect(codes).toEqual([...codes].sort());
    expect(
      screen.getByRole("button", { name: "Sort: Course code" }),
    ).toBeInTheDocument();
    expect(track).toHaveBeenCalledWith("search_sorted", { sort: "code" });
  });

  it("says when ratings for a sort aren't loaded", async () => {
    const { user, box } = await renderSearch();
    await user.type(box, "cmsc");
    await user.click(screen.getByRole("button", { name: "Sort: Best match" }));
    expect(
      await screen.findByRole("menuitemradio", { name: /^Instructor rating/ }),
    ).toHaveTextContent(/Ratings (load as you open courses|for \d+ of \d+)/);
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
    act(() => goTo({ tab: "courses", drill: null }));
    act(() => goTo({ tab: "search", drill: null }));
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
