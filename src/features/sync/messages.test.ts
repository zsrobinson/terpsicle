import { describe, expect, it } from "vitest";
import type { SyncNotice } from "./engine";
import { syncToast } from "./messages";

const firstSignIn = (
  over: Partial<Extract<SyncNotice, { kind: "first-sign-in" }>> = {},
): SyncNotice => ({
  kind: "first-sign-in",
  reset: false,
  uploaded: 0,
  fromAccount: 0,
  renamed: [],
  copies: [],
  ...over,
});

describe("syncToast", () => {
  it("says what the first sign-in did, in plain words", () => {
    expect(syncToast(firstSignIn({ uploaded: 2 }))).toEqual({
      title: "Your 2 plans are saved to your account",
    });
    expect(syncToast(firstSignIn({ uploaded: 1, fromAccount: 3 }))).toEqual({
      title: "Your plan is saved to your account",
      description: "Your account's 3 other plans are here too.",
    });
    expect(syncToast(firstSignIn({ fromAccount: 1 }))).toEqual({
      title: "Your plan from your account is here",
    });
    expect(syncToast(firstSignIn({ uploaded: 3, fromAccount: 1 }))).toEqual({
      title: "Your 3 plans are saved to your account",
      description: "Your account's other plan is here too.",
    });
    expect(
      syncToast(
        firstSignIn({
          uploaded: 1,
          renamed: [{ from: "Plan A", to: "Plan A (copy)" }],
        }),
      ),
    ).toEqual({
      title: "Your plan is saved to your account",
      description:
        "Plan A was kept as Plan A (copy). Your account already had one by that name.",
    });
    expect(
      syncToast(
        firstSignIn({
          uploaded: 0,
          fromAccount: 1,
          copies: [
            { from: "Plan A", to: "Plan A (copy)" },
            { from: "Plan B", to: "Plan B (copy)" },
          ],
        }),
      )?.description,
    ).toBe(
      "Plan A was kept as Plan A (copy) (and 1 more plan the same way). Your account had a different version, and you have both now.",
    );
  });

  it("stays quiet when there's nothing to say", () => {
    expect(syncToast(firstSignIn())).toBeNull();
    expect(syncToast(firstSignIn({ reset: true, uploaded: 2 }))).toBeNull();
  });

  it("names both versions after a conflict", () => {
    expect(
      syncToast({ kind: "conflict-copy", from: "Plan A", to: "Plan A (copy)" }),
    ).toEqual({
      title: "Your changes are kept as Plan A (copy)",
      description:
        "Plan A changed on another device too, so you have both versions.",
    });
  });

  it("says when the account is full", () => {
    expect(syncToast({ kind: "too-many-plans" })?.title).toBe(
      "Your account is full",
    );
  });
});
