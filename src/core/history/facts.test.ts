import { describe, expect, it } from "vitest";
import { SCHEMA_VERSIONS } from "~/core/schema";
import type { HistoryDept, HistoryOffering } from "~/core/schema/history";
import { historyDeptFacts, planetTerpGradeRows } from "./facts";

const offering = (o: Partial<HistoryOffering>): HistoryOffering => ({
  termId: "202501",
  source: "planetterp",
  instructors: [],
  sections: [],
  ...o,
});

describe("planetTerpGradeRows", () => {
  it("counts a row per section and professor, as PlanetTerp stores them", () => {
    expect(
      planetTerpGradeRows(
        offering({
          instructors: ["Fawzi Emad", "Ilchul Yoon", "Nelson Padua-Perez"],
          sections: [
            // Two professors on one section: two rows.
            { code: "0101", instructors: ["Fawzi Emad", "Ilchul Yoon"] },
            { code: "0201", instructors: ["Fawzi Emad"] },
            // No professor: still one row.
            { code: "0301", instructors: [] },
          ],
        }),
      ),
      // …and a professor whose section didn't read: one more.
    ).toBe(5);
  });

  it("counts nothing for our own copies, which have no grades", () => {
    expect(
      planetTerpGradeRows(
        offering({
          source: "terpsicle",
          instructors: ["Fawzi Emad"],
          sections: [{ code: "0101", instructors: ["Fawzi Emad"] }],
        }),
      ),
    ).toBe(0);
  });
});

describe("historyDeptFacts", () => {
  const dept: HistoryDept = {
    schemaVersion: SCHEMA_VERSIONS.history,
    dept: "CMSC",
    courses: [
      {
        code: "CMSC131",
        title: "Object-Oriented Programming I",
        offerings: [
          offering({
            termId: "202608",
            source: "terpsicle",
            instructors: ["Fawzi Emad"],
            sections: [{ code: "0101", instructors: ["Fawzi Emad"] }],
          }),
        ],
      },
      {
        code: "CMSC250",
        title: null,
        offerings: [
          offering({
            instructors: ["Fawzi Emad"],
            sections: [{ code: "0101", instructors: ["Fawzi Emad"] }],
          }),
        ],
      },
    ],
  };

  it("keeps each source's spelling apart, with the courses taught under it", () => {
    const facts = historyDeptFacts(dept);
    expect([...facts.courses]).toEqual([
      ["CMSC131", "Object-Oriented Programming I"],
      ["CMSC250", null],
    ]);
    expect(facts.testudoNames.get("Fawzi Emad")).toEqual(new Set(["CMSC131"]));
    expect(facts.planetTerpNames.get("Fawzi Emad")).toEqual(
      new Set(["CMSC250"]),
    );
    expect(facts.gradeRows).toBe(1);
  });

  it("reads umd.io's names as Testudo's spellings, with no grade rows", () => {
    const summer: HistoryDept = {
      ...dept,
      courses: [
        {
          code: "CMSC131",
          title: null,
          offerings: [
            offering({
              termId: "202505",
              source: "umdio",
              instructors: ["Fawzi Emad"],
              sections: [{ code: "0101", instructors: ["Fawzi Emad"] }],
            }),
          ],
        },
      ],
    };
    const facts = historyDeptFacts(summer);
    expect(facts.testudoNames.get("Fawzi Emad")).toEqual(new Set(["CMSC131"]));
    expect(facts.planetTerpNames.size).toBe(0);
    expect(facts.gradeRows).toBe(0);
  });
});
