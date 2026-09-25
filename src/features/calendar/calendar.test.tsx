import { act, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { switchSection } from "~/app/actions";
import { renderShell } from "~/app/test-utils";
import { plansInTerm } from "~/core/plans";
import {
  demoBlocks,
  demoCourseColors,
  demoPlan,
  demoPlanB,
  demoPlans,
  fixtureTermId,
} from "~/fixtures";
import { useCatalog } from "~/state/catalog-store";
import { useUi } from "~/state/ui-store";
import { useWorkspace } from "~/state/workspace-store";

vi.mock("~/app/analytics", () => ({ track: vi.fn() }));

/** The shell with the fixtures' demo plan open and its term loaded. */
async function renderDemo() {
  const view = await renderShell();
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
  });
  const calendar = screen.getByRole("region", { name: "Week calendar" });
  await within(calendar).findAllByRole("button", { name: /^CMSC351 0301/ });
  return { ...view, calendar };
}

const placedSection = (courseCode: string) =>
  plansInTerm(useWorkspace.getState(), fixtureTermId)
    .find((p) => p.id === demoPlan.id)
    ?.courses.find((c) => c.courseCode === courseCode)?.sectionCode;

describe("calendar", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("draws the plan's classes with code, time and room, and blocks", async () => {
    const { calendar } = await renderDemo();
    const cmsc351 = within(calendar).getAllByRole("button", {
      name: /^CMSC351 0301, 11am–11:50am, CSI 1115$/,
    });
    expect(cmsc351).toHaveLength(3);
    expect(
      within(calendar).getByRole("button", { name: /^Work, 1pm–4pm$/ }),
    ).toBeInTheDocument();
    // Discussions and labs are labeled.
    expect(
      within(calendar).getByRole("button", {
        name: /^CMSC330 \d{4} discussion/,
      }),
    ).toBeInTheDocument();
  });

  it("shows a tight travel pill for the demo's STAT400 → CMSC351 connection", async () => {
    const { calendar } = await renderDemo();
    await waitFor(() =>
      expect(
        calendar.querySelectorAll('[data-verdict="tight"]').length,
      ).toBeGreaterThan(0),
    );
    const pill = calendar.querySelector('[data-verdict="tight"]');
    expect(pill).toHaveTextContent("8 min");
    expect(pill).toHaveAccessibleName(/^Tight: 8 min to get there/);
  });

  it("opening a course shows its other sections; clicking one switches", async () => {
    const { calendar, user } = await renderDemo();
    const [block] = within(calendar).getAllByRole("button", {
      name: /^CMSC351 0301/,
    });
    if (!block) throw new Error("no CMSC351 block");
    await user.click(block);
    expect(screen.getByText(/Showing every section of/)).toHaveTextContent(
      "Showing every section of CMSC351. Click one to switch.",
    );
    const ghosts = within(calendar).getAllByRole("button", {
      name: /^Switch to 0201/,
    });
    expect(ghosts.length).toBeGreaterThan(0);
    const [ghost] = ghosts;
    if (!ghost) throw new Error("no ghost");
    await user.click(ghost);
    expect(placedSection("CMSC351")).toBe("0201");
    expect(await screen.findByText("Switched CMSC351 to 0201")).toBeVisible();
  });

  it("↑/↓ preview a section solid and ↵ switches to it", async () => {
    const { calendar, user } = await renderDemo();
    act(() =>
      useUi.getState().drill({ kind: "course", courseCode: "CMSC351" }),
    );
    await user.keyboard("{ArrowUp}");
    expect(useUi.getState().previewSection).toBe("CMSC351-0201");
    await user.keyboard("{Enter}");
    expect(placedSection("CMSC351")).toBe("0201");
    expect(calendar.querySelector("[data-ghost]")).not.toBeNull();
  });

  it("a hovered search result shows its sections without making them clickable", async () => {
    const { calendar } = await renderDemo();
    act(() => useUi.getState().setHoverCourse("CMSC330"));
    expect(screen.getByText(/Showing every section of/)).toHaveTextContent(
      "Open it to pick one.",
    );
    expect(calendar.querySelector("[data-ghost]")).not.toBeNull();
    act(() => useUi.getState().setHoverCourse(null));
    expect(screen.queryByText(/Showing every section of/)).toBeNull();
  });

  it("a course with one section says so, instead of offering a choice", async () => {
    await renderDemo();
    act(() => useUi.getState().setHoverCourse("CMSC425"));
    expect(screen.getByText(/only section/)).toHaveTextContent(
      "Showing CMSC425's only section. Open it to add it.",
    );
    act(() => {
      useUi.getState().setHoverCourse(null);
      switchSection("CMSC425", "0101", "list");
      useUi.getState().drill({ kind: "course", courseCode: "CMSC425" });
    });
    expect(screen.getByText(/no other sections/)).toHaveTextContent(
      "CMSC425 has no other sections.",
    );
    // No ↑/↓ keys that would do nothing.
    expect(screen.queryByText("preview")).toBeNull();
  });

  it("the course's dot changes its color, everywhere, with undo", async () => {
    const { user } = await renderDemo();
    act(() =>
      useUi.getState().drill({ kind: "course", courseCode: "CMSC351" }),
    );
    await user.click(
      screen.getByRole("button", { name: "CMSC351 color: Violet" }),
    );
    await user.click(await screen.findByRole("button", { name: "Teal" }));
    expect(useWorkspace.getState().colors.CMSC351).toBe("teal");
    await user.click(await screen.findByRole("button", { name: "Undo" }));
    expect(useWorkspace.getState().colors.CMSC351).toBe("violet");
  });

  it("previews a whole plan read-only, outlining what changed", async () => {
    const { calendar } = await renderDemo();
    act(() =>
      useUi.getState().setPreviewPlan({ plan: demoPlanB, label: "result 2" }),
    );
    expect(screen.getByText("Previewing result 2.")).toBeVisible();
    expect(
      within(calendar).getAllByRole("button", { name: /^CMSC351 0101/ }).length,
    ).toBeGreaterThan(0);
    expect(
      within(calendar).queryAllByRole("button", { name: /^CMSC351 0301/ }),
    ).toHaveLength(0);
    act(() => useUi.getState().setPreviewPlan(null));
    expect(screen.queryByText("Previewing result 2.")).toBeNull();
  });
});
