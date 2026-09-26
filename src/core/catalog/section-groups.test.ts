import { describe, expect, it } from "vitest";
import {
  aCourse,
  anUntimedMeeting,
  aSection,
  aTimedMeeting,
  mockCourse,
} from "~/fixtures";
import type { Section } from "../schema";
import {
  collapsedGroupKey,
  factorMeetings,
  groupSections,
  groupSectionsByInstructor,
  lectureKey,
  MANY_SECTIONS,
  sectionCountSize,
  sectionGrouping,
  sharedLectures,
  sharedMeetings,
} from "./section-groups";

const lecture = aTimedMeeting({ days: ["Tu", "Th"], start: 570, end: 645 });
const discussion = (start: number, room = "1122") =>
  aTimedMeeting({
    days: ["F"],
    start,
    end: start + 50,
    kind: "discussion",
    building: "CSI",
    room,
  });

const codes = (runs: ReturnType<typeof factorMeetings>) =>
  runs.map((r) => r.sections.map((s) => s.section.code));

describe("sectionCountSize", () => {
  it("is one, a few, or many", () => {
    expect(sectionCountSize(0)).toBe("one");
    expect(sectionCountSize(1)).toBe("one");
    expect(sectionCountSize(2)).toBe("few");
    expect(sectionCountSize(MANY_SECTIONS)).toBe("few");
    expect(sectionCountSize(MANY_SECTIONS + 1)).toBe("many");
  });
});

describe("factorMeetings", () => {
  it("leaves one section whole: there's nothing to share", () => {
    const only = aSection({ meetings: [lecture, discussion(540)] });
    expect(factorMeetings([only])).toEqual([
      { shared: [], sections: [{ section: only, rest: only.meetings }] },
    ]);
    expect(factorMeetings([])).toEqual([]);
  });

  it("says a shared lecture once, and keeps each discussion", () => {
    const a = aSection({ code: "0101", meetings: [lecture, discussion(540)] });
    const b = aSection({ code: "0102", meetings: [lecture, discussion(600)] });
    const [run, ...more] = factorMeetings([a, b]);
    expect(more).toEqual([]);
    expect(run?.shared).toEqual([lecture]);
    expect(run?.sections.map((s) => s.rest)).toEqual([
      [discussion(540)],
      [discussion(600)],
    ]);
  });

  it("splits into lecture runs, in section order, when nothing is shared by all", () => {
    const late = aTimedMeeting({ days: ["Tu", "Th"], start: 930, end: 1005 });
    const sections = [
      aSection({ code: "0201", meetings: [lecture, discussion(600)] }),
      aSection({ code: "0202", meetings: [lecture, discussion(660)] }),
      aSection({ code: "0302", meetings: [late, discussion(600)] }),
      aSection({ code: "0303", meetings: [late, discussion(660)] }),
      // The first lecture again: a new run, never moved up.
      aSection({ code: "0401", meetings: [lecture, discussion(720)] }),
    ];
    const runs = factorMeetings(sections);
    expect(codes(runs)).toEqual([["0201", "0202"], ["0302", "0303"], ["0401"]]);
    expect(runs.map((r) => r.shared)).toEqual([[lecture], [late], []]);
    expect(runs[2]?.sections[0]?.rest).toEqual([lecture, discussion(720)]);
  });

  it("leaves nothing in a row that only has the shared meetings", () => {
    const a = aSection({ code: "0101", meetings: [lecture] });
    const b = aSection({ code: "0102", meetings: [lecture, discussion(540)] });
    const [run] = factorMeetings([a, b]);
    expect(run?.sections.map((s) => s.rest)).toEqual([[], [discussion(540)]]);
  });

  it("shares untimed meetings too, but not a different room", () => {
    const online = anUntimedMeeting();
    const a = aSection({ code: "0101", meetings: [online, discussion(540)] });
    const b = aSection({
      code: "0102",
      meetings: [online, discussion(540, "2118")],
    });
    const [run] = factorMeetings([a, b]);
    expect(run?.shared).toEqual([online]);
    expect(run?.sections.map((s) => s.rest.length)).toEqual([1, 1]);
  });

  it("factors CMSC330 per instructor: one lecture, then two", () => {
    const groups = groupSectionsByInstructor(mockCourse("CMSC330"));
    const [kowalczyk, zielinski] = groups.map((g) =>
      factorMeetings(g.sections),
    );
    expect(kowalczyk).toHaveLength(1);
    expect(kowalczyk?.[0]?.shared).toHaveLength(1);
    expect(kowalczyk?.[0]?.sections.every((s) => s.rest.length === 1)).toBe(
      true,
    );
    expect(codes(zielinski ?? [])).toEqual([
      ["0201", "0202", "0203", "0204"],
      ["0302", "0303", "0304", "0305", "0307"],
    ]);
  });

  it("finds nothing to share in CMSC351's separate lectures", () => {
    const [jada] = groupSectionsByInstructor(mockCourse("CMSC351"));
    const runs = factorMeetings(jada?.sections ?? []);
    expect(runs.every((r) => r.shared.length === 0)).toBe(true);
    expect(
      runs.flatMap((r) => r.sections).every((s) => s.rest.length > 0),
    ).toBe(true);
  });

  it("stays linear on a many-section course", () => {
    const many = mockCourse("ENGL101");
    expect(many.sections.length).toBeGreaterThan(MANY_SECTIONS);
    const runs = factorMeetings(many.sections);
    expect(runs.flatMap((r) => r.sections.map((s) => s.section))).toEqual(
      many.sections,
    );
  });
});

describe("sharedMeetings and lectureKey", () => {
  it("ignores discussions and labs in the lecture key", () => {
    const a = aSection({ meetings: [lecture, discussion(540)] });
    const b = aSection({ meetings: [lecture, discussion(600)] });
    expect(lectureKey(a)).toBe(lectureKey(b));
    expect(lectureKey(a)).not.toBe(
      lectureKey(aSection({ meetings: [discussion(540)] })),
    );
  });

  it("needs two sections to share anything", () => {
    expect(sharedMeetings([aSection()])).toEqual([]);
  });
});

describe("sharedLectures", () => {
  it("finds 2+ sections with the same timed lecture, in section order", () => {
    const other = aTimedMeeting();
    const course = aCourse({
      sections: [
        aSection({ code: "0101", meetings: [lecture, discussion(540)] }),
        aSection({ code: "0201", meetings: [other, discussion(540)] }),
        aSection({ code: "0102", meetings: [lecture, discussion(600)] }),
        aSection({ code: "0301", meetings: [other] }),
        // A lecture of its own isn't shared.
        aSection({
          code: "0401",
          meetings: [aTimedMeeting({ start: 900, end: 950 })],
        }),
      ],
    });
    expect(sharedLectures(course).map((l) => l.map((s) => s.code))).toEqual([
      ["0101", "0102"],
      ["0201", "0301"],
    ]);
  });

  it("never counts async or discussion-only sections as sharing a lecture", () => {
    const course = aCourse({
      sections: [
        aSection({ code: "0101", meetings: [anUntimedMeeting()] }),
        aSection({ code: "0102", meetings: [anUntimedMeeting()] }),
        aSection({ code: "0201", meetings: [discussion(540)] }),
        aSection({ code: "0202", meetings: [discussion(600)] }),
      ],
    });
    expect(sharedLectures(course)).toEqual([]);
  });
});

describe("sectionGrouping and groupSections", () => {
  /** TBA sections: `lectures` lectures with `per` sections each, then `alone` sections with a lecture each. */
  function tbaCourse(lectures: number, per: number, alone = 0) {
    const sections: Section[] = [];
    for (let l = 0; l < lectures; l++)
      for (let i = 0; i < per; i++)
        sections.push(
          aSection({
            code: `0${l + 1}${String(i + 1).padStart(2, "0")}`,
            instructors: [],
            meetings: [
              aTimedMeeting({
                days: ["M", "W"],
                start: 480 + 90 * l,
                end: 530 + 90 * l,
              }),
              discussion(480 + 60 * i),
            ],
          }),
        );
    for (let i = 0; i < alone; i++)
      sections.push(
        aSection({
          code: `09${String(i + 1).padStart(2, "0")}`,
          instructors: [],
          meetings: [
            aTimedMeeting({
              days: ["F"],
              start: 480 + 60 * i,
              end: 530 + 60 * i,
            }),
          ],
        }),
      );
    return aCourse({ code: "CHEM231", sections });
  }
  const byCode = (a: Section, b: Section) => (a.code < b.code ? -1 : 1);

  it("groups by instructor at a few sections, and at many with 2+ instructors", () => {
    expect(sectionGrouping(mockCourse("CMSC330"))).toBe("instructor");
    expect(sectionGrouping(tbaCourse(4, 5))).toBe("instructor");
    const many = tbaCourse(4, 6);
    expect(sectionGrouping(many)).toBe("lecture");
    const named = aCourse({
      ...many,
      sections: many.sections.map((s, i) => ({
        ...s,
        instructors: [i % 2 ? "Lee Moss" : "Ada Brandt"],
      })),
    });
    expect(sectionGrouping(named)).toBe("instructor");
  });

  it("groups many sections that share no lecture, or just one, by time (ENGL101)", () => {
    expect(sectionGrouping(mockCourse("ENGL101"))).toBe("time");
    expect(sectionGrouping(tbaCourse(0, 0, 21))).toBe("time");
    expect(sectionGrouping(tbaCourse(1, 6, 20))).toBe("time");
  });

  it("groups many sections that share 2+ lectures by lecture (CHEM231)", () => {
    const course = mockCourse("CHEM231");
    expect(course.sections.length).toBeGreaterThan(MANY_SECTIONS);
    expect(sectionGrouping(course)).toBe("lecture");
    const groups = groupSections(course);
    expect(groups.map((g) => [g.by, g.key, g.sections.length])).toEqual([
      ["lecture", "CHEM231|lecture|5116", 6],
      ["lecture", "CHEM231|lecture|5322", 6],
      ["lecture", "CHEM231|lecture|5421", 6],
      ["lecture", "CHEM231|lecture|5511", 6],
      // The SIE section shares no lecture, so it's timed on its own.
      ["time", "CHEM231|time|M@1080-1250,W@1080-1130", 1],
    ]);
    const [first] = groups;
    expect(first?.by === "lecture" ? first.lecture : null).toEqual([
      aTimedMeeting({
        days: ["Tu", "Th"],
        start: 840,
        end: 915,
        building: "CHM",
        room: "1407",
      }),
    ]);
    expect(first?.sections.map((s) => s.code)).toEqual([
      "5116",
      "5117",
      "5118",
      "5136",
      "5137",
      "5138",
    ]);
  });

  it("lists every section once: groups by first section, no set times last", () => {
    const base = tbaCourse(3, 6, 2);
    const course = aCourse({
      ...base,
      sections: [
        aSection({ code: "0001", instructors: [], meetings: [] }),
        ...base.sections,
        // 0901's time in another room: its own lecture, but the same time group.
        aSection({
          code: "0999",
          instructors: [],
          meetings: [
            aTimedMeeting({
              days: ["F"],
              start: 480,
              end: 530,
              building: "KEY",
              room: "0103",
            }),
          ],
        }),
      ],
    });
    const groups = groupSections(course);
    expect(groups.map((g) => g.key)).toEqual([
      "CHEM231|lecture|0101",
      "CHEM231|lecture|0201",
      "CHEM231|lecture|0301",
      "CHEM231|time|F@480-530",
      "CHEM231|time|F@540-590",
      "CHEM231|time|none",
    ]);
    expect(groups[3]?.sections.map((s) => s.code)).toEqual(["0901", "0999"]);
    expect(groups.flatMap((g) => g.sections).sort(byCode)).toEqual(
      [...course.sections].sort(byCode),
    );
  });

  it("keeps course details' instructor and time keys", () => {
    const course = mockCourse("CMSC330");
    expect(groupSections(course).map((g) => g.key)).toEqual(
      groupSectionsByInstructor(course).map((g) =>
        collapsedGroupKey(course.code, g),
      ),
    );
    const engl = groupSections(mockCourse("ENGL101"));
    expect(engl.every((g) => g.by === "time")).toBe(true);
    expect(engl[0]?.key).toBe("ENGL101|time|MWF@480-530");
  });
});
