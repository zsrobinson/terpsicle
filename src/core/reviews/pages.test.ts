import { describe, expect, it } from "vitest";
import { GRADE_KEYS, type GradeKey } from "~/core/schema";
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
import { coursePageData, courseTermGroups, instructorPageData } from "./pages";
import { buildPlanetTerpIndex } from "./planetterp-index";

/** Every grade a given one. */
const only = (key: GradeKey, n: number) =>
  someGrades(Object.fromEntries(GRADE_KEYS.map((k) => [k, k === key ? n : 0])));

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
      brandt: ["Ada Brandt", ["CMSC"], 61],
      kruskal: ["Clyde Kruskal", ["CMSC", "MATH"], 61],
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

  it("counts totals as PlanetTerp's front page does: its whole list, and its grade rows", () => {
    const whole = { professors: 14_496, reviews: 47_926, gradeRows: 177_000 };
    expect(
      buildPlanetTerpIndex([math, cmsc], new Map()).totals,
    ).toBeUndefined();
    const totals = buildPlanetTerpIndex([math, cmsc], new Map(), whole).totals;
    // Professors and reviews are the whole list's, not only the files'.
    expect(totals).toMatchObject({
      courses: 3,
      professors: 14_496,
      reviews: 47_926,
      grades: 177_000,
    });
    // A course without grades counts as a course, and adds no grades.
    const noGrades = aPlanetTerpDept({
      dept: "ENGL",
      courses: { ENGL101: { all: null, byInstructor: {} } },
    });
    const withIt = buildPlanetTerpIndex(
      [math, cmsc, noGrades],
      new Map(),
      whole,
    ).totals;
    expect(withIt?.courses).toBe(4);
    expect(withIt?.counts).toEqual(totals?.counts);
    expect(totals?.counts.reduce((a, b) => a + b, 0)).toBe(
      [cmsc.courses.CMSC351, cmsc.courses.CMSC250, math.courses.MATH141]
        .flatMap((c) => c?.all?.counts ?? [])
        .reduce((a, b) => a + b, 0),
    );
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

  it("groups who taught it by the newest term each did, like PlanetTerp", () => {
    const dept = aPlanetTerpDept({
      instructors: {
        brandt: anInstructor({ reviewCount: 61 }),
        kruskal: anInstructor({
          slug: "kruskal",
          name: "Clyde Kruskal",
          reviewCount: 111,
        }),
        old: anInstructor({ slug: "old", name: "Jo Old", reviewCount: 3 }),
      },
      names: {
        "ada brandt": "brandt",
        "clyde kruskal": "kruskal",
        "jo old": "old",
      },
      courses: {
        CMSC351: someCourseGrades({
          byInstructor: {
            brandt: aGradeRecord({
              latestTermId: "202601",
              counts: only("A", 10),
            }),
            kruskal: aGradeRecord({
              latestTermId: "202601",
              counts: only("C", 10),
            }),
            old: aGradeRecord({ latestTermId: "201808" }),
          },
        }),
        // Brandt grades harder elsewhere: their average is every course's.
        CMSC132: someCourseGrades({
          byInstructor: {
            brandt: aGradeRecord({
              counts: only("C", 10),
            }),
          },
        }),
      },
    });
    const data = coursePageData({
      code: "CMSC351",
      entry: aCourseIndexEntry(),
      current: {
        term,
        course: aCourse({
          sections: [aSection({ instructors: ["Pat New"] })],
        }),
      },
      ptDept: dept,
      gradesThrough: "202601",
      source: null,
      terpsicle: null,
    });
    if (!data) throw new Error("no page");
    const groups = courseTermGroups(data);
    expect(groups.map((g) => [g.termId, g.rows.map((r) => r.name)])).toEqual([
      ["202608", ["Pat New"]],
      // The most reviewed first.
      ["202601", ["Clyde Kruskal", "Ada Brandt"]],
      ["201808", ["Jo Old"]],
    ]);
    const brandt = data.instructors.find((r) => r.id === "brandt");
    expect(brandt?.gpa).toBeCloseTo(4);
    expect(brandt?.overallGpa).toBeCloseTo(3);
  });

  it("lists everyone under every term our history has them", () => {
    const data = coursePageData({
      code: "CMSC351",
      entry: aCourseIndexEntry(),
      current: {
        term,
        course: aCourse({
          sections: [aSection({ instructors: ["Clyde Kruskal"] })],
        }),
      },
      ptDept: cmsc,
      gradesThrough: "202501",
      source: null,
      terpsicle: null,
      offerings: [
        { termId: "202608", instructors: ["Clyde Kruskal"] },
        { termId: "202601", instructors: ["Ada Brandt", "Clyde Kruskal"] },
        // Before PlanetTerp knew them: a row of their own, no id.
        { termId: "201908", instructors: ["Jo Early"] },
      ],
    });
    if (!data) throw new Error("no page");
    expect(
      courseTermGroups(data).map((g) => [g.termId, g.rows.map((r) => r.name)]),
    ).toEqual([
      ["202608", ["Clyde Kruskal"]],
      ["202601", ["Ada Brandt", "Clyde Kruskal"]],
      ["201908", ["Jo Early"]],
    ]);
    expect(data.instructors.find((r) => r.name === "Jo Early")).toMatchObject({
      id: null,
      teaching: false,
      lastTermId: "201908",
    });
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
