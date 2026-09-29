import { focusManager, type QueryClient } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  deptChunkKey,
  type Manifest,
  manifestKey,
  SCHEMA_VERSIONS,
  seatsKey,
} from "~/core/schema";
import { fixtureTermId, mockDataSource } from "~/fixtures";
import {
  createBucketDataSource,
  DataError,
  type DataSource,
} from "../data-source";
import {
  CATALOG_POLL_MS,
  deptChunkQuery,
  manifestQuery,
  seatsQuery,
} from "./catalog";
import {
  GIVE_UP_AFTER,
  type PollChannel,
  type PollPlatform,
  pollLockName,
  pollManifest,
} from "./catalog-poll";
import {
  createMemoryQueryStorage,
  flushQueryStorage,
  setQueryStorage,
} from "./persister";
import { createTestQueryClient } from "./testing";

// The seat poll across tabs (DATA.md §5.1 step 5): one visible tab of the
// browser polls, the others take its manifests, and a tab that's hidden
// or closed hands the poll on. Web Locks and BroadcastChannel are faked
// in memory, one "browser" per test; each tab is its own query client.

const TERM = fixtureTermId;
const KEY = manifestKey(TERM);

/**
 * Web Locks, as far as the poll uses them: exclusive and queued. As in
 * browsers, a lock is granted at once when it's free but its callback
 * runs a task later, and an abort after the grant does nothing.
 */
function fakeLocks() {
  const held = new Set<string>();
  const queues = new Map<string, Array<() => void>>();
  const request = (
    name: string,
    options: { signal?: AbortSignal },
    callback: () => Promise<void>,
  ): Promise<void> =>
    new Promise<void>((resolve, reject) => {
      const queue = queues.get(name) ?? [];
      queues.set(name, queue);
      let granted = false;
      const grant = () => {
        granted = true;
        held.add(name);
        setTimeout(() => {
          void callback().then(() => {
            held.delete(name);
            queue.shift()?.();
            resolve();
          });
        }, 0);
      };
      options.signal?.addEventListener("abort", () => {
        if (granted) return;
        const at = queue.indexOf(grant);
        if (at >= 0) queue.splice(at, 1);
        reject(new DOMException("Aborted", "AbortError"));
      });
      if (held.has(name)) queue.push(grant);
      else grant();
    });
  return { request } as unknown as NonNullable<PollPlatform["locks"]>;
}

/** BroadcastChannel in memory: a message reaches every other member. */
function fakeChannels(): PollPlatform["channel"] {
  const members = new Set<PollChannel>();
  return () => {
    const channel: PollChannel = {
      onmessage: null,
      postMessage(message) {
        for (const other of members)
          if (other !== channel)
            queueMicrotask(() =>
              other.onmessage?.(
                new MessageEvent("message", {
                  data: structuredClone(message),
                }),
              ),
            );
      },
      close() {
        members.delete(channel);
      },
    };
    members.add(channel);
    return channel;
  };
}

/** The mock bucket, counting manifest reads; each one's seats are newer. */
function aServer() {
  const bucket = createBucketDataSource(mockDataSource);
  let reads = 0;
  const source: DataSource = {
    ...bucket,
    kind: "live",
    readJson: async (key, options) => {
      const data = await bucket.readJson(key, options);
      if (key !== KEY) return data;
      reads++;
      const manifest = data as Manifest;
      return {
        ...manifest,
        seats: manifest.seats && {
          ...manifest.seats,
          fetchedAt: new Date(Date.now()).toISOString(),
        },
      };
    },
  };
  return { source, reads: () => reads };
}

let tabs: QueryClient[] = [];
/** A tab: its own mounted query client, with the manifest loaded. */
async function aTab(source: DataSource): Promise<QueryClient> {
  const client = createTestQueryClient();
  client.mount();
  tabs.push(client);
  await client.fetchQuery(manifestQuery(source, TERM));
  return client;
}
const manifestIn = (client: QueryClient, source: DataSource) =>
  client.getQueryData(manifestQuery(source, TERM).queryKey);

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  focusManager.setFocused(undefined);
  for (const tab of tabs) tab.unmount();
  tabs = [];
  vi.useRealTimers();
});

describe("the seat poll across tabs", () => {
  it("polls from one tab for the browser, and the others take what it gets", async () => {
    const server = aServer();
    const platform: PollPlatform = {
      locks: fakeLocks(),
      channel: fakeChannels(),
    };
    const a = await aTab(server.source);
    const b = await aTab(server.source);
    const stopA = pollManifest(a, server.source, TERM, platform);
    const stopB = pollManifest(b, server.source, TERM, platform);
    const before = server.reads();

    await vi.advanceTimersByTimeAsync(3 * CATALOG_POLL_MS);
    // Three polls in three minutes, not six.
    expect(server.reads() - before).toBe(3);
    // The other tab has the latest, as the polling tab fetched it.
    expect(manifestIn(b, server.source)).toEqual(manifestIn(a, server.source));
    expect(
      b.getQueryState(manifestQuery(server.source, TERM).queryKey)
        ?.dataUpdatedAt,
    ).toBe(
      a.getQueryState(manifestQuery(server.source, TERM).queryKey)
        ?.dataUpdatedAt,
    );
    stopA();
    stopB();
  });

  it("hands the poll on when the polling tab goes", async () => {
    const server = aServer();
    const platform: PollPlatform = {
      locks: fakeLocks(),
      channel: fakeChannels(),
    };
    const a = await aTab(server.source);
    const b = await aTab(server.source);
    const stopA = pollManifest(a, server.source, TERM, platform);
    const stopB = pollManifest(b, server.source, TERM, platform);
    await vi.advanceTimersByTimeAsync(CATALOG_POLL_MS);
    stopA();
    const before = server.reads();

    await vi.advanceTimersByTimeAsync(2 * CATALOG_POLL_MS);
    expect(server.reads() - before).toBe(2);
    stopB();
  });

  it("doesn't poll while the page is hidden", async () => {
    const server = aServer();
    const platform: PollPlatform = {
      locks: fakeLocks(),
      channel: fakeChannels(),
    };
    const a = await aTab(server.source);
    const stop = pollManifest(a, server.source, TERM, platform);
    focusManager.setFocused(false);
    const before = server.reads();
    await vi.advanceTimersByTimeAsync(3 * CATALOG_POLL_MS);
    expect(server.reads()).toBe(before);
    stop();
  });

  it("never puts an older copy over a newer one, or a message that doesn't read", async () => {
    const server = aServer();
    const channels = fakeChannels();
    const other = channels("terpsicle:catalog");
    const a = await aTab(server.source);
    const stop = pollManifest(a, server.source, TERM, {
      locks: fakeLocks(),
      channel: channels,
    });
    const had = manifestIn(a, server.source);
    const at = a.getQueryState(manifestQuery(server.source, TERM).queryKey)
      ?.dataUpdatedAt as number;
    other?.postMessage({
      kind: "live",
      termId: TERM,
      updatedAt: at - 1,
      manifest: { ...had, generatedAt: "2020-01-01T00:00:00.000Z" },
    });
    other?.postMessage({ kind: "live", termId: TERM, updatedAt: at + 1 });
    other?.postMessage({
      kind: "mock",
      termId: TERM,
      updatedAt: at + 1,
      manifest: had,
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(manifestIn(a, server.source)).toBe(had);
    stop();
  });

  it("polls from every visible tab where there are no Web Locks, as before", async () => {
    const server = aServer();
    const platform: PollPlatform = { locks: null, channel: () => null };
    const a = await aTab(server.source);
    const b = await aTab(server.source);
    const stopA = pollManifest(a, server.source, TERM, platform);
    const stopB = pollManifest(b, server.source, TERM, platform);
    const before = server.reads();
    await vi.advanceTimersByTimeAsync(CATALOG_POLL_MS);
    expect(server.reads() - before).toBe(2);
    stopA();
    stopB();
  });

  it("lets the lock go when it's granted to a tab that stopped since asking", async () => {
    const server = aServer();
    const platform: PollPlatform = {
      locks: fakeLocks(),
      channel: fakeChannels(),
    };
    const a = await aTab(server.source);
    const b = await aTab(server.source);
    // A term switch in the gap between the ask and the grant.
    pollManifest(a, server.source, TERM, platform)();
    const stopB = pollManifest(b, server.source, TERM, platform);
    const before = server.reads();
    // The other tab gets the lock a few task hops later: a second's slack.
    await vi.advanceTimersByTimeAsync(2 * CATALOG_POLL_MS + 1000);
    expect(server.reads() - before).toBe(2);
    stopB();
  });

  it("lets another tab poll once the polling one fails three polls in a row", async () => {
    const server = aServer();
    const platform: PollPlatform = {
      locks: fakeLocks(),
      channel: fakeChannels(),
    };
    const unreachable: DataSource = {
      ...server.source,
      readJson: async (key, options) => {
        if (key === KEY) throw new DataError(key, "network", "offline");
        return server.source.readJson(key, options);
      },
    };
    const a = await aTab(server.source);
    const b = await aTab(server.source);
    const stopA = pollManifest(a, unreachable, TERM, platform);
    const stopB = pollManifest(b, server.source, TERM, platform);
    const before = server.reads();
    await vi.advanceTimersByTimeAsync(GIVE_UP_AFTER * CATALOG_POLL_MS);
    // Only the failing tab asked so far.
    expect(server.reads()).toBe(before);
    await vi.advanceTimersByTimeAsync(2 * CATALOG_POLL_MS);
    expect(server.reads() - before).toBeGreaterThanOrEqual(1);
    stopA();
    stopB();
  });

  it("stops polling for the others once the server has a newer format than this tab reads", async () => {
    const server = aServer();
    const platform: PollPlatform = {
      locks: fakeLocks(),
      channel: fakeChannels(),
    };
    let oldReads = 0;
    const newer: DataSource = {
      ...server.source,
      readJson: async (key, options) => {
        const data = await server.source.readJson(key, options);
        if (key !== KEY) return data;
        oldReads++;
        return { ...(data as object), schemaVersion: 99 };
      },
    };
    const a = await aTab(server.source);
    const b = await aTab(server.source);
    const stopA = pollManifest(a, newer, TERM, platform);
    const stopB = pollManifest(b, server.source, TERM, platform);
    await vi.advanceTimersByTimeAsync(CATALOG_POLL_MS);
    expect(oldReads).toBe(1);
    // The other tab polls from here, and this one never again.
    stopB();
    await vi.advanceTimersByTimeAsync(3 * CATALOG_POLL_MS);
    expect(oldReads).toBe(1);
    stopA();
  });

  it("keeps builds that read different catalog formats on different locks", () => {
    expect(pollLockName("live", TERM)).toBe(
      `terpsicle:seat-poll:live:catalog@${SCHEMA_VERSIONS.catalog}:${TERM}`,
    );
  });

  it("shares new seats with the other tabs when one department's new file is broken", async () => {
    const storage = createMemoryQueryStorage();
    setQueryStorage(storage);
    try {
      const bucket = createBucketDataSource(mockDataSource);
      const original = (await bucket.readJson(KEY)) as Manifest;
      const dept = original.departments[0];
      const seats = original.seats;
      if (!dept || !seats) throw new Error("the mock has both");
      const broken = deptChunkKey(TERM, dept.code, "f".repeat(16));
      const newSeats = seatsKey(TERM, "e".repeat(16));
      let changed = false;
      const source: DataSource = {
        ...bucket,
        kind: "live",
        readJson: async (key, options) => {
          if (key === broken) return { nope: true };
          if (key === newSeats)
            return bucket.readJson(seatsKey(TERM, seats.hash), options);
          if (key === KEY && changed)
            return {
              ...original,
              departments: original.departments.map((d) =>
                d.code === dept.code ? { ...d, hash: "f".repeat(16) } : d,
              ),
              seats: { ...seats, hash: "e".repeat(16) },
            };
          return bucket.readJson(key, options);
        },
      };
      const platform: PollPlatform = {
        locks: fakeLocks(),
        channel: fakeChannels(),
      };
      const a = await aTab(source);
      // This device has the department and the seats saved.
      await a.fetchQuery(deptChunkQuery(source, TERM, dept));
      await a.fetchQuery(seatsQuery(source, TERM, seats.hash));
      await vi.advanceTimersByTimeAsync(0);
      await flushQueryStorage();
      const b = await aTab(source);
      const stopA = pollManifest(a, source, TERM, platform);
      const stopB = pollManifest(b, source, TERM, platform);

      changed = true;
      await vi.advanceTimersByTimeAsync(CATALOG_POLL_MS);
      // The polling tab took the new manifest, and the other tab has it.
      expect(manifestIn(a, source)?.seats?.hash).toBe("e".repeat(16));
      expect(manifestIn(b, source)?.seats?.hash).toBe("e".repeat(16));
      stopA();
      stopB();
    } finally {
      setQueryStorage(null);
    }
  });
});
