import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { COURSE_COLORS, type CourseColor } from "../schema";
import {
  COURSE_COLOR_LABELS,
  courseColorTokens,
  defaultCourseColor,
  resolveCourseColors,
} from "./color";

describe("course colors", () => {
  it("labels every palette color", () => {
    expect(Object.keys(COURSE_COLOR_LABELS)).toEqual([...COURSE_COLORS]);
  });

  it("names theme tokens, never raw colors", () => {
    expect(courseColorTokens("blue")).toEqual({
      bg: "course-blue-bg",
      border: "course-blue-border",
      fg: "course-blue-fg",
      dot: "course-blue-dot",
    });
  });

  it("is stable per course code", () => {
    expect(defaultCourseColor("CMSC351", [])).toBe(
      defaultCourseColor("CMSC351", []),
    );
    const firsts = new Set(
      ["CMSC131", "CMSC132", "CMSC216", "CMSC250", "CMSC330", "CMSC351"].map(
        (c) => defaultCourseColor(c, []),
      ),
    );
    expect(firsts.size).toBeGreaterThan(2);
  });

  it("picks a color the plan uses least", () => {
    fc.assert(
      fc.property(
        fc.stringMatching(/^[A-Z]{4}\d{3}$/),
        fc.array(fc.constantFrom(...COURSE_COLORS), { maxLength: 25 }),
        (code, used) => {
          const pick = defaultCourseColor(code, used);
          const uses = (c: CourseColor) => used.filter((u) => u === c).length;
          expect(Math.min(...COURSE_COLORS.map(uses))).toBe(uses(pick));
        },
      ),
    );
  });

  it("avoids colors already in the plan", () => {
    const used = COURSE_COLORS.filter((c) => c !== "teal");
    expect(defaultCourseColor("CMSC351", used)).toBe("teal");
  });
});

describe("resolveCourseColors", () => {
  it("keeps stored colors and gives every other course a distinct one", () => {
    const colors = resolveCourseColors(
      ["ENEE322", "ECON306", "BIOE221", "BMGT220"],
      { ECON306: "green" },
    );
    expect(colors.ECON306).toBe("green");
    expect(new Set(Object.values(colors)).size).toBe(4);
  });

  it("stays distinct for up to a palette's worth of uncolored courses", () => {
    fc.assert(
      fc.property(
        fc.uniqueArray(fc.stringMatching(/^[A-Z]{4}\d{3}$/), {
          maxLength: COURSE_COLORS.length,
        }),
        (codes) => {
          const colors = resolveCourseColors(codes, {});
          expect(new Set(Object.values(colors)).size).toBe(codes.length);
        },
      ),
    );
  });

  it("gives the same answer for the same plan", () => {
    const codes = ["CMSC351", "CMSC330", "STAT400"];
    expect(resolveCourseColors(codes, {})).toEqual(
      resolveCourseColors(codes, {}),
    );
  });
});
