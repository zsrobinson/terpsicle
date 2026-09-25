import { describe, expect, it } from "vitest";
import { problemCountWords } from "./problems";

describe("problemCountWords", () => {
  it("counts errors and warnings as problems, and info as notes", () => {
    expect(problemCountWords({ error: 1, warning: 1, info: 1 })).toBe(
      "2 problems · 1 note",
    );
    expect(problemCountWords({ error: 0, warning: 1, info: 0 })).toBe(
      "1 problem",
    );
    expect(problemCountWords({ error: 0, warning: 0, info: 2 })).toBe(
      "2 notes",
    );
    expect(problemCountWords({ error: 0, warning: 0, info: 0 })).toBe(
      "No problems",
    );
  });
});
