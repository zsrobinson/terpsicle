import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { track } from "~/app/analytics";
import { courseSearchRow } from "~/core/catalog/course-index";
import { canUndo } from "~/core/plans/history";
import type { FourYearEntry } from "~/core/schema/four-year";
import {
  aCourseIndexEntry,
  aFourYear,
  aFourYearCreditEntry,
  aFourYearEntry,
} from "~/fixtures";
import {
  INITIAL_COURSE_INDEX_STATE,
  useCourseIndex,
} from "~/state/course-index-store";
import { TooltipProvider } from "~/ui/tooltip";
import { CoursePanel } from "./course-panel";
import { CreditPanel } from "./credit-panel";
import {
  PlanModelProvider,
  type PlanNav,
  PlanNavProvider,
  usePlanModel,
} from "./model";
import { activeDoc, INITIAL_FOUR_YEAR_STORE, useFourYear } from "./store";

vi.mock("~/app/analytics", () => ({ track: vi.fn() }));

// "Counts as" (docs/V3.md §2.8, §2.10): transfer credit Testudo gave as
// "CHEM 1XX", and a code Testudo doesn't list, each say which UMD course
// they count as, picked from the course search; Undo takes it back.

const TODAY = "2026-09-26";

const chem = aFourYearCreditEntry({
  id: "entry_chem",
  title: "AP CHEMISTRY",
  via: "ap",
  equivalentPattern: "CHEM1XX",
  genEds: ["DSNL"],
});

function Harness({ children }: { children: ReactNode }) {
  const doc = useFourYear(activeDoc);
  // biome-ignore lint/style/noNonNullAssertion: each test opens a doc first
  const model = usePlanModel(doc!, TODAY, undefined);
  const nav: PlanNav = {
    search: { tab: "problems" },
    go: vi.fn(),
    back: vi.fn(),
  };
  return (
    <TooltipProvider>
      <PlanNavProvider value={nav}>
        <PlanModelProvider value={model}>{children}</PlanModelProvider>
      </PlanNavProvider>
    </TooltipProvider>
  );
}

function open(entries: FourYearEntry[], panel: ReactNode) {
  const doc = aFourYear({ entries });
  useFourYear.setState({
    ...INITIAL_FOUR_YEAR_STORE,
    phase: "ready",
    history: { past: [], present: { docs: [doc] }, future: [] },
    activeId: doc.id,
  });
  render(<Harness>{panel}</Harness>);
  return userEvent.setup();
}

const openEntry = (id: string) =>
  activeDoc(useFourYear.getState())?.entries.find((e) => e.id === id);

beforeEach(() => {
  vi.mocked(track).mockClear();
  const courses = [
    aCourseIndexEntry({ code: "CHEM131", title: "Chemistry I" }),
    aCourseIndexEntry({ code: "CHEM135", title: "Chemistry for Engineers" }),
    aCourseIndexEntry({ code: "MATH241", title: "Calculus III" }),
  ];
  useCourseIndex.setState({
    ...INITIAL_COURSE_INDEX_STATE,
    search: courses.map(courseSearchRow),
    searchState: "ready",
    ensureDepts: async () => undefined,
  });
});

describe("CreditPanel", () => {
  it("says what the transcript gave, and saves what the credit counts as", async () => {
    const user = open([chem], <CreditPanel entryId="entry_chem" />);
    expect(screen.getByText("AP credit · 4 credits")).toBeInTheDocument();
    const form = screen.getByRole("form", { name: "What it counts as" });
    // The placeholder's courses come first, before anything's typed.
    const offered = within(form).getByRole("list", {
      name: "Courses it could count as",
    });
    expect(
      within(offered)
        .getAllByRole("button")
        .map((b) => b.textContent),
    ).toEqual(["CHEM131Chemistry I", "CHEM135Chemistry for Engineers"]);
    expect(within(form).queryByText("MATH241")).toBeNull();

    await user.click(within(offered).getByRole("button", { name: /CHEM131/ }));
    await user.click(within(form).getByRole("button", { name: "Save" }));

    expect(openEntry("entry_chem")).toMatchObject({
      title: "AP CHEMISTRY",
      countsAs: "CHEM131",
      credits: 4,
      genEds: ["DSNL"],
    });
    expect(track).toHaveBeenCalledWith("four_year_details_saved", {
      genEds: 1,
      countsAs: true,
      of: "credit",
    });
    expect(canUndo(useFourYear.getState().history)).toBe(true);
  });

  it("finds a course by typing, and Enter picks the top one", async () => {
    const user = open([chem], <CreditPanel entryId="entry_chem" />);
    const field = screen.getByLabelText("Counts as");
    await user.type(field, "calc{Enter}");
    expect(screen.getByText("MATH241", { exact: true })).toBeInTheDocument();
    expect(openEntry("entry_chem")).not.toHaveProperty("countsAs");
  });

  it("saves no UMD course as an answer", async () => {
    const user = open([chem], <CreditPanel entryId="entry_chem" />);
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(openEntry("entry_chem")).toMatchObject({ countsAs: null });
  });
});

describe("course info", () => {
  it("says what a code Testudo doesn't list counts as", async () => {
    const honors = aFourYearEntry({
      id: "entry_h",
      code: "CHEM131H",
      term: "202601",
      credits: 3,
      source: "transcript",
      transcript: { title: "HONORS CHEMISTRY", via: "umd" },
    });
    // CHEM's file has loaded, without CHEM131H: Testudo doesn't list it.
    useCourseIndex.setState({
      deptsState: { CHEM: "ready" },
      depts: {
        CHEM: {
          schemaVersion: 1,
          dept: "CHEM",
          courses: [
            aCourseIndexEntry({ code: "CHEM131", title: "Chemistry I" }),
          ],
        },
      },
    });
    const user = open([honors], <CoursePanel code="CHEM131H" />);
    const form = screen.getByRole("form", { name: "Add course info" });
    await user.type(within(form).getByLabelText("Counts as"), "chem131");
    await user.click(within(form).getByRole("button", { name: /^CHEM131/ }));
    await user.click(
      within(form).getByRole("button", { name: "Save course info" }),
    );
    expect(openEntry("entry_h")).toMatchObject({
      details: { title: "Chemistry I", countsAs: "CHEM131" },
    });
  });
});
