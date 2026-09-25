import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildCourseGrades, summarizeGrades } from "./planetterp";

const read = (path: string) =>
  JSON.parse(
    readFileSync(
      new URL(`./__fixtures__/planetterp/${path}`, import.meta.url),
      "utf8",
    ),
  );

describe("PlanetTerp grades", () => {
  const rows = read("grades-CMSC351.json");
  const byProfessor = summarizeGrades(rows);

  it("sums each professor's sections and semesters, keeping +/−, W and Other", () => {
    const kruskal = byProfessor["Clyde Kruskal"];
    const expected = Array.from({ length: 15 }, () => 0);
    const keys = [
      "A+",
      "A",
      "A-",
      "B+",
      "B",
      "B-",
      "C+",
      "C",
      "C-",
      "D+",
      "D",
      "D-",
      "F",
      "W",
      "Other",
    ];
    for (const row of rows.filter(
      (r: { professor: string }) => r.professor === "Clyde Kruskal",
    )) {
      keys.forEach((k, i) => {
        expected[i] = (expected[i] ?? 0) + row[k];
      });
    }
    expect(kruskal?.counts).toEqual(expected);
    expect(kruskal?.semesters).toContain("202501");
  });

  it("builds the course record: all instructors, plus each joined slug", () => {
    const record = buildCourseGrades(byProfessor, "CMSC351", (name) =>
      name === "Clyde Kruskal" ? "kruskal" : null,
    );
    expect(record?.all?.latestTermId).toBe("202501");
    expect(record?.all?.semesters).toBe(27);
    expect(Object.keys(record?.byInstructor ?? {})).toEqual(["kruskal"]);
    const total = (record?.all?.counts ?? []).reduce((a, b) => a + b, 0);
    const rowsTotal = rows.reduce(
      (n: number, r: Record<string, number>) =>
        n +
        [
          "A+",
          "A",
          "A-",
          "B+",
          "B",
          "B-",
          "C+",
          "C",
          "C-",
          "D+",
          "D",
          "D-",
          "F",
          "W",
          "Other",
        ].reduce((m, k) => m + (r[k] ?? 0), 0),
      0,
    );
    expect(total).toBe(rowsTotal);
  });

  it("returns null when PlanetTerp has no grades", () => {
    expect(buildCourseGrades({}, "CMSC999", () => null)).toBeNull();
  });
});
