import { describe, expect, it } from "vitest";
import { PEEK_HEIGHT, snapHeights, TOP_BAR_HEIGHT } from "./drawer-heights";

describe("snapHeights", () => {
  it("rests at the strip, half the screen, or all of it under the top bar", () => {
    expect(snapHeights(844)).toEqual({
      peek: PEEK_HEIGHT,
      half: 422,
      full: 844 - TOP_BAR_HEIGHT,
    });
  });

  it("keeps clear of the status bar at full and the home indicator at peek", () => {
    // An iPhone 15's insets: the family bar grows by the top one, and half
    // is still the screen's middle.
    expect(snapHeights(844, { top: 47, bottom: 34 })).toEqual({
      peek: PEEK_HEIGHT + 34,
      half: 422,
      full: 844 - TOP_BAR_HEIGHT - 47,
    });
  });

  it("opens half all the way on a short screen", () => {
    expect(snapHeights(400).half).toBe(snapHeights(400).full);
  });
});
