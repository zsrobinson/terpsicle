import { onlineManager, type QueryClient } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  calendarKey,
  GEO_MANIFEST_KEY,
  type GeoManifest,
  PLANETTERP_MANIFEST_KEY,
  type PlanetTerpManifest,
  planetTerpDeptKey,
  routeGeometryKey,
  routesKey,
} from "~/core/schema";
import {
  aPlanetTerpDept,
  archivedFixtureTermId,
  fixtureTermId,
  mockDataSource,
} from "~/fixtures";
import {
  createBucketDataSource,
  DataError,
  type DataSource,
} from "../data-source";
import {
  calendarQuery,
  campusFrom,
  ensureCampus,
  ensurePlanetTerpDepts,
  isNotPublished,
  loadedCampus,
  planetTerpManifestQuery,
  routeGeometryQuery,
} from "./catalog";
import {
  createMemoryQueryStorage,
  flushQueryStorage,
  setQueryStorage,
} from "./persister";
import { whenNewerFormat } from "./published";
import { createTestQueryClient } from "./testing";

// The catalog's reference data through the query cache (DATA.md §5.1
// step 6, §5.5): PlanetTerp, the campus map (a binary file among them) and
// academic calendars, against the mock bucket with the persister writing
// to memory. What's fetched, what's kept, and what happens offline.

const bucket = createBucketDataSource(mockDataSource);
const hash = (n: number) => n.toString(16).padStart(16, "0");

/** The mock bucket as a server: reads counted, files replaceable, and it can go away. */
function aServer() {
  const json = new Map<string, unknown>();
  const binary = new Map<string, ArrayBuffer>();
  const failing = new Set<string>();
  const deleted = new Set<string>();
  const reads: string[] = [];
  let offline = false;
  const gone = (key: string) => {
    reads.push(key);
    if (offline || failing.has(key))
      throw new DataError(key, "network", "offline");
    if (deleted.has(key)) throw new DataError(key, "missing", "deleted");
  };
  const source: DataSource = {
    kind: "live",
    async readJson(key, options) {
      gone(key);
      if (json.has(key)) return structuredClone(json.get(key));
      return bucket.readJson(key, options);
    },
    async readBinary(key) {
      gone(key);
      const bytes = binary.get(key);
      return bytes ? bytes.slice(0) : bucket.readBinary(key);
    },
  };
  return {
    json,
    binary,
    failing,
    deleted,
    source,
    setOffline: (value: boolean) => {
      offline = value;
    },
    take: () => reads.splice(0).sort(),
  };
}

let storage: ReturnType<typeof createMemoryQueryStorage>;
let pages: QueryClient[] = [];
/** A page: a fresh client over the same saved rows, as a reload would be. */
function aPage(): QueryClient {
  const client = createTestQueryClient();
  pages.push(client);
  return client;
}

/** Lets a restored pointer's background check, and its saves, finish. */
async function settled(client: QueryClient) {
  await vi.waitFor(() => expect(client.isFetching()).toBe(0));
  await new Promise((resolve) => setTimeout(resolve, 0));
  await flushQueryStorage();
  await new Promise((resolve) => setTimeout(resolve, 0));
}

/** The R2 keys saved now, sorted. */
const savedKeys = () =>
  [...storage.rows.keys()]
    .map((k) => JSON.parse(k.slice(k.indexOf("-") + 1))[2] as string)
    .sort();

/** A copy of routes bytes with the magic wiped: not a routes file. */
function spoiled(bytes: ArrayBuffer): ArrayBuffer {
  const copy = bytes.slice(0);
  new Uint8Array(copy).fill(0, 0, 4);
  return copy;
}

async function mockGeoManifest(): Promise<GeoManifest> {
  return (await bucket.readJson(GEO_MANIFEST_KEY)) as GeoManifest;
}
async function mockPlanetTerpManifest(): Promise<PlanetTerpManifest> {
  return (await bucket.readJson(PLANETTERP_MANIFEST_KEY)) as PlanetTerpManifest;
}

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  storage = createMemoryQueryStorage();
  setQueryStorage(storage);
});
afterEach(async () => {
  for (const client of pages) await settled(client);
  pages = [];
  whenNewerFormat(null);
  setQueryStorage(null);
  onlineManager.setOnline(true);
  vi.restoreAllMocks();
});

describe("PlanetTerp", () => {
  it("loads each department on its own: one that can't load is left out, unrated", async () => {
    const server = aServer();
    const manifest = await mockPlanetTerpManifest();
    const [first, second] = manifest.departments;
    if (!first || !second) throw new Error("the mock has two departments");
    server.failing.add(planetTerpDeptKey(second.code, second.hash));
    const files = await ensurePlanetTerpDepts(aPage(), server.source, [
      first.code,
      second.code,
      "ZZZZ",
    ]);
    expect([...files.keys()]).toEqual([first.code]);
  });

  it("brings a saved department's new file along with a changed manifest, then drops the old one", async () => {
    const server = aServer();
    const manifest = await mockPlanetTerpManifest();
    const first = manifest.departments[0];
    if (!first) throw new Error("the mock has a department");
    const page = aPage();
    await ensurePlanetTerpDepts(page, server.source, [first.code]);
    await settled(page);

    // The next day: this department's file changed.
    const changed = {
      ...manifest,
      departments: manifest.departments.map((d) =>
        d.code === first.code ? { ...d, hash: hash(7) } : d,
      ),
    };
    server.json.set(PLANETTERP_MANIFEST_KEY, changed);
    server.json.set(
      planetTerpDeptKey(first.code, hash(7)),
      aPlanetTerpDept({ dept: first.code }),
    );
    server.take();
    const next = aPage();
    await ensurePlanetTerpDepts(next, server.source, [first.code]);
    await settled(next);
    expect(server.take()).toEqual(
      [PLANETTERP_MANIFEST_KEY, planetTerpDeptKey(first.code, hash(7))].sort(),
    );
    // Saved: the new manifest and the new file, the old file gone.
    expect(savedKeys()).toEqual(
      [PLANETTERP_MANIFEST_KEY, planetTerpDeptKey(first.code, hash(7))].sort(),
    );
    const row = [...storage.rows].find(([k]) =>
      k.includes(PLANETTERP_MANIFEST_KEY),
    )?.[1] as { state: { data: PlanetTerpManifest } };
    expect(
      row.state.data.departments.find((d) => d.code === first.code)?.hash,
    ).toBe(hash(7));
  });

  it("keeps the old manifest and file, on disk too, when the new file can't load", async () => {
    const server = aServer();
    const manifest = await mockPlanetTerpManifest();
    const first = manifest.departments[0];
    if (!first) throw new Error("the mock has a department");
    const page = aPage();
    await ensurePlanetTerpDepts(page, server.source, [first.code]);
    await settled(page);

    server.json.set(PLANETTERP_MANIFEST_KEY, {
      ...manifest,
      departments: manifest.departments.map((d) =>
        d.code === first.code ? { ...d, hash: hash(7) } : d,
      ),
    });
    server.failing.add(planetTerpDeptKey(first.code, hash(7)));
    const next = aPage();
    const files = await ensurePlanetTerpDepts(next, server.source, [
      first.code,
    ]);
    await settled(next);
    // The saved (old) numbers still show, and the disk still has them.
    expect(files.has(first.code)).toBe(true);
    expect(savedKeys()).toEqual(
      [
        PLANETTERP_MANIFEST_KEY,
        planetTerpDeptKey(first.code, first.hash),
      ].sort(),
    );
  });

  it("asks for the manifest again, once, when it names a file the server deleted", async () => {
    const server = aServer();
    const manifest = await mockPlanetTerpManifest();
    const [first, second] = manifest.departments;
    if (!first || !second) throw new Error("the mock has two departments");
    // This page has the manifest in memory; since then the server moved
    // the first department to a new hash and deleted the old file.
    const page = aPage();
    await page.fetchQuery(planetTerpManifestQuery(server.source));
    await settled(page);
    server.deleted.add(planetTerpDeptKey(first.code, first.hash));
    server.json.set(PLANETTERP_MANIFEST_KEY, {
      ...manifest,
      departments: manifest.departments.map((d) =>
        d.code === first.code ? { ...d, hash: hash(7) } : d,
      ),
    });
    server.json.set(
      planetTerpDeptKey(first.code, hash(7)),
      aPlanetTerpDept({ dept: first.code }),
    );
    server.take();
    const files = await ensurePlanetTerpDepts(page, server.source, [
      first.code,
      second.code,
    ]);
    expect([...files.keys()].sort()).toEqual([first.code, second.code].sort());
    expect(server.take()).toEqual(
      [
        planetTerpDeptKey(first.code, first.hash),
        planetTerpDeptKey(second.code, second.hash),
        PLANETTERP_MANIFEST_KEY,
        planetTerpDeptKey(first.code, hash(7)),
      ].sort(),
    );

    // Still gone at the new hash, with nothing saved: asked once, then
    // left out, unrated.
    await settled(page);
    server.deleted.add(planetTerpDeptKey(first.code, hash(7)));
    storage.rows.clear();
    const next = aPage();
    await next.fetchQuery(planetTerpManifestQuery(server.source));
    await settled(next);
    server.take();
    const again = await ensurePlanetTerpDepts(next, server.source, [
      first.code,
    ]);
    expect(again.size).toBe(0);
    expect(server.take()).toEqual(
      [planetTerpDeptKey(first.code, hash(7)), PLANETTERP_MANIFEST_KEY].sort(),
    );
  });
});

describe("a newer format than this build reads", () => {
  it("tells the listener (the catalog store's Reload), for each family", async () => {
    const heard: string[] = [];
    whenNewerFormat((family) => heard.push(family));
    const server = aServer();
    const newer = (value: unknown) => ({
      ...(value as object),
      schemaVersion: 99,
    });
    server.json.set(
      PLANETTERP_MANIFEST_KEY,
      newer(await mockPlanetTerpManifest()),
    );
    server.json.set(GEO_MANIFEST_KEY, newer(await mockGeoManifest()));
    server.json.set(
      calendarKey(fixtureTermId),
      newer(await bucket.readJson(calendarKey(fixtureTermId))),
    );
    const page = aPage();
    expect(
      (await ensurePlanetTerpDepts(page, server.source, ["CMSC"])).size,
    ).toBe(0);
    await expect(ensureCampus(page, server.source)).rejects.toThrow(
      /schema version 99/,
    );
    await expect(
      page.fetchQuery(calendarQuery(server.source, fixtureTermId)),
    ).rejects.toThrow(/schema version 99/);
    expect(heard.sort()).toEqual(["calendar", "geo", "planetterp"]);
  });

  it("stays quiet for an older format or a broken file", async () => {
    const heard: string[] = [];
    whenNewerFormat((family) => heard.push(family));
    const server = aServer();
    server.json.set(GEO_MANIFEST_KEY, {
      ...(await mockGeoManifest()),
      schemaVersion: 0,
    });
    server.json.set(calendarKey(fixtureTermId), { schemaVersion: 1 });
    const page = aPage();
    await expect(ensureCampus(page, server.source)).rejects.toThrow();
    await expect(
      page.fetchQuery(calendarQuery(server.source, fixtureTermId)),
    ).rejects.toThrow();
    expect(heard).toEqual([]);
  });
});

describe("the campus map", () => {
  it("loads the buildings and the routes binary, and a reload reads both from disk", async () => {
    const server = aServer();
    const manifest = await mockGeoManifest();
    const page = aPage();
    const campus = await ensureCampus(page, server.source);
    expect(campus.routes).not.toBeNull();
    await settled(page);
    expect(savedKeys()).toContain(routesKey(manifest.routes?.hash ?? ""));

    // Offline from here: the map comes from the query cache's rows.
    server.setOffline(true);
    onlineManager.setOnline(false);
    server.take();
    const offline = aPage();
    const again = await ensureCampus(offline, server.source);
    expect(again.routes).not.toBeNull();
    expect(again.offCampus).toEqual(campus.offCampus);
    // Only the manifest's check asked, and failed at once.
    await settled(offline);
    expect(server.take()).toEqual([GEO_MANIFEST_KEY]);
  });

  it("brings a changed routes binary before saving the manifest", async () => {
    const server = aServer();
    const manifest = await mockGeoManifest();
    const oldRoutes = manifest.routes;
    if (!oldRoutes) throw new Error("the mock has routes");
    const page = aPage();
    await ensureCampus(page, server.source);
    await settled(page);

    // New routes, same bytes, at a new hash.
    server.json.set(GEO_MANIFEST_KEY, {
      ...manifest,
      routes: { ...oldRoutes, hash: hash(9) },
    });
    server.binary.set(
      routesKey(hash(9)),
      await bucket.readBinary(routesKey(oldRoutes.hash)),
    );
    server.take();
    const next = aPage();
    await ensureCampus(next, server.source);
    await settled(next);
    expect(server.take()).toContain(routesKey(hash(9)));
    expect(savedKeys()).toContain(routesKey(hash(9)));
    expect(savedKeys()).not.toContain(routesKey(oldRoutes.hash));
  });

  it("reads what's loaded without loading more", async () => {
    const server = aServer();
    const page = aPage();
    expect(loadedCampus(page, server.source).routes).toBeNull();
    await ensureCampus(page, server.source);
    server.take();
    expect(loadedCampus(page, server.source).routes).not.toBeNull();
    expect(server.take()).toEqual([]);
  });

  it("says a routes file that doesn't decode is broken, and never saves it", async () => {
    const server = aServer();
    const manifest = await mockGeoManifest();
    const key = routesKey(manifest.routes?.hash ?? "");
    server.binary.set(key, spoiled(await bucket.readBinary(key)));
    const page = aPage();
    const error = await ensureCampus(page, server.source).catch(
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(DataError);
    expect((error as DataError).reason).toBe("invalid");
    await settled(page);
    expect(savedKeys()).not.toContain(key);
    // What's loaded reads as no routes, never a throw.
    expect(loadedCampus(page, server.source).routes).toBeNull();
  });

  it("drops a saved routes file that doesn't decode, and fetches it again", async () => {
    const server = aServer();
    const manifest = await mockGeoManifest();
    const key = routesKey(manifest.routes?.hash ?? "");
    const page = aPage();
    await ensureCampus(page, server.source);
    await settled(page);
    // The disk's copy goes bad (an old build's bug, a torn write).
    const row = [...storage.rows].find(([k]) => k.includes(key))?.[1] as {
      state: { data: ArrayBuffer };
    };
    new Uint8Array(row.state.data).fill(0, 0, 4);

    server.take();
    const next = aPage();
    const campus = await ensureCampus(next, server.source);
    expect(campus.routes).not.toBeNull();
    expect(server.take()).toContain(key);
    await settled(next);
    const saved = [...storage.rows].find(([k]) => k.includes(key))?.[1] as {
      state: { data: ArrayBuffer };
    };
    expect(campusFrom(undefined, saved.state.data).routes).not.toBeNull();
  });

  it("builds the map without throwing whatever bytes it's handed", async () => {
    const manifest = await mockGeoManifest();
    const bytes = await bucket.readBinary(
      routesKey(manifest.routes?.hash ?? ""),
    );
    expect(campusFrom(undefined, spoiled(bytes)).routes).toBeNull();
    expect(campusFrom(undefined, new ArrayBuffer(3)).routes).toBeNull();
  });

  it("fails at once offline with nothing saved, rather than waiting", async () => {
    const server = aServer();
    server.setOffline(true);
    onlineManager.setOnline(false);
    await expect(ensureCampus(aPage(), server.source)).rejects.toThrow(
      /offline/,
    );
    expect(server.take()).toEqual([GEO_MANIFEST_KEY]);
  });
});

describe("academic calendars", () => {
  it("saves each term's calendar, and one term's never drops another's", async () => {
    const server = aServer();
    const page = aPage();
    await page.fetchQuery(calendarQuery(server.source, fixtureTermId));
    await page
      .fetchQuery(calendarQuery(server.source, archivedFixtureTermId))
      .catch(() => null);
    await settled(page);
    const saved = savedKeys();
    expect(saved).toContain(calendarKey(fixtureTermId));

    // A reload, offline: the saved calendar shows.
    server.setOffline(true);
    onlineManager.setOnline(false);
    const next = aPage();
    const calendar = await next.fetchQuery(
      calendarQuery(server.source, fixtureTermId),
    );
    expect(calendar.termId).toBe(fixtureTermId);
    await settled(next);
    expect(savedKeys()).toEqual(saved);
  });

  it("reads a term with no file as not published, not as an error", async () => {
    const server = aServer();
    const error = await aPage()
      .fetchQuery(calendarQuery(server.source, "199901"))
      .catch((e: unknown) => e);
    expect(isNotPublished(error)).toBe(true);
    expect(server.take()).toEqual([calendarKey("199901")]);
  });
});

describe("a connection's walking path", () => {
  it("is null when there's no file: hide the map, never a straight line", async () => {
    const server = aServer();
    const path = await aPage().fetchQuery(
      routeGeometryQuery(server.source, "NOPE", "NADA", "standard"),
    );
    expect(path).toBeNull();
    expect(server.take()).toEqual([
      routeGeometryKey("NOPE", "NADA", "standard"),
    ]);
  });
});
