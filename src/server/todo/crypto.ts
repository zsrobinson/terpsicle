// The ELMS feed link at rest (docs/V3.md §3.3, §5.1): sealed with
// ../security/seal.ts under the Worker secret TODO_FEED_KEY, bound to its
// row. This file and fetch.ts are the only code that may touch the `url_enc`
// column or open a sealed link (scripts/check-imports.ts enforces it), and an
// opened link goes only to the fetcher. Nothing here logs, and no error
// carries the link.
import type { FeedSource } from "~/core/schema";
import {
  loadSealKeys,
  openText,
  type SealKey,
  type SealKeys,
  sealText,
} from "../security/seal";

export { sealedKeyId } from "../security/seal";

/** Whose link it is: the additional data every ciphertext is bound to. */
export interface FeedOwner {
  userId: string;
  source: Extract<FeedSource, "elms">;
}

export type FeedKey = SealKey;
export type FeedKeys = SealKeys;

/** The secret and var names, as the Worker's env has them. */
export interface FeedKeyVars {
  TODO_FEED_KEY?: string;
  TODO_FEED_KEY_ID?: string;
  TODO_FEED_KEY_PREVIOUS?: string;
  TODO_FEED_KEY_PREVIOUS_ID?: string;
}

/**
 * Test mode's fixed key (previews, `pnpm dev:mock`, e2e, worker tests): not
 * a secret, and its id `test` never names a production row, because
 * production never runs in test mode (docs/AUTH.md, "Test mode").
 */
export const TEST_FEED_KEY_VARS = {
  TODO_FEED_KEY: "dGVycHNpY2xlLXRvZG8tdGVzdC1rZXktMzItYnl0ZXM",
  TODO_FEED_KEY_ID: "test",
} as const satisfies FeedKeyVars;

/**
 * The keys from the env, or null when the current one is missing or isn't
 * 32 bytes of base64url (Todo then answers "unavailable"). A malformed
 * previous key is left out rather than failing everything.
 */
export function loadFeedKeys(vars: FeedKeyVars): Promise<FeedKeys | null> {
  return loadSealKeys({
    key: vars.TODO_FEED_KEY,
    id: vars.TODO_FEED_KEY_ID,
    previousKey: vars.TODO_FEED_KEY_PREVIOUS,
    previousId: vars.TODO_FEED_KEY_PREVIOUS_ID,
  });
}

const context = (owner: FeedOwner) =>
  `todo-feed:${owner.userId}:${owner.source}`;

/** `v1.<keyId>.<iv>.<ciphertext>`, under the current key, with a fresh IV. */
export function sealFeedLink(
  keys: FeedKeys,
  owner: FeedOwner,
  url: string,
): Promise<string> {
  return sealText(keys, context(owner), url);
}

/**
 * The link, for the fetcher only (fetch.ts). Null when the key it names is
 * gone, or it was sealed for someone else's row or tampered with.
 */
export function openFeedLink(
  keys: FeedKeys,
  owner: FeedOwner,
  sealed: string,
): Promise<string | null> {
  return openText(keys, context(owner), sealed);
}

// ---------- The url_enc column ----------

/**
 * Connecting: the feed row with its new link, created if it's the first.
 * Everything else about the row is store.ts's, in the same batch.
 */
export function saveFeedLinkStatement(
  db: D1Database,
  owner: FeedOwner,
  sealed: string,
  now: Date,
): D1PreparedStatement {
  const at = now.toISOString();
  return db
    .prepare(
      `INSERT INTO todo_feeds (user_id, source, url_enc, status, created_at, next_fetch_at, last_opened_at)
       VALUES (?1, ?2, ?3, 'active', ?4, ?4, ?4)
       ON CONFLICT (user_id, source) DO UPDATE SET url_enc = excluded.url_enc`,
    )
    .bind(owner.userId, owner.source, sealed, at);
}

/** A link sealed again under the current key (the cron's rotation). */
export function resealStatement(
  db: D1Database,
  owner: FeedOwner,
  sealed: string,
): D1PreparedStatement {
  return db
    .prepare(
      "UPDATE todo_feeds SET url_enc = ?3 WHERE user_id = ?1 AND source = ?2",
    )
    .bind(owner.userId, owner.source, sealed);
}

const ownerKey = (owner: FeedOwner) => `${owner.userId}\n${owner.source}`;

/** The sealed links of these feeds, in one query, by `ownerKey`. */
export async function loadSealedLinks(
  db: D1Database,
  owners: readonly FeedOwner[],
): Promise<(owner: FeedOwner) => string | null> {
  const found = new Map<string, string>();
  if (owners.length > 0) {
    const { results } = await db
      .prepare(
        `SELECT f.user_id, f.source, f.url_enc FROM todo_feeds f
         JOIN json_each(?1) o
           ON f.user_id = json_extract(o.value, '$[0]') AND f.source = json_extract(o.value, '$[1]')`,
      )
      .bind(JSON.stringify(owners.map((o) => [o.userId, o.source])))
      .all<{ user_id: unknown; source: unknown; url_enc: unknown }>();
    for (const row of results) {
      if (
        typeof row.user_id === "string" &&
        row.source === "elms" &&
        typeof row.url_enc === "string"
      )
        found.set(
          ownerKey({ userId: row.user_id, source: row.source }),
          row.url_enc,
        );
    }
  }
  return (owner) => found.get(ownerKey(owner)) ?? null;
}
