import { describe, expect, it } from "vitest";
import {
  type Course,
  DEFAULT_TRAVEL_SETTINGS,
  type Message,
  type Plan,
  type Problem,
  ProblemSchema,
} from "../schema";
import { buildCatalogIndex, snapshotOf } from "../catalog/catalog-index";
import {
  aBlock,
  aCourse,
  aMeeting,
  anUntimedMeeting,
  aPlan,
  aSection,
  placed,
  saved,
} from "../test-support/builders";
import { decodeRoutes, encodeRoutes } from "../travel/routes-binary";
import type { ProblemsInput } from "./detect";
import { countBySeverity, planProblems, planWithSection, sortProblems } from "./problems";

const TERM = "202701";

const routes = decodeRoutes(
  encodeRoutes({
    buildings: ["IRB", "ESJ", "KEY"],
    // IRB–KEY is far (12 min typical); everything else is 3 min.
    distance: (_m, a, b) => (a + b === "IRBKEY" || a + b === "KEYIRB" ? 3000 : 700),
  }),
);

function input(courses: Course[], plan: Plan, extra: Partial<ProblemsInput> = {}): ProblemsInput {
  return {
    plan,
    index: buildCatalogIndex(TERM, courses),
    blocks: [],
    travel: DEFAULT_TRAVEL_SETTINGS,
    routes,
    seats: null,
    ...extra,
  };
}

/** Renders a message the way the UI would, for readable assertions. */
function words(message: Message): string {
  return message
    .map((p) => {
      switch (p.kind) {
        case "text":
          return p.text;
        case "course":
          return p.courseCode;
        case "section":
          return p.sectionKey.replace("-", " ");
        case "block":
          return p.label;
        case "day":
          return p.day;
        case "time":
          return String(p.minutes);
        case "duration":
          return `${p.minutes} min`;
      }
    })
    .join("");
}

const summary = (ps: Problem[]) => ps.map((p) => [p.severity, p.kind, words(p.title), p.fix?.label ?? null]);

const cmsc330 = aCourse({
  code: "CMSC330",
  sections: [aSection({ code: "0101", meetings: [aMeeting({ start: 600, end: 650, building: "IRB" })] })],
});

describe("travel problems", () => {
  const cmsc351 = aCourse({
    code: "CMSC351",
    sections: [
      aSection({ code: "0201", meetings: [aMeeting({ start: 655, end: 705, building: "KEY" })] }),
      aSection({ code: "0301", meetings: [aMeeting({ start: 654, end: 704, building: "ESJ" })] }), // tight
      aSection({ code: "0401", meetings: [aMeeting({ start: 670, end: 720, building: "ESJ" })] }), // fine
    ],
  });

  it("groups not-enough-time across days and offers the best switch", () => {
    const plan = aPlan({ termId: TERM, courses: [placed(cmsc330, "0101"), placed(cmsc351, "0201")] });
    const ps = planProblems(input([cmsc330, cmsc351], plan));
    expect(summary(ps)).toEqual([
      ["error", "not-enough-time", "Not enough time to get from CMSC330 to CMSC351", "Switch CMSC351 to 0401"],
    ]);
    const [p] = ps;
    expect(p?.id).toBe("not-enough-time:CMSC330-0101>CMSC351-0201");
    expect(p?.subjects).toEqual([
      { kind: "connection", connectionId: "M:CMSC330-0101#0>CMSC351-0201#0" },
      { kind: "section", sectionKey: "CMSC351-0201" },
      { kind: "section", sectionKey: "CMSC330-0101" },
    ]);
    expect(words(p?.detail ?? [])).toBe("12 min to get there, 5 min between classes · M, W, F");
    expect(p?.fix).toEqual({ kind: "switch", sectionKey: "CMSC351-0401", label: "Switch CMSC351 to 0401" });
    for (const problem of ps) expect(ProblemSchema.safeParse(problem).success).toBe(true);
  });

  it("warns about tight connections", () => {
    const plan = aPlan({ termId: TERM, courses: [placed(cmsc330, "0101"), placed(cmsc351, "0301")] });
    const [p] = planProblems(input([cmsc330, cmsc351], plan));
    expect(p).toMatchObject({ severity: "warning", kind: "tight-connection", id: "tight-connection:CMSC330-0101>CMSC351-0301" });
    expect(words(p?.title ?? [])).toBe("Tight connection from CMSC330 to CMSC351");
  });

  it("stays quiet until routes load", () => {
    const plan = aPlan({ termId: TERM, courses: [placed(cmsc330, "0101"), placed(cmsc351, "0201")] });
    expect(planProblems(input([cmsc330, cmsc351], plan, { routes: null }))).toEqual([]);
  });
});

describe("overlaps", () => {
  const math = aCourse({
    code: "MATH240",
    sections: [
      aSection({ code: "0101", meetings: [aMeeting({ start: 630, end: 680, building: "IRB" }), aMeeting({ days: ["Tu"], start: 600, end: 650, building: "IRB" })] }),
      aSection({ code: "0201", meetings: [aMeeting({ days: ["Tu", "Th"], start: 780, end: 855, building: "IRB" })] }),
    ],
  });

  it("lists an overlap calmly, with its times, and a fix", () => {
    const plan = aPlan({ termId: TERM, courses: [placed(cmsc330, "0101"), placed(math, "0101")] });
    const ps = planProblems(input([cmsc330, math], plan));
    expect(summary(ps)).toEqual([["warning", "overlap", "CMSC330 and MATH240 overlap", "Switch MATH240 to 0201"]]);
    expect(ps[0]?.id).toBe("overlap:CMSC330-0101,MATH240-0101");
    expect(words(ps[0]?.detail ?? [])).toBe("M, W, F 630–650");
  });

  it("lists overlaps with blocks, but not between blocks", () => {
    const plan = aPlan({ termId: TERM, courses: [placed(math, "0201")] });
    const blocks = [
      aBlock({ termId: TERM, id: "block-work", label: "Work", days: ["Tu"], start: 800, end: 900 }),
      aBlock({ termId: TERM, id: "block-gym1", label: "Gym", days: ["Tu", "Th"], start: 840, end: 960 }),
    ];
    const ps = planProblems(input([math], plan, { blocks }));
    expect(ps.map((p) => [words(p.title), words(p.detail), p.fix?.label])).toEqual([
      ["MATH240 overlaps Work", "Tu 800–855", "Switch to 0101"],
      ["MATH240 overlaps Gym", "Tu, Th 840–855", "Switch to 0101"],
    ]);
    expect(ps[0]?.subjects[1]).toEqual({ kind: "block", blockId: "block-work" });
  });

  it("offers no fix when every alternative creates a new problem", () => {
    const only = aCourse({ code: "ENGL393", sections: [aSection({ code: "0101", meetings: [aMeeting({ start: 620, end: 670 })] })] });
    const plan = aPlan({ termId: TERM, courses: [placed(cmsc330, "0101"), placed(only, "0101")] });
    expect(planProblems(input([cmsc330, only], plan))[0]?.fix).toBeNull();
  });
});

describe("section problems", () => {
  const course = aCourse({
    code: "CMSC351",
    sections: [
      aSection({ code: "0101", restriction: "Restricted to CMSC majors." }),
      aSection({ code: "0201", instructors: [], meetings: [aMeeting({ days: ["Tu"] })] }),
      aSection({ code: "0301", delivery: "online-async", meetings: [anUntimedMeeting()] }),
      aSection({ code: "0401", meetings: [anUntimedMeeting({ online: false })] }),
      aSection({ code: "0501", meetings: [aMeeting({ days: ["Th"] })] }),
    ],
  });
  const plan = (code: string) => aPlan({ termId: TERM, courses: [placed(course, code)] });

  it("warns about full and low sections, with seat words", () => {
    const seats = {
      "CMSC351-0101": [0, 30, 9, 0] as [number, number, number, number],
      "CMSC351-0501": [20, 30, 0, 0] as [number, number, number, number],
    };
    const full = planProblems(input([course], plan("0101"), { seats }));
    expect(summary(full)).toEqual([
      ["warning", "full", "CMSC351 0101 is full", "Switch to 0501"],
      ["warning", "restricted", "CMSC351 0101 is restricted", "Switch to 0501"],
    ]);
    expect(words(full[0]?.detail ?? [])).toBe("9 waitlisted.");
    const low = planProblems(input([course], plan("0101"), { seats: { "CMSC351-0101": [1, 30, 0, 0] } }));
    expect(words(low[0]?.title ?? [])).toBe("CMSC351 0101 has 1 seat left");
    const empty = planProblems(input([course], plan("0101"), { seats: { "CMSC351-0101": [0, 30, 0, 0] } }));
    expect(words(empty[0]?.detail ?? [])).toBe("Nobody is on the waitlist yet.");
  });

  it("notes TBA instructors and sections with no set times", () => {
    expect(summary(planProblems(input([course], plan("0201"))))).toEqual([
      ["info", "instructor-tba", "Instructor TBA for CMSC351 0201", null],
    ]);
    expect(summary(planProblems(input([course], plan("0301"))))).toEqual([
      ["info", "no-set-times", "CMSC351 0301 is online with no set times", null],
    ]);
    expect(words(planProblems(input([course], plan("0401")))[0]?.title ?? [])).toBe("CMSC351 0401 has no set times");
  });

  it("ignores saved-for-later courses", () => {
    const p = aPlan({ termId: TERM, courses: [saved("CMSC351")] });
    expect(planProblems(input([course], p, { seats: { "CMSC351-0101": [0, 1, 0, 0] } }))).toEqual([]);
  });
});

describe("catalog changes", () => {
  const before = aCourse({ code: "CMSC351", sections: [aSection({ code: "0101" }), aSection({ code: "0201", meetings: [aMeeting({ days: ["Tu"] })] })] });
  const plan = aPlan({ termId: TERM, courses: [placed(before, "0101")] });

  it("errors on a cancelled section and offers another", () => {
    const after = aCourse({ code: "CMSC351", sections: [aSection({ code: "0101", cancelled: true }), before.sections[1] ?? aSection()] });
    const ps = planProblems(input([after], plan));
    expect(summary(ps)).toEqual([["error", "cancelled", "CMSC351 0101 was cancelled", "Switch to 0201"]]);
    expect(words(ps[0]?.detail ?? [])).toBe("The Schedule of Classes lists it as cancelled.");
    const removed = planProblems(input([aCourse({ code: "CMSC351", sections: [before.sections[1] ?? aSection()] })], plan));
    expect(words(removed[0]?.detail ?? [])).toBe("It's no longer in the Schedule of Classes.");
  });

  it("errors on a changed section and offers to keep the new times", () => {
    const after = aCourse({
      code: "CMSC351",
      sections: [aSection({ code: "0101", meetings: [aMeeting({ days: ["Tu", "Th"], start: 660, end: 735, room: "1116" })] })],
    });
    const [p] = planProblems(input([after], plan));
    expect(p).toMatchObject({
      kind: "changed",
      severity: "error",
      fix: { kind: "accept-change", sectionKey: "CMSC351-0101", label: "Keep new times" },
    });
    expect(words(p?.detail ?? [])).toBe("Now Tu, Th 660–735 in IRB 1116; was M, W, F 600–650 in IRB 0318.");
  });

  it("describes instructor and delivery changes", () => {
    const after = aCourse({
      code: "CMSC351",
      sections: [aSection({ code: "0101", instructors: [], delivery: "blended" })],
    });
    const [changed] = planProblems(input([after], plan)).filter((p) => p.kind === "changed");
    expect(changed?.fix?.label).toBe("Keep changes");
    expect(words(changed?.detail ?? [])).toBe(
      "Instructor is now TBA; was Clyde Kruskal. Now blended; was in person.",
    );
  });

  it("describes online and unlisted meetings", () => {
    const after = aCourse({
      code: "CMSC351",
      sections: [aSection({ code: "0101", meetings: [aMeeting({ online: true, building: null, room: null }), anUntimedMeeting()] })],
    });
    const [p] = planProblems(input([after], plan));
    expect(words(p?.detail ?? [])).toBe("Now M, W, F 600–650 online; no set times; was M, W, F 600–650 in IRB 0318.");
    const bare = aPlan({ termId: TERM, courses: [{ ...placed(before, "0101"), snapshot: { ...snapshotOf(aSection()), meetings: [] } }] });
    const [q] = planProblems(input([before], bare));
    expect(words(q?.detail ?? [])).toContain("was no meetings listed");
  });
});

describe("ordering and counts", () => {
  it("sorts by severity, stably", () => {
    const ps = [
      { severity: "info" as const, n: 1 },
      { severity: "error" as const, n: 2 },
      { severity: "warning" as const, n: 3 },
      { severity: "error" as const, n: 4 },
    ];
    expect(sortProblems(ps).map((p) => p.n)).toEqual([2, 4, 3, 1]);
  });

  it("counts by severity", () => {
    const course = aCourse({ sections: [aSection({ instructors: [], restriction: "Restricted to majors." })] });
    const plan = aPlan({ termId: TERM, courses: [placed(course, "0101")] });
    expect(countBySeverity(planProblems(input([course], plan)))).toEqual({ error: 0, warning: 1, info: 1 });
  });

  it("switches a plan's section with a fresh snapshot", () => {
    const course = aCourse({ sections: [aSection({ code: "0101" }), aSection({ code: "0201", instructors: ["A B"] })] });
    const plan = aPlan({ termId: TERM, courses: [placed(course, "0101"), saved("CMSC330")] });
    // biome-ignore lint/style/noNonNullAssertion: built with two sections
    const next = planWithSection(plan, "CMSC351", course.sections[1]!);
    expect(next.courses[0]).toEqual(placed(course, "0201"));
    expect(next.courses[1]).toBe(plan.courses[1]);
  });
});
