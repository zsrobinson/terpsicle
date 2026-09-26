import { act, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { track } from "~/app/analytics";
import { renderShell } from "~/app/test-utils";
import { encodeShare } from "~/core/share";
import { aSharePayload } from "~/fixtures";
import { useSeatAlerts } from "~/state/seat-alerts";
import { TEST_TERM_ID } from "~/state/testing";
import { useUi } from "~/state/ui-store";
import { useWorkspace } from "~/state/workspace-store";
import { panels } from "./panels";
import { openPlanNow, renderPlanTab } from "./testing";

vi.mock("~/app/analytics", () => ({ track: vi.fn() }));

describe("Courses tab", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.mocked(track).mockClear();
  });

  it("lists the plan's courses with section, title, instructor, days and seats", async () => {
    await renderPlanTab([panels], "courses");
    expect(
      await screen.findByRole("heading", { name: "Plan A" }),
    ).toBeInTheDocument();
    expect(screen.getByText("5 courses · 16 credits")).toBeInTheDocument();
    const row = await screen.findByTestId("course-row-CMSC351");
    expect(row).toHaveTextContent("CMSC351");
    expect(row).toHaveTextContent("0301");
    expect(row).toHaveTextContent("Algorithms");
    expect(row).toHaveTextContent("Keiko Ashdown · MWF");
    // Seats sit in the row's trail column, outside the button.
    const item = row.closest("li");
    if (!item) throw new Error("no list item");
    expect(item).toHaveTextContent("3 left");
    // CMSC351 is low on seats and tight after STAT400: flagged calmly, and
    // the row says what's wrong in words, not just an icon. "3 left" is the
    // seat words' job, so it isn't repeated.
    await waitFor(() => expect(row).toHaveTextContent("2 problems"));
    expect(within(row).getByText(/^Tight connection from/)).toHaveTextContent(
      "Tight connection from STAT400",
    );
    expect(within(row).getByText(/^Tight connection from/)).toHaveClass(
      "text-warn",
    );
    // Color dot opens the palette.
    expect(
      screen.getByRole("button", { name: "CMSC351 color: Violet" }),
    ).toBeInTheDocument();
  });

  it("colors a row's problem words by severity: not enough time is an error", async () => {
    await renderPlanTab([panels], "courses");
    // Five extra minutes turn STAT400 → CMSC351's tight 8-minute walk in a
    // 10-minute gap into not enough time, which the top bar counts as an error.
    act(() => useWorkspace.getState().setTravel({ extraMinutes: 5 }));
    const row = await screen.findByTestId("course-row-CMSC351");
    const words = await within(row).findByText(/^Not enough time after/);
    expect(words).toHaveClass("text-error");
    expect(words).not.toHaveClass("text-warn");
  });

  it("lists bookmarked courses; clicking one opens its details", async () => {
    const { user } = await renderPlanTab([panels], "courses");
    const saved = await screen.findByRole("list", { name: "Bookmarked" });
    const musc = within(saved).getByRole("button", { name: /^MUSC130/ });
    expect(musc).toHaveTextContent("Survey of Western Music Literature");
    await user.click(musc);
    expect(useUi.getState().stack.at(-1)).toEqual({
      kind: "course",
      courseCode: "MUSC130",
    });
  });

  it("says Watching, with a filled bell, on a section with a seat watch", async () => {
    await renderPlanTab([panels], "courses");
    const row = await screen.findByTestId("course-row-CMSC351");
    expect(within(row).queryByText("Watching")).toBeNull();
    await act(() =>
      useSeatAlerts.getState().put([
        {
          termId: TEST_TERM_ID,
          sectionKey: "CMSC351-0301",
          email: "terp@umd.edu",
          status: "active",
          subscriptionId: null,
          manageToken: null,
          createdAt: "2026-09-01T00:00:00.000Z",
          updatedAt: "2026-09-01T00:00:00.000Z",
        },
      ]),
    );
    expect(
      await within(row).findByTestId("watching-CMSC351-0301"),
    ).toHaveTextContent("Watching");
  });

  it("clicking a course opens its details", async () => {
    const { user } = await renderPlanTab([panels], "courses");
    await user.click(await screen.findByTestId("course-row-ECON200"));
    expect(useUi.getState().stack.at(-1)).toEqual({
      kind: "course",
      courseCode: "ECON200",
    });
  });

  it("removes a course from its menu, and undo brings it back", async () => {
    const { user } = await renderPlanTab([panels], "courses");
    await user.click(
      await screen.findByRole("button", { name: "Actions for ENGL393" }),
    );
    await user.click(
      await screen.findByRole("menuitem", { name: "Remove from plan" }),
    );
    expect(openPlanNow()?.courses.some((c) => c.courseCode === "ENGL393")).toBe(
      false,
    );
    expect(
      await screen.findByText("Removed ENGL393 from Plan A"),
    ).toBeVisible();
    expect(track).toHaveBeenCalledWith("course_removed", { via: "menu" });

    await user.click(screen.getByRole("button", { name: "Undo" }));
    await waitFor(() =>
      expect(screen.getByTestId("course-row-ENGL393")).toBeInTheDocument(),
    );
  });

  it("bookmarks a placed course instead, off the calendar", async () => {
    const { user } = await renderPlanTab([panels], "courses");
    await user.click(
      await screen.findByRole("button", { name: "Actions for STAT400" }),
    );
    await user.click(
      await screen.findByRole("menuitem", { name: "Bookmark instead" }),
    );
    const entry = openPlanNow()?.courses.find(
      (c) => c.courseCode === "STAT400",
    );
    expect(entry?.sectionCode).toBeNull();
    const saved = screen.getByRole("list", { name: "Bookmarked" });
    expect(within(saved).getByText("STAT400")).toBeInTheDocument();
    expect(await screen.findByText("Bookmarked STAT400")).toBeVisible();
    expect(track).toHaveBeenCalledWith("course_saved_for_later", {
      via: "menu",
    });
  });

  it("offers no bookmark hint in a shared plan, which can't bookmark", async () => {
    await renderShell({
      panels: [panels],
      sharedParam: encodeShare(aSharePayload({ sections: ["CMSC351-0101"] })),
    });
    expect(await screen.findByTestId("course-row-CMSC351")).toBeInTheDocument();
    expect(screen.queryByText("Bookmarked")).toBeNull();
    expect(screen.queryByText(/Bookmark one from its details/)).toBeNull();
  });

  describe("first visit", () => {
    it("shows two equal paths, and each opens its tab", async () => {
      const { user } = await renderPlanTab([panels], "courses", {
        demo: false,
      });
      const guide = await screen.findByTestId("first-visit");
      expect(
        within(guide).getByRole("heading", {
          name: "Build your Spring 2027 schedule",
        }),
      ).toBeInTheDocument();
      const build = within(guide).getByRole("group", {
        name: "Build it yourself",
      });
      const generate = within(guide).getByRole("group", {
        name: "Generate plans",
      });
      // Equally weighted: the same card, a one-line summary and a primary
      // button each.
      expect(build.className).toBe(generate.className);
      const buildSummary = within(build).getByText(
        "Search, pick sections, fix what's flagged.",
      );
      const generateSummary = within(generate).getByText(
        "Tell it what you need, then pick a plan.",
      );
      expect(buildSummary.className).toBe(generateSummary.className);
      const searchButton = within(build).getByRole("button", {
        name: "Search for a course",
      });
      const generateButton = within(generate).getByRole("button", {
        name: "Generate plans",
      });
      expect(searchButton.className).toBe(generateButton.className);

      await user.click(searchButton);
      expect(useUi.getState().tab).toBe("search");
      expect(useUi.getState().focusRequest?.tab).toBe("search");
      expect(track).toHaveBeenCalledWith("first_visit_path_chosen", {
        path: "build",
      });

      act(() => useUi.getState().openTab("courses"));
      await user.click(generateButton);
      expect(useUi.getState().tab).toBe("generate");
      expect(track).toHaveBeenCalledWith("first_visit_path_chosen", {
        path: "generate",
      });
    });

    it("comes back whenever the plan has nothing placed", async () => {
      await renderPlanTab([panels], "courses");
      await screen.findByTestId("course-row-CMSC351");
      expect(screen.queryByTestId("first-visit")).toBeNull();
      act(() => {
        const plan = openPlanNow();
        if (!plan) throw new Error("no plan");
        useWorkspace.setState({
          plans: useWorkspace
            .getState()
            .plans.map((p) =>
              p.id === plan.id
                ? { ...p, courses: p.courses.filter((c) => !c.sectionCode) }
                : p,
            ),
        });
      });
      expect(await screen.findByTestId("first-visit")).toBeInTheDocument();
      // Bookmarked courses stay listed under the guide.
      expect(
        screen.getByRole("list", { name: "Bookmarked" }),
      ).toBeInTheDocument();
    });
  });
});
