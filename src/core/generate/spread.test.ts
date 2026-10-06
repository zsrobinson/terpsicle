import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { aGeneratedPlan } from "~/fixtures";
import { RANK_FACTORS } from "./score";
import { filterRemoval, planSpread, type SpreadMeasure } from "./spread";

const ticks = (spread: ReturnType<typeof planSpread>) =>
  spread?.bins.map((b) => b.tick);
const counts = (spread: ReturnType<typeof planSpread>) =>
  spread?.bins.map((b) => b.count);

describe("planSpread", () => {
  it("bins the average start the ranking uses, by half hours, and marks the first plan", () => {
    // 0.25 of the 8am–noon scale is 9am; 0.5 is 10am; 0.625 is 10:30am.
    const plans = [0.5, 0.25, 0.625, 0.5].map((s) =>
      aGeneratedPlan({ breakdown: { "later-starts": s } }),
    );
    const spread = planSpread("later-starts", plans);
    expect(ticks(spread)).toEqual(["9", "9:30", "10", "10:30"]);
    expect(counts(spread)).toEqual([1, 0, 2, 1]);
    // The first plan starts about 10am: the third bin once 8 and 8:30 are trimmed.
    expect(spread?.top).toBe(2);
    expect(spread?.better).toBe("high");
    expect(spread?.bins[2]?.label).toBe("Average start about 10am");
  });

  it("reads gaps back off the compact score, to the hour, as the rows do", () => {
    // 1 − 90/1200 of gaps → 1.5 hours → "2h"; a full score is no gaps.
    const plans = [
      aGeneratedPlan({ breakdown: { compact: 1 } }),
      aGeneratedPlan({ breakdown: { compact: 1 - 90 / 1200 } }),
      aGeneratedPlan({ breakdown: { compact: 0 } }),
    ];
    const spread = planSpread("compact", plans);
    expect(ticks(spread)).toEqual([
      "0h",
      "1h",
      "2h",
      "3h",
      "4h",
      "5h",
      "6h",
      "7h",
      "8h+",
    ]);
    expect(counts(spread)).toEqual([1, 0, 1, 0, 0, 0, 0, 0, 1]);
    expect(spread?.better).toBe("low");
    expect(spread?.top).toBe(0);
  });

  it("counts days on campus, fewer being better", () => {
    const spread = planSpread(
      "fewer-days",
      [4, 2, 3, 3].map((d) => aGeneratedPlan({ stats: { daysOnCampus: d } })),
    );
    expect(ticks(spread)).toEqual(["2", "3", "4"]);
    expect(counts(spread)).toEqual([1, 2, 1]);
    expect(spread?.top).toBe(2);
    expect(spread?.better).toBe("low");
  });

  it("leaves plans with nothing to measure out of the bins, and says how many", () => {
    const spread = planSpread("best-rated", [
      aGeneratedPlan({ stats: { avgRating: null } }),
      aGeneratedPlan({ stats: { avgRating: 4.2 } }),
      aGeneratedPlan({ stats: { avgRating: 3.6 } }),
    ]);
    expect(ticks(spread)).toEqual(["3.5", "4.0"]);
    expect(counts(spread)).toEqual([1, 1]);
    expect(spread?.unknown).toBe(1);
    expect(spread?.counted).toBe(2);
    // The first plan has no ratings: nothing to mark.
    expect(spread?.top).toBeNull();
  });

  it("is null when no plan has a value", () => {
    expect(
      planSpread("higher-gpa", [aGeneratedPlan({ stats: { avgGpa: null } })]),
    ).toBeNull();
    expect(planSpread("compact", [])).toBeNull();
  });

  it("puts GPAs under 2 in one bin and 4.0 in the last", () => {
    const spread = planSpread(
      "higher-gpa",
      [1.4, 2.0, 3.99, 4.0].map((g) =>
        aGeneratedPlan({ stats: { avgGpa: g } }),
      ),
    );
    expect(spread?.bins[0]?.tick).toBe("<2");
    expect(spread?.bins.at(-1)?.tick).toBe("3.8");
    expect(spread?.bins.at(-1)?.count).toBe(2);
    expect(spread?.bins[1]).toMatchObject({ tick: "2.0", count: 1 });
  });

  it("groups open seats from full to the safe 30", () => {
    const spread = planSpread(
      "safest-seats",
      [0, 3, 12, 45].map((n) =>
        aGeneratedPlan({ stats: { fewestOpenSeats: n } }),
      ),
    );
    expect(ticks(spread)).toEqual(["0", "1–4", "5–9", "10–19", "20–29", "30+"]);
    expect(counts(spread)).toEqual([1, 1, 0, 1, 0, 1]);
    expect(spread?.bins[0]?.label).toBe("A section is full");
  });

  it("bins first and last classes by the hour, for the time filters", () => {
    const plans = [
      aGeneratedPlan({
        stats: { firstClass: 9 * 60 + 30, lastClass: 15 * 60 },
      }),
      aGeneratedPlan({
        stats: { firstClass: 8 * 60, lastClass: 17 * 60 + 15 },
      }),
      aGeneratedPlan({ stats: { firstClass: null, lastClass: null } }),
    ];
    const first = planSpread("first-class", plans);
    expect(ticks(first)).toEqual(["8am", "9am"]);
    expect(counts(first)).toEqual([1, 1]);
    expect(first?.bins[1]?.label).toBe("First class 9am–10am");
    expect(first?.better).toBeNull();
    expect(first?.unknown).toBe(1);
    expect(ticks(planSpread("last-class", plans))).toEqual([
      "3pm",
      "4pm",
      "5pm",
    ]);
  });

  it("counts credits by the whole credit", () => {
    const spread = planSpread(
      "credits",
      [12, 15, 15, 13.5].map((c) => aGeneratedPlan({ stats: { credits: c } })),
    );
    expect(ticks(spread)).toEqual(["12", "13", "14", "15"]);
    expect(counts(spread)).toEqual([1, 1, 0, 2]);
  });

  it("puts every plan in exactly one bin or in unknown, whatever the scores", () => {
    const measures: SpreadMeasure[] = [
      ...RANK_FACTORS,
      "first-class",
      "last-class",
      "credits",
    ];
    const unit = fc.double({ min: 0, max: 1, noNaN: true });
    const plan = fc
      .record({
        compact: unit,
        later: unit,
        days: fc.integer({ min: 0, max: 7 }),
        rating: fc.option(fc.double({ min: 1, max: 5, noNaN: true })),
        gpa: fc.option(fc.double({ min: 0, max: 4, noNaN: true })),
        seats: fc.option(fc.integer({ min: 0, max: 400 })),
        first: fc.option(fc.integer({ min: 0, max: 1439 })),
        credits: fc.double({ min: 0, max: 40, noNaN: true }),
      })
      .map((r) =>
        aGeneratedPlan({
          breakdown: { compact: r.compact, "later-starts": r.later },
          stats: {
            daysOnCampus: r.days,
            avgRating: r.rating,
            avgGpa: r.gpa,
            fewestOpenSeats: r.seats,
            firstClass: r.first,
            lastClass: r.first,
            credits: r.credits,
          },
        }),
      );
    fc.assert(
      fc.property(
        fc.constantFrom(...measures),
        fc.array(plan, { minLength: 1, maxLength: 30 }),
        (measure, plans) => {
          const spread = planSpread(measure, plans);
          if (!spread) return;
          const binned = spread.bins.reduce((n, b) => n + b.count, 0);
          expect(binned).toBe(spread.counted);
          expect(binned + spread.unknown).toBe(plans.length);
          expect(spread.bins[0]?.count).toBeGreaterThan(0);
          expect(spread.bins.at(-1)?.count).toBeGreaterThan(0);
          if (spread.top !== null)
            expect(spread.bins[spread.top]?.count).toBeGreaterThan(0);
        },
      ),
    );
  });
});

describe("filterRemoval", () => {
  it("says what the plans would be without the filter, and its share", () => {
    expect(
      filterRemoval(
        { constraint: "earliest-start", removed: 306, atLeast: false },
        918,
      ),
    ).toEqual({
      kept: 918,
      removed: 306,
      atLeast: false,
      without: 1224,
      share: 0.25,
    });
  });

  it("is a share of 0 when there were no plans either way", () => {
    expect(
      filterRemoval({ constraint: "credits", removed: 0, atLeast: true }, 0),
    ).toMatchObject({ without: 0, share: 0, atLeast: true });
  });
});
