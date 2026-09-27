// The daily chat digest (V2.md §6.6), run by the daily job: one email for
// each person with the digest on and mentions or replies they haven't read
// or been emailed about. The text comes from each course's object at send
// time, so a message deleted, held or removed since (or in a room the
// person can no longer read) is left out, and nothing of a message is
// copied into D1.
import { z } from "zod";
import {
  type ChatNotificationType,
  campusDay,
  chatDigestLine,
  chatMessageHref,
} from "~/core/chat";
import { courseRoomId } from "~/core/schema";
import { ALERTS_ORIGIN } from "../alerts/notify";
import type { CourseChatNamespace } from "../chat/course-chat";
import { type DigestLine, renderChatDigestEmail } from "./digest-email";
import { emailOffUrl } from "./email-off";
import { type NotifyEnv, notify } from "./notify";

export interface DigestEnv extends NotifyEnv {
  DATA: R2Bucket;
  COURSE_CHAT: CourseChatNamespace;
}

const DAY_MS = 86_400_000;
/**
 * How far back a run looks. The digest is about the last day, but a row
 * isn't done until it's emailed (`emailed_at`), so a failed send, a course
 * that couldn't be reached, rows past the cap and the cron's own drift are
 * caught up by the next run instead of falling out of a 24-hour window.
 */
const DIGEST_LOOKBACK_MS = 2 * DAY_MS;
/** Mentions and replies read per run, at most; the rest wait for tomorrow's. */
const DIGEST_ROWS_MAX = 5_000;
/** `notifications` rows are kept this long (V2.md §6.3). */
const NOTIFICATIONS_KEPT_MS = 30 * DAY_MS;

const RowSchema = z.object({
  id: z.string(),
  user_id: z.string(),
  email: z.string(),
  type: z.enum(["chat-mention", "chat-reply"]),
  term_id: z.string(),
  course_code: z.string(),
  room_id: z.string(),
  message_id: z.string(),
  actor_name: z.string().nullable(),
});
type Row = z.infer<typeof RowSchema>;

type Found = { text: string; place: string; threadRoot: string | null };

/** `<user> <course room>`: one reader's messages in one course. */
const readerKey = (row: Row) =>
  `${row.user_id} ${courseRoomId(row.term_id, row.course_code)}`;

/**
 * What each course's object still shows each reader of the digest's
 * messages, by reader and course; null where the course couldn't be
 * reached.
 */
async function lookUp(
  env: DigestEnv,
  rows: readonly Row[],
): Promise<Map<string, Map<string, Found> | null>> {
  const byCourse = new Map<string, Row[]>();
  for (const row of rows) {
    const key = courseRoomId(row.term_id, row.course_code);
    byCourse.set(key, [...(byCourse.get(key) ?? []), row]);
  }
  const out = new Map<string, Map<string, Found> | null>();
  for (const [key, courseRows] of byCourse) {
    const [first] = courseRows;
    if (!first) continue;
    const byReader = new Map<string, string[]>();
    for (const row of courseRows)
      byReader.set(row.user_id, [
        ...(byReader.get(row.user_id) ?? []),
        row.message_id,
      ]);
    try {
      const stub = env.COURSE_CHAT.get(env.COURSE_CHAT.idFromName(key));
      const found = await stub.digestMessages({
        termId: first.term_id,
        courseCode: first.course_code,
        readers: [...byReader].map(([userId, ids]) => ({ userId, ids })),
      });
      for (const reader of found)
        out.set(
          `${reader.userId} ${key}`,
          new Map(reader.messages.map((m) => [m.id, m])),
        );
    } catch (error) {
      console.warn({ digest: "course lookup failed", error: String(error) });
      for (const userId of byReader.keys()) out.set(`${userId} ${key}`, null);
    }
  }
  return out;
}

export interface DigestResult {
  /** People emailed (or, with no EMAIL binding, who would have been). */
  emailed: number;
  /** Mentions and replies marked emailed. */
  notifications: number;
}

export async function sendChatDigests(
  env: DigestEnv,
  options: { now: Date; origin?: string },
): Promise<DigestResult> {
  const { now } = options;
  const origin = options.origin ?? ALERTS_ORIGIN;
  const { results } = await env.DB.prepare(
    `SELECT n.id, n.user_id, u.email, n.type, n.term_id, n.course_code, n.room_id,
            n.message_id, a.name AS actor_name
     FROM notifications n
     JOIN users u ON u.id = n.user_id AND u.status = 'active'
     JOIN notification_settings s ON s.user_id = n.user_id
       AND json_extract(s.settings, '$.chatDigest.email') = 1
     LEFT JOIN users a ON a.id = n.actor_id
     LEFT JOIN chat_read_markers k ON k.user_id = n.user_id AND k.term_id = n.term_id
       AND k.course_code = n.course_code AND k.room_id = n.room_id
     WHERE n.read_at IS NULL AND n.emailed_at IS NULL AND n.created_at >= ?1
       AND n.seq > COALESCE(k.seq, 0)
     ORDER BY n.user_id, n.created_at DESC, n.id
     LIMIT ?2`,
  )
    .bind(
      new Date(now.getTime() - DIGEST_LOOKBACK_MS).toISOString(),
      DIGEST_ROWS_MAX,
    )
    .all();
  // A row that doesn't read is skipped, not fatal: the daily job goes on.
  const rows = results.flatMap((r) => {
    const row = RowSchema.safeParse(r);
    return row.success ? [row.data] : [];
  });
  const found = await lookUp(env, rows);
  const byUser = new Map<string, Row[]>();
  for (const row of rows)
    byUser.set(row.user_id, [...(byUser.get(row.user_id) ?? []), row]);

  const result: DigestResult = { emailed: 0, notifications: 0 };
  for (const [userId, userRows] of byUser) {
    // Rows in a course that couldn't be reached wait for tomorrow.
    const settled: Row[] = [];
    const lines: DigestLine[] = [];
    for (const row of userRows) {
      const course = found.get(readerKey(row));
      if (course === null || course === undefined) continue;
      settled.push(row);
      const message = course.get(row.message_id);
      if (!message) continue;
      lines.push({
        text: chatDigestLine({
          type: row.type satisfies ChatNotificationType,
          actor: row.actor_name ?? "A classmate",
          place: message.place,
          text: message.text,
        }),
        path: chatMessageHref({
          termId: row.term_id,
          courseCode: row.course_code,
          roomId: row.room_id,
          thread: message.threadRoot,
        }),
      });
    }
    const first = userRows[0];
    if (lines.length > 0 && first) {
      const sent = await notify(
        env,
        userId,
        {
          type: "chat-digest",
          key: `chat-digest:${userId}:${campusDay(now.toISOString())}`,
          email: {
            to: first.email,
            ...renderChatDigestEmail(
              origin,
              lines,
              await emailOffUrl(env.DATA, origin, userId, "chat-digest"),
            ),
          },
        },
        { now },
      );
      // Only a send (or, with no EMAIL binding, a skip) settles the rows.
      // A failure, or a retry today that finds today's key taken, leaves
      // them for tomorrow's run, under tomorrow's key.
      if (sent.email !== "sent" && sent.email !== "skipped") continue;
      result.emailed++;
    }
    if (settled.length === 0) continue;
    await env.DB.prepare(
      `UPDATE notifications SET emailed_at = ?1
       WHERE id IN (SELECT value FROM json_each(?2))`,
    )
      .bind(now.toISOString(), JSON.stringify(settled.map((r) => r.id)))
      .run();
    result.notifications += settled.length;
  }
  return result;
}

/** The daily job: mentions and replies older than 30 days go. */
export async function pruneChatNotifications(
  db: D1Database,
  now: Date,
): Promise<number> {
  const { meta } = await db
    .prepare("DELETE FROM notifications WHERE created_at < ?1")
    .bind(new Date(now.getTime() - NOTIFICATIONS_KEPT_MS).toISOString())
    .run();
  return meta.changes;
}
