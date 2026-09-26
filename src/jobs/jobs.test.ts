import { env } from "cloudflare:workers";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  AcademicCalendarSchema,
  BuildingsFileSchema,
  buildingsKey,
  ChangesFileSchema,
  calendarKey,
  changesKey,
  DeptChunkSchema,
  deptChunkKey,
  GEO_MANIFEST_KEY,
  GeoManifestSchema,
  ManifestSchema,
  manifestKey,
  PLANETTERP_MANIFEST_KEY,
  PlanetTerpDeptSchema,
  PlanetTerpManifestSchema,
  planetTerpDeptKey,
  planetTerpReviewsKey,
  SeatsFileSchema,
  StoredReviewsSchema,
  seatsKey,
  TERMS_KEY,
  TermsFileSchema,
} from "~/core/schema";
import buildingAllSearch from "~/ingest/__fixtures__/buildings/building-all-search.json?raw";
import planetterpGrades from "~/ingest/__fixtures__/planetterp/grades-CMSC351.json?raw";
import planetterpCourseNotFound from "~/ingest/__fixtures__/planetterp/grades-course-not-found.json?raw";
import planetterpKruskal from "~/ingest/__fixtures__/planetterp/professor-kruskal-reviews.json?raw";
import planetterpPage from "~/ingest/__fixtures__/planetterp/professors-reviews-limit10-offset3000.json?raw";
import calendarMd from "~/ingest/__fixtures__/provost/calendar.md?raw";
import calendarArchived from "~/ingest/__fixtures__/provost/calendar-archived.html?raw";
import soc202605Dept from "~/ingest/__fixtures__/soc/202605/dept/CMSC.html?raw";
import soc202605Sections from "~/ingest/__fixtures__/soc/202605/sections/CMSC.html?raw";
import soc202608Dept from "~/ingest/__fixtures__/soc/202608/dept/HESI.html?raw";
import soc202608Sections from "~/ingest/__fixtures__/soc/202608/sections/HESI.html?raw";
import soc202612Dept from "~/ingest/__fixtures__/soc/202612/dept/CMSC.html?raw";
import soc202612Sections from "~/ingest/__fixtures__/soc/202612/sections/CMSC.html?raw";
import agnrDept from "~/ingest/__fixtures__/soc/202701/dept/AGNR.html?raw";
import cmscDept from "~/ingest/__fixtures__/soc/202701/dept/CMSC.html?raw";
import agnrSections from "~/ingest/__fixtures__/soc/202701/sections/AGNR.html?raw";
import cmscSections from "~/ingest/__fixtures__/soc/202701/sections/CMSC.html?raw";
import buildingPopup from "~/ingest/__fixtures__/soc/buildings/SHM-2102.html?raw";
import socIndex from "~/ingest/__fixtures__/soc/index.html?raw";
import { runCalendarBuildingsJob } from "./calendar-buildings";
import { runCatalogJob } from "./catalog";
import { runPlanetTerpJob } from "./planetterp";
import { runSeatsJob } from "./seats";

// Cron handlers against a fake internet built from the saved pages in
// src/ingest/__fixtures__, writing to the test pool's local R2.

const SOC = "https://app.testudo.umd.edu/soc";

/** Department list pages with only the departments we have saved pages for. */
const deptList = (depts: Record<string, string>) =>
  `<div>${Object.entries(depts)
    .map(
      ([code, name]) =>
        `<div class="course-prefix row"><a href="x/${code}"><span class="prefix-abbrev push_one two columns">${code}</span><span class="prefix-name nine columns">${name}</span></a></div>`,
    )
    .join("")}</div>`;

interface Fake {
  pages: Map<string, string>;
  requests: string[];
  fetch: typeof fetch;
  /** PlanetTerp's professor list page at an offset; tests swap in broken answers. */
  professors: (offset: number) => Response;
  /** PlanetTerp's grades for a course. */
  grades: (course: string) => Response;
}

const planetTerpProfessors = (offset: number) =>
  Response.json(
    offset === 0
      ? [JSON.parse(planetterpKruskal), ...JSON.parse(planetterpPage)]
      : [],
  );
const planetTerpGrades = (course: string) =>
  course === "CMSC351"
    ? new Response(planetterpGrades)
    : new Response(planetterpCourseNotFound, { status: 400 });

function fakeInternet(): Fake {
  const pages = new Map<string, string>([
    [`${SOC}/`, socIndex],
    [
      `${SOC}/202701`,
      deptList({
        AGNR: "Agriculture and Natural Resources",
        CMSC: "Computer Science",
      }),
    ],
    [`${SOC}/202701/AGNR`, agnrDept],
    [`${SOC}/202701/CMSC`, cmscDept],
    [`${SOC}/202701/sections/AGNR`, agnrSections],
    [`${SOC}/202701/sections/CMSC`, cmscSections],
    [
      `${SOC}/202608`,
      deptList({
        HESI: "Higher Education, Student Affairs, and International Education Policy",
      }),
    ],
    [`${SOC}/202608/HESI`, soc202608Dept],
    [`${SOC}/202608/sections/HESI`, soc202608Sections],
    [`${SOC}/202612`, deptList({ CMSC: "Computer Science" })],
    [`${SOC}/202612/CMSC`, soc202612Dept],
    [`${SOC}/202612/sections/CMSC`, soc202612Sections],
    [`${SOC}/202605`, deptList({ CMSC: "Computer Science" })],
    [`${SOC}/202605/CMSC`, soc202605Dept],
    [`${SOC}/202605/sections/CMSC`, soc202605Sections],
    ["https://provost.umd.edu/calendar.md", calendarMd],
    ["https://provost.umd.edu/calendar/archived", calendarArchived],
  ]);
  const requests: string[] = [];
  const fake: Fake = {
    pages,
    requests,
    professors: planetTerpProfessors,
    grades: planetTerpGrades,
    fetch: async (input) => {
      const url = String(input instanceof Request ? input.url : input);
      requests.push(url);
      // The sections endpoint: answer with the saved page for the first course's department.
      const sections = /\/soc\/(\d{6})\/sections\?courseIds=([A-Z]{4})/.exec(
        url,
      );
      const key = sections
        ? `${SOC}/${sections[1]}/sections/${sections[2]}`
        : url;
      if (url.startsWith("https://planetterp.com/api/v1/professors")) {
        return fake.professors(
          Number(new URL(url).searchParams.get("offset")),
        );
      }
      if (url.startsWith("https://planetterp.com/api/v1/grades")) {
        return fake.grades(new URL(url).searchParams.get("course") ?? "");
      }
      if (url.startsWith("https://services9.arcgis.com/"))
        return new Response(buildingAllSearch);
      if (url.startsWith(`${SOC}/buildings/ZZZ`))
        return new Response(buildingPopup);
      const page = pages.get(key);
      return page === undefined
        ? new Response("not found", { status: 404 })
        : new Response(page, { headers: { "Content-Type": "text/html" } });
    },
  };
  return fake;
}

async function readJson<T>(
  key: string,
  schema: { parse(v: unknown): T },
): Promise<T> {
  const object = await env.DATA.get(key);
  if (!object) throw new Error(`missing ${key}`);
  return schema.parse(await object.json());
}

const at = (iso: string) => new Date(iso);

// Jobs log a summary per run; keep test output readable.
beforeEach(() => {
  for (const level of ["info", "warn", "error"] as const) {
    vi.spyOn(console, level).mockImplementation(() => {});
  }
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("catalog job", () => {
  it("publishes terms, chunks and manifests, and rewrites nothing on an unchanged rerun", async () => {
    const fake = fakeInternet();
    await runCatalogJob({
      env,
      now: at("2026-09-25T12:00:00Z"),
      fetch: fake.fetch,
    });

    const terms = await readJson(TERMS_KEY, TermsFileSchema);
    expect(terms.terms.map((t) => `${t.id}:${t.status}`)).toEqual([
      "202701:active",
      "202612:active",
      "202608:active",
      "202605:active",
    ]);
    const manifest = await readJson(manifestKey("202701"), ManifestSchema);
    expect(
      manifest.departments.map((d) => [d.code, d.name, d.courseCount]),
    ).toEqual([
      ["AGNR", "Agriculture and Natural Resources", 2],
      ["CMSC", "Computer Science", 75],
    ]);
    const cmsc = manifest.departments[1];
    const chunk = await readJson(
      deptChunkKey("202701", "CMSC", cmsc?.hash ?? ""),
      DeptChunkSchema,
    );
    expect(
      chunk.courses.find((c) => c.code === "CMSC131")?.sections,
    ).toHaveLength(9);

    const before = (await env.DATA.list({ prefix: "catalog/" })).objects.map(
      (o) => `${o.key}@${o.etag}`,
    );
    await runCatalogJob({
      env,
      now: at("2026-09-25T18:00:00Z"),
      fetch: fake.fetch,
    });
    const after = (
      await env.DATA.list({ prefix: "catalog/202701/dept/" })
    ).objects.map((o) => `${o.key}@${o.etag}`);
    expect(after.every((entry) => before.includes(entry))).toBe(true);
    const again = await readJson(manifestKey("202701"), ManifestSchema);
    expect(again.catalogCrawledAt).toBe("2026-09-25T18:00:00.000Z");
    expect(again.departments).toEqual(manifest.departments);
  });

  it("archives a term Testudo drops, and keeps its files", async () => {
    const fake = fakeInternet();
    await runCatalogJob({
      env,
      now: at("2026-09-25T12:00:00Z"),
      fetch: fake.fetch,
    });
    fake.pages.set(
      `${SOC}/`,
      socIndex.replace(/<option value="202605">Summer 2026<\/option>/, ""),
    );
    await runCatalogJob({
      env,
      now: at("2026-09-26T12:00:00Z"),
      fetch: fake.fetch,
    });
    const terms = await readJson(TERMS_KEY, TermsFileSchema);
    expect(terms.terms.find((t) => t.id === "202605")?.status).toBe("archived");
    expect(await env.DATA.head(manifestKey("202605"))).not.toBeNull();
  });

  it("keeps a department's previous chunk when its page fails", async () => {
    const fake = fakeInternet();
    await runCatalogJob({
      env,
      now: at("2026-09-25T12:00:00Z"),
      fetch: fake.fetch,
    });
    const first = await readJson(manifestKey("202701"), ManifestSchema);
    fake.pages.delete(`${SOC}/202701/CMSC`);
    await runCatalogJob({
      env,
      now: at("2026-09-25T18:00:00Z"),
      fetch: fake.fetch,
    });
    const second = await readJson(manifestKey("202701"), ManifestSchema);
    expect(second.departments.find((d) => d.code === "CMSC")).toEqual(
      first.departments.find((d) => d.code === "CMSC"),
    );
  });
});

describe("seats job", () => {
  it("publishes seats, then records changed and cancelled sections", async () => {
    const fake = fakeInternet();
    await runCatalogJob({
      env,
      now: at("2026-09-25T12:00:00Z"),
      fetch: fake.fetch,
    });
    await runSeatsJob({
      env,
      now: at("2026-09-25T12:05:00Z"),
      fetch: fake.fetch,
    });

    const manifest = await readJson(manifestKey("202701"), ManifestSchema);
    expect(manifest.seats?.fetchedAt).toBe("2026-09-25T12:05:00.000Z");
    const seats = await readJson(
      seatsKey("202701", manifest.seats?.hash ?? ""),
      SeatsFileSchema,
    );
    expect(seats.seats["CMSC131-0101"]).toEqual([30, 30, null, null]);
    // HESI's page has the stamp: 09/24/2026 10:30 PM Eastern.
    const fall = await readJson(manifestKey("202608"), ManifestSchema);
    expect(fall.seats?.asOf).toBe("2026-09-25T02:30:00.000Z");

    // Within the hour and the stamp hasn't moved: nothing is fetched but the stamp page.
    fake.requests.length = 0;
    await runSeatsJob({
      env,
      now: at("2026-09-25T12:10:00Z"),
      fetch: fake.fetch,
    });
    expect(fake.requests.some((u) => u.includes("/sections?"))).toBe(false);

    // An hour later Testudo moved CMSC131-0101 and dropped CMSC131-0102.
    // Edit only inside CMSC131's block; other courses use the same times and codes.
    const start = cmscSections.indexOf('id="CMSC131"');
    const end = cmscSections.indexOf('class="course-sections"', start + 40);
    const block = cmscSections
      .slice(start, end)
      .replace(
        '<span class="class-start-time">1:00pm</span> - <span class="class-end-time">1:50pm</span>',
        '<span class="class-start-time">2:00pm</span> - <span class="class-end-time">2:50pm</span>',
      )
      // 0102 disappears and a new section appears in its place.
      .replace(/(<span class="section-id">\s*)0102(\s*<\/span>)/, "$1XXXX$2");
    const moved =
      cmscSections.slice(0, start) + block + cmscSections.slice(end);
    fake.pages.set(`${SOC}/202701/sections/CMSC`, moved);
    await runSeatsJob({
      env,
      now: at("2026-09-25T13:15:00Z"),
      fetch: fake.fetch,
    });

    const later = await readJson(manifestKey("202701"), ManifestSchema);
    const changes = await readJson(
      changesKey("202701", later.changes?.hash ?? ""),
      ChangesFileSchema,
    );
    const kinds = changes.changes.map((c) => `${c.kind} ${c.sectionKey}`);
    expect(kinds).toContain("changed CMSC131-0101");
    expect(kinds).toContain("added CMSC131-XXXX");
    expect(kinds).toContain("cancelled CMSC131-0102");
    expect(later.changes?.latestAt).toBe("2026-09-25T13:15:00.000Z");

    // The department chunk follows in the same run.
    const cmsc = later.departments.find((d) => d.code === "CMSC");
    const chunk = await readJson(
      deptChunkKey("202701", "CMSC", cmsc?.hash ?? ""),
      DeptChunkSchema,
    );
    const c131 = chunk.courses.find((c) => c.code === "CMSC131");
    expect(c131?.sections.map((s) => s.code)).not.toContain("0102");
    expect(c131?.sections[0]?.meetings[0]).toMatchObject({
      start: 840,
      end: 890,
    });
  });
});

describe("planetterp job", () => {
  it("joins Testudo names to slugs and publishes grades per department", async () => {
    const fake = fakeInternet();
    await runCatalogJob({
      env,
      now: at("2026-09-25T12:00:00Z"),
      fetch: fake.fetch,
    });
    await runPlanetTerpJob({
      env,
      now: at("2026-09-26T05:17:00Z"),
      fetch: fake.fetch,
    });

    const manifest = await readJson(
      PLANETTERP_MANIFEST_KEY,
      PlanetTerpManifestSchema,
    );
    expect(manifest.gradesThrough).toBe("202501");
    const cmsc = manifest.departments.find((d) => d.code === "CMSC");
    const file = await readJson(
      planetTerpDeptKey("CMSC", cmsc?.hash ?? ""),
      PlanetTerpDeptSchema,
    );
    expect(file.names["clyde kruskal"]).toBe("kruskal");
    expect(file.instructors.kruskal).toMatchObject({
      name: "Clyde Kruskal",
      type: "professor",
      reviewCount: 111,
    });
    expect(file.instructors.kruskal?.latestReviewAt).toMatch(/^20\d\d-/);
    const grades = file.courses.CMSC351;
    // W and Other are kept, summed over every semester.
    expect(grades?.all?.counts).toHaveLength(15);
    expect(grades?.all?.latestTermId).toBe("202501");
    expect(grades?.byInstructor.kruskal?.semesters).toBeGreaterThan(1);
    expect(file.courses.CMSC131).toEqual({ all: null, byInstructor: {} });

    // The manifest says how current PlanetTerp is. The fixture's newest
    // review is from April, months before this run: stale, not broken.
    expect(manifest.source).toEqual({
      status: "stale",
      lastSuccessAt: "2026-09-26T05:17:00.000Z",
      gradesThrough: "202501",
      latestReviewAt: "2026-04-19T23:53:54.033Z",
    });
    // Review text is kept privately for summaries.
    const kept = await readJson(
      planetTerpReviewsKey("kruskal"),
      StoredReviewsSchema,
    );
    expect(kept.reviews).toHaveLength(111);
    expect(kept.reviews[0]?.text.length).toBeGreaterThan(0);
  });

  /** A good run, then one with PlanetTerp answering `professors`; returns what was captured. */
  async function goodThenBroken(
    professors: (offset: number) => Response,
    brokenAt = "2026-09-27T05:17:00Z",
  ) {
    const fake = fakeInternet();
    await runCatalogJob({
      env,
      now: at("2026-09-25T12:00:00Z"),
      fetch: fake.fetch,
    });
    await runPlanetTerpJob({
      env,
      now: at("2026-09-26T05:17:00Z"),
      fetch: fake.fetch,
    });
    const before = await readJson(
      PLANETTERP_MANIFEST_KEY,
      PlanetTerpManifestSchema,
    );
    const reviewsBefore = await env.DATA.get(planetTerpReviewsKey("kruskal"));

    fake.professors = professors;
    const events: { event: string; properties: Record<string, unknown> }[] =
      [];
    const run = runPlanetTerpJob({
      env: { ...env, POSTHOG_TOKEN: "test-token" },
      now: at(brokenAt),
      fetch: async (input, init) => {
        if (String(input).startsWith("https://us.i.posthog.com/")) {
          events.push(JSON.parse(String(init?.body)));
          return new Response("ok");
        }
        return fake.fetch(input, init);
      },
    });
    return { before, reviewsBefore, run, events };
  }

  it("keeps the last good files and marks PlanetTerp stale when its list comes back empty", async () => {
    const { before, reviewsBefore, run, events } = await goodThenBroken(() =>
      Response.json([]),
    );
    await expect(run).rejects.toThrow(/PlanetTerp listed no professors/);

    const after = await readJson(
      PLANETTERP_MANIFEST_KEY,
      PlanetTerpManifestSchema,
    );
    // Same department files, still published; only the source block changed.
    expect(after.departments).toEqual(before.departments);
    expect(after.generatedAt).toBe(before.generatedAt);
    expect(after.source).toMatchObject({
      status: "stale",
      lastSuccessAt: "2026-09-26T05:17:00.000Z",
      gradesThrough: "202501",
    });
    const cmsc = after.departments.find((d) => d.code === "CMSC");
    const file = await readJson(
      planetTerpDeptKey("CMSC", cmsc?.hash ?? ""),
      PlanetTerpDeptSchema,
    );
    expect(file.instructors.kruskal?.reviewCount).toBe(111);
    // Stored review text isn't touched either.
    expect((await env.DATA.get(planetTerpReviewsKey("kruskal")))?.etag).toBe(
      reviewsBefore?.etag,
    );

    const state = (await (
      await env.DATA.get("_jobs/planetterp/state.json")
    )?.json()) as Record<string, unknown>;
    expect(state).toMatchObject({
      status: "stale",
      reason: "PlanetTerp listed no professors",
      lastSuccessAt: "2026-09-26T05:17:00.000Z",
      professors: 11,
      reviews: 171,
    });

    const failed = events.find((e) => e.event === "cron_job_failed");
    expect(failed?.properties).toMatchObject({
      job: "planetterp",
      firstError: "PlanetTerp listed no professors",
      counts: { professors: 0, reviews: 0, previousProfessors: 11 },
    });
  });

  it("treats a list more than 10% short as a failure, and weeks of them as gone", async () => {
    // Kruskal's page drops out: 10 of 11 professors, 60 of 171 reviews.
    const { before, run, events } = await goodThenBroken(
      (offset) =>
        offset === 0 ? new Response(planetterpPage) : Response.json([]),
      "2026-10-28T05:17:00Z",
    );
    await expect(run).rejects.toThrow(/60 reviews, down from 171/);
    const after = await readJson(
      PLANETTERP_MANIFEST_KEY,
      PlanetTerpManifestSchema,
    );
    expect(after.departments).toEqual(before.departments);
    // Over 30 days since the last good run.
    expect(after.source?.status).toBe("gone");
    expect(
      events.find((e) => e.event === "cron_job_failed")?.properties.firstError,
    ).toMatch(/the floor is 154/);
  });

  it("never replaces stored grades with an empty answer", async () => {
    const fake = fakeInternet();
    await runCatalogJob({
      env,
      now: at("2026-09-25T12:00:00Z"),
      fetch: fake.fetch,
    });
    await runPlanetTerpJob({
      env,
      now: at("2026-09-26T05:17:00Z"),
      fetch: fake.fetch,
    });
    // PlanetTerp forgets CMSC351: "course not found", then an empty list.
    for (const [day, answer] of [
      ["27", () => new Response(planetterpCourseNotFound, { status: 400 })],
      ["28", () => Response.json([])],
    ] as const) {
      fake.grades = answer;
      await runPlanetTerpJob({
        env,
        now: at(`2026-09-${day}T05:17:00Z`),
        fetch: fake.fetch,
      });
      const manifest = await readJson(
        PLANETTERP_MANIFEST_KEY,
        PlanetTerpManifestSchema,
      );
      const cmsc = manifest.departments.find((d) => d.code === "CMSC");
      const file = await readJson(
        planetTerpDeptKey("CMSC", cmsc?.hash ?? ""),
        PlanetTerpDeptSchema,
      );
      expect(file.courses.CMSC351?.all?.latestTermId).toBe("202501");
      expect(file.courses.CMSC351?.byInstructor.kruskal).toBeDefined();
      expect(manifest.source?.gradesThrough).toBe("202501");
    }

    // Any other 400 is an error, not "no grades": the course keeps its rows.
    fake.grades = () =>
      Response.json({ error: "something else" }, { status: 400 });
    await runPlanetTerpJob({
      env,
      now: at("2026-09-29T05:17:00Z"),
      fetch: fake.fetch,
    });
    const manifest = await readJson(
      PLANETTERP_MANIFEST_KEY,
      PlanetTerpManifestSchema,
    );
    expect(manifest.gradesThrough).toBe("202501");
  });
});

describe("calendar + buildings job", () => {
  it("publishes term calendars and joins new building codes", async () => {
    const fake = fakeInternet();
    await runCatalogJob({
      env,
      now: at("2026-09-25T12:00:00Z"),
      fetch: fake.fetch,
    });
    // A code the seed doesn't know, seen with a room.
    await env.DATA.put(
      "_jobs/catalog/building-rooms.json",
      JSON.stringify({
        codes: { ZZZ: { room: "2102", lastSeen: "2026-09-25T12:00:00.000Z" } },
      }),
    );
    await runCalendarBuildingsJob({
      env,
      now: at("2026-09-28T06:23:00Z"),
      fetch: fake.fetch,
    });

    const spring = await readJson(
      calendarKey("202701"),
      AcademicCalendarSchema,
    );
    expect(spring).toMatchObject({
      status: "published",
      classesStart: "2027-01-27",
      classesEnd: "2027-05-11",
    });
    const summer = await readJson(
      calendarKey("202605"),
      AcademicCalendarSchema,
    );
    expect(summer).toMatchObject({
      status: "published",
      source: "https://provost.umd.edu/calendar/archived",
    });

    const geo = await readJson(GEO_MANIFEST_KEY, GeoManifestSchema);
    expect(geo.routes).toBeNull();
    const buildings = await readJson(
      buildingsKey(geo.buildings.hash),
      BuildingsFileSchema,
    );
    expect(buildings.buildings.find((b) => b.code === "IRB")).toMatchObject({
      number: "432",
    });
    expect(buildings.buildings.find((b) => b.code === "ZZZ")).toMatchObject({
      number: "037",
    });
    expect(buildings.offCampus.map((o) => o.code)).toContain("BLD4");
  });

  it("marks terms the provost hasn't published", async () => {
    const fake = fakeInternet();
    await env.DATA.put(
      TERMS_KEY,
      JSON.stringify({
        schemaVersion: 1,
        generatedAt: "2026-09-25T12:00:00.000Z",
        terms: [
          {
            id: "203008",
            name: "Fall 2030",
            season: "fall",
            year: 2030,
            status: "active",
            firstSeen: "2026-09-25T12:00:00.000Z",
            lastSeen: "2026-09-25T12:00:00.000Z",
          },
        ],
      }),
    );
    await runCalendarBuildingsJob({
      env,
      now: at("2026-09-28T06:23:00Z"),
      fetch: fake.fetch,
    });
    expect(
      (await readJson(calendarKey("203008"), AcademicCalendarSchema)).status,
    ).toBe("not-published");
  });
});
