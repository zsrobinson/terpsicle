-- The owner's "Stop this author writing reviews for 30 days" and "Stop
-- posting in Chat for 7 days" (docs/V2.md §7.5, §10), one row per removal
-- that asked for one. No author here: Reviews or Chat found who wrote the
-- item and set their `users.*_blocked_until`. This keeps only when the stop
-- ends and what it replaced, so Undo can put that back.
CREATE TABLE moderation_author_stops (
  id              TEXT PRIMARY KEY,               -- 22-char random id
  queue_id        TEXT NOT NULL,                  -- moderation_queue.id the removal closed
  until           TEXT NOT NULL,                  -- when the author can write again
  previous_until  TEXT,                           -- the column's value before, for undo
  created_at      TEXT NOT NULL,
  undone_at       TEXT
);
CREATE INDEX moderation_author_stops_by_item ON moderation_author_stops (queue_id, created_at);
