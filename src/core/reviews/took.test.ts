import { describe, expect, it } from "vitest";
import {
  aFourYear,
  aFourYearEntry,
  aMyReview,
  aPlan,
  aPlanCourse,
  aSavedCourse,
  aSectionSnapshot,
} from "~/fixtures";
import { reviewedKey } from "./to-review";
import {
  classesTaken,
  classesToReview,
  reviewedHere,
  reviewsByRecency,
  tookHere,
} from "./took";

const placed = (courseCode: string, ...instructors: string[]) =>
  aPlanCourse({
    courseCode,
    sectionCode: "0101",
    snapshot: aSectionSnapshot({ instructors }),
  });

const today = "2026-09-28";

describe("classesTaken", () => {
  it("reads each over term's main plan, newest first, with who taught you", () => {
    const plans = [
      aPlan({
        id: "plan_spring",
        termId: "202601",
        courses: [placed("CMSC351", "Clyde Kruskal"), aSavedCourse("MATH240")],
      }),
      aPlan({
        id: "plan_fall",
        termId: "202508",
        courses: [placed("CMSC250", "Ada Brandt", "Staff")],
      }),
      // This term isn't nearly over yet: nothing in it counts.
      aPlan({
        id: "plan_now",
        termId: "202608",
        courses: [placed("CMSC330", "Anwar Mamat")],
      }),
    ];
    expect(
      classesTaken(
        { plans, mainPlans: {}, fourYear: null },
        today,
        new Set(["202601", "202508", "202608"]),
      ),
    ).toEqual([
      { termId: "202601", course: "CMSC351", instructors: ["Clyde Kruskal"] },
      { termId: "202601", course: "MATH240", instructors: [] },
      { termId: "202508", course: "CMSC250", instructors: ["Ada Brandt"] },
    ]);
  });

  it("adds the four-year plan's courses in terms that are over, and merges a schedule's", () => {
    const fourYear = aFourYear({
      entries: [
        aFourYearEntry({ id: "e1", term: "202601", code: "CMSC351" }),
        aFourYearEntry({ id: "e2", term: "202501", code: "MATH141" }),
        aFourYearEntry({ id: "e3", term: "before", code: "MATH140" }),
        aFourYearEntry({ id: "e4", term: "202701", code: "CMSC420" }),
      ],
    });
    const plans = [
      aPlan({
        termId: "202601",
        courses: [placed("CMSC351", "Clyde Kruskal")],
      }),
    ];
    expect(
      classesTaken(
        { plans, mainPlans: {}, fourYear },
        today,
        new Set(["202601"]),
      ),
    ).toEqual([
      { termId: "202601", course: "CMSC351", instructors: ["Clyde Kruskal"] },
      { termId: "202501", course: "MATH141", instructors: [] },
    ]);
  });

  it("reads a schedule only for a term the Schedule of Classes still lists", () => {
    // In the fall, Testudo lists back to the summer: a spring schedule is
    // one nobody could have built there, so only the four-year plan counts.
    const plans = [
      aPlan({
        termId: "202601",
        courses: [placed("CMSC351", "Clyde Kruskal")],
      }),
      aPlan({
        id: "plan_summer",
        termId: "202605",
        courses: [placed("MATH240", "Ada Brandt")],
      }),
    ];
    const fourYear = aFourYear({
      entries: [aFourYearEntry({ id: "e1", term: "202601", code: "CMSC351" })],
    });
    expect(
      classesTaken(
        { plans, mainPlans: {}, fourYear },
        today,
        new Set(["202605", "202608", "202701"]),
      ),
    ).toEqual([
      { termId: "202605", course: "MATH240", instructors: ["Ada Brandt"] },
      { termId: "202601", course: "CMSC351", instructors: [] },
    ]);
  });

  it("leaves out terms older than the review form offers", () => {
    const fourYear = aFourYear({
      entries: [aFourYearEntry({ id: "old", term: "201908", code: "CMSC131" })],
    });
    expect(
      classesTaken({ plans: [], mainPlans: {}, fourYear }, today, new Set()),
    ).toEqual([]);
  });
});

describe("tookHere", () => {
  const taken = [
    { termId: "202601", course: "CMSC351", instructors: ["Clyde Kruskal"] },
    { termId: "202508", course: "CMSC250", instructors: ["Clyde  kruskal"] },
    { termId: "202501", course: "MATH141", instructors: [] },
  ] as const;

  it("finds a course page's class, with who taught it", () => {
    expect(
      tookHere(
        taken.map((t) => ({ ...t, instructors: [...t.instructors] })),
        {
          course: "MATH141",
          instructorName: null,
        },
      ),
    ).toEqual({ termId: "202501", course: "MATH141", instructor: null });
  });

  it("finds an instructor's newest class by their name, however it's spaced", () => {
    const list = taken.map((t) => ({ ...t, instructors: [...t.instructors] }));
    expect(
      tookHere(list, { course: null, instructorName: "Clyde Kruskal" }),
    ).toEqual({
      termId: "202601",
      course: "CMSC351",
      instructor: "Clyde Kruskal",
    });
    expect(
      tookHere(list, { course: "CMSC250", instructorName: "Clyde Kruskal" }),
    ).toEqual({
      termId: "202508",
      course: "CMSC250",
      instructor: "Clyde  kruskal",
    });
    expect(
      tookHere(list, { course: null, instructorName: "Ada Brandt" }),
    ).toBeNull();
  });

  it("skips classes you've reviewed", () => {
    const list = taken.map((t) => ({ ...t, instructors: [...t.instructors] }));
    const reviewed = new Set([
      reviewedKey("CMSC351", "Clyde Kruskal"),
      reviewedKey("MATH141", "Someone Else"),
    ]);
    expect(
      tookHere(
        list,
        { course: null, instructorName: "Clyde Kruskal" },
        reviewed,
      ),
    ).toMatchObject({ course: "CMSC250" });
    // The four-year plan's class names nobody: reviewing the course counts.
    expect(
      tookHere(list, { course: "MATH141", instructorName: null }, reviewed),
    ).toBeNull();
  });
});

describe("a class whose instructor isn't known", () => {
  const taken = [{ termId: "202601", course: "CMSC351", instructors: [] }];

  it("is asked about on an instructor's page only for a course they taught", () => {
    expect(
      tookHere(taken, {
        course: null,
        instructorName: "Clyde Kruskal",
        taught: new Set(["CMSC351", "CMSC451"]),
      }),
    ).toEqual({ termId: "202601", course: "CMSC351", instructor: null });
    expect(
      tookHere(taken, {
        course: null,
        instructorName: "Ada Brandt",
        taught: new Set(["MATH240"]),
      }),
    ).toBeNull();
  });

  it("is one to review until you've reviewed the course", () => {
    const mixed = [
      ...taken,
      {
        termId: "202508",
        course: "CMSC250",
        instructors: ["Ada Brandt", "Jo Canada"],
      },
    ];
    expect(classesToReview(mixed, new Set())).toEqual([
      { termId: "202601", course: "CMSC351", instructor: null },
      { termId: "202508", course: "CMSC250", instructor: "Ada Brandt" },
      { termId: "202508", course: "CMSC250", instructor: "Jo Canada" },
    ]);
    expect(
      classesToReview(
        mixed,
        new Set([
          reviewedKey("CMSC351", "Clyde Kruskal"),
          reviewedKey("CMSC250", "Jo Canada"),
        ]),
      ),
    ).toEqual([
      { termId: "202508", course: "CMSC250", instructor: "Ada Brandt" },
    ]);
  });
});

describe("reviewsByRecency and reviewedHere", () => {
  const older = aMyReview({
    id: "rvOlder000000000000001",
    createdAt: "2026-02-01T00:00:00.000Z",
  });
  const newer = aMyReview({
    id: "rvNewer000000000000001",
    course: "CMSC250",
    createdAt: "2026-05-01T00:00:00.000Z",
  });
  const rejected = aMyReview({
    id: "rvRejected000000000001",
    course: "CMSC420",
    status: "rejected",
    createdAt: "2026-06-01T00:00:00.000Z",
  });

  it("lists yours newest first, one per class, rejected ones left out", () => {
    const again = aMyReview({
      id: "rvAgain000000000000001",
      createdAt: "2026-01-01T00:00:00.000Z",
    });
    expect(
      reviewsByRecency([older, rejected, again, newer]).map((r) => r.id),
    ).toEqual([newer.id, older.id]);
  });

  it("finds the one a page is about", () => {
    const mine = [older, newer, rejected];
    expect(
      reviewedHere(mine, { instructorId: "brandt", course: null })?.id,
    ).toBe(newer.id);
    expect(
      reviewedHere(mine, { instructorId: null, course: "CMSC351" })?.id,
    ).toBe(older.id);
    expect(
      reviewedHere(mine, { instructorId: null, course: "CMSC420" }),
    ).toBeNull();
  });
});
