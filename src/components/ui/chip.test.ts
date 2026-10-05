import { describe, expect, it } from "vitest";
import { CHIP_ROWS, CHIP_SELECTED, CHIP_TOUCH, chipClass } from "./chip";

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

  it("is 44px to hit under a finger: 32px to see, 6px of margin each side", () => {
    // The owner, 2026-10-05, on 44px chips on phones: "do whatever makes
    // sense". A mouse keeps the 24px chip.
    const classes = chipClass(false).split(" ");
    for (const c of CHIP_TOUCH.split(" ")) expect(classes).toContain(c);
    expect(classes).toContain("pointer-coarse:h-8");
    expect(classes).toContain("pointer-coarse:after:-inset-y-1.5");
    expect(classes).toContain("relative");
    // Lines of chips leave room for both margins: 12px apart.
    expect(CHIP_ROWS.split(" ")).toContain("pointer-coarse:gap-y-3");
  });
});
