// One stored feed, fetched and written (docs/V3.md §3.5): shared by the cron
// and `todo/refresh`. One D1 batch per feed; an unchanged feed writes one row.
import { TODO_MAX_FEED_ITEMS } from "~/core/schema";
import {
  afterFailure,
  backoffMs,
  keepInWindow,
  newYorkDateOf,
  nextFetch,
  parseIcs,
} from "~/core/todo";
import type { TodoMode } from "./config";
import { type FeedOwner, resealStatement } from "./crypto";
import { fetchSealedFeed } from "./fetch";
import {
  type FeedFailure,
  feedFailureStatement,
  feedOwner,
  feedSuccessStatement,
  replaceItemsStatements,
  type TodoFeedRow,
} from "./store";

export type RefreshOutcome =
  /** New items were written. */
  | { kind: "fetched"; paused: boolean }
  /** ELMS answered 304. */
  | { kind: "not-modified"; paused: boolean }
  /** The same body as last time. */
  | { kind: "unchanged"; paused: boolean }
  | { kind: "failed"; broken: boolean };

export interface RefreshOptions {
  now: Date;
  /** In [0, 1), for the backoff's jitter. */
  random: number;
  /** The person has /todo open (a refresh from the app). */
  opened: boolean;
  /**
   * Whether the person has "Due tomorrow" on, which keeps the 20-minute
   * cadence and stops pausing. False until `v3/todo-notify` adds the setting.
   */
  dueTomorrowOn: boolean;
}

export async function refreshFeed(
  db: D1Database,
  mode: Extract<TodoMode, { kind: "live" | "test" }>,
  row: TodoFeedRow,
  sealed: string,
  options: RefreshOptions,
): Promise<RefreshOutcome> {
  const { now, opened } = options;
  const owner: FeedOwner = feedOwner(row);
  const { result, resealed } = await fetchSealedFeed(mode.keys, owner, sealed, {
    fetch: mode.fetch,
    etag: row.etag,
    lastModified: row.last_modified,
  });
  const statements: D1PreparedStatement[] = resealed
    ? [resealStatement(db, owner, resealed)]
    : [];
  const next = nextFetch({
    now,
    lastOpenedAt: opened ? now : new Date(row.last_opened_at),
    dueTomorrowOn: options.dueTomorrowOn,
  });
  const paused = next.status === "paused";

  const fail = async (code: FeedFailure["code"]): Promise<RefreshOutcome> => {
    const failures = row.failure_count + 1;
    const strikes = afterFailure(
      {
        strikes: row.gone_strikes,
        at: row.gone_at === null ? null : new Date(row.gone_at),
      },
      code,
      now,
    );
    statements.push(
      feedFailureStatement(db, owner, {
        now,
        code,
        failures,
        goneStrikes: strikes.strikes,
        goneAt: strikes.at,
        broken: strikes.broken,
        nextAt: new Date(now.getTime() + backoffMs(failures, options.random)),
        opened,
      }),
    );
    await db.batch(statements);
    return { kind: "failed", broken: strikes.broken };
  };

  if (!result.ok) return fail(result.code);
  if (result.notModified || result.hash === row.content_hash) {
    statements.push(
      feedSuccessStatement(db, owner, {
        now,
        next,
        body: result.notModified
          ? null
          : {
              etag: result.etag,
              lastModified: result.lastModified,
              hash: result.hash,
            },
        itemCount: null,
        opened,
      }),
    );
    await db.batch(statements);
    return {
      kind: result.notModified ? "not-modified" : "unchanged",
      paused,
    };
  }

  const parsed = parseIcs(result.text, "elms");
  if (!parsed.recognized) return fail("not-a-calendar");
  const { kept } = keepInWindow(
    parsed.items,
    newYorkDateOf(now.getTime()),
    TODO_MAX_FEED_ITEMS,
  );
  statements.push(
    ...replaceItemsStatements(db, owner.userId, "elms", kept, now),
    feedSuccessStatement(db, owner, {
      now,
      next,
      body: {
        etag: result.etag,
        lastModified: result.lastModified,
        hash: result.hash,
      },
      itemCount: kept.length,
      opened,
    }),
  );
  await db.batch(statements);
  return { kind: "fetched", paused };
}
