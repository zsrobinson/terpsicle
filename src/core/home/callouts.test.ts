import { describe, expect, it } from "vitest";
import { SyncedPrefsSchema } from "../schema";
import {
  type CalloutFacts,
  chooseCallouts,
  DISMISSED_CALLOUTS_MAX,
  dismissedCallouts,
  inRegistrationSeason,
  withCalloutDismissed,
} from "./callouts";

// Home's setup callouts (docs/V3.md §1.5): which products to suggest, in
// what order, and remembering the ones you closed.

/** Nothing set up, signed in, in Fall 2026 with Spring 2027 next. */
const NEW_STUDENT: CalloutFacts = {
  signedIn: true,
  signInOn: true,
  todo: { connected: false },
  chat: { active: false },
  plan: { hasPlan: false },
  nextTerm: { termId: "202701", planned: false },
  now: "202608",
};

const NONE = new Set<string>();
const SEPTEMBER = "2026-09-28";
const OCTOBER = "2026-10-20";

describe("inRegistrationSeason", () => {
  it("is October on for a spring, March to August for a fall", () => {
    expect(inRegistrationSeason("2026-09-30", "202701")).toBe(false);
    expect(inRegistrationSeason("2026-10-01", "202701")).toBe(true);
    expect(inRegistrationSeason("2026-12-20", "202701")).toBe(true);
    expect(inRegistrationSeason("2027-02-15", "202708")).toBe(false);
    expect(inRegistrationSeason("2027-04-01", "202708")).toBe(true);
    expect(inRegistrationSeason("2027-08-20", "202708")).toBe(true);
  });
});

describe("chooseCallouts", () => {
  it("shows two at most, ELMS first in a term, then Chat", () => {
    expect(chooseCallouts(NEW_STUDENT, NONE, SEPTEMBER)).toEqual([
      "todo",
      "chat",
    ]);
  });

  it("puts the next term's plan first in registration season", () => {
    expect(chooseCallouts(NEW_STUDENT, NONE, OCTOBER)).toEqual([
      "next-term",
      "todo",
    ]);
  });

  it("leaves out what you've closed, and the next one moves up", () => {
    expect(
      chooseCallouts(NEW_STUDENT, new Set(["todo", "chat"]), SEPTEMBER),
    ).toEqual(["next-term", "plan"]);
  });

  it("suggests nothing that's set up, or that isn't known yet", () => {
    expect(
      chooseCallouts(
        {
          ...NEW_STUDENT,
          todo: { connected: null },
          chat: { active: true },
          plan: { hasPlan: true },
          nextTerm: { termId: "202701", planned: true },
        },
        NONE,
        SEPTEMBER,
      ),
    ).toEqual([]);
  });

  it("leaves out a product that's off", () => {
    expect(
      chooseCallouts(
        { ...NEW_STUDENT, todo: null, chat: null, plan: null },
        NONE,
        SEPTEMBER,
      ),
    ).toEqual(["next-term"]);
  });

  it("between terms, has no Chat to suggest and ELMS waits behind the plan", () => {
    expect(
      chooseCallouts({ ...NEW_STUDENT, now: null }, NONE, "2026-08-10"),
    ).toEqual(["next-term", "todo"]);
  });

  it("signed out, one sign-in callout stands for Todo and Chat", () => {
    const signedOut: CalloutFacts = {
      ...NEW_STUDENT,
      signedIn: false,
      todo: null,
      chat: null,
    };
    expect(chooseCallouts(signedOut, NONE, SEPTEMBER)).toEqual([
      "sign-in",
      "next-term",
    ]);
    expect(
      chooseCallouts({ ...signedOut, signInOn: false }, NONE, SEPTEMBER),
    ).toEqual(["next-term", "plan"]);
  });
});

describe("dismissed callouts, as a synced pref", () => {
  it("adds and removes one, keeping the rest of the prefs", () => {
    const prefs = { ai: { features: false } };
    const closed = withCalloutDismissed(prefs, "todo", true);
    expect(closed).toEqual({
      ai: { features: false },
      home: { dismissed: ["todo"] },
    });
    expect(dismissedCallouts(closed)).toEqual(new Set(["todo"]));
    expect(withCalloutDismissed(closed, "todo", false)).toEqual({
      ai: { features: false },
      home: { dismissed: [] },
    });
    expect(SyncedPrefsSchema.safeParse(closed).success).toBe(true);
  });

  it("returns the same prefs when nothing changes", () => {
    const prefs = { home: { dismissed: ["plan"] } };
    expect(withCalloutDismissed(prefs, "plan", true)).toBe(prefs);
    expect(withCalloutDismissed(prefs, "todo", false)).toBe(prefs);
    expect(dismissedCallouts({})).toEqual(new Set());
  });

  it("keeps the newest few", () => {
    const prefs = {
      home: {
        dismissed: Array.from(
          { length: DISMISSED_CALLOUTS_MAX },
          (_, i) => `old-${i}`,
        ),
      },
    };
    const next = withCalloutDismissed(prefs, "chat", true);
    expect(next.home?.dismissed).toHaveLength(DISMISSED_CALLOUTS_MAX);
    expect(next.home?.dismissed.at(-1)).toBe("chat");
    expect(SyncedPrefsSchema.safeParse(next).success).toBe(true);
  });
});
