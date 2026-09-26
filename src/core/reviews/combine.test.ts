import { describe, expect, it } from "vitest";
import type { CourseSearchRow } from "~/core/schema";
import { aMyReview, aPublicReview } from "~/fixtures";
import {
  combinedRatingWords,
  combineRatings,
  formatStars,
  matchCourses,
  notPostedWords,
  REVIEW_HELD_WORDS,
  reviewStanding,
  terpsicleRating,
  waitWords,
  writeResultWords,
} from "./index";

describe("combineRatings", () => {
  it("weights each source by its review count (V2 §7.6's example)", () => {
    const combined = combineRatings([
      { source: "planetterp", rating: 4.1, reviewCount: 48 },
      { source: "terpsicle", rating: 4.6, reviewCount: 13 },
    ]);
    expect(combined.reviewCount).toBe(61);
    expect(combined.rating).toBeCloseTo((4.1 * 48 + 4.6 * 13) / 61);
    expect(combinedRatingWords(combined)).toBe(
      "4.2 from 61 reviews: 4.1 from 48 on PlanetTerp, 4.6 from 13 on Terpsicle",
    );
  });

  it("leaves out a source with no reviews, and says where one source is from", () => {
    const combined = combineRatings([
      { source: "planetterp", rating: 4.1, reviewCount: 48 },
      { source: "terpsicle", rating: null, reviewCount: 0 },
    ]);
    expect(combined.parts.map((p) => p.source)).toEqual(["planetterp"]);
    expect(combined.rating).toBe(4.1);
    expect(combinedRatingWords(combined)).toBe(
      "4.1 from 48 reviews on PlanetTerp",
    );
    expect(
      combinedRatingWords(
        combineRatings([{ source: "terpsicle", rating: 5, reviewCount: 1 }]),
      ),
    ).toBe("5.0 from 1 review on Terpsicle");
  });

  it("has no rating with no reviews anywhere", () => {
    const combined = combineRatings([
      { source: "planetterp", rating: null, reviewCount: 0 },
      terpsicleRating([]),
    ]);
    expect(combined).toEqual({ rating: null, reviewCount: 0, parts: [] });
    expect(combinedRatingWords(combined)).toBe("No reviews yet");
  });

  it("ignores a count without a rating", () => {
    // PlanetTerp's null rating means "no reviews", whatever the count says.
    expect(
      combineRatings([{ source: "planetterp", rating: null, reviewCount: 3 }])
        .reviewCount,
    ).toBe(0);
  });

  it("averages our published reviews", () => {
    expect(
      terpsicleRating([
        aPublicReview({ rating: 5 }),
        aPublicReview({ rating: 4 }),
      ]),
    ).toEqual({ source: "terpsicle", rating: 4.5, reviewCount: 2 });
    expect(formatStars(4.25)).toBe("4.3");
  });
});

describe("reviewStanding", () => {
  it("says a posted review is posted, and editable", () => {
    expect(reviewStanding(aMyReview())).toEqual({
      label: "Posted",
      detail: null,
      editable: true,
    });
  });

  it("uses V2 §9.2's words while a person looks", () => {
    const held = reviewStanding(
      aMyReview({ status: "held", reason: "misconduct-claim" }),
    );
    expect(held).toMatchObject({ label: "Waiting", editable: true });
    expect(held.detail).toBe(REVIEW_HELD_WORDS);
  });

  it("says an edit is waiting while the old words stay up", () => {
    const pendingEdit = {
      termId: null,
      rating: 3,
      grade: null,
      body: "An edit that waits for a person to read it before it goes up.",
      state: "waiting" as const,
      reason: "model-unavailable" as const,
    };
    expect(reviewStanding(aMyReview({ pendingEdit })).detail).toContain(
      "Readers see your earlier words until then.",
    );
    expect(
      reviewStanding(
        aMyReview({
          pendingEdit: { ...pendingEdit, state: "rejected", reason: "spam" },
        }),
      ).detail,
    ).toBe(
      "It wasn't posted. Why: Spam or an ad. Readers still see your earlier words.",
    );
  });

  it("says why a review wasn't posted, and that it can't be edited", () => {
    expect(
      reviewStanding(aMyReview({ status: "rejected", reason: "hate" })),
    ).toEqual({
      label: "Not posted",
      detail:
        "It wasn't posted. Why: Hate speech. You can delete it and write a new one.",
      editable: false,
    });
    expect(
      reviewStanding(aMyReview({ status: "hidden", reason: "reported" }))
        .editable,
    ).toBe(false);
  });

  it("names a moderator's and readers' removals plainly", () => {
    expect(notPostedWords("admin")).toBe("A moderator took this down.");
    expect(notPostedWords(null)).toBe("A moderator took this down.");
    expect(notPostedWords("reported")).toBe(
      "Readers reported it, and a moderator took it down.",
    );
  });
});

describe("writeResultWords", () => {
  it("says what happens to a held review or edit", () => {
    const held = { status: "held", reviewId: "x", reason: "burst" } as const;
    expect(writeResultWords(held)).toBe(REVIEW_HELD_WORDS);
    expect(writeResultWords(held, { editingPublished: true })).toContain(
      "your edit",
    );
  });

  it("gives the limit and the block specifically", () => {
    expect(
      writeResultWords({ status: "limit", retryAfterSeconds: 2 * 86_400 }),
    ).toBe(
      "You've written 10 reviews this week. You can write another in 2 days.",
    );
    expect(
      writeResultWords({
        status: "blocked",
        until: "2026-11-03T15:00:00.000Z",
      }),
    ).toBe("You can't write reviews until Nov 3.");
    expect(writeResultWords({ status: "under-review" })).toContain(
      "until a person looks at it",
    );
  });

  it("rounds a wait up to hours, then days", () => {
    expect(waitWords(60)).toBe("1 hour");
    expect(waitWords(5 * 3600)).toBe("5 hours");
    expect(waitWords(25 * 3600)).toBe("2 days");
  });
});

describe("matchCourses", () => {
  const row = (code: string, title: string): CourseSearchRow => [
    code,
    title,
    3,
    3,
    [],
  ];
  const rows = [
    row("CMSC131", "Object-Oriented Programming I"),
    row("CMSC351", "Algorithms"),
    row("MATH401", "Applications of Linear Algebra"),
    row("STAT400", "Applied Probability and Statistics I"),
  ];
  const codes = (q: string) => matchCourses(rows, q).map((r) => r[0]);

  it("finds by code, with or without the space, in any case", () => {
    expect(codes("cmsc3")).toEqual(["CMSC351"]);
    expect(codes("CMSC 351")).toEqual(["CMSC351"]);
    expect(codes("cmsc")).toEqual(["CMSC131", "CMSC351"]);
  });

  it("finds by every word of the title, after the codes", () => {
    expect(codes("algebra linear")).toEqual(["MATH401"]);
    expect(codes("appl")).toEqual(["MATH401", "STAT400"]);
    expect(codes("   ")).toEqual([]);
  });
});
