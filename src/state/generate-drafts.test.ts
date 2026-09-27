import { describe, expect, it } from "vitest";
import { aPlan, aPlanCourse, aSavedCourse, fixtureTermId } from "~/fixtures";
import { draftFor, EMPTY_DRAFT } from "./generate-drafts";

describe("draftFor", () => {
  const plan = aPlan({
    termId: fixtureTermId,
    courses: [
      aPlanCourse({ courseCode: "CMSC351", sectionCode: "0101" }),
      aSavedCourse("MUSC130"),
    ],
  });

  it("starts an untouched form with the open plan's courses", () => {
    expect(draftFor({}, fixtureTermId, plan)).toEqual({
      ...EMPTY_DRAFT,
      items: [
        { kind: "course", courseCode: "CMSC351", required: true },
        { kind: "course", courseCode: "MUSC130", required: false },
      ],
    });
  });

  it("keeps a saved draft, even an empty one", () => {
    const built = {
      ...EMPTY_DRAFT,
      items: [
        { kind: "course" as const, courseCode: "ENGL101", required: true },
      ],
    };
    expect(draftFor({ [fixtureTermId]: built }, fixtureTermId, plan)).toBe(
      built,
    );
    expect(
      draftFor({ [fixtureTermId]: EMPTY_DRAFT }, fixtureTermId, plan),
    ).toBe(EMPTY_DRAFT);
  });

  it("is empty without a plan, or with another term's", () => {
    expect(draftFor({}, fixtureTermId)).toBe(EMPTY_DRAFT);
    expect(draftFor({}, fixtureTermId, { ...plan, termId: "202608" })).toBe(
      EMPTY_DRAFT,
    );
    expect(draftFor({}, fixtureTermId, { ...plan, courses: [] })).toBe(
      EMPTY_DRAFT,
    );
  });
});
