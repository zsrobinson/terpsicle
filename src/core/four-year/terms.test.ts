import { describe, expect, it } from "vitest";
import {
  aFourYear,
  aFourYearEntry,
  anUnpublishedCalendar,
  aPublishedCalendar,
} from "~/fixtures";
import { statusResolver, termSpan, termStatus } from "./status";
import {
  compareFourYearTerms,
  entriesInTerm,
  firstSemesterOf,
  fourYearColumns,
  fourYearTermLabel,
  isSemester,
  nextSemester,
  previousSemester,
  semesterIds,
} from "./terms";

describe("columns", () => {
  it("sorts Before UMD first, then by date", () => {
    expect(
      ["202701", "before", "202612", "202608"].sort(compareFourYearTerms),
    ).toEqual(["before", "202608", "202612", "202701"]);
    expect(compareFourYearTerms("before", "before")).toBe(0);
  });

  it("steps through fall and spring only", () => {
    expect(nextSemester("202608")).toBe("202701");
    expect(nextSemester("202701")).toBe("202708");
    expect(nextSemester("202705")).toBe("202708");
    expect(nextSemester("202612")).toBe("202701");
    expect(previousSemester("202701")).toBe("202608");
    expect(previousSemester("202608")).toBe("202601");
    expect(previousSemester("202705")).toBe("202701");
    expect(previousSemester("202612")).toBe("202608");
    expect(isSemester("202705")).toBe(false);
    expect(isSemester("before")).toBe(false);
  });

  it("shows eight semesters from the first, starting at a fall or a spring", () => {
    expect(semesterIds("202608")).toEqual([
      "202608",
      "202701",
      "202708",
      "202801",
      "202808",
      "202901",
      "202908",
      "203001",
    ]);
    expect(semesterIds("202701", 2)).toEqual(["202701", "202708"]);
    expect(semesterIds("202705", 1)).toEqual(["202708"]);
  });

  it("adds summers, winters and later terms that have a course", () => {
    const doc = aFourYear({
      entries: [
        aFourYearEntry({ id: "entry_summer", term: "202705" }),
        aFourYearEntry({ id: "entry_late", term: "203008" }),
      ],
    });
    const columns = fourYearColumns(doc);
    expect(columns[0]).toBe("before");
    expect(columns).toContain("202705");
    expect(columns.at(-1)).toBe("203008");
    expect(columns).toHaveLength(11);
    expect(entriesInTerm(doc, "202705").map((e) => e.id)).toEqual([
      "entry_summer",
    ]);
  });

  it("names columns", () => {
    expect(fourYearTermLabel("before")).toBe("Before UMD");
    expect(fourYearTermLabel("202608")).toBe("Fall 2026");
  });

  it("finds the first fall or spring", () => {
    expect(firstSemesterOf(["before", "202705", "202801", "202708"])).toBe(
      "202708",
    );
    expect(firstSemesterOf(["before", "202705"])).toBeNull();
  });
});

describe("termStatus", () => {
  const calendars = [aPublishedCalendar()]; // Spring 2027: Jan 27 – May 11

  it("is always done before UMD", () => {
    expect(termStatus("before", "2020-01-01", calendars)).toBe("done");
  });

  it("follows the published calendar, with 14 days for finals and grades", () => {
    expect(termStatus("202701", "2027-01-26", calendars)).toBe("planned");
    expect(termStatus("202701", "2027-01-27", calendars)).toBe("in-progress");
    expect(termStatus("202701", "2027-05-25", calendars)).toBe("in-progress");
    expect(termStatus("202701", "2027-05-26", calendars)).toBe("done");
  });

  it("falls back to the season's months when the calendar isn't published", () => {
    const none = [anUnpublishedCalendar({ termId: "202608" })];
    expect(termStatus("202608", "2026-08-20", none)).toBe("planned");
    expect(termStatus("202608", "2026-10-01", none)).toBe("in-progress");
    expect(termStatus("202608", "2027-01-02", none)).toBe("done");
    expect(termStatus("202705", "2027-07-01", [])).toBe("in-progress");
  });

  it("runs winter in the January after its id's year", () => {
    expect(termSpan("202612", [])).toEqual({
      start: "2027-01-01",
      end: "2027-01-24",
    });
    expect(termStatus("202612", "2027-01-10", [])).toBe("in-progress");
    expect(termStatus("202612", "2026-12-20", [])).toBe("planned");
  });

  it("remembers answers per term", () => {
    const statusOf = statusResolver("2026-10-01", []);
    expect(statusOf("202608")).toBe("in-progress");
    expect(statusOf("202608")).toBe("in-progress");
    expect(statusOf("202701")).toBe("planned");
    expect(statusOf("202601")).toBe("done");
  });
});
