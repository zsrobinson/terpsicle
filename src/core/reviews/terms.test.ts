import { describe, expect, it } from "vitest";
import { hasTermStarted, reviewTermChoices } from "./terms";

describe("reviewTermChoices", () => {
  it("starts at the term under way and goes back, newest first", () => {
    // A Sunday in Fall 2026: Spring 2027 is listed but hasn't started.
    expect(reviewTermChoices("2026-09-27", 6)).toEqual([
      "202608",
      "202605",
      "202601",
      "202512",
      "202508",
      "202505",
    ]);
  });

  it("counts winter as the January it runs in", () => {
    expect(reviewTermChoices("2027-01-10", 3)).toEqual([
      "202612",
      "202608",
      "202605",
    ]);
  });

  it("offers four years of terms by default, never a future one", () => {
    const choices = reviewTermChoices("2026-09-27");
    expect(choices).toHaveLength(16);
    expect(choices.every((id) => hasTermStarted(id, "2026-09-27"))).toBe(true);
    expect(new Set(choices).size).toBe(choices.length);
  });
});

describe("hasTermStarted", () => {
  it("is true from a term's first usual day", () => {
    expect(hasTermStarted("202608", "2026-08-21")).toBe(true);
    expect(hasTermStarted("202608", "2026-08-20")).toBe(false);
    expect(hasTermStarted("202701", "2026-09-27")).toBe(false);
    expect(hasTermStarted("202508", "2026-09-27")).toBe(true);
  });
});
