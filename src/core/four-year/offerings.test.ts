import { describe, expect, it } from "vitest";
import type { HistoryDept } from "~/core/schema/history";
import { aCourseIndexEntry, aFourYear, aFourYearEntry } from "~/fixtures";
import { fourYearCourses } from "./course-lookup";
import { fourYearOfferings, offeringDepts } from "./offerings";

const deptFile = (
  dept: string,
  code: string,
  terms: string[],
): HistoryDept => ({
  schemaVersion: 1,
  dept,
  courses: [
    {
      code,
      title: null,
      offerings: [...terms]
        .sort()
        .reverse()
        .map((termId) => ({
          termId,
          source: "planetterp" as const,
          instructors: [],
          sections: [],
        })),
    },
  ],
});

// CMSC456 is cross-listed with MATH456, which PlanetTerp files its grades under.
const lookup = fourYearCourses([
  aCourseIndexEntry({
    code: "CMSC456",
    crossListings: ["MATH456"],
    offered: ["202701", "202608"],
  }),
  aCourseIndexEntry({ code: "MATH456", offered: ["202701", "202608"] }),
]);
const doc = aFourYear({
  entries: [
    aFourYearEntry({ id: "entry_crypto1", code: "CMSC456", term: "202708" }),
    aFourYearEntry({ id: "entry_unknown", code: "CMSC999", term: "202708" }),
  ],
});

describe("offeringDepts", () => {
  it("reads the departments of a doc's courses and their cross-listings", () => {
    expect(offeringDepts(doc, lookup)).toEqual(["CMSC", "MATH"]);
  });
});

describe("fourYearOfferings", () => {
  const recorded = new Set(
    ["2018", "2019", "2020", "2021", "2022", "2023", "2024"].flatMap((y) => [
      `${y}08`,
      `${Number(y) + 1}01`,
    ]),
  );
  const offerings = fourYearOfferings({
    doc,
    lookup,
    history: new Map([["MATH", deptFile("MATH", "MATH456", [...recorded])]]),
    recorded,
    listed: new Set(["202608", "202701"]),
    now: "202701",
  });

  it("merges the history under every code with Testudo's terms", () => {
    const crypto = offerings.courses.get("CMSC456");
    expect(crypto?.offered.has("201808")).toBe(true);
    expect(crypto?.offered.has("202701")).toBe(true);
    // Listed terms are on record: Testudo's catalogs are whole.
    expect(crypto?.summary.pattern).toEqual({ kind: "every-semester" });
    expect(crypto?.summary.onRecord).toBe(16);
  });

  it("leaves out a code the index doesn't know", () => {
    expect(offerings.courses.has("CMSC999")).toBe(false);
  });
});
