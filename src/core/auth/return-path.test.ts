import { describe, expect, it } from "vitest";
import {
  DEFAULT_RETURN,
  safeReturnPath,
  signInErrorPath,
  signInStartHref,
  withSignedIn,
} from "./return-path";

describe("safeReturnPath", () => {
  it("keeps same-origin paths with their query and hash", () => {
    expect(safeReturnPath("/settings")).toBe("/settings");
    expect(safeReturnPath("/schedule?plan=abc#x")).toBe("/schedule?plan=abc#x");
  });

  it.each([
    [undefined],
    [null],
    [""],
    ["settings"],
    ["https://evil.example/"],
    ["//evil.example/"],
    ["/\\evil.example"],
    ["/\tevil"],
    ["/api/me"],
    ["/api"],
    ["/avatars/testudo/0123456789abcdef.jpg"],
    ["javascript:alert(1)"],
    [`/${"a".repeat(512)}`],
  ])("falls back for %j", (raw) => {
    expect(safeReturnPath(raw)).toBe(DEFAULT_RETURN);
    expect(safeReturnPath(raw, "/settings")).toBe("/settings");
  });

  it("allows up to 512 characters", () => {
    const long = `/${"a".repeat(511)}`;
    expect(safeReturnPath(long)).toBe(long);
  });

  it("normalizes dot segments rather than leaving the site", () => {
    expect(safeReturnPath("/a/../../settings")).toBe("/settings");
  });
});

describe("sign-in URLs", () => {
  it("sends errors to /signin with where to go back", () => {
    expect(signInErrorPath("personal-account", "/chat?x=1")).toBe(
      "/signin?error=personal-account&return=%2Fchat%3Fx%3D1",
    );
    expect(signInErrorPath("expired", "https://evil.example")).toBe(
      "/signin?error=expired&return=%2Fschedule",
    );
  });

  it("marks a finished sign-in", () => {
    expect(withSignedIn("/settings")).toBe("/settings?signed-in=1");
    expect(withSignedIn("/schedule?plan=abc#top")).toBe(
      "/schedule?plan=abc&signed-in=1#top",
    );
  });

  it("builds the Sign in link", () => {
    expect(signInStartHref("/api/auth/google", "/settings")).toBe(
      "/api/auth/google?return=%2Fsettings",
    );
  });
});
