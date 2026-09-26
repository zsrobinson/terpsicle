// D1 access for seat watches. Every row read is validated (CLAUDE.md:
// validate every boundary). SQL lives here and nowhere else.
import {
  EmailSchema,
  type SeatWatchRow,
  SeatWatchRowSchema,
} from "~/core/schema";

export async function listWatches(
  db: D1Database,
  userId: string,
  termId?: string,
): Promise<SeatWatchRow[]> {
  const statement =
    termId === undefined
      ? db
          .prepare(
            "SELECT * FROM seat_watches WHERE user_id = ?1 ORDER BY created_at DESC",
          )
          .bind(userId)
      : db
          .prepare(
            "SELECT * FROM seat_watches WHERE user_id = ?1 AND term_id = ?2 ORDER BY created_at DESC",
          )
          .bind(userId, termId);
  const { results } = await statement.all();
  return results.map((r) => SeatWatchRowSchema.parse(r));
}

export async function countWatches(
  db: D1Database,
  userId: string,
): Promise<number> {
  const row = await db
    .prepare("SELECT COUNT(*) AS n FROM seat_watches WHERE user_id = ?1")
    .bind(userId)
    .first<{ n: number }>();
  return row?.n ?? 0;
}

export async function getWatch(
  db: D1Database,
  userId: string,
  termId: string,
  sectionKey: string,
): Promise<SeatWatchRow | null> {
  const row = await db
    .prepare(
      "SELECT * FROM seat_watches WHERE user_id = ?1 AND term_id = ?2 AND section_key = ?3",
    )
    .bind(userId, termId, sectionKey)
    .first();
  return row ? SeatWatchRowSchema.parse(row) : null;
}

/** Adds the watch unless it's on already; false when it was. */
export async function insertWatch(
  db: D1Database,
  row: Pick<
    SeatWatchRow,
    "user_id" | "term_id" | "section_key" | "created_at" | "last_open"
  >,
): Promise<boolean> {
  const result = await db
    .prepare(
      `INSERT OR IGNORE INTO seat_watches
         (user_id, term_id, section_key, created_at, last_open, last_checked_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?4)`,
    )
    .bind(
      row.user_id,
      row.term_id,
      row.section_key,
      row.created_at,
      row.last_open,
    )
    .run();
  return result.meta.changes > 0;
}

export async function deleteWatch(
  db: D1Database,
  userId: string,
  termId: string,
  sectionKey: string,
): Promise<void> {
  await db
    .prepare(
      "DELETE FROM seat_watches WHERE user_id = ?1 AND term_id = ?2 AND section_key = ?3",
    )
    .bind(userId, termId, sectionKey)
    .run();
}

/** A term's watches with the address each alert goes to (the one used last). */
export async function watchesInTerm(
  db: D1Database,
  termId: string,
): Promise<(SeatWatchRow & { email: string })[]> {
  const { results } = await db
    .prepare(
      `SELECT w.*, u.email AS email FROM seat_watches w
       JOIN users u ON u.id = w.user_id
       WHERE w.term_id = ?1 AND u.status = 'active'`,
    )
    .bind(termId)
    .all();
  return results.map((r) => ({
    ...SeatWatchRowSchema.parse(r),
    email: EmailSchema.parse((r as { email?: unknown }).email),
  }));
}

export function recordCheck(
  db: D1Database,
  row: Pick<SeatWatchRow, "user_id" | "term_id" | "section_key">,
  open: number,
  now: string,
  notified: boolean,
): D1PreparedStatement {
  return notified
    ? db
        .prepare(
          `UPDATE seat_watches
           SET last_open = ?4, last_checked_at = ?5, last_notified_at = ?5, last_notified_open = ?4
           WHERE user_id = ?1 AND term_id = ?2 AND section_key = ?3`,
        )
        .bind(row.user_id, row.term_id, row.section_key, open, now)
    : db
        .prepare(
          `UPDATE seat_watches SET last_open = ?4, last_checked_at = ?5
           WHERE user_id = ?1 AND term_id = ?2 AND section_key = ?3`,
        )
        .bind(row.user_id, row.term_id, row.section_key, open, now);
}

/** Terms that still have watches. */
export async function watchedTerms(db: D1Database): Promise<string[]> {
  const { results } = await db
    .prepare("SELECT DISTINCT term_id FROM seat_watches")
    .all<{ term_id: string }>();
  return results.map((r) => r.term_id);
}

/** Ends every watch in these terms; returns how many went. */
export async function deleteTermWatches(
  db: D1Database,
  termIds: readonly string[],
): Promise<number> {
  if (termIds.length === 0) return 0;
  const placeholders = termIds.map((_, i) => `?${i + 1}`).join(", ");
  const result = await db
    .prepare(`DELETE FROM seat_watches WHERE term_id IN (${placeholders})`)
    .bind(...termIds)
    .run();
  return result.meta.changes;
}

/** Seat-open alerts this person got since `since` (the daily cap). */
export async function countSends(
  db: D1Database,
  userId: string,
  since: string,
): Promise<number> {
  const row = await db
    .prepare(
      "SELECT COUNT(*) AS n FROM seat_alert_sends WHERE user_id = ?1 AND sent_at >= ?2",
    )
    .bind(userId, since)
    .first<{ n: number }>();
  return row?.n ?? 0;
}

/** Claims a dedupe key: the new row id, or null when it was sent (or tried) already. */
export async function claimSend(
  db: D1Database,
  row: {
    userId: string;
    termId: string;
    sectionKey: string;
    dedupeKey: string;
    sentAt: string;
  },
): Promise<number | null> {
  const result = await db
    .prepare(
      `INSERT OR IGNORE INTO seat_alert_sends
         (user_id, term_id, section_key, channel, dedupe_key, status, sent_at)
       VALUES (?1, ?2, ?3, 'email', ?4, 'sent', ?5)`,
    )
    .bind(row.userId, row.termId, row.sectionKey, row.dedupeKey, row.sentAt)
    .run();
  return result.meta.changes > 0 ? result.meta.last_row_id : null;
}

export async function finishSend(
  db: D1Database,
  id: number,
  outcome: { status: "sent"; providerId: string } | { status: "failed" },
): Promise<void> {
  await db
    .prepare(
      "UPDATE seat_alert_sends SET status = ?2, provider_id = ?3 WHERE id = ?1",
    )
    .bind(
      id,
      outcome.status,
      outcome.status === "sent" ? outcome.providerId : null,
    )
    .run();
}

/** Drops send records older than a week (the cap looks back one day). */
export async function pruneSends(db: D1Database, now: Date): Promise<void> {
  const cutoff = new Date(now.getTime() - 7 * 86_400_000).toISOString();
  await db
    .prepare("DELETE FROM seat_alert_sends WHERE sent_at < ?1")
    .bind(cutoff)
    .run();
}
