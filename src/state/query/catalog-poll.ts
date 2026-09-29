import {
  focusManager,
  type QueryClient,
  QueryObserver,
} from "@tanstack/react-query";
import { SCHEMA_VERSIONS, type TermId } from "~/core/schema";
import { ManifestBroadcastSchema } from "~/core/schema/query-cache";
import { type DataSource, SchemaVersionError } from "../data-source";
import { CATALOG_POLL_MS, manifestQuery } from "./catalog";

// The seat poll (DATA.md §5.1 step 5) in Query's words: an active term's
// manifest is refetched every minute (`refetchInterval`), never while the
// page is hidden (`refetchIntervalInBackground: false`, Query's focus
// manager), and on coming back or reconnecting only once it's stale.
//
// One tab polls for the whole browser. Visible tabs queue for a Web Lock
// per term; the holder polls and posts each manifest it gets on a
// BroadcastChannel, and the others put it in their own cache (which also
// restarts their own interval, so they don't poll on top). A tab that's
// hidden gives the lock up, so the poll moves to a tab someone's looking
// at. Plan sync shares tabs the same way (V2.md §5.3). Without Web Locks
// every visible tab polls, as before.

/** The channel every tab's catalog polls talk on. */
export const CATALOG_CHANNEL = "terpsicle:catalog";

/** The parts of a BroadcastChannel the poll uses. */
export interface PollChannel {
  postMessage(message: unknown): void;
  onmessage: ((event: MessageEvent) => void) | null;
  close(): void;
}

/** What the poll needs from the browser; tests pass their own. */
export interface PollPlatform {
  /** Web Locks, or null where there are none (every visible tab polls). */
  locks: Pick<LockManager, "request"> | null;
  /** A channel to this browser's other tabs, or null where there's none. */
  channel: (name: string) => PollChannel | null;
}

/**
 * Polls in a row that failed before the polling tab lets another try. A
 * tab that can't reach the server, or reads a manifest it can't use,
 * mustn't keep the others from polling.
 */
export const GIVE_UP_AFTER = 3;

/** The lock for one term's poll: builds that read a different catalog format never share it. */
export const pollLockName = (kind: DataSource["kind"], termId: TermId) =>
  `terpsicle:seat-poll:${kind}:catalog@${SCHEMA_VERSIONS.catalog}:${termId}`;

export function browserPollPlatform(): PollPlatform {
  return {
    locks:
      typeof navigator !== "undefined" && navigator.locks
        ? navigator.locks
        : null,
    channel: (name) =>
      typeof BroadcastChannel === "undefined"
        ? null
        : new BroadcastChannel(name),
  };
}

/**
 * Keeps a term's manifest current while it's on screen, until the
 * returned function stops it. The term's catalog follows the manifest
 * query wherever its data comes from (../catalog-store.ts).
 */
export function pollManifest(
  client: QueryClient,
  source: DataSource,
  termId: TermId,
  platform: PollPlatform = browserPollPlatform(),
  /**
   * This tab is out of date (a newer data format is published): it stops
   * polling for the others, and reloads when it's next shown.
   */
  stale: () => boolean = () => false,
): () => void {
  const options = manifestQuery(source, termId);
  const observer = new QueryObserver(client, {
    ...options,
    refetchInterval: false,
    refetchIntervalInBackground: false,
  });
  const channel = platform.channel(CATALOG_CHANNEL);
  let leading = false;
  let posted = 0;
  let stopped = false;
  /** Fetches in a row that failed, and the last failure counted. */
  let failures = 0;
  let failedAt = 0;
  /** Out of date: never polls for the others again. */
  let outOfDate = false;
  const mayLead = () =>
    !stopped && !outOfDate && !stale() && focusManager.isFocused();

  const unsubscribe = observer.subscribe((result) => {
    if (result.isFetching) return;
    if (result.errorUpdatedAt > failedAt) {
      failedAt = result.errorUpdatedAt;
      failures++;
      if (result.error instanceof SchemaVersionError && result.error.newer)
        outOfDate = true;
    } else if (result.isSuccess) failures = 0;
    if (!leading) return;
    if (outOfDate || stale()) return standDown();
    if (failures >= GIVE_UP_AFTER) {
      // To the back of the queue: another tab polls, and this one only
      // gets the lock again once they've given it up too.
      failures = 0;
      standDown();
      return follow();
    }
    // The polling tab tells the others what it fetched, once per fetch.
    if (!result.isSuccess || result.dataUpdatedAt <= posted) return;
    posted = result.dataUpdatedAt;
    channel?.postMessage({
      kind: source.kind,
      termId,
      updatedAt: result.dataUpdatedAt,
      manifest: result.data,
    });
  });

  if (channel)
    channel.onmessage = (event) => {
      const message = ManifestBroadcastSchema.safeParse(event.data);
      if (
        !message.success ||
        message.data.kind !== source.kind ||
        message.data.termId !== termId
      )
        return;
      // Only ever newer than what this tab has: never an older copy over a
      // newer one, whichever order they arrive in.
      const had = client.getQueryState(options.queryKey)?.dataUpdatedAt ?? 0;
      if (message.data.updatedAt <= had) return;
      client.setQueryData(options.queryKey, message.data.manifest, {
        updatedAt: message.data.updatedAt,
      });
    };

  const lead = (on: boolean) => {
    leading = on;
    observer.setOptions({
      ...options,
      refetchInterval: on ? CATALOG_POLL_MS : false,
      refetchIntervalInBackground: false,
    });
  };

  // Holding the lock: `release` lets it go. Waiting for it: `waiting`.
  let release: (() => void) | null = null;
  let waiting: AbortController | null = null;
  const seek = () => {
    const { locks } = platform;
    if (!locks) return lead(true);
    if (release || waiting) return;
    const asking = new AbortController();
    waiting = asking;
    locks
      .request(
        pollLockName(source.kind, termId),
        { signal: asking.signal },
        () => {
          if (waiting === asking) waiting = null;
          // Granted after this tab stopped, hid or went out of date (the
          // grant comes a task after the ask, and an abort can't take it
          // back then): let it go at once, or no tab would poll again.
          if (!mayLead()) return Promise.resolve();
          return new Promise<void>((resolve) => {
            release = () => {
              release = null;
              lead(false);
              resolve();
            };
            lead(true);
          });
        },
      )
      // Aborted while waiting: another tab kept it, and this one hid.
      .catch(() => {});
  };
  function standDown() {
    waiting?.abort();
    waiting = null;
    release?.();
    if (!platform.locks) lead(false);
  }
  function follow() {
    if (mayLead()) seek();
    else standDown();
  }
  follow();
  const stopFocus = focusManager.subscribe(follow);

  return () => {
    stopped = true;
    stopFocus();
    standDown();
    unsubscribe();
    if (channel) {
      channel.onmessage = null;
      channel.close();
    }
  };
}
