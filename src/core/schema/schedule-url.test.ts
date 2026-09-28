import { describe, expect, it } from "vitest";
import {
  DrillSearchSchema,
  LegacyScheduleSearchSchema,
  ResultIdSchema,
  ScheduleSearchSchema,
  SearchTabSearchSchema,
} from "./schedule-url";

const parse = (search: Record<string, unknown>) =>
  LegacyScheduleSearchSchema.parse(search);

describe("the scheduler's search params", () => {
  it("reads a deep link, taking back numbers the router parsed", () => {
    expect(parse({ term: 202701, course: "cmsc351" })).toEqual({
      term: "202701",
      course: "CMSC351",
    });
  });

  it("reads every place and Search's filters", () => {
    expect(
      parse({
        term: "202701",
        planId: "plan-a-0001",
        tab: "search",
        q: 351,
        gened: "DSHU,DSNL",
        credits: "3,4",
        level: 300,
        openSeats: 1,
        fits: true,
        demo: 1,
        plan: "abc",
      }),
    ).toEqual({
      term: "202701",
      planId: "plan-a-0001",
      tab: "search",
      q: "351",
      gened: "DSHU,DSNL",
      credits: "3,4",
      level: "300",
      openSeats: 1,
      fits: 1,
      demo: 1,
      plan: "abc",
    });
  });

  it("drops a bad value and keeps the rest of the link", () => {
    expect(
      parse({
        term: "spring",
        tab: "calendar",
        course: "<b>",
        gened: "DSHU,nope",
        level: "350",
        credits: 9,
        openSeats: 0,
        view: "form",
        planId: "short",
        connection: "M:ESJ>IRB",
      }),
    ).toEqual({ connection: "M:ESJ>IRB" });
  });
});

describe("each route's own params", () => {
  it("keeps only what that route reads", () => {
    const search = { term: "202701", tab: "search", q: "cmsc", course: "X" };
    expect(ScheduleSearchSchema.parse(search)).toEqual({ term: "202701" });
    expect(SearchTabSearchSchema.parse(search)).toEqual({ q: "cmsc" });
    expect(DrillSearchSchema.parse(search)).toEqual({ tab: "search" });
    expect(DrillSearchSchema.parse({ tab: "calendar" })).toEqual({});
  });
});

describe("a generated plan's id", () => {
  // Its sorted section keys, joined: six courses were already past the old
  // 64-character cap, so their details never opened (QA3b).
  const idOf = (n: number, code = "CMSC351H") =>
    Array.from({ length: n }, (_, i) => `${code}-${String(i).padStart(4, "0")}`)
      .sort()
      .join(",");

  it("fits a full week's plan", () => {
    expect(ResultIdSchema.safeParse(idOf(6, "CMSC351")).success).toBe(true);
  });

  it("fits the most sections a plan can hold", () => {
    expect(ResultIdSchema.safeParse(idOf(40)).success).toBe(true);
    expect(ResultIdSchema.safeParse("").success).toBe(false);
  });
});
