import { describe, expect, it } from "vitest";
import {
  AcademicCalendarSchema,
  BuildingsFileSchema,
  ChangesFileSchema,
  type Course,
  CourseIndexDeptSchema,
  CourseIndexManifestSchema,
  CourseSearchFileSchema,
  DeptChunkSchema,
  FEET_PER_MINUTE_PER_MPH,
  GeoManifestSchema,
  ManifestSchema,
  type Meeting,
  PACE_MPH,
  PlanetTerpDeptSchema,
  PlanetTerpManifestSchema,
  PlanSchema,
  ReviewSummarySchema,
  ROUTES_HEADER_BYTES,
  ROUTES_MAGIC,
  ROUTES_NO_ROUTE,
  RouteGeometrySchema,
  RoutesIndexSchema,
  SeatsFileSchema,
  type Section,
  TermsFileSchema,
  TIGHT_SHARE,
  type TimedMeeting,
} from "~/core/schema";
import {
  archivedFixtureTermId,
  buildMockDataFiles,
  CANCELLED_SECTION_KEY,
  demoPlan,
  demoPlanB,
  demoPlans,
  encodeMockRoutes,
  fixtureTermId,
  MOVED_SECTION_KEY,
  mockBuildingsFile,
  mockCatalog,
  mockChanges,
  mockCourse,
  mockCourses,
  mockDataSource,
  mockDistanceFeet,
  mockPlanetTerpDepts,
  mockSeats,
  mockSection,
  mockTermsFile,
  PINNED_SEATS,
  snapshotOf,
} from "~/fixtures";

const decoder = new TextDecoder();

async function sha16(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return Array.from(digest.slice(0, 8), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
}

const timed = (s: Section): TimedMeeting[] =>
  s.meetings.filter((m): m is Extract<Meeting, { timed: true }> => m.timed);

const allSections = (termId = fixtureTermId) =>
  mockCourses(termId).flatMap((c) =>
    c.sections.map((s) => ({ course: c, section: s })),
  );

/** Meeting pattern ignoring rooms: what "time-identical" compares. */
const pattern = (s: Section) =>
  JSON.stringify(timed(s).map((m) => [m.days, m.start, m.end, m.kind]));

describe("the mock bucket", () => {
  it("has a schema-valid file at every key, named by its content hash", async () => {
    const files = await buildMockDataFiles();
    const checks: [
      RegExp,
      { safeParse: (v: unknown) => { success: boolean } },
    ][] = [
      [/^catalog\/terms\.json$/, TermsFileSchema],
      [/^catalog\/\d{6}\/manifest\.json$/, ManifestSchema],
      [/^catalog\/\d{6}\/dept\/[A-Z]{4}\.[0-9a-f]{16}\.json$/, DeptChunkSchema],
      [/^catalog\/\d{6}\/seats\.[0-9a-f]{16}\.json$/, SeatsFileSchema],
      [/^catalog\/\d{6}\/changes\.[0-9a-f]{16}\.json$/, ChangesFileSchema],
      [/^planetterp\/manifest\.json$/, PlanetTerpManifestSchema],
      [
        /^planetterp\/dept\/[A-Z]{4}\.[0-9a-f]{16}\.json$/,
        PlanetTerpDeptSchema,
      ],
      [/^summaries\/.+\.json$/, ReviewSummarySchema],
      [/^geo\/manifest\.json$/, GeoManifestSchema],
      [/^geo\/buildings\.[0-9a-f]{16}\.json$/, BuildingsFileSchema],
      [
        /^geo\/route\/[A-Z0-9]+-[A-Z0-9]+-(standard|accessible)\.json$/,
        RouteGeometrySchema,
      ],
      [/^calendar\/\d{6}\.json$/, AcademicCalendarSchema],
      [/^courses\/manifest\.json$/, CourseIndexManifestSchema],
      [/^courses\/search\.[0-9a-f]{16}\.json$/, CourseSearchFileSchema],
      [/^courses\/dept\/[A-Z]{4}\.[0-9a-f]{16}\.json$/, CourseIndexDeptSchema],
    ];
    expect(files.size).toBeGreaterThan(100);
    for (const [key, bytes] of files) {
      const hashed = /\.([0-9a-f]{16})\.(json|bin)$/.exec(key);
      if (hashed) expect(await sha16(bytes), key).toBe(hashed[1]);
      if (key.endsWith(".bin")) continue;
      const schema = checks.find(([pattern]) => pattern.test(key))?.[1];
      expect(schema, `no schema for ${key}`).toBeDefined();
      const result = schema?.safeParse(JSON.parse(decoder.decode(bytes)));
      expect(result?.success, key).toBe(true);
    }
  });

  it("has every file a manifest points to", async () => {
    const files = await buildMockDataFiles();
    for (const term of mockTermsFile.terms) {
      const manifest = ManifestSchema.parse(
        await mockDataSource.json(`catalog/${term.id}/manifest.json`),
      );
      for (const d of manifest.departments)
        expect(
          files.has(`catalog/${term.id}/dept/${d.code}.${d.hash}.json`),
        ).toBe(true);
      expect(
        manifest.seats &&
          files.has(`catalog/${term.id}/seats.${manifest.seats.hash}.json`),
      ).toBe(true);
      expect(
        manifest.changes &&
          files.has(`catalog/${term.id}/changes.${manifest.changes.hash}.json`),
      ).toBe(true);
    }
    const pt = PlanetTerpManifestSchema.parse(
      await mockDataSource.json("planetterp/manifest.json"),
    );
    for (const d of pt.departments)
      expect(files.has(`planetterp/dept/${d.code}.${d.hash}.json`)).toBe(true);
    const geo = GeoManifestSchema.parse(
      await mockDataSource.json("geo/manifest.json"),
    );
    expect(files.has(`geo/buildings.${geo.buildings.hash}.json`)).toBe(true);
    expect(geo.routes && files.has(`geo/routes.${geo.routes.hash}.bin`)).toBe(
      true,
    );
    const index = CourseIndexManifestSchema.parse(
      await mockDataSource.json("courses/manifest.json"),
    );
    expect(files.has(`courses/search.${index.search.hash}.json`)).toBe(true);
    for (const d of index.departments)
      expect(files.has(`courses/dept/${d.code}.${d.hash}.json`)).toBe(true);
    expect(await mockDataSource.get("catalog/nope.json")).toBeNull();
  });

  it("indexes every mock course, with the archived term in `offered`", async () => {
    const index = CourseIndexManifestSchema.parse(
      await mockDataSource.json("courses/manifest.json"),
    );
    const search = CourseSearchFileSchema.parse(
      await mockDataSource.json(`courses/search.${index.search.hash}.json`),
    );
    const codes = new Set(
      Object.values(mockCatalog).flatMap((chunks) =>
        chunks.flatMap((c) => c.courses.map((course) => course.code)),
      ),
    );
    expect(search.courses.map((r) => r[0])).toEqual([...codes].sort());
    const cmsc = index.departments.find((d) => d.code === "CMSC");
    const file = CourseIndexDeptSchema.parse(
      await mockDataSource.json(`courses/dept/CMSC.${cmsc?.hash}.json`),
    );
    expect(file.courses.find((c) => c.code === "CMSC131")?.offered).toEqual([
      fixtureTermId,
      archivedFixtureTermId,
    ]);
  });

  it("encodes the routes binary exactly as DATA.md §4.2 lays it out", () => {
    const bytes = encodeMockRoutes();
    const view = new DataView(bytes.buffer);
    expect(decoder.decode(bytes.slice(0, 4))).toBe(ROUTES_MAGIC);
    expect(view.getUint16(4, true)).toBe(1);
    const n = view.getUint16(6, true);
    expect(view.getUint8(8)).toBe(2);
    const indexLength = view.getUint32(12, true);
    const index = RoutesIndexSchema.parse(
      JSON.parse(
        decoder.decode(
          bytes.slice(ROUTES_HEADER_BYTES, ROUTES_HEADER_BYTES + indexLength),
        ),
      ),
    );
    expect(index.buildings).toHaveLength(n);
    const start = Math.ceil((ROUTES_HEADER_BYTES + indexLength) / 4) * 4;
    expect(bytes.length).toBe(start + 2 * 2 * n * n);
    const cell = (m: number, from: string, to: string) =>
      view.getUint16(
        start +
          2 *
            (m * n * n +
              index.buildings.indexOf(from) * n +
              index.buildings.indexOf(to)),
        true,
      );
    // Real UMD GIS numbers from the recon.
    expect(cell(0, "IRB", "CSI")).toBe(197);
    expect(cell(0, "VMH", "EGR")).toBe(3689);
    expect(cell(1, "VMH", "EGR")).toBe(4266);
    expect(cell(1, "IPT", "MTH")).toBe(ROUTES_NO_ROUTE);
    expect(cell(0, "CSI", "CSI")).toBe(0);
    expect(cell(0, "ESJ", "CSI")).toBe(cell(0, "CSI", "ESJ"));
  });
});

describe("the mock catalog", () => {
  it("has two terms: Spring 2027 active (the default) and Summer 2026 archived", () => {
    const [spring, summer] = mockTermsFile.terms;
    expect(spring).toMatchObject({
      id: fixtureTermId,
      status: "active",
      season: "spring",
    });
    expect(summer).toMatchObject({
      id: archivedFixtureTermId,
      status: "archived",
    });
    expect(Object.keys(mockCatalog).sort()).toEqual(
      [archivedFixtureTermId, fixtureTermId].sort(),
    );
  });

  it("has 60+ courses across real departments, unique and sorted", () => {
    const courses = mockCourses();
    expect(courses.length).toBeGreaterThanOrEqual(60);
    expect(new Set(courses.map((c) => c.code)).size).toBe(courses.length);
    const chunks = mockCatalog[fixtureTermId] ?? [];
    expect(chunks.length).toBeGreaterThanOrEqual(10);
    for (const chunk of chunks) {
      const codes = chunk.courses.map((c) => c.code);
      expect(codes).toEqual([...codes].sort());
      for (const code of codes) expect(code.startsWith(chunk.dept)).toBe(true);
    }
  });

  it("puts every in-person meeting in a known or off-campus building", () => {
    const known = new Set([
      ...mockBuildingsFile.buildings.map((b) => b.code),
      ...mockBuildingsFile.offCampus.map((b) => b.code),
    ]);
    for (const termId of [fixtureTermId, archivedFixtureTermId])
      for (const { section } of allSections(termId))
        for (const m of section.meetings)
          if (m.building)
            expect(known.has(m.building), `${m.building}`).toBe(true);
  });

  it("covers every edge case the UI must handle", () => {
    const sections = allSections();
    const some = (f: (x: { course: Course; section: Section }) => boolean) =>
      sections.some(f);

    // Many sections, and more than 12 distinct section times.
    expect(mockCourse("CMSC131").sections.length).toBeGreaterThanOrEqual(9);
    expect(
      new Set(mockCourse("ENGL101").sections.map(pattern)).size,
    ).toBeGreaterThan(12);
    // Time-identical sections (same times, different rooms).
    const econ = mockCourse("ECON200").sections;
    expect(pattern(econ[0] as Section)).toBe(pattern(econ[2] as Section));
    // Delivery modes and meeting shapes.
    for (const delivery of ["f2f", "blended", "online-sync", "online-async"])
      expect(
        some(({ section }) => section.delivery === delivery),
        delivery,
      ).toBe(true);
    expect(
      some(({ section }) => timed(section).some((m) => m.days.includes("Sa"))),
    ).toBe(true);
    expect(
      some(({ section }) =>
        section.meetings.some((m) => !m.timed && m.building !== null),
      ),
    ).toBe(true);
    expect(some(({ section }) => section.meetings.length === 0)).toBe(true);
    expect(some(({ section }) => section.dates !== undefined)).toBe(true);
    // People and restrictions.
    expect(some(({ section }) => section.instructors.length === 0)).toBe(true);
    expect(some(({ section }) => section.instructors.length > 1)).toBe(true);
    expect(some(({ section }) => section.restriction !== null)).toBe(true);
    // Course-level variety.
    const courses = mockCourses();
    expect(courses.some((c) => c.crossListings.length > 0)).toBe(true);
    expect(courses.some((c) => c.credits.max > c.credits.min)).toBe(true);
    expect(
      courses.some((c) => c.contactDepartment && c.sections.length === 0),
    ).toBe(true);
    expect(courses.some((c) => c.genEds.some((g) => g.length > 1))).toBe(true);
    expect(
      courses.some((c) => c.genEds.some((g) => g.some((o) => o.condition))),
    ).toBe(true);
  });

  it("has seats in every state: full, low, open, holdfile-only and unknown", () => {
    const tuples = Object.values(mockSeats.seats);
    expect(tuples.some(([open]) => open === 0)).toBe(true);
    expect(tuples.some(([open]) => open > 0 && open <= 3)).toBe(true);
    expect(tuples.some(([open, total]) => open > 3 && open <= total)).toBe(
      true,
    );
    expect(tuples.some(([, , w, h]) => w === null && h !== null)).toBe(true);
    for (const [open, total] of tuples) expect(open).toBeLessThanOrEqual(total);
    const keys = new Set(
      allSections().map(
        ({ course, section }) => `${course.code}-${section.code}`,
      ),
    );
    for (const key of Object.keys(mockSeats.seats))
      expect(keys.has(key), key).toBe(true);
    for (const key of Object.keys(PINNED_SEATS))
      expect(mockSeats.seats[key], key).toEqual(PINNED_SEATS[key]);
    expect(keys.size).toBeGreaterThan(Object.keys(mockSeats.seats).length);
    expect(mockSeats.asOf).toBe("2026-09-25T02:30:00.000Z");
  });

  it("lists one moved and one cancelled section, matching the catalog", () => {
    const [cancelled, moved] = mockChanges.changes;
    expect(cancelled).toMatchObject({
      kind: "cancelled",
      sectionKey: CANCELLED_SECTION_KEY,
    });
    expect(moved).toMatchObject({
      kind: "changed",
      sectionKey: MOVED_SECTION_KEY,
    });
    expect(() => mockSection(CANCELLED_SECTION_KEY)).toThrow();
    if (moved?.kind !== "changed") throw new Error("expected a change");
    expect(moved.after).toEqual(snapshotOf(mockSection(MOVED_SECTION_KEY)));
    expect(moved.before).not.toEqual(moved.after);
  });
});

describe("mock PlanetTerp", () => {
  it("joins names to slugs within each department file", () => {
    const slugs = new Set<string>();
    for (const dept of mockPlanetTerpDepts) {
      for (const slug of Object.values(dept.names))
        expect(dept.instructors[slug]).toBeDefined();
      for (const [slug, i] of Object.entries(dept.instructors)) {
        expect(i.slug).toBe(slug);
        expect(i.rating === null).toBe(i.reviewCount === 0);
        slugs.add(slug);
      }
    }
    // Slug collisions resolve the PlanetTerp way ("zielinski", then "zielinski_ben").
    expect([...slugs].some((s) => s.includes("_"))).toBe(true);
  });

  it("has grade distributions with +/−, W and Other", () => {
    const cmsc = mockPlanetTerpDepts.find((d) => d.dept === "CMSC");
    const all = cmsc?.courses.CMSC351?.all;
    expect(all?.counts[0]).toBeGreaterThan(0);
    expect(all?.counts[13]).toBeGreaterThan(0);
    expect(all?.counts[14]).toBeGreaterThan(0);
    expect(
      Object.keys(cmsc?.courses.CMSC351?.byInstructor ?? {}).length,
    ).toBeGreaterThan(0);
  });
});

describe("demo plans", () => {
  const credits = (plan: typeof demoPlan) =>
    plan.courses
      .filter((c) => c.sectionCode !== null)
      .reduce((n, c) => n + mockCourse(c.courseCode).credits.min, 0);
  const placed = (plan: typeof demoPlan) =>
    plan.courses.flatMap((c) =>
      c.sectionCode === null
        ? []
        : [mockSection(`${c.courseCode}-${c.sectionCode}`)],
    );

  it("are valid plans", () => {
    for (const plan of demoPlans)
      expect(PlanSchema.safeParse(plan).success, plan.name).toBe(true);
  });

  it("plan A has 16 credits, an overlap and a tight connection", () => {
    expect(credits(demoPlan)).toBe(16);
    const meetings = placed(demoPlan).flatMap((s, i) =>
      timed(s).map((m) => ({ ...m, owner: i })),
    );
    const overlaps = meetings.some((a) =>
      meetings.some(
        (b) =>
          a.owner < b.owner &&
          a.days.some((d) => b.days.includes(d)) &&
          a.start < b.end &&
          b.start < a.end,
      ),
    );
    expect(overlaps).toBe(true);

    // DATA.md §6 at the typical pace: walk ≥ 75% of the gap but fits in it.
    const feetPerMinute = PACE_MPH.typical * FEET_PER_MINUTE_PER_MPH;
    const tight = meetings.some((a) =>
      meetings.some((b) => {
        const gap = b.start - a.end;
        if (
          !a.days.some((d) => b.days.includes(d)) ||
          gap <= 0 ||
          !a.building ||
          !b.building
        )
          return false;
        const feet = mockDistanceFeet(a.building, b.building, "standard");
        if (typeof feet !== "number" || feet === 0) return false;
        const walk = Math.ceil(feet / feetPerMinute);
        return walk <= gap && walk >= TIGHT_SHARE * gap;
      }),
    );
    expect(tight).toBe(true);
  });

  it("plan B holds the moved and the cancelled section with old snapshots", () => {
    const byKey = new Map(
      demoPlanB.courses.map((c) => [`${c.courseCode}-${c.sectionCode}`, c]),
    );
    expect(byKey.get(MOVED_SECTION_KEY)?.snapshot).not.toEqual(
      snapshotOf(mockSection(MOVED_SECTION_KEY)),
    );
    expect(byKey.get(CANCELLED_SECTION_KEY)?.snapshot).not.toBeNull();
    expect(() => mockSection(CANCELLED_SECTION_KEY)).toThrow();
  });

  it("snapshots every other placed section as the catalog has it", () => {
    for (const plan of demoPlans)
      for (const c of plan.courses) {
        const key = `${c.courseCode}-${c.sectionCode}`;
        if (
          c.sectionCode === null ||
          key === MOVED_SECTION_KEY ||
          key === CANCELLED_SECTION_KEY
        )
          continue;
        expect(c.snapshot).toEqual(snapshotOf(mockSection(key, plan.termId)));
      }
  });
});
