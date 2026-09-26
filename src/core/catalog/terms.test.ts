import { describe, expect, it } from "vitest";
import { aTerm } from "~/fixtures";
import type { Term } from "../schema";
import { pickTerm, termIdFromLabel, termLabel } from "./terms";

const term = (id: string, season: Term["season"], status: Term["status"]) =>
  aTerm({ id, name: id, season, year: Number(id.slice(0, 4)), status });

// Newest first, as terms.json lists them.
const TERMS = [
  term("202705", "summer", "active"),
  term("202701", "spring", "active"),
  term("202612", "winter", "active"),
  term("202608", "fall", "active"),
  term("202601", "spring", "archived"),
];

describe("pickTerm", () => {
  it("defaults to the newest active fall or spring", () => {
    expect(pickTerm(TERMS, null)?.id).toBe("202701");
  });

  it("remembers the person's last term, archived or not", () => {
    expect(pickTerm(TERMS, "202601")?.id).toBe("202601");
  });

  it("falls back to the default when the remembered term is gone", () => {
    expect(pickTerm(TERMS, "202001")?.id).toBe("202701");
  });

  it("uses any active term, then any term, when there's no fall or spring", () => {
    expect(
      pickTerm(
        [
          term("202705", "summer", "active"),
          term("202601", "spring", "archived"),
        ],
        null,
      )?.id,
    ).toBe("202705");
    expect(pickTerm([term("202601", "spring", "archived")], null)?.id).toBe(
      "202601",
    );
    expect(pickTerm([], null)).toBeUndefined();
  });
});

describe("termIdFromLabel", () => {
  it("reads Testudo's names, winter named for the next year", () => {
    expect(termIdFromLabel("Fall 2025")).toBe("202508");
    expect(termIdFromLabel("Spring 2026")).toBe("202601");
    expect(termIdFromLabel("Summer 2026")).toBe("202605");
    expect(termIdFromLabel("Winter 2027")).toBe("202612");
  });

  it("ignores case and surrounding space", () => {
    expect(termIdFromLabel("  FALL   2025 ")).toBe("202508");
  });

  it("undoes termLabel", () => {
    for (const id of ["202508", "202601", "202605", "202612"])
      expect(termIdFromLabel(termLabel(id))).toBe(id);
  });

  it("is null for anything else", () => {
    expect(termIdFromLabel("Autumn 2025")).toBeNull();
    expect(termIdFromLabel("Fall 25")).toBeNull();
    expect(termIdFromLabel("Fall 2025 grades")).toBeNull();
    expect(termIdFromLabel("Winter 0999")).toBeNull();
  });
});
