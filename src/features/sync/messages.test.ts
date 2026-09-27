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
  fourYear: { uploaded: 0, fromAccount: 0 },
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

  it("counts plans and four-year plans together", () => {
    const both = (plans: number, fourYear: number) =>
      firstSignIn({
        uploaded: plans,
        fourYear: { uploaded: fourYear, fromAccount: 0 },
      });
    expect(syncToast(both(3, 1))?.title).toBe(
      "Your 3 plans and your four-year plan are saved to your account",
    );
    expect(syncToast(both(1, 2))?.title).toBe(
      "Your plan and your 2 four-year plans are saved to your account",
    );
    expect(syncToast(both(0, 1))?.title).toBe(
      "Your four-year plan is saved to your account",
    );
    expect(
      syncToast(
        firstSignIn({
          uploaded: 1,
          fromAccount: 2,
          fourYear: { uploaded: 0, fromAccount: 1 },
        }),
      )?.description,
    ).toBe("Your account's 2 other plans and its four-year plan are here too.");
    expect(
      syncToast(firstSignIn({ fourYear: { uploaded: 0, fromAccount: 1 } })),
    ).toEqual({ title: "Your four-year plan from your account is here" });
    expect(
      syncToast(
        firstSignIn({
          fourYear: { uploaded: 1, fromAccount: 0 },
          renamed: [{ from: "My plan", to: "My plan (copy)" }],
        }),
      ),
    ).toEqual({
      title: "Your four-year plan is saved to your account",
      description:
        "My plan was kept as My plan (copy). Your account already had one by that name.",
    });
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
    expect(syncToast({ kind: "too-many-plans", doc: "plan" })?.title).toBe(
      "Your account is full",
    );
    expect(syncToast({ kind: "too-many-plans", doc: "four-year" })).toEqual({
      title: "You have 20 four-year plans",
      description:
        "Delete one to make another. Until then, new ones stay on this device.",
    });
  });
});
