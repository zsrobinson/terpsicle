import { describe, expect, it } from "vitest";
import {
  afterFailure,
  backoffMs,
  isGoneError,
  nextFetch,
  TODO_ACTIVE_INTERVAL_MS,
  TODO_IDLE_INTERVAL_MS,
  TODO_MAX_BACKOFF_MS,
} from "./cadence";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const now = new Date("2026-09-26T16:00:00.000Z");
const ago = (ms: number) => new Date(now.getTime() - ms);

describe("nextFetch", () => {
  it("fetches a feed opened in the last 14 days every 20 minutes", () => {
    expect(
      nextFetch({ now, lastOpenedAt: ago(13 * DAY), dueTomorrowOn: false }),
    ).toEqual({
      status: "active",
      at: new Date(now.getTime() + TODO_ACTIVE_INTERVAL_MS),
    });
  });

  it("slows to 6 hours after 14 days, unless Due tomorrow is on", () => {
    expect(
      nextFetch({ now, lastOpenedAt: ago(14 * DAY), dueTomorrowOn: false }),
    ).toEqual({
      status: "active",
      at: new Date(now.getTime() + TODO_IDLE_INTERVAL_MS),
    });
    expect(
      nextFetch({ now, lastOpenedAt: ago(30 * DAY), dueTomorrowOn: true }),
    ).toEqual({
      status: "active",
      at: new Date(now.getTime() + TODO_ACTIVE_INTERVAL_MS),
    });
  });

  it("pauses after 120 days unopened, but never while reminders need it", () => {
    expect(
      nextFetch({ now, lastOpenedAt: ago(120 * DAY), dueTomorrowOn: false }),
    ).toEqual({ status: "paused" });
    expect(
      nextFetch({ now, lastOpenedAt: ago(119 * DAY), dueTomorrowOn: false })
        .status,
    ).toBe("active");
    expect(
      nextFetch({ now, lastOpenedAt: ago(400 * DAY), dueTomorrowOn: true })
        .status,
    ).toBe("active");
  });
});

describe("backoffMs", () => {
  it("doubles from 20 minutes up to 12 hours", () => {
    expect([1, 2, 3, 4, 5, 6, 7, 20].map((n) => backoffMs(n, 0.5))).toEqual([
      20 * MINUTE,
      40 * MINUTE,
      80 * MINUTE,
      160 * MINUTE,
      320 * MINUTE,
      640 * MINUTE,
      TODO_MAX_BACKOFF_MS,
      TODO_MAX_BACKOFF_MS,
    ]);
  });

  it("jitters by at most 10% either way", () => {
    expect(backoffMs(1, 0)).toBe(18 * MINUTE);
    expect(backoffMs(1, 0.999_999)).toBeCloseTo(22 * MINUTE, -2);
    expect(backoffMs(7, 0.999_999)).toBeLessThanOrEqual(
      TODO_MAX_BACKOFF_MS * 1.1,
    );
  });
});

describe("afterFailure", () => {
  it("knows which answers mean ELMS stopped sharing the link", () => {
    expect(
      ["http-401", "http-403", "http-404", "http-410"].every(isGoneError),
    ).toBe(true);
    expect(
      ["http-500", "http-429", "timeout", "not-a-calendar"].some(isGoneError),
    ).toBe(false);
  });

  it("breaks the feed on the third gone answer, each an hour apart", () => {
    let strikes = { strikes: 0, at: null as Date | null };
    const results: boolean[] = [];
    for (const hours of [0, 1, 2]) {
      const next = afterFailure(
        strikes,
        "http-404",
        new Date(now.getTime() + hours * HOUR),
      );
      results.push(next.broken);
      strikes = next;
    }
    expect(results).toEqual([false, false, true]);
    expect(strikes.strikes).toBe(3);
  });

  it("counts gone answers inside an hour once", () => {
    const first = afterFailure({ strikes: 0, at: null }, "http-410", now);
    const soon = afterFailure(
      first,
      "http-410",
      new Date(now.getTime() + 59 * MINUTE),
    );
    expect(soon).toEqual({ strikes: 1, at: now, broken: false });
  });

  it("starts over after any other failure", () => {
    expect(
      afterFailure({ strikes: 2, at: ago(2 * HOUR) }, "http-503", now),
    ).toEqual({ strikes: 0, at: null, broken: false });
  });
});
