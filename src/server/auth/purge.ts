// Account deletion's purge (V2.md §4.7, V3.md §3.4): what the daily job does
// to an account whose week of grace after "Delete account" has ended. When it
// finishes, no row anywhere keeps the person's directory ID or email, except
// where PURGE_LEDGER says why.
//
// Resumable and idempotent. The steps run in this order, and each can run
// again safely:
//   1. Chat: `purgeAuthor` on every course object in `chat_author_courses`,
//      each row deleted only once its object has answered. A run that dies
//      midway leaves the rest for tomorrow.
//   2. Pictures in R2 (`avatars/<userId>/`).
//   3. One D1 batch (a transaction): every row below, the `users` row last.
// Until step 3 commits, the account is still `deleting` and past its date,
// so the next run picks it up again and finishes.
import { courseRoomId } from "~/core/schema";
import type { CourseChatNamespace } from "../chat/course-chat";
import { forgetReporterStatement } from "../moderation/store";
import { forgetAuthorStatement } from "../reviews/store";
import { deletePictures } from "./pictures";

/**
 * Every table in `migrations/`, and what the purge does to a person's rows
 * in it. A worker test checks this against the live schema, so a migration
 * that adds a table fails until it's listed here (and, if it holds user
 * data, purged below).
 */
export const PURGE_LEDGER = {
  // 0002_seat_alerts (its alert tables dropped by 0007)
  counters:
    "the person's rate-limit windows (`user:<id>:…`) deleted; the rest are keyed by a hash of an IP",
  // 0003_identity
  users: "deleted, last",
  user_identities: "deleted (both of a person's addresses live here)",
  sessions: "deleted",
  // 0004_moderation: nothing here names an author.
  moderation_decisions: "kept: no user id, only a surface and a ref",
  moderation_queue:
    "kept: no user id; purgeAuthor withdraws waiting items for the chat messages it deletes. A decided item's snapshot keeps the words, never the author, until it's blanked 30 days after closing",
  reports:
    "kept for moderation, each reporter_id swapped for a random stand-in",
  // 0005_sync, 0010_four_year_sync
  sync_docs: "deleted: plans, settings and four-year docs",
  sync_heads: "deleted",
  // 0008_reviews
  instructors: "untouched: no user data",
  instructor_names: "untouched: no user data",
  reviews: "kept as they are, author_id set to null",
  // 0009_chat
  chat_members: "deleted",
  chat_follows: "deleted",
  chat_rooms: "untouched: no user id",
  chat_read_markers: "deleted",
  chat_room_prefs: "deleted",
  chat_author_courses:
    "each row deleted once purgeAuthor has run on its course's object",
  // 0006_notifications
  notification_settings: "deleted",
  push_subscriptions:
    "deleted (account/delete already dropped them, a week earlier)",
  notifications: "deleted: the person's chat mentions and replies",
  notification_deliveries:
    "kept for dedupe and counts, user_id set to null; pruned after 90 days",
  // 0007_seat_watches
  seat_watches: "deleted",
  seat_alert_sends: "deleted",
  // 0011_todo
  todo_feeds: "deleted (the sealed ELMS link with it)",
  todo_items: "deleted",
  todo_done: "deleted",
  // 0012_feedback
  feedback:
    "kept for the owner, user_id set to null (they can't be replied to now)",
  feedback_groups: "untouched: no user data",
} as const satisfies Record<string, string>;

/**
 * Tables D1 and Miniflare keep for themselves, never ours to purge. The
 * ledger test skips them.
 */
export const SYSTEM_TABLES = ["d1_migrations", "_cf_KV", "_cf_METADATA"];

export interface PurgeEnv {
  DB: D1Database;
  USER_CONTENT: R2Bucket;
  COURSE_CHAT: CourseChatNamespace;
}

export interface PurgeReport {
  accounts: number;
  chatCourses: number;
  chatMessages: number;
  /** One line per account that didn't finish; tomorrow's run carries on. */
  errors: string[];
}

/** Accounts whose week of grace after "Delete account" has ended. */
export async function accountsDueForPurge(
  db: D1Database,
  now: Date,
): Promise<string[]> {
  const { results } = await db
    .prepare(
      "SELECT id FROM users WHERE status = 'deleting' AND delete_after <= ?1 ORDER BY delete_after, id",
    )
    .bind(now.toISOString())
    .all<{ id: string }>();
  return results.map((r) => r.id);
}

/**
 * SQL that's true while `?1` is still deleting and past its date, with the
 * run's time as `?2`. Every step checks it, so someone who signs in while a
 * run is on its way to them keeps their account (V2.md §4.7).
 */
export const STILL_DUE =
  "EXISTS (SELECT 1 FROM users WHERE id = ?1 AND status = 'deleting' AND delete_after <= ?2)";

async function stillDue(
  db: D1Database,
  userId: string,
  at: string,
): Promise<boolean> {
  return (
    (await db
      .prepare(`SELECT ${STILL_DUE} AS due`)
      .bind(userId, at)
      .first<number>("due")) === 1
  );
}

/**
 * Purges every account past its `delete_after`. One account's failure
 * doesn't stop the others: it's reported, with the step, and the next run
 * resumes it.
 */
export async function purgeDueAccounts(
  env: PurgeEnv,
  now: Date,
): Promise<PurgeReport> {
  const report: PurgeReport = {
    accounts: 0,
    chatCourses: 0,
    chatMessages: 0,
    errors: [],
  };
  for (const userId of await accountsDueForPurge(env.DB, now)) {
    let step = "chat";
    try {
      const chat = await purgeChat(env, userId, now);
      report.chatCourses += chat.courses;
      report.chatMessages += chat.messages;
      // Signed in since the run started: the account stays.
      if (!chat.due) continue;
      step = "pictures";
      await deletePictures(env.USER_CONTENT, userId);
      step = "rows";
      const results = await env.DB.batch(
        accountStatements(env.DB, userId, now),
      );
      // The `users` delete is last; 0 when a sign-in got there first.
      if ((results.at(-1)?.meta.changes ?? 0) > 0) report.accounts += 1;
    } catch (error) {
      // The step and the error's name only: no user id or text in logs.
      report.errors.push(
        `purge ${step}: ${error instanceof Error ? error.name : "unknown"}`,
      );
    }
  }
  return report;
}

/**
 * Step 1: the person's messages in every course they wrote in. Each
 * `chat_author_courses` row goes once its object has answered, so a crash
 * leaves exactly the courses still to do. Stops (`due: false`) as soon as
 * the account isn't due any more.
 */
export async function purgeChat(
  env: PurgeEnv,
  userId: string,
  now: Date,
): Promise<{ courses: number; messages: number; due: boolean }> {
  const at = now.toISOString();
  const { results } = await env.DB.prepare(
    `SELECT term_id, course_code FROM chat_author_courses
     WHERE user_id = ?1 ORDER BY term_id, course_code`,
  )
    .bind(userId)
    .all<{ term_id: string; course_code: string }>();
  let courses = 0;
  let messages = 0;
  for (const row of results) {
    if (!(await stillDue(env.DB, userId, at)))
      return { courses, messages, due: false };
    // Named as chat/socket.ts and moderation name it.
    const stub = env.COURSE_CHAT.get(
      env.COURSE_CHAT.idFromName(courseRoomId(row.term_id, row.course_code)),
    );
    const purged = await stub.purgeAuthor({
      termId: row.term_id,
      courseCode: row.course_code,
      userId,
    });
    courses += 1;
    messages += purged.messages;
    await env.DB.prepare(
      `DELETE FROM chat_author_courses
       WHERE user_id = ?1 AND term_id = ?2 AND course_code = ?3`,
    )
      .bind(userId, row.term_id, row.course_code)
      .run();
  }
  return { courses, messages, due: await stillDue(env.DB, userId, at) };
}

/**
 * Step 3, one transaction. Dependent rows are deleted explicitly as well as
 * by ON DELETE CASCADE, so nothing outlives the account even where foreign
 * keys are off. Every statement holds only while the account is still due
 * (STILL_DUE), so a sign-in that lands first leaves it all; `users` goes
 * last.
 */
export function accountStatements(
  db: D1Database,
  userId: string,
  now: Date,
): D1PreparedStatement[] {
  const at = now.toISOString();
  const byUser = (table: string) =>
    db
      .prepare(`DELETE FROM ${table} WHERE user_id = ?1 AND ${STILL_DUE}`)
      .bind(userId, at);
  return [
    // Rate limits: userLimitKey (api/router.ts) and chat/socket.ts. A
    // directory ID is [a-z0-9], so it can't carry a LIKE wildcard.
    db
      .prepare(
        `DELETE FROM counters WHERE name LIKE 'user:' || ?1 || ':%' AND ${STILL_DUE}`,
      )
      .bind(userId, at),
    // Reviews and reports stay, linked to nobody.
    forgetAuthorStatement(db, userId, { onlyIf: STILL_DUE, at }),
    forgetReporterStatement(db, userId, { onlyIf: STILL_DUE, at }),
    // Sync: plans, settings and four-year docs.
    byUser("sync_docs"),
    byUser("sync_heads"),
    // Chat's D1 side (the messages went in step 1).
    byUser("chat_members"),
    byUser("chat_follows"),
    byUser("chat_read_markers"),
    byUser("chat_room_prefs"),
    byUser("chat_author_courses"),
    // Notifications: settings, devices and chat notifications go; the
    // record of what was sent stays, linked to nobody.
    byUser("notification_settings"),
    byUser("push_subscriptions"),
    byUser("notifications"),
    db
      .prepare(
        `UPDATE notification_deliveries SET user_id = NULL WHERE user_id = ?1 AND ${STILL_DUE}`,
      )
      .bind(userId, at),
    // Seat watches and the alerts sent for them.
    byUser("seat_watches"),
    byUser("seat_alert_sends"),
    // Feedback stays, without who sent it.
    db
      .prepare(
        `UPDATE feedback SET user_id = NULL WHERE user_id = ?1 AND ${STILL_DUE}`,
      )
      .bind(userId, at),
    // Todo: the feed (its sealed link), its items and done marks.
    byUser("todo_items"),
    byUser("todo_done"),
    byUser("todo_feeds"),
    // Identity, the account last.
    byUser("sessions"),
    byUser("user_identities"),
    db
      .prepare(
        "DELETE FROM users WHERE id = ?1 AND status = 'deleting' AND delete_after <= ?2",
      )
      .bind(userId, at),
  ];
}

/** The daily job's other identity chore: sessions past their 30 days. */
export async function deleteExpiredSessions(
  db: D1Database,
  now: Date,
): Promise<number> {
  const result = await db
    .prepare("DELETE FROM sessions WHERE expires_at <= ?1")
    .bind(now.toISOString())
    .run();
  return result.meta.changes ?? 0;
}
