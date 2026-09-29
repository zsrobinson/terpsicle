import { onlineManager, type QueryClient } from "@tanstack/react-query";
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
import { type CatalogEvent, termsSettled, useCatalog } from "./catalog-store";
import { useCatalogPolling, useSeatsFreshness } from "./data-hooks";
import { DataError, type DataSource, type ReadPriority } from "./data-source";
import { manifestQuery } from "./query/catalog";
import type { PollPlatform } from "./query/catalog-poll";
import {
  createMemoryQueryStorage,
  flushQueryStorage,
  setQueryStorage,
} from "./query/persister";
import { createTestQueryClient } from "./query/testing";
import { resetStores } from "./testing";

// The catalog store against a fake server, with the query cache saving to
// memory: what it fetches, what it keeps, and what it shows when the
// server is away (DATA.md §5.1, §5.5).

const hash = (n: number) => n.toString(16).padStart(16, "0");
const ACTIVE = fixtureTermId;
const ARCHIVED = archivedFixtureTermId;

/**
 * A fake /data: published files by key, the keys read (with their fetch
 * priority), an off switch, and a hold on chosen files, to answer late.
 */
function aServer() {
  const files = new Map<string, unknown>();
  const reads: string[] = [];
  const priorities = new Map<string, ReadPriority | undefined>();
  let offline = false;
  let holding: ((key: string) => boolean) | null = null;
  const held = new Map<string, () => void>();
  const source: DataSource = {
    kind: "live",
    async readJson(key, options) {
      reads.push(key);
      priorities.set(key, options?.priority);
      if (holding?.(key))
        await new Promise<void>((resolve) => held.set(key, resolve));
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
    priorities,
    source,
    setOffline: (value: boolean) => {
      offline = value;
    },
    /** Reads of matching keys wait for `release` from now on. */
    hold: (match: (key: string) => boolean) => {
      holding = match;
    },
    /** Answers the held reads of matching keys (all by default), and stops holding them. */
    release: (match: (key: string) => boolean = () => true) => {
      const before = holding;
      holding = before ? (key) => before(key) && !match(key) : null;
      for (const [key, resume] of held)
        if (match(key)) {
          held.delete(key);
          resume();
        }
    },
    /** Keys whose reads are waiting. */
    waiting: () => [...held.keys()],
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

/** No Web Locks and no other tabs: this tab polls while it's visible. */
const ALONE: PollPlatform = { locks: null, channel: () => null };

let storage: ReturnType<typeof createMemoryQueryStorage>;
let pages: QueryClient[] = [];

/**
 * A new page load: a fresh query client over the same saved rows, mounted
 * as the router's provider mounts the app's (focus and reconnect refetch).
 */
function open(server: Server, events: CatalogEvent[] = []) {
  const client = createTestQueryClient();
  client.mount();
  pages.push(client);
  useCatalog.getState().connect(client, server.source, {
    onEvent: (e) => events.push(e),
    poll: ALONE,
  });
  return events;
}

/** Lets background checks, saves and pruning finish. */
async function settle() {
  for (const client of pages)
    await vi.waitFor(() => expect(client.isFetching()).toBe(0));
  for (let i = 0; i < 2; i++) {
    await new Promise((resolve) => setTimeout(resolve, 0));
    await flushQueryStorage();
  }
}

const titles = (termId: TermId) =>
  [...(useCatalog.getState().byTerm[termId]?.index.courses.values() ?? [])]
    .map((c) => c.title)
    .sort();

/** The R2 keys saved on this "device" now, sorted. */
const savedKeys = () =>
  [...storage.rows.keys()]
    .map((k) => JSON.parse(k.slice(k.indexOf("-") + 1))[2] as string)
    .sort();
const savedDeptKeys = () => savedKeys().filter((k) => k.includes("/dept/"));
const savedRow = (key: string) =>
  [...storage.rows].find(([k]) => k.includes(`"${key}"`))?.[1] as
    | { buster: string; state: { data: unknown } }
    | undefined;

let server: Server;

beforeEach(() => {
  resetStores();
  storage = createMemoryQueryStorage();
  setQueryStorage(storage);
  server = aServer();
  server.publish(ACTIVE, { CMSC: 1, MATH: 2, ENGL: 3 });
  server.publish(ARCHIVED, { CMSC: 11 });
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(async () => {
  vi.useRealTimers();
  server.release();
  await settle();
  for (const client of pages) client.unmount();
  pages = [];
  setQueryStorage(null);
  onlineManager.setOnline(true);
  vi.restoreAllMocks();
});

describe("first load", () => {
  it("loads the plan's departments first, then the rest, and saves them all", async () => {
    const events = open(server);
    await useCatalog.getState().loadTerms();
    server.take();
    await useCatalog.getState().ensureTerm(ACTIVE, ["MATH"]);

    const reads = server.take();
    const depts = reads.filter((k) => k.includes("/dept/"));
    expect(depts[0]).toBe(deptChunkKey(ACTIVE, "MATH", hash(2)));
    expect(depts).toHaveLength(3);
    const t = useCatalog.getState().byTerm[ACTIVE];
    expect(t?.complete).toBe(true);
    expect(t?.changes?.changes).toHaveLength(1);
    expect(titles(ACTIVE)).toEqual(["CMSC v1", "ENGL v3", "MATH v2"]);
    await settle();
    expect(savedDeptKeys()).toHaveLength(3);
    expect(savedKeys()).toContain(manifestKey(ACTIVE));
    expect(events).toEqual([
      expect.objectContaining({
        type: "catalog_loaded",
        termId: ACTIVE,
        fromCache: false,
        deptsFetched: 5, // three departments, seats, changes
      }),
    ]);
  });

  it("starts from this device's copy on the next visit, asking only for the manifest", async () => {
    open(server);
    await useCatalog.getState().loadTerms();
    await useCatalog.getState().ensureTerm(ACTIVE);
    await settle();
    server.take();

    const events = open(server);
    await useCatalog.getState().loadTerms();
    await useCatalog.getState().ensureTerm(ACTIVE);
    await settle();

    expect(titles(ACTIVE)).toEqual(["CMSC v1", "ENGL v3", "MATH v2"]);
    // Only the checks of the two fixed-name files; every hashed file is here.
    expect(server.take().sort()).toEqual([manifestKey(ACTIVE), TERMS_KEY]);
    expect(events).toEqual([
      expect.objectContaining({ fromCache: true, deptsFetched: 0 }),
    ]);
  });
});

describe("what's on screen first", () => {
  const isDept = (key: string) => key.includes("/dept/");
  const deptReads = () => server.take().filter(isDept);
  const t = () => useCatalog.getState().byTerm[ACTIVE];

  beforeEach(async () => {
    open(server);
    await useCatalog.getState().loadTerms();
    server.take();
  });

  it("fetches a department asked for before the rest, even when the whole term was asked for first", async () => {
    const term = useCatalog.getState().ensureTerm(ACTIVE);
    const course = useCatalog.getState().ensureDepts(ACTIVE, ["MATH"]);
    await Promise.all([term, course]);

    const depts = deptReads();
    expect(depts[0]).toBe(deptChunkKey(ACTIVE, "MATH", hash(2)));
    // Each department once, though both asked for MATH.
    expect(depts.sort()).toEqual(
      [
        deptChunkKey(ACTIVE, "CMSC", hash(1)),
        deptChunkKey(ACTIVE, "ENGL", hash(3)),
        deptChunkKey(ACTIVE, "MATH", hash(2)),
      ].sort(),
    );
    // The background load leaves the network to what's on screen.
    expect(server.priorities.get(deptChunkKey(ACTIVE, "MATH", hash(2)))).toBe(
      "auto",
    );
    expect(server.priorities.get(deptChunkKey(ACTIVE, "CMSC", hash(1)))).toBe(
      "low",
    );
  });

  it("shows a department as soon as it arrives, while the rest still load", async () => {
    server.hold((key) => isDept(key) && !key.includes("/MATH."));
    const term = useCatalog.getState().ensureTerm(ACTIVE);
    await useCatalog.getState().ensureDepts(ACTIVE, ["MATH"]);
    await vi.waitFor(() => expect(server.waiting()).toHaveLength(2));

    expect(titles(ACTIVE)).toEqual(["MATH v2"]);
    expect(t()?.depts.MATH).toBe("ready");
    expect(t()?.seats).not.toBeNull();
    expect(t()?.complete).toBe(false);
    expect(t()?.settled).toBe(false);

    server.release();
    await term;
    expect(titles(ACTIVE)).toEqual(["CMSC v1", "ENGL v3", "MATH v2"]);
    expect(t()?.complete).toBe(true);
    expect(t()?.settled).toBe(true);
  });

  it("fetches a department asked for during the background load at once, not in its turn", async () => {
    // More departments than the background load fetches at a time.
    const code = (i: number) =>
      `QA${String.fromCharCode(65 + Math.floor(i / 26), 65 + (i % 26))}`;
    const many = Object.fromEntries(
      Array.from({ length: 40 }, (_, i) => [code(i), i + 10]),
    );
    server.publish(ACTIVE, many);
    server.hold(isDept);
    const term = useCatalog.getState().ensureTerm(ACTIVE);
    await vi.waitFor(() => expect(server.waiting().length).toBeGreaterThan(0));
    const started = server.waiting().length;
    expect(started).toBeLessThan(40);
    server.take();

    const last = deptChunkKey(ACTIVE, code(39), hash(49));
    const course = useCatalog.getState().ensureDepts(ACTIVE, [code(39)]);
    await vi.waitFor(() => expect(server.waiting()).toContain(last));
    expect(deptReads()).toEqual([last]);
    server.release((key) => key === last);
    await course;

    expect(titles(ACTIVE)).toEqual([`${code(39)} v49`]);
    expect(t()?.complete).toBe(false);

    server.release();
    await term;
    expect(t()?.complete).toBe(true);
    // It wasn't fetched a second time in its turn.
    expect(deptReads()).not.toContain(last);
  });

  it("settles a term that lists no departments", async () => {
    server.publish(ACTIVE, {});
    await useCatalog.getState().ensureTerm(ACTIVE);

    expect(t()?.complete).toBe(true);
    expect(t()?.settled).toBe(true);
  });

  it("settles when a department fails, so search doesn't wait forever", async () => {
    server.files.delete(deptChunkKey(ACTIVE, "ENGL", hash(3)));
    await useCatalog.getState().ensureTerm(ACTIVE);

    expect(t()?.depts.ENGL).toBe("error");
    expect(t()?.complete).toBe(false);
    expect(t()?.settled).toBe(true);
  });

  it("loads a department at its new hash when the manifest moves on while it loads", async () => {
    server.hold((key) => key === deptChunkKey(ACTIVE, "CMSC", hash(1)));
    const course = useCatalog.getState().ensureDepts(ACTIVE, ["CMSC"]);
    await vi.waitFor(() => expect(server.waiting()).toHaveLength(1));
    // Meanwhile the server moves CMSC on, and this page hears of it.
    server.publish(ACTIVE, { CMSC: 4, MATH: 2, ENGL: 3 });
    await useCatalog.getState().refreshTerm(ACTIVE);
    server.release();
    await course;

    // Never the old version over the new one.
    expect(titles(ACTIVE)).toEqual(["CMSC v4"]);
    expect(t()?.depts.CMSC).toBe("ready");
  });
});

describe("revalidating", () => {
  beforeEach(async () => {
    open(server);
    await useCatalog.getState().loadTerms();
    await useCatalog.getState().ensureTerm(ACTIVE);
    await settle();
    server.take();
  });

  it("fetches only the departments whose hash changed, and then drops their old files", async () => {
    server.publish(ACTIVE, { CMSC: 4, MATH: 2, ENGL: 3 });
    await useCatalog.getState().refreshTerm(ACTIVE);

    expect(server.take()).toEqual([
      manifestKey(ACTIVE),
      deptChunkKey(ACTIVE, "CMSC", hash(4)),
    ]);
    expect(titles(ACTIVE)).toEqual(["CMSC v4", "ENGL v3", "MATH v2"]);
    expect(useCatalog.getState().byTerm[ACTIVE]?.complete).toBe(true);
    await settle();
    expect(savedDeptKeys()).toEqual(
      [
        deptChunkKey(ACTIVE, "CMSC", hash(4)),
        deptChunkKey(ACTIVE, "ENGL", hash(3)),
        deptChunkKey(ACTIVE, "MATH", hash(2)),
      ].sort(),
    );
  });

  it("drops departments the manifest no longer lists, from the index and the device", async () => {
    server.publish(ACTIVE, { CMSC: 1, ENGL: 3 });
    await useCatalog.getState().refreshTerm(ACTIVE);

    expect(server.take()).toEqual([manifestKey(ACTIVE)]);
    expect(titles(ACTIVE)).toEqual(["CMSC v1", "ENGL v3"]);
    await settle();
    expect(savedDeptKeys()).not.toContain(
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

  it("keeps the files it has, on screen and on disk, when the new ones fail", async () => {
    server.publish(ACTIVE, { CMSC: 5, MATH: 2, ENGL: 3 }, 3);
    server.files.set(deptChunkKey(ACTIVE, "CMSC", hash(5)), { nope: true });
    server.files.set(seatsKey(ACTIVE, hash(1003)), { schemaVersion: 1 });
    await useCatalog.getState().refreshTerm(ACTIVE);
    await settle();

    const t = useCatalog.getState().byTerm[ACTIVE];
    expect(titles(ACTIVE)).toContain("CMSC v1");
    expect(t?.depts.CMSC).toBe("ready");
    expect(t?.seats?.asOf).toBe("2026-09-25T01:00:00.000Z");
    // The saved manifest names the versions this device has, so it never
    // names a file it lacks, and nothing it names was dropped.
    expect(savedRow(manifestKey(ACTIVE))?.state.data).toMatchObject({
      seats: { hash: hash(1001) },
    });
    expect(savedDeptKeys()).toContain(deptChunkKey(ACTIVE, "CMSC", hash(1)));
    expect(savedKeys()).toContain(seatsKey(ACTIVE, hash(1001)));
  });

  it("shows new seats when one department's new file is broken, and tries only that file again", async () => {
    server.publish(ACTIVE, { CMSC: 5, MATH: 2, ENGL: 3 }, 2);
    server.files.set(deptChunkKey(ACTIVE, "CMSC", hash(5)), { nope: true });
    await useCatalog.getState().refreshTerm(ACTIVE);
    await settle();

    // The new seats show; CMSC keeps the version it had.
    const t = () => useCatalog.getState().byTerm[ACTIVE];
    expect(t()?.seats?.asOf).toBe("2026-09-25T02:00:00.000Z");
    expect(titles(ACTIVE)).toEqual(["CMSC v1", "ENGL v3", "MATH v2"]);
    expect(t()?.depts.CMSC).toBe("ready");
    // Saved: the new seats, and CMSC at the version this device has; the
    // old seats file is dropped, the old CMSC file kept.
    expect(savedRow(manifestKey(ACTIVE))?.state.data).toMatchObject({
      seats: { hash: hash(1002) },
      departments: expect.arrayContaining([
        expect.objectContaining({ code: "CMSC", hash: hash(1) }),
      ]),
    });
    expect(savedKeys()).toContain(seatsKey(ACTIVE, hash(1002)));
    expect(savedKeys()).not.toContain(seatsKey(ACTIVE, hash(1001)));
    expect(savedDeptKeys()).toContain(deptChunkKey(ACTIVE, "CMSC", hash(1)));

    // The next poll asks for the manifest and that one file, nothing else.
    server.take();
    await useCatalog.getState().refreshTerm(ACTIVE);
    await settle();
    expect(server.take()).toEqual([
      manifestKey(ACTIVE),
      deptChunkKey(ACTIVE, "CMSC", hash(5)),
    ]);

    // Once the jobs fix it, the next poll brings it on screen and on disk.
    server.publish(ACTIVE, { CMSC: 5, MATH: 2, ENGL: 3 }, 2);
    await useCatalog.getState().refreshTerm(ACTIVE);
    await settle();
    expect(titles(ACTIVE)).toEqual(["CMSC v5", "ENGL v3", "MATH v2"]);
    expect(savedDeptKeys()).toContain(deptChunkKey(ACTIVE, "CMSC", hash(5)));
    expect(savedDeptKeys()).not.toContain(
      deptChunkKey(ACTIVE, "CMSC", hash(1)),
    );
  });

  it("never saves an older manifest over a newer one another tab brought in", async () => {
    vi.useFakeTimers();
    const { client, source } = useCatalog.getState();
    if (!client || !source) throw new Error("connected");
    // This tab asks for the manifest (still v1 seats)...
    await client.fetchQuery({ ...manifestQuery(source, ACTIVE), staleTime: 0 });
    // ...and before it saves it, the polling tab (another client over the
    // same disk) brings newer seats and saves them.
    server.publish(ACTIVE, { CMSC: 1, MATH: 2, ENGL: 3 }, 2);
    const holder = createTestQueryClient();
    const newer = await holder.fetchQuery({
      ...manifestQuery(source, ACTIVE),
      staleTime: 0,
    });
    client.setQueryData(manifestQuery(source, ACTIVE).queryKey, newer, {
      updatedAt: Date.now() + 1,
    });
    await vi.runAllTimersAsync();
    await flushQueryStorage();
    vi.useRealTimers();
    // The newer manifest and its seats stay saved.
    expect(savedRow(manifestKey(ACTIVE))?.state.data).toMatchObject({
      seats: { hash: hash(1002) },
    });
    expect(savedKeys()).toContain(seatsKey(ACTIVE, hash(1002)));
  });

  it("keeps what's loaded and marks the tab stale when the server has a newer format", async () => {
    server.publish(ACTIVE, { CMSC: 6 }, 1, SCHEMA_VERSIONS.catalog + 1);
    await useCatalog.getState().refreshTerm(ACTIVE);

    expect(useCatalog.getState().appStale).toBe(true);
    expect(titles(ACTIVE)).toEqual(["CMSC v1", "ENGL v3", "MATH v2"]);
  });

  it("never drops another term's files", async () => {
    await useCatalog.getState().ensureTerm(ARCHIVED);
    await settle();
    server.publish(ACTIVE, { CMSC: 4, MATH: 2, ENGL: 3 });
    await useCatalog.getState().refreshTerm(ACTIVE);
    await settle();
    expect(savedKeys()).toEqual(
      expect.arrayContaining([
        manifestKey(ARCHIVED),
        deptChunkKey(ARCHIVED, "CMSC", hash(11)),
        TERMS_KEY,
      ]),
    );
  });
});

describe("a schema version bump in this build", () => {
  it("drops the saved files of that family and fetches everything again", async () => {
    open(server);
    await useCatalog.getState().loadTerms();
    await useCatalog.getState().ensureTerm(ACTIVE);
    await settle();
    // As if an older build (catalog v0) had saved them.
    for (const row of storage.rows.values())
      (row as { buster: string }).buster = "catalog@0";
    server.take();

    const events = open(server);
    await useCatalog.getState().loadTerms();
    await useCatalog.getState().ensureTerm(ACTIVE);
    await settle();

    expect(server.take().filter((k) => k.includes("/dept/"))).toHaveLength(3);
    expect(events).toEqual([
      expect.objectContaining({ fromCache: false, deptsFetched: 5 }),
    ]);
    expect(savedRow(manifestKey(ACTIVE))?.buster).toBe(
      `catalog@${SCHEMA_VERSIONS.catalog}`,
    );
  });
});

describe("offline", () => {
  it("starts from saved data, and says so quietly", async () => {
    open(server);
    await useCatalog.getState().loadTerms();
    await useCatalog.getState().ensureTerm(ACTIVE);
    await settle();

    server.setOffline(true);
    onlineManager.setOnline(false);
    const events = open(server);
    await useCatalog.getState().loadTerms();
    await useCatalog.getState().ensureTerm(ACTIVE);
    await settle();

    const s = useCatalog.getState();
    expect(s.terms).toHaveLength(2);
    expect(s.termsError).toBeNull();
    expect(s.network).toBe("offline");
    expect(titles(ACTIVE)).toEqual(["CMSC v1", "ENGL v3", "MATH v2"]);
    expect(s.byTerm[ACTIVE]?.seats).not.toBeNull();
    expect(events).toEqual([expect.objectContaining({ fromCache: true })]);
    const { result } = renderHook(() => useSeatsFreshness(ACTIVE));
    expect(result.current).toMatchObject({
      state: "offline",
      text: "Offline · showing saved data",
    });
  });

  it("with nothing saved, gives a specific error at once, and a retry that works", async () => {
    server.setOffline(true);
    onlineManager.setOnline(false);
    const events = open(server);
    await useCatalog.getState().loadTerms();

    expect(useCatalog.getState().termsError).toBe(
      "Couldn't reach terpsicle.com to load the course catalog. Check your connection and try again.",
    );
    expect(events).toEqual([
      { type: "catalog_load_failed", termId: null, reason: "network" },
    ]);
    // Asked once: offline, a read fails at once rather than retrying.
    expect(server.take()).toEqual([TERMS_KEY]);

    server.setOffline(false);
    onlineManager.setOnline(true);
    await useCatalog.getState().retry();
    expect(useCatalog.getState().terms).toHaveLength(2);
    expect(useCatalog.getState().termsError).toBeNull();
    expect(useCatalog.getState().network).toBe("online");
  });

  it("marks the term failed when its manifest can't load and none is saved", async () => {
    const events = open(server);
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
    open(server);
    await useCatalog.getState().loadTerms();
    await useCatalog.getState().ensureTerm(ACTIVE);
    await useCatalog.getState().ensureTerm(ARCHIVED);
    await settle();
    server.take();
  });

  it("reads Testudo's as-of time relative to now", () => {
    vi.useFakeTimers({ now: new Date("2026-09-25T01:02:30.000Z") });
    const { result } = renderHook(() => useSeatsFreshness(ACTIVE));
    expect(result.current).toEqual({
      state: "live",
      text: "Seats as of 2 minutes ago",
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

  it("polls the manifest every minute while visible, not while hidden, and again when shown once stale", async () => {
    vi.useFakeTimers();
    renderHook(() => useCatalogPolling(ACTIVE));
    await act(() => vi.advanceTimersByTimeAsync(60_000));
    expect(server.take()).toEqual([manifestKey(ACTIVE)]);

    const visibility = vi
      .spyOn(document, "visibilityState", "get")
      .mockReturnValue("hidden");
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange", { bubbles: true }));
      await vi.advanceTimersByTimeAsync(120_000);
    });
    expect(server.take()).toEqual([]);

    visibility.mockReturnValue("visible");
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange", { bubbles: true }));
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(server.take()).toEqual([manifestKey(ACTIVE)]);
  });

  it("doesn't ask again on coming back while the manifest is still current", async () => {
    vi.useFakeTimers();
    renderHook(() => useCatalogPolling(ACTIVE));
    await act(() => vi.advanceTimersByTimeAsync(60_000));
    server.take();
    const visibility = vi
      .spyOn(document, "visibilityState", "get")
      .mockReturnValue("hidden");
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange", { bubbles: true }));
      await vi.advanceTimersByTimeAsync(10_000);
    });
    visibility.mockReturnValue("visible");
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange", { bubbles: true }));
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(server.take()).toEqual([]);
  });

  it("brings what a poll finds: new seats show without a reload", async () => {
    vi.useFakeTimers();
    renderHook(() => useCatalogPolling(ACTIVE));
    server.publish(ACTIVE, { CMSC: 1, MATH: 2, ENGL: 3 }, 2);
    await act(() => vi.advanceTimersByTimeAsync(60_000));
    expect(useCatalog.getState().byTerm[ACTIVE]?.seats?.asOf).toBe(
      "2026-09-25T02:00:00.000Z",
    );
  });

  it("never polls an archived term", async () => {
    vi.useFakeTimers();
    renderHook(() => useCatalogPolling(ARCHIVED));
    await act(() => vi.advanceTimersByTimeAsync(180_000));
    expect(server.take()).toEqual([]);
  });

  it("reloads the page when it's next shown, once the server has a newer format", async () => {
    const reload = vi
      .spyOn(window.location, "reload")
      .mockImplementation(() => {});
    renderHook(() => useCatalogPolling(ACTIVE));
    server.publish(ACTIVE, { CMSC: 6 }, 1, SCHEMA_VERSIONS.catalog + 1);
    await act(() => useCatalog.getState().refreshTerm(ACTIVE));
    expect(useCatalog.getState().appStale).toBe(true);
    expect(reload).not.toHaveBeenCalled();
    act(() => {
      document.dispatchEvent(new Event("visibilitychange", { bubbles: true }));
    });
    expect(reload).toHaveBeenCalledTimes(1);
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

describe("no storage", () => {
  it("works without one (IndexedDB unavailable)", async () => {
    setQueryStorage(null);
    open(server);
    await useCatalog.getState().loadTerms();
    await useCatalog.getState().ensureTerm(ACTIVE);
    await waitFor(() =>
      expect(useCatalog.getState().byTerm[ACTIVE]?.complete).toBe(true),
    );
  });
});

describe("termsSettled", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  /** Whether the promise has resolved yet, read after a timer step. */
  const settledYet = (promise: Promise<void>) => {
    let done = false;
    void promise.then(() => {
      done = true;
    });
    return () => done;
  };

  it("waits for the term list to load, then for the render after", async () => {
    vi.useFakeTimers();
    useCatalog.setState({ termsState: "loading" });
    const done = settledYet(termsSettled(10_000));
    await vi.advanceTimersByTimeAsync(5_000);
    expect(done()).toBe(false);
    useCatalog.setState({ termsState: "ready" });
    expect(done()).toBe(false);
    await vi.advanceTimersByTimeAsync(0);
    expect(done()).toBe(true);
  });

  it("goes ahead when the list fails", async () => {
    vi.useFakeTimers();
    useCatalog.setState({ termsState: "loading" });
    const done = settledYet(termsSettled(10_000));
    useCatalog.setState({ termsState: "error" });
    await vi.advanceTimersByTimeAsync(0);
    expect(done()).toBe(true);
  });

  it("goes ahead after its time anyway", async () => {
    vi.useFakeTimers();
    useCatalog.setState({ termsState: "loading" });
    const done = settledYet(termsSettled(10_000));
    await vi.advanceTimersByTimeAsync(9_999);
    expect(done()).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await vi.runOnlyPendingTimersAsync();
    expect(done()).toBe(true);
  });

  it("goes ahead at once when the list is already there", async () => {
    vi.useFakeTimers();
    useCatalog.setState({ termsState: "ready" });
    const done = settledYet(termsSettled(10_000));
    await vi.advanceTimersByTimeAsync(0);
    expect(done()).toBe(true);
  });
});
