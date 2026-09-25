import { act, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { track } from "~/app/analytics";
import { openCourse } from "~/features/courses/actions";
import { openPlanNow, renderPlanTab } from "~/features/courses/testing";
import { panels as searchPanels } from "~/features/search/panels";
import { aReviewSummary } from "~/fixtures";
import { api } from "~/server/fns/api";
import { useSeatAlerts } from "~/state/seat-alerts";
import { TEST_TERM_ID } from "~/state/testing";
import { useUi } from "~/state/ui-store";
import { panels } from "./panels";
import { forgetReviewSummaries } from "./use-review-summary";

vi.mock("~/app/analytics", () => ({ track: vi.fn() }));
vi.mock("~/server/fns/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("~/server/fns/api")>();
  return {
    ...actual,
    api: {
      ...actual.api,
      reviewSummary: vi.fn(),
      alerts: { ...actual.api.alerts, subscribe: vi.fn() },
    },
  };
});

async function renderDetails(courseCode = "CMSC351") {
  const view = await renderPlanTab([searchPanels, panels], "search");
  act(() => openCourse(courseCode));
  await screen.findByTestId("sections");
  return view;
}

const row = (code: string) => {
  const found = document.querySelector<HTMLElement>(`[data-section="${code}"]`);
  if (!found) throw new Error(`No row for section ${code}`);
  return found;
};

const findCard = (name: string) =>
  waitFor(() => {
    const card = document.querySelector<HTMLElement>(
      `[data-instructor="${name}"]`,
    );
    if (!card) throw new Error(`No card for ${name}`);
    return card;
  });

describe("Course details", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.mocked(track).mockClear();
    vi.mocked(api.reviewSummary).mockReset();
    vi.mocked(api.reviewSummary).mockResolvedValue({
      status: "unavailable",
      reason: "failed",
    });
    vi.mocked(api.alerts.subscribe).mockReset();
    forgetReviewSummaries();
  });

  it("heads with the code, credits and title, and says how many sections fit", async () => {
    await renderDetails();
    expect(screen.getByRole("heading", { name: "Algorithms" })).toBeVisible();
    expect(screen.getByText("3 credits")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Remove from Plan A" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/^Sections/)).toHaveTextContent("Sections · 1 fit");
    expect(screen.getByText(/^Seats as of/)).toBeInTheDocument();
  });

  it("groups sections by instructor, in section order", async () => {
    await renderDetails();
    const sections = screen.getByTestId("sections");
    const headers = within(sections).getAllByRole("button", {
      expanded: true,
    });
    expect(headers.map((h) => h.textContent)).toEqual([
      expect.stringMatching(/^Jada Abernathy.*2 sections$/),
      expect.stringMatching(/^Keiko Ashdown.*avg GPA 3\.26.*2 sections$/),
    ]);
    expect(
      [...sections.querySelectorAll("[data-section]")].map((r) =>
        r.getAttribute("data-section"),
      ),
    ).toEqual(["0101", "0201", "0301", "0401"]);
  });

  it("collapses a group, and remembers it", async () => {
    const { user } = await renderDetails();
    const header = screen.getByRole("button", { name: /^Jada Abernathy/ });
    await user.click(header);
    expect(header).toHaveAttribute("aria-expanded", "false");
    expect(document.querySelector('[data-section="0101"]')).toBeNull();
    expect(row("0301")).toBeInTheDocument();
    expect(useUi.getState().collapsedGroups).toHaveLength(1);

    await user.click(header);
    expect(header).toHaveAttribute("aria-expanded", "true");
    expect(row("0101")).toBeInTheDocument();
    expect(useUi.getState().collapsedGroups).toHaveLength(0);
  });

  it("labels each section's fit in words, and marks the current one", async () => {
    await renderDetails();
    expect(row("0101")).toHaveTextContent("Overlaps STAT400");
    expect(row("0101")).toHaveTextContent("Full · 14 waitlisted");
    expect(row("0201")).toHaveTextContent("Overlaps Work");
    expect(row("0301")).toHaveTextContent("In your plan");
    expect(row("0301")).toHaveTextContent("Current");
    expect(row("0301")).toHaveAttribute("aria-current", "true");
    expect(row("0401")).toHaveTextContent("Overlaps CMSC330");
  });

  it("hovering a row previews it on the calendar", async () => {
    const { user } = await renderDetails();
    await user.hover(row("0401"));
    expect(useUi.getState().previewSection).toBe("CMSC351-0401");
    await user.unhover(row("0401"));
    expect(useUi.getState().previewSection).toBeNull();
  });

  it("switches to a section from the list", async () => {
    const { user } = await renderDetails();
    await user.click(
      within(row("0401")).getByRole("button", { name: "Switch" }),
    );
    expect(
      openPlanNow()?.courses.find((c) => c.courseCode === "CMSC351")
        ?.sectionCode,
    ).toBe("0401");
    await waitFor(() => expect(row("0401")).toHaveTextContent("Current"));
  });

  it("adds a course that isn't in the plan, at its first fitting section", async () => {
    const { user } = await renderDetails("ENGL101");
    await user.click(screen.getByRole("button", { name: "Add to Plan A" }));
    const added = openPlanNow()?.courses.find(
      (c) => c.courseCode === "ENGL101",
    );
    expect(added?.sectionCode).toBe("0002");
    expect(track).toHaveBeenCalledWith("course_added", { via: "details" });
  });

  it("keeps long section lists compact, with a way back to full rows", async () => {
    const { user } = await renderDetails("ENGL101");
    const toggle = screen.getByRole("button", { name: "Compact rows" });
    expect(toggle).toHaveAttribute("aria-pressed", "true");
    expect(row("0101")).toHaveTextContent("MWF 9am");
    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-pressed", "false");
    expect(row("0101")).toHaveTextContent("MWF 9am–9:50am");
  });

  describe("seat-alert bell", () => {
    it("hides while seat alerts are off", async () => {
      await renderDetails();
      expect(document.querySelector("[data-alert]")).not.toBeNull();
      act(() => useSeatAlerts.getState().setAvailability("unavailable"));
      expect(document.querySelector("[data-alert]")).toBeNull();
    });

    it("rings only on low or full sections, and sends a confirmation", async () => {
      vi.mocked(api.alerts.subscribe).mockResolvedValue({
        status: "check-email",
      });
      const { user } = await renderDetails();
      expect(within(row("0401")).queryByLabelText(/seat opens/)).toBeNull();
      const bell = within(row("0101")).getByRole("button", {
        name: "Get an email when a seat opens",
      });
      expect(bell).toHaveAttribute("data-alert", "none");
      await user.click(bell);
      const email = await screen.findByRole("textbox", { name: "Your email" });
      expect(email).toHaveAttribute("data-private");
      await user.type(email, "terp@umd.edu");
      await user.click(screen.getByRole("button", { name: "Email me" }));
      expect(await screen.findByRole("status")).toHaveTextContent(
        "Check your email. Click the link there to start watching.",
      );
      expect(api.alerts.subscribe).toHaveBeenCalledWith({
        email: "terp@umd.edu",
        termId: TEST_TERM_ID,
        sectionKey: "CMSC351-0101",
      });
      expect(
        within(row("0101")).getByRole("button", {
          name: "Check your email to confirm",
        }),
      ).toHaveAttribute("data-alert", "pending");
    });

    it("shows watching, and says so again when asked twice", async () => {
      const { user } = await renderDetails();
      await act(() =>
        useSeatAlerts.getState().put([
          {
            termId: TEST_TERM_ID,
            sectionKey: "CMSC351-0101",
            email: "terp@umd.edu",
            status: "active",
            subscriptionId: null,
            manageToken: null,
            createdAt: "2026-09-01T00:00:00.000Z",
            updatedAt: "2026-09-01T00:00:00.000Z",
          },
        ]),
      );
      const bell = within(row("0101")).getByRole("button", {
        name: /^Watching CMSC351 0101/,
      });
      expect(bell).toHaveAttribute("data-alert", "watching");
      await user.click(bell);
      expect(
        await screen.findByText(/You're watching this as terp@umd.edu/),
      ).toBeInTheDocument();
    });
  });

  describe("tabs", () => {
    it("Instructors shows ratings and the review summary with its themes", async () => {
      vi.mocked(api.reviewSummary).mockImplementation(async ({ slug }) => ({
        status: "ok",
        summary: aReviewSummary({ slug, basedOnReviewCount: 88 }),
      }));
      await renderDetails();
      const keiko = await findCard("Keiko Ashdown");
      expect(document.querySelectorAll("[data-instructor]")).toHaveLength(2);
      expect(keiko).toHaveTextContent("3.1");
      expect(keiko).toHaveTextContent("In CMSC351: average GPA 3.26");
      await waitFor(() =>
        expect(keiko).toHaveTextContent("Clear, well-paced lectures"),
      );
      expect(within(keiko).getByText("clear lectures")).toBeInTheDocument();
      expect(
        within(keiko).getByRole("link", { name: "read them" }),
      ).toHaveAttribute("href", expect.stringContaining("planetterp.com"));
      expect(track).toHaveBeenCalledWith("review_summary_viewed", {
        state: "shown",
      });
    });

    it("hides the summary when it's unavailable", async () => {
      await renderDetails();
      const keiko = await findCard("Keiko Ashdown");
      await waitFor(() =>
        expect(keiko).toHaveTextContent("142 reviews on PlanetTerp"),
      );
      expect(keiko).not.toHaveTextContent("Summary of");
      expect(track).toHaveBeenCalledWith("review_summary_viewed", {
        state: "unavailable",
      });
    });

    it("Grades shows a sentence and bars", async () => {
      const { user } = await renderDetails();
      await user.click(screen.getByRole("tab", { name: "Grades" }));
      expect(await screen.findByTestId("grade-bars")).toBeInTheDocument();
      expect(screen.getByRole("tabpanel")).toHaveTextContent(/got an A or B/);
      expect(document.querySelectorAll("[data-grade]").length).toBeGreaterThan(
        6,
      );
      expect(track).toHaveBeenCalledWith("course_details_tab", {
        tab: "grades",
      });
      expect(useUi.getState().stack.at(-1)).toMatchObject({ tab: "grades" });
    });

    it("About lists the description, prerequisites and restrictions", async () => {
      const { user } = await renderDetails();
      await user.click(screen.getByRole("tab", { name: "About" }));
      const panel = screen.getByRole("tabpanel");
      expect(panel).toHaveTextContent("A systematic study");
      expect(panel).toHaveTextContent("Prerequisite");
      expect(panel).toHaveTextContent("Minimum grade of C- in CMSC250");
    });
  });

  it("says when a course isn't offered this term", async () => {
    await renderPlanTab([searchPanels, panels], "search");
    act(() => openCourse("ZZZZ999"));
    expect(await screen.findByText(/isn't offered in/)).toBeInTheDocument();
  });
});
