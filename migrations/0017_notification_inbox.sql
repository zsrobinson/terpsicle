-- Migration: 0017_notification_inbox
-- The inbox (docs/V2.md §6.7): `notifications` grows from chat mentions and
-- replies into a row for every notification, pushed or not: seat openings,
-- mentions, replies, "Due tomorrow" and (later) urgent admin items. Each
-- row names its product and its group (the push tag), and how many events
-- it stands for. Seats and Todo keep their words here; a chat row keeps
-- only its message reference, and the inbox asks the course's object for
-- the words, as the digest does, so D1 still never holds chat text.
--
-- SQLite can't alter a CHECK or drop a NOT NULL, so the table is rebuilt
-- (as 0010 rebuilt sync_docs): create, copy, drop, rename, reindex. Nothing
-- references `notifications`.
PRAGMA defer_foreign_keys = on;

CREATE TABLE notifications_new (
  id          TEXT PRIMARY KEY,               -- the event's key: one row per person per event
  user_id     TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  type        TEXT NOT NULL CHECK (type IN ('seat-open', 'chat-mention', 'chat-reply', 'todo-due', 'admin-urgent')),
  product     TEXT NOT NULL CHECK (product IN ('schedule', 'chat', 'todo', 'admin')),
  group_key   TEXT NOT NULL,                  -- the push tag: chat-mention:<room>, chat-reply:<thread>, seat:<term>, todo-due:<date>, admin-urgent
  count       INTEGER NOT NULL DEFAULT 1 CHECK (count >= 1), -- events it stands for ("3 things due tomorrow")
  title       TEXT,                           -- seats, Todo, admin; null for chat (the object has the words)
  body        TEXT,
  label       TEXT,                           -- seats: "CMSC351 0101", for a group's list
  url         TEXT,                           -- where it opens; null for chat (built from the room and thread)
  term_id     TEXT,                           -- chat and seats
  course_code TEXT,                           -- chat and seats: reading the course reads its seat rows
  room_id     TEXT,                           -- chat
  thread_id   TEXT,                           -- chat: the thread's first message, for a message in one
  seq         INTEGER,                        -- chat: the message's seq in its room
  message_id  TEXT,                           -- chat
  actor_id    TEXT,                           -- chat: who mentioned or replied
  created_at  TEXT NOT NULL,
  read_at     TEXT,                           -- rows read together share it, and stay one group
  emailed_at  TEXT,                           -- the chat digest
  CHECK ((product = 'chat') = (message_id IS NOT NULL)),
  CHECK (product = 'chat' OR (title IS NOT NULL AND url IS NOT NULL))
);

-- Chat rows so far: a mention groups by room; a reply by its thread, which
-- the old rows didn't keep, so each old reply stays a group of its own.
INSERT INTO notifications_new
  (id, user_id, type, product, group_key, count, term_id, course_code, room_id,
   seq, message_id, actor_id, created_at, read_at, emailed_at)
SELECT id, user_id, type, 'chat',
       substr(CASE type WHEN 'chat-mention' THEN 'chat-mention:' || room_id
                        ELSE 'chat-reply:' || message_id END, 1, 64),
       1, term_id, course_code, room_id, seq, message_id, actor_id, created_at,
       read_at, emailed_at
FROM notifications;

DROP TABLE notifications;
ALTER TABLE notifications_new RENAME TO notifications;

-- As in 0006: unread first, and reading a room up to a seq.
CREATE INDEX notifications_unread ON notifications (user_id, read_at, created_at);
CREATE INDEX notifications_by_room ON notifications (user_id, term_id, course_code, room_id, seq);
-- A group's unread rows: the push's count and words, and reading a group.
CREATE INDEX notifications_by_group ON notifications (user_id, group_key, read_at);
