import { describe, expect, it } from "vitest";
import type { FitLabel } from "~/core/schema";
import {
  anUntimedMeeting,
  aSection,
  aTbaMeeting,
  aTimedMeeting,
} from "~/fixtures";
import {
  compactTimeRange,
  deliveryWords,
  fitTone,
  fitWords,
  genEdGroupWords,
  meetingKindWords,
  meetingWords,
  permissionWords,
  sectionMeetingWords,
} from "./words";

const LABELS: readonly [FitLabel, string, string][] = [
  [{ kind: "fits" }, "Fits", "ok"],
  [{ kind: "in-plan" }, "In your plan", "plain"],
  [{ kind: "no-set-times" }, "No set times", "muted"],
  [
    { kind: "overlaps", with: { kind: "course", courseCode: "ENGL393" } },
    "Overlaps ENGL393",
    "warn",
  ],
  [
    {
      kind: "overlaps",
      with: { kind: "block", blockId: "work", label: "Work" },
    },
    "Overlaps Work",
    "warn",
  ],
  [
    {
      kind: "not-enough-time",
      direction: "after",
      courseCode: "CMSC330",
    },
    "Not enough time after CMSC330",
    "warn",
  ],
];

describe("fit labels", () => {
  it.each(LABELS)("%o reads %s", (label, full, tone) => {
    expect(fitWords(label)).toBe(full);
    expect(fitTone(label)).toBe(tone);
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

  it("labels each meeting's kind compactly", () => {
    expect(
      (["lecture", "discussion", "lab", "other"] as const).map(
        (k) => meetingKindWords(k).short,
      ),
    ).toEqual(["Lec", "Dis", "Lab", "Mtg"]);
    expect(meetingKindWords("discussion").long).toBe("Discussion");
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
