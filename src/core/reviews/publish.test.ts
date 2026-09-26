import { describe, expect, it } from "vitest";
import { ReviewsDeptSchema } from "~/core/schema";
import {
  buildReviewsDepts,
  combinedRatingWords,
  combineRatings,
  type PublishedReviewFact,
} from "./index";

const review = (
  overrides: Partial<PublishedReviewFact> = {},
): PublishedReviewFact => ({
  instructorId: "kruskal",
  course: "CMSC351",
  rating: 4,
  publishedAt: "2026-10-12T15:00:00.000Z",
  ...overrides,
});

describe("combineRatings", () => {
  it("weights each source by its count (V2 §7.6's example)", () => {
    const combined = combineRatings([
      { source: "planetterp", rating: 4.1, reviewCount: 48 },
      { source: "terpsicle", rating: 4.6, reviewCount: 13 },
    ]);
    expect(combined.reviewCount).toBe(61);
    expect(combined.rating).toBeCloseTo((4.1 * 48 + 4.6 * 13) / 61, 10);
    expect(combinedRatingWords(combined)).toBe(
      "4.2 from 61 reviews: 4.1 from 48 on PlanetTerp, 4.6 from 13 on Terpsicle",
    );
  });

  it("leaves out a source with no reviews", () => {
    const combined = combineRatings([
      { source: "planetterp", rating: null, reviewCount: 0 },
      { source: "terpsicle", rating: 5, reviewCount: 1 },
    ]);
    expect(combined).toEqual({
      rating: 5,
      reviewCount: 1,
      parts: [{ source: "terpsicle", rating: 5, reviewCount: 1 }],
    });
    expect(combinedRatingWords(combined)).toBe(
      "5.0 from 1 review on Terpsicle",
    );
  });

  it("is null with no reviews anywhere", () => {
    const combined = combineRatings([
      { source: "planetterp", rating: null, reviewCount: 0 },
    ]);
    expect(combined.rating).toBeNull();
    expect(combined.reviewCount).toBe(0);
    expect(combinedRatingWords(combined)).toBe("No reviews yet");
  });
});

describe("buildReviewsDepts", () => {
  it("publishes numbers across every course, in each department reviewed", () => {
    const depts = buildReviewsDepts(
      [
        review({ rating: 5, course: "CMSC351" }),
        review({
          rating: 4,
          course: "MATH141",
          publishedAt: "2026-11-01T02:00:00.000Z",
        }),
        review({ rating: 4, course: "CMSC451" }),
      ],
      [],
    );
    const numbers = {
      rating: 4.33,
      reviewCount: 3,
      // 10pm on October 31 in New York.
      latestReviewMonth: "2026-10",
    };
    expect(depts).toEqual([
      {
        schemaVersion: 1,
        dept: "CMSC",
        instructors: { kruskal: numbers },
        names: {},
      },
      {
        schemaVersion: 1,
        dept: "MATH",
        instructors: { kruskal: numbers },
        names: {},
      },
    ]);
    for (const d of depts) ReviewsDeptSchema.parse(d);
  });

  it("names minted instructors once they have a review, and the owner's fixes always", () => {
    const depts = buildReviewsDepts(
      [review({ instructorId: "t~abcde23456", rating: 3 })],
      [
        {
          nameKey: "pat quill",
          dept: "CMSC",
          instructorId: "t~abcde23456",
          rule: "minted",
        },
        // Minted, but every review of them is held or removed.
        {
          nameKey: "sam unpublished",
          dept: "CMSC",
          instructorId: "t~zzzzz23456",
          rule: "minted",
        },
        // PlanetTerp's own join isn't repeated.
        {
          nameKey: "clyde kruskal",
          dept: "CMSC",
          instructorId: "kruskal",
          rule: "planetterp",
        },
        {
          nameKey: "d. hamilton",
          dept: "ENGL",
          instructorId: "hamilton_douglas",
          rule: "manual",
        },
      ],
    );
    expect(depts).toEqual([
      {
        schemaVersion: 1,
        dept: "CMSC",
        instructors: {
          "t~abcde23456": {
            rating: 3,
            reviewCount: 1,
            latestReviewMonth: "2026-10",
          },
        },
        names: { "pat quill": "t~abcde23456" },
      },
      {
        schemaVersion: 1,
        dept: "ENGL",
        instructors: {},
        names: { "d. hamilton": "hamilton_douglas" },
      },
    ]);
  });

  it("is the same bytes whatever order the rows come in", () => {
    const rows = [
      review({ instructorId: "b" }),
      review({ instructorId: "a", course: "MATH140" }),
      review({ instructorId: "c", course: "ENGL101" }),
    ];
    const names = [
      {
        nameKey: "zed",
        dept: "CMSC",
        instructorId: "b",
        rule: "manual" as const,
      },
      {
        nameKey: "amy",
        dept: "CMSC",
        instructorId: "a",
        rule: "manual" as const,
      },
    ];
    expect(JSON.stringify(buildReviewsDepts(rows, names))).toBe(
      JSON.stringify(
        buildReviewsDepts([...rows].reverse(), [...names].reverse()),
      ),
    );
  });

  it("publishes nothing without published reviews or names", () => {
    expect(buildReviewsDepts([], [])).toEqual([]);
  });
});
