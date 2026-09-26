import { act, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { track } from "~/app/analytics";
import { openCourse } from "~/features/courses/actions";
import { openPlanNow, renderPlanTab } from "~/features/courses/testing";
import { panels as searchPanels } from "~/features/search/panels";
import { aProblem, aReviewSummary } from "~/fixtures";
import { api } from "~/server/fns/api";
import { useCatalog } from "~/state/catalog-store";
import { useSeatAlerts } from "~/state/seat-alerts";
import { TEST_TERM_ID } from "~/state/testing";
import { useUi } from "~/state/ui-store";
import { panels } from "./panels";
import { problemsAbout } from "./sections";
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

async function renderDetails(
  courseCode = "CMSC351",
  tab?: "instructors" | "grades" | "about",
) {
  const view = await renderPlanTab([searchPanels, panels], "search");
  act(() =>
    tab
      ? useUi.getState().drill({ kind: "course", courseCode, tab })
      : openCourse(courseCode),
  );
  await screen.findByTestId("sections");
  return view;
}

const row = (code: string) => {
  const found = document.querySelector<HTMLElement>(`[data-section="${code}"]`);
  if (!found) throw new Error(`No row for section ${code}`);
  return found;
};
const rowCodes = () =>
  [...screen.getByTestId("sections").querySelectorAll("[data-section]")].map(
    (r) => r.getAttribute("data-section"),
  );
const sectionsBar = () =>
  within(screen.getByTestId("sections")).getByText("Sections").parentElement;

const findReviews = (name: string) =>
  waitFor(() => {
    const block = document.querySelector<HTMLElement>(
      `[data-instructor="${name}"]`,
    );
    if (!block) throw new Error(`No reviews for ${name}`);
    return block;
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

  it("says so plainly when Testudo lists no sections", async () => {
    // ANTH358A: an independent-study course with no sections listed.
    await renderPlanTab([searchPanels, panels], "search");
    act(() => openCourse("ANTH358A"));
    expect(
      await screen.findByText(/Testudo lists no sections of ANTH358A/),
    ).toBeVisible();
    expect(screen.queryByTestId("sections")).toBeNull();
    expect(screen.queryByText(/fit$/)).toBeNull();
    // Nothing on the calendar to pick from, and no keys that do nothing.
    expect(
      screen.getByText(/has no sections listed this term/),
    ).toHaveTextContent("ANTH358A has no sections listed this term.");
    expect(screen.queryByText("preview")).toBeNull();
  });

  describe("header", () => {
    it("heads with the code, credits and title, then the prerequisite, before any section", async () => {
      await renderDetails();
      expect(screen.getByRole("heading", { name: "Algorithms" })).toBeVisible();
      expect(screen.getByText("3 credits")).toBeInTheDocument();
      const prereq = screen.getByText("Prerequisite").parentElement;
      expect(prereq).toHaveTextContent(
        "Prerequisite Minimum grade of C- in CMSC250 and CMSC216.",
      );
      expect(
        (prereq as HTMLElement).compareDocumentPosition(
          screen.getByTestId("sections"),
        ) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
      expect(
        screen.getByRole("button", { name: "Remove from Plan A" }),
      ).toBeInTheDocument();
    });

    it("clamps the description, and opens the rest of About in place", async () => {
      const { user } = await renderDetails();
      expect(screen.queryByTestId("about-course")).toBeNull();
      await user.click(
        screen.getByRole("button", { name: "More about this course" }),
      );
      const about = screen.getByTestId("about-course");
      expect(about).toHaveTextContent("A systematic study");
      expect(about).toHaveTextContent("Grading");
      expect(track).toHaveBeenCalledWith("course_details_tab", {
        tab: "about",
      });
      await user.click(
        screen.getByRole("button", { name: "Less about this course" }),
      );
      expect(screen.queryByTestId("about-course")).toBeNull();
    });

    it("has no tabs", async () => {
      await renderDetails();
      const sidebar = screen.getByRole("complementary", { name: "Sidebar" });
      expect(within(sidebar).queryByRole("tab")).toBeNull();
      expect(within(sidebar).queryByRole("tablist")).toBeNull();
    });
  });

  describe("a few sections", () => {
    it("says how many fit in the sticky Sections bar, and groups by instructor in section order", async () => {
      await renderDetails();
      expect(sectionsBar()).toHaveTextContent("Sections1 of 4 fit");
      expect(screen.queryByRole("button", { name: "Only fits" })).toBeNull();
      expect(screen.getByText(/^Seats as of/)).toBeInTheDocument();
      const headers = within(screen.getByTestId("sections")).getAllByRole(
        "button",
        { expanded: true, name: /^(Jada|Keiko)/ },
      );
      expect(headers.map((h) => h.textContent)).toEqual([
        expect.stringMatching(/^Jada Abernathy4\.6\(88\)$/),
        expect.stringMatching(/^Keiko Ashdown3\.1\(142\) · GPA 3\.26$/),
      ]);
      expect(rowCodes()).toEqual(["0101", "0201", "0301", "0401"]);
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

    it("labels each section's fit in words; the current one just says Current", async () => {
      await renderDetails();
      expect(row("0101")).toHaveTextContent("Overlaps STAT400");
      expect(row("0101")).toHaveTextContent("Full");
      expect(row("0201")).toHaveTextContent("Overlaps Work");
      expect(row("0301")).toHaveTextContent("Current");
      expect(row("0301")).not.toHaveTextContent("In your plan");
      expect(row("0301")).toHaveAttribute("aria-current", "true");
      expect(row("0401")).toHaveTextContent("Overlaps CMSC330");
    });

    it("says a shared lecture once, and each row shows its own discussion", async () => {
      await renderDetails("CMSC330");
      const sections = screen.getByTestId("sections");
      expect(
        within(sections)
          .getAllByText(/^All meet/)
          .map((l) => l.textContent),
      ).toEqual([
        "All meet TuTh 9:30–10:45am IRB 0324",
        "All meet TuTh 2–3:15pm CSI 1115",
        "All meet TuTh 3:30–4:45pm IRB 0324",
      ]);
      expect(row("0101")).toHaveTextContent("F 9–9:50am CSI 1122");
      expect(row("0101")).not.toHaveTextContent("TuTh");
      expect(row("0101")).not.toHaveTextContent("discussion");
      // 14 sections: enough to offer "Only fits".
      expect(
        screen.getByRole("button", { name: "Only fits" }),
      ).toBeInTheDocument();
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
  });

  describe("one section", () => {
    it("reads as the class: meets, taught by, fit and seats, with no list", async () => {
      await renderDetails("CMSC401");
      const one = screen.getByTestId("sections");
      expect(one).toHaveTextContent("One section0101");
      expect(one).toHaveTextContent("MeetsTuTh 12:30–1:45pm ESJ 1309");
      expect(one).toHaveTextContent("Taught byXavier Beaumont");
      expect(one).toHaveTextContent("FitFits");
      expect(one).toHaveTextContent("29 of 33 open");
      expect(within(one).queryByRole("button", { name: "Add" })).toBeNull();
      expect(
        within(one).queryByRole("button", { name: "Only fits" }),
      ).toBeNull();
    });

    it("says it's in your plan in words once added", async () => {
      const { user } = await renderDetails("CMSC401");
      await user.click(screen.getByRole("button", { name: "Add to Plan A" }));
      expect(track).toHaveBeenCalledWith("course_added", { via: "details" });
      await waitFor(() =>
        expect(screen.getByTestId("sections")).toHaveTextContent(
          "FitIn your plan, with no problems",
        ),
      );
    });

    it("finds the problems that are about a section", () => {
      const tight = aProblem({
        id: "travel:x",
        subjects: [
          {
            kind: "connection",
            connectionId: "Tu:CMSC330-0101#0>CMSC401-0101#0",
          },
        ],
      });
      const other = aProblem({
        id: "other",
        subjects: [{ kind: "course", courseCode: "STAT400" }],
      });
      expect(problemsAbout([tight, other], "CMSC401", "CMSC401-0101")).toEqual([
        tight,
      ]);
    });
  });

  describe("many sections", () => {
    it("groups one instructor's many sections by time, one line each", async () => {
      await renderDetails("ENGL101");
      expect(sectionsBar()).toHaveTextContent(/\d+ of 92 fit/);
      expect(
        screen.getByText(
          "Testudo hasn't named instructors for these sections yet.",
        ),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: /^MWF 9–9:50am/ }),
      ).toHaveAttribute("aria-expanded", "true");
      // The header says when; rows say where.
      expect(row("0101")).toHaveTextContent(/^0101TWS \d+/);
      expect(row("0101")).toHaveTextContent("Fits");
      expect(screen.queryByTestId("your-section")).toBeNull();
    });

    it("pins your section at the top", async () => {
      const { user } = await renderDetails("ENGL101");
      await user.click(screen.getByRole("button", { name: "Add to Plan A" }));
      const pinned = await screen.findByTestId("your-section");
      expect(
        pinned
          .querySelector("[data-pinned-section]")
          ?.getAttribute("data-pinned-section"),
      ).toBe("0002");
      expect(pinned).toHaveTextContent("Current");
      expect(pinned).toHaveTextContent("MWF 8–8:50am");
    });

    it("Only fits hides what doesn't fit", async () => {
      const { user } = await renderDetails("ENGL101");
      const before = rowCodes().length;
      await user.click(screen.getByRole("button", { name: "Only fits" }));
      expect(screen.getByRole("button", { name: "Only fits" })).toHaveAttribute(
        "aria-pressed",
        "true",
      );
      expect(rowCodes().length).toBeLessThan(before);
      expect(rowCodes()).toContain("0101");
      expect(document.querySelector('[data-section="0202"]')).toBeNull();
    });
  });

  it("Only fits keeps the plan's own section, even when it doesn't fit", async () => {
    const { user } = await renderDetails("CMSC330");
    await user.click(screen.getByRole("button", { name: "Only fits" }));
    // 0 of 14 fit: the plan's 0103 is all that's left, in its group.
    expect(rowCodes()).toEqual(["0103"]);
    expect(screen.queryByText(/fits your plan\.$/)).toBeNull();
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

  describe("reviews", () => {
    it("open under the instructor's header, asked for only then, without repeating the rating", async () => {
      vi.mocked(api.reviewSummary).mockImplementation(async ({ slug }) => ({
        status: "ok",
        summary: aReviewSummary({ slug, basedOnReviewCount: 88 }),
      }));
      const { user } = await renderDetails();
      expect(api.reviewSummary).not.toHaveBeenCalled();
      const header = screen
        .getByRole("button", { name: /^Keiko Ashdown/ })
        .closest("div.sticky") as HTMLElement;
      await user.click(within(header).getByRole("button", { name: "Reviews" }));
      const keiko = await findReviews("Keiko Ashdown");
      await waitFor(() =>
        expect(keiko).toHaveTextContent("Clear, well-paced lectures"),
      );
      expect(api.reviewSummary).toHaveBeenCalledTimes(1);
      expect(keiko).not.toHaveTextContent("3.1");
      expect(keiko).not.toHaveTextContent("GPA");
      expect(within(keiko).getByText("clear lectures")).toBeInTheDocument();
      expect(
        within(keiko).getByRole("link", { name: "read them" }),
      ).toHaveAttribute("href", expect.stringContaining("planetterp.com"));
      expect(track).toHaveBeenCalledWith("review_summary_viewed", {
        state: "shown",
      });
      expect(track).toHaveBeenCalledWith("course_details_tab", {
        tab: "instructors",
      });
    });

    it("fall back to the review count when there's no summary", async () => {
      await renderDetails("CMSC351", "instructors");
      // A deep link to "instructors" opens the first instructor's reviews.
      const jada = await findReviews("Jada Abernathy");
      await waitFor(() =>
        expect(jada).toHaveTextContent("88 reviews on PlanetTerp"),
      );
      expect(jada).not.toHaveTextContent("Summary of");
    });

    it("say quietly when PlanetTerp has stopped updating", async () => {
      await renderDetails("CMSC351", "instructors");
      const jada = await findReviews("Jada Abernathy");
      await waitFor(() =>
        expect(within(jada).getByTestId("pt-freshness")).toHaveTextContent(
          "No new PlanetTerp reviews since May 2026",
        ),
      );
      // A plain line, not an alert or a banner (DESIGN §5).
      expect(within(jada).queryByRole("alert")).toBeNull();
      expect(within(jada).getByTestId("pt-freshness")).toHaveClass(
        "text-faint",
      );
    });

    it("say the file didn't load, rather than that PlanetTerp has nothing", async () => {
      await renderDetails("CMSC351", "instructors");
      await findReviews("Jada Abernathy");
      act(() =>
        useCatalog.setState((s) => ({
          instructors: {},
          instructorsState: { ...s.instructorsState, CMSC: "error" },
        })),
      );
      const jada = await findReviews("Jada Abernathy");
      expect(jada).toHaveTextContent("Couldn't load reviews from PlanetTerp");
      expect(jada).not.toHaveTextContent("nothing on this instructor");
      expect(screen.getByTestId("grades")).toHaveTextContent(
        "Couldn't load grades from PlanetTerp",
      );
    });
  });

  describe("grades", () => {
    it("come last, one click from the Sections bar", async () => {
      const scrolled = vi.fn();
      Element.prototype.scrollIntoView = scrolled;
      const { user } = await renderDetails();
      const grades = screen.getByTestId("grades");
      expect(
        screen.getByTestId("sections").compareDocumentPosition(grades) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
      expect(await within(grades).findByTestId("grade-bars")).toBeVisible();
      expect(grades).toHaveTextContent(/got an A or B/);
      // Honest about coverage: PlanetTerp's grades stop at a semester.
      expect(
        within(grades).getByText("through Spring 2025, from PlanetTerp"),
      ).toBeInTheDocument();
      expect(grades).not.toHaveTextContent("every past semester");
      await user.click(screen.getByRole("button", { name: "Grades ↓" }));
      expect(scrolled).toHaveBeenCalled();
      expect(track).toHaveBeenCalledWith("course_details_tab", {
        tab: "grades",
      });
    });
  });

  it("says when a course isn't offered this term", async () => {
    await renderPlanTab([searchPanels, panels], "search");
    act(() => openCourse("ZZZZ999"));
    expect(await screen.findByText(/isn't offered in/)).toBeInTheDocument();
  });

  it("says a course isn't offered once its department loads, before the rest", async () => {
    await renderPlanTab([searchPanels, panels], "search");
    // A seat-alert link to a cancelled course: waiting on every department
    // left a skeleton for ~10 seconds on production.
    act(() =>
      useCatalog.setState((s) => {
        const t = s.byTerm[TEST_TERM_ID];
        if (!t) throw new Error("term not loaded");
        return {
          byTerm: { ...s.byTerm, [TEST_TERM_ID]: { ...t, complete: false } },
        };
      }),
    );
    const sidebar = screen.getByRole("complementary", { name: "Sidebar" });
    // Its department has loaded.
    act(() => openCourse("CMSC999"));
    await waitFor(() =>
      expect(sidebar).toHaveTextContent("CMSC999 isn't offered in"),
    );
    // The term has no such department.
    act(() => openCourse("ZZZZ999"));
    await waitFor(() =>
      expect(sidebar).toHaveTextContent("ZZZZ999 isn't offered in"),
    );
  });

  it("counts the placed section the same way in the bar and its group", async () => {
    // Production read "12 of 12 fit" over "3 of 4 fit" after adding MATH140.
    await renderDetails("CMSC351");
    const [bar, ...groups] = within(screen.getByTestId("sections"))
      .getAllByText(/^\d+ of \d+ fit$/)
      .map((el) => Number(el.textContent?.split(" ")[0]));
    expect(groups.reduce((a, b) => a + b, 0)).toBe(bar);
  });

  it("counts sections with no set times as fitting, in the bar and in each group", async () => {
    // IDEA201's four sections are all online with no set times.
    await renderDetails("IDEA201");
    expect(sectionsBar()).toHaveTextContent("Sections4 of 4 fit");
    const counts = within(screen.getByTestId("sections"))
      .getAllByText(/^\d+ of \d+ fit$/)
      .map((el) => el.textContent);
    // The bar, then Priya Brandt, Elena Yamada and Zane Quintero's groups.
    expect(counts).toEqual([
      "4 of 4 fit",
      "1 of 1 fit",
      "1 of 1 fit",
      "2 of 2 fit",
    ]);
  });
});
