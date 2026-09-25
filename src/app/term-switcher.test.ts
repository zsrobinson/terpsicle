import { describe, expect, it } from "vitest";
import { shortTermName } from "./term-switcher";

describe("shortTermName", () => {
  it("shortens the year for the smallest phones", () => {
    expect(shortTermName("Spring 2027")).toBe("Spring ’27");
    expect(shortTermName("Fall 2026")).toBe("Fall ’26");
  });

  it("leaves names without a trailing year alone", () => {
    expect(shortTermName("Winter term")).toBe("Winter term");
  });
});
