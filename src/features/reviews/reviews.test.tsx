import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { toast } from "sonner";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { REVIEW_HELD_WORDS } from "~/core/reviews";
import {
  HISTORY_MANIFEST_KEY,
  historyDeptKey,
  type MyReview,
  manifestKey,
  planetTerpIndexKey,
  TERMS_KEY,
} from "~/core/schema";
import { NO_LOCAL } from "~/features/home/local";
import {
  aFourYear,
  aFourYearEntry,
  aManifest,
  aMyReview,
  aPageReview,
  aPlan,
  aPlanCourse,
  aPlanetTerpDept,
  aPlanetTerpIndex,
  aPlanetTerpManifest,
  aPlanetTerpReview,
  aSectionSnapshot,
  aTerm,
  aTermsFile,
  FIXTURE_HASH,
  fixtureTermId,
  someGrades,
} from "~/fixtures";
import { dismissToast } from "~/ui/toast";
import { CoursePage } from "./course-page";
import { deleteWithUndo } from "./delete-review";
import { ReviewsHomePage } from "./home-page";
import { InstructorPage } from "./instructor-page";
import { MyReviewsPage } from "./mine-page";
import { ReviewsNotFound } from "./not-found";
import {
  instructorSuggestions,
  loadInstructorPage,
  loadReviewsHome,
  loadReviewsPage,
} from "./page-data";
import { useReviews } from "./reviews-store";
import {
  fakeReviewsClient,
  publishFiles,
  renderPage,
  resetReviewsUi,
  STUDENT,
  setAccount,
} from "./testing";

// Signed in, the account's prefs sync (~/features/prefs); these tests have
// no sync server.
vi.mock("~/features/prefs/account-sync", () => ({
  syncPrefs: () => {},
  stopPrefsSync: () => {},
}));

// Your plans on this device, as the review box reads them; none unless a
// test says so.
const yourPlans = vi.hoisted(() => ({
  value: null as import("~/features/home/local").HomeLocal | null,
}));
vi.mock("~/features/home/local", async (original) => {
  const actual = await original<typeof import("~/features/home/local")>();
  return {
    ...actual,
    readHomeLocal: async () => yourPlans.value ?? actual.NO_LOCAL,
  };
});

// PlanetTerp (the fixtures): Ada Brandt ("brandt"), 4.2 from 61 reviews.
const BODY =
  "Lectures were clear and the exams matched the homework. Office hours helped a lot.";

/**
 * The Schedule of Classes' terms: a schedule says what you took only for a
 * term it still lists. Spring 2026 is over, and still listed here.
 */
const LISTED = aTermsFile({
  terms: [
    aTerm(),
    aTerm({ id: "202601", name: "Spring 2026", season: "spring", year: 2026 }),
  ],
});

beforeEach(() => {
  yourPlans.value = null;
  resetReviewsUi();
  publishFiles({
    [TERMS_KEY]: LISTED,
    "planetterp/manifest.json": aPlanetTerpManifest(),
    [`planetterp/dept/CMSC.${FIXTURE_HASH}.json`]: aPlanetTerpDept(),
  });
});

afterEach(() => {
  toast.dismiss();
});

/** Brandt's page as the route renders it: the loader, then the page. */
async function instructor(course: string | null = "CMSC351") {
  const page = await loadReviewsPage("brandt", course ?? undefined);
  if (page.kind !== "instructor")
    throw new Error("the loader didn't find brandt");
  return renderPage(
    <InstructorPage
      data={page.instructor}
      reviews={page.reviews}
      write={false}
    />,
  );
}

/** CMSC351's page as the route renders it. */
async function course() {
  const page = await loadReviewsPage("cmsc351", undefined);
  if (page.kind !== "course") throw new Error("the loader didn't find CMSC351");
  return renderPage(
    <CoursePage data={page.course} reviews={page.reviews} write={null} />,
    "/reviews/cmsc351",
  );
}

/** reviews/page's answer: ours, then PlanetTerp's first page. */
const answer =
  (
    terpsicle: ReturnType<typeof aPageReview>[] | null,
    planetTerp: ReturnType<typeof aPlanetTerpReview>[] = [],
    next: string | null = null,
  ) =>
  async () => ({ terpsicle, planetTerp, next });

describe("an instructor's page", () => {
  it("combines PlanetTerp's rating with ours, and shows the math", async () => {
    setAccount({ reviews: "on" });
    fakeReviewsClient({ page: answer([aPageReview({ rating: 5 })]) });
    // Every course: PlanetTerp's index says which departments list her.
    publishFiles({
      "planetterp/manifest.json": aPlanetTerpManifest({
        index: { hash: FIXTURE_HASH },
      }),
      [`planetterp/dept/CMSC.${FIXTURE_HASH}.json`]: aPlanetTerpDept(),
      [planetTerpIndexKey(FIXTURE_HASH)]: aPlanetTerpIndex(),
    });
    await instructor(null);
    expect(
      await screen.findByRole("heading", { name: "Ada Brandt" }),
    ).toBeInTheDocument();
    // (4.2 × 61 + 5) / 62 = 4.21
    expect(await screen.findByTestId("rating-math")).toHaveTextContent(
      "from 62 reviews: 4.2 from 61 on PlanetTerp, 5.0 from 1 on Terpsicle",
    );
    // Grades come after the reviews, and are PlanetTerp's, credited.
    expect(screen.getByText(/from PlanetTerp\.$/)).toBeInTheDocument();
  });

  it("lists PlanetTerp's reviews among ours, newest first, each marked", async () => {
    setAccount({ reviews: "on" });
    fakeReviewsClient({
      page: answer(
        [aPageReview({ createdMonth: "2026-10", body: "Ours, the newest." })],
        [
          aPlanetTerpReview({
            createdMonth: "2025-12",
            body: "Theirs, from last year.",
          }),
        ],
      ),
    });
    const { container } = await instructor();
    const cards = await waitFor(() => {
      const found = container.querySelectorAll("article[data-review]");
      if (found.length < 2) throw new Error("not both yet");
      return [...found] as HTMLElement[];
    });
    expect(cards.map((c) => c.dataset.source ?? "terpsicle")).toEqual([
      "terpsicle",
      "planetterp",
    ]);
    const theirs = cards[1] as HTMLElement;
    expect(theirs).toHaveTextContent("Theirs, from last year.");
    expect(theirs).toHaveTextContent("Expected an A");
    const chip = within(theirs).getByRole("link", { name: "PlanetTerp" });
    expect(chip).toHaveAttribute(
      "href",
      "https://planetterp.com/professor/brandt",
    );
    await userEvent.setup().hover(chip);
    expect(
      await screen.findByRole("tooltip", { name: /Written on PlanetTerp/ }),
    ).toBeInTheDocument();
  });

  it("reads on through PlanetTerp's with Show more, and tries again", async () => {
    setAccount({ reviews: "on" });
    let calls = 0;
    const client = fakeReviewsClient({
      page: answer(
        [],
        [aPlanetTerpReview({ body: "The first page." })],
        "2025-12-01T00:00:00.000Z|0123456789abcdef",
      ),
      planetTerp: async () => {
        calls += 1;
        if (calls === 1) throw new Error("offline");
        return {
          reviews: [
            aPlanetTerpReview({
              id: "fedcba9876543210",
              createdMonth: "2024-02",
              body: "An older one.",
            }),
          ],
          next: null,
        };
      },
    });
    const user = userEvent.setup();
    await instructor();
    await user.click(await screen.findByRole("button", { name: "Show more" }));
    expect(
      await screen.findByText(
        "Couldn't load more reviews. Check your connection.",
      ),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("An older one.")).toBeInTheDocument();
    expect(client.reviews.planetTerp).toHaveBeenLastCalledWith({
      instructorId: "brandt",
      course: "CMSC351",
      cursor: "2025-12-01T00:00:00.000Z|0123456789abcdef",
    });
    expect(screen.queryByRole("button", { name: "Show more" })).toBeNull();
  });

  it("shows words as plain text, and nothing about who wrote them", async () => {
    setAccount({ reviews: "on", user: STUDENT });
    fakeReviewsClient({
      page: answer([
        aPageReview({
          body: `${BODY} <b>Really</b> <img src=x onerror=alert(1)>`,
          termId: "202508",
          grade: "B+",
          edited: true,
        }),
      ]),
    });
    const { container } = await instructor();
    const card = await waitFor(() => {
      const found = container.querySelector("article[data-review]");
      if (!found) throw new Error("no review yet");
      return found as HTMLElement;
    });
    expect(card).toHaveTextContent("<b>Really</b>");
    expect(card.querySelector("b, img")).toBeNull();
    expect(card).toHaveTextContent("Took it Fall 2025 · Got a B+");
    expect(card).toHaveTextContent("Oct 2026 · Edited");
    // The reader is signed in; their name appears only on their account link.
    expect(card).not.toHaveTextContent(STUDENT.name);
    expect(card).not.toHaveTextContent(STUDENT.id);
    expect(within(card).queryByText("Yours")).toBeNull();
  });

  it("shows PlanetTerp's only while Reviews is off here", async () => {
    setAccount({ reviews: "off" });
    fakeReviewsClient({
      page: answer(null, [aPlanetTerpReview({ body: "Theirs." })]),
    });
    await instructor();
    expect(await screen.findByText("Theirs.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Write a review/ })).toBeNull();
    expect(screen.queryByRole("button", { name: "Report" })).toBeNull();
  });

  it("reads but doesn't write while Reviews is read-only", async () => {
    setAccount({ reviews: "read", user: STUDENT });
    fakeReviewsClient({ page: answer([aPageReview()]) });
    await instructor();
    expect(await screen.findByText(aPageReview().body)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Write a review/ })).toBeNull();
    expect(screen.getByRole("button", { name: "Report" })).toBeInTheDocument();
  });

  it("has the kit's header: Back to the course, and a view per course", async () => {
    setAccount({ reviews: "on" });
    fakeReviewsClient();
    await instructor();
    expect(
      await screen.findByRole("heading", { name: "Ada Brandt", level: 1 }),
    ).toBeInTheDocument();
    // Back, named for the course it goes back to.
    expect(
      screen
        .getAllByRole("link", { name: "CMSC351" })
        .map((link) => link.getAttribute("href")),
    ).toContain("/reviews/cmsc351");
    // Each course is a view, and a URL.
    const views = screen.getByRole("navigation", { name: "Courses" });
    expect(
      within(views).getByRole("link", { name: "CMSC351" }),
    ).toHaveAttribute("aria-current", "page");
    expect(
      within(views).getByRole("link", { name: "All courses" }),
    ).toHaveAttribute("href", "/reviews/brandt");
  });

  it("opens the form when the address asks (Review your instructors)", async () => {
    setAccount({ reviews: "on", user: STUDENT });
    fakeReviewsClient();
    const page = await loadReviewsPage("brandt", "CMSC351");
    if (page.kind !== "instructor") throw new Error("no brandt");
    await renderPage(
      <InstructorPage data={page.instructor} reviews={page.reviews} write />,
    );
    expect(
      await screen.findByRole("form", { name: "Write a review" }),
    ).toBeInTheDocument();
  });

  it("asks you to sign in to write or report, in place", async () => {
    setAccount({ reviews: "on" });
    fakeReviewsClient({ page: answer([aPageReview()]) });
    const user = userEvent.setup();
    await instructor();
    // Signed out, the review box asks, and signs you in right there.
    const box = await screen.findByRole("region", {
      name: /Took CMSC351 with Ada Brandt\?/,
    });
    expect(
      within(box).getByText(/Sign in with your UMD account to review it/),
    ).toBeInTheDocument();
    expect(
      await within(box).findByRole("link", { name: /^Sign in/ }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Report" }));
    expect(
      screen.getByText(/Sign in with your UMD account to report a review/),
    ).toBeInTheDocument();
  });
});

describe("writing a review", () => {
  it("fixes a stage-0 problem in place, with the specific words, before sending", async () => {
    setAccount({ reviews: "on", user: STUDENT });
    const client = fakeReviewsClient();
    const user = userEvent.setup();
    await instructor();
    await user.click(
      await screen.findByRole("button", { name: /Write a review/ }),
    );
    const form = screen.getByRole("form", { name: "Write a review" });
    await user.click(within(form).getByRole("radio", { name: "4 stars" }));
    await user.type(
      within(form).getByLabelText("Your review"),
      `${BODY} Notes at https://example.com/cmsc351`,
    );
    await user.click(within(form).getByRole("button", { name: "Post review" }));
    expect(
      within(form).getByText(
        "Take out the link. Reviews can only link to umd.edu.",
        { exact: false },
      ),
    ).toBeInTheDocument();
    expect(
      within(form).getByText("https://example.com/cmsc351"),
    ).toBeInTheDocument();
    expect(client.reviews.submit).not.toHaveBeenCalled();

    // Fixing it takes the problem away as you type.
    const box = within(form).getByLabelText("Your review");
    await user.clear(box);
    await user.type(box, BODY);
    expect(within(form).queryByText(/Take out the link/)).toBeNull();
  });

  it("sends it, and shows it waiting when a person has to look first", async () => {
    setAccount({ reviews: "on", user: STUDENT });
    const held: MyReview = aMyReview({
      status: "held",
      reason: "model-unavailable",
      publishedAt: null,
    });
    let written = false;
    const client = fakeReviewsClient({
      submit: async () => {
        written = true;
        return {
          status: "held",
          reviewId: held.id,
          reason: "model-unavailable",
        };
      },
      mine: async () => ({ reviews: written ? [held] : [] }),
    });
    const user = userEvent.setup();
    await instructor();
    await user.click(
      await screen.findByRole("button", { name: /Write a review/ }),
    );
    const form = screen.getByRole("form", { name: "Write a review" });
    await user.click(within(form).getByRole("radio", { name: "4 stars" }));
    await user.type(within(form).getByLabelText("Your review"), BODY);
    await user.click(within(form).getByRole("button", { name: "Post review" }));

    await waitFor(() =>
      expect(client.reviews.submit).toHaveBeenCalledWith({
        instructorId: "brandt",
        reviewedName: "Ada Brandt",
        dept: "CMSC",
        course: "CMSC351",
        termId: null,
        rating: 4,
        grade: null,
        body: BODY,
      }),
    );
    // The form closes; your review shows where it stands, only to you.
    await waitFor(() =>
      expect(screen.queryByRole("form", { name: "Write a review" })).toBeNull(),
    );
    expect(
      await screen.findByText("Only you can see this"),
    ).toBeInTheDocument();
    expect(screen.getAllByText(REVIEW_HELD_WORDS).length).toBeGreaterThan(0);
    expect(screen.getByText("Held")).toBeInTheDocument();
    // Yours is right there, so nothing asks you to be the first.
    expect(
      screen.getByText("No one else has reviewed CMSC351 yet."),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Yours could be the first/)).toBeNull();
  });

  it("offers the term under way and earlier ones, never one ahead", async () => {
    // A Sunday in Fall 2026, while the catalog leads with Spring 2027.
    vi.useFakeTimers({
      now: new Date("2026-09-27T16:00:00Z"),
      toFake: ["Date"],
    });
    try {
      setAccount({ reviews: "on", user: STUDENT });
      fakeReviewsClient();
      const user = userEvent.setup();
      await instructor();
      await user.click(
        await screen.findByRole("button", { name: /Write a review/ }),
      );
      const form = screen.getByRole("form", { name: "Write a review" });
      await user.click(
        within(form).getByRole("combobox", { name: "When you took it" }),
      );
      const options = screen.getAllByRole("option").map((o) => o.textContent);
      expect(options.slice(0, 4)).toEqual([
        "Rather not say",
        "Fall 2026",
        "Summer 2026",
        "Spring 2026",
      ]);
      expect(options).not.toContain("Spring 2027");
    } finally {
      vi.useRealTimers();
    }
  });

  it("says why it can't send without clearing what you wrote", async () => {
    setAccount({ reviews: "on", user: STUDENT });
    fakeReviewsClient({
      submit: async () => ({ status: "limit", retryAfterSeconds: 3 * 3600 }),
    });
    const user = userEvent.setup();
    await instructor();
    await user.click(
      await screen.findByRole("button", { name: /Write a review/ }),
    );
    const form = screen.getByRole("form", { name: "Write a review" });
    await user.click(within(form).getByRole("radio", { name: "5 stars" }));
    await user.type(within(form).getByLabelText("Your review"), BODY);
    await user.click(within(form).getByRole("button", { name: "Post review" }));
    expect(
      await within(form).findByText(
        "You've written 10 reviews this week. You can write another in 3 hours.",
      ),
    ).toBeInTheDocument();
    expect(within(form).getByLabelText("Your review")).toHaveValue(BODY);
  });
});

describe("your own review", () => {
  const mine = aMyReview();

  it("edits in place, starting from what you wrote", async () => {
    setAccount({ reviews: "on", user: STUDENT });
    const client = fakeReviewsClient({
      page: answer([aPageReview({ id: mine.id })]),
      mine: async () => ({ reviews: [mine] }),
    });
    const user = userEvent.setup();
    await instructor();
    expect(await screen.findByText("Yours")).toBeInTheDocument();
    // Yours: edit and delete, never report.
    expect(screen.queryByRole("button", { name: "Report" })).toBeNull();
    await user.click(screen.getByRole("button", { name: "Edit" }));
    const form = screen.getByRole("form", { name: "Edit your review" });
    expect(within(form).getByLabelText("Your review")).toHaveValue(mine.body);
    await user.click(within(form).getByRole("radio", { name: "5 stars" }));
    await user.click(
      within(form).getByRole("button", { name: "Save changes" }),
    );
    await waitFor(() =>
      expect(client.reviews.edit).toHaveBeenCalledWith({
        reviewId: mine.id,
        rating: 5,
        termId: mine.termId,
        grade: mine.grade,
        body: mine.body,
      }),
    );
  });

  it("deletes with Undo instead of asking first", async () => {
    setAccount({ reviews: "on", user: STUDENT });
    const client = fakeReviewsClient({
      page: answer([aPageReview({ id: mine.id })]),
      mine: async () => ({ reviews: [mine] }),
    });
    const user = userEvent.setup();
    const { container } = await instructor();
    await user.click(await screen.findByRole("button", { name: "Delete" }));
    expect(container.querySelector("article[data-review]")).toBeNull();
    expect(await screen.findByText("Review deleted")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Undo" }));
    expect(
      await screen.findByRole("button", { name: "Delete" }),
    ).toBeInTheDocument();
    expect(client.reviews.delete).not.toHaveBeenCalled();
  });

  it("tells the server once Undo has passed", async () => {
    setAccount({ reviews: "on", user: STUDENT });
    const client = fakeReviewsClient();
    // The toaster, which runs the toast's timer and close.
    await renderPage(<div />);
    act(() => deleteWithUndo(mine.id));
    expect(useReviews.getState().deleting[mine.id]).toBe(true);
    // Sonner adds a toast on a timer but applies a dismiss on the next
    // frame, so a dismiss sent before the toast is up is lost. Wait for it.
    expect(await screen.findByText("Review deleted")).toBeInTheDocument();
    // The toast's close (timing out, or dismissed) commits it.
    await act(async () => {
      dismissToast(`review-delete-${mine.id}`);
    });
    await waitFor(() =>
      expect(client.reviews.delete).toHaveBeenCalledWith(
        { reviewId: mine.id },
        undefined,
      ),
    );
    // The page reads its reviews again.
    await waitFor(() => expect(useReviews.getState().changes).toBe(1));
  });
});

describe("reporting", () => {
  it("sends the reason and folds the review away with thanks", async () => {
    setAccount({ reviews: "on", user: STUDENT });
    const review = aPageReview();
    const client = fakeReviewsClient({ page: answer([review]) });
    const user = userEvent.setup();
    await instructor();
    await user.click(await screen.findByRole("button", { name: "Report" }));
    const form = screen.getByRole("form", { name: "Report this review" });
    expect(
      within(form).getByRole("button", { name: "Send report" }),
    ).toBeDisabled();
    await user.click(
      within(form).getByRole("radio", { name: "Names a student" }),
    );
    await user.click(within(form).getByRole("button", { name: "Send report" }));
    await waitFor(() =>
      expect(client.reports.create).toHaveBeenCalledWith({
        surface: "review",
        ref: review.id,
        reason: "names-a-student",
        note: null,
      }),
    );
    expect(
      await screen.findByText(/You reported this review/),
    ).toBeInTheDocument();
    expect(screen.queryByText(review.body)).toBeNull();
  });
});

describe("a course's page", () => {
  it("lists who's taught it with their numbers, linking to each", async () => {
    setAccount({ reviews: "on" });
    fakeReviewsClient();
    await course();
    const [link] = await screen.findAllByRole("link", { name: "Ada Brandt" });
    expect(link).toHaveAttribute("href", "/reviews/brandt?course=CMSC351");
    expect(screen.getAllByTestId("grade-bars")).toHaveLength(1);
    // By the newest term each taught it, as PlanetTerp's course pages
    // group them, with how they grade across all their courses.
    const spring = screen.getByRole("list", {
      name: "Taught CMSC351 in Spring 2025",
    });
    expect(spring).toHaveTextContent(/Ada Brandt.*Average GPA \d\.\d\d/);
  });

  it("lists who taught it in every term our instructor history has", async () => {
    setAccount({ reviews: "on" });
    fakeReviewsClient();
    publishFiles({
      [TERMS_KEY]: LISTED,
      "planetterp/manifest.json": aPlanetTerpManifest(),
      [`planetterp/dept/CMSC.${FIXTURE_HASH}.json`]: aPlanetTerpDept(),
      [HISTORY_MANIFEST_KEY]: {
        schemaVersion: 1,
        generatedAt: "2026-09-29T12:00:00.000Z",
        terms: [],
        departments: [{ code: "CMSC", hash: FIXTURE_HASH }],
      },
      [historyDeptKey("CMSC", FIXTURE_HASH)]: {
        schemaVersion: 1,
        dept: "CMSC",
        courses: [
          {
            code: "CMSC351",
            title: "Algorithms",
            offerings: [
              {
                termId: "202601",
                source: "terpsicle",
                instructors: ["Ada Brandt"],
                sections: [{ code: "0101", instructors: ["Ada Brandt"] }],
              },
              {
                termId: "202508",
                source: "terpsicle",
                instructors: ["Ada Brandt", "Jo Early"],
                sections: [],
              },
            ],
          },
        ],
      },
    });
    await course();
    expect(
      await screen.findByRole("list", {
        name: "Taught CMSC351 in Spring 2026",
      }),
    ).toHaveTextContent("Ada Brandt");
    // Brandt again, beside someone PlanetTerp doesn't know.
    const fall = screen.getByRole("list", {
      name: "Taught CMSC351 in Fall 2025",
    });
    expect(fall).toHaveTextContent("Ada Brandt");
    expect(fall).toHaveTextContent("Jo Early");
  });

  it("lists every instructor's reviews, each saying who it's about", async () => {
    setAccount({ reviews: "on" });
    fakeReviewsClient({
      page: answer(
        [aPageReview({ body: "Ours about Brandt." })],
        [aPlanetTerpReview({ body: "Theirs about Brandt." })],
      ),
    });
    const { container } = await course();
    expect(await screen.findByText("Ours about Brandt.")).toBeInTheDocument();
    expect(screen.getByText("Theirs about Brandt.")).toBeInTheDocument();
    const cards = container.querySelectorAll("article[data-review]");
    for (const card of cards)
      expect(card).toHaveTextContent(/^About Ada Brandt/);
  });

  it("asks who taught you from its one Write a review", async () => {
    setAccount({ reviews: "on", user: STUDENT });
    fakeReviewsClient();
    await course();
    expect(
      screen.getByRole("heading", { name: /^CMSC351/, level: 1 }),
    ).toBeInTheDocument();
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole("button", { name: /Write a review/ }),
    );
    // Picking who taught you opens the form for them, in one step.
    await user.click(
      await screen.findByRole("menuitem", { name: /Ada Brandt/ }),
    );
    const form = await screen.findByRole("form", { name: "Write a review" });
    expect(within(form).getByText(/Ada Brandt/)).toBeInTheDocument();
    expect(within(form).getByLabelText("Your review")).toBeInTheDocument();
    // The form can be a screen below the menu: focus goes to it, not back
    // to the menu's button (which scrolled the page back up).
    await waitFor(() =>
      expect(form.contains(document.activeElement)).toBe(true),
    );
  });

  it("asks you to sign in in its review box, when you aren't", async () => {
    setAccount({ reviews: "on" });
    fakeReviewsClient();
    await course();
    const box = await screen.findByRole("region", {
      name: /^Took CMSC351\s?\?$/,
    });
    expect(
      within(box).getByText(/Sign in with your UMD account to review it/),
    ).toBeInTheDocument();
    expect(
      await within(box).findByRole("link", { name: /^Sign in/ }),
    ).toBeInTheDocument();
    expect(
      within(box).queryByRole("button", { name: /Write a review/ }),
    ).toBeNull();
  });

  it("names the class you took and haven't reviewed, and fills in the term", async () => {
    setAccount({ reviews: "on", user: STUDENT });
    fakeReviewsClient();
    yourPlans.value = {
      ...NO_LOCAL,
      plans: [
        aPlan({
          termId: "202601",
          courses: [
            aPlanCourse({
              courseCode: "CMSC351",
              sectionCode: "0101",
              snapshot: aSectionSnapshot({ instructors: ["Ada Brandt"] }),
            }),
          ],
        }),
      ],
    };
    await course();
    const box = await screen.findByRole("region", {
      name: "You took CMSC351 with Ada Brandt in Spring 2026",
    });
    const user = userEvent.setup();
    await user.click(
      within(box).getByRole("button", { name: /Write a review/ }),
    );
    const form = await screen.findByRole("form", { name: "Write a review" });
    expect(within(form).getByText(/Ada Brandt/)).toBeInTheDocument();
    expect(within(form).getByLabelText("When you took it")).toHaveTextContent(
      "Spring 2026",
    );
  });

  it("asks who taught you when your plans know only the course", async () => {
    setAccount({ reviews: "on", user: STUDENT });
    fakeReviewsClient();
    // A transcript's term: the course, not who taught it; and a schedule
    // of a term Testudo no longer lists, which doesn't count.
    yourPlans.value = {
      ...NO_LOCAL,
      plans: [
        aPlan({
          termId: "202508",
          courses: [
            aPlanCourse({
              courseCode: "CMSC351",
              sectionCode: "0101",
              snapshot: aSectionSnapshot({ instructors: ["Ada Brandt"] }),
            }),
          ],
        }),
      ],
      fourYear: aFourYear({
        entries: [aFourYearEntry({ term: "202508", code: "CMSC351" })],
      }),
    };
    await course();
    const box = await screen.findByRole("region", {
      name: "You took CMSC351 in Fall 2025",
    });
    expect(within(box).getByText(/^Who taught you\?/)).toBeInTheDocument();
    expect(
      within(box).getByRole("button", { name: /Write a review/ }),
    ).toBeInTheDocument();
    expect(box).not.toHaveTextContent("Ada Brandt");
  });

  it("says you've reviewed it, with Edit, once you have", async () => {
    setAccount({ reviews: "on", user: STUDENT });
    fakeReviewsClient({
      mine: async () => ({
        reviews: [aMyReview({ createdAt: "2026-05-02T14:00:00.000Z" })],
      }),
    });
    yourPlans.value = {
      ...NO_LOCAL,
      plans: [
        aPlan({
          termId: "202601",
          courses: [
            aPlanCourse({
              courseCode: "CMSC351",
              sectionCode: "0101",
              snapshot: aSectionSnapshot({ instructors: ["Ada Brandt"] }),
            }),
          ],
        }),
      ],
    };
    await course();
    const box = await screen.findByRole("region", {
      name: "You reviewed Ada Brandt in CMSC351",
    });
    expect(within(box).getByText(/May 2026 · Posted/)).toBeInTheDocument();
    expect(
      within(box).getByRole("button", { name: "Edit your review" }),
    ).toBeInTheDocument();
  });
});

describe("/reviews", () => {
  it("shows a first-time visitor its numbers, the newest reviews, what's most taken and every department", async () => {
    setAccount({ reviews: "on" });
    fakeReviewsClient({
      latest: async () => ({
        terpsicle: [
          aPageReview({ createdMonth: "2027-02", body: "Ours, just posted." }),
        ],
        planetTerp: [
          aPlanetTerpReview({
            createdMonth: "2026-11",
            course: null,
            body: "Theirs, from the fall.",
          }),
        ],
        instructors: { brandt: "Ada Brandt" },
      }),
    });
    publishFiles({
      [TERMS_KEY]: aTermsFile(),
      [manifestKey(fixtureTermId)]: aManifest(),
      "planetterp/manifest.json": aPlanetTerpManifest({
        index: { hash: FIXTURE_HASH },
      }),
      [planetTerpIndexKey(FIXTURE_HASH)]: aPlanetTerpIndex({
        totals: {
          courses: 4512,
          professors: 3121,
          reviews: 21044,
          grades: 100,
          counts: someGrades(),
        },
      }),
    });
    const data = await loadReviewsHome(undefined);
    await renderPage(<ReviewsHomePage data={data} q="" />);
    // The product by name; being free goes without saying.
    expect(
      screen.getByRole("heading", { name: "Terpsicle Reviews", level: 1 }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/no sign-in/)).toBeNull();
    // The numbers, as PlanetTerp's front page counts them.
    for (const [label, n] of [
      ["Courses", "4,512"],
      ["Professors", "3,121"],
      ["Reviews", "21,044"],
    ] as const)
      expect(
        screen
          .getByText(label, { selector: "dt" })
          .closest("div")
          ?.querySelector(".sr-only"),
      ).toHaveTextContent(n);
    // The newest reviews, ours and PlanetTerp's, each saying who it's about.
    const recent = screen
      .getByRole("heading", { name: "Recent reviews" })
      .closest("section") as HTMLElement;
    const cards = [...recent.querySelectorAll("article[data-review]")];
    expect(cards.map((c) => c.textContent)).toEqual([
      expect.stringMatching(/^Ada Brandt in CMSC351.*Ours, just posted\./),
      expect.stringMatching(/^Ada Brandt.*Theirs, from the fall\./),
    ]);
    expect(
      within(recent).getByRole("link", { name: /Ada Brandt\s*in\s*CMSC351/ }),
    ).toHaveAttribute("href", "/reviews/brandt?course=CMSC351");
    expect(
      screen.getByRole("heading", { name: "Grades across UMD" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /CMSC351\s*Algorithms/ }),
    ).toHaveAttribute("href", "/reviews/cmsc351");
    expect(screen.getByText("13,592")).toBeInTheDocument();
    // Instructors and courses as equals.
    const most = screen
      .getByRole("heading", { name: "Most reviewed", level: 2 })
      .closest("section") as HTMLElement;
    expect(
      within(most).getByRole("link", { name: "Ada Brandt" }),
    ).toHaveAttribute("href", "/reviews/brandt");
    expect(
      screen.getByRole("link", { name: /CMSC\s*Computer Science/ }),
    ).toHaveAttribute("href", "/reviews?q=CMSC");
    expect(
      screen.getByRole("heading", { name: "Where this comes from" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Write a review/ }),
    ).toBeInTheDocument();
  });
});

describe("/reviews search", () => {
  it("finds instructors and courses alike, and the server's HTML has them", async () => {
    setAccount({ reviews: "on" });
    fakeReviewsClient();
    publishFiles({
      "planetterp/manifest.json": aPlanetTerpManifest({
        index: { hash: FIXTURE_HASH },
      }),
      [planetTerpIndexKey(FIXTURE_HASH)]: aPlanetTerpIndex({
        instructors: {
          brandt: ["Ada Brandt", ["CMSC"]],
          canada_jo: ["Jo Canada", ["MATH"]],
        },
      }),
    });
    const data = await loadReviewsHome("ada");
    expect(data.results.instructors).toEqual([
      ["brandt", "Ada Brandt"],
      ["canada_jo", "Jo Canada"],
    ]);
    await renderPage(<ReviewsHomePage data={data} q="ada" />);
    const instructors = screen.getByRole("list", { name: "Instructors" });
    expect(
      within(instructors).getByRole("link", { name: "Jo Canada" }),
    ).toHaveAttribute("href", "/reviews/canada-jo");
  });
});

describe("addresses", () => {
  it("move to one address per page, and tell courses from instructors", async () => {
    publishFiles({
      "planetterp/manifest.json": aPlanetTerpManifest({
        index: { hash: FIXTURE_HASH },
      }),
      [`planetterp/dept/CMSC.${FIXTURE_HASH}.json`]: aPlanetTerpDept(),
      [planetTerpIndexKey(FIXTURE_HASH)]: aPlanetTerpIndex(),
    });
    fakeReviewsClient();
    expect(await loadReviewsPage("CMSC351", undefined)).toEqual({
      kind: "moved",
      slug: "cmsc351",
    });
    expect(await loadReviewsPage("Brandt", undefined)).toEqual({
      kind: "moved",
      slug: "brandt",
    });
    expect((await loadReviewsPage("brandt", undefined)).kind).toBe(
      "instructor",
    );
    expect((await loadReviewsPage("cmsc351", undefined)).kind).toBe("course");
    expect(await loadReviewsPage("zzzz999", undefined)).toEqual({
      kind: "missing",
      what: "course",
    });
  });
});

describe("a page nobody publishes", () => {
  it("is not found, with who the address may have meant", async () => {
    publishFiles({
      "planetterp/manifest.json": aPlanetTerpManifest({
        index: { hash: FIXTURE_HASH },
      }),
      [`planetterp/dept/CMSC.${FIXTURE_HASH}.json`]: aPlanetTerpDept(),
      [planetTerpIndexKey(FIXTURE_HASH)]: aPlanetTerpIndex(),
    });
    expect(await loadInstructorPage("ada-brandt", undefined)).toBeNull();
    const suggestions = await instructorSuggestions("ada-brandt");
    await renderPage(
      <ReviewsNotFound data={{ what: "instructor", suggestions }} />,
    );
    expect(
      screen.getByRole("heading", { name: "Instructor not found" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ada Brandt" })).toHaveAttribute(
      "href",
      "/reviews/brandt",
    );
  });
});

describe("/reviews/mine", () => {
  it("says where each review stands, and why one wasn't posted", async () => {
    setAccount({ reviews: "on", user: STUDENT });
    fakeReviewsClient({
      mine: async () => ({
        reviews: [
          aMyReview({ id: "rvHeldReview0000000001", status: "held" }),
          aMyReview({
            id: "rvRejectedReview000001",
            status: "rejected",
            reason: "targets-person",
            course: "CMSC330",
          }),
        ],
      }),
    });
    await renderPage(<MyReviewsPage />, "/reviews/mine");
    expect(await screen.findByText("Held")).toBeInTheDocument();
    expect(screen.getByText(REVIEW_HELD_WORDS)).toBeInTheDocument();
    expect(screen.getByText("Not posted")).toBeInTheDocument();
    expect(
      screen.getByText(
        "It wasn't posted. Why: Targets a person. You can delete it and write a new one.",
      ),
    ).toBeInTheDocument();
  });

  it("starts you off when you haven't written one", async () => {
    setAccount({ reviews: "on", user: STUDENT });
    fakeReviewsClient({ mine: async () => ({ reviews: [] }) });
    await renderPage(<MyReviewsPage />, "/reviews/mine");
    expect(
      await screen.findByRole("heading", { name: "No reviews yet" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Find a course" })).toHaveAttribute(
      "href",
      "/reviews",
    );
  });

  it("asks you to sign in when you aren't", async () => {
    setAccount({ reviews: "on" });
    fakeReviewsClient();
    await renderPage(<MyReviewsPage />, "/reviews/mine");
    expect(
      await screen.findByText(/Sign in with your UMD account to see/),
    ).toBeInTheDocument();
  });
});
