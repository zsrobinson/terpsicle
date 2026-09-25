import { describe, expect, it } from "vitest";
import { type Course, DEFAULT_TRAVEL_SETTINGS, type SeatTuple } from "../schema";
import { buildCatalogIndex } from "../catalog/catalog-index";
import { buildFitContext } from "../fit/fit";
import { aCourse, aMeeting, aPlan, aSection, placed } from "../test-support/builders";
import {
  courseFilter,
  courseLevel,
  coversGenEds,
  formatSectionSummary,
  hasOpenSeats,
  isFiltering,
  matchesCredits,
  NO_FILTERS,
  type SearchFilters,
  sectionSummary,
} from "./filters";
import {
  codeTokens,
  courseSearchDoc,
  createCourseSearch,
  fuzziness,
  queryTokens,
  searchCourses,
} from "./search";

const TERM = "202701";

const courses: Course[] = [
  aCourse({ code: "CMSC351", title: "Algorithms", sections: [aSection({ instructors: ["Clyde Kruskal"] })] }),
  aCourse({ code: "CMSC350", title: "Data Structures Honors", sections: [aSection({ instructors: ["Anwar Mamat"] })] }),
  aCourse({ code: "CMSC330", title: "Organization of Programming Languages", sections: [aSection({ instructors: ["Anwar Mamat"] })] }),
  aCourse({ code: "CMSC389N", title: "Special Topics: Algorithms in Practice" }),
  aCourse({ code: "MATH351", title: "Differential Equations" }),
  aCourse({ code: "STAT400", title: "Applied Probability and Statistics I" }),
  aCourse({ code: "ENGL393", title: "Technical Writing", sections: [aSection({ instructors: ["José Pérez"] })] }),
  aCourse({ code: "ALGO101", title: "Cooking" }),
];
const search = createCourseSearch(courses);

describe("tokenizing", () => {
  it("indexes a code as itself, its department, number and digits", () => {
    expect(codeTokens("CMSC389N")).toEqual(["cmsc389n", "cmsc", "389n", "389"]);
    expect(codeTokens("CMSC351")).toEqual(["cmsc351", "cmsc", "351"]);
  });

  it("splits letters-then-digits in queries", () => {
    expect(queryTokens("CMSC351")).toEqual(["cmsc", "351"]);
    expect(queryTokens("cmsc 351")).toEqual(["cmsc", "351"]);
    expect(queryTokens("Pérez, algorithms")).toEqual(["perez", "algorithms"]);
  });

  it("allows typos only in words", () => {
    expect(fuzziness("algoritms")).toBe(0.2);
    expect(fuzziness("351")).toBe(false);
    expect(fuzziness("cms")).toBe(false);
  });

  it("builds a doc with every instructor once", () => {
    const c = aCourse({ sections: [aSection({ instructors: ["A B"] }), aSection({ code: "0201", instructors: ["A B", "C D"] })] });
    expect(courseSearchDoc(c).instructors).toBe("A B C D");
  });
});

describe("searchCourses", () => {
  it.each([
    ["cmsc 351", "CMSC351"],
    ["CMSC351", "CMSC351"],
    ["cmsc351", "CMSC351"],
    ["cmsc35", "CMSC350"],
    ["351", "CMSC351"],
    ["algorithms", "CMSC351"],
    ["algoritms", "CMSC351"],
    ["kruskal", "CMSC351"],
    ["perez", "ENGL393"],
    ["technical wri", "ENGL393"],
    ["cmsc389n", "CMSC389N"],
  ])("%s → %s first", (query, first) => {
    expect(searchCourses(search, query)[0]).toBe(first);
  });

  it("puts exact code prefixes first, in code order", () => {
    expect(searchCourses(search, "cmsc35")).toEqual(["CMSC350", "CMSC351"]);
    expect(searchCourses(search, "cmsc").slice(0, 4)).toEqual(["CMSC330", "CMSC350", "CMSC351", "CMSC389N"]);
    expect(searchCourses(search, "351")).toEqual(["CMSC351", "MATH351"]);
  });

  it("ranks code prefixes above title words", () => {
    // "algo" is a department prefix (ALGO101) and a title word (Algorithms).
    const results = searchCourses(search, "algo");
    expect(results[0]).toBe("ALGO101");
    expect(results).toContain("CMSC351");
  });

  it("finds by instructor across courses", () => {
    expect(searchCourses(search, "mamat").sort()).toEqual(["CMSC330", "CMSC350"]);
  });

  it("returns nothing for an empty query", () => {
    expect(searchCourses(search, "  ")).toEqual([]);
    expect(searchCourses(search, "zzzzqqq")).toEqual([]);
  });
});

describe("filters", () => {
  it("matches gen-eds the course can count for together", () => {
    const groups = [["DSHS", "DSSP"], ["DVUP"]];
    expect(coversGenEds(groups, [])).toBe(true);
    expect(coversGenEds(groups, ["DSHS"])).toBe(true);
    expect(coversGenEds(groups, ["DSSP", "DVUP"])).toBe(true);
    // One group can't count for both of its codes.
    expect(coversGenEds(groups, ["DSHS", "DSSP"])).toBe(false);
    expect(coversGenEds(groups, ["DSHU"])).toBe(false);
    expect(coversGenEds([["DSHU", "DSNS"], ["DSHU"]], ["DSNS", "DSHU"])).toBe(true);
    expect(coversGenEds(groups, ["DSHS", "DSSP", "DVUP"])).toBe(false);
  });

  it("matches credits, with the top option meaning or more", () => {
    const three = aCourse({ credits: { min: 3, max: 3 } });
    const range = aCourse({ credits: { min: 1, max: 6 } });
    expect(matchesCredits(three, [])).toBe(true);
    expect(matchesCredits(three, [3])).toBe(true);
    expect(matchesCredits(three, [4, 5])).toBe(false);
    expect(matchesCredits(range, [5])).toBe(true);
    expect(matchesCredits(aCourse({ credits: { min: 6, max: 6 } }), [5])).toBe(true);
  });

  it("reads the level from the course number", () => {
    expect(courseLevel("CMSC351")).toBe(300);
    expect(courseLevel("CMSC789A")).toBe(700);
  });

  it("finds open seats in uncancelled sections", () => {
    const c = aCourse({ sections: [aSection({ code: "0101" }), aSection({ code: "0201", cancelled: true })] });
    const seats: Record<string, SeatTuple> = { "CMSC351-0201": [5, 10, 0, 0] };
    expect(hasOpenSeats(c, seats)).toBe(false);
    expect(hasOpenSeats(c, { "CMSC351-0101": [1, 10, 0, 0] })).toBe(true);
    expect(hasOpenSeats(c, null)).toBe(false);
  });

  it("combines everything into one predicate", () => {
    const other = aCourse({ code: "CMSC330", sections: [aSection({ meetings: [aMeeting({ start: 600, end: 650 })] })] });
    const clash = aCourse({ code: "MATH240", credits: { min: 4, max: 4 }, genEds: [["FSMA"]], sections: [aSection()] });
    const free = aCourse({ code: "MATH241", credits: { min: 4, max: 4 }, genEds: [["FSMA"]], sections: [aSection({ meetings: [aMeeting({ days: ["Tu"] })] })] });
    const fit = buildFitContext({
      plan: aPlan({ termId: TERM, courses: [placed(other, "0101")] }),
      index: buildCatalogIndex(TERM, [other, clash, free]),
      blocks: [],
      travel: DEFAULT_TRAVEL_SETTINGS,
      routes: null,
    });
    const seats: Record<string, SeatTuple> = { "MATH240-0101": [3, 30, 0, 0], "MATH241-0101": [3, 30, 0, 0] };
    const filters: SearchFilters = { genEds: ["FSMA"], credits: [4], levels: [200], openSeats: true, fitsMyPlan: true };
    const keep = courseFilter(filters, { seats, fit });
    expect([other, clash, free].filter(keep).map((c) => c.code)).toEqual(["MATH241"]);
    expect(courseFilter({ ...filters, fitsMyPlan: true }, { seats, fit: null })(clash)).toBe(true);
    expect([other, clash, free].filter(courseFilter(NO_FILTERS, { seats: null, fit: null }))).toHaveLength(3);
    expect(isFiltering(NO_FILTERS)).toBe(false);
    expect(isFiltering({ ...NO_FILTERS, openSeats: true })).toBe(true);
  });
});

describe("section summary", () => {
  it("reads 4 sections · 2 fit your plan", () => {
    expect(formatSectionSummary({ sections: 4, fit: 2 })).toBe("4 sections · 2 fit your plan");
    expect(formatSectionSummary({ sections: 2, fit: 1 })).toBe("2 sections · 1 fits your plan");
    expect(formatSectionSummary({ sections: 3, fit: 0 })).toBe("3 sections · none fit your plan");
    expect(formatSectionSummary({ sections: 1, fit: null })).toBe("1 section");
    expect(formatSectionSummary({ sections: 0, fit: 0 })).toBe("0 sections");
  });

  it("counts uncancelled sections and those that fit", () => {
    const other = aCourse({ code: "CMSC330" });
    const c = aCourse({
      sections: [aSection({ code: "0101" }), aSection({ code: "0201", meetings: [aMeeting({ days: ["Tu"] })] }), aSection({ code: "0301", cancelled: true })],
    });
    const fit = buildFitContext({
      plan: aPlan({ termId: TERM, courses: [placed(other, "0101")] }),
      index: buildCatalogIndex(TERM, [other, c]),
      blocks: [],
      travel: DEFAULT_TRAVEL_SETTINGS,
      routes: null,
    });
    expect(sectionSummary(c, fit)).toEqual({ sections: 2, fit: 1 });
    expect(sectionSummary(c, null)).toEqual({ sections: 2, fit: null });
  });
});
