import "fake-indexeddb/auto";
import { act, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { track } from "~/app/analytics";
import { renderShell, type ShellRoutes, settle } from "~/app/test-utils";
import type { FourYearDoc } from "~/core/schema/four-year";
import { useAccount } from "~/features/auth/account-store";
import { CoursesPanel } from "~/features/courses/courses-panel";
import { openPlanNow, renderPlanTab } from "~/features/courses/testing";
import {
  aFourYear,
  aFourYearEntry,
  aFourYearWildcardEntry,
  aPlan,
  archivedFixtureTermId,
  aSavedCourse,
} from "~/fixtures";
import { fourYearLinkDb } from "~/state/four-year-link";
import { TEST_TERM_ID } from "~/state/testing";
import { useUi } from "~/state/ui-store";
import { useWorkspace } from "~/state/workspace-store";
import { applyHandoff } from "./handoff";

// Plan's "View schedule" arriving in the scheduler, and the Courses tab's
// line about the four-year plan (docs/V3.md §2.12).

vi.mock("~/app/analytics", () => ({ track: vi.fn() }));

const panels: ShellRoutes = { tabs: { courses: CoursesPanel } };

/** Saves a four-year plan whose Spring 2027 column has these entries. */
async function saveFourYear(entries: FourYearDoc["entries"]) {
  await fourYearLinkDb().fourYear.put(aFourYear({ entries }));
}

const COLUMN = [
  aFourYearEntry({ id: "entry_one", code: "CMSC351" }),
  aFourYearEntry({ id: "entry_two", code: "MATH141" }),
  aFourYearEntry({ id: "entry_three", code: "CMSC216" }),
  aFourYearWildcardEntry({ id: "entry_wild" }),
];

beforeEach(async () => {
  localStorage.clear();
  vi.mocked(track).mockClear();
  const db = fourYearLinkDb();
  await db.fourYear.clear();
  await db.settings.clear();
  useAccount.setState({
    flags: { ...useAccount.getState().flags, plan: false },
  });
});

describe("arriving from Plan", () => {
  it("makes Plan A with the column's courses bookmarked, says so, and drops ?from=", async () => {
    await saveFourYear(COLUMN);
    const done = vi.fn();
    await renderShell({
      routes: panels,
      path: `/schedule/courses?term=${TEST_TERM_ID}&from=plan`,
      handoff: { termId: TEST_TERM_ID },
      onHandoffDone: done,
    });
    await waitFor(() => expect(done).toHaveBeenCalledTimes(1));
    const plan = openPlanNow();
    expect(plan?.name).toBe("Plan A");
    expect(plan?.courses).toEqual([
      aSavedCourse("CMSC351"),
      aSavedCourse("MATH141"),
      aSavedCourse("CMSC216"),
    ]);
    expect(
      await screen.findByText(
        "Plan A has your 3 courses from your four-year plan. Pick sections for each.",
      ),
    ).toBeInTheDocument();
    expect(track).toHaveBeenCalledWith("four_year_handoff", {
      outcome: "created-plan",
    });
    // The placeholder can't be bookmarked; the line says what to do with it.
    expect(
      await screen.findByText(
        "CMSC4XX is a placeholder; pick a course in Search or Generate.",
      ),
    ).toBeInTheDocument();
  });

  it("with Undo, leaves the empty Plan A a first visit shows", async () => {
    await saveFourYear(COLUMN);
    const { user } = await renderShell({
      routes: panels,
      path: `/schedule/courses?term=${TEST_TERM_ID}&from=plan`,
      handoff: { termId: TEST_TERM_ID },
    });
    await screen.findByText(/^Plan A has your 3 courses/);
    await user.click(screen.getByRole("button", { name: /^Undo/ }));
    const plans = useWorkspace
      .getState()
      .plans.filter((p) => p.termId === TEST_TERM_ID);
    expect(plans).toHaveLength(1);
    expect(plans[0]?.courses).toEqual([]);
  });

  it("says when Testudo doesn't list the term yet, and makes nothing for it", async () => {
    await saveFourYear(COLUMN);
    const done = vi.fn();
    await renderShell({
      routes: panels,
      path: "/schedule/courses?term=202708&from=plan",
      handoff: { termId: "202708" },
      onHandoffDone: done,
    });
    expect(
      await screen.findByText("Fall 2027's classes aren't on Testudo yet."),
    ).toBeInTheDocument();
    expect(done).toHaveBeenCalledTimes(1);
    expect(
      useWorkspace.getState().plans.some((p) => p.termId === "202708"),
    ).toBe(false);
  });
});

describe("applyHandoff", () => {
  const column = {
    hasDoc: true,
    courses: ["CMSC351", "MATH141"],
    placeholders: [],
  };

  beforeEach(() => {
    useWorkspace.setState({
      hydrated: true,
      plans: [],
      activePlanByTerm: {},
      past: [],
      future: [],
      notice: null,
    });
  });

  it("opens the linked plan and never changes it", () => {
    const a = aPlan({ id: "planAAAA", courses: [aSavedCourse("ENGL101")] });
    const b = aPlan({ id: "planBBBB", name: "Plan B", order: 1 });
    useWorkspace.setState({ plans: [a, b], activePlanByTerm: {} });
    applyHandoff(TEST_TERM_ID, column);
    expect(useWorkspace.getState().plans).toEqual([a, b]);
    expect(useWorkspace.getState().activePlanByTerm[TEST_TERM_ID]).toBe(
      "planAAAA",
    );
    expect(useWorkspace.getState().past).toHaveLength(0);
    expect(track).toHaveBeenCalledWith("four_year_handoff", {
      outcome: "opened-plan",
    });
  });

  it("fills the term's only plan while it's empty", () => {
    useWorkspace.setState({ plans: [aPlan({ id: "emptyAAA", courses: [] })] });
    applyHandoff(TEST_TERM_ID, column);
    expect(useWorkspace.getState().plans[0]?.courses).toEqual([
      aSavedCourse("CMSC351"),
      aSavedCourse("MATH141"),
    ]);
    expect(useWorkspace.getState().notice?.label).toBe(
      "Plan A has your 2 courses from your four-year plan. Pick sections for each.",
    );
  });

  it("with nothing in the column, leaves the term to its first visit", () => {
    applyHandoff(TEST_TERM_ID, { hasDoc: true, courses: [], placeholders: [] });
    expect(useWorkspace.getState().plans).toEqual([]);
    expect(track).not.toHaveBeenCalled();
  });
});

describe("the Courses tab's four-year line", () => {
  it("names the column's courses the plan lacks, and Add them bookmarks them in one undoable step", async () => {
    await saveFourYear(COLUMN);
    const { user, sidebar } = await renderPlanTab([panels], "courses");
    const line = await within(sidebar).findByTestId("four-year-line");
    // CMSC351 is placed in Plan A already.
    await waitFor(() =>
      expect(line).toHaveTextContent(
        "From your four-year plan: MATH141 and CMSC216 aren't here.",
      ),
    );
    expect(line).toHaveTextContent(
      "CMSC4XX is a placeholder; pick a course in Search or Generate.",
    );
    await user.click(within(line).getByRole("button", { name: "Add them" }));
    expect(openPlanNow()?.courses.slice(-2)).toEqual([
      aSavedCourse("MATH141"),
      aSavedCourse("CMSC216"),
    ]);
    expect(
      await screen.findByText(
        "Added MATH141 and CMSC216 from your four-year plan",
      ),
    ).toBeInTheDocument();
    await waitFor(() => expect(line).not.toHaveTextContent("aren't here"));
    await user.click(screen.getByRole("button", { name: /^Undo/ }));
    await waitFor(() => expect(line).toHaveTextContent("aren't here"));
  });

  it("links to the term in Plan", async () => {
    await saveFourYear(COLUMN);
    const { sidebar } = await renderPlanTab([panels], "courses");
    const link = await within(sidebar).findByRole("link", {
      name: "View plan",
    });
    expect(link).toHaveAttribute("href", `/plan?semester=${TEST_TERM_ID}`);
  });

  it("follows the four-year plan as it changes in another tab", async () => {
    await saveFourYear([aFourYearEntry({ id: "entry_one", code: "CMSC351" })]);
    const { sidebar } = await renderPlanTab([panels], "courses");
    const line = await within(sidebar).findByTestId("four-year-line");
    expect(line).not.toHaveTextContent("aren't here");
    await act(() => saveFourYear(COLUMN));
    await waitFor(() =>
      expect(line).toHaveTextContent("MATH141 and CMSC216 aren't here."),
    );
  });

  it("on a term Testudo has dropped, only links back to Plan", async () => {
    await fourYearLinkDb().fourYear.put(
      aFourYear({
        entries: [
          aFourYearEntry({
            id: "entry_summer",
            term: archivedFixtureTermId,
            code: "MATH141",
          }),
        ],
      }),
    );
    const { sidebar } = await renderPlanTab([panels], "courses");
    act(() => useUi.getState().setLastTermId(archivedFixtureTermId));
    const link = await within(sidebar).findByRole("link", {
      name: "View plan",
    });
    expect(link).toHaveAttribute(
      "href",
      `/plan?semester=${archivedFixtureTermId}`,
    );
    expect(within(sidebar).getByTestId("four-year-line")).not.toHaveTextContent(
      "aren't here",
    );
  });

  it("stays out of the way without a four-year plan while Plan isn't listed", async () => {
    const { sidebar } = await renderPlanTab([panels], "courses");
    await settle();
    await screen.findByTestId("course-row-CMSC351");
    expect(within(sidebar).queryByTestId("four-year-line")).toBeNull();
    // Once Plan is on, "View plan" is the way in.
    act(() =>
      useAccount.setState({
        flags: { ...useAccount.getState().flags, plan: true },
      }),
    );
    expect(
      await within(sidebar).findByRole("link", { name: "View plan" }),
    ).toBeInTheDocument();
    expect(within(sidebar).getByTestId("four-year-line")).not.toHaveTextContent(
      "four-year plan:",
    );
  });
});
