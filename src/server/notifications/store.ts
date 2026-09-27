// notification_settings and notification_deliveries
// (migrations/0006_notifications.sql).
import {
  type Channel,
  DEFAULT_NOTIFICATION_SETTINGS,
  type DeliveryStatus,
  type DeliveryType,
  type NotificationSettings,
  NotificationSettingsSchema,
} from "~/core/schema/notifications";

/** Deliveries are kept this long, for dedupe and the admin's counts. */
const DELIVERIES_KEPT_MS = 90 * 86_400_000;

/** This person's settings; the defaults when they've saved none (or a row no longer reads). */
export async function readSettings(
  db: D1Database,
  userId: string,
): Promise<NotificationSettings> {
  const row = await db
    .prepare("SELECT settings FROM notification_settings WHERE user_id = ?1")
    .bind(userId)
    .first<{ settings: string }>();
  if (!row) return DEFAULT_NOTIFICATION_SETTINGS;
  try {
    const parsed = NotificationSettingsSchema.safeParse(
      JSON.parse(row.settings),
    );
    if (parsed.success) return parsed.data;
  } catch {
    // Fall through to the defaults.
  }
  console.warn({ notifications: "unreadable settings row" });
  return DEFAULT_NOTIFICATION_SETTINGS;
}

export async function writeSettings(
  db: D1Database,
  userId: string,
  settings: NotificationSettings,
  now: Date,
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO notification_settings (user_id, settings, updated_at)
       VALUES (?1, ?2, ?3)
       ON CONFLICT (user_id) DO UPDATE SET
         settings = excluded.settings, updated_at = excluded.updated_at`,
    )
    .bind(userId, JSON.stringify(settings), now.toISOString())
    .run();
}

/**
 * Claims a delivery's dedupe key before sending. Null when it was already
 * claimed: that notification went (or was tried) before.
 */
export async function claimDelivery(
  db: D1Database,
  args: {
    userId: string;
    type: DeliveryType;
    channel: Channel;
    dedupeKey: string;
    status: DeliveryStatus;
    now: Date;
  },
): Promise<number | null> {
  const row = await db
    .prepare(
      `INSERT INTO notification_deliveries
         (user_id, type, channel, dedupe_key, status, sent_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6)
       ON CONFLICT (dedupe_key) DO NOTHING
       RETURNING id`,
    )
    .bind(
      args.userId,
      args.type,
      args.channel,
      args.dedupeKey,
      args.status,
      args.now.toISOString(),
    )
    .first<{ id: number }>();
  return row?.id ?? null;
}

export async function finishDelivery(
  db: D1Database,
  id: number,
  status: DeliveryStatus,
  providerId: string | null,
): Promise<void> {
  await db
    .prepare(
      "UPDATE notification_deliveries SET status = ?2, provider_id = ?3 WHERE id = ?1",
    )
    .bind(id, status, providerId)
    .run();
}

/** Deliveries of `type` to this person since `since`, sent or tried (for caps). */
export async function countDeliveries(
  db: D1Database,
  args: { userId: string; type: DeliveryType; channel: Channel; since: Date },
): Promise<number> {
  const row = await db
    .prepare(
      `SELECT COUNT(*) AS n FROM notification_deliveries
       WHERE user_id = ?1 AND type = ?2 AND channel = ?3 AND sent_at >= ?4
         AND status != 'skipped'`,
    )
    .bind(args.userId, args.type, args.channel, args.since.toISOString())
    .first<{ n: number }>();
  return row?.n ?? 0;
}

/** The daily job: deliveries older than 90 days go. */
export async function pruneDeliveries(
  db: D1Database,
  now: Date,
): Promise<number> {
  const { meta } = await db
    .prepare("DELETE FROM notification_deliveries WHERE sent_at < ?1")
    .bind(new Date(now.getTime() - DELIVERIES_KEPT_MS).toISOString())
    .run();
  return meta.changes;
}
