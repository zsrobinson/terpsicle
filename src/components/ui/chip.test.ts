import { describe, expect, it } from "vitest";
import { CHIP_SELECTED, chipClass } from "./chip";

// One chip, one selected look: the kit's soft gray, never the inverted fill.

describe("chipClass", () => {
  it("is the soft gray when selected", () => {
    const on = chipClass(true).split(" ");
    expect(on).toContain("bg-accent-soft");
    expect(on).toContain("text-fg");
    expect(on).not.toContain("bg-fg");
    expect(on).not.toContain("bg-accent");
    for (const c of CHIP_SELECTED.split(" ")) expect(on).toContain(c);
  });

  it("is square-cornered and the same size either way", () => {
    for (const selected of [true, false]) {
      const classes = chipClass(selected).split(" ");
      expect(classes).toContain("rounded-md");
      expect(classes).toContain("h-6");
      expect(classes).not.toContain("rounded-full");
    }
    expect(chipClass(false).split(" ")).not.toContain("bg-accent-soft");
  });
});
