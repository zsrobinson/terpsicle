import { describe, expect, it } from "vitest";
import { aCourse, anUntimedMeeting, aSection, aTimedMeeting } from "~/fixtures";
import { campusMoment } from "../time/format";
import { meetsOnAny } from "../time/week";
import { planOfSections } from "./schedule";

// What fits_with, days_off, share links and seatCounts are built from
// (docs/MCP.md).

describe("planOfSections", () => {
  it("holds one placed section per course, with its snapshot", () => {
    const course = aCourse();
    const section = aSection({ code: "0201" });
    const plan = planOfSections(
      "202701",
      [{ course, section }],
      "2026-11-05T00:00:00.000Z",
      "Spring plan",
    );
    expect(plan).toMatchObject({ termId: "202701", name: "Spring plan" });
    expect(plan.courses).toEqual([
      expect.objectContaining({ courseCode: "CMSC351", sectionCode: "0201" }),
    ]);
    expect(plan.courses[0]?.snapshot?.meetings).toEqual(section.meetings);
  });
});

describe("meetsOnAny", () => {
  it("looks at timed meetings only", () => {
    const mwf = aSection();
    const tuth = aSection({
      meetings: [aTimedMeeting({ days: ["Tu", "Th"] })],
    });
    const online = aSection({ meetings: [anUntimedMeeting()] });
    expect(meetsOnAny("CMSC351", mwf, ["F"])).toBe(true);
    expect(meetsOnAny("CMSC351", tuth, ["M", "W", "F"])).toBe(false);
    expect(meetsOnAny("CMSC351", online, ["M"])).toBe(false);
    expect(meetsOnAny("CMSC351", mwf, [])).toBe(false);
  });
});

describe("campusMoment", () => {
  it("says an instant on College Park's clock", () => {
    expect(campusMoment("2026-11-05T21:30:00.000Z")).toBe(
      "Thu Nov 5, 4:30pm ET",
    );
    expect(campusMoment("2026-07-01T16:00:00.000Z")).toBe("Wed Jul 1, 12pm ET");
  });
});
