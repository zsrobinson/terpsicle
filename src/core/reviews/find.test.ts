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

  it("puts the most reviewed first, by first name, last name or part of either", () => {
    // PlanetTerp's Justins, with their review counts (2026-09-29).
    const justins = {
      "abbott-justin": ["Justin Abbott", ["ENGL"], 3],
      "wyss-gallifent": ["Justin Wyss-Gallifent", ["MATH"], 348],
      justin_olav: ["Olav Justinsen", ["PHYS"], 40],
      mcjustin: ["Pat McJustin", ["HIST"], 90],
      zhang_justin: ["Justin Zhang", ["CMSC"], 12],
    } as const satisfies Record<string, [string, string[], number]>;
    const all = justins as unknown as Parameters<typeof matchInstructors>[0];
    expect(matchInstructors(all, "justin").map(([slug]) => slug)).toEqual([
      "wyss-gallifent",
      "justin_olav",
      "zhang_justin",
      "abbott-justin",
      // Only inside a name part: after every name that starts with it.
      "mcjustin",
    ]);
    expect(matchInstructors(all, "wyss")[0]?.[0]).toBe("wyss-gallifent");
    expect(matchInstructors(all, "gallif")[0]?.[0]).toBe("wyss-gallifent");
    expect(matchInstructors(all, "justin wys")[0]?.[0]).toBe("wyss-gallifent");
  });

  it("ranks an older index's instructors by the counts it's given", () => {
    const older = {
      "abbott-justin": ["Justin Abbott", ["ENGL"]],
      "wyss-gallifent": ["Justin Wyss-Gallifent", ["MATH"]],
    } as const satisfies Record<string, [string, string[]]>;
    const all = older as unknown as Parameters<typeof matchInstructors>[0];
    expect(
      matchInstructors(all, "justin", new Map([["wyss-gallifent", 348]])).map(
        ([slug]) => slug,
      ),
    ).toEqual(["wyss-gallifent", "abbott-justin"]);
  });

  it("leaves course codes to the course search", () => {
    expect(matchInstructors(instructors, "cmsc351")).toEqual([]);
    expect(matchInstructors(instructors, "  ")).toEqual([]);
  });
});
