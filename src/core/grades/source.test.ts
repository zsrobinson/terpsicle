import { describe, expect, it } from "vitest";
import { aPlanetTerpSource } from "~/fixtures";
import { termLabel } from "../catalog";
import { formatMonthYear } from "../time";
import { gradesSourceWords, planetTerpFreshnessWords } from "./source";

describe("PlanetTerp freshness words", () => {
  it("says which semester grades run through", () => {
    expect(gradesSourceWords("202501")).toBe(
      "through Spring 2025, from PlanetTerp",
    );
    expect(gradesSourceWords("202412")).toBe(
      "through Winter 2025, from PlanetTerp",
    );
    expect(gradesSourceWords(null)).toBe("from PlanetTerp");
  });

  it("says nothing while PlanetTerp is current or we can't tell", () => {
    expect(planetTerpFreshnessWords(aPlanetTerpSource())).toBeNull();
    expect(planetTerpFreshnessWords(undefined)).toBeNull();
  });

  it("names the month PlanetTerp stopped updating", () => {
    expect(
      planetTerpFreshnessWords(
        aPlanetTerpSource({
          status: "stale",
          latestReviewAt: "2026-04-29T15:02:11.000Z",
        }),
      ),
    ).toBe("PlanetTerp hasn't updated since Apr 2026");
    expect(
      planetTerpFreshnessWords(
        aPlanetTerpSource({
          status: "stale",
          latestReviewAt: null,
          lastSuccessAt: "2026-09-25T12:00:00.000Z",
        }),
      ),
    ).toBe("PlanetTerp hasn't updated since Sep 2026");
    expect(
      planetTerpFreshnessWords(
        aPlanetTerpSource({
          status: "gone",
          lastSuccessAt: "2026-09-25T12:00:00.000Z",
        }),
      ),
    ).toBe(
      "PlanetTerp hasn't answered since Sep 2026, so these are its last numbers",
    );
  });

  it("formats months and term names", () => {
    expect(formatMonthYear("2026-01-03T00:00:00Z")).toBe("Jan 2026");
    expect(termLabel("202701")).toBe("Spring 2027");
    expect(termLabel("junk")).toBe("junk");
  });
});
