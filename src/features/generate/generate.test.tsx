import "fake-indexeddb/auto";
import { act, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { track } from "~/app/analytics";
import { currentView, goTo } from "~/app/schedule-nav";
import type { ShellRoutes } from "~/app/test-utils";
import { currentPath, renderShell } from "~/app/test-utils";
import { plansInTerm } from "~/core/plans";
import {
  aFourYear,
  aFourYearEntry,
  aFourYearWildcardEntry,
  demoBlocks,
  demoCourseColors,
  demoPlan,
  demoPlans,
  fixtureTermId,
} from "~/fixtures";
import { useCatalog } from "~/state/catalog-store";
import { fourYearLinkDb } from "~/state/four-year-link";
import { EMPTY_DRAFT, useGenerateDrafts } from "~/state/generate-drafts";
import { useUi } from "~/state/ui-store";
import { useWorkspace } from "~/state/workspace-store";
import {
  createInProcessGenerator,
  GeneratorUnavailable,
} from "~/worker/generator";
import { GeneratePanel } from "./generate-panel";
import { ResultDetails } from "./result-details";
import { resetGenerateRun, setGenerator, useGenerateRun } from "./run-store";

const panels: ShellRoutes = {
  tabs: { generate: GeneratePanel },
  drills: { "generated-plan": ResultDetails },
};

vi.mock("~/app/analytics", () => ({ track: vi.fn() }));

/** The shell on the demo plans with the Generate tab open. */
async function renderGenerate() {
  const view = await renderShell({ routes: [panels] });
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
    goTo({ tab: "generate", drill: null });
  });
  return view;
}

/**
 * An empty form, as after removing every course: the tests that build a
 * list from nothing start here, since an untouched form shows Plan A's.
 */
const emptyForm = () =>
  act(() => useGenerateDrafts.getState().setDraft(fixtureTermId, EMPTY_DRAFT));

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
  afterEach(() => {
    setGenerator(null);
    vi.restoreAllMocks();
  });

  it("adds courses from suggestions and switches them between required and optional", async () => {
    const { user } = await renderGenerate();
    emptyForm();
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

  it("starts with the open plan's courses: placed ones required, bookmarked ones optional", async () => {
    const { user } = await renderGenerate();
    const planItems = demoPlan.courses.map((c) => ({
      kind: "course",
      courseCode: c.courseCode,
      required: c.sectionCode !== null,
    }));
    for (const c of demoPlan.courses)
      expect(
        screen.getByRole("button", {
          name: `${c.courseCode}, ${c.sectionCode !== null ? "required" : "optional"}`,
        }),
      ).toBeVisible();
    expect(screen.getByText(/^From Plan A\./)).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Generate plans" }),
    ).toBeEnabled();
    // Shown, not stored: it follows the plan until the first change.
    expect(draft()).toBeUndefined();

    await user.click(screen.getByRole("button", { name: "Remove MUSC130" }));
    expect(draft()?.items).toEqual(
      planItems.filter((i) => i.courseCode !== "MUSC130"),
    );
    expect(screen.queryByText(/^From Plan A\./)).toBeNull();
    // "Plan A's courses" offers back what's missing.
    await user.click(screen.getByRole("button", { name: /Plan A's courses/ }));
    expect(draft()?.items).toEqual([
      ...planItems.filter((i) => i.courseCode !== "MUSC130"),
      { kind: "course", courseCode: "MUSC130", required: false },
    ]);
    expect(
      screen.queryByRole("button", { name: /Plan A's courses/ }),
    ).toBeNull();
  });

  it("never replaces a list someone built, even an emptied one", async () => {
    const { user } = await renderGenerate();
    act(() => setCourses("CMSC132"));
    expect(
      screen.getByRole("button", { name: "CMSC132, required" }),
    ).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "CMSC351, required" }),
    ).toBeNull();
    expect(screen.queryByText(/^From Plan A\./)).toBeNull();

    await user.click(screen.getByRole("button", { name: "Remove CMSC132" }));
    expect(draft()?.items).toEqual([]);
    expect(
      screen.getByRole("button", { name: "Generate plans" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: /Plan A's courses/ }),
    ).toBeVisible();
  });

  it("generates from the four-year plan's semester, placeholders and all", async () => {
    const db = fourYearLinkDb();
    await db.fourYear.clear();
    await db.fourYear.put(
      aFourYear({
        entries: [
          aFourYearEntry({ id: "entry_one", code: "CMSC351" }),
          aFourYearEntry({ id: "entry_two", code: "STAT400" }),
          aFourYearWildcardEntry({ id: "entry_wild" }),
        ],
      }),
    );
    const { user } = await renderGenerate();
    await emptyForm();
    const from = await screen.findByTestId("from-four-year");
    // What it draws from, under the button.
    expect(
      within(from)
        .getAllByRole("listitem")
        .map((li) => li.textContent),
    ).toEqual(["CMSC351", "STAT400", "Any CMSC 400-level"]);
    await user.click(
      within(from).getByRole("button", {
        name: "Generate from four-year plan",
      }),
    );
    expect(draft()?.items).toEqual([
      { kind: "course", courseCode: "CMSC351", required: true },
      { kind: "course", courseCode: "STAT400", required: true },
      {
        kind: "wildcard",
        wildcard: { kind: "pattern", pattern: "CMSC4XX" },
        required: true,
        count: 1,
      },
    ]);
    expect(track).toHaveBeenCalledWith("four_year_handoff", {
      outcome: "generated",
    });
    await waitFor(() =>
      expect(useGenerateRun.getState().status.kind).toBe("done"),
    );
    await db.fourYear.clear();
  });

  it("offers nothing from the four-year plan without one", async () => {
    await fourYearLinkDb().fourYear.clear();
    await renderGenerate();
    await screen.findByRole("combobox", { name: "Add a course" });
    expect(screen.queryByTestId("from-four-year")).toBeNull();
  });

  it("builds a pick-N group", async () => {
    const { user } = await renderGenerate();
    emptyForm();
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

  it("says when a run fails, and Try again runs it again", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const working = createInProcessGenerator();
    let fail = true;
    setGenerator({
      run: (request, input, onProgress) =>
        fail
          ? {
              result: Promise.reject(new Error("worker crashed")),
              cancel: () => {},
            }
          : working.run(request, input, onProgress),
    });
    const { user } = await renderGenerate();
    act(() => setCourses("CMSC351", "CMSC330"));
    await user.click(screen.getByRole("button", { name: "Generate plans" }));
    expect(
      await screen.findByText("Couldn't generate plans. Try again."),
    ).toBeInTheDocument();
    fail = false;
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(
      await screen.findByRole("list", { name: "Generated plans" }),
    ).toBeInTheDocument();
  });

  it("offers Reload when a new version removed the generator's script", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const reload = vi
      .spyOn(window.location, "reload")
      .mockImplementation(() => {});
    setGenerator({
      run: () => ({
        result: Promise.reject(new GeneratorUnavailable()),
        cancel: () => {},
      }),
    });
    const { user } = await renderGenerate();
    act(() => setCourses("CMSC351"));
    await user.click(screen.getByRole("button", { name: "Generate plans" }));
    expect(
      await screen.findByText(
        /Terpsicle has a new version\. Reload to get it\./,
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
    await user.click(screen.getByRole("button", { name: "Reload" }));
    expect(reload).toHaveBeenCalledOnce();
    reload.mockRestore();
  });

  it("generates ranked plans, opens one by its arrow, and adds it as the next plan", async () => {
    const { user } = await renderGenerate();
    act(() => setCourses("CMSC351", "CMSC330", "STAT400"));
    await user.click(screen.getByRole("button", { name: "Generate plans" }));
    const list = await screen.findByRole("list", { name: "Generated plans" });
    expect(track).toHaveBeenCalledWith(
      "generate_run",
      expect.objectContaining({ courses: 3, relaxed: false, live: false }),
    );
    // No ticking plans to save several: each row has one arrow.
    expect(within(list).queryByRole("checkbox")).not.toBeInTheDocument();
    const rows = within(list).getAllByTestId("generated-plan");
    expect(within(rows[0] as HTMLElement).getAllByRole("button")).toHaveLength(
      1,
    );

    await user.click(screen.getByRole("button", { name: /^Option 1: / }));
    expect(
      screen.getByText("Option 1", { selector: "[aria-current=page]" }),
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Back to Generate" }),
    ).toBeVisible();
    expect(useUi.getState().previewPlan?.label).toBe("Option 1");
    expect(screen.getByText("Previewing Option 1.")).toBeVisible();
    expect(track).toHaveBeenCalledWith("generate_result_previewed", {
      rank: 1,
    });

    // Every course and section, with what we know of it.
    const sections = screen.getByRole("list", {
      name: "Courses and sections",
    });
    const { status } = useGenerateRun.getState();
    if (status.kind !== "done") throw new Error("the run should be done");
    const keys = status.result.results[0]?.sections ?? [];
    expect(keys).toHaveLength(3);
    for (const key of keys) {
      const row = within(sections).getByTestId(`result-section-${key}`);
      const { section } = useCatalog
        .getState()
        .byTerm[fixtureTermId]?.index.sections.get(key) ?? {
        section: null,
      };
      expect(row).toHaveTextContent(key.split("-")[1] ?? "");
      expect(row).toHaveTextContent(
        section?.instructors[0] ?? "Instructor TBA",
      );
      expect(row).toHaveTextContent(/open|left|Full|Seats unknown/);
    }

    const before = termPlans().length;
    await user.click(screen.getByRole("button", { name: "Add as Plan C" }));
    expect(termPlans()).toHaveLength(before + 1);
    const saved = termPlans().at(-1);
    expect(useWorkspace.getState().activePlanByTerm[fixtureTermId]).toBe(
      saved?.id,
    );
    expect(saved?.name).toBe("Plan C");
    expect(useUi.getState().previewPlan).toBeNull();
    expect(currentView().drill).toBeNull();
    expect(track).toHaveBeenCalledWith("generate_plans_saved", { count: 1 });
    expect(await screen.findByText("Added Plan C")).toBeVisible();
    act(() => {
      useWorkspace.getState().undo();
    });
    expect(termPlans()).toHaveLength(before);
  });

  it("previews a result on the calendar while the mouse is over it", async () => {
    const { user } = await renderGenerate();
    act(() => setCourses("CMSC351", "CMSC330", "STAT400"));
    await user.click(screen.getByRole("button", { name: "Generate plans" }));
    const list = await screen.findByRole("list", { name: "Generated plans" });
    const [first, second] = within(list).getAllByTestId("generated-plan");
    if (!first || !second) throw new Error("expected two results");
    await user.hover(second);
    expect(useUi.getState().previewPlan?.label).toBe("Option 2");
    expect(screen.getByText("Previewing Option 2.")).toBeVisible();
    await user.hover(first);
    expect(useUi.getState().previewPlan?.label).toBe("Option 1");
    await user.unhover(first);
    expect(useUi.getState().previewPlan).toBeNull();
    // Nothing is saved or opened by looking.
    expect(currentView().drill).toBeNull();
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

  it("keeps the courses above the results, and edits them in the form", async () => {
    const { user } = await renderGenerate();
    emptyForm();
    await addCourse(user, "CMSC351");
    await user.click(screen.getByRole("button", { name: "Generate plans" }));
    await screen.findByRole("list", { name: "Generated plans" });
    // The form gives way to a line of what was asked for, and the chips.
    expect(screen.getByText("1 course")).toBeVisible();
    expect(screen.getByRole("group", { name: "Filters" })).toBeVisible();
    expect(screen.getByRole("group", { name: "Preferences" })).toBeVisible();
    expect(
      screen.queryByRole("combobox", { name: "Add a course" }),
    ).not.toBeInTheDocument();

    // Unchanged, the form leads back to the same plans.
    await user.click(screen.getByRole("button", { name: "Edit" }));
    await user.click(screen.getByRole("button", { name: /^See \d+ plans?$/ }));
    await screen.findByRole("list", { name: "Generated plans" });

    // With other courses, it offers a new run, and the earlier plans stay
    // reachable.
    await user.click(screen.getByRole("button", { name: "Edit" }));
    await addCourse(user, "CMSC330");
    expect(
      screen.getByRole("button", { name: "Generate again" }),
    ).toBeEnabled();
    await user.click(screen.getByRole("button", { name: "See earlier plans" }));
    expect(screen.getByText("1 course")).toBeVisible();
  });

  it("re-ranks the results in place as a preference chip cycles", async () => {
    const { user } = await renderGenerate();
    act(() => setCourses("CMSC351", "CMSC330", "STAT400"));
    await user.click(screen.getByRole("button", { name: "Generate plans" }));
    const list = await screen.findByRole("list", { name: "Generated plans" });
    const prefs = screen.getByRole("group", { name: "Preferences" });
    // Compact days is on by default; the rows say how compact each is.
    expect(
      within(prefs).getByRole("button", { name: "Compact days: on" }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(within(list).getAllByTestId("rank-marks")[0]).toHaveTextContent(
      /gaps$/i,
    );

    // A click turns Later starts on; the list re-ranks without leaving.
    await user.click(
      within(prefs).getByRole("button", { name: "Later starts: off" }),
    );
    expect(track).toHaveBeenCalledWith("generate_preference_changed", {
      factor: "later-starts",
      level: 1,
    });
    await waitFor(() =>
      expect(track).toHaveBeenCalledWith(
        "generate_run",
        expect.objectContaining({
          live: true,
          preferences: ["compact", "later-starts"],
        }),
      ),
    );
    await waitFor(() =>
      expect(useGenerateRun.getState().refreshing).toBe(false),
    );
    expect(
      screen.getByRole("list", { name: "Generated plans" }),
    ).toBeInTheDocument();
    expect(
      within(screen.getAllByTestId("rank-marks")[0] as HTMLElement).getByText(
        / avg start$/,
      ),
    ).toBeVisible();

    // Again counts it double; again turns it off. Keyboard works too.
    const later = within(prefs).getByRole("button", {
      name: "Later starts: on",
    });
    later.focus();
    await user.keyboard("{Enter}");
    const doubled = within(prefs).getByRole("button", {
      name: "Later starts: counts double",
    });
    expect(doubled).toHaveTextContent("Later starts2×");
    await user.keyboard(" ");
    expect(
      within(prefs).getByRole("button", { name: "Later starts: off" }),
    ).toHaveAttribute("aria-pressed", "false");
    expect(draft()?.rankBy).toEqual({ preset: "compact" });
    // Each chip is a place: the URL says what's on, and Back undoes it.
    await waitFor(() => expect(currentPath()).toMatch(/view=/));
  });

  it("filters the results in place, and says how many plans each filter took out", async () => {
    const { user } = await renderGenerate();
    act(() => setCourses("ENGL101", "CMSC132"));
    await user.click(screen.getByRole("button", { name: "Generate plans" }));
    await screen.findByRole("list", { name: "Generated plans" });
    const filters = screen.getByRole("group", { name: "Filters" });

    await user.click(within(filters).getByRole("button", { name: "Days off" }));
    await user.click(
      await screen.findByRole("menuitemcheckbox", { name: "Thursday" }),
    );
    await user.keyboard("{Escape}");
    expect(draft()?.mustHaves.daysOff).toEqual(["Th"]);
    expect(track).toHaveBeenCalledWith("generate_filter_changed", {
      filter: "days-off",
      on: true,
    });
    // A chip is a place: the URL says so, and Back would undo it.
    expect(currentPath()).toMatch(/off=/);
    await waitFor(() => {
      const { status } = useGenerateRun.getState();
      expect(
        status.kind === "done" && status.request.mustHaves.daysOff,
      ).toEqual(["Th"]);
    });
    // The results stay on screen, re-run in place.
    expect(
      screen.getByRole("list", { name: "Generated plans" }),
    ).toBeInTheDocument();
    const { status } = useGenerateRun.getState();
    if (status.kind !== "done") throw new Error("the run should be done");
    const count = status.result.filterCounts.find(
      (c) => c.constraint === "days-off",
    );
    expect(count?.removed).toBeGreaterThan(0);
    expect(
      within(filters).getByRole("button", {
        name: "Days off: No Thursdays",
      }),
    ).toHaveTextContent(`No Thursdays−${count?.removed.toLocaleString()}`);
    // No plan left has a Thursday class.
    for (const result of status.result.results)
      for (const key of result.sections) {
        const ref = useCatalog
          .getState()
          .byTerm[fixtureTermId]?.index.sections.get(key);
        for (const m of ref?.section.meetings ?? [])
          expect(m.timed && m.days.includes("Th")).toBe(false);
      }
  });

  it("lists other sections at the same times only when asked", async () => {
    const { user } = await renderGenerate();
    act(() => setCourses("ENGL101"));
    await user.click(screen.getByRole("button", { name: "Generate plans" }));
    const list = await screen.findByRole("list", { name: "Generated plans" });
    // The ×N chip explains itself with a real tooltip, not a native title.
    const chip = within(list).getAllByText(/^×\d+$/)[0] as HTMLElement;
    expect(chip).not.toHaveAttribute("title");
    await user.hover(chip);
    expect(
      (await screen.findAllByText(/ways to get this same week/))[0],
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /^Option 1: / }));
    const sections = screen.getByRole("list", {
      name: "Courses and sections",
    });
    const row = within(sections)
      .getByText(/other sections? meets? at the same times/)
      .closest("li") as HTMLElement;
    expect(row).toHaveTextContent(/^ENGL101/);
    const show = within(row).getByRole("button", { name: "Show" });
    expect(show).toHaveAttribute("aria-expanded", "false");
    await user.click(show);
    expect(within(row).getByText(/Rooms may differ/)).toBeVisible();
    expect(within(row).getByRole("button", { name: "Hide" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
  });

  it("names days off the way the Blocks form does", async () => {
    const { user } = await renderGenerate();
    await user.click(screen.getByRole("button", { name: "Days off" }));
    const menu = await screen.findByRole("menu");
    expect(
      within(menu)
        .getAllByRole("menuitemcheckbox")
        .map((o) => o.textContent),
    ).toEqual(["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"]);
    await user.click(
      within(menu).getByRole("menuitemcheckbox", { name: "Monday" }),
    );
    await user.click(
      within(menu).getByRole("menuitemcheckbox", { name: "Friday" }),
    );
    await user.keyboard("{Escape}");
    expect(
      screen.getByRole("button", { name: "Days off: No Mon, Fri" }),
    ).toBeVisible();
  });

  it("sets filters and preferences with chips", async () => {
    const { user } = await renderGenerate();
    await user.click(
      screen.getByRole("button", { name: "No classes before: any time" }),
    );
    await user.click(
      await screen.findByRole("menuitemradio", {
        name: "No classes before 10am",
      }),
    );
    expect(draft()?.mustHaves.earliestStart).toBe(600);
    expect(
      screen.getByRole("button", {
        name: "No classes before: No classes before 10am",
      }),
    ).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Only open seats" }));
    expect(draft()?.mustHaves.openSeatsOnly).toBe(true);
    expect(
      screen.getByRole("button", { name: "Only open seats" }),
    ).toHaveAttribute("aria-pressed", "true");

    await user.click(screen.getByRole("button", { name: "Credits" }));
    await user.type(
      await screen.findByRole("spinbutton", { name: "Fewest credits" }),
      "12",
    );
    expect(draft()?.mustHaves.credits).toEqual({ min: 12, max: null });
    await user.keyboard("{Escape}");
    expect(
      screen.getByRole("button", { name: "Credits: 12+ credits" }),
    ).toBeVisible();

    // Compact days is on by default: a click counts it double, then off.
    await user.click(screen.getByRole("button", { name: "Compact days: on" }));
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
    await user.click(
      screen.getByRole("button", { name: "Compact days: counts double" }),
    );
    expect(
      screen.getByRole("button", { name: "Compact days: off" }),
    ).toBeVisible();
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

  it("adds a wildcard from a typed pattern, asks for more, and takes one away", async () => {
    const { user } = await renderGenerate();
    emptyForm();
    await user.click(courseField());
    await user.keyboard("cmsc4xx");
    const list = await screen.findByRole("listbox", {
      name: "Suggested courses",
    });
    const first = within(list).getAllByRole("option")[0];
    expect(first).toHaveTextContent("Any CMSC 400-level");
    expect(first).toHaveTextContent(/\d+ courses/);
    await user.keyboard("{Enter}");
    const cmsc4xx = { kind: "pattern", pattern: "CMSC4XX" };
    expect(draft()?.items).toEqual([
      { kind: "wildcard", wildcard: cmsc4xx, required: true, count: 1 },
    ]);

    await addCourse(user, "CMSC4XX");
    const chip = screen.getByRole("button", {
      name: "Any CMSC 400-level ×2, required",
    });
    await user.click(chip);
    expect(draft()?.items[0]).toMatchObject({ required: false, count: 2 });
    await user.click(
      screen.getByRole("button", { name: "Remove one CMSC 400-level course" }),
    );
    expect(draft()?.items).toEqual([
      { kind: "wildcard", wildcard: cmsc4xx, required: false, count: 1 },
    ]);
    await user.click(
      screen.getByRole("button", { name: "Remove Any CMSC 400-level" }),
    );
    expect(draft()?.items).toEqual([]);
  });

  it("suggests gen-ed codes, and says plainly when nothing matches", async () => {
    const { user } = await renderGenerate();
    await user.click(courseField());
    await user.keyboard("DSHS");
    const list = await screen.findByRole("listbox", {
      name: "Suggested courses",
    });
    expect(within(list).getAllByRole("option")[0]).toHaveTextContent(
      /Any DSHS course.*History and Social Sciences · \d+ courses/,
    );

    await user.clear(courseField());
    await user.keyboard("ARTTXXX");
    const empty = within(
      await screen.findByRole("listbox", { name: "Suggested courses" }),
    ).getAllByRole("option")[0];
    expect(empty).toHaveTextContent("Spring 2027 has no ARTT courses.");
    expect(empty).toHaveAttribute("aria-disabled", "true");
    await user.keyboard("{Enter}");
    expect(draft()?.items ?? []).toEqual([]);

    await user.clear(courseField());
    await user.keyboard("CMSC4X1");
    const hint = await screen.findByText(
      "Put X only at the end, as in CMSC4XX.",
    );
    expect(courseField()).toHaveAttribute("aria-describedby", hint.id);
  });

  it("generates with a wildcard and shows which course each plan took", async () => {
    const { user } = await renderGenerate();
    act(() =>
      useGenerateDrafts.getState().setDraft(fixtureTermId, {
        ...EMPTY_DRAFT,
        items: [
          { kind: "course", courseCode: "CMSC351", required: true },
          {
            kind: "wildcard",
            wildcard: { kind: "pattern", pattern: "CMSC4XX" },
            required: true,
            count: 1,
          },
        ],
      }),
    );
    await user.click(screen.getByRole("button", { name: "Generate plans" }));
    const list = await screen.findByRole("list", { name: "Generated plans" });
    expect(screen.getByText("1 course + Any CMSC 400-level")).toBeVisible();
    const rows = within(list).getAllByTestId("generated-plan");
    for (const row of rows)
      expect(row).toHaveTextContent(/with CMSC4\d\d[A-Z]?/);
    expect(track).toHaveBeenCalledWith(
      "generate_run",
      expect.objectContaining({ courses: 1, wildcards: ["pattern"] }),
    );

    await user.click(within(list).getAllByRole("button")[0] as HTMLElement);
    // The course a wildcard took says which wildcard it's for.
    const sections = screen.getByRole("list", {
      name: "Courses and sections",
    });
    const picked = within(sections)
      .getByText(/for Any CMSC 400-level/)
      .closest("li");
    expect(picked).toHaveTextContent(/^CMSC4\d\d[A-Z]?/);
  });

  it("says plainly when a required wildcard has nothing to pick from", async () => {
    const { user } = await renderGenerate();
    act(() =>
      useGenerateDrafts.getState().setDraft(fixtureTermId, {
        ...EMPTY_DRAFT,
        items: [
          { kind: "course", courseCode: "CMSC351", required: true },
          {
            kind: "wildcard",
            wildcard: { kind: "pattern", pattern: "ARTTXXX" },
            required: true,
            count: 1,
          },
        ],
      }),
    );
    await user.click(screen.getByRole("button", { name: "Generate plans" }));
    const nothing = await screen.findByTestId("nothing-fits");
    expect(within(nothing).getByTestId("wildcard-note")).toHaveTextContent(
      "Spring 2027 has no ARTT courses.",
    );
    await user.click(
      within(nothing).getByRole("button", {
        name: /^Make any ARTT course optional/,
      }),
    );
    await screen.findByRole("list", { name: "Generated plans" });
    expect(draft()?.items[1]).toMatchObject({ required: false });
  });

  it("focuses the course field when asked to start generating", async () => {
    await renderGenerate();
    const { startGenerate } = await import("~/app/actions");
    act(() => startGenerate());
    await waitFor(() => expect(courseField()).toHaveFocus());
  });
});
