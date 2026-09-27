-- Chat's spam guard (docs/MODERATION.md §2, the owner 2026-09-27): each
-- course is its own Durable Object, so one person's messages across rooms
-- are only visible here. One row per message or edit, never its words: a
-- fingerprint that near-same texts share. Kept an hour, then pruned by the
-- every-5-minutes moderation cron; the purge deletes a person's rows.
CREATE TABLE chat_send_hashes (
  user_id     TEXT NOT NULL,                  -- no FK, like chat_author_courses
  room_id     TEXT NOT NULL,                  -- `<termId>:<courseCode>…`, unique across courses
  text_hash   TEXT,                           -- textFingerprint(): 16 hex chars; null when too short to compare
  created_at  TEXT NOT NULL
);
CREATE INDEX chat_send_hashes_by_user ON chat_send_hashes (user_id, created_at);
CREATE INDEX chat_send_hashes_by_time ON chat_send_hashes (created_at);
