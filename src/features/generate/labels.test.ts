import { describe, expect, it } from "vitest";
import type { PlanStats, WildcardReport } from "~/core/schema";
import { aGenerateRequest } from "~/fixtures";
import {
  coursesSummary,
  differenceLabel,
  filledTip,
  freeDaysLabel,
  seatsLabel,
  seatsShortLabel,
  spanLabel,
  unfitWildcardNote,
  wildcardNote,
} from "./labels";

const stats = (patch: Partial<PlanStats> = {}): PlanStats => ({
  credits: 14,
  daysOnCampus: 5,
  firstClass: 570,
  lastClass: 915,
  avgRating: null,
  avgGpa: null,
  fewestOpenSeats: null,
  ...patch,
});

describe("result labels", () => {
  it("says which seats are tightest plainly", () => {
    expect(seatsLabel(stats({ fewestOpenSeats: 0 }))).toBe(
      "Fewest seats: full",
    );
    expect(seatsLabel(stats({ fewestOpenSeats: 3 }))).toBe(
      "Fewest seats: 3 open",
    );
    expect(seatsLabel(stats())).toBeNull();
    expect(seatsShortLabel(stats({ fewestOpenSeats: 0 }))).toBe("Seats: full");
    expect(seatsShortLabel(stats({ fewestOpenSeats: 3 }))).toBe(
      "Seats: 3 open",
    );
    expect(seatsShortLabel(stats())).toBeNull();
  });

  it("names free days, else the days on campus, and the span", () => {
    expect(freeDaysLabel(["Tu", "F"], stats())).toBe("Tue, Fri off");
    expect(freeDaysLabel([], stats())).toBe("5 days");
    expect(spanLabel(stats())).toBe("9:30am–3:15pm");
  });

  it("spells out hybrid sections", () => {
    const d = { courseCode: "ENGL101", sectionCode: "9009", start: 750 };
    expect(differenceLabel({ ...d, days: "TuTh", onlineDays: "" })).toBe(
      "ENGL101 9009 TuTh 12:30pm",
    );
    expect(differenceLabel({ ...d, days: "Tu", onlineDays: "Th" })).toBe(
      "ENGL101 9009 Tu 12:30pm, Th online",
    );
    expect(differenceLabel({ ...d, days: "", onlineDays: "TuTh" })).toBe(
      "ENGL101 9009 TuTh 12:30pm online",
    );
    expect(
      differenceLabel({ ...d, days: "", onlineDays: "", start: null }),
    ).toBe("ENGL101 9009 online");
  });
});

describe("coursesSummary", () => {
  it("says what was asked for in one line", () => {
    expect(coursesSummary(aGenerateRequest().items)).toBe("2 courses + 1 of 2");
    expect(
      coursesSummary([
        { kind: "course", courseCode: "CMSC351", required: true },
        { kind: "course", courseCode: "CMSC330", required: false },
      ]),
    ).toBe("2 courses (1 optional)");
  });

  it("names wildcards by their labels", () => {
    expect(
      coursesSummary([
        { kind: "course", courseCode: "CMSC351", required: true },
        {
          kind: "wildcard",
          wildcard: { kind: "pattern", pattern: "CMSC4XX" },
          required: true,
          count: 2,
        },
        {
          kind: "wildcard",
          wildcard: { kind: "gen-ed", code: "DSHS" },
          required: false,
          count: 1,
        },
      ]),
    ).toBe("1 course + Any CMSC 400-level ×2 + Any DSHS course (optional)");
  });
});

describe("wildcard notes", () => {
  const report = (patch: Partial<WildcardReport> = {}): WildcardReport => ({
    wildcard: "CMSC4XX",
    matched: 37,
    fit: 30,
    tried: 30,
    ...patch,
  });

  it("stays quiet when every fitting course was tried", () => {
    expect(wildcardNote(report(), "Spring 2027")).toBeNull();
  });

  it("says plainly when nothing matches or fits", () => {
    expect(
      wildcardNote(
        report({ wildcard: "ARTTXXX", matched: 0, fit: 0, tried: 0 }),
        "Spring 2027",
      ),
    ).toBe("Spring 2027 has no ARTT courses.");
    expect(wildcardNote(report({ fit: 0, tried: 0 }), "Spring 2027")).toBe(
      "None of the 37 CMSC 400-level courses fits your filters and required courses.",
    );
    expect(
      wildcardNote(report({ matched: 1, fit: 0, tried: 0 }), "Spring 2027"),
    ).toBe(
      "The one CMSC 400-level course doesn't fit your filters and required courses.",
    );
    expect(unfitWildcardNote(report({ wildcard: "gen-ed:DSHS" }))).toBe(
      "No DSHS course fits with the rest of your courses.",
    );
  });

  it("owns up to the cap", () => {
    expect(
      wildcardNote(
        report({ wildcard: "gen-ed:DSHS", matched: 420, fit: 408, tried: 40 }),
        "Spring 2027",
      ),
    ).toBe(
      "Tried the 40 most promising of 408 DSHS courses. Add filters to narrow them down.",
    );
  });

  it("names the wildcard each course filled", () => {
    expect(
      filledTip([
        { wildcard: "CMSC4XX", courseCode: "CMSC420" },
        { wildcard: "gen-ed:DSHS", courseCode: "ANTH210" },
      ]),
    ).toBe("CMSC420 for Any CMSC 400-level, ANTH210 for Any DSHS course");
  });
});
