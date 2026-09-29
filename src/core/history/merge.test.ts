import { describe, expect, it } from "vitest";
import { HistoryDeptSchema, HistoryTermSchema } from "~/core/schema/history";
import {
  aHistoryCourse,
  aHistoryTerm,
  archivedFixtureTermId,
  fixtureTermId,
} from "~/fixtures";
import {
  historySourceCounts,
  mergeHistoryCourse,
  mergeHistoryTerm,
  patchHistoryDept,
} from "./merge";

const theirs = aHistoryCourse({
  source: "planetterp",
  title: null,
  credits: null,
  instructors: ["Clyde Kruskal"],
  sections: [{ code: "0201", instructors: ["Clyde Kruskal"] }],
});

describe("mergeHistoryCourse", () => {
  it("keeps our own record over PlanetTerp's that arrives later", () => {
    const ours = aHistoryCourse();
    expect(mergeHistoryCourse(ours, theirs)).toBe(ours);
  });

  it("replaces PlanetTerp's record with our own", () => {
    const ours = aHistoryCourse();
    expect(mergeHistoryCourse(theirs, ours)).toBe(ours);
  });

  it("takes the newer sighting's sections from the same source (a vanished section was cancelled)", () => {
    const before = aHistoryCourse({
      instructors: ["Ada Brandt", "Ben Ortiz"],
      sections: [
        { code: "0101", instructors: ["Ada Brandt"] },
        { code: "0201", instructors: ["Ben Ortiz"] },
      ],
    });
    const after = aHistoryCourse({
      instructors: ["Ada Brandt"],
      sections: [{ code: "0101", instructors: ["Ada Brandt"] }],
    });
    expect(mergeHistoryCourse(before, after)).toEqual(after);
  });

  it("never sends a section's names back to TBA", () => {
    const before = aHistoryCourse();
    const after = aHistoryCourse({
      instructors: [],
      sections: [{ code: "0101", instructors: [] }],
    });
    expect(mergeHistoryCourse(before, after)).toEqual(before);
  });

  it("never lets a course with no sections replace one that has them", () => {
    // What a truncated sections answer publishes (DATA.md §4.1).
    const before = aHistoryCourse();
    const truncated = aHistoryCourse({
      title: "Algorithms II",
      instructors: [],
      sections: [],
    });
    expect(mergeHistoryCourse(before, truncated)).toEqual({
      ...before,
      title: "Algorithms II",
    });
    // A course that never had sections takes the new sighting as usual.
    const none = aHistoryCourse({ instructors: [], sections: [] });
    expect(mergeHistoryCourse(none, truncated)).toEqual(truncated);
  });

  it("lets a new name replace an old one", () => {
    const before = aHistoryCourse();
    const after = aHistoryCourse({
      instructors: ["Ben Ortiz"],
      sections: [{ code: "0101", instructors: ["Ben Ortiz"] }],
    });
    expect(mergeHistoryCourse(before, after).instructors).toEqual([
      "Ben Ortiz",
    ]);
  });

  it("keeps the title and credits it had when the new sighting has none", () => {
    const earlier = {
      ...theirs,
      title: "Algorithms",
      credits: { min: 3, max: 3 },
    };
    const merged = mergeHistoryCourse(earlier, theirs);
    expect(merged.title).toBe("Algorithms");
    expect(merged.credits).toEqual({ min: 3, max: 3 });
  });
});

describe("mergeHistoryTerm", () => {
  it("starts a term from nothing", () => {
    const term = mergeHistoryTerm(null, fixtureTermId, [aHistoryCourse()]);
    expect(HistoryTermSchema.parse(term)).toEqual(aHistoryTerm());
  });

  it("never drops a course the new sighting doesn't mention", () => {
    const existing = aHistoryTerm({
      courses: [
        aHistoryCourse({ code: "CMSC250" }),
        aHistoryCourse({ code: "CMSC351" }),
      ],
    });
    const term = mergeHistoryTerm(existing, fixtureTermId, [
      aHistoryCourse({ code: "CMSC131" }),
    ]);
    expect(term.courses.map((c) => c.code)).toEqual([
      "CMSC131",
      "CMSC250",
      "CMSC351",
    ]);
    expect(HistoryTermSchema.safeParse(term).success).toBe(true);
  });

  it("fills in a term PlanetTerp knew from our own record, course by course", () => {
    const existing = aHistoryTerm({
      courses: [theirs, { ...theirs, code: "CMSC420" }],
    });
    const term = mergeHistoryTerm(existing, fixtureTermId, [aHistoryCourse()]);
    expect(historySourceCounts(term)).toEqual({ terpsicle: 1, planetterp: 1 });
    expect(term.courses[0]).toEqual(aHistoryCourse());
  });
});

describe("patchHistoryDept", () => {
  it("adds a term to a course, newest first, and keeps the other terms", () => {
    const first = patchHistoryDept(null, "CMSC", archivedFixtureTermId, [
      aHistoryCourse({ title: "Old title" }),
    ]);
    const second = patchHistoryDept(first, "CMSC", fixtureTermId, [
      aHistoryCourse(),
      aHistoryCourse({ code: "MATH140" }),
    ]);
    const dept = HistoryDeptSchema.parse(second);
    expect(dept.courses).toHaveLength(1);
    expect(dept.courses[0]?.title).toBe("Algorithms");
    expect(dept.courses[0]?.offerings.map((o) => o.termId)).toEqual([
      fixtureTermId,
      archivedFixtureTermId,
    ]);
  });

  it("replaces a term it already had, and keeps the newest term's title when an older one arrives", () => {
    const first = patchHistoryDept(null, "CMSC", fixtureTermId, [
      aHistoryCourse(),
    ]);
    const again = patchHistoryDept(first, "CMSC", fixtureTermId, [
      aHistoryCourse({ instructors: ["Ben Ortiz"], sections: [] }),
    ]);
    expect(again?.courses[0]?.offerings).toEqual([
      {
        termId: fixtureTermId,
        source: "terpsicle",
        instructors: ["Ben Ortiz"],
        sections: [],
      },
    ]);
    const older = patchHistoryDept(again, "CMSC", archivedFixtureTermId, [
      aHistoryCourse({ title: "Old title", source: "planetterp" }),
    ]);
    expect(older?.courses[0]?.title).toBe("Algorithms");
  });

  it("is null for a department with nothing in it", () => {
    expect(patchHistoryDept(null, "CMSC", fixtureTermId, [])).toBeNull();
  });
});
