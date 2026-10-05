import { describe, expect, it } from "vitest";
import { planetTerpTwin } from "./planetterp-twin";

const KNOWN = new Set(["kruskal", "goldman_aaron", "ashdown_keiko"]);
const known = (id: string) => KNOWN.has(id);
const twin = (
  path: string,
  query = "",
  index: ((id: string) => boolean) | null = known,
) => planetTerpTwin(path, new URLSearchParams(query), index);

describe("planetTerpTwin", () => {
  it("sends /reviews to PlanetTerp's front page", () => {
    expect(twin("/reviews")).toBe("https://planetterp.com");
    expect(twin("/reviews/")).toBe("https://planetterp.com");
    expect(twin("/reviews", "q=CMSC")).toBe("https://planetterp.com");
    expect(twin("/reviews/policy")).toBe("https://planetterp.com");
  });

  it("sends a course's page to its course on PlanetTerp", () => {
    expect(twin("/reviews/cmsc351")).toBe(
      "https://planetterp.com/course/CMSC351",
    );
    expect(twin("/reviews/CMSC351")).toBe(
      "https://planetterp.com/course/CMSC351",
    );
    expect(twin("/reviews/courses/CMSC351")).toBe(
      "https://planetterp.com/course/CMSC351",
    );
  });

  it("sends an instructor's page to theirs, reading a hyphen as PlanetTerp's underscore", () => {
    expect(twin("/reviews/kruskal")).toBe(
      "https://planetterp.com/professor/kruskal",
    );
    expect(twin("/reviews/goldman-aaron", "course=CMSC351")).toBe(
      "https://planetterp.com/professor/goldman_aaron",
    );
    expect(twin("/reviews/Kruskal")).toBe(
      "https://planetterp.com/professor/kruskal",
    );
    expect(twin("/reviews/instructors/goldman_aaron")).toBe(
      "https://planetterp.com/professor/goldman_aaron",
    );
  });

  it("sends someone PlanetTerp doesn't know to the course they were opened from", () => {
    expect(twin("/reviews/jo-early", "course=CMSC351")).toBe(
      "https://planetterp.com/course/CMSC351",
    );
    expect(twin("/reviews/jo-early")).toBe("https://planetterp.com");
  });

  it("takes an address's likeliest reading when the index can't be read", () => {
    expect(twin("/reviews/kruskal", "", null)).toBe(
      "https://planetterp.com/professor/kruskal",
    );
  });

  it("keeps /reviews/mine and every other page ours", () => {
    expect(twin("/reviews/mine")).toBeNull();
    expect(twin("/reviews/mine/")).toBeNull();
    expect(twin("/schedule")).toBeNull();
    expect(twin("/reviewsx")).toBeNull();
    expect(twin("/")).toBeNull();
  });

  it("sends anything else under /reviews to the front page", () => {
    expect(twin("/reviews/a/b/c")).toBe("https://planetterp.com");
    expect(twin("/reviews/%E0%A4%A")).toBe("https://planetterp.com");
  });
});
