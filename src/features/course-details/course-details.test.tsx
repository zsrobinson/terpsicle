import { act, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  fakeSeatWatchesClient,
  resetSeatWatches,
  seatAlertsAccount,
  watching,
} from "~/features/alerts/testing";
import { FLAGS_OFF, useAccount } from "~/features/auth/account-store";
import { openCourse } from "~/features/courses/actions";
import { openPlanNow, renderPlanTab } from "~/features/courses/testing";
import { forgetReads } from "~/features/notifications/read-here";
import { openDrill } from "~/features/schedule/schedule-nav";
import { renderShell, type ShellRoutes } from "~/features/schedule/test-utils";
import { SearchPanel } from "~/features/search/search-panel";
import {
  aMeUser,
  aPlanetTerpReview,
  aSeatWatch,
  mockDataSource,
} from "~/fixtures";
import { track } from "~/lib/analytics";
import { api } from "~/server/fns/api";
import { notificationsApi } from "~/server/fns/notifications";
import { useCatalog } from "~/state/catalog-store";
import {
  createBucketDataSource,
  DataError,
  type DataSource,
} from "~/state/data-source";
import { connectPublished } from "~/state/query/published";
import { TEST_TERM_ID } from "~/state/testing";
import { useUi } from "~/state/ui-store";
import { CourseDetails } from "./course-details";

const panels: ShellRoutes = { drills: { course: CourseDetails } };
const searchPanels: ShellRoutes = { tabs: { search: SearchPanel } };

vi.mock("~/lib/analytics", () => ({ track: vi.fn() }));
vi.mock("~/server/fns/notifications", () => ({
  notificationsApi: { read: vi.fn(async () => ({ unread: 0 })) },
}));
vi.mock("~/server/fns/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("~/server/fns/api")>();
  return {
    ...actual,
    api: {
      ...actual.api,
      reviews: { ...actual.api.reviews, page: vi.fn() },
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
      ? openDrill({ kind: "course", courseCode, tab })
      : openCourse(courseCode),
  );
  await screen.findByTestId("sections");
  // PlanetTerp's file is in once the course's grades show, or say
  // PlanetTerp has none.
  await within(screen.getByTestId("grades")).findByText(
    /got an A or B|PlanetTerp has no grades/,
    {},
    { timeout: 5_000 },
  );
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

/** The toast that says `text`, to press its own Undo. */
const toastSaying = async (text: string) => {
  const found = (await screen.findByText(text)).closest<HTMLElement>(
    "[data-sonner-toast]",
  );
  if (!found) throw new Error(`No toast says ${text}`);
  return found;
};

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
    vi.mocked(api.reviews.page).mockReset();
    vi.mocked(api.reviews.page).mockResolvedValue({
      terpsicle: null,
      planetTerp: [],
      next: null,
    });
    resetSeatWatches();
    seatAlertsAccount(aMeUser());
    fakeSeatWatchesClient();
    forgetReads();
    vi.mocked(notificationsApi.read).mockClear();
  });

  it("reads the course's seat openings while it's open, signed in only (V2.md §6.7)", async () => {
    await renderDetails("CMSC351");
    await waitFor(() =>
      expect(notificationsApi.read).toHaveBeenCalledWith({
        course: { termId: TEST_TERM_ID, courseCode: "CMSC351" },
      }),
    );
    expect(notificationsApi.read).toHaveBeenCalledTimes(1);
  });

  it("reads nothing signed out", async () => {
    seatAlertsAccount(null);
    await renderDetails("CMSC351");
    expect(notificationsApi.read).not.toHaveBeenCalled();
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
      // "★ 4.6 (88)" on screen, said in words.
      expect(headers[0]).toHaveTextContent(/4\.6\(88\)$/);
      expect(headers[0]).toHaveAccessibleName(
        /^Jada Abernathy ?rated 4\.6 of 5, 88 reviews$/,
      );
      expect(headers[1]).toHaveTextContent(/3\.1\(142\) · GPA 3\.26$/);
      expect(headers[1]).toHaveAccessibleName(
        /^Keiko Ashdown ?rated 3\.1 of 5, 142 reviews GPA 3\.26$/,
      );
      expect(rowCodes()).toEqual(["0101", "0201", "0301", "0401"]);
    });

    it("combines PlanetTerp's rating with Terpsicle's once Reviews is readable", async () => {
      connectPublished(createBucketDataSource(mockDataSource));
      useAccount.setState({ flags: { ...FLAGS_OFF, reviews: "read" } });
      try {
        const { user } = await renderDetails();
        // The row on screen now: it re-renders as Terpsicle's numbers land.
        const jada = () =>
          within(screen.getByTestId("sections")).getByRole("button", {
            expanded: true,
            name: /^Jada/,
          });
        // 88 on PlanetTerp at 4.6, and the mock's 9 on Terpsicle at 3.33.
        await waitFor(() => expect(jada()).toHaveTextContent(/4\.5\(97\)$/));
        expect(jada()).toHaveAccessibleName(
          /^Jada Abernathy ?rated 4\.5 of 5, 97 reviews$/,
        );
        // The rating re-renders as the numbers settle, so hover the one on
        // screen now, and again if a newer one replaced it.
        await waitFor(async () => {
          const rating = within(
            within(screen.getByTestId("sections")).getByRole("button", {
              expanded: true,
              name: /^Jada/,
            }),
          ).getByText("4.5");
          await user.hover(rating);
          expect(
            screen.getByRole("tooltip", {
              name: "4.5 from 97 reviews: 4.6 from 88 on PlanetTerp, 3.3 from 9 on Terpsicle",
            }),
          ).toBeInTheDocument();
        });
      } finally {
        useAccount.setState({ flags: FLAGS_OFF });
        connectPublished(null);
      }
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

    it("labels each section's fit in words; the plan's own says it's in the plan", async () => {
      await renderDetails();
      expect(row("0101")).toHaveTextContent("Overlaps STAT400");
      expect(row("0101")).toHaveTextContent("Full");
      expect(row("0201")).toHaveTextContent("Overlaps Work");
      expect(row("0301")).toHaveTextContent("In Plan A");
      expect(row("0301")).toHaveAttribute("aria-current", "true");
      expect(row("0401")).toHaveTextContent("Overlaps CMSC330");
    });

    it("gives every row one icon button: add, switch, or take the plan's own back out", async () => {
      const { user } = await renderDetails();
      expect(
        within(row("0401")).getByRole("button", { name: "Switch to 0401" }),
      ).toHaveAttribute("data-row-action", "switch");
      const own = within(row("0301")).getByRole("button", {
        name: "Remove 0301 from Plan A",
      });
      expect(own).toHaveAttribute("data-row-action", "remove");
      await user.click(own);
      expect(
        openPlanNow()?.courses.some((c) => c.courseCode === "CMSC351"),
      ).toBe(false);
      expect(
        await within(row("0301")).findByRole("button", { name: "Add 0301" }),
      ).toHaveAttribute("data-row-action", "add");
    });

    it("shows every meeting on its section's row, labelled, with no shared line", async () => {
      await renderDetails("CMSC330");
      const sections = screen.getByTestId("sections");
      expect(within(sections).queryByText(/^All meet/)).toBeNull();
      expect(row("0101")).toHaveTextContent(
        /LecTuTh 9:30–10:45amIRB 0324\s*DisF 9–9:50amCSI 1122/,
      );
      // One level of grouping: professors, and no lecture layer under them.
      expect(
        within(sections).getAllByRole("button", { expanded: true }).length,
      ).toBe(2);
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

    it("scrolls a row into view for the calendar's keys, not for the pointer on it", async () => {
      const { user } = await renderDetails();
      const original = Element.prototype.scrollIntoView;
      const scrolled = vi.fn();
      Element.prototype.scrollIntoView = scrolled;
      try {
        // Under the pointer the row is already in view, and a scroll call
        // here would stop a smooth scroll running under it ("Grades ↓").
        await user.hover(row("0401"));
        expect(useUi.getState().previewSection).toBe("CMSC351-0401");
        expect(scrolled).not.toHaveBeenCalled();
        await user.unhover(row("0401"));
        // ↑/↓ on the calendar preview a row the list may have scrolled past.
        act(() => useUi.getState().setPreviewSection("CMSC351-0401"));
        expect(scrolled).toHaveBeenCalledTimes(1);
        expect(scrolled.mock.contexts[0]).toBe(row("0401"));
      } finally {
        Element.prototype.scrollIntoView = original;
      }
    });

    it("switches to a section from the list", async () => {
      const { user } = await renderDetails();
      await user.click(
        within(row("0401")).getByRole("button", { name: "Switch to 0401" }),
      );
      expect(
        openPlanNow()?.courses.find((c) => c.courseCode === "CMSC351")
          ?.sectionCode,
      ).toBe("0401");
      await waitFor(() => expect(row("0401")).toHaveTextContent("In Plan A"));
    });
  });

  describe("one section", () => {
    it("reads like any other course: one row with its meetings, fit, seats and a plus", async () => {
      await renderDetails("CMSC401");
      const one = screen.getByTestId("sections");
      expect(sectionsBar()).toHaveTextContent("Sections1 of 1 fit");
      // One professor: no group header, just who teaches.
      expect(within(one).queryByRole("button", { expanded: true })).toBeNull();
      expect(one).toHaveTextContent("Xavier Beaumont");
      expect(rowCodes()).toEqual(["0101"]);
      expect(row("0101")).toHaveTextContent(/LecTuTh 12:30–1:45pmESJ 1309/);
      expect(row("0101")).toHaveTextContent("Fits");
      expect(row("0101")).toHaveTextContent("29 of 33 open");
      expect(
        within(one).queryByRole("button", { name: "Only fits" }),
      ).toBeNull();
      expect(
        within(row("0101")).getByRole("button", { name: "Add 0101" }),
      ).toBeInTheDocument();
    });

    it("adds its section from the row, and says it's in the plan", async () => {
      const { user } = await renderDetails("CMSC401");
      await user.click(
        within(row("0101")).getByRole("button", { name: "Add 0101" }),
      );
      expect(track).toHaveBeenCalledWith("course_added", { via: "details" });
      await waitFor(() => expect(row("0101")).toHaveTextContent("In Plan A"));
      expect(
        within(row("0101")).getByRole("button", {
          name: "Remove 0101 from Plan A",
        }),
      ).toBeInTheDocument();
    });
  });

  describe("bookmarks", () => {
    it("bookmarks a course from the header, and picks a section from a row", async () => {
      const { user } = await renderDetails("CMSC401");
      expect(
        screen.queryByRole("button", { name: /^Add to Plan A/ }),
      ).toBeNull();
      await user.click(screen.getByRole("button", { name: "Bookmark" }));
      expect(
        openPlanNow()?.courses.find((c) => c.courseCode === "CMSC401"),
      ).toMatchObject({ sectionCode: null });
      const bookmarked = await screen.findByRole("button", {
        name: "Bookmarked",
      });
      expect(bookmarked).toHaveAttribute("aria-pressed", "true");
      await user.click(
        within(row("0101")).getByRole("button", { name: "Add 0101" }),
      );
      expect(
        openPlanNow()?.courses.find((c) => c.courseCode === "CMSC401")
          ?.sectionCode,
      ).toBe("0101");
    });

    it("takes a placed course off the calendar and keeps it bookmarked", async () => {
      const { user } = await renderDetails();
      await user.click(
        screen.getByRole("button", { name: "Bookmark instead" }),
      );
      expect(
        openPlanNow()?.courses.find((c) => c.courseCode === "CMSC351"),
      ).toMatchObject({ sectionCode: null });
      expect(
        await screen.findByRole("button", { name: "Bookmarked" }),
      ).toBeInTheDocument();
    });
  });

  describe("full sections", () => {
    it("can be added like any other, and watched for a seat from the row", async () => {
      const { user } = await renderDetails();
      // CMSC351 0101 is full.
      expect(row("0101")).toHaveTextContent("Full");
      await user.click(
        within(row("0101")).getByRole("button", { name: "Switch to 0101" }),
      );
      expect(
        openPlanNow()?.courses.find((c) => c.courseCode === "CMSC351")
          ?.sectionCode,
      ).toBe("0101");
      expect(
        within(row("0101")).getByRole("button", {
          name: "Watch for a seat: we'll let you know when one opens, CMSC351 0101",
        }),
      ).toBeInTheDocument();
    });
  });

  describe("many sections", () => {
    it("lists many TBA sections as one list, with every meeting on each row", async () => {
      await renderDetails("ENGL101");
      expect(sectionsBar()).toHaveTextContent(/\d+ of 92 fit/);
      expect(
        screen.getByText(
          "Testudo hasn't named a professor for these sections yet.",
        ),
      ).toBeInTheDocument();
      // No grouping by time, and no group header.
      expect(
        within(screen.getByTestId("sections")).queryByRole("button", {
          expanded: true,
        }),
      ).toBeNull();
      expect(row("0101")).toHaveTextContent(
        /^0101Lec\S+ [\d:–]+[ap]m[A-Z]+ \d+/,
      );
      expect(row("0101")).toHaveTextContent("Fits");
      expect(rowCodes()).toEqual([...rowCodes()].sort());
      expect(screen.queryByTestId("your-section")).toBeNull();
    });

    it("pins your section at the top", async () => {
      const { user } = await renderDetails("ENGL101");
      const when = row("0101").textContent?.match(/^0101Lec(\S+ \S+)/)?.[1];
      await user.click(
        within(row("0101")).getByRole("button", { name: "Add 0101" }),
      );
      const pinned = await screen.findByTestId("your-section");
      expect(
        pinned
          .querySelector("[data-pinned-section]")
          ?.getAttribute("data-pinned-section"),
      ).toBe("0101");
      expect(pinned).toHaveTextContent("In Plan A");
      expect(pinned).toHaveTextContent(when ?? "no time");
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

  describe("seat-watch bell", () => {
    it("hides while seat alerts are off", async () => {
      await renderDetails();
      expect(document.querySelector("[data-alert]")).not.toBeNull();
      act(() => resetSeatWatches());
      expect(document.querySelector("[data-alert]")).toBeNull();
    });

    it("rings only on low or full sections; one click watches, with Undo", async () => {
      const client = fakeSeatWatchesClient();
      const { user } = await renderDetails();
      expect(within(row("0401")).queryByLabelText(/seat opens/)).toBeNull();
      const bell = within(row("0101")).getByRole("button", {
        name: "Watch for a seat: we'll let you know when one opens, CMSC351 0101",
      });
      expect(bell).toHaveAttribute("data-alert", "none");
      await user.click(bell);
      expect(client.watch).toHaveBeenCalledWith({
        termId: TEST_TERM_ID,
        sectionKey: "CMSC351-0101",
      });
      const on = await within(row("0101")).findByRole("button", {
        name: /^Watching CMSC351 0101/,
      });
      expect(on).toHaveAttribute("data-alert", "watching");
      expect(on).toHaveAttribute("aria-pressed", "true");
      expect(row("0101")).toHaveTextContent("Watching");
      const shown = await toastSaying("Watching CMSC351 0101");
      expect(shown).toHaveTextContent("We'll let you know when a seat opens.");
      expect(track).toHaveBeenCalledWith("seat_watch_started", {
        signedInFirst: false,
      });

      // Undo in the toast stops it again.
      await user.click(within(shown).getByRole("button", { name: "Undo" }));
      await waitFor(() =>
        expect(client.unwatch).toHaveBeenCalledWith({
          termId: TEST_TERM_ID,
          sectionKey: "CMSC351-0101",
        }),
      );
      expect(
        await within(row("0101")).findByRole("button", {
          name: /^Watch for a seat/,
        }),
      ).toHaveAttribute("data-alert", "none");
    });

    it("shows watching, and one click stops it, with Undo", async () => {
      const client = fakeSeatWatchesClient([aSeatWatch()]);
      const { user } = await renderDetails();
      act(() => watching(aMeUser(), aSeatWatch()));
      const bell = within(row("0101")).getByRole("button", {
        name: /^Watching CMSC351 0101/,
      });
      expect(bell).toHaveAttribute("data-alert", "watching");
      await user.click(bell);
      expect(client.unwatch).toHaveBeenCalled();
      const stopped = await toastSaying("Stopped watching CMSC351 0101");
      await user.click(within(stopped).getByRole("button", { name: "Undo" }));
      expect(
        await within(row("0101")).findByRole("button", {
          name: /^Watching CMSC351 0101/,
        }),
      ).toBeInTheDocument();
    });

    it("signed out, offers sign-in and remembers the section for after", async () => {
      seatAlertsAccount(null);
      const client = fakeSeatWatchesClient();
      const { user } = await renderDetails();
      await user.click(
        within(row("0101")).getByRole("button", {
          name: /^Watch for a seat.*CMSC351 0101$/,
        }),
      );
      expect(
        await screen.findByText("Sign in to watch for a seat.", {
          exact: false,
        }),
      ).toBeVisible();
      const signIn = screen.getByRole("link", { name: /Sign in/ });
      expect(signIn.getAttribute("href")).toMatch(
        /^\/api\/auth\/google\?return=/,
      );
      signIn.addEventListener("click", (e) => e.preventDefault());
      await user.click(signIn);
      expect(
        JSON.parse(sessionStorage.getItem("terpsicle:pending-watch") ?? "{}"),
      ).toMatchObject({
        termId: TEST_TERM_ID,
        sectionKey: "CMSC351-0101",
      });
      expect(client.watch).not.toHaveBeenCalled();
    });
  });

  describe("reviews", () => {
    it("open a preview over the list, with Reviews' mark, asked for only then", async () => {
      vi.mocked(api.reviews.page).mockResolvedValue({
        terpsicle: null,
        planetTerp: [
          aPlanetTerpReview({
            id: "0123456789abcdef",
            instructorId: "ashdown_keiko",
            body: "The problem sets were long, and the exams followed them closely.",
            createdMonth: "2026-04",
            rating: 4,
          }),
        ],
        next: null,
      });
      const { user } = await renderDetails();
      expect(api.reviews.page).not.toHaveBeenCalled();
      const header = screen
        .getByRole("button", { name: /^Keiko Ashdown/ })
        .closest("div.sticky") as HTMLElement;
      const button = within(header).getByRole("button", { name: "Reviews" });
      // Reviews' mark, as every product's part inside another wears.
      expect(button.querySelector('[data-mark="reviews"]')).not.toBeNull();
      await user.click(button);
      const keiko = await findReviews("Keiko Ashdown");
      await waitFor(() =>
        expect(keiko).toHaveTextContent(
          "The problem sets were long, and the exams followed them closely.",
        ),
      );
      // Their name, so the server can fetch reviews its job hasn't stored.
      expect(api.reviews.page).toHaveBeenCalledWith({
        instructorId: "ashdown_keiko",
        course: "CMSC351",
        planetTerpName: "Keiko Ashdown",
      });
      expect(keiko).toHaveTextContent("3.1");
      expect(keiko).toHaveTextContent(/In CMSC351, \d+% got an A or B/);
      expect(
        within(keiko).getByRole("img", { name: "4 of 5 stars" }),
      ).toBeVisible();
      expect(
        within(keiko).getByRole("link", { name: "Read them on PlanetTerp" }),
      ).toHaveAttribute("href", expect.stringContaining("planetterp.com"));
      expect(track).toHaveBeenCalledWith("course_details_tab", {
        tab: "instructors",
      });
      // Nothing students see is marked as a model's.
      expect(document.querySelector(".lucide-sparkles")).toBeNull();
    });

    it("link to Terpsicle Reviews once it's open here", async () => {
      useAccount.setState({ flags: { ...FLAGS_OFF, reviews: "read" } });
      try {
        await renderDetails("CMSC351", "instructors");
        const jada = await findReviews("Jada Abernathy");
        await waitFor(() =>
          expect(
            within(jada).getByRole("link", { name: "View reviews" }),
          ).toHaveAttribute("href", "/reviews/abernathy-jada?course=CMSC351"),
        );
        expect(
          within(jada).queryByRole("link", { name: "Read them on PlanetTerp" }),
        ).toBeNull();
        // A View link on its own line, so it can't read as PlanetTerp's
        // (QA S3), and it counts as a cross-link.
        const link = within(jada).getByRole("link", { name: "View reviews" });
        expect(link.closest("p")).toHaveTextContent(/^View reviews$/);
        link.addEventListener("click", (e) => e.preventDefault());
        link.click();
        expect(track).toHaveBeenCalledWith("cross_link_clicked", {
          from: "schedule",
          to: "reviews",
        });
      } finally {
        useAccount.setState({ flags: FLAGS_OFF });
      }
    });

    it("say how many reviews PlanetTerp has when none are about the course", async () => {
      await renderDetails("CMSC351", "instructors");
      // A link to "instructors" opens the first instructor's reviews.
      const jada = await findReviews("Jada Abernathy");
      await waitFor(() =>
        expect(jada).toHaveTextContent("88 reviews on PlanetTerp"),
      );
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
      const { user, queryClient } = await renderDetails(
        "CMSC351",
        "instructors",
      );
      await findReviews("Jada Abernathy");
      // CMSC's PlanetTerp file, out of reach: the connection dropped.
      const bucket = createBucketDataSource(mockDataSource);
      let down = true;
      const reads: string[] = [];
      act(() =>
        connectPublished({
          ...bucket,
          readJson: async (key, options) => {
            if (key.startsWith("planetterp/dept/CMSC.")) {
              reads.push(key);
              if (down) throw new DataError(key, "network", "offline");
            }
            return bucket.readJson(key, options);
          },
        }),
      );
      await act(() =>
        queryClient.resetQueries({
          predicate: (q) =>
            String(q.queryKey[2]).startsWith("planetterp/dept/CMSC."),
        }),
      );
      const jada = await findReviews("Jada Abernathy");
      await waitFor(() =>
        expect(jada).toHaveTextContent("Couldn't load reviews from PlanetTerp"),
      );
      expect(jada).not.toHaveTextContent("nothing on this instructor");
      expect(screen.getByTestId("grades")).toHaveTextContent(
        "Couldn't load grades from PlanetTerp",
      );
      // Try again asks for the department's file again, in place.
      down = false;
      const before = reads.length;
      await user.click(within(jada).getByRole("button", { name: "Try again" }));
      await waitFor(() =>
        expect(jada).not.toHaveTextContent("Couldn't load reviews"),
      );
      expect(reads.length).toBeGreaterThan(before);
    });

    it("offer Reload when PlanetTerp's file is in a newer format than this tab reads", async () => {
      const { queryClient } = await renderDetails("CMSC351", "instructors");
      await findReviews("Jada Abernathy");
      const bucket = createBucketDataSource(mockDataSource);
      act(() =>
        connectPublished({
          ...bucket,
          readJson: async (key, options) => {
            const raw = await bucket.readJson(key, options);
            return key.startsWith("planetterp/dept/CMSC.")
              ? { ...(raw as object), schemaVersion: 99 }
              : raw;
          },
        }),
      );
      await act(() =>
        queryClient.resetQueries({
          predicate: (q) =>
            String(q.queryKey[2]).startsWith("planetterp/dept/CMSC."),
        }),
      );
      const jada = await findReviews("Jada Abernathy");
      await waitFor(() =>
        expect(jada).toHaveTextContent(
          "Terpsicle has been updated since this page opened. Reload to see PlanetTerp's reviews.",
        ),
      );
      expect(
        within(jada).getByRole("button", { name: "Reload" }),
      ).toBeVisible();
      expect(
        within(jada).queryByRole("button", { name: "Try again" }),
      ).toBeNull();
      expect(screen.getByTestId("grades")).toHaveTextContent(
        "Reload to see PlanetTerp's grades.",
      );
      // The scheduler's catalog signal: the page reloads when next shown.
      expect(useCatalog.getState().appStale).toBe(true);
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

  it("shows a course as soon as its department loads, while the rest of the term waits", async () => {
    const { queryClient } = await renderShell({
      routes: [searchPanels, panels],
    });
    // Every other department's file waits until the course is on screen.
    const bucket = createBucketDataSource(mockDataSource);
    let release = () => {};
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const source: DataSource = {
      ...bucket,
      readJson: async (key, options) => {
        if (key.includes("/dept/") && !key.includes("/dept/CMSC.")) await held;
        return bucket.readJson(key, options);
      },
    };
    await act(async () => {
      // A new page: nothing loaded yet.
      queryClient.clear();
      useCatalog.getState().connect(queryClient, source);
      await useCatalog.getState().loadTerms();
    });
    act(() => openCourse("CMSC351"));

    await screen.findByTestId("sections");
    expect(useCatalog.getState().byTerm[TEST_TERM_ID]?.complete).toBe(false);
    await act(async () => release());
    await waitFor(() =>
      expect(useCatalog.getState().byTerm[TEST_TERM_ID]?.complete).toBe(true),
    );
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
