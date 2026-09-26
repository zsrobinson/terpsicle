// Chat's D1 side (migrations/0009_chat.sql, V2.md §8.5): membership derived
// from sync docs, the room index the chat list reads, read markers, follows
// and mutes, and the profiles messages are shown with. Messages themselves
// live in the CourseChat object's own SQLite (./object-store.ts).
import { z } from "zod";
import { chatMembersFor, sectionsInPlans } from "~/core/chat";
import {
  AvatarUrlSchema,
  type ChatAuthor,
  type ChatMembersResult,
  type ChatPlans,
  type ChatUnreadRoom,
  type CourseCode,
  DirectoryIdSchema,
  type Plan,
  PlanDocSchema,
  type RoomId,
  type RoomKind,
  type SectionCode,
  SettingsDocSchema,
  type TermId,
} from "~/core/schema";
import { avatarUrl } from "../auth/session";

// ---------- profiles ----------

const ProfileRowSchema = z.object({
  id: DirectoryIdSchema,
  name: z.string(),
  picture_key: z.string().nullable(),
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
  const picture = AvatarUrlSchema.safeParse(avatarUrl(row.picture_key));
  return {
    author: {
      directoryId: row.id,
      name: row.name.trim().slice(0, AUTHOR_NAME_MAX).trim() || row.id,
      picture: picture.success ? picture.data : null,
    },
    active: row.status === "active",
    chatBlockedUntil: row.chat_blocked_until,
  };
}

/** People as they are now (names and pictures follow the Google account). */
export async function readProfiles(
  db: D1Database,
  ids: readonly string[],
): Promise<Map<string, ChatProfile>> {
  const out = new Map<string, ChatProfile>();
  if (ids.length === 0) return out;
  const { results } = await db
    .prepare(
      `SELECT id, name, picture_key, status, chat_blocked_until FROM users
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

const PlanBodySchema = z.object({ body: z.string() });

/** Every live plan the person has in the term, from their sync docs. */
export async function plansInTerm(
  db: D1Database,
  userId: string,
  termId: TermId,
): Promise<Plan[]> {
  const { results } = await db
    .prepare(
      `SELECT body FROM sync_docs
       WHERE user_id = ?1 AND kind = 'plan' AND deleted = 0 AND term_id = ?2`,
    )
    .bind(userId, termId)
    .all();
  return results.flatMap((r) => {
    const doc = PlanDocSchema.safeParse(
      JSON.parse(PlanBodySchema.parse(r).body),
    );
    return doc.success ? [doc.data] : [];
  });
}

/** Sections of the course in any of the person's plans for the term. */
export async function planSections(
  db: D1Database,
  userId: string,
  termId: TermId,
  courseCode: CourseCode,
): Promise<SectionCode[]> {
  return sectionsInPlans(
    termId,
    courseCode,
    await plansInTerm(db, userId, termId),
  );
}

const TermRowSchema = z.object({ term_id: z.string().nullable() });
const HeadRowSchema = z.object({ head: z.number().int() });
const DocRowSchema = z.object({
  kind: z.enum(["plan", "settings"]),
  body: z.string(),
});

/**
 * Rewrites the person's `chat_members` for the terms a push touched, from
 * the stored docs: the terms of the plans it saved or deleted, and, when it
 * saved the settings doc (whose `chatPlans` may have moved), every term
 * they're a member in or have chosen a plan for.
 *
 * It runs after the push's own batch, so it reads what was actually stored,
 * and its write only lands if no other save happened in between (the
 * user's `sync_heads.head` is unchanged): a later push rewrites the rows
 * itself, from newer docs, so a slow one can never overwrite them with
 * stale ones.
 */
export async function refreshChatMembers(
  db: D1Database,
  userId: string,
  saved: { planIds: readonly string[]; settings: boolean },
): Promise<void> {
  if (saved.planIds.length === 0 && !saved.settings) return;
  const [planTerms, memberTerms, chosenTerms] = await db.batch([
    db
      .prepare(
        `SELECT DISTINCT term_id FROM sync_docs
         WHERE user_id = ?1 AND kind = 'plan'
           AND doc_id IN (SELECT value FROM json_each(?2))`,
      )
      .bind(userId, JSON.stringify(saved.planIds)),
    db
      .prepare(
        `SELECT DISTINCT term_id FROM chat_members WHERE user_id = ?1 AND ?2`,
      )
      .bind(userId, saved.settings ? 1 : 0),
    db
      .prepare(
        `SELECT j.key AS term_id FROM sync_docs, json_each(sync_docs.body, '$.chatPlans') AS j
         WHERE user_id = ?1 AND kind = 'settings' AND ?2`,
      )
      .bind(userId, saved.settings ? 1 : 0),
  ]);
  const terms = new Set<TermId>();
  for (const result of [planTerms, memberTerms, chosenTerms])
    for (const r of result?.results ?? []) {
      const term = TermRowSchema.parse(r).term_id;
      if (term) terms.add(term);
    }
  if (terms.size === 0) return;
  const termList = JSON.stringify([...terms]);

  const [head, docs] = await db.batch([
    db.prepare("SELECT head FROM sync_heads WHERE user_id = ?1").bind(userId),
    db
      .prepare(
        `SELECT kind, body FROM sync_docs
         WHERE user_id = ?1 AND deleted = 0
           AND (kind = 'settings' OR term_id IN (SELECT value FROM json_each(?2)))`,
      )
      .bind(userId, termList),
  ]);
  const at = HeadRowSchema.parse(head?.results[0] ?? { head: 0 }).head;
  const plans: Plan[] = [];
  let chatPlans: ChatPlans = {};
  for (const r of docs?.results ?? []) {
    const row = DocRowSchema.parse(r);
    const body: unknown = JSON.parse(row.body);
    if (row.kind === "plan") {
      const plan = PlanDocSchema.safeParse(body);
      if (plan.success) plans.push(plan.data);
    } else {
      const settings = SettingsDocSchema.safeParse(body);
      if (settings.success) chatPlans = settings.data.chatPlans;
    }
  }
  const rows = [...terms].flatMap((t) => chatMembersFor(t, plans, chatPlans));

  // Both statements are skipped unless the head is still the one read.
  const unchanged = `(SELECT head FROM sync_heads WHERE user_id = ?1) = ?2`;
  await db.batch([
    db
      .prepare(
        `DELETE FROM chat_members WHERE user_id = ?1 AND ${unchanged}
           AND term_id IN (SELECT value FROM json_each(?3))`,
      )
      .bind(userId, at, termList),
    db
      .prepare(
        `INSERT INTO chat_members (user_id, term_id, course_code, section_code)
         SELECT ?1, json_extract(j.value, '$.termId'), json_extract(j.value, '$.courseCode'),
                json_extract(j.value, '$.sectionCode')
         FROM json_each(?3) AS j WHERE ${unchanged}`,
      )
      .bind(userId, at, JSON.stringify(rows)),
  ]);
}

/** People per section code in the course ("" for saved-for-later), from chat plans. */
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
 * room, otherwise those whose chat plan places one of `sections`.
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
        `SELECT u.id, u.name, u.picture_key, u.status, u.chat_blocked_until
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
 * the course rooms of your chat plan's courses and the ones you follow,
 * plus the professor and section rooms of your chat plan's sections.
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
    ].map((table) =>
      db
        .prepare(`DELETE FROM ${table} WHERE term_id = ?1 AND course_code = ?2`)
        .bind(termId, courseCode),
    ),
  );
}
