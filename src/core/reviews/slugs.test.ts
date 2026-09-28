import { describe, expect, it } from "vitest";
import {
  courseFromSlug,
  coursePagePath,
  instructorIdCandidates,
  instructorPagePath,
  instructorSlug,
  isAmbiguousSlug,
  resolveInstructorSlug,
} from "./slugs";

describe("course addresses", () => {
  it("are the code in lowercase", () => {
    expect(coursePagePath("CMSC351")).toBe("/reviews/cmsc351");
    expect(coursePagePath("CMSC398V")).toBe("/reviews/cmsc398v");
  });

  it("are recognized in any case, and nothing else is", () => {
    expect(courseFromSlug("cmsc250")).toBe("CMSC250");
    expect(courseFromSlug("CMSC250")).toBe("CMSC250");
    expect(courseFromSlug("engl101s")).toBe("ENGL101S");
    for (const name of ["kruskal", "goldman-aaron", "cmsc35", "t~abcde23456"])
      expect(courseFromSlug(name), name).toBeNull();
  });
});

describe("instructor addresses", () => {
  it("are PlanetTerp's slug, with its underscore as a hyphen", () => {
    expect(instructorSlug("kruskal")).toBe("kruskal");
    expect(instructorSlug("goldman_aaron")).toBe("goldman-aaron");
    expect(instructorSlug("karimi-hakkak")).toBe("karimi-hakkak");
    expect(instructorPagePath("goldman_aaron")).toBe("/reviews/goldman-aaron");
    expect(instructorPagePath("t~abcde23456")).toBe("/reviews/t~abcde23456");
  });

  it("read back as every id they could be, the address itself first", () => {
    expect(instructorIdCandidates("kruskal")).toEqual(["kruskal"]);
    expect(instructorIdCandidates("goldman-aaron")).toEqual([
      "goldman-aaron",
      "goldman_aaron",
    ]);
    expect(instructorIdCandidates("karimi-hakkak-ahmad")).toEqual([
      "karimi-hakkak-ahmad",
      "karimi_hakkak-ahmad",
      "karimi-hakkak_ahmad",
    ]);
    expect(isAmbiguousSlug("kruskal")).toBe(false);
    expect(isAmbiguousSlug("goldman-aaron")).toBe(true);
  });

  it("resolve to the id that exists", () => {
    const known = new Set(["goldman_aaron", "karimi-hakkak", "zielinski"]);
    const has = (id: string) => known.has(id);
    expect(resolveInstructorSlug("goldman-aaron", has)).toBe("goldman_aaron");
    expect(resolveInstructorSlug("karimi-hakkak", has)).toBe("karimi-hakkak");
    // PlanetTerp's own spelling still finds them (and the page moves).
    expect(resolveInstructorSlug("goldman_aaron", has)).toBe("goldman_aaron");
    expect(resolveInstructorSlug("nobody-here", has)).toBeNull();
  });

  it("round-trip for every slug PlanetTerp makes", () => {
    const ids = ["kruskal", "goldman_aaron", "watkins-butler", "t~abcde23456"];
    const known = new Set(ids);
    for (const id of ids)
      expect(
        resolveInstructorSlug(instructorSlug(id), (x) => known.has(x)),
      ).toBe(id);
  });
});
