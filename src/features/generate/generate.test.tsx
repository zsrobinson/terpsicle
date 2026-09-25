import { act, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { track } from "~/app/analytics";
import { renderShell } from "~/app/test-utils";
import { plansInTerm } from "~/core/plans";
import {
  demoBlocks,
  demoCourseColors,
  demoPlan,
  demoPlans,
  fixtureTermId,
} from "~/fixtures";
import { useCatalog } from "~/state/catalog-store";
import { EMPTY_DRAFT, useGenerateDrafts } from "~/state/generate-drafts";
import { useUi } from "~/state/ui-store";
import { useWorkspace } from "~/state/workspace-store";
import { createInProcessGenerator } from "~/worker/generator";
import { panels } from "./panels";
import { resetGenerateRun, setGenerator, useGenerateRun } from "./run-store";

vi.mock("~/app/analytics", () => ({ track: vi.fn() }));

/** The shell on the demo plans with the Generate tab open. */
async function renderGenerate() {
  const view = await renderShell({ panels: [panels] });
  await act(async () => {
    useWorkspace.setState({
      plans: [...demoPlans],
      blocks: [...demoBlocks],
      colors: Object.fromEntries(
        demoCourseColors.map((c) => [c.courseCode, c.color]),
      ),
      activePlanByTerm: { [fixtureTermId]: demoPlan.id },
    });
    await useCatalog.getState().ensureTerm(fixtureTermId);
    await useCatalog.getState().ensureCampus();
    useUi.getState().openTab("generate");
  });
  return view;
}

const termPlans = () => plansInTerm(useWorkspace.getState(), fixtureTermId);
const draft = () => useGenerateDrafts.getState().drafts[fixtureTermId];
/** Required courses, typed into the form directly (quick to search). */
const setCourses = (...codes: string[]) =>
  useGenerateDrafts.getState().setDraft(fixtureTermId, {
    ...EMPTY_DRAFT,
    items: codes.map((courseCode) => ({
      kind: "course",
      courseCode,
      required: true,
    })),
  });
const courseField = () =>
  screen.getByRole("combobox", { name: "Add a course" });

async function addCourse(
  user: Awaited<ReturnType<typeof renderGenerate>>["user"],
  query: string,
) {
  await user.click(courseField());
  await user.keyboard(query);
  await screen.findByRole("listbox", { name: "Suggested courses" });
  await user.keyboard("{Enter}");
}

describe("Generate", () => {
  beforeEach(() => {
    localStorage.clear();
    resetGenerateRun();
    setGenerator(createInProcessGenerator());
    vi.mocked(track).mockClear();
  });
  afterEach(() => setGenerator(null));

  it("adds courses from suggestions and switches them between required and optional", async () => {
    const { user } = await renderGenerate();
    await addCourse(user, "CMSC35");
    expect(draft()?.items).toEqual([
      { kind: "course", courseCode: "CMSC351", required: true },
    ]);
    const chip = screen.getByRole("button", { name: "CMSC351, required" });
    await user.click(chip);
    expect(draft()?.items[0]).toMatchObject({ required: false });
    await user.click(screen.getByRole("button", { name: "Remove CMSC351" }));
    expect(draft()?.items).toEqual([]);
  });

  it("adds the open plan's courses: placed ones required, saved ones optional", async () => {
    const { user } = await renderGenerate();
    expect(
      screen.getByRole("button", { name: "Generate plans" }),
    ).toBeDisabled();
    await user.click(screen.getByRole("button", { name: /Plan A's courses/ }));
    expect(draft()?.items).toEqual(
      demoPlan.courses.map((c) => ({
        kind: "course",
        courseCode: c.courseCode,
        required: c.sectionCode !== null,
      })),
    );
    expect(
      screen.queryByRole("button", { name: /Plan A's courses/ }),
    ).toBeNull();
  });

  it("builds a pick-N group", async () => {
    const { user } = await renderGenerate();
    await user.click(screen.getByRole("button", { name: "Pick N of these" }));
    const group = screen.getByRole("group", { name: "Pick 1 of these" });
    const field = within(group).getByRole("combobox");
    for (const q of ["MUSC130", "PHIL140"]) {
      await user.click(field);
      await user.keyboard(q);
      await within(group).findByRole("listbox");
      await user.keyboard("{Enter}");
    }
    await user.click(within(group).getByRole("button", { name: "One more" }));
    expect(draft()?.items).toEqual([
      {
        kind: "pick",
        id: expect.any(String),
        count: 2,
        courses: [{ courseCode: "MUSC130" }, { courseCode: "PHIL140" }],
      },
    ]);
    expect(
      within(group).getByRole("button", { name: "One more" }),
    ).toBeDisabled();
  });

  it("generates ranked plans, previews one, and saves it as a new plan", async () => {
    const { user } = await renderGenerate();
    act(() => setCourses("CMSC351", "CMSC330", "STAT400"));
    await user.click(screen.getByRole("button", { name: "Generate plans" }));
    const list = await screen.findByRole("list", { name: "Generated plans" });
    expect(track).toHaveBeenCalledWith(
      "generate_run",
      expect.objectContaining({ courses: 3, relaxed: false }),
    );

    await user.click(within(list).getAllByRole("button")[0] as HTMLElement);
    expect(
      within(screen.getByRole("navigation", { name: "Breadcrumb" })).getByText(
        "Option 1",
      ),
    ).toBeVisible();
    expect(useUi.getState().previewPlan?.label).toBe("Option 1");
    expect(screen.getByText("Previewing Option 1.")).toBeVisible();
    expect(screen.getByText(/Changes from Plan A/)).toBeVisible();
    expect(track).toHaveBeenCalledWith("generate_result_previewed", {
      rank: 1,
    });

    const before = termPlans().length;
    await user.click(screen.getByRole("button", { name: "Save as new plan" }));
    expect(termPlans()).toHaveLength(before + 1);
    const saved = termPlans().at(-1);
    expect(useWorkspace.getState().activePlanByTerm[fixtureTermId]).toBe(
      saved?.id,
    );
    expect(saved?.name).toBe("Plan C");
    expect(useUi.getState().previewPlan).toBeNull();
    expect(useUi.getState().stack).toEqual([]);
    expect(track).toHaveBeenCalledWith("generate_plans_saved", { count: 1 });
  });

  it("saves several results at once, as one undo step", async () => {
    const { user } = await renderGenerate();
    act(() => setCourses("CMSC351", "CMSC330", "STAT400"));
    await user.click(screen.getByRole("button", { name: "Generate plans" }));
    await screen.findByRole("list", { name: "Generated plans" });
    await user.click(screen.getByRole("checkbox", { name: "Select Option 1" }));
    await user.click(screen.getByRole("checkbox", { name: "Select Option 2" }));
    const before = termPlans().length;
    await user.click(screen.getByRole("button", { name: "Save 2 plans" }));
    expect(termPlans()).toHaveLength(before + 2);
    expect(useGenerateRun.getState().selected).toEqual([]);
    expect(await screen.findByText("Saved 2 plans")).toBeVisible();
    act(() => {
      useWorkspace.getState().undo();
    });
    expect(termPlans()).toHaveLength(before);
  });

  it("suggests what to loosen when nothing fits, and applying one generates again", async () => {
    const { user } = await renderGenerate();
    act(() =>
      useGenerateDrafts.getState().setDraft(fixtureTermId, {
        items: [
          { kind: "course", courseCode: "CMSC351", required: true },
          { kind: "course", courseCode: "CMSC330", required: true },
        ],
        mustHaves: {
          earliestStart: 21 * 60,
          latestEnd: null,
          daysOff: [],
          enoughTravelTime: true,
          openSeatsOnly: false,
          respectBlocks: true,
          credits: { min: null, max: null },
        },
        rankBy: { preset: "compact" },
      }),
    );
    await user.click(screen.getByRole("button", { name: "Generate plans" }));
    const nothing = await screen.findByTestId("nothing-fits");
    expect(nothing).toHaveTextContent("Nothing fits all of that.");
    const relax = within(nothing).getByRole("button", {
      name: /^Allow classes before 9pm/,
    });
    await user.click(relax);
    expect(draft()?.mustHaves.earliestStart).toBeNull();
    expect(track).toHaveBeenCalledWith("generate_relaxation_applied", {
      constraint: "earliest-start",
    });
    await screen.findByRole("list", { name: "Generated plans" });
    expect(track).toHaveBeenLastCalledWith(
      "generate_run",
      expect.objectContaining({ relaxed: true }),
    );
  });

  it("says when the plans shown are for earlier choices", async () => {
    const { user } = await renderGenerate();
    await addCourse(user, "CMSC351");
    await user.click(screen.getByRole("button", { name: "Generate plans" }));
    await screen.findByRole("list", { name: "Generated plans" });
    await user.click(screen.getByRole("button", { name: "Friday off" }));
    expect(
      screen.getByText("These plans are for your earlier choices."),
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Generate again" }),
    ).toBeEnabled();
  });

  it("sets must-have times and the ranking with the app's selects", async () => {
    const { user } = await renderGenerate();
    await user.click(screen.getByRole("combobox", { name: "Start after" }));
    await user.click(await screen.findByRole("option", { name: "10am" }));
    expect(draft()?.mustHaves.earliestStart).toBe(600);
    await user.click(screen.getByRole("combobox", { name: "Rank by" }));
    await user.click(await screen.findByRole("option", { name: "Custom" }));
    expect(draft()?.rankBy).toEqual({
      preset: "custom",
      weights: {
        compact: 1,
        "fewer-days": 0,
        "later-starts": 0,
        "best-rated": 0,
        "higher-gpa": 0,
        "safest-seats": 0,
      },
    });
    expect(screen.getByRole("group", { name: "Custom weights" })).toBeVisible();
  });

  it("says what sets each plan apart, and filters by the courses it includes", async () => {
    const { user } = await renderGenerate();
    act(() =>
      useGenerateDrafts.getState().setDraft(fixtureTermId, {
        ...EMPTY_DRAFT,
        items: [
          { kind: "course", courseCode: "CMSC351", required: true },
          {
            kind: "pick",
            id: "hum",
            count: 1,
            courses: [{ courseCode: "MUSC130" }, { courseCode: "PHIL140" }],
          },
        ],
      }),
    );
    await user.click(screen.getByRole("button", { name: "Generate plans" }));
    const list = await screen.findByRole("list", { name: "Generated plans" });
    const rows = within(list).getAllByTestId("generated-plan");
    expect(rows[0]).toHaveTextContent("Best match");
    // Later rows name the sections that differ from Option 1.
    expect(rows[1]).toHaveTextContent(/(CMSC351|MUSC130|PHIL140) \d{4}/);

    const filters = screen.getByRole("toolbar", {
      name: "Filter by included courses",
    });
    await user.click(within(filters).getByRole("button", { name: /^PHIL140/ }));
    for (const row of within(list).getAllByTestId("generated-plan"))
      expect(row).toHaveTextContent("PHIL140");
    await user.click(within(filters).getByRole("button", { name: /^All/ }));
    expect(within(list).getAllByTestId("generated-plan")).toHaveLength(
      rows.length,
    );
  });

  it("focuses the course field when asked to start generating", async () => {
    await renderGenerate();
    const { startGenerate } = await import("~/app/actions");
    act(() => startGenerate());
    await waitFor(() => expect(courseField()).toHaveFocus());
  });
});
