import { describe, expect, it } from "vitest";
import type { FitLabel } from "~/core/schema";
import {
  anUntimedMeeting,
  aSection,
  aTbaMeeting,
  aTimedMeeting,
} from "~/fixtures";
import {
  compactMeetingWords,
  deliveryWords,
  fitTone,
  fitWords,
  genEdGroupWords,
  meetingWords,
  sectionMeetingWords,
  shortFitWords,
  shortSeatWords,
} from "./words";

const LABELS: readonly [FitLabel, string, string, string][] = [
  [{ kind: "fits" }, "Fits", "Fits", "ok"],
  [{ kind: "in-plan" }, "In your plan", "In plan", "plain"],
  [{ kind: "no-set-times" }, "No set times", "No times", "muted"],
  [
    { kind: "overlaps", with: { kind: "course", courseCode: "ENGL393" } },
    "Overlaps ENGL393",
    "Overlaps",
    "warn",
  ],
  [
    {
      kind: "overlaps",
      with: { kind: "block", blockId: "work", label: "Work" },
    },
    "Overlaps Work",
    "Overlaps",
    "warn",
  ],
  [
    {
      kind: "not-enough-time",
      direction: "after",
      courseCode: "CMSC330",
    },
    "Not enough time after CMSC330",
    "Too close",
    "warn",
  ],
];

describe("fit labels", () => {
  it.each(LABELS)("%o reads %s", (label, full, short, tone) => {
    expect(fitWords(label)).toBe(full);
    expect(shortFitWords(label)).toBe(short);
    expect(fitTone(label)).toBe(tone);
  });
});

describe("shortSeatWords", () => {
  it("says full, how many are left, or how many are open", () => {
    expect(
      shortSeatWords({ open: 0, total: 30, waitlist: 9, holdfile: null }),
    ).toBe("Full");
    expect(
      shortSeatWords({ open: 2, total: 30, waitlist: 0, holdfile: null }),
    ).toBe("2 left");
    expect(
      shortSeatWords({ open: 12, total: 36, waitlist: 0, holdfile: null }),
    ).toBe("12 open");
    expect(shortSeatWords(null)).toBe("Unknown");
  });
});

describe("meeting words", () => {
  it("reads days, times, room and kind", () => {
    expect(meetingWords(aTimedMeeting())).toBe("MWF 10am–10:50am IRB 0324");
    expect(
      meetingWords(
        aTimedMeeting({
          days: ["Tu"],
          start: 840,
          end: 890,
          kind: "discussion",
          building: "ESJ",
          room: "2101",
        }),
      ),
    ).toBe("Tu 2pm–2:50pm ESJ 2101 discussion");
  });

  it("says when there are no set times", () => {
    expect(meetingWords(anUntimedMeeting())).toBe("Online, no set times");
    expect(meetingWords(aTbaMeeting())).toBe("Times TBA ESJ 2101 (discussion)");
  });

  it("joins every meeting, and asks the department when there are none", () => {
    const section = aSection({
      meetings: [
        aTimedMeeting(),
        aTimedMeeting({ days: ["Th"], kind: "lab", start: 780, end: 890 }),
      ],
    });
    expect(sectionMeetingWords(section)).toBe(
      "MWF 10am–10:50am IRB 0324 · Th 1pm–2:50pm IRB 0324 lab",
    );
    expect(sectionMeetingWords(aSection({ meetings: [] }))).toBe(
      "Contact the department for times",
    );
  });

  it("shortens to the first meeting for compact rows", () => {
    expect(compactMeetingWords(aSection())).toBe("MWF 10am");
    expect(
      compactMeetingWords(
        aSection({
          meetings: [aTimedMeeting(), aTimedMeeting({ days: ["Th"] })],
        }),
      ),
    ).toBe("MWF 10am +1");
    expect(
      compactMeetingWords(
        aSection({ delivery: "online-async", meetings: [anUntimedMeeting()] }),
      ),
    ).toBe("Online");
  });
});

describe("deliveryWords", () => {
  it("chips everything but in-person", () => {
    expect(deliveryWords("f2f")).toBeNull();
    expect(deliveryWords("blended")).toBe("Blended");
    expect(deliveryWords("online-sync")).toBe("Online");
    expect(deliveryWords("online-async")).toBe("Online, async");
  });
});

describe("genEdGroupWords", () => {
  it("spells out conditions", () => {
    expect(
      genEdGroupWords([
        { code: "DSNL", condition: "if taken with GEOL110" },
        { code: "DSNS" },
      ]),
    ).toBe("DSNL (if taken with GEOL110) or DSNS");
  });
});
