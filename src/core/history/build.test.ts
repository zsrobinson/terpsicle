import { describe, expect, it } from "vitest";
import { HistoryCourseSchema } from "~/core/schema/history";
import { aCourse, aSection, fixtureTermId } from "~/fixtures";
import {
  historyCoursesFromChunk,
  historyFromPlanetTerpGrades,
  planetTerpSectionCode,
} from "./build";

describe("historyCoursesFromChunk", () => {
  it("keeps codes, titles, credits and each section's names, sorted", () => {
    const [course] = historyCoursesFromChunk([
      aCourse({
        sections: [
          aSection({ code: "0101", instructors: ["Ben Ortiz", "Ada Brandt"] }),
          aSection({ code: "0201", instructors: [] }),
        ],
      }),
    ]);
    expect(HistoryCourseSchema.parse(course)).toEqual({
      code: "CMSC351",
      title: "Algorithms",
      credits: { min: 3, max: 3 },
      source: "terpsicle",
      instructors: ["Ada Brandt", "Ben Ortiz"],
      sections: [
        { code: "0101", instructors: ["Ada Brandt", "Ben Ortiz"] },
        { code: "0201", instructors: [] },
      ],
    });
  });
});

describe("planetTerpSectionCode", () => {
  it("pads PlanetTerp's short section numbers the way Testudo writes them", () => {
    expect(planetTerpSectionCode("101")).toBe("0101");
    expect(planetTerpSectionCode("0101")).toBe("0101");
    expect(planetTerpSectionCode("fc01")).toBe("FC01");
    expect(planetTerpSectionCode("")).toBeNull();
    expect(planetTerpSectionCode(null)).toBeNull();
    expect(planetTerpSectionCode("01010")).toBeNull();
  });
});

describe("historyFromPlanetTerpGrades", () => {
  it("skips rows it can't read and keeps names whose section it can't", () => {
    const byTerm = historyFromPlanetTerpGrades(
      [
        {
          course: "CMSC351",
          professor: "Clyde Kruskal",
          semester: fixtureTermId,
          section: "101",
        },
        {
          course: "CMSC351",
          professor: null,
          semester: fixtureTermId,
          section: "0201",
        },
        {
          course: "CMSC351",
          professor: "Evan Golub",
          semester: fixtureTermId,
          section: "?",
        },
        {
          course: "CMSC351",
          professor: "X",
          semester: "not a term",
          section: "0101",
        },
      ],
      () => ({ title: "Algorithms", credits: 3 }),
    );
    expect([...byTerm.keys()]).toEqual([fixtureTermId]);
    expect(byTerm.get(fixtureTermId)).toEqual([
      {
        code: "CMSC351",
        title: "Algorithms",
        credits: { min: 3, max: 3 },
        source: "planetterp",
        instructors: ["Clyde Kruskal", "Evan Golub"],
        sections: [
          { code: "0101", instructors: ["Clyde Kruskal"] },
          { code: "0201", instructors: [] },
        ],
      },
    ]);
  });
});
