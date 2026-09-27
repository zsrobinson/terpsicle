// `calendar_feeds` (migrations/0018_calendar_feeds.sql) and the reads a feed
// is built from: the person's plans (sync_docs) and Todo's list.
import { z } from "zod";
import { type Plan, PlanDocSchema, type TermId } from "~/core/schema";

const FeedRowSchema = z.object({
  nonce: z.string().min(1),
  created_at: z.string(),
});

/** The person's feed row, or null before their first ask. */
export async function getFeed(
  db: D1Database,
  userId: string,
): Promise<{ nonce: string; createdAt: string } | null> {
  const row = await db
    .prepare("SELECT nonce, created_at FROM calendar_feeds WHERE user_id = ?1")
    .bind(userId)
    .first();
  if (!row) return null;
  const parsed = FeedRowSchema.parse(row);
  return { nonce: parsed.nonce, createdAt: parsed.created_at };
}

/**
 * Makes the person's feed with `nonce` unless they have one (two tabs asking
 * at once make one link, not two). True when this call made it.
 */
export async function createFeed(
  db: D1Database,
  userId: string,
  feed: { nonce: string; tokenHash: string },
  now: Date,
): Promise<boolean> {
  const result = await db
    .prepare(
      `INSERT INTO calendar_feeds (user_id, token_hash, nonce, created_at)
       VALUES (?1, ?2, ?3, ?4)
       ON CONFLICT (user_id) DO NOTHING`,
    )
    .bind(userId, feed.tokenHash, feed.nonce, now.toISOString())
    .run();
  return (result.meta.changes ?? 0) > 0;
}

/** A new link: the new nonce and hash replace the old, so the old link matches nothing. */
export async function replaceFeed(
  db: D1Database,
  userId: string,
  feed: { nonce: string; tokenHash: string },
  now: Date,
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO calendar_feeds (user_id, token_hash, nonce, created_at)
       VALUES (?1, ?2, ?3, ?4)
       ON CONFLICT (user_id) DO UPDATE SET
         token_hash = excluded.token_hash, nonce = excluded.nonce,
         created_at = excluded.created_at, last_fetched_at = NULL`,
    )
    .bind(userId, feed.tokenHash, feed.nonce, now.toISOString())
    .run();
}

/**
 * Whose feed a token's hash is, for an account that's still active (one on
 * its way to deletion stops serving at once). Null for anything else.
 */
export async function feedOwner(
  db: D1Database,
  tokenHash: string,
): Promise<string | null> {
  const row = await db
    .prepare(
      `SELECT f.user_id FROM calendar_feeds f
       JOIN users u ON u.id = f.user_id AND u.status = 'active'
       WHERE f.token_hash = ?1`,
    )
    .bind(tokenHash)
    .first<{ user_id: unknown }>();
  return typeof row?.user_id === "string" ? row.user_id : null;
}

/** An hour: `last_fetched_at` is written at most this often per feed. */
const FETCH_MARK_MS = 3_600_000;

/**
 * Notes a calendar's fetch, at most once an hour, so a busy feed costs a
 * D1 write an hour rather than one a fetch.
 */
export async function markFetched(
  db: D1Database,
  userId: string,
  now: Date,
): Promise<void> {
  await db
    .prepare(
      `UPDATE calendar_feeds SET last_fetched_at = ?2
       WHERE user_id = ?1 AND (last_fetched_at IS NULL OR last_fetched_at < ?3)`,
    )
    .bind(
      userId,
      now.toISOString(),
      new Date(now.getTime() - FETCH_MARK_MS).toISOString(),
    )
    .run();
}

const PlanBodySchema = z.object({ body: z.string() });

/** The person's live plans in these terms, from their sync docs. */
export async function plansInTerms(
  db: D1Database,
  userId: string,
  termIds: readonly TermId[],
): Promise<Plan[]> {
  if (termIds.length === 0) return [];
  const { results } = await db
    .prepare(
      `SELECT body FROM sync_docs
       WHERE user_id = ?1 AND kind = 'plan' AND deleted = 0
         AND term_id IN (SELECT value FROM json_each(?2))`,
    )
    .bind(userId, JSON.stringify(termIds))
    .all();
  return results.flatMap((r) => {
    const doc = PlanDocSchema.safeParse(
      JSON.parse(PlanBodySchema.parse(r).body),
    );
    return doc.success ? [doc.data] : [];
  });
}
