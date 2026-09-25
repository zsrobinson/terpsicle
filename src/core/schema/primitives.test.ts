import { describe, expect, it } from "vitest";
import {
  CourseCodeSchema,
  DaysSchema,
  parseSectionKey,
  SectionKeySchema,
  sectionKey,
  TermIdSchema,
} from "./primitives";

describe("section keys", () => {
  it("round-trips course and section codes", () => {
    const key = sectionKey("CMSC351", "0101");
    expect(key).toBe("CMSC351-0101");
    expect(parseSectionKey(key)).toEqual({
      courseCode: "CMSC351",
      sectionCode: "0101",
    });
  });

  it("handles suffixed courses and alphanumeric sections", () => {
    expect(parseSectionKey("CMSC389N-FC01")).toEqual({
      courseCode: "CMSC389N",
      sectionCode: "FC01",
    });
  });

  it("rejects things that aren't section keys", () => {
    for (const bad of [
      "CMSC351",
      "CMSC351-",
      "cmsc351-0101",
      "CMSC351 0101",
      "CMSC351-0101-2",
    ]) {
      expect(parseSectionKey(bad)).toBeNull();
      expect(SectionKeySchema.safeParse(bad).success).toBe(false);
    }
  });
});

describe("primitives", () => {
  it("accepts every term month code and nothing else", () => {
    for (const ok of ["202701", "202605", "202608", "202612"])
      expect(TermIdSchema.safeParse(ok).success).toBe(true);
    for (const bad of ["202702", "20270", "2027-01", "spring"])
      expect(TermIdSchema.safeParse(bad).success).toBe(false);
  });

  it("validates course codes", () => {
    expect(CourseCodeSchema.safeParse("ENGL393").success).toBe(true);
    expect(CourseCodeSchema.safeParse("CMSC389N").success).toBe(true);
    expect(CourseCodeSchema.safeParse("CMSC35").success).toBe(false);
  });

  it("requires days unique and in week order", () => {
    expect(DaysSchema.safeParse(["M", "W", "F"]).success).toBe(true);
    expect(DaysSchema.safeParse(["Tu", "Th", "Sa"]).success).toBe(true);
    expect(DaysSchema.safeParse(["W", "M"]).success).toBe(false);
    expect(DaysSchema.safeParse(["M", "M"]).success).toBe(false);
  });
});
