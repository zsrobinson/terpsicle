import { describe, expect, it } from "vitest";
import { aPlan, aPlanCourse, aSavedCourse, fixtureTermId } from "~/fixtures";
import { chatMembersFor, sectionsInPlans } from "./members";

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

describe("chatMembersFor", () => {
  it("lists the main plan's courses, saved ones with no section", () => {
    expect(chatMembersFor(TERM, [planA, planB], {})).toEqual([
      { termId: TERM, courseCode: "CMSC351", sectionCode: "0101" },
      { termId: TERM, courseCode: "MUSC130", sectionCode: "" },
    ]);
    expect(chatMembersFor(TERM, [planA, planB], { [TERM]: planB.id })).toEqual([
      { termId: TERM, courseCode: "CMSC351", sectionCode: "0201" },
    ]);
  });

  it("is empty without a plan in the term", () => {
    expect(chatMembersFor(TERM, [fallPlan], {})).toEqual([]);
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
