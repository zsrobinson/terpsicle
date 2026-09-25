import { describe, expect, it } from "vitest";
import {
  aCourse,
  aPlan,
  aPlanCourse,
  aSavedCourse,
  fixtureTermId,
} from "~/fixtures";
import { buildCatalogIndex } from "../catalog/catalog-index";
import { creditsLabel, planCredits } from "./credits";

describe("planCredits", () => {
  const index = buildCatalogIndex(fixtureTermId, [
    aCourse({ code: "CMSC351", credits: { min: 3, max: 3 } }),
    aCourse({ code: "MUSC229", credits: { min: 1, max: 3 } }),
    aCourse({ code: "MUSC130", credits: { min: 3, max: 3 } }),
  ]);

  it("adds placed courses, with variable credits as a range", () => {
    const plan = aPlan({
      courses: [
        aPlanCourse({ courseCode: "CMSC351" }),
        aPlanCourse({ courseCode: "MUSC229" }),
      ],
    });
    expect(planCredits(plan, index)).toEqual({ min: 4, max: 6 });
  });

  it("leaves out saved-for-later courses and ones not loaded yet", () => {
    const plan = aPlan({
      courses: [
        aPlanCourse({ courseCode: "CMSC351" }),
        aSavedCourse("MUSC130"),
        aPlanCourse({ courseCode: "MATH141" }),
      ],
    });
    expect(planCredits(plan, index)).toEqual({ min: 3, max: 3 });
  });
});

describe("creditsLabel", () => {
  it("says it in plain words", () => {
    expect(creditsLabel({ min: 16, max: 16 })).toBe("16 credits");
    expect(creditsLabel({ min: 1, max: 1 })).toBe("1 credit");
    expect(creditsLabel({ min: 0, max: 0 })).toBe("0 credits");
    expect(creditsLabel({ min: 15, max: 17 })).toBe("15–17 credits");
    expect(creditsLabel({ min: 1.5, max: 1.5 })).toBe("1.5 credits");
  });
});
