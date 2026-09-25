import { describe, expect, it } from "vitest";
import { median, medianMs } from "./timing";

describe("timing", () => {
  it("takes the middle value", () => {
    expect(median([5, 1, 3])).toBe(3);
    expect(median([4, 1, 3, 2])).toBe(3);
    expect(median([])).toBeNaN();
  });

  it("runs the warm-ups and the measured runs", () => {
    let calls = 0;
    const ms = medianMs(
      () => {
        calls++;
      },
      { runs: 5, warmups: 2 },
    );
    expect(calls).toBe(7);
    expect(ms).toBeGreaterThanOrEqual(0);
  });
});
