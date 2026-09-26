import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { NEW_YORK, newYorkDateOf, resolveZone, zonedToUtc } from "./zones";

/** A wall-clock time as if it were UTC, the form `zonedToUtc` takes. */
const wall = (y: number, mo: number, d: number, h: number, mi = 0) =>
  Date.UTC(y, mo - 1, d, h, mi);
const iso = (ms: number | null) =>
  ms === null ? null : new Date(ms).toISOString();

describe("zonedToUtc: America/New_York", () => {
  it("uses EDT in summer and EST in winter", () => {
    expect(iso(zonedToUtc(wall(2026, 9, 29, 23, 59), NEW_YORK))).toBe(
      "2026-09-30T03:59:00.000Z",
    );
    expect(iso(zonedToUtc(wall(2026, 12, 10, 23, 59), NEW_YORK))).toBe(
      "2026-12-11T04:59:00.000Z",
    );
  });

  it("reads the repeated hour when daylight time ends as the first one", () => {
    // Nov 1, 2026: 1:59am EDT, then clocks go back from 2am to 1am.
    expect(iso(zonedToUtc(wall(2026, 11, 1, 0, 59), NEW_YORK))).toBe(
      "2026-11-01T04:59:00.000Z",
    );
    expect(iso(zonedToUtc(wall(2026, 11, 1, 1, 30), NEW_YORK))).toBe(
      "2026-11-01T05:30:00.000Z",
    );
    expect(iso(zonedToUtc(wall(2026, 11, 1, 2, 0), NEW_YORK))).toBe(
      "2026-11-01T07:00:00.000Z",
    );
  });

  it("reads the skipped hour when daylight time starts with the offset before it", () => {
    // Mar 14, 2027: clocks jump from 2am to 3am.
    expect(iso(zonedToUtc(wall(2027, 3, 14, 1, 59), NEW_YORK))).toBe(
      "2027-03-14T06:59:00.000Z",
    );
    expect(iso(zonedToUtc(wall(2027, 3, 14, 2, 0), NEW_YORK))).toBe(
      "2027-03-14T07:00:00.000Z",
    );
    expect(iso(zonedToUtc(wall(2027, 3, 14, 2, 30), NEW_YORK))).toBe(
      "2027-03-14T07:30:00.000Z",
    );
    expect(iso(zonedToUtc(wall(2027, 3, 14, 3, 0), NEW_YORK))).toBe(
      "2027-03-14T07:00:00.000Z",
    );
  });

  it("agrees with the runtime's time zone data outside the gaps", () => {
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: NEW_YORK,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
    fc.assert(
      fc.property(
        fc.integer({ min: Date.UTC(2024, 0, 1), max: Date.UTC(2030, 0, 1) }),
        (raw) => {
          const ms = Math.floor(raw / 60_000) * 60_000;
          const parts = formatter.formatToParts(new Date(ms));
          const part = (type: string) =>
            Number(parts.find((x) => x.type === type)?.value);
          const p = {
            year: part("year"),
            month: part("month"),
            day: part("day"),
            hour: part("hour"),
            minute: part("minute"),
          };
          const local = wall(p.year, p.month, p.day, p.hour, p.minute);
          // Round trip: New York's wall time for an instant maps back to an
          // instant with that wall time (the first, in the repeated hour).
          const back = zonedToUtc(local, NEW_YORK);
          expect(back === ms || back === ms - 3_600_000).toBe(true);
          expect(newYorkDateOf(ms)).toBe(
            `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`,
          );
        },
      ),
      { numRuns: 500 },
    );
  });
});

describe("zonedToUtc: other zones, through Intl", () => {
  const LA = "America/Los_Angeles";

  it("reads standard and daylight time", () => {
    expect(iso(zonedToUtc(wall(2026, 10, 15, 23, 59), "America/Chicago"))).toBe(
      "2026-10-16T04:59:00.000Z",
    );
    expect(iso(zonedToUtc(wall(2026, 12, 15, 12), LA))).toBe(
      "2026-12-15T20:00:00.000Z",
    );
  });

  it("reads a repeated time as the first and a skipped one with the offset before the gap", () => {
    expect(iso(zonedToUtc(wall(2026, 11, 1, 1, 30), LA))).toBe(
      "2026-11-01T08:30:00.000Z",
    );
    expect(iso(zonedToUtc(wall(2027, 3, 14, 2, 30), LA))).toBe(
      "2027-03-14T10:30:00.000Z",
    );
  });

  it("reads UTC as is, and is null for a zone it can't place", () => {
    expect(zonedToUtc(wall(2026, 10, 1, 12), "UTC")).toBe(
      wall(2026, 10, 1, 12),
    );
    expect(zonedToUtc(wall(2026, 10, 1, 12), "Mars/Olympus_Mons")).toBeNull();
  });
});

describe("newYorkDateOf", () => {
  it("dates instants around midnight and both nights daylight time changes", () => {
    expect(newYorkDateOf(Date.parse("2026-09-30T03:59:00Z"))).toBe(
      "2026-09-29",
    );
    expect(newYorkDateOf(Date.parse("2026-09-30T04:00:00Z"))).toBe(
      "2026-09-30",
    );
    expect(newYorkDateOf(Date.parse("2026-11-01T06:30:00Z"))).toBe(
      "2026-11-01",
    ); // 1:30am EST
    expect(newYorkDateOf(Date.parse("2026-11-02T04:59:00Z"))).toBe(
      "2026-11-01",
    ); // 11:59pm EST
    expect(newYorkDateOf(Date.parse("2026-11-02T05:00:00Z"))).toBe(
      "2026-11-02",
    );
    expect(newYorkDateOf(Date.parse("2027-03-14T06:59:00Z"))).toBe(
      "2027-03-14",
    ); // 1:59am EST
    expect(newYorkDateOf(Date.parse("2027-03-15T03:59:00Z"))).toBe(
      "2027-03-14",
    ); // 11:59pm EDT
  });
});

describe("resolveZone", () => {
  it("reads IANA ids, aliases and the global form", () => {
    expect(resolveZone("America/New_York")).toBe(NEW_YORK);
    expect(resolveZone('"Eastern Standard Time"')).toBe(NEW_YORK);
    expect(resolveZone("US/Pacific")).toBe("America/Los_Angeles");
    expect(resolveZone("/mozilla.org/20050126_1/America/New_York")).toBe(
      NEW_YORK,
    );
    expect(resolveZone("Europe/Paris")).toBe("Europe/Paris");
    expect(resolveZone("GMT")).toBe("UTC");
  });

  it("is null for a zone it can't place", () => {
    expect(resolveZone("Mars/Olympus_Mons")).toBeNull();
    expect(resolveZone("")).toBeNull();
  });
});
