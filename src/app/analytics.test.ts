import { describe, expect, it } from "vitest";
import { analyticsEnabled } from "./analytics";
import { parseClientConfig } from "./config";

const production = {
  mode: "production",
  dataSource: "live",
  posthogToken: "phc_test",
} as const;

describe("analyticsEnabled", () => {
  it("is on for live data on the real site", () => {
    expect(analyticsEnabled(production, "terpsicle.com")).toBe(true);
  });

  it.each([
    [
      "mock data",
      { ...production, dataSource: "mock" as const },
      "terpsicle.com",
    ],
    ["tests", { ...production, mode: "test" }, "terpsicle.com"],
    ["no token", { ...production, posthogToken: undefined }, "terpsicle.com"],
    ["localhost", production, "localhost"],
    ["127.0.0.1", production, "127.0.0.1"],
    ["PR previews", production, "pr-12-terpsicle.zsrobinson.workers.dev"],
    ["www (it redirects anyway)", production, "www.terpsicle.com"],
  ])("is off for %s", (_, config, hostname) => {
    expect(analyticsEnabled(config, hostname)).toBe(false);
  });
});

describe("parseClientConfig", () => {
  it("defaults to live data from /data", () => {
    expect(parseClientConfig({ MODE: "production" })).toEqual({
      mode: "production",
      dataSource: "live",
      dataBaseUrl: "/data",
      posthogToken: undefined,
      swDev: false,
    });
  });

  it("names the bad variable", () => {
    expect(() =>
      parseClientConfig({ MODE: "mock", VITE_DATA_SOURCE: "fixtures" }),
    ).toThrow(/VITE_DATA_SOURCE/);
  });
});
