import type { CaptureResult } from "posthog-js";
import { afterEach, describe, expect, it } from "vitest";
import { NO_AUTOCAPTURE_ROUTES } from "~/core/analytics";
import { analyticsEnabled } from "./analytics";
import { parseClientConfig } from "./config";
import { pagePrivateText, posthogOptions } from "./posthog-options";

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

describe("posthogOptions", () => {
  const options = posthogOptions(() => ["Therapy"]);
  const send = (event: string, properties: Record<string, unknown>) => {
    const before = options.before_send;
    if (typeof before !== "function") throw new Error("no before_send");
    const input: CaptureResult = { uuid: "u", event, properties };
    return before(input);
  };

  it("stays anonymous and skips surveys", () => {
    expect(options).toMatchObject({
      person_profiles: "identified_only",
      persistence: "localStorage",
      disable_surveys: true,
    });
  });

  it("keeps autocapture off private elements and private pages", () => {
    const autocapture = options.autocapture;
    if (typeof autocapture !== "object") throw new Error("no autocapture");
    expect(autocapture.css_selector_ignorelist).toContain("[data-private]");
    expect(autocapture.capture_copied_text).toBe(false);
    for (const route of NO_AUTOCAPTURE_ROUTES)
      expect(
        autocapture.url_ignorelist?.some((pattern) =>
          `https://terpsicle.com${route}`.match(pattern),
        ),
      ).toBe(true);
  });

  it("scrubs share links and private text before sending", () => {
    expect(
      send("$pageview", {
        $current_url: "https://terpsicle.com/schedule?plan=eJyrVk",
      })?.properties,
    ).toEqual({ $current_url: "https://terpsicle.com/schedule?plan=shared" });
    expect(
      send("$autocapture", { $el_text: "Therapy", $event_type: "click" })
        ?.properties,
    ).toEqual({ $event_type: "click" });
  });
});

describe("session recordings", () => {
  it("are off in PostHog's settings", () => {
    expect(posthogOptions(() => []).disable_session_recording).toBe(true);
  });

  it("never send data, even if the PostHog project turns them on", () => {
    const before = posthogOptions(() => []).before_send;
    if (typeof before !== "function") throw new Error("no before_send");
    expect(
      before({
        uuid: "u",
        event: "$snapshot",
        properties: { $snapshot_data: [{ type: 2 }] },
      }),
    ).toBeNull();
  });

  it("are never started or turned back on anywhere in the app", () => {
    const sources = import.meta.glob<string>(
      ["/src/**/*.{ts,tsx}", "!/src/**/*.test.{ts,tsx}"],
      { query: "?raw", import: "default", eager: true },
    );
    expect(Object.keys(sources).length).toBeGreaterThan(100);
    const turnsOn =
      /\.startSessionRecording\s*\(|disable_session_recording\s*:(?!\s*true\b)/;
    expect(
      Object.entries(sources)
        .filter(([, text]) => turnsOn.test(text))
        .map(([file]) => file),
    ).toEqual([]);
  });
});

describe("pagePrivateText", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("reads text, labels and values of private elements only", () => {
    document.body.innerHTML = `
      <button aria-label="Edit Therapy"><span data-private>Therapy</span> Tu 3pm</button>
      <div data-private><p>Jane Doe</p><p>jd@umd.edu</p></div>
      <img data-private alt="Jane's picture" src="x.png">
      <input data-private value="Gym">
      <p>Public</p>`;
    expect(
      pagePrivateText()
        .map((t) => t.trim())
        .filter(Boolean),
    ).toEqual(["Therapy", "Jane Doe", "jd@umd.edu", "Jane's picture", "Gym"]);
  });
});
