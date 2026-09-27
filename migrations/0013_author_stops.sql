-- The owner's "Stop this author writing reviews for 30 days" and "Stop
-- posting in Chat for 7 days" (docs/V2.md §7.5, §10). Each stop is one row
-- in each table, under the same id.

-- Moderation's side: which decided item placed it and until when. No
-- author: the owner's panel reads this.
CREATE TABLE moderation_author_stops (
  id          TEXT PRIMARY KEY,               -- 22-char random id, shared with author_stops
  queue_id    TEXT NOT NULL,                  -- the moderation_queue item the removal closed
  until       TEXT NOT NULL,                  -- when this stop ends (now + 30 or 7 days)
  created_at  TEXT NOT NULL,
  undone_at   TEXT
);
CREATE INDEX moderation_author_stops_by_item ON moderation_author_stops (queue_id, created_at);

-- Reviews' and Chat's side: who it's on, so `users.reviews_blocked_until`
-- and `chat_blocked_until` can be worked out again when one is undone (the
-- latest stop still in force wins). Only Reviews' and Chat's stores and the
-- purge touch it; moderation and the panel never read it.
CREATE TABLE author_stops (
  id          TEXT PRIMARY KEY,
  surface     TEXT NOT NULL CHECK (surface IN ('review', 'chat')),
  user_id     TEXT NOT NULL,                  -- no FK, like chat_author_courses; the purge deletes these
  until       TEXT NOT NULL,
  created_at  TEXT NOT NULL,
  undone_at   TEXT
);
CREATE INDEX author_stops_by_user ON author_stops (user_id, surface);
