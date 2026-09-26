// The CourseChat object's own SQLite (V2.md §8.4): rooms that have had a
// message, messages, reactions, and the send log behind the rate limits.
// Nothing here exists until a room's first message: a course's chat that
// nobody wrote in costs no storage (V2.md §8.3), so reads before then
// answer as if every table were empty and the schema is made on first write.
import { z } from "zod";
import {
  type ChatMessageId,
  HeldReasonSchema,
  type Reaction,
  ReactionSchema,
  type Reactions,
  type RoomId,
  type ThreadSummary,
} from "~/core/schema";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS rooms (
  room_id     TEXT PRIMARY KEY,
  last_seq    INTEGER NOT NULL,
  created_at  TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS messages (
  id           TEXT PRIMARY KEY,
  room_id      TEXT NOT NULL,
  seq          INTEGER NOT NULL,
  author_id    TEXT NOT NULL,
  author_name  TEXT NOT NULL,
  body         TEXT NOT NULL,
  reply_to     TEXT,
  status       TEXT NOT NULL CHECK (status IN ('checking', 'visible', 'held', 'removed')),
  held_reason  TEXT,
  client_req   TEXT NOT NULL,
  created_at   TEXT NOT NULL,
  edited_at    TEXT,
  check_after  INTEGER,
  UNIQUE (author_id, client_req),
  UNIQUE (room_id, seq)
);
CREATE INDEX IF NOT EXISTS messages_by_thread ON messages (reply_to, seq);
CREATE INDEX IF NOT EXISTS messages_checking ON messages (check_after) WHERE check_after IS NOT NULL;
CREATE TABLE IF NOT EXISTS reactions (
  message_id  TEXT NOT NULL,
  reaction    TEXT NOT NULL,
  user_id     TEXT NOT NULL,
  at          TEXT NOT NULL,
  PRIMARY KEY (message_id, reaction, user_id)
);
CREATE TABLE IF NOT EXISTS sends (author_id TEXT NOT NULL, at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS sends_by_author ON sends (author_id, at);
`;

export const MessageStatusSchema = z.enum([
  "checking",
  "visible",
  "held",
  "removed",
]);
export type MessageStatus = z.infer<typeof MessageStatusSchema>;

export const MessageRowSchema = z.object({
  id: z.string(),
  room_id: z.string(),
  seq: z.number().int(),
  author_id: z.string(),
  /** The author's name when they wrote it, shown if their account is gone. */
  author_name: z.string(),
  body: z.string(),
  reply_to: z.string().nullable(),
  status: MessageStatusSchema,
  held_reason: HeldReasonSchema.nullable(),
  client_req: z.string(),
  created_at: z.string(),
  edited_at: z.string().nullable(),
  /** Epoch ms after which a message still `checking` is screened again; null while the moderation cron owns it. */
  check_after: z.number().int().nullable(),
});
export type MessageRow = z.infer<typeof MessageRowSchema>;

export type MetaKey =
  | "term_id"
  | "course_code"
  | "read_only_at"
  | "delete_at"
  | "read_only_announced";

const toRow = (r: unknown) => MessageRowSchema.parse(r);

export class ObjectStore {
  #ready: boolean;

  constructor(private readonly storage: DurableObjectStorage) {
    this.#ready =
      storage.sql
        .exec(
          "SELECT COUNT(*) AS n FROM sqlite_master WHERE type = 'table' AND name = 'messages'",
        )
        .one().n === 1;
  }

  private get sql(): SqlStorage {
    return this.storage.sql;
  }

  /** Whether anything was ever written. */
  get exists(): boolean {
    return this.#ready;
  }

  /** Makes the tables: only on a write. */
  ensure(): void {
    if (this.#ready) return;
    this.sql.exec(SCHEMA);
    this.#ready = true;
  }

  /** After `deleteAll()`: back to no storage. */
  forget(): void {
    this.#ready = false;
  }

  meta(key: MetaKey): string | null {
    if (!this.#ready) return null;
    const row = this.sql
      .exec("SELECT value FROM meta WHERE key = ?", key)
      .toArray()[0];
    return row ? String(row.value) : null;
  }

  setMeta(key: MetaKey, value: string): void {
    this.ensure();
    this.sql.exec(
      "INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value",
      key,
      value,
    );
  }

  message(id: string): MessageRow | null {
    if (!this.#ready) return null;
    const row = this.sql
      .exec("SELECT * FROM messages WHERE id = ?", id)
      .toArray()[0];
    return row ? toRow(row) : null;
  }

  /** The author's message sent with this request id, if any (idempotent sends). */
  messageByRequest(authorId: string, req: string): MessageRow | null {
    if (!this.#ready) return null;
    const row = this.sql
      .exec(
        "SELECT * FROM messages WHERE author_id = ? AND client_req = ?",
        authorId,
        req,
      )
      .toArray()[0];
    return row ? toRow(row) : null;
  }

  hasRoom(room: RoomId): boolean {
    if (!this.#ready) return false;
    return (
      this.sql
        .exec("SELECT COUNT(*) AS n FROM rooms WHERE room_id = ?", room)
        .one().n === 1
    );
  }

  /** Stores a new message at the room's next seq; the room's row comes with its first. */
  insertMessage(m: Omit<MessageRow, "seq">): MessageRow {
    this.ensure();
    return this.storage.transactionSync(() => {
      const seq =
        Number(
          this.sql
            .exec(
              "SELECT COALESCE(MAX(last_seq), 0) AS n FROM rooms WHERE room_id = ?",
              m.room_id,
            )
            .one().n,
        ) + 1;
      this.sql.exec(
        `INSERT INTO rooms (room_id, last_seq, created_at) VALUES (?, ?, ?)
         ON CONFLICT (room_id) DO UPDATE SET last_seq = excluded.last_seq`,
        m.room_id,
        seq,
        m.created_at,
      );
      this.sql.exec(
        `INSERT INTO messages (id, room_id, seq, author_id, author_name, body, reply_to,
           status, held_reason, client_req, created_at, edited_at, check_after)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        m.id,
        m.room_id,
        seq,
        m.author_id,
        m.author_name,
        m.body,
        m.reply_to,
        m.status,
        m.held_reason,
        m.client_req,
        m.created_at,
        m.edited_at,
        m.check_after,
      );
      return { ...m, seq };
    });
  }

  /** A new text from its author, to be screened again. */
  editMessage(id: string, body: string, at: string, checkAfter: number): void {
    this.sql.exec(
      `UPDATE messages SET body = ?, edited_at = ?, status = 'checking',
         held_reason = NULL, check_after = ? WHERE id = ?`,
      body,
      at,
      checkAfter,
      id,
    );
  }

  setModeration(
    id: string,
    status: MessageStatus,
    heldReason: MessageRow["held_reason"],
    checkAfter: number | null,
  ): void {
    this.sql.exec(
      "UPDATE messages SET status = ?, held_reason = ?, check_after = ? WHERE id = ?",
      status,
      heldReason,
      checkAfter,
      id,
    );
  }

  /** Pushes a message's next recheck back, so a failing check isn't retried in a tight loop. */
  setCheckAfter(id: string, at: number): void {
    this.sql.exec("UPDATE messages SET check_after = ? WHERE id = ?", at, id);
  }

  deleteMessage(id: string): void {
    this.storage.transactionSync(() => {
      this.sql.exec("DELETE FROM reactions WHERE message_id = ?", id);
      this.sql.exec("DELETE FROM messages WHERE id = ?", id);
    });
  }

  /**
   * A page of a room, oldest first: top-level messages, or one thread's
   * replies. Visible ones, plus the viewer's own that are still checking
   * or held. `more`: older ones remain.
   */
  page(
    room: RoomId,
    opts: {
      thread: ChatMessageId | null;
      beforeSeq: number | null;
      limit: number;
      viewer: string;
    },
  ): { rows: MessageRow[]; more: boolean } {
    if (!this.#ready) return { rows: [], more: false };
    const rows = this.sql
      .exec(
        `SELECT * FROM messages
         WHERE room_id = ?1
           AND (?2 IS NULL AND reply_to IS NULL OR reply_to = ?2)
           AND (?3 IS NULL OR seq < ?3)
           AND (status = 'visible' OR (author_id = ?4 AND status IN ('checking', 'held')))
         ORDER BY seq DESC LIMIT ?5`,
        room,
        opts.thread,
        opts.beforeSeq,
        opts.viewer,
        opts.limit + 1,
      )
      .toArray()
      .map(toRow);
    return {
      rows: rows.slice(0, opts.limit).reverse(),
      more: rows.length > opts.limit,
    };
  }

  /** Who reacted to each message, in the order they did. */
  reactionsFor(ids: readonly string[]): Map<string, Reactions> {
    const out = new Map<string, Reactions>();
    if (!this.#ready || ids.length === 0) return out;
    const rows = this.sql
      .exec(
        `SELECT message_id, reaction, user_id FROM reactions
         WHERE message_id IN (SELECT value FROM json_each(?))
         ORDER BY at, rowid`,
        JSON.stringify(ids),
      )
      .toArray();
    for (const r of rows) {
      const id = String(r.message_id);
      const reaction = ReactionSchema.safeParse(r.reaction);
      if (!reaction.success) continue;
      const reactions = out.get(id) ?? {};
      reactions[reaction.data] = [
        ...(reactions[reaction.data] ?? []),
        String(r.user_id),
      ];
      out.set(id, reactions);
    }
    return out;
  }

  /** Reply counts and the last reply's time, for top-level messages that have visible replies. */
  threadsFor(ids: readonly string[]): Map<string, ThreadSummary> {
    const out = new Map<string, ThreadSummary>();
    if (!this.#ready || ids.length === 0) return out;
    const rows = this.sql
      .exec(
        `SELECT reply_to, COUNT(*) AS n, MAX(created_at) AS last FROM messages
         WHERE status = 'visible' AND reply_to IN (SELECT value FROM json_each(?))
         GROUP BY reply_to`,
        JSON.stringify(ids),
      )
      .toArray();
    for (const r of rows)
      out.set(String(r.reply_to), {
        count: Number(r.n),
        lastAt: String(r.last),
      });
    return out;
  }

  /** Adds or takes back one person's reaction. */
  setReaction(
    id: string,
    reaction: Reaction,
    userId: string,
    on: boolean,
    at: string,
  ): void {
    if (on)
      this.sql.exec(
        "INSERT INTO reactions (message_id, reaction, user_id, at) VALUES (?, ?, ?, ?) ON CONFLICT DO NOTHING",
        id,
        reaction,
        userId,
        at,
      );
    else
      this.sql.exec(
        "DELETE FROM reactions WHERE message_id = ? AND reaction = ? AND user_id = ?",
        id,
        reaction,
        userId,
      );
  }

  /**
   * Visible messages by others after each read marker (seq), per room. Rooms
   * without messages are left out.
   */
  unread(
    rooms: readonly RoomId[],
    markers: ReadonlyMap<RoomId, number>,
    viewer: string,
  ): Map<RoomId, number> {
    const out = new Map<RoomId, number>();
    if (!this.#ready || rooms.length === 0) return out;
    const marks = rooms.map((room) => ({ room, seq: markers.get(room) ?? 0 }));
    const rows = this.sql
      .exec(
        `SELECT m.room_id, COUNT(*) AS n FROM messages m
         JOIN json_each(?1) AS j ON json_extract(j.value, '$.room') = m.room_id
         WHERE m.status = 'visible' AND m.author_id <> ?2
           AND m.seq > json_extract(j.value, '$.seq')
         GROUP BY m.room_id`,
        JSON.stringify(marks),
        viewer,
      )
      .toArray();
    for (const r of rows) out.set(String(r.room_id), Number(r.n));
    return out;
  }

  /** How many sends the author made since `since` (epoch ms), and when the first was. */
  sendsSince(
    authorId: string,
    since: number,
  ): { count: number; first: number | null } {
    if (!this.#ready) return { count: 0, first: null };
    const row = this.sql
      .exec(
        "SELECT COUNT(*) AS n, MIN(at) AS first FROM sends WHERE author_id = ? AND at > ?",
        authorId,
        since,
      )
      .one();
    return {
      count: Number(row.n),
      first: row.first === null ? null : Number(row.first),
    };
  }

  /** Logs a send, and forgets ones older than `keepAfter`. */
  logSend(authorId: string, at: number, keepAfter: number): void {
    this.ensure();
    this.sql.exec(
      "INSERT INTO sends (author_id, at) VALUES (?, ?)",
      authorId,
      at,
    );
    this.sql.exec("DELETE FROM sends WHERE at <= ?", keepAfter);
  }

  /** Messages still checking whose recheck time has come. */
  dueForCheck(now: number, limit: number): MessageRow[] {
    if (!this.#ready) return [];
    return this.sql
      .exec(
        `SELECT * FROM messages WHERE status = 'checking' AND check_after IS NOT NULL
           AND check_after <= ? ORDER BY check_after LIMIT ?`,
        now,
        limit,
      )
      .toArray()
      .map(toRow);
  }

  /** The earliest recheck time, if any message is waiting for one. */
  nextCheck(): number | null {
    if (!this.#ready) return null;
    const row = this.sql
      .exec(
        "SELECT MIN(check_after) AS at FROM messages WHERE check_after IS NOT NULL",
      )
      .one();
    return row.at === null ? null : Number(row.at);
  }
}
