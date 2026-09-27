import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { track } from "~/app/analytics";
import { aFourYear, aFourYearEntry } from "~/fixtures";
import {
  INITIAL_COURSE_INDEX_STATE,
  useCourseIndex,
} from "~/state/course-index-store";
import { TooltipProvider } from "~/ui/tooltip";
import { PlanFirstVisit } from "./first-visit";
import {
  PlanModelProvider,
  type PlanNav,
  PlanNavProvider,
  usePlanModel,
} from "./model";
import { activeDoc, INITIAL_FOUR_YEAR_STORE, useFourYear } from "./store";
import { TemplatePanel } from "./template-panel";

vi.mock("~/app/analytics", () => ({ track: vi.fn() }));

// The Samples tab (docs/V3.md §2.11) with the real Computer Science sample:
// it fills empty semesters from the plan's first, never touches one that has
// something, and Undo takes it back whole.

const TODAY = "2026-09-26";

function nav(go: PlanNav["go"]): PlanNav {
  return { search: { tab: "templates" }, go, back: vi.fn() };
}

function Harness({ children, go }: { children: ReactNode; go: PlanNav["go"] }) {
  const doc = useFourYear(activeDoc);
  const model = usePlanModel(
    // biome-ignore lint/style/noNonNullAssertion: each test opens a doc first
    doc!,
    TODAY,
    undefined,
  );
  return (
    <TooltipProvider>
      <PlanNavProvider value={nav(go)}>
        <PlanModelProvider value={model}>{children}</PlanModelProvider>
      </PlanNavProvider>
    </TooltipProvider>
  );
}

async function renderPanel(docOverrides: Parameters<typeof aFourYear>[0] = {}) {
  const doc = aFourYear({ firstTermId: "202608", ...docOverrides });
  useFourYear.setState({
    ...INITIAL_FOUR_YEAR_STORE,
    phase: "ready",
    history: { past: [], present: { docs: [doc] }, future: [] },
    activeId: doc.id,
  });
  const go = vi.fn();
  const user = userEvent.setup();
  render(
    <Harness go={go}>
      <TemplatePanel />
    </Harness>,
  );
  const card = await screen.findByRole("region", { name: "Computer Science" });
  return { user, go, card };
}

const openDoc = () => {
  const doc = activeDoc(useFourYear.getState());
  if (!doc) throw new Error("no doc");
  return doc;
};

const termsOf = (entries: readonly { term: string }[]) => [
  ...new Set(entries.map((e) => e.term)),
];

beforeEach(() => {
  vi.mocked(track).mockClear();
  // Adding a sample loads its departments; here there's nothing to fetch.
  useCourseIndex.setState({
    ...INITIAL_COURSE_INDEX_STATE,
    ensureDepts: async () => undefined,
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("the Samples tab", () => {
  it("shows the sample by semester from the plan's start, with its credit and source", async () => {
    const { card } = await renderPanel();
    const semesters = within(
      within(card).getByRole("list", { name: "Computer Science by semester" }),
    ).getAllByRole("listitem");
    expect(semesters[0]).toHaveTextContent(/^Fall 202614 cr/);
    expect(semesters[0]).toHaveTextContent(
      /MATH140.*CMSC131.*ENGL101.*Any DSHU course/,
    );
    expect(card).toHaveTextContent("8 semesters · 104 credits · 2026–27");
    expect(
      within(card).getByText("Fills 8 empty semesters, from Fall 2026."),
    ).toBeInTheDocument();
    expect(
      within(card).getByText(/Department of Computer Science's General Track/),
    ).toBeInTheDocument();
    expect(
      within(card).getByRole("link", { name: "See the source" }),
    ).toHaveAttribute(
      "href",
      "https://undergrad.cs.umd.edu/degree-requirements-cs-major",
    );
    // An empty plan has nothing to keep apart from: one way to add it.
    expect(
      within(card).queryByRole("button", { name: "Start a new plan from it" }),
    ).toBeNull();
  });

  it("fills an empty plan in one step, which Undo takes back", async () => {
    const { user, go, card } = await renderPanel();
    await user.click(
      within(card).getByRole("button", { name: "Add to My plan" }),
    );
    const doc = openDoc();
    expect(doc.entries).toHaveLength(32);
    expect(doc.entries.every((e) => e.source === "template")).toBe(true);
    expect(termsOf(doc.entries)).toEqual([
      "202608",
      "202701",
      "202708",
      "202801",
      "202808",
      "202901",
      "202908",
      "203001",
    ]);
    expect(doc.template).toEqual({
      id: "cmsc-2026",
      department: "Department of Computer Science",
      year: "2026–27",
    });
    expect(useFourYear.getState().notice?.label).toBe(
      "Added the Computer Science sample plan to 8 semesters",
    );
    expect(track).toHaveBeenCalledWith("template_applied", {
      template: "cmsc-2026",
    });
    expect(go).toHaveBeenCalledWith({ tab: undefined });

    useFourYear.getState().undo();
    expect(openDoc().entries).toEqual([]);
    expect(openDoc().template).toBeNull();
  });

  it("never touches a semester that has something", async () => {
    const mine = aFourYearEntry({
      id: "entry_mine",
      term: "202608",
      code: "MATH140",
    });
    const { user, card } = await renderPanel({ entries: [mine] });
    expect(
      within(card).getByText(
        "Fills 7 empty semesters, from Spring 2027. Fall 2026 has courses, so it stays as it is.",
      ),
    ).toBeInTheDocument();
    expect(
      within(card).getByText("Has courses, stays as is"),
    ).toBeInTheDocument();
    await user.click(
      within(card).getByRole("button", { name: "Add to My plan" }),
    );
    const doc = openDoc();
    expect(doc.entries.filter((e) => e.term === "202608")).toEqual([mine]);
    expect(doc.entries).toHaveLength(1 + 28);
    expect(useFourYear.getState().notice?.label).toBe(
      "Added the Computer Science sample plan to 7 semesters",
    );
  });

  it("has nothing to add once every semester it covers has something", async () => {
    const entries = [
      "202608",
      "202701",
      "202708",
      "202801",
      "202808",
      "202901",
      "202908",
      "203001",
    ].map((term, i) => aFourYearEntry({ id: `entry_${i}`, term }));
    const { card } = await renderPanel({ entries });
    expect(
      within(card).getByRole("button", { name: "Add to My plan" }),
    ).toBeDisabled();
    expect(
      within(card).getByText(
        "Every semester it covers already has courses, so there's nothing to fill.",
      ),
    ).toBeInTheDocument();
  });

  it("counts semesters from the plan's start, which the tab can change", async () => {
    const { user, card } = await renderPanel();
    await user.click(screen.getByLabelText("Your plan starts in"));
    await user.click(
      await screen.findByRole("option", { name: "Spring 2026" }),
    );
    expect(openDoc().firstTermId).toBe("202601");
    await waitFor(() =>
      expect(
        within(card).getByText("Fills 8 empty semesters, from Spring 2026."),
      ).toBeInTheDocument(),
    );
    await user.click(
      within(card).getByRole("button", { name: "Add to My plan" }),
    );
    expect(termsOf(openDoc().entries)[0]).toBe("202601");
  });

  it("starts a new plan from it, leaving the open one as it is", async () => {
    const mine = aFourYearEntry({ id: "entry_mine", term: "202608" });
    const { user, card } = await renderPanel({ entries: [mine] });
    await user.click(
      within(card).getByRole("button", { name: "Start a new plan from it" }),
    );
    const { docs } = useFourYear.getState().history.present;
    expect(docs).toHaveLength(2);
    expect(docs[0]?.entries).toEqual([mine]);
    const created = openDoc();
    expect(created.id).toBe(docs[1]?.id);
    expect(created.name).toBe("My plan 2");
    expect(created.entries).toHaveLength(32);
    expect(track).toHaveBeenCalledWith("four_year_created", {
      source: "template",
    });
    useFourYear.getState().undo();
    expect(useFourYear.getState().history.present.docs).toHaveLength(1);
  });
});

describe("the first visit", () => {
  it("opens a new plan on the Samples tab", async () => {
    useFourYear.setState({ ...INITIAL_FOUR_YEAR_STORE, phase: "ready" });
    const go = vi.fn();
    render(
      <TooltipProvider>
        <PlanFirstVisit today={TODAY} nav={nav(go)} />
      </TooltipProvider>,
    );
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "Start from a sample plan" }));
    expect(useFourYear.getState().history.present.docs).toHaveLength(1);
    expect(openDoc().firstTermId).toBe("202608");
    expect(go).toHaveBeenCalledWith({ tab: "templates" });
    expect(track).toHaveBeenCalledWith("four_year_created", {
      source: "template",
    });
  });
});
