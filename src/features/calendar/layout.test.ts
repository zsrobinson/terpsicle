import { describe, expect, it } from "vitest";
import { buildCatalogIndex } from "~/core/catalog";
import { buildFitContext } from "~/core/fit";
import {
  type Course,
  DEFAULT_TRAVEL_SETTINGS,
  sectionKey,
} from "~/core/schema";
import { EMPTY_CAMPUS } from "~/core/travel";
import {
  aBlock,
  aConnection,
  aCourse,
  anUntimedMeeting,
  aPlan,
  aPlanCourse,
  aSection,
  aTimedMeeting,
  demoBlocks,
  demoPlan,
  fixtureTermId,
  mockCourse,
  mockCourses,
  mockSeats,
} from "~/fixtures";
import {
  buildCalendarModel,
  type CalendarInput,
  previewOrder,
  stepPreview,
} from "./layout";
import { daysBetween, snapMinute } from "./new-block";

const code = (n: number) => String(n).padStart(4, "0");

/** Placed sections of `courses`, one per course, in a plan. */
function input(
  courses: readonly Course[],
  overrides: Partial<CalendarInput> = {},
): CalendarInput {
  const plan = aPlan({
    courses: courses.map((c) =>
      aPlanCourse({ courseCode: c.code, sectionCode: c.sections[0]?.code }),
    ),
  });
  return {
    plan,
    index: buildCatalogIndex(fixtureTermId, courses),
    blocks: [],
    colors: {},
    connections: [],
    ghostCourse: null,
    fit: null,
    seats: null,
    preview: null,
    ...overrides,
  };
}

describe("buildCalendarModel", () => {
  it("gives courses with no stored color distinct colors (a shared link)", () => {
    // The shared plan whose three courses once all came out pink.
    const courses = ["ENEE322", "BMGT220", "BIOE221", "ECON306"].map((c) =>
      aCourse({ code: c }),
    );
    const model = buildCalendarModel(
      input(courses, { colors: { ECON306: "green" } }),
    );
    const byCourse = new Map(
      model.columns
        .flatMap((c) => c.entries)
        .flatMap((e) => (e.kind === "class" ? [[e.courseCode, e.color]] : [])),
    );
    expect(byCourse.get("ECON306")).toBe("green");
    expect(new Set(byCourse.values()).size).toBe(4);
  });

  it("fits hours to the plan, never less than 8am–5pm, Monday to Friday", () => {
    const model = buildCalendarModel(input([aCourse()]));
    expect(model.startMinute).toBe(8 * 60);
    expect(model.endMinute).toBe(17 * 60);
    expect(model.days).toEqual(["M", "Tu", "W", "Th", "F"]);

    const late = aCourse({
      code: "ENGL101",
      sections: [
        aSection({
          meetings: [aTimedMeeting({ start: 18 * 60, end: 20 * 60 + 30 })],
        }),
      ],
    });
    expect(buildCalendarModel(input([late])).endMinute).toBe(21 * 60);
  });

  it("adds Saturday only when something meets then", () => {
    const saturday = aCourse({
      sections: [aSection({ meetings: [aTimedMeeting({ days: ["Sa"] })] })],
    });
    expect(buildCalendarModel(input([saturday])).days).toEqual([
      "M",
      "Tu",
      "W",
      "Th",
      "F",
      "Sa",
    ]);
  });

  it("lists sections with no set time in the strip, not the grid", () => {
    const online = aCourse({
      code: "ENGL393",
      sections: [
        aSection({
          code: "0312",
          delivery: "online-async",
          meetings: [anUntimedMeeting()],
        }),
      ],
    });
    const model = buildCalendarModel(input([aCourse(), online]));
    expect(model.untimed).toMatchObject([
      { courseCode: "ENGL393", sectionCode: "0312", delivery: "online-async" },
    ]);
    expect(
      model.columns
        .flatMap((c) => c.entries)
        .map((e) => e.kind === "class" && e.courseCode),
    ).not.toContain("ENGL393");
  });

  it("draws blocks and overlapping classes in lanes, with course colors", () => {
    const a = aCourse({ code: "CMSC330" });
    const b = aCourse({ code: "ENGL393" });
    const model = buildCalendarModel(
      input([a, b], {
        blocks: [aBlock({ days: ["F"], start: 780, end: 960 })],
        colors: { CMSC330: "teal" },
      }),
    );
    const monday = model.columns.find((c) => c.day === "M");
    expect(
      monday?.entries.map((e) => [
        e.kind === "class" && e.courseCode,
        e.lane,
        e.lanes,
      ]),
    ).toEqual([
      ["CMSC330", 0, 2],
      ["ENGL393", 1, 2],
    ]);
    expect(monday?.entries[0]).toMatchObject({ color: "teal" });
    const friday = model.columns.find((c) => c.day === "F");
    expect(friday?.entries.some((e) => e.kind === "block")).toBe(true);
  });

  it("shows the open course's other sections as ghosts, merging identical times", () => {
    const course = aCourse({
      sections: [
        aSection({ code: "0101" }),
        aSection({
          code: "0201",
          meetings: [aTimedMeeting({ start: 780, end: 830 })],
        }),
        aSection({
          code: "0202",
          meetings: [aTimedMeeting({ start: 780, end: 830 })],
        }),
        aSection({
          code: "0203",
          meetings: [aTimedMeeting({ start: 780, end: 830 })],
        }),
      ],
    });
    const model = buildCalendarModel(input([course], { ghostCourse: course }));
    const ghosts = model.columns.find((c) => c.day === "M")?.ghosts ?? [];
    expect(ghosts.map((g) => g.label)).toEqual(["0201–0203 · 3 sections"]);
    expect(ghosts[0]?.sectionCodes).toEqual(["0201", "0202", "0203"]);
    expect(model.ghost).toMatchObject({
      courseCode: "CMSC351",
      placedCode: "0101",
    });
  });

  it("caps ghosts at 12 in section order, and still draws a previewed one past the cap", () => {
    const course = aCourse({
      sections: Array.from({ length: 16 }, (_, i) =>
        aSection({
          code: code(101 + i),
          meetings: [
            aTimedMeeting({
              days: ["Tu"],
              start: 480 + i * 30,
              end: 505 + i * 30,
            }),
          ],
        }),
      ),
    });
    const notPlaced = {
      ...input([aCourse({ code: "MATH240" })]),
      ghostCourse: course,
    };
    const model = buildCalendarModel(notPlaced);
    const tuesday = model.columns.find((c) => c.day === "Tu")?.ghosts ?? [];
    expect(tuesday).toHaveLength(12);
    expect(tuesday.map((g) => g.sectionCodes[0])).toEqual(
      Array.from({ length: 12 }, (_, i) => code(101 + i)),
    );
    expect(model.ghost?.overflow).toBe(4);

    const previewed = buildCalendarModel({
      ...notPlaced,
      preview: sectionKey("CMSC351", "0116"),
    });
    const drawn = previewed.columns.find((c) => c.day === "Tu")?.ghosts ?? [];
    expect(drawn).toHaveLength(13);
    expect(drawn.find((g) => g.previewed)?.sectionCodes).toEqual(["0116"]);
  });

  it("labels ghosts Full and Overlaps from seats and fit", () => {
    const other = aCourse({
      code: "MATH240",
      sections: [
        aSection({ meetings: [aTimedMeeting({ start: 780, end: 830 })] }),
      ],
    });
    const course = aCourse({
      sections: [
        aSection({ code: "0101" }),
        aSection({
          code: "0201",
          meetings: [aTimedMeeting({ start: 780, end: 830 })],
        }),
        aSection({
          code: "0301",
          meetings: [aTimedMeeting({ start: 900, end: 950 })],
        }),
      ],
    });
    const base = input([course, other]);
    const fit = buildFitContext({
      plan: base.plan,
      index: base.index,
      blocks: [],
      travel: DEFAULT_TRAVEL_SETTINGS,
      campus: EMPTY_CAMPUS,
    });
    const model = buildCalendarModel({
      ...base,
      ghostCourse: course,
      fit,
      seats: { "CMSC351-0301": [0, 30, 4, 0] },
    });
    const ghosts = model.columns.find((c) => c.day === "M")?.ghosts ?? [];
    const by = Object.fromEntries(ghosts.map((g) => [g.sectionCodes[0], g]));
    expect(by["0201"]).toMatchObject({ overlaps: true, full: false });
    expect(by["0301"]).toMatchObject({ overlaps: false, full: true });
  });

  describe("crowded ghosts", () => {
    const notPlaced = (
      course: Course,
      preview: CalendarInput["preview"] = null,
    ) =>
      buildCalendarModel({
        ...input([aCourse({ code: "MATH240" })]),
        ghostCourse: course,
        preview,
      });
    const on = (model: ReturnType<typeof buildCalendarModel>, day: string) =>
      model.columns.find((c) => c.day === day)?.ghosts ?? [];

    // Five sections: different lectures, one shared Tuesday 4pm discussion
    // (CMSC330's shape), so they don't merge as time-identical groups.
    const sharedDiscussion = aCourse({
      sections: Array.from({ length: 5 }, (_, i) =>
        aSection({
          code: code(301 + i),
          meetings: [
            aTimedMeeting({
              days: ["M"],
              start: 480 + i * 60,
              end: 530 + i * 60,
            }),
            aTimedMeeting({
              days: ["Tu"],
              start: 960,
              end: 1010,
              kind: "discussion",
            }),
          ],
        }),
      ),
    });

    it("merges ghosts at the same time that day into one, past three lanes", () => {
      const model = notPlaced(sharedDiscussion);
      expect(model.ghost?.groups).toHaveLength(5);
      const tuesday = on(model, "Tu");
      expect(tuesday).toHaveLength(1);
      expect(tuesday[0]).toMatchObject({
        label: "0301–0305 · 5 sections",
        sectionCodes: ["0301", "0302", "0303", "0304", "0305"],
        sameTimes: false,
        lanes: 1,
        start: 960,
        end: 1010,
      });
      // Monday's lectures don't overlap: five separate ghosts, as before.
      expect(on(model, "M").map((g) => g.label)).toEqual([
        "0301",
        "0302",
        "0303",
        "0304",
        "0305",
      ]);
    });

    it("keeps the merged ghost in place while one of its sections is previewed", () => {
      const model = notPlaced(sharedDiscussion, sectionKey("CMSC351", "0303"));
      const tuesday = on(model, "Tu");
      expect(tuesday).toHaveLength(1);
      expect(tuesday[0]).toMatchObject({
        previewed: true,
        sectionKey: "CMSC351-0303",
      });
    });

    it("merges a staggered crowd into one ghost spanning it", () => {
      const staggered = aCourse({
        sections: Array.from({ length: 5 }, (_, i) =>
          aSection({
            code: code(101 + i),
            meetings: [
              aTimedMeeting({
                days: ["W"],
                start: 600 + i * 10,
                end: 675 + i * 10,
              }),
            ],
          }),
        ),
      });
      const wednesday = on(notPlaced(staggered), "W");
      expect(wednesday).toHaveLength(1);
      expect(wednesday[0]).toMatchObject({
        label: "0101–0105 · 5 sections",
        start: 600,
        end: 715,
        lanes: 1,
      });
    });

    it("leaves three side by side alone", () => {
      const three = aCourse({
        sections: Array.from({ length: 3 }, (_, i) =>
          aSection({
            code: code(101 + i),
            meetings: [
              aTimedMeeting({
                days: ["W"],
                start: 600 + i * 10,
                end: 675 + i * 10,
              }),
            ],
          }),
        ),
      });
      const wednesday = on(notPlaced(three), "W");
      expect(wednesday.map((g) => [g.label, g.lanes, g.sameTimes])).toEqual([
        ["0101", 3, true],
        ["0102", 3, true],
        ["0103", 3, true],
      ]);
    });
  });

  it("puts a travel pill halfway through the gap on its day", () => {
    const connection = aConnection();
    const model = buildCalendarModel(
      input([aCourse()], { connections: [connection] }),
    );
    const monday = model.columns.find((c) => c.day === "M");
    expect(monday?.pills).toEqual([
      { key: connection.id, day: "M", at: 655, connection },
    ]);
    expect(model.columns.find((c) => c.day === "Tu")?.pills).toEqual([]);
  });
});

describe("preview order", () => {
  const course = aCourse({
    sections: ["0101", "0201", "0301"].map((c, i) =>
      aSection({
        code: c,
        meetings: [aTimedMeeting({ start: 480 + i * 120, end: 530 + i * 120 })],
      }),
    ),
  });
  const model = buildCalendarModel(input([course], { ghostCourse: course }));
  const order = previewOrder(model.ghost);

  it("steps through every section in section order, the placed one included", () => {
    expect(order).toEqual(["CMSC351-0101", "CMSC351-0201", "CMSC351-0301"]);
    expect(stepPreview(order, "CMSC351-0101", 1)).toBe("CMSC351-0201");
    expect(stepPreview(order, "CMSC351-0301", 1)).toBe("CMSC351-0101");
    expect(stepPreview(order, "CMSC351-0101", -1)).toBe("CMSC351-0301");
    expect(stepPreview([], null, 1)).toBeNull();
  });
});

describe("dragging a block", () => {
  it("snaps to 15 minutes inside the grid", () => {
    const bounds = { start: 480, end: 1020 };
    expect(snapMinute(727, bounds)).toBe(720);
    expect(snapMinute(733, bounds)).toBe(735);
    expect(snapMinute(400, bounds)).toBe(480);
    expect(snapMinute(1100, bounds)).toBe(1020);
  });

  it("covers every day between the start and end columns", () => {
    const days = ["M", "Tu", "W", "Th", "F"] as const;
    expect(daysBetween(days, 3, 1)).toEqual(["Tu", "W", "Th"]);
    expect(daysBetween(days, 2, 2)).toEqual(["W"]);
  });
});

describe("performance", () => {
  it("lays out the demo plan with 12 ghosts well inside a frame", () => {
    const courses = mockCourses();
    const index = buildCatalogIndex(fixtureTermId, courses);
    // The course with the most distinct meeting times, for the most ghosts.
    const ghostCourse =
      [...courses].sort((a, b) => b.sections.length - a.sections.length)[0] ??
      mockCourse("CMSC351");
    const fit = buildFitContext({
      plan: demoPlan,
      index,
      blocks: demoBlocks,
      travel: DEFAULT_TRAVEL_SETTINGS,
      campus: EMPTY_CAMPUS,
    });
    const run = (preview: string | null) =>
      buildCalendarModel({
        plan: demoPlan,
        index,
        blocks: demoBlocks,
        colors: {},
        connections: [],
        ghostCourse,
        fit,
        seats: mockSeats.seats,
        preview,
      });
    const keys = ghostCourse.sections.map((s) =>
      sectionKey(ghostCourse.code, s.code),
    );
    run(null); // warm core's per-section caches, as the first render does
    const rounds = 200;
    const started = performance.now();
    for (let i = 0; i < rounds; i++) run(keys[i % keys.length] ?? null);
    const perRun = (performance.now() - started) / rounds;
    // A frame is 16 ms; layout gets a small slice of it.
    expect(perRun).toBeLessThan(4);
    expect(run(null).ghost?.groups.length).toBeGreaterThan(0);
  });
});
