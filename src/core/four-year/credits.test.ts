import { describe, expect, it } from "vitest";
import {
  aCourseIndexEntry,
  aFourYear,
  aFourYearCreditEntry,
  aFourYearEntry,
  aFourYearWildcardEntry,
} from "~/fixtures";
import {
  fourYearCourses,
  isRepeatable,
  isUnknownCourse,
} from "./course-lookup";
import {
  CREDITS_GOAL_TOOLTIP,
  columnLabel,
  columnSummary,
  countedEntries,
  creditsHeadline,
  creditTotals,
  entryCredits,
  supersededAttempts,
} from "./credits";
import { statusAround } from "./test-helpers";

const lookup = fourYearCourses([
  aCourseIndexEntry({ code: "CMSC131", credits: { min: 4, max: 4 } }),
  aCourseIndexEntry({ code: "CMSC351" }),
  aCourseIndexEntry({ code: "CMSC389T", credits: { min: 1, max: 3 } }),
  aCourseIndexEntry({
    code: "IDEA258",
    restriction: "Must have permission. Repeatable to 6 credits.",
  }),
]);
// Fall 2026 is in progress: Spring 2026 is done, Spring 2027 planned.
const statusOf = statusAround("202608");

describe("course lookup", () => {
  it("knows a code is unknown only once its department loaded", () => {
    expect(isUnknownCourse(lookup, "CMSC999")).toBe(true);
    expect(isUnknownCourse(lookup, "HIST200")).toBe(false);
    const withHist = fourYearCourses([], ["HIST"]);
    expect(isUnknownCourse(withHist, "HIST200")).toBe(true);
  });

  it("reads repeatable courses from the sentences the index keeps", () => {
    expect(isRepeatable(aCourseIndexEntry())).toBe(false);
    expect(
      isRepeatable(
        aCourseIndexEntry({
          prerequisite: "Permission of ARHU. Repeatable to 6 credits.",
        }),
      ),
    ).toBe(true);
  });
});

describe("entryCredits", () => {
  it("uses the index, the entry's own credits, or 0 until its department loads", () => {
    expect(entryCredits(aFourYearEntry({ code: "CMSC131" }), lookup)).toBe(4);
    expect(entryCredits(aFourYearEntry({ code: "CMSC389T" }), lookup)).toBe(1);
    expect(
      entryCredits(aFourYearEntry({ code: "CMSC389T", credits: 3 }), lookup),
    ).toBe(3);
    expect(entryCredits(aFourYearEntry({ code: "HIST200" }), lookup)).toBe(0);
    expect(entryCredits(aFourYearWildcardEntry({ credits: 4 }), lookup)).toBe(
      4,
    );
    expect(entryCredits(aFourYearCreditEntry(), lookup)).toBe(4);
  });
});

describe("creditTotals", () => {
  it("splits earned, in progress and planned; Before UMD is earned", () => {
    const doc = aFourYear({
      entries: [
        aFourYearCreditEntry({ id: "entry_ap" }),
        aFourYearEntry({ id: "entry_131", term: "202601", code: "CMSC131" }),
        aFourYearEntry({ id: "entry_351", term: "202608" }),
        aFourYearWildcardEntry({ id: "entry_4xx", term: "202701" }),
      ],
    });
    expect(creditTotals(doc, lookup, statusOf)).toEqual({
      earned: 8,
      inProgress: 3,
      planned: 3,
      total: 14,
    });
  });

  it("leaves out an F, and counts a course taken twice once, the later attempt", () => {
    const doc = aFourYear({
      entries: [
        aFourYearEntry({ id: "entry_first", term: "202601", code: "CMSC131" }),
        aFourYearEntry({ id: "entry_again", term: "202608", code: "CMSC131" }),
        aFourYearEntry({ id: "entry_failed", term: "202601" }),
      ],
      grades: { entry_first: "B", entry_failed: "F" },
    });
    expect(supersededAttempts(doc, lookup)).toEqual(new Set(["entry_first"]));
    expect(countedEntries(doc, lookup, statusOf).map((e) => e.id)).toEqual([
      "entry_again",
    ]);
    expect(creditTotals(doc, lookup, statusOf)).toMatchObject({
      earned: 0,
      inProgress: 4,
      total: 4,
    });
  });

  it("counts credit that counts as a course once, when the course is taken again", () => {
    const ap = aFourYearCreditEntry({ id: "entry_ap", countsAs: "CMSC131" });
    const doc = aFourYear({
      entries: [
        ap,
        aFourYearEntry({ id: "entry_umd", term: "202601", code: "CMSC131" }),
        aFourYearCreditEntry({ id: "entry_plain", countsAs: null }),
      ],
    });
    expect(supersededAttempts(doc, lookup)).toEqual(new Set(["entry_ap"]));
    expect(creditTotals(doc, lookup, statusOf).earned).toBe(8);
    expect(
      creditTotals(aFourYear({ entries: [ap] }), lookup, statusOf).earned,
    ).toBe(4);
  });

  it("counts every attempt at a repeatable course", () => {
    const doc = aFourYear({
      entries: [
        aFourYearEntry({ id: "entry_one", term: "202601", code: "IDEA258" }),
        aFourYearEntry({ id: "entry_two", term: "202701", code: "IDEA258" }),
      ],
    });
    expect(creditTotals(doc, lookup, statusOf).total).toBe(6);
  });

  it("says it against 120, with the tooltip's caveat", () => {
    expect(creditsHeadline({ total: 99 })).toBe("99 of 120 credits");
    expect(CREDITS_GOAL_TOOLTIP).toContain("degree audit");
  });
});

describe("columns", () => {
  it("counts every block in a column at its credits", () => {
    const doc = aFourYear({
      entries: [
        aFourYearEntry({ id: "entry_131", code: "CMSC131" }),
        aFourYearEntry({ id: "entry_351" }),
        aFourYearWildcardEntry(),
      ],
    });
    const summary = columnSummary(doc, "202701", lookup);
    expect(summary).toEqual({ entries: 3, credits: 10 });
    expect(columnLabel(summary)).toBe("3 courses · 10 cr");
    expect(columnLabel({ entries: 1, credits: 3 })).toBe("1 course · 3 cr");
  });
});
