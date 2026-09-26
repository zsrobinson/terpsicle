import { describe, expect, it } from "vitest";
import { anUnpublishedCalendar, aPublishedCalendar } from "~/fixtures";
import {
  feedItemKind,
  looksLikeExam,
  matchFeedCourse,
  mentionsGradescope,
  pickFeedCourse,
  splitFeedTitle,
  termForDate,
} from "./feed";

describe("splitFeedTitle", () => {
  it("takes the last bracket as the course label", () => {
    expect(
      splitFeedTitle(
        "Project 2 [CMSC216-0103: Introduction to Computer Systems]",
      ),
    ).toEqual({
      title: "Project 2",
      courseLabel: "CMSC216-0103: Introduction to Computer Systems",
    });
    expect(splitFeedTitle("Office hours [moved] [CMSC216-0103: X]")).toEqual({
      title: "Office hours [moved]",
      courseLabel: "CMSC216-0103: X",
    });
  });

  it("has no label without a bracket at the end", () => {
    expect(splitFeedTitle(" Study group ")).toEqual({
      title: "Study group",
      courseLabel: null,
    });
    expect(splitFeedTitle("[draft] Essay")).toEqual({
      title: "[draft] Essay",
      courseLabel: null,
    });
    expect(splitFeedTitle("Essay []")).toEqual({
      title: "Essay []",
      courseLabel: null,
    });
  });

  it("keeps the whole summary as the title when the bracket is all there is", () => {
    expect(splitFeedTitle("[CMSC216-0103: X]")).toEqual({
      title: "[CMSC216-0103: X]",
      courseLabel: "CMSC216-0103: X",
    });
  });
});

describe("matchFeedCourse", () => {
  it("reads a code and its section", () => {
    expect(
      matchFeedCourse("CMSC216-0103: Introduction to Computer Systems"),
    ).toEqual([{ code: "CMSC216", sectionCode: "0103" }]);
    expect(matchFeedCourse("CMSC389N-FC01: Special Topics")).toEqual([
      { code: "CMSC389N", sectionCode: "FC01" },
    ]);
  });

  it("reads every code once, in order", () => {
    expect(matchFeedCourse("CMSC216/ENEE222-0101: X")).toEqual([
      { code: "CMSC216", sectionCode: null },
      { code: "ENEE222", sectionCode: "0101" },
    ]);
    expect(matchFeedCourse("MATH240-0101, MATH240-0201: X")).toEqual([
      { code: "MATH240", sectionCode: "0101" },
    ]);
  });

  it("finds nothing in a label without a code, or in no label", () => {
    expect(matchFeedCourse("Sam Testudo")).toEqual([]);
    expect(matchFeedCourse("XCMSC216 and CMSC2160")).toEqual([]);
    expect(matchFeedCourse(null)).toEqual([]);
  });
});

describe("pickFeedCourse", () => {
  it("prefers a code in the person's plan, then the first code", () => {
    expect(pickFeedCourse(["CMSC216", "ENEE222"], ["ENEE222"])).toBe("ENEE222");
    expect(pickFeedCourse(["CMSC216", "ENEE222"], new Set(["MATH240"]))).toBe(
      "CMSC216",
    );
    expect(pickFeedCourse([], ["CMSC216"])).toBeNull();
  });
});

describe("looksLikeExam", () => {
  it.each([
    "Midterm 1",
    "Final Exam",
    "Quiz 3",
    "Syllabus quiz",
    "Unit test 2",
    "Exams week",
    "Pre-test",
    "Final project and final exam review",
  ])("guesses %s is an exam", (title) => {
    expect(looksLikeExam(title)).toBe(true);
  });

  it.each([
    "Final Project Proposal",
    "Final paper",
    "Write test cases",
    "Latest reading",
    "Testing lab",
    "Project 2",
  ])("guesses %s isn't", (title) => {
    expect(looksLikeExam(title)).toBe(false);
  });
});

describe("feedItemKind", () => {
  it("believes Canvas's UID", () => {
    expect(feedItemKind("event-assignment-1", "Office hours", false)).toEqual({
      kind: "assignment",
      from: "uid",
    });
    expect(
      feedItemKind("event-calendar-event-1", "Homework help", false),
    ).toEqual({
      kind: "event",
      from: "uid",
    });
  });

  it("guesses from the title otherwise, and says so", () => {
    expect(feedItemKind("x@y", "HW 3", false)).toEqual({
      kind: "assignment",
      from: "title",
    });
    expect(feedItemKind("x@y", "Midterm 2", false)).toEqual({
      kind: "event",
      from: "title",
    });
    expect(feedItemKind("x@y", "Checkoff", true)).toEqual({
      kind: "assignment",
      from: "title",
    });
  });
});

describe("mentionsGradescope", () => {
  it("looks for gradescope.com in any of the texts", () => {
    expect(
      mentionsGradescope(null, "Submit at https://www.Gradescope.com/x"),
    ).toBe(true);
    expect(mentionsGradescope("https://gradescope.com/courses/1", null)).toBe(
      true,
    );
    expect(mentionsGradescope("https://elms.umd.edu/x", "Submit on ELMS")).toBe(
      false,
    );
  });
});

describe("termForDate", () => {
  const fall = aPublishedCalendar({
    termId: "202608",
    classesStart: "2026-08-31",
    classesEnd: "2026-12-11",
    noClasses: [],
  });
  const winter = aPublishedCalendar({
    termId: "202612",
    classesStart: "2027-01-04",
    classesEnd: "2027-01-22",
    noClasses: [],
  });
  const spring = aPublishedCalendar();
  const calendars = [fall, winter, spring, anUnpublishedCalendar()];

  it("finds the term whose classes, plus 14 days, hold the date", () => {
    expect(termForDate("2026-08-31", calendars)).toBe("202608");
    expect(termForDate("2026-12-25", calendars)).toBe("202608");
    expect(termForDate("2027-01-10", calendars)).toBe("202612");
    expect(termForDate("2027-05-25", calendars)).toBe("202701");
  });

  it("prefers the term that started last where spans overlap", () => {
    // Winter's grace runs to Feb 5; spring's classes start Jan 27.
    expect(termForDate("2027-01-28", calendars)).toBe("202701");
  });

  it("is null outside every span, and ignores unpublished calendars", () => {
    expect(termForDate("2026-12-26", calendars)).toBeNull();
    expect(termForDate("2026-06-01", calendars)).toBeNull();
    expect(termForDate("2027-01-10", [anUnpublishedCalendar()])).toBeNull();
  });
});
