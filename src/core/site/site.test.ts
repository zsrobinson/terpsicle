import { describe, expect, it } from "vitest";
import { aBlock, aPlan, archivedFixtureTermId, aSavedCourse } from "~/fixtures";
import { hasSavedWork, hasSessionCookie, landingFor } from "./site";

describe("hasSessionCookie", () => {
  it("finds a session cookie among others", () => {
    expect(hasSessionCookie("theme=dark; __Host-session=abc123")).toBe(true);
    expect(hasSessionCookie("session=abc")).toBe(true);
  });

  it("ignores missing, empty and look-alike cookies", () => {
    expect(hasSessionCookie(null)).toBe(false);
    expect(hasSessionCookie("")).toBe(false);
    expect(hasSessionCookie("session=")).toBe(false);
    expect(hasSessionCookie("session")).toBe(false);
    expect(hasSessionCookie("my-session=abc; sessions=1")).toBe(false);
  });
});

describe("hasSavedWork", () => {
  it("doesn't count the empty plan a first visit saves", () => {
    expect(hasSavedWork([], [])).toBe(false);
    expect(hasSavedWork([aPlan({ courses: [] })], [])).toBe(false);
    // One empty plan in each of two terms: still nothing made.
    expect(
      hasSavedWork(
        [
          aPlan({ courses: [] }),
          aPlan({ id: "plan_b", termId: archivedFixtureTermId, courses: [] }),
        ],
        [],
      ),
    ).toBe(false);
  });

  it("counts a course, even one saved for later", () => {
    expect(hasSavedWork([aPlan()], [])).toBe(true);
    expect(hasSavedWork([aPlan({ courses: [aSavedCourse()] })], [])).toBe(true);
  });

  it("counts a second plan in a term, and any block", () => {
    expect(
      hasSavedWork(
        [aPlan({ courses: [] }), aPlan({ id: "plan_b", courses: [] })],
        [],
      ),
    ).toBe(true);
    expect(hasSavedWork([], [aBlock()])).toBe(true);
  });

  it("skips rows that aren't plans rather than failing", () => {
    expect(hasSavedWork([null, 3, "x", { courses: "no" }], [])).toBe(false);
  });

  it("stays self-contained, so the head script can inline it", () => {
    const inlined = new Function(`return (${hasSavedWork.toString()})`)() as
      | typeof hasSavedWork
      | undefined;
    expect(inlined?.([aPlan()], [])).toBe(true);
    expect(inlined?.([aPlan({ courses: [] })], [])).toBe(false);
  });
});

describe("landingFor", () => {
  it("sends anyone signed in or with saved work to the scheduler", () => {
    expect(landingFor({ signedIn: false, savedWork: false })).toBe("marketing");
    expect(landingFor({ signedIn: true, savedWork: false })).toBe("schedule");
    expect(landingFor({ signedIn: false, savedWork: true })).toBe("schedule");
    expect(landingFor({ signedIn: true, savedWork: true })).toBe("schedule");
  });
});
