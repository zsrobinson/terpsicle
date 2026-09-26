import { describe, expect, it } from "vitest";
import {
  isUnderRoute,
  NO_AUTOCAPTURE_ROUTES,
  noAutocaptureUrlPatterns,
} from "./routes";

describe("isUnderRoute", () => {
  it("covers the route and what's below it, on segment boundaries", () => {
    expect(isUnderRoute("/plan", "/plan")).toBe(true);
    expect(isUnderRoute("/plan/", "/plan")).toBe(true);
    expect(isUnderRoute("/plan/x", "/plan")).toBe(true);
    expect(isUnderRoute("/Plan/X", "/plan")).toBe(true);
    expect(isUnderRoute("/planner", "/plan")).toBe(false);
    expect(isUnderRoute("/reviews", "/reviews/mine")).toBe(false);
  });
});

describe("noAutocaptureUrlPatterns", () => {
  const matches = (url: string) =>
    noAutocaptureUrlPatterns().some((pattern) => pattern.test(url));

  it("has one pattern per route", () => {
    expect(noAutocaptureUrlPatterns()).toHaveLength(
      NO_AUTOCAPTURE_ROUTES.length,
    );
  });

  it.each([
    "https://terpsicle.com/chat",
    "https://terpsicle.com/chat/202608/CMSC131/s-0101",
    "https://terpsicle.com/settings?x=1",
    "https://terpsicle.com/settings/notifications",
    "https://terpsicle.com/admin",
    "https://terpsicle.com/reviews/mine#top",
    "https://terpsicle.com/plan",
    "https://terpsicle.com/todo/connect",
    "https://terpsicle.com/signin?error=cancelled",
    "https://terpsicle.com/auth/test",
    "http://localhost:3000/plan",
  ])("matches %s", (url) => {
    expect(matches(url)).toBe(true);
  });

  it.each([
    "https://terpsicle.com/",
    "https://terpsicle.com/schedule",
    "https://terpsicle.com/schedule?from=chat",
    "https://terpsicle.com/reviews",
    "https://terpsicle.com/reviews/courses/CMSC131",
    "https://terpsicle.com/planner",
    "https://terpsicle.com/chatter",
  ])("leaves %s alone", (url) => {
    expect(matches(url)).toBe(false);
  });
});
