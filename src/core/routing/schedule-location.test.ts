import { describe, expect, it } from "vitest";
import { LegacyScheduleSearchSchema } from "~/core/schema/schedule-url";
import {
  CONNECTION_PATH,
  COURSE_PATH,
  canonicalScheduleLocation,
  compactSearch,
  RESULT_PATH,
} from "./schedule-location";

const canonical = (search: Record<string, unknown>) =>
  canonicalScheduleLocation(LegacyScheduleSearchSchema.parse(search));

describe("canonicalScheduleLocation", () => {
  it("sends a seat-alert email's course link to course details over Courses", () => {
    expect(canonical({ term: 202701, course: "cmsc216" })).toEqual({
      to: COURSE_PATH,
      params: { code: "CMSC216" },
      search: { term: "202701", tab: "courses" },
    });
  });

  it("keeps the tab a drill-in was open over", () => {
    expect(
      canonical({
        tab: "travel",
        connection: "M:ESJ>IRB",
        planId: "plan-a-0001",
      }),
    ).toEqual({
      to: CONNECTION_PATH,
      params: { connectionId: "M:ESJ>IRB" },
      search: { planId: "plan-a-0001", tab: "travel" },
    });
    expect(
      canonical({ tab: "generate", result: "r3", view: "results" }),
    ).toEqual({
      to: RESULT_PATH,
      params: { resultId: "r3" },
      search: { tab: "generate" },
    });
    // A generated plan is only ever over Generate.
    expect(canonical({ result: "r3" })).toMatchObject({
      search: { tab: "generate" },
    });
  });

  it("sends a tab to its route with the params only it reads", () => {
    expect(
      canonical({ tab: "search", q: "cmsc", openSeats: 1, view: "results" }),
    ).toEqual({
      to: "/schedule/search",
      search: { q: "cmsc", openSeats: 1 },
    });
    expect(
      canonical({ tab: "generate", view: "results", q: "x", demo: 1 }),
    ).toEqual({
      to: "/schedule/generate",
      search: { demo: 1, view: "results" },
    });
  });

  it("leaves a URL that names no view alone (a share link, plain /schedule)", () => {
    expect(canonical({})).toBeNull();
    expect(canonical({ plan: "abc", term: "202701" })).toBeNull();
    // A bad tab is dropped, and so names nothing.
    expect(canonical({ tab: "calendar" })).toBeNull();
  });
});

describe("compactSearch", () => {
  it("leaves out empty params", () => {
    expect(compactSearch({ q: "", tab: "search", term: undefined })).toEqual({
      tab: "search",
    });
  });
});
