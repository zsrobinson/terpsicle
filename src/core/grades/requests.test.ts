import { describe, expect, it } from "vitest";
import {
  GRADE_REPORT_COLUMNS,
  gradeRequestText,
  semestersMissingGrades,
} from "./requests";

describe("semestersMissingGrades", () => {
  it("lists the finished falls and springs after PlanetTerp's last", () => {
    expect(semestersMissingGrades("202501", "2026-09-28")).toEqual([
      "202508",
      "202601",
    ]);
  });

  it("waits for a semester to end", () => {
    expect(semestersMissingGrades("202508", "2026-05-20")).toEqual([]);
    expect(semestersMissingGrades("202508", "2026-06-01")).toEqual(["202601"]);
  });

  it("asks for the last two when nothing's imported", () => {
    expect(semestersMissingGrades(null, "2026-09-28")).toEqual([
      "202508",
      "202601",
    ]);
  });
});

describe("gradeRequestText", () => {
  it("names the semesters and every grade column, and no student", () => {
    const { subject, body } = gradeRequestText(["202508", "202601"]);
    expect(subject).toBe(
      "Public Information Act request: grade distributions, Fall 2025 and Spring 2026",
    );
    expect(body).toContain("for Fall 2025 and Spring 2026.");
    for (const grade of GRADE_REPORT_COLUMNS.slice(4))
      expect(body).toContain(grade);
    expect(body).toContain("not asking for any student's name");
  });
});
