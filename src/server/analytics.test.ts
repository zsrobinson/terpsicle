import { describe, expect, it, vi } from "vitest";
import { captureServerEvent } from "./analytics";

const props = { job: "seats", durationMs: 12 };

describe("captureServerEvent", () => {
  it("does nothing without a token", async () => {
    const fetcher = vi.fn<typeof fetch>();
    await captureServerEvent({}, "cron_job_finished", props, { fetcher });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("posts an anonymous event to PostHog", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => new Response("{}"));
    await captureServerEvent(
      { POSTHOG_TOKEN: "phc_test" },
      "cron_job_finished",
      props,
      { fetcher, now: new Date(Date.UTC(2026, 8, 25)) },
    );

    const [url, init] = fetcher.mock.calls[0] ?? [];
    expect(url).toBe("https://us.i.posthog.com/i/v0/e/");
    expect(JSON.parse(String(init?.body))).toEqual({
      api_key: "phc_test",
      event: "cron_job_finished",
      distinct_id: "terpsicle-worker",
      timestamp: "2026-09-25T00:00:00.000Z",
      properties: { ...props, $process_person_profile: false },
    });
  });

  it("swallows network errors", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const fetcher = vi.fn<typeof fetch>(async () => {
      throw new Error("offline");
    });
    await expect(
      captureServerEvent({ POSTHOG_TOKEN: "t" }, "cron_job_finished", props, {
        fetcher,
      }),
    ).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
