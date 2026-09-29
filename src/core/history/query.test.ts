import { describe, expect, it } from "vitest";
import {
  aHistoryCourse,
  archivedFixtureTermId,
  fixtureTermId,
} from "~/fixtures";
import { patchHistoryDept } from "./merge";
import { courseOfferings, taughtBy, whoTaught } from "./query";

const older = patchHistoryDept(null, "CMSC", archivedFixtureTermId, [
  aHistoryCourse({
    source: "planetterp",
    instructors: ["Clyde Kruskal"],
    sections: [{ code: "0101", instructors: ["Clyde Kruskal"] }],
  }),
]);
const dept = patchHistoryDept(older, "CMSC", fixtureTermId, [
  aHistoryCourse({ code: "CMSC250" }),
  aHistoryCourse({
    instructors: ["Ada Brandt", "Clyde P. Kruskal"],
    sections: [
      { code: "0101", instructors: ["Ada Brandt"] },
      { code: "0201", instructors: ["Clyde P. Kruskal"] },
    ],
  }),
]);

describe("whoTaught", () => {
  it("answers for a course in a term", () => {
    expect(whoTaught(dept, "CMSC351", archivedFixtureTermId)).toMatchObject({
      source: "planetterp",
      instructors: ["Clyde Kruskal"],
    });
  });

  it("is null for a term or course it has no record of", () => {
    expect(whoTaught(dept, "CMSC250", archivedFixtureTermId)).toBeNull();
    expect(whoTaught(dept, "CMSC999", fixtureTermId)).toBeNull();
    expect(whoTaught(null, "CMSC351", fixtureTermId)).toBeNull();
  });
});

describe("courseOfferings", () => {
  it("lists every term on record, newest first", () => {
    expect(courseOfferings(dept, "CMSC351").map((o) => o.termId)).toEqual([
      fixtureTermId,
      archivedFixtureTermId,
    ]);
  });
});

describe("taughtBy", () => {
  it("matches every spelling it's given, ignoring case and spacing", () => {
    expect(
      taughtBy([dept, dept], ["clyde  kruskal", "Clyde P. Kruskal"]),
    ).toEqual([
      {
        course: "CMSC351",
        title: "Algorithms",
        termId: fixtureTermId,
        source: "terpsicle",
        sections: ["0201"],
      },
      {
        course: "CMSC351",
        title: "Algorithms",
        termId: archivedFixtureTermId,
        source: "planetterp",
        sections: ["0101"],
      },
    ]);
  });

  it("is empty for someone with no record", () => {
    expect(taughtBy([dept, null], ["Nobody Here"])).toEqual([]);
  });
});
