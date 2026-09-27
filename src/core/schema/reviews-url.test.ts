import { describe, expect, it } from "vitest";
import { InstructorSearchSchema, ReviewsHomeSearchSchema } from "./reviews-url";

describe("Reviews' search params", () => {
  it("keeps text, reading a number the router parsed back as text", () => {
    expect(ReviewsHomeSearchSchema.parse({ q: "CMSC" })).toEqual({ q: "CMSC" });
    expect(ReviewsHomeSearchSchema.parse({ q: 351 })).toEqual({ q: "351" });
    expect(InstructorSearchSchema.parse({ course: "CMSC351" })).toEqual({
      course: "CMSC351",
    });
  });

  it("drops a bad value instead of failing the page", () => {
    expect(ReviewsHomeSearchSchema.parse({ q: "x".repeat(201) })).toEqual({});
    expect(InstructorSearchSchema.parse({ course: ["a"] })).toEqual({});
  });
});
