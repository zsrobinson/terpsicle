import { describe, expect, it } from "vitest";
import { DEFAULT_MUST_HAVES, type PlanStats } from "~/core/schema";
import { aBlock, aGenerateRequest } from "~/fixtures";
import {
  differenceLabel,
  freeDaysLabel,
  requestSummary,
  seatsLabel,
  spanLabel,
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

describe("requestSummary", () => {
  it("says what was asked in one line, leaving defaults unsaid", () => {
    expect(requestSummary(aGenerateRequest())).toBe(
      "2 courses + 1 of 2 · compact days",
    );
    expect(
      requestSummary(
        aGenerateRequest({
          items: [
            { kind: "course", courseCode: "CMSC351", required: true },
            { kind: "course", courseCode: "CMSC330", required: false },
          ],
          mustHaves: {
            ...DEFAULT_MUST_HAVES,
            daysOff: ["F", "M"],
            earliestStart: 600,
            latestEnd: 900,
            credits: { min: 12, max: 16 },
            openSeatsOnly: true,
            enoughTravelTime: false,
            respectBlocks: false,
          },
          blocks: [aBlock()],
          rankBy: { preset: "fewer-days" },
        }),
      ),
    ).toBe(
      "2 courses (1 optional) · Mon, Fri off · from 10am · done by 3pm · 12–16 credits · open seats only · any walking time · ignoring blocks · fewer days on campus",
    );
  });

  it("says a one-sided credit range plainly", () => {
    const withCredits = (min: number | null, max: number | null) =>
      requestSummary(
        aGenerateRequest({
          mustHaves: { ...DEFAULT_MUST_HAVES, credits: { min, max } },
        }),
      );
    expect(withCredits(12, null)).toContain("12+ credits");
    expect(withCredits(null, 15)).toContain("up to 15 credits");
  });
});
