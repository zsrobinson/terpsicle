import { describe, expect, it } from "vitest";
import { HistoryCourseSchema } from "~/core/schema/history";
import { aCourse, aSection, fixtureTermId } from "~/fixtures";
import {
  historyCoursesFromChunk,
  historyFromPlanetTerpGrades,
  historyFromUmdioSections,
  planetTerpSectionCode,
} from "./build";

describe("historyFromUmdioSections", () => {
  const row = (
    section_id: string,
    instructors: string[],
    semester = "202505",
  ) => ({
    section_id,
    semester,
    number: section_id.split("-")[1] ?? null,
    instructors,
  });

  it("groups a term's sections by course, as Testudo spells the names", () => {
    const courses = historyFromUmdioSections(
      "202505",
      [
        row("CMSC131-0201", ["Fawzi Emad"]),
        row("CMSC131-0101", ["Fawzi Emad", "Ilchul Yoon"]),
        // TBA isn't a name, but the section is still recorded.
        row("CMSC131-0301", ["Instructor: TBA"]),
        row("AASP100-WB11", ["Jason Nichols"]),
        // Another term's row, and codes that don't read, are skipped.
        row("CMSC132-0101", ["Nelson Padua-Perez"], "202501"),
        row("NOTACODE-0101", ["Nobody"]),
      ],
      (code) =>
        code === "CMSC131"
          ? { title: " Object-Oriented Programming I " }
          : null,
    );
    expect(courses).toEqual([
      {
        code: "AASP100",
        title: null,
        credits: null,
        source: "umdio",
        instructors: ["Jason Nichols"],
        sections: [{ code: "WB11", instructors: ["Jason Nichols"] }],
      },
      {
        code: "CMSC131",
        title: "Object-Oriented Programming I",
        credits: null,
        source: "umdio",
        instructors: ["Fawzi Emad", "Ilchul Yoon"],
        sections: [
          { code: "0101", instructors: ["Fawzi Emad", "Ilchul Yoon"] },
          { code: "0201", instructors: ["Fawzi Emad"] },
          { code: "0301", instructors: [] },
        ],
      },
    ]);
    for (const c of courses) expect(HistoryCourseSchema.parse(c)).toEqual(c);
  });
});

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
