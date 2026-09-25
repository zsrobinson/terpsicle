import { describe, expect, it } from "vitest";
import type { PlanStats } from "~/core/schema";
import {
  differenceLabel,
  freeDaysLabel,
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
