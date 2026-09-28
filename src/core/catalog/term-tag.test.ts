import { describe, expect, it } from "vitest";
import { aPublishedCalendar } from "~/fixtures";
import { termStatus } from "../four-year/status";
import { termTagCandidates, termTagOf, termTags } from "./term-tag";

const FALL_2026 = "202608";
const WINTER_2027 = "202612";
const SPRING_2027 = "202701";
const SUMMER_2027 = "202705";
const FALL_2027 = "202708";

const fall2026 = aPublishedCalendar({
  termId: FALL_2026,
  classesStart: "2026-08-31",
  classesEnd: "2026-12-11",
  noClasses: [],
});

describe("termTags", () => {
  it("tags the term in session Now and the next fall or spring Next", () => {
    expect(termTags("2026-09-28", [])).toEqual({
      now: FALL_2026,
      next: SPRING_2027,
    });
    expect(termTags("2027-03-01", [])).toEqual({
      now: SPRING_2027,
      next: FALL_2027,
    });
  });

  it("gives winter and summer Now while they're in session, never Next", () => {
    expect(termTags("2027-01-10", [])).toEqual({
      now: WINTER_2027,
      next: SPRING_2027,
    });
    expect(termTags("2027-07-01", [])).toEqual({
      now: SUMMER_2027,
      next: FALL_2027,
    });
  });

  it("reads the published calendar, as Plan's term status does", () => {
    // The season's months say fall, but its classes haven't started.
    expect(termTags("2026-08-25", [fall2026]).now).not.toBe(FALL_2026);
    expect(termTags("2026-08-25", [fall2026]).next).toBe(FALL_2026);
    // Grades are still coming in: Fall 2026 is still Now.
    expect(termTags("2026-12-20", [fall2026]).now).toBe(FALL_2026);
    for (const today of ["2026-08-25", "2026-10-01", "2026-12-20"]) {
      const now = termTags(today, [fall2026]).now === FALL_2026;
      expect(now).toBe(
        termStatus(FALL_2026, today, [fall2026]) === "in-progress",
      );
    }
  });

  it("names every candidate it can pick", () => {
    for (const today of ["2026-01-05", "2026-06-15", "2026-12-31"]) {
      const { now, next } = termTags(today, []);
      const candidates = termTagCandidates(today);
      if (now) expect(candidates).toContain(now);
      if (next) expect(candidates).toContain(next);
    }
  });
});

describe("termTagOf", () => {
  it("is now, next or nothing", () => {
    const tags = { now: FALL_2026, next: SPRING_2027 };
    expect(termTagOf(FALL_2026, tags)).toBe("now");
    expect(termTagOf(SPRING_2027, tags)).toBe("next");
    expect(termTagOf(FALL_2027, tags)).toBeNull();
  });
});
