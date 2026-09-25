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
  compactTimeRange,
  deliveryWords,
  fitTone,
  fitWords,
  genEdGroupWords,
  meetingWords,
  permissionWords,
  restMeetingWords,
  sectionMeetingWords,
  shortFitWords,
  shortSeatWords,
} from "./words";

const LABELS: readonly [FitLabel, string, string, string][] = [
  [{ kind: "fits" }, "Fits", "Fits", "ok"],
  [{ kind: "in-plan" }, "In your plan", "Current", "plain"],
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
    "Too tight",
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
    expect(meetingWords(aTimedMeeting())).toBe("MWF 10–10:50am IRB 0324");
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
    ).toBe("Tu 2–2:50pm ESJ 2101 discussion");
  });

  it("leaves out the kind or the place when asked", () => {
    const lab = aTimedMeeting({
      days: ["Th"],
      kind: "lab",
      start: 780,
      end: 890,
    });
    expect(meetingWords(lab, { kind: false })).toBe("Th 1–2:50pm IRB 0324");
    expect(meetingWords(lab, { kind: false, place: false })).toBe(
      "Th 1–2:50pm",
    );
  });

  it("keeps both halves of a range that crosses noon", () => {
    expect(compactTimeRange(690, 740)).toBe("11:30am–12:20pm");
    expect(compactTimeRange(540, 590)).toBe("9–9:50am");
    expect(compactTimeRange(720, 770)).toBe("12–12:50pm");
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
      "MWF 10–10:50am IRB 0324 · Th 1–2:50pm IRB 0324 lab",
    );
    expect(sectionMeetingWords(aSection({ meetings: [] }))).toBe(
      "Contact the department for times",
    );
  });

  it("says every meeting's days and times in one-line rows, never +1", () => {
    expect(compactMeetingWords(aSection().meetings)).toBe("MWF 10–10:50am");
    expect(
      compactMeetingWords([
        aTimedMeeting(),
        aTimedMeeting({ days: ["Th"], kind: "discussion" }),
      ]),
    ).toBe("MWF 10–10:50am · Th 10–10:50am");
    expect(compactMeetingWords([anUntimedMeeting()])).toBe("Online");
    expect(compactMeetingWords([aTbaMeeting()])).toBe("Times TBA");
  });

  it("words a row's own meetings under a shared line", () => {
    const discussion = aTimedMeeting({
      days: ["F"],
      start: 540,
      end: 590,
      kind: "discussion",
      building: "CSI",
      room: "1122",
    });
    expect(
      restMeetingWords([discussion], { underShared: true, compact: false }),
    ).toBe("F 9–9:50am CSI 1122");
    expect(
      restMeetingWords([discussion], { underShared: false, compact: false }),
    ).toBe("F 9–9:50am CSI 1122 discussion");
    expect(
      restMeetingWords([discussion], { underShared: true, compact: true }),
    ).toBe("F 9–9:50am");
    expect(restMeetingWords([], { underShared: true, compact: false })).toBe(
      "No other meetings",
    );
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

describe("permissionWords", () => {
  it("puts Testudo's Perm Req in plain words", () => {
    expect(permissionWords("Perm Req")).toBe("Required from the department");
    // A flag Testudo adds later shows as written.
    expect(permissionWords("Dept Consent")).toBe("Dept Consent");
  });
});
