import { describe, expect, it } from "vitest";
import { aCourse, anUntimedMeeting, aSection, aTimedMeeting } from "~/fixtures";
import { DEFAULT_TRAVEL_SETTINGS } from "../schema";
import { EMPTY_CAMPUS } from "../travel";
import { checkSchedule, messageText, scheduleWeek } from "./schedule";

// umd_check_schedule's core (docs/MCP.md): the scheduler's Problems for a
// set of sections, with the week in words.

describe("schedule", () => {
  const algorithms = aCourse({
    sections: [
      aSection({ code: "0101" }),
      aSection({
        code: "0201",
        meetings: [aTimedMeeting({ start: 840, end: 890 })],
      }),
    ],
  });
  const compilers = aCourse({
    code: "CMSC430",
    title: "Compilers",
    credits: { min: 3, max: 4 },
    sections: [
      aSection({
        code: "0101",
        meetings: [
          aTimedMeeting({ days: ["M", "W"], start: 630, end: 690 }),
          aTimedMeeting({
            days: ["F"],
            start: 540,
            end: 590,
            kind: "discussion",
            building: "CSI",
            room: "1115",
          }),
        ],
      }),
    ],
  });
  const online = aCourse({
    code: "ENGL101",
    title: "Academic Writing",
    sections: [aSection({ code: "0101", meetings: [anUntimedMeeting()] })],
  });

  it("lays out the week and finds the overlap, with the switch that fixes it", () => {
    const check = checkSchedule({
      termId: "202701",
      courses: [algorithms, compilers, online],
      sections: ["CMSC351-0101", "CMSC430-0101", "ENGL101-0101"],
      seats: null,
      campus: EMPTY_CAMPUS,
      travel: DEFAULT_TRAVEL_SETTINGS,
      now: "2026-11-05T00:00:00.000Z",
    });
    expect(check.credits).toEqual({ min: 9, max: 10 });
    expect(check.week.M).toEqual([
      "10am–10:50am CMSC351 0101 · IRB 0324",
      "10:30am–11:30am CMSC430 0101 · IRB 0324",
    ]);
    expect(check.week.F?.[0]).toBe(
      "9am–9:50am CMSC430 0101 (discussion) · CSI 1115",
    );
    expect(check.week.Tu).toBeUndefined();
    expect(check.untimed).toEqual(["ENGL101 0101"]);
    const overlap = check.problems.find((p) => p.kind === "overlap");
    expect(overlap?.severity).toBe("warning");
    expect(overlap?.title).toContain("CMSC351");
    expect(overlap?.fix).toBe("Switch CMSC351 to 0201 (CMSC351-0201)");
    expect(check.problems.some((p) => p.kind === "no-set-times")).toBe(true);
  });

  it("leaves out keys the courses don't have", () => {
    const week = scheduleWeek([]);
    expect(week).toEqual({
      credits: { min: 0, max: 0 },
      week: {},
      untimed: [],
    });
    const check = checkSchedule({
      termId: "202701",
      courses: [algorithms],
      sections: ["CMSC351-0999"],
      seats: null,
      campus: EMPTY_CAMPUS,
      travel: DEFAULT_TRAVEL_SETTINGS,
      now: "2026-11-05T00:00:00.000Z",
    });
    expect(check.problems).toEqual([]);
  });

  it("writes every kind of message part as text", () => {
    expect(
      messageText([
        { kind: "text", text: "From " },
        { kind: "course", courseCode: "CMSC351" },
        { kind: "text", text: " " },
        { kind: "section", sectionKey: "CMSC351-0101" },
        { kind: "text", text: " on " },
        { kind: "day", day: "Th" },
        { kind: "text", text: " at " },
        { kind: "time", minutes: 570 },
        { kind: "text", text: ", " },
        { kind: "duration", minutes: 75 },
        { kind: "text", text: ", " },
        { kind: "block", blockId: "block-0001", label: "Work" },
      ]),
    ).toBe(
      "From CMSC351 CMSC351 0101 on Thursday at 9:30am, 1 hr 15 min, Work",
    );
  });
});
