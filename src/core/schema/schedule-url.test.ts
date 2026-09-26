import { describe, expect, it } from "vitest";
import { ScheduleSearchSchema } from "./schedule-url";

const parse = (search: Record<string, unknown>) =>
  ScheduleSearchSchema.parse(search);

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
