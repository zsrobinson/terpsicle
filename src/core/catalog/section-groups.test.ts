import { describe, expect, it } from "vitest";
import {
  anUntimedMeeting,
  aSection,
  aTimedMeeting,
  mockCourse,
} from "~/fixtures";
import {
  factorMeetings,
  groupSectionsByInstructor,
  lectureKey,
  MANY_SECTIONS,
  sectionCountSize,
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
