import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  changesKey,
  type DeptCode,
  deptChunkKey,
  manifestKey,
  SCHEMA_VERSIONS,
  seatsKey,
  TERMS_KEY,
  type TermId,
} from "~/core/schema";
import {
  aChangesFile,
  aCourse,
  aDeptChunk,
  aManifest,
  aManifestDepartment,
  archivedFixtureTermId,
  aSeatsFile,
  aTerm,
  aTermsFile,
  fixtureTermId,
} from "~/fixtures";
import { type CatalogEvent, useCatalog } from "./catalog-store";
import { createMemoryCache, SCHEMA_VERSIONS_KEY } from "./data-cache";
import { useCatalogPolling, useSeatsFreshness } from "./data-hooks";
import { createDataReader, DataError, type DataSource } from "./data-source";
import { resetStores } from "./testing";

// The catalog store against a fake server and an in-memory cache: what it
// fetches, what it keeps, and what it shows when the server is away
// (DATA.md §5.1).

const hash = (n: number) => n.toString(16).padStart(16, "0");
const ACTIVE = fixtureTermId;
const ARCHIVED = archivedFixtureTermId;

/** A fake /data: published files by key, the keys read, and an off switch. */
function aServer() {
  const files = new Map<string, unknown>();
  const reads: string[] = [];
  let offline = false;
  const source: DataSource = {
    kind: "live",
    async readJson(key) {
      reads.push(key);
      if (offline) throw new DataError(key, "network", "offline");
      if (!files.has(key)) throw new DataError(key, "missing", "missing");
      return structuredClone(files.get(key));
    },
    async readBinary(key) {
      throw new DataError(key, "missing", "missing");
    },
  };
  files.set(
    TERMS_KEY,
    aTermsFile({
      terms: [
        aTerm(),
        aTerm({
          id: ARCHIVED,
          name: "Summer 2026",
          season: "summer",
          year: 2026,
          status: "archived",
        }),
      ],
    }),
  );
  return {
    files,
    reads,
    source,
    setOffline: (value: boolean) => {
      offline = value;
    },
    /** The keys read since the last call. */
    take: () => reads.splice(0),
    /**
     * Publishes a term: each department's chunk under its hash (one course,
     * `<DEPT>100`, titled with the version), seats and changes.
     */
    publish(
      termId: TermId,
      depts: Record<DeptCode, number>,
      seatsVersion = 1,
      schemaVersion = 1,
    ) {
      const departments = Object.entries(depts).map(([code, v]) => {
        files.set(
          deptChunkKey(termId, code, hash(v)),
          aDeptChunk({
            termId,
            dept: code,
            courses: [aCourse({ code: `${code}100`, title: `${code} v${v}` })],
          }),
        );
        return aManifestDepartment({ code, name: code, hash: hash(v) });
      });
      const seatsHash = hash(1000 + seatsVersion);
      const seats = aSeatsFile({
        termId,
        asOf: `2026-09-25T0${seatsVersion}:00:00.000Z`,
      });
      files.set(seatsKey(termId, seatsHash), seats);
      files.set(changesKey(termId, hash(2000)), aChangesFile({ termId }));
      files.set(
        manifestKey(termId),
        aManifest({
          schemaVersion: schemaVersion as 1,
          termId,
          departments,
          seats: {
            hash: seatsHash,
            asOf: seats.asOf,
            fetchedAt: seats.asOf ?? "",
          },
          changes: { hash: hash(2000), count: 1, latestAt: null },
        }),
      );
    },
  };
}

type Server = ReturnType<typeof aServer>;

/** A new page load: fresh store state over the same cache. */
function open(
  server: Server,
  cache: ReturnType<typeof createMemoryCache>,
  events: CatalogEvent[] = [],
) {
  useCatalog.getState().setReader(createDataReader(server.source), {
    cache,
    onEvent: (e) => events.push(e),
  });
  return events;
}

/** Lets background revalidation finish (the cache and fake server are microtasks). */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

const titles = (termId: TermId) =>
  [...(useCatalog.getState().byTerm[termId]?.index.courses.values() ?? [])]
    .map((c) => c.title)
    .sort();

const cachedDeptKeys = (cache: ReturnType<typeof createMemoryCache>) =>
  [...cache.files.keys()].filter((k) => k.includes("/dept/")).sort();

let server: Server;
let cache: ReturnType<typeof createMemoryCache>;

beforeEach(() => {
  resetStores();
  server = aServer();
  cache = createMemoryCache();
  server.publish(ACTIVE, { CMSC: 1, MATH: 2, ENGL: 3 });
  server.publish(ARCHIVED, { CMSC: 11 });
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("first load", () => {
  it("loads the plan's departments first, then the rest, and caches them all", async () => {
    const events = open(server, cache);
    await useCatalog.getState().loadTerms();
    server.take();
    await useCatalog.getState().ensureTerm(ACTIVE, ["MATH"]);

    const reads = server.take();
    const depts = reads.filter((k) => k.includes("/dept/"));
    expect(depts[0]).toBe(deptChunkKey(ACTIVE, "MATH", hash(2)));
    expect(depts).toHaveLength(3);
    const t = useCatalog.getState().byTerm[ACTIVE];
    expect(t?.complete).toBe(true);
    expect(t?.manifestSource).toBe("network");
    expect(t?.changes?.changes).toHaveLength(1);
    expect(titles(ACTIVE)).toEqual(["CMSC v1", "ENGL v3", "MATH v2"]);
    expect(cachedDeptKeys(cache)).toHaveLength(3);
    expect(cache.pointers.has(manifestKey(ACTIVE))).toBe(true);
    expect(events).toEqual([
      expect.objectContaining({
        type: "catalog_loaded",
        termId: ACTIVE,
        fromCache: false,
        deptsFetched: 5, // three departments, seats, changes
      }),
    ]);
  });

  it("starts instantly from the cache on the next visit, fetching only the manifest", async () => {
    open(server, cache);
    await useCatalog.getState().loadTerms();
    await useCatalog.getState().ensureTerm(ACTIVE);
    server.take();

    const events = open(server, cache);
    await useCatalog.getState().loadTerms();
    await useCatalog.getState().ensureTerm(ACTIVE);
    await settle();

    expect(titles(ACTIVE)).toEqual(["CMSC v1", "ENGL v3", "MATH v2"]);
    expect(server.take().sort()).toEqual([manifestKey(ACTIVE), TERMS_KEY]);
    expect(useCatalog.getState().byTerm[ACTIVE]?.manifestSource).toBe(
      "network",
    );
    expect(events).toEqual([
      expect.objectContaining({ fromCache: true, deptsFetched: 0 }),
    ]);
  });
});

describe("revalidating", () => {
  beforeEach(async () => {
    open(server, cache);
    await useCatalog.getState().loadTerms();
    await useCatalog.getState().ensureTerm(ACTIVE);
    server.take();
  });

  it("fetches only the departments whose hash changed, and evicts their old files", async () => {
    server.publish(ACTIVE, { CMSC: 4, MATH: 2, ENGL: 3 });
    await useCatalog.getState().refreshTerm(ACTIVE);

    expect(server.take()).toEqual([
      manifestKey(ACTIVE),
      deptChunkKey(ACTIVE, "CMSC", hash(4)),
    ]);
    expect(titles(ACTIVE)).toEqual(["CMSC v4", "ENGL v3", "MATH v2"]);
    expect(useCatalog.getState().byTerm[ACTIVE]?.complete).toBe(true);
    expect(cachedDeptKeys(cache)).toEqual(
      [
        deptChunkKey(ACTIVE, "CMSC", hash(4)),
        deptChunkKey(ACTIVE, "ENGL", hash(3)),
        deptChunkKey(ACTIVE, "MATH", hash(2)),
      ].sort(),
    );
  });

  it("drops departments the manifest no longer lists, from the index and the cache", async () => {
    server.publish(ACTIVE, { CMSC: 1, ENGL: 3 });
    await useCatalog.getState().refreshTerm(ACTIVE);

    expect(server.take()).toEqual([manifestKey(ACTIVE)]);
    expect(titles(ACTIVE)).toEqual(["CMSC v1", "ENGL v3"]);
    expect(cachedDeptKeys(cache)).not.toContain(
      deptChunkKey(ACTIVE, "MATH", hash(2)),
    );
  });

  it("fetches new seats when their hash changes, and nothing else", async () => {
    server.publish(ACTIVE, { CMSC: 1, MATH: 2, ENGL: 3 }, 2);
    await useCatalog.getState().refreshTerm(ACTIVE);

    expect(server.take()).toEqual([
      manifestKey(ACTIVE),
      seatsKey(ACTIVE, hash(1002)),
    ]);
    expect(useCatalog.getState().byTerm[ACTIVE]?.seats?.asOf).toBe(
      "2026-09-25T02:00:00.000Z",
    );
  });

  it("keeps the previous file when a new one fails validation", async () => {
    server.publish(ACTIVE, { CMSC: 5, MATH: 2, ENGL: 3 }, 3);
    server.files.set(deptChunkKey(ACTIVE, "CMSC", hash(5)), { nope: true });
    server.files.set(seatsKey(ACTIVE, hash(1003)), { schemaVersion: 1 });
    await useCatalog.getState().refreshTerm(ACTIVE);

    const t = useCatalog.getState().byTerm[ACTIVE];
    expect(titles(ACTIVE)).toContain("CMSC v1");
    expect(t?.depts.CMSC).toBe("ready");
    expect(t?.seats?.asOf).toBe("2026-09-25T01:00:00.000Z");
    // Not committed: the cached manifest never points at a file we lack.
    expect(cache.pointers.get(manifestKey(ACTIVE))?.data).toMatchObject({
      seats: { hash: hash(1001) },
    });
  });

  it("keeps what's loaded and marks the tab stale when the server has a newer format", async () => {
    server.publish(ACTIVE, { CMSC: 6 }, 1, SCHEMA_VERSIONS.catalog + 1);
    await useCatalog.getState().refreshTerm(ACTIVE);

    expect(useCatalog.getState().appStale).toBe(true);
    expect(titles(ACTIVE)).toEqual(["CMSC v1", "ENGL v3", "MATH v2"]);
  });
});

describe("a schema version bump in this build", () => {
  it("drops the cached files of that family and refetches everything", async () => {
    open(server, cache);
    await useCatalog.getState().loadTerms();
    await useCatalog.getState().ensureTerm(ACTIVE);
    // As if an older build (catalog v0) had filled the cache.
    cache.pointers.set(SCHEMA_VERSIONS_KEY, {
      data: { ...SCHEMA_VERSIONS, catalog: 0 },
      checkedAt: "2026-09-01T00:00:00.000Z",
    });
    server.take();

    const events = open(server, cache);
    await useCatalog.getState().loadTerms();
    await useCatalog.getState().ensureTerm(ACTIVE);

    expect(server.take().filter((k) => k.includes("/dept/"))).toHaveLength(3);
    expect(events).toEqual([
      expect.objectContaining({ fromCache: false, deptsFetched: 5 }),
    ]);
    expect(cache.pointers.get(SCHEMA_VERSIONS_KEY)?.data).toEqual(
      SCHEMA_VERSIONS,
    );
  });
});

describe("offline", () => {
  it("shows saved data, and says so quietly", async () => {
    open(server, cache);
    await useCatalog.getState().loadTerms();
    await useCatalog.getState().ensureTerm(ACTIVE);

    server.setOffline(true);
    const events = open(server, cache);
    await useCatalog.getState().loadTerms();
    await useCatalog.getState().ensureTerm(ACTIVE);
    await settle();

    const s = useCatalog.getState();
    expect(s.terms).toHaveLength(2);
    expect(s.termsError).toBeNull();
    expect(s.network).toBe("offline");
    expect(titles(ACTIVE)).toEqual(["CMSC v1", "ENGL v3", "MATH v2"]);
    expect(events).toEqual([expect.objectContaining({ fromCache: true })]);
    const { result } = renderHook(() => useSeatsFreshness(ACTIVE));
    expect(result.current).toMatchObject({
      state: "offline",
      text: "Offline · showing saved data",
    });
  });

  it("with nothing saved, gives a specific error, and a retry that works", async () => {
    server.setOffline(true);
    const events = open(server, cache);
    await useCatalog.getState().loadTerms();

    expect(useCatalog.getState().termsError).toBe(
      "Couldn't reach terpsicle.com to load the course catalog. Check your connection and try again.",
    );
    expect(events).toEqual([
      { type: "catalog_load_failed", termId: null, reason: "network" },
    ]);

    server.setOffline(false);
    await useCatalog.getState().retry();
    expect(useCatalog.getState().terms).toHaveLength(2);
    expect(useCatalog.getState().termsError).toBeNull();
    expect(useCatalog.getState().network).toBe("online");
  });

  it("marks the term failed when its manifest can't load and none is saved", async () => {
    const events = open(server, cache);
    await useCatalog.getState().loadTerms();
    server.setOffline(true);
    await useCatalog.getState().ensureTerm(ACTIVE);

    expect(useCatalog.getState().byTerm[ACTIVE]?.manifestState).toBe("error");
    expect(events).toContainEqual({
      type: "catalog_load_failed",
      termId: ACTIVE,
      reason: "network",
    });

    server.setOffline(false);
    await useCatalog.getState().retry();
    expect(useCatalog.getState().byTerm[ACTIVE]?.complete).toBe(true);
  });
});

describe("seat freshness and polling", () => {
  beforeEach(async () => {
    open(server, cache);
    await useCatalog.getState().loadTerms();
    await useCatalog.getState().ensureTerm(ACTIVE);
    await useCatalog.getState().ensureTerm(ARCHIVED);
    server.take();
  });

  it("reads Testudo's as-of time relative to now", () => {
    vi.useFakeTimers({ now: new Date("2026-09-25T01:02:30.000Z") });
    const { result } = renderHook(() => useSeatsFreshness(ACTIVE));
    expect(result.current).toEqual({
      state: "live",
      text: "Seats as of 2 min ago",
      asOf: "2026-09-25T01:00:00.000Z",
    });
  });

  it("says in plain words that an archived term's seats stopped updating", () => {
    const { result } = renderHook(() => useSeatsFreshness(ARCHIVED));
    expect(result.current.state).toBe("archived");
    expect(result.current.text).toBe(
      "Seats stopped updating when this term was archived.",
    );
  });

  it("polls the manifest every minute while visible, and not while hidden", async () => {
    vi.useFakeTimers();
    renderHook(() => useCatalogPolling(ACTIVE));
    await act(() => vi.advanceTimersByTimeAsync(60_000));
    expect(server.take()).toEqual([manifestKey(ACTIVE)]);

    const visibility = vi
      .spyOn(document, "visibilityState", "get")
      .mockReturnValue("hidden");
    await act(() => vi.advanceTimersByTimeAsync(120_000));
    expect(server.take()).toEqual([]);

    visibility.mockReturnValue("visible");
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(server.take()).toEqual([manifestKey(ACTIVE)]);
  });

  it("never polls an archived term", async () => {
    vi.useFakeTimers();
    renderHook(() => useCatalogPolling(ARCHIVED));
    await act(() => vi.advanceTimersByTimeAsync(180_000));
    expect(server.take()).toEqual([]);
  });

  it("keeps each term's plans and sections apart", () => {
    const active = useCatalog.getState().byTerm[ACTIVE]?.index;
    const archived = useCatalog.getState().byTerm[ARCHIVED]?.index;
    expect(active?.termId).toBe(ACTIVE);
    expect(archived?.termId).toBe(ARCHIVED);
    expect(archived?.courses.get("CMSC100")?.title).toBe("CMSC v11");
    expect(active?.courses.get("CMSC100")?.title).toBe("CMSC v1");
  });
});

describe("no cache", () => {
  it("works without one (IndexedDB unavailable)", async () => {
    useCatalog
      .getState()
      .setReader(createDataReader(server.source), { cache: null });
    await useCatalog.getState().loadTerms();
    await useCatalog.getState().ensureTerm(ACTIVE);
    await waitFor(() =>
      expect(useCatalog.getState().byTerm[ACTIVE]?.complete).toBe(true),
    );
  });
});
