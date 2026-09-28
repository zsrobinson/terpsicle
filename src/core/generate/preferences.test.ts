import { describe, expect, it } from "vitest";
import type { PlanStats, RankBy, ScoreBreakdown } from "../schema";
import {
  activePreferences,
  NO_PREFERENCES,
  nextLevel,
  preferenceLevels,
  preferenceMark,
  rankByFromLevels,
} from "./preferences";
import { rankWeights } from "./score";

const breakdown = (over: Partial<ScoreBreakdown> = {}): ScoreBreakdown => ({
  compact: 0.5,
  "fewer-days": 0.5,
  "later-starts": 0.5,
  "best-rated": 0.5,
  "higher-gpa": 0.5,
  "safest-seats": 0.5,
  ...over,
});

const stats = (over: Partial<PlanStats> = {}): PlanStats => ({
  credits: 12,
  daysOnCampus: 4,
  firstClass: 600,
  lastClass: 900,
  avgRating: 4.12,
  avgGpa: 3.214,
  fewestOpenSeats: 12,
  ...over,
});

describe("preference levels", () => {
  it("cycles off, on, double, off", () => {
    expect([0, 1, 2].map((l) => nextLevel(l as 0 | 1 | 2))).toEqual([1, 2, 0]);
  });

  it("reads a preset as that one factor on", () => {
    expect(preferenceLevels({ preset: "later-starts" })).toEqual({
      ...NO_PREFERENCES,
      "later-starts": 1,
    });
  });

  it("reads custom weights as off, on or double", () => {
    const rankBy: RankBy = {
      preset: "custom",
      weights: {
        compact: 0,
        "fewer-days": 0.2,
        "later-starts": 0.5,
        "best-rated": 0.8,
        "higher-gpa": 1,
        "safest-seats": 0,
      },
    };
    expect(preferenceLevels(rankBy)).toEqual({
      ...NO_PREFERENCES,
      "fewer-days": 1,
      "later-starts": 1,
      "best-rated": 2,
      "higher-gpa": 2,
    });
  });

  it("writes one factor on as its preset, and anything else as weights", () => {
    expect(rankByFromLevels({ ...NO_PREFERENCES, compact: 1 })).toEqual({
      preset: "compact",
    });
    const mixed = rankByFromLevels({
      ...NO_PREFERENCES,
      compact: 1,
      "best-rated": 2,
    });
    expect(mixed).toEqual({
      preset: "custom",
      weights: { ...NO_PREFERENCES, compact: 0.5, "best-rated": 1 },
    });
    // Double counts twice as much as on.
    const w = rankWeights(mixed);
    expect(w[3]).toBeCloseTo(2 * (w[0] ?? 0));
  });

  it("round-trips every combination", () => {
    const levels = [0, 1, 2] as const;
    for (const a of levels)
      for (const b of levels)
        for (const c of levels) {
          const chosen = {
            ...NO_PREFERENCES,
            compact: a,
            "later-starts": b,
            "safest-seats": c,
          };
          expect(preferenceLevels(rankByFromLevels(chosen))).toEqual(chosen);
        }
  });

  it("lists the ones that are on, double first, then in chip order", () => {
    expect(
      activePreferences({
        ...NO_PREFERENCES,
        compact: 1,
        "best-rated": 2,
        "later-starts": 1,
      }),
    ).toEqual(["best-rated", "compact", "later-starts"]);
    expect(activePreferences(NO_PREFERENCES)).toEqual([]);
  });
});

describe("preferenceMark", () => {
  it("says each factor's value in plain words, with its 0–1 score", () => {
    const b = breakdown({ compact: 0.875, "later-starts": 0.625 });
    const s = stats();
    expect(preferenceMark("compact", b, s)).toEqual({
      score: 0.875,
      words: "2 hr 30 min gaps",
    });
    expect(preferenceMark("fewer-days", b, s).words).toBe("4 days");
    expect(preferenceMark("later-starts", b, s).words).toBe(
      "10:30am avg start",
    );
    expect(preferenceMark("best-rated", b, s).words).toBe("★ 4.1");
    expect(preferenceMark("higher-gpa", b, s).words).toBe("3.21 GPA");
    expect(preferenceMark("safest-seats", b, s).words).toBe("12 seats left");
  });

  it("says plainly when there's nothing to go on", () => {
    const s = stats({ avgRating: null, avgGpa: null, fewestOpenSeats: null });
    const b = breakdown();
    expect(preferenceMark("best-rated", b, s).words).toBe("No ratings");
    expect(preferenceMark("higher-gpa", b, s).words).toBe("No grades");
    expect(preferenceMark("safest-seats", b, s).words).toBe("Seats unknown");
    expect(
      preferenceMark("safest-seats", b, stats({ fewestOpenSeats: 0 })).words,
    ).toBe("A section is full");
    expect(preferenceMark("compact", breakdown({ compact: 1 }), s).words).toBe(
      "No gaps",
    );
    expect(
      preferenceMark("fewer-days", b, stats({ daysOnCampus: 1 })).words,
    ).toBe("1 day");
  });

  it("bounds the average start at the scale's ends", () => {
    const s = stats();
    expect(
      preferenceMark("later-starts", breakdown({ "later-starts": 0 }), s).words,
    ).toBe("8am avg start");
    expect(
      preferenceMark("later-starts", breakdown({ "later-starts": 1 }), s).words,
    ).toBe("12pm+ avg start");
  });
});
