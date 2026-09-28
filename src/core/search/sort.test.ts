import { describe, expect, it } from "vitest";
import {
  aCourse,
  anInstructor,
  aPlanetTerpDept,
  aSeatTuple,
  aSection,
} from "~/fixtures";
import type { PlanetTerpDept } from "../schema";
import type { SeatsMap } from "../seats/seats";
import {
  bestInstructorRating,
  openSeatTotal,
  ratedDepartments,
  sortCourses,
} from "./sort";

const algorithms = aCourse({
  code: "CMSC351",
  sections: [
    aSection({ code: "0101", instructors: ["Ada Brandt"] }),
    aSection({ code: "0201", instructors: ["Clyde Kruskal"] }),
  ],
});
const compilers = aCourse({
  code: "CMSC430",
  sections: [aSection({ code: "0101", instructors: ["Anwar Mamat"] })],
});
const calculus = aCourse({
  code: "MATH140",
  sections: [aSection({ code: "0101", instructors: ["Grace Kim"] })],
});
const results = [compilers, calculus, algorithms];

const cmsc = aPlanetTerpDept({
  instructors: {
    brandt: anInstructor({ slug: "brandt", rating: 3.1 }),
    kruskal: anInstructor({ slug: "kruskal", rating: 4.6 }),
    mamat: anInstructor({ slug: "mamat", rating: 4.1 }),
  },
  names: {
    "ada brandt": "brandt",
    "clyde kruskal": "kruskal",
    "anwar mamat": "mamat",
  },
});
const loaded: Partial<Record<string, PlanetTerpDept>> = { CMSC: cmsc };
const planetTerp = (dept: string) => loaded[dept];

const seats: SeatsMap = {
  "CMSC351-0101": aSeatTuple({ open: 2 }),
  "CMSC351-0201": aSeatTuple({ open: 0 }),
  "CMSC430-0101": aSeatTuple({ open: 30 }),
  "MATH140-0101": aSeatTuple({ open: 5 }),
};

const codes = (courses: readonly { code: string }[]) =>
  courses.map((c) => c.code);

describe("sortCourses", () => {
  it("keeps relevance as it came", () => {
    expect(
      codes(sortCourses(results, "relevance", { seats, planetTerp })),
    ).toEqual(["CMSC430", "MATH140", "CMSC351"]);
  });

  it("sorts by code", () => {
    expect(codes(sortCourses(results, "code", { seats, planetTerp }))).toEqual([
      "CMSC351",
      "CMSC430",
      "MATH140",
    ]);
  });

  it("sorts by the best instructor's rating, unrated last", () => {
    expect(bestInstructorRating(algorithms, planetTerp)).toBe(4.6);
    expect(bestInstructorRating(calculus, planetTerp)).toBeNull();
    expect(
      codes(sortCourses(results, "rating", { seats, planetTerp })),
    ).toEqual(["CMSC351", "CMSC430", "MATH140"]);
    expect(ratedDepartments(results, planetTerp)).toEqual({
      loaded: 1,
      total: 2,
    });
  });

  it("sorts by open seats, most first", () => {
    expect(openSeatTotal(algorithms, seats)).toBe(2);
    expect(openSeatTotal(algorithms, null)).toBeNull();
    expect(codes(sortCourses(results, "seats", { seats, planetTerp }))).toEqual(
      ["CMSC430", "MATH140", "CMSC351"],
    );
    // No seats file: the order stays.
    expect(
      codes(sortCourses(results, "seats", { seats: null, planetTerp })),
    ).toEqual(["CMSC430", "MATH140", "CMSC351"]);
  });
});
