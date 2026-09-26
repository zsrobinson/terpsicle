import { describe, expect, it } from "vitest";
import { aPlan, aPlanCourse, aSavedCourse, fixtureTermId } from "~/fixtures";
import { chatMembersFor, chatPlanFor, sectionsInPlans } from "./members";

const TERM = fixtureTermId;
const OTHER_TERM = "202608";

const planA = aPlan({
  id: "plan_a_000001",
  order: 0,
  courses: [
    aPlanCourse({ courseCode: "CMSC351", sectionCode: "0101" }),
    aSavedCourse("MUSC130"),
  ],
});
const planB = aPlan({
  id: "plan_b_000001",
  name: "Plan B",
  order: 1,
  courses: [aPlanCourse({ courseCode: "CMSC351", sectionCode: "0201" })],
});
const fallPlan = aPlan({
  id: "plan_fall_0001",
  termId: OTHER_TERM,
  order: -5,
  courses: [aPlanCourse({ courseCode: "ENGL101", sectionCode: "0303" })],
});

describe("chatPlanFor", () => {
  it("takes the settings doc's choice", () => {
    const plans = [planA, planB, fallPlan];
    expect(chatPlanFor(TERM, plans, { [TERM]: planB.id })).toBe(planB);
  });

  it("falls back to the term's first tab", () => {
    expect(chatPlanFor(TERM, [planB, planA, fallPlan], {})).toBe(planA);
    // A choice that's gone (deleted), or from another term, doesn't count.
    expect(chatPlanFor(TERM, [planB, planA], { [TERM]: "plan_gone_001" })).toBe(
      planA,
    );
    expect(chatPlanFor(TERM, [planA, planB], { [TERM]: fallPlan.id })).toBe(
      planA,
    );
  });

  it("breaks tab-order ties by age, then id", () => {
    const older = aPlan({
      id: "plan_z_000001",
      createdAt: "2026-01-01T00:00:00.000Z",
    });
    const newer = aPlan({ id: "plan_a_000009" });
    expect(chatPlanFor(TERM, [newer, older], {})).toBe(older);
    const twin = aPlan({ id: "plan_0_000001" });
    expect(chatPlanFor(TERM, [newer, twin], {})).toBe(twin);
  });

  it("is null without a plan in the term", () => {
    expect(chatPlanFor(TERM, [fallPlan], {})).toBeNull();
    expect(chatMembersFor(TERM, [], {})).toEqual([]);
  });
});

describe("chatMembersFor", () => {
  it("lists the chat plan's courses, saved ones with no section", () => {
    expect(chatMembersFor(TERM, [planA, planB], {})).toEqual([
      { termId: TERM, courseCode: "CMSC351", sectionCode: "0101" },
      { termId: TERM, courseCode: "MUSC130", sectionCode: "" },
    ]);
    expect(chatMembersFor(TERM, [planA, planB], { [TERM]: planB.id })).toEqual([
      { termId: TERM, courseCode: "CMSC351", sectionCode: "0201" },
    ]);
  });
});

describe("sectionsInPlans", () => {
  it("collects the course's placed sections from every plan in the term", () => {
    expect(sectionsInPlans(TERM, "CMSC351", [planB, planA, fallPlan])).toEqual([
      "0101",
      "0201",
    ]);
    expect(sectionsInPlans(TERM, "MUSC130", [planA])).toEqual([]);
    expect(sectionsInPlans(OTHER_TERM, "CMSC351", [planA])).toEqual([]);
  });
});
