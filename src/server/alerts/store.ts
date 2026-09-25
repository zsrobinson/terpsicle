// D1 access for seat alerts. Every row read is validated (CLAUDE.md: validate
// every boundary). SQL lives here and nowhere else.
import {
  type AlertSubscriptionRow,
  AlertSubscriptionRowSchema,
  type AlertTokenPurpose,
  type AlertTokenRow,
  AlertTokenRowSchema,
  type EmailKind,
} from "~/core/schema";

function rows<T>(
  schema: { parse: (v: unknown) => T },
  results: unknown[],
): T[] {
  return results.map((r) => schema.parse(r));
}

export async function findSubscription(
  db: D1Database,
  email: string,
  termId: string,
  sectionKey: string,
): Promise<AlertSubscriptionRow | null> {
  const row = await db
    .prepare(
      "SELECT * FROM alert_subscriptions WHERE email = ?1 AND term_id = ?2 AND section_key = ?3",
    )
    .bind(email, termId, sectionKey)
    .first();
  return row ? AlertSubscriptionRowSchema.parse(row) : null;
}

export async function getSubscription(
  db: D1Database,
  id: string,
): Promise<AlertSubscriptionRow | null> {
  const row = await db
    .prepare("SELECT * FROM alert_subscriptions WHERE id = ?1")
    .bind(id)
    .first();
  return row ? AlertSubscriptionRowSchema.parse(row) : null;
}

export async function insertSubscription(
  db: D1Database,
  row: Pick<
    AlertSubscriptionRow,
    "id" | "email" | "term_id" | "section_key" | "created_at"
  >,
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO alert_subscriptions (id, email, term_id, section_key, status, created_at)
       VALUES (?1, ?2, ?3, ?4, 'pending', ?5)`,
    )
    .bind(row.id, row.email, row.term_id, row.section_key, row.created_at)
    .run();
}

export async function setPending(db: D1Database, id: string): Promise<void> {
  await db
    .prepare(
      "UPDATE alert_subscriptions SET status = 'pending', unsubscribed_at = NULL WHERE id = ?1",
    )
    .bind(id)
    .run();
}

export async function activate(
  db: D1Database,
  id: string,
  now: string,
  lastOpen: number | null,
): Promise<void> {
  await db
    .prepare(
      `UPDATE alert_subscriptions
       SET status = 'active', confirmed_at = ?2, unsubscribed_at = NULL,
           last_open = ?3, last_checked_at = ?2
       WHERE id = ?1`,
    )
    .bind(id, now, lastOpen)
    .run();
}

export async function deactivate(
  db: D1Database,
  id: string,
  now: string,
): Promise<void> {
  await db
    .prepare(
      `UPDATE alert_subscriptions SET status = 'unsubscribed', unsubscribed_at = ?2
       WHERE id = ?1 AND status != 'unsubscribed'`,
    )
    .bind(id, now)
    .run();
}

export async function insertToken(
  db: D1Database,
  row: AlertTokenRow,
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO alert_tokens (token_hash, subscription_id, purpose, created_at, expires_at, used_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6)`,
    )
    .bind(
      row.token_hash,
      row.subscription_id,
      row.purpose,
      row.created_at,
      row.expires_at,
      row.used_at,
    )
    .run();
}

export async function findToken(
  db: D1Database,
  hash: string,
  purpose: AlertTokenPurpose,
): Promise<AlertTokenRow | null> {
  const row = await db
    .prepare(
      "SELECT * FROM alert_tokens WHERE token_hash = ?1 AND purpose = ?2",
    )
    .bind(hash, purpose)
    .first();
  return row ? AlertTokenRowSchema.parse(row) : null;
}

/** Marks a confirm token used; false if another request used it first. */
export async function spendToken(
  db: D1Database,
  hash: string,
  now: string,
): Promise<boolean> {
  const result = await db
    .prepare(
      "UPDATE alert_tokens SET used_at = ?2 WHERE token_hash = ?1 AND used_at IS NULL",
    )
    .bind(hash, now)
    .run();
  return result.meta.changes > 0;
}

/** Emails of these kinds sent to `email` since `since` (for per-address caps). */
export async function countSends(
  db: D1Database,
  email: string,
  kinds: readonly EmailKind[],
  since: string,
): Promise<number> {
  const placeholders = kinds.map((_, i) => `?${i + 3}`).join(", ");
  const row = await db
    .prepare(
      `SELECT COUNT(*) AS n FROM email_sends
       WHERE email = ?1 AND sent_at >= ?2 AND kind IN (${placeholders})`,
    )
    .bind(email, since, ...kinds)
    .first<{ n: number }>();
  return row?.n ?? 0;
}

/** When this subscription was last sent an email of these kinds, or null. */
export async function lastSendAt(
  db: D1Database,
  subscriptionId: string,
  kinds: readonly EmailKind[],
): Promise<string | null> {
  const placeholders = kinds.map((_, i) => `?${i + 2}`).join(", ");
  const row = await db
    .prepare(
      `SELECT MAX(sent_at) AS at FROM email_sends
       WHERE subscription_id = ?1 AND kind IN (${placeholders})`,
    )
    .bind(subscriptionId, ...kinds)
    .first<{ at: string | null }>();
  return row?.at ?? null;
}

/** Claims a dedupe key: the new row id, or null when this email was already sent (or tried). */
export async function claimSend(
  db: D1Database,
  row: {
    email: string;
    subscriptionId: string;
    kind: EmailKind;
    dedupeKey: string;
    sentAt: string;
  },
): Promise<number | null> {
  const result = await db
    .prepare(
      `INSERT OR IGNORE INTO email_sends (email, subscription_id, kind, dedupe_key, status, sent_at)
       VALUES (?1, ?2, ?3, ?4, 'sent', ?5)`,
    )
    .bind(row.email, row.subscriptionId, row.kind, row.dedupeKey, row.sentAt)
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
      "UPDATE email_sends SET status = ?2, provider_id = ?3 WHERE id = ?1",
    )
    .bind(
      id,
      outcome.status,
      outcome.status === "sent" ? outcome.providerId : null,
    )
    .run();
}

export async function activeSubscriptions(
  db: D1Database,
  termId: string,
): Promise<AlertSubscriptionRow[]> {
  const { results } = await db
    .prepare(
      "SELECT * FROM alert_subscriptions WHERE term_id = ?1 AND status = 'active'",
    )
    .bind(termId)
    .all();
  return rows(AlertSubscriptionRowSchema, results);
}

export function recordCheck(
  db: D1Database,
  id: string,
  open: number,
  now: string,
  notified: boolean,
): D1PreparedStatement {
  return notified
    ? db
        .prepare(
          `UPDATE alert_subscriptions
           SET last_open = ?2, last_checked_at = ?3, last_notified_at = ?3, last_notified_open = ?2
           WHERE id = ?1`,
        )
        .bind(id, open, now)
    : db
        .prepare(
          "UPDATE alert_subscriptions SET last_open = ?2, last_checked_at = ?3 WHERE id = ?1",
        )
        .bind(id, open, now);
}

/** Removes confirm tokens that expired a week ago (their subscriptions stay). */
export async function pruneTokens(db: D1Database, now: Date): Promise<void> {
  const cutoff = new Date(now.getTime() - 7 * 86_400_000).toISOString();
  await db
    .prepare(
      "DELETE FROM alert_tokens WHERE purpose = 'confirm' AND expires_at < ?1",
    )
    .bind(cutoff)
    .run();
}
