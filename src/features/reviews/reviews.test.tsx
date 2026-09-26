import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { toast } from "sonner";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { REVIEW_HELD_WORDS } from "~/core/reviews";
import type { MyReview } from "~/core/schema";
import {
  aMyReview,
  aPlanetTerpDept,
  aPlanetTerpManifest,
  aPublicReview,
  FIXTURE_HASH,
} from "~/fixtures";
import { CoursePage } from "./course-page";
import { deleteWithUndo } from "./delete-review";
import { InstructorPage } from "./instructor-page";
import { MyReviewsPage } from "./mine-page";
import { useReviews } from "./reviews-store";
import {
  fakeReviewsClient,
  publishFiles,
  renderPage,
  resetReviewsUi,
  STUDENT,
  setAccount,
} from "./testing";

// PlanetTerp (the fixtures): Ada Brandt ("brandt"), 4.2 from 61 reviews.
const BODY =
  "Lectures were clear and the exams matched the homework. Office hours helped a lot.";

beforeEach(() => {
  resetReviewsUi();
  publishFiles({
    "planetterp/manifest.json": aPlanetTerpManifest(),
    [`planetterp/dept/CMSC.${FIXTURE_HASH}.json`]: aPlanetTerpDept(),
  });
});

afterEach(() => {
  toast.dismiss();
});

const instructor = (course: string | null = "CMSC351") =>
  renderPage(<InstructorPage id="brandt" course={course} />);

describe("an instructor's page", () => {
  it("combines PlanetTerp's rating with ours, and shows the math", async () => {
    setAccount({ reviews: "on" });
    fakeReviewsClient({
      list: async () => ({
        reviews: [aPublicReview({ rating: 5 })],
        next: null,
      }),
    });
    await instructor();
    expect(
      await screen.findByRole("heading", { name: "Ada Brandt" }),
    ).toBeInTheDocument();
    // (4.2 × 61 + 5) / 62 = 4.21
    expect(await screen.findByTestId("rating-math")).toHaveTextContent(
      "from 62 reviews: 4.2 from 61 on PlanetTerp, 5.0 from 1 on Terpsicle",
    );
    expect(
      screen.getByRole("link", { name: /^61 more reviews on PlanetTerp/ }),
    ).toHaveAttribute("href", "https://planetterp.com/professor/brandt");
    // PlanetTerp's grade bars for the course, credited.
    expect(screen.getByTestId("grade-bars")).toBeInTheDocument();
    expect(screen.getByText(/from PlanetTerp\.$/)).toBeInTheDocument();
  });

  it("shows words as plain text, and nothing about who wrote them", async () => {
    setAccount({ reviews: "on", user: STUDENT });
    fakeReviewsClient({
      list: async () => ({
        reviews: [
          aPublicReview({
            body: `${BODY} <b>Really</b> <img src=x onerror=alert(1)>`,
            termId: "202508",
            grade: "B+",
            edited: true,
          }),
        ],
        next: null,
      }),
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

  it("shows PlanetTerp only while Reviews is off here", async () => {
    setAccount({ reviews: "off" });
    const client = fakeReviewsClient();
    await instructor();
    expect(
      await screen.findByRole("link", { name: /61 reviews on PlanetTerp/ }),
    ).toBeInTheDocument();
    expect(screen.queryByText("Reviews on Terpsicle")).toBeNull();
    expect(screen.queryByRole("button", { name: /Write a review/ })).toBeNull();
    expect(client.reviews.list).not.toHaveBeenCalled();
  });

  it("reads but doesn't write while Reviews is read-only", async () => {
    setAccount({ reviews: "read", user: STUDENT });
    fakeReviewsClient({
      list: async () => ({ reviews: [aPublicReview()], next: null }),
    });
    await instructor();
    expect(await screen.findByText(aPublicReview().body)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Write a review/ })).toBeNull();
    expect(screen.getByRole("button", { name: "Report" })).toBeInTheDocument();
  });

  it("asks you to sign in to write or report, in place", async () => {
    setAccount({ reviews: "on" });
    fakeReviewsClient({
      list: async () => ({ reviews: [aPublicReview()], next: null }),
    });
    const user = userEvent.setup();
    await instructor();
    await user.click(
      await screen.findByRole("button", { name: /Write a review/ }),
    );
    expect(
      screen.getByText(/Sign in with your UMD account to write a review/),
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
      list: async () => ({
        reviews: [aPublicReview({ id: mine.id })],
        next: null,
      }),
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
      list: async () => ({
        reviews: [aPublicReview({ id: mine.id })],
        next: null,
      }),
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
    useReviews.setState({
      lists: {
        brandt: {
          status: "ready",
          reviews: [aPublicReview({ id: mine.id })],
          complete: true,
        },
      },
    });
    // The toaster, which runs the toast's timer and close.
    await renderPage(<div />);
    act(() => deleteWithUndo(mine.id));
    expect(useReviews.getState().deleting[mine.id]).toBe(true);
    // The toast's close (timing out, or dismissed) commits it.
    await act(async () => {
      toast.dismiss(`review-delete-${mine.id}`);
    });
    await waitFor(() =>
      expect(client.reviews.delete).toHaveBeenCalledWith(
        { reviewId: mine.id },
        undefined,
      ),
    );
    await waitFor(() =>
      expect(useReviews.getState().lists.brandt).toMatchObject({
        reviews: [],
      }),
    );
  });
});

describe("reporting", () => {
  it("sends the reason and folds the review away with thanks", async () => {
    setAccount({ reviews: "on", user: STUDENT });
    const review = aPublicReview();
    const client = fakeReviewsClient({
      list: async () => ({ reviews: [review], next: null }),
    });
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
    await renderPage(<CoursePage code="CMSC351" />, "/reviews/courses/CMSC351");
    const link = await screen.findByRole("link", { name: "Ada Brandt" });
    expect(link).toHaveAttribute(
      "href",
      "/reviews/instructors/brandt?course=CMSC351",
    );
    expect(screen.getAllByTestId("grade-bars")).toHaveLength(1);
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
    expect(await screen.findByText("Waiting")).toBeInTheDocument();
    expect(screen.getByText(REVIEW_HELD_WORDS)).toBeInTheDocument();
    expect(screen.getByText("Not posted")).toBeInTheDocument();
    expect(
      screen.getByText(
        "It wasn't posted. Why: Targets a person. You can delete it and write a new one.",
      ),
    ).toBeInTheDocument();
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
