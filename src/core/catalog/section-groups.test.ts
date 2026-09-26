import { describe, expect, it } from "vitest";
import { aCourse, aSection, mockCourse } from "~/fixtures";
import {
  bySectionCode,
  groupSectionsByInstructor,
  hasGroupHeaders,
  MANY_SECTIONS,
  sectionCountSize,
} from "./section-groups";

const codes = (sections: readonly { code: string }[]) =>
  sections.map((s) => s.code);

describe("sectionCountSize", () => {
  it("is one, a few, or many", () => {
    expect(sectionCountSize(0)).toBe("one");
    expect(sectionCountSize(1)).toBe("one");
    expect(sectionCountSize(2)).toBe("few");
    expect(sectionCountSize(MANY_SECTIONS)).toBe("few");
    expect(sectionCountSize(MANY_SECTIONS + 1)).toBe("many");
  });
});

describe("groupSectionsByInstructor: one level, by professor", () => {
  it("sorts sections by code within a group, and groups by their lowest code", () => {
    const course = aCourse({
      sections: [
        aSection({ code: "0401", instructors: ["Zed Zulu"] }),
        aSection({ code: "FC01", instructors: ["Amy Alpha"] }),
        aSection({ code: "0201", instructors: ["Amy Alpha"] }),
        aSection({ code: "0101", instructors: ["Zed Zulu"] }),
      ],
    });
    const groups = groupSectionsByInstructor(course);
    expect(groups.map((g) => [g.name, codes(g.sections)])).toEqual([
      ["Zed Zulu", ["0101", "0401"]],
      ["Amy Alpha", ["0201", "FC01"]],
    ]);
    // The course itself is left as it was.
    expect(codes(course.sections)).toEqual(["0401", "FC01", "0201", "0101"]);
  });

  it("gives headers only when there's more than one professor", () => {
    const one = groupSectionsByInstructor(
      aCourse({
        sections: [aSection({ code: "0101" }), aSection({ code: "0102" })],
      }),
    );
    expect(one).toHaveLength(1);
    expect(hasGroupHeaders(one)).toBe(false);
    // A TBA section next to a named one is a second group.
    const withTba = groupSectionsByInstructor(
      aCourse({
        sections: [
          aSection({ code: "0101" }),
          aSection({ code: "0201", instructors: [] }),
        ],
      }),
    );
    expect(withTba.map((g) => g.name)).toEqual(["Ada Brandt", ""]);
    expect(hasGroupHeaders(withTba)).toBe(true);
  });

  it("keeps many all-TBA sections in one header-less group (ENGL101)", () => {
    const course = mockCourse("ENGL101");
    expect(course.sections.length).toBeGreaterThan(MANY_SECTIONS);
    const groups = groupSectionsByInstructor(course);
    expect(groups.map((g) => g.name)).toEqual([""]);
    expect(hasGroupHeaders(groups)).toBe(false);
    expect(groups[0]?.sections).toEqual(
      [...course.sections].sort(bySectionCode),
    );
  });

  it("lists every section once, with no lecture layer (CMSC330)", () => {
    const course = mockCourse("CMSC330");
    const groups = groupSectionsByInstructor(course);
    expect(hasGroupHeaders(groups)).toBe(true);
    const listed = groups.flatMap((g) => codes(g.sections));
    expect([...listed].sort()).toEqual(codes(course.sections).sort());
    for (const g of groups)
      expect(codes(g.sections)).toEqual([...codes(g.sections)].sort());
  });
});
