// push_subscriptions (migrations/0006_notifications.sql): one row per
// device, found by its unique endpoint.
import {
  type PushSubscriptionRow,
  PushSubscriptionRowSchema,
} from "~/core/schema/notifications";
import { randomToken } from "../crypto";

/** Consecutive failures (429, 5xx, network) before a subscription is dropped. */
export const MAX_PUSH_FAILURES = 10;

/**
 * Saves a device's subscription. The endpoint is unique, so saving it again
 * refreshes the keys, and a second account signing in on the device takes
 * the row over: the first account's notifications stop reaching it (V2 §3.3).
 */
export async function saveSubscription(
  db: D1Database,
  args: {
    userId: string;
    endpoint: string;
    p256dh: string;
    auth: string;
    label: string | null;
    now: Date;
  },
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO push_subscriptions
         (id, user_id, endpoint, p256dh, auth, user_agent_label, created_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
       ON CONFLICT (endpoint) DO UPDATE SET
         p256dh = excluded.p256dh,
         auth = excluded.auth,
         user_agent_label = COALESCE(excluded.user_agent_label, user_agent_label),
         failure_count = 0,
         -- Another account on this device: a new row as far as anyone sees.
         created_at = CASE WHEN user_id = excluded.user_id
           THEN created_at ELSE excluded.created_at END,
         last_success_at = CASE WHEN user_id = excluded.user_id
           THEN last_success_at ELSE NULL END,
         id = CASE WHEN user_id = excluded.user_id THEN id ELSE excluded.id END,
         user_id = excluded.user_id`,
    )
    .bind(
      randomToken(16),
      args.userId,
      args.endpoint,
      args.p256dh,
      args.auth,
      args.label,
      args.now.toISOString(),
    )
    .run();
}

/** This person's subscriptions, oldest first. */
export async function subscriptionsOf(
  db: D1Database,
  userId: string,
): Promise<PushSubscriptionRow[]> {
  const { results } = await db
    .prepare(
      "SELECT * FROM push_subscriptions WHERE user_id = ?1 ORDER BY created_at, id",
    )
    .bind(userId)
    .all();
  return results.map((row) => PushSubscriptionRowSchema.parse(row));
}

/** Removes a device of this person's, by endpoint; true when one went. */
export async function deleteByEndpoint(
  db: D1Database,
  userId: string,
  endpoint: string,
): Promise<boolean> {
  const { meta } = await db
    .prepare(
      "DELETE FROM push_subscriptions WHERE user_id = ?1 AND endpoint = ?2",
    )
    .bind(userId, endpoint)
    .run();
  return meta.changes > 0;
}

/** Removes a device of this person's, by id; true when one went. */
export async function deleteById(
  db: D1Database,
  userId: string,
  id: string,
): Promise<boolean> {
  const { meta } = await db
    .prepare("DELETE FROM push_subscriptions WHERE user_id = ?1 AND id = ?2")
    .bind(userId, id)
    .run();
  return meta.changes > 0;
}

/** Every device of this person's (account deletion). */
export function deleteAllOf(
  db: D1Database,
  userId: string,
): D1PreparedStatement {
  return db
    .prepare("DELETE FROM push_subscriptions WHERE user_id = ?1")
    .bind(userId);
}

/** What a send did to a subscription (V2 §6.4, "Results"). */
export type SendEffect = "success" | "gone" | "failure";

/**
 * 201 → `last_success_at`, failures reset; 404/410 → gone; anything else
 * counts, and the 10th in a row drops it.
 */
export function recordSend(
  db: D1Database,
  id: string,
  effect: SendEffect,
  now: Date,
): D1PreparedStatement[] {
  if (effect === "success")
    return [
      db
        .prepare(
          "UPDATE push_subscriptions SET last_success_at = ?2, failure_count = 0 WHERE id = ?1",
        )
        .bind(id, now.toISOString()),
    ];
  if (effect === "gone")
    return [
      db.prepare("DELETE FROM push_subscriptions WHERE id = ?1").bind(id),
    ];
  return [
    db
      .prepare(
        "UPDATE push_subscriptions SET failure_count = failure_count + 1 WHERE id = ?1",
      )
      .bind(id),
    db
      .prepare(
        "DELETE FROM push_subscriptions WHERE id = ?1 AND failure_count >= ?2",
      )
      .bind(id, MAX_PUSH_FAILURES),
  ];
}
