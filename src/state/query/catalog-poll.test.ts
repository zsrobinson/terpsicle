import { focusManager, type QueryClient } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type Manifest, manifestKey } from "~/core/schema";
import { fixtureTermId, mockDataSource } from "~/fixtures";
import { createBucketDataSource, type DataSource } from "../data-source";
import { CATALOG_POLL_MS, manifestQuery } from "./catalog";
import {
  type PollChannel,
  type PollPlatform,
  pollManifest,
} from "./catalog-poll";
import { createTestQueryClient } from "./testing";

// The seat poll across tabs (DATA.md §5.1 step 5): one visible tab of the
// browser polls, the others take its manifests, and a tab that's hidden
// or closed hands the poll on. Web Locks and BroadcastChannel are faked
// in memory, one "browser" per test; each tab is its own query client.

const TERM = fixtureTermId;
const KEY = manifestKey(TERM);

/** Web Locks, as far as the poll uses them: exclusive, queued, abortable. */
function fakeLocks() {
  const held = new Set<string>();
  const queues = new Map<string, Array<() => void>>();
  const request = (
    name: string,
    options: { signal?: AbortSignal },
    callback: () => Promise<void>,
  ): Promise<void> =>
    new Promise<void>((resolve, reject) => {
      const run = () => {
        held.add(name);
        void callback().then(() => {
          held.delete(name);
          queues.get(name)?.shift()?.();
          resolve();
        });
      };
      if (!held.has(name)) return run();
      const queue = queues.get(name) ?? [];
      queues.set(name, queue);
      queue.push(run);
      options.signal?.addEventListener("abort", () => {
        const at = queue.indexOf(run);
        if (at >= 0) queue.splice(at, 1);
        reject(new DOMException("Aborted", "AbortError"));
      });
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
});
