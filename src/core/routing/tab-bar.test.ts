import { describe, expect, it } from "vitest";
import { TAB_IDS, tabBarAt } from "./tab-bar";

describe("tabBarAt", () => {
  it("names the tab you're on: Home, then the five products", () => {
    expect(tabBarAt("/home")).toEqual({ current: "home" });
    expect(tabBarAt("/schedule")).toEqual({ current: "schedule" });
    expect(tabBarAt("/schedule/course/CMSC351")).toEqual({
      current: "schedule",
    });
    expect(tabBarAt("/reviews/courses/CMSC351")).toEqual({
      current: "reviews",
    });
    expect(tabBarAt("/chat/")).toEqual({ current: "chat" });
    expect(tabBarAt("/plan/search")).toEqual({ current: "plan" });
    expect(tabBarAt("/plan/shared")).toEqual({ current: "plan" });
    expect(tabBarAt("/todo")).toEqual({ current: "todo" });
  });

  it("shows the bar with no tab current on Settings", () => {
    expect(tabBarAt("/settings")).toEqual({ current: null });
    expect(tabBarAt("/settings/notifications")).toEqual({ current: null });
  });

  it("leaves it off the marketing page, sign-in, admin and the site's own pages", () => {
    for (const path of [
      "/",
      "/signin",
      "/auth/callback",
      "/admin",
      "/admin/kit",
      "/privacy",
      "/homework",
      "/scheduler",
    ])
      expect(tabBarAt(path)).toBeNull();
  });

  it("keeps Home first and the products in color order", () => {
    expect(TAB_IDS).toEqual([
      "home",
      "schedule",
      "reviews",
      "chat",
      "plan",
      "todo",
    ]);
  });
});
