import { describe, expect, it } from "vitest";
import {
  DEFAULT_MUST_HAVES,
  GenItemSchema,
  MAX_WILDCARD_COUNT,
} from "../schema";
import {
  activeMustHaves,
  addWildcard,
  draftCourseCodes,
  relaxDraft,
  removeWildcard,
  requestItems,
} from "./draft";

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

describe("relaxDraft", () => {
  it("applies a relaxation to the form, leaving pick groups alone", () => {
    const pick = { kind: "pick" as const, id: "g", count: 1, courses: [] };
    const draft = {
      items: [
        {
          kind: "course" as const,
          courseCode: "CMSC351",
          required: true,
          sections: ["0101"],
        },
        pick,
      ],
      mustHaves: { ...DEFAULT_MUST_HAVES, earliestStart: 600 },
      rankBy: { preset: "compact" as const },
    };
    expect(
      relaxDraft(draft, {
        mustHaves: { earliestStart: null },
        makeOptional: "CMSC351",
        allowAllSections: "CMSC351",
      }),
    ).toEqual({
      ...draft,
      items: [{ kind: "course", courseCode: "CMSC351", required: false }, pick],
      mustHaves: DEFAULT_MUST_HAVES,
    });
  });
});

describe("wildcards in the form", () => {
  const cmsc4xx = { kind: "pattern" as const, pattern: "CMSC4XX" };
  const dshs = { kind: "gen-ed" as const, code: "DSHS" };

  it("adds a wildcard, and asks for one more course when it's added again", () => {
    const one = addWildcard([], cmsc4xx);
    expect(one).toEqual([
      { kind: "wildcard", wildcard: cmsc4xx, required: true, count: 1 },
    ]);
    const two = addWildcard(addWildcard(one, dshs), cmsc4xx);
    expect(two).toEqual([
      { kind: "wildcard", wildcard: cmsc4xx, required: true, count: 2 },
      { kind: "wildcard", wildcard: dshs, required: true, count: 1 },
    ]);
    let many = two;
    for (let i = 0; i < 10; i++) many = addWildcard(many, cmsc4xx);
    expect(many[0]).toMatchObject({ count: MAX_WILDCARD_COUNT });
    // Wildcards pass to the request as they are, and aren't courses.
    expect(requestItems(two)).toEqual(two);
    expect(draftCourseCodes(two)).toEqual([]);
  });

  it("removes a wildcard one course at a time", () => {
    const two = addWildcard(addWildcard([], cmsc4xx), cmsc4xx);
    const one = removeWildcard(two, cmsc4xx);
    expect(one).toEqual([
      { kind: "wildcard", wildcard: cmsc4xx, required: true, count: 1 },
    ]);
    expect(removeWildcard(one, cmsc4xx)).toEqual([]);
    expect(removeWildcard(one, dshs)).toEqual(one);
  });

  it("makes a wildcard optional when a relaxation says so", () => {
    const draft = {
      items: addWildcard(addWildcard([], cmsc4xx), dshs),
      mustHaves: DEFAULT_MUST_HAVES,
      rankBy: { preset: "compact" as const },
    };
    expect(
      relaxDraft(draft, { makeWildcardOptional: "gen-ed:DSHS" }).items,
    ).toEqual([
      { kind: "wildcard", wildcard: cmsc4xx, required: true, count: 1 },
      { kind: "wildcard", wildcard: dshs, required: false, count: 1 },
    ]);
  });
});
