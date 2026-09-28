import { describe, expect, it } from "vitest";
import {
  ReviewsHomeSearchSchema,
  ReviewsPageSearchSchema,
} from "./reviews-url";

describe("Reviews' search params", () => {
  it("keeps text, reading a number the router parsed back as text", () => {
    expect(ReviewsHomeSearchSchema.parse({ q: "CMSC" })).toEqual({ q: "CMSC" });
    expect(ReviewsHomeSearchSchema.parse({ q: 351 })).toEqual({ q: "351" });
    expect(ReviewsPageSearchSchema.parse({ course: "CMSC351" })).toEqual({
      course: "CMSC351",
    });
    // "Review your instructors" opens the form with `?write=1`.
    expect(ReviewsPageSearchSchema.parse({ write: 1 })).toEqual({ write: "1" });
  });

  it("drops a bad value instead of failing the page", () => {
    expect(ReviewsHomeSearchSchema.parse({ q: "x".repeat(201) })).toEqual({});
    expect(ReviewsPageSearchSchema.parse({ course: ["a"] })).toEqual({});
  });
});
