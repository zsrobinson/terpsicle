import { describe, expect, it } from "vitest";
import {
  newestPerCourse,
  type PlanetTerpReviewRecord,
  planetTerpReviewRecords,
  type ReviewApi,
} from "./reviews";

const record = (
  id: string,
  course: string | null,
  created: string,
): PlanetTerpReviewRecord => ({
  id,
  course,
  rating: 4,
  expectedGrade: null,
  body: `Review ${id}`,
  created,
});

describe("newestPerCourse", () => {
  it("keeps each course's newest few, newest first, and none without a course", () => {
    const kept = newestPerCourse(
      [
        record("a", "CMSC351", "2026-01-01T00:00:00Z"),
        record("b", "CMSC351", "2026-04-01T00:00:00Z"),
        record("c", "CMSC351", "2026-03-01T00:00:00Z"),
        record("d", "CMSC351", "2026-02-01T00:00:00Z"),
        record("e", "CMSC451", "2025-12-01T00:00:00Z"),
        record("f", null, "2026-05-01T00:00:00Z"),
      ],
      3,
    );
    expect(kept.map((r) => r.id)).toEqual(["b", "c", "d", "e"]);
  });
});

describe("planetTerpReviewRecords", () => {
  const raw = (text: string, course: string, created: string): ReviewApi => ({
    course,
    review: text,
    rating: 4,
    expected_grade: "A",
    created,
  });
  const reviews = [
    raw("First and oldest.", "CMSC351", "2025-01-01T00:00:00"),
    raw("Second.", "CMSC351", "2025-06-01T00:00:00"),
    raw("Third.", "CMSC351", "2026-01-01T00:00:00"),
    raw("Newest.", "CMSC351", "2026-04-01T00:00:00"),
  ];

  it("keeps every review unless asked for fewer, and hashes what it keeps", async () => {
    const all = await planetTerpReviewRecords("kruskal", reviews);
    const few = await planetTerpReviewRecords("kruskal", reviews, 3);
    expect(all.records).toHaveLength(4);
    expect(few.records.map((r) => r.body)).toEqual([
      "Newest.",
      "Third.",
      "Second.",
    ]);
    // A different set stored is a different hash: the night after the
    // pages go off, each instructor is rewritten with only these.
    expect(few.hash).not.toBe(all.hash);
  });
});
