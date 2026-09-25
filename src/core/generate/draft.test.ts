import { describe, expect, it } from "vitest";
import { DEFAULT_MUST_HAVES, GenItemSchema } from "../schema";
import { activeMustHaves, draftCourseCodes, requestItems } from "./draft";

describe("requestItems", () => {
  it("turns half-built pick groups into valid items", () => {
    const items = requestItems([
      { kind: "course", courseCode: "CMSC351", required: true },
      { kind: "pick", id: "a", count: 1, courses: [] },
      {
        kind: "pick",
        id: "b",
        count: 2,
        courses: [{ courseCode: "MUSC130", sections: ["0201"] }],
      },
      {
        kind: "pick",
        id: "c",
        count: 3,
        courses: [{ courseCode: "PHIL140" }, { courseCode: "ENGL393" }],
      },
    ]);
    expect(items).toEqual([
      { kind: "course", courseCode: "CMSC351", required: true },
      {
        kind: "course",
        courseCode: "MUSC130",
        sections: ["0201"],
        required: true,
      },
      {
        kind: "pick",
        id: "c",
        count: 2,
        courses: [{ courseCode: "PHIL140" }, { courseCode: "ENGL393" }],
      },
    ]);
    for (const item of items)
      expect(GenItemSchema.safeParse(item).success).toBe(true);
  });
});

describe("draftCourseCodes", () => {
  it("lists each course once, first mention first", () => {
    expect(
      draftCourseCodes([
        { kind: "course", courseCode: "CMSC351", required: true },
        {
          kind: "pick",
          id: "a",
          count: 1,
          courses: [{ courseCode: "MUSC130" }, { courseCode: "CMSC351" }],
        },
      ]),
    ).toEqual(["CMSC351", "MUSC130"]);
  });
});

describe("activeMustHaves", () => {
  it("names only what narrows the search", () => {
    expect(activeMustHaves(DEFAULT_MUST_HAVES, false)).toEqual([
      "enough-travel-time",
    ]);
    expect(
      activeMustHaves(
        {
          earliestStart: 600,
          latestEnd: 1020,
          daysOff: ["F"],
          enoughTravelTime: false,
          openSeatsOnly: true,
          respectBlocks: true,
          credits: { min: 12, max: null },
        },
        true,
      ),
    ).toEqual([
      "earliest-start",
      "latest-end",
      "days-off",
      "open-seats-only",
      "respect-blocks",
      "credits",
    ]);
  });
});
