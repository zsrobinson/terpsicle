import { describe, expect, it } from "vitest";
import {
  ReviewSummaryResultSchema,
  SubscribeInputSchema,
  SubscribeResultSchema,
} from "./api";
import { AcademicCalendarSchema } from "./calendar";
import {
  BuildingsFileSchema,
  RouteGeometrySchema,
  RoutesIndexSchema,
} from "./geo";
import {
  changesKey,
  dataCachePolicy,
  deptChunkKey,
  instructorNameKey,
  manifestKey,
  routeGeometryKey,
  seatsKey,
  TERMS_KEY,
} from "./keys";
import { GRADE_KEYS, GRADE_POINTS, PlanetTerpDeptSchema } from "./planetterp";

const TERM = "202701";
const NOW = "2026-09-25T14:00:00.000Z";
const HASH = "0123456789abcdef";

describe("geo", () => {
  it("accepts buildings, the routes index and a route geometry", () => {
    const buildings = {
      schemaVersion: 1,
      buildings: [
        {
          code: "IRB",
          number: "432",
          name: "Iribe Center",
          lat: 38.9891,
          lng: -76.9365,
        },
      ],
      offCampus: [
        { code: "BLD4", name: "Universities at Shady Grove, Building IV" },
      ],
    };
    expect(BuildingsFileSchema.safeParse(buildings).success).toBe(true);
    const unpadded = buildings.buildings.map((b) => ({ ...b, number: "39" }));
    expect(
      BuildingsFileSchema.safeParse({ ...buildings, buildings: unpadded })
        .success,
    ).toBe(false);
    expect(
      RoutesIndexSchema.safeParse({
        buildings: ["CSI", "IRB"],
        modes: ["standard", "accessible"],
      }).success,
    ).toBe(true);
    expect(
      RoutesIndexSchema.safeParse({
        buildings: [],
        modes: ["accessible", "standard"],
      }).success,
    ).toBe(false);
    const route = {
      schemaVersion: 1,
      from: "IRB",
      to: "CSI",
      mode: "accessible",
      lengthFeet: 612,
      coordinates: [
        [-76.9365, 38.9891],
        [-76.9362, 38.9901],
      ],
      source: "umd-gis",
      fetchedAt: NOW,
    };
    expect(RouteGeometrySchema.safeParse(route).success).toBe(true);
    expect(
      RouteGeometrySchema.safeParse({
        ...route,
        coordinates: [[-76.9365, 38.9891]],
      }).success,
    ).toBe(false);
  });
});

describe("planetterp", () => {
  it("lists grades in PlanetTerp order with W and Other outside GPA", () => {
    expect(GRADE_KEYS).toHaveLength(15);
    expect(GRADE_POINTS.W).toBeNull();
    expect(GRADE_POINTS["A+"]).toBe(4);
  });

  it("accepts a department file", () => {
    const record = {
      counts: [10, 40, 12, 9, 20, 8, 5, 10, 3, 1, 2, 0, 6, 4, 1],
      semesters: 6,
      latestTermId: "202501",
    };
    const dept = {
      schemaVersion: 1,
      dept: "CMSC",
      instructors: {
        kruskal: {
          slug: "kruskal",
          name: "Clyde Kruskal",
          type: "professor",
          rating: 3.4,
          reviewCount: 131,
          latestReviewAt: NOW,
        },
      },
      names: { "clyde kruskal": "kruskal" },
      courses: { CMSC351: { all: record, byInstructor: { kruskal: record } } },
    };
    expect(PlanetTerpDeptSchema.safeParse(dept).success).toBe(true);
    const short = {
      ...dept,
      courses: {
        CMSC351: { all: { ...record, counts: [1, 2, 3] }, byInstructor: {} },
      },
    };
    expect(PlanetTerpDeptSchema.safeParse(short).success).toBe(false);
  });
});

describe("academic calendar", () => {
  const base = {
    schemaVersion: 1,
    termId: TERM,
    source: "https://provost.umd.edu/calendar.md",
    fetchedAt: NOW,
  };

  it("represents published and not-yet-published terms", () => {
    const published = {
      ...base,
      status: "published",
      classesStart: "2027-01-25",
      classesEnd: "2027-05-10",
      noClasses: [
        { name: "Spring Break", start: "2027-03-14", end: "2027-03-21" },
      ],
    };
    expect(AcademicCalendarSchema.safeParse(published).success).toBe(true);
    expect(
      AcademicCalendarSchema.safeParse({ ...base, status: "not-published" })
        .success,
    ).toBe(true);
    const backwards = {
      ...published,
      noClasses: [{ name: "Oops", start: "2027-03-21", end: "2027-03-14" }],
    };
    expect(AcademicCalendarSchema.safeParse(backwards).success).toBe(false);
  });
});

describe("server fn contracts", () => {
  it("rejects unknown input keys", () => {
    const input = {
      email: "testudo@umd.edu",
      termId: TERM,
      sectionKey: "CMSC351-0101",
    };
    expect(SubscribeInputSchema.safeParse(input).success).toBe(true);
    expect(
      SubscribeInputSchema.safeParse({ ...input, admin: true }).success,
    ).toBe(false);
    expect(
      SubscribeInputSchema.safeParse({ ...input, email: "not an email" })
        .success,
    ).toBe(false);
  });

  it("covers every subscribe and summary outcome", () => {
    expect(
      SubscribeResultSchema.safeParse({ status: "check-email" }).success,
    ).toBe(true);
    // The subscribe answer never carries a token: it would reveal whether
    // the address already had a watch.
    const leaky = {
      status: "check-email",
      subscriptionId: "A".repeat(22),
      manageToken: "b".repeat(43),
    };
    expect(SubscribeResultSchema.parse(leaky)).toEqual({
      status: "check-email",
    });
    expect(
      ReviewSummaryResultSchema.safeParse({
        status: "unavailable",
        reason: "daily-limit",
      }).success,
    ).toBe(true);
  });
});

describe("R2 keys", () => {
  it("builds the documented layout", () => {
    expect(manifestKey(TERM)).toBe(`catalog/${TERM}/manifest.json`);
    expect(deptChunkKey(TERM, "CMSC", HASH)).toBe(
      `catalog/${TERM}/dept/CMSC.${HASH}.json`,
    );
    expect(seatsKey(TERM, HASH)).toBe(`catalog/${TERM}/seats.${HASH}.json`);
    expect(changesKey(TERM, HASH)).toBe(`catalog/${TERM}/changes.${HASH}.json`);
    expect(routeGeometryKey("IRB", "CSI", "standard")).toBe(
      "geo/route/IRB-CSI-standard.json",
    );
  });

  it("caches hashed files forever and polls manifests", () => {
    expect(
      dataCachePolicy(deptChunkKey(TERM, "CMSC", HASH))?.cacheControl,
    ).toContain("immutable");
    expect(dataCachePolicy(manifestKey(TERM))).toEqual({
      cacheControl: "public, no-cache",
      edgeTtlSeconds: 60,
    });
    expect(dataCachePolicy(TERMS_KEY)?.edgeTtlSeconds).toBe(60);
    expect(dataCachePolicy("_jobs/routes-progress.json")).toBeNull();
    expect(dataCachePolicy("summaries/kruskal.json")).toBeNull();
  });

  it("normalizes instructor names for the PlanetTerp join", () => {
    expect(instructorNameKey("  Clyde   Kruskal ")).toBe("clyde kruskal");
  });
});
