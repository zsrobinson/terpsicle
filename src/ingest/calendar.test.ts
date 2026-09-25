import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CalendarFormatError, parseCalendar, termCalendar } from "./calendar";

const read = (path: string) =>
  readFileSync(new URL(`./__fixtures__/provost/${path}`, import.meta.url), "utf8");

describe("provost calendar", () => {
  const current = parseCalendar(read("calendar.md"));
  const archived = parseCalendar(read("calendar-archived.html"));

  it("finds every season of the three published years", () => {
    expect([...current.keys()].sort()).toEqual([
      "2026:fall",
      "2026:spring",
      "2026:summer",
      "2026:winter",
      "2027:fall",
      "2027:spring",
      "2027:summer",
      "2027:winter",
      "2028:fall",
      "2028:spring",
      "2028:summer",
      "2028:winter",
    ]);
  });

  it("builds fall with its breaks", () => {
    expect(termCalendar(current, "202608")).toEqual({
      classesStart: "2026-08-31",
      classesEnd: "2026-12-11",
      noClasses: [
        { name: "Labor Day", start: "2026-09-07", end: "2026-09-07" },
        { name: "Fall Break", start: "2026-10-12", end: "2026-10-13" },
        { name: "Thanksgiving Recess", start: "2026-11-25", end: "2026-11-29" },
      ],
    });
  });

  it("puts winter and spring dates in the next calendar year", () => {
    expect(termCalendar(current, "202612")).toEqual({
      classesStart: "2027-01-04",
      classesEnd: "2027-01-22",
      noClasses: [
        { name: "Dr. Martin Luther King Holiday", start: "2027-01-18", end: "2027-01-18" },
      ],
    });
    expect(termCalendar(current, "202701")).toEqual({
      classesStart: "2027-01-27",
      classesEnd: "2027-05-11",
      noClasses: [{ name: "Spring Break", start: "2027-03-14", end: "2027-03-21" }],
    });
  });

  it("spans both summer sessions", () => {
    const summer = termCalendar(current, "202705");
    expect(summer?.classesStart).toBe("2027-06-01");
    expect(summer?.classesEnd).toBe("2027-08-20");
    expect(summer?.noClasses.map((n) => n.name)).toEqual([
      "Juneteenth Holiday",
      "Independence Day Holiday",
    ]);
  });

  it("reads older years from the archived page, including a break across New Year", () => {
    expect(termCalendar(archived, "202605")?.classesStart).toBe("2026-06-01");
    const events = archived.get("2025:winter") ?? [];
    expect(events).toContainEqual({
      name: "Winter Break",
      start: "2025-12-25",
      end: "2026-01-01",
    });
  });

  it("returns null for unpublished terms", () => {
    expect(termCalendar(current, "203008")).toBeNull();
  });

  it("rejects dates whose weekday disagrees with the inferred year", () => {
    const bad =
      "Fall 2026 - Summer 2027 Events for the Fall Season Fall Date Event First Day of Classes Date August 31st (Tuesday)";
    expect(() => parseCalendar(bad)).toThrow(CalendarFormatError);
  });
});
