import { describe, expect, it } from "vitest";
import {
  legacyPlanLocation,
  PLAN_VIEW_PATHS,
  planViewAt,
} from "./plan-location";

describe("planViewAt", () => {
  it("reads each view from its route, GenEd at /plan itself", () => {
    expect(planViewAt("/plan")).toBe("gened");
    expect(planViewAt("/plan/")).toBe("gened");
    expect(planViewAt("/plan/problems")).toBe("problems");
    expect(planViewAt("/plan/search")).toBe("search");
    expect(planViewAt("/plan/samples")).toBe("templates");
    expect(planViewAt("/plan/import/")).toBe("import");
  });

  it("takes anything else under /plan as GenEd", () => {
    expect(planViewAt("/plan/templates")).toBe("gened");
    expect(planViewAt("/plan/nope")).toBe("gened");
  });

  it("round-trips every view's path", () => {
    for (const [view, path] of Object.entries(PLAN_VIEW_PATHS))
      expect(planViewAt(path)).toBe(view);
  });
});

describe("legacyPlanLocation", () => {
  it("sends ?tab= to its view's route, keeping the rest", () => {
    expect(
      legacyPlanLocation({ tab: "search", q: "cmsc4", semester: "202701" }),
    ).toEqual({
      to: "/plan/search",
      search: { q: "cmsc4", semester: "202701" },
    });
    expect(legacyPlanLocation({ tab: "templates" })).toEqual({
      to: "/plan/samples",
      search: {},
    });
  });

  it("leaves /plan alone without a tab, or with GenEd's", () => {
    expect(legacyPlanLocation({ course: "CMSC351" })).toBeNull();
    expect(legacyPlanLocation({ tab: "gened", q: "x" })).toEqual({
      to: "/plan",
      search: { q: "x" },
    });
  });
});
