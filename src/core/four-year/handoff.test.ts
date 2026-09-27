import { describe, expect, it } from "vitest";
import {
  aFourYear,
  aFourYearEntry,
  aFourYearWildcardEntry,
  aPlan,
  aPlanCourse,
  aSavedCourse,
} from "~/fixtures";
import {
  addedLine,
  fourYearColumnFor,
  handoffTerm,
  handoffToast,
  linkedSchedulePlan,
  missingFromPlan,
  missingLine,
  pickFourYearDoc,
  placedInPlan,
  placedLine,
  placeholderLine,
  planHandoff,
} from "./handoff";

const SPRING = "202701";
const FALL = "202608";

describe("linkedSchedulePlan", () => {
  const a = aPlan({ id: "planAAAA", termId: SPRING, order: 0 });
  const b = aPlan({ id: "planBBBB", termId: SPRING, name: "Plan B", order: 1 });
  const fall = aPlan({ id: "fallAAAA", termId: FALL, order: 0 });

  it("is the term's open plan, else its first tab", () => {
    expect(
      linkedSchedulePlan(SPRING, [b, a, fall], { [SPRING]: "planBBBB" }),
    ).toBe(b);
    expect(linkedSchedulePlan(SPRING, [b, a, fall], {})).toBe(a);
    expect(linkedSchedulePlan(SPRING, [b, a], { [SPRING]: "gone0000" })).toBe(
      a,
    );
    expect(linkedSchedulePlan("202705", [a, b, fall], {})).toBeNull();
  });
});

describe("handoffTerm", () => {
  it("is the first planned semester, never Before UMD", () => {
    const status = (t: string) =>
      t === "before" || t < FALL
        ? "done"
        : t === FALL
          ? "in-progress"
          : "planned";
    expect(
      handoffTerm(["before", "202508", FALL, SPRING, "202708"], status),
    ).toBe(SPRING);
    expect(handoffTerm(["before", "202508"], () => "done")).toBeNull();
  });
});

describe("fourYearColumnFor", () => {
  it("hands over the term's courses in column order, and names its placeholders", () => {
    const doc = aFourYear({
      entries: [
        aFourYearEntry({ id: "e1", code: "CMSC351" }),
        aFourYearEntry({ id: "e2", code: "STAT400" }),
        aFourYearWildcardEntry({ id: "w1" }),
        aFourYearEntry({ id: "e3", code: "ECON200", term: FALL }),
      ],
    });
    expect(fourYearColumnFor(doc, SPRING)).toEqual({
      courses: ["CMSC351", "STAT400"],
      placeholders: [{ kind: "pattern", pattern: "CMSC4XX" }],
    });
    expect(fourYearColumnFor(null, SPRING)).toEqual({
      courses: [],
      placeholders: [],
    });
  });
});

describe("pickFourYearDoc", () => {
  const first = aFourYear({
    id: "first000",
    createdAt: "2026-01-01T00:00:00.000Z",
  });
  const second = aFourYear({
    id: "second00",
    createdAt: "2026-02-01T00:00:00.000Z",
  });
  it("is the open doc, else the oldest", () => {
    expect(pickFourYearDoc([second, first], "second00")).toBe(second);
    expect(pickFourYearDoc([second, first], null)).toBe(first);
    expect(pickFourYearDoc([second, first], "gone0000")).toBe(first);
    expect(pickFourYearDoc([], null)).toBeNull();
  });
});

describe("planHandoff", () => {
  const courses = ["CMSC351", "STAT400"];

  it("creates a plan when the term has none", () => {
    expect(planHandoff(SPRING, [], {}, courses)).toEqual({ kind: "create" });
  });

  it("fills the term's only plan when it's still empty (the scheduler made it on a visit)", () => {
    const empty = aPlan({ id: "emptyAAA", termId: SPRING, courses: [] });
    expect(planHandoff(SPRING, [empty], {}, courses)).toEqual({
      kind: "fill",
      plan: empty,
    });
  });

  it("opens the linked plan, and never changes one with courses in it", () => {
    const a = aPlan({
      id: "planAAAA",
      termId: SPRING,
      courses: [aSavedCourse("MATH240")],
    });
    const empty = aPlan({
      id: "emptyBBB",
      termId: SPRING,
      order: 1,
      courses: [],
    });
    expect(planHandoff(SPRING, [a], {}, courses)).toEqual({
      kind: "open",
      plan: a,
    });
    // Two plans, one empty: still the open one, as it is.
    expect(
      planHandoff(SPRING, [a, empty], { [SPRING]: "emptyBBB" }, courses),
    ).toEqual({ kind: "open", plan: empty });
  });

  it("with nothing to hand over, only opens", () => {
    expect(planHandoff(SPRING, [], {}, [])).toEqual({ kind: "none" });
    const empty = aPlan({ id: "emptyAAA", termId: SPRING, courses: [] });
    expect(planHandoff(SPRING, [empty], {}, [])).toEqual({
      kind: "open",
      plan: empty,
    });
  });
});

describe("missingFromPlan and placedInPlan", () => {
  const plan = aPlan({
    courses: [aPlanCourse({ courseCode: "CMSC351" }), aSavedCourse("STAT400")],
  });
  it("counts a bookmark as there but not placed", () => {
    expect(missingFromPlan(["CMSC351", "STAT400", "ECON200"], plan)).toEqual([
      "ECON200",
    ]);
    expect(placedInPlan(["CMSC351", "STAT400", "ECON200"], plan)).toEqual({
      placed: 1,
      total: 3,
    });
  });
});

describe("the words", () => {
  it("says what the new plan has", () => {
    expect(handoffToast("Plan A", 5)).toBe(
      "Plan A has your 5 courses from your four-year plan. Pick sections for each.",
    );
    expect(handoffToast("Plan A", 1)).toBe(
      "Plan A has your course from your four-year plan. Pick a section for it.",
    );
  });

  it("names what's missing", () => {
    expect(missingLine(["STAT400"])).toBe(
      "From your four-year plan: STAT400 isn't here.",
    );
    expect(missingLine(["STAT400", "ECON200"])).toBe(
      "From your four-year plan: STAT400 and ECON200 aren't here.",
    );
    expect(missingLine(["STAT400", "ECON200", "MATH240"])).toBe(
      "From your four-year plan: STAT400, ECON200 and MATH240 aren't here.",
    );
  });

  it("names placeholders by pattern or GenEd", () => {
    expect(placeholderLine([{ kind: "pattern", pattern: "CMSC4XX" }])).toBe(
      "CMSC4XX is a placeholder; pick a course in Search or Generate.",
    );
    expect(
      placeholderLine([
        { kind: "pattern", pattern: "CMSC4XX" },
        { kind: "gen-ed", code: "DSHS" },
      ]),
    ).toBe(
      "CMSC4XX and DSHS are placeholders; pick courses in Search or Generate.",
    );
  });

  it("says what Add them added", () => {
    expect(addedLine(["STAT400", "ECON200"])).toBe(
      "Added STAT400 and ECON200 from your four-year plan",
    );
  });

  it("counts what's placed", () => {
    expect(placedLine("Plan A", { placed: 4, total: 5 })).toBe(
      "From Plan A: 4 of 5 placed",
    );
  });
});
