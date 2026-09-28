import { describe, expect, it } from "vitest";
import { matchInstructors } from "./find";

const index = {
  kruskal: ["Clyde Kruskal", ["CMSC"]],
  canada_jo: ["Jo Canada", ["MATH"]],
  brandt: ["Ada Brandt", ["CMSC"]],
  "karimi-hakkak": ["Ahmad Karimi-Hakkak", ["PERS"]],
  nunez: ["José Núñez", ["SPAN"]],
} as const satisfies Record<string, [string, string[]]>;
const instructors = index as unknown as Parameters<typeof matchInstructors>[0];

describe("matchInstructors", () => {
  it("finds a name by any of its words, names starting with them first", () => {
    expect(matchInstructors(instructors, "ada")).toEqual([
      ["brandt", "Ada Brandt"],
      ["canada_jo", "Jo Canada"],
    ]);
    expect(matchInstructors(instructors, "clyde kru")).toEqual([
      ["kruskal", "Clyde Kruskal"],
    ]);
  });

  it("reads hyphens and accents as a person would type them", () => {
    expect(matchInstructors(instructors, "hakkak")).toEqual([
      ["karimi-hakkak", "Ahmad Karimi-Hakkak"],
    ]);
    expect(matchInstructors(instructors, "nunez")).toEqual([
      ["nunez", "José Núñez"],
    ]);
  });

  it("leaves course codes to the course search", () => {
    expect(matchInstructors(instructors, "cmsc351")).toEqual([]);
    expect(matchInstructors(instructors, "  ")).toEqual([]);
  });
});
