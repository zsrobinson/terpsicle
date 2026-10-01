import { describe, expect, it } from "vitest";
import { patchHistoryDept } from "~/core/history";
import {
  aHistoryCourse,
  archivedFixtureTermId,
  fixtureTermId,
} from "~/fixtures";
import { instructorIdCandidates } from "./slugs";
import { historyInstructorSlug, taughtOnlyPageData } from "./taught-only";

const older = patchHistoryDept(null, "CMSC", archivedFixtureTermId, [
  aHistoryCourse({
    code: "CMSC250",
    instructors: ["Jane Doe"],
    sections: [{ code: "0101", instructors: ["Jane Doe"] }],
  }),
]);
const dept = patchHistoryDept(older, "CMSC", fixtureTermId, [
  aHistoryCourse({
    instructors: ["Ada Brandt", "Jane Doe"],
    sections: [
      { code: "0101", instructors: ["Ada Brandt"] },
      { code: "0201", instructors: ["Jane Doe"] },
    ],
  }),
]);

describe("historyInstructorSlug", () => {
  it("reads like the name, and is a valid address", () => {
    expect(historyInstructorSlug("Jane Doe")).toBe("jane-doe");
    expect(historyInstructorSlug("Zoë  O'Brien-Núñez")).toBe(
      "zoe-o-brien-nunez",
    );
    expect(historyInstructorSlug("J. Q. Public")).toBe("j-q-public");
    expect(instructorIdCandidates("jane-doe")[0]).toBe("jane-doe");
  });
});

describe("taughtOnlyPageData", () => {
  it("finds the name among who taught the course, with all they taught in the department", () => {
    expect(taughtOnlyPageData(dept, "CMSC351", "jane-doe")).toEqual({
      slug: "jane-doe",
      name: "Jane Doe",
      course: "CMSC351",
      taught: [
        expect.objectContaining({
          course: "CMSC351",
          termId: fixtureTermId,
          sections: ["0201"],
        }),
        expect.objectContaining({
          course: "CMSC250",
          termId: archivedFixtureTermId,
        }),
      ],
    });
  });

  it("is null when nobody who taught the course has that address", () => {
    expect(taughtOnlyPageData(dept, "CMSC351", "john-roe")).toBeNull();
    // They taught CMSC250 and CMSC351, not CMSC999.
    expect(taughtOnlyPageData(dept, "CMSC999", "jane-doe")).toBeNull();
    expect(taughtOnlyPageData(null, "CMSC351", "jane-doe")).toBeNull();
    expect(taughtOnlyPageData(dept, "CMSC351", "")).toBeNull();
  });
});
