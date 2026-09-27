// Chat's spam guard in D1 (migrations/0014_chat_spam_guard.sql): records
// each message or edit's fingerprint, then asks the pure rules in
// ~/core/moderation/cross-room whether this person is posting the same
// thing across courses, or flooding them. The rows never hold the words.
import { z } from "zod";
import {
  CROSS_ROOM,
  type CrossRoomSend,
  crossRoomRule,
  textFingerprint,
} from "~/core/moderation";
import {
  type CourseCode,
  CourseCodeSchema,
  type CrossRoomRule,
  IsoDateTimeSchema,
} from "~/core/schema";

/** Earlier rows read per check, at most: far past both rules' counts. */
const MAX_EARLIER = 200;

const SendRowSchema = z.object({
  course_code: CourseCodeSchema,
  text_hash: z
    .string()
    .regex(/^[0-9a-f]{16}$/)
    .nullable(),
  created_at: IsoDateTimeSchema,
});

export interface SpamGuardInput {
  userId: string;
  /** The course whose room it went to: rooms of one course count once. */
  course: CourseCode;
  text: string;
  now: Date;
}

/**
 * Logs this send and says which rule it trips, or null. The read and the
 * write are one batch, so the earlier rows are exactly the ones before it.
 */
export async function checkCrossRoom(
  db: D1Database,
  input: SpamGuardInput,
): Promise<CrossRoomRule | null> {
  const now = input.now.getTime();
  const current: CrossRoomSend = {
    course: input.course,
    fingerprint: textFingerprint(input.text),
    at: now,
  };
  const since = new Date(now - CROSS_ROOM.keepMs).toISOString();
  const [earlier] = await db.batch([
    db
      .prepare(
        `SELECT course_code, text_hash, created_at FROM chat_send_hashes
         WHERE user_id = ?1 AND created_at > ?2
         ORDER BY created_at DESC LIMIT ?3`,
      )
      .bind(input.userId, since, MAX_EARLIER),
    db
      .prepare(
        "INSERT INTO chat_send_hashes (user_id, course_code, text_hash, created_at) VALUES (?1, ?2, ?3, ?4)",
      )
      .bind(
        input.userId,
        input.course,
        current.fingerprint,
        input.now.toISOString(),
      ),
  ]);
  const sends = (earlier?.results ?? []).map((r): CrossRoomSend => {
    const row = SendRowSchema.parse(r);
    return {
      course: row.course_code,
      fingerprint: row.text_hash,
      at: Date.parse(row.created_at),
    };
  });
  return crossRoomRule(current, sends, now);
}

/** Drops rows older than the longest rule's window; the count removed. */
export async function pruneSendHashes(
  db: D1Database,
  now: Date,
): Promise<number> {
  const before = new Date(now.getTime() - CROSS_ROOM.keepMs).toISOString();
  const result = await db
    .prepare("DELETE FROM chat_send_hashes WHERE created_at <= ?1")
    .bind(before)
    .run();
  return result.meta.changes ?? 0;
}
