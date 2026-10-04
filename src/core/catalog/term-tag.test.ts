import { describe, expect, it } from "vitest";
import { aPublishedCalendar } from "~/fixtures";
import { termStatus } from "../four-year/status";
import { chatTerm, termTagCandidates, termTagOf, termTags } from "./term-tag";

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

describe("chatTerm", () => {
  const listed = [SUMMER_2027, SPRING_2027, WINTER_2027, FALL_2026];

  it("is the listed term in session", () => {
    expect(chatTerm("2026-09-28", listed, [fall2026])).toBe(FALL_2026);
    expect(chatTerm("2027-01-10", listed, [])).toBe(WINTER_2027);
    expect(chatTerm("2027-07-01", listed, [])).toBe(SUMMER_2027);
  });

  it("between terms, is the next one to start, winter and summer too", () => {
    const spring = aPublishedCalendar({
      termId: SPRING_2027,
      classesStart: "2027-01-27",
      classesEnd: "2027-05-11",
    });
    const summer = aPublishedCalendar({
      termId: SUMMER_2027,
      classesStart: "2027-06-07",
      classesEnd: "2027-08-13",
    });
    // Spring's grades are in by 05-25; summer's classes start on 06-07.
    expect(chatTerm("2027-06-01", listed, [spring, summer])).toBe(SUMMER_2027);
    // Before Fall 2026's first day, with nothing in session: fall.
    expect(chatTerm("2026-08-25", [SPRING_2027, FALL_2026], [fall2026])).toBe(
      FALL_2026,
    );
  });

  it("counts only the terms Testudo lists", () => {
    // Fall 2026 is in session, but without its catalog it has no rooms.
    expect(chatTerm("2026-09-28", [SPRING_2027], [])).toBe(SPRING_2027);
  });

  it("with nothing in session or to come, is the newest listed term", () => {
    expect(chatTerm("2027-09-01", [FALL_2026, SPRING_2027], [])).toBe(
      SPRING_2027,
    );
    expect(chatTerm("2027-09-01", [], [])).toBeNull();
  });
});
