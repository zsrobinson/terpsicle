import { describe, expect, it } from "vitest";
import { DEFAULT_MUST_HAVES, DEFAULT_RANK_BY, type MustHaves } from "../schema";
import { GenerateTabSearchSchema } from "../schema/schedule-url";
import { chipParams, chipsFromParams, sameChips } from "./url";

const chips = (
  mustHaves: Partial<MustHaves> = {},
  rankBy = DEFAULT_RANK_BY,
) => ({ mustHaves: { ...DEFAULT_MUST_HAVES, ...mustHaves }, rankBy });

/** Through the route's schema, as the router reads what it wrote. */
const roundTrip = (c: ReturnType<typeof chips>) =>
  chipsFromParams(
    GenerateTabSearchSchema.parse(JSON.parse(JSON.stringify(chipParams(c)))),
  );

describe("Generate's chips in its URL", () => {
  it("says nothing at the defaults", () => {
    expect(
      Object.values(chipParams(chips())).filter((v) => v !== undefined),
    ).toEqual([]);
    expect(chipsFromParams({})).toEqual(chips());
  });

  it("names each filter and preference that's changed", () => {
    const c = chips(
      {
        earliestStart: 600,
        latestEnd: 1020,
        daysOff: ["M", "F"],
        openSeatsOnly: true,
        enoughTravelTime: false,
        respectBlocks: false,
        credits: { min: 12, max: 16.5 },
      },
      {
        preset: "custom",
        weights: {
          compact: 0,
          "fewer-days": 0,
          "later-starts": 0.5,
          "best-rated": 1,
          "higher-gpa": 0,
          "safest-seats": 0,
        },
      },
    );
    expect(chipParams(c)).toEqual({
      prefer: "later-starts,best-rated*2",
      start: 600,
      end: 1020,
      off: "M,F",
      seats: 1,
      walk: 0,
      blocks: 0,
      minCredits: 12,
      maxCredits: 16.5,
    });
    expect(roundTrip(c)).toEqual(c);
  });

  it("says none when every preference is off", () => {
    const none = chipsFromParams({ prefer: "none" });
    expect(chipParams(none).prefer).toBe("none");
    expect(roundTrip(none)).toEqual(none);
  });

  it("drops a bad param and keeps the rest", () => {
    const parsed = GenerateTabSearchSchema.parse({
      prefer: "later-starts,sooner",
      start: "tea",
      off: "F",
      maxCredits: 99,
    });
    expect(chipsFromParams(parsed)).toEqual(chips({ daysOff: ["F"] }));
  });

  it("compares chips by what they ask for", () => {
    expect(
      sameChips(chips(), {
        ...chips(),
        rankBy: {
          preset: "custom",
          weights: {
            compact: 0.4,
            "fewer-days": 0,
            "later-starts": 0,
            "best-rated": 0,
            "higher-gpa": 0,
            "safest-seats": 0,
          },
        },
      }),
    ).toBe(true);
    expect(sameChips(chips(), chips({ daysOff: ["F"] }))).toBe(false);
  });
});
