import { describe, expect, it } from "vitest";
import { anUntimedMeeting, aSection, aTimedMeeting } from "~/fixtures";
import {
  instructorsLabel,
  meetingDaysLabel,
  sectionLine,
} from "./section-words";

describe("section words", () => {
  it("joins distinct day sets in meeting order", () => {
    const section = aSection({
      meetings: [
        aTimedMeeting({ days: ["Tu", "Th"] }),
        aTimedMeeting({ days: ["W"], kind: "discussion" }),
        aTimedMeeting({ days: ["Th", "Tu"], start: 900, end: 950 }),
      ],
    });
    expect(meetingDaysLabel(section)).toBe("TuTh + W");
  });

  it("says Online for async sections and No set times for TBA", () => {
    expect(
      meetingDaysLabel(
        aSection({ delivery: "online-async", meetings: [anUntimedMeeting()] }),
      ),
    ).toBe("Online");
    expect(meetingDaysLabel(aSection({ meetings: [] }))).toBe("No set times");
  });

  it("names instructors, or says TBA", () => {
    expect(instructorsLabel(aSection({ instructors: [] }))).toBe(
      "Instructor TBA",
    );
    expect(
      sectionLine(
        aSection({
          instructors: ["Ada Brandt", "Bo Chen"],
          meetings: [aTimedMeeting({ days: ["M", "W", "F"] })],
        }),
      ),
    ).toBe("Ada Brandt, Bo Chen · MWF");
  });
});
