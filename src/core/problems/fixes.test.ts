import { describe, expect, it } from "vitest";
import {
  aCourse,
  aMeeting,
  aPlan,
  aPlanCourse,
  aSeatTuple,
  aSection,
} from "~/fixtures";
import {
  buildCatalogIndex,
  placedSections,
  snapshotOf,
} from "../catalog/catalog-index";
import {
  type Course,
  DEFAULT_TRAVEL_SETTINGS,
  type Plan,
  type PlanCourse,
} from "../schema";
import { campusMap } from "../travel/campus";
import { planConnections } from "../travel/connections";
import { decodeRoutes, encodeRoutes } from "../travel/routes-binary";
import type { ProblemsInput } from "./detect";
import { connectionFixes } from "./fixes";

const TERM = "202701";

// IRB–KEY is 3,000 ft (12 min at the typical pace); every other pair is 700 ft (3 min).
const routes = decodeRoutes(
  encodeRoutes({
    buildings: ["IRB", "ESJ", "KEY"],
    distance: (_m, a, b) =>
      a + b === "IRBKEY" || a + b === "KEYIRB" ? 3000 : 700,
  }),
);

function placed(course: Course, sectionCode: string): PlanCourse {
  const section = course.sections.find((s) => s.code === sectionCode);
  if (!section) throw new Error(`${course.code} has no section ${sectionCode}`);
  return aPlanCourse({
    courseCode: course.code,
    sectionCode,
    snapshot: snapshotOf(section),
  });
}

function input(
  courses: Course[],
  plan: Plan,
  extra: Partial<ProblemsInput> = {},
): ProblemsInput {
  return {
    plan,
    index: buildCatalogIndex(TERM, courses),
    blocks: [],
    travel: DEFAULT_TRAVEL_SETTINGS,
    campus: campusMap(routes, null),
    seats: null,
    ...extra,
  };
}

function firstConnection(i: ProblemsInput) {
  const [c] = planConnections(
    placedSections(i.plan, i.index),
    i.travel,
    i.campus,
  );
  if (!c) throw new Error("no connection");
  return c;
}

// CMSC330 ends at 10:50 in IRB, MWF.
const cmsc330 = aCourse({
  code: "CMSC330",
  sections: [
    aSection({
      code: "0101",
      meetings: [aMeeting({ start: 600, end: 650, building: "IRB" })],
    }),
    aSection({
      code: "0102",
      meetings: [aMeeting({ start: 480, end: 530, building: "IRB" })],
    }), // 8am: no connection into CMSC351 at 10:55
    aSection({
      code: "0103",
      meetings: [aMeeting({ start: 600, end: 650, building: "ESJ" })],
    }), // ESJ → KEY is 3 min in a 5-minute gap: fine
  ],
});

const cmsc351 = aCourse({
  code: "CMSC351",
  sections: [
    aSection({
      code: "0201",
      meetings: [aMeeting({ start: 655, end: 705, building: "KEY" })],
    }), // 12 min in a 5-minute gap
    aSection({
      code: "0301",
      meetings: [aMeeting({ start: 654, end: 704, building: "ESJ" })],
    }), // 3 min in 4: tight, still a problem
    aSection({
      code: "0401",
      meetings: [aMeeting({ start: 670, end: 720, building: "ESJ" })],
    }), // fine
    aSection({
      code: "0501",
      meetings: [aMeeting({ start: 600, end: 650, building: "ESJ" })],
    }), // overlaps CMSC330: a new problem
  ],
});

describe("connectionFixes", () => {
  const plan = aPlan({
    termId: TERM,
    courses: [placed(cmsc330, "0101"), placed(cmsc351, "0201")],
  });

  it("lists every section of either course that fixes the connection, later course first", () => {
    const i = input([cmsc330, cmsc351], plan);
    const connection = firstConnection(i);
    expect(connection.verdict).toBe("insufficient");
    expect(connectionFixes(i, connection).map((f) => f.key)).toEqual([
      "CMSC351-0401",
      "CMSC330-0102",
      "CMSC330-0103",
    ]);
  });

  it("leaves out sections that swap one problem for another", () => {
    const i = input([cmsc330, cmsc351], plan);
    const keys = connectionFixes(i, firstConnection(i)).map((f) => f.key);
    // Tight instead of short, and an overlap: neither fixes it.
    expect(keys).not.toContain("CMSC351-0301");
    expect(keys).not.toContain("CMSC351-0501");
  });

  it("leaves out full sections when seats are known", () => {
    const i = input([cmsc330, cmsc351], plan, {
      seats: { "CMSC351-0401": aSeatTuple({ open: 0, total: 30 }) },
    });
    expect(connectionFixes(i, firstConnection(i)).map((f) => f.key)).toEqual([
      "CMSC330-0102",
      "CMSC330-0103",
    ]);
  });

  it("offers nothing for connections that are fine", () => {
    const fine = aPlan({
      termId: TERM,
      courses: [placed(cmsc330, "0101"), placed(cmsc351, "0401")],
    });
    const i = input([cmsc330, cmsc351], fine);
    const connection = firstConnection(i);
    expect(connection.verdict).toBe("ok");
    expect(connectionFixes(i, connection)).toEqual([]);
  });
});
