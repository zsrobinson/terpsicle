import { describe, expect, it } from "vitest";
import { listedProducts, PRODUCTS } from "./products";

describe("listedProducts", () => {
  const ids = (plan: boolean, current: Parameters<typeof listedProducts>[1]) =>
    listedProducts({ plan }, current).map((p) => p.id);

  it("keeps the color order", () => {
    expect(PRODUCTS.map((p) => p.id)).toEqual([
      "schedule",
      "reviews",
      "chat",
      "plan",
      "todo",
    ]);
  });

  it("lists Plan once PLAN_ENABLED is on, or while you're in it", () => {
    expect(ids(false, "schedule")).toEqual([
      "schedule",
      "reviews",
      "chat",
      "todo",
    ]);
    expect(ids(false, null)).not.toContain("plan");
    expect(ids(false, "plan")).toContain("plan");
    expect(ids(true, null)).toContain("plan");
  });
});
