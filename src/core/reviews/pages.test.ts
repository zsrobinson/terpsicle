import { describe, expect, it } from "vitest";
import {
  aCourse,
  aCourseIndexEntry,
  aGradeRecord,
  anInstructor,
  aPlanetTerpDept,
  aSection,
  aTerm,
  someCourseGrades,
  someGrades,
} from "~/fixtures";
import { coursePageData, instructorPageData } from "./pages";
import { buildPlanetTerpIndex } from "./planetterp-index";

const kruskal = anInstructor({ slug: "kruskal", name: "Clyde Kruskal" });
const cmsc = aPlanetTerpDept({
  instructors: { brandt: anInstructor(), kruskal },
  names: { "ada brandt": "brandt", "clyde kruskal": "kruskal" },
  courses: {
    CMSC351: someCourseGrades({
      byInstructor: {
        brandt: aGradeRecord(),
        kruskal: aGradeRecord({ counts: someGrades({ A: 500 }) }),
      },
    }),
    CMSC250: someCourseGrades({ byInstructor: { kruskal: aGradeRecord() } }),
  },
});
const math = aPlanetTerpDept({
  dept: "MATH",
  instructors: { kruskal },
  names: {},
  courses: { MATH141: someCourseGrades({ byInstructor: {} }) },
});

describe("buildPlanetTerpIndex", () => {
  it("lists every instructor with each department that lists them", () => {
    const index = buildPlanetTerpIndex([math, cmsc], new Map());
    expect(index.instructors).toEqual({
      brandt: ["Ada Brandt", ["CMSC"]],
      kruskal: ["Clyde Kruskal", ["CMSC", "MATH"]],
    });
  });

  it("ranks professors by reviews, leaving out TAs and the unreviewed", () => {
    const index = buildPlanetTerpIndex(
      [
        aPlanetTerpDept({
          instructors: {
            brandt: anInstructor({ reviewCount: 61, rating: 4.2 }),
            kruskal: anInstructor({
              slug: "kruskal",
              name: "Clyde Kruskal",
              reviewCount: 111,
              rating: 2.6,
            }),
            ta: anInstructor({ slug: "ta", type: "ta", reviewCount: 500 }),
            quiet: anInstructor({ slug: "quiet", reviewCount: 0 }),
          },
        }),
      ],
      new Map(),
    );
    expect(index.mostReviewed).toEqual([
      ["kruskal", "Clyde Kruskal", 111, 2.6],
      ["brandt", "Ada Brandt", 61, 4.2],
    ]);
  });

  it("ranks courses offered now by students, and leaves out the rest", () => {
    const index = buildPlanetTerpIndex(
      [
        aPlanetTerpDept({
          courses: {
            CMSC351: someCourseGrades({
              all: aGradeRecord({ counts: someGrades({ A: 900 }) }),
            }),
            CMSC250: someCourseGrades(),
            CMSC999: someCourseGrades({
              all: aGradeRecord({ counts: someGrades({ A: 5000 }) }),
            }),
          },
        }),
      ],
      new Map([
        ["CMSC351", "Algorithms"],
        ["CMSC250", "Discrete Structures"],
      ]),
    );
    expect(index.mostTaken.map(([code, title]) => [code, title])).toEqual([
      ["CMSC351", "Algorithms"],
      ["CMSC250", "Discrete Structures"],
    ]);
  });
});

describe("coursePageData", () => {
  const term = aTerm({ id: "202608", name: "Fall 2026" });

  it("puts this term's instructors first, joined to PlanetTerp by name", () => {
    const data = coursePageData({
      code: "CMSC351",
      entry: aCourseIndexEntry(),
      current: {
        term,
        course: aCourse({
          sections: [aSection({ instructors: ["Clyde Kruskal", "Pat New"] })],
        }),
      },
      ptDept: cmsc,
      gradesThrough: "202501",
      source: null,
      terpsicle: null,
    });
    expect(data?.title).toBe("Algorithms");
    expect(data?.term).toEqual({ id: "202608", name: "Fall 2026" });
    expect(data?.instructors.map((r) => [r.name, r.id, r.teaching])).toEqual([
      ["Clyde Kruskal", "kruskal", true],
      ["Pat New", null, true],
      ["Ada Brandt", "brandt", false],
    ]);
  });

  it("is null (a 404) when nothing published knows the course", () => {
    expect(
      coursePageData({
        code: "CMSC999",
        entry: null,
        current: { term, course: null },
        ptDept: cmsc,
        gradesThrough: null,
        source: null,
        terpsicle: null,
      }),
    ).toBeNull();
  });
});

describe("instructorPageData", () => {
  it("gathers their courses across departments, most students first", () => {
    const data = instructorPageData({
      id: "kruskal",
      course: null,
      ptDepts: [cmsc, math],
      registryName: null,
      gradesThrough: "202501",
      source: null,
      terpsicle: null,
    });
    expect(data?.name).toBe("Clyde Kruskal");
    expect(data?.depts).toEqual(["CMSC", "MATH"]);
    expect(data?.courses.map((c) => c.code)).toEqual(["CMSC351", "CMSC250"]);
  });

  it("is null (a 404) for an id no file or registry knows", () => {
    expect(
      instructorPageData({
        id: "clyde-kruskal",
        course: null,
        ptDepts: [cmsc],
        registryName: null,
        gradesThrough: null,
        source: null,
        terpsicle: null,
      }),
    ).toBeNull();
  });

  it("knows a minted instructor from the registry alone", () => {
    const data = instructorPageData({
      id: "t~abcdefghij",
      course: "CMSC351",
      ptDepts: [cmsc],
      registryName: "Pat New",
      gradesThrough: null,
      source: null,
      terpsicle: { rating: 5, reviewCount: 1 },
    });
    expect(data?.name).toBe("Pat New");
    expect(data?.planetTerp).toBeNull();
    expect(data?.courses).toEqual([]);
  });
});
