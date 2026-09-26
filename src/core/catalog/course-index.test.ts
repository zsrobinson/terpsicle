import { describe, expect, it } from "vitest";
import { CourseSearchFileSchema } from "~/core/schema";
import {
  aCourse,
  archivedFixtureTermId,
  aTerm,
  fixtureTermId,
} from "~/fixtures";
import {
  buildCourseIndexDept,
  buildCourseSearchFile,
  courseIndexTermOrder,
  courseSearchRow,
} from "./course-index";

describe("courseIndexTermOrder", () => {
  it("puts active terms first, each group newest first", () => {
    const terms = [
      aTerm({ id: "202612", status: "active" }),
      aTerm({ id: "202701", status: "archived" }),
      aTerm({ id: "202608", status: "active" }),
      aTerm({ id: "202605", status: "archived" }),
    ];
    expect(courseIndexTermOrder(terms)).toEqual([
      "202612",
      "202608",
      "202701",
      "202605",
    ]);
  });
});

describe("buildCourseIndexDept", () => {
  it("takes a course's text from the first source and every term from all of them", () => {
    const dept = buildCourseIndexDept("CMSC", [
      {
        termId: "202608",
        courses: [aCourse({ code: "CMSC351", title: "Algorithms (new)" })],
      },
      {
        termId: "202701",
        courses: [
          aCourse({ code: "CMSC351", title: "Algorithms" }),
          aCourse({ code: "CMSC131", title: "Object-Oriented Programming I" }),
        ],
      },
      { termId: "202605", courses: [aCourse({ code: "CMSC351" })] },
    ]);
    expect(dept.courses.map((c) => [c.code, c.title, c.offered])).toEqual([
      ["CMSC131", "Object-Oriented Programming I", ["202701"]],
      ["CMSC351", "Algorithms (new)", ["202701", "202608", "202605"]],
    ]);
  });

  it("keeps gen-ed groups with their conditions and reads the prerequisite", () => {
    const genEds = [
      [{ code: "DSNL", condition: "if taken with GEOL110" }, { code: "DSNS" }],
      [{ code: "SCIS" }],
    ];
    const [entry] = buildCourseIndexDept("GEOL", [
      {
        termId: fixtureTermId,
        courses: [
          aCourse({
            code: "GEOL100",
            genEds,
            prerequisite: "MATH115 or MATH140.",
            crossListings: ["ENSP100"],
          }),
        ],
      },
    ]).courses;
    expect(entry?.genEds).toEqual(genEds);
    expect(entry?.prereqs).toEqual({
      groups: [["MATH115", "MATH140"]],
      complete: true,
    });
    expect(entry?.crossListings).toEqual(["ENSP100"]);
  });

  it("leaves out courses from other departments and counts a term once", () => {
    const dept = buildCourseIndexDept("CMSC", [
      {
        termId: archivedFixtureTermId,
        courses: [
          aCourse({ code: "CMSC216" }),
          aCourse({ code: "CMSC216" }),
          aCourse({ code: "MATH140" }),
        ],
      },
    ]);
    expect(dept.courses.map((c) => [c.code, c.offered])).toEqual([
      ["CMSC216", [archivedFixtureTermId]],
    ]);
  });
});

describe("search rows", () => {
  it("flattens gen-eds to each code once, and sorts by code", () => {
    const { courses } = buildCourseIndexDept("GEOL", [
      {
        termId: fixtureTermId,
        courses: [
          aCourse({
            code: "GEOL120",
            title: "Environmental Geology",
            credits: { min: 3, max: 4 },
            genEds: [
              [
                { code: "DSNL", condition: "if taken with GEOL110" },
                { code: "DSNS" },
              ],
              [{ code: "DSNS" }],
            ],
          }),
          aCourse({ code: "GEOL100", title: "Physical Geology" }),
        ],
      },
    ]);
    const rows = courses.map(courseSearchRow);
    const file = buildCourseSearchFile([...rows].reverse());
    expect(file.courses).toEqual([
      ["GEOL100", "Physical Geology", 3, 3, []],
      ["GEOL120", "Environmental Geology", 3, 4, ["DSNL", "DSNS"]],
    ]);
    expect(CourseSearchFileSchema.safeParse(file).success).toBe(true);
  });
});
