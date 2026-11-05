import { describe, expect, it } from "vitest";
import {
  aCourse,
  aGradeRecord,
  anInstructor,
  anUntimedMeeting,
  aPlanetTerpDept,
  aSection,
  aTbaMeeting,
  aTimedMeeting,
  someCourseGrades,
} from "~/fixtures";
import {
  genEdWords,
  gradesByInstructor,
  gradesView,
  instructorRef,
  instructorWords,
  meetingText,
  sectionView,
  termSummary,
} from "./views";

// The MCP server's answers (docs/MCP.md): sections, instructors, gen-eds
// and grades in words an agent reads.

describe("views", () => {
  it("says a meeting as a person would read it", () => {
    expect(meetingText(aTimedMeeting())).toBe("MWF 10am–10:50am · IRB 0324");
    expect(
      meetingText(
        aTimedMeeting({ kind: "discussion", building: null, room: null }),
      ),
    ).toBe("MWF 10am–10:50am · room TBA · discussion");
    expect(meetingText(anUntimedMeeting())).toBe("Online, no set times");
    expect(meetingText(aTbaMeeting())).toBe(
      "Times TBA · ESJ 2101 · discussion",
    );
    expect(
      meetingText(aTimedMeeting({ online: true, building: null, room: null })),
    ).toBe("MWF 10am–10:50am · online");
  });

  it("joins an instructor to PlanetTerp, or says it couldn't", () => {
    const dept = aPlanetTerpDept({
      instructors: { brandt: anInstructor({ rating: 4.2345 }) },
    });
    expect(instructorRef("Ada Brandt", dept)).toEqual({
      name: "Ada Brandt",
      slug: "brandt",
      rating: 4.23,
      reviews: 61,
    });
    expect(instructorRef("Nobody Known", dept)).toEqual({
      name: "Nobody Known",
      slug: null,
      rating: null,
      reviews: 0,
    });
    expect(instructorWords(instructorRef("Ada Brandt", dept))).toBe(
      "Ada Brandt (4.2★, 61 reviews)",
    );
    expect(
      instructorWords({ name: "Jo", slug: "jo", rating: 5, reviews: 1 }),
    ).toBe("Jo (5.0★, 1 review)");
    expect(instructorWords(instructorRef("Nobody Known", dept))).toBe(
      "Nobody Known",
    );
  });

  it("gives a section its key, meetings, seats and dates", () => {
    const course = aCourse();
    const section = aSection({
      dates: { start: "2027-06-01", end: "2027-07-10" },
      restriction: "Restricted to majors.",
    });
    const view = sectionView(
      course,
      section,
      { "CMSC351-0101": [3, 40, 0, null] },
      aPlanetTerpDept(),
    );
    expect(view).toMatchObject({
      section: "0101",
      key: "CMSC351-0101",
      delivery: "in person",
      meetings: ["MWF 10am–10:50am · IRB 0324"],
      seats: { open: 3, total: 40, waitlist: 0, holdfile: null },
      restriction: "Restricted to majors.",
    });
    expect(view.dates).toMatch(/Jun/);
    expect(view.instructors[0]?.slug).toBe("brandt");
    const unknown = sectionView(course, aSection({ meetings: [] }), null, null);
    expect(unknown.seats).toBeNull();
    expect(unknown.dates).toBeNull();
    expect(unknown.meetings).toEqual([
      "Contact the department or instructor for times",
    ]);
  });

  it("names gen-eds with their options and conditions", () => {
    expect(
      genEdWords([
        [
          { code: "DSNL", condition: "if taken with GEOL110" },
          { code: "DSNS" },
        ],
        [{ code: "SCIS" }],
        [{ code: "ZZZZ" }],
      ]),
    ).toEqual([
      "DSNL (Natural Sciences Lab) if taken with GEOL110 or DSNS (Natural Sciences)",
      "SCIS (I-Series)",
      "ZZZZ",
    ]);
  });

  it("sums grades as PlanetTerp does, and ranks instructors by students", () => {
    const view = gradesView(aGradeRecord());
    expect(view.averageGpa).toBeGreaterThan(2.5);
    expect(view.averageGpa).toBeLessThan(3.5);
    expect(view.percentAOrB).toBeGreaterThan(50);
    expect(view.latestTerm).toEqual({ id: "202501", name: "Spring 2025" });
    const empty = gradesView(
      aGradeRecord({ counts: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] }),
    );
    expect(empty).toMatchObject({
      averageGpa: null,
      percentAOrB: null,
      percentW: null,
      students: 0,
    });

    const grades = someCourseGrades({
      byInstructor: {
        brandt: aGradeRecord(),
        ghost: aGradeRecord({
          counts: [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        }),
      },
    });
    const ranked = gradesByInstructor(grades, aPlanetTerpDept(), 5);
    expect(ranked.map((r) => r.slug)).toEqual(["brandt", "ghost"]);
    expect(ranked[1]?.name).toBe("ghost");
    expect(gradesByInstructor(grades, aPlanetTerpDept(), 1)).toHaveLength(1);
    expect(gradesByInstructor(undefined, null, 5)).toEqual([]);
  });

  it("sums a term's sections", () => {
    const course = aCourse({
      sections: [
        aSection({ code: "0101" }),
        aSection({ code: "0201", instructors: ["Bo Chen", "Ada Brandt"] }),
        aSection({ code: "0301" }),
      ],
    });
    const summary = termSummary(
      course,
      { "CMSC351-0101": [0, 40, 3, null], "CMSC351-0201": [5, 40, 0, null] },
      aPlanetTerpDept(),
    );
    expect(summary).toMatchObject({
      sections: 3,
      sectionsWithOpenSeats: 1,
      openSeats: 5,
    });
    expect(summary.instructors.map((i) => i.name)).toEqual([
      "Ada Brandt",
      "Bo Chen",
    ]);
    expect(termSummary(course, null, null)).toMatchObject({
      sectionsWithOpenSeats: null,
      openSeats: null,
    });
  });
});
