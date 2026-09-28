import { describe, expect, it } from "vitest";
import { documentTitle } from "./document-title";

describe("documentTitle", () => {
  it("names the plan and term on screen", () => {
    expect(documentTitle({ plan: "Plan A", term: "Spring 2027" })).toBe(
      "Plan A · Spring 2027 · Terpsicle",
    );
    expect(documentTitle({ plan: "Shared plan", term: "Fall 2026" })).toBe(
      "Shared plan · Fall 2026 · Terpsicle",
    );
  });

  it("names an open drill-in first, on its own", () => {
    expect(
      documentTitle({ drill: "CMSC351", plan: "Plan A", term: "Spring 2027" }),
    ).toBe("CMSC351 · Terpsicle");
  });

  it("is just the app's name before anything loads", () => {
    expect(documentTitle({})).toBe("Terpsicle");
    expect(documentTitle({ plan: null, term: "Spring 2027" })).toBe(
      "Spring 2027 · Terpsicle",
    );
  });
});
