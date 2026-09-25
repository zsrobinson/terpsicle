import { describe, expect, it } from "vitest";
import {
  aGenerateRequest,
  aPlan,
  aPlanCourse,
  aSavedCourse,
  demoPlan,
  fixtureTermId,
  mockCourses,
} from "~/fixtures";
import { buildCatalogIndex, snapshotOf } from "../catalog/catalog-index";
import type { GeneratedPlan } from "../schema";
import { changesFrom, resultCourses } from "./result-plan";

const index = buildCatalogIndex(fixtureTermId, mockCourses());

const result = (
  sections: GeneratedPlan["sections"],
  skipped: GeneratedPlan["skipped"] = [],
): GeneratedPlan => ({
  id: [...sections].sort().join(","),
  sections,
  skipped,
  score: 1,
  breakdown: {
    compact: 1,
    "fewer-days": 1,
    "later-starts": 1,
    "best-rated": 1,
    "higher-gpa": 1,
    "safest-seats": 1,
  },
  stats: {
    credits: 6,
    daysOnCampus: 3,
    firstClass: 600,
    lastClass: 900,
    avgRating: null,
    avgGpa: null,
    fewestOpenSeats: null,
  },
  equivalents: { count: 1, byCourse: [] },
});

describe("resultCourses", () => {
  const request = aGenerateRequest({
    items: [
      { kind: "course", courseCode: "CMSC351", required: true },
      { kind: "course", courseCode: "ENGL393", required: false },
      {
        kind: "pick",
        id: "hum",
        count: 1,
        courses: [{ courseCode: "MUSC130" }, { courseCode: "PHIL140" }],
      },
    ],
  });

  it("places the sections with snapshots and saves left-out optional courses", () => {
    const courses = resultCourses(
      result(["CMSC351-0301", "MUSC130-0201"], ["ENGL393", "PHIL140"]),
      request,
      index,
    );
    const section = index.sections.get("CMSC351-0301")?.section;
    if (!section) throw new Error("the mock term lacks CMSC351 0301");
    expect(courses).toEqual([
      {
        courseCode: "CMSC351",
        sectionCode: "0301",
        snapshot: snapshotOf(section),
      },
      expect.objectContaining({ courseCode: "MUSC130", sectionCode: "0201" }),
      { courseCode: "ENGL393", sectionCode: null, snapshot: null },
    ]);
  });

  it("skips sections the catalog no longer has", () => {
    expect(resultCourses(result(["CMSC351-9999"]), request, index)).toEqual([]);
  });
});

describe("changesFrom", () => {
  it("names every kind of change, result order first", () => {
    const plan = aPlan({
      courses: [
        aPlanCourse({ courseCode: "CMSC351", sectionCode: "0101" }),
        aPlanCourse({ courseCode: "CMSC330", sectionCode: "0103" }),
        aSavedCourse("MUSC130"),
        aPlanCourse({ courseCode: "STAT400", sectionCode: "0101" }),
        aPlanCourse({ courseCode: "ECON200", sectionCode: "0101" }),
      ],
    });
    const next = [
      aPlanCourse({ courseCode: "CMSC351", sectionCode: "0301" }),
      aPlanCourse({ courseCode: "CMSC330", sectionCode: "0103" }),
      aPlanCourse({ courseCode: "MUSC130", sectionCode: "0201" }),
      aPlanCourse({ courseCode: "ENGL393", sectionCode: "0312" }),
      aSavedCourse("STAT400"),
    ];
    expect(changesFrom(plan, next)).toEqual([
      { kind: "switched", courseCode: "CMSC351", from: "0101", to: "0301" },
      { kind: "placed", courseCode: "MUSC130", to: "0201" },
      { kind: "added", courseCode: "ENGL393", to: "0312" },
      { kind: "unplaced", courseCode: "STAT400", from: "0101" },
      { kind: "dropped", courseCode: "ECON200", from: "0101" },
    ]);
  });

  it("finds nothing when the result matches the plan", () => {
    expect(changesFrom(demoPlan, demoPlan.courses)).toEqual([]);
  });
});
