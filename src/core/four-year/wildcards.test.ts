import { describe, expect, it } from "vitest";
import type { CourseSearchRow } from "~/core/schema";
import {
  FourYearDocSchema,
  FourYearProblemSchema,
} from "~/core/schema/four-year";
import {
  aCourseIndexEntry,
  aFourYear,
  aFourYearCreditEntry,
  aFourYearEntry,
  aFourYearWildcardEntry,
  aPlan,
  aPlanCourse,
  aSavedCourse,
  fixtureTermId,
} from "~/fixtures";
import { mainPlanFor } from "../plans/main-plan";
import { handoffCourses, placedInPlan } from "./handoff";
import {
  choicesForWildcard,
  parsePlaceholder,
  resolvesWildcard,
  searchRowMayResolve,
} from "./wildcards";

const geol100 = aCourseIndexEntry({
  code: "GEOL100",
  genEds: [
    [{ code: "DSNL", condition: "if taken with GEOL110" }, { code: "DSNS" }],
  ],
});
const hist200 = aCourseIndexEntry({
  code: "HIST200",
  genEds: [[{ code: "DSHS" }, { code: "DSHU" }], [{ code: "SCIS" }]],
});

describe("placeholders", () => {
  it('reads patterns, GenEd codes and "any …" from search', () => {
    expect(parsePlaceholder("CMSC4XX")).toEqual({
      kind: "wildcard",
      wildcard: { kind: "pattern", pattern: "CMSC4XX" },
    });
    expect(parsePlaceholder(" any dshs ")).toEqual({
      kind: "wildcard",
      wildcard: { kind: "gen-ed", code: "DSHS" },
    });
    expect(parsePlaceholder("Any cmsc 4xx").kind).toBe("wildcard");
    expect(parsePlaceholder("CMSC4X")).toEqual({
      kind: "wildcard",
      wildcard: { kind: "pattern", pattern: "CMSC4XX" },
    });
    expect(parsePlaceholder("CMSC4X1").kind).toBe("invalid");
    expect(parsePlaceholder("anything").kind).toBe("none");
  });

  it("resolves with the shared matcher: a choice counts, a condition doesn't", () => {
    expect(resolvesWildcard({ kind: "gen-ed", code: "DSHU" }, hist200)).toBe(
      true,
    );
    expect(resolvesWildcard({ kind: "gen-ed", code: "DSNL" }, geol100)).toBe(
      false,
    );
    expect(resolvesWildcard({ kind: "gen-ed", code: "DSNS" }, geol100)).toBe(
      true,
    );
    expect(
      resolvesWildcard(
        { kind: "pattern", pattern: "CMSC4XX" },
        aCourseIndexEntry({ code: "CMSC498A" }),
      ),
    ).toBe(true);
  });

  it("prefilters search rows, leaving conditions to the department file", () => {
    const row: CourseSearchRow = [
      "GEOL100",
      "Physical Geology",
      3,
      3,
      ["DSNL", "DSNS"],
    ];
    expect(searchRowMayResolve({ kind: "gen-ed", code: "DSNL" }, row)).toBe(
      true,
    );
    expect(searchRowMayResolve({ kind: "gen-ed", code: "DSHS" }, row)).toBe(
      false,
    );
    expect(
      searchRowMayResolve({ kind: "pattern", pattern: "GEOL1XX" }, row),
    ).toBe(true);
    expect(
      searchRowMayResolve({ kind: "pattern", pattern: "GEOL2XX" }, row),
    ).toBe(false);
  });

  it("carries a GenEd placeholder's code into the course's choice", () => {
    expect(
      choicesForWildcard({ kind: "gen-ed", code: "DSHU" }, hist200),
    ).toEqual({ "0": "DSHU" });
    expect(
      choicesForWildcard({ kind: "gen-ed", code: "SCIS" }, hist200),
    ).toEqual({});
    expect(
      choicesForWildcard({ kind: "gen-ed", code: "DSNL" }, geol100),
    ).toEqual({});
    expect(
      choicesForWildcard({ kind: "pattern", pattern: "HIST2XX" }, hist200),
    ).toEqual({});
  });
});

describe("handoff", () => {
  const a = aPlan({ id: "plan_aaaaaaaa", name: "Plan A", order: 0 });
  const b = aPlan({ id: "plan_bbbbbbbb", name: "Plan B", order: 1 });
  const other = aPlan({ id: "plan_otherterm", termId: "202608", order: 0 });

  it("links the term's main plan, else its first tab", () => {
    expect(mainPlanFor(fixtureTermId, [b, a, other], {})).toBe(a);
    expect(mainPlanFor(fixtureTermId, [a, b], { [fixtureTermId]: b.id })).toBe(
      b,
    );
    expect(
      mainPlanFor(fixtureTermId, [a, b], { [fixtureTermId]: other.id }),
    ).toBe(a);
    expect(mainPlanFor("202708", [a, b, other], {})).toBeNull();
  });

  it("hands over courses once each and names the placeholders", () => {
    const entries = [
      aFourYearEntry({ id: "entry_one" }),
      aFourYearEntry({ id: "entry_two" }),
      aFourYearEntry({ id: "entry_three", code: "MUSC130" }),
      aFourYearWildcardEntry(),
      aFourYearCreditEntry(),
    ];
    expect(handoffCourses(entries)).toEqual({
      courses: ["CMSC351", "MUSC130"],
      placeholders: [{ kind: "pattern", pattern: "CMSC4XX" }],
    });
  });

  it("counts placed courses, not saved ones", () => {
    const plan = aPlan({ courses: [aPlanCourse(), aSavedCourse("MUSC130")] });
    expect(placedInPlan(["CMSC351", "MUSC130", "STAT400"], plan)).toEqual({
      placed: 1,
      total: 3,
    });
  });
});

describe("schemas", () => {
  it("rejects duplicate entry ids and credit entries outside Before UMD", () => {
    const dup = aFourYear({ entries: [aFourYearEntry(), aFourYearEntry()] });
    expect(FourYearDocSchema.safeParse(dup).success).toBe(false);
    const misplaced = aFourYear({
      entries: [{ ...aFourYearCreditEntry(), term: "202608" as "before" }],
    });
    expect(FourYearDocSchema.safeParse(misplaced).success).toBe(false);
    const badChoice = aFourYear({
      entries: [aFourYearEntry({ genEdChoices: { first: "DSHS" } })],
    });
    expect(FourYearDocSchema.safeParse(badChoice).success).toBe(false);
  });

  it("keeps a problem's severity in step with its kind", () => {
    const problem = {
      id: "unknown-course:entry_fixture_1",
      severity: "info",
      kind: "unknown-course",
      subjects: [{ kind: "entry", entryId: "entry_fixture_1" }],
      title: [],
      detail: [],
      fix: null,
    };
    expect(FourYearProblemSchema.safeParse(problem).success).toBe(false);
    expect(
      FourYearProblemSchema.safeParse({ ...problem, severity: "warning" })
        .success,
    ).toBe(true);
  });
});
