import { describe, expect, it } from "vitest";
import { hasSessionCookie, shouldSkipMarketing, wantsToStay } from "./routing";

describe("hasSessionCookie", () => {
  it("finds the session cookie among others", () => {
    expect(hasSessionCookie("theme=dark; __Host-session=abc123")).toBe(true);
    expect(hasSessionCookie("__Host-session=abc")).toBe(true);
  });

  it("ignores missing, empty and look-alike cookies", () => {
    expect(hasSessionCookie(null)).toBe(false);
    expect(hasSessionCookie("")).toBe(false);
    expect(hasSessionCookie("__Host-session=")).toBe(false);
    expect(hasSessionCookie("__Host-session")).toBe(false);
    expect(hasSessionCookie("session=abc; __Host-sessions=1")).toBe(false);
  });
});

describe("wantsToStay", () => {
  it("reads ?stay with or without a value", () => {
    expect(wantsToStay("?stay")).toBe(true);
    expect(wantsToStay("?utm_source=x&stay=1")).toBe(true);
    expect(wantsToStay("")).toBe(false);
    expect(wantsToStay("?stayed=1")).toBe(false);
  });
});

describe("shouldSkipMarketing", () => {
  const nobody = { hasSessionCookie: false, returningFlag: false };

  it("shows the marketing page to a first visit", () => {
    expect(shouldSkipMarketing({ ...nobody, planCount: null })).toBe(false);
    expect(shouldSkipMarketing({ ...nobody, planCount: 0 })).toBe(false);
  });

  it("skips it for a session, the returning flag, or any saved plan", () => {
    expect(
      shouldSkipMarketing({ ...nobody, hasSessionCookie: true, planCount: 0 }),
    ).toBe(true);
    expect(
      shouldSkipMarketing({ ...nobody, returningFlag: true, planCount: null }),
    ).toBe(true);
    expect(shouldSkipMarketing({ ...nobody, planCount: 1 })).toBe(true);
  });
});
