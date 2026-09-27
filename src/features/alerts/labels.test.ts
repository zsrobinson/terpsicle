import { describe, expect, it } from "vitest";
import { courseHref } from "./labels";

describe("courseHref", () => {
  it("opens the section's course details in its term", () => {
    expect(courseHref("202701", "CMSC351-0101")).toBe(
      "/schedule/course/CMSC351?term=202701",
    );
  });

  it("opens the term's Courses for a key it can't read", () => {
    expect(courseHref("202701", "nonsense")).toBe(
      "/schedule/courses?term=202701",
    );
  });
});
