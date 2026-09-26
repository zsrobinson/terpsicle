import { describe, expect, it } from "vitest";
import { changedParams, historyMode, urlSearch } from "./history";

const at = { term: "202701", tab: "courses" } as const;

describe("historyMode", () => {
  it("pushes a place someone went to", () => {
    expect(historyMode(at, { ...at, course: "CMSC351" }, true)).toBe("push");
    expect(historyMode(at, { ...at, tab: "search" }, true)).toBe("push");
    expect(historyMode(at, { ...at, planId: "plan-b-0001" }, true)).toBe(
      "push",
    );
  });

  it("never pushes the same URL twice", () => {
    expect(historyMode(at, { ...at }, true)).toBe("none");
    // Empty text and empty lists are the same as none.
    expect(historyMode(at, { ...at, q: "", gened: "" }, true)).toBe("none");
  });

  it("replaces for typing, even when someone is navigating", () => {
    const search = { ...at, tab: "search" } as const;
    expect(historyMode(search, { ...search, q: "cmsc" }, true)).toBe("replace");
    expect(historyMode(search, { ...search, q: "cmsc" }, false)).toBe(
      "replace",
    );
  });

  it("replaces what the app corrects on its own", () => {
    expect(historyMode(at, { ...at, planId: "plan-b-0001" }, false)).toBe(
      "replace",
    );
  });
});

describe("urlSearch", () => {
  it("spells params as the URL does, and reads its own output the same", () => {
    const want = {
      tab: "search",
      gened: "DSHU,DSNL",
      credits: "3",
      openSeats: 1,
    } as const;
    expect(
      urlSearch({
        tab: "search",
        gened: ["DSHU", "DSNL"],
        credits: 3,
        openSeats: true,
        fits: undefined,
        q: "",
      }),
    ).toEqual(want);
    expect(urlSearch(want)).toEqual(want);
  });

  it("leaves out empty params", () => {
    expect(urlSearch({ tab: "search", q: "", credits: "" })).toEqual({
      tab: "search",
    });
    expect(changedParams({ q: "a" }, { q: "b", tab: "search" })).toEqual([
      "q",
      "tab",
    ]);
  });
});
