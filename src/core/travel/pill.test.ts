import { describe, expect, it } from "vitest";
import { aConnection } from "~/fixtures";
import { PILL_MAX_GAP, shouldShowPill } from "./pill";

describe("shouldShowPill", () => {
  it("shows back-to-back classes, whatever the verdict", () => {
    for (const verdict of [
      "ok",
      "tight",
      "insufficient",
      "unknown",
      "no-route",
    ] as const)
      expect(shouldShowPill(aConnection({ gapMinutes: 10, verdict }))).toBe(
        true,
      );
  });

  it("counts a gap of exactly 30 minutes as back-to-back", () => {
    expect(
      shouldShowPill(aConnection({ gapMinutes: PILL_MAX_GAP, verdict: "ok" })),
    ).toBe(true);
    expect(
      shouldShowPill(
        aConnection({ gapMinutes: PILL_MAX_GAP + 1, verdict: "ok" }),
      ),
    ).toBe(false);
  });

  it("hides a long gap that's fine: CMSC351 and STAT400 three hours apart", () => {
    expect(
      shouldShowPill(aConnection({ gapMinutes: 180, verdict: "ok" })),
    ).toBe(false);
    // Nothing to say without routes, either.
    expect(
      shouldShowPill(aConnection({ gapMinutes: 180, verdict: "unknown" })),
    ).toBe(false);
    expect(
      shouldShowPill(aConnection({ gapMinutes: 180, verdict: "no-route" })),
    ).toBe(false);
  });

  it("shows a long gap that still isn't enough (a slow pace, extra time)", () => {
    expect(
      shouldShowPill(aConnection({ gapMinutes: 45, verdict: "tight" })),
    ).toBe(true);
    expect(
      shouldShowPill(aConnection({ gapMinutes: 45, verdict: "insufficient" })),
    ).toBe(true);
  });
});
