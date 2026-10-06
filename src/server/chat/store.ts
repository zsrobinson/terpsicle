// Chat's D1 side (migrations/0009_chat.sql, V2.md §8.5): membership derived
// from sync docs, the room index the chat list reads, read markers, follows
// and mutes, and the profiles messages are shown with. Messages themselves
// live in the CourseChat object's own SQLite (./object-store.ts).
import { z } from "zod";
import { chatMembersFor, sectionsInPlans } from "~/core/chat";
import {
  type ChatAuthor,
  type ChatMembersResult,
  type ChatUnreadRoom,
  type CourseCode,
  DirectoryIdSchema,
  type MainPlans,
  type Plan,
  type RoomId,
  type RoomKind,
  type SectionCode,
  type TermId,
} from "~/core/schema";
import type { UserData } from "../security/user-keys";
import {
  livePlans,
  mainPlansOf,
  membershipDocs,
  termsOfPlans,
} from "../sync/store";

// ---------- profiles ----------

const ProfileRowSchema = z.object({
  id: DirectoryIdSchema,
  name: z.string(),
  status: z.string(),
  chat_blocked_until: z.string().nullable(),
});

export interface ChatProfile {
  author: ChatAuthor;
  /** False once the account is being deleted. */
  active: boolean;
  /** An admin block on posting (V2.md §10), ISO; null when none. */
  chatBlockedUntil: string | null;
}

/** ChatAuthorSchema's name is shorter than a Google name can be. */
const AUTHOR_NAME_MAX = 120;

function toProfile(row: z.infer<typeof ProfileRowSchema>): ChatProfile {
  return {
    author: {
      directoryId: row.id,
      name: row.name.trim().slice(0, AUTHOR_NAME_MAX).trim() || row.id,
    },
    active: row.status === "active",
    chatBlockedUntil: row.chat_blocked_until,
  };
}

/** People as they are now (names follow the Google account). */
export async function readProfiles(
  db: D1Database,
  ids: readonly string[],
): Promise<Map<string, ChatProfile>> {
  const out = new Map<string, ChatProfile>();
  if (ids.length === 0) return out;
  const { results } = await db
    .prepare(
      `SELECT id, name, status, chat_blocked_until FROM users
       WHERE id IN (SELECT value FROM json_each(?1))`,
    )
    .bind(JSON.stringify([...new Set(ids)]))
    .all();
  for (const r of results) {
    const row = ProfileRowSchema.parse(r);
    out.set(row.id, toProfile(row));
  }
  return out;
}

// ---------- plans and membership (V2.md §8.2) ----------

/** Every live plan the person has in the term, from their sync docs. */
export function plansInTerm(
  data: UserData,
  userId: string,
  termId: TermId,
): Promise<Plan[]> {
  return livePlans(data, userId, [termId]);
}

/** Sections of the course in any of the person's plans for the term. */
export async function planSections(
  data: UserData,
  userId: string,
  termId: TermId,
  courseCode: CourseCode,
): Promise<SectionCode[]> {
  return sectionsInPlans(
    termId,
    courseCode,
    await plansInTerm(data, userId, termId),
  );
}

const TermRowSchema = z.object({ term_id: z.string().nullable() });

/**
 * Rewrites the person's `chat_members` for the terms a push touched, from
 * the stored docs: the terms of the plans it saved or deleted, and, when it
 * saved the settings doc (whose `mainPlans` may have moved), every term
 * they're a member in or have chosen a plan for.
 *
 * It runs after the push's own batch, so it reads what was actually stored,
 * and its write only lands if no other save happened in between (the
 * user's `sync_heads.head` is unchanged): a later push rewrites the rows
 * itself, from newer docs, so a slow one can never overwrite them with
 * stale ones. A row that stays keeps its `joined_at`; a new one (a course
 * added, or its section changed) joined `now`, which a room's timeline
 * shows ("Alex, Sam and 3 others joined").
 */
export async function refreshChatMembers(
  data: UserData,
  userId: string,
  saved: { planIds: readonly string[]; settings: boolean },
  now: Date = new Date(),
): Promise<void> {
  if (saved.planIds.length === 0 && !saved.settings) return;
  const { db } = data;
  const [planTerms, memberTerms, chosen] = await Promise.all([
    termsOfPlans(db, userId, saved.planIds),
    saved.settings
      ? db
          .prepare(
            "SELECT DISTINCT term_id FROM chat_members WHERE user_id = ?1",
          )
          .bind(userId)
          .all()
          .then(({ results }) =>
            results.flatMap((r) => TermRowSchema.parse(r).term_id ?? []),
          )
      : [],
    saved.settings ? mainPlansOf(data, userId) : {},
  ]);
  const terms = new Set<TermId>([
    ...planTerms,
    ...memberTerms,
    ...Object.keys(chosen),
  ]);
  if (terms.size === 0) return;
  const termList = JSON.stringify([...terms]);

  const {
    head: at,
    plans,
    settings,
  } = await membershipDocs(data, userId, [...terms]);
  const mainPlans: MainPlans = settings?.mainPlans ?? {};
  const rows = [...terms].flatMap((t) => chatMembersFor(t, plans, mainPlans));

  // Both statements are skipped unless the head is still the one read.
  // Rows that stay the same are left alone, so they keep when they joined.
  const unchanged = `(SELECT head FROM sync_heads WHERE user_id = ?1) = ?2`;
  const wanted = JSON.stringify(rows);
  await db.batch([
    db
      .prepare(
        `DELETE FROM chat_members WHERE user_id = ?1 AND ${unchanged}
           AND term_id IN (SELECT value FROM json_each(?3))
           AND NOT EXISTS (
             SELECT 1 FROM json_each(?4) AS j
             WHERE json_extract(j.value, '$.termId') = chat_members.term_id
               AND json_extract(j.value, '$.courseCode') = chat_members.course_code
               AND json_extract(j.value, '$.sectionCode') = chat_members.section_code)`,
      )
      .bind(userId, at, termList, wanted),
    db
      .prepare(
        `INSERT INTO chat_members (user_id, term_id, course_code, section_code, joined_at)
         SELECT ?1, json_extract(j.value, '$.termId'), json_extract(j.value, '$.courseCode'),
                json_extract(j.value, '$.sectionCode'), ?4
         FROM json_each(?3) AS j WHERE ${unchanged}
         ON CONFLICT (user_id, term_id, course_code) DO NOTHING`,
      )
      .bind(userId, at, wanted, now.toISOString()),
  ]);
}

/** People per section code in the course ("" for saved-for-later), from main plans. */
export async function memberCounts(
  db: D1Database,
  termId: TermId,
  courseCode: CourseCode,
): Promise<Map<string, number>> {
  const { results } = await db
    .prepare(
      `SELECT section_code, COUNT(*) AS n FROM chat_members
       WHERE term_id = ?1 AND course_code = ?2 GROUP BY section_code`,
    )
    .bind(termId, courseCode)
    .all();
  const row = z.object({ section_code: z.string(), n: z.number().int() });
  return new Map(
    results.map((r) => {
      const { section_code, n } = row.parse(r);
      return [section_code, n];
    }),
  );
}

/**
 * The people in a room, by name: everyone in the course for the course
 * room, otherwise those whose main plan places one of `sections`.
 */
export async function roomMembers(
  db: D1Database,
  termId: TermId,
  courseCode: CourseCode,
  sections: readonly SectionCode[] | null,
  limit: number,
): Promise<
  Pick<Extract<ChatMembersResult, { status: "ok" }>, "members" | "total">
> {
  const where = `m.term_id = ?1 AND m.course_code = ?2 AND u.status = 'active'
    AND (?3 IS NULL OR m.section_code IN (SELECT value FROM json_each(?3)))`;
  const codes = sections === null ? null : JSON.stringify(sections);
  const [page, count] = await db.batch([
    db
      .prepare(
        `SELECT u.id, u.name, u.status, u.chat_blocked_until
         FROM chat_members m JOIN users u ON u.id = m.user_id
         WHERE ${where} ORDER BY u.name, u.id LIMIT ?4`,
      )
      .bind(termId, courseCode, codes, limit),
    db
      .prepare(
        `SELECT COUNT(*) AS n FROM chat_members m JOIN users u ON u.id = m.user_id
         WHERE ${where}`,
      )
      .bind(termId, courseCode, codes),
  ]);
  return {
    members: (page?.results ?? []).map(
      (r) => toProfile(ProfileRowSchema.parse(r)).author,
    ),
    total: z.object({ n: z.number().int() }).parse(count?.results[0]).n,
  };
}

const JoinRowSchema = ProfileRowSchema.extend({ at: z.string() });

/**
 * Who joined a room and when, oldest first: for the course room, everyone
 * whose main plan has the course or who joined it; otherwise those whose
 * main plan places one of `sections`. The newest `limit`, from people who
 * still have an account; a row from before joins were kept has none.
 */
export async function roomJoins(
  db: D1Database,
  termId: TermId,
  courseCode: CourseCode,
  sections: readonly SectionCode[] | null,
  limit: number,
): Promise<{ author: ChatAuthor; at: string }[]> {
  const codes = sections === null ? null : JSON.stringify(sections);
  const { results } = await db
    .prepare(
      `SELECT u.id, u.name, u.status, u.chat_blocked_until, MIN(j.at) AS at FROM (
         SELECT user_id, joined_at AS at FROM chat_members
         WHERE term_id = ?1 AND course_code = ?2 AND joined_at IS NOT NULL
           AND (?3 IS NULL OR section_code IN (SELECT value FROM json_each(?3)))
         UNION ALL
         SELECT user_id, created_at AS at FROM chat_follows
         WHERE ?3 IS NULL AND term_id = ?1 AND course_code = ?2
       ) AS j JOIN users u ON u.id = j.user_id
       WHERE u.status = 'active'
       GROUP BY u.id ORDER BY at DESC, u.id LIMIT ?4`,
    )
    .bind(termId, courseCode, codes, limit)
    .all();
  return results
    .map((r) => {
      const row = JoinRowSchema.parse(r);
      return { author: toProfile(row).author, at: row.at };
    })
    .reverse();
}

// ---------- the room index and read markers (V2.md §8.3) ----------

export interface VisibleMessage {
  termId: TermId;
  courseCode: CourseCode;
  roomId: RoomId;
  kind: RoomKind;
  /** The room's section codes, so the unread query can match your sections. */
  sections: readonly SectionCode[];
  seq: number;
  at: string;
  authorId: string;
}

/**
 * A message became visible: the room gets (or moves) its `chat_rooms` row,
 * and the author's course is recorded for account deletion.
 */
export async function recordVisible(
  db: D1Database,
  m: VisibleMessage,
): Promise<void> {
  await db.batch([
    db
      .prepare(
        `INSERT INTO chat_rooms (term_id, course_code, room_id, kind, sections, last_seq, last_message_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
         ON CONFLICT (term_id, course_code, room_id) DO UPDATE SET
           kind = excluded.kind,
           sections = excluded.sections,
           last_seq = MAX(chat_rooms.last_seq, excluded.last_seq),
           last_message_at = MAX(chat_rooms.last_message_at, excluded.last_message_at)`,
      )
      .bind(
        m.termId,
        m.courseCode,
        m.roomId,
        m.kind,
        JSON.stringify(m.sections),
        m.seq,
        m.at,
      ),
    db
      .prepare(
        `INSERT INTO chat_author_courses (user_id, term_id, course_code)
         VALUES (?1, ?2, ?3) ON CONFLICT DO NOTHING`,
      )
      .bind(m.authorId, m.termId, m.courseCode),
  ]);
}

/**
 * Records that someone wrote in a course, so account deletion reaches the
 * course's object (V2.md §8.5). Written at every first send, not only when
 * a message shows: a held one is theirs too.
 */
export async function recordAuthorCourse(
  db: D1Database,
  userId: string,
  termId: string,
  courseCode: string,
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO chat_author_courses (user_id, term_id, course_code)
       VALUES (?1, ?2, ?3) ON CONFLICT DO NOTHING`,
    )
    .bind(userId, termId, courseCode)
    .run();
}

/** Read markers: never moves back. */
export async function markRead(
  db: D1Database,
  userId: string,
  roomId: RoomId,
  termId: TermId,
  courseCode: CourseCode,
  seq: number,
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO chat_read_markers (user_id, term_id, course_code, room_id, seq)
       VALUES (?1, ?2, ?3, ?4, ?5)
       ON CONFLICT (user_id, term_id, course_code, room_id)
       DO UPDATE SET seq = MAX(chat_read_markers.seq, excluded.seq)`,
    )
    .bind(userId, termId, courseCode, roomId, seq)
    .run();
}

/** The person's read markers in a course, per room. */
export async function readMarkers(
  db: D1Database,
  userId: string,
  termId: TermId,
  courseCode: CourseCode,
): Promise<Map<RoomId, number>> {
  const { results } = await db
    .prepare(
      `SELECT room_id, seq FROM chat_read_markers
       WHERE user_id = ?1 AND term_id = ?2 AND course_code = ?3`,
    )
    .bind(userId, termId, courseCode)
    .all();
  const row = z.object({ room_id: z.string(), seq: z.number().int() });
  return new Map(
    results.map((r) => {
      const { room_id, seq } = row.parse(r);
      return [room_id, seq];
    }),
  );
}

const UnreadRowSchema = z.object({
  room_id: z.string(),
  course_code: z.string(),
  last_seq: z.number().int(),
  last_message_at: z.string(),
  seq: z.number().int(),
  muted: z.number().int(),
});

/**
 * Your rooms with messages in a term, with unread counts, from one query:
 * the course rooms of your main plan's courses and the ones you follow,
 * plus the professor and section rooms of your main plan's sections.
 */
export async function unreadRooms(
  db: D1Database,
  userId: string,
  termId: TermId,
): Promise<ChatUnreadRoom[]> {
  const { results } = await db
    .prepare(
      `SELECT r.room_id, r.course_code, r.last_seq, r.last_message_at,
              COALESCE(k.seq, 0) AS seq, COALESCE(p.muted, 0) AS muted
       FROM chat_rooms r
       LEFT JOIN chat_read_markers k
         ON k.user_id = ?1 AND k.term_id = r.term_id
        AND k.course_code = r.course_code AND k.room_id = r.room_id
       LEFT JOIN chat_room_prefs p
         ON p.user_id = ?1 AND p.term_id = r.term_id
        AND p.course_code = r.course_code AND p.room_id = r.room_id
       WHERE r.term_id = ?2 AND (
         (r.kind = 'course' AND (
           EXISTS (SELECT 1 FROM chat_members m
                   WHERE m.user_id = ?1 AND m.term_id = r.term_id AND m.course_code = r.course_code)
           OR EXISTS (SELECT 1 FROM chat_follows f
                      WHERE f.user_id = ?1 AND f.term_id = r.term_id AND f.course_code = r.course_code)))
         OR (r.kind <> 'course' AND EXISTS (
           SELECT 1 FROM chat_members m, json_each(r.sections) AS s
           WHERE m.user_id = ?1 AND m.term_id = r.term_id
             AND m.course_code = r.course_code AND m.section_code = s.value)))
       ORDER BY r.last_message_at DESC, r.room_id`,
    )
    .bind(userId, termId)
    .all();
  return results.map((r) => {
    const row = UnreadRowSchema.parse(r);
    return {
      room: row.room_id,
      courseCode: row.course_code,
      lastSeq: row.last_seq,
      unread: Math.max(0, row.last_seq - row.seq),
      lastMessageAt: row.last_message_at,
      muted: row.muted === 1,
    };
  });
}

/** Retention (V2.md §8.4): the course's D1 rows go with its object's storage. */
export async function deleteCourseRows(
  db: D1Database,
  termId: TermId,
  courseCode: CourseCode,
): Promise<void> {
  await db.batch(
    [
      "chat_rooms",
      "chat_read_markers",
      "chat_room_prefs",
      "chat_author_courses",
      // The inbox's chat rows only: the course's seat openings aren't Chat's.
      "notifications",
    ].map((table) =>
      db
        .prepare(
          `DELETE FROM ${table} WHERE term_id = ?1 AND course_code = ?2${
            table === "notifications" ? " AND product = 'chat'" : ""
          }`,
        )
        .bind(termId, courseCode),
    ),
  );
}

// ---------- mentions and replies (V2.md §6.3, `notifications`) ----------

/** Of `userIds`, those who muted the room. */
export async function mutedIn(
  db: D1Database,
  userIds: readonly string[],
  termId: TermId,
  courseCode: CourseCode,
  roomId: RoomId,
): Promise<Set<string>> {
  if (userIds.length === 0) return new Set();
  const { results } = await db
    .prepare(
      `SELECT user_id FROM chat_room_prefs
       WHERE term_id = ?1 AND course_code = ?2 AND room_id = ?3 AND muted = 1
         AND user_id IN (SELECT value FROM json_each(?4))`,
    )
    .bind(termId, courseCode, roomId, JSON.stringify(userIds))
    .all();
  return new Set(
    results.map((r) => z.object({ user_id: z.string() }).parse(r).user_id),
  );
}

/**
 * A mention's or reply's inbox row id (notify() writes the row): one per
 * person per message, however often it's published again (an edit is
 * screened again), so a second version adds nothing.
 */
export function chatNotificationId(
  userId: string,
  termId: TermId,
  courseCode: CourseCode,
  messageId: string,
): string {
  return `${userId}:${termId}:${courseCode}:${messageId}`;
}

/** Who a message has mentioned so far, over every version of it. */
export async function mentionedAlready(
  db: D1Database,
  termId: TermId,
  courseCode: CourseCode,
  messageId: string,
): Promise<Set<string>> {
  const { results } = await db
    .prepare(
      `SELECT user_id FROM notifications
       WHERE term_id = ?1 AND course_code = ?2 AND message_id = ?3
         AND type = 'chat-mention'`,
    )
    .bind(termId, courseCode, messageId)
    .all();
  return new Set(
    results.map((r) => z.object({ user_id: z.string() }).parse(r).user_id),
  );
}

/** Reading a room up to `seq` reads its mentions and replies too. */
export async function readNotifications(
  db: D1Database,
  userId: string,
  termId: TermId,
  courseCode: CourseCode,
  roomId: RoomId,
  seq: number,
  at: string,
): Promise<void> {
  await db
    .prepare(
      `UPDATE notifications SET read_at = ?6
       WHERE user_id = ?1 AND term_id = ?2 AND course_code = ?3 AND room_id = ?4
         AND seq <= ?5 AND read_at IS NULL`,
    )
    .bind(userId, termId, courseCode, roomId, seq, at)
    .run();
}

const ChatDataRowSchema = z.object({
  kind: z.enum(["room", "follow", "muted", "authored"]),
  term_id: z.string(),
  course_code: z.string(),
  extra: z.string().nullable(),
});

/**
 * One person's chat rows, for their data file (docs/DATA.md §5.6): their
 * rooms (from their main plans), the courses they follow, the rooms they
 * muted, and the courses they've written in.
 */
export async function chatDataOf(
  db: D1Database,
  userId: string,
): Promise<{
  rooms: { termId: string; courseCode: string; sectionCode: string }[];
  follows: { termId: string; courseCode: string; createdAt: string }[];
  muted: { termId: string; courseCode: string; roomId: string }[];
  authored: { termId: string; courseCode: string }[];
}> {
  const { results } = await db
    .prepare(
      `SELECT 'room' AS kind, term_id, course_code, section_code AS extra
         FROM chat_members WHERE user_id = ?1
       UNION ALL
       SELECT 'follow', term_id, course_code, created_at
         FROM chat_follows WHERE user_id = ?1
       UNION ALL
       SELECT 'muted', term_id, course_code, room_id
         FROM chat_room_prefs WHERE user_id = ?1 AND muted = 1
       UNION ALL
       SELECT 'authored', term_id, course_code, NULL
         FROM chat_author_courses WHERE user_id = ?1
       ORDER BY 2, 3`,
    )
    .bind(userId)
    .all();
  const rows = results.map((r) => ChatDataRowSchema.parse(r));
  const of = (kind: string) => rows.filter((r) => r.kind === kind);
  return {
    rooms: of("room").map((r) => ({
      termId: r.term_id,
      courseCode: r.course_code,
      sectionCode: r.extra ?? "",
    })),
    follows: of("follow").map((r) => ({
      termId: r.term_id,
      courseCode: r.course_code,
      createdAt: r.extra ?? "",
    })),
    muted: of("muted").map((r) => ({
      termId: r.term_id,
      courseCode: r.course_code,
      roomId: r.extra ?? "",
    })),
    authored: of("authored").map((r) => ({
      termId: r.term_id,
      courseCode: r.course_code,
    })),
  };
}
